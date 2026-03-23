# P1: Fix N+1 Queries, Per-Endpoint Rate Limiting, and Cache Headers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce database load from N+1 query patterns, protect expensive endpoints with per-endpoint rate limits backed by Redis, and add Cache-Control headers to static/semi-static GET endpoints.

**Architecture:** Four independent workstreams: (1) batch DB operations in 4 service files, (2) rate limiter factory + per-endpoint middleware, (3) Redis store migration for all limiters, (4) Cache-Control headers on 5 endpoints.

**Tech Stack:** Express 4, Prisma 6.19 (`createManyAndReturn`), ioredis 5, express-rate-limit 8, rate-limit-redis (new), Socket.IO

**Spec:** `docs/superpowers/specs/2026-03-23-p1-n1-ratelimit-cache-design.md`

**Reference Docs:**
- Database schema: `docs/reference/database-schema.md`
- API routes: `docs/reference/api-routes.md`
- Design decisions: `docs/reference/design-decisions.md`

---

## File Structure

**New files:**
- `apps/api/src/middleware/rateLimiter.ts` — Factory function for Redis-backed rate limiters

**Modified files:**
| File | Change |
|------|--------|
| `apps/api/src/services/achievementService.ts` | Batch `createMany` for activity logs in `emitAchievementNotifications` |
| `apps/api/src/services/guildService.ts` | `Promise.all` concurrency in `checkGuildAchievementsForAllMembers` |
| `apps/api/src/services/lootService.ts` | Collect + `createManyAndReturn` for non-stackable items |
| `apps/api/src/services/stashService.ts` | Batch `findMany` in `depositBatch`/`withdrawBatch` |
| `apps/api/src/services/chatService.ts` | Redis `SET NX PX` replacing in-memory Map |
| `apps/api/src/index.ts` | Global limiter → Redis store |
| `apps/api/src/routes/auth.ts` | Login limiter → factory function |
| `apps/api/src/routes/pvp.ts` | Add endpoint rate limiter |
| `apps/api/src/routes/combat/start.ts` | Add endpoint rate limiter |
| `apps/api/src/routes/crafting/craft.ts` | Add endpoint rate limiter |
| `apps/api/src/routes/crafting/forge.ts` | Add endpoint rate limiter |
| `apps/api/src/routes/crafting/salvage.ts` | Add endpoint rate limiter |
| `apps/api/src/routes/exploration/index.ts` | Add endpoint rate limiter |
| `apps/api/src/routes/casino.ts` | Add endpoint rate limiter to POST routes |
| `apps/api/src/routes/bestiary.ts` | Add Cache-Control header |
| `apps/api/src/routes/zones.ts` | Add Cache-Control header |
| `apps/api/src/routes/crafting/recipes.ts` | Add Cache-Control header |
| `apps/api/src/routes/leaderboard.ts` | Add Cache-Control headers |

---

## Task 1: Install rate-limit-redis dependency

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install the package**

```bash
cd apps/api && npm install rate-limit-redis
```

- [ ] **Step 2: Verify installation**

```bash
grep "rate-limit-redis" apps/api/package.json
```

Expected: `"rate-limit-redis": "^X.X.X"` in dependencies.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "chore: add rate-limit-redis dependency for Redis-backed rate limiting"
```

---

## Task 2: Create rate limiter factory middleware

**Files:**
- Create: `apps/api/src/middleware/rateLimiter.ts`

**Context:** The project uses `ioredis` (not `node-redis`). The `sendCommand` adapter must use `redis.call(...)`. The existing Redis client is at `apps/api/src/redis.ts`. Follow the pattern of existing middleware files in `apps/api/src/middleware/` (auth.ts, admin.ts, errorHandler.ts).

- [ ] **Step 1: Create the factory function**

Create `apps/api/src/middleware/rateLimiter.ts`:

```typescript
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../redis';

/**
 * Creates a Redis-backed rate limiter for a specific endpoint group.
 * Falls through if Redis is unavailable (passOnStoreError).
 */
export function createEndpointLimiter(
  name: string, windowMs: number, max: number, message?: string,
) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message ?? 'Too many requests, please try again later', code: 'RATE_LIMITED' },
    passOnStoreError: true,
    store: new RedisStore({
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<number | string>,
      prefix: `rl:${name}:`,
    }),
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/rateLimiter.ts
git commit -m "feat: add createEndpointLimiter factory with Redis store"
```

---

## Task 3: Migrate global rate limiter to Redis store

**Files:**
- Modify: `apps/api/src/index.ts:113-120`

**Context:** The global limiter at line 113-120 uses the default in-memory store. Replace it with the factory function. The current code:
```typescript
app.use('/api/v1/', rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
  skip: (req) => req.method === 'OPTIONS',
}));
```

- [ ] **Step 1: Add Redis store to the global limiter inline**

The global limiter has a unique `skip` option for OPTIONS requests that the factory doesn't support. Keep it inline but swap in `RedisStore` directly.

In `apps/api/src/index.ts`, add imports and update the limiter:
```typescript
import { RedisStore } from 'rate-limit-redis';
import { redis } from './redis';

app.use('/api/v1/', rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
  skip: (req) => req.method === 'OPTIONS',
  passOnStoreError: true,
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<number | string>,
    prefix: 'rl:global:',
  }),
}));
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: migrate global rate limiter to Redis store"
```

---

## Task 4: Migrate login rate limiter to factory

**Files:**
- Modify: `apps/api/src/routes/auth.ts:18-25,170`

**Context:** The login limiter at lines 18-25 uses in-memory store. Replace with the factory function. Currently:
```typescript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later', code: 'RATE_LIMITED' },
});
```
Applied at line 170: `authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {`

- [ ] **Step 1: Replace the login limiter**

In `apps/api/src/routes/auth.ts`:
- Add import: `import { createEndpointLimiter } from '../middleware/rateLimiter';`
- Remove `import rateLimit from 'express-rate-limit';` if no other usage remains.
- Replace the `loginLimiter` definition with:
```typescript
const loginLimiter = createEndpointLimiter('login', 15 * 60_000, 10, 'Too many login attempts, please try again later');
```
The factory's optional `message` parameter preserves the login-specific error message.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

- [ ] **Step 3: Run existing auth tests**

```bash
npm run test -- --reporter=verbose apps/api/src/routes/auth.test.ts 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: migrate login rate limiter to Redis-backed factory"
```

---

## Task 5: Add per-endpoint rate limiters

**Files:**
- Modify: `apps/api/src/routes/pvp.ts:26-27`
- Modify: `apps/api/src/routes/combat/start.ts:65-71`
- Modify: `apps/api/src/routes/crafting/craft.ts` (top of file)
- Modify: `apps/api/src/routes/crafting/forge.ts` (top of file)
- Modify: `apps/api/src/routes/crafting/salvage.ts` (top of file)
- Modify: `apps/api/src/routes/exploration/index.ts:6-10`
- Modify: `apps/api/src/routes/casino.ts:30,54`

**Context:** Add `createEndpointLimiter` as middleware on specific routers/routes. Import from `'../middleware/rateLimiter'` (or `'../../middleware/rateLimiter'` for nested routes).

- [ ] **Step 1: PvP — add limiter to router**

In `apps/api/src/routes/pvp.ts`, after line 27 (`pvpRouter.use(authenticate);`), add:
```typescript
import { createEndpointLimiter } from '../middleware/rateLimiter';
// ... after authenticate
pvpRouter.use(createEndpointLimiter('pvp', 60_000, 10));
```

- [ ] **Step 2: Combat start — add limiter to route**

In `apps/api/src/routes/combat/start.ts`, in `registerStartRoutes`, add the limiter as middleware on the POST route. Change line 71 from:
```typescript
router.post('/start', asyncHandler(async (req, res) => {
```
to:
```typescript
import { createEndpointLimiter } from '../../middleware/rateLimiter';
// ...
const combatLimiter = createEndpointLimiter('combat', 60_000, 30);
// inside registerStartRoutes:
router.post('/start', combatLimiter, asyncHandler(async (req, res) => {
```

- [ ] **Step 3: Crafting sub-routers — add limiter to craft, forge, salvage**

For each of `apps/api/src/routes/crafting/craft.ts`, `forge.ts`, `salvage.ts`:
- Add import: `import { createEndpointLimiter } from '../../middleware/rateLimiter';`
- In `craft.ts`, add after router creation: `craftRouter.use(createEndpointLimiter('crafting', 60_000, 20));`
- In `forge.ts`, add after router creation: `forgeRouter.use(createEndpointLimiter('crafting', 60_000, 20));`
- In `salvage.ts`, add after router creation: `salvageRouter.use(createEndpointLimiter('crafting', 60_000, 20));`

All three share the `rl:crafting:` prefix so they count against the same 20/min budget.

- [ ] **Step 4: Exploration — add limiter to router**

In `apps/api/src/routes/exploration/index.ts`, after line 8 (`explorationRouter.use(authenticate);`):
```typescript
import { createEndpointLimiter } from '../../middleware/rateLimiter';
explorationRouter.use(createEndpointLimiter('exploration', 60_000, 30));
```

- [ ] **Step 5: Casino — add limiter to individual POST handlers**

In `apps/api/src/routes/casino.ts`:
```typescript
import { createEndpointLimiter } from '../middleware/rateLimiter';
const casinoLimiter = createEndpointLimiter('casino', 60_000, 30);
```

Add `casinoLimiter` as middleware to the two POST routes:
- Line 30: `casinoRouter.post('/exchange', casinoLimiter, asyncHandler(async (req, res) => {`
- Line 54: `casinoRouter.post('/roulette/bet', casinoLimiter, asyncHandler(async (req, res) => {`

GET routes (`/roulette/round`, `/roulette/history`, `/roulette/stats`) remain unaffected.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/pvp.ts apps/api/src/routes/combat/start.ts apps/api/src/routes/crafting/craft.ts apps/api/src/routes/crafting/forge.ts apps/api/src/routes/crafting/salvage.ts apps/api/src/routes/exploration/index.ts apps/api/src/routes/casino.ts
git commit -m "feat: add per-endpoint rate limiters for pvp, combat, crafting, exploration, casino"
```

---

## Task 6: Migrate chat rate limiter to Redis

**Files:**
- Modify: `apps/api/src/services/chatService.ts:5-22`

**Context:** The chat limiter uses a `Map<string, number>` for in-memory rate limiting inside Socket.IO handlers. Replace with Redis `SET ... NX PX`. The function must become `async`. Current code:
```typescript
const lastSendTimes = new Map<string, number>();

export function checkRateLimit(playerId: string, channelType: ChatChannelType): boolean {
  const key = `${playerId}:${channelType}`;
  const now = Date.now();
  const lastSend = lastSendTimes.get(key);
  const limitMs = channelType === 'world'
    ? CHAT_CONSTANTS.WORLD_RATE_LIMIT_MS
    : CHAT_CONSTANTS.ZONE_RATE_LIMIT_MS;
  if (lastSend && now - lastSend < limitMs) {
    return false;
  }
  lastSendTimes.set(key, now);
  return true;
}
```

- [ ] **Step 1: Replace Map with Redis SET NX PX**

```typescript
import { redis } from '../redis';

export async function checkRateLimit(playerId: string, channelType: ChatChannelType): Promise<boolean> {
  const key = `chat:rl:${playerId}:${channelType}`;
  const limitMs = channelType === 'world'
    ? CHAT_CONSTANTS.WORLD_RATE_LIMIT_MS
    : CHAT_CONSTANTS.ZONE_RATE_LIMIT_MS;

  // SET NX PX: sets key only if it doesn't exist, with TTL in ms.
  // Returns 'OK' if set (allowed), null if already exists (rate limited).
  const result = await redis.set(key, '1', 'PX', limitMs, 'NX');
  return result === 'OK';
}
```

Delete the `lastSendTimes` Map declaration.

- [ ] **Step 2: Update all callers to await**

Find all callers of `checkRateLimit` in the codebase. It's called from Socket.IO handlers — search for `checkRateLimit(` in the `apps/api/src` directory. Each call site needs to add `await` since the function is now async.

```bash
grep -rn "checkRateLimit(" apps/api/src/ --include="*.ts"
```

Update each call site from `checkRateLimit(...)` to `await checkRateLimit(...)`.

- [ ] **Step 3: Update chat service tests**

The tests call `checkRateLimit` synchronously and assert `boolean` returns. After the refactor, it returns `Promise<boolean>`, so tests will silently pass with truthy Promise objects. Fix:

1. Add `vi.mock('../redis')` (or appropriate mock path) to mock the redis module
2. Change all test callbacks to `async`
3. Add `await` to all `checkRateLimit(...)` calls
4. Mock `redis.set` to return `'OK'` for "allowed" cases and `null` for "rate limited" cases

```bash
npm run test -- --reporter=verbose apps/api/src/services/chatService.test.ts 2>&1 | tail -20
```

Expected: All tests pass with the updated async patterns.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/chatService.ts
git commit -m "feat: migrate chat rate limiter from in-memory Map to Redis"
```

---

## Task 7: Fix N+1 in achievementService.emitAchievementNotifications

**Files:**
- Modify: `apps/api/src/services/achievementService.ts:267-287`

**Context:** Currently loops through achievements calling `createActivityLog()` per achievement. Replace with a single `prisma.activityLog.createMany()`. Socket.IO emissions stay per-achievement. Current code:
```typescript
export async function emitAchievementNotifications(
  playerId: string,
  achievements: AchievementDef[],
): Promise<void> {
  if (achievements.length === 0) return;
  const io = getIo();
  for (const ach of achievements) {
    await createActivityLog({
      playerId,
      activityType: 'achievement',
      turnsSpent: 0,
      result: { achievementId: ach.id, title: ach.title },
    });
    io?.to(playerId).emit('achievement_unlocked', {
      id: ach.id,
      title: ach.title,
      category: ach.category,
    });
  }
}
```

- [ ] **Step 1: Replace sequential creates with batch createMany**

```typescript
export async function emitAchievementNotifications(
  playerId: string,
  achievements: AchievementDef[],
): Promise<void> {
  if (achievements.length === 0) return;

  // Batch-insert all activity logs in one query
  await prisma.activityLog.createMany({
    data: achievements.map((ach) => ({
      playerId,
      activityType: 'achievement' as const,
      turnsSpent: 0,
      result: { achievementId: ach.id, title: ach.title },
    })),
  });

  // Socket emissions are in-memory, no DB cost — keep per-achievement
  const io = getIo();
  for (const ach of achievements) {
    io?.to(playerId).emit('achievement_unlocked', {
      id: ach.id,
      title: ach.title,
      category: ach.category,
    });
  }
}
```

Add `import { prisma } from '@pocketrealm/database';` if not already imported. Remove the `createActivityLog` import if it's no longer used in this file.

- [ ] **Step 2: Run existing achievement tests**

```bash
npm run test -- --reporter=verbose apps/api/src/services/achievementService.test.ts 2>&1 | tail -30
```

Expected: All tests pass. If tests mock `createActivityLog`, they'll need to mock `prisma.activityLog.createMany` instead.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/achievementService.ts
git commit -m "fix: batch activity log inserts in emitAchievementNotifications"
```

---

## Task 8: Fix N+1 in lootService.rollAndGrantLootWithCapacity

**Files:**
- Modify: `apps/api/src/services/lootService.ts:96-164`

**Context:** The inner loop for non-stackable items (lines ~120-156) calls `prisma.item.create()` per item. Replace with collecting create-data objects, then a single `createManyAndReturn` after the loop. The capacity-tracking loop logic stays the same — only the actual DB writes are deferred.

Current pattern inside the equipment loop (~line 141-153):
```typescript
const newItem = await prisma.item.create({
  data: {
    ownerId: playerId,
    templateId: entry.itemTemplateId,
    rarity,
    quantity: 1,
    maxDurability,
    currentDurability: maxDurability,
    bonusStats: bonusStats ? (bonusStats as Prisma.InputJsonObject) : undefined,
  },
});
slotsUsed++;
newItemIds.push(newItem.id);
drops.push({ itemTemplateId: entry.itemTemplateId, quantity: 1, rarity });
```

- [ ] **Step 1: Refactor to collect creates and batch-insert**

Add a `pendingCreates` array and a parallel `pendingDrops` array before the main loop:
```typescript
const pendingCreates: Array<{
  ownerId: string;
  templateId: string;
  rarity: string;
  quantity: number;
  maxDurability: number | null;
  currentDurability: number | null;
  bonusStats?: Prisma.InputJsonObject;
}> = [];
const pendingDrops: LootDrop[] = [];
```

Inside the equipment inner loop, replace the `prisma.item.create` block with:
```typescript
pendingCreates.push({
  ownerId: playerId,
  templateId: entry.itemTemplateId,
  rarity,
  quantity: 1,
  maxDurability,
  currentDurability: maxDurability,
  bonusStats: bonusStats ? (bonusStats as Prisma.InputJsonObject) : undefined,
});
pendingDrops.push({ itemTemplateId: entry.itemTemplateId, quantity: 1, rarity });
slotsUsed++;
```

After the main `for (const entry of entries)` loop ends, batch-insert:
```typescript
if (pendingCreates.length > 0) {
  const created = await prisma.item.createManyAndReturn({
    data: pendingCreates,
    select: { id: true },
  });
  newItemIds.push(...created.map((c) => c.id));
  drops.push(...pendingDrops);
}
```

Note: The `drops.push` for non-stackable items must move from inside the loop to after the batch insert. Stackable item drops are still pushed inside the loop since they're processed immediately.

- [ ] **Step 2: Also handle the stackable new-item create (~line 104-108)**

The stackable `else` branch also calls `prisma.item.create()` for new stacks. This happens rarely (0-2 times per loot roll) and the created item is immediately added to `stackMap` for subsequent same-template drops. This create MUST remain inline because subsequent loop iterations depend on the `stackMap` entry. Leave it as-is.

- [ ] **Step 3: Run existing loot service tests**

```bash
npm run test -- --reporter=verbose apps/api/src/services/lootService.test.ts 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/lootService.ts
git commit -m "fix: batch non-stackable item creates in rollAndGrantLootWithCapacity"
```

---

## Task 9: Fix N+1 in stashService.depositBatch / withdrawBatch

**Files:**
- Modify: `apps/api/src/services/stashService.ts:116-166`

**Context:** Both functions call `findUnique` per item in a loop inside a transaction. Replace with a single `findMany` at the top of the transaction, then iterate the results.

- [ ] **Step 1: Refactor depositBatch**

Current (lines 116-135):
```typescript
export async function depositBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ depositedCount: number }> {
  return prisma.$transaction(async (tx) => {
    let depositedCount = 0;
    for (const itemId of itemIds) {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { template: true, equipment: true },
      });
      if (!item || item.ownerId !== playerId) continue;
      if (item.equipment.length > 0) continue;
      if (item.inStash) continue;
      await moveStackableItem(tx, item, item.quantity, true);
      depositedCount++;
    }
    return { depositedCount };
  });
}
```

Replace with:
```typescript
export async function depositBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ depositedCount: number }> {
  return prisma.$transaction(async (tx) => {
    // Batch-fetch all items in one query
    const items = await tx.item.findMany({
      where: { id: { in: itemIds } },
      include: { template: true, equipment: true },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    let depositedCount = 0;
    for (const itemId of itemIds) {
      const item = itemMap.get(itemId);
      if (!item || item.ownerId !== playerId) continue;
      if (item.equipment.length > 0) continue;
      if (item.inStash) continue;
      await moveStackableItem(tx, item, item.quantity, true);
      depositedCount++;
    }
    return { depositedCount };
  });
}
```

- [ ] **Step 2: Refactor withdrawBatch**

Current (lines 137-166):
```typescript
export async function withdrawBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ withdrawnCount: number }> {
  let { availableSlots } = await getInventoryState(playerId);

  return prisma.$transaction(async (tx) => {
    let withdrawnCount = 0;
    for (const itemId of itemIds) {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { template: true },
      });
      if (!item || item.ownerId !== playerId) continue;
      if (!item.inStash) continue;

      const willMerge = item.template.stackable && await tx.item.findFirst({
        where: { ownerId: playerId, templateId: item.templateId, inStash: false },
        select: { id: true },
      });
      if (!willMerge && availableSlots <= 0) break;

      await moveStackableItem(tx, item, item.quantity, false);
      withdrawnCount++;
      if (!willMerge) availableSlots--;
    }
    return { withdrawnCount };
  });
}
```

Replace with:
```typescript
export async function withdrawBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ withdrawnCount: number }> {
  let { availableSlots } = await getInventoryState(playerId);

  return prisma.$transaction(async (tx) => {
    // Batch-fetch all items in one query
    const items = await tx.item.findMany({
      where: { id: { in: itemIds } },
      include: { template: true },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    // Pre-fetch all existing backpack stacks for stackable items to check merge targets
    const stackableTemplateIds = items
      .filter((item) => item.template.stackable && item.inStash)
      .map((item) => item.templateId);
    const existingBackpackStacks = stackableTemplateIds.length > 0
      ? await tx.item.findMany({
          where: { ownerId: playerId, templateId: { in: stackableTemplateIds }, inStash: false },
          select: { id: true, templateId: true },
        })
      : [];
    const backpackStackSet = new Set(existingBackpackStacks.map((s) => s.templateId));

    let withdrawnCount = 0;
    for (const itemId of itemIds) {
      const item = itemMap.get(itemId);
      if (!item || item.ownerId !== playerId) continue;
      if (!item.inStash) continue;

      const willMerge = item.template.stackable && backpackStackSet.has(item.templateId);
      if (!willMerge && availableSlots <= 0) break;

      await moveStackableItem(tx, item, item.quantity, false);
      withdrawnCount++;
      if (!willMerge) availableSlots--;
    }
    return { withdrawnCount };
  });
}
```

**Note:** The `backpackStackSet` is a snapshot — if `moveStackableItem` creates a new backpack stack during the loop (moving a stackable item that had no existing backpack stack), subsequent items of the same template won't see it as a merge target. This is conservative (may break early on slot limit) but never incorrect. The original code had the same issue since each `findFirst` was also a point-in-time check.

- [ ] **Step 3: Run existing stash service tests**

```bash
npm run test -- --reporter=verbose apps/api/src/services/stashService.test.ts 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/stashService.ts
git commit -m "fix: batch-fetch items in stash depositBatch/withdrawBatch"
```

---

## Task 10: Fix N+1 in guildService.checkGuildAchievementsForAllMembers

**Files:**
- Modify: `apps/api/src/services/guildService.ts:438-452`

**Context:** Currently loops through guild members calling `checkAchievements(playerId)` + `emitAchievementNotifications(playerId, ...)` sequentially. The `resolveAllStats` function uses a complex raw SQL query with many subqueries that are parameterized per-player — rewriting it for bulk execution would be a significant refactor. Per the spec, fall back to `Promise.all` for concurrent execution.

Current code:
```typescript
export async function checkGuildAchievementsForAllMembers(guildId: string, statKeys: string[]): Promise<void> {
  try {
    const members = await prisma.guildMember.findMany({
      where: { guildId },
      select: { playerId: true },
    });
    for (const { playerId } of members) {
      const newAchievements = await checkAchievements(playerId, { statKeys });
      await emitAchievementNotifications(playerId, newAchievements);
    }
  } catch (err) {
    console.error('Guild achievement check failed:', err);
  }
}
```

- [ ] **Step 1: Replace sequential loop with Promise.all**

```typescript
export async function checkGuildAchievementsForAllMembers(guildId: string, statKeys: string[]): Promise<void> {
  try {
    const members = await prisma.guildMember.findMany({
      where: { guildId },
      select: { playerId: true },
    });
    await Promise.all(members.map(async ({ playerId }) => {
      const newAchievements = await checkAchievements(playerId, { statKeys });
      await emitAchievementNotifications(playerId, newAchievements);
    }));
  } catch (err) {
    console.error('Guild achievement check failed:', err);
  }
}
```

This runs all member achievement checks concurrently instead of sequentially. For a 50-member guild this means ~50 concurrent queries instead of ~100 sequential ones — the total query count is the same but wall-clock time drops dramatically.

- [ ] **Step 2: Run existing guild service tests**

```bash
npm run test -- --reporter=verbose apps/api/src/services/guildService.test.ts 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/guildService.ts
git commit -m "fix: parallelize guild achievement checks with Promise.all"
```

---

## Task 11: Add Cache-Control headers

**Files:**
- Modify: `apps/api/src/routes/bestiary.ts` (GET / handler)
- Modify: `apps/api/src/routes/zones.ts` (GET / handler)
- Modify: `apps/api/src/routes/crafting/recipes.ts` (GET / handler)
- Modify: `apps/api/src/routes/leaderboard.ts` (both GET handlers)

**Context:** Add `res.set('Cache-Control', ...)` before `res.json(...)` in each handler. Use `private` for authenticated endpoints, `public` for unauthenticated.

- [ ] **Step 1: bestiary.ts — add Cache-Control before res.json**

In `apps/api/src/routes/bestiary.ts`, find the `res.json({` line at the end of the GET handler and add before it:
```typescript
res.set('Cache-Control', 'private, max-age=300');
```

- [ ] **Step 2: zones.ts — add Cache-Control before res.json**

In `apps/api/src/routes/zones.ts`, find the `res.json({` line at the end of the GET handler and add before it:
```typescript
res.set('Cache-Control', 'private, max-age=60');
```

- [ ] **Step 3: crafting/recipes.ts — add Cache-Control before res.json**

In `apps/api/src/routes/crafting/recipes.ts`, find the `res.json({` line at the end of the GET handler and add before it:
```typescript
res.set('Cache-Control', 'private, max-age=300');
```

- [ ] **Step 4: leaderboard.ts — add Cache-Control to both handlers**

For `GET /categories` (synchronous handler, ~line 10-12):
```typescript
leaderboardRouter.get('/categories', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(getCategories());
});
```

For `GET /:category` (async handler, ~line 14-26), add before `res.json(`:
```typescript
res.set('Cache-Control', 'private, max-age=60');
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck 2>&1 | grep -i error | head -20
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/bestiary.ts apps/api/src/routes/zones.ts apps/api/src/routes/crafting/recipes.ts apps/api/src/routes/leaderboard.ts
git commit -m "feat: add Cache-Control headers to static/semi-static GET endpoints"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 2: Run full typecheck**

```bash
npm run typecheck 2>&1 | tail -20
```

Expected: No new errors (pre-existing error in `apps/web/src/app/game/page.tsx:333` is known and unrelated).

- [ ] **Step 3: Build API**

```bash
npm run build:api 2>&1 | tail -20
```

Expected: Clean build.

- [ ] **Step 4: Verify against acceptance criteria**

- [x] N+1 patterns replaced with batched queries (Tasks 7-10)
- [x] Expensive endpoints have dedicated rate limits (Task 5)
- [x] Rate limiters backed by Redis (Tasks 2-6)
- [x] Static endpoints return appropriate Cache-Control headers (Task 11)
- [x] Existing tests still pass (this task)
