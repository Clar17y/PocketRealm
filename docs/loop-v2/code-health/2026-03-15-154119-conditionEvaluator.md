# Code Health Audit: `packages/game-engine/src/combat/conditionEvaluator.ts`

**Date:** 2026-03-15 15:41:19
**Auditor:** Automated Loop

## File Audited
`packages/game-engine/src/combat/conditionEvaluator.ts`

## Findings

### Type Safety
- [low] **4 non-null assertions on `SlotCondition` optional fields (lines 29-34)** — `condition.resource!` and `condition.threshold!` use `!` inside `case 'resource_below'` / `case 'resource_above'` branches. The `SlotCondition` type has these as optional since they only apply to resource conditions, but the Zod validation in `routes/templates.ts` enforces they are present for these condition types. Safe in practice, but the assertions bypass null-safety. — **Suggested fix:** Use `condition.resource ?? 'hp'` / `condition.threshold ?? 0` for defensive defaults, or narrow the `SlotCondition` type to a discriminated union where resource conditions always have these fields.

### Error Handling
No issues found. Pure function with exhaustive switch on condition types.

### Dead Code
No issues found.

### Unused Exports
No issues found. `evaluateCondition` is imported by `actionResolver.ts`.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
