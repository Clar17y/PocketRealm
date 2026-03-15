# Code Health Audit: `apps/api/src/services/guildProjectService.ts`

**Date:** 2026-03-15 02:41:25
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/guildProjectService.ts`

## Findings

### Type Safety
- [medium] **`materialsProgress: any` in two helper function signatures (lines 378, 418)** — `checkAndCompleteProject` and `toProjectData` both accept `materialsProgress: any` in their parameter objects. This propagates `any` into the function body and disables type checking on all operations on `materialsProgress`. The field is then immediately cast with `as Record<string, number>` (lines 388, 434). — **Suggested fix:** Type as `materialsProgress: Prisma.JsonValue` (the actual Prisma JSON type) or `Record<string, number> | null` to eliminate the `any`.

- [medium] **5 `as Record<string, number>` casts on JSON columns (lines 128, 251, 262, 287, 434)** — `materialsProgress` and `materialsContributed` are Prisma JSON columns cast to `Record<string, number>` without validation. If the JSON shape contains non-number values or unexpected keys, they pass through silently. — **Suggested fix:** Validate at the boundary (e.g., in `toProjectData`) once, rather than casting at each usage site.

- [low] **Non-null assertions `updated!` (lines 199, 306)** — After a `findUnique` inside a transaction. Safe in practice because the ID was just used to update, but `!` suppresses type checking. — **Suggested fix:** Use `findUniqueOrThrow` instead.

### Error Handling
No issues found. Good validation chain with role checks, prerequisite validation, contribution caps, and proper `Prisma.TransactionClient` typing on all three transactions (lines 63, 175, 272). Notably, this file uses properly typed transaction clients — unlike `guildMembershipService` and `guildContractService`.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 5 exports are imported by the guild route.

## Summary
3 findings: 0 critical, 0 high, 2 medium, 1 low
