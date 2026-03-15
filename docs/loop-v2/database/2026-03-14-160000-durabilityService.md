# Database Audit: durabilityService

**Date:** 2026-03-14
**Service:** `apps/api/src/services/durabilityService.ts` (115 lines, 2 exported functions)

## Prisma Models Touched

Direct: `PlayerEquipment`, `Item`, `ItemTemplate`

---

## Findings

### N+1 Queries

**1. Per-item durability updates inside transaction loop (lines 59–110)**
Loops over all equipped weapon/armor items and issues individual `item.update` calls. A typical loadout (1 weapon + 4–5 armor pieces) produces 5–6 sequential updates inside the transaction.

```ts
await prisma.$transaction(async (tx) => {
  for (const item of uniqueItems.values()) {
    // ... per-item logic ...
    await tx.item.update({
      where: { id: item.id },
      data: { currentDurability: newCurrent },
    });
  }
});
```

Each item's `newCurrent` value differs (weapon vs armor degradation rates), so a single `updateMany` can't be used directly. However, two `updateMany` calls (one for weapons, one for armor) could replace the loop.

**2. Extra normalization updates for null durability (lines 74–82)**
Items with null `maxDurability` or `currentDurability` get an extra `update` call to persist defaults before the degradation update. This is a runtime data migration that should have been done at the DB level.

```ts
if (item.maxDurability === null || item.currentDurability === null) {
  await tx.item.update({
    where: { id: item.id },
    data: { maxDurability, currentDurability },
  });
}
```

### Missing Indexes

No new issues. All queries use `@@id([playerId, slot])` on `PlayerEquipment` and PK on `Item`.

### Payload Bloat

**1. Equipment fetch duplicates `getEquipmentStats` pattern (lines 45–50)**
Uses identical `include: { item: { include: { template: true } } }` — fetches ~30 columns. Only uses 6 fields: `item.id`, `item.currentDurability`, `item.maxDurability`, `template.itemType`, `template.maxDurability`, `template.name`.

```ts
prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  include: {
    item: { include: { template: true } },  // ~30 columns, uses 6
  },
});
```

**Moreover:** In the combat path, this query runs AFTER `getEquipmentStats` has already fetched the exact same data. The equipment data is fetched twice per combat — once for stat calculation, once for durability.

### Cache Issues

**No Redis usage.**

The equipment data for durability is identical to what `getEquipmentStats` fetches. If `getEquipmentStats` were cached (as recommended in the equipmentService audit), this function could receive the pre-fetched data as a parameter instead of re-querying.

| Function | Call Frequency | Optimization |
|----------|---------------|-------------|
| `degradeEquippedDurability` | Every PvE combat, every PvP match (×2 for both combatants) | Accept pre-fetched equipment data |

### Migration Risks

**1. Runtime null-durability normalization (lines 74–82)**
This code handles items created before durability was added (null `maxDurability`/`currentDurability`). It runs on every combat for every equipped item, checking for nulls that likely no longer exist. A one-time data migration would eliminate this branch.

---

## Query Patterns

### `degradeEquippedDurability` — 1 + N queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `playerEquipment.findMany({ playerId, itemId: { not: null } })` with full includes | `@@id([playerId, slot])` prefix |
| 2–N | `item.update({ id })` per weapon/armor item (in tx) | PK |

**Typical query count:** 1 (findMany) + 5–6 (updates) = **6–7 queries per combat**
With null normalization: up to 12 queries.

Called twice in PvP (`combatantA` + `combatantB`): **12–14 queries per PvP match** just for durability.

---

## Suggested Fixes

### Priority 1 — Accept pre-fetched equipment data

The combat path already calls `getEquipmentStats` which fetches the same equipment data. Pass it through:

```ts
export async function degradeEquippedDurability(
  playerId: string,
  combatLog: CombatHitEntry[],
  perspective: CombatActor = 'combatantA',
  preloadedEquipment?: EquippedItemData[],  // ← add this
): Promise<DurabilityLoss[]> {
  const equipped = preloadedEquipment ?? await fetchEquipment(playerId);
  // ...
}
```

Saves 1 query + 2 joins per combat, 2 queries + 4 joins per PvP match.

### Priority 2 — Batch durability updates

Replace the per-item loop with two `updateMany` calls:

```ts
// Compute new durability values for weapons and armor
const weaponIds = [...]; // items where template.itemType === 'weapon'
const armorIds = [...];  // items where template.itemType === 'armor'

await tx.$executeRaw`
  UPDATE items SET current_durability = GREATEST(0, current_durability - ${weaponDegradation})
  WHERE id = ANY(${weaponIds}) AND current_durability > 0
`;
await tx.$executeRaw`
  UPDATE items SET current_durability = GREATEST(0, current_durability - ${armorDegradation})
  WHERE id = ANY(${armorIds}) AND current_durability > 0
`;
```

Reduces 5–6 updates to 2 raw SQL calls.

### Priority 3 — One-time data migration for null durability

Run a migration to fill all null durability values:

```sql
UPDATE items i
SET max_durability = t.max_durability,
    current_durability = t.max_durability
FROM item_templates t
WHERE i.template_id = t.id
  AND (i.max_durability IS NULL OR i.current_durability IS NULL);
```

Then remove the runtime null check (lines 74–82).

### Priority 4 — Slim the equipment query (if not using preloaded data)

```ts
prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  select: {
    item: {
      select: {
        id: true,
        currentDurability: true,
        maxDurability: true,
        template: { select: { itemType: true, maxDurability: true, name: true } },
      },
    },
  },
});
```
