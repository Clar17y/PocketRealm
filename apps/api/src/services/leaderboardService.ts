import { randomUUID } from 'crypto';
import { prisma, Prisma } from '@pocketrealm/database';
import { LEADERBOARD_CONSTANTS, resolveAchievementTitleDisplay } from '@pocketrealm/shared';
import type { TitleStyleVariant } from '@pocketrealm/shared';
import { redis } from '../redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';
import { leaderboardKey, leaderboardMetaKey } from './leaderboardKeys';

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

function getRole(player: { account?: { role?: string | null }; role?: string | null }): string | null {
  return player.account?.role ?? player.role ?? null;
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
}

interface LeaderboardResponse {
  category: string;
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

export async function getLeaderboard(
  category: string,
  playerId?: string,
  aroundMe = false,
  seasonId?: string | null,
): Promise<LeaderboardResponse> {
  if (!VALID_SLUGS.has(category)) {
    throw new AppError(400, `Invalid leaderboard category: ${category}`, 'INVALID_CATEGORY');
  }

  await ensureLeaderboardsFresh();

  const key = leaderboardKey(category, seasonId);
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
    start = Math.max(0, myRankIndex - half);
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
  const DEFAULT_META = { username: 'Unknown', characterLevel: 1, isBot: false, isAdmin: false };
  const metaValues = playerIds.length > 0 ? await redis.hmget(metaKey, ...playerIds) : [];

  const entries: LeaderboardEntry[] = playerIds.map((pid, idx) => {
    const meta = metaValues[idx] ? JSON.parse(metaValues[idx]!) : DEFAULT_META;
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
    };
  });

  // Compute myRank (reuses myRankIndex from above)
  let myRank: LeaderboardEntry | null = null;
  if (playerId && myRankIndex !== null) {
    const myScore = await redis.zscore(key, playerId);
    const metaStr = await redis.hget(metaKey, playerId);
    const meta = metaStr ? JSON.parse(metaStr) : DEFAULT_META;
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
    };
  }

  return { category, entries, myRank, totalPlayers, lastRefreshedAt };
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
  rows: { playerId: string; score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number; titleStyle?: TitleStyleVariant }[],
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

  for (const row of rows) {
    zaddArgs.push(row.score, row.playerId);
    metaArgs.push(row.playerId, JSON.stringify({
      username: row.username,
      characterLevel: row.characterLevel,
      isBot: row.isBot,
      isAdmin: row.isAdmin,
      title: row.title,
      titleTier: row.titleTier,
      titleStyle: row.titleStyle,
    }));
  }

  await redis.zadd(key, ...zaddArgs);
  if (metaArgs.length > 0) {
    await redis.hset(metaKey, ...metaArgs);
  }
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
    await writeToZset(
      slug,
      ratings.map((r) => ({
        playerId: r.playerId,
        score: r[field],
        username: r.player.username,
        characterLevel: r.player.characterLevel,
        isBot: r.player.isBot,
        isAdmin: getRole(r.player) === 'admin',
        ...resolveAchievementTitleDisplay(r.player.activeTitle),
      })),
      seasonId,
    );
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

  await writeToZset(
    'character_level',
    players.map((p) => ({
      playerId: p.id,
      score: p.characterLevel,
      username: p.username,
      characterLevel: p.characterLevel,
      isBot: p.isBot,
      isAdmin: getRole(p) === 'admin',
      ...resolveAchievementTitleDisplay(p.activeTitle),
    })),
    seasonId,
  );

  await writeToZset(
    'character_xp',
    players.map((p) => ({
      playerId: p.id,
      score: Number(p.characterXp),
      username: p.username,
      characterLevel: p.characterLevel,
      isBot: p.isBot,
      isAdmin: getRole(p) === 'admin',
      ...resolveAchievementTitleDisplay(p.activeTitle),
    })),
    seasonId,
  );
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
    await writeToZset(
      `skill_${skillType}`,
      filtered.map((s) => ({
        playerId: s.playerId,
        score: s.level,
        username: s.player.username,
        characterLevel: s.player.characterLevel,
        isBot: s.player.isBot,
        isAdmin: getRole(s.player) === 'admin',
        ...resolveAchievementTitleDisplay(s.player.activeTitle),
      })),
      seasonId,
    );
  }

  // Total skill level — aggregate per player
  const totals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number; titleStyle?: TitleStyleVariant }>();
  for (const s of skills) {
    const existing = totals.get(s.playerId);
    if (existing) {
      existing.score += s.level;
    } else {
      totals.set(s.playerId, {
        score: s.level,
        username: s.player.username,
        characterLevel: s.player.characterLevel,
        isBot: s.player.isBot,
        isAdmin: getRole(s.player) === 'admin',
        ...resolveAchievementTitleDisplay(s.player.activeTitle),
      });
    }
  }

  await writeToZset(
    'total_skill_level',
    Array.from(totals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
    seasonId,
  );
}

async function refreshCombat(seasonId?: string | null) {
  // Total kills from bestiary — uses offset-based pagination because
  // PlayerBestiary has a composite PK (playerId + mobTemplateId),
  // incompatible with cursor pagination.
  const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
  const killTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number; titleStyle?: TitleStyleVariant }>();
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
        killTotals.set(b.playerId, {
          score: b.kills,
          username: b.player.username,
          characterLevel: b.player.characterLevel,
          isBot: b.player.isBot,
          isAdmin: getRole(b.player) === 'admin',
          ...resolveAchievementTitleDisplay(b.player.activeTitle),
        });
      }
    }
    offset += batchSize;
  } while (batch.length === batchSize);

  await writeToZset(
    'total_kills',
    Array.from(killTotals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
    seasonId,
  );

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

    const dmgTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number; titleStyle?: TitleStyleVariant }>();
    for (const b of bossRaw) {
      const existing = dmgTotals.get(b.playerId);
      if (existing) {
        existing.score += b.totalDamage;
      } else {
        dmgTotals.set(b.playerId, {
          score: b.totalDamage,
          username: b.player.username,
          characterLevel: b.player.characterLevel,
          isBot: b.player.isBot,
          isAdmin: getRole(b.player) === 'admin',
          ...resolveAchievementTitleDisplay(b.player.activeTitle),
        });
      }
    }

    await writeToZset(
      'boss_damage',
      Array.from(dmgTotals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
      seasonId,
    );
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

  await writeToZset(
    'guild_level',
    guilds.map((g) => ({
      playerId: g.id,
      score: g.level,
      username: `[${g.tag}] ${g.name}`,
      characterLevel: g.level,
      isBot: false,
      isAdmin: false,
    })),
    seasonId,
  );

  await writeToZset(
    'guild_renown',
    guilds.map((g) => ({
      playerId: g.id,
      score: g.renown,
      username: `[${g.tag}] ${g.name}`,
      characterLevel: g.level,
      isBot: false,
      isAdmin: false,
    })),
    seasonId,
  );

  await writeToZset(
    'guild_members',
    guilds.map((g) => ({
      playerId: g.id,
      score: g._count.members,
      username: `[${g.tag}] ${g.name}`,
      characterLevel: g.level,
      isBot: false,
      isAdmin: false,
    })),
    seasonId,
  );
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

      return {
        playerId: r.playerId,
        score: scoreFn(r),
        username: p.username,
        characterLevel: p.characterLevel,
        isBot: p.isBot,
        isAdmin: getRole(p) === 'admin',
        ...resolveAchievementTitleDisplay(p.activeTitle),
      };
    });

  await writeToZset('casino_profit', buildRows((r) => r.totalPayout - r.totalWagered), seasonId);
  await writeToZset('casino_wagered', buildRows((r) => r.totalWagered), seasonId);
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
