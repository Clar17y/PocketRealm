import { prisma, Prisma } from '@adventure/database';
import { LEADERBOARD_CONSTANTS, ACHIEVEMENTS_BY_ID } from '@adventure/shared';
import { redis } from '../redis';
import { AppError } from '../middleware/errorHandler';

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

const ALL_CATEGORIES = [
  ...PVP_CATEGORIES,
  ...PROGRESSION_CATEGORIES,
  ...SKILL_CATEGORIES,
  ...COMBAT_CATEGORIES,
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

export interface LeaderboardEntry {
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

export interface LeaderboardResponse {
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

  const key = `leaderboard:${category}`;
  const metaKey = `leaderboard:meta:${category}`;
  const { PAGE_SIZE } = LEADERBOARD_CONSTANTS;

  const totalPlayers = await redis.zcard(key);
  const lastRefreshedAt = await redis.get('leaderboard:last_refresh');

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
  const ratings = await prisma.pvpRating.findMany({
    include: { player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
  });

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
  const players = await prisma.player.findMany({
    select: { id: true, username: true, characterLevel: true, characterXp: true, isBot: true, role: true, activeTitle: true },
  });

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
  const skills = await prisma.playerSkill.findMany({
    include: { player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
  });

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
  // Total kills from bestiary
  const bestiaryRaw = await prisma.playerBestiary.findMany({
    select: { playerId: true, kills: true, player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
  });

  const killTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean; isAdmin: boolean; title?: string; titleTier?: number }>();
  for (const b of bestiaryRaw) {
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

  await writeToZset(
    'total_kills',
    Array.from(killTotals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
  );

  // Boss damage
  try {
    const bossRaw = await prisma.bossParticipant.findMany({
      select: { playerId: true, totalDamage: true, player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
    });

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

export async function refreshAllLeaderboards(): Promise<void> {
  const start = Date.now();
  let failures = 0;

  try { await refreshPvp(); } catch (err) { failures++; console.error('Leaderboard refresh error (pvp):', err); }
  try { await refreshProgression(); } catch (err) { failures++; console.error('Leaderboard refresh error (progression):', err); }
  try { await refreshSkills(); } catch (err) { failures++; console.error('Leaderboard refresh error (skills):', err); }
  try { await refreshCombat(); } catch (err) { failures++; console.error('Leaderboard refresh error (combat):', err); }

  if (failures === 0) {
    await redis.set('leaderboard:last_refresh', new Date().toISOString());
  }

  console.log(`Leaderboard refresh completed in ${Date.now() - start}ms (${failures} failures)`);
}
