# Durability System Overhaul — Design Spec

**Date:** 2026-03-14
**Tracker issues:** #11, #12, #13, #44, #45, #46
**Approach:** Constants-only rebalance with minor logic changes

## Problem Summary

The current durability system is too lenient to function as a meaningful item sink or crafting demand driver:

- **#44** — Degradation rate of 0.01 per hit means ~950 medium fights before an item breaks. Durability barely registers as a constraint.
- **#11** — `MIN_MAX_DURABILITY: 10` floor means items are never permanently destroyed. Once maxDurability hits 10, the item persists indefinitely with a trivial 2.1% turn overhead for maintenance.
- **#12** — Repair max-durability decay is uniform across rarities. A legendary and a common both lose 1-5 maxDurability per repair — disproportionate pain for rare items.
- **#13** — Repair costs are flat (100/150 turns) regardless of item tier. Cheap for endgame players, expensive for beginners.
- **#45** — Binary broken penalty: full stats at 0.01 durability, zero stats at 0. No gradual degradation.
- **#46** — No scaling of degradation with fight difficulty. Trash mobs and bosses cause identical per-hit wear.

## Design Decisions

- **#45 (binary penalty):** Keep as-is. The warning threshold at 10% provides notice. With items now permanently destroyable, the stakes are already higher. Gradual stat loss adds complexity without proportional value.
- **All other issues:** Address via constants changes and targeted logic modifications in `durabilityService.ts` and `repairService.ts`.

## Deviations from Brainstorm Notes

The brainstorm decision (tracker review log, 2026-03-13) proposed boss/world boss at 4x, expedition trash at 1.5x, and "highest zone tier 2x." During the design session we revised these:

- **Boss multipliers reduced to 3x** (from 4x). At 3x with the tripled base degradation, expedition final bosses already consume ~3.78 durability per fight. 4x would push to ~5.04, which combined with multi-phase boss fights felt too punishing.
- **Expedition trash uses default (1x)**, not 1.5x. Trash rooms already have 4-5 mobs each, so cumulative degradation per room is significant without an extra multiplier.
- **"Highest zone tier 2x" dropped.** During design Q&A we decided against keying multipliers on zone/mob tier since a T3 mob in a starter zone shouldn't cost more durability than a T1 mob in endgame zones. Multipliers key off combat context (expedition room type, boss flag), not zone or mob tier.

## Constants Changes

Replace flat constants with context-aware maps in `DURABILITY_CONSTANTS`:

```ts
export const DURABILITY_CONSTANTS = {
  // #44 — Triple degradation rate (~950 → ~313 medium fights to break)
  COMBAT_DEGRADATION: 0.03,                    // was 0.01

  // #46 — Combat-context multipliers applied to base degradation
  DEGRADATION_MULTIPLIER: {
    default: 1,                                 // open-world, PvP, expedition trash
    elite: 1.5,                                 // expedition elite rooms
    mini_boss: 2,                               // expedition mini-boss
    final_boss: 3,                              // expedition final boss
    world_boss: 3,                              // world boss encounters
  } as const,

  // #13 — Tier-scaled repair turn cost (was flat 100/150)
  REPAIR_TURN_COST_BY_TIER: {
    1: 50, 2: 75, 3: 100, 4: 125, 5: 150,
  } as const,
  BROKEN_REPAIR_MULTIPLIER: 1.5,               // broken item = tier cost × 1.5

  // #12 — Rarity-scaled max-durability decay per repair
  REPAIR_MAX_DECAY_BY_RARITY: {
    common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1,
  } as const,

  // #11 — Remove floor; items destroyed when maxDurability reaches 0
  MIN_MAX_DURABILITY: 0,                        // was 10

  WARNING_THRESHOLD: 0.10,                      // unchanged
} as const;
```

**Removed constants:** `REPAIR_TURN_COST`, `BROKEN_REPAIR_TURN_COST`, `REPAIR_MAX_DECAY` — replaced by the mapped versions above.

### Impact Analysis

With the new constants (base 0.03 per hit, default 1x multiplier):

| Scenario | Rounds | Hits | Weapon Loss | Fights to Break (max 100) |
|---|---|---|---|---|
| Easy mob (5 rounds) | 5 | ~3.5 | 0.11 | ~952 |
| Medium mob (15 rounds) | 15 | ~10.5 | 0.32 | ~317 |
| Hard mob (30 rounds) | 30 | ~21 | 0.63 | ~159 |
| Expedition elite (15 rounds, 1.5x) | 15 | ~10.5 | 0.47 | ~213 |
| Expedition mini-boss (30 rounds, 2x) | 30 | ~21 | 1.26 | ~79 |
| Expedition final boss (60 rounds, 3x) | 60 | ~42 | 3.78 | ~26 |

Repair frequency at medium difficulty: every ~317 fights, or roughly once per active play day. At the floor (maxDurability near 0), items are destroyed rather than persisting indefinitely.

### Legendary Item Lifespan

A legendary item with base maxDurability 100, decay of exactly 1 per repair:

- 100 repairs before destruction
- Each repair cycle: ~317 medium fights (at 0.03 degradation, 1x multiplier, when maxDurability is still high)
- Total lifespan: ~31,700 medium fights before permanent destruction
- As maxDurability shrinks, repair cycles get shorter, accelerating toward destruction

This is a long but finite lifespan. Players have ample time to craft replacements.

## Logic Changes

### 1. Degradation: `durabilityService.ts`

Add `degradationMultiplier` parameter to `degradeEquippedDurability`:

```ts
export async function degradeEquippedDurability(
  playerId: string,
  combatLog: CombatHitEntry[],
  perspective: CombatActor = 'combatantA',
  degradationMultiplier: number = 1,
): Promise<DurabilityLoss[]> {
```

Apply multiplier to degradation calculation:

```ts
const weaponDegradation = round2(myHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);
const armorDegradation = round2(theirHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);
```

**Call sites:**

| Call site | Multiplier |
|---|---|
| `combat/start.ts` (open-world) | `1` (default, omit param) |
| `zones.ts` (zone encounters) | `1` (default, omit param) |
| `exploration/start.ts` (ambushes) | `1` (default, omit param) |
| `pvpService.ts` | `1` (default, omit param) |
| Expedition combat (future) | `DEGRADATION_MULTIPLIER[roomType]` |
| World boss combat | `DEGRADATION_MULTIPLIER.world_boss` |

Open-world call sites don't change — the parameter defaults to 1. Expedition and world boss call sites pass the appropriate multiplier from the constants map.

### 2. Repair: `repairService.ts`

**`repairTurnCost(tier, isBroken)`** — replace flat cost with tier lookup:

```ts
export function repairTurnCost(tier: number, isBroken: boolean): number {
  const baseCost = DURABILITY_CONSTANTS.REPAIR_TURN_COST_BY_TIER[tier] ?? 100;
  return isBroken
    ? Math.ceil(baseCost * DURABILITY_CONSTANTS.BROKEN_REPAIR_MULTIPLIER)
    : baseCost;
}
```

**Call sites for `repairTurnCost`** (both need updating for new signature):

1. `apps/api/src/routes/inventory.ts` line ~140 — single-item repair route. Change from `repairTurnCost(current)` to `repairTurnCost(item.template.tier, current <= 0)`.
2. `apps/api/src/services/repairService.ts` line ~94 — inside `repairAllEquipped`. Change from `repairTurnCost(d.current)` to `repairTurnCost(d.item.template.tier, d.current <= 0)`. The `damaged` mapping already includes the full `item` with `template` via the `include: { item: { include: { template: true } } }` query, so `tier` is available.

**`repairItemDurability(tx, item, randomFn)`** — rarity-aware decay, item destruction:

The `item` parameter type expands to include `rarity: string` (for decay lookup). The `tier` field is NOT needed here — it's only used by `repairTurnCost` at the call site level.

```ts
item: {
  id: string;
  ownerId: string;
  currentDurability: number | null;
  maxDurability: number | null;
  rarity: string;                              // NEW — for decay lookup
  template: { maxDurability: number };
}
```

Decay uses the rarity map:

```ts
const maxDecay = DURABILITY_CONSTANTS.REPAIR_MAX_DECAY_BY_RARITY[item.rarity] ?? 5;
const decay = Math.min(maxDecay, Math.max(1, Math.floor(randomFn() * (maxDecay + 1))));
const newMax = Math.max(0, max - decay);    // floor is now 0, was MIN_MAX_DURABILITY (10)
```

Return type adds `destroyed: boolean`:

```ts
Promise<{ newMax: number; decay: number; destroyed: boolean }>
```

### 3. Item Destruction

When `repairItemDurability` produces `newMax === 0`:

1. **Skip** the normal `tx.item.updateMany` optimistic-lock update (no point updating a row we're about to delete)
2. **Unequip** the item from any slot: `tx.playerEquipment.updateMany({ where: { itemId: item.id }, data: { itemId: null } })`
3. **Delete** the item: `tx.item.delete({ where: { id: item.id } })`
4. Return `{ newMax: 0, decay, destroyed: true }`

When `newMax > 0`, the existing flow is unchanged: optimistic-lock `updateMany` sets both `currentDurability` and `maxDurability` to `newMax`, returns `{ newMax, decay, destroyed: false }`.

The turn cost for the repair is still charged — the player paid to attempt the repair, but the item was too degraded to survive.

**`repairAllEquipped`:**
- Destroyed items are included in the result array with `destroyed: true`. The `RepairEquippedResult.items` array type gains a `destroyed: boolean` field. For destroyed items, `currentDurability` and `maxDurability` are both `0` in the response.
- The `name` field uses `ic.item.template.name` which is captured before the delete executes within the same transaction, so it remains valid.
- Total turn cost includes costs for items that end up destroyed — the cost is calculated upfront before any repairs execute.
- No query changes needed: `ic.item` already includes `rarity` from the Prisma `include: { item: { include: { template: true } } }` query, so `rarity` is naturally available for `repairItemDurability`.
- Legendary items with `REPAIR_MAX_DECAY_BY_RARITY.legendary = 1` always lose exactly 1 maxDurability per repair — the formula clamps to `[1, maxDecay]` so when `maxDecay = 1`, decay is always 1. This gives legendary items the most predictable and slowest degradation.

### 4. API Route Changes

**`POST /api/v1/inventory/repair`** (single item — `apps/api/src/routes/inventory.ts`):
- Pass `item.template.tier` and broken status to `repairTurnCost`
- Pass `item.rarity` through to `repairItemDurability` (already available from the item query)
- If `destroyed: true` in result, return response with `destroyed: true` flag and the item name (no item data since it's deleted)

**`POST /api/v1/inventory/repair-equipped`** (batch — same route file):
- Same tier-aware cost calculation per item (via `repairAllEquipped` internal changes)
- Result includes which items were destroyed

**Note:** The single-item repair route applies `guildMods.repairCostReduction` but the batch route does not. This is a pre-existing inconsistency and is out of scope for this change.

No new routes or endpoints needed.

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/constants/gameConstants.ts` | Replace flat durability constants with mapped versions |
| `apps/api/src/services/durabilityService.ts` | Add `degradationMultiplier` parameter, apply to degradation calc |
| `apps/api/src/services/repairService.ts` | Tier-aware cost, rarity-aware decay, item destruction at maxDurability 0 |
| `apps/api/src/routes/inventory.ts` | Pass tier/rarity to repair functions, handle destroyed response |
| `apps/web/src/lib/api/items.ts` | Update `repairItem` and `repairAllEquipped` response types to include `destroyed` |
| `apps/api/src/routes/combat/start.ts` | No change (uses default multiplier) |
| `apps/api/src/routes/zones.ts` | No change (uses default multiplier) |
| `apps/api/src/routes/exploration/start.ts` | No change (uses default multiplier) |
| `apps/api/src/services/pvpService.ts` | No change (uses default multiplier) |
| Expedition combat routes (when they exist) | Pass `DEGRADATION_MULTIPLIER[roomType]` |
| World boss combat route | Pass `DEGRADATION_MULTIPLIER.world_boss` |

## Testing

- **Unit tests for `repairService`**: verify rarity-scaled decay, tier-scaled cost, destruction at maxDurability 0
- **Unit tests for `durabilityService`**: verify multiplier application, edge cases (multiplier 0, high multiplier)
- **Unit tests for `repairTurnCost`**: verify tier lookup, broken multiplier
- **Existing tests**: update to match new constant values and function signatures

## Out of Scope

- Gradual stat loss at low durability (#45 — keeping binary penalty)
- Durability scaling with item level
- Smithing skill reducing repair decay
- Encounter site difficulty multipliers (deferred to Encounter Site Rework)
