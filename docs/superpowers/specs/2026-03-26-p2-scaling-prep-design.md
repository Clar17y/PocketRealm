# P2: Scaling Prep — Design Spec

**Issue:** #244
**Date:** 2026-03-26
**Context:** Single-instance deployment, ~100 players at launch. These are forward-looking safety nets, not fixes for active problems.

---

## 1. Redis Client Resilience

**File:** `apps/api/src/redis.ts`

The Redis singleton currently has no reconnect strategy, error handling, or graceful shutdown.

### Changes

- **Retry strategy:** Exponential backoff starting at 100ms, capped at 5s, max 10 retries before logging fatal and exiting the process.
- **`maxRetriesPerRequest: 3`** so individual commands fail fast rather than queueing indefinitely.
- **Error/reconnect logging:** `redis.on('error', ...)` and `redis.on('reconnecting', ...)` with `console.error`/`console.warn`.
- **Graceful shutdown:** Add a `SIGTERM` handler in `apps/api/src/index.ts` that calls `redis.quit()` alongside `server.close()`.

### Why this is safe

`cacheService.ts` already swallows Redis errors with try/catch, so transient failures remain non-fatal for cache reads/writes. Leaderboard refresh writes surface errors through the existing `console.error` catches in `refreshAllLeaderboards`.

---

## 2. Leaderboard Cursor-Based Pagination

**File:** `apps/api/src/services/leaderboardService.ts`

Every refresh function does an unbounded `findMany()`. At scale, this loads all rows into memory at once.

### Changes

Add a generic `paginatedFindMany` helper that iterates a Prisma model in batches of 500 rows using cursor-based pagination (`cursor` + `skip: 1` + `take: 500`).

Apply to **all** refresh functions consistently:

| Function | Model | Notes |
|---|---|---|
| `refreshPvp` | `pvpRating` | Paginate, process per batch |
| `refreshProgression` | `player` | Paginate, process per batch |
| `refreshSkills` | `playerSkill` | Paginate, accumulate per-skill + total maps across batches |
| `refreshCombat` | `playerBestiary` | Paginate, accumulate kill totals across batches |
| `refreshCombat` (boss) | `bossParticipant` | Paginate, accumulate damage totals across batches |
| `refreshGuilds` | `guild` | Paginate for consistency |
| `refreshCasino` | N/A (raw SQL) | Already bounded by aggregation, no change |

### What stays the same

- `writeToZset` receives the full array per category after batching completes. Batching controls DB memory pressure, not Redis memory.
- The `getLeaderboard` read path is already paginated via Redis `ZREVRANGE`.
- No API contract changes.

### Batch size constant

Add `LEADERBOARD_BATCH_SIZE: 500` to `LEADERBOARD_CONSTANTS` in `packages/shared/src/constants/gameConstants.ts`.

---

## 3. Unbounded Query Limits

Add `take` limits to queries that currently return unbounded result sets. No cursor/pagination response fields — just hard caps.

### Changes

| Location | Current | Fix |
|---|---|---|
| `pvpService.getNotifications` | All unread PvP notifications | Add `take: 50` (newest first via existing `orderBy`) |
| `pvpService.getScoutNotifications` | All unread scout notifications | Add `take: 50` (newest first via existing `orderBy`) |
| `GET /bestiary` route | All mob templates + includes | Add `take: 200` safety cap (~50 mobs now) |
| `GET /inventory` route | All player items + template include | Add `take: 100` per-player guard |

### Constants

Add to `gameConstants.ts`:

- `MAX_PVP_NOTIFICATIONS: 50`
- `MAX_BESTIARY_RESULTS: 200`
- `MAX_INVENTORY_RESULTS: 100`

### UX impact

None. If a player has 200+ unread PvP notifications, they see the 50 most recent. Bestiary and inventory caps are well above current maximums.

---

## 4. Socket Connection Cache

**File:** `apps/api/src/socket/chatHandlers.ts` (lines 52-71)

Every socket connection fires 2 DB queries to determine room joins (player zone + guild membership). A reconnect storm would spike DB load.

### Changes

**Guild lookup:** Replace the raw `prisma.guildMember.findUnique()` with the existing `getPlayerGuildId(playerId)` from `guildService.ts`, which already uses `cachedQuery` with key `guild:member:{playerId}`.

**Zone lookup:** Add a new `getPlayerZoneId(playerId)` function following the same `cachedQuery` pattern:
- Cache key: `player:zone:{playerId}`
- TTL: 60 seconds
- Fetcher: `prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } })`
- Invalidation: call `invalidateCache('player:zone:{playerId}')` wherever the player's zone changes (travel endpoints).

### What stays the same

The `chat:switch-zone` handler (line 141) still does a direct DB query to validate the player is actually in the requested zone — this is a security check, not a room-join lookup.

### Result

Socket connections go from 2 DB queries to 0-2 Redis `GET`s on cache hit path.

---

## 5. Socket.IO Redis Adapter — Deferred

Single-instance deployment at launch means no Redis adapter is needed. Cross-instance concerns (room broadcasts, in-memory pinned messages) don't apply.

### Changes

Add a `// TODO: @socket.io/redis-adapter needed for multi-instance deployment` comment in `apps/api/src/socket/index.ts` near the `new SocketServer()` call.

---

## Acceptance Criteria Mapping

| Criteria | Section |
|---|---|
| Leaderboard refresh uses paginated or incremental queries | Section 2 |
| Socket.IO configured with Redis adapter | Section 5 (deferred — single instance) |
| Redis client has reconnect strategy and error logging | Section 1 |
| Unbounded queries capped with `take` limits | Section 3 |
| Socket connection uses Redis cache instead of DB queries | Section 4 |
| Existing tests still pass | All sections — no API contract changes, no behavioral changes |

## Files Modified

- `apps/api/src/redis.ts` — resilience config
- `apps/api/src/index.ts` — SIGTERM handler
- `apps/api/src/services/leaderboardService.ts` — paginated refresh
- `apps/api/src/services/pvpService.ts` — take limits on notifications
- `apps/api/src/routes/bestiary.ts` — take limit
- `apps/api/src/routes/inventory.ts` — take limit
- `apps/api/src/socket/index.ts` — TODO comment
- `apps/api/src/socket/chatHandlers.ts` — cached lookups
- `apps/api/src/services/playerService.ts` (or similar) — new `getPlayerZoneId`
- `packages/shared/src/constants/gameConstants.ts` — new constants
