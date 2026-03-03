# Forge & Salvage Turn Cost Rework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce forge upgrade and salvage turn costs based on player's crafting skill level above the recipe requirement, gated by recipe ownership.

**Architecture:** New pure function `calculateCraftingTurnDiscount` in game-engine, new constants in shared. Both forge upgrade and salvage routes use it. Frontend computes discounted costs client-side using existing recipe + skill data.

**Tech Stack:** TypeScript, Vitest, game-engine pure functions, Express routes, React frontend

---

## Task 1: Add discount constants to shared

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:273-324` (ITEM_RARITY_CONSTANTS)

**Step 1: Add the two new constants**

Add at the end of `ITEM_RARITY_CONSTANTS`, before the closing `} as const`:

```ts
  FORGE_DISCOUNT_PER_LEVEL_ABOVE: 0.20,
  FORGE_DISCOUNT_MAX_LEVELS: 5,
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: clean build

**Step 3: Commit**

```
feat: add forge/salvage skill-based discount constants
```

---

## Task 2: Add `calculateCraftingTurnDiscount` to game-engine

**Files:**
- Modify: `packages/game-engine/src/items/itemRarity.ts:58-66`
- Modify: `packages/game-engine/src/items/itemRarity.test.ts`

**Step 1: Write failing tests**

Add to `packages/game-engine/src/items/itemRarity.test.ts`, inside the existing `describe('itemRarity', ...)` block. Import `calculateCraftingTurnDiscount` alongside existing imports.

```ts
  it('calculates crafting turn discount based on skill level above recipe', () => {
    // Same level = full price
    expect(calculateCraftingTurnDiscount(100, 5, 5)).toBe(100);

    // 1 level above = 80%
    expect(calculateCraftingTurnDiscount(100, 6, 5)).toBe(80);

    // 2 levels above = 60%
    expect(calculateCraftingTurnDiscount(100, 7, 5)).toBe(60);

    // 3 levels above = 40%
    expect(calculateCraftingTurnDiscount(100, 8, 5)).toBe(40);

    // 4 levels above = 20%
    expect(calculateCraftingTurnDiscount(100, 9, 5)).toBe(20);

    // 5+ levels above = free
    expect(calculateCraftingTurnDiscount(100, 10, 5)).toBe(0);
    expect(calculateCraftingTurnDiscount(100, 99, 5)).toBe(0);
  });

  it('floors fractional discount results', () => {
    // 250 * 0.8 = 200 (exact)
    expect(calculateCraftingTurnDiscount(250, 6, 5)).toBe(200);

    // 50 * 0.8 = 40
    expect(calculateCraftingTurnDiscount(50, 6, 5)).toBe(40);

    // 50 * 0.6 = 30
    expect(calculateCraftingTurnDiscount(50, 7, 5)).toBe(30);

    // 75 * 0.6 = 45
    expect(calculateCraftingTurnDiscount(75, 7, 5)).toBe(45);
  });

  it('returns full price when skill level is below recipe level', () => {
    expect(calculateCraftingTurnDiscount(100, 3, 5)).toBe(100);
    expect(calculateCraftingTurnDiscount(100, 1, 10)).toBe(100);
  });

  it('returns 0 for 0 base cost', () => {
    expect(calculateCraftingTurnDiscount(0, 99, 1)).toBe(0);
  });
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:engine -- --reporter=verbose 2>&1 | head -50`
Expected: FAIL — `calculateCraftingTurnDiscount` is not exported

**Step 3: Implement the function**

Add to `packages/game-engine/src/items/itemRarity.ts`, after `getForgeRerollCost` (line ~66):

```ts
export function calculateCraftingTurnDiscount(baseCost: number, skillLevel: number, requiredLevel: number): number {
  const levelsAbove = Math.max(0, skillLevel - requiredLevel);
  const discount = Math.min(1, levelsAbove * ITEM_RARITY_CONSTANTS.FORGE_DISCOUNT_PER_LEVEL_ABOVE);
  return Math.floor(baseCost * (1 - discount));
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:engine -- --reporter=verbose 2>&1 | head -80`
Expected: all new tests PASS, existing tests still PASS

**Step 5: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: clean build

**Step 6: Commit**

```
feat: add calculateCraftingTurnDiscount pure function
```

---

## Task 3: Update forge upgrade route to use skill-based discount

**Files:**
- Modify: `apps/api/src/routes/crafting/forge.ts:35-80` (upgrade handler)

**Step 1: Add imports**

Add `calculateCraftingTurnDiscount` to the `@adventure/game-engine` import. Add `getSkillLevel, isSkillType` to the `./helpers` import.

**Step 2: Add recipe + skill lookup after item fetch**

After the `getOwnedItem` call and before `upgradeCost` computation (~line 52), add:

```ts
    const recipe = await prisma.craftingRecipe.findFirst({
      where: { resultTemplateId: item.templateId },
      select: { id: true, skillType: true, requiredLevel: true },
    });

    let hasRecipe = false;
    let recipeSkillLevel = 0;
    let recipeRequiredLevel = 0;

    if (recipe) {
      const learned = await prisma.playerRecipe.findUnique({
        where: { playerId_recipeId: { playerId, recipeId: recipe.id } },
        select: { recipeId: true },
      });
      if (learned && isSkillType(recipe.skillType)) {
        hasRecipe = true;
        recipeSkillLevel = await getSkillLevel(playerId, recipe.skillType);
        recipeRequiredLevel = recipe.requiredLevel;
      }
    }
```

**Step 3: Apply discount to upgrade cost**

Replace the line that computes `upgradeCost`:

```ts
    const baseUpgradeCost = getForgeUpgradeCost(currentRarity);
    // ... existing null check for legendary
    const upgradeCost = hasRecipe
      ? calculateCraftingTurnDiscount(baseUpgradeCost!, recipeSkillLevel, recipeRequiredLevel)
      : baseUpgradeCost!;
```

The rest of the route uses `upgradeCost` for `spendWithTaxTx` — no other changes needed.

**Step 4: Verify build**

Run: `npm run build:api`
Expected: clean build

**Step 5: Commit**

```
feat: apply skill-based turn discount to forge upgrade
```

---

## Task 4: Update salvage route to use skill-based discount

**Files:**
- Modify: `apps/api/src/routes/crafting/salvage.ts:23-60`

**Step 1: Add imports**

Add `calculateCraftingTurnDiscount` to a new import from `@adventure/game-engine`. Add `getSkillLevel, isSkillType` to the `./helpers` import.

**Step 2: Add recipe ownership check**

The salvage route already fetches the recipe (~line 36). After that, add a `PlayerRecipe` check:

```ts
    let salvageTurnCost = CRAFTING_CONSTANTS.SALVAGE_TURN_COST;

    if (recipe && isSkillType((recipe as any).skillType)) {
      const learned = await prisma.playerRecipe.findUnique({
        where: { playerId_recipeId: { playerId, recipeId: recipe.id } },
        select: { recipeId: true },
      });
      if (learned) {
        const skillLevel = await getSkillLevel(playerId, (recipe as any).skillType as any);
        salvageTurnCost = calculateCraftingTurnDiscount(CRAFTING_CONSTANTS.SALVAGE_TURN_COST, skillLevel, (recipe as any).requiredLevel);
      }
    }
```

Note: the existing recipe query only selects `id, materials, resultTemplateId`. We need to add `skillType` and `requiredLevel` to the select.

**Step 3: Update recipe query select**

Change the recipe query select to include the fields we need:

```ts
    const recipe = await prisma.craftingRecipe.findFirst({
      where: { resultTemplateId: item.templateId },
      select: { id: true, materials: true, resultTemplateId: true, skillType: true, requiredLevel: true },
    });
```

**Step 4: Replace hardcoded cost in spendWithTaxTx call**

Change `CRAFTING_CONSTANTS.SALVAGE_TURN_COST` → `salvageTurnCost` in the `spendWithTaxTx` call.

**Step 5: Verify build**

Run: `npm run build:api`
Expected: clean build

**Step 6: Commit**

```
feat: apply skill-based turn discount to salvage
```

---

## Task 5: Update frontend Forge component to show discounted upgrade cost

**Files:**
- Modify: `apps/web/src/components/screens/Forge.tsx:16-27` (ForgeItem interface)
- Modify: `apps/web/src/components/screens/Forge.tsx:136` (cost computation)
- Modify: `apps/web/src/app/game/page.tsx:773-803` (Forge props mapping)

**Step 1: Add `recipeSkillLevel` and `recipeRequiredLevel` to ForgeItem**

```ts
interface ForgeItem {
  id: string;
  templateId: string;
  name: string;
  imageSrc?: string;
  rarity: Rarity;
  type: string;
  equippedSlot: string | null;
  baseStats?: Record<string, unknown>;
  bonusStats?: Record<string, unknown> | null;
  recipeSkillLevel: number | null;   // null = no recipe owned
  recipeRequiredLevel: number | null;
}
```

**Step 2: Import and use `calculateCraftingTurnDiscount` in Forge.tsx**

Add import:
```ts
import { calculateCraftingTurnDiscount, calculateForgeUpgradeSuccessChance, getForgeRerollCost, getForgeUpgradeCost, getNextRarity } from '@adventure/game-engine';
```

Replace line 136:
```ts
  const baseUpgradeCost = selected ? getForgeUpgradeCost(selected.rarity) : null;
  const upgradeCost = baseUpgradeCost !== null && selected?.recipeSkillLevel !== null && selected?.recipeRequiredLevel !== null
    ? calculateCraftingTurnDiscount(baseUpgradeCost, selected.recipeSkillLevel, selected.recipeRequiredLevel)
    : baseUpgradeCost;
```

**Step 3: Update cost display to show discount**

In the upgrade cost display (~line 257), optionally show the base cost with strikethrough when discounted:

```tsx
<div className="text-xs text-[var(--rpg-text-secondary)]">
  Cost: {inflatedUpgradeCost !== null && inflatedUpgradeCost !== upgradeCost
    ? `${inflatedUpgradeCost} turns (${inflatedUpgradeCost - upgradeCost!} tax)`
    : upgradeCost === 0
      ? 'Free'
      : baseUpgradeCost !== null && baseUpgradeCost !== upgradeCost
        ? <>{upgradeCost} turns <span className="line-through opacity-50">{baseUpgradeCost}</span></>
        : `${upgradeCost ?? '-'} turns`
  } {upgradeCost !== 0 && <>+ 1 sacrificial {selected?.rarity ?? ''} {selected?.type ?? 'item'}</>}
</div>
```

Ensure the `inflatedUpgradeCost` now uses the discounted `upgradeCost`:
```ts
  const inflatedUpgradeCost = upgradeCost !== null ? inflateCost(upgradeCost, guildTaxRate) : null;
```

**Step 4: Compute recipe data in page.tsx**

In `apps/web/src/app/game/page.tsx`, where `<Forge>` items are mapped (~line 776), build a lookup from the existing `craftingRecipes` and `skills` state:

```ts
      case 'forge': {
        const recipeByTemplateId = new Map(
          craftingRecipes
            .filter((r) => r.isDiscovered)
            .map((r) => [r.resultTemplate.id, { skillType: r.skillType, requiredLevel: r.requiredLevel }])
        );
        const skillByType = new Map(skills.map((s) => [s.skillType, s.level]));

        return (
          <Forge
            items={inventory
              .filter((item) => ['weapon', 'armor'].includes(item.template.itemType) && item.quantity === 1)
              .map((item) => {
                const recipe = recipeByTemplateId.get(item.template.id);
                return {
                  id: item.id,
                  templateId: item.template.id,
                  name: item.template.name,
                  imageSrc: itemImageSrc(item.template.name, item.template.itemType),
                  rarity: item.rarity,
                  type: item.template.itemType,
                  equippedSlot: item.equippedSlot,
                  baseStats: item.template.baseStats,
                  bonusStats: item.bonusStats ?? null,
                  recipeSkillLevel: recipe ? (skillByType.get(recipe.skillType) ?? 1) : null,
                  recipeRequiredLevel: recipe ? recipe.requiredLevel : null,
                };
              })}
            // ... rest of props unchanged
          />
        );
      }
```

**Step 5: Verify build**

Run: `npm run build:web`
Expected: clean build

**Step 6: Commit**

```
feat: show discounted forge upgrade cost in frontend
```

---

## Task 6: Update frontend salvage cost display (if applicable)

**Files:**
- Check: wherever salvage cost is shown client-side

The salvage cost display uses `CRAFTING_CONSTANTS.SALVAGE_TURN_COST` if shown anywhere. Check the Crafting screen for salvage cost display and update similarly to Task 5 pattern — compute discounted cost using `calculateCraftingTurnDiscount` with the recipe data.

If salvage cost is not currently displayed in the UI, skip this task.

**Step 1: Search for salvage cost display**

Run: `grep -r "SALVAGE_TURN_COST\|salvage.*turn\|salvage.*cost" apps/web/src/`

If no matches, this task is a no-op and can be skipped.

**Step 2: Commit if changes made**

```
feat: show discounted salvage cost in frontend
```

---

## Task 7: Manual testing checklist

Test in dev environment:

1. **Forge upgrade — with recipe, skill above requirement**: verify discounted turn cost
2. **Forge upgrade — with recipe, skill at requirement**: verify full turn cost
3. **Forge upgrade — without recipe (looted item)**: verify full turn cost
4. **Forge upgrade — 5+ levels above**: verify 0 turn cost
5. **Salvage — with recipe, skill above requirement**: verify discounted turn cost
6. **Salvage — without recipe**: verify full turn cost
7. **Forge reroll**: verify unchanged (no discount applied)
8. **Frontend cost display**: verify discounted cost shows correctly with strikethrough on base cost
