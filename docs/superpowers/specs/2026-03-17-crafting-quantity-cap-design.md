# Crafting Quantity Cap Redesign

**Issue:** #175 — crafting quantity cap of 100 is too restrictive for stackable items
**Date:** 2026-03-17
**Status:** Approved

## Problem

The crafting route has a hard Zod cap of `MAX_CRAFT_QUANTITY: 100` applied uniformly to all recipes. Stackable crafts (refining, tanning, weaving) are single DB writes regardless of quantity, so the cap is unnecessarily restrictive. Players refining large batches must submit multiple requests. Additionally, the frontend doesn't factor inventory space into the quantity selector, so players crafting non-stackable items can request more than they have room for.

## Design

### Backend

**`gameConstants.ts`**
- Replace `MAX_CRAFT_QUANTITY: 100` with `MAX_CRAFT_QUANTITY_SANITY: 99999` (payload protection only, not a gameplay limit).

**`helpers.ts` (craftSchema)**
- Use the sanity cap: `z.number().int().positive().max(CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY)`

**`craft.ts` (post-parse validation)**
- Stackable recipes: no artificial quantity cap — limited only by materials owned.
- Non-stackable recipes: existing `availableSlots < quantity` check already rejects over-capacity requests. No change needed beyond the Zod cap removal.
- Note: the 99999 sanity cap is safe for non-stackable items because backpack capacity is naturally bounded (~30-40 slots max). The `availableSlots < quantity` check prevents the non-stackable creation loop from ever running at high counts.

### Recipe DTO

- `resultTemplate.stackable` is already included in the recipes endpoint response (via the `resultTemplate` join). No backend DTO change needed.
- `page.tsx` maps recipes into the `Recipe` prop shape — add `stackable: r.resultTemplate.stackable` to that mapping.

### Frontend

**`Crafting.tsx` — `maxCraftable()`**
- Stackable recipes: unchanged — max is min of materials owned.
- Non-stackable recipes: `Math.min(materialMax, availableSlots)` — cannot craft more items than empty backpack slots.
- New prop: `availableSlots: number` computed inline in `page.tsx` as `Math.max(0, inventoryCapacity - inventoryUsedSlots)` (both values already available from the game controller).

**`Crafting.tsx` — `Recipe` interface**
- Add `stackable: boolean` field.

**`Crafting.tsx` — `defaultMaxQuantity` behavior**
- The `stackable` check happens inside `Crafting.tsx`, not in `page.tsx` — because `page.tsx` has no access to the selected recipe (that's internal component state).
- The `useEffect` that auto-sets quantity to max is updated: `if (defaultMaxQuantity && selectedRecipe?.stackable && selectedMax > 0)`.
- `page.tsx` passes `defaultMaxQuantity={defaultRefiningMax}` unconditionally (removing the `activeCraftingSkill === 'refining'` guard), since the stackable check inside the component handles filtering.

**Settings UI**
- Update the `defaultRefiningMax` toggle label from refining-specific wording to "Default to max quantity for stackable recipes".
- Update the description text to match: "Auto-set quantity to maximum when selecting a stackable recipe".

## Out of Scope

- Renaming the `defaultRefiningMax` DB column (cosmetic, would require migration).
- Stash-related changes (stash materials already work in crafting; crafted output goes to backpack — this is correct).
- Changes to forge upgrade/reroll quantity logic.
- `resultQuantity` interaction with slot-based capping (pre-existing, separate concern).

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/constants/gameConstants.ts` | Replace `MAX_CRAFT_QUANTITY` with `MAX_CRAFT_QUANTITY_SANITY: 99999` |
| `apps/api/src/routes/crafting/helpers.ts` | Update craftSchema to use new constant |
| `apps/web/src/components/screens/Crafting.tsx` | Add `availableSlots` prop, update `maxCraftable()`, add `stackable` to `Recipe` interface, move stackable check into auto-max `useEffect` |
| `apps/web/src/app/game/page.tsx` | Map `stackable` into recipe props, pass `availableSlots` (computed inline), simplify `defaultMaxQuantity` prop |
| `apps/web/src/components/screens/Settings.tsx` | Update toggle label and description text |
