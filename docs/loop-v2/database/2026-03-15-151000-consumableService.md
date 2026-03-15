# Database Audit: consumableService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/consumableService.ts` (119 lines, 1 exported function)

## Prisma Models Touched

Direct: `Item`, `ItemTemplate`, `Player`
Via sub-service: `PlayerEquipment`, `Item`, `ItemTemplate` (via `getHpState`)

---

## Findings

### N+1 Queries
None.

### Missing Indexes
No new issues.

### Payload Bloat

**1. `item.findUnique` with `include: { template: true }` — 14 cols, uses 3 (line 24)**
Uses `template.itemType`, `template.consumableEffect`, `template.name`.

### Cache Issues
None.

### Migration Risks
None. Good optimistic lock pattern for HP update.

---

## Query Patterns

### `useConsumable` — 6–8 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `item.findUnique` with template include | Payload bloat |
| 2 | `getHpState` | 3 queries (transitive) |
| 3 | tx: `player.findUnique` with select | Good |
| 4 | tx: `player.updateMany` (optimistic lock) | Good |
| 5 | tx: `item.update` or `item.delete` | |

---

## Suggested Fixes

Add `select` to template include:
```ts
include: { template: { select: { itemType: true, consumableEffect: true, name: true } } }
```
