# Database Audit: pendingLootService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/pendingLootService.ts` (104 lines, 3 exported functions)

## Prisma Models Touched

Direct: `Item` (creates in `claimPendingLoot`)
Via sub-service: `PlayerEquipment` (via `getInventoryState`)
Redis: `pending_loot:{playerId}:{sessionId}` keys

---

## Findings

### N+1 Queries

**1. `claimPendingLoot` — per-item `item.create` loop (lines 79–96)**
Creates items one at a time inside a transaction. For 5 selected items: 5 sequential `create` calls.

```ts
for (const idx of uniqueIndices) {
  // ...
  await tx.item.create({
    data: { ownerId: playerId, templateId: lootItem.templateId, ... },
  });
  slotsUsed++;
}
```

Could use `createMany` for bulk creation (items have individual `rarity`, `bonusStats`, so each data row differs, but `createMany` handles this).

### Missing Indexes

No issues — only `item.create` (no WHERE clauses).

### Payload Bloat

No issues — this service barely fetches Prisma data. Only `getInventoryState` (already audited).

### Cache Issues

**This service is the model for Redis usage.** Properly uses Redis for ephemeral pending loot storage:
- `storePendingLoot`: `redis.set` with TTL — write
- `getPendingLoot`: `redis.get` — read
- `claimPendingLoot`: `redis.getdel` — atomic read+delete (prevents double-claim race condition)
- Error recovery: restores Redis key on DB transaction failure (lines 99–101)

No cache issues.

### Migration Risks

None.

---

## Query Patterns

### `storePendingLoot` — 0 Prisma queries

| Step | Operation | Notes |
|------|-----------|-------|
| 1 | `redis.set(key, JSON.stringify(items), 'EX', TTL)` | Redis only |

### `getPendingLoot` — 0 Prisma queries

| Step | Operation | Notes |
|------|-----------|-------|
| 1 | `redis.get(key)` | Redis only |

### `claimPendingLoot` — 2 + N queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `redis.getdel(key)` | Atomic read+delete |
| 2 | `getInventoryState(playerId)` | 2 Prisma queries |
| 3–N | `item.create` per selected item (in tx) | N+1 |
| err | `redis.set(key, data, 'EX', TTL)` | Restore on failure |

---

## Suggested Fixes

### Priority 1 — Batch item creation with `createMany`

```ts
const itemsToCreate = uniqueIndices
  .filter(idx => idx >= 0 && idx < items.length && slotsUsed < capacity)
  .slice(0, capacity - slotsUsed)
  .map(idx => {
    const lootItem = items[idx];
    return {
      ownerId: playerId,
      templateId: lootItem.templateId,
      rarity: lootItem.rarity,
      quantity: lootItem.quantity,
      bonusStats: lootItem.bonusStats ?? undefined,
      currentDurability: lootItem.currentDurability,
      maxDurability: lootItem.maxDurability,
    };
  });

await tx.item.createMany({ data: itemsToCreate as any });
```

Reduces N `create` calls to 1 `createMany`. Note: `createMany` doesn't return created records, but this function returns `void` so that's fine.

### No other fixes needed

This is one of the best-designed services in the codebase:
- Proper Redis usage with TTL
- Atomic `getdel` prevents double-claim
- Error recovery restores Redis key on DB failure
- Clean separation of concerns
