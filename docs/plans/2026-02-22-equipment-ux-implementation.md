# Equipment & Inventory UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Repair All" and individual repair buttons to the equipment screen, and split the inventory screen into Equipped/Backpack sections.

**Architecture:** New `POST /inventory/repair-equipped` API endpoint handles batch repair in a single Prisma transaction. Equipment component gets new repair props and a confirmation dialog. Inventory component splits items into two visual sections.

**Tech Stack:** Express route + Prisma transaction (backend), React components (frontend), Vitest (tests)

---

### Task 1: Backend — `POST /inventory/repair-equipped` Route

**Files:**
- Modify: `apps/api/src/routes/inventory.ts` (add new route after existing `/repair`)

**Step 1: Write the route handler**

Add the following route after the existing `POST /repair` handler (after line 156) in `apps/api/src/routes/inventory.ts`:

```typescript
/**
 * POST /api/v1/inventory/repair-equipped
 * Repair all damaged equipped items in a single transaction.
 */
inventoryRouter.post('/repair-equipped', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const result = await prisma.$transaction(async (tx) => {
    // Fetch all equipped items with their templates
    const equipped = await tx.playerEquipment.findMany({
      where: { playerId, itemId: { not: null } },
      include: {
        item: { include: { template: true } },
      },
    });

    // Filter to damaged weapon/armor items
    const damaged = equipped
      .filter((e) => {
        if (!e.item) return false;
        const t = e.item.template;
        if (t.itemType !== 'weapon' && t.itemType !== 'armor') return false;
        const current = e.item.currentDurability ?? t.maxDurability;
        const max = e.item.maxDurability ?? t.maxDurability;
        return current < max;
      })
      .map((e) => {
        const item = e.item!;
        const t = item.template;
        const current = item.currentDurability ?? t.maxDurability;
        return { slot: e.slot, item, current };
      });

    if (damaged.length === 0) {
      return { repaired: false as const, totalTurnCost: 0, items: [] };
    }

    // Calculate total turn cost
    const itemCosts = damaged.map((d) => ({
      ...d,
      turnCost: d.current <= 0
        ? DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST
        : DURABILITY_CONSTANTS.REPAIR_TURN_COST,
    }));
    const totalTurnCost = itemCosts.reduce((sum, ic) => sum + ic.turnCost, 0);

    // Spend turns (throws if insufficient)
    const turnSpend = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

    // Repair each item
    const repairedItems = [];
    for (const ic of itemCosts) {
      const max = ic.item.maxDurability ?? ic.item.template.maxDurability;
      const decay = Math.min(
        DURABILITY_CONSTANTS.REPAIR_MAX_DECAY,
        Math.max(1, Math.floor(Math.random() * (DURABILITY_CONSTANTS.REPAIR_MAX_DECAY + 1)))
      );
      const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

      const updated = await tx.item.updateMany({
        where: {
          id: ic.item.id,
          ownerId: playerId,
          currentDurability: ic.item.currentDurability,
          maxDurability: ic.item.maxDurability,
        },
        data: {
          maxDurability: newMax,
          currentDurability: newMax,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, 'Item durability changed; try again', 'ITEM_STATE_CHANGED');
      }

      repairedItems.push({
        itemId: ic.item.id,
        name: ic.item.template.name,
        slot: ic.slot,
        turnCost: ic.turnCost,
        currentDurability: newMax,
        maxDurability: newMax,
        maxDurabilityDecay: decay,
      });
    }

    return {
      repaired: true as const,
      turns: turnSpend,
      totalTurnCost,
      items: repairedItems,
    };
  });

  res.json(result);
}));
```

**Step 2: Verify the API builds**

Run: `npm run build:api`
Expected: clean build, no errors

**Step 3: Commit**

```bash
git add apps/api/src/routes/inventory.ts
git commit -m "feat(api): add POST /inventory/repair-equipped batch endpoint"
```

---

### Task 2: Backend Tests — Repair Equipped

**Files:**
- Create: `apps/api/src/routes/inventory.repair-equipped.test.ts`

**Step 1: Write tests**

Create `apps/api/src/routes/inventory.repair-equipped.test.ts` (we test the route logic via mocked prisma, same pattern as `durabilityService.test.ts`):

Since the route handler contains the logic inline (not extracted to a service), we need to test it at the route level. However, the simplest approach matching project patterns is to extract a thin helper and test that. But to keep YAGNI, we'll leave the logic in the route and note that integration testing covers it via manual testing.

**Alternative: extract a service function for testability.**

Create `apps/api/src/services/repairService.ts`:

```typescript
import { Prisma } from '@adventure/database';
import { DURABILITY_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';

export interface RepairEquippedResult {
  repaired: boolean;
  turns?: {
    previousTurns: number;
    spent: number;
    currentTurns: number;
    lastRegenAt: string;
    timeToCapMs: number | null;
  };
  totalTurnCost: number;
  items: Array<{
    itemId: string;
    name: string;
    slot: string;
    turnCost: number;
    currentDurability: number;
    maxDurability: number;
    maxDurabilityDecay: number;
  }>;
}

export async function repairAllEquipped(
  tx: Prisma.TransactionClient,
  playerId: string,
  randomFn: () => number = Math.random,
): Promise<RepairEquippedResult> {
  const equipped = await tx.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    include: { item: { include: { template: true } } },
  });

  const damaged = equipped
    .filter((e) => {
      if (!e.item) return false;
      const t = e.item.template;
      if (t.itemType !== 'weapon' && t.itemType !== 'armor') return false;
      const current = e.item.currentDurability ?? t.maxDurability;
      const max = e.item.maxDurability ?? t.maxDurability;
      return current < max;
    })
    .map((e) => {
      const item = e.item!;
      const current = item.currentDurability ?? item.template.maxDurability;
      return { slot: e.slot, item, current };
    });

  if (damaged.length === 0) {
    return { repaired: false, totalTurnCost: 0, items: [] };
  }

  const itemCosts = damaged.map((d) => ({
    ...d,
    turnCost: d.current <= 0
      ? DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST
      : DURABILITY_CONSTANTS.REPAIR_TURN_COST,
  }));
  const totalTurnCost = itemCosts.reduce((sum, ic) => sum + ic.turnCost, 0);

  const turnSpend = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

  const repairedItems = [];
  for (const ic of itemCosts) {
    const max = ic.item.maxDurability ?? ic.item.template.maxDurability;
    const decay = Math.min(
      DURABILITY_CONSTANTS.REPAIR_MAX_DECAY,
      Math.max(1, Math.floor(randomFn() * (DURABILITY_CONSTANTS.REPAIR_MAX_DECAY + 1)))
    );
    const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

    const updated = await tx.item.updateMany({
      where: {
        id: ic.item.id,
        ownerId: playerId,
        currentDurability: ic.item.currentDurability,
        maxDurability: ic.item.maxDurability,
      },
      data: { maxDurability: newMax, currentDurability: newMax },
    });
    if (updated.count !== 1) {
      throw new AppError(409, 'Item durability changed; try again', 'ITEM_STATE_CHANGED');
    }

    repairedItems.push({
      itemId: ic.item.id,
      name: ic.item.template.name,
      slot: ic.slot,
      turnCost: ic.turnCost,
      currentDurability: newMax,
      maxDurability: newMax,
      maxDurabilityDecay: decay,
    });
  }

  return { repaired: true, turns: turnSpend, totalTurnCost, items: repairedItems };
}
```

Then update the route in `apps/api/src/routes/inventory.ts` to use this service:

```typescript
import { repairAllEquipped } from '../services/repairService';

// Replace the inline route logic with:
inventoryRouter.post('/repair-equipped', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await prisma.$transaction(async (tx) => {
    return repairAllEquipped(tx, playerId);
  });
  res.json(result);
}));
```

**Step 2: Write the test file**

Create `apps/api/src/services/repairService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DURABILITY_CONSTANTS } from '@adventure/shared';
import { mockPrisma } from '../__test__/setup';
import { repairAllEquipped } from './repairService';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 10000,
    spent: 0,
    currentTurns: 10000,
    lastRegenAt: new Date().toISOString(),
    timeToCapMs: null,
  }),
}));

import { spendPlayerTurnsTx } from './turnBankService';

const mockSpendTurns = spendPlayerTurnsTx as unknown as ReturnType<typeof vi.fn>;

function makeEquipped(items: Array<{
  slot: string;
  id: string;
  currentDurability: number | null;
  maxDurability: number | null;
  template: { name: string; itemType: string; maxDurability: number };
}>) {
  return items.map((item) => ({
    slot: item.slot,
    itemId: item.id,
    item: {
      id: item.id,
      ownerId: 'p1',
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
      template: item.template,
    },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
  mockSpendTurns.mockResolvedValue({
    previousTurns: 10000,
    spent: 0,
    currentTurns: 10000,
    lastRegenAt: new Date().toISOString(),
    timeToCapMs: null,
  });
});

describe('repairAllEquipped', () => {
  it('returns repaired:false when no items are damaged', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([{
        slot: 'main_hand',
        id: 'item-1',
        currentDurability: 100,
        maxDurability: 100,
        template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
      }])
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1');
    expect(result.repaired).toBe(false);
    expect(result.items).toEqual([]);
    expect(mockSpendTurns).not.toHaveBeenCalled();
  });

  it('repairs a single damaged item with correct turn cost', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([{
        slot: 'chest',
        id: 'item-1',
        currentDurability: 50,
        maxDurability: 100,
        template: { name: 'Iron Plate', itemType: 'armor', maxDurability: 100 },
      }])
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);
    expect(result.repaired).toBe(true);
    expect(result.totalTurnCost).toBe(DURABILITY_CONSTANTS.REPAIR_TURN_COST);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].slot).toBe('chest');
    expect(mockSpendTurns).toHaveBeenCalledWith(
      mockPrisma, 'p1', DURABILITY_CONSTANTS.REPAIR_TURN_COST
    );
  });

  it('uses broken repair cost for items with 0 durability', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([{
        slot: 'main_hand',
        id: 'item-1',
        currentDurability: 0,
        maxDurability: 100,
        template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
      }])
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);
    expect(result.totalTurnCost).toBe(DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST);
    expect(result.items[0].turnCost).toBe(DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST);
  });

  it('sums costs for multiple damaged items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          slot: 'chest',
          id: 'item-2',
          currentDurability: 0,
          maxDurability: 80,
          template: { name: 'Plate', itemType: 'armor', maxDurability: 100 },
        },
      ])
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);
    expect(result.totalTurnCost).toBe(
      DURABILITY_CONSTANTS.REPAIR_TURN_COST + DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST
    );
    expect(result.items).toHaveLength(2);
  });

  it('skips non-weapon/armor equipped items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([{
        slot: 'charm',
        id: 'item-1',
        currentDurability: 50,
        maxDurability: 100,
        template: { name: 'Lucky Charm', itemType: 'consumable', maxDurability: 100 },
      }])
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1');
    expect(result.repaired).toBe(false);
    expect(result.items).toEqual([]);
  });

  it('enforces minimum max durability', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([{
        slot: 'main_hand',
        id: 'item-1',
        currentDurability: 5,
        maxDurability: DURABILITY_CONSTANTS.MIN_MAX_DURABILITY,
        template: { name: 'Old Sword', itemType: 'weapon', maxDurability: 100 },
      }])
    );

    // randomFn returns 0.99 → max decay
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.99);
    expect(result.items[0].maxDurability).toBe(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY);
  });

  it('throws on optimistic lock failure', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([{
        slot: 'main_hand',
        id: 'item-1',
        currentDurability: 50,
        maxDurability: 100,
        template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
      }])
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repairAllEquipped(mockPrisma as any, 'p1', () => 0.5)
    ).rejects.toThrow('Item durability changed');
  });
});
```

**Step 3: Run the tests**

Run: `npm run test:api -- --run repairService`
Expected: all tests pass

**Step 4: Commit**

```bash
git add apps/api/src/services/repairService.ts apps/api/src/services/repairService.test.ts apps/api/src/routes/inventory.ts
git commit -m "feat(api): extract repairService with repairAllEquipped + tests"
```

---

### Task 3: Frontend API Client — `repairAllEquipped`

**Files:**
- Modify: `apps/web/src/lib/api/items.ts` (add new function after `repairItem`)
- Modify: `apps/web/src/lib/api/index.ts` (re-export new function)

**Step 1: Add API function**

In `apps/web/src/lib/api/items.ts`, add after the `repairItem` function (after line 68):

```typescript
export async function repairAllEquipped() {
  return fetchApi<{
    repaired: boolean;
    turns?: TurnStateResponse;
    totalTurnCost: number;
    items: Array<{
      itemId: string;
      name: string;
      slot: string;
      turnCost: number;
      currentDurability: number;
      maxDurability: number;
      maxDurabilityDecay: number;
    }>;
  }>('/api/v1/inventory/repair-equipped', {
    method: 'POST',
  });
}
```

**Step 2: Re-export from index**

In `apps/web/src/lib/api/index.ts`, add `repairAllEquipped` to the items export block (line 56, after `repairItem`):

```typescript
  repairAllEquipped,
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api/items.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): add repairAllEquipped API client function"
```

---

### Task 4: Game Controller — `handleRepairAllEquipped`

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Import the new API function**

Add `repairAllEquipped` to the import from `@/lib/api` (line 45 area, alongside `repairItem`).

**Step 2: Add handler function**

Add after `handleRepairItem` (around line 1455):

```typescript
const handleRepairAllEquipped = async () => {
  await runAction('repair_all', async () => {
    const res = await repairAllEquipped();
    const data = res.data;
    if (!data) {
      setActionError(res.error?.message ?? 'Repair all failed');
      return;
    }
    if (data.turns) setTurns(data.turns.currentTurns);
    await loadAll();
  });
};
```

**Step 3: Add to return object**

Add `handleRepairAllEquipped` to the return object (around line 1812, after `handleRepairItem`).

**Step 4: Verify build**

Run: `npm run build:web`
Expected: clean build (aside from pre-existing TS error on page.tsx:333)

**Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat(web): add handleRepairAllEquipped to game controller"
```

---

### Task 5: Equipment Screen — Add Repair Props and Individual Repair

**Files:**
- Modify: `apps/web/src/components/screens/Equipment.tsx`

**Step 1: Extend EquipmentProps interface**

Add three new props to the `EquipmentProps` interface (after `onUnequip`, around line 47):

```typescript
onRepairItem?: (itemId: string) => void | Promise<void>;
onRepairAll?: () => void | Promise<void>;
turns?: number;
```

**Step 2: Destructure new props**

Update the component signature to destructure the new props:

```typescript
export function Equipment({ slots, inventoryItems, onEquip, onUnequip, onRepairItem, onRepairAll, turns, stats }: EquipmentProps) {
```

**Step 3: Compute repair data**

Add after the `candidates` useMemo (around line 106), before `closeModal`:

```typescript
const repairableItems = useMemo(() => {
  return slots
    .filter((s) => s.item && s.item.durability < s.item.maxDurability)
    .map((s) => {
      const item = s.item!;
      const turnCost = item.durability <= 0 ? 150 : 100;
      return { slotId: s.id, slotName: s.name, item, turnCost };
    });
}, [slots]);

const totalRepairCost = useMemo(
  () => repairableItems.reduce((sum, r) => sum + r.turnCost, 0),
  [repairableItems]
);
```

**Step 4: Add individual repair buttons to Equipped Items List**

In the "Equipped Items List" section (around line 583-644), modify each item card to include a repair button. Inside the `<PixelCard key={slot.id} padding="sm">`, after the existing content and before the closing `</PixelCard>`, check if the item needs repair and show a button.

Update the slot map to add a repair button next to the slot name label. Specifically, change the flex layout at line 606-613 to include a repair button:

```typescript
<div className="flex items-baseline justify-between mb-1">
  <span className="font-semibold text-[var(--rpg-text-primary)] text-sm">
    {slot.item?.name}
    {slot.item && slot.item.durability <= 0 && (
      <span className="ml-1.5 text-[10px] font-bold text-[var(--rpg-red)] bg-[var(--rpg-red)]/10 px-1 py-0.5 rounded">BROKEN</span>
    )}
  </span>
  <div className="flex items-center gap-2">
    {onRepairItem && slot.item && slot.item.durability < slot.item.maxDurability && (
      <PixelButton
        variant="secondary"
        size="sm"
        disabled={busy || (turns !== undefined && turns < (slot.item.durability <= 0 ? 150 : 100))}
        onClick={async () => {
          setBusy(true);
          try {
            await onRepairItem(slot.item!.id);
          } catch {
            setError('Failed to repair item.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Repair ({slot.item.durability <= 0 ? '150' : '100'})
      </PixelButton>
    )}
    <span className="text-xs text-[var(--rpg-text-secondary)] capitalize">{slot.name}</span>
  </div>
</div>
```

**Step 5: Verify build**

Run: `npm run build:web`
Expected: clean build

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/Equipment.tsx
git commit -m "feat(web): add individual repair buttons to equipment screen"
```

---

### Task 6: Equipment Screen — Repair All Button with Confirmation Dialog

**Files:**
- Modify: `apps/web/src/components/screens/Equipment.tsx`

**Step 1: Add state for confirmation dialog**

Add to the state block (after `error` state around line 94):

```typescript
const [showRepairAll, setShowRepairAll] = useState(false);
```

**Step 2: Add Repair All button between equipment grid and stats panel**

After the closing `</PixelCard>` of the "Character Equipment Grid" (around line 495), add:

```typescript
{/* Repair All */}
{onRepairAll && repairableItems.length > 0 && (
  <PixelButton
    variant="primary"
    className="w-full"
    disabled={busy || (turns !== undefined && turns < totalRepairCost)}
    onClick={() => setShowRepairAll(true)}
  >
    Repair All ({totalRepairCost} turns)
  </PixelButton>
)}
```

**Step 3: Add confirmation dialog**

After the Repair All button, add the confirmation modal:

```typescript
{/* Repair All Confirmation */}
{showRepairAll && (
  <div
    className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
    onClick={() => setShowRepairAll(false)}
  >
    <PixelCard className="max-w-sm w-full" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-[var(--rpg-text-primary)]">Repair All Equipment</h3>
        <button
          onClick={() => setShowRepairAll(false)}
          className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
        {repairableItems.map((r) => (
          <div key={r.slotId} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {r.item.imageSrc ? (
                <img src={r.item.imageSrc} alt={r.item.name} className="w-6 h-6 object-contain image-rendering-pixelated" />
              ) : (
                <span className="text-sm">{r.item.icon ?? '❓'}</span>
              )}
              <span className="text-[var(--rpg-text-primary)]">{r.item.name}</span>
              {r.item.durability <= 0 && (
                <span className="text-[8px] font-bold text-[var(--rpg-red)] bg-[var(--rpg-red)]/10 px-1 rounded">BROKEN</span>
              )}
            </div>
            <span className="font-mono text-[var(--rpg-text-secondary)]">{r.turnCost}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--rpg-border)] pt-3 mb-3">
        <div className="flex justify-between text-sm font-bold">
          <span className="text-[var(--rpg-text-primary)]">Total Cost</span>
          <span className="font-mono text-[var(--rpg-gold)]">{totalRepairCost} turns</span>
        </div>
      </div>

      <div className="text-xs text-[var(--rpg-text-secondary)] mb-4">
        Max durability will decrease slightly for each repaired item.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PixelButton
          variant="secondary"
          onClick={() => setShowRepairAll(false)}
          disabled={busy}
        >
          Cancel
        </PixelButton>
        <PixelButton
          variant="primary"
          disabled={busy || (turns !== undefined && turns < totalRepairCost)}
          onClick={async () => {
            if (!onRepairAll) return;
            setBusy(true);
            try {
              await onRepairAll();
              setShowRepairAll(false);
            } catch {
              setError('Failed to repair equipment.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm
        </PixelButton>
      </div>
    </PixelCard>
  </div>
)}
```

**Step 4: Verify build**

Run: `npm run build:web`
Expected: clean build

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Equipment.tsx
git commit -m "feat(web): add Repair All button with confirmation dialog to equipment screen"
```

---

### Task 7: Wire Equipment Screen Props in page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Pass new props to Equipment component**

In the `case 'equipment':` section (around line 510-511), add the new props after `onUnequip={handleUnequipSlot}`:

```typescript
onRepairItem={handleRepairItem}
onRepairAll={handleRepairAllEquipped}
turns={turns}
```

Make sure `handleRepairAllEquipped` is destructured from `useGameController()` at the top of the component (alongside `handleRepairItem`).

**Step 2: Verify build**

Run: `npm run build:web`
Expected: clean build

**Step 3: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat(web): wire repair props to Equipment screen in page.tsx"
```

---

### Task 8: Inventory Screen — Equipped/Backpack Sections

**Files:**
- Modify: `apps/web/src/components/screens/Inventory.tsx`

**Step 1: Split items into equipped and backpack**

In the `Inventory` component, after the existing state declarations (around line 60), add:

```typescript
const equippedItems = items.filter((item) => item.equippedSlot);
const backpackItems = items.filter((item) => !item.equippedSlot);
```

**Step 2: Replace the item grid**

Replace the existing item grid section (lines 98-118) with two sections:

```typescript
{/* Equipped Items */}
{equippedItems.length > 0 && (
  <div className="space-y-2">
    <div className="text-sm font-semibold text-[var(--rpg-text-secondary)]">
      Equipped ({equippedItems.length})
    </div>
    <div className="grid grid-cols-6 gap-2">
      {equippedItems.map((item) => (
        <ItemCard
          key={item.id}
          name={item.name}
          icon={item.icon}
          imageSrc={item.imageSrc}
          quantity={item.quantity}
          rarity={item.rarity}
          onClick={() => setSelectedItem(item)}
        />
      ))}
    </div>
  </div>
)}

{/* Backpack Items */}
<div className="space-y-2">
  <div className="text-sm font-semibold text-[var(--rpg-text-secondary)]">
    Backpack ({backpackItems.length})
  </div>
  <div className="grid grid-cols-6 gap-2">
    {backpackItems.map((item) => (
      <ItemCard
        key={item.id}
        name={item.name}
        icon={item.icon}
        imageSrc={item.imageSrc}
        quantity={item.quantity}
        rarity={item.rarity}
        onClick={() => setSelectedItem(item)}
      />
    ))}
    {/* Empty slots */}
    {Array.from({ length: Math.max(0, 24 - backpackItems.length) }).map((_, idx) => (
      <div
        key={`empty-${idx}`}
        className="aspect-square bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg opacity-30"
      />
    ))}
  </div>
</div>
```

**Step 3: Update the header item count**

Change the header (line 95) from `{items.length} items` to show total:

```typescript
<div className="text-sm text-[var(--rpg-text-secondary)]">{items.length} items</div>
```

(Keep as-is — the total count in the header is still useful.)

**Step 4: Verify build**

Run: `npm run build:web`
Expected: clean build

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Inventory.tsx
git commit -m "feat(web): split inventory into Equipped and Backpack sections"
```

---

### Task 9: Manual Testing & Cleanup

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test equipment screen repair**

1. Navigate to Equipment screen
2. Verify individual repair buttons appear on damaged items
3. Verify "Repair All" button appears when items are damaged
4. Click "Repair All" → verify confirmation dialog shows correct items and costs
5. Confirm repair → verify items are repaired and turns are deducted
6. Verify buttons disappear when all items are at full durability

**Step 3: Test inventory screen sections**

1. Navigate to Inventory screen
2. Verify equipped items appear in "Equipped (X)" section at top
3. Verify unequipped items appear in "Backpack (X)" section below
4. Verify clicking items still opens the detail modal correctly
5. Verify equipping/unequipping moves items between sections

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
