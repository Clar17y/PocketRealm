# Code Health Audit: `apps/api/src/services/friendMailService.ts`

**Date:** 2026-03-15 02:01:22
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/friendMailService.ts`

## Findings

### Type Safety
- [medium] **`as MailRow` casts on Prisma results (lines 141, 165, 186, 207, 235, 238)** — Six `as MailRow` casts convert Prisma query results to the local `MailRow` interface. Prisma infers precise types from `include: MAIL_INCLUDE`, but these are overridden with a manually-maintained interface. If the schema changes (e.g., `sender` relation is renamed or `friendMail` gains a required field), the `MailRow` interface would silently diverge from the actual query shape. The `toMailEntry` mapper would then access stale properties without compile-time errors. — **Suggested fix:** Remove the `MailRow` interface and cast. Let Prisma's inferred type flow through: `const mails = await prisma.friendMail.findMany(...)` already returns the correct shape. Define `toMailEntry` to accept `typeof mails[number]` or use a helper type.

### Error Handling
No issues found. Excellent patterns: optimistic lock on gold deduction (lines 79-85), bidirectional block checking, input sanitization, automatic inbox/sent pruning within the transaction, and proper soft-delete with eventual hard-delete.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 7 exports are imported in production code:
- `sendMail`, `getInbox`, `getSentMail`, `readMail`, `deleteMail`, `getUnreadCount` — friends route
- `sendSystemMail` — sparService

## Summary
1 finding: 0 critical, 0 high, 1 medium, 0 low
