# Leaderboard System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global leaderboard system with 22 ranking categories (PvP, Progression, Skills, Combat), snapshot-based via Redis sorted sets refreshed every 15 minutes.

**Architecture:** Redis sorted sets (ZSET) store rankings per category, refreshed by `setInterval` in the API process. Companion hashes store player metadata. Two API endpoints serve categories list and paginated rankings. Frontend has a dedicated LeaderboardScreen plus a Rankings tab in ArenaScreen, sharing a LeaderboardTable component.

**Tech Stack:** Express routes, Prisma queries, ioredis sorted sets, React components with existing RPG theme

**Design doc:** `docs/superpowers/specs/2026-02-18-leaderboard-system-design.md`

---

## Task 1: Add LEADERBOARD_CONSTANTS to shared package

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:452` (after WORLD_EVENT_CONSTANTS closing)

**Step 1: Add constants**

After the closing `} as const;` of `WORLD_EVENT_CONSTANTS` (line 452), add:

```ts
// =============================================================================
// LEADERBOARD
// =============================================================================

export const LEADERBOARD_CONSTANTS = {
  REFRESH_INTERVAL_MS: 900_000,
  PAGE_SIZE: 25,
  TOP_N: 25,
} as const;
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(shared): add LEADERBOARD_CONSTANTS"
```

---

## Task 2: Create Redis client singleton

**Files:**
- Create: `apps/api/src/redis.ts`

**Context:** No Redis client exists in the API codebase yet. `ioredis` is already in `apps/api/package.json`. The `REDIS_URL` env var is already configured in `.env.example`.

**Step 1: Create the Redis client**

Create `apps/api/src/redis.ts`:

```ts
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL);
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/api/src/redis.ts
git commit -m "feat(api): add Redis client singleton"
```

---

## Task 3: Create optionalAuthenticate middleware

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`

**Context:** The existing `authenticate` middleware (line 67-88) throws 401 if no token is present. Leaderboard routes need auth to be optional — if a valid token is present, attach `req.player`; if not, proceed without it so `myRank` can be conditionally included.

**Step 1: Add optionalAuthenticate function**

After the `authenticate` function (after line 88), add:

```ts
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.player = payload;
    touchPlayerLastActive(payload.playerId);
  } catch {
    // Invalid token — proceed unauthenticated
  }

  next();
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/api/src/middleware/auth.ts
git commit -m "feat(api): add optionalAuthenticate middleware"
```

---

## Task 4: Create leaderboard service

**Files:**
- Create: `apps/api/src/services/leaderboardService.ts`

**Context:** This is the core service. It has two responsibilities:
1. `refreshAllLeaderboards()` — runs all DB queries, writes results to Redis ZSETs + meta hashes
2. `getLeaderboard(category, playerId?, aroundMe?)` — reads from Redis, returns formatted response

**Data sources (all existing Prisma models):**
- `PvpRating` → 4 PvP categories (rating, wins, bestRating, winStreak)
- `Player` → 2 progression categories (characterLevel, characterXp)
- `PlayerSkill` → 15 skill categories (14 individual + total skill level)
- `PlayerBestiary` → total kills
- `BossParticipant` → boss damage (if model exists)

**Redis key pattern:**
- ZSET: `leaderboard:{category}` — member = playerId, score = numeric value
- Hash: `leaderboard:meta:{category}` — field = playerId, value = JSON `{username, characterLevel, isBot}`
- String: `leaderboard:last_refresh` — ISO timestamp

**Step 1: Create the service file**

Create `apps/api/src/services/leaderboardService.ts`:

```ts
import { prisma } from '@adventure/database';
import { LEADERBOARD_CONSTANTS } from '@adventure/shared';
import { redis } from '../redis';

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
  'melee', 'ranged', 'magic', 'defence', 'vitality', 'evasion',
  'mining', 'foraging', 'woodcutting', 'refining', 'tanning', 'weaving',
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
    throw new Error(`Invalid leaderboard category: ${category}`);
  }

  const key = `leaderboard:${category}`;
  const metaKey = `leaderboard:meta:${category}`;
  const { PAGE_SIZE } = LEADERBOARD_CONSTANTS;

  const totalPlayers = await redis.zcard(key);
  const lastRefreshedAt = await redis.get('leaderboard:last_refresh');

  let start = 0;
  let stop = PAGE_SIZE - 1;

  // If around_me, center the window on the player's rank
  if (aroundMe && playerId) {
    const myRankIndex = await redis.zrevrank(key, playerId);
    if (myRankIndex !== null) {
      const half = Math.floor(PAGE_SIZE / 2);
      start = Math.max(0, myRankIndex - half);
      stop = start + PAGE_SIZE - 1;
    }
  }

  // Fetch entries with scores
  const raw = await redis.zrevrange(key, start, stop, 'WITHSCORES');
  const entries: LeaderboardEntry[] = [];

  for (let i = 0; i < raw.length; i += 2) {
    const pid = raw[i];
    const score = Number(raw[i + 1]);
    const metaStr = await redis.hget(metaKey, pid);
    const meta = metaStr ? JSON.parse(metaStr) : { username: 'Unknown', characterLevel: 1, isBot: false };

    entries.push({
      rank: start + (i / 2) + 1,
      playerId: pid,
      username: meta.username,
      characterLevel: meta.characterLevel,
      score,
      isBot: meta.isBot,
    });
  }

  // Compute myRank
  let myRank: LeaderboardEntry | null = null;
  if (playerId) {
    const myRankIndex = await redis.zrevrank(key, playerId);
    if (myRankIndex !== null) {
      const myScore = await redis.zscore(key, playerId);
      const metaStr = await redis.hget(metaKey, playerId);
      const meta = metaStr ? JSON.parse(metaStr) : { username: 'Unknown', characterLevel: 1, isBot: false };
      myRank = {
        rank: myRankIndex + 1,
        playerId,
        username: meta.username,
        characterLevel: meta.characterLevel,
        score: Number(myScore),
        isBot: meta.isBot,
      };
    }
  }

  return { category, entries, myRank, totalPlayers, lastRefreshedAt };
}

// ── Refresh logic ───────────────────────────────────────────────────────────

async function writeToZset(
  category: string,
  rows: { playerId: string; score: number; username: string; characterLevel: number; isBot: boolean }[],
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
    }));
  }

  await redis.zadd(key, ...zaddArgs);
  if (metaArgs.length > 0) {
    await redis.hset(metaKey, ...metaArgs);
  }
}

async function refreshPvp() {
  const ratings = await prisma.pvpRating.findMany({
    include: { player: { select: { username: true, characterLevel: true, isBot: true } } },
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
      })),
    );
  }
}

async function refreshProgression() {
  const players = await prisma.player.findMany({
    select: { id: true, username: true, characterLevel: true, characterXp: true, isBot: true },
  });

  await writeToZset(
    'character_level',
    players.map((p) => ({
      playerId: p.id,
      score: p.characterLevel,
      username: p.username,
      characterLevel: p.characterLevel,
      isBot: p.isBot,
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
    })),
  );
}

async function refreshSkills() {
  // Get all player skills with player info
  const skills = await prisma.playerSkill.findMany({
    include: { player: { select: { username: true, characterLevel: true, isBot: true } } },
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
      })),
    );
  }

  // Total skill level — aggregate per player
  const totals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean }>();
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
    select: { playerId: true, kills: true, player: { select: { username: true, characterLevel: true, isBot: true } } },
  });

  const killTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean }>();
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
      select: { playerId: true, totalDamage: true, player: { select: { username: true, characterLevel: true, isBot: true } } },
    });

    const dmgTotals = new Map<string, { score: number; username: string; characterLevel: number; isBot: boolean }>();
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
        });
      }
    }

    await writeToZset(
      'boss_damage',
      Array.from(dmgTotals.entries()).map(([playerId, data]) => ({ playerId, ...data })),
    );
  } catch {
    // BossParticipant model may not exist yet — skip silently
  }
}

export async function refreshAllLeaderboards(): Promise<void> {
  const start = Date.now();

  try { await refreshPvp(); } catch (err) { console.error('Leaderboard refresh error (pvp):', err); }
  try { await refreshProgression(); } catch (err) { console.error('Leaderboard refresh error (progression):', err); }
  try { await refreshSkills(); } catch (err) { console.error('Leaderboard refresh error (skills):', err); }
  try { await refreshCombat(); } catch (err) { console.error('Leaderboard refresh error (combat):', err); }

  await redis.set('leaderboard:last_refresh', new Date().toISOString());

  console.log(`Leaderboard refresh completed in ${Date.now() - start}ms`);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No new errors (may need to verify BossParticipant model exists in Prisma schema — the try/catch handles it if not)

**Step 3: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts
git commit -m "feat(api): add leaderboard service with Redis ZSET refresh"
```

---

## Task 5: Create leaderboard route

**Files:**
- Create: `apps/api/src/routes/leaderboard.ts`
- Modify: `apps/api/src/index.ts:21` (add import) and `:96` (register route) and `:104-120` (add refresh interval)

**Step 1: Create the route file**

Create `apps/api/src/routes/leaderboard.ts`:

```ts
import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth';
import { getCategories, getLeaderboard } from '../services/leaderboardService';

export const leaderboardRouter = Router();

leaderboardRouter.use(optionalAuthenticate);

leaderboardRouter.get('/categories', (_req, res) => {
  res.json(getCategories());
});

leaderboardRouter.get('/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    const aroundMe = req.query.around_me === 'true';
    const playerId = req.player?.playerId;

    const result = await getLeaderboard(category, playerId, aroundMe);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

**Step 2: Register route in index.ts**

In `apps/api/src/index.ts`:

Add import after line 21 (`import { bossRouter } from './routes/boss';`):
```ts
import { leaderboardRouter } from './routes/leaderboard';
```

Add import after line 25 (`import { cleanupFullyHealedMobs } ...`):
```ts
import { refreshAllLeaderboards } from './services/leaderboardService';
```

Add route registration after line 96 (`app.use('/api/v1/boss', bossRouter);`):
```ts
app.use('/api/v1/leaderboard', leaderboardRouter);
```

Inside the `server.listen` callback (after the persisted mob cleanup interval, line 119), add:
```ts
  // Leaderboard refresh (every 15 minutes)
  refreshAllLeaderboards().catch((err) => {
    console.error('Initial leaderboard refresh error:', err);
  });
  setInterval(() => {
    refreshAllLeaderboards().catch((err) => {
      console.error('Leaderboard refresh error:', err);
    });
  }, 900_000);
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No new errors

**Step 4: Test manually**

Run: `npm run dev:api`
Expected: Console shows "Leaderboard refresh completed in Xms" shortly after startup.

Test endpoints:
```bash
curl http://localhost:4000/api/v1/leaderboard/categories
curl http://localhost:4000/api/v1/leaderboard/character_level
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/leaderboard.ts apps/api/src/index.ts
git commit -m "feat(api): add leaderboard routes and startup refresh"
```

---

## Task 6: Add leaderboard API functions to frontend

**Files:**
- Modify: `apps/web/src/lib/api.ts` (after PvP section, ~line 1232)

**Step 1: Add types and API functions**

After the PvP API section in `apps/web/src/lib/api.ts`, add a new section:

```ts
// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  characterLevel: number;
  score: number;
  isBot: boolean;
}

export interface LeaderboardResponse {
  category: string;
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

export interface LeaderboardCategoryGroup {
  name: string;
  categories: { slug: string; label: string }[];
}

export interface LeaderboardCategoriesResponse {
  groups: LeaderboardCategoryGroup[];
}

export async function getLeaderboardCategories() {
  return fetchApi<LeaderboardCategoriesResponse>('/api/v1/leaderboard/categories');
}

export async function getLeaderboard(category: string, aroundMe = false) {
  const params = aroundMe ? '?around_me=true' : '';
  return fetchApi<LeaderboardResponse>(`/api/v1/leaderboard/${category}${params}`);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add leaderboard API types and functions"
```

---

## Task 7: Create LeaderboardTable shared component

**Files:**
- Create: `apps/web/src/components/leaderboard/LeaderboardTable.tsx`

**Context:** This shared component is used by both LeaderboardScreen and ArenaScreen's Rankings tab. It renders a ranked list with medals for top 3, bot indicators, and highlighted current player row.

**Step 1: Create the component**

Create `apps/web/src/components/leaderboard/LeaderboardTable.tsx`:

```tsx
'use client';

import type { LeaderboardEntry } from '@/lib/api';
import { Bot, Medal } from 'lucide-react';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  currentPlayerId: string | null;
  loading: boolean;
  totalPlayers: number;
  lastRefreshedAt: string | null;
  showAroundMe?: boolean;
  onToggleAroundMe?: () => void;
}

function formatScore(score: number): string {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 10_000) return `${(score / 1_000).toFixed(1)}K`;
  return score.toLocaleString();
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  return `${minutes} min ago`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[var(--rpg-gold)] font-bold"><Medal className="w-4 h-4 inline" /> 1</span>;
  if (rank === 2) return <span className="text-gray-300 font-bold"><Medal className="w-4 h-4 inline" /> 2</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold"><Medal className="w-4 h-4 inline" /> 3</span>;
  return <span className="text-[var(--rpg-text-secondary)]">#{rank}</span>;
}

export function LeaderboardTable({
  entries,
  myRank,
  currentPlayerId,
  loading,
  totalPlayers,
  lastRefreshedAt,
  showAroundMe = false,
  onToggleAroundMe,
}: LeaderboardTableProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
        Loading rankings...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
        No rankings available yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header info */}
      <div className="flex justify-between items-center text-xs text-[var(--rpg-text-secondary)] px-1">
        <span>{totalPlayers.toLocaleString()} players ranked</span>
        {lastRefreshedAt && <span>Updated {timeSince(lastRefreshedAt)}</span>}
      </div>

      {/* Entries */}
      <div className="space-y-1">
        {entries.map((entry) => {
          const isMe = entry.playerId === currentPlayerId;
          return (
            <div
              key={entry.playerId}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                isMe
                  ? 'bg-[var(--rpg-gold)]/15 border border-[var(--rpg-gold)]/40'
                  : 'bg-[var(--rpg-surface)]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 text-right shrink-0">
                  <RankBadge rank={entry.rank} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`truncate ${isMe ? 'text-[var(--rpg-gold)] font-semibold' : 'text-[var(--rpg-text-primary)]'}`}>
                      {entry.username}
                    </span>
                    {entry.isBot && <Bot className="w-3.5 h-3.5 text-[var(--rpg-text-secondary)] shrink-0" />}
                  </div>
                  <span className="text-xs text-[var(--rpg-text-secondary)]">Lv.{entry.characterLevel}</span>
                </div>
              </div>
              <div className="text-right font-mono text-[var(--rpg-text-primary)] shrink-0">
                {formatScore(entry.score)}
              </div>
            </div>
          );
        })}
      </div>

      {/* View my rank / Back to top toggle */}
      {onToggleAroundMe && myRank && (
        <button
          onClick={onToggleAroundMe}
          className="w-full py-2 text-sm text-[var(--rpg-gold)] hover:text-[var(--rpg-gold)]/80 transition-colors"
        >
          {showAroundMe ? 'Back to Top' : 'View My Rank'}
        </button>
      )}

      {/* Pinned "Your rank" bar (shown when viewing top N, not around_me) */}
      {!showAroundMe && myRank && !entries.some((e) => e.playerId === currentPlayerId) && (
        <div className="mt-2 border-t border-[var(--rpg-border)] pt-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-sm bg-[var(--rpg-gold)]/15 border border-[var(--rpg-gold)]/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 text-right shrink-0">
                <span className="text-[var(--rpg-gold)] font-bold">#{myRank.rank}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[var(--rpg-gold)] font-semibold truncate">{myRank.username}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)] ml-1">Lv.{myRank.characterLevel}</span>
              </div>
            </div>
            <div className="text-right font-mono text-[var(--rpg-text-primary)] shrink-0">
              {formatScore(myRank.score)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/web/src/components/leaderboard/LeaderboardTable.tsx
git commit -m "feat(web): add LeaderboardTable shared component"
```

---

## Task 8: Create LeaderboardScreen

**Files:**
- Create: `apps/web/src/app/game/screens/LeaderboardScreen.tsx`

**Step 1: Create the screen**

Create `apps/web/src/app/game/screens/LeaderboardScreen.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import {
  getLeaderboardCategories,
  getLeaderboard,
  type LeaderboardResponse,
  type LeaderboardCategoryGroup,
} from '@/lib/api';
import { Trophy } from 'lucide-react';

interface LeaderboardScreenProps {
  playerId: string | null;
}

export function LeaderboardScreen({ playerId }: LeaderboardScreenProps) {
  const [groups, setGroups] = useState<LeaderboardCategoryGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState('PvP');
  const [activeCategory, setActiveCategory] = useState('pvp_rating');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [aroundMe, setAroundMe] = useState(false);

  // Load categories on mount
  useEffect(() => {
    void (async () => {
      const res = await getLeaderboardCategories();
      if (res.data) {
        setGroups(res.data.groups);
      }
    })();
  }, []);

  // Load leaderboard data when category or aroundMe changes
  const loadData = useCallback(async (category: string, showAroundMe: boolean) => {
    setLoading(true);
    const res = await getLeaderboard(category, showAroundMe);
    if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData(activeCategory, aroundMe);
  }, [activeCategory, aroundMe, loadData]);

  const currentGroupCategories = groups.find((g) => g.name === activeGroup)?.categories ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-[var(--rpg-gold)]" />
        <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Leaderboards</h2>
      </div>

      {/* Group tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {groups.map((group) => (
          <button
            key={group.name}
            onClick={() => {
              setActiveGroup(group.name);
              setActiveCategory(group.categories[0].slug);
              setAroundMe(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeGroup === group.name
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            {group.name}
          </button>
        ))}
      </div>

      {/* Category dropdown (if group has more than 1 category) */}
      {currentGroupCategories.length > 1 && (
        <select
          value={activeCategory}
          onChange={(e) => {
            setActiveCategory(e.target.value);
            setAroundMe(false);
          }}
          className="w-full px-3 py-2 rounded-lg bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] text-sm"
        >
          {currentGroupCategories.map((cat) => (
            <option key={cat.slug} value={cat.slug}>{cat.label}</option>
          ))}
        </select>
      )}

      {/* Leaderboard table */}
      <PixelCard>
        <LeaderboardTable
          entries={data?.entries ?? []}
          myRank={data?.myRank ?? null}
          currentPlayerId={playerId}
          loading={loading}
          totalPlayers={data?.totalPlayers ?? 0}
          lastRefreshedAt={data?.lastRefreshedAt ?? null}
          showAroundMe={aroundMe}
          onToggleAroundMe={() => setAroundMe((v) => !v)}
        />
      </PixelCard>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors

**Step 3: Commit**

```bash
git add apps/web/src/app/game/screens/LeaderboardScreen.tsx
git commit -m "feat(web): add LeaderboardScreen with category tabs and rankings"
```

---

## Task 9: Wire LeaderboardScreen into navigation

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:34-49` (Screen type), `:677` (getActiveTab)
- Modify: `apps/web/src/app/game/page.tsx` (import, switch case, sub-nav tab)

**Step 1: Add 'leaderboard' to Screen type**

In `apps/web/src/app/game/useGameController.ts`, add `'leaderboard'` to the Screen union (after `'worldEvents'` on line 49):

```ts
export type Screen =
  | 'home'
  | 'explore'
  | 'inventory'
  | 'combat'
  | 'profile'
  | 'skills'
  | 'equipment'
  | 'zones'
  | 'bestiary'
  | 'crafting'
  | 'forge'
  | 'gathering'
  | 'rest'
  | 'arena'
  | 'worldEvents'
  | 'leaderboard';
```

**Step 2: Add leaderboard to getActiveTab**

In `useGameController.ts` line 677, add `'leaderboard'` to the home tab group:

```ts
if (['home', 'skills', 'zones', 'bestiary', 'rest', 'worldEvents', 'leaderboard'].includes(activeScreen)) return 'home';
```

**Step 3: Add import and switch case in page.tsx**

In `apps/web/src/app/game/page.tsx`:

Add import (near ArenaScreen import, ~line 29):
```ts
import { LeaderboardScreen } from './screens/LeaderboardScreen';
```

Add case in the screen switch (after the `case 'arena':` block, ~line 740):
```tsx
      case 'leaderboard':
        return <LeaderboardScreen playerId={player?.id ?? null} />;
```

**Step 4: Add 'Rankings' sub-nav tab**

In `page.tsx`, in the home tab sub-navigation array (~line 815-820), add the Rankings entry:

```ts
{ id: 'home', label: 'Dashboard' },
{ id: 'skills', label: 'Skills' },
{ id: 'zones', label: 'Map' },
{ id: 'bestiary', label: 'Bestiary' },
{ id: 'worldEvents', label: 'Events' },
{ id: 'leaderboard', label: 'Rankings' },
```

**Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors (may have pre-existing error at page.tsx:333 — that's not our fault)

**Step 6: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat(web): wire LeaderboardScreen into navigation"
```

---

## Task 10: Add Rankings tab to ArenaScreen

**Files:**
- Modify: `apps/web/src/app/game/screens/ArenaScreen.tsx:40` (ArenaView type), tab rendering, and content

**Step 1: Update ArenaView type**

At line 40, add `'rankings'` to the union:

```ts
type ArenaView = 'ladder' | 'history' | 'notifications' | 'rankings';
```

**Step 2: Add imports**

Add to the imports at top of ArenaScreen.tsx:

```ts
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { getLeaderboard, type LeaderboardResponse } from '@/lib/api';
```

**Step 3: Add state for rankings**

After the existing state declarations (~line 50), add:

```ts
const [rankingsData, setRankingsData] = useState<LeaderboardResponse | null>(null);
const [rankingsLoading, setRankingsLoading] = useState(false);
const [rankingsAroundMe, setRankingsAroundMe] = useState(false);
```

**Step 4: Add effect to load PvP ranking data**

Add an effect that loads when the rankings tab is active:

```ts
useEffect(() => {
  if (activeView !== 'rankings') return;
  setRankingsLoading(true);
  void getLeaderboard('pvp_rating', rankingsAroundMe).then((res) => {
    if (res.data) setRankingsData(res.data);
    setRankingsLoading(false);
  });
}, [activeView, rankingsAroundMe]);
```

**Step 5: Add the rankings tab button**

In the tab buttons rendering section, add the Rankings tab alongside the existing ones. The tabs use icons from lucide-react — use `Trophy` (already imported on line 26).

Add to the tabs array:
```ts
{ id: 'rankings', label: 'Rankings', icon: Trophy }
```

**Step 6: Add rankings view content**

In the conditional content rendering (where `activeView === 'ladder'`, `activeView === 'history'`, etc.), add:

```tsx
{activeView === 'rankings' && (
  <PixelCard>
    <LeaderboardTable
      entries={rankingsData?.entries ?? []}
      myRank={rankingsData?.myRank ?? null}
      currentPlayerId={playerId}
      loading={rankingsLoading}
      totalPlayers={rankingsData?.totalPlayers ?? 0}
      lastRefreshedAt={rankingsData?.lastRefreshedAt ?? null}
      showAroundMe={rankingsAroundMe}
      onToggleAroundMe={() => setRankingsAroundMe((v) => !v)}
    />
    {onNavigate && (
      <button
        onClick={() => onNavigate('leaderboard')}
        className="w-full mt-3 py-2 text-sm text-[var(--rpg-gold)] hover:text-[var(--rpg-gold)]/80 transition-colors"
      >
        View All Leaderboards →
      </button>
    )}
  </PixelCard>
)}
```

**Step 7: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors

**Step 8: Test visually**

Run: `npm run dev`
Navigate to Arena → Rankings tab. Should show PvP rating leaderboard with "View All Leaderboards" link.

**Step 9: Commit**

```bash
git add apps/web/src/app/game/screens/ArenaScreen.tsx
git commit -m "feat(web): add Rankings tab to ArenaScreen with PvP leaderboard"
```

---

## Task 11: Manual end-to-end testing

**Step 1: Start full stack**

```bash
docker-compose up -d  # Postgres + Redis
npm run dev
```

**Step 2: Verify API**

```bash
# Categories endpoint
curl http://localhost:4000/api/v1/leaderboard/categories | jq .

# Character level leaderboard (unauthenticated — no myRank)
curl http://localhost:4000/api/v1/leaderboard/character_level | jq .

# PvP rating leaderboard
curl http://localhost:4000/api/v1/leaderboard/pvp_rating | jq .

# Skill leaderboard
curl http://localhost:4000/api/v1/leaderboard/skill_melee | jq .

# Invalid category returns error
curl http://localhost:4000/api/v1/leaderboard/invalid_thing | jq .
```

**Step 3: Verify Frontend**

1. Log in to the game
2. Navigate to Dashboard → Rankings sub-tab → should show full leaderboard screen
3. Switch between group tabs (PvP, Progression, Skills, Combat)
4. Change category dropdown within Skills group
5. Verify "Your rank" pinned bar appears at bottom
6. Click "View My Rank" → should show surrounding players
7. Click "Back to Top" → should return to top 25
8. Navigate to Combat → Arena → Rankings tab → should show PvP leaderboard
9. Click "View All Leaderboards →" → should navigate to full leaderboard screen
10. Verify bot players show bot icon

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address leaderboard testing findings"
```
