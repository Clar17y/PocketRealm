# Code Health Audit: `apps/api/src/services/consumableService.ts`

**Date:** 2026-03-15 00:11:20
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/consumableService.ts`

## Findings

### Type Safety
- [medium] **`as ConsumableEffect | null` cast on JSON column (line 37)** — `item.template.consumableEffect` is a Prisma JSON column (typed `JsonValue`), cast directly to `ConsumableEffect | null` without shape validation. If the stored JSON is malformed (e.g., missing `type` or `value` fields from a migration or manual edit), `effect.type` (line 42, 57) and `effect.value` (line 58, 60) would be `undefined`, causing silent incorrect behavior (e.g., `healAmount` would be `NaN`). — **Suggested fix:** Add a runtime check: `if (!effect || typeof effect.type !== 'string' || typeof effect.value !== 'number') throw new AppError(...)`. Or use a Zod parse.

### Error Handling
No issues found. Excellent defensive patterns: optimistic locking on HP state (lines 78-93), proper transaction for atomicity, comprehensive validation of all edge cases (wrong item type, combat-only, full HP, recovering state).

### Dead Code
No issues found.

### Unused Exports
- [low] **`UseConsumableResult` interface exported but never imported (line 10)** — Only used within this file as the return type of `useConsumable`. No external file imports it. — **Suggested fix:** Remove `export` keyword.

## Summary
2 findings: 0 critical, 0 high, 1 medium, 1 low
