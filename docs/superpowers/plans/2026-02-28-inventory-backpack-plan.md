# Inventory & Backpack System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real inventory capacity with backpacks, town stash, sell-for-gold, and loot overflow handling.

**Architecture:** New `inStash` boolean on Item model separates backpack from stash. Capacity is computed from base + equipped backpack tier/rarity + belt bonus stat + champion flag. Sell system uses template-based `sellPrice` with rarity multiplier. Overflow loot stored in Redis with TTL for player pickup.

**Tech Stack:** Prisma migrations, shared types/constants, game-engine pure functions, Express routes, Redis for pending loot, React frontend components.

**Design doc:** `docs/superpowers/specs/2026-02-28-inventory-backpack-design.md`

---

## Task 1: Database Migration

Add `gold` to Player, `inStash` to Item, `sellPrice` to ItemTemplate.

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: new migration file via `npx prisma migrate dev`

**Step 1: Add fields to Prisma schema**

In `schema.prisma`, add to the `Player` model (after line 28, after `attributes`):

```prisma
  gold            Int    @default(0)
```

Add to the `Item` model (after line 186, after `createdAt`):

```prisma
  inStash         Boolean @default(false) @map("in_stash")
```

Add to the `ItemTemplate` model (after line 167, after `consumableEffect`):

```prisma
  sellPrice       Int?    @map("sell_price")
```

**Step 2: Generate and run migration**

Run: `cd packages/database && npx prisma migrate dev --name add-inventory-gold-stash-sellprice`

Expected: Migration created and applied successfully.

**Step 3: Regenerate Prisma client**

Run: `npm run db:generate`

**Step 4: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat: add gold, inStash, sellPrice to database schema"
```

---

## Task 2: Shared Types & Constants

Update shared types and add inventory/sell constants.

**Files:**
- Modify: `packages/shared/src/types/player.types.ts`
- Modify: `packages/shared/src/types/item.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Add `backpack` to EquipmentSlot type**

In `packages/shared/src/types/player.types.ts`, add `'backpack'` to the `EquipmentSlot` union type (after `'charm'` on line 103):

```typescript
export type EquipmentSlot =
  | 'head'
  | 'neck'
  | 'chest'
  | 'gloves'
  | 'belt'
  | 'legs'
  | 'boots'
  | 'main_hand'
  | 'off_hand'
  | 'ring'
  | 'charm'
  | 'backpack';
```

Add `'backpack'` to `ALL_EQUIPMENT_SLOTS` array (after `'charm'`).

Add `gold: number` to the `Player` interface.

**Step 2: Update Item types**

In `packages/shared/src/types/item.types.ts`:

Add `inventorySlots?: number;` to the `ItemStats` interface (after `critDamage`).

Add `sellPrice?: number | null;` to the `ItemTemplate` interface (after `consumableEffect`).

Add `inStash: boolean;` to the `Item` interface (after `createdAt`).

**Step 3: Add inventory and sell constants**

In `packages/shared/src/constants/gameConstants.ts`, add after the `CRAFTING_CONSTANTS` block (after line 270):

```typescript
// =============================================================================
// INVENTORY & BACKPACK
// =============================================================================

export const INVENTORY_CONSTANTS = {
  BASE_CAPACITY: 24,
  BACKPACK_SLOTS_PER_TIER: 8,
  BACKPACK_SLOTS_PER_RARITY: 2,
  BELT_INVENTORY_SLOTS_MIN: 4,
  BELT_INVENTORY_SLOTS_MAX: 8,
  CHAMPION_BONUS_SLOTS: 8,
  PENDING_LOOT_TTL_SECONDS: 300,
} as const;

export const SELL_CONSTANTS = {
  RARITY_MULTIPLIERS: {
    common: 1,
    uncommon: 2,
    rare: 4,
    epic: 8,
    legendary: 16,
  },
  DURABILITY_PENALTY_THRESHOLD: 0.5,
} as const;
```

**Step 4: Add `inventorySlots` to belt stat pool**

In `gameConstants.ts` line 63, update belt entry:

```typescript
belt: { primary: ['armor', 'magicDefence', 'health'], utility: ['luck', 'inventorySlots'] },
```

Also add `backpack` slot pool (no combat stats, just a placeholder for the slot system):

```typescript
backpack: { primary: [], utility: [] },
```

**Step 5: Build shared package**

Run: `npm run build --workspace=packages/shared`

Expected: Builds without errors.

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: add inventory types, constants, and backpack equipment slot"
```

---

## Task 3: Game Engine — Capacity Calculator

Pure function to compute inventory capacity.

**Files:**
- Create: `packages/game-engine/src/inventory/inventoryCapacity.ts`
- Create: `packages/game-engine/src/inventory/inventoryCapacity.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Write failing tests**

Create `packages/game-engine/src/inventory/inventoryCapacity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getInventoryCapacity, getBackpackSlots } from './inventoryCapacity';

describe('getBackpackSlots', () => {
  it('returns 0 for no backpack', () => {
    expect(getBackpackSlots(0, 'common')).toBe(0);
  });

  it('returns tier * 8 for common backpack', () => {
    expect(getBackpackSlots(1, 'common')).toBe(8);
    expect(getBackpackSlots(3, 'common')).toBe(24);
    expect(getBackpackSlots(5, 'common')).toBe(40);
  });

  it('adds +2 per rarity above common', () => {
    expect(getBackpackSlots(1, 'uncommon')).toBe(10);
    expect(getBackpackSlots(1, 'rare')).toBe(12);
    expect(getBackpackSlots(1, 'epic')).toBe(14);
    expect(getBackpackSlots(1, 'legendary')).toBe(16);
  });

  it('T5 legendary = 48', () => {
    expect(getBackpackSlots(5, 'legendary')).toBe(48);
  });
});

describe('getInventoryCapacity', () => {
  it('returns base capacity with no bonuses', () => {
    expect(getInventoryCapacity({ backpackTier: 0, backpackRarity: 'common', beltSlotBonus: 0, isChampion: false })).toBe(24);
  });

  it('adds backpack slots', () => {
    expect(getInventoryCapacity({ backpackTier: 3, backpackRarity: 'common', beltSlotBonus: 0, isChampion: false })).toBe(48);
  });

  it('adds belt bonus', () => {
    expect(getInventoryCapacity({ backpackTier: 0, backpackRarity: 'common', beltSlotBonus: 6, isChampion: false })).toBe(30);
  });

  it('adds champion bonus', () => {
    expect(getInventoryCapacity({ backpackTier: 0, backpackRarity: 'common', beltSlotBonus: 0, isChampion: true })).toBe(32);
  });

  it('returns max capacity with all bonuses', () => {
    expect(getInventoryCapacity({ backpackTier: 5, backpackRarity: 'legendary', beltSlotBonus: 8, isChampion: true })).toBe(88);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:engine -- --run src/inventory/inventoryCapacity.test.ts`

Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `packages/game-engine/src/inventory/inventoryCapacity.ts`:

```typescript
import { INVENTORY_CONSTANTS, ITEM_RARITY_CONSTANTS } from '@adventure/shared';
import type { ItemRarity } from '@adventure/shared';

const RARITY_INDEX: Record<string, number> = {};
ITEM_RARITY_CONSTANTS.ORDER.forEach((r, i) => { RARITY_INDEX[r] = i; });

export function getBackpackSlots(tier: number, rarity: ItemRarity): number {
  if (tier <= 0) return 0;
  const base = tier * INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_TIER;
  const rarityBonus = (RARITY_INDEX[rarity] ?? 0) * INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_RARITY;
  return base + rarityBonus;
}

export interface CapacityInput {
  backpackTier: number;
  backpackRarity: ItemRarity;
  beltSlotBonus: number;
  isChampion: boolean;
}

export function getInventoryCapacity(input: CapacityInput): number {
  return (
    INVENTORY_CONSTANTS.BASE_CAPACITY +
    getBackpackSlots(input.backpackTier, input.backpackRarity) +
    input.beltSlotBonus +
    (input.isChampion ? INVENTORY_CONSTANTS.CHAMPION_BONUS_SLOTS : 0)
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:engine -- --run src/inventory/inventoryCapacity.test.ts`

Expected: All tests PASS.

**Step 5: Export from game-engine index**

Add to `packages/game-engine/src/index.ts`:

```typescript
export * from './inventory/inventoryCapacity';
```

**Step 6: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`

**Step 7: Commit**

```bash
git add packages/game-engine/
git commit -m "feat: add inventory capacity calculator with tests"
```

---

## Task 4: Game Engine — Sell Price Calculator

Pure function to compute item sell price.

**Files:**
- Create: `packages/game-engine/src/inventory/sellPrice.ts`
- Create: `packages/game-engine/src/inventory/sellPrice.test.ts`

**Step 1: Write failing tests**

Create `packages/game-engine/src/inventory/sellPrice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSellPrice } from './sellPrice';

describe('calculateSellPrice', () => {
  it('returns 0 for null sellPrice', () => {
    expect(calculateSellPrice({ baseSellPrice: null, rarity: 'common', currentDurability: null, maxDurability: null })).toBe(0);
  });

  it('returns 0 for zero sellPrice', () => {
    expect(calculateSellPrice({ baseSellPrice: 0, rarity: 'common', currentDurability: null, maxDurability: null })).toBe(0);
  });

  it('returns base price for common items', () => {
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'common', currentDurability: null, maxDurability: null })).toBe(10);
  });

  it('applies rarity multiplier', () => {
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'uncommon', currentDurability: null, maxDurability: null })).toBe(20);
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'rare', currentDurability: null, maxDurability: null })).toBe(40);
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'epic', currentDurability: null, maxDurability: null })).toBe(80);
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'legendary', currentDurability: null, maxDurability: null })).toBe(160);
  });

  it('no penalty above 50% durability', () => {
    expect(calculateSellPrice({ baseSellPrice: 100, rarity: 'common', currentDurability: 80, maxDurability: 100 })).toBe(100);
  });

  it('applies durability penalty below 50%', () => {
    // 30/100 = 30% durability, below 50% threshold
    // price = floor(100 * (30/100)) = 30
    expect(calculateSellPrice({ baseSellPrice: 100, rarity: 'common', currentDurability: 30, maxDurability: 100 })).toBe(30);
  });

  it('minimum sell price is 1 for sellable items', () => {
    expect(calculateSellPrice({ baseSellPrice: 1, rarity: 'common', currentDurability: 1, maxDurability: 100 })).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:engine -- --run src/inventory/sellPrice.test.ts`

**Step 3: Write implementation**

Create `packages/game-engine/src/inventory/sellPrice.ts`:

```typescript
import { SELL_CONSTANTS } from '@adventure/shared';
import type { ItemRarity } from '@adventure/shared';

export interface SellPriceInput {
  baseSellPrice: number | null;
  rarity: ItemRarity;
  currentDurability: number | null;
  maxDurability: number | null;
}

export function calculateSellPrice(input: SellPriceInput): number {
  if (!input.baseSellPrice) return 0;

  const multiplier = SELL_CONSTANTS.RARITY_MULTIPLIERS[input.rarity] ?? 1;
  let price = input.baseSellPrice * multiplier;

  // Durability penalty
  if (input.currentDurability != null && input.maxDurability != null && input.maxDurability > 0) {
    const ratio = input.currentDurability / input.maxDurability;
    if (ratio < SELL_CONSTANTS.DURABILITY_PENALTY_THRESHOLD) {
      price = Math.floor(price * ratio);
    }
  }

  return Math.max(price > 0 ? 1 : 0, price);
}
```

**Step 4: Run tests**

Run: `npm run test:engine -- --run src/inventory/sellPrice.test.ts`

Expected: All PASS.

**Step 5: Export from index and build**

Add to `packages/game-engine/src/index.ts`:

```typescript
export * from './inventory/sellPrice';
```

Run: `npm run build --workspace=packages/game-engine`

**Step 6: Commit**

```bash
git add packages/game-engine/
git commit -m "feat: add sell price calculator with rarity multiplier and durability penalty"
```

---

## Task 5: Seed Data — Backpack Templates & Recipes

Add backpack item templates, recipes, and sellPrice to existing templates.

**Files:**
- Modify: `packages/database/prisma/seed-data/ids.ts`
- Modify: `packages/database/prisma/seed-data/items.ts`
- Modify: `packages/database/prisma/seed-data/recipes.ts`

**Step 1: Add backpack IDs**

In `packages/database/prisma/seed-data/ids.ts`, add a new `backpack` section:

```typescript
  backpack: {
    clothSatchel: randomUUID(),
    reinforcedPack: randomUUID(),
    travellerRucksack: randomUUID(),
    rangerHaversack: randomUUID(),
    adventurerExpeditionPack: randomUUID(),
  },
```

**Step 2: Add backpack item templates**

In `packages/database/prisma/seed-data/items.ts`, add a new section for backpacks. These use `itemType: 'armor'`, `slot: 'backpack'`, and store `inventorySlots` in `baseStats`:

```typescript
const backpacks = [
  it({ id: IDS.backpack.clothSatchel, name: 'Cloth Satchel', itemType: 'armor', slot: 'backpack', tier: 1, requiredLevel: 1, baseStats: { inventorySlots: 8 }, maxDurability: 0 }),
  it({ id: IDS.backpack.reinforcedPack, name: 'Reinforced Pack', itemType: 'armor', slot: 'backpack', tier: 2, requiredLevel: 1, baseStats: { inventorySlots: 16 }, maxDurability: 0 }),
  it({ id: IDS.backpack.travellerRucksack, name: "Traveller's Rucksack", itemType: 'armor', slot: 'backpack', tier: 3, requiredLevel: 1, baseStats: { inventorySlots: 24 }, maxDurability: 0 }),
  it({ id: IDS.backpack.rangerHaversack, name: "Ranger's Haversack", itemType: 'armor', slot: 'backpack', tier: 4, requiredLevel: 1, baseStats: { inventorySlots: 32 }, maxDurability: 0 }),
  it({ id: IDS.backpack.adventurerExpeditionPack, name: "Adventurer's Expedition Pack", itemType: 'armor', slot: 'backpack', tier: 5, requiredLevel: 1, baseStats: { inventorySlots: 40 }, maxDurability: 0 }),
];
```

Include `backpacks` in the `getAllItemTemplates()` export.

**Step 3: Add backpack recipes**

In `packages/database/prisma/seed-data/recipes.ts`, add backpack recipes. Use the `tailoring` skill. Materials: tier-appropriate cloth + leather:

```typescript
function backpackRecipes() {
  return [
    recipe({ skillType: 'tailoring', requiredLevel: 5, resultTemplateId: IDS.backpack.clothSatchel, turnCost: 20, xpReward: 25, materials: [{ itemTemplateId: lth.silkCloth, quantity: 6 }, { itemTemplateId: lth.ratLeather, quantity: 3 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 15, resultTemplateId: IDS.backpack.reinforcedPack, turnCost: 35, xpReward: 45, materials: [{ itemTemplateId: lth.wovenCloth, quantity: 6 }, { itemTemplateId: lth.wolfLeather, quantity: 4 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 25, resultTemplateId: IDS.backpack.travellerRucksack, turnCost: 55, xpReward: 70, materials: [{ itemTemplateId: lth.faeFabric, quantity: 6 }, { itemTemplateId: lth.wargLeather, quantity: 4 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 35, resultTemplateId: IDS.backpack.rangerHaversack, turnCost: 80, xpReward: 100, materials: [{ itemTemplateId: lth.cursedFabric, quantity: 6 }, { itemTemplateId: lth.crocLeather, quantity: 4 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 45, resultTemplateId: IDS.backpack.adventurerExpeditionPack, turnCost: 110, xpReward: 140, materials: [{ itemTemplateId: lth.spectralFabric, quantity: 6 }, { itemTemplateId: lth.nagaLeather, quantity: 4 }] }),
  ];
}
```

Include `backpackRecipes()` in the `getAllRecipes()` export.

**Step 4: Add sellPrice to existing item templates**

Add a `sellPrice` field to the `ItemRow` type and `it()` helper in `items.ts`. Then set reasonable sell prices on all existing templates:

- Resources/materials: `sellPrice = tier * 1` (1, 2, 3, 4, 5 gold)
- Consumables: `sellPrice = tier * 2`
- Weapons: `sellPrice = tier * 10`
- Armor: `sellPrice = tier * 8`
- Jewellery: `sellPrice = tier * 12`
- Backpacks: `sellPrice = tier * 15`
- Boss gear / soulbound: `sellPrice = 0` (unsellable)

Update the `it()` helper to include `sellPrice: row.sellPrice ?? null`. Update the `resource()` and `consumable()` helpers. Add sell prices to the equipment items.

**Step 5: Run seed to verify**

Run: `npm run db:seed`

Expected: Seed completes without errors.

**Step 6: Commit**

```bash
git add packages/database/
git commit -m "feat: add backpack templates, recipes, and sell prices to seed data"
```

---

## Task 6: Inventory Service — Capacity & Slot Counting

Add server-side capacity computation and slot counting.

**Files:**
- Modify: `apps/api/src/services/inventoryService.ts`
- Modify or create: `apps/api/src/services/inventoryService.test.ts`

**Step 1: Write failing tests for slot counting and capacity**

Add tests to `apps/api/src/services/inventoryService.test.ts`:

```typescript
describe('getUsedSlots', () => {
  it('counts non-stackable items as 1 slot each', async () => {
    // Mock: 3 items, all non-stackable (quantity 1), not equipped, not stashed
    // Expected: 3
  });

  it('counts each stackable template as 1 slot regardless of quantity', async () => {
    // Mock: 2 stackable items with different templateIds
    // Expected: 2
  });

  it('excludes equipped items', async () => {
    // Mock: item has equippedSlot set
    // Expected: 0
  });

  it('excludes stashed items', async () => {
    // Mock: item has inStash = true
    // Expected: 0
  });
});

describe('getPlayerCapacity', () => {
  it('returns base capacity with no backpack or belt bonus', async () => {
    // Mock: no equipment
    // Expected: 24
  });

  it('includes backpack tier bonus', async () => {
    // Mock: backpack equipped with baseStats.inventorySlots = 16
    // Expected: 24 + 16 = 40
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test:api -- --run src/services/inventoryService.test.ts`

**Step 3: Implement getUsedSlots**

In `apps/api/src/services/inventoryService.ts`, add:

```typescript
export async function getUsedSlots(playerId: string): Promise<number> {
  // Get all non-equipped, non-stashed items
  const items = await prisma.item.findMany({
    where: {
      ownerId: playerId,
      inStash: false,
      equipment: { none: {} },
    },
    select: { templateId: true, quantity: true },
  });

  // Count unique templateIds for stackable, individual items for non-stackable
  const stackableTemplates = new Set<string>();
  let count = 0;

  for (const item of items) {
    if (item.quantity > 1) {
      // Stackable — count unique templates
      if (!stackableTemplates.has(item.templateId)) {
        stackableTemplates.add(item.templateId);
        count++;
      }
    } else {
      count++;
    }
  }

  return count;
}
```

Note: this uses `quantity > 1` as a heuristic for stackable. A more robust check could join with `itemTemplate.stackable`, but since stackable items always have `quantity >= 1` and are the only items that merge, this works. However, a freshly-created stackable item with quantity=1 would be counted wrong. Better approach: check template:

```typescript
export async function getUsedSlots(playerId: string): Promise<number> {
  const items = await prisma.item.findMany({
    where: {
      ownerId: playerId,
      inStash: false,
      equipment: { none: {} },
    },
    select: { templateId: true, template: { select: { stackable: true } } },
  });

  const stackableTemplates = new Set<string>();
  let count = 0;

  for (const item of items) {
    if (item.template.stackable) {
      if (!stackableTemplates.has(item.templateId)) {
        stackableTemplates.add(item.templateId);
        count++;
      }
    } else {
      count++;
    }
  }

  return count;
}
```

**Step 4: Implement getPlayerCapacity**

```typescript
import { getInventoryCapacity } from '@adventure/game-engine';
import type { ItemRarity } from '@adventure/shared';

export async function getPlayerCapacity(playerId: string): Promise<number> {
  const equipped = await prisma.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    include: { item: { include: { template: true } } },
  });

  let backpackTier = 0;
  let backpackRarity: ItemRarity = 'common';
  let beltSlotBonus = 0;

  for (const slot of equipped) {
    if (slot.slot === 'backpack' && slot.item) {
      const stats = slot.item.template.baseStats as Record<string, number> | null;
      backpackTier = slot.item.template.tier;
      backpackRarity = slot.item.rarity as ItemRarity;
      // baseStats.inventorySlots not needed — we compute from tier + rarity
    }
    if (slot.slot === 'belt' && slot.item) {
      const bonus = slot.item.bonusStats as Record<string, number> | null;
      beltSlotBonus = bonus?.inventorySlots ?? 0;
    }
  }

  // TODO: check champion status when subscription system exists
  const isChampion = false;

  return getInventoryCapacity({ backpackTier, backpackRarity, beltSlotBonus, isChampion });
}
```

**Step 5: Run tests**

Run: `npm run test:api -- --run src/services/inventoryService.test.ts`

**Step 6: Commit**

```bash
git add apps/api/src/services/
git commit -m "feat: add inventory slot counting and capacity calculation"
```

---

## Task 7: Sell Service

Service layer for selling items for gold.

**Files:**
- Create: `apps/api/src/services/sellService.ts`
- Create: `apps/api/src/services/sellService.test.ts`

**Step 1: Write failing tests**

Create `apps/api/src/services/sellService.test.ts`:

```typescript
describe('sellItem', () => {
  it('throws if item not found', async () => { /* ... */ });
  it('throws if item not owned by player', async () => { /* ... */ });
  it('throws if item has no sell price', async () => { /* ... */ });
  it('throws if item is equipped', async () => { /* ... */ });
  it('throws if player not in town zone', async () => { /* ... */ });
  it('sells non-stackable item and grants gold', async () => { /* ... */ });
  it('sells partial stack of stackable item', async () => { /* ... */ });
  it('applies rarity multiplier', async () => { /* ... */ });
  it('applies durability penalty', async () => { /* ... */ });
});

describe('sellBulk', () => {
  it('sells multiple items and returns total gold', async () => { /* ... */ });
  it('skips items that cannot be sold', async () => { /* ... */ });
});
```

**Step 2: Run tests to verify failure**

**Step 3: Implement sellService**

Create `apps/api/src/services/sellService.ts`:

Key functions:
- `sellItem(playerId: string, itemId: string, quantity?: number)` — validates ownership, town zone, sellPrice > 0, not equipped. Calculates price via `calculateSellPrice()` from game-engine. Deletes item (or reduces stack). Increments `player.gold` via `prisma.player.update`.
- `sellBulk(playerId: string, itemIds: string[])` — runs in a transaction, calls sell logic for each item, returns total gold.

Both operations wrapped in `prisma.$transaction()` for atomicity.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add apps/api/src/services/sellService*
git commit -m "feat: add sell service for selling items for gold"
```

---

## Task 8: Stash Service

Service layer for depositing/withdrawing items from town stash.

**Files:**
- Create: `apps/api/src/services/stashService.ts`
- Create: `apps/api/src/services/stashService.test.ts`

**Step 1: Write failing tests**

```typescript
describe('depositItem', () => {
  it('throws if not in town', async () => { /* ... */ });
  it('throws if item is equipped', async () => { /* ... */ });
  it('moves non-stackable item to stash', async () => { /* ... */ });
  it('deposits partial stack', async () => { /* ... */ });
  it('deposits full stack', async () => { /* ... */ });
});

describe('withdrawItem', () => {
  it('throws if not in town', async () => { /* ... */ });
  it('throws if backpack is full', async () => { /* ... */ });
  it('moves non-stackable item from stash', async () => { /* ... */ });
  it('withdraws partial stack', async () => { /* ... */ });
});

describe('listStash', () => {
  it('returns only stashed items', async () => { /* ... */ });
});
```

**Step 2: Implement stash service**

Key functions:
- `depositItem(playerId, itemId, quantity?)` — set `inStash = true` for non-stackable. For stackable partial deposits: split stack (create new Item with `inStash = true`, reduce original quantity) or merge into existing stash stack.
- `withdrawItem(playerId, itemId, quantity?)` — check capacity via `getUsedSlots` + `getPlayerCapacity`. Set `inStash = false` or split/merge stacks.
- `listStash(playerId)` — query `Item` where `ownerId = playerId AND inStash = true`, include template.

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add apps/api/src/services/stashService*
git commit -m "feat: add stash service for town storage"
```

---

## Task 9: Pending Loot Service (Redis)

Store and retrieve overflow loot via Redis.

**Files:**
- Create: `apps/api/src/services/pendingLootService.ts`
- Create: `apps/api/src/services/pendingLootService.test.ts`

**Step 1: Write failing tests**

```typescript
describe('storePendingLoot', () => {
  it('stores loot items in Redis with TTL', async () => { /* ... */ });
  it('generates unique session ID', async () => { /* ... */ });
});

describe('getPendingLoot', () => {
  it('retrieves stored loot', async () => { /* ... */ });
  it('returns null for expired loot', async () => { /* ... */ });
});

describe('claimPendingLoot', () => {
  it('creates items for selected choices', async () => { /* ... */ });
  it('respects capacity limit', async () => { /* ... */ });
  it('deletes Redis key after claim', async () => { /* ... */ });
});
```

**Step 2: Implement pending loot service**

```typescript
import { redis } from '../utils/redis'; // existing Redis client
import { INVENTORY_CONSTANTS } from '@adventure/shared';
import { randomUUID } from 'crypto';

interface PendingLootItem {
  templateId: string;
  rarity: string;
  quantity: number;
  bonusStats: Record<string, number> | null;
  currentDurability: number | null;
  maxDurability: number | null;
}

export async function storePendingLoot(playerId: string, items: PendingLootItem[]): Promise<string> {
  const sessionId = randomUUID();
  const key = `pending_loot:${playerId}:${sessionId}`;
  await redis.set(key, JSON.stringify(items), 'EX', INVENTORY_CONSTANTS.PENDING_LOOT_TTL_SECONDS);
  return sessionId;
}

export async function getPendingLoot(playerId: string, sessionId: string): Promise<PendingLootItem[] | null> {
  const key = `pending_loot:${playerId}:${sessionId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function claimPendingLoot(playerId: string, sessionId: string, selectedIndices: number[]): Promise<void> {
  const key = `pending_loot:${playerId}:${sessionId}`;
  const data = await redis.get(key);
  if (!data) throw new AppError(404, 'Pending loot expired or not found', 'LOOT_EXPIRED');

  const items: PendingLootItem[] = JSON.parse(data);
  // Create selected items in inventory (within capacity)
  // ... prisma.$transaction logic ...

  await redis.del(key);
}
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add apps/api/src/services/pendingLootService*
git commit -m "feat: add pending loot service for overflow handling via Redis"
```

---

## Task 10: API Routes — Sell Endpoints

**Files:**
- Modify: `apps/api/src/routes/inventory.ts`

**Step 1: Add sell route**

Add `POST /inventory/sell` endpoint:

```typescript
router.post('/sell', requireAuth, async (req, res, next) => {
  try {
    const { itemId, quantity } = req.body;
    // Validate player is in town zone
    const player = await prisma.player.findUnique({
      where: { id: req.playerId },
      include: { currentZone: true },
    });
    if (!player?.currentZone?.isTown) {
      throw new AppError(400, 'Must be in a town to sell items', 'NOT_IN_TOWN');
    }
    const result = await sellItem(req.playerId, itemId, quantity);
    res.json(result);
  } catch (err) { next(err); }
});
```

**Step 2: Add bulk sell route**

Add `POST /inventory/sell/bulk`:

```typescript
router.post('/sell/bulk', requireAuth, async (req, res, next) => {
  try {
    const { itemIds } = req.body;
    // Validate town zone
    const result = await sellBulk(req.playerId, itemIds);
    res.json(result);
  } catch (err) { next(err); }
});
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/
git commit -m "feat: add sell and bulk sell API endpoints"
```

---

## Task 11: API Routes — Stash Endpoints

**Files:**
- Modify: `apps/api/src/routes/inventory.ts`

**Step 1: Add stash routes**

```typescript
router.get('/stash', requireAuth, async (req, res, next) => {
  try {
    const items = await listStash(req.playerId);
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/stash/deposit', requireAuth, async (req, res, next) => {
  try {
    const { itemId, quantity } = req.body;
    // Validate town
    await depositItem(req.playerId, itemId, quantity);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/stash/withdraw', requireAuth, async (req, res, next) => {
  try {
    const { itemId, quantity } = req.body;
    // Validate town + capacity
    await withdrawItem(req.playerId, itemId, quantity);
    res.json({ success: true });
  } catch (err) { next(err); }
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/
git commit -m "feat: add stash deposit, withdraw, and list API endpoints"
```

---

## Task 12: API Routes — Loot Claim Endpoint

**Files:**
- Modify: `apps/api/src/routes/inventory.ts`

**Step 1: Add loot claim route**

```typescript
router.post('/loot/claim', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, selectedIndices } = req.body;
    await claimPendingLoot(req.playerId, sessionId, selectedIndices);
    res.json({ success: true });
  } catch (err) { next(err); }
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/
git commit -m "feat: add loot claim endpoint for overflow handling"
```

---

## Task 13: Modify GET /inventory — Add Capacity Info

**Files:**
- Modify: `apps/api/src/routes/inventory.ts`

**Step 1: Update inventory GET to include capacity and usedSlots**

Modify the `GET /` handler to return capacity metadata. Also filter out stashed items from the main inventory response:

```typescript
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [items, capacity, usedSlots] = await Promise.all([
      prisma.item.findMany({
        where: { ownerId: req.playerId, inStash: false },
        include: { template: true, equipment: true },
      }),
      getPlayerCapacity(req.playerId),
      getUsedSlots(req.playerId),
    ]);

    // ... existing mapping logic ...

    res.json({ items: mappedItems, capacity, usedSlots });
  } catch (err) { next(err); }
});
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/inventory.ts
git commit -m "feat: add capacity and usedSlots to inventory GET response"
```

---

## Task 14: Crafting Capacity Check

**Files:**
- Modify: `apps/api/src/routes/crafting/craft.ts`

**Step 1: Add capacity check before crafting**

Before the turn-spending step in the craft endpoint, add:

```typescript
// Check inventory capacity
const resultTemplate = await prisma.itemTemplate.findUnique({ where: { id: recipe.resultTemplateId } });
if (resultTemplate && !resultTemplate.stackable) {
  const [usedSlots, capacity] = await Promise.all([
    getUsedSlots(playerId),
    getPlayerCapacity(playerId),
  ]);
  const resultCount = 1; // non-stackable always creates 1 item
  if (usedSlots + resultCount > capacity) {
    throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
  }
} else if (resultTemplate?.stackable) {
  // Stackable — check if there's already a stack (no new slot needed) or if a new slot is needed
  const existingStack = await prisma.item.findFirst({
    where: { ownerId: playerId, templateId: recipe.resultTemplateId, inStash: false },
  });
  if (!existingStack) {
    const [usedSlots, capacity] = await Promise.all([
      getUsedSlots(playerId),
      getPlayerCapacity(playerId),
    ]);
    if (usedSlots + 1 > capacity) {
      throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/routes/crafting/
git commit -m "feat: add backpack capacity check before crafting"
```

---

## Task 15: Loot Overflow Integration — Combat

Modify combat loot granting to check capacity and return pending loot when full.

**Files:**
- Modify: `apps/api/src/services/lootService.ts`
- Modify: `apps/api/src/routes/combat/start.ts`

**Step 1: Add capacity-aware loot granting to lootService**

Add a new function `grantLootWithCapacity()` that:
1. Computes available slots
2. Grants items up to capacity
3. Returns remaining items as `pendingLoot`
4. If overflow exists, stores in Redis via `storePendingLoot()`

**Step 2: Update combat route**

In `apps/api/src/routes/combat/start.ts`, after combat resolution, use the capacity-aware loot function. Include `pendingLoot` session ID in the response if overflow occurred.

**Step 3: Commit**

```bash
git add apps/api/src/services/lootService.ts apps/api/src/routes/combat/
git commit -m "feat: add loot overflow handling to combat"
```

---

## Task 16: Loot Overflow Integration — Exploration & Gathering

Similar overflow handling for exploration chest rewards and gathering yields.

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/gathering.ts`

**Step 1: Update exploration to check capacity for chest rewards**

**Step 2: Update gathering to check capacity before adding yields**

**Step 3: Commit**

```bash
git add apps/api/src/routes/exploration/ apps/api/src/routes/gathering.ts
git commit -m "feat: add loot overflow handling to exploration and gathering"
```

---

## Task 17: Equipment Service — Backpack Slot

Ensure the backpack slot is initialized for existing and new players.

**Files:**
- Modify: `apps/api/src/services/equipmentService.ts`

**Step 1: Verify ensureEquipmentSlots handles new slot**

The `ensureEquipmentSlots()` function already uses `ALL_EQUIPMENT_SLOTS` and creates missing slots. Since we added `'backpack'` to `ALL_EQUIPMENT_SLOTS` in Task 2, this should automatically work — existing players will get the slot created on their next equipment check.

Verify: the `equipItem()` function's item type check (`itemType !== 'weapon' && itemType !== 'armor'`) will accept backpacks since they're `itemType: 'armor'`. The slot validation (`item.template.slot !== slot`) will correctly match `'backpack'`.

The `getEquipmentStats()` function will include backpack stats in the sum, but since backpacks only have `inventorySlots` (not a combat stat), the aggregation will harmlessly skip it (no match in the explicit stat checks).

**Step 2: Update getEquipmentStats to extract inventorySlots**

Add `inventorySlots: number` to the `EquipmentStats` interface and accumulate it in the loop. This makes it available for capacity calculation without a separate query.

**Step 3: Commit**

```bash
git add apps/api/src/services/equipmentService.ts
git commit -m "feat: add backpack slot support to equipment service"
```

---

## Task 18: Frontend — Inventory Capacity Display

Update the inventory screen to show real capacity.

**Files:**
- Modify: `apps/web/src/lib/api.ts` (or `api/items.ts`)
- Modify: `apps/web/src/components/screens/Inventory.tsx`

**Step 1: Update API types**

Add `capacity` and `usedSlots` to the inventory fetch response type.

**Step 2: Update Inventory component**

Replace the hardcoded `/24` display with `usedSlots / capacity` from the API response. Update the grid to show `capacity` number of slots (with filled/empty visual distinction).

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat: show real inventory capacity in UI"
```

---

## Task 19: Frontend — Sell Buttons

Add sell functionality to inventory items.

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/screens/Inventory.tsx`

**Step 1: Add sell API functions**

```typescript
export async function sellItem(itemId: string, quantity?: number) {
  return fetchApi<{ goldEarned: number; newGold: number }>('/api/v1/inventory/sell', {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity }),
  });
}

export async function sellBulk(itemIds: string[]) {
  return fetchApi<{ totalGoldEarned: number; newGold: number; soldCount: number }>('/api/v1/inventory/sell/bulk', {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
}
```

**Step 2: Add sell button to item actions**

Show "Sell" button on items when in a town zone. Show sell price preview. Add "Sell All Junk" button that sends all common non-equipment items.

**Step 3: Add gold display**

Show player gold in the inventory header or game status bar.

**Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat: add sell buttons and gold display to inventory UI"
```

---

## Task 20: Frontend — Stash Tab

Add stash UI accessible from towns.

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/screens/Inventory.tsx`

**Step 1: Add stash API functions**

```typescript
export async function getStash() { /* GET /inventory/stash */ }
export async function depositItem(itemId: string, quantity?: number) { /* POST /inventory/stash/deposit */ }
export async function withdrawItem(itemId: string, quantity?: number) { /* POST /inventory/stash/withdraw */ }
```

**Step 2: Add Stash tab to Inventory screen**

When in town, show a "Stash" tab alongside the regular backpack view. Show deposit/withdraw buttons. Stash tab fetches from `/inventory/stash`.

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat: add town stash tab to inventory UI"
```

---

## Task 21: Frontend — Loot Picker Modal

Add modal for picking items when backpack overflows.

**Files:**
- Create: `apps/web/src/components/common/LootPicker.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create LootPicker component**

Modal that shows dropped loot items with checkboxes. Shows current available space. Confirm button calls `/inventory/loot/claim` with selected indices.

**Step 2: Integrate with game controller**

When combat/exploration/gathering responses include `pendingLoot`, show the LootPicker modal. After claiming, refresh inventory.

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat: add loot picker modal for inventory overflow"
```

---

## Task 22: Frontend — Backpack Equipment Slot

Add the 12th equipment slot to the equipment panel.

**Files:**
- Modify: `apps/web/src/components/screens/Inventory.tsx`

**Step 1: Update equipment panel**

The equipment panel renders from `ALL_EQUIPMENT_SLOTS`. Since we added `'backpack'` to that array, it should appear automatically. Verify the slot icon/label displays correctly. May need to add a backpack icon.

**Step 2: Commit**

```bash
git add apps/web/
git commit -m "feat: add backpack equipment slot to UI"
```

---

## Task 23: Typecheck & Integration Test

**Step 1: Run full typecheck**

Run: `npm run typecheck`

Fix any TypeScript errors.

**Step 2: Run all tests**

Run: `npm run test`

Fix any test failures.

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Login, check inventory shows capacity
3. Travel to town, verify stash tab appears
4. Verify sell button appears on items in town
5. Craft a backpack (if tailoring level sufficient)
6. Equip backpack, verify capacity increases

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve typecheck and test issues for inventory system"
```
