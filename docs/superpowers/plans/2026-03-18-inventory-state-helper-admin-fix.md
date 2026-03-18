# Extract `buildInventoryStateUpdates` Helper + Fix Admin Over-Fetching

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DRY up inventory stateUpdates construction across crafting routes and eliminate admin panel over-fetching by returning targeted stateUpdates from grant endpoints.

**Architecture:** Add a pure sync helper `buildInventoryStateUpdates()` to `stateUpdateHelpers.ts` for assembling inventory state. Admin grant endpoints gain `stateUpdates` via the existing `buildStateUpdates()` infrastructure. Frontend `AdminScreen` switches from `loadAll()` to `applyStateUpdates()`.

**Tech Stack:** TypeScript, Express, Prisma, React, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-inventory-state-helper-admin-fix-design.md`

**Notes:**
- `useGameController.ts` (listed in spec scope) needs **no changes** — `stateSetters` and `setTurns` are already exported and available in `page.tsx`.
- `WorldTab`, `ZonesTab`, `ResourcesTab`, `GuildTab` intentionally lose their post-action `loadAll()` refresh — those actions (spawn events, teleport, etc.) don't affect player state.

---

### Task 1: Add `buildInventoryStateUpdates` helper

**Files:**
- Modify: `apps/api/src/services/stateUpdateHelpers.ts` (after `mergeLootIntoStateUpdates`, ~line 467)
- Modify: `apps/api/src/services/stateUpdateHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/services/stateUpdateHelpers.test.ts`:

```typescript
import { toInventoryItemDTO, toSkillStateDTO, buildInventoryStateUpdates } from './stateUpdateHelpers.js';

// ... (existing tests) ...

describe('buildInventoryStateUpdates', () => {
  const mockDTO = {
    id: 'item-1', templateId: 'tpl-1', ownerId: 'p1', rarity: 'common' as const,
    currentDurability: null, maxDurability: null, quantity: 1, bonusStats: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    template: { id: 'tpl-1', name: 'Ore', itemType: 'resource', weightClass: null, slot: null, tier: 1, baseStats: {}, requiredSkill: 'mining', requiredLevel: 1, maxDurability: 0, stackable: true, sellPrice: 5, flavorText: null },
    equippedSlot: null,
  };

  it('always includes inventoryUsedSlots', () => {
    const result = buildInventoryStateUpdates({ inventoryUsedSlots: 5 });
    expect(result).toEqual({ inventoryUsedSlots: 5 });
  });

  it('includes removed when non-empty', () => {
    const result = buildInventoryStateUpdates({ removed: ['id-1', 'id-2'], inventoryUsedSlots: 3 });
    expect(result.inventoryRemoved).toEqual(['id-1', 'id-2']);
  });

  it('omits removed when empty', () => {
    const result = buildInventoryStateUpdates({ removed: [], inventoryUsedSlots: 3 });
    expect(result.inventoryRemoved).toBeUndefined();
  });

  it('includes added when non-empty', () => {
    const result = buildInventoryStateUpdates({ added: [mockDTO], inventoryUsedSlots: 3 });
    expect(result.inventoryAdded).toEqual([mockDTO]);
  });

  it('omits added when empty', () => {
    const result = buildInventoryStateUpdates({ added: [], inventoryUsedSlots: 3 });
    expect(result.inventoryAdded).toBeUndefined();
  });

  it('includes updated when non-empty', () => {
    const result = buildInventoryStateUpdates({ updated: [mockDTO], inventoryUsedSlots: 3 });
    expect(result.inventoryUpdated).toEqual([mockDTO]);
  });

  it('omits updated when empty', () => {
    const result = buildInventoryStateUpdates({ updated: [], inventoryUsedSlots: 3 });
    expect(result.inventoryUpdated).toBeUndefined();
  });

  it('includes materialTotals when provided', () => {
    const result = buildInventoryStateUpdates({ inventoryUsedSlots: 3, materialTotals: { 'tpl-1': 10 } });
    expect(result.materialTotals).toEqual({ 'tpl-1': 10 });
  });

  it('omits materialTotals when not provided', () => {
    const result = buildInventoryStateUpdates({ inventoryUsedSlots: 3 });
    expect(result.materialTotals).toBeUndefined();
  });

  it('assembles all fields together', () => {
    const result = buildInventoryStateUpdates({
      removed: ['old-id'],
      added: [mockDTO],
      updated: [{ ...mockDTO, id: 'item-2' }],
      inventoryUsedSlots: 5,
      materialTotals: { 'tpl-1': 10 },
    });
    expect(result).toEqual({
      inventoryRemoved: ['old-id'],
      inventoryAdded: [mockDTO],
      inventoryUpdated: [{ ...mockDTO, id: 'item-2' }],
      inventoryUsedSlots: 5,
      materialTotals: { 'tpl-1': 10 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- --run apps/api/src/services/stateUpdateHelpers.test.ts`
Expected: FAIL — `buildInventoryStateUpdates` is not exported

- [ ] **Step 3: Write the implementation**

Add to `apps/api/src/services/stateUpdateHelpers.ts` after `mergeLootIntoStateUpdates` (after line 467):

```typescript
// ---------------------------------------------------------------------------
// buildInventoryStateUpdates
// ---------------------------------------------------------------------------

/**
 * Pure assembly helper — builds the inventory portion of a StateUpdates object
 * from already-fetched data. Omits empty arrays to keep responses lean.
 */
export function buildInventoryStateUpdates(opts: {
  removed?: string[];
  added?: InventoryItemDTO[];
  updated?: InventoryItemDTO[];
  inventoryUsedSlots: number;
  materialTotals?: Record<string, number>;
}): Partial<StateUpdates> {
  const result: Partial<StateUpdates> = {
    inventoryUsedSlots: opts.inventoryUsedSlots,
  };
  if (opts.removed && opts.removed.length > 0) result.inventoryRemoved = opts.removed;
  if (opts.added && opts.added.length > 0) result.inventoryAdded = opts.added;
  if (opts.updated && opts.updated.length > 0) result.inventoryUpdated = opts.updated;
  if (opts.materialTotals !== undefined) result.materialTotals = opts.materialTotals;
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- --run apps/api/src/services/stateUpdateHelpers.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/stateUpdateHelpers.ts apps/api/src/services/stateUpdateHelpers.test.ts
git commit -m "feat: add buildInventoryStateUpdates pure assembly helper"
```

---

### Task 2: Refactor crafting routes to use `buildInventoryStateUpdates`

**Files:**
- Modify: `apps/api/src/routes/crafting/forge.ts` (3 stateUpdates blocks)
- Modify: `apps/api/src/routes/crafting/salvage.ts` (2 stateUpdates blocks)
- Modify: `apps/api/src/routes/crafting/craft.ts` (1 stateUpdates block)

- [ ] **Step 1: Update forge.ts imports**

Add `buildInventoryStateUpdates` to the import from `stateUpdateHelpers` at line 20:

```typescript
import { toInventoryItemDTO, fetchInventoryMeta, fetchBuffDTOs, buildInventoryStateUpdates } from '../../services/stateUpdateHelpers';
```

- [ ] **Step 2: Refactor forge upgrade success stateUpdates (line 205-210)**

Replace:
```typescript
        stateUpdates: {
          inventoryRemoved: [sacrificial.id],
          inventoryUpdated: [updatedDTO],
          inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
          ...(buffs && { buffs }),
        },
```

With:
```typescript
        stateUpdates: {
          ...buildInventoryStateUpdates({
            removed: [sacrificial.id],
            updated: [updatedDTO],
            inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
          }),
          ...(buffs && { buffs }),
        },
```

- [ ] **Step 3: Refactor forge upgrade failure stateUpdates (line 283-287)**

Replace:
```typescript
      stateUpdates: {
        inventoryRemoved: removedIds,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        ...(buffs && { buffs }),
      },
```

With:
```typescript
      stateUpdates: {
        ...buildInventoryStateUpdates({
          removed: removedIds,
          inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        }),
        ...(buffs && { buffs }),
      },
```

- [ ] **Step 4: Refactor forge reroll stateUpdates (line 398-402)**

Replace:
```typescript
      stateUpdates: {
        inventoryRemoved: [sacrificial.id],
        inventoryUpdated: [updatedDTO],
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      },
```

With:
```typescript
      stateUpdates: buildInventoryStateUpdates({
        removed: [sacrificial.id],
        updated: [updatedDTO],
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      }),
```

- [ ] **Step 5: Update salvage.ts imports**

Add `buildInventoryStateUpdates` to the import at line 10:

```typescript
import { fetchItemDTOs, fetchInventoryMeta, fetchMaterialTotals, buildInventoryStateUpdates } from '../../services/stateUpdateHelpers';
```

- [ ] **Step 6: Refactor single salvage stateUpdates (line 183-189)**

Replace:
```typescript
      stateUpdates: {
        inventoryRemoved: [item.id],
        ...(addedDTOs.length > 0 && { inventoryAdded: addedDTOs }),
        ...(updatedDTOs.length > 0 && { inventoryUpdated: updatedDTOs }),
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals,
      },
```

With:
```typescript
      stateUpdates: buildInventoryStateUpdates({
        removed: [item.id],
        added: addedDTOs,
        updated: updatedDTOs,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals,
      }),
```

- [ ] **Step 7: Refactor batch salvage stateUpdates (line 383-389)**

Replace:
```typescript
      stateUpdates: {
        inventoryRemoved: salvagedItemIds,
        ...(addedDTOs.length > 0 && { inventoryAdded: addedDTOs }),
        ...(updatedDTOs.length > 0 && { inventoryUpdated: updatedDTOs }),
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals: matTotals,
      },
```

With:
```typescript
      stateUpdates: buildInventoryStateUpdates({
        removed: salvagedItemIds,
        added: addedDTOs,
        updated: updatedDTOs,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals: matTotals,
      }),
```

- [ ] **Step 8: Update craft.ts imports**

Add `buildInventoryStateUpdates` to the import at line 21:

```typescript
import { fetchItemDTOs, fetchSkillDTOs, fetchCharacterProgression, fetchInventoryMeta, fetchMaterialTotals, buildInventoryStateUpdates } from '../../services/stateUpdateHelpers';
```

- [ ] **Step 9: Refactor craft stateUpdates (line 340-348)**

Replace:
```typescript
      stateUpdates: {
        inventoryAdded,
        inventoryRemoved: fullyConsumedIds,
        inventoryUpdated,
        skills,
        characterProgression,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals,
      },
```

With:
```typescript
      stateUpdates: {
        ...buildInventoryStateUpdates({
          removed: fullyConsumedIds,
          added: inventoryAdded,
          updated: inventoryUpdated,
          inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
          materialTotals,
        }),
        skills,
        characterProgression,
      },
```

- [ ] **Step 10: Run all tests to verify no regressions**

Run: `npm run test:api -- --run`
Expected: All PASS — behavior is identical, just DRYer

- [ ] **Step 11: Typecheck**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/routes/crafting/forge.ts apps/api/src/routes/crafting/salvage.ts apps/api/src/routes/crafting/craft.ts
git commit -m "refactor: use buildInventoryStateUpdates in crafting routes"
```

---

### Task 3: Add stateUpdates to admin grant endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/admin.test.ts`

- [ ] **Step 1: Add imports to admin.ts**

Add to the top of `apps/api/src/routes/admin.ts`:

```typescript
import { buildStateUpdates, fetchItemDTOs, fetchInventoryMeta, fetchMaterialTotals, buildInventoryStateUpdates } from '../services/stateUpdateHelpers';
```

- [ ] **Step 2: Add stateUpdates mock and fix addStackableItem mock in admin.test.ts**

Add a new `vi.mock` block at the top of `admin.test.ts` for stateUpdateHelpers:

```typescript
vi.mock('../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockResolvedValue({ characterProgression: { characterXp: 1000, characterLevel: 10, attributePoints: 5 } }),
  fetchItemDTOs: vi.fn().mockResolvedValue([]),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryCapacity: 50, inventoryUsedSlots: 10 }),
  fetchMaterialTotals: vi.fn().mockResolvedValue({}),
  buildInventoryStateUpdates: vi.fn().mockReturnValue({ inventoryUsedSlots: 10 }),
}));
```

**Also fix the existing `addStackableItem` mock** (line 7) to return the correct shape:

Replace:
```typescript
  addStackableItem: vi.fn().mockResolvedValue({ id: 'item-1', quantity: 10 }),
```

With:
```typescript
  addStackableItem: vi.fn().mockResolvedValue({ itemId: 'item-1', quantity: 10, created: false }),
```

And add the imports:
```typescript
import { buildStateUpdates, fetchItemDTOs, buildInventoryStateUpdates } from '../services/stateUpdateHelpers';
```

- [ ] **Step 3: Write test for POST /player/xp returning stateUpdates**

Add to `admin.test.ts`:

```typescript
  describe('POST /player/xp', () => {
    it('grants XP and returns stateUpdates with characterProgression', async () => {
      mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ characterXp: BigInt(500), characterLevel: 5 });
      mockPrisma.player.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { amount: 500 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/player/xp');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['characterProgression']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stateUpdates: expect.any(Object),
      }));
    });
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test:api -- --run apps/api/src/routes/admin.test.ts`
Expected: FAIL — response doesn't contain `stateUpdates`

- [ ] **Step 5: Implement stateUpdates for POST /player/xp (line 121-141)**

Replace the handler body's final response (line 140):
```typescript
  res.json({ success: true, characterXp: newXp, characterLevel: newLevel, levelUps });
```

With:
```typescript
  const stateUpdates = await buildStateUpdates(req.player!.playerId, ['characterProgression']);
  res.json({ success: true, characterXp: newXp, characterLevel: newLevel, levelUps, stateUpdates });
```

- [ ] **Step 6: Implement stateUpdates for POST /player/level (line 58-74)**

Replace the handler's final response (line 73):
```typescript
  res.json({ success: true, level, characterXp: xp });
```

With:
```typescript
  const stateUpdates = await buildStateUpdates(req.player!.playerId, ['characterProgression']);
  res.json({ success: true, level, characterXp: xp, stateUpdates });
```

- [ ] **Step 7: Implement stateUpdates for POST /set-skill-level (line 81-93)**

Replace the handler's final response (line 92):
```typescript
  res.json({ success: true, skillType, level });
```

With:
```typescript
  const stateUpdates = await buildStateUpdates(req.player!.playerId, ['skills', 'resources']);
  res.json({ success: true, skillType, level, stateUpdates });
```

- [ ] **Step 8: Implement stateUpdates for POST /set-skill-levels (line 100-117)**

Replace the handler's final response (line 116):
```typescript
  res.json({ success: true, skillTypes, level });
```

With:
```typescript
  const stateUpdates = await buildStateUpdates(req.player!.playerId, ['skills', 'resources']);
  res.json({ success: true, skillTypes, level, stateUpdates });
```

- [ ] **Step 9: Implement stateUpdates for POST /player/attributes (line 151-166)**

Replace the handler's final response (line 165):
```typescript
  res.json({ success: true, attributes: merged, attributePoints: body.attributePoints ?? player.attributePoints });
```

With:
```typescript
  const stateUpdates = await buildStateUpdates(req.player!.playerId, ['hp', 'resources']);
  res.json({ success: true, attributes: merged, attributePoints: body.attributePoints ?? player.attributePoints, stateUpdates });
```

- [ ] **Step 10: Implement stateUpdates for POST /items/grant (line 193-228)**

For the stackable branch (line 198-203), replace:
```typescript
    const result = await addStackableItem(playerId, templateId, quantity);
    await adminAudit(playerId, 'grant_item', { templateId, templateName: template.name, rarity, quantity, stackable: true });
    res.json({ success: true, item: result });
    return;
```

With:
```typescript
    const result = await addStackableItem(playerId, templateId, quantity);
    const [addedDTOs, inventoryMeta, materialTotals] = await Promise.all([
      fetchItemDTOs([result.itemId]),
      fetchInventoryMeta(playerId),
      fetchMaterialTotals(playerId),
    ]);
    await adminAudit(playerId, 'grant_item', { templateId, templateName: template.name, rarity, quantity, stackable: true });
    const stateUpdates = buildInventoryStateUpdates({
      ...(result.created ? { added: addedDTOs } : { updated: addedDTOs }),
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    });
    res.json({ success: true, item: result, stateUpdates });
    return;
```

Note: Check the return type of `addStackableItem` — it returns `{ itemId: string; created: boolean; ... }`. Read `apps/api/src/services/inventoryService.ts` to confirm the exact shape.

For the non-stackable branch (line 205-228), replace:
```typescript
  const items = [];
  for (let i = 0; i < quantity; i++) {
    // ... create items ...
    items.push(item);
  }
  await adminAudit(playerId, 'grant_item', { templateId, templateName: template.name, rarity, quantity, itemCount: items.length });
  res.json({ success: true, items });
```

With:
```typescript
  const items = [];
  for (let i = 0; i < quantity; i++) {
    // ... create items (same as before) ...
    items.push(item);
  }
  const itemIds = items.map(i => i.id);
  const [addedDTOs, inventoryMeta, materialTotals] = await Promise.all([
    fetchItemDTOs(itemIds),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  await adminAudit(playerId, 'grant_item', { templateId, templateName: template.name, rarity, quantity, itemCount: items.length });
  const stateUpdates = buildInventoryStateUpdates({
    added: addedDTOs,
    inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
    materialTotals,
  });
  res.json({ success: true, items, stateUpdates });
```

- [ ] **Step 11: Update existing tests and add missing test cases in admin.test.ts**

Update existing `/player/level` test (line 97) to expect `stateUpdates`:

```typescript
expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, level: 10, stateUpdates: expect.any(Object) }));
```

Update existing `/items/grant` tests (lines 101-131) to expect `stateUpdates`:

```typescript
expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, stateUpdates: expect.any(Object) }));
```

Add new test cases for the endpoints that had no tests:

```typescript
  describe('POST /set-skill-level', () => {
    it('sets skill level and returns stateUpdates with skills and resources', async () => {
      mockPrisma.playerSkill.upsert.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { skillType: 'mining', level: 20 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/set-skill-level');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['skills', 'resources']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, stateUpdates: expect.any(Object) }));
    });
  });

  describe('POST /set-skill-levels', () => {
    it('sets multiple skill levels and returns stateUpdates', async () => {
      mockPrisma.$transaction.mockResolvedValue([]);

      const req = { player: { playerId: 'p1' }, body: { skillTypes: ['melee', 'ranged'], level: 15 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/set-skill-levels');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['skills', 'resources']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, stateUpdates: expect.any(Object) }));
    });
  });

  describe('POST /player/attributes', () => {
    it('sets attributes and returns stateUpdates with hp and resources', async () => {
      mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ attributes: null, attributePoints: 5 });
      mockPrisma.player.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { attributes: { vitality: 10, strength: 10, dexterity: 5, intelligence: 5, luck: 5, evasion: 5 } } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/player/attributes');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['hp', 'resources']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, stateUpdates: expect.any(Object) }));
    });
  });
```

- [ ] **Step 12: Run tests**

Run: `npm run test:api -- --run apps/api/src/routes/admin.test.ts`
Expected: All PASS

- [ ] **Step 13: Typecheck**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts
git commit -m "feat: return stateUpdates from admin grant endpoints"
```

---

### Task 4: Update frontend admin API client types

**Files:**
- Modify: `apps/web/src/lib/api/admin.ts`

- [ ] **Step 1: Add StateUpdates import**

Add at the top of `apps/web/src/lib/api/admin.ts`:

```typescript
import type { StateUpdates } from '@pocketrealm/shared';
```

- [ ] **Step 2: Update return types for endpoints that now return stateUpdates**

Update these function signatures:

```typescript
export async function adminSetLevel(level: number) {
  return fetchApi<{ success: boolean; level: number; characterXp: number; stateUpdates?: StateUpdates }>('/api/v1/admin/player/level', {
```

```typescript
export async function adminGrantXp(amount: number) {
  return fetchApi<{ success: boolean; characterXp: number; characterLevel: number; stateUpdates?: StateUpdates }>('/api/v1/admin/player/xp', {
```

```typescript
export async function adminSetAttributes(data: { attributePoints?: number; attributes?: Record<string, number> }) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/player/attributes', {
```

```typescript
export async function adminSetSkillLevel(skillType: string, level: number) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/set-skill-level', {
```

```typescript
export async function adminSetSkillLevels(skillTypes: string[], level: number) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/set-skill-levels', {
```

```typescript
export async function adminGrantItem(templateId: string, rarity: string, quantity: number) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/items/grant', {
```

- [ ] **Step 3: Typecheck**

Run: `npm run build:web`
Expected: Clean build (types are additive, no breaking changes)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/admin.ts
git commit -m "feat: add stateUpdates to admin API client return types"
```

---

### Task 5: Replace `loadAll` with `applyStateUpdates` in AdminScreen

**Files:**
- Modify: `apps/web/src/components/screens/AdminScreen.tsx`
- Modify: `apps/web/src/app/game/page.tsx` (~line 1201)

- [ ] **Step 1: Update `useAdminAction` hook to return response data**

In `AdminScreen.tsx`, replace the `useAdminAction` function (lines 55-77):

```typescript
function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const act = async <T,>(label: string, fn: () => Promise<{ data?: T; error?: { message: string } }>, confirm?: string): Promise<T | null> => {
    if (busy) return null;
    if (confirm && !window.confirm(confirm)) return null;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      if (res.error) {
        setMsg({ text: `${label} failed: ${res.error.message}`, ok: false });
        return null;
      }
      setMsg({ text: `${label} succeeded`, ok: true });
      return res.data ?? null;
    } finally {
      setBusy(false);
    }
  };

  return { busy, msg, setMsg, act };
}
```

- [ ] **Step 2: Update AdminScreen props and add import**

Replace the `AdminScreen` export (line 681) and add the import:

```typescript
import type { StateUpdates } from '@pocketrealm/shared';

// ... at the component ...

interface AdminScreenProps {
  onStateUpdates: (updates: StateUpdates) => void;
  setTurns: (n: number) => void;
}

export default function AdminScreen({ onStateUpdates, setTurns: setGameTurns }: AdminScreenProps) {
```

- [ ] **Step 3: Update PlayerTab to apply stateUpdates**

Replace `PlayerTab` props and hook usage (line 81-90):

```typescript
function PlayerTab({ onStateUpdates, setTurns: setGameTurns }: { onStateUpdates: (u: StateUpdates) => void; setTurns: (n: number) => void }) {
  // ... existing local state ...
  const { busy, msg, act } = useAdminAction();
```

Update the turn grant button (line 99) to apply the response:

```typescript
onClick={async () => {
  const data = await act('Grant turns', () => adminGrantTurns(turns));
  if (data) setGameTurns(data.currentTurns);
}}
```

Update token grant (line 108) — no state update needed (stale until quest screen):

```typescript
onClick={() => act('Grant tokens', () => adminGrantTokens(tokens))}
```

Update level set (line 117):

```typescript
onClick={async () => {
  const data = await act('Set level', () => adminSetLevel(level), `Set character level to ${level}?`);
  if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
}}
```

Update XP grant (line 128):

```typescript
onClick={async () => {
  const data = await act('Grant XP', () => adminGrantXp(xp));
  if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
}}
```

Update attribute points set (line 137):

```typescript
onClick={async () => {
  const data = await act('Set points', () => adminSetAttributes({ attributePoints: attrPoints }));
  if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
}}
```

Update attributes set (line 156):

```typescript
onClick={async () => {
  const data = await act('Set attributes', () => adminSetAttributes({ attributes: attrs }), 'Overwrite all attribute values?');
  if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
}}
```

Update skill level set buttons — find the skill set button and update:

```typescript
// For set single skill:
const data = await act('Set skill', () => adminSetSkillLevel(skillType, skillLevel));
if (data?.stateUpdates) onStateUpdates(data.stateUpdates);

// For set multiple skills:
const data = await act('Set skills', () => adminSetSkillLevels([...selectedSkills], skillLevel), `Set ${selectedSkills.size} skills to level ${skillLevel}?`);
if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
```

- [ ] **Step 4: Update ItemsTab to apply stateUpdates**

Replace `ItemsTab` props (line 210):

```typescript
function ItemsTab({ onStateUpdates }: { onStateUpdates: (u: StateUpdates) => void }) {
  // ... existing state ...
  const { busy, msg, act } = useAdminAction();
```

Update the grant button:

```typescript
onClick={async () => {
  const data = await act('Grant item', () => adminGrantItem(selectedTemplate, selectedRarity, qty));
  if (data?.stateUpdates) onStateUpdates(data.stateUpdates);
}}
```

- [ ] **Step 5: Update remaining tabs to remove onAction**

`WorldTab`, `ZonesTab`, `ResourcesTab`, `GuildTab` — these don't affect player state. Update their signatures to remove the `onAction` prop entirely:

```typescript
function WorldTab() {
  const { busy, msg, setMsg, act } = useAdminAction();
  // ... rest unchanged ...
}

function ZonesTab() {
  const { busy, msg, act } = useAdminAction();
  // ... rest unchanged ...
}

function ResourcesTab() {
  const { busy, msg, act } = useAdminAction();
  // ... rest unchanged ...
}

function GuildTab() {
  const { busy, msg, act } = useAdminAction();
  // ... rest unchanged ...
}
```

- [ ] **Step 6: Update AdminScreen tab rendering**

In the `AdminScreen` component body (lines 704-709), update tab props:

```typescript
{tab === 'player' && <PlayerTab onStateUpdates={onStateUpdates} setTurns={setGameTurns} />}
{tab === 'items' && <ItemsTab onStateUpdates={onStateUpdates} />}
{tab === 'world' && <WorldTab />}
{tab === 'zones' && <ZonesTab />}
{tab === 'resources' && <ResourcesTab />}
{tab === 'guild' && <GuildTab />}
```

- [ ] **Step 7: Update page.tsx to pass new AdminScreen props**

In `apps/web/src/app/game/page.tsx`, replace line 1201:

```typescript
return <AdminScreen onAction={loadAll} />;
```

With:

```typescript
return <AdminScreen onStateUpdates={(updates) => applyStateUpdates(updates, stateSetters)} setTurns={setTurns} />;
```

Note: `applyStateUpdates` is already imported (line 60), and `stateSetters` + `setTurns` are already destructured from `useGameController` (lines 272, 300).

- [ ] **Step 8: Typecheck**

Run: `npm run build:web`
Expected: Clean build

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/screens/AdminScreen.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: replace loadAll with applyStateUpdates in admin panel"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full API test suite**

Run: `npm run test:api -- --run`
Expected: All PASS

- [ ] **Step 2: Run full typecheck**

Run: `npm run typecheck`
Expected: Clean (aside from pre-existing `page.tsx:333` SkillType error)

- [ ] **Step 3: Run game engine tests**

Run: `npm run test:engine -- --run`
Expected: All PASS (no changes here, but confirm no cross-contamination)

- [ ] **Step 4: Manual smoke test (if dev server available)**

Start: `npm run dev`
Test: Open admin panel, grant turns, grant XP, set level, grant items. Verify:
- No full page reload / flash
- Turn count updates immediately
- Character level/XP updates after grant
- Inventory updates after item grant
- Non-player tabs (world, zones) still work without errors
