# Database Audit: equipmentService

**Date:** 2026-03-14
**Service:** `apps/api/src/services/equipmentService.ts` (177 lines, 4 exported functions)

## Prisma Models Touched

Direct: `PlayerEquipment`, `Item`, `ItemTemplate`, `Player`, `PlayerSkill`

---

## Findings

### N+1 Queries

No N+1 issues. `ensureEquipmentSlots` uses `createMany` for bulk creation. All other queries are single lookups.

### Missing Indexes

No new issues. All `PlayerEquipment` queries use `@@id([playerId, slot])`. `PlayerSkill` uses `@@unique([playerId, skillType])`. `Item` and `Player` use PKs.

### Payload Bloat

**1. `getEquipmentStats` — full `include` chain for partial data (lines 41–48) — HIGH IMPACT**

This is the single most frequently called query in the codebase. It fetches full `PlayerEquipment` + `Item` + `ItemTemplate` rows for all equipped items. Only 4 fields are used from the joined data:
- `item.currentDurability` (durability check, line 65)
- `item.bonusStats` (stat aggregation, line 69)
- `item.template.baseStats` (stat aggregation, line 68)
- `item.template.maxDurability` (fallback durability, line 65)

```ts
prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  include: {
    item: {
      include: { template: true },  // fetches ALL 14 ItemTemplate columns
    },
  },
});
```

Unused columns fetched: `Item.id`, `Item.ownerId`, `Item.rarity`, `Item.quantity`, `Item.createdAt`, `Item.inStash`, `Item.isSoulbound`, `Item.templateId`, `ItemTemplate.id`, `ItemTemplate.name`, `ItemTemplate.itemType`, `ItemTemplate.weightClass`, `ItemTemplate.setId`, `ItemTemplate.slot`, `ItemTemplate.tier`, `ItemTemplate.requiredSkill`, `ItemTemplate.requiredLevel`, `ItemTemplate.stackable`, `ItemTemplate.consumableEffect`, `ItemTemplate.sellPrice`.

**Callers of `getEquipmentStats`** (from prior audits):
- `preparePlayerForCombat` — every PvE combat
- `buildPvpCombatant` ×2 — every PvP challenge
- `getHpState` — every HP check (combat/PvP/explore gate)
- `calculatePowerRating` ×2 — every PvP scout
- `getPlayerCapacity` — every inventory check / loot drop
- `buildPerActionScaling` fallback — combat path

**2. `equipItem` — `item.findUnique` with full `include: { template: true }` (line 99)**

Fetches full `ItemTemplate` for validation. Unlike `getEquipmentStats`, most template fields ARE used here for validation (`itemType`, `slot`, `requiredSkill`, `requiredLevel`), so this is largely justified. Could still narrow to the 5 fields used.

### Cache Issues

**`getEquipmentStats` is the #1 cache candidate in the entire codebase.**

No Redis usage anywhere in the service.

| Function | Call Frequency | Data Volatility |
|----------|---------------|----------------|
| `getEquipmentStats` | 2–5× per game action (combat, PvP, HP, inventory) | **Only changes on equip/unequip** |
| `ensureEquipmentSlots` | Every equip/unequip | Should be one-time per player |

Equipment stats change **only** when:
1. Player equips an item (`equipItem`)
2. Player unequips an item (`unequipSlot`)
3. Item durability changes (combat/repair — but `getEquipmentStats` computes from raw durability, not cached stats)

A Redis cache with event invalidation would eliminate the most repeated query pattern in the game.

### Migration Risks

None specific to this service.

---

## Query Patterns

### `ensureEquipmentSlots` — 1–2 queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `playerEquipment.findMany({ playerId })` | `@@id([playerId, slot])` prefix |
| 2 | `playerEquipment.createMany(...)` (if missing slots) | — |

### `getEquipmentStats` — 1 query (with 2 joins)

| Query | Select/Include | Index |
|-------|---------------|-------|
| `playerEquipment.findMany({ playerId, itemId: { not: null } })` | `include: { item: { include: { template: true } } }` — **full rows** | `@@id([playerId, slot])` prefix |

### `equipItem` — 4–6 queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `ensureEquipmentSlots` (findMany) | `@@id` prefix |
| 2 | `item.findUnique({ id })` with template | PK |
| 3 | `player.findUnique` or `playerSkill.findUnique` (level check) | PK or `@@unique` |
| 4 | `playerEquipment.updateMany({ playerId, itemId })` (clear old slot) | `@@id` prefix |
| 5 | `playerEquipment.upsert({ playerId_slot })` | `@@id` exact |

### `unequipSlot` — 2 queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `ensureEquipmentSlots` (findMany) | `@@id` prefix |
| 2 | `playerEquipment.update({ playerId_slot })` | `@@id` exact |

---

## Suggested Fixes

### Priority 1 — Cache `getEquipmentStats` in Redis (CRITICAL)

This is the highest-impact optimization across all audited services. Equipment stats are read 2–5 times per game action but change only on equip/unequip.

```ts
const cacheKey = `equipment:stats:${playerId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached) as EquipmentStats;

const stats = await computeEquipmentStats(playerId); // current logic
await redis.set(cacheKey, JSON.stringify(stats), 'EX', 600);
return stats;
```

**Invalidation points** (only 2):
- `equipItem` → `await redis.del(cacheKey)`
- `unequipSlot` → `await redis.del(cacheKey)`

Also invalidate from `durabilityService` when durability crosses 0 threshold (broken gear = zero stats).

**Estimated savings:** 3–8 queries per combat, 4–8 per PvP challenge, 1–2 per HP check.

### Priority 2 — Slim `getEquipmentStats` query

Even without caching, reduce the payload:

```ts
prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  select: {
    slot: true,
    item: {
      select: {
        currentDurability: true,
        bonusStats: true,
        template: {
          select: {
            baseStats: true,
            maxDurability: true,
          },
        },
      },
    },
  },
});
```

Reduces from ~30 columns to 4.

### Priority 3 — Eliminate redundant `ensureEquipmentSlots`

Move slot creation to player registration. Remove the check from `equipItem` and `unequipSlot` — existing players already have all slots.

```ts
// In player creation service:
await prisma.playerEquipment.createMany({
  data: ALL_EQUIPMENT_SLOTS.map(slot => ({ playerId, slot, itemId: null })),
});
```

Saves 1 query per equip/unequip action.
