# Database Audit: inventoryService

**Date:** 2026-03-14
**Service:** `apps/api/src/services/inventoryService.ts` (224 lines, 8 exported functions)

## Prisma Models Touched

Direct: `Item`, `ItemTemplate`, `PlayerEquipment`

---

## Findings

### N+1 Queries

**1. `consumeItemsByTemplate` — loop with individual update/delete per item (lines 115–128)**
Fetches all matching items, then loops and calls `update` or `delete` one at a time. For stacked items split across inventory/stash, this could be multiple sequential writes.

```ts
const items = await client.item.findMany({
  where: { ownerId: playerId, templateId: itemTemplateId },
  orderBy: [{ createdAt: 'asc' }],
  select: { id: true, quantity: true },
});

for (const item of items) {
  if (item.quantity > remaining) {
    await client.item.update({ where: { id: item.id }, data: { quantity: item.quantity - remaining } });
    break;
  }
  remaining -= item.quantity;
  await client.item.delete({ where: { id: item.id } });
}
```

In practice, stackables usually have 1 row, so this is typically 1 write. But the pattern is still N+1 by design.

### Missing Indexes

**CRITICAL: `Item` model has NO explicit `@@index` declarations at all.**

Every query in this service (and across the entire codebase) that filters `Item` by `ownerId` relies on implicit FK indexes that may or may not exist depending on the database. This is the most impactful missing-index finding in the audit so far.

**Affected query patterns in this service:**

| Query | WHERE clause | Needed index |
|-------|-------------|-------------|
| `addStackableItem` findFirst | `{ ownerId, templateId, inStash }` | `@@index([ownerId, templateId, inStash])` |
| `getTotalQuantityByTemplate` | `{ ownerId, templateId }` | `@@index([ownerId, templateId])` |
| `consumeItemsByTemplate` findMany | `{ ownerId, templateId }` + `orderBy: createdAt` | `@@index([ownerId, templateId])` |
| `getUsedSlots` findMany | `{ ownerId, inStash: false, equipment: { none: {} } }` | `@@index([ownerId, inStash])` |

**Impact:** The `items` table grows linearly with player count × items per player. Without indexes, these queries degrade to table scans as the game scales. Every loot drop, inventory check, crafting operation, and sell action hits these unindexed paths.

### Payload Bloat

**1. `getPlayerCapacity` — full equipment + template for 2 fields (lines 201–204)**
Fetches all equipped items with `include: { item: { include: { template: true } } }`. Only uses `template.tier` and `item.rarity` from the backpack slot, and `item.bonusStats` from the belt slot.

```ts
prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  include: { item: { include: { template: true } } },  // full rows for all equipment
});
```

**2. `addStackableItemWithClient` — full `itemTemplate` row for stackable check (line 30)**
`findUnique` without `select` — fetches all 14 ItemTemplate columns to check `template.stackable`.

```ts
const template = await client.itemTemplate.findUnique({ where: { id: itemTemplateId } });
// Only uses: template.stackable
```

### Cache Issues

**No Redis usage.**

| Function | Call Frequency | Data Volatility | Cache Candidate? |
|----------|---------------|----------------|-----------------|
| `getPlayerCapacity` | Every loot drop, inventory check | Only changes on equip/unequip | **Strong** — event-invalidated |
| `getUsedSlots` | Same as above | Changes on every item gain/loss | Weak — too volatile |
| `getInventoryState` | Same (calls both) | Mixed | Partial — cache capacity, not slots |

`getPlayerCapacity` is the best candidate. It's called on every loot drop (via `getInventoryState` in `lootService`) and every inventory check, but the result only changes when the player equips/unequips a backpack or belt. A Redis cache keyed by playerId, invalidated on equip/unequip, would eliminate a `findMany` + 2 joins per loot drop.

### Migration Risks

**1. `Item` model missing indexes — safe to add**
Adding `@@index` declarations generates a `CREATE INDEX` migration, which is non-destructive and can run concurrently (`CREATE INDEX CONCURRENTLY` in Postgres). No data risk, but the migration will take time proportional to table size.

**2. `Item.ownerId` has `onDelete: Cascade` via Player relation**
Player deletion cascades to delete all items. Correct behavior, but with no index on `ownerId`, the cascade delete would do a table scan to find affected rows.

---

## Query Patterns

| Function | Prisma Call | Select/Include | Missing Index? |
|----------|-----------|----------------|---------------|
| `addStackableItem` | `itemTemplate.findUnique` | No select (full row) | No (PK) |
| `addStackableItem` | `item.findFirst({ ownerId, templateId, inStash })` | `select: { id, quantity }` | **Yes** |
| `addStackableItem` | `item.update` or `item.create` | `select: { id, quantity }` | No (PK) |
| `getTotalQuantityByTemplate` | `item.findMany({ ownerId, templateId })` | `select: { quantity }` | **Yes** |
| `consumeItemsByTemplate` | `item.findMany({ ownerId, templateId })` | `select: { id, quantity }` | **Yes** |
| `consumeItemsByTemplate` | loop: `item.update`/`item.delete` | — | No (PK) |
| `getUsedSlots` | `item.findMany({ ownerId, inStash, equipment: none })` | `select: { templateId, template.stackable }` | **Yes** |
| `getPlayerCapacity` | `playerEquipment.findMany` | `include: { item: { include: { template } } }` | No (`@@id`) |

**Query counts:**
- `addStackableItem`: 2–3
- `getTotalQuantityByTemplate`: 1
- `consumeItemsByTemplate`: 1 + N (N = items to consume)
- `getInventoryState`: 2 (parallel)
- `getUsedSlots`: 1 (but heavy — NOT EXISTS subquery)
- `getPlayerCapacity`: 1 (but bloated joins)

---

## Suggested Fixes

### Priority 1 — Add indexes to `Item` model (CRITICAL)

```prisma
model Item {
  // ... existing fields ...

  @@index([ownerId])                      // covers all player inventory queries
  @@index([ownerId, templateId, inStash]) // covers stackable lookups, quantity checks
  @@map("items")
}
```

The compound `[ownerId, templateId, inStash]` index covers:
- `{ ownerId }` queries (prefix)
- `{ ownerId, templateId }` queries (prefix)
- `{ ownerId, templateId, inStash }` queries (exact match)

This single compound index, plus the base `[ownerId]` index, handles every query pattern in this service and most Item queries across the codebase.

### Priority 2 — Cache `getPlayerCapacity`

```ts
const cacheKey = `inventory:capacity:${playerId}`;
const cached = await redis.get(cacheKey);
if (cached) return parseInt(cached);
// ... compute ...
await redis.set(cacheKey, capacity.toString(), 'EX', 600);
```

Invalidate on: equip/unequip backpack or belt.

### Priority 3 — Slim `getPlayerCapacity`

Only fetch backpack and belt slots instead of all equipment:

```ts
prisma.playerEquipment.findMany({
  where: { playerId, slot: { in: ['backpack', 'belt'] }, itemId: { not: null } },
  select: {
    slot: true,
    item: { select: { rarity: true, bonusStats: true, template: { select: { tier: true } } } },
  },
});
```

### Priority 4 — Slim `addStackableItemWithClient` template check

```ts
const template = await client.itemTemplate.findUnique({
  where: { id: itemTemplateId },
  select: { stackable: true },
});
```
