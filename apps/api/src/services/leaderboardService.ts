import { randomUUID } from 'crypto';
import { prisma, Prisma } from '@pocketrealm/database';
import { LEADERBOARD_CONSTANTS, ACHIEVEMENTS_BY_ID } from '@pocketrealm/shared';
import { redis } from '../redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';

const LAST_REFRESH_KEY = 'leaderboard:last_refresh';
const LOCK_KEY = 'leaderboard:refresh_lock';
const LOCK_TTL_MS = 60_000;

// ── Paginated fetch helper ───────────────────────────────────────────────────

// Shared player sub-shape selected in leaderboard queries
interface LeaderboardPlayerSummary {
  username: string;
  characterLevel: number;
  isBot: boolean;
  role: string;
  activeTitle: string | null;
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
  role: string;
  activeTitle: string | null;
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

/**
 * Fetches all rows from a Prisma model in cursor-based batches to avoid
 * unbounded single-query memory pressure at scale.
 */
async function paginatedFindMany<T extends { id: string }>(
  findMany: (args: { take: number; skip?: number; cursor?: { id: string }; select?: unknown; orderBy?: unknown }) => Promise<T[]>,
  baseArgs: { select?: unknown },
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
): Promise<LeaderboardResponse> {
  if (!VALID_SLUGS.has(category)) {
    throw new AppError(400, `Invalid leaderboard category: ${category}`, 'INVALID_CATEGORY');
  }

  await ensureLeaderboardsFresh();

  const key = `leaderboard:${category}`;
  const metaKey = `leaderboard:meta:${category}`;
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
    const acquired = await redis.set(LOCK_KEY, lockToken, 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
      return;
    }

    try {
      await refreshAllLeaderboards();
    } finally {
      const currentLockToken = await redis.get(LOCK_KEY);
      if (currentLockToken === lockToken) {
        await redis.del(LOCK_KEY);
      }
    }
  } catch (err) {
    logger.warn({ err }, 'ensureLeaderboardsFresh failed; serving existing data');
  }
}

// ── Refresh logic ───────────────────────────────────────────────────────────

function resolveTitle(activeTitle: string | null | undefined): { title?: string; titleTier?: number } {
  if (!activeTitle) return {};
  const def = ACHIEVEMENTS_BY_ID.get(activeTitle);
  if (!def?.titleReward) return {};
  return { title: def.titleReward, titleTier: def.tier };
}

async function writeToZset(
  category: string,
  rows: { playerId: string; score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number }[],
) {
  const key = `leaderboard:${category}`;
  const metaKey = `leaderboard:meta:${category}`;

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
    }));
  }

  await redis.zadd(key, ...zaddArgs);
  if (metaArgs.length > 0) {
    await redis.hset(metaKey, ...metaArgs);
  }
}

async function refreshPvp() {
  const ratings = await paginatedFindMany<PvpRatingRow>(
    (args) => prisma.pvpRating.findMany(args as Parameters<typeof prisma.pvpRating.findMany>[0]) as unknown as Promise<PvpRatingRow[]>,
    {
      select: {
        id: true,
        playerId: true,
        rating: true,
        wins: true,
        bestRating: true,
        winStreak: true,
        player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } },
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
        isAdmin: r.player.role === 'admin',
        ...resolveTitle(r.player.activeTitle),
      })),
    );
  }
}

async function refreshProgression() {
  const players = await paginatedFindMany<PlayerRow>(
    (args) => prisma.player.findMany(args as Parameters<typeof prisma.player.findMany>[0]) as unknown as Promise<PlayerRow[]>,
    {
      select: { id: true, username: true, characterLevel: true, characterXp: true, isBot: true, role: true, activeTitle: true },
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
      isAdmin: p.role === 'admin',
      ...resolveTitle(p.activeTitle),
    })),
  );

  await writeToZset(
    'character_xp',
    players.map((p) => ({
      playerId: p.id,
      score: Number(p.characterXp),
      username: p.username,
      characterLevel: p.characterLevel,
      isBot: p.isBot,
      isAdmin: p.role === 'admin',
      ...resolveTitle(p.activeTitle),
    })),
  );
}

async function refreshSkills() {
  const skills = await paginatedFindMany<PlayerSkillRow>(
    (args) => prisma.playerSkill.findMany(args as Parameters<typeof prisma.playerSkill.findMany>[0]) as unknown as Promise<PlayerSkillRow[]>,
    {
      select: {
        id: true,
        playerId: true,
        skillType: true,
        level: true,
        player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } },
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
        isAdmin: s.player.role === 'admin',
        ...resolveTitle(s.player.activeTitle),
      })),
    );
  }

  // Total skill level — aggregate per player
  const totals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number }>();
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
        isAdmin: s.player.role === 'admin',
        ...resolveTitle(s.player.activeTitle),
      });
    }
  }

  await writeToZset(
    'total_skill_level',
    Array.from(totals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
  );
}

async function refreshCombat() {
  // Total kills from bestiary — uses offset-based pagination because
  // PlayerBestiary has a composite PK (playerId + mobTemplateId),
  // incompatible with cursor pagination.
  const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
  const killTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number }>();
  let offset = 0;
  let batch;
  do {
    batch = await prisma.playerBestiary.findMany({
      select: { playerId: true, kills: true, player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
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
          isAdmin: b.player.role === 'admin',
          ...resolveTitle(b.player.activeTitle),
        });
      }
    }
    offset += batchSize;
  } while (batch.length === batchSize);

  await writeToZset(
    'total_kills',
    Array.from(killTotals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
  );

  // Boss damage
  try {
    const bossRaw = await paginatedFindMany<BossParticipantRow>(
      (args) => prisma.bossParticipant.findMany(args as Parameters<typeof prisma.bossParticipant.findMany>[0]) as unknown as Promise<BossParticipantRow[]>,
      {
        select: { id: true, playerId: true, totalDamage: true, player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
      },
    );

    const dmgTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number }>();
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
          isAdmin: b.player.role === 'admin',
          ...resolveTitle(b.player.activeTitle),
        });
      }
    }

    await writeToZset(
      'boss_damage',
      Array.from(dmgTotals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
    );
  } catch (err) {
    // Skip if table doesn't exist (migration not yet applied); re-throw other errors
    const isMissingTable =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021';
    if (!isMissingTable) throw err;
  }
}

async function refreshGuilds() {
  const guilds = await paginatedFindMany<GuildRow>(
    (args) => prisma.guild.findMany(args as Parameters<typeof prisma.guild.findMany>[0]) as unknown as Promise<GuildRow[]>,
    {
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
  );
}

async function refreshCasino(): Promise<void> {
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
    where: { id: { in: playerIds } },
    select: { id: true, username: true, characterLevel: true, isBot: true, role: true, activeTitle: true },
  });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const buildRows = (scoreFn: (r: (typeof rows)[0]) => number) =>
    rows.map((r) => {
      const p = playerMap.get(r.playerId);
      return {
        playerId: r.playerId,
        score: scoreFn(r),
        username: p?.username ?? 'Unknown',
        characterLevel: p?.characterLevel ?? 1,
        isBot: p?.isBot ?? false,
        isAdmin: p?.role === 'admin',
        ...resolveTitle(p?.activeTitle),
      };
    });

  await writeToZset('casino_profit', buildRows((r) => r.totalPayout - r.totalWagered));
  await writeToZset('casino_wagered', buildRows((r) => r.totalWagered));
}

export async function refreshAllLeaderboards(): Promise<void> {
  const start = Date.now();
  let failures = 0;

  try { await refreshPvp(); } catch (err) { failures++; logger.error({ err, board: 'pvp' }, 'Leaderboard refresh error'); }
  try { await refreshProgression(); } catch (err) { failures++; logger.error({ err, board: 'progression' }, 'Leaderboard refresh error'); }
  try { await refreshSkills(); } catch (err) { failures++; logger.error({ err, board: 'skills' }, 'Leaderboard refresh error'); }
  try { await refreshCombat(); } catch (err) { failures++; logger.error({ err, board: 'combat' }, 'Leaderboard refresh error'); }
  try { await refreshGuilds(); } catch (err) { failures++; logger.error({ err, board: 'guilds' }, 'Leaderboard refresh error'); }
  try { await refreshCasino(); } catch (err) { failures++; logger.error({ err, board: 'casino' }, 'Leaderboard refresh error'); }

  if (failures === 0) {
    await redis.set(LAST_REFRESH_KEY, new Date().toISOString());
  }

  logger.info({ durationMs: Date.now() - start, failures }, 'Leaderboard refresh completed');
}
