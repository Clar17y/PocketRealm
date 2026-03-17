# Selective Refresh & Rate Limit UX — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate post-action `loadAll()` calls (11 GET requests) by enriching API responses with `stateUpdates` deltas, add screen-aware polling, and surface 429 rate-limit errors to users.

**Architecture:** API action routes return a `stateUpdates` object containing inventory deltas, skill/HP/resource snapshots, and gold changes. A new frontend `applyStateUpdates()` utility merges these deltas into React state. The 10s polling interval becomes screen-aware and skips HP/resources at max. `fetchApi` detects 429 responses and emits a custom event consumed by a toast component.

**Tech Stack:** TypeScript, Express routes, Prisma queries, React state management, Zod validation, Vitest, existing `useToastQueue` hook.

**Spec:** `docs/superpowers/specs/2026-03-16-selective-refresh-design.md`

---

## Chunk 1: Shared Types + API Helper + Frontend Utility

### Task 1: Define StateUpdates Types in Shared Package

**Files:**
- Create: `packages/shared/src/types/stateUpdates.types.ts`
- Modify: `packages/shared/src/index.ts`

The `InventoryItemDTO` in `stateUpdates` must match the shape the frontend already uses from `apps/web/src/lib/api/items.ts:22-34` (`InventoryItem` with nested `template`). We reuse that shape rather than inventing a new one.

- [ ] **Step 1: Create stateUpdates type file**

```ts
// packages/shared/src/types/stateUpdates.types.ts
import type { HpState } from './hp.types';

/** Mirrors the frontend InventoryItem shape (apps/web/src/lib/api/items.ts:22-34) */
export interface InventoryItemDTO {
  id: string;
  templateId: string;
  ownerId: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  currentDurability: number | null;
  maxDurability: number | null;
  quantity: number;
  bonusStats: Record<string, number> | null;
  createdAt: string;
  template: {
    id: string;
    name: string;
    itemType: string;
    weightClass: 'heavy' | 'medium' | 'light' | null;
    slot: string | null;
    tier: number;
    baseStats: Record<string, unknown>;
    requiredSkill: string | null;
    requiredLevel: number;
    maxDurability: number;
    stackable: boolean;
    sellPrice: number | null;
  };
  equippedSlot: string | null;
}

export interface ResourceStateDTO {
  current: number;
  max: number;
  regenPerSecond: number;
  lastRegenAt: string;
}

export interface SkillStateDTO {
  id: string;
  skillType: string;
  level: number;
  xp: number;
  dailyXpGained: number;
}

export interface BuffStateDTO {
  id: string;
  buffType: string;
  remainingRounds: number;
  value: number;
}

export interface StateUpdates {
  inventoryAdded?: InventoryItemDTO[];
  inventoryRemoved?: string[];
  inventoryUpdated?: InventoryItemDTO[];
  equipment?: Record<string, InventoryItemDTO | null>;
  skills?: SkillStateDTO[];
  resources?: { stamina: ResourceStateDTO; mana: ResourceStateDTO };
  hp?: HpState;
  gold?: number;
  buffs?: BuffStateDTO[];
  inventoryCapacity?: number;
  inventoryUsedSlots?: number;
  characterProgression?: {
    characterXp: number;
    characterLevel: number;
    attributePoints: number;
  };
}
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts` after the existing type exports (around line 19):

```ts
export * from './types/stateUpdates.types';
```

- [ ] **Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/stateUpdates.types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add StateUpdates type definitions for selective refresh (#176)"
```

---

### Task 2: Create API stateUpdate Helpers

**Files:**
- Create: `apps/api/src/services/stateUpdateHelpers.ts`
- Create: `apps/api/src/services/stateUpdateHelpers.test.ts`

**Reference:** The existing inventory GET route (`apps/api/src/routes/inventory.ts:30-66`) queries `prisma.item.findMany({ include: { template: true } })` and spreads the Prisma model directly. Our `toInventoryItemDTO` must produce the same shape. The `getOwnedItem` helper (`apps/api/src/utils/routeHelpers.ts:145-179`) also uses `include: { template: true }`.

- [ ] **Step 1: Write failing tests for toInventoryItemDTO**

```ts
// apps/api/src/services/stateUpdateHelpers.test.ts
import { describe, it, expect } from 'vitest';
import { toInventoryItemDTO } from './stateUpdateHelpers.js';

describe('toInventoryItemDTO', () => {
  const mockItem = {
    id: 'item-1',
    templateId: 'tpl-1',
    ownerId: 'player-1',
    rarity: 'uncommon' as const,
    currentDurability: 80,
    maxDurability: 100,
    quantity: 1,
    bonusStats: { attack: 5 },
    createdAt: new Date('2026-01-01'),
    inStash: false,
    template: {
      id: 'tpl-1',
      name: 'Iron Sword',
      itemType: 'weapon',
      weightClass: 'medium' as const,
      slot: 'mainHand',
      tier: 1,
      baseStats: { attack: 10 },
      requiredSkill: 'melee',
      requiredLevel: 1,
      maxDurability: 100,
      stackable: false,
      sellPrice: 50,
      // Extra Prisma fields that should be excluded:
      consumableEffect: null,
      resultTemplateId: null,
      setId: null,
      description: 'A sturdy blade',
      subtype: null,
    },
  };

  it('serialises a Prisma item+template to the InventoryItemDTO shape', () => {
    const dto = toInventoryItemDTO(mockItem);
    expect(dto).toEqual({
      id: 'item-1',
      templateId: 'tpl-1',
      ownerId: 'player-1',
      rarity: 'uncommon',
      currentDurability: 80,
      maxDurability: 100,
      quantity: 1,
      bonusStats: { attack: 5 },
      createdAt: '2026-01-01T00:00:00.000Z',
      template: {
        id: 'tpl-1',
        name: 'Iron Sword',
        itemType: 'weapon',
        weightClass: 'medium',
        slot: 'mainHand',
        tier: 1,
        baseStats: { attack: 10 },
        requiredSkill: 'melee',
        requiredLevel: 1,
        maxDurability: 100,
        stackable: false,
        sellPrice: 50,
      },
      equippedSlot: null,
    });
  });

  it('converts Date createdAt to ISO string', () => {
    const dto = toInventoryItemDTO(mockItem);
    expect(typeof dto.createdAt).toBe('string');
  });

  it('accepts optional equippedSlot', () => {
    const dto = toInventoryItemDTO(mockItem, 'mainHand');
    expect(dto.equippedSlot).toBe('mainHand');
  });

  it('handles null bonusStats', () => {
    const dto = toInventoryItemDTO({ ...mockItem, bonusStats: null });
    expect(dto.bonusStats).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/stateUpdateHelpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement toInventoryItemDTO and buildStateUpdates**

```ts
// apps/api/src/services/stateUpdateHelpers.ts
import { prisma } from '@pocketrealm/database';
import type { InventoryItemDTO, SkillStateDTO, StateUpdates } from '@pocketrealm/shared';
import type { HpState } from '@pocketrealm/shared';
import { getHpState } from './hpService.js';
import { getResourceState } from './resourceService.js';
import { getInventoryState } from './inventoryService.js';

/**
 * Prisma item with template join — the shape returned by
 * `prisma.item.findMany({ include: { template: true } })`.
 */
type PrismaItemWithTemplate = Awaited<
  ReturnType<typeof prisma.item.findFirst<{ include: { template: true } }>>
> & {};

export function toInventoryItemDTO(
  item: PrismaItemWithTemplate,
  equippedSlot?: string | null,
): InventoryItemDTO {
  const t = item.template;
  return {
    id: item.id,
    templateId: item.templateId,
    ownerId: item.ownerId,
    rarity: item.rarity as InventoryItemDTO['rarity'],
    currentDurability: item.currentDurability,
    maxDurability: item.maxDurability,
    quantity: item.quantity,
    bonusStats: item.bonusStats as Record<string, number> | null,
    createdAt: item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : String(item.createdAt),
    template: {
      id: t.id,
      name: t.name,
      itemType: t.itemType,
      weightClass: t.weightClass as 'heavy' | 'medium' | 'light' | null,
      slot: t.slot,
      tier: t.tier,
      baseStats: t.baseStats as Record<string, unknown>,
      requiredSkill: t.requiredSkill,
      requiredLevel: t.requiredLevel,
      maxDurability: t.maxDurability,
      stackable: t.stackable,
      sellPrice: t.sellPrice,
    },
    equippedSlot: equippedSlot ?? null,
  };
}

export function toSkillStateDTO(skill: {
  id: string;
  skillType: string;
  level: number;
  xp: bigint | number;
  dailyXpGained: number;
}): SkillStateDTO {
  return {
    id: skill.id,
    skillType: skill.skillType,
    level: skill.level,
    xp: typeof skill.xp === 'bigint' ? Number(skill.xp) : skill.xp,
    dailyXpGained: skill.dailyXpGained,
  };
}

/** Fetch items by ID with template join, return as DTOs. */
export async function fetchItemDTOs(
  itemIds: string[],
  equippedSlotMap?: Map<string, string>,
): Promise<InventoryItemDTO[]> {
  if (itemIds.length === 0) return [];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    include: { template: true },
  });
  return items.map((item) =>
    toInventoryItemDTO(item, equippedSlotMap?.get(item.id)),
  );
}

export async function fetchSkillDTOs(playerId: string): Promise<SkillStateDTO[]> {
  const skills = await prisma.playerSkill.findMany({ where: { playerId } });
  return skills.map(toSkillStateDTO);
}

export async function fetchCharacterProgression(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { characterXp: true, characterLevel: true, attributePoints: true },
  });
  if (!player) return undefined;
  return {
    characterXp: player.characterXp,
    characterLevel: player.characterLevel,
    attributePoints: player.attributePoints,
  };
}

export async function fetchHpState(playerId: string): Promise<HpState> {
  return getHpState(playerId);
}

export async function fetchResourceState(playerId: string) {
  return getResourceState(playerId);
}

export async function fetchInventoryMeta(playerId: string) {
  const state = await getInventoryState(playerId);
  return {
    inventoryCapacity: state.capacity,
    inventoryUsedSlots: state.usedSlots,
  };
}

export async function fetchGold(playerId: string): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { gold: true },
  });
  return player?.gold ?? 0;
}

/**
 * Build a partial StateUpdates by fetching only the requested fields.
 * Use this as a convenience — for inventory deltas, callers should
 * build inventoryAdded/Removed/Updated directly from transaction results.
 */
export async function buildStateUpdates(
  playerId: string,
  fields: Array<keyof StateUpdates>,
): Promise<Partial<StateUpdates>> {
  const updates: Partial<StateUpdates> = {};
  const promises: Promise<void>[] = [];

  if (fields.includes('skills')) {
    promises.push(
      fetchSkillDTOs(playerId).then((s) => { updates.skills = s; }),
    );
  }
  if (fields.includes('hp')) {
    promises.push(
      fetchHpState(playerId).then((h) => { updates.hp = h; }),
    );
  }
  if (fields.includes('resources')) {
    promises.push(
      fetchResourceState(playerId).then((r) => {
        updates.resources = {
          stamina: r.stamina,
          mana: r.mana,
        };
      }),
    );
  }
  if (fields.includes('characterProgression')) {
    promises.push(
      fetchCharacterProgression(playerId).then((cp) => {
        if (cp) updates.characterProgression = cp;
      }),
    );
  }
  if (fields.includes('gold')) {
    promises.push(
      fetchGold(playerId).then((g) => { updates.gold = g; }),
    );
  }
  if (fields.includes('buffs')) {
    promises.push(
      prisma.playerBuff.findMany({
        where: { playerId, expiresAt: { gt: new Date() } },
      }).then((buffs) => {
        updates.buffs = buffs.map((b) => ({
          id: b.id,
          buffType: b.buffType,
          remainingRounds: b.remainingRounds,
          value: b.value,
        }));
      }),
    );
  }
  if (fields.includes('inventoryUsedSlots') || fields.includes('inventoryCapacity')) {
    promises.push(
      fetchInventoryMeta(playerId).then((meta) => {
        if (fields.includes('inventoryUsedSlots')) updates.inventoryUsedSlots = meta.inventoryUsedSlots;
        if (fields.includes('inventoryCapacity')) updates.inventoryCapacity = meta.inventoryCapacity;
      }),
    );
  }

  await Promise.all(promises);
  return updates;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/stateUpdateHelpers.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Build API to verify no type errors**

Run: `npm run build:api`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/stateUpdateHelpers.ts apps/api/src/services/stateUpdateHelpers.test.ts
git commit -m "feat(api): add stateUpdate helper functions for selective refresh (#176)"
```

---

### Task 3: Create Frontend applyStateUpdates Utility

**Files:**
- Create: `apps/web/src/app/game/applyStateUpdates.ts`
- Create: `apps/web/src/app/game/applyStateUpdates.test.ts`

**Reference:** The frontend inventory state type is defined inline at `apps/web/src/app/game/useGameController.ts:173-195`. The `InventoryItem` type from `apps/web/src/lib/api/items.ts:22-34` matches this. `StateUpdates` comes from `@pocketrealm/shared`.

- [ ] **Step 1: Write failing tests for applyStateUpdates**

```ts
// apps/web/src/app/game/applyStateUpdates.test.ts
import { describe, it, expect, vi } from 'vitest';
import { applyStateUpdates, type StateSetters } from './applyStateUpdates';
import type { StateUpdates } from '@pocketrealm/shared';

function makeSetters(): StateSetters {
  return {
    setInventory: vi.fn((updater) => {
      // Simulate React's functional updater pattern
      if (typeof updater === 'function') return updater([]);
      return updater;
    }),
    setInventoryCapacity: vi.fn(),
    setInventoryUsedSlots: vi.fn(),
    setEquipment: vi.fn(),
    setSkills: vi.fn(),
    setHpState: vi.fn(),
    setStaminaState: vi.fn(),
    setManaState: vi.fn(),
    setGold: vi.fn(),
    setActiveBuffs: vi.fn(),
    setCharacterProgression: vi.fn(),
  };
}

const mockItem = {
  id: 'item-1',
  templateId: 'tpl-1',
  ownerId: 'player-1',
  rarity: 'common' as const,
  currentDurability: null,
  maxDurability: null,
  quantity: 3,
  bonusStats: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  template: {
    id: 'tpl-1', name: 'Iron Ore', itemType: 'resource',
    weightClass: null, slot: null, tier: 1,
    baseStats: {}, requiredSkill: 'mining', requiredLevel: 1,
    maxDurability: 0, stackable: true, sellPrice: 5,
  },
  equippedSlot: null,
};

describe('applyStateUpdates', () => {
  it('does nothing when updates is undefined', () => {
    const setters = makeSetters();
    applyStateUpdates(undefined, setters);
    expect(setters.setInventory).not.toHaveBeenCalled();
    expect(setters.setGold).not.toHaveBeenCalled();
  });

  it('adds inventory items', () => {
    const setters = makeSetters();
    applyStateUpdates({ inventoryAdded: [mockItem] }, setters);
    expect(setters.setInventory).toHaveBeenCalled();
  });

  it('removes inventory items by ID', () => {
    const setters = makeSetters();
    const existingItems = [mockItem, { ...mockItem, id: 'item-2' }];
    // Override setInventory to test the updater function
    setters.setInventory = vi.fn((updater: any) => {
      const result = typeof updater === 'function' ? updater(existingItems) : updater;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item-2');
      return result;
    });
    applyStateUpdates({ inventoryRemoved: ['item-1'] }, setters);
    expect(setters.setInventory).toHaveBeenCalled();
  });

  it('updates existing inventory items by ID', () => {
    const setters = makeSetters();
    const existingItems = [mockItem];
    const updated = { ...mockItem, quantity: 1 };
    setters.setInventory = vi.fn((updater: any) => {
      const result = typeof updater === 'function' ? updater(existingItems) : updater;
      expect(result[0].quantity).toBe(1);
      return result;
    });
    applyStateUpdates({ inventoryUpdated: [updated] }, setters);
    expect(setters.setInventory).toHaveBeenCalled();
  });

  it('applies combined add + remove + update in correct order', () => {
    const setters = makeSetters();
    const item2 = { ...mockItem, id: 'item-2', quantity: 5 };
    const existingItems = [mockItem, item2];
    const updatedItem2 = { ...item2, quantity: 2 };
    const newItem = { ...mockItem, id: 'item-3' };

    setters.setInventory = vi.fn((updater: any) => {
      const result = typeof updater === 'function' ? updater(existingItems) : updater;
      // item-1 removed, item-2 updated to qty 2, item-3 added
      expect(result).toHaveLength(2);
      expect(result.find((i: any) => i.id === 'item-1')).toBeUndefined();
      expect(result.find((i: any) => i.id === 'item-2')?.quantity).toBe(2);
      expect(result.find((i: any) => i.id === 'item-3')).toBeDefined();
      return result;
    });

    applyStateUpdates({
      inventoryRemoved: ['item-1'],
      inventoryUpdated: [updatedItem2],
      inventoryAdded: [newItem],
    }, setters);
  });

  it('sets gold when provided', () => {
    const setters = makeSetters();
    applyStateUpdates({ gold: 500 }, setters);
    expect(setters.setGold).toHaveBeenCalledWith(500);
  });

  it('sets HP when provided', () => {
    const setters = makeSetters();
    const hp = { currentHp: 80, maxHp: 100, regenPerSecond: 1, lastHpRegenAt: '', isRecovering: false, recoveryCost: null };
    applyStateUpdates({ hp }, setters);
    expect(setters.setHpState).toHaveBeenCalledWith(hp);
  });

  it('sets resources when provided', () => {
    const setters = makeSetters();
    const resources = {
      stamina: { current: 50, max: 100, regenPerSecond: 1, lastRegenAt: '' },
      mana: { current: 30, max: 80, regenPerSecond: 0.5, lastRegenAt: '' },
    };
    applyStateUpdates({ resources }, setters);
    expect(setters.setStaminaState).toHaveBeenCalledWith(resources.stamina);
    expect(setters.setManaState).toHaveBeenCalledWith(resources.mana);
  });

  it('sets skills when provided', () => {
    const setters = makeSetters();
    const skills = [{ id: 's1', skillType: 'mining', level: 5, xp: 1000, dailyXpGained: 200 }];
    applyStateUpdates({ skills }, setters);
    expect(setters.setSkills).toHaveBeenCalledWith(skills);
  });

  it('sets characterProgression when provided', () => {
    const setters = makeSetters();
    const cp = { characterXp: 5000, characterLevel: 10, attributePoints: 3 };
    applyStateUpdates({ characterProgression: cp }, setters);
    expect(setters.setCharacterProgression).toHaveBeenCalledWith(cp);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/app/game/applyStateUpdates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement applyStateUpdates**

```ts
// apps/web/src/app/game/applyStateUpdates.ts
import type { StateUpdates, InventoryItemDTO, HpState } from '@pocketrealm/shared';

export interface StateSetters {
  setInventory: (updater: (prev: InventoryItemDTO[]) => InventoryItemDTO[]) => void;
  setInventoryCapacity: (n: number) => void;
  setInventoryUsedSlots: (n: number) => void;
  setEquipment: (eq: Record<string, InventoryItemDTO | null>) => void;
  setSkills: (skills: StateUpdates['skills']) => void;
  setHpState: (hp: HpState) => void;
  setStaminaState: (s: NonNullable<StateUpdates['resources']>['stamina']) => void;
  setManaState: (m: NonNullable<StateUpdates['resources']>['mana']) => void;
  setGold: (g: number) => void;
  setActiveBuffs: (b: NonNullable<StateUpdates['buffs']>) => void;
  setCharacterProgression: (cp: NonNullable<StateUpdates['characterProgression']>) => void;
}

export function applyStateUpdates(
  updates: StateUpdates | undefined,
  setters: StateSetters,
): void {
  if (!updates) return;

  if (updates.inventoryAdded || updates.inventoryRemoved || updates.inventoryUpdated) {
    setters.setInventory((prev) => {
      let next = [...prev];
      if (updates.inventoryRemoved) {
        const removeSet = new Set(updates.inventoryRemoved);
        next = next.filter((item) => !removeSet.has(item.id));
      }
      if (updates.inventoryUpdated) {
        const updateMap = new Map(updates.inventoryUpdated.map((i) => [i.id, i]));
        next = next.map((item) => updateMap.get(item.id) ?? item);
      }
      if (updates.inventoryAdded) {
        next.push(...updates.inventoryAdded);
      }
      return next;
    });
  }

  if (updates.equipment !== undefined) setters.setEquipment(updates.equipment);
  if (updates.skills !== undefined) setters.setSkills(updates.skills);
  if (updates.hp !== undefined) setters.setHpState(updates.hp);
  if (updates.resources !== undefined) {
    setters.setStaminaState(updates.resources.stamina);
    setters.setManaState(updates.resources.mana);
  }
  if (updates.gold !== undefined) setters.setGold(updates.gold);
  if (updates.buffs !== undefined) setters.setActiveBuffs(updates.buffs);
  if (updates.inventoryCapacity !== undefined) setters.setInventoryCapacity(updates.inventoryCapacity);
  if (updates.inventoryUsedSlots !== undefined) setters.setInventoryUsedSlots(updates.inventoryUsedSlots);
  if (updates.characterProgression !== undefined) setters.setCharacterProgression(updates.characterProgression);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/app/game/applyStateUpdates.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/game/applyStateUpdates.ts apps/web/src/app/game/applyStateUpdates.test.ts
git commit -m "feat(web): add applyStateUpdates utility for inventory delta merging (#176)"
```

---

## Chunk 2: API Route Enrichment — Crafting, Salvage, Gathering

### Task 4: Enrich POST /crafting/craft with stateUpdates

**Files:**
- Modify: `apps/api/src/routes/crafting/craft.ts:312-326` (the `res.json()` call)

**Context:** The craft route already has `craftedItemIds` (line 300) from the transaction. After `res.json()`, we need to:
1. Fetch the newly created items by ID as DTOs
2. Determine which material items were fully consumed (deleted) vs partially consumed (quantity decreased)
3. Fetch updated skills and character progression

The craft route runs a Prisma transaction that creates items and consumes materials. After the transaction, the crafted item IDs are available. We need to trace the material consumption to build inventory deltas.

**Important:** Read the full craft route to understand the transaction structure before modifying. The transaction at `apps/api/src/routes/crafting/craft.ts` creates items via `craftingService` and consumes materials. Check how materials are consumed — look for `consumeItemsByTemplate` in `apps/api/src/services/inventoryService.ts`.

- [ ] **Step 1: Read the craft route and material consumption logic**

Read `apps/api/src/routes/crafting/craft.ts` fully to understand the transaction flow.
Read `apps/api/src/services/inventoryService.ts` — specifically `consumeItemsByTemplate` to understand what item IDs are consumed.

- [ ] **Step 2: Modify consumeItemsByTemplate to return consumed item info**

The `consumeItemsByTemplate` function needs to return which items were removed (quantity hit 0 and deleted) and which were decremented. Currently it likely just consumes without returning this info. Modify it to return:

```ts
interface ConsumedItemResult {
  fullyConsumedIds: string[];           // items deleted entirely
  partiallyConsumedIds: string[];       // items with decreased quantity
}
```

This return value bubbles up through the craft transaction so the route can build `inventoryRemoved` and `inventoryUpdated`.

- [ ] **Step 3: After the res.json() call site in craft.ts, build stateUpdates**

Add stateUpdates to the existing `res.json()` call at line 312. The pattern:

```ts
// After existing transaction, before res.json():
const [addedItems, updatedItems, skills, inventoryMeta, charProg] = await Promise.all([
  fetchItemDTOs(craftedItemIds),
  fetchItemDTOs(consumedResult.partiallyConsumedIds),
  fetchSkillDTOs(playerId),
  fetchInventoryMeta(playerId),
  fetchCharacterProgression(playerId),
]);

res.json({
  // ...existing response fields...
  stateUpdates: {
    inventoryAdded: addedItems,
    inventoryRemoved: consumedResult.fullyConsumedIds,
    inventoryUpdated: updatedItems,
    skills,
    inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
    characterProgression: charProg,
  },
});
```

- [ ] **Step 4: Build and run existing tests to verify no regressions**

Run: `npm run build:api && npm run test:api`
Expected: All existing tests still pass. The response shape is additive — existing fields unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/crafting/craft.ts apps/api/src/services/inventoryService.ts
git commit -m "feat(api): enrich craft response with stateUpdates (#176)"
```

---

### Task 5: Enrich POST /crafting/salvage and /salvage/batch with stateUpdates

**Files:**
- Modify: `apps/api/src/routes/crafting/salvage.ts`

**Context:** Salvage removes the target item and creates material items. The route already returns `returnedMaterials` with names and quantities. We need to add `stateUpdates` with:
- `inventoryRemoved`: the salvaged item ID(s)
- `inventoryAdded`: newly created material items as DTOs (or `inventoryUpdated` if materials stack onto existing)
- `inventoryUsedSlots`

- [ ] **Step 1: Read the salvage route to understand the flow**

Read `apps/api/src/routes/crafting/salvage.ts` fully.

- [ ] **Step 2: Modify salvage to track created/updated item IDs**

The salvage service likely calls `addStackableItem` which either creates new items or increments existing stacks. Modify to capture which item IDs were created vs updated.

- [ ] **Step 3: Add stateUpdates to both salvage and salvage/batch responses**

Follow the same pattern as craft: fetch item DTOs for created/updated items, include `inventoryRemoved` for salvaged item(s).

- [ ] **Step 4: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/crafting/salvage.ts
git commit -m "feat(api): enrich salvage response with stateUpdates (#176)"
```

---

### Task 6: Enrich POST /gathering/mine with stateUpdates

**Files:**
- Modify: `apps/api/src/routes/gathering.ts` (the mine endpoint response)

**Context:** Gathering creates resource items (may stack) and optionally gem crits. The response already returns yield info. We need:
- `inventoryAdded`/`inventoryUpdated`: gathered items + gems
- `skills`, `characterProgression`, `resources`, `inventoryUsedSlots`

- [ ] **Step 1: Read the gathering mine route**

Read `apps/api/src/routes/gathering.ts` — find the POST mine handler and understand item creation.

- [ ] **Step 2: Track item IDs from gathering transaction**

The gathering service creates items via `addStackableItem` or similar. Capture created/updated IDs.

- [ ] **Step 3: Add stateUpdates to mine response**

```ts
stateUpdates: {
  inventoryAdded: newItemDTOs,
  inventoryUpdated: updatedStackDTOs,
  skills,
  characterProgression: charProg,
  resources,
  inventoryUsedSlots,
}
```

- [ ] **Step 4: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/gathering.ts
git commit -m "feat(api): enrich gathering response with stateUpdates (#176)"
```

---

## Chunk 3: API Route Enrichment — Equipment, Inventory, Combat

### Task 7: Enrich POST /equipment/equip and /unequip with stateUpdates

**Files:**
- Modify: `apps/api/src/routes/equipment.ts:44,62`

**Context:** Currently returns `{ success: true }`. Needs to return full `equipment` map and inventory deltas.

- [ ] **Step 1: Read the equipment route**

Read `apps/api/src/routes/equipment.ts` — understand the equip/unequip flow and what queries are available.

- [ ] **Step 2: Add stateUpdates to equip response**

After equipping, query the full equipment map (all slots) and build `stateUpdates`:
- `equipment`: full slot→item map
- `inventoryRemoved`: equipped item ID
- `inventoryUsedSlots`

If equipping swaps an item (slot was occupied), also include `inventoryAdded` for the unequipped item.

- [ ] **Step 3: Add stateUpdates to unequip response**

- `equipment`: full slot→item map
- `inventoryAdded`: unequipped item DTO
- `inventoryUsedSlots`

- [ ] **Step 4: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/equipment.ts
git commit -m "feat(api): enrich equip/unequip responses with stateUpdates (#176)"
```

---

### Task 8: Enrich Inventory Routes (sell, destroy, use, repair)

**Files:**
- Modify: `apps/api/src/routes/inventory.ts` (multiple endpoints)

**Context:** Multiple inventory endpoints need stateUpdates:

| Endpoint | stateUpdates |
|----------|-------------|
| DELETE /:id (destroy) | `inventoryRemoved`, `inventoryUsedSlots` |
| POST /sell | `inventoryRemoved`, `gold`, `inventoryUsedSlots` |
| POST /sell/bulk | `inventoryRemoved`, `gold`, `inventoryUsedSlots` |
| POST /use | `inventoryRemoved` or `inventoryUpdated`, `hp`, `resources`, `buffs` |
| POST /repair | `inventoryUpdated` or `inventoryRemoved`, `gold` |
| POST /repair-equipped | `inventoryUpdated`, `inventoryRemoved`, `gold` |

- [ ] **Step 1: Read the inventory route file**

Read `apps/api/src/routes/inventory.ts` fully — understand each endpoint.

- [ ] **Step 2: Add stateUpdates to destroy endpoint**

The simplest case — just `inventoryRemoved: [itemId]` and `inventoryUsedSlots`.

- [ ] **Step 3: Add stateUpdates to sell and sell/bulk endpoints**

Include `inventoryRemoved` (sold item IDs), `gold` (new balance), `inventoryUsedSlots`.

- [ ] **Step 4: Add stateUpdates to use-item endpoint**

Use-item may consume 1 from a stack or remove entirely. May also affect HP, resources, buffs (potions).
Include appropriate fields based on the consumable effect.

- [ ] **Step 5: Add stateUpdates to repair and repair-equipped endpoints**

Repair may destroy items (too degraded). Include `inventoryUpdated` (repaired items with new durability) and `inventoryRemoved` (destroyed items), plus `gold` for repair cost.

- [ ] **Step 6: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/inventory.ts
git commit -m "feat(api): enrich inventory endpoints with stateUpdates (#176)"
```

---

### Task 9: Enrich POST /combat/start with stateUpdates

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts:609,987` (both response paths)

**Context:** Combat has two response paths — encounter site (line 609) and single mob (line 987). Both need:
- `hp`, `skills`, `resources`, `characterProgression`
- `inventoryUpdated` (durability changes to equipped items)
- `buffs` (may have expired during combat)

- [ ] **Step 1: Read the combat start route**

Read `apps/api/src/routes/combat/start.ts` — both response paths. Understand where durability changes are tracked.

- [ ] **Step 2: Add stateUpdates to single-mob combat response (line 987)**

After combat, fetch HP, skills, resources, character progression, buffs. For durability, the route already tracks `durabilityLost` — use those item IDs to fetch updated items.

- [ ] **Step 3: Add stateUpdates to encounter-site combat response (line 609)**

Same fields. Note encounter site combat may have multiple fight rounds, so durability changes accumulate.

- [ ] **Step 4: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat(api): enrich combat response with stateUpdates (#176)"
```

---

### Task 10: Enrich Remaining API Routes (exploration, travel, rest, stash, loot, buffs, PvP)

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/travel.ts` (or wherever travel POST lives)
- Modify: `apps/api/src/routes/hp.ts` (rest endpoint)
- Modify: `apps/api/src/routes/resources.ts` (rest endpoint)
- Modify: `apps/api/src/routes/inventory.ts` (stash deposit/withdraw and loot/claim)
- Modify: `apps/api/src/routes/buffs.ts` (or wherever buff activation lives)
- Modify: `apps/api/src/routes/pvp.ts` (challenge endpoint)

**Context:** These are simpler enrichments — most just need a subset of `buildStateUpdates()`. Split into sub-tasks for smaller commits.

#### Task 10a: Exploration + Travel + Rest

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/travel.ts`
- Modify: `apps/api/src/routes/hp.ts`
- Modify: `apps/api/src/routes/resources.ts`

- [ ] **Step 1: Read each route file**
- [ ] **Step 2: Add stateUpdates to exploration start**

`buildStateUpdates(playerId, ['hp', 'resources'])` after the transaction.

- [ ] **Step 3: Add stateUpdates to travel**

`buildStateUpdates(playerId, ['hp', 'resources'])`. The travel route already returns `turns` inline.

- [ ] **Step 4: Add stateUpdates to rest endpoints (HP and resources)**

`buildStateUpdates(playerId, ['hp', 'resources'])` after resting.

- [ ] **Step 5: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts apps/api/src/routes/travel.ts apps/api/src/routes/hp.ts apps/api/src/routes/resources.ts
git commit -m "feat(api): enrich exploration/travel/rest with stateUpdates (#176)"
```

#### Task 10b: Stash + Loot

**Files:**
- Modify: `apps/api/src/routes/stash.ts` (or wherever stash deposit/withdraw live — check with grep)
- Modify: `apps/api/src/routes/inventory.ts` (loot/claim endpoint at line ~302)

- [ ] **Step 1: Locate stash routes**

Grep for deposit/withdraw endpoints. The spec lists `apps/api/src/routes/stash.ts` — verify this exists.

- [ ] **Step 2: Add stateUpdates to stash deposit/deposit-batch**

`inventoryRemoved` (item IDs), `inventoryUsedSlots` via `fetchInventoryMeta`.

- [ ] **Step 3: Add stateUpdates to stash withdraw/withdraw-batch**

`inventoryAdded` (item DTOs via `fetchItemDTOs`), `inventoryUsedSlots`.

- [ ] **Step 4: Add stateUpdates to loot/claim**

`inventoryAdded` (claimed items as DTOs via `fetchItemDTOs`), `inventoryUsedSlots`.

- [ ] **Step 5: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/stash.ts apps/api/src/routes/inventory.ts
git commit -m "feat(api): enrich stash and loot endpoints with stateUpdates (#176)"
```

#### Task 10c: Buffs + PvP

**Files:**
- Modify: `apps/api/src/routes/buffs.ts` (or wherever buff activation lives — check with grep)
- Modify: `apps/api/src/routes/pvp.ts`

- [ ] **Step 1: Locate buff activation route**

Grep for buff activation endpoint. The spec lists `apps/api/src/routes/buffs.ts`.

- [ ] **Step 2: Add stateUpdates to buff activation**

Fetch `buffs` (full active buff list) plus inventory delta for consumed buff item (`inventoryRemoved` or `inventoryUpdated`).

- [ ] **Step 3: Add stateUpdates to PvP challenge**

`buildStateUpdates(playerId, ['hp', 'resources', 'skills', 'characterProgression'])`.

- [ ] **Step 4: Build and run tests**

Run: `npm run build:api && npm run test:api`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/buffs.ts apps/api/src/routes/pvp.ts
git commit -m "feat(api): enrich buff and PvP endpoints with stateUpdates (#176)"
```

---

## Chunk 4: Frontend — Refactor simpleAction + All Handlers

### Task 11: Refactor simpleAction to Remove loadAll

**Files:**
- Modify: `apps/web/src/app/game/simpleAction.ts`
- Modify: `apps/web/src/app/game/useGameController.ts:637-651` (simpleAction wrapper)

**Context:** Currently `runSimpleAction` (`simpleAction.ts:11-26`) calls `await loadAll()` after `onSuccess`. We remove that. The `simpleAction` wrapper in `useGameController.ts:637-651` will auto-apply `stateUpdates` from the response, then call the handler's `onSuccess`.

- [ ] **Step 1: Modify simpleAction.ts — remove loadAll parameter and call**

Replace the entire file content:

```ts
// apps/web/src/app/game/simpleAction.ts
import type { ApiResponse } from '@/lib/api';

interface RunSimpleActionOptions<T> {
  actionName: string;
  apiFn: () => Promise<ApiResponse<T>>;
  onSuccess?: (data: T) => void | Promise<void>;
  setActionError: (message: string) => void;
}

export async function runSimpleAction<T>({
  actionName,
  apiFn,
  onSuccess,
  setActionError,
}: RunSimpleActionOptions<T>) {
  const res = await apiFn();
  if (!res.data) {
    setActionError(res.error?.message ?? `${actionName.replace(/_/g, ' ')} failed`);
    return;
  }
  await onSuccess?.(res.data);
}
```

- [ ] **Step 2: Modify simpleAction wrapper in useGameController.ts**

Replace the `simpleAction` definition at line ~637 with:

```ts
import { applyStateUpdates, type StateSetters } from './applyStateUpdates';
import type { StateUpdates } from '@pocketrealm/shared';

// Build stateSetters object (define once, near the state declarations):
const stateSetters: StateSetters = {
  setInventory,
  setInventoryCapacity,
  setInventoryUsedSlots,
  setEquipment,
  setSkills: (skills) => { if (skills) setSkills(skills); },
  setHpState: (hp) => { setHpState(hp); hpStateRef.current = hp; },
  setStaminaState,
  setManaState,
  setGold,
  setActiveBuffs: (buffs) => { setActiveBuffs(buffs); },
  setCharacterProgression,
};

// Updated simpleAction wrapper:
const simpleAction = async <T extends { stateUpdates?: StateUpdates }>(
  actionName: string,
  apiFn: () => Promise<ApiResponse<T>>,
  onSuccess?: (data: T) => void | Promise<void>,
) => {
  await runAction(actionName, async () => {
    await runSimpleAction({
      actionName,
      apiFn,
      onSuccess: async (data) => {
        applyStateUpdates(data.stateUpdates, stateSetters);
        await onSuccess?.(data);
      },
      setActionError,
    });
  });
};
```

Note: `hpStateRef.current` must be updated alongside `setHpState` — this is already done in `loadAll` at line ~420. The `stateSetters.setHpState` wrapper handles this.

- [ ] **Step 3: Verify build compiles**

Run: `npm run build:web`
Expected: Compiles. (Some handlers may need adjustment in next steps.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/game/simpleAction.ts apps/web/src/app/game/useGameController.ts
git commit -m "refactor(web): remove loadAll from simpleAction, use applyStateUpdates (#176)"
```

---

### Task 12: Refactor Non-Simple Handlers to Use applyStateUpdates

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts` (multiple handlers)

**Context:** Each non-simple handler that calls `loadAll()` needs to call `applyStateUpdates(data.stateUpdates, stateSetters)` instead.

Handlers to modify (with current `loadAll()` locations):

| Handler | Line | Replace loadAll with |
|---------|------|---------------------|
| `handleCraft` | 1097 | `applyStateUpdates(data.stateUpdates, stateSetters)` |
| `handleGather` | 1018 | `applyStateUpdates(data.stateUpdates, stateSetters)` — keep `loadGatheringNodes()` call |
| Exploration playback complete | 722 | `applyStateUpdates(data.stateUpdates, stateSetters)` — need to pass stateUpdates from exploration response through playback data |
| Combat playback complete | 890 | `applyStateUpdates(data.stateUpdates, stateSetters)` — need to pass stateUpdates through combat response |
| Loot claim | 1266 | `applyStateUpdates(data.stateUpdates, stateSetters)` |
| Travel error | 1321 | `applyStateUpdates(data.stateUpdates, stateSetters)` — but on error there's no stateUpdates; use `loadAll()` as fallback for error recovery |
| Travel final hop (breadcrumb) | 1348 | `applyStateUpdates(data.stateUpdates, stateSetters)` |
| Travel final hop (normal) | 1390 | `applyStateUpdates(data.stateUpdates, stateSetters)` |
| Travel playback complete | 1486 | `applyStateUpdates` from stored travel data |

**Special cases:**
- **Exploration playback**: `loadAll()` at line 722 is in `finalizeExplorationPlayback()`, which runs after the playback animation. The stateUpdates from the initial POST response must be stored in the playback data and applied when playback finishes.
- **Combat**: `loadAll()` at line 890 is in the `handleStartCombat` body directly (not in the playback complete handler in `useCombatPlayback.ts`). We can simply replace it with `applyStateUpdates` — no need to thread stateUpdates through playback data.
- **Travel playback**: `loadAll()` at line 1486 is in `finalizeTravelPlayback()` which runs after travel animation. The stateUpdates from the last travel hop must be stored in `travelPlaybackData` and applied when playback finishes.
- **Travel error (line 1321)**: Keep `loadAll()` here — on error, earlier hops may have committed partial state changes and we need a full refresh for safety.
- **Travel mid-hop `loadTurnsAndHp()` calls (lines 1343, 1385)**: Replace with `applyStateUpdates(data.stateUpdates, stateSetters)` since travel response now includes HP/resources in stateUpdates.

- [ ] **Step 1: Store stateUpdates in exploration playback data**

Add `stateUpdates` field to the inline exploration playback state type at `useGameController.ts:314-323`:

```ts
const [explorationPlaybackData, setExplorationPlaybackData] = useState<{
  totalTurns: number;
  zoneName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBeforeExploration: number;
  playerMaxHp: number;
  pendingLootSessionIds?: string[];
  stateUpdates?: StateUpdates;  // <-- add this
} | null>(null);
```

Then in the `handleStartExploration` handler (line ~670), pass `stateUpdates` when setting playback data:

```ts
setExplorationPlaybackData({
  // ...existing fields...
  stateUpdates: data.stateUpdates,
});
```

- [ ] **Step 2: Store stateUpdates in travel playback data**

Add `stateUpdates` field to `TravelPlaybackState` interface at `useGameController.ts:130-142`:

```ts
interface TravelPlaybackState {
  // ...existing fields...
  stateUpdates?: StateUpdates;  // <-- add this
}
```

Then in `executeNextTravelHop` (line ~1364), pass it when setting travel playback data:

```ts
setTravelPlaybackData({
  // ...existing fields...
  stateUpdates: data.stateUpdates,
});
```

- [ ] **Step 3: (Combat — no playback storage needed)**

Combat's `loadAll()` is at line 890, inside `handleStartCombat` body. This runs immediately, not after playback. Simply replace in Step 7.

- [ ] **Step 4: Replace loadAll() in handleCraft (line 1097)**

```ts
// Before:
await loadAll();

// After:
applyStateUpdates(data.stateUpdates, stateSetters);
```

- [ ] **Step 5: Replace loadAll() in handleGather (line 1018)**

```ts
// Before:
await Promise.all([loadAll(), loadGatheringNodes()]);

// After:
applyStateUpdates(data.stateUpdates, stateSetters);
await loadGatheringNodes();
```

- [ ] **Step 6: Replace loadAll() in exploration playback complete (line 722)**

```ts
// Before:
await loadAll();

// After:
applyStateUpdates(explorationPlaybackData?.stateUpdates, stateSetters);
```

- [ ] **Step 7: Replace loadAll() in combat playback complete (line 890)**

```ts
// Before:
await Promise.all([loadAll(), loadBestiary(false)]);

// After:
applyStateUpdates(combatData?.stateUpdates, stateSetters);
await loadBestiary(false);
```

- [ ] **Step 8: Replace loadAll() and loadTurnsAndHp() in travel handlers**

For the final-hop cases (lines 1348, 1390):
```ts
applyStateUpdates(data.stateUpdates, stateSetters);
```

For mid-hop `loadTurnsAndHp()` (lines 1343, 1385):
```ts
applyStateUpdates(data.stateUpdates, stateSetters);
```

For travel-playback-complete final case (line 1486):
```ts
applyStateUpdates(travelPlaybackData?.stateUpdates, stateSetters);
```

Keep `loadAll()` at line 1321 (error fallback).

- [ ] **Step 9: Replace loadAll() in loot claim (line 1266)**

```ts
applyStateUpdates(data.stateUpdates, stateSetters);
```

- [ ] **Step 10: Build and verify**

Run: `npm run build:web`
Expected: Compiles cleanly.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "refactor(web): replace loadAll with applyStateUpdates in all action handlers (#176)"
```

---

### Task 13: Refactor ArenaScreen to Use stateUpdates

**Files:**
- Modify: `apps/web/src/app/game/screens/ArenaScreen.tsx`
- Modify: `apps/web/src/app/game/page.tsx:983-997` (ArenaScreen props)

**Context:** ArenaScreen currently uses `onTurnsChanged`/`onHpChanged` callbacks that call `loadTurnsAndHp()` in the parent. With stateUpdates in PvP responses, ArenaScreen can apply state directly.

- [ ] **Step 1: Update ArenaScreenProps interface and page.tsx props**

In `apps/web/src/app/game/screens/ArenaScreen.tsx`, update the `ArenaScreenProps` interface (lines 33-44):
- Remove: `onTurnsChanged?: () => void`
- Remove: `onHpChanged?: () => void`
- Add: `onStateUpdates?: (updates: StateUpdates) => void`
- Keep: `onNotificationsChanged` (PvP notification badge count is separate)

In `apps/web/src/app/game/page.tsx` (lines 983-997), update the JSX:
```tsx
<ArenaScreen
  characterLevel={characterProgression.characterLevel}
  busyAction={busyAction}
  currentTurns={turns}
  playerId={player?.id ?? null}
  isInTown={currentZone?.zoneType === 'town'}
  onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)}
  onNotificationsChanged={() => void loadPvpNotificationCount()}
  onNavigate={(s) => setActiveScreen(s as Screen)}
  combatSpeedMs={combatLogSpeedMs}
/>
```

- [ ] **Step 2: Update ArenaScreen handlers to use onStateUpdates**

In `handleScout` (line ~118-131): replace `onTurnsChanged?.()` in the finally block with:
```ts
if (result.data?.stateUpdates) onStateUpdates?.(result.data.stateUpdates);
```

In `handleChallenge` (line ~133-152): replace `onTurnsChanged?.()` and `onHpChanged?.()` in the finally block with:
```ts
if (result.data?.stateUpdates) onStateUpdates?.(result.data.stateUpdates);
```

- [ ] **Step 3: Clean up — remove any remaining references to old callbacks**

Grep for `onTurnsChanged` and `onHpChanged` across the codebase to ensure no dangling references.

- [ ] **Step 4: Build and verify**

Run: `npm run build:web`
Expected: Compiles.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/game/screens/ArenaScreen.tsx apps/web/src/app/game/page.tsx
git commit -m "refactor(web): ArenaScreen uses stateUpdates instead of loadTurnsAndHp callbacks (#176)"
```

---

## Chunk 5: Screen-Aware Polling + 429 Toast

### Task 14: Implement Screen-Aware Polling

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:330-341,546-560`

**Context:** Replace `loadTurnsAndHp` (3 requests every 10s) with `pollScreenData` that only fetches what the current screen needs, and skips HP/resources at max.

- [ ] **Step 1: Add SCREEN_POLL_NEEDS constant**

Add near the top of `useGameController.ts` (outside the hook, since it's static):

```ts
const SCREEN_POLL_NEEDS: Record<string, string[]> = {
  explore:    ['turns', 'hp', 'resources'],
  combat:     ['turns', 'hp', 'resources'],
  rest:       ['turns', 'hp', 'resources'],
  home:       ['turns', 'hp', 'resources'],
  arena:      ['turns', 'hp', 'resources'],
  gathering:  ['turns'],
  crafting:   ['turns'],
  forge:      ['turns'],
  casino:     ['turns'],
  skills:     ['turns'],
  zones:      ['turns'],
  bestiary:   ['turns'],
  training:   ['turns'],
  travel:     ['turns', 'hp', 'resources'],
};
```

- [ ] **Step 2: Replace loadTurnsAndHp with pollScreenData**

Replace the `loadTurnsAndHp` callback (lines 330-341) with:

```ts
const pollScreenData = useCallback(async () => {
  const needs = SCREEN_POLL_NEEDS[activeScreen] ?? ['turns'];
  const fetches: Promise<void>[] = [];

  fetches.push(getTurns().then(res => { if (res.data) setTurns(res.data.currentTurns); }));

  if (needs.includes('hp') && hpState.currentHp < hpState.maxHp) {
    fetches.push(getHpState().then(res => {
      if (res.data) { setHpState(res.data); hpStateRef.current = res.data; }
    }));
  }

  if (needs.includes('resources')) {
    const staminaFull = staminaState.current >= staminaState.max;
    const manaFull = manaState.current >= manaState.max;
    if (!staminaFull || !manaFull) {
      fetches.push(getResources().then(res => {
        if (res.data) { setStaminaState(res.data.stamina); setManaState(res.data.mana); }
      }));
    }
  }

  await Promise.all(fetches);
}, [activeScreen, hpState.currentHp, hpState.maxHp, staminaState, manaState]);
// Note: API functions (getTurns, getHpState, getResources) and setters (setTurns, etc.)
// are stable references (module-level imports or useState setters) so they don't need
// to be in the dependency array. If the linter warns, add them — they won't cause re-renders.
```

- [ ] **Step 3: Update the useEffect interval to use pollScreenData**

In the useEffect at line ~546, replace `loadTurnsAndHp` with `pollScreenData`:

```ts
const interval = setInterval(() => { if (!cancelled) void pollScreenData(); }, 10000);
```

Update the dependency array to include `pollScreenData` instead of `loadTurnsAndHp`.

- [ ] **Step 4: Remove loadTurnsAndHp if no other callers remain**

After Tasks 12-13, there should be no more callers of `loadTurnsAndHp`. If that's confirmed, delete the function entirely. If there are remaining callers (check with grep), keep it until those are migrated.

- [ ] **Step 5: Build and verify**

Run: `npm run build:web`
Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat(web): screen-aware polling with skip-at-max optimisation (#176)"
```

---

### Task 15: Add 429 Rate Limit Detection + Toast

**Files:**
- Modify: `apps/web/src/lib/api/core.ts:132` (before `!res.ok` block)
- Create: `apps/web/src/components/RateLimitToast.tsx`
- Create: `apps/web/src/app/game/hooks/useRateLimitToast.ts`
- Modify: `apps/web/src/app/game/page.tsx` (mount RateLimitToast)

**Reference:** Follow the `QuestToast.tsx` pattern — use `useToastQueue` with `globalKey`, `autoDismissMs`, and `ToastContainer`.

- [ ] **Step 1: Add 429 detection in fetchApi**

In `apps/web/src/lib/api/core.ts`, before the `if (!res.ok)` block at line 132, add:

```ts
if (res.status === 429) {
  window.dispatchEvent(new CustomEvent('api:rate-limited'));
  return { error: { message: 'Too many requests', code: 'RATE_LIMITED' } };
}
```

- [ ] **Step 2: Create useRateLimitToast hook**

```ts
// apps/web/src/app/game/hooks/useRateLimitToast.ts
import { useEffect } from 'react';

export function useRateLimitToast() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timeout) return; // debounce — max one toast per 4s
      const show = (window as unknown as Record<string, unknown>).__showRateLimitToast as
        | ((msg: string) => void) | undefined;
      show?.('Too many requests — wait a moment');
      timeout = setTimeout(() => { timeout = null; }, 4000);
    };
    window.addEventListener('api:rate-limited', handler);
    return () => {
      window.removeEventListener('api:rate-limited', handler);
      if (timeout) clearTimeout(timeout);
    };
  }, []);
}
```

- [ ] **Step 3: Create RateLimitToast component**

Model after `QuestToast.tsx`:

```tsx
// apps/web/src/components/RateLimitToast.tsx
'use client';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

export function RateLimitToast() {
  const queue = useToastQueue<string>({
    globalKey: '__showRateLimitToast',
    maxVisible: 1,
    autoDismissMs: 4000,
    makeItem: (msg) => ({ id: `rate-limit-${Date.now()}`, data: msg }),
  });

  if (queue.visible.length === 0) return null;

  return (
    <ToastContainer
      position="top-center"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      overflowLabel=""
      renderToast={(item) => (
        <div style={{
          padding: '8px 16px',
          background: 'var(--rpg-bg-darker, #1a1a2e)',
          border: '1px solid var(--rpg-gold, #d4a017)',
          borderRadius: '4px',
          color: 'var(--rpg-gold, #d4a017)',
          fontSize: '14px',
        }}>
          {item.data}
        </div>
      )}
    />
  );
}
```

- [ ] **Step 4: Mount RateLimitToast and hook in game page**

In `apps/web/src/app/game/page.tsx`:
1. Add `<RateLimitToast />` alongside the existing `<QuestToast />` and `<AchievementToast />` components.
2. Call `useRateLimitToast()` inside the `GamePage` component body (it's a hook, must be called in a component). This bridges the `api:rate-limited` DOM event to the `__showRateLimitToast` window global.

- [ ] **Step 5: Build and verify**

Run: `npm run build:web`
Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/core.ts apps/web/src/components/RateLimitToast.tsx apps/web/src/app/game/hooks/useRateLimitToast.ts apps/web/src/app/game/page.tsx
git commit -m "feat(web): 429 rate limit detection with toast notification (#176)"
```

---

## Chunk 6: Final Verification + Cleanup

### Task 16: Full Build + Test Suite

**Files:** None — verification only.

- [ ] **Step 1: Build entire project**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors (existing pre-existing errors in `page.tsx:333` may remain — that's known).

- [ ] **Step 4: Run linter**

Run: `npm run lint`
Expected: No new lint errors.

- [ ] **Step 5: Verify loadAll is only called on mount**

Run a grep for `loadAll()` in `useGameController.ts`. Should only appear at:
- The `loadAll` function definition (`const loadAll = useCallback(async () => {`)
- The mount `useEffect` (`void loadAll();` — the initial load on authentication)
- The travel error fallback in `executeNextTravelHop` (`await loadAll();` — safety recovery)

No other call sites should remain.

- [ ] **Step 5b: Run E2E tests**

Run: `npm run test:e2e`
Expected: Existing Playwright tests pass without changes (behaviour is identical, fewer network calls).

- [ ] **Step 6: Commit any final fixes**

If any issues were found, fix and commit.

---

### Task 17: Manual Smoke Test

**Files:** None — manual testing.

- [ ] **Step 1: Start dev environment**

Run: `npm run dev`

- [ ] **Step 2: Test rapid crafting**

Craft 15+ items in quick succession. Verify:
- No rate-limit errors
- Inventory updates correctly after each craft
- Skills/XP update correctly
- Turn count decreases correctly

- [ ] **Step 3: Test screen-aware polling**

Open browser dev tools Network tab:
- On crafting screen: should see only `GET /turns` every 10s
- Navigate to explore screen at low HP: should see `GET /turns` + `GET /hp` + `GET /resources`
- At full HP on explore screen: should see only `GET /turns`

- [ ] **Step 4: Test 429 toast (optional — requires lowering rate limit)**

Temporarily lower rate limit to 10 req/min in `apps/api/src/index.ts:114`, trigger rate limiting, verify toast appears. Revert after testing.

- [ ] **Step 5: Test other actions**

Quick-test equip/unequip, sell, salvage, stash deposit/withdraw to verify UI state stays consistent.
