# Equipment & Inventory UX Improvements

## Problem

- Equipment screen has no repair functionality; players must navigate to inventory, find each item, and repair one-by-one
- Inventory screen mixes equipped and unequipped items with no visual grouping

## Solution

Three changes: new batch repair endpoint, equipment screen repair capabilities, inventory screen equipped-item grouping.

---

## 1. Backend: `POST /inventory/repair-equipped`

Repairs all damaged equipped items in a single atomic transaction.

**Flow:**
1. Fetch equipped items with `currentDurability < maxDurability`
2. Return early if none damaged
3. Calculate total turn cost (100/item, 150/broken item)
4. Fail if insufficient turns
5. Single Prisma transaction: spend turns, update each item's durability with random max decay

**Response:**
```typescript
{
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
}
```

## 2. Equipment Screen: Repair All + Individual Repair

**New props:** `onRepairItem`, `onRepairAll`, `turns`

**Repair All button:**
- Between equipment grid and Total Stats panel
- Shows total turn cost, disabled when nothing to repair or insufficient turns
- Confirmation dialog: lists items, per-item cost, total cost, max durability decay warning

**Individual repair buttons:**
- On each item card in "Equipped Items" list
- Shows turn cost "(100)" or "(150)" for broken
- Disabled at full durability or insufficient turns
- No confirmation (single item, fast action)

## 3. Inventory Screen: Equipped/Backpack Sections

Split item grid into two sections:

1. **Equipped (X)** — items with `equippedSlot` set, shown first in same 6-column grid
2. **Backpack (X/24)** — remaining items with empty slot placeholders

No changes to the existing detail modal or action buttons.
