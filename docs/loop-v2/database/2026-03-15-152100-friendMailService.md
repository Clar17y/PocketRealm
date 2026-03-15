# Database Audit: friendMailService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/friendMailService.ts` (292 lines, 7 exported functions)

## Prisma Models Touched
Direct: `FriendMail`, `Friendship`, `Player`
Via sub-service: `PlayerBlock` (via `isBlocked`)

## Findings
### N+1 Queries
None.

### Missing Indexes
None — `FriendMail` has `@@index([recipientId, isDeletedByRecipient, isRead])` and `@@index([senderId, isDeletedBySender])`. All query patterns covered.

### Payload Bloat
None — uses `include: { sender: { select: { username } }, recipient: { select: { username } } }` consistently. Good `select` on `deleteMail` validation query.

### Cache/Migration Issues
None.

## Query Patterns
- `sendMail`: 5–8 queries in tx (gold deduction + mail creation + inbox/sent pruning). Good optimistic lock.
- `getInbox`/`getSentMail`: 2 queries (parallel findMany + count). Paginated. Clean.
- `getUnreadCount`: 1 query. Uses `@@index([recipientId, isDeletedByRecipient, isRead])`. Clean.

## Suggested Fixes
None needed. Well-designed service with good indexes, soft-delete pattern, and inbox size management.
