import { randomUUID } from 'crypto';
import { prisma, Prisma } from '@pocketrealm/database';
import { CROWN_CONSTANTS, LEADERBOARD_CONSTANTS, resolveAchievementTitleDisplay } from '@pocketrealm/shared';
import type { TitleStyleVariant } from '@pocketrealm/shared';
import { redis } from '../redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';
import {
  leaderboardKey,
  leaderboardMetaKey,
  leaderboardWeeklyDeltaKey,
  leaderboardWeeklyStartKey,
  leaderboardWeeklyStartXpKey,
} from './leaderboardKeys';
import { getCrownCountsForCategory, type CrownRankCounts } from './crownService';

export const LEADERBOARD_LAST_REFRESH_KEY = 'leaderboard:last_refresh';
const LAST_REFRESH_KEY = LEADERBOARD_LAST_REFRESH_KEY;
const LOCK_KEY = 'leaderboard:refresh_lock';
const RELEASE_LOCK_LUA = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

function playerSeasonWhere(seasonId?: string | null): { seasonId: string | null } {
  return { seasonId: seasonId ?? null };
}

// ── Paginated fetch helper ───────────────────────────────────────────────────

// Shared player sub-shape selected in leaderboard queries
interface LeaderboardPlayerSummary {
  username: string;
  characterLevel: number;
  isBot: boolean;
  activeTitle: string | null;
  account: {
    role: string;
  };
}

// Row shapes for each paginated query (must include `id` for cursor pagination)
interface PvpRatingRow {
  id: string;
  playerId: string;
  rating: number;
  wins: number;
  bestRating: number;
  winStreak: number;
  player: LeaderboardPlayerSummary;
}
interface PlayerRow {
  id: string;
  username: string;
  characterLevel: number;
  characterXp: bigint;
  isBot: boolean;
  activeTitle: string | null;
  account: {
    role: string;
  };
}
interface PlayerSkillRow {
  id: string;
  playerId: string;
  skillType: string;
  level: number;
  xp: bigint;
  player: LeaderboardPlayerSummary;
}
interface BossParticipantRow {
  id: string;
  playerId: string;
  totalDamage: number;
  player: LeaderboardPlayerSummary;
}
interface GuildRow {
  id: string;
  name: string;
  tag: string;
  level: number;
  renown: number;
  _count: { members: number };
}

type LeaderboardWriteRow = {
  playerId: string;
  score: number;
  username: string;
  characterLevel: number;
  isBot: boolean;
  isAdmin: boolean;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
};

interface LeaderboardMeta {
  username: string;
  characterLevel: number;
  isBot: boolean;
  isAdmin: boolean;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns?: CrownRankCounts;
}

type LeaderboardSourcePlayer = {
  username: string;
  characterLevel: number;
  isBot: boolean;
  activeTitle: string | null;
  account?: { role?: string | null };
  role?: string | null;
};

function getRole(player: { account?: { role?: string | null }; role?: string | null }): string | null {
  return player.account?.role ?? player.role ?? null;
}

function buildPlayerLeaderboardRow(
  playerId: string,
  score: number,
  player: LeaderboardSourcePlayer,
): LeaderboardWriteRow {
  return {
    playerId,
    score,
    username: player.username,
    characterLevel: player.characterLevel,
    isBot: player.isBot,
    isAdmin: getRole(player) === 'admin',
    ...resolveAchievementTitleDisplay(player.activeTitle),
  };
}

/**
 * Fetches all rows from a Prisma model in cursor-based batches to avoid
 * unbounded single-query memory pressure at scale.
 */
async function paginatedFindMany<T extends { id: string }>(
  findMany: (args: { take: number; skip?: number; cursor?: { id: string }; select?: unknown; where?: unknown; orderBy?: unknown }) => Promise<T[]>,
  baseArgs: { select?: unknown; where?: unknown },
): Promise<T[]> {
  const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
  const allRows: T[] = [];
  let cursor: string | undefined;
  let batch: T[];

  do {
    batch = await findMany({
      ...baseArgs,
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    allRows.push(...batch);

    if (batch.length === batchSize) {
      cursor = batch[batch.length - 1].id;
    }
  } while (batch.length === batchSize);

  return allRows;
}

// ── Category definitions ────────────────────────────────────────────────────

interface CategoryDef {
  slug: string;
  label: string;
  group: string;
}

const PVP_CATEGORIES: CategoryDef[] = [
  { slug: 'pvp_rating', label: 'PvP Rating', group: 'PvP' },
  { slug: 'pvp_wins', label: 'PvP Wins', group: 'PvP' },
  { slug: 'pvp_best_rating', label: 'Best Rating', group: 'PvP' },
  { slug: 'pvp_win_streak', label: 'Win Streak', group: 'PvP' },
];

const PROGRESSION_CATEGORIES: CategoryDef[] = [
  { slug: 'character_level', label: 'Character Level', group: 'Progression' },
  { slug: 'character_xp', label: 'Total XP', group: 'Progression' },
  { slug: 'total_skill_level', label: 'Total Skill Level', group: 'Progression' },
];

const SKILL_TYPES = [
  'melee', 'ranged', 'magic',
  'mining', 'foraging', 'woodcutting',
  'refining', 'tanning', 'weaving',
  'weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring', 'alchemy',
] as const;

const SKILL_CATEGORIES: CategoryDef[] = SKILL_TYPES.map((s) => ({
  slug: `skill_${s}`,
  label: s.charAt(0).toUpperCase() + s.slice(1),
  group: 'Skills',
}));

const COMBAT_CATEGORIES: CategoryDef[] = [
  { slug: 'total_kills', label: 'Total Kills', group: 'Combat' },
  { slug: 'boss_damage', label: 'Boss Damage', group: 'Combat' },
];

const GUILD_CATEGORIES: CategoryDef[] = [
  { slug: 'guild_level', label: 'Guild Level', group: 'Guilds' },
  { slug: 'guild_renown', label: 'Renown', group: 'Guilds' },
  { slug: 'guild_members', label: 'Member Count', group: 'Guilds' },
];

const CASINO_CATEGORIES: CategoryDef[] = [
  { slug: 'casino_profit', label: 'Casino Profit', group: 'Casino' },
  { slug: 'casino_wagered', label: 'Total Wagered', group: 'Casino' },
];

const ALL_CATEGORIES = [
  ...PVP_CATEGORIES,
  ...PROGRESSION_CATEGORIES,
  ...SKILL_CATEGORIES,
  ...COMBAT_CATEGORIES,
  ...GUILD_CATEGORIES,
  ...CASINO_CATEGORIES,
];

const VALID_SLUGS = new Set(ALL_CATEGORIES.map((c) => c.slug));
const CROWN_CATEGORY_SLUGS = new Set<string>(Object.values(CROWN_CONSTANTS.CATEGORY_GROUPS).flat());
type LeaderboardPeriod = 'alltime' | 'weekly';

// ── Public API ──────────────────────────────────────────────────────────────

export function getCategoryLabel(category: string): string | null {
  return ALL_CATEGORIES.find((entry) => entry.slug === category)?.label ?? null;
}

export function getCategories() {
  const groups = new Map<string, { slug: string; label: string }[]>();
  for (const cat of ALL_CATEGORIES) {
    let group = groups.get(cat.group);
    if (!group) {
      group = [];
      groups.set(cat.group, group);
    }
    group.push({ slug: cat.slug, label: cat.label });
  }
  return {
    groups: Array.from(groups.entries()).map(([name, categories]) => ({ name, categories })),
  };
}

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  characterLevel: number;
  score: number;
  isBot: boolean;
  isAdmin: boolean;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns?: CrownRankCounts;
}

interface LeaderboardResponse {
  category: string;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

const DEFAULT_META: LeaderboardMeta = {
  username: 'Unknown',
  characterLevel: 1,
  isBot: false,
  isAdmin: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCrownCounts(value: unknown): value is CrownRankCounts {
  return isRecord(value) &&
    typeof value.gold === 'number' &&
    typeof value.silver === 'number' &&
    typeof value.bronze === 'number';
}

function parseLeaderboardMeta(raw: string | null | undefined): LeaderboardMeta {
  if (!raw) {
    return DEFAULT_META;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return DEFAULT_META;
    }

    return {
      username: typeof parsed.username === 'string' ? parsed.username : DEFAULT_META.username,
      characterLevel: typeof parsed.characterLevel === 'number' ? parsed.characterLevel : DEFAULT_META.characterLevel,
      isBot: typeof parsed.isBot === 'boolean' ? parsed.isBot : DEFAULT_META.isBot,
      isAdmin: typeof parsed.isAdmin === 'boolean' ? parsed.isAdmin : DEFAULT_META.isAdmin,
      ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
      ...(typeof parsed.titleTier === 'number' ? { titleTier: parsed.titleTier } : {}),
      ...(typeof parsed.titleStyle === 'string' ? { titleStyle: parsed.titleStyle as TitleStyleVariant } : {}),
      ...(isCrownCounts(parsed.crowns) ? { crowns: parsed.crowns } : {}),
    };
  } catch {
    return DEFAULT_META;
  }
}

export async function getLeaderboard(
  category: string,
  playerId?: string,
  aroundMe = false,
  seasonId?: string | null,
  period: LeaderboardPeriod = 'alltime',
): Promise<LeaderboardResponse> {
  if (!VALID_SLUGS.has(category)) {
    throw new AppError(400, `Invalid leaderboard category: ${category}`, 'INVALID_CATEGORY');
  }

  await ensureLeaderboardsFresh();

  const key = period === 'weekly'
    ? leaderboardWeeklyDeltaKey(category, seasonId)
    : leaderboardKey(category, seasonId);
  const metaKey = leaderboardMetaKey(category, seasonId);
  const { PAGE_SIZE } = LEADERBOARD_CONSTANTS;

  const totalPlayers = await redis.zcard(key);
  const lastRefreshedAt = await redis.get(LAST_REFRESH_KEY);

  let start = 0;
  let stop = PAGE_SIZE - 1;

  // Fetch player rank once (reused for around_me centering and myRank)
  const myRankIndex = playerId ? await redis.zrevrank(key, playerId) : null;

  // If around_me, center the window on the player's rank
  if (aroundMe && playerId && myRankIndex !== null) {
    const half = Math.floor(PAGE_SIZE / 2);
    const centeredStart = Math.max(0, myRankIndex - half);
    const maxStart = Math.max(totalPlayers - PAGE_SIZE, 0);
    start = Math.min(centeredStart, maxStart);
    stop = start + PAGE_SIZE - 1;
  }

  // Fetch entries with scores
  const raw = await redis.zrevrange(key, start, stop, 'WITHSCORES');

  // Extract player IDs and scores from interleaved WITHSCORES response
  const playerIds: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    playerIds.push(raw[i]);
    scores.push(Number(raw[i + 1]));
  }

  // Batch-fetch all metadata in one HMGET call
  const metaValues = playerIds.length > 0 ? await redis.hmget(metaKey, ...playerIds) : [];

  const entries: LeaderboardEntry[] = playerIds.map((pid, idx) => {
    const meta = parseLeaderboardMeta(metaValues[idx]);
    return {
      rank: start + idx + 1,
      playerId: pid,
      username: meta.username,
      characterLevel: meta.characterLevel,
      score: scores[idx],
      isBot: meta.isBot,
      isAdmin: !!meta.isAdmin,
      title: meta.title,
      titleTier: meta.titleTier,
      titleStyle: meta.titleStyle,
      ...(meta.crowns ? { crowns: meta.crowns } : {}),
    };
  });

  // Compute myRank (reuses myRankIndex from above)
  let myRank: LeaderboardEntry | null = null;
  if (playerId && myRankIndex !== null) {
    const myScore = await redis.zscore(key, playerId);
    const meta = parseLeaderboardMeta(await redis.hget(metaKey, playerId));
    myRank = {
      rank: myRankIndex + 1,
      playerId,
      username: meta.username,
      characterLevel: meta.characterLevel,
      score: Number(myScore),
      isBot: meta.isBot,
      isAdmin: !!meta.isAdmin,
      title: meta.title,
      titleTier: meta.titleTier,
      titleStyle: meta.titleStyle,
      ...(meta.crowns ? { crowns: meta.crowns } : {}),
    };
  }

  return { category, period, entries, myRank, totalPlayers, lastRefreshedAt };
}

export async function ensureLeaderboardsFresh(): Promise<void> {
  try {
    const lastRefreshedAt = await redis.get(LAST_REFRESH_KEY);
    if (lastRefreshedAt) {
      const ageMs = Date.now() - Date.parse(lastRefreshedAt);
      if (Number.isFinite(ageMs) && ageMs < LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS) {
        return;
      }
    }

    const lockToken = randomUUID();
    const acquired = await redis.set(
      LOCK_KEY,
      lockToken,
      'PX',
      LEADERBOARD_CONSTANTS.REFRESH_LOCK_TTL_MS,
      'NX',
    );
    if (!acquired) {
      return;
    }

    try {
      await refreshAllLeaderboards();
    } finally {
      await redis.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, lockToken);
    }
  } catch (err) {
    logger.warn({ err }, 'ensureLeaderboardsFresh failed; serving existing data');
  }
}

// ── Refresh logic ───────────────────────────────────────────────────────────

async function writeToZset(
  category: string,
  rows: LeaderboardWriteRow[],
  seasonId?: string | null,
) {
  const key = leaderboardKey(category, seasonId);
  const metaKey = leaderboardMetaKey(category, seasonId);

  // Clear old data
  await redis.del(key, metaKey);

  if (rows.length === 0) return;

  // Write scores — ZADD key score1 member1 score2 member2 ...
  const zaddArgs: (string | number)[] = [];
  const metaArgs: string[] = [];
  const crownCounts = await readCrownCountsForRows(category, rows);

  for (const row of rows) {
    const crowns = crownCounts.get(row.playerId);
    zaddArgs.push(row.score, row.playerId);
    metaArgs.push(row.playerId, JSON.stringify({
      username: row.username,
      characterLevel: row.characterLevel,
      isBot: row.isBot,
      isAdmin: row.isAdmin,
      title: row.title,
      titleTier: row.titleTier,
      titleStyle: row.titleStyle,
      crowns,
    }));
  }

  await redis.zadd(key, ...zaddArgs);
  if (metaArgs.length > 0) {
    await redis.hset(metaKey, ...metaArgs);
  }
}

async function readCrownCountsForRows(
  category: string,
  rows: LeaderboardWriteRow[],
): Promise<Map<string, CrownRankCounts>> {
  if (!CROWN_CATEGORY_SLUGS.has(category) || rows.length === 0) {
    return new Map();
  }

  try {
    return await getCrownCountsForCategory(category, rows.map((row) => row.playerId));
  } catch (err) {
    logger.warn({ err, category }, 'Failed to include crown counts in leaderboard metadata');
    return new Map();
  }
}

async function computeWeeklyDelta(
  category: string,
  rows: Array<{ playerId: string; score: number }>,
  seasonId?: string | null,
  sourceScores?: Map<string, number>,
): Promise<void> {
  const snapshotKey = sourceScores
    ? leaderboardWeeklyStartXpKey(category, seasonId)
    : leaderboardWeeklyStartKey(category, seasonId);

  const snapshotExists = await redis.exists(snapshotKey);
  if (!snapshotExists) {
    return;
  }

  const readPipeline = redis.pipeline();
  for (const row of rows) {
    readPipeline.zscore(snapshotKey, row.playerId);
  }
  const snapshotResults = await readPipeline.exec();

  const deltaKey = leaderboardWeeklyDeltaKey(category, seasonId);
  const writePipeline = redis.pipeline();
  writePipeline.del(deltaKey);

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const currentScore = sourceScores?.get(row.playerId) ?? row.score;
    const snapshotRaw = snapshotResults?.[index]?.[1];
    const snapshotScore = typeof snapshotRaw === 'number'
      ? snapshotRaw
      : typeof snapshotRaw === 'string'
        ? Number(snapshotRaw)
        : 0;
    const delta = currentScore - snapshotScore;

    if (delta >= CROWN_CONSTANTS.MIN_DELTA) {
      writePipeline.zadd(deltaKey, delta, row.playerId);
    }
  }

  await writePipeline.exec();
}

async function refreshPvp(seasonId?: string | null) {
  const ratings = await paginatedFindMany<PvpRatingRow>(
    (args) => prisma.pvpRating.findMany(args as Parameters<typeof prisma.pvpRating.findMany>[0]) as unknown as Promise<PvpRatingRow[]>,
    {
      where: {
        player: playerSeasonWhere(seasonId),
      },
      select: {
        id: true,
        playerId: true,
        rating: true,
        wins: true,
        bestRating: true,
        winStreak: true,
        player: {
          select: {
            username: true,
            characterLevel: true,
            isBot: true,
            activeTitle: true,
            account: { select: { role: true } },
          },
        },
      },
    },
  );

  const fields: { slug: string; field: 'rating' | 'wins' | 'bestRating' | 'winStreak' }[] = [
    { slug: 'pvp_rating', field: 'rating' },
    { slug: 'pvp_wins', field: 'wins' },
    { slug: 'pvp_best_rating', field: 'bestRating' },
    { slug: 'pvp_win_streak', field: 'winStreak' },
  ];

  for (const { slug, field } of fields) {
    const rows = ratings.map((r) => buildPlayerLeaderboardRow(r.playerId, r[field], r.player));
    await writeToZset(slug, rows, seasonId);
    await computeWeeklyDelta(slug, rows, seasonId);
  }
}

async function refreshProgression(seasonId?: string | null) {
  const players = await paginatedFindMany<PlayerRow>(
    (args) => prisma.player.findMany(args as Parameters<typeof prisma.player.findMany>[0]) as unknown as Promise<PlayerRow[]>,
    {
      where: {
        isBot: false,
        ...playerSeasonWhere(seasonId),
      },
      select: {
        id: true,
        username: true,
        characterLevel: true,
        characterXp: true,
        isBot: true,
        activeTitle: true,
        account: { select: { role: true } },
      },
    },
  );

  const characterLevelRows = players.map((p) => buildPlayerLeaderboardRow(p.id, p.characterLevel, p));
  await writeToZset('character_level', characterLevelRows, seasonId);
  await computeWeeklyDelta(
    'character_level',
    characterLevelRows,
    seasonId,
    new Map(players.map((player) => [player.id, Number(player.characterXp)])),
  );

  const characterXpRows = players.map((p) => buildPlayerLeaderboardRow(p.id, Number(p.characterXp), p));
  await writeToZset('character_xp', characterXpRows, seasonId);
  await computeWeeklyDelta('character_xp', characterXpRows, seasonId);
}

async function refreshSkills(seasonId?: string | null) {
  const skills = await paginatedFindMany<PlayerSkillRow>(
    (args) => prisma.playerSkill.findMany(args as Parameters<typeof prisma.playerSkill.findMany>[0]) as unknown as Promise<PlayerSkillRow[]>,
    {
      where: {
        player: {
          isBot: false,
          ...playerSeasonWhere(seasonId),
        },
      },
      select: {
        id: true,
        playerId: true,
        skillType: true,
        level: true,
        xp: true,
        player: {
          select: {
            username: true,
            characterLevel: true,
            isBot: true,
            activeTitle: true,
            account: { select: { role: true } },
          },
        },
      },
    },
  );

  // Individual skill leaderboards
  for (const skillType of SKILL_TYPES) {
    const filtered = skills.filter((s) => s.skillType === skillType);
    const category = `skill_${skillType}`;
    const rows = filtered.map((s) => buildPlayerLeaderboardRow(s.playerId, s.level, s.player));
    await writeToZset(category, rows, seasonId);
    await computeWeeklyDelta(
      category,
      rows,
      seasonId,
      new Map(filtered.map((skill) => [skill.playerId, Number(skill.xp)])),
    );
  }

  // Total skill level — aggregate per player
  const totals = new Map<string, LeaderboardWriteRow>();
  const totalXp = new Map<string, number>();
  for (const s of skills) {
    totalXp.set(s.playerId, (totalXp.get(s.playerId) ?? 0) + Number(s.xp));
    const existing = totals.get(s.playerId);
    if (existing) {
      existing.score += s.level;
    } else {
      totals.set(s.playerId, buildPlayerLeaderboardRow(s.playerId, s.level, s.player));
    }
  }

  const totalRows = Array.from(totals.values());
  await writeToZset('total_skill_level', totalRows, seasonId);
  await computeWeeklyDelta('total_skill_level', totalRows, seasonId, totalXp);
}

async function refreshCombat(seasonId?: string | null) {
  // Total kills from bestiary — uses offset-based pagination because
  // PlayerBestiary has a composite PK (playerId + mobTemplateId),
  // incompatible with cursor pagination.
  const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
  const killTotals = new Map<string, LeaderboardWriteRow>();
  let offset = 0;
  let batch;
  do {
    batch = await prisma.playerBestiary.findMany({
      where: {
        player: {
          isBot: false,
          ...playerSeasonWhere(seasonId),
        },
      },
      select: {
        playerId: true,
        kills: true,
        player: {
          select: {
            username: true,
            characterLevel: true,
            isBot: true,
            activeTitle: true,
            account: { select: { role: true } },
          },
        },
      },
      take: batchSize,
      skip: offset,
    });
    for (const b of batch) {
      const existing = killTotals.get(b.playerId);
      if (existing) {
        existing.score += b.kills;
      } else {
        killTotals.set(b.playerId, buildPlayerLeaderboardRow(b.playerId, b.kills, b.player));
      }
    }
    offset += batchSize;
  } while (batch.length === batchSize);

  const killRows = Array.from(killTotals.values());
  await writeToZset('total_kills', killRows, seasonId);
  await computeWeeklyDelta('total_kills', killRows, seasonId);

  // Boss damage
  try {
    const bossRaw = await paginatedFindMany<BossParticipantRow>(
      (args) => prisma.bossParticipant.findMany(args as Parameters<typeof prisma.bossParticipant.findMany>[0]) as unknown as Promise<BossParticipantRow[]>,
      {
        where: {
          player: {
            isBot: false,
            ...playerSeasonWhere(seasonId),
          },
        },
        select: {
          id: true,
          playerId: true,
          totalDamage: true,
          player: {
            select: {
              username: true,
              characterLevel: true,
              isBot: true,
              activeTitle: true,
              account: { select: { role: true } },
            },
          },
        },
      },
    );

    const dmgTotals = new Map<string, LeaderboardWriteRow>();
    for (const b of bossRaw) {
      const existing = dmgTotals.get(b.playerId);
      if (existing) {
        existing.score += b.totalDamage;
      } else {
        dmgTotals.set(b.playerId, buildPlayerLeaderboardRow(b.playerId, b.totalDamage, b.player));
      }
    }

    const damageRows = Array.from(dmgTotals.values());
    await writeToZset('boss_damage', damageRows, seasonId);
    await computeWeeklyDelta('boss_damage', damageRows, seasonId);
  } catch (err) {
    // Skip if table doesn't exist (migration not yet applied); re-throw other errors
    const isMissingTable =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021';
    if (!isMissingTable) throw err;
  }
}

async function refreshGuilds(seasonId?: string | null) {
  const guilds = await paginatedFindMany<GuildRow>(
    (args) => prisma.guild.findMany(args as Parameters<typeof prisma.guild.findMany>[0]) as unknown as Promise<GuildRow[]>,
    {
      where: playerSeasonWhere(seasonId),
      select: { id: true, name: true, tag: true, level: true, renown: true, _count: { select: { members: true } } },
    },
  );

  const guildLevelRows = guilds.map((g) => ({
    playerId: g.id,
    score: g.level,
    username: `[${g.tag}] ${g.name}`,
    characterLevel: g.level,
    isBot: false,
    isAdmin: false,
  }));
  await writeToZset('guild_level', guildLevelRows, seasonId);
  await computeWeeklyDelta('guild_level', guildLevelRows, seasonId);

  const guildRenownRows = guilds.map((g) => ({
    playerId: g.id,
    score: g.renown,
    username: `[${g.tag}] ${g.name}`,
    characterLevel: g.level,
    isBot: false,
    isAdmin: false,
  }));
  await writeToZset('guild_renown', guildRenownRows, seasonId);
  await computeWeeklyDelta('guild_renown', guildRenownRows, seasonId);

  const guildMemberRows = guilds.map((g) => ({
    playerId: g.id,
    score: g._count.members,
    username: `[${g.tag}] ${g.name}`,
    characterLevel: g.level,
    isBot: false,
    isAdmin: false,
  }));
  await writeToZset('guild_members', guildMemberRows, seasonId);
  await computeWeeklyDelta('guild_members', guildMemberRows, seasonId);
}

async function refreshCasino(seasonId?: string | null): Promise<void> {
  const rows = await prisma.$queryRaw<{ playerId: string; totalWagered: number; totalPayout: number }[]>`
    SELECT
      rb.player_id AS "playerId",
      SUM(rb.amount)::int AS "totalWagered",
      COALESCE(SUM(rb.payout), 0)::int AS "totalPayout"
    FROM roulette_bets rb
    WHERE rb.payout IS NOT NULL
    GROUP BY rb.player_id
  `;

  if (rows.length === 0) return;

  const playerIds = rows.map((r) => r.playerId);
  const players = await prisma.player.findMany({
    where: {
      id: { in: playerIds },
      isBot: false,
      ...playerSeasonWhere(seasonId),
    },
    select: {
      id: true,
      username: true,
      characterLevel: true,
      isBot: true,
      activeTitle: true,
      account: { select: { role: true } },
    },
  });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const buildRows = (scoreFn: (r: (typeof rows)[0]) => number) =>
    rows.flatMap((r) => {
      const p = playerMap.get(r.playerId);
      if (!p) {
        return [];
      }

      return buildPlayerLeaderboardRow(r.playerId, scoreFn(r), p);
    });

  const profitRows = buildRows((r) => r.totalPayout - r.totalWagered);
  await writeToZset('casino_profit', profitRows, seasonId);
  await computeWeeklyDelta('casino_profit', profitRows, seasonId);

  const wageredRows = buildRows((r) => r.totalWagered);
  await writeToZset('casino_wagered', wageredRows, seasonId);
  await computeWeeklyDelta('casino_wagered', wageredRows, seasonId);
}

export async function refreshAllLeaderboards(): Promise<void> {
  const start = Date.now();
  let failures = 0;

  const activeSeasons = await prisma.season.findMany({
    where: { status: 'active' },
    select: { id: true },
  });

  const realms: Array<string | null> = [null, ...activeSeasons.map((season) => season.id)];

  for (const seasonId of realms) {
    try { await refreshPvp(seasonId); } catch (err) { failures++; logger.error({ err, board: 'pvp', seasonId }, 'Leaderboard refresh error'); }
    try { await refreshProgression(seasonId); } catch (err) { failures++; logger.error({ err, board: 'progression', seasonId }, 'Leaderboard refresh error'); }
    try { await refreshSkills(seasonId); } catch (err) { failures++; logger.error({ err, board: 'skills', seasonId }, 'Leaderboard refresh error'); }
    try { await refreshCombat(seasonId); } catch (err) { failures++; logger.error({ err, board: 'combat', seasonId }, 'Leaderboard refresh error'); }
    try { await refreshGuilds(seasonId); } catch (err) { failures++; logger.error({ err, board: 'guilds', seasonId }, 'Leaderboard refresh error'); }
    try { await refreshCasino(seasonId); } catch (err) { failures++; logger.error({ err, board: 'casino', seasonId }, 'Leaderboard refresh error'); }
  }

  if (failures === 0) {
    await redis.set(LAST_REFRESH_KEY, new Date().toISOString());
  }

  logger.info({ durationMs: Date.now() - start, failures }, 'Leaderboard refresh completed');
}
