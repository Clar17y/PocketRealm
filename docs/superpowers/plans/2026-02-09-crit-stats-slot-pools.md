# Plan: critChance/critDamage Stats + Slot-Aware Stat Pools

## Summary
Add `critChance` and `critDamage` as rollable item stats with fixed ranges (not % of base), and make bonus stat pools slot-aware (Diablo-style) so different gear slots roll different stats.

Build order: **shared → game-engine → api → web**

---

## Step 1: Shared Types — `packages/shared/src/types/item.types.ts`

Add to `ItemStats`:
```typescript
critChance?: number;  // flat bonus to base 5% (e.g., 0.04 = +4%)
critDamage?: number;  // flat bonus to base 1.5x (e.g., 0.15 → 1.65x)
```

No DB migration — `bonusStats` and `baseStats` are JSON columns.

## Step 2: Combat Types — `packages/shared/src/types/combat.types.ts`

**CombatantStats** — add:
```typescript
critChance?: number;
critDamage?: number;
```

**CombatLogEntry** — add:
```typescript
critMultiplier?: number;  // actual multiplier used (e.g. 1.65)
```

## Step 3: Constants — `packages/shared/src/constants/gameConstants.ts`

Add `CRIT_STAT_CONSTANTS` with fixed rolling ranges:
```
critChance: { min: 0.03, max: 0.05 }   // 3-5% per bonus slot
critDamage: { min: 0.10, max: 0.20 }   // 10-20% per bonus slot
```

Add `SLOT_STAT_POOLS` — per-slot primary + utility pools:

| Slot | Primary | Utility |
|------|---------|---------|
| main_hand | attack*/magicPower*/rangedPower*, critChance, critDamage | accuracy, luck |
| off_hand | armor, dodge | health, luck |
| head | armor, health | accuracy, luck |
| chest | armor, health | luck |
| legs | armor, health | dodge, luck |
| boots | dodge, armor | luck |
| gloves | critChance, accuracy, critDamage | attack, luck |
| neck | health, luck | accuracy |
| belt | armor, health | luck |
| ring | luck, accuracy, critChance, critDamage | dodge |
| charm | luck, accuracy, dodge, critChance, critDamage | health |

*\*offensive stats filtered by baseStats — if weapon has `attack: 5`, only `attack` from the offensive triple enters the pool; critChance/critDamage always eligible*

## Step 4: Build shared
```bash
npm run build --workspace=packages/shared
```

## Step 5: Crafting Crit — `packages/game-engine/src/crafting/craftingCrit.ts`

**5a. `getEligibleBonusStats(itemType, baseStats, slot?)` — add optional `slot` param**
- If slot provided + exists in `SLOT_STAT_POOLS`: use slot-specific pool
  - For main_hand: filter offensive stats by baseStats > 0 (existing logic), keep critChance/critDamage always
  - Combine primary + utility
- If slot null/undefined: existing weapon/armor fallback (backward compat)

**5b. `rollBonusStat()` — fixed-range override for crit stats**

After picking a stat, check `CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS[stat]`:
- If match → roll `min + random * (max - min)`, round to 2 decimals
- If no match → existing % of base logic (unchanged)

**5c. `CalculateCraftingCritInput` — add optional `slot` field**, thread to `getEligibleBonusStats`

## Step 6: Item Rarity — `packages/game-engine/src/items/itemRarity.ts`

**`RollBonusStatsForRarityInput` — add `slot?: EquipmentSlot | null`**

Pass `input.slot` to `getEligibleBonusStats()` in `rollBonusStatsForRarity()`.

## Step 7: Damage Calculator — `packages/game-engine/src/combat/damageCalculator.ts`

**7a. `isCriticalHit(bonusCritChance = 0)`** — use `COMBAT_CONSTANTS.CRIT_CHANCE + bonusCritChance`

**7b. `calculateFinalDamage(rawDamage, armor, isCrit, bonusCritDamage = 0)`** — use `COMBAT_CONSTANTS.CRIT_MULTIPLIER + bonusCritDamage`, return `{ damage, actualMultiplier }`

**7c. `buildPlayerCombatStats()`** — accept `critChance?` and `critDamage?` in equipment param, pass through to CombatantStats

## Step 8: Combat Engine — `packages/game-engine/src/combat/combatEngine.ts`

**8a. `executePlayerAttack()`**:
- `isCriticalHit(playerStats.critChance ?? 0)`
- `calculateFinalDamage(rawDamage, mobStats.defence, crit, playerStats.critDamage ?? 0)`
- Fix `armorReduction` calc: use `actualMultiplier` instead of hardcoded `1.5`
- Add `critMultiplier` to log entry when crit

**8b. `executeMobAttack()`**:
- `isCriticalHit(0)` — mobs keep base 5%
- `calculateFinalDamage(rawDamage, playerStats.defence, crit, 0)` — mobs keep base 1.5x
- Fix `armorReduction` calc same way
- Add `critMultiplier` to log entry when crit

## Step 9: Build game-engine
```bash
npm run build --workspace=packages/game-engine
```

## Step 10: Equipment Service — `apps/api/src/services/equipmentService.ts`

Add `critChance: number` and `critDamage: number` to `EquipmentStats` interface.
Aggregate from equipped items in `getEquipmentStats()` loop.

## Step 11: Loot Service — `apps/api/src/services/lootService.ts`

Pass `slot: entry.itemTemplate.slot` to `rollBonusStatsForRarity()`.

## Step 12: Crafting Routes — `apps/api/src/routes/crafting.ts`

Three call sites — all get `slot` from template:
1. **Craft** (~line 364): pass `slot: recipe.resultTemplate.slot`
2. **Forge upgrade** (~line 527): pass `slot: item.template.slot` to `getEligibleBonusStats()`
3. **Forge reroll** (~line 719): pass `slot: item.template.slot`

Also pass `slot` to `calculateCraftingCrit()` at craft site.

## Step 13: Combat Route — `apps/api/src/routes/combat.ts`

No changes needed — `getEquipmentStats()` now returns critChance/critDamage, and `buildPlayerCombatStats()` now accepts them. Flow is automatic.

## Step 14: Frontend Types — `apps/web/src/app/game/useGameController.ts`

Add `critMultiplier?: number` to `LastCombatLogEntry` interface.

## Step 15: Combat Log UI — `apps/web/src/components/combat/CombatLogEntry.tsx`

Replace hardcoded `1.5`:
```typescript
const critMultiplier = entry.isCritical ? (entry.critMultiplier ?? 1.5) : 1;
// Display: × {critMultiplier} crit
```

## Step 16: Stat Display — Equipment.tsx, Inventory.tsx, Forge.tsx

Crit stats stored as decimals (0.04) → display as percentages (+4% Crit Chance):
- Add `critChance`/`critDamage` to `prettyStatName` / stat display helpers
- Format: `isPercentStat ? `${Math.round(value * 100)}%` : value`
- Add to Equipment total stats panel (showing total effective crit chance/damage including base values)

## Step 17: Equipment Total Stats Panel — Equipment.tsx + page.tsx

Add Crit Chance and Crit Damage to the Total Stats grid:
- Crit Chance shows total effective chance (base 5% + gear bonus)
- Crit Damage shows total effective multiplier (base 150% + gear bonus)
- Aggregate critChance/critDamage in page.tsx stats computation

## Step 18: Tests

**`craftingCrit.test.ts`:**
- Test `getEligibleBonusStats` with slot param (main_hand, gloves, chest, etc.)
- Test backward compat without slot param
- Test `rollBonusStat` for fixed-range crit stats (values within 0.03-0.05 / 0.10-0.20)

**`itemRarity.test.ts`:**
- Test `rollBonusStatsForRarity` with slot param
- Verify main_hand can roll critChance/critDamage
- Verify gloves/ring/charm can roll crit stats
- Verify chest cannot roll critChance/critDamage

## Step 19: Verify
```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/game-engine
npm run typecheck
npm run test:engine
```

---

## Key Files
- `packages/shared/src/types/item.types.ts` — ItemStats
- `packages/shared/src/types/combat.types.ts` — CombatantStats, CombatLogEntry
- `packages/shared/src/constants/gameConstants.ts` — new constants
- `packages/game-engine/src/crafting/craftingCrit.ts` — slot-aware pools + fixed-range rolling
- `packages/game-engine/src/items/itemRarity.ts` — thread slot
- `packages/game-engine/src/combat/damageCalculator.ts` — parameterize crit
- `packages/game-engine/src/combat/combatEngine.ts` — use player crit stats
- `apps/api/src/services/equipmentService.ts` — aggregate crit stats
- `apps/api/src/services/lootService.ts` — pass slot
- `apps/api/src/routes/crafting.ts` — pass slot (3 sites)
- `apps/web/src/app/game/useGameController.ts` — critMultiplier type
- `apps/web/src/components/combat/CombatLogEntry.tsx` — dynamic crit display
- `apps/web/src/components/screens/Equipment.tsx` — crit stat display + total stats panel
- `apps/web/src/components/screens/Inventory.tsx` — crit stat display
- `apps/web/src/components/screens/Forge.tsx` — crit stat display
- `apps/web/src/app/game/page.tsx` — aggregate crit stats for Equipment component

## Edge Cases
- **Existing items**: No critChance/critDamage in JSON → aggregator treats as 0, no migration needed
- **Stacking**: Legendary (4 slots) rolling critChance repeatedly is intentional — max theoretical ~20% bonus
- **Mobs**: Keep flat base crit (5% / 1.5x), no gear bonuses
- **Rounding**: Crit values rounded to 2 decimals to avoid float display issues
