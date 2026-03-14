# Plan 05 — Mana Potion Rebalance

## Goal

Fill the mana potion tier gap and align mana restore values proportionally with stamina potions. Currently mana potions jump from T1 (alchemy 1, restores 20) straight to T4 (alchemy 20, restores 40) and T5 (alchemy 25, restores 70), leaving a dead zone from alchemy 2-19 with no mana potion progression. Stamina potions have smooth T1/T2/T3 coverage; mana needs the same.

## Rationale

| Potion | Tier | Alchemy Req | Before | After | Notes |
|--------|------|-------------|--------|-------|-------|
| Minor Mana Potion | T1 | 1 | 20 | 25 | Slight bump for parity with Minor Stamina (30) |
| Mana Potion (NEW) | T2 | 8 | -- | 45 | New, fills T2 gap (Stamina Potion restores 60) |
| Focused Mana Potion (NEW) | T3 | 15 | -- | 65 | New, fills T3 gap (Greater Stamina restores 100) |
| Standard Mana Potion (existing) | T4 | 20 | 40 | 80 | Renamed from "Mana Potion", value increased |
| Greater Mana Potion | T5 | 25 | 70 | 100 | Increased for T5 parity |

Mana pools are roughly 74% of stamina pools, so mana restore values target roughly 74-80% of equivalent stamina potion values.

## Steps

### Step 1 — Add new IDs for the two new mana potions

**File:** `packages/database/prisma/seed-data/ids.ts`

1. Find the `pots` object (around line 210).
2. Add two new entries inside the `pots` block, after `minorManaPotion`:
   - `manaPotion2: randomUUID(),` (T2 mana potion)
   - `manaPotion3: randomUUID(),` (T3 mana potion)

Note: The existing `manaPotion` ID stays as-is (it becomes the T4 entry). The existing `greaterManaPotion` stays as the T5 entry.

### Step 2 — Add new constant keys for the two new mana restore values

**File:** `packages/shared/src/constants/gameConstants.ts`

1. Find `POTION_CONSTANTS` (around line 583).
2. Update the mana potion values section:
   - Change `MINOR_MANA_RESTORE: 20` to `MINOR_MANA_RESTORE: 25`
   - Add `MANA_RESTORE_T2: 45,` (new)
   - Add `MANA_RESTORE_T3: 65,` (new)
   - Change `MANA_RESTORE: 40` to `MANA_RESTORE: 80` (this is the existing T4 "Mana Potion")
   - Change `GREATER_MANA_RESTORE: 70` to `GREATER_MANA_RESTORE: 100` (T5)

Final mana section should look like:

```
// Mana potions
MINOR_MANA_RESTORE: 25,
MANA_RESTORE_T2: 45,
MANA_RESTORE_T3: 65,
MANA_RESTORE: 80,
GREATER_MANA_RESTORE: 100,
```

### Step 3 — Build shared package

```bash
npm run build --workspace=packages/shared
```

This must complete before downstream packages can see the new constants.

### Step 4 — Add item templates for the two new mana potions

**File:** `packages/database/prisma/seed-data/items.ts`

1. Find the `// Mana potions` comment block (around line 263).
2. The existing entries are:
   ```
   consumable(IDS.pots.minorManaPotion, 'Minor Mana Potion', 1, { type: 'restore_mana', value: POTION_CONSTANTS.MINOR_MANA_RESTORE }),
   consumable(IDS.pots.greaterManaPotion, 'Greater Mana Potion', 5, { type: 'restore_mana', value: POTION_CONSTANTS.GREATER_MANA_RESTORE }),
   ```
3. Insert two new entries between them and update the `manaPotion` entry. The full block should become:
   ```
   // Mana potions
   consumable(IDS.pots.minorManaPotion, 'Minor Mana Potion', 1, { type: 'restore_mana', value: POTION_CONSTANTS.MINOR_MANA_RESTORE }),
   consumable(IDS.pots.manaPotion2, 'Mana Potion', 2, { type: 'restore_mana', value: POTION_CONSTANTS.MANA_RESTORE_T2 }),
   consumable(IDS.pots.manaPotion3, 'Focused Mana Potion', 3, { type: 'restore_mana', value: POTION_CONSTANTS.MANA_RESTORE_T3 }),
   consumable(IDS.pots.manaPotion, 'Greater Mana Potion', 4, { type: 'restore_mana', value: POTION_CONSTANTS.MANA_RESTORE }),
   consumable(IDS.pots.greaterManaPotion, 'Supreme Mana Potion', 5, { type: 'restore_mana', value: POTION_CONSTANTS.GREATER_MANA_RESTORE }),
   ```

Note: The existing `manaPotion` (T4) is renamed from "Mana Potion" to "Greater Mana Potion", and the existing `greaterManaPotion` (T5) is renamed to "Supreme Mana Potion", so names scale logically: Minor -> Mana -> Focused Mana -> Greater Mana -> Supreme Mana.

Also move the existing T4 `manaPotion` entry from line 257 (where it currently sits in the middle of the consumables list between Resist Potion and Elixir of Power) down into the `// Mana potions` section for consistency, and remove the duplicate.

### Step 5 — Add crafting recipes for the two new mana potions

**File:** `packages/database/prisma/seed-data/recipes.ts`

1. Find the `// Mana potions` comment block (around line 99).
2. The existing entries are:
   ```
   recipe({ skillType: 'alchemy', requiredLevel: 1, resultTemplateId: pots.minorManaPotion, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: res.caveMoss, quantity: 2 }] }),
   recipe({ skillType: 'alchemy', requiredLevel: 25, resultTemplateId: pots.greaterManaPotion, turnCost: 20, xpReward: 35, materials: [{ itemTemplateId: res.abyssalKelp, quantity: 2 }] }),
   ```
3. Replace with the full five-tier progression:
   ```
   // Mana potions
   recipe({ skillType: 'alchemy', requiredLevel: 1, resultTemplateId: pots.minorManaPotion, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: res.caveMoss, quantity: 2 }] }),
   recipe({ skillType: 'alchemy', requiredLevel: 8, resultTemplateId: pots.manaPotion2, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: res.caveMoss, quantity: 3 }] }),
   recipe({ skillType: 'alchemy', requiredLevel: 15, resultTemplateId: pots.manaPotion3, turnCost: 14, xpReward: 22, materials: [{ itemTemplateId: res.glowcapMushroom, quantity: 2 }, { itemTemplateId: res.caveMoss, quantity: 1 }] }),
   recipe({ skillType: 'alchemy', requiredLevel: 20, resultTemplateId: pots.manaPotion, turnCost: 18, xpReward: 30, materials: [{ itemTemplateId: res.shimmerFern, quantity: 2 }] }),
   recipe({ skillType: 'alchemy', requiredLevel: 25, resultTemplateId: pots.greaterManaPotion, turnCost: 20, xpReward: 35, materials: [{ itemTemplateId: res.abyssalKelp, quantity: 2 }] }),
   ```

Material choices explained:
- T1 (alchemy 1): Cave Moss x2 -- unchanged, T2 herb
- T2 (alchemy 8): Cave Moss x3 -- same herb, higher quantity (mirrors Stamina Potion using Moonpetal x3)
- T3 (alchemy 15): Glowcap Mushroom x2 + Cave Moss x1 -- uses T3 herb as primary, T2 as secondary
- T4 (alchemy 20): Shimmer Fern x2 -- unchanged, uses T4 herb
- T5 (alchemy 25): Abyssal Kelp x2 -- unchanged, uses T5 herb

Also remove the duplicate T4 mana potion recipe that currently lives in the `processingRecipes()` function at line 93:
```
recipe({ skillType: 'alchemy', requiredLevel: 20, resultTemplateId: pots.manaPotion, turnCost: 18, xpReward: 30, materials: [{ itemTemplateId: res.shimmerFern, quantity: 2 }] }),
```
This recipe is the existing T4 mana potion recipe -- it should only appear once in the mana potions section, not duplicated.

### Step 6 — Fix tests with hardcoded mana potion values

**File:** `packages/game-engine/src/combat/templateCombatEngine.test.ts`

1. Find the mana potion test (around line 748: "mana potion restores mana during combat").
2. The test hardcodes `healAmount: 40` for the mana potion. Update to `healAmount: 80` (the new `MANA_RESTORE` value), or better yet, import `POTION_CONSTANTS` and use `POTION_CONSTANTS.MANA_RESTORE`.
3. Similarly at line 770, the assertion `expect(result.potionsConsumed[0].healAmount).toBe(40)` needs to change to `80`.
4. At line 855, the "mana potion is capped at max mana" test also uses `healAmount: 40` -- update to `80`.
5. The capped test sets `mana: 45, maxMana: 50`, meaning after a potion restoring 80 it should cap at 50. This logic should still hold (tests cap behavior, not exact restore amount), but verify the test assertions still pass.

**File:** `apps/api/src/services/combatOrchestrationService.test.ts`

1. This file only checks that `use_mana_potion` exists as an action definition (line 281). No value changes needed here.

### Step 7 — Check for frontend references to renamed potions

Search for any UI strings referencing "Mana Potion" or "Greater Mana Potion" by name. These names come from the item template `name` field in the database, so hardcoded frontend references are unlikely, but verify:

```bash
grep -r "Greater Mana Potion\|Supreme Mana Potion\|Focused Mana Potion" apps/web/src/
```

If any hardcoded references exist, update them to match the new names.

### Step 8 — Build and verify

```bash
npm run build
npm run typecheck
npm run db:seed
npm run test:engine
npm run test:api
```

## Summary of all files to modify

| File | Changes |
|------|---------|
| `packages/database/prisma/seed-data/ids.ts` | Add `manaPotion2` and `manaPotion3` to `pots` |
| `packages/shared/src/constants/gameConstants.ts` | Add `MANA_RESTORE_T2: 45`, `MANA_RESTORE_T3: 65`; change `MINOR_MANA_RESTORE` 20->25, `MANA_RESTORE` 40->80, `GREATER_MANA_RESTORE` 70->100 |
| `packages/database/prisma/seed-data/items.ts` | Add 2 new mana potion consumables, rename existing T4/T5, move T4 entry to mana section |
| `packages/database/prisma/seed-data/recipes.ts` | Add 2 new alchemy recipes for T2/T3 mana potions, remove duplicate T4 recipe from processing section |
| `packages/game-engine/src/combat/templateCombatEngine.test.ts` | Update hardcoded `healAmount: 40` to `80` in mana potion tests |

## Risks

- **Database migration not needed:** Item templates and recipes are seeded, not schema changes. Re-running `db:seed` is sufficient.
- **Existing player inventories:** Players who already have "Mana Potion" items will see the new restore value (80 instead of 40) since the consumable effect comes from the item template. This is a buff, not a nerf, so no player impact concern.
- **Renamed potions:** If players have existing "Mana Potion" or "Greater Mana Potion" items in inventory, the display name will update on next seed only if the seed upserts by template ID. Verify the seed script uses upsert on the template ID field.
