# Code Health Audit: `apps/api/src/services/bossEncounterService.ts`

**Date:** 2026-03-14 22:21:58
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/bossEncounterService.ts`

## Findings

### Type Safety
- [high] **Pervasive JSON column casts without shape validation (lines 60, 63, 72, 390, 423)** — Prisma JSON columns return `unknown`/`JsonValue`, and this file casts them directly to specific types (`BossRoundSummary[]`, `Record<string, BossPlayerReward>`, `BossActiveEffect[]`) after only checking `Array.isArray()` or `typeof === 'object'`. If the DB contains malformed JSON (e.g., from a migration or manual edit), these casts silently produce objects with missing fields, causing runtime errors far from the source. Lines 390 and 423 use the especially dangerous double-cast `as unknown as T`. — **Suggested fix:** Create a shared validation/parse function per type (e.g., `parseBossRoundSummaries(raw: unknown): BossRoundSummary[]`) using Zod or manual checks. Alternatively, add a thin `parseJsonColumn<T>(raw: unknown, schema: z.ZodType<T>): T` utility.

- [medium] **Non-null assertion on array access (line 318)** — `BOSS_HP_PER_PLAYER_BY_TIER[tierIndex]!` uses `!` to assert the element exists. `tierIndex` is clamped to 0-4, so this is safe *if* the array always has 5 elements — but the assertion hides a potential off-by-one if the constant is later shortened. — **Suggested fix:** Use a fallback: `BOSS_HP_PER_PLAYER_BY_TIER[tierIndex] ?? BOSS_HP_PER_PLAYER_BY_TIER[0]`.

- [medium] **Status string casts without validation (lines 75, 120, 385)** — `row.status as BossEncounterStatus`, `row.status as BossParticipantStatus`, and `mob.damageType as 'physical' | 'magic'` narrow strings to union types without checking validity. A new DB status value not in the union would pass through unchecked. — **Suggested fix:** Add runtime validation or use a lookup/set check before casting.

- [low] **Non-null assertion on Map lookup (line 615)** — `contributorMap.get(playerId)!` asserts the entry exists. It's safe here because the map was populated from the same `keys()` iterator, but the `!` suppresses type safety. — **Suggested fix:** Use a guard: `const entry = contributorMap.get(playerId); if (!entry) continue;`.

### Error Handling
- [high] **Swallowed catch in auto-signup (lines 538-540)** — `catch { }` silently discards ALL errors during auto-signup, not just "insufficient turns". A database connection failure, serialization error, or any unexpected exception would be silently swallowed, making production debugging extremely difficult. This is the most dangerous error handling pattern in the file. — **Suggested fix:** Catch only the expected case: `catch (err) { if (err instanceof AppError && err.code === 'INSUFFICIENT_TURNS') continue; throw err; }` — or at minimum log the error: `catch (err) { logger.warn('Auto-signup failed', { playerId: participant.playerId, err }); }`.

- [low] **Generic `Error` instead of `AppError` (lines 191, 193)** — `throw new Error('Boss encounter not found')` and `throw new Error('Boss encounter is already over')` bypass the structured error system used elsewhere. Callers expecting `AppError` with status codes and error codes won't get them. — **Suggested fix:** Use `throw new AppError(404, '...', 'NOT_FOUND')` and `throw new AppError(400, '...', 'ENCOUNTER_OVER')`.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 7 exports are imported in production code:
- `createBossEncounter` — admin route, exploration/start route, eventSchedulerService
- `signUpForBossRound` — boss route
- `getBossEncounterStatus` — boss route
- `resolveBossRound` — called internally + via `checkAndResolveDueBossRounds`
- `checkAndResolveDueBossRounds` — boss route, eventSchedulerService, roundResolutionScheduler
- `getActiveBossEncounters` — boss route
- `getBossHistory` — boss route

## Summary
6 findings: 0 critical, 2 high, 2 medium, 2 low
