# Public Rankings And Crowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/rankings` experience with a dedicated lifetime Crowns tab and a cache-only landing-page rankings preview.

**Architecture:** Add a crown collector snapshot service that stores ordered lifetime crown rows in Redis and strips player IDs at the route boundary. Add public leaderboard summary reads that are cache-only so homepage visits do not refresh all leaderboards or wake Neon. Reuse existing leaderboard APIs/components where practical, extending them for weekly mode and logged-in `myRank` behavior.

**Tech Stack:** Next.js 16 App Router, React 18, Express 4, Prisma 6, Redis sorted sets/JSON snapshots, Vitest, Testing Library, Tailwind CSS.

**Design doc:** `docs/superpowers/specs/2026-04-24-public-rankings-crowns-design.md`

---

## File Structure

Backend files:

- Create `apps/api/src/services/crownLeaderboardService.ts`: lifetime crown collector snapshot, public sanitization, `myRank`, `around_me`, invalidation.
- Create `apps/api/src/services/crownLeaderboardService.test.ts`: snapshot ranking, privacy, authenticated `myRank`, `around_me`.
- Create `apps/api/src/services/publicLeaderboardSummaryService.ts`: cache-only landing summary using Redis crown snapshot and weekly leaderboard delta keys.
- Create `apps/api/src/services/publicLeaderboardSummaryService.test.ts`: verifies cache-only reads and empty fallback behavior.
- Modify `apps/api/src/services/leaderboardService.ts`: export safe category labels and the last-refresh key for cache-only public summary reads.
- Modify `apps/api/src/routes/leaderboard.ts`: add `GET /crowns` and `GET /public-summary` before existing parameterized routes.
- Modify `apps/api/src/routes/leaderboard.seasons.test.ts`: add route coverage for crowns/public summary privacy and route ordering.
- Modify `apps/api/src/jobs/weeklyLeaderboardJob.ts`: refresh crown collector snapshot after weekly crown awards.
- Modify `apps/api/src/services/seasonMergeService.ts`: invalidate the crown collector snapshot when transferred crowns change lifetime collector totals.

Frontend files:

- Modify `apps/web/src/lib/api/social.ts`: add crown collector/public summary types and API functions; add `period` support to `getLeaderboard`.
- Modify `apps/web/src/lib/api/index.ts`: export new API functions and types.
- Create `apps/web/src/components/rankings/CrownChips.tsx`: compact gold/silver/bronze/total display.
- Create `apps/web/src/components/rankings/CrownCollectorsTable.tsx`: dedicated lifetime crowns table with pinned `myRank`.
- Create `apps/web/src/components/rankings/RankingsTabs.tsx`: public rankings tab control.
- Create `apps/web/src/components/rankings/PublicRankings.tsx`: client controller for `/rankings`.
- Create `apps/web/src/components/rankings/LandingRankingsPreview.tsx`: landing page cache-only preview.
- Create focused tests beside the new components.
- Create `apps/web/src/app/rankings/page.tsx`: public route wrapper.
- Create `apps/web/src/app/rankings/page.test.tsx`: route smoke test.
- Modify `apps/web/src/app/page.tsx`: replace fake Champion preview with `LandingRankingsPreview` and add `/rankings` link in the hero/action area.
- Modify `apps/web/src/app/page.test.ts`: assert live rankings preview is used.
- Modify `apps/web/src/components/leaderboard/LeaderboardTable.tsx`: render optional crown chips for rows and keep existing `myRank` behavior.
- Modify `apps/web/src/components/screens/Leaderboard.tsx`: pass `period='weekly'` only where needed if the in-game screen adds weekly support; otherwise leave existing all-time behavior intact.

---

## Task 1: Backend Crown Collector Snapshot Service

**Files:**

- Create: `apps/api/src/services/crownLeaderboardService.ts`
- Test: `apps/api/src/services/crownLeaderboardService.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/services/crownLeaderboardService.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    playerCrown: {
      findMany: vi.fn(),
    },
  },
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('../redis', () => ({ redis: mocks.redis }));

import {
  getCachedCrownCollectorRows,
  getCrownCollectorLeaderboard,
  invalidateCrownCollectorSnapshot,
  rebuildCrownCollectorSnapshot,
} from './crownLeaderboardService';

describe('crownLeaderboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.del.mockResolvedValue(1);
    mocks.redis.eval.mockResolvedValue(1);
  });

  it('ranks lifetime crown collectors by total, then gold, silver, bronze, then username', async () => {
    mocks.prisma.playerCrown.findMany.mockResolvedValue([
      crown('p2', 'Beryl', 30, 'pvp_wins', 1),
      crown('p2', 'Beryl', 30, 'total_kills', 3),
      crown('p1', 'Arden', 44, 'pvp_wins', 1),
      crown('p1', 'Arden', 44, 'skill_alchemy', 2),
      crown('p3', 'Cyra', 20, 'casino_profit', 1),
      crown('p3', 'Cyra', 20, 'character_xp', 2),
    ]);

    const snapshot = await rebuildCrownCollectorSnapshot();

    expect(snapshot.entries.map((entry) => ({
      playerId: entry.playerId,
      rank: entry.rank,
      crowns: entry.crowns,
    }))).toEqual([
      { playerId: 'p1', rank: 1, crowns: { gold: 1, silver: 1, bronze: 0, total: 2 } },
      { playerId: 'p3', rank: 2, crowns: { gold: 1, silver: 1, bronze: 0, total: 2 } },
      { playerId: 'p2', rank: 3, crowns: { gold: 1, silver: 0, bronze: 1, total: 2 } },
    ]);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'leaderboard:crowns:lifetime:snapshot',
      expect.stringContaining('"totalPlayers":3'),
    );
  });

  it('strips player IDs from public entries while preserving authenticated myRank', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify({
      entries: [
        collector('p1', 1, 'Arden', { gold: 3, silver: 0, bronze: 0, total: 3 }),
        collector('p2', 2, 'Beryl', { gold: 1, silver: 1, bronze: 0, total: 2 }),
        collector('p3', 3, 'Cyra', { gold: 0, silver: 1, bronze: 0, total: 1 }),
      ],
      totalPlayers: 3,
      lastRefreshedAt: '2026-04-24T12:00:00.000Z',
    }));

    const result = await getCrownCollectorLeaderboard('p3', false, 2);

    expect(result.entries).toEqual([
      {
        rank: 1,
        username: 'Arden',
        characterLevel: 44,
        crowns: { gold: 3, silver: 0, bronze: 0, total: 3 },
        topGroups: [{ group: 'pvp', count: 3 }],
      },
      {
        rank: 2,
        username: 'Beryl',
        characterLevel: 30,
        crowns: { gold: 1, silver: 1, bronze: 0, total: 2 },
        topGroups: [{ group: 'combat', count: 2 }],
      },
    ]);
    expect(result.entries[0]).not.toHaveProperty('playerId');
    expect(result.myRank).toEqual({
      rank: 3,
      username: 'Cyra',
      characterLevel: 20,
      crowns: { gold: 0, silver: 1, bronze: 0, total: 1 },
      topGroups: [{ group: 'casino', count: 1 }],
    });
  });

  it('centers around the authenticated player when around_me is requested', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify({
      entries: [
        collector('p1', 1, 'Arden', { gold: 5, silver: 0, bronze: 0, total: 5 }),
        collector('p2', 2, 'Beryl', { gold: 4, silver: 0, bronze: 0, total: 4 }),
        collector('p3', 3, 'Cyra', { gold: 3, silver: 0, bronze: 0, total: 3 }),
        collector('p4', 4, 'Dax', { gold: 2, silver: 0, bronze: 0, total: 2 }),
        collector('p5', 5, 'Eira', { gold: 1, silver: 0, bronze: 0, total: 1 }),
      ],
      totalPlayers: 5,
      lastRefreshedAt: '2026-04-24T12:00:00.000Z',
    }));

    const result = await getCrownCollectorLeaderboard('p4', true, 3);

    expect(result.entries.map((entry) => entry.username)).toEqual(['Cyra', 'Dax', 'Eira']);
    expect(result.myRank?.rank).toBe(4);
  });

  it('returns empty cached preview rows without rebuilding when snapshot is missing', async () => {
    mocks.redis.get.mockResolvedValue(null);

    const rows = await getCachedCrownCollectorRows(3);

    expect(rows).toEqual([]);
    expect(mocks.prisma.playerCrown.findMany).not.toHaveBeenCalled();
  });

  it('invalidates the Redis snapshot key', async () => {
    await invalidateCrownCollectorSnapshot();

    expect(mocks.redis.del).toHaveBeenCalledWith('leaderboard:crowns:lifetime:snapshot');
  });
});

function crown(playerId: string, username: string, characterLevel: number, category: string, rank: number) {
  return {
    playerId,
    category,
    rank,
    player: {
      username,
      characterLevel,
      isBot: false,
      activeTitle: null,
      account: { role: 'player' },
    },
  };
}

function collector(
  playerId: string,
  rank: number,
  username: string,
  crowns: { gold: number; silver: number; bronze: number; total: number },
) {
  return {
    playerId,
    rank,
    username,
    characterLevel: username === 'Arden' ? 44 : username === 'Beryl' ? 30 : username === 'Cyra' ? 20 : 10,
    crowns,
    topGroups: [
      {
        group: username === 'Arden' ? 'pvp' : username === 'Beryl' ? 'combat' : 'casino',
        count: crowns.total,
      },
    ],
  };
}
```

- [ ] **Step 2: Run the failing service tests**

Run:

```powershell
npm run test:api -- --run src/services/crownLeaderboardService.test.ts
```

Expected: fails because `./crownLeaderboardService` does not exist.

- [ ] **Step 3: Implement the crown collector service**

Create `apps/api/src/services/crownLeaderboardService.ts`:

```ts
import { randomUUID } from 'crypto';
import { prisma } from '@pocketrealm/database';
import { CROWN_CONSTANTS, LEADERBOARD_CONSTANTS, resolveAchievementTitleDisplay } from '@pocketrealm/shared';
import type { TitleStyleVariant } from '@pocketrealm/shared';
import { redis } from '../redis';

const SNAPSHOT_KEY = 'leaderboard:crowns:lifetime:snapshot';
const LOCK_KEY = 'leaderboard:crowns:lifetime:refresh_lock';
const LOCK_TTL_MS = 30_000;
const RELEASE_LOCK_LUA = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export interface CrownRankBreakdown {
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface CrownCollectorEntry {
  rank: number;
  username: string;
  characterLevel: number;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns: CrownRankBreakdown;
  topGroups: Array<{ group: string; count: number }>;
}

export interface CrownCollectorResponse {
  entries: CrownCollectorEntry[];
  myRank: CrownCollectorEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

export interface CrownCollectorSnapshotEntry extends CrownCollectorEntry {
  playerId: string;
}

export interface CrownCollectorSnapshot {
  entries: CrownCollectorSnapshotEntry[];
  totalPlayers: number;
  lastRefreshedAt: string;
}

type CrownGroup = keyof typeof CROWN_CONSTANTS.CATEGORY_GROUPS;

interface CollectorAccumulator {
  playerId: string;
  username: string;
  characterLevel: number;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns: CrownRankBreakdown;
  groupCounts: Map<string, number>;
}

function crownGroupForCategory(category: string): CrownGroup | null {
  for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
    if (CROWN_CONSTANTS.CATEGORY_GROUPS[group].includes(category)) {
      return group;
    }
  }

  return null;
}

function emptyCrowns(): CrownRankBreakdown {
  return { gold: 0, silver: 0, bronze: 0, total: 0 };
}

function countRank(crowns: CrownRankBreakdown, rank: number): void {
  crowns.total++;
  if (rank === CROWN_CONSTANTS.GOLD) crowns.gold++;
  if (rank === CROWN_CONSTANTS.SILVER) crowns.silver++;
  if (rank === CROWN_CONSTANTS.BRONZE) crowns.bronze++;
}

function compareCollectors(left: CollectorAccumulator, right: CollectorAccumulator): number {
  return (
    right.crowns.total - left.crowns.total ||
    right.crowns.gold - left.crowns.gold ||
    right.crowns.silver - left.crowns.silver ||
    right.crowns.bronze - left.crowns.bronze ||
    left.username.localeCompare(right.username)
  );
}

function topGroups(groupCounts: Map<string, number>): Array<{ group: string; count: number }> {
  return [...groupCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([group, count]) => ({ group, count }));
}

function stripPlayerId(entry: CrownCollectorSnapshotEntry): CrownCollectorEntry {
  const { playerId: _playerId, ...publicEntry } = entry;
  return publicEntry;
}

function parseSnapshot(raw: string | null): CrownCollectorSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CrownCollectorSnapshot;
    if (!Array.isArray(parsed.entries) || typeof parsed.totalPlayers !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function pageAroundRank(
  entries: CrownCollectorSnapshotEntry[],
  playerId: string | undefined,
  aroundMe: boolean,
  limit: number,
): CrownCollectorSnapshotEntry[] {
  if (!aroundMe || !playerId) {
    return entries.slice(0, limit);
  }

  const index = entries.findIndex((entry) => entry.playerId === playerId);
  if (index < 0) {
    return entries.slice(0, limit);
  }

  const half = Math.floor(limit / 2);
  const start = Math.max(0, Math.min(index - half, Math.max(entries.length - limit, 0)));
  return entries.slice(start, start + limit);
}

export async function rebuildCrownCollectorSnapshot(): Promise<CrownCollectorSnapshot> {
  const crowns = await prisma.playerCrown.findMany({
    select: {
      playerId: true,
      category: true,
      rank: true,
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
  });

  const collectors = new Map<string, CollectorAccumulator>();
  for (const crown of crowns) {
    if (crown.player.isBot) continue;

    const existing = collectors.get(crown.playerId) ?? {
      playerId: crown.playerId,
      username: crown.player.username,
      characterLevel: crown.player.characterLevel,
      ...resolveAchievementTitleDisplay(crown.player.activeTitle),
      crowns: emptyCrowns(),
      groupCounts: new Map<string, number>(),
    };

    countRank(existing.crowns, crown.rank);
    const group = crownGroupForCategory(crown.category);
    if (group) {
      existing.groupCounts.set(group, (existing.groupCounts.get(group) ?? 0) + 1);
    }
    collectors.set(crown.playerId, existing);
  }

  const entries = [...collectors.values()]
    .sort(compareCollectors)
    .map((collector, index) => ({
      playerId: collector.playerId,
      rank: index + 1,
      username: collector.username,
      characterLevel: collector.characterLevel,
      title: collector.title,
      titleTier: collector.titleTier,
      titleStyle: collector.titleStyle,
      crowns: collector.crowns,
      topGroups: topGroups(collector.groupCounts),
    }));

  const snapshot: CrownCollectorSnapshot = {
    entries,
    totalPlayers: entries.length,
    lastRefreshedAt: new Date().toISOString(),
  };

  await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

async function readSnapshot(): Promise<CrownCollectorSnapshot | null> {
  return parseSnapshot(await redis.get(SNAPSHOT_KEY));
}

async function readOrRebuildSnapshot(): Promise<CrownCollectorSnapshot> {
  const existing = await readSnapshot();
  if (existing) {
    return existing;
  }

  const lockToken = randomUUID();
  const acquired = await redis.set(LOCK_KEY, lockToken, 'PX', LOCK_TTL_MS, 'NX');
  if (acquired) {
    try {
      return await rebuildCrownCollectorSnapshot();
    } finally {
      await redis.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, lockToken);
    }
  }

  return {
    entries: [],
    totalPlayers: 0,
    lastRefreshedAt: new Date(0).toISOString(),
  };
}

export async function getCrownCollectorLeaderboard(
  playerId?: string,
  aroundMe = false,
  limit = LEADERBOARD_CONSTANTS.PAGE_SIZE,
): Promise<CrownCollectorResponse> {
  const pageSize = Math.max(1, Math.min(limit, LEADERBOARD_CONSTANTS.PAGE_SIZE));
  const snapshot = await readOrRebuildSnapshot();
  const myRank = playerId
    ? snapshot.entries.find((entry) => entry.playerId === playerId) ?? null
    : null;

  return {
    entries: pageAroundRank(snapshot.entries, playerId, aroundMe, pageSize).map(stripPlayerId),
    myRank: myRank ? stripPlayerId(myRank) : null,
    totalPlayers: snapshot.totalPlayers,
    lastRefreshedAt: snapshot.lastRefreshedAt,
  };
}

export async function getCachedCrownCollectorRows(limit: number): Promise<CrownCollectorEntry[]> {
  const snapshot = await readSnapshot();
  return snapshot?.entries.slice(0, limit).map(stripPlayerId) ?? [];
}

export async function invalidateCrownCollectorSnapshot(): Promise<void> {
  await redis.del(SNAPSHOT_KEY);
}
```

- [ ] **Step 4: Run the service tests**

Run:

```powershell
npm run test:api -- --run src/services/crownLeaderboardService.test.ts
```

Expected: all tests in `crownLeaderboardService.test.ts` pass.

- [ ] **Step 5: Commit backend crown collector service**

Run:

```powershell
git add apps/api/src/services/crownLeaderboardService.ts apps/api/src/services/crownLeaderboardService.test.ts
git commit -m "feat(api): add crown collector snapshot service"
```

---

## Task 2: Cache-Only Public Summary Service

**Files:**

- Modify: `apps/api/src/services/leaderboardService.ts`
- Create: `apps/api/src/services/publicLeaderboardSummaryService.ts`
- Test: `apps/api/src/services/publicLeaderboardSummaryService.test.ts`

- [ ] **Step 1: Write failing public summary tests**

Create `apps/api/src/services/publicLeaderboardSummaryService.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    zrevrange: vi.fn(),
    hmget: vi.fn(),
  },
  getCachedCrownCollectorRows: vi.fn(),
}));

vi.mock('../redis', () => ({ redis: mocks.redis }));
vi.mock('./crownLeaderboardService', () => ({
  getCachedCrownCollectorRows: mocks.getCachedCrownCollectorRows,
}));
vi.mock('./leaderboardService', () => ({
  LEADERBOARD_LAST_REFRESH_KEY: 'leaderboard:last_refresh',
  getCategoryLabel: (category: string) => ({
    character_xp: 'Character XP',
    total_kills: 'Total Kills',
    pvp_rating: 'PvP Rating',
    casino_profit: 'Casino Profit',
  })[category] ?? null,
}));

import { getPublicLeaderboardSummary } from './publicLeaderboardSummaryService';

describe('publicLeaderboardSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedCrownCollectorRows.mockResolvedValue([
      {
        rank: 1,
        username: 'Arden',
        characterLevel: 44,
        crowns: { gold: 3, silver: 1, bronze: 0, total: 4 },
        topGroups: [{ group: 'pvp', count: 4 }],
      },
    ]);
    mocks.redis.get.mockResolvedValue('2026-04-24T12:00:00.000Z');
  });

  it('reads weekly leaders from Redis only and includes cached crown collectors', async () => {
    mocks.redis.zrevrange
      .mockResolvedValueOnce(['p1', '2500'])
      .mockResolvedValueOnce(['p2', '120'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['p3', '900']);
    mocks.redis.hmget
      .mockResolvedValueOnce([JSON.stringify({ username: 'XP Hero', characterLevel: 12 })])
      .mockResolvedValueOnce([JSON.stringify({ username: 'Slayer', characterLevel: 20 })])
      .mockResolvedValueOnce([JSON.stringify({ username: 'Lucky', characterLevel: 8 })]);

    const result = await getPublicLeaderboardSummary();

    expect(mocks.getCachedCrownCollectorRows).toHaveBeenCalledWith(3);
    expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
      'leaderboard:weekly_delta:permanent:character_xp',
      0,
      0,
      'WITHSCORES',
    );
    expect(result.crownCollectors[0].username).toBe('Arden');
    expect(result.weeklyLeaders).toEqual([
      {
        category: 'character_xp',
        label: 'Character XP',
        rank: 1,
        username: 'XP Hero',
        characterLevel: 12,
        score: 2500,
      },
      {
        category: 'total_kills',
        label: 'Total Kills',
        rank: 1,
        username: 'Slayer',
        characterLevel: 20,
        score: 120,
      },
      {
        category: 'casino_profit',
        label: 'Casino Profit',
        rank: 1,
        username: 'Lucky',
        characterLevel: 8,
        score: 900,
      },
    ]);
    expect(result.lastRefreshedAt).toBe('2026-04-24T12:00:00.000Z');
  });

  it('returns empty arrays when Redis snapshots are missing', async () => {
    mocks.getCachedCrownCollectorRows.mockResolvedValue([]);
    mocks.redis.zrevrange.mockResolvedValue([]);
    mocks.redis.hmget.mockResolvedValue([]);
    mocks.redis.get.mockResolvedValue(null);

    const result = await getPublicLeaderboardSummary();

    expect(result).toEqual({
      crownCollectors: [],
      weeklyLeaders: [],
      lastRefreshedAt: null,
    });
  });
});
```

- [ ] **Step 2: Run the failing summary tests**

Run:

```powershell
npm run test:api -- --run src/services/publicLeaderboardSummaryService.test.ts
```

Expected: fails because `publicLeaderboardSummaryService` and cache-only helpers do not exist.

- [ ] **Step 3: Add cache-only exports to `leaderboardService.ts`**

In `apps/api/src/services/leaderboardService.ts`, export the last refresh key and add label lookup near the category definitions:

```ts
export const LEADERBOARD_LAST_REFRESH_KEY = 'leaderboard:last_refresh';
const LAST_REFRESH_KEY = LEADERBOARD_LAST_REFRESH_KEY;
```

Add after `const VALID_SLUGS = new Set(ALL_CATEGORIES.map((c) => c.slug));`:

```ts
export function getCategoryLabel(category: string): string | null {
  return ALL_CATEGORIES.find((entry) => entry.slug === category)?.label ?? null;
}
```

Do not change `getLeaderboard()` refresh behavior in this task.

- [ ] **Step 4: Implement the public summary service**

Create `apps/api/src/services/publicLeaderboardSummaryService.ts`:

```ts
import { redis } from '../redis';
import { leaderboardMetaKey, leaderboardWeeklyDeltaKey } from './leaderboardKeys';
import { getCachedCrownCollectorRows, type CrownCollectorEntry } from './crownLeaderboardService';
import { getCategoryLabel, LEADERBOARD_LAST_REFRESH_KEY } from './leaderboardService';

const SUMMARY_CATEGORIES = ['character_xp', 'total_kills', 'pvp_rating', 'casino_profit'] as const;
const SUMMARY_LIMIT = 3;

export interface PublicSummaryWeeklyLeader {
  category: string;
  label: string;
  rank: number;
  username: string;
  characterLevel: number;
  score: number;
}

export interface PublicLeaderboardSummary {
  crownCollectors: CrownCollectorEntry[];
  weeklyLeaders: PublicSummaryWeeklyLeader[];
  lastRefreshedAt: string | null;
}

function parseMeta(raw: unknown): { username: string; characterLevel: number } | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { username?: unknown; characterLevel?: unknown };
    if (typeof parsed.username !== 'string' || typeof parsed.characterLevel !== 'number') {
      return null;
    }
    return { username: parsed.username, characterLevel: parsed.characterLevel };
  } catch {
    return null;
  }
}

async function readWeeklyLeader(category: string): Promise<PublicSummaryWeeklyLeader | null> {
  const raw = await redis.zrevrange(
    leaderboardWeeklyDeltaKey(category, null),
    0,
    0,
    'WITHSCORES',
  );
  const playerId = raw[0];
  const score = raw[1];
  if (!playerId || score === undefined) {
    return null;
  }

  const [metaRaw] = await redis.hmget(leaderboardMetaKey(category, null), playerId);
  const meta = parseMeta(metaRaw);
  const label = getCategoryLabel(category);
  if (!meta || !label) {
    return null;
  }

  return {
    category,
    label,
    rank: 1,
    username: meta.username,
    characterLevel: meta.characterLevel,
    score: Number(score),
  };
}

export async function getPublicLeaderboardSummary(): Promise<PublicLeaderboardSummary> {
  const [crownCollectors, weeklyResults, lastRefreshedAt] = await Promise.all([
    getCachedCrownCollectorRows(SUMMARY_LIMIT),
    Promise.all(SUMMARY_CATEGORIES.map((category) => readWeeklyLeader(category))),
    redis.get(LEADERBOARD_LAST_REFRESH_KEY),
  ]);

  return {
    crownCollectors,
    weeklyLeaders: weeklyResults.filter((entry): entry is PublicSummaryWeeklyLeader => entry !== null),
    lastRefreshedAt,
  };
}
```

- [ ] **Step 5: Run the summary tests**

Run:

```powershell
npm run test:api -- --run src/services/publicLeaderboardSummaryService.test.ts
```

Expected: all tests in `publicLeaderboardSummaryService.test.ts` pass.

- [ ] **Step 6: Commit public summary service**

Run:

```powershell
git add apps/api/src/services/leaderboardService.ts apps/api/src/services/publicLeaderboardSummaryService.ts apps/api/src/services/publicLeaderboardSummaryService.test.ts
git commit -m "feat(api): add cache-only public leaderboard summary"
```

---

## Task 3: Leaderboard Routes For Crowns And Public Summary

**Files:**

- Modify: `apps/api/src/routes/leaderboard.ts`
- Modify: `apps/api/src/routes/leaderboard.seasons.test.ts`

- [ ] **Step 1: Extend the route test mocks**

In `apps/api/src/routes/leaderboard.seasons.test.ts`, extend the hoisted mock object:

```ts
getCrownCollectorLeaderboard: vi.fn(),
getPublicLeaderboardSummary: vi.fn(),
```

Add module mocks:

```ts
vi.mock('../services/crownLeaderboardService', () => ({
  getCrownCollectorLeaderboard: mocks.getCrownCollectorLeaderboard,
}));

vi.mock('../services/publicLeaderboardSummaryService', () => ({
  getPublicLeaderboardSummary: mocks.getPublicLeaderboardSummary,
}));
```

In `beforeEach`, add:

```ts
mocks.getCrownCollectorLeaderboard.mockResolvedValue({
  entries: [],
  myRank: null,
  totalPlayers: 0,
  lastRefreshedAt: null,
});
mocks.getPublicLeaderboardSummary.mockResolvedValue({
  crownCollectors: [],
  weeklyLeaders: [],
  lastRefreshedAt: null,
});
```

- [ ] **Step 2: Add failing route tests**

Append these tests to `leaderboard.seasons.test.ts`:

```ts
it('returns lifetime crown collectors before player crown collection routing', async () => {
  mocks.getCrownCollectorLeaderboard.mockResolvedValue({
    entries: [
      {
        rank: 1,
        username: 'Arden',
        characterLevel: 44,
        crowns: { gold: 3, silver: 1, bronze: 0, total: 4 },
        topGroups: [{ group: 'pvp', count: 4 }],
      },
    ],
    myRank: null,
    totalPlayers: 1,
    lastRefreshedAt: '2026-04-24T12:00:00.000Z',
  });

  const res = await request(buildApp())
    .get('/api/v1/leaderboard/crowns?limit=5');

  expect(res.status).toBe(200);
  expect(mocks.getCrownCollectorLeaderboard).toHaveBeenCalledWith(undefined, false, 5);
  expect(mocks.getPlayerCrownCollection).not.toHaveBeenCalled();
  expect(res.body.entries[0]).not.toHaveProperty('playerId');
  expect(res.body.entries[0].username).toBe('Arden');
});

it('passes authenticated player and around_me to crown collectors', async () => {
  const res = await request(buildApp())
    .get('/api/v1/leaderboard/crowns?around_me=true')
    .set('x-player-season-id', 'season-2');

  expect(res.status).toBe(200);
  expect(mocks.getCrownCollectorLeaderboard).toHaveBeenCalledWith('player-1', true, undefined);
});

it('returns the cache-only public leaderboard summary', async () => {
  mocks.getPublicLeaderboardSummary.mockResolvedValue({
    crownCollectors: [
      {
        rank: 1,
        username: 'Arden',
        characterLevel: 44,
        crowns: { gold: 3, silver: 1, bronze: 0, total: 4 },
        topGroups: [{ group: 'pvp', count: 4 }],
      },
    ],
    weeklyLeaders: [
      {
        category: 'character_xp',
        label: 'Character XP',
        rank: 1,
        username: 'XP Hero',
        characterLevel: 12,
        score: 2500,
      },
    ],
    lastRefreshedAt: '2026-04-24T12:00:00.000Z',
  });

  const res = await request(buildApp())
    .get('/api/v1/leaderboard/public-summary');

  expect(res.status).toBe(200);
  expect(mocks.getPublicLeaderboardSummary).toHaveBeenCalledOnce();
  expect(mocks.getLeaderboard).not.toHaveBeenCalled();
  expect(res.body.crownCollectors[0].username).toBe('Arden');
});
```

- [ ] **Step 3: Run the failing route tests**

Run:

```powershell
npm run test:api -- --run src/routes/leaderboard.seasons.test.ts
```

Expected: new route tests fail because the route does not call the new services yet.

- [ ] **Step 4: Implement route handlers in the correct order**

Modify imports in `apps/api/src/routes/leaderboard.ts`:

```ts
import { getCrownCollectorLeaderboard } from '../services/crownLeaderboardService';
import { getPublicLeaderboardSummary } from '../services/publicLeaderboardSummaryService';
```

Add helper near the top:

```ts
function optionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
```

Add these routes before `leaderboardRouter.get('/crowns/:playerId', ...)` and before `leaderboardRouter.get('/:category', ...)`:

```ts
leaderboardRouter.get('/crowns', asyncHandler(async (req, res) => {
  const result = await getCrownCollectorLeaderboard(
    req.player?.playerId,
    req.query.around_me === 'true',
    optionalPositiveInt(req.query.limit),
  );
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PRIVATE_SHORT);
  res.json(result);
}));

leaderboardRouter.get('/public-summary', asyncHandler(async (_req, res) => {
  const result = await getPublicLeaderboardSummary();
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
  res.json(result);
}));
```

- [ ] **Step 5: Run route tests**

Run:

```powershell
npm run test:api -- --run src/routes/leaderboard.seasons.test.ts
```

Expected: all route tests pass.

- [ ] **Step 6: Commit route endpoints**

Run:

```powershell
git add apps/api/src/routes/leaderboard.ts apps/api/src/routes/leaderboard.seasons.test.ts
git commit -m "feat(api): expose public crown rankings endpoints"
```

---

## Task 4: Snapshot Refresh Integration

**Files:**

- Modify: `apps/api/src/jobs/weeklyLeaderboardJob.ts`
- Modify: `apps/api/src/services/seasonMergeService.ts`
- Modify: `apps/api/src/jobs/weeklyLeaderboardJob.test.ts`
- Modify: `apps/api/src/services/seasonMergeService.test.ts`

- [ ] **Step 1: Add failing weekly job test coverage**

In `apps/api/src/jobs/weeklyLeaderboardJob.test.ts`, mock `rebuildCrownCollectorSnapshot` from `../services/crownLeaderboardService`:

```ts
rebuildCrownCollectorSnapshot: vi.fn().mockResolvedValue({
  entries: [],
  totalPlayers: 0,
  lastRefreshedAt: '2026-04-24T12:00:00.000Z',
}),
```

Add the mock module:

```ts
vi.mock('../services/crownLeaderboardService', () => ({
  rebuildCrownCollectorSnapshot: mocks.rebuildCrownCollectorSnapshot,
}));
```

Add an assertion in the successful weekly job test:

```ts
expect(mocks.rebuildCrownCollectorSnapshot).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Add failing season merge invalidation coverage**

In `apps/api/src/services/seasonMergeService.test.ts`, add to the hoisted mocks:

```ts
invalidateCrownCollectorSnapshot: vi.fn().mockResolvedValue(undefined),
```

Add this mock after the existing `leaderboardService` mock:

```ts
vi.mock('./crownLeaderboardService', () => ({
  invalidateCrownCollectorSnapshot: mocks.invalidateCrownCollectorSnapshot,
}));
```

In the existing test named `transfers seasonal crowns to the permanent player before deletion`, add this assertion after the `playerCrown.createMany` assertion:

```ts
expect(mocks.invalidateCrownCollectorSnapshot).toHaveBeenCalledOnce();
```

In the existing test named `merges transferable data and folds seasonal skill xp into the permanent player inside the transaction`, add:

```ts
expect(mocks.invalidateCrownCollectorSnapshot).not.toHaveBeenCalled();
```

- [ ] **Step 3: Run failing integration tests**

Run:

```powershell
npm run test:api -- --run src/jobs/weeklyLeaderboardJob.test.ts src/services/seasonMergeService.test.ts
```

Expected: tests fail because the job and merge service do not call the crown snapshot service yet.

- [ ] **Step 4: Refresh snapshot after weekly crown awards**

Modify `apps/api/src/jobs/weeklyLeaderboardJob.ts` imports:

```ts
import { rebuildCrownCollectorSnapshot } from '../services/crownLeaderboardService';
```

After the loops that award crowns and snapshot realms, before the system message block, add:

```ts
if (crownCount > 0) {
  await rebuildCrownCollectorSnapshot();
}
```

This keeps the landing/public crown cache fresh after weekly awards without adding a new interval.

- [ ] **Step 5: Invalidate snapshot after season merges move crowns**

Modify `apps/api/src/services/seasonMergeService.ts` imports:

```ts
import { invalidateCrownCollectorSnapshot } from './crownLeaderboardService';
```

Change `mergeSeasonalPlayer()` to invalidate after the transaction if crowns moved:

```ts
export async function mergeSeasonalPlayer(
  seasonalPlayerId: string,
  permanentPlayerId: string,
  seasonId: string,
): Promise<MergeLog> {
  const log = await prisma.$transaction((tx) => mergeSeasonalPlayerTx(tx, seasonalPlayerId, permanentPlayerId, seasonId));
  if (log.crowns.merged > 0) {
    await invalidateCrownCollectorSnapshot();
  }
  return log;
}
```

Inside `runSeasonMerge()`, track crown movement:

```ts
let merged = 0;
let crownCollectorsChanged = false;
const errors: string[] = [];
```

After `const mergeLog = await mergeSeasonalPlayerTx(...)`, add:

```ts
if (mergeLog.crowns.merged > 0) {
  crownCollectorsChanged = true;
}
```

After the archive/cache refresh block and before `return { merged, errors };`, add:

```ts
if (crownCollectorsChanged) {
  await invalidateCrownCollectorSnapshot();
}
```

- [ ] **Step 6: Run integration tests**

Run:

```powershell
npm run test:api -- --run src/jobs/weeklyLeaderboardJob.test.ts src/services/seasonMergeService.test.ts
```

Expected: tests pass.

- [ ] **Step 7: Commit refresh integration**

Run:

```powershell
git add apps/api/src/jobs/weeklyLeaderboardJob.ts apps/api/src/jobs/weeklyLeaderboardJob.test.ts apps/api/src/services/seasonMergeService.ts apps/api/src/services/seasonMergeService.test.ts
git commit -m "feat(api): refresh crown collector snapshots after crown changes"
```

---

## Task 5: Web API Types And Fetchers

**Files:**

- Modify: `apps/web/src/lib/api/social.ts`
- Modify: `apps/web/src/lib/api/index.ts`

- [ ] **Step 1: Add frontend API types and functions**

In `apps/web/src/lib/api/social.ts`, update leaderboard types and fetchers:

```ts
export type LeaderboardPeriod = 'alltime' | 'weekly';

export interface CrownCounts {
  gold: number;
  silver: number;
  bronze: number;
  total?: number;
}

export interface CrownCollectorEntry {
  rank: number;
  username: string;
  characterLevel: number;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns: Required<CrownCounts>;
  topGroups: Array<{ group: string; count: number }>;
}

export interface CrownCollectorsResponse {
  entries: CrownCollectorEntry[];
  myRank: CrownCollectorEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

export interface PublicSummaryWeeklyLeader {
  category: string;
  label: string;
  rank: number;
  username: string;
  characterLevel: number;
  score: number;
}

export interface PublicLeaderboardSummaryResponse {
  crownCollectors: CrownCollectorEntry[];
  weeklyLeaders: PublicSummaryWeeklyLeader[];
  lastRefreshedAt: string | null;
}
```

Extend `LeaderboardEntry`:

```ts
crowns?: CrownCounts;
```

Extend `LeaderboardResponse`:

```ts
period?: LeaderboardPeriod;
```

Change `getLeaderboard` signature and query construction:

```ts
export async function getLeaderboard(
  category: string,
  aroundMe = false,
  seasonId?: string | null,
  period: LeaderboardPeriod = 'alltime',
) {
  const params = new URLSearchParams();
  if (aroundMe) {
    params.set('around_me', 'true');
  }
  if (seasonId) {
    params.set('seasonId', seasonId);
  }
  if (period !== 'alltime') {
    params.set('period', period);
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  return fetchApi<LeaderboardResponse>(`/api/v1/leaderboard/${category}${query}`);
}
```

Add functions:

```ts
export async function getCrownCollectors(aroundMe = false, limit?: number) {
  const params = new URLSearchParams();
  if (aroundMe) {
    params.set('around_me', 'true');
  }
  if (typeof limit === 'number') {
    params.set('limit', String(limit));
  }

  const query = params.size > 0 ? `?${params.toString()}` : '';
  return fetchApi<CrownCollectorsResponse>(`/api/v1/leaderboard/crowns${query}`);
}

export async function getPublicLeaderboardSummary() {
  return fetchApi<PublicLeaderboardSummaryResponse>('/api/v1/leaderboard/public-summary');
}
```

- [ ] **Step 2: Export new API surface**

In `apps/web/src/lib/api/index.ts`, add `getCrownCollectors` and `getPublicLeaderboardSummary` to the social exports:

```ts
getCrownCollectors,
getPublicLeaderboardSummary,
```

Add types to the social type exports:

```ts
LeaderboardPeriod,
CrownCounts,
CrownCollectorEntry,
CrownCollectorsResponse,
PublicSummaryWeeklyLeader,
PublicLeaderboardSummaryResponse,
```

- [ ] **Step 3: Run a focused typecheck**

Run:

```powershell
npm run typecheck
```

Expected: typecheck passes. If failures identify component consumers that are added in Tasks 6-8, record the exact error, continue to the component tasks, and rerun typecheck in Task 9.

- [ ] **Step 4: Commit web API additions**

Run:

```powershell
git add apps/web/src/lib/api/social.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): add public rankings API client"
```

---

## Task 6: Shared Crown UI Components

**Files:**

- Create: `apps/web/src/components/rankings/CrownChips.tsx`
- Create: `apps/web/src/components/rankings/CrownCollectorsTable.tsx`
- Create: `apps/web/src/components/rankings/CrownCollectorsTable.test.tsx`
- Modify: `apps/web/src/components/leaderboard/LeaderboardTable.tsx`

- [ ] **Step 1: Write failing CrownCollectorsTable tests**

Create `apps/web/src/components/rankings/CrownCollectorsTable.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrownCollectorsTable } from './CrownCollectorsTable';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CrownCollectorsTable', () => {
  it('renders crown totals and pinned my rank', () => {
    render(
      <CrownCollectorsTable
        entries={[
          {
            rank: 1,
            username: 'Arden',
            characterLevel: 44,
            crowns: { gold: 3, silver: 1, bronze: 0, total: 4 },
            topGroups: [{ group: 'pvp', count: 4 }],
          },
        ]}
        myRank={{
          rank: 12,
          username: 'Me',
          characterLevel: 19,
          crowns: { gold: 0, silver: 1, bronze: 1, total: 2 },
          topGroups: [{ group: 'crafting', count: 2 }],
        }}
        loading={false}
        totalPlayers={20}
        lastRefreshedAt="2026-04-24T12:00:00.000Z"
        showAroundMe={false}
        onToggleAroundMe={vi.fn()}
      />,
    );

    expect(screen.getByText('20 collectors ranked')).toBeTruthy();
    expect(screen.getByText('Arden')).toBeTruthy();
    expect(screen.getByText('4 crowns')).toBeTruthy();
    expect(screen.getByText('#12')).toBeTruthy();
    expect(screen.getByText('Me')).toBeTruthy();
  });

  it('calls the around-me toggle', () => {
    const onToggleAroundMe = vi.fn();
    render(
      <CrownCollectorsTable
        entries={[]}
        myRank={{
          rank: 12,
          username: 'Me',
          characterLevel: 19,
          crowns: { gold: 0, silver: 1, bronze: 1, total: 2 },
          topGroups: [{ group: 'crafting', count: 2 }],
        }}
        loading={false}
        totalPlayers={20}
        lastRefreshedAt={null}
        showAroundMe={false}
        onToggleAroundMe={onToggleAroundMe}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View My Rank' }));
    expect(onToggleAroundMe).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the failing component test**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/CrownCollectorsTable.test.tsx
```

Expected: fails because `CrownCollectorsTable` does not exist.

- [ ] **Step 3: Create CrownChips**

Create `apps/web/src/components/rankings/CrownChips.tsx`:

```tsx
import type { CrownCounts } from '@/lib/api';

interface CrownChipsProps {
  crowns: CrownCounts;
  compact?: boolean;
}

export function CrownChips({ crowns, compact = false }: CrownChipsProps) {
  const total = crowns.total ?? crowns.gold + crowns.silver + crowns.bronze;
  const chipClass = compact
    ? 'rounded border border-[var(--rpg-border)] px-1.5 py-0.5 text-[10px]'
    : 'rounded border border-[var(--rpg-border)] px-2 py-1 text-xs';

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <span className={`${chipClass} text-[var(--rpg-gold)]`}>G {crowns.gold}</span>
      <span className={`${chipClass} text-gray-300`}>S {crowns.silver}</span>
      <span className={`${chipClass} text-amber-600`}>B {crowns.bronze}</span>
      <span className={`${chipClass} text-[var(--rpg-text-primary)]`}>{total} crowns</span>
    </div>
  );
}
```

- [ ] **Step 4: Create CrownCollectorsTable**

Create `apps/web/src/components/rankings/CrownCollectorsTable.tsx`:

```tsx
'use client';

import type { CrownCollectorEntry } from '@/lib/api';
import { PlayerTitle } from '@/components/common/PlayerTitle';
import { CrownChips } from './CrownChips';

interface CrownCollectorsTableProps {
  entries: CrownCollectorEntry[];
  myRank: CrownCollectorEntry | null;
  loading: boolean;
  totalPlayers: number;
  lastRefreshedAt: string | null;
  showAroundMe: boolean;
  onToggleAroundMe: () => void;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  return `${minutes} min ago`;
}

function CrownCollectorRow({ entry, isMe }: { entry: CrownCollectorEntry; isMe: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
        isMe
          ? 'border border-[var(--rpg-gold)]/40 bg-[var(--rpg-gold)]/15'
          : 'bg-[var(--rpg-surface)]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-12 shrink-0 text-right font-bold text-[var(--rpg-gold)]">#{entry.rank}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className={`truncate ${isMe ? 'font-semibold text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-primary)]'}`}>
              {entry.username}
            </span>
            {entry.title && (
              <PlayerTitle
                title={entry.title}
                titleTier={entry.titleTier}
                titleStyle={entry.titleStyle}
                className="shrink-0 text-[10px]"
                bracketed
              />
            )}
          </div>
          <span className="text-xs text-[var(--rpg-text-secondary)]">
            Lv.<span className="font-pixel text-[8px]">{entry.characterLevel}</span>
            {entry.topGroups.length > 0 ? ` · ${entry.topGroups[0].group}` : ''}
          </span>
        </div>
      </div>
      <CrownChips crowns={entry.crowns} compact />
    </div>
  );
}

export function CrownCollectorsTable({
  entries,
  myRank,
  loading,
  totalPlayers,
  lastRefreshedAt,
  showAroundMe,
  onToggleAroundMe,
}: CrownCollectorsTableProps) {
  if (loading) {
    return <div className="py-8 text-center text-[var(--rpg-text-secondary)]">Loading crown collectors...</div>;
  }

  if (entries.length === 0 && !myRank) {
    return <div className="py-8 text-center text-[var(--rpg-text-secondary)]">No crowns awarded yet.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 text-xs text-[var(--rpg-text-secondary)]">
        <span>{totalPlayers.toLocaleString()} collectors ranked</span>
        {lastRefreshedAt && <span>Updated {timeSince(lastRefreshedAt)}</span>}
      </div>

      <div className="space-y-1">
        {entries.map((entry) => (
          <CrownCollectorRow key={entry.rank} entry={entry} isMe={myRank?.rank === entry.rank} />
        ))}
      </div>

      {myRank && (
        <button
          type="button"
          onClick={onToggleAroundMe}
          className="w-full py-2 text-sm text-[var(--rpg-gold)] transition-colors hover:text-[var(--rpg-gold)]/80"
        >
          {showAroundMe ? 'Back to Top' : 'View My Rank'}
        </button>
      )}

      {!showAroundMe && myRank && !entries.some((entry) => entry.rank === myRank.rank) && (
        <div className="border-t border-[var(--rpg-border)] pt-2">
          <CrownCollectorRow entry={myRank} isMe />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Extend existing LeaderboardTable with crown chips**

In `apps/web/src/components/leaderboard/LeaderboardTable.tsx`, import:

```tsx
import { CrownChips } from '@/components/rankings/CrownChips';
```

Inside each row score area, render crown chips below the score:

```tsx
<div className="text-right font-pixel text-[12px] text-[var(--rpg-text-primary)] shrink-0">
  <div>{formatScore(entry.score)}</div>
  {entry.crowns && <CrownChips crowns={entry.crowns} compact />}
</div>
```

Make the same change in the pinned `myRank` row score area.

- [ ] **Step 6: Run component tests**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/CrownCollectorsTable.test.tsx src/components/screens/Leaderboard.test.ts
```

Expected: both tests pass.

- [ ] **Step 7: Commit shared crown UI**

Run:

```powershell
git add apps/web/src/components/rankings/CrownChips.tsx apps/web/src/components/rankings/CrownCollectorsTable.tsx apps/web/src/components/rankings/CrownCollectorsTable.test.tsx apps/web/src/components/leaderboard/LeaderboardTable.tsx
git commit -m "feat(web): add crown collector table"
```

---

## Task 7: Public Rankings Page

**Files:**

- Create: `apps/web/src/components/rankings/RankingsTabs.tsx`
- Create: `apps/web/src/components/rankings/PublicRankings.tsx`
- Create: `apps/web/src/components/rankings/PublicRankings.test.tsx`
- Create: `apps/web/src/app/rankings/page.tsx`
- Create: `apps/web/src/app/rankings/page.test.tsx`

- [ ] **Step 1: Write failing public rankings tests**

Create `apps/web/src/components/rankings/PublicRankings.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getActiveSeason: vi.fn(),
    getCrownCollectors: vi.fn(),
    getHallOfFame: vi.fn(),
    getLeaderboard: vi.fn(),
    getLeaderboardCategories: vi.fn(),
    getSeasonArchives: vi.fn(),
  };
});

import {
  getActiveSeason,
  getCrownCollectors,
  getHallOfFame,
  getLeaderboard,
  getLeaderboardCategories,
  getSeasonArchives,
} from '@/lib/api';
import { PublicRankings } from './PublicRankings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function primeApi() {
  vi.mocked(getCrownCollectors).mockResolvedValue({
    data: {
      entries: [
        {
          rank: 1,
          username: 'Arden',
          characterLevel: 44,
          crowns: { gold: 3, silver: 1, bronze: 0, total: 4 },
          topGroups: [{ group: 'pvp', count: 4 }],
        },
      ],
      myRank: null,
      totalPlayers: 1,
      lastRefreshedAt: '2026-04-24T12:00:00.000Z',
    },
    error: undefined,
  });
  vi.mocked(getLeaderboardCategories).mockResolvedValue({
    data: { groups: [{ name: 'Progression', categories: [{ slug: 'character_xp', label: 'Character XP' }] }] },
    error: undefined,
  });
  vi.mocked(getActiveSeason).mockResolvedValue({ data: { season: null }, error: undefined });
  vi.mocked(getSeasonArchives).mockResolvedValue({ data: { archives: [] }, error: undefined });
  vi.mocked(getLeaderboard).mockResolvedValue({
    data: {
      category: 'character_xp',
      period: 'weekly',
      entries: [{ rank: 1, username: 'XP Hero', characterLevel: 12, score: 2500, isBot: false }],
      myRank: null,
      totalPlayers: 1,
      lastRefreshedAt: '2026-04-24T12:00:00.000Z',
    },
    error: undefined,
  });
  vi.mocked(getHallOfFame).mockResolvedValue({ data: { entries: [] }, error: undefined });
}

describe('PublicRankings', () => {
  it('defaults to the Crowns tab', async () => {
    primeApi();

    render(<PublicRankings />);

    await waitFor(() => expect(getCrownCollectors).toHaveBeenCalledWith(false));
    expect(screen.getByRole('heading', { name: 'Realm Rankings' })).toBeTruthy();
    expect(screen.getByText('Arden')).toBeTruthy();
    expect(screen.getByText('4 crowns')).toBeTruthy();
  });

  it('loads weekly rankings with weekly period when Weekly is selected', async () => {
    primeApi();

    render(<PublicRankings />);
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));

    await waitFor(() => expect(getLeaderboard).toHaveBeenCalledWith('character_xp', false, null, 'weekly'));
    expect(screen.getByText('XP Hero')).toBeTruthy();
  });
});
```

Create `apps/web/src/app/rankings/page.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RankingsPage from './page';

vi.mock('@/components/rankings/PublicRankings', () => ({
  PublicRankings: () => React.createElement('div', null, 'public rankings component'),
}));

afterEach(() => {
  cleanup();
});

describe('Rankings page', () => {
  it('renders the public rankings component', () => {
    render(React.createElement(RankingsPage));

    expect(screen.getByText('public rankings component')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run failing public rankings tests**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/PublicRankings.test.tsx src/app/rankings/page.test.tsx
```

Expected: fails because the page/components do not exist.

- [ ] **Step 3: Create RankingsTabs**

Create `apps/web/src/components/rankings/RankingsTabs.tsx`:

```tsx
'use client';

export type PublicRankingsTab = 'leaderboards' | 'weekly' | 'crowns' | 'hallOfFame';

const TABS: Array<{ id: PublicRankingsTab; label: string }> = [
  { id: 'crowns', label: 'Crowns' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'hallOfFame', label: 'Hall of Fame' },
];

interface RankingsTabsProps {
  activeTab: PublicRankingsTab;
  onChange: (tab: PublicRankingsTab) => void;
}

export function RankingsTabs({ activeTab, onChange }: RankingsTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
            activeTab === tab.id
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create PublicRankings**

Create `apps/web/src/components/rankings/PublicRankings.tsx` using the existing `LeaderboardTable` and new `CrownCollectorsTable`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import {
  getActiveSeason,
  getCrownCollectors,
  getHallOfFame,
  getLeaderboard,
  getLeaderboardCategories,
  getSeasonArchives,
  type CrownCollectorsResponse,
  type HallOfFameEntryResponse,
  type LeaderboardCategoryGroup,
  type LeaderboardPeriod,
  type LeaderboardResponse,
  type SeasonArchiveSummary,
} from '@/lib/api';
import { titleCaseFromSnake } from '@/lib/format';
import { CrownCollectorsTable } from './CrownCollectorsTable';
import { RankingsTabs, type PublicRankingsTab } from './RankingsTabs';

interface SeasonOption {
  id: string;
  name: string;
  status: string;
}

function seasonOptionsFromArchives(
  activeSeason: { id: string; name: string; status: string } | null,
  archives: SeasonArchiveSummary[],
): SeasonOption[] {
  const options = new Map<string, SeasonOption>();
  if (activeSeason) {
    options.set(activeSeason.id, activeSeason);
  }
  for (const archive of archives) {
    options.set(archive.season.id, {
      id: archive.season.id,
      name: archive.season.name,
      status: 'archived',
    });
  }
  return [...options.values()];
}

function tabFromSearch(): PublicRankingsTab {
  if (typeof window === 'undefined') return 'crowns';

  const requested = new URLSearchParams(window.location.search).get('tab');
  if (requested === 'leaderboards' || requested === 'weekly' || requested === 'crowns' || requested === 'hallOfFame') {
    return requested;
  }

  return 'crowns';
}

function writeTabToUrl(tab: PublicRankingsTab): void {
  const params = new URLSearchParams(window.location.search);
  params.set('tab', tab);
  const query = params.toString();
  window.history.replaceState(null, '', query ? `/rankings?${query}` : '/rankings');
}

export function PublicRankings() {
  const [activeTab, setActiveTab] = useState<PublicRankingsTab>(() => tabFromSearch());
  const [groups, setGroups] = useState<LeaderboardCategoryGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState('Progression');
  const [activeCategory, setActiveCategory] = useState('character_xp');
  const [activeSeason, setActiveSeason] = useState<SeasonOption | null>(null);
  const [rankingsSeasonId, setRankingsSeasonId] = useState<string | null>(null);
  const [hallOfFameSeasonId, setHallOfFameSeasonId] = useState('');
  const [hallOfFameSeasons, setHallOfFameSeasons] = useState<SeasonOption[]>([]);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [crownData, setCrownData] = useState<CrownCollectorsResponse | null>(null);
  const [hallOfFameEntries, setHallOfFameEntries] = useState<HallOfFameEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [aroundMe, setAroundMe] = useState(false);

  useEffect(() => {
    void (async () => {
      const [categoriesRes, activeSeasonRes, archivesRes] = await Promise.all([
        getLeaderboardCategories(),
        getActiveSeason(),
        getSeasonArchives(),
      ]);
      const categoryGroups = categoriesRes.data?.groups ?? [];
      setGroups(categoryGroups);
      const firstGroup = categoryGroups[0];
      if (firstGroup) {
        setActiveGroup(firstGroup.name);
        setActiveCategory(firstGroup.categories[0].slug);
      }

      const currentActiveSeason = activeSeasonRes.data?.season
        ? {
            id: activeSeasonRes.data.season.id,
            name: activeSeasonRes.data.season.name,
            status: activeSeasonRes.data.season.status,
          }
        : null;
      setActiveSeason(currentActiveSeason);

      const archiveOptions = seasonOptionsFromArchives(currentActiveSeason, archivesRes.data?.archives ?? []);
      setHallOfFameSeasons(archiveOptions);
      setHallOfFameSeasonId(archiveOptions[0]?.id ?? '');
    })();
  }, []);

  const realms = useMemo(
    () => [
      { id: 'permanent', label: 'Permanent Realm', seasonId: null as string | null },
      ...(activeSeason ? [{ id: activeSeason.id, label: activeSeason.name, seasonId: activeSeason.id }] : []),
    ],
    [activeSeason],
  );

  const currentGroupCategories = groups.find((group) => group.name === activeGroup)?.categories ?? [];

  const loadLeaderboard = useCallback(async (
    category: string,
    showAroundMe: boolean,
    seasonId: string | null,
    period: LeaderboardPeriod,
  ) => {
    setLoading(true);
    const res = await getLeaderboard(category, showAroundMe, seasonId, period);
    if (res.data) {
      setLeaderboardData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'crowns') {
      setLoading(true);
      void getCrownCollectors(aroundMe).then((res) => {
        if (res.data) setCrownData(res.data);
        setLoading(false);
      });
      return;
    }

    if (activeTab === 'leaderboards' || activeTab === 'weekly') {
      void loadLeaderboard(activeCategory, aroundMe, rankingsSeasonId, activeTab === 'weekly' ? 'weekly' : 'alltime');
    }
  }, [activeCategory, activeTab, aroundMe, loadLeaderboard, rankingsSeasonId]);

  useEffect(() => {
    if (activeTab !== 'hallOfFame' || !hallOfFameSeasonId) return;
    setLoading(true);
    void getHallOfFame(hallOfFameSeasonId).then((res) => {
      if (res.data) setHallOfFameEntries(res.data.entries);
      setLoading(false);
    });
  }, [activeTab, hallOfFameSeasonId]);

  const hallOfFameByCategory = useMemo(() => {
    const grouped = new Map<string, HallOfFameEntryResponse[]>();
    for (const entry of hallOfFameEntries) {
      const current = grouped.get(entry.category) ?? [];
      current.push(entry);
      grouped.set(entry.category, current);
    }
    return [...grouped.entries()].map(([category, entries]) => ({
      category,
      entries: entries.sort((left, right) => left.rank - right.rank),
    }));
  }, [hallOfFameEntries]);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[var(--rpg-gold)]" />
          <h1 className="font-almendra text-2xl font-bold text-[var(--rpg-text-primary)]">Realm Rankings</h1>
        </div>

        <RankingsTabs
          activeTab={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);
            setAroundMe(false);
            writeTabToUrl(tab);
          }}
        />

        {activeTab === 'crowns' && (
          <PixelCard>
            <CrownCollectorsTable
              entries={crownData?.entries ?? []}
              myRank={crownData?.myRank ?? null}
              loading={loading}
              totalPlayers={crownData?.totalPlayers ?? 0}
              lastRefreshedAt={crownData?.lastRefreshedAt ?? null}
              showAroundMe={aroundMe}
              onToggleAroundMe={() => setAroundMe((value) => !value)}
            />
          </PixelCard>
        )}

        {(activeTab === 'leaderboards' || activeTab === 'weekly') && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {realms.map((realm) => (
                <button
                  key={realm.id}
                  type="button"
                  onClick={() => {
                    setRankingsSeasonId(realm.seasonId);
                    setAroundMe(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    rankingsSeasonId === realm.seasonId
                      ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                      : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                  }`}
                >
                  {realm.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {groups.map((group) => (
                <button
                  key={group.name}
                  type="button"
                  onClick={() => {
                    setActiveGroup(group.name);
                    setActiveCategory(group.categories[0].slug);
                    setAroundMe(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    activeGroup === group.name
                      ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                      : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
                  }`}
                >
                  {group.name}
                </button>
              ))}
            </div>

            {currentGroupCategories.length > 1 && (
              <select
                value={activeCategory}
                onChange={(event) => {
                  setActiveCategory(event.target.value);
                  setAroundMe(false);
                }}
                className="w-full rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2 text-sm text-[var(--rpg-text-primary)]"
              >
                {currentGroupCategories.map((category) => (
                  <option key={category.slug} value={category.slug}>{category.label}</option>
                ))}
              </select>
            )}

            <PixelCard>
              <LeaderboardTable
                entries={leaderboardData?.entries ?? []}
                myRank={leaderboardData?.myRank ?? null}
                currentPlayerId={null}
                loading={loading}
                totalPlayers={leaderboardData?.totalPlayers ?? 0}
                lastRefreshedAt={leaderboardData?.lastRefreshedAt ?? null}
                showAroundMe={aroundMe}
                onToggleAroundMe={() => setAroundMe((value) => !value)}
                isGuildCategory={activeGroup === 'Guilds'}
              />
            </PixelCard>
          </>
        )}

        {activeTab === 'hallOfFame' && (
          <>
            {hallOfFameSeasons.length > 0 && (
              <select
                value={hallOfFameSeasonId}
                onChange={(event) => setHallOfFameSeasonId(event.target.value)}
                className="w-full rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2 text-sm text-[var(--rpg-text-primary)]"
              >
                {hallOfFameSeasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
            )}
            {hallOfFameSeasons.length === 0 && (
              <PixelCard>
                <p className="text-sm text-[var(--rpg-text-secondary)]">No seasonal results are archived yet.</p>
              </PixelCard>
            )}
            {hallOfFameByCategory.map(({ category, entries }) => (
              <PixelCard key={category}>
                <h2 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">{titleCaseFromSnake(category)}</h2>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <div
                      key={`${entry.category}-${entry.rank}-${entry.accountId}`}
                      className="flex items-center justify-between gap-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-bold text-[var(--rpg-text-primary)]">#{entry.rank} {entry.username}</p>
                        <p className="text-xs text-[var(--rpg-text-secondary)]">{entry.value.toLocaleString()} points</p>
                      </div>
                      <span className="font-pixel text-[10px] uppercase text-[var(--rpg-gold)]">Legend</span>
                    </div>
                  ))}
                </div>
              </PixelCard>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Create the route page**

Create `apps/web/src/app/rankings/page.tsx`:

```tsx
import { PublicRankings } from '@/components/rankings/PublicRankings';

export default function RankingsPage() {
  return <PublicRankings />;
}
```

- [ ] **Step 6: Run public rankings tests**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/PublicRankings.test.tsx src/app/rankings/page.test.tsx
```

Expected: tests pass.

- [ ] **Step 7: Commit public rankings page**

Run:

```powershell
git add apps/web/src/components/rankings/RankingsTabs.tsx apps/web/src/components/rankings/PublicRankings.tsx apps/web/src/components/rankings/PublicRankings.test.tsx apps/web/src/app/rankings/page.tsx apps/web/src/app/rankings/page.test.tsx
git commit -m "feat(web): add public rankings page"
```

---

## Task 8: Landing Rankings Preview

**Files:**

- Create: `apps/web/src/components/rankings/LandingRankingsPreview.tsx`
- Create: `apps/web/src/components/rankings/LandingRankingsPreview.test.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.test.ts`

- [ ] **Step 1: Write failing landing preview tests**

Create `apps/web/src/components/rankings/LandingRankingsPreview.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  getPublicLeaderboardSummary: vi.fn(),
}));

import { getPublicLeaderboardSummary } from '@/lib/api';
import { LandingRankingsPreview } from './LandingRankingsPreview';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LandingRankingsPreview', () => {
  it('renders crown collectors and weekly leaders', async () => {
    vi.mocked(getPublicLeaderboardSummary).mockResolvedValue({
      data: {
        crownCollectors: [
          {
            rank: 1,
            username: 'Arden',
            characterLevel: 44,
            crowns: { gold: 3, silver: 1, bronze: 0, total: 4 },
            topGroups: [{ group: 'pvp', count: 4 }],
          },
        ],
        weeklyLeaders: [
          {
            category: 'character_xp',
            label: 'Character XP',
            rank: 1,
            username: 'XP Hero',
            characterLevel: 12,
            score: 2500,
          },
        ],
        lastRefreshedAt: '2026-04-24T12:00:00.000Z',
      },
      error: undefined,
    });

    render(<LandingRankingsPreview />);

    await waitFor(() => expect(screen.getByText('Realm Rankings')).toBeTruthy());
    expect(screen.getByText('Arden')).toBeTruthy();
    expect(screen.getByText('XP Hero')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Rankings' })).toHaveAttribute('href', '/rankings');
  });

  it('shows quiet empty states when there is no cached data', async () => {
    vi.mocked(getPublicLeaderboardSummary).mockResolvedValue({
      data: { crownCollectors: [], weeklyLeaders: [], lastRefreshedAt: null },
      error: undefined,
    });

    render(<LandingRankingsPreview />);

    await waitFor(() => expect(screen.getByText('No crowns awarded yet.')).toBeTruthy());
    expect(screen.getByText('Weekly race starts after the next snapshot.')).toBeTruthy();
  });
});
```

Update `apps/web/src/app/page.test.ts` to mock the new component:

```ts
vi.mock('@/components/rankings/LandingRankingsPreview', () => ({
  LandingRankingsPreview: () => React.createElement('div', null, 'landing rankings preview'),
}));
```

Add this assertion to the home page test:

```ts
expect(screen.getByText('landing rankings preview')).toBeTruthy();
```

- [ ] **Step 2: Run failing landing tests**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/LandingRankingsPreview.test.tsx src/app/page.test.ts
```

Expected: fails because the preview does not exist and home page still renders the fake Champion preview.

- [ ] **Step 3: Implement LandingRankingsPreview**

Create `apps/web/src/components/rankings/LandingRankingsPreview.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getPublicLeaderboardSummary, type PublicLeaderboardSummaryResponse } from '@/lib/api';
import { CrownChips } from './CrownChips';

function formatScore(score: number): string {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 10_000) return `${(score / 1_000).toFixed(1)}K`;
  return score.toLocaleString();
}

export function LandingRankingsPreview() {
  const [summary, setSummary] = useState<PublicLeaderboardSummaryResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    void getPublicLeaderboardSummary().then((res) => {
      if (mounted && res.data) {
        setSummary(res.data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!summary) {
    return null;
  }

  return (
    <div className="mb-8 rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-almendra text-lg font-bold text-[var(--rpg-gold)]">Realm Rankings</h3>
        <a href="/rankings" className="text-sm text-[var(--rpg-gold)] transition-colors hover:text-[var(--rpg-gold)]/80">
          View Rankings
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase text-[var(--rpg-text-secondary)]">Crown Collectors</h4>
          {summary.crownCollectors.length === 0 ? (
            <p className="text-sm text-[var(--rpg-text-secondary)]">No crowns awarded yet.</p>
          ) : (
            <div className="space-y-2">
              {summary.crownCollectors.map((entry) => (
                <div key={entry.rank} className="flex items-center justify-between gap-2 rounded bg-[var(--rpg-background)] px-2 py-1.5">
                  <span className="min-w-0 truncate text-sm text-[var(--rpg-text-primary)]">#{entry.rank} {entry.username}</span>
                  <CrownChips crowns={entry.crowns} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase text-[var(--rpg-text-secondary)]">Weekly Race</h4>
          {summary.weeklyLeaders.length === 0 ? (
            <p className="text-sm text-[var(--rpg-text-secondary)]">Weekly race starts after the next snapshot.</p>
          ) : (
            <div className="space-y-2">
              {summary.weeklyLeaders.map((entry) => (
                <div key={entry.category} className="flex items-center justify-between gap-2 rounded bg-[var(--rpg-background)] px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--rpg-text-primary)]">{entry.username}</p>
                    <p className="text-xs text-[var(--rpg-text-secondary)]">{entry.label}</p>
                  </div>
                  <span className="font-pixel text-[11px] text-[var(--rpg-text-primary)]">{formatScore(entry.score)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace fake landing preview**

In `apps/web/src/app/page.tsx`, remove the `ChampionBadge` import and add:

```tsx
import { LandingRankingsPreview } from '@/components/rankings/LandingRankingsPreview';
```

Add a `View Rankings` link in the hero button group:

```tsx
<a href="/rankings" className={linkSecondary}>Rankings</a>
```

Replace the mock leaderboard preview block in the Support Pocketrealm section:

```tsx
<LandingRankingsPreview />
```

- [ ] **Step 5: Run landing tests**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/LandingRankingsPreview.test.tsx src/app/page.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit landing preview**

Run:

```powershell
git add apps/web/src/components/rankings/LandingRankingsPreview.tsx apps/web/src/components/rankings/LandingRankingsPreview.test.tsx apps/web/src/app/page.tsx apps/web/src/app/page.test.ts
git commit -m "feat(web): show live rankings on landing page"
```

---

## Task 9: Verification, Simplify, And Final Checks

**Files:**

- Review all files touched in Tasks 1-8.

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
npm run test:api -- --run src/services/crownLeaderboardService.test.ts src/services/publicLeaderboardSummaryService.test.ts src/routes/leaderboard.seasons.test.ts src/jobs/weeklyLeaderboardJob.test.ts src/services/seasonMergeService.test.ts
```

Expected: all focused backend tests pass.

- [ ] **Step 2: Run focused frontend tests**

Run:

```powershell
npm run test -w apps/web -- --run src/components/rankings/CrownCollectorsTable.test.tsx src/components/rankings/PublicRankings.test.tsx src/components/rankings/LandingRankingsPreview.test.tsx src/app/rankings/page.test.tsx src/app/page.test.ts src/components/screens/Leaderboard.test.ts
```

Expected: all focused frontend tests pass.

- [ ] **Step 3: Run typecheck and builds**

Run:

```powershell
npm run typecheck
npm run build:api
npm run build:web
```

Expected: all commands pass. If `npm run build:web` exposes a Next.js client/server boundary issue, move the affected component behind a `'use client'` boundary and rerun the same command.

- [ ] **Step 4: Run `$simplify` on touched code**

Use the global `$simplify` skill. Review only the diff from Tasks 1-8 and simplify touched code where it improves clarity or removes duplication. Do not broaden the refactor beyond this feature.

- [ ] **Step 5: Rerun focused verification after simplify**

Run:

```powershell
npm run test:api -- --run src/services/crownLeaderboardService.test.ts src/services/publicLeaderboardSummaryService.test.ts src/routes/leaderboard.seasons.test.ts src/jobs/weeklyLeaderboardJob.test.ts src/services/seasonMergeService.test.ts
npm run test -w apps/web -- --run src/components/rankings/CrownCollectorsTable.test.tsx src/components/rankings/PublicRankings.test.tsx src/components/rankings/LandingRankingsPreview.test.tsx src/app/rankings/page.test.tsx src/app/page.test.ts src/components/screens/Leaderboard.test.ts
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors. CRLF warnings are acceptable if Git reports them as warnings rather than diff-check failures.

- [ ] **Step 7: Final commit**

Run:

```powershell
git status --short
git add apps/api/src/services/crownLeaderboardService.ts apps/api/src/services/crownLeaderboardService.test.ts apps/api/src/services/publicLeaderboardSummaryService.ts apps/api/src/services/publicLeaderboardSummaryService.test.ts apps/api/src/services/leaderboardService.ts apps/api/src/routes/leaderboard.ts apps/api/src/routes/leaderboard.seasons.test.ts apps/api/src/jobs/weeklyLeaderboardJob.ts apps/api/src/jobs/weeklyLeaderboardJob.test.ts apps/api/src/services/seasonMergeService.ts apps/api/src/services/seasonMergeService.test.ts apps/web/src/lib/api/social.ts apps/web/src/lib/api/index.ts apps/web/src/components/rankings apps/web/src/components/leaderboard/LeaderboardTable.tsx apps/web/src/app/rankings apps/web/src/app/page.tsx apps/web/src/app/page.test.ts
git commit -m "feat: add public rankings and crown collectors"
```

Expected: final feature commit succeeds. If earlier task commits were already made, this final commit should only include remaining simplify or verification fixes.

---

## Self-Review Checklist

- Spec coverage: public `/rankings`, dedicated Crowns default, lifetime collector ranking, logged-in `myRank`, cache-only landing summary, no polling, no homepage refresh path, weekly/merge snapshot maintenance.
- Backend privacy: public rows strip `playerId` and admin flags; `playerId` remains internal only inside Redis snapshot/service.
- Refresh behavior: only full rankings/crowns pages may rebuild; landing summary reads cache-only.
- Frontend behavior: landing uses public summary once on mount; `/rankings` uses user actions and initial loads only; no polling timers.
- Verification: focused API tests, focused web tests, typecheck, API build, web build, simplify, rerun focused verification.
