# Salvage Cost Display & Forge Tutorial — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the actual discounted salvage cost on the inventory button, add a one-time forge tutorial popup explaining the forge and skill discount mechanic.

**Architecture:** Extract recipe+skill lookup maps into a shared utility to avoid duplicating them across Forge and Inventory cases in page.tsx. Add `salvageCost` to Inventory item data. New `ForgeTutorial` component using existing `ModalOverlay` + `localStorage` pattern.

**Tech Stack:** React, TypeScript, localStorage, existing ModalOverlay component

---

## DRY: Shared recipe discount lookup

Both the Forge case and the Inventory case in `page.tsx` need `recipeByTemplateId` and `skillByType` maps built from `craftingRecipes` and `skills`. Extract a helper function to build these once and share.

## Task 1: Extract recipe discount lookup into shared utility

**Files:**
- Create: `apps/web/src/lib/recipeDiscount.ts`
- Modify: `apps/web/src/app/game/page.tsx` (Forge case, ~line 773)

**Step 1: Create the utility**

Create `apps/web/src/lib/recipeDiscount.ts`:

```ts
import { calculateCraftingTurnDiscount } from '@adventure/game-engine';

interface RecipeInfo {
  skillType: string;
  requiredLevel: number;
}

interface SkillInfo {
  skillType: string;
  level: number;
}

interface CraftingRecipeEntry {
  isDiscovered: boolean;
  skillType: string;
  requiredLevel: number;
  resultTemplate: { id: string };
}

export interface RecipeDiscountLookup {
  recipeByTemplateId: Map<string, RecipeInfo>;
  skillByType: Map<string, number>;
}

export function buildRecipeDiscountLookup(
  craftingRecipes: CraftingRecipeEntry[],
  skills: SkillInfo[],
): RecipeDiscountLookup {
  const recipeByTemplateId = new Map(
    craftingRecipes
      .filter((r) => r.isDiscovered)
      .map((r) => [r.resultTemplate.id, { skillType: r.skillType, requiredLevel: r.requiredLevel }]),
  );
  const skillByType = new Map(skills.map((s) => [s.skillType, s.level]));
  return { recipeByTemplateId, skillByType };
}

export function getDiscountedCost(
  lookup: RecipeDiscountLookup,
  templateId: string,
  baseCost: number,
): number {
  const recipe = lookup.recipeByTemplateId.get(templateId);
  if (!recipe) return baseCost;
  const skillLevel = lookup.skillByType.get(recipe.skillType) ?? 1;
  return calculateCraftingTurnDiscount(baseCost, skillLevel, recipe.requiredLevel);
}

export function getRecipeSkillInfo(
  lookup: RecipeDiscountLookup,
  templateId: string,
): { recipeSkillLevel: number; recipeRequiredLevel: number } | null {
  const recipe = lookup.recipeByTemplateId.get(templateId);
  if (!recipe) return null;
  const skillLevel = lookup.skillByType.get(recipe.skillType) ?? 1;
  return { recipeSkillLevel: skillLevel, recipeRequiredLevel: recipe.requiredLevel };
}
```

**Step 2: Refactor Forge case in page.tsx to use it**

Replace the inline `recipeByTemplateId` / `skillByType` construction in the `case 'forge':` block with:

```ts
import { buildRecipeDiscountLookup, getRecipeSkillInfo } from '@/lib/recipeDiscount';

// inside case 'forge':
const lookup = buildRecipeDiscountLookup(craftingRecipes, skills);
// ... then in .map():
const info = getRecipeSkillInfo(lookup, item.template.id);
return {
  // ...existing fields...
  recipeSkillLevel: info?.recipeSkillLevel ?? null,
  recipeRequiredLevel: info?.recipeRequiredLevel ?? null,
};
```

**Step 3: Build**

Run: `npm run build:web`

**Step 4: Commit**

```
refactor: extract recipe discount lookup into shared utility (DRY)
```

---

## Task 2: Add salvage cost to Inventory items

**Files:**
- Modify: `apps/web/src/components/screens/Inventory.tsx` (Item interface + button label)
- Modify: `apps/web/src/app/game/page.tsx` (Inventory case, ~line 497)

**Step 1: Add `salvageCost` to the Item interface in Inventory.tsx**

Add to the `Item` interface:
```ts
  salvageCost: number | null; // null = not salvageable
```

**Step 2: Update the Salvage button label**

Replace `{noFacility ? 'No Facility' : 'Salvage'}` with:
```tsx
{noFacility
  ? 'No Facility'
  : selectedItem.salvageCost === 0
    ? 'Salvage (Free)'
    : selectedItem.salvageCost != null
      ? `Salvage (${selectedItem.salvageCost})`
      : 'Salvage'}
```

**Step 3: Compute salvage cost in page.tsx**

In the `case 'inventory':` block, build the lookup and compute salvage cost for each item:

```ts
import { buildRecipeDiscountLookup, getDiscountedCost } from '@/lib/recipeDiscount';
import { CRAFTING_CONSTANTS } from '@adventure/shared';

case 'inventory': {
  const lookup = buildRecipeDiscountLookup(craftingRecipes, skills);
  return (
    <Inventory
      items={inventory.map((item) => {
        const isEquipment = ['weapon', 'armor'].includes(item.template.itemType);
        const salvageCost = isEquipment
          ? getDiscountedCost(lookup, item.template.id, CRAFTING_CONSTANTS.SALVAGE_TURN_COST)
          : null;
        return {
          // ...existing fields...
          salvageCost,
        };
      })}
      // ...existing props...
    />
  );
}
```

Note: wrap the case body in `{ }` braces for the variable declaration.

**Step 4: Build**

Run: `npm run build:web`

**Step 5: Commit**

```
feat: show actual salvage turn cost on inventory button
```

---

## Task 3: Create ForgeTutorial component

**Files:**
- Create: `apps/web/src/components/common/ForgeTutorial.tsx`

**Step 1: Create the component**

Follow the `XpRateTutorial` pattern exactly:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'forgeTutorialSeen';

export function ForgeTutorial() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return (
    <ModalOverlay opacity={60}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">The Forge</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          <p>
            The Forge lets you <strong>upgrade</strong> item rarity or <strong>reroll</strong> bonus stats.
            Both require a sacrificial item of the same rarity.
          </p>
          <p>
            <strong>Upgrade</strong> attempts to raise your item one rarity tier.
            Success adds a new bonus stat — but failure destroys the item.
          </p>
          <p>
            <strong>Reroll</strong> re-randomises all bonus stats on an Uncommon+ item.
            The item is never destroyed.
          </p>
          <p className="text-[var(--rpg-green-light)]">
            <strong>Skill discount:</strong> If you've learned the crafting recipe for an item,
            forge and salvage costs are reduced by 20% for each crafting level above the recipe
            requirement. At 5+ levels above, it's free!
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
```

**Step 2: Build**

Run: `npm run build:web`

**Step 3: Commit**

```
feat: add ForgeTutorial one-time popup component
```

---

## Task 4: Render ForgeTutorial in Forge screen

**Files:**
- Modify: `apps/web/src/components/screens/Forge.tsx`

**Step 1: Import and render**

Add at the top of the Forge component's return JSX (inside the outer `<div>`), before the knockout banner:

```tsx
import { ForgeTutorial } from '@/components/common/ForgeTutorial';

// inside return:
<ForgeTutorial />
```

**Step 2: Build**

Run: `npm run build:web`

**Step 3: Commit**

```
feat: show forge tutorial popup on first visit
```
