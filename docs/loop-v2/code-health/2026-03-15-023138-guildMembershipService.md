# Code Health Audit: `apps/api/src/services/guildMembershipService.ts`

**Date:** 2026-03-15 02:31:38
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/guildMembershipService.ts`

## Findings

### Type Safety
- [high] **`tx: any` on 7 transaction callbacks (lines 43, 67, 179, 216, 235, 257, 276)** — Every `$transaction` callback in this file types the transaction client as `any`. This is the highest concentration of `tx: any` in any service audited so far. All DB operations inside these transactions (member creates/deletes, role updates, guild updates, log creation) have zero type checking. — **Suggested fix:** Type all transaction callbacks as `(tx: Prisma.TransactionClient) => ...`. This is a single import and provides full type safety for all `tx.model.operation()` calls.

### Error Handling
No issues found. Comprehensive validation: self-action prevention, role hierarchy enforcement (officers can't kick officers), race condition handling on join requests (lines 173-177), capacity re-checks, and proper `AppError` usage throughout. Fire-and-forget achievement checks are intentional.

### Dead Code
No issues found.

### Unused Exports
- [low] **`JoinRequestData` interface exported but never imported (line 77)** — Only used within this file as the return type of `getJoinRequests`. No external file imports it. — **Suggested fix:** Remove `export` keyword.

## Summary
2 findings: 0 critical, 1 high, 0 medium, 1 low
