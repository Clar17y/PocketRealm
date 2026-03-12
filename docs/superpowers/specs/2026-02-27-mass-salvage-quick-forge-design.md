# Mass Salvage, Quick Forge & Changelog — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add batch salvage endpoint + multi-select salvage mode in inventory, collapse forge sacrifice pickers for mobile UX, and add changelog entry for forge discount feature.

**Architecture:** New batch salvage route reuses existing helpers (`parseMaterials`, `calculateSalvageMaterials`, `getRecipeDiscountedCost`, `addStackableItemTx`). Inventory component gets a salvage-mode toggle with checkbox selection. Forge component collapses sacrifice pickers by default with expand toggle.

**Tech Stack:** Express, Prisma, Zod, React, TypeScript

---

## Task 1: Add changelog entry for forge discount feature

**Files:**
- Modify: `apps/web/src/lib/changelog.ts:8`

**Step 1: Add new entry at the top of the `changelog` array**

```ts
  {
    version: '0.18',
    date: '2026-02-27',
    title: 'Forge & Salvage Discounts',
    summary:
      'Forge upgrade and salvage costs now scale with your crafting skill. If you know the recipe, costs drop 20% per level above the requirement — and at 5+ levels above, it\'s free. The Forge screen shows your discounted costs, and the Salvage button displays the actual turn cost. A new tutorial popup explains the mechanic on your first forge visit.',
  },
```

**Step 2: Build**

Run: `npm run build:web`

**Step 3: Commit**

```
feat: add v0.18 changelog entry for forge/salvage discounts
```

---

## Task 2: Add batch salvage API endpoint

**Files:**
- Modify: `apps/api/src/routes/crafting/salvage.ts`
- Modify: `apps/api/src/routes/crafting/helpers.ts` (add Zod schema)

**Step 1: Add Zod schema for batch request in helpers.ts**

After `salvageSchema`, add:

```ts
export const salvageBatchSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(50),
});
```

**Step 2: Add batch endpoint in salvage.ts**

Add a new route handler after the existing `POST /` handler. The batch endpoint:

1. Validates request body with `salvageBatchSchema`
2. Asserts zone allows crafting
3. Fetches all items in one query (owned, unequipped, weapon/armor, unstacked)
4. Looks up recipes for all unique template IDs in one query
5. Computes per-item salvage cost using `getRecipeDiscountedCost` (items without recipes are skipped — they can't be salvaged)
6. Calculates total turn cost across all items
7. In a single transaction: spend turns once, delete all items, mint all returned materials (aggregated)
8. Tracks achievements, creates activity log, returns response

```ts
/**
 * POST /api/v1/crafting/salvage/batch
 * Salvage multiple items in one transaction.
 */
salvageRouter.post('/batch', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = salvageBatchSchema.parse(req.body);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    // Fetch all items with templates
    const items = await (prisma as any).item.findMany({
      where: {
        id: { in: body.itemIds },
        ownerId: playerId,
        quantity: 1,
      },
      include: { template: true },
    });

    // Filter to weapon/armor only and not equipped
    const equippedItemIds = new Set(
      (await prisma.playerEquipment.findMany({
        where: { playerId, itemId: { in: items.map((i: any) => i.id) } },
        select: { itemId: true },
      })).map((e) => e.itemId),
    );

    const salvageableItems = items.filter((item: any) =>
      (item.template.itemType === 'weapon' || item.template.itemType === 'armor')
      && !equippedItemIds.has(item.id)
    );

    if (salvageableItems.length === 0) {
      throw new AppError(400, 'No salvageable items in selection', 'NO_SALVAGEABLE_ITEMS');
    }

    // Get unique template IDs and find recipes
    const uniqueTemplateIds = [...new Set(salvageableItems.map((i: any) => i.templateId))];
    const recipes = await prisma.craftingRecipe.findMany({
      where: { resultTemplateId: { in: uniqueTemplateIds } },
      select: { id: true, resultTemplateId: true, materials: true },
    });
    const recipeByTemplateId = new Map(recipes.map((r) => [r.resultTemplateId, r]));

    // Build per-item salvage plan
    type SalvagePlan = {
      item: any;
      recipe: typeof recipes[number];
      turnCost: number;
      refundedMaterials: Array<{ templateId: string; quantity: number }>;
    };
    const plans: SalvagePlan[] = [];

    for (const item of salvageableItems) {
      const recipe = recipeByTemplateId.get(item.templateId);
      if (!recipe) continue; // no recipe = not salvageable

      const recipeMaterials = parseMaterials(recipe.materials);
      const refunded = calculateSalvageMaterials(recipeMaterials);
      if (refunded.length === 0) continue;

      const turnCost = await getRecipeDiscountedCost(playerId, item.templateId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);
      plans.push({ item, recipe, turnCost, refundedMaterials: refunded });
    }

    if (plans.length === 0) {
      throw new AppError(400, 'No salvageable items in selection', 'NO_SALVAGEABLE_ITEMS');
    }

    const totalTurnCost = plans.reduce((sum, p) => sum + p.turnCost, 0);

    // Aggregate all materials across all items
    const materialTotals = new Map<string, number>();
    for (const plan of plans) {
      for (const mat of plan.refundedMaterials) {
        materialTotals.set(mat.templateId, (materialTotals.get(mat.templateId) ?? 0) + mat.quantity);
      }
    }

    // Fetch material templates
    const materialTemplates = await prisma.itemTemplate.findMany({
      where: { id: { in: [...materialTotals.keys()] } },
      select: { id: true, name: true, itemType: true, stackable: true, maxDurability: true },
    });
    const templateById = new Map(materialTemplates.map((t) => [t.id, t]));

    // Single transaction: spend turns, delete items, mint materials
    const { turnSpend, taxResult, returned } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, totalTurnCost);

      // Delete all items
      const deleted = await tx.item.deleteMany({
        where: {
          id: { in: plans.map((p) => p.item.id) },
          ownerId: playerId,
        },
      });
      if (deleted.count !== plans.length) {
        throw new AppError(409, 'Some items are no longer available', 'SALVAGE_ITEMS_UNAVAILABLE');
      }

      // Mint aggregated materials
      const minted: Array<{ templateId: string; name: string; quantity: number }> = [];
      for (const [templateId, quantity] of materialTotals) {
        const template = templateById.get(templateId);
        if (!template) continue;

        if (template.stackable) {
          await addStackableItemTx(tx, playerId, templateId, quantity);
        } else {
          const needsDurability = template.itemType === 'weapon' || template.itemType === 'armor';
          const maxDurability = needsDurability ? template.maxDurability : null;
          for (let i = 0; i < quantity; i++) {
            await tx.item.create({
              data: {
                ownerId: playerId,
                templateId,
                rarity: 'common',
                quantity: 1,
                maxDurability,
                currentDurability: maxDurability,
              } as any,
            });
          }
        }

        minted.push({ templateId, name: template.name, quantity });
      }

      return { turnSpend: spent, taxResult: tax, returned: minted };
    });

    await trackAchievements(playerId, { totalSalvages: plans.length });

    const log = await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'salvage_batch',
        turnsSpent: turnSpend.spent,
        result: {
          itemCount: plans.length,
          salvaged: plans.map((p) => ({
            itemId: p.item.id,
            templateId: p.item.templateId,
            turnCost: p.turnCost,
          })),
          returnedMaterials: returned,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    res.json({
      logId: log.id,
      turns: turnSpend,
      salvaged: plans.map((p) => ({
        itemId: p.item.id,
        templateName: p.item.template.name,
        turnCost: p.turnCost,
      })),
      returnedMaterials: returned,
      totalTurnCost,
      tax: taxInfoFromResult(taxResult),
    });
}));
```

**Important:** Import `getRecipeDiscountedCost` and `salvageBatchSchema` from `./helpers`.

**Step 3: Build**

Run: `npm run build:api`

**Step 4: Commit**

```
feat: add batch salvage API endpoint
```

---

## Task 3: Add batch salvage frontend API function

**Files:**
- Modify: `apps/web/src/lib/api/items.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Step 1: Add `salvageBatch` function in items.ts**

After the existing `salvage` function:

```ts
export async function salvageBatch(itemIds: string[]) {
  return fetchApi<{
    logId: string;
    turns: TurnStateResponse;
    salvaged: Array<{ itemId: string; templateName: string; turnCost: number }>;
    returnedMaterials: Array<{ templateId: string; name: string; quantity: number }>;
    totalTurnCost: number;
    tax: TaxInfo | null;
  }>('/api/v1/crafting/salvage/batch', {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
}
```

**Step 2: Export from index.ts**

Add `salvageBatch` to the items re-export.

**Step 3: Add handler in useGameController.ts**

Add `handleSalvageBatch` next to the existing `handleSalvageItem`:

```ts
  const handleSalvageBatch = async (itemIds: string[]) => {
    await runAction('salvage_batch', async () => {
      const res = await salvageBatch(itemIds);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Batch salvage failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      const materialSummary = data.returnedMaterials
        .map((entry) => `${entry.name} x${entry.quantity}`)
        .join(', ');
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Salvaged ${data.salvaged.length} items (${data.totalTurnCost} turns). Recovered: ${materialSummary}`,
      });
      await loadAll();
    });
  };
```

Return `handleSalvageBatch` from the hook.

**Step 4: Build**

Run: `npm run build:web`

**Step 5: Commit**

```
feat: add batch salvage frontend API and controller handler
```

---

## Task 4: Add salvage mode to Inventory component

**Files:**
- Modify: `apps/web/src/components/screens/Inventory.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add `onSalvageBatch` prop and `salvageCost` to Item interface**

In `InventoryProps`:
```ts
  onSalvageBatch?: (itemIds: string[]) => void | Promise<void>;
```

Note: `salvageCost: number | null` should already be on the Item interface from the previous PR.

**Step 2: Add salvage mode state**

Inside the `Inventory` component:
```ts
  const [salvageMode, setSalvageMode] = useState(false);
  const [salvageSelection, setSalvageSelection] = useState<Set<string>>(new Set());
  const [salvageBusy, setSalvageBusy] = useState(false);
```

**Step 3: Add salvage mode toggle button**

Add a "Salvage Mode" / "Cancel" button near the top of the inventory, next to or below the section headers. Only show when `onSalvageBatch` is provided and `zoneCraftingLevel !== 0`:

```tsx
{onSalvageBatch && !noFacility && (
  <PixelButton
    variant={salvageMode ? 'secondary' : 'primary'}
    size="sm"
    onClick={() => {
      setSalvageMode(!salvageMode);
      setSalvageSelection(new Set());
    }}
  >
    {salvageMode ? 'Cancel' : 'Salvage Mode'}
  </PixelButton>
)}
```

**Step 4: Add checkbox rendering in salvage mode**

When `salvageMode` is true, render the backpack items with checkboxes. Only items where `salvageCost !== null` are selectable. Toggle selection on click:

```tsx
const toggleSalvageItem = (id: string) => {
  setSalvageSelection((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};
```

**Step 5: Add salvage summary bar and action button**

At the bottom of the salvage mode view:
```tsx
const selectedSalvageItems = backpackItems.filter((i) => salvageSelection.has(i.id));
const totalSalvageCost = selectedSalvageItems.reduce((sum, i) => sum + (i.salvageCost ?? 0), 0);
```

```tsx
{salvageMode && (
  <div className="flex items-center justify-between bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3">
    <div className="text-sm text-[var(--rpg-text-primary)]">
      {salvageSelection.size} items selected
      {totalSalvageCost > 0
        ? ` (${totalSalvageCost} turns)`
        : salvageSelection.size > 0 ? ' (Free)' : ''}
    </div>
    <PixelButton
      variant="primary"
      size="sm"
      disabled={salvageSelection.size === 0 || salvageBusy}
      onClick={async () => {
        if (!onSalvageBatch) return;
        setSalvageBusy(true);
        try {
          await onSalvageBatch([...salvageSelection]);
          setSalvageMode(false);
          setSalvageSelection(new Set());
        } finally {
          setSalvageBusy(false);
        }
      }}
    >
      Salvage All
    </PixelButton>
  </div>
)}
```

**Step 6: Pass `onSalvageBatch` from page.tsx**

In the `case 'inventory':` block, add the prop:
```tsx
onSalvageBatch={handleSalvageBatch}
```

**Step 7: Build**

Run: `npm run build:web`

**Step 8: Commit**

```
feat: add salvage mode with multi-select to inventory
```

---

## Task 5: Collapse forge sacrifice pickers by default

**Files:**
- Modify: `apps/web/src/components/screens/Forge.tsx`

**Step 1: Add collapsed state**

```ts
const [upgradePickerOpen, setUpgradePickerOpen] = useState(false);
const [rerollPickerOpen, setRerollPickerOpen] = useState(false);
```

**Step 2: Replace the upgrade sacrifice picker**

Replace the sacrifice picker section (the `<div className="space-y-1">` block under Upgrade) with a collapsed/expanded version:

```tsx
<div className="space-y-1">
  {upgradeSacrifices.length === 0 ? (
    <div className="text-xs text-[var(--rpg-red)]">Missing sacrificial item.</div>
  ) : upgradePickerOpen ? (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--rpg-text-secondary)]">Select sacrificial item:</div>
        <button
          type="button"
          onClick={() => setUpgradePickerOpen(false)}
          className="text-xs text-[var(--rpg-gold)] hover:underline"
        >
          Collapse
        </button>
      </div>
      <div className="space-y-1 max-h-36 overflow-y-auto">
        {/* existing sacrifice buttons unchanged */}
      </div>
    </>
  ) : (
    <button
      type="button"
      onClick={() => setUpgradePickerOpen(true)}
      className="w-full text-left text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
    >
      Sacrifice: <span className="text-[var(--rpg-text-primary)] font-semibold">
        {selectedUpgradeSacrifice?.name ?? 'None'}
      </span>
      {' '}<span className="text-[var(--rpg-gold)]">Change</span>
    </button>
  )}
</div>
```

Where `selectedUpgradeSacrifice` is computed:
```ts
const selectedUpgradeSacrifice = upgradeSacrifices.find((i) => i.id === selectedUpgradeSacrificeId) ?? null;
```

**Step 3: Same pattern for reroll sacrifice picker**

Apply the identical collapsed/expanded pattern to the reroll section using `rerollPickerOpen` / `setRerollPickerOpen` and `selectedRerollSacrifice`.

**Step 4: Build**

Run: `npm run build:web`

**Step 5: Commit**

```
feat: collapse forge sacrifice pickers by default for mobile UX
```
