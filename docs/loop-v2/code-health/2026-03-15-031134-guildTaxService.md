# Code Health Audit: `apps/api/src/services/guildTaxService.ts`

**Date:** 2026-03-15 03:11:34
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/guildTaxService.ts`

## Findings

### Type Safety
No issues found. Zero `as` casts, zero `any`. All transaction clients properly typed as `Prisma.TransactionClient`. All return types explicit. Well-defined `TaxResult` interface. Exemplary type safety.

### Error Handling
No issues found. Proper `AppError` for missing turn bank, treasury cap enforcement to prevent overflow, atomic operations inside transactions.

### Dead Code
No issues found.

### Unused Exports
- [low] **`applyGuildTax` standalone wrapper never imported in production code (line 143)** — Only the transactional variant `applyGuildTaxTx` is used by callers (11 importers). The standalone wrapper was likely created for routes that don't have a transaction context, but none currently use it. — **Suggested fix:** Remove if no route needs it, or keep as a convenience API.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
