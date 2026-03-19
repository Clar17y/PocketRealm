# Crafting Quantity Cap Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the artificial 100-quantity cap for stackable crafts, cap non-stackable crafts by available inventory slots on the frontend, and expand the "default to max" preference to all stackable recipes.

**Architecture:** Backend Zod schema gets a high sanity cap (99999) replacing the gameplay-limiting 100 cap. Frontend `maxCraftable()` gains inventory-slot awareness for non-stackable recipes. The `defaultMaxQuantity` behaviour moves from skill-name gating to recipe-stackable gating inside `Crafting.tsx`.

**Tech Stack:** TypeScript, Zod, React, Next.js

**Spec:** `docs/superpowers/specs/2026-03-17-crafting-quantity-cap-design.md`

---

### Task 1: Update game constant and Zod schema

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:308-309`
- Modify: `apps/api/src/routes/crafting/helpers.ts:234-237`

- [ ] **Step 1: Rename constant in gameConstants.ts**

In `packages/shared/src/constants/gameConstants.ts`, replace:

```typescript
  /** Max quantity per craft request */
  MAX_CRAFT_QUANTITY: 100,
```

with:

```typescript
  /** Sanity cap for craft request payload — not a gameplay limit */
  MAX_CRAFT_QUANTITY_SANITY: 99999,
```

- [ ] **Step 2: Update craftSchema in helpers.ts**

In `apps/api/src/routes/crafting/helpers.ts`, replace:

```typescript
  quantity: z.number().int().positive().max(CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY).default(1),
```

with:

```typescript
  quantity: z.number().int().positive().max(CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY).default(1),
```

- [ ] **Step 3: Build shared package and verify no compile errors**

Run: `npm run build -w packages/shared`
Expected: Clean build

- [ ] **Step 4: Build API and verify no compile errors**

Run: `npm run build:api`
Expected: Clean build (no references to old `MAX_CRAFT_QUANTITY` remain)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts apps/api/src/routes/crafting/helpers.ts
git commit -m "feat: replace MAX_CRAFT_QUANTITY (100) with sanity cap (99999) for stackable crafts (#175)"
```

---

### Task 2: Add `stackable` to recipe props and pass `availableSlots`

**Files:**
- Modify: `apps/web/src/components/screens/Crafting.tsx:26-59`
- Modify: `apps/web/src/app/game/page.tsx:794-830`

- [ ] **Step 1: Add `stackable` and `availableSlots` to Crafting component interfaces**

In `apps/web/src/components/screens/Crafting.tsx`, add `stackable` to the `Recipe` interface:

```typescript
interface Recipe {
  id: string;
  name: string;
  icon?: string;
  imageSrc?: string;
  isAdvanced?: boolean;
  isDiscovered?: boolean;
  discoveryHint?: string | null;
  soulbound?: boolean;
  stackable?: boolean;           // ← add this
  resultQuantity: number;
  requiredLevel: number;
  turnCost: number;
  xpReward: number;
  baseStats: Record<string, unknown>;
  materials: Material[];
  rarity: Rarity;
}
```

Add `availableSlots` to `CraftingProps`:

```typescript
interface CraftingProps {
  skillName: string;
  skillLevel: number;
  xpRate: number;
  recipes: Recipe[];
  onCraft: (recipeId: string, quantity: number) => void;
  activityLog: ActivityLogEntry[];
  isRecovering?: boolean;
  recoveryCost?: number | null;
  zoneCraftingLevel: number | null;
  zoneName: string | null;
  defaultMaxQuantity?: boolean;
  guildTaxRate?: number;
  backpackFull?: boolean;
  isOverEncumbered?: boolean;
  availableSlots?: number;       // ← add this
}
```

Update the destructured props in the function signature to include `availableSlots = 0`:

In the function signature (line 62), add `availableSlots = 0` to the destructured props list.

- [ ] **Step 2: Update `maxCraftable()` to cap non-stackable by available slots**

In `apps/web/src/components/screens/Crafting.tsx`, replace the `maxCraftable` function:

```typescript
  const maxCraftable = (recipe: Recipe): number => {
    if (noFacility) return 0;
    if (forgeLocked(recipe)) return 0;
    if (recipe.requiredLevel > skillLevel) return 0;
    if (recipe.isAdvanced && recipe.isDiscovered === false) return 0;
    if (recipe.materials.length === 0) return recipe.stackable ? 99 : Math.min(99, availableSlots);
    const materialMax = Math.min(...recipe.materials.map((m) => Math.floor(m.owned / m.required)));
    if (recipe.stackable) return materialMax;
    return Math.min(materialMax, availableSlots);
  };
```

- [ ] **Step 3: Update `defaultMaxQuantity` useEffect to check stackable**

In `apps/web/src/components/screens/Crafting.tsx`, replace:

```typescript
  useEffect(() => {
    if (defaultMaxQuantity && selectedMax > 0) {
      setQuantity(selectedMax);
    } else {
      setQuantity((prev) => Math.max(1, Math.min(prev, selectedMax || 1)));
    }
  }, [selectedRecipeId, selectedMax, defaultMaxQuantity]);
```

with:

```typescript
  useEffect(() => {
    if (defaultMaxQuantity && selectedRecipe?.stackable && selectedMax > 0) {
      setQuantity(selectedMax);
    } else {
      setQuantity((prev) => Math.max(1, Math.min(prev, selectedMax || 1)));
    }
  }, [selectedRecipeId, selectedMax, defaultMaxQuantity, selectedRecipe?.stackable]);
```

- [ ] **Step 4: Map `stackable` in page.tsx recipe props and pass `availableSlots`**

In `apps/web/src/app/game/page.tsx`, in the recipe mapping (around line 794-819), add `stackable` to each recipe object:

After `soulbound: r.soulbound,` add:
```typescript
                stackable: r.resultTemplate.stackable,
```

Change the `defaultMaxQuantity` prop (line 827) from:
```typescript
              defaultMaxQuantity={activeCraftingSkill === 'refining' && defaultRefiningMax}
```
to:
```typescript
              defaultMaxQuantity={defaultRefiningMax}
```

Add the `availableSlots` prop after `backpackFull={backpackFull}` (line 829):
```typescript
              availableSlots={Math.max(0, inventoryCapacity - inventoryUsedSlots)}
```

- [ ] **Step 5: Build web and verify no compile errors**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/screens/Crafting.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: cap non-stackable craft quantity by inventory slots, expand default-max to all stackable recipes (#175)"
```

---

### Task 3: Update Settings UI label

**Files:**
- Modify: `apps/web/src/components/screens/Settings.tsx:191-192`

- [ ] **Step 1: Update label and description text**

In `apps/web/src/components/screens/Settings.tsx`, replace:

```typescript
            <p className="text-xs text-[var(--rpg-text-secondary)]">Default Refining to Max</p>
            <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Auto-set refining quantity to maximum when selecting a recipe</p>
```

with:

```typescript
            <p className="text-xs text-[var(--rpg-text-secondary)]">Default to Max Quantity</p>
            <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Auto-set quantity to maximum when selecting a stackable recipe</p>
```

- [ ] **Step 2: Build web and verify no compile errors**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/screens/Settings.tsx
git commit -m "chore: update settings label to reflect stackable recipe scope (#175)"
```

---

### Task 4: Full build verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: All packages and apps build successfully

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors (except pre-existing `page.tsx:333` SkillType issue)
