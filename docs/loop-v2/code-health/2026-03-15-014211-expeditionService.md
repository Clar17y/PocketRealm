# Code Health Audit: `apps/api/src/services/expeditionService.ts`

**Date:** 2026-03-15 01:42:11
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/expeditionService.ts`

## Findings

### Type Safety
- [high] **Pervasive `as unknown as T` double-casts on JSON columns (8+ occurrences)** — `roomDefinitions` is cast with `as unknown as ExpeditionRoomDefinition[]` on lines 87, 475, 730, 803, 960, 1151, 1480, 1534. `roundSummaries` cast on lines 95, 863. `expeditionAttemptLogs` cast on line 125. `activeEffects` cast on lines 169, 704, 1019. None of these JSON blobs are validated at runtime — if the persisted data is malformed (e.g., from a migration), accessing properties like `.mobs`, `.hp`, `.roomType` would crash at runtime with unhelpful errors far from the source. — **Suggested fix:** Create a single `parseRoomDefinitions(raw: unknown): ExpeditionRoomDefinition[]` validator (Zod or manual) and call it once per function entry point. This centralizes the risk and fails fast with clear errors.

- [medium] **`io: unknown` parameter type (lines 713, 794)** — `checkAndResolveExpeditionRounds` and `resolveExpeditionRound` type `io` as `unknown` instead of `Server | null` (the pattern used in `bossEncounterService`, `eventSchedulerService`, etc.). This means any value can be passed without compile-time error, and the parameter isn't used within the function for socket emission. If it's unused, it's dead; if it's passed through, the type should match the callee. — **Suggested fix:** Type as `import('socket.io').Server | null` for consistency, or remove if unused.

- [medium] **`exp.status as ExpeditionStatus` string-to-union cast (line 101)** — Same unvalidated pattern as other services. If the DB contains a status value not in the union, it passes through silently. — **Suggested fix:** Add runtime validation before the cast.

### Error Handling
- [medium] **Zero try/catch blocks in 1580 lines** — This complex service handles multi-step state transitions (room clearing, wipes, completions, loot distribution, token awards, bot cleanup, HP recovery) with no error isolation anywhere. A failure in loot distribution during `handleRoomCleared` leaves the expedition in `in_progress` status but with the room already cleared in `roomDefinitions`. A failure in `cleanupExpeditionBots` at the end of `completeExpedition` would crash after rewards are committed, potentially leaving bot data. — **Suggested fix:** Add try/catch around non-critical side effects (bot cleanup, token tracking, guild log). Critical state transitions should use Prisma transactions for atomicity.

### Dead Code
No issues found.

### Unused Exports
- [low] **4 exported symbols never imported externally:**
  - `handleRoomCleared` (line 1144) — only called internally by `resolveExpeditionRound` and `autoResolveRoom`
  - `handleWipe` (line 1263) — only called internally
  - `completeExpedition` (line 1458) — only called internally by `handleRoomCleared`
  - `AutoResolveResult` interface (line 933) — only used within this file

  **Suggested fix:** Remove `export` from all 4 to make them file-private.

## Summary
5 findings: 0 critical, 1 high, 2 medium, 2 low
