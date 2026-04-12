# Event-Driven Scheduling (Neon Scale-to-Zero)

**Date:** 2026-04-11
**Status:** Approved for implementation planning

## Goal

Eliminate every code path that issues a Postgres query on a fixed wall-clock schedule independent of player action or active scheduled game state, so that the Neon compute endpoint can suspend during genuinely idle periods. Applies to both UAT and prod.

For this design, "genuinely idle" means:

- No player HTTP or socket activity is being handled.
- No boss encounter or guild expedition has a pending wall-clock resolution that must run server-side.

If a boss round or expedition step is pending, keeping compute active until that scheduled game work resolves is intentional. That is not idle maintenance work; it is active game state. The scale-to-zero target is to stop idle polling and maintenance timers from waking Neon when nothing in the game requires work.

## Motivation

UAT's Neon instance shows constant minute-level usage despite zero UI traffic. Investigation traced the cause to the API process itself: four background timers hit the DB on a fixed cadence regardless of whether any players are connected or any relevant state exists.

| Timer | Cadence | Source |
|---|---|---|
| `roundResolutionScheduler` - boss/expedition round polling | 5s when active, 60s when idle | `apps/api/src/services/roundResolutionScheduler.ts` |
| Persisted mob cleanup | 5 min | `apps/api/src/index.ts:179` |
| Leaderboard refresh | 15 min | `apps/api/src/index.ts:189` |
| Auth token cleanup | 6 h | `apps/api/src/index.ts:196` |

The 60-second round resolver alone guarantees Neon never suspends: it performs active-round count queries even when there are no bosses, expeditions, or player consumers. The other three contribute additional wake-ups at their respective intervals.

Prisma's idle connection pool does **not** prevent Neon suspension. Active queries do. Socket.IO presence timers and the metrics logger are acceptable only if they remain in-memory and do not touch Postgres.

## Non-Goals

- Not introducing a background worker tier, Redis-based distributed scheduler, or LISTEN/NOTIFY. A single Node process per Render service is the target topology.
- Not eliminating cold-start latency. The first request after a Neon suspension will incur a resume delay. This is accepted as the cost of scale-to-zero.
- Not forcing Neon to suspend while active game state needs wall-clock resolution. Bosses and expeditions are allowed to keep compute active while a scheduled resolution is pending.
- Not changing gameplay semantics for connected players. A player online when a round resolves still receives the resolution at the correct wall-clock time.

## Core Principle

**The API process is allowed to be alive with zero fixed-cadence DB queries.** Work happens in two modes:

1. **Triggered** - in direct response to a player action, HTTP request, or socket event.
2. **Scheduled by real game state** - an in-process `setTimeout` registered because a specific `BossEncounter` or `GuildExpedition` row has a non-null `nextRoundAt`.

Nothing runs on a fixed cadence independent of state. Boot-time catch-up queries are allowed because they are finite and recover in-memory scheduling from the database, but they must not become loops.

## 1. Round Resolution - Timer Registry

### Problem

`roundResolutionScheduler.ts` polls the DB every 5-60 seconds:

- `bossEncounter.count({ where: { status: 'in_progress' } })`
- `guildExpedition.count({ where: { status: { in: ['recruiting', 'in_progress'] } } })`
- if either count is non-zero, broad due-round scans and resolvers

This wakes Neon even when no schedulable rows exist.

### Current schema reality

There are no `bossEncounterRound`, `guildExpeditionRound`, `resolveAt`, or `pending` round-status tables in the current schema.

Scheduling state is stored directly on:

| Model | Scheduling field | Active scheduled statuses |
|---|---|---|
| `BossEncounter` | `nextRoundAt` | `in_progress` |
| `GuildExpedition` | `nextRoundAt` | `recruiting`, `in_progress` |

`BossEncounter.status = 'waiting'` means a boss exists but no active round should resolve yet. This includes newly spawned bosses before first signup and bosses reopened after a wipe. A boss timer should be scheduled only when the encounter transitions to `in_progress`.

### New module

**New file:** `apps/api/src/services/roundTimerRegistry.ts`

A module-level singleton holding `Map<string, NodeJS.Timeout>`, keyed by `${kind}:${id}`.

```typescript
type ScheduledRoundKind = 'bossEncounter' | 'guildExpedition';

interface RegistryApi {
  schedule(kind: ScheduledRoundKind, id: string, nextRoundAt: Date, getIo: () => SocketServer | null): void;
  cancel(kind: ScheduledRoundKind, id: string): void;
  rehydrate(getIo: () => SocketServer | null): Promise<void>;
  size(): number;
  keys(): string[]; // debug/status helper
  clearAll(): void; // test helper
}
```

**Invariant:** The DB is the source of truth. The registry is only an in-memory scheduling cache. If the registry is lost through crash, deploy, or restart, boot-time `rehydrate()` rebuilds it from `nextRoundAt`.

### Single-entity resolver entry points

The timer registry must not call the existing broad scanners directly. Add single-entity due resolvers:

```typescript
resolveDueBossEncounter(encounterId: string, io: SocketServer | null): Promise<void>
resolveDueExpeditionStep(expeditionId: string, io: SocketServer | null): Promise<void>
```

Each function:

- Loads only the targeted row.
- Returns without DB writes if `nextRoundAt` is null or still in the future.
- For bosses, returns unless `status === 'in_progress'`.
- For expeditions, handles `status === 'recruiting'` signup-window resolution and `status === 'in_progress'` round resolution.
- Uses DB-level optimistic guards before mutating state.

The existing broad functions may remain as activity-triggered catch-up wrappers:

```typescript
checkAndResolveDueBossRounds(io)
checkAndResolveExpeditionRounds(io)
```

Those wrappers should find due rows and call the single-entity resolvers. They are safe when called from HTTP routes or socket/player activity. They must not be called by any fixed-cadence timer.

### `schedule` behavior

- Compute `delay = max(0, nextRoundAt.getTime() - Date.now())`.
- If an entry already exists for the key, `clearTimeout` it first.
- Register `setTimeout` for that one row.
- When the timer fires:
  1. Remove the key from the map.
  2. Call `resolveDueBossEncounter(id, getIo())` or `resolveDueExpeditionStep(id, getIo())`.
  3. If resolution writes another non-null `nextRoundAt` for an active scheduled status, the service layer schedules the next timer after the DB write commits.
  4. If resolution fails with a transient error, log and reschedule with bounded backoff instead of permanently dropping the row.

The registry must not infer the next schedule by polling after every timer fire. The service that changes `nextRoundAt` is responsible for registering or cancelling the matching timer.

### `cancel` behavior

- `clearTimeout` and delete the entry.
- Safe to call if no entry exists.
- Called immediately after any DB write that changes a row into a terminal or unscheduled status.

### `rehydrate` behavior

Called once from `index.ts` after `server.listen()`:

```typescript
const bossRows = await prisma.bossEncounter.findMany({
  where: {
    status: 'in_progress',
    nextRoundAt: { not: null },
  },
  select: { id: true, nextRoundAt: true },
});
for (const row of bossRows) {
  registry.schedule('bossEncounter', row.id, row.nextRoundAt!, getIo);
}

const expeditionRows = await prisma.guildExpedition.findMany({
  where: {
    status: { in: ['recruiting', 'in_progress'] },
    nextRoundAt: { not: null },
  },
  select: { id: true, nextRoundAt: true },
});
for (const row of expeditionRows) {
  registry.schedule('guildExpedition', row.id, row.nextRoundAt!, getIo);
}
```

Past-due rows get `delay = 0` and fire on the next event loop tick. This handles deploys, crashes, and downtime.

### Boss lifecycle registration

Boss timers are scheduled only for active rounds, not for a boss merely existing.

| Site | Required registry action |
|---|---|
| `createBossEncounter` | Do **not** schedule. The new row is `waiting`, so there is no active round yet. |
| `signUpForBossRound` when status changes `waiting -> in_progress` | Schedule `bossEncounter` at the row's existing `nextRoundAt`. If `nextRoundAt` is already in the past, schedule with delay 0. |
| Successful non-defeating round resolution | Schedule `bossEncounter` at the newly written `nextRoundAt`. |
| Boss wipe, which changes status back to `waiting` | Cancel `bossEncounter`. A later signup will schedule again. |
| Boss defeated or expired | Cancel `bossEncounter`. |
| Admin boss spawn | No direct schedule unless it also creates an `in_progress` encounter, which current code does not. |
| Admin event cancel for a boss event | Expire/cancel the related boss encounter and cancel the timer. |
| Player-discovered boss spawn from exploration | No direct schedule. Like other boss creation paths, it creates a `waiting` encounter. |

Current relevant files:

- `apps/api/src/services/bossEncounterService.ts`
- `apps/api/src/routes/boss.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/services/eventSchedulerService.ts`
- `apps/api/src/services/explorationOutcomeService.ts`

### Expedition lifecycle registration

Expedition timers are scheduled for both signup-window resolution and combat-round resolution.

| Site | Required registry action |
|---|---|
| `launchExpedition` | Schedule `guildExpedition` at `SIGNUP_WINDOW_MS`. |
| Recruiting timer resolves with enough participants | Update to `in_progress`, write first combat `nextRoundAt`, reschedule. |
| Recruiting timer resolves without enough participants | Mark `failed`, set `nextRoundAt: null`, cancel. |
| `forceStartExpedition` | Reschedule at the newly written first combat `nextRoundAt`. |
| Combat round resolves and room continues | Schedule at the newly written `nextRoundAt`. |
| Room cleared and next room/rest phase starts | Schedule at the rest-phase `nextRoundAt`. |
| Wipe with attempts remaining | Reset to `recruiting`, write new signup-window `nextRoundAt`, reschedule. |
| Wipe with max attempts, completion, or abandon | Set `nextRoundAt: null`, cancel. |
| Guild disband | Cancel timers for all active/recruiting expeditions in the guild before deleting the guild. DB cascade deletes expedition rows, but it does not clear in-memory timers by itself. |
| Admin expedition cooldown reset | No timer action. Current route updates only completed/failed expeditions. |
| Admin expedition fill | No timer action. It changes members on an existing recruiting expedition but does not change `nextRoundAt`. |

Current relevant files:

- `apps/api/src/services/expeditionService.ts`
- `apps/api/src/services/expeditionRoundService.ts`
- `apps/api/src/services/expeditionTransitionService.ts`
- `apps/api/src/routes/expedition.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/services/guildMembershipService.ts`

### Cancellation audit checklist

Before implementation, run exact searches for every write path that can change scheduled state:

```bash
rg -n "bossEncounter\.(update|updateMany|delete|deleteMany|create)|createBossEncounter|worldEvent\.(update|updateMany|delete|deleteMany)" apps/api/src
rg -n "guildExpedition\.(update|updateMany|delete|deleteMany|create)|guild\.delete|disbandGuild|abandonExpedition|completeExpedition|handleWipe|forceStartExpedition" apps/api/src
```

Every write path found by those searches must be classified as one of:

- schedules a new timer because it writes an active scheduled status plus non-null `nextRoundAt`
- cancels a timer because it writes a terminal/unscheduled status or deletes/cascades the row
- intentionally does nothing because it does not affect `nextRoundAt` or scheduled status

Known cancellation-sensitive paths from review:

- Boss defeat in `resolveBossRoundInner`
- Boss wipe in `resolveBossRoundInner` because it changes the encounter back to `waiting`
- Boss event admin cancellation in `routes/admin.ts`, which must also expire/cancel the related `BossEncounter`
- Expedition recruiting failure in `checkAndResolveExpeditionRounds` / new single-entity resolver
- Expedition max-attempt failure in `handleWipe`
- Expedition completion in `completeExpedition`
- Expedition abandon in `abandonExpedition`
- Guild disband in `disbandGuild`, because `GuildExpedition` rows cascade but registry timers do not

This checklist is part of the implementation plan, not optional cleanup.

### Resolver idempotence

Both single-entity resolvers must be race-safe. Current code already uses some optimistic guards, but they need tightening:

- Boss round update should guard by `id`, `roundNumber`, and `status: 'in_progress'`.
- Expedition round update should guard by `id`, `roundNumber`, and `status: 'in_progress'`.
- Expedition recruiting resolution should guard by `id`, `status: 'recruiting'`, and `nextRoundAt <= now`.
- Terminal writes should set `nextRoundAt: null` where appropriate.

If a concurrent route call wins the race, the timer path must observe `updated.count === 0` or a non-due status and return without side effects.

### Activity-triggered catch-up

Keep the route-level calls that resolve due work before returning active boss/expedition state:

- `apps/api/src/routes/boss.ts`
- `apps/api/src/routes/expedition.ts`

These are player-triggered, not idle polling. They also provide a catch-up path if a timer was missed due to process restart, transient failure, or a manually cleared registry.

`eventSchedulerService.checkAndSpawnEvents()` currently calls `checkAndResolveDueBossRounds(io)`. That is acceptable only because `checkAndSpawnEvents()` is activity-triggered. It should call the broad catch-up wrapper or be simplified after the registry exists, but it must not become timer-driven.

### Deletion

- Delete `apps/api/src/services/roundResolutionScheduler.ts`.
- Remove `startRoundResolutionScheduler(getIo)` from `apps/api/src/index.ts`.
- Replace it with `await roundTimerRegistry.rehydrate(getIo)` in startup code.

### Tests

New file: `apps/api/src/services/roundTimerRegistry.test.ts`, using `vi.useFakeTimers()`:

1. `schedule` then advance timers resolves exactly the targeted ID.
2. `schedule` then `cancel` prevents resolver execution.
3. Re-scheduling the same key clears the first timeout.
4. Past-due rehydrated rows fire on the next tick.
5. Future rehydrated rows fire after the expected delay.
6. Resolver error is logged and rescheduled with bounded backoff.
7. `size()` and `keys()` reflect schedule/cancel/rehydrate state.

Service tests to add or update:

1. Boss creation does not schedule while `waiting`.
2. First boss signup schedules when `waiting -> in_progress`.
3. Boss wipe cancels the timer and does not reschedule until a later signup.
4. Boss non-defeating resolution schedules the next round.
5. Boss defeat/expiry cancels.
6. Expedition launch schedules the signup window.
7. Expedition recruiting success reschedules combat round.
8. Expedition recruiting failure cancels.
9. Force-start reschedules.
10. Expedition room continuation/rest/wipe-with-retry reschedules.
11. Expedition completion, max-attempt failure, and abandon cancel.

## 2. World Event Scheduler - Activity-Triggered

### Current state

`checkAndSpawnEvents()` is already activity-triggered from `apps/api/src/routes/exploration/start.ts`. It has an in-memory 60-second debounce and performs DB work only when called.

It also performs several kinds of game catch-up:

- expire stale events
- optionally resolve due boss rounds
- optionally spawn a dedicated boss
- optionally spawn world/zone events

This is acceptable because there is no fixed timer calling it.

### Trigger coverage

Add two additional player-triggered call sites:

| Location | Trigger |
|---|---|
| `POST /api/v1/auth/login` and successful refresh/session-resume path | Catch up world state after absence. |
| `GET /api/v1/events` | Catch up before returning the events list. |

The world-events route currently only calls `expireStaleEvents()`, so players can see a stale or under-spawned world state until the next exploration action. Replace that read-only expiry call with `checkAndSpawnEvents(getIo())`, or call `checkAndSpawnEvents(getIo())` before reading events.

The 60-second debounce remains. These are user-triggered calls, so they do not prevent scale-to-zero.

### Tests

- Login success calls `checkAndSpawnEvents()` once after authentication succeeds.
- Refresh/session-resume success calls `checkAndSpawnEvents()` if that endpoint is treated as session resume.
- Failed login does not call `checkAndSpawnEvents()`.
- `GET /api/v1/events` calls `checkAndSpawnEvents()` before reading active events.
- Existing exploration trigger behavior remains.

## 3. Persisted Mob Cleanup - Lazy on Touch

### Current state

`cleanupFullyHealedMobs()` runs every 5 minutes via `setInterval` in `index.ts`.

The service does not have a background regen writer. Passive regen is computed lazily in `checkPersistedMobReencounter()`:

- load `persistedMob`
- roll reencounter chance
- calculate current HP from `damagedAt`
- delete if fully healed

The current order means a fully healed persisted mob is only deleted if the random reencounter roll succeeds. Rows that are touched but fail the roll can remain until the scheduled cleanup.

### Design

Delete healed rows whenever they are touched:

1. In `checkPersistedMobReencounter()`, calculate regenerated HP before the random reencounter roll.
2. If `regenHp >= maxHp`, delete the row and return null.
3. Only then roll the reencounter chance.

Also make `persistMobHp()` defensive:

- If `currentHp >= maxHp`, delete any matching persisted row instead of creating/updating one.
- Otherwise create/update as today.

This keeps storage tidy on player activity without any idle timer.

### Boot-time safety net

Optionally call `cleanupFullyHealedMobs()` once on server startup for one release to sweep historical rows. This is a finite startup query, not a periodic idle query. Remove the startup sweep in a follow-up PR after UAT/prod have both booted once.

If minimizing every no-user startup query is more important than historical cleanup, skip the boot-time sweep and rely entirely on lazy-on-touch cleanup.

### Deletion

- Remove the 5-minute `setInterval` from `apps/api/src/index.ts`.
- Keep or remove the `cleanupFullyHealedMobs` import depending on whether the one-release startup sweep is used.

### Tests

- Fully healed row is deleted before the random reencounter roll.
- Non-healed row still respects the reencounter chance.
- `persistMobHp()` deletes instead of upserting when `currentHp >= maxHp`.
- Scheduled cleanup interval is gone from `index.ts`.

## 4. Leaderboards - Lazy Refresh of Existing Redis Zsets

### Current state

`refreshAllLeaderboards()` runs on boot and every 15 minutes. It computes leaderboard data from Postgres and writes the existing Redis shape:

- sorted sets: `leaderboard:${category}`
- metadata hashes: `leaderboard:meta:${category}`
- timestamp key: `leaderboard:last_refresh`

`getLeaderboard()` currently reads those Redis sorted sets and metadata hashes. It does not compute a leaderboard from DB on cache miss, and it does not read a JSON blob.

### Design

Keep the existing Redis zset/hash format. Remove the boot refresh and interval, then make reads ensure freshness lazily.

Add `ensureLeaderboardsFresh()` and call it at the start of `getLeaderboard()`:

```typescript
async function ensureLeaderboardsFresh(): Promise<void> {
  const last = await redis.get('leaderboard:last_refresh');
  if (last && Date.now() - Date.parse(last) < LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS) {
    return;
  }

  const lockToken = randomUUID();
  const acquired = await redis.set('leaderboard:refresh_lock', lockToken, 'PX', 60_000, 'NX');
  if (!acquired) {
    return; // serve existing stale data if present
  }

  try {
    await refreshAllLeaderboards();
  } finally {
    // compare-and-delete lock release, same pattern as boss resolver lock
  }
}
```

Behavior:

- First leaderboard request after cold Redis or stale timestamp performs the DB refresh synchronously.
- Other concurrent requests either serve existing stale Redis data or wait only if the implementation chooses to wait.
- Existing `getLeaderboard()` zset reads remain unchanged after freshness is ensured.
- No background DB queries.

Redis unavailability should not be hand-waved. Either:

- Preserve current behavior and let the request fail through normal error handling, or
- Implement a real direct-DB fallback per category with tests.

Do not claim a direct compute fallback unless it is actually implemented.

### Deletion

- Remove initial `refreshAllLeaderboards()` from `apps/api/src/index.ts`.
- Remove the 15-minute leaderboard `setInterval`.
- Keep `refreshAllLeaderboards()` as the lazy rebuild implementation and optional admin/manual refresh hook.

### Tests

- Fresh `leaderboard:last_refresh` does not call `refreshAllLeaderboards()`.
- Missing/stale `leaderboard:last_refresh` acquires lock and calls `refreshAllLeaderboards()`.
- Concurrent request that fails to acquire lock serves existing Redis data without refreshing.
- Cold Redis refresh populates existing zset/hash keys and `getLeaderboard()` returns entries.
- Redis failure behavior matches the chosen design.

## 5. Auth Token Cleanup - Opportunistic on Write

### Current state

`cleanupExpiredTokens()` runs every 6 hours and deletes from:

- `emailVerificationToken`
- `passwordResetToken`

It does not currently clean `refreshToken` rows.

The generic `authToken` table and `createAuthToken()` function do not exist in this codebase.

Transaction boundary confirmation:

- `createEmailVerificationToken()` already uses `prisma.$transaction([...])`.
- `createPasswordResetToken()` already uses `prisma.$transaction([...])`.
- `POST /api/v1/auth/register` creates a refresh token with a bare `prisma.refreshToken.create()` after the player creation transaction.
- `POST /api/v1/auth/login` creates a refresh token with a bare `prisma.refreshToken.create()`.
- `POST /api/v1/auth/refresh` already uses `prisma.$transaction([...])` for refresh-token creation plus `lastActiveAt`.

### Design

Remove the scheduled cleanup and attach cleanup to token-writing paths.

For `createEmailVerificationToken(playerId)`:

- In the existing transaction, delete any existing verification tokens for that player as today.
- Also delete expired verification tokens opportunistically.
- Create the new token.

For `createPasswordResetToken(playerId)`:

- In the existing transaction, delete any existing reset tokens for that player as today.
- Also delete expired or used reset tokens opportunistically.
- Create the new token.

For refresh tokens:

- On login and register, wrap expired-token cleanup plus `refreshToken.create()` in a small new transaction.
- On refresh, extend the existing transaction with `refreshToken.deleteMany({ where: { playerId, expiresAt: { lt: now } } })`.
- Keep existing logout and password-reset token revocation behavior.

Expired token validation must continue to reject expired records even if cleanup has not run.

### Deletion

- Remove the 6-hour `setInterval` from `apps/api/src/index.ts`.
- Keep `cleanupExpiredTokens()` only if tests/admin tooling still use it; otherwise delete it.

### Tests

- Creating an email verification token deletes existing player tokens and expired verification tokens.
- Creating a password reset token deletes existing player tokens and expired/used reset tokens.
- Login/register/refresh creation deletes expired refresh tokens for that player.
- Expired verification, reset, and refresh tokens remain rejected at validation time.
- Scheduled auth cleanup interval is gone from `index.ts`.

## 6. Observability - Manual Scheduler Status

### Design

Add a manual admin endpoint under the existing admin router rather than a separately mounted unauthenticated internal router:

`GET /api/v1/admin/scheduler-status`

Response:

```json
{
  "pendingTimers": 3,
  "timerKeys": ["bossEncounter:...", "guildExpedition:..."],
  "pendingBossEncounters": 1,
  "pendingGuildExpeditions": 2,
  "pendingEnumeratedFromDb": 3,
  "hasDrift": false
}
```

Counts:

- `pendingTimers` - `roundTimerRegistry.size()`
- `timerKeys` - `roundTimerRegistry.keys()`
- `pendingBossEncounters` - count `BossEncounter` rows where `status = 'in_progress'` and `nextRoundAt IS NOT NULL`
- `pendingGuildExpeditions` - count `GuildExpedition` rows where `status IN ('recruiting', 'in_progress')` and `nextRoundAt IS NOT NULL`
- `pendingEnumeratedFromDb` - sum of DB counts
- `hasDrift` - `pendingTimers !== pendingEnumeratedFromDb`

The endpoint is for manual debugging. Do not attach external uptime checks, cron probes, or dashboard polling to it, because each call intentionally queries Postgres and can wake Neon.

Guard with the existing `authenticate` + `requireAdmin` middleware already used by `apps/api/src/routes/admin.ts`.

### Tests

- Non-admin cannot access endpoint.
- Admin receives registry size and DB counts.
- `hasDrift` is true when timer count differs from DB count.
- Endpoint is not mounted outside the admin router.

## 7. What Survives Unchanged

| Component | Reason |
|---|---|
| `metricsLogger.ts` | In-memory only. It must remain DB-free. |
| Socket.IO presence throttle | Connection-driven and in-memory. Socket connection handlers may query DB as part of user activity, but there must be no idle DB polling. |
| Prisma connection pool | Idle TCP connections do not block Neon compute suspension; active queries do. |

## 8. Files Touched

### New files

- `apps/api/src/services/roundTimerRegistry.ts`
- `apps/api/src/services/roundTimerRegistry.test.ts`

### Modified files

- `apps/api/src/index.ts` - remove fixed DB timers, remove `startRoundResolutionScheduler`, add registry rehydrate, optionally add one-release mob cleanup startup sweep.
- `apps/api/src/services/bossEncounterService.ts` - add single-entity due resolver, schedule/cancel on real lifecycle transitions.
- `apps/api/src/services/expeditionService.ts` - schedule on launch/force-start/abandon.
- `apps/api/src/services/expeditionRoundService.ts` - add single-entity due resolver for combat rounds, schedule/cancel after resolution.
- `apps/api/src/services/expeditionTransitionService.ts` - schedule/cancel after room clear, wipe, retry, completion.
- `apps/api/src/services/eventSchedulerService.ts` - keep activity-triggered behavior; ensure any due-round catch-up uses broad wrappers only from activity.
- `apps/api/src/routes/boss.ts` - keep activity-triggered due catch-up.
- `apps/api/src/routes/expedition.ts` - keep activity-triggered due catch-up.
- `apps/api/src/routes/worldEvents.ts` - call `checkAndSpawnEvents(getIo())` before listing events.
- `apps/api/src/routes/auth.ts` - call `checkAndSpawnEvents(getIo())` on successful login/session resume; add refresh-token cleanup on write.
- `apps/api/src/services/persistedMobService.ts` - lazy-on-touch deletion for fully healed mobs.
- `apps/api/src/services/leaderboardService.ts` - lazy freshness check around existing Redis zset/hash read model.
- `apps/api/src/services/authTokenService.ts` - opportunistic cleanup for verification/reset tokens on write.
- `apps/api/src/routes/admin.ts` - add manual scheduler status endpoint.
- `docs/reference/deployment.md` - update background timers section.

### Deleted files

- `apps/api/src/services/roundResolutionScheduler.ts`

## 9. Rollout

Single PR. The changes all serve one invariant: no fixed-cadence Postgres queries from the API process.

Post-deploy verification checklist:

1. Deploy to UAT.
2. Confirm no active boss or expedition has a pending `nextRoundAt`.
3. Confirm no user traffic for 10 minutes.
4. Check Neon dashboard: compute endpoint shows `suspended` state within the configured Neon idle window.
5. Hit a UAT endpoint; confirm cold resume behavior, then normal subsequent latency.
6. Start an expedition and confirm `/api/v1/admin/scheduler-status` shows one pending guild expedition timer.
7. Let the expedition signup window resolve and confirm the timer reschedules or cancels according to outcome.
8. Start a boss, sign up, and confirm the timer appears only after signup moves the encounter to `in_progress`.
9. Confirm the boss round resolves at expected wall-clock time.
10. After boss/expedition work completes and traffic stops, confirm Neon re-suspends.
11. Monitor logs for round timer errors, bounded retry logs, and scheduler drift over 24 hours.

## 10. Implementation Notes Resolved During Review

- Boss scheduling uses `BossEncounter.nextRoundAt`, not a round table.
- Expedition scheduling uses `GuildExpedition.nextRoundAt`, not a round table.
- Boss active scheduled status is `in_progress`; `waiting` is intentionally unscheduled.
- Expedition active scheduled statuses are `recruiting` and `in_progress`.
- Leaderboard lazy refresh must preserve existing Redis zset/hash keys.
- Persisted mob cleanup is lazy-on-touch because there is no regen writer.
- Auth cleanup must target `emailVerificationToken`, `passwordResetToken`, and refresh-token write paths, not a nonexistent `authToken` table.
- Scheduler status is manual admin observability and must not be polled.
