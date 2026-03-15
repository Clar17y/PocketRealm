# Database Audit: expeditionShopService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/expeditionShopService.ts` (120 lines, 3 exported functions)

## Prisma Models Touched

Direct: `Player`, `Zone`, `ItemTemplate`, `Item`
Via sub-service: `PlayerEquipment` (via `getInventoryState`)

---

## Findings

### N+1 Queries
None.

### Missing Indexes

**1. `ItemTemplate.name` — no index for `findFirst({ name })` (line 69)**
Looks up item template by name (seeded expedition gear). Sequential scan on `item_templates` table. Low impact since the table is small and this is an infrequent player action.

```ts
prisma.itemTemplate.findFirst({ where: { name: shopItem.name } });
```

### Payload Bloat

**1. `itemTemplate.findFirst` — no select (line 69)**
Fetches full ItemTemplate row (14 columns). Uses `id` and `maxDurability` — 2 fields.

### Cache Issues

**1. `itemTemplate.findFirst({ name })` — static seeded data (line 69)**
Expedition shop item templates are seeded and never change. Could be cached globally or looked up by ID instead of name.

### Migration Risks
None. Good optimistic lock pattern for token deduction (`updateMany` with `gte` guard).

---

## Query Patterns

### `getPlayerTokens` — 1 query
`player.findUnique` with `select: { expeditionTokens }`. Clean.

### `purchaseShopItem` — 7–8 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `player.findUnique` with select | Good |
| 2 | `zone.findUnique` with select | Good |
| 3 | `getInventoryState` | 2 queries |
| 4 | `itemTemplate.findFirst({ name })` | **No select, no index** |
| 5 | tx: `player.updateMany` (optimistic lock) | Good pattern |
| 6 | tx: `player.findUniqueOrThrow` with select | Good |
| 7 | tx: `item.create` | — |

---

## Suggested Fixes

### Priority 1 — Cache or pre-map expedition shop templates

Since shop items are static, build a template ID map at startup:

```ts
const TEMPLATE_ID_BY_SHOP_NAME = new Map<string, string>();
// Populate on server start from DB
```

Eliminates the `findFirst` query entirely.

### Priority 2 — Add select to itemTemplate fetch

```ts
prisma.itemTemplate.findFirst({
  where: { name: shopItem.name },
  select: { id: true, maxDurability: true },
});
```
