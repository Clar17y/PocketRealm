# Code Health Audit: `apps/api/src/services/guildContractService.ts`

**Date:** 2026-03-15 02:21:30
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/guildContractService.ts`

## Findings

### Type Safety
- [high] **`tx: any` on transaction clients (lines 53, 146)** — Both `$transaction` callbacks type the transaction client as `any`, disabling all type checking on DB operations inside the transactions (lines 56, 72, 148, 155, 160). Any typo in model names, field names, or data shapes would compile silently. — **Suggested fix:** Type as `Prisma.TransactionClient` (import from `@pocketrealm/database`).

- [medium] **`const created: any[] = []` explicit any array (line 54)** — The accumulator loses all typing from `tx.guildContract.create()`. The `toContractData` mapper (line 83) then operates on `any` objects, meaning missing/renamed fields wouldn't be caught. — **Suggested fix:** Type as the Prisma `GuildContract` model: `const created: GuildContract[] = []`.

- [low] **`row.status as 'active' | 'completed' | 'expired'` cast (line 30)** — String to union cast without validation. Standard pattern across the codebase. — **Suggested fix:** Add runtime check or use a validated enum.

### Error Handling
No issues found. Good optimistic locking on contract completion (lines 148-152). Fire-and-forget on achievements (line 177) is intentional and documented with `void`.

### Dead Code
No issues found.

### Unused Exports
- [low] **`generateWeeklyContracts` exported but only imported by test file (line 42)** — Called internally by `getActiveContracts` (line 109). No production code imports it. — **Suggested fix:** Remove `export` or mark with `/** @internal */`.

- [low] **Re-exported `getWeekStart` never imported from this module (line 188)** — `getWeekStart` is re-exported from `dateHelpers`, but no production file imports it from `guildContractService`. Only the test file does. — **Suggested fix:** Remove the re-export. Tests can import directly from `dateHelpers`.

## Summary
5 findings: 0 critical, 1 high, 1 medium, 3 low
