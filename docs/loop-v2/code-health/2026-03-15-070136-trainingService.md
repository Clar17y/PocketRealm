# Code Health Audit: `apps/api/src/services/trainingService.ts`

**Date:** 2026-03-15 07:01:36
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/trainingService.ts`

## Findings

### Type Safety
- [medium] **`mob as Record<string, unknown>` widening cast (line 114)** — The Prisma `MobTemplate` result is cast to `Record<string, unknown>` to satisfy the `toMobTemplate` helper's generic parameter type. This discards the specific Prisma typing and means any property access inside `toMobTemplate` is unchecked. — **Suggested fix:** Type `toMobTemplate` to accept the Prisma `MobTemplate` model type directly, or create a narrower interface that both Prisma results and the helper satisfy.

### Error Handling
No issues found. Good validation chain: Redis cooldown check with 429 status, bestiary verification, prefix verification. Clean error propagation.

### Dead Code
No issues found.

### Unused Exports
- [low] **`TrainingCombatResult` type exported but never imported in API code (line 27)** — The web app defines its own matching type independently. — **Suggested fix:** Remove `export` or move to `@pocketrealm/shared` if both sides should share the definition.

## Summary
2 findings: 0 critical, 0 high, 1 medium, 1 low
