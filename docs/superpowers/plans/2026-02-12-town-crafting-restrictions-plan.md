# Town Crafting Restrictions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate all crafting operations by zone `maxCraftingLevel`, with proactive UI disabling.

**Architecture:** Add `maxCraftingLevel` column to Zone. API checks player's current zone before allowing craft/forge/salvage. Frontend receives the cap in the recipes response and disables UI elements proactively.

**Tech Stack:** Prisma migration, Express route guards, React prop-driven disable states.

**Design doc:** `docs/superpowers/specs/2026-02-12-town-crafting-restrictions-design.md`

---

### Task 1: Database Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (Zone model, ~line 169)
- Create: new migration via `npx prisma migrate dev`

**Step 1: Add column to Zone model**

In `packages/database/prisma/schema.prisma`, add to the Zone model after `zoneExitChance`:

```prisma
maxCraftingLevel Int?    @default(0) @map("max_crafting_level")
```

**Step 2: Generate migration**

```bash
cd packages/database && npx prisma migrate dev --name add_zone_max_crafting_level
```

Expected: Migration created, `max_crafting_level` column added to `zones` table with default `0`.

**Step 3: Generate Prisma client**

```bash
npm run db:generate
```

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add maxCraftingLevel column to Zone"
```

---

### Task 2: Seed Data

**Files:**
- Modify: `packages/database/prisma/seed.ts` (~line 56-68, zone seed array)

**Step 1: Update zone seed entries**

Add `maxCraftingLevel` to the two town entries:

- Millbrook (line 57): add `maxCraftingLevel: 20`
- Thornwall (line 64): add `maxCraftingLevel: null`

All wild zones keep the DB default of `0` — no changes needed for them.

**Step 2: Verify seed compiles**

```bash
npx tsc packages/database/prisma/seed.ts --noEmit --esModuleInterop --skipLibCheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add packages/database/prisma/seed.ts
git commit -m "feat: seed maxCraftingLevel for Millbrook (20) and Thornwall (null)"
```

---

### Task 3: API — Zone Crafting Check Helper

**Files:**
- Modify: `apps/api/src/routes/crafting.ts` (top of file, ~line 36)

**Step 1: Add helper function**

After the `isItemType` function (~line 47), add:

```typescript
async function getZoneCraftingLevel(playerId: string): Promise<{ maxCraftingLevel: number | null; zoneName: string }> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) {
    throw new AppError(400, 'You must be in a zone to craft', 'NO_ZONE');
  }
  const zone = await prisma.zone.findUnique({
    where: { id: player.currentZoneId },
    select: { name: true, maxCraftingLevel: true },
  });
  if (!zone) {
    throw new AppError(400, 'Current zone not found', 'NO_ZONE');
  }
  return { maxCraftingLevel: zone.maxCraftingLevel, zoneName: zone.name };
}

function assertZoneAllowsCrafting(zone: { maxCraftingLevel: number | null; zoneName: string }): void {
  if (zone.maxCraftingLevel === 0) {
    throw new AppError(400, 'No crafting facilities available here. Travel to a town to craft.', 'NO_CRAFTING_FACILITY');
  }
}

function assertZoneAllowsRecipeLevel(zone: { maxCraftingLevel: number | null; zoneName: string }, requiredLevel: number): void {
  if (zone.maxCraftingLevel !== null && requiredLevel > zone.maxCraftingLevel) {
    throw new AppError(
      400,
      `${zone.zoneName}'s forge can only craft up to level ${zone.maxCraftingLevel} recipes. This recipe requires level ${requiredLevel}.`,
      'FORGE_LEVEL_TOO_LOW',
    );
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/crafting.ts
git commit -m "feat: add zone crafting level check helpers"
```

---

### Task 4: API — Gate Craft Route

**Files:**
- Modify: `apps/api/src/routes/crafting.ts` (~line 309, POST `/craft` handler)

**Step 1: Add zone check after recovery check**

After the `isRecovering` check (line 318) and before fetching the recipe (line 320), add:

```typescript
const zone = await getZoneCraftingLevel(playerId);
assertZoneAllowsCrafting(zone);
```

Then after the `skillLevel` check (line 347), before the advanced recipe check, add:

```typescript
assertZoneAllowsRecipeLevel(zone, recipe.requiredLevel);
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/crafting.ts
git commit -m "feat: gate craft route by zone maxCraftingLevel"
```

---

### Task 5: API — Gate Forge & Salvage Routes

**Files:**
- Modify: `apps/api/src/routes/crafting.ts`

**Step 1: Gate forge/upgrade (~line 556)**

After the `isRecovering` check (line 563), add:

```typescript
const zone = await getZoneCraftingLevel(playerId);
assertZoneAllowsCrafting(zone);
```

**Step 2: Gate forge/reroll (~line 772)**

Same pattern — after the `isRecovering` check, add zone check.

**Step 3: Gate salvage (~line 897)**

After the `playerId` line (line 899), add recovery check if missing, then zone check:

```typescript
const zone = await getZoneCraftingLevel(playerId);
assertZoneAllowsCrafting(zone);
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/crafting.ts
git commit -m "feat: gate forge upgrade, reroll, and salvage by zone"
```

---

### Task 6: API — Include Zone Crafting Level in Recipes Response

**Files:**
- Modify: `apps/api/src/routes/crafting.ts` (~line 194, GET `/recipes` handler)

**Step 1: Fetch player's zone crafting level**

After fetching `skills` and `learnedAdvancedRecipes` (~line 198), also fetch the player's current zone:

```typescript
const player = await prisma.player.findUnique({
  where: { id: playerId },
  select: { currentZoneId: true },
});
const currentZone = player?.currentZoneId
  ? await prisma.zone.findUnique({
      where: { id: player.currentZoneId },
      select: { name: true, maxCraftingLevel: true },
    })
  : null;
```

**Step 2: Include in response**

Change `res.json({ recipes: visible })` (line 280) to:

```typescript
res.json({
  recipes: visible,
  zoneCraftingLevel: currentZone?.maxCraftingLevel ?? 0,
  zoneName: currentZone?.name ?? null,
});
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/crafting.ts
git commit -m "feat: include zoneCraftingLevel in recipes response"
```

---

### Task 7: API — Include Zone Crafting Level in Zones Response

**Files:**
- Modify: `apps/api/src/routes/zones.ts` (zone map data, ~line 80-92)

**Step 1: Add maxCraftingLevel to zone response mapping**

In the zone mapping (where `id`, `name`, `zoneType`, etc. are returned), add:

```typescript
maxCraftingLevel: discovered ? z.maxCraftingLevel : null,
```

This lets the frontend know the cap for each zone without a separate API call.

**Step 2: Commit**

```bash
git add apps/api/src/routes/zones.ts
git commit -m "feat: include maxCraftingLevel in zones response"
```

---

### Task 8: Frontend — Update API Types

**Files:**
- Modify: `apps/web/src/lib/api.ts` (~line 884, `getCraftingRecipes`)

**Step 1: Update getCraftingRecipes return type**

Add to the response type (after the `recipes` array):

```typescript
zoneCraftingLevel: number | null;
zoneName: string | null;
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add zoneCraftingLevel to crafting API types"
```

---

### Task 9: Frontend — Thread Zone Crafting Data Through Controller

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Add state for zone crafting level**

Near the `craftingRecipes` state (~line 283), add:

```typescript
const [zoneCraftingLevel, setZoneCraftingLevel] = useState<number | null>(0);
const [zoneCraftingName, setZoneCraftingName] = useState<string | null>(null);
```

**Step 2: Populate from API response**

Find where `setCraftingRecipes` is called after `getCraftingRecipes()`. Update to also store:

```typescript
setZoneCraftingLevel(data.zoneCraftingLevel);
setZoneCraftingName(data.zoneName);
```

**Step 3: Expose in return object**

Add `zoneCraftingLevel` and `zoneCraftingName` to the return object (~line 1346).

**Step 4: Also add maxCraftingLevel to the zones state type**

Update the zones state type (~line 186) to include `maxCraftingLevel: number | null`.

**Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: thread zoneCraftingLevel through game controller"
```

---

### Task 10: Frontend — Crafting Screen Zone Restrictions

**Files:**
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/app/game/page.tsx` (~line 557, where `<Crafting>` is rendered)

**Step 1: Add props to Crafting component**

Add to `CraftingProps` interface:

```typescript
zoneCraftingLevel: number | null;  // null = unlimited, 0 = no facility
zoneName: string | null;
```

**Step 2: Add forge-locked detection**

In the component body, add:

```typescript
const noFacility = zoneCraftingLevel === 0;
const forgeLocked = (recipe: Recipe) =>
  zoneCraftingLevel !== null && recipe.requiredLevel > zoneCraftingLevel;
```

**Step 3: Update `canCraft` function**

Add forge check:

```typescript
const canCraft = (recipe: Recipe) => {
  if (noFacility) return false;
  if (forgeLocked(recipe)) return false;
  if (recipe.requiredLevel > skillLevel) return false;
  if (recipe.isAdvanced && recipe.isDiscovered === false) return false;
  return recipe.materials.every((m) => m.owned >= m.required);
};
```

**Step 4: Update `maxCraftable` similarly**

```typescript
const maxCraftable = (recipe: Recipe): number => {
  if (noFacility) return 0;
  if (forgeLocked(recipe)) return 0;
  if (recipe.requiredLevel > skillLevel) return 0;
  if (recipe.isAdvanced && recipe.isDiscovered === false) return 0;
  if (recipe.materials.length === 0) return 99;
  return Math.min(...recipe.materials.map((m) => Math.floor(m.owned / m.required)));
};
```

**Step 5: Update lock detection for selected recipe**

After `selectedLevelLocked` (~line 97), add:

```typescript
const selectedForgeLocked = selectedRecipe ? forgeLocked(selectedRecipe) : false;
```

**Step 6: Update recipe list lock state**

In the recipe list map (~line 146), update:

```typescript
const forgeCapLocked = forgeLocked(recipe);
const listLocked = levelLocked || discoveryLocked || noFacility || forgeCapLocked;
```

**Step 7: Update recipe list status text**

In the status text section (~line 202-210), add forge lock reason before the existing checks:

```typescript
{noFacility
  ? 'No crafting facilities here'
  : forgeCapLocked
  ? `Requires a higher-level forge (Lv. ${recipe.requiredLevel})`
  : levelLocked
  ? `Unlocks at Lv. ${recipe.requiredLevel}`
  : discoveryLocked
  ? 'Recipe not discovered'
  : craftable
  ? `Can craft (${maxCraftable(recipe)})`
  : 'Missing materials'}
```

**Step 8: Update craft button text**

In the craft button (~line 385-393), add forge lock cases:

```typescript
{isRecovering
  ? 'Recover First'
  : noFacility
  ? 'No Crafting Facility'
  : selectedForgeLocked
  ? `Requires Higher-Level Forge`
  : selectedLevelLocked
  ? `Requires Lv. ${selectedRecipe.requiredLevel}`
  : selectedRecipeLocked
  ? 'Discover Recipe First'
  : quantity > 1
  ? `Craft ${quantity}x ${selectedRecipe.name}`
  : `Craft ${selectedRecipe.name}`}
```

**Step 9: Update disabled condition on craft button**

```typescript
disabled={isRecovering || noFacility || selectedMax < 1}
```

**Step 10: Pass props from page.tsx**

In `page.tsx` (~line 557), add props to `<Crafting>`:

```tsx
zoneCraftingLevel={zoneCraftingLevel}
zoneName={zoneCraftingName}
```

**Step 11: Commit**

```bash
git add apps/web/src/components/screens/Crafting.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: grey out crafting recipes by zone forge level"
```

---

### Task 11: Frontend — Forge Screen Zone Restrictions

**Files:**
- Modify: `apps/web/src/components/screens/Forge.tsx`
- Modify: `apps/web/src/app/game/page.tsx` (~line 593, where `<Forge>` is rendered)

**Step 1: Add prop to ForgeProps**

```typescript
zoneCraftingLevel: number | null;
```

**Step 2: Compute noFacility**

In the component body:

```typescript
const noFacility = zoneCraftingLevel === 0;
```

**Step 3: Disable upgrade and reroll buttons when noFacility**

Add `|| noFacility` to both button `disabled` conditions (lines 294-301 and 358-364).

**Step 4: Show message when no facility**

After the header (~line 160), add:

```tsx
{noFacility && (
  <div className="text-sm text-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)] rounded-lg p-3">
    No forge available here. Travel to a town to use the forge.
  </div>
)}
```

**Step 5: Pass prop from page.tsx**

In `page.tsx` (~line 595), add:

```tsx
zoneCraftingLevel={zoneCraftingLevel}
```

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/Forge.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: disable forge when no crafting facility in zone"
```

---

### Task 12: Frontend — Salvage Zone Restriction

**Files:**
- Modify: `apps/web/src/app/game/page.tsx` or the Inventory component (wherever salvage button lives)

Salvage is triggered from the Inventory screen. The `handleSalvageItem` function already exists in the controller.

**Step 1: Find where salvage button is rendered**

Search for `onSalvage` in the Inventory component. Add a `zoneCraftingLevel` prop and disable the salvage button when `zoneCraftingLevel === 0`.

**Step 2: Pass prop through**

Pass `zoneCraftingLevel` to the Inventory component from `page.tsx`.

**Step 3: Show tooltip/text when disabled**

"No salvage facility here. Travel to a town."

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Inventory.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: disable salvage when no crafting facility in zone"
```

---

### Task 13: Build & Typecheck

**Step 1: Build shared and game-engine**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
```

**Step 2: Typecheck all packages**

```bash
npm run typecheck
```

Expected: No new errors (the pre-existing `page.tsx:333` SkillType error is acceptable).

**Step 3: Test game-engine**

```bash
npm run test:engine
```

Expected: All existing tests pass (no game-engine logic changed).

**Step 4: Commit any fixes if needed**

---

### Task 14: Manual Smoke Test

**Step 1: Start local dev**

```bash
docker-compose up -d && npm run dev
```

**Step 2: Reseed database**

```bash
npm run db:seed
```

**Step 3: Test scenarios**

1. Log in, go to Millbrook → crafting tab → recipes up to Lv 20 should be craftable, Lv 21+ greyed out with forge message
2. Go to Forge tab → should work normally in Millbrook
3. Travel to Forest Edge (wild zone) → crafting tab → all recipes greyed, "No crafting facilities here"
4. Forge tab in wild → disabled with message
5. Travel to Thornwall → all recipes available (no cap)
6. Salvage in town → works. Salvage in wild → disabled.
