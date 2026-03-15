# Code Health Audit: `apps/api/src/services/expeditionLootService.ts`

**Date:** 2026-03-15 01:31:25
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/expeditionLootService.ts`

## Findings

### Type Safety
No issues found. Zero `as` casts, zero `any`. All function signatures have explicit return types.

### Error Handling
No issues found. Standard error propagation. Sequential per-contributor loot distribution follows the same pattern as `bossLootService`.

### Dead Code
- [medium] **Unused parameter `totalRooms` in `awardCompletionBonus` (line 140)** — The `totalRooms: number` parameter is declared but never referenced in the function body. The function iterates over `roomTypes` array instead to compute the bonus. Callers must provide this value for no reason, and it's misleading — a reader might assume room count affects the bonus calculation. — **Suggested fix:** Remove the `totalRooms` parameter from the function signature and update the single caller in `expeditionService.ts`.

### Unused Exports
- [low] **`ExpeditionLootDrop` interface exported but never imported (line 15)** — Only used within this file. No external file imports it. — **Suggested fix:** Remove `export` keyword.

## Summary
2 findings: 0 critical, 0 high, 1 medium, 1 low
