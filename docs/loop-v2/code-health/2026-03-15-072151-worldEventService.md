# Code Health Audit: `apps/api/src/services/worldEventService.ts`

**Date:** 2026-03-15 07:21:51
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/worldEventService.ts`

## Findings

### Type Safety
- [low] **5 `as` casts in `toWorldEventData` mapper (lines 31, 32, 37, 44, 45)** — Prisma stores `type`, `effectType`, `status`, and `createdBy` as `string`; the mapper casts them to `WorldEventType`, `WorldEventEffectType`, `WorldEventStatus`, and `'system' | 'player_discovery'`. All casts are centralized in a single mapper function, which is the cleanest approach. However, no runtime validation ensures DB values actually match the union types — a stale/invalid DB row would silently produce a mistyped object. Low risk since data is seeded/controlled. — **Suggested fix:** Add a runtime assertion or validation function for at least `effectType` and `status`, or accept the risk given seeded data.

### Error Handling
No issues found. `spawnWorldEvent` uses a Serializable-isolation transaction with slot/cap checks inside (lines 257-295) for TOCTOU safety. `expireStaleEvents` uses a find-then-update with `status: 'active'` guard on the update (lines 312-318), making concurrent calls idempotent.

### Dead Code
No issues found.

### Unused Exports
- [low] **`getSpawnRateModifiers` exported but only used in tests (line 223)** — The sync variant `computeSpawnRateModifiers` is used in production code (`exploration/start.ts`). The async wrapper `getSpawnRateModifiers` is only imported by `worldEventService.test.ts`. — **Suggested fix:** Remove `export` or keep it as a test convenience; either way, no production code depends on it.
- [low] **`getActiveEventSummaries` exported but only used in tests (line 336)** — The sync variant `computeEventSummaries` is used in production code (`combat/start.ts`, `gathering.ts`). The async wrapper `getActiveEventSummaries` is only imported by `worldEventService.test.ts`. — **Suggested fix:** Same as above — remove `export` or accept as test convenience.

## Summary
3 findings: 0 critical, 0 high, 0 medium, 3 low
