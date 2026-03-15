# Code Health Audit: `apps/api/src/services/skillPointService.ts`

**Date:** 2026-03-15 06:11:22
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/skillPointService.ts`

## Findings

### Type Safety
- [high] **`tx: any` on 2 transaction callbacks (lines 63, 136)** — Both `allocatePoints` and `respecPoints` type the transaction client as `any`, disabling type checking on all DB operations inside (raw query, skillPointAllocation, playerSkill). — **Suggested fix:** Type as `Prisma.TransactionClient`.

- [medium] **`as Record<string, number>` casts on JSON `allocations` column (lines 27, 32, 77, 78)** — The `allocations` JSON column is cast to `Record<string, number>` at 4 locations without validation. If the JSON contains non-number values, arithmetic operations like `reduce((sum, v) => sum + v, 0)` would produce `NaN`. — **Suggested fix:** Validate once in `getOrCreateAllocation` and propagate the typed result.

- [low] **`newAllocations as any` for Prisma update (line 119)** — The well-typed `newAllocations` record is cast to `any` to satisfy Prisma's JSON input type. — **Suggested fix:** Cast to `Prisma.InputJsonValue` instead for minimal type narrowing.

### Error Handling
No issues found. Excellent concurrency safety: `SELECT ... FOR UPDATE` row lock (line 66) prevents double-spend under concurrent allocation requests. Comprehensive validation: node existence, duplicate allocation, point balance, prerequisites, skill level gates.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 4 exports are imported across routes and services (6 importers).

## Summary
3 findings: 0 critical, 1 high, 1 medium, 1 low
