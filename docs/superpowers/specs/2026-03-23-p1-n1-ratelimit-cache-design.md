# P1: Fix N+1 Queries, Per-Endpoint Rate Limiting, and Cache Headers

**Issue:** #243
**Date:** 2026-03-23

---

## 1. N+1 Query Fixes

### 1.1 guildService.checkGuildAchievementsForAllMembers

**File:** `apps/api/src/services/guildService.ts` (~lines 439-452)

**Problem:** Loops through all guild members sequentially, calling `checkAchievements(playerId)` per member (2+ queries each). A 50-member guild fires 100+ sequential queries.

**Fix:**
- Batch-fetch all member stats in one `findMany` query upfront.
- Create an internal `checkAchievementsWithStats(playerId, stats, statKeys)` variant that accepts pre-loaded stats instead of querying them.
- Batch-insert any newly unlocked achievements via `createMany`.
- Batch activity log emissions (see Section 1.4).

### 1.2 lootService.rollAndGrantLootWithCapacity

**File:** `apps/api/src/services/lootService.ts` (~lines 96-164)

**Problem:** Calls `prisma.item.create()` per non-stackable item in a loop.

**Fix:**
- Collect all non-stackable item data objects into an array during the loop.
- Call `prisma.item.createManyAndReturn({ data: items })` after the loop (Prisma 6.19+ supports this).
- Stackable items still use individual `update` calls (they increment existing rows), but these are typically 0-2 items per loot roll.
- Build the `newItems` response array from the `createManyAndReturn` result.

### 1.3 stashService.depositBatch / withdrawBatch

**File:** `apps/api/src/services/stashService.ts` (~lines 116-166)

**Problem:** Calls `findUnique` per item ID in a loop inside a transaction (2-4 queries per item).

**Fix:**
- Replace per-item `findUnique` with a single `findMany({ where: { id: { in: itemIds } }, include: { template: true, equipment: true } })` at the top of the transaction.
- Build a `Map<id, item>` for O(1) lookup during validation.
- `moveStackableItem` calls remain sequential within the transaction (they modify shared stash state), but the read amplification is eliminated.

### 1.4 achievementService.emitAchievementNotifications

**File:** `apps/api/src/services/achievementService.ts` (~line 274)

**Problem:** Calls `createActivityLog()` sequentially per achievement in a loop.

**Fix:**
- Collect all activity log entries into an array.
- Single `prisma.activityLog.createMany({ data: entries })` call.
- Socket.IO emissions remain per-achievement (in-memory, no DB cost).

---

## 2. Per-Endpoint Rate Limiting

### 2.1 Factory Function

**New file:** `apps/api/src/middleware/rateLimiter.ts`

```typescript
export function createEndpointLimiter(name: string, windowMs: number, max: number)
```

Returns an `express-rate-limit` middleware configured with:
- `RedisStore` from `rate-limit-redis` using the existing `redis` client from `utils/redis.ts`.
- Key prefix: `rl:${name}:` (namespaced to avoid collisions).
- Consistent error response: `{ error: 'Too many requests, please try again later', code: 'RATE_LIMITED' }`.
- `standardHeaders: true`, `legacyHeaders: false` (matches existing convention).

### 2.2 Endpoint Limits

Applied at the router level (not individual routes):

| Router | Key Prefix | Limit | Scope |
|--------|-----------|-------|-------|
| pvp | `rl:pvp:` | 10/min | All PvP routes (challenge, accept, scout) |
| combat/start | `rl:combat:` | 30/min | Combat start sub-router only |
| crafting | `rl:crafting:` | 20/min | Craft/forge/salvage (not recipe reads) |
| exploration | `rl:exploration:` | 30/min | All exploration routes |
| casino | `rl:casino:` | 30/min | POST routes only (bets, exchange — not GET history/stats) |

The global 120/min limiter remains as an outer bound on top of these.

---

## 3. Redis Store Migration

### 3.1 Express Rate Limiters

**New dependency:** `rate-limit-redis`

Migrate all `express-rate-limit` instances to `RedisStore`:

| Limiter | File | Current Store | Key Prefix |
|---------|------|--------------|------------|
| Global (120/min) | `apps/api/src/index.ts:113-120` | In-memory | `rl:global:` |
| Login (10/15min) | `apps/api/src/routes/auth.ts:19-25` | In-memory | `rl:login:` |
| All new per-endpoint limiters | Various route files | N/A (new) | `rl:${name}:` |

The login limiter will be refactored to use `createEndpointLimiter('login', 15 * 60_000, 10)`.

### 3.2 Chat Rate Limiter

**File:** `apps/api/src/services/chatService.ts` (~lines 6-22)

The chat limiter is a custom `Map<string, number>` implementation used inside Socket.IO handlers (not Express middleware). Cannot use `express-rate-limit`.

**Fix:**
- Replace `Map.get`/`Map.set` with `redis.set(key, '1', 'PX', limitMs, 'NX')`.
- `NX` flag: returns `'OK'` if key didn't exist (allowed), `null` if it did (rate limited). Single atomic operation, no get+set race condition.
- Delete the `lastSendTimes` map entirely.
- Uses the existing `redis` client from `utils/redis.ts`.

---

## 4. Cache-Control Headers

Inline `res.set('Cache-Control', ...)` in each handler. No middleware abstraction needed for 4+1 endpoints.

| Endpoint | File | Header | Rationale |
|----------|------|--------|-----------|
| `GET /bestiary` | `routes/bestiary.ts` | `private, max-age=300` | Mob templates rarely change; player-specific discovery state |
| `GET /zones` | `routes/zones.ts` | `private, max-age=60` | Mostly static but includes player discovery state |
| `GET /crafting/recipes` | `routes/crafting/recipes.ts` | `private, max-age=300` | Static game data filtered by player skill |
| `GET /leaderboard/:category` | `routes/leaderboard.ts` | `private, max-age=60` | Updates frequently, 60s staleness acceptable |
| `GET /leaderboard/categories` | `routes/leaderboard.ts` | `public, max-age=3600` | Truly static, unauthenticated |

`private` is used for authenticated endpoints because the responses contain player-specific data and should only be cached by the browser, not shared caches (CDNs/proxies).

---

## 5. Testing Strategy

No new test files. These are internal optimizations that preserve external behavior.

- **N+1 fixes:** Same inputs/outputs, fewer queries. Existing service/API tests validate correctness.
- **Rate limiters:** No existing rate limit tests. Adding them would require Redis in the test environment — out of scope.
- **Cache headers:** Simple static strings, low value in testing.

**Verification:** `npm run test` (all existing tests pass), `npm run typecheck`, manual spot-check of batch behavior.

---

## 6. Dependencies

**New npm package:** `rate-limit-redis` (for `express-rate-limit` Redis store)

**New file:** `apps/api/src/middleware/rateLimiter.ts` (factory function)

**Modified files:**
- `apps/api/src/services/guildService.ts`
- `apps/api/src/services/lootService.ts`
- `apps/api/src/services/stashService.ts`
- `apps/api/src/services/achievementService.ts`
- `apps/api/src/services/chatService.ts`
- `apps/api/src/index.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/bestiary.ts`
- `apps/api/src/routes/zones.ts`
- `apps/api/src/routes/crafting/recipes.ts`
- `apps/api/src/routes/leaderboard.ts`
- `apps/api/src/routes/pvp.ts`
- `apps/api/src/routes/combat/start.ts` (or combat index)
- `apps/api/src/routes/crafting.ts` (parent router)
- `apps/api/src/routes/exploration/index.ts`
- `apps/api/src/routes/casino.ts`
