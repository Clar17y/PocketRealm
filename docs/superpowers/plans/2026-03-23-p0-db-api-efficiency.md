# P0: DB & API Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce database load under concurrent traffic by caching static game data, caching guild modifiers, adding missing indexes, and configuring the connection pool.

**Architecture:** New `staticDataCacheService.ts` wraps all static seed-data queries (zones, mobs, connections, recipes, resource nodes) in Redis with 24h TTL. Guild modifiers get a 90s per-player cache with invalidation on guild state changes. Eight new database indexes target the highest-frequency unindexed foreign keys. Connection pool is explicitly configured.

**Tech Stack:** Prisma 6, ioredis, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-p0-db-api-efficiency-design.md`
**Issue:** #242

---

### Task 1: Add missing database indexes

This is a pure schema change with no application code. Do it first so later tasks benefit from faster queries.

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add indexes to Player model**

In `packages/database/prisma/schema.prisma`, find `@@map("players")` (line 137) and add the index before it:

```prisma
  @@index([currentZoneId])
  @@map("players")
```

- [ ] **Step 2: Add index to RefreshToken model**

Find `@@map("refresh_tokens")` (line 149) and add before it:

```prisma
  @@index([playerId])
  @@map("refresh_tokens")
```

- [ ] **Step 3: Add index to Item model**

Find `@@index([ownerId, templateId, inStash])` (line 247) and add above it:

```prisma
  @@index([ownerId, inStash])
  @@index([ownerId, templateId, inStash])
```

- [ ] **Step 4: Add indexes to MobTemplate model**

Find `@@index([isExpeditionMob])` (line 366) and add above it:

```prisma
  @@index([zoneId])
  @@index([isBoss])
  @@index([isExpeditionMob])
```

- [ ] **Step 5: Add index to ResourceNode model**

Find `@@map("resource_nodes")` (line 449) and add before it:

```prisma
  @@index([zoneId])
  @@map("resource_nodes")
```

- [ ] **Step 6: Add index to RouletteRound model**

Find `@@map("roulette_rounds")` (line 1220) and add before it:

```prisma
  @@index([resolvedAt])
  @@map("roulette_rounds")
```

- [ ] **Step 7: Add index to GuildExpeditionMember model**

Find `@@unique([expeditionId, playerId])` (line 1042) and add below it:

```prisma
  @@unique([expeditionId, playerId])
  @@index([playerId])
```

- [ ] **Step 8: Run migration**

```bash
cd packages/database && npx prisma migrate dev --name add-missing-indexes
```

Expected: Migration creates 8 new indexes. No data changes.

- [ ] **Step 9: Verify Prisma client regenerated**

```bash
npm run db:generate
```

- [ ] **Step 10: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "perf: add missing database indexes for high-frequency queries

Adds indexes on: Player.currentZoneId, RefreshToken.playerId,
Item(ownerId,inStash), MobTemplate.zoneId, MobTemplate.isBoss,
ResourceNode.zoneId, RouletteRound.resolvedAt, GuildExpeditionMember.playerId"
```

---

### Task 2: Create staticDataCacheService

**Files:**
- Create: `apps/api/src/services/staticDataCacheService.ts`
- Create: `apps/api/src/services/__tests__/staticDataCacheService.test.ts`

**Reference:**
- Existing cache pattern: `apps/api/src/services/cacheService.ts`
- Test patterns: `apps/api/src/services/__tests__/cacheService.test.ts`
- Zone model: `packages/database/prisma/schema.prisma:255-296`
- MobTemplate model: `packages/database/prisma/schema.prisma:332-368`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/services/__tests__/staticDataCacheService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn(),
  },
}));

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));

import { redis } from '../../redis';
import { prisma } from '@pocketrealm/database';
import {
  getCachedZones,
  getCachedZoneConnections,
  getCachedMobTemplatesByZone,
  getCachedResourceNodesByZone,
  getCachedBossMobTemplates,
  getCachedExpeditionMobTemplates,
  getCachedCraftingRecipes,
  getCachedZoneMobFamilies,
  invalidateStaticCache,
} from '../staticDataCacheService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as unknown as Record<string, any>;

const ZONE_A = { id: 'z1', name: 'Forest', difficulty: 1, zoneType: 'wild', isStarter: false };
const MOB_A = { id: 'm1', name: 'Rat', zoneId: 'z1', level: 1, hp: 20 };

beforeEach(() => { vi.clearAllMocks(); });

describe('staticDataCacheService', () => {
  describe('getCachedZones', () => {
    it('returns zones from DB on cache miss and caches result', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(redis.sadd).mockResolvedValue(1);
      db.zone.findMany.mockResolvedValue([ZONE_A]);

      const result = await getCachedZones();
      expect(result).toEqual([ZONE_A]);
      expect(db.zone.findMany).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
    });

    it('returns cached zones without hitting DB', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify([ZONE_A]));
      const result = await getCachedZones();
      expect(result).toEqual([ZONE_A]);
      expect(db.zone.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCachedMobTemplatesByZone', () => {
    it('caches per zone', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(redis.sadd).mockResolvedValue(1);
      db.mobTemplate.findMany.mockResolvedValue([MOB_A]);

      const result = await getCachedMobTemplatesByZone('z1');
      expect(result).toEqual([MOB_A]);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('z1'),
        expect.any(String),
        'EX',
        86400,
      );
    });
  });

  describe('invalidateStaticCache', () => {
    it('deletes all tracked static cache keys', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([
        'static:zones:all',
        'static:mobs:zone:z1',
      ]);
      vi.mocked(redis.del).mockResolvedValue(2);

      await invalidateStaticCache();
      expect(redis.smembers).toHaveBeenCalledWith('static:__index');
      expect(redis.del).toHaveBeenCalledWith(
        'static:zones:all',
        'static:mobs:zone:z1',
        'static:__index',
      );
    });

    it('does nothing when index set is empty', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([]);
      await invalidateStaticCache();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/__tests__/staticDataCacheService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `apps/api/src/services/staticDataCacheService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';

const TTL = 86400; // 24 hours
const INDEX_KEY = 'static:__index';

/**
 * Cache-through helper for static data. Like cachedQuery but also tracks
 * keys in a Redis Set so invalidateStaticCache can delete them without KEYS.
 */
async function staticCachedQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through
  }

  const result = await fetcher();

  try {
    await redis.set(key, JSON.stringify(result), 'EX', TTL);
    await redis.sadd(INDEX_KEY, key);
  } catch {
    // Best-effort
  }

  return result;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export function getCachedZones() {
  return staticCachedQuery('static:zones:all', () =>
    prisma.zone.findMany({
      orderBy: [{ isStarter: 'desc' }, { difficulty: 'asc' }, { name: 'asc' }],
    }),
  );
}

export function getCachedZoneConnections() {
  return staticCachedQuery('static:connections:all', () =>
    prisma.zoneConnection.findMany({
      select: { fromId: true, toId: true, explorationThreshold: true },
    }),
  );
}

// ---------------------------------------------------------------------------
// Mob Templates
// ---------------------------------------------------------------------------

export function getCachedMobTemplatesByZone(zoneId: string) {
  return staticCachedQuery(`static:mobs:zone:${zoneId}`, () =>
    prisma.mobTemplate.findMany({ where: { zoneId } }),
  );
}

export function getCachedBossMobTemplates() {
  return staticCachedQuery('static:mobs:boss', () =>
    prisma.mobTemplate.findMany({ where: { isBoss: true } }),
  );
}

export function getCachedExpeditionMobTemplates() {
  return staticCachedQuery('static:mobs:expedition', () =>
    prisma.mobTemplate.findMany({ where: { isExpeditionMob: true } }),
  );
}

// ---------------------------------------------------------------------------
// Resource Nodes
// ---------------------------------------------------------------------------

export function getCachedResourceNodesByZone(zoneId: string) {
  return staticCachedQuery(`static:resources:zone:${zoneId}`, () =>
    prisma.resourceNode.findMany({ where: { zoneId } }),
  );
}

// ---------------------------------------------------------------------------
// Zone Mob Families
// ---------------------------------------------------------------------------

export function getCachedZoneMobFamilies(zoneId: string) {
  return staticCachedQuery(`static:zonefamilies:${zoneId}`, () =>
    prisma.zoneMobFamily.findMany({
      where: { zoneId },
      include: {
        mobFamily: {
          include: {
            members: {
              include: {
                mobTemplate: {
                  select: { id: true, name: true, zoneId: true, explorationTier: true },
                },
              },
            },
          },
        },
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Crafting Recipes
// ---------------------------------------------------------------------------

export function getCachedCraftingRecipes() {
  return staticCachedQuery('static:recipes:all', () =>
    prisma.craftingRecipe.findMany({
      include: { resultTemplate: true, mobFamily: { select: { name: true, siteNounLarge: true } } },
      orderBy: [{ requiredLevel: 'asc' }],
    }),
  );
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

export async function invalidateStaticCache(): Promise<void> {
  try {
    const keys = await redis.smembers(INDEX_KEY);
    if (keys.length === 0) return;
    await redis.del(...keys, INDEX_KEY);
  } catch {
    // Best-effort
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/__tests__/staticDataCacheService.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/staticDataCacheService.ts apps/api/src/services/__tests__/staticDataCacheService.test.ts
git commit -m "feat: add staticDataCacheService for Redis caching of seed data

Zones, mob templates, resource nodes, zone connections, zone mob families,
and crafting recipes cached with 24h TTL. Uses Redis Set index for safe
invalidation without KEYS command."
```

---

### Task 3: Replace inline static queries with cached versions

**Files:**
- Modify: `apps/api/src/routes/zones.ts`
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/crafting/recipes.ts`
- Modify: `apps/api/src/services/bossBestiaryService.ts`
- Modify: `apps/api/src/services/eventSchedulerService.ts`
- Modify: `apps/api/src/services/expeditionService.ts`

- [ ] **Step 1: Update `routes/zones.ts`**

Add import at top:
```typescript
import { getCachedZones, getCachedZoneConnections, getCachedMobTemplatesByZone } from '../services/staticDataCacheService';
```

Replace `prisma.zone.findMany` (line ~61) with `getCachedZones()`.
Replace `prisma.zoneConnection.findMany` (line ~64) with `getCachedZoneConnections()`.
Replace `prisma.mobTemplate.findMany({ where: { zoneId: currentZoneId } })` (line ~317) with `getCachedMobTemplatesByZone(currentZoneId)`.

Note: The `getCachedZones()` result is pre-sorted with `orderBy: [{ isStarter: 'desc' }, { difficulty: 'asc' }, { name: 'asc' }]` matching the existing sort. The three `prisma.zone.findMany({ where: { id: { in: discoveredIds } } })` calls at lines ~254, ~527, ~668 are NOT replaced — they are player-specific filtered queries with tiny result sets.

- [ ] **Step 2: Update `routes/combat/start.ts`**

Add import:
```typescript
import { getCachedMobTemplatesByZone } from '../../services/staticDataCacheService';
```

Replace `prisma.mobTemplate.findMany({ where: { zoneId } })` (line ~103) with `getCachedMobTemplatesByZone(zoneId)`.

- [ ] **Step 3: Update `routes/exploration/start.ts`**

Add import:
```typescript
import {
  getCachedMobTemplatesByZone,
  getCachedResourceNodesByZone,
  getCachedZoneMobFamilies,
  getCachedBossMobTemplates,
} from '../../services/staticDataCacheService';
```

Replace in the `Promise.all` block (line ~107-124):
- `prisma.mobTemplate.findMany({ where: { zoneId: body.zoneId } })` → `getCachedMobTemplatesByZone(body.zoneId)`
- `prisma.resourceNode.findMany({ where: { zoneId: body.zoneId } })` → `getCachedResourceNodesByZone(body.zoneId)`
- `prisma.zoneMobFamily.findMany({ where: { zoneId: body.zoneId }, include: ... })` → `getCachedZoneMobFamilies(body.zoneId)`

Replace the boss mob query (line ~662):
- `prisma.mobTemplate.findMany({ where: { isBoss: true, familyMembers: ... } })` → use `getCachedBossMobTemplates()` then filter in memory using the already-fetched `zoneFamilies` which contain the full member tree:
```typescript
const allBossMobs = await getCachedBossMobTemplates();
// zoneFamilies has shape: { mobFamilyId, mobFamily: { members: [{ mobTemplateId }] } }
const familyMobIds = new Set(
  zoneFamilies.flatMap((zf: ZoneFamilyRow) => zf.mobFamily.members.map((m: { mobTemplateId: string }) => m.mobTemplateId)),
);
const bossMobs = allBossMobs.filter(m => familyMobIds.has(m.id));
```

The cached boss list is small (a few entries) so in-memory filtering is negligible.

- [ ] **Step 4: Update `routes/crafting/recipes.ts`**

Add import:
```typescript
import { getCachedCraftingRecipes } from '../../services/staticDataCacheService';
```

Replace `prisma.craftingRecipe.findMany({ include: ... })` (line ~41) with `getCachedCraftingRecipes()`.

- [ ] **Step 5: Update `services/bossBestiaryService.ts`**

Add import:
```typescript
import { getCachedBossMobTemplates } from './staticDataCacheService';
```

Replace `prisma.mobTemplate.findMany({ where: { isBoss: true }, select: ... })` (line ~20) with:
```typescript
const bossMobTemplates = await getCachedBossMobTemplates();
```

The cached version returns full models but the caller only accesses `id`, `name`, `hp`, `accuracy`, `defence`, `bossBaseHp` — TypeScript will type-check field access correctly. No remapping needed.

- [ ] **Step 6: Update `services/eventSchedulerService.ts`**

Add import:
```typescript
import { getCachedZones, getCachedBossMobTemplates, getCachedZoneMobFamilies } from './staticDataCacheService';
```

Replace the two `prisma.zone.findMany({ where: { zoneType: 'wild' } })` calls (lines ~289, ~304) with:
```typescript
const allZones = await getCachedZones();
const wildZones = allZones.filter(z => z.zoneType === 'wild');
```

Replace `prisma.mobTemplate.findMany({ where: { isBoss: true, ... } })` (line ~217) in `trySpawnBoss` — also replace the preceding `prisma.zoneMobFamily.findMany` (line ~211) with `getCachedZoneMobFamilies(zoneId)`, then filter bosses in-memory:
```typescript
const zoneFamilies = await getCachedZoneMobFamilies(zoneId);
const familyIds = zoneFamilies.map(f => f.mobFamilyId);
const allBossMobs = await getCachedBossMobTemplates();
const familyMobIds = new Set(
  zoneFamilies.flatMap(zf => zf.mobFamily.members.map(m => m.mobTemplateId)),
);
const bossMobs = allBossMobs.filter(m => familyMobIds.has(m.id));
```

Also replace `prisma.zoneMobFamily.findMany` in `resolveTarget` (line ~42) with `getCachedZoneMobFamilies(zoneId)`.

**Out of scope for this task:** The multi-zone queries at lines ~131 and ~135 (`where: { zoneId: { in: wildZoneIds } }`) cannot use the per-zone cache without additional logic. Leave these as direct Prisma calls for now.

- [ ] **Step 6b: Update `services/expeditionService.ts`**

Add import:
```typescript
import { getCachedExpeditionMobTemplates } from './staticDataCacheService';
```

Replace `prisma.mobTemplate.findMany({ where: { isExpeditionMob: true } })` (line ~221) with:
```typescript
const allExpeditionMobs = await getCachedExpeditionMobTemplates();
```

For the second call (line ~576) which adds `name: { in: summonNames }`, filter in memory:
```typescript
const allExpeditionMobs = await getCachedExpeditionMobTemplates();
const summonMobs = allExpeditionMobs.filter(m => summonNames.includes(m.name));
```

- [ ] **Step 7: Run existing tests**

```bash
npm run test:api
```

Expected: All existing tests pass. Some tests mock `prisma.zone.findMany` etc. — those tests will need their mocks adjusted IF they import from files that now use the cache service. If tests fail because the new import isn't mocked, add:
```typescript
vi.mock('../services/staticDataCacheService', () => ({
  getCachedZones: vi.fn(),
  getCachedZoneConnections: vi.fn(),
  getCachedMobTemplatesByZone: vi.fn(),
  getCachedResourceNodesByZone: vi.fn(),
  getCachedBossMobTemplates: vi.fn(),
  getCachedExpeditionMobTemplates: vi.fn(),
  getCachedCraftingRecipes: vi.fn(),
  getCachedZoneMobFamilies: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));
```

Then set up return values matching what the original prisma mocks returned.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/ apps/api/src/services/bossBestiaryService.ts apps/api/src/services/eventSchedulerService.ts apps/api/src/services/expeditionService.ts
git commit -m "perf: replace inline static data queries with Redis-cached versions

Zones, mob templates, resource nodes, zone connections, zone mob families,
and crafting recipes now served from Redis cache (24h TTL) via
staticDataCacheService instead of hitting PostgreSQL on every request."
```

---

### Task 4: Cache guild modifiers

**Files:**
- Modify: `apps/api/src/services/guildUpgradeService.ts`
- Modify: `apps/api/src/services/guildUpgradeService.test.ts`

**Reference:**
- Current implementation: `apps/api/src/services/guildUpgradeService.ts:222-323`
- Test file: `apps/api/src/services/guildUpgradeService.test.ts`

- [ ] **Step 1: Add a test for cache behavior**

In `apps/api/src/services/guildUpgradeService.test.ts`, add the cacheService mock at the top (before imports), alongside the existing `vi.mock('@pocketrealm/shared', ...)`:

```typescript
vi.mock('./cacheService', () => ({
  cachedQuery: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  invalidateCache: vi.fn(),
}));
```

Then add a new test in the `getPlayerGuildModifiers` describe block:

```typescript
it('uses cachedQuery with guild:modifiers key', async () => {
  const { cachedQuery } = await import('./cacheService');
  db.guildMember.findUnique.mockResolvedValue(null);

  await getPlayerGuildModifiers(PLAYER_ID);

  expect(cachedQuery).toHaveBeenCalledWith(
    `guild:modifiers:${PLAYER_ID}`,
    expect.any(Function),
    90,
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/guildUpgradeService.test.ts -t "uses cachedQuery"
```

Expected: FAIL — `cachedQuery` is not called.

- [ ] **Step 3: Wrap getPlayerGuildModifiers with cachedQuery**

In `apps/api/src/services/guildUpgradeService.ts`:

Add import:
```typescript
import { cachedQuery } from './cacheService';
```

Rename current `getPlayerGuildModifiers` to `computePlayerGuildModifiers` (keep it non-exported or export for testing). Create a new `getPlayerGuildModifiers` that wraps it:

```typescript
export async function getPlayerGuildModifiers(playerId: string): Promise<PlayerGuildModifiers> {
  return cachedQuery(
    `guild:modifiers:${playerId}`,
    () => computePlayerGuildModifiers(playerId),
    90,
  );
}

async function computePlayerGuildModifiers(playerId: string): Promise<PlayerGuildModifiers> {
  // ... existing implementation (lines 223-323, unchanged)
}
```

- [ ] **Step 4: Run all guild upgrade tests**

```bash
cd apps/api && npx vitest run src/services/guildUpgradeService.test.ts
```

Expected: All tests pass. The mock `cachedQuery` calls through to the fetcher, so all existing tests still exercise the real logic.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/guildUpgradeService.ts apps/api/src/services/guildUpgradeService.test.ts
git commit -m "perf: cache getPlayerGuildModifiers in Redis (90s TTL)

Wraps the 5-query guild modifier computation in cachedQuery to avoid
repeated DB hits on every combat, exploration, crafting, and XP grant."
```

---

### Task 5: Add guild modifier cache invalidation

**Files:**
- Modify: `apps/api/src/services/guildUpgradeService.ts` (activateUpgrade)
- Modify: `apps/api/src/services/guildMembershipService.ts` (join, accept, leave, kick, disband)
- Modify: `apps/api/src/services/guildService.ts` (addGuildXp level-up)
- Modify: `apps/api/src/services/guildSpecializationService.ts` (select, respec)
- Modify: `apps/api/src/services/guildProjectService.ts` (contribute callers)

**Reference for all locations:**
- `apps/api/src/services/guildMembershipService.ts` — look for existing `invalidateGuildIdCache` calls and add `invalidateGuildModifiersForGuild` alongside them

- [ ] **Step 1: Add invalidation helper to guildUpgradeService.ts**

At the bottom of `guildUpgradeService.ts`, add:

```typescript
import { invalidateCache } from './cacheService';

/**
 * Invalidate guild modifier caches for all members of a guild.
 * Call AFTER transactions have committed, never inside them.
 */
export async function invalidateGuildModifiersForGuild(guildId: string): Promise<void> {
  const members = await prisma.guildMember.findMany({
    where: { guildId },
    select: { playerId: true },
  });
  if (members.length > 0) {
    await invalidateCache(...members.map(m => `guild:modifiers:${m.playerId}`));
  }
}

/**
 * Invalidate guild modifier cache for a single player.
 */
export async function invalidateGuildModifiersForPlayer(playerId: string): Promise<void> {
  await invalidateCache(`guild:modifiers:${playerId}`);
}
```

- [ ] **Step 2: Invalidate in activateUpgrade**

In `guildUpgradeService.ts`, in `activateUpgrade` after the transaction returns (after line ~115, before the `return`):

```typescript
  // Transaction committed — safe to invalidate caches
  await invalidateGuildModifiersForGuild(guildId);

  return toUpgradeData(upgrade);
```

- [ ] **Step 3: Invalidate in guildMembershipService.ts**

Add import:
```typescript
import { invalidateGuildModifiersForGuild, invalidateGuildModifiersForPlayer } from './guildUpgradeService';
```

Add invalidation calls after each existing `invalidateGuildIdCache` call:

- `joinGuild`: after `invalidateCache(...)` → add `await invalidateGuildModifiersForPlayer(playerId);`
- `respondToJoinRequest` (accept path): after `invalidateGuildIdCache(...)` → add `await invalidateGuildModifiersForPlayer(request.playerId);`
- `leaveGuild`: after `invalidateGuildIdCache(...)` → add `await invalidateGuildModifiersForPlayer(playerId);`
- `kickMember`: after `invalidateGuildIdCache(...)` → add `await invalidateGuildModifiersForPlayer(targetPlayerId);`
- `disbandGuild`: after the loop that invalidates guild ID caches, reuse the already-fetched `members` array (don't call `invalidateGuildModifiersForGuild` which would re-query members). Add:
  ```typescript
  await invalidateCache(...members.map(m => `guild:modifiers:${m.playerId}`));
  ```
  This must happen BEFORE `prisma.guild.delete` (which cascade-deletes members).

- [ ] **Step 4: Handle `addGuildXp` level-up invalidation (tx-aware)**

`addGuildXp` accepts an optional `tx` parameter. When called inside a transaction (e.g., from `guildProjectService`), we must NOT invalidate inside the transaction — the caller is responsible for invalidating after the transaction commits.

When called standalone (no `tx`), we can invalidate immediately.

**Do NOT add invalidation inside `addGuildXp` itself.** Instead, the function already returns `{ leveledUp }`. Callers that use `addGuildXp` without `tx` should check `leveledUp` and invalidate. Currently the standalone callers are:

- `guildMembershipService.joinGuild` (line ~51) — already handled in Step 3 (player join invalidation covers this)
- `guildMembershipService.respondToJoinRequest` (accept path) — already handled in Step 3

For transaction-wrapped callers (`guildProjectService`), Step 6 handles invalidation post-commit. So this step is covered by Steps 3 and 6 — no changes needed in `guildService.ts` itself.

- [ ] **Step 5: Invalidate in guildSpecializationService.ts**

Add import and invalidate after both `selectSpecialization` and `respecSpecialization` transactions:

```typescript
import { invalidateGuildModifiersForGuild } from './guildUpgradeService';

// After transaction in selectSpecialization:
await invalidateGuildModifiersForGuild(guildId);

// After transaction in respecSpecialization:
await invalidateGuildModifiersForGuild(guildId);
```

- [ ] **Step 6: Invalidate in guildProjectService.ts callers**

Find the functions that call `checkAndCompleteProject` inside a `$transaction` (`contributeTurns`, `contributeMaterials`). `checkAndCompleteProject` runs inside the transaction and calls `addGuildXp(guildId, xpReward, tx)` — which may trigger a level-up. Since the invalidation must happen AFTER the transaction commits, the transaction should return a flag indicating whether the project completed (and potentially leveled up).

After each `$transaction` block commits, add:

```typescript
import { invalidateGuildModifiersForGuild } from './guildUpgradeService';

// After $transaction completes — covers both project perk changes and potential level-up:
if (projectCompleted) {
  await invalidateGuildModifiersForGuild(guildId);
}
```

Adjust based on how the transaction return value currently signals project completion. If it doesn't return this info, add it to the transaction return value.

- [ ] **Step 7: Run all API tests**

```bash
npm run test:api
```

Expected: All pass. If tests fail due to unmocked `invalidateGuildModifiersForGuild`, add it to existing mocks:

```typescript
vi.mock('./guildUpgradeService', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    invalidateGuildModifiersForGuild: vi.fn(),
    invalidateGuildModifiersForPlayer: vi.fn(),
  };
});
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/guildUpgradeService.ts apps/api/src/services/guildMembershipService.ts apps/api/src/services/guildService.ts apps/api/src/services/guildSpecializationService.ts apps/api/src/services/guildProjectService.ts
git commit -m "perf: add guild modifier cache invalidation at all mutation points

Invalidates guild:modifiers:{playerId} cache on: upgrade activation,
guild level-up, specialization change, member join/leave/kick/disband,
and project completion."
```

---

### Task 6: Document connection pool configuration

**Files:**
- Modify: `docs/reference/deployment.md`

- [ ] **Step 1: Add connection pool documentation**

Add a section to `docs/reference/deployment.md`:

```markdown
## Database Connection Pool

Prisma defaults to `num_cpus * 2 + 1` connections. On a 2-core VPS this is only 5,
which can exhaust under moderate load with 145 API endpoints + background schedulers.

Add connection pool parameters to `DATABASE_URL`:

```
DATABASE_URL="postgresql://user:pass@host:5433/pocketrealm?connection_limit=20&pool_timeout=15"
```

- `connection_limit=20`: Tune to stay under PostgreSQL's `max_connections` (default 100)
- `pool_timeout=15`: Seconds to wait for a connection before erroring (default 10)
```

- [ ] **Step 2: Commit**

```bash
git add docs/reference/deployment.md
git commit -m "docs: add database connection pool configuration guidance"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: No new errors (pre-existing `page.tsx:333` error may appear — that's known).

- [ ] **Step 2: Run full test suite**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 3: Build**

```bash
npm run build:api
```

Expected: Build succeeds.
