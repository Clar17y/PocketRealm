# Code Health Audit: `apps/api/src/services/guildSpecializationService.ts`

**Date:** 2026-03-15 03:01:22
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/guildSpecializationService.ts`

## Findings

### Type Safety
- [low] **Non-null assertions on `.find()` results (lines 43, 103)** — `GUILD_SPECIALIZATION_DEFINITIONS.find(...)!` asserts the result is non-null. Safe in practice because `VALID_PATHS.has(path)` is checked beforehand (lines 21, 75), but `!` suppresses type checking. — **Suggested fix:** Add a guard: `if (!specDef) throw new AppError(500, 'Spec definition missing', 'INTERNAL_ERROR')`.

### Error Handling
No issues found. Comprehensive validation chain: path validity, leader role check, guild level gate, existing specialization check, same-path prevention, and treasury balance. Transactions properly typed with `Prisma.TransactionClient`.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 3 exports are imported by the guild route.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
