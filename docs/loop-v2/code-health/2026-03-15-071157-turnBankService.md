# Code Health Audit: `apps/api/src/services/turnBankService.ts`

**Date:** 2026-03-15 07:11:57
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/turnBankService.ts`

## Findings

### Type Safety
No issues found. Excellent type safety throughout: `Prisma.TransactionClient` on transaction functions (lines 108, 184), custom `TurnBankClient` structural interface (lines 37-42) to unify prisma client and transaction client without `any`, and all return types explicitly annotated as `Promise<TurnState>`, `Promise<SpendTurnsResult>`, `Promise<RefundTurnsResult>`.

### Error Handling
No issues found. Comprehensive validation: positive integer checks (lines 50-52, 130-132), 404 on missing turn bank (lines 58-60, 138-140), insufficient turns check (lines 65-67), optimistic locking with 3-attempt retry loop (lines 54-96, 134-172), and 409 Conflict after exhausting retries (lines 96, 172).

### Dead Code
No issues found.

### Unused Exports
- [low] **`RefundTurnsResult` is not exported, inconsistent with `SpendTurnsResult` (line 116 vs line 29)** — `SpendTurnsResult` is exported and used by `guildTaxService.ts`. `RefundTurnsResult` is kept internal despite the same pattern. Consumers of `refundPlayerTurns`/`refundPlayerTurnsTx` cannot reference the return type by name (TypeScript infers it structurally). — **Suggested fix:** Export `RefundTurnsResult` for consistency, or accept the asymmetry if no consumer needs the named type.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
