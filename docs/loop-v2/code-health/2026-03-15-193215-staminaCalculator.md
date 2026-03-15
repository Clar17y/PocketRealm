# Code Health Audit: `packages/game-engine/src/resources/staminaCalculator.ts`

**Date:** 2026-03-15 19:32:15
**Auditor:** Automated Loop

## File Audited
`packages/game-engine/src/resources/staminaCalculator.ts`

## Findings

### Type Safety
No issues found. No `as` casts, no `any`. All functions strongly typed with explicit parameter and return types.

### Error Handling
No issues found. Pure functions — no async code, no side effects.

### Dead Code
No issues found.

### Unused Exports
- [low] **`StaminaCalculationInput` interface exported but never imported** — The interface is only used locally as the parameter type for `calculateMaxStamina`. All external callers pass inline object literals without referencing the type. — **Suggested fix:** Remove the `export` keyword, or have callers import the type for better type safety.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
