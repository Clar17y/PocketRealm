# Database Audit: eventSchedulerService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/eventSchedulerService.ts` (392 lines, 3 exported functions)

## Prisma Models Touched
Direct: `WorldEvent`, `Zone`, `ZoneMobFamily`, `MobFamily`, `ResourceNode`, `BossEncounter`, `MobTemplate`, `Player`

## Findings
No N+1 in direct queries. Background scheduler uses read-only queries for event spawning logic. Delegates to `worldEventService`, `bossEncounterService`, `systemMessageService`. Some sequential operations in `checkAndSpawnEvents` are fine for a background timer running every 60s.

`getRelevantTargets` uses `player.findMany` with `distinct: ['currentZoneId']` — clean pattern for finding active zones.

### Payload Bloat
`bossMobs` findMany (line 216) — no select, fetches full MobTemplate. Uses `id`, `name`, `bossBaseHp`, `hp`. Minor.

## Suggested Fixes
Add `select` to boss mob template query. Otherwise clean background service.
