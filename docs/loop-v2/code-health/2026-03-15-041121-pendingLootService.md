# Code Health Audit: `apps/api/src/services/pendingLootService.ts`

**Date:** 2026-03-15 04:11:21
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/pendingLootService.ts`

## Findings

### Type Safety
- [medium] **`as any` on item create data (line 93)** — `tx.item.create({ data: { ... } as any })` bypasses Prisma type checking. Same systemic `Item` model pattern seen across `lootService`, `inventoryService`, `dropRollingService`, and `cacheLootService`. — **Suggested fix:** Fix the underlying `Item` model typing in the Prisma schema (likely optional fields causing the mismatch) to eliminate `as any` across all 5+ services at once.

- [low] **Unvalidated `JSON.parse` from Redis (lines 56, 70)** — `JSON.parse(data)` returns `any` and is either returned directly or assigned to a typed variable without shape validation. If Redis data is corrupted (e.g., partial write, manual edit), the caller gets malformed objects. — **Suggested fix:** Add a thin validator or at minimum an `Array.isArray` check.

### Error Handling
No issues found. Excellent patterns:
- Atomic `redis.getdel()` prevents double-claim race condition (line 67).
- Recovery on DB failure: catch block restores the Redis key so loot isn't lost (lines 98-102). This is one of the best error recovery patterns in the entire codebase.
- Proper `AppError` for expired/claimed loot.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 4 exports are heavily imported (8 consumer files):
- `PendingLootItem` — cacheLootService, dropRollingService, combatOrchestrationService, exploration/start, zones, lootService
- `storePendingLoot` — combat/start, exploration/start, zones, lootService
- `getPendingLoot` — inventory route
- `claimPendingLoot` — inventory route

## Summary
2 findings: 0 critical, 0 high, 1 medium, 1 low
