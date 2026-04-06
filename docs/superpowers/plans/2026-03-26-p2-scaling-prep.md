# P2: Scaling Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add forward-looking scaling safety nets: Redis resilience, paginated leaderboard refresh, query limits, and socket connection caching.

**Architecture:** All changes are backend-only in `apps/api`. No API contract changes. The work is five independent subsystems: Redis client hardening, leaderboard batching, query caps, socket caching, and a deferred TODO.

**Tech Stack:** Express/TypeScript, ioredis, Prisma 6, Socket.IO, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-p2-scaling-prep-design.md`

---

### Task 1: Add scaling constants to gameConstants.ts

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:872-876`

- [ ] **Step 1: Add constants**

In `LEADERBOARD_CONSTANTS` (line 872), add `BATCH_SIZE: 500`:

```typescript
export const LEADERBOARD_CONSTANTS = {
  REFRESH_INTERVAL_MS: 900_000,
  PAGE_SIZE: 25,
  TOP_N: 25,
  BATCH_SIZE: 500,
} as const;
```

Then find the section where other gameplay constants live and add a new `QUERY_LIMITS` block after `LEADERBOARD_CONSTANTS`:

```typescript
export const QUERY_LIMITS = {
  MAX_PVP_NOTIFICATIONS: 50,
  MAX_SCOUT_NOTIFICATIONS: 50,
  MAX_BESTIARY_RESULTS: 200,
  MAX_INVENTORY_RESULTS: 200,
} as const;
```

- [ ] **Step 2: Build shared package**

Run: `npm run build -w packages/shared`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(shared): add scaling constants for leaderboard batching and query limits (#244)"
```

---

### Task 2: Redis client resilience

**Files:**
- Modify: `apps/api/src/redis.ts`
- Modify: `apps/api/src/index.ts:162-192`

- [ ] **Step 1: Write the resilient Redis client**

Replace `apps/api/src/redis.ts` with:

```typescript
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5_000;

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > MAX_RETRIES) {
      console.error(`[Redis] Failed to reconnect after ${MAX_RETRIES} attempts — exiting`);
      process.exit(1);
    }
    const delay = Math.min(BASE_DELAY_MS * 2 ** (times - 1), MAX_DELAY_MS);
    console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times}/${MAX_RETRIES})`);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});
```

- [ ] **Step 2: Add SIGTERM handler in index.ts**

In `apps/api/src/index.ts`, after the `server.listen(...)` block (after line 192), add:

```typescript
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => {
    redis.quit().then(() => {
      console.log('Redis connection closed');
      process.exit(0);
    });
  });
});
```

You'll need to add `redis` to the imports at the top of index.ts:

```typescript
import { redis } from './redis';
```

- [ ] **Step 3: Verify API starts**

Run: `npm run build:api && npm run dev:api`
Expected: Server starts on port 4000. Observe `[Redis]` log entries if Redis is up. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/redis.ts apps/api/src/index.ts
git commit -m "feat(api): add Redis client resilience with retry strategy and SIGTERM shutdown (#244)"
```

---

### Task 3: Paginated leaderboard refresh

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts`
- Modify: `apps/api/src/services/leaderboardService.test.ts`

- [ ] **Step 1: Write tests for paginated batching behavior**

Add a new `describe('paginated refresh')` block to `leaderboardService.test.ts`. The existing `stubEmptyRefresh` helper returns `[]` for all findMany calls. We need tests that verify batching works by returning data across multiple calls.

Add after the existing `describe('failure isolation')` block:

```typescript
describe('paginated batching', () => {
  it('fetches playerSkill in batches when rows exceed batch size', async () => {
    // Simulate: first batch returns BATCH_SIZE rows, second batch returns fewer (end of data)
    const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
    const makeBatch = (count: number, startId: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `skill-${startId + i}`,
        playerId: `p${startId + i}`,
        skillType: 'melee',
        level: 10 + i,
        player: { username: `Player${startId + i}`, characterLevel: 5, isBot: false, role: 'player', activeTitle: null },
      }));

    const batch1 = makeBatch(batchSize, 0);
    const batch2 = makeBatch(3, batchSize);

    // First call returns full batch, second returns partial (signals end)
    mockPrisma.playerSkill.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2);

    // Stub other models to return empty
    mockPrisma.pvpRating.findMany.mockResolvedValue([]);
    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
    mockPrisma.guild.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await refreshAllLeaderboards();

    // playerSkill.findMany should have been called twice (two batches)
    expect(mockPrisma.playerSkill.findMany).toHaveBeenCalledTimes(2);

    // Second call should have cursor set to last ID of first batch
    const secondCall = mockPrisma.playerSkill.findMany.mock.calls[1][0];
    expect(secondCall).toMatchObject({
      take: batchSize,
      skip: 1,
      cursor: { id: batch1[batch1.length - 1].id },
    });
  });

  it('fetches in a single batch when rows are fewer than batch size', async () => {
    const smallBatch = [
      { id: 'skill-1', playerId: 'p1', skillType: 'melee', level: 10,
        player: { username: 'Player1', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
    ];
    mockPrisma.playerSkill.findMany.mockResolvedValueOnce(smallBatch);

    // Stub others empty
    mockPrisma.pvpRating.findMany.mockResolvedValue([]);
    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
    mockPrisma.guild.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await refreshAllLeaderboards();

    // Only one call — batch was smaller than BATCH_SIZE so no second fetch
    expect(mockPrisma.playerSkill.findMany).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run apps/api/src/services/leaderboardService.test.ts`
Expected: The new `paginated batching` tests FAIL because the current code calls `findMany` without cursor/take args.

- [ ] **Step 3: Add paginatedFindMany helper to leaderboardService.ts**

Add this helper function near the top of the file, after the imports and before the category definitions:

```typescript
/**
 * Iterate a Prisma model in cursor-based batches.
 * Collects all rows across batches and returns them.
 */
async function paginatedFindMany<T extends { id: string }>(
  findMany: (args: Record<string, unknown>) => Promise<T[]>,
  baseArgs: Record<string, unknown>,
): Promise<T[]> {
  const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
  const allRows: T[] = [];
  let cursor: string | undefined;
  let batch: T[];

  do {
    batch = await findMany({
      ...baseArgs,
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
```

The type signature uses `Record<string, unknown>` for both the `findMany` parameter and `baseArgs`. This is intentionally loose — the actual type safety comes from the `select` objects matching what Prisma expects at runtime. Each call site casts via `as Parameters<...>[0]` to bridge the gap.

- [ ] **Step 4: Convert refreshPvp to use paginatedFindMany**

Replace the `findMany` call in `refreshPvp`:

```typescript
async function refreshPvp() {
  const ratings = await paginatedFindMany(
    (args) => prisma.pvpRating.findMany(args as Parameters<typeof prisma.pvpRating.findMany>[0]),
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
  // ... rest of function stays the same
```

Note: `id: true` must be added to the select so the cursor can reference it.

- [ ] **Step 5: Convert refreshProgression to use paginatedFindMany**

```typescript
async function refreshProgression() {
  const players = await paginatedFindMany(
    (args) => prisma.player.findMany(args as Parameters<typeof prisma.player.findMany>[0]),
    {
      select: { id: true, username: true, characterLevel: true, characterXp: true, isBot: true, role: true, activeTitle: true },
    },
  );
  // ... rest stays the same
```

- [ ] **Step 6: Convert refreshSkills to use paginatedFindMany**

```typescript
async function refreshSkills() {
  const skills = await paginatedFindMany(
    (args) => prisma.playerSkill.findMany(args as Parameters<typeof prisma.playerSkill.findMany>[0]),
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
  // ... rest stays the same
```

- [ ] **Step 7: Convert refreshCombat to use paginatedFindMany for both queries**

```typescript
async function refreshCombat() {
  // Total kills from bestiary — paginated
  const bestiaryRaw = await paginatedFindMany(
    (args) => prisma.playerBestiary.findMany(args as Parameters<typeof prisma.playerBestiary.findMany>[0]),
    {
      select: { id: true, playerId: true, kills: true, player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
    },
  );

  // ... existing kill aggregation + writeToZset logic stays the same ...

  // Boss damage — paginated
  try {
    const bossRaw = await paginatedFindMany(
      (args) => prisma.bossParticipant.findMany(args as Parameters<typeof prisma.bossParticipant.findMany>[0]),
      {
        select: { id: true, playerId: true, totalDamage: true, player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
      },
    );
    // ... existing damage aggregation + writeToZset logic stays the same ...
  } catch (err) {
    // ... existing P2021 handling stays the same ...
  }
}
```

- [ ] **Step 8: Convert refreshGuilds to use paginatedFindMany**

```typescript
async function refreshGuilds() {
  const guilds = await paginatedFindMany(
    (args) => prisma.guild.findMany(args as Parameters<typeof prisma.guild.findMany>[0]),
    {
      select: { id: true, name: true, tag: true, level: true, renown: true, _count: { select: { members: true } } },
    },
  );
  // ... rest stays the same
```

Note: `refreshCasino` uses raw SQL aggregation — no change needed.

- [ ] **Step 9: Update existing tests — add `id` fields to mock data**

The existing tests mock `findMany` to return flat arrays. After this change, `findMany` will be called with `{ take, select/include }` args via `paginatedFindMany`.

**Existing mocks still work without changes in most cases:** `mockResolvedValue([])` returns `[]` for any call, and datasets with 1-3 rows are always smaller than `BATCH_SIZE` (500), so the `do...while` exits after one iteration without ever accessing `.id` for cursor.

**However**, for correctness and future-proofing, add an `id` field to all mock data objects that don't already have one. This ensures that if test data ever exceeds batch size (or if cursor logic is tested), the `id` field is available. Scan tests for `pvpRating.findMany`, `player.findMany`, `playerSkill.findMany`, `playerBestiary.findMany`, `bossParticipant.findMany`, and `guild.findMany` mocks and add `id: 'some-unique-id'` to each row object.

- [ ] **Step 10: Run all leaderboard tests**

Run: `npm run test:api -- --run apps/api/src/services/leaderboardService.test.ts`
Expected: ALL tests pass including the new paginated batching tests.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts apps/api/src/services/leaderboardService.test.ts
git commit -m "feat(api): paginate leaderboard refresh with cursor-based batching (#244)"
```

---

### Task 4: Unbounded query limits — PvP notifications

**Files:**
- Modify: `apps/api/src/services/pvpService.ts:681-700` (getNotifications)
- Modify: `apps/api/src/services/pvpService.ts:727-738` (getScoutNotifications)
- Modify: `apps/api/src/services/pvpService.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the relevant `describe` blocks in `pvpService.test.ts`:

```typescript
it('limits notifications to MAX_PVP_NOTIFICATIONS', async () => {
  await getNotifications('player-1');
  expect(mockPrisma.pvpMatch.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: QUERY_LIMITS.MAX_PVP_NOTIFICATIONS }),
  );
});

it('limits scout notifications to MAX_SCOUT_NOTIFICATIONS', async () => {
  await getScoutNotifications('player-1');
  expect(mockPrisma.pvpScoutLog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: QUERY_LIMITS.MAX_SCOUT_NOTIFICATIONS }),
  );
});
```

Import `QUERY_LIMITS` from `@pocketrealm/shared` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run apps/api/src/services/pvpService.test.ts`
Expected: The new tests FAIL because the queries don't include `take`.

- [ ] **Step 3: Add take limits**

In `pvpService.ts`, import `QUERY_LIMITS`:

```typescript
import { QUERY_LIMITS } from '@pocketrealm/shared';
```

In `getNotifications` (line ~681), add `take`:

```typescript
return prisma.pvpMatch.findMany({
  where: { defenderId: playerId, defenderRead: false },
  take: QUERY_LIMITS.MAX_PVP_NOTIFICATIONS,
  select: { ... },
  orderBy: { createdAt: 'desc' },
});
```

In `getScoutNotifications` (line ~727), add `take`:

```typescript
const logs = await prisma.pvpScoutLog.findMany({
  where: { targetId: playerId, isRead: false },
  take: QUERY_LIMITS.MAX_SCOUT_NOTIFICATIONS,
  include: { scouter: { select: { username: true } } },
  orderBy: { createdAt: 'desc' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --run apps/api/src/services/pvpService.test.ts`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pvpService.ts apps/api/src/services/pvpService.test.ts
git commit -m "feat(api): cap PvP and scout notification queries with take limits (#244)"
```

---

### Task 5: Unbounded query limits — bestiary and inventory

**Files:**
- Modify: `apps/api/src/routes/bestiary.ts:32-42`
- Modify: `apps/api/src/routes/inventory.ts:31-35`

- [ ] **Step 1: Add take limit to bestiary route**

In `apps/api/src/routes/bestiary.ts`, import `QUERY_LIMITS`:

```typescript
import { QUERY_LIMITS } from '@pocketrealm/shared';
```

Add `take: QUERY_LIMITS.MAX_BESTIARY_RESULTS` to the `mobTemplate.findMany` call:

```typescript
prisma.mobTemplate.findMany({
  take: QUERY_LIMITS.MAX_BESTIARY_RESULTS,
  include: { ... },
  orderBy: [{ zoneId: 'asc' }, { name: 'asc' }],
})
```

- [ ] **Step 2: Add take limit to inventory route**

In `apps/api/src/routes/inventory.ts`, import `QUERY_LIMITS`:

```typescript
import { QUERY_LIMITS } from '@pocketrealm/shared';
```

Add `take: QUERY_LIMITS.MAX_INVENTORY_RESULTS` to the `item.findMany` call:

```typescript
prisma.item.findMany({
  where: { ownerId: playerId, inStash: false },
  take: QUERY_LIMITS.MAX_INVENTORY_RESULTS,
  include: { template: true },
  orderBy: [{ createdAt: 'desc' }],
})
```

- [ ] **Step 3: Run existing tests**

Run: `npm run test:api -- --run`
Expected: All existing tests pass. These routes may not have dedicated test files, but the full test suite should be green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/bestiary.ts apps/api/src/routes/inventory.ts
git commit -m "feat(api): add take limits to bestiary and inventory queries (#244)"
```

---

### Task 6: Zone cache service

**Files:**
- Create: `apps/api/src/services/zoneService.ts`
- Create: `apps/api/src/services/zoneService.test.ts`

- [ ] **Step 1: Write tests for getPlayerZoneId**

Create `apps/api/src/services/zoneService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cacheService', () => ({
  cachedQuery: vi.fn(),
  invalidateCache: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { cachedQuery, invalidateCache } from './cacheService';
import { getPlayerZoneId, invalidateZoneIdCache } from './zoneService';

const mockCachedQuery = vi.mocked(cachedQuery);
const mockInvalidateCache = vi.mocked(invalidateCache);

describe('zoneService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlayerZoneId', () => {
    it('calls cachedQuery with correct key and TTL', async () => {
      mockCachedQuery.mockResolvedValue('zone-123');
      const result = await getPlayerZoneId('player-1');

      expect(result).toBe('zone-123');
      expect(mockCachedQuery).toHaveBeenCalledWith(
        'player:zone:player-1',
        expect.any(Function),
        60,
      );
    });

    it('fetcher queries prisma for currentZoneId', async () => {
      mockCachedQuery.mockImplementation(async (_key, fetcher) => fetcher());
      mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-456' });

      const result = await getPlayerZoneId('player-2');

      expect(result).toBe('zone-456');
      expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-2' },
        select: { currentZoneId: true },
      });
    });

    it('returns null when player not found', async () => {
      mockCachedQuery.mockImplementation(async (_key, fetcher) => fetcher());
      mockPrisma.player.findUnique.mockResolvedValue(null);

      const result = await getPlayerZoneId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('invalidateZoneIdCache', () => {
    it('invalidates the correct cache key', async () => {
      await invalidateZoneIdCache('player-1');
      expect(mockInvalidateCache).toHaveBeenCalledWith('player:zone:player-1');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run apps/api/src/services/zoneService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement zoneService.ts**

Create `apps/api/src/services/zoneService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import { cachedQuery, invalidateCache } from './cacheService';

const ZONE_CACHE_TTL = 60; // seconds
const zoneIdCacheKey = (playerId: string) => `player:zone:${playerId}`;

export async function getPlayerZoneId(playerId: string): Promise<string | null> {
  return cachedQuery(
    zoneIdCacheKey(playerId),
    async () => {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { currentZoneId: true },
      });
      return player?.currentZoneId ?? null;
    },
    ZONE_CACHE_TTL,
  );
}

export async function invalidateZoneIdCache(playerId: string): Promise<void> {
  await invalidateCache(zoneIdCacheKey(playerId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --run apps/api/src/services/zoneService.test.ts`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/zoneService.ts apps/api/src/services/zoneService.test.ts
git commit -m "feat(api): add cached zone lookup service with invalidation (#244)"
```

---

### Task 7: Wire zone cache invalidation at all mutation sites

**Files:**
- Modify: `apps/api/src/routes/zones.ts:~89, ~245, ~674`
- Modify: `apps/api/src/routes/admin.ts:~474`
- Modify: `apps/api/src/services/questShopService.ts:~141`
- Modify: `apps/api/src/services/zoneDiscoveryService.ts:~205`

- [ ] **Step 1: Add invalidation in routes/zones.ts**

Import at top:
```typescript
import { invalidateZoneIdCache } from '../services/zoneService';
```

After the `prisma.player.update` at line ~89 (lazy-init):
```typescript
await invalidateZoneIdCache(playerId);
```

After the `prisma.player.update` at line ~245 (breadcrumb travel) — add right after the update:
```typescript
await invalidateZoneIdCache(playerId);
```

After the `prisma.player.update` near line ~674 (successful arrival, step 11) — the update uses `updateData` and is followed by discovery logic. Add the invalidation right after the player update call:
```typescript
await invalidateZoneIdCache(playerId);
```

- [ ] **Step 2: Add invalidation in routes/admin.ts**

Import at top:
```typescript
import { invalidateZoneIdCache } from '../services/zoneService';
```

After the `prisma.player.update` at line ~474 (admin teleport):
```typescript
await invalidateZoneIdCache(req.player!.playerId);
```

- [ ] **Step 3: Add invalidation in questShopService.ts**

Import at top:
```typescript
import { invalidateZoneIdCache } from './zoneService';
```

In `purchaseItem`, after the `$transaction` completes (after line ~140, before the achievement notification block), add:

```typescript
// Invalidate zone cache after teleport/hearthstone effects
if (result.effect?.type === 'teleport' || result.effect?.type === 'hearthstone') {
  await invalidateZoneIdCache(playerId);
}
```

This is important: the invalidation happens AFTER the transaction commits, not inside `applyTeleport`/`applyHearthstone` (which run inside the tx).

- [ ] **Step 4: Add invalidation in zoneDiscoveryService.ts**

Import at top:
```typescript
import { invalidateZoneIdCache } from './zoneService';
```

After the `prisma.player.update` at line ~205 (zone discovery init):
```typescript
await invalidateZoneIdCache(playerId);
```

- [ ] **Step 5: Run full test suite**

Run: `npm run test:api -- --run`
Expected: All tests pass. The new `invalidateZoneIdCache` calls are best-effort (cacheService silently swallows errors), so existing tests won't break even without mocking the new import.

**Note on test coverage:** This task adds invalidation calls to 4 files but no new integration tests verifying the calls happen. The zone service itself is tested in Task 6. Adding integration tests for each mutation site would require significant test infrastructure changes for minimal value — these are best-effort cache invalidations, not correctness-critical logic.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/zones.ts apps/api/src/routes/admin.ts apps/api/src/services/questShopService.ts apps/api/src/services/zoneDiscoveryService.ts
git commit -m "feat(api): wire zone cache invalidation at all currentZoneId mutation sites (#244)"
```

---

### Task 8: Socket connection — use cached lookups

**Files:**
- Modify: `apps/api/src/socket/chatHandlers.ts:1-6,52-71`

- [ ] **Step 1: Replace DB queries with cached lookups**

In `chatHandlers.ts`, update imports — add the cached services and remove the direct `prisma` import if it's no longer used elsewhere in the file. Check first: `prisma` is still used in `chat:send` (line 93, 105, 113) and `chat:switch-zone` (line 141), so keep the import.

Add imports:
```typescript
import { getPlayerGuildId } from '../services/guildService';
import { getPlayerZoneId } from '../services/zoneService';
```

Replace the `Promise.all` block at lines 52-71:

```typescript
  // Look up player's current zone and guild via Redis cache (avoids DB queries on every connect)
  Promise.all([
    getPlayerZoneId(playerId),
    getPlayerGuildId(playerId),
  ])
    .then(([currentZoneId, guildId]) => {
      if (currentZoneId) {
        socket.join(`chat:zone:${currentZoneId}`);
        const zonePin = pinnedMessages.get(`zone:${currentZoneId}`);
        if (zonePin) {
          socket.emit('chat:pinned', zonePin);
        }
      }
      if (guildId) {
        socket.join(`chat:guild:${guildId}`);
      }
      schedulePresenceBroadcast(io);
    })
    .catch(() => {
      // Best-effort — presence will update on next event
    });
```

- [ ] **Step 2: Run full test suite**

Run: `npm run test:api -- --run`
Expected: All tests pass. There are no dedicated chatHandlers unit tests — verification relies on the full suite not regressing.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/socket/chatHandlers.ts
git commit -m "feat(api): use cached Redis lookups for socket connection room joins (#244)"
```

---

### Task 9: Socket.IO TODO comment

**Files:**
- Modify: `apps/api/src/socket/index.ts:16`

- [ ] **Step 1: Add TODO comment**

In `apps/api/src/socket/index.ts`, add a comment before `const io = new SocketServer(...)`:

```typescript
  // TODO: Add @socket.io/redis-adapter for multi-instance deployment.
  // See: https://socket.io/docs/v4/redis-adapter/
  const io = new SocketServer(httpServer, {
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/socket/index.ts
git commit -m "chore(api): add TODO for Socket.IO Redis adapter (#244)"
```

---

### Task 10: Final verification

- [ ] **Step 1: Build everything**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No errors (the pre-existing `apps/web/src/app/game/page.tsx:333` error is known and acceptable).

- [ ] **Step 4: Verify acceptance criteria**

Manually review against issue #244 acceptance criteria:
- [ ] Leaderboard refresh uses paginated queries (Task 3)
- [ ] Socket.IO Redis adapter deferred with TODO (Task 9)
- [ ] Redis client has reconnect strategy and error logging (Task 2)
- [ ] Unbounded queries capped with `take` limits (Tasks 4-5)
- [ ] Socket connection uses Redis cache instead of DB queries (Task 8)
- [ ] Existing tests still pass (Task 10 steps 1-3)
