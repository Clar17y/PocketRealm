# Durability System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make durability a meaningful item sink by tripling degradation, removing the immortality floor, scaling repair costs/decay by tier/rarity, and adding combat-context degradation multipliers.

**Architecture:** Constants-only rebalance with targeted logic changes in `durabilityService.ts` (add multiplier param) and `repairService.ts` (rarity-aware decay, tier-aware cost, item destruction). No new database tables or API endpoints.

**Tech Stack:** TypeScript, Vitest, Prisma

**Spec:** `docs/superpowers/specs/2026-03-14-durability-system-overhaul-design.md`

---

## File Structure

| File | Role |
|---|---|
| `packages/shared/src/constants/gameConstants.ts` | Durability constants (source of truth) |
| `apps/api/src/services/durabilityService.ts` | Combat degradation logic |
| `apps/api/src/services/durabilityService.test.ts` | Degradation tests |
| `apps/api/src/services/repairService.ts` | Repair logic, item destruction |
| `apps/api/src/services/repairService.test.ts` | Repair tests |
| `apps/api/src/routes/inventory.ts` | Repair API routes |
| `apps/web/src/lib/api/items.ts` | Frontend API response types |

---

## Task 1: Update DURABILITY_CONSTANTS

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:176-194`

- [ ] **Step 1: Replace DURABILITY_CONSTANTS block**

Replace the entire `DURABILITY_CONSTANTS` object (lines 176-194) with:

```ts
export const DURABILITY_CONSTANTS = {
  /** Durability lost per hit landed (weapon) or received (armor) */
  COMBAT_DEGRADATION: 0.03,

  /** Combat-context multipliers applied to base degradation */
  DEGRADATION_MULTIPLIER: {
    default: 1,
    elite: 1.5,
    mini_boss: 2,
    final_boss: 3,
    world_boss: 3,
  } as const,

  /** Turn cost to repair by item tier */
  REPAIR_TURN_COST_BY_TIER: {
    1: 50, 2: 75, 3: 100, 4: 125, 5: 150,
  } as const,

  /** Broken item repair cost = tier cost × this */
  BROKEN_REPAIR_MULTIPLIER: 1.5,

  /** Max durability decay per repair, by rarity */
  REPAIR_MAX_DECAY_BY_RARITY: {
    common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1,
  } as const,

  /** Items destroyed when maxDurability reaches this */
  MIN_MAX_DURABILITY: 0,

  /** Fraction of max durability that triggers low-durability warning */
  WARNING_THRESHOLD: 0.10,
} as const;
```

- [ ] **Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build with no errors.

- [ ] **Step 3: Fix TypeScript references to removed constants**

Search for any references to the removed constants `REPAIR_TURN_COST`, `BROKEN_REPAIR_TURN_COST`, and `REPAIR_MAX_DECAY` across the codebase:

```bash
grep -rn "DURABILITY_CONSTANTS\.\(REPAIR_TURN_COST\b\|BROKEN_REPAIR_TURN_COST\|REPAIR_MAX_DECAY\b\)" packages/ apps/
```

These will be fixed in subsequent tasks, but verify the list matches expectations:
- `repairService.ts` — uses all three (fixed in Task 3)
- `repairService.test.ts` — references `REPAIR_TURN_COST` and `BROKEN_REPAIR_TURN_COST` (fixed in Task 4)

No other files should reference them. If any do, note them for fixing.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "balance: overhaul DURABILITY_CONSTANTS — triple degradation, add multipliers/maps, remove floor"
```

---

## Task 2: Update durabilityService — degradation multiplier

**Files:**
- Modify: `apps/api/src/services/durabilityService.ts:32-41`
- Modify: `apps/api/src/services/durabilityService.test.ts`

- [ ] **Step 1: Write failing tests for multiplier**

Add these tests to the end of the `degradeEquippedDurability` describe block in `durabilityService.test.ts`:

```ts
  it('applies degradation multiplier to weapon and armor', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'weapon-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          id: 'armor-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Shield', itemType: 'armor', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 10 player hits, 5 mob hits, 2x multiplier
    // weapon: 10 * 0.03 * 2 = 0.60, armor: 5 * 0.03 * 2 = 0.30
    const losses = await degradeEquippedDurability('p1', makeLog(10, 5), 'combatantA', 2);
    const weapon = losses.find(l => l.itemName === 'Sword')!;
    const armor = losses.find(l => l.itemName === 'Shield')!;
    expect(weapon.amount).toBe(0.6);
    expect(weapon.newDurability).toBe(49.4);
    expect(armor.amount).toBe(0.3);
    expect(armor.newDurability).toBe(49.7);
  });

  it('defaults degradation multiplier to 1', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'weapon-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 10 player hits, no multiplier passed → default 1x
    // weapon: 10 * 0.03 * 1 = 0.30
    const losses = await degradeEquippedDurability('p1', makeLog(10, 0));
    expect(losses[0].amount).toBe(0.3);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run durabilityService`
Expected: The two new tests fail (multiplier parameter doesn't exist yet). Existing tests may also fail because `COMBAT_DEGRADATION` changed from 0.01 to 0.03 — that's expected and fixed in the next step.

- [ ] **Step 3: Add multiplier parameter to degradeEquippedDurability**

In `durabilityService.ts`, change the function signature (line 32-35) from:

```ts
export async function degradeEquippedDurability(
  playerId: string,
  combatLog: CombatHitEntry[],
  perspective: CombatActor = 'combatantA',
): Promise<DurabilityLoss[]> {
```

to:

```ts
export async function degradeEquippedDurability(
  playerId: string,
  combatLog: CombatHitEntry[],
  perspective: CombatActor = 'combatantA',
  degradationMultiplier: number = 1,
): Promise<DurabilityLoss[]> {
```

Then change lines 40-41 from:

```ts
  const weaponDegradation = round2(myHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION);
  const armorDegradation = round2(theirHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION);
```

to:

```ts
  const weaponDegradation = round2(myHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);
  const armorDegradation = round2(theirHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);
```

- [ ] **Step 4: Update existing tests for new COMBAT_DEGRADATION value (0.03)**

The `COMBAT_DEGRADATION` changed from 0.01 to 0.03 (3x). Update all expected values in `durabilityService.test.ts`:

**Test "degrades weapon based on player hits landed"** (line 76-81):
- Comment: `5 player hits = 0.15 weapon degradation` (was 0.05)
- `losses[0].newDurability` → `49.85` (was 49.95)
- `losses[0].amount` → `0.15` (was 0.05)

**Test "degrades armor based on mob hits landed"** (line 97-101):
- Comment: `3 mob hits = 0.09 armor degradation` (was 0.03)
- `losses[0].newDurability` → `49.91` (was 49.97)
- `losses[0].amount` → `0.09` (was 0.03)

**Test "applies correct degradation to mixed weapon and armor"** (line 123-129):
- Comment: `10 player hits = 0.30 weapon, 5 mob hits = 0.15 armor` (was 0.10/0.05)
- `weapon.newDurability` → `49.7` (was 49.9)
- `armor.newDurability` → `49.85` (was 49.95)

**Test "skips weapons when no player hits landed"** (line 151-154):
- No value changes needed (test only checks length and name)

**Test "detects broken items"** (line 157-172):
- Comment needs no change — 1 hit * 0.03 = 0.03 > 0.01 current, still breaks
- `losses[0].newDurability` stays `0` (clamped)
- This test still passes because `0.01 - 0.03 < 0` clamps to 0

**Test "detects warning threshold crossing"** (line 192-209):
- Comment: `2 mob hits = 0.06 armor degradation → 10.01 - 0.06 = 9.95` (was 0.02 / 9.99)
- `losses[0].crossedWarningThreshold` → still `true` (9.95 < 10)

**Test "normalizes missing durability to template max"** (line 229-248):
- Comment: `5 player hits = 0.15 weapon degradation → 80 - 0.15 = 79.85` (was 0.05 / 79.95)
- `losses[0].newDurability` → `79.85` (was 79.95)

**Test "flips perspective for combatantB"** (line 266-292):
- `weapon.amount` → `0.15` (was 0.05) — 5 hits * 0.03
- `armor.amount` → `0.3` (was 0.10) — 10 hits * 0.03

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test:api -- --run durabilityService`
Expected: All tests pass, including the two new multiplier tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/durabilityService.ts apps/api/src/services/durabilityService.test.ts
git commit -m "feat: add degradation multiplier to durabilityService (#46)"
```

---

## Task 3: Update repairService — rarity-aware decay, tier-aware cost, item destruction

**Files:**
- Modify: `apps/api/src/services/repairService.ts`

- [ ] **Step 1: Update repairTurnCost signature**

Replace the `repairTurnCost` function (lines 6-11) with:

```ts
/** Compute the turn cost to repair a single item by tier. */
export function repairTurnCost(tier: number, isBroken: boolean): number {
  const baseCost = (DURABILITY_CONSTANTS.REPAIR_TURN_COST_BY_TIER as Record<number, number>)[tier] ?? 100;
  return isBroken
    ? Math.ceil(baseCost * DURABILITY_CONSTANTS.BROKEN_REPAIR_MULTIPLIER)
    : baseCost;
}
```

- [ ] **Step 2: Update repairItemDurability — rarity-aware decay + destruction**

Replace the `repairItemDurability` function (lines 13-40) with:

```ts
/** Apply durability repair to a single item inside a transaction. */
export async function repairItemDurability(
  tx: Prisma.TransactionClient,
  item: {
    id: string;
    ownerId: string;
    currentDurability: number | null;
    maxDurability: number | null;
    rarity: string;
    template: { maxDurability: number };
  },
  randomFn: () => number = Math.random,
): Promise<{ newMax: number; decay: number; destroyed: boolean }> {
  const max = item.maxDurability ?? item.template.maxDurability;
  const maxDecay = (DURABILITY_CONSTANTS.REPAIR_MAX_DECAY_BY_RARITY as Record<string, number>)[item.rarity] ?? 5;
  const decay = Math.min(
    maxDecay,
    Math.max(1, Math.floor(randomFn() * (maxDecay + 1))),
  );
  const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

  if (newMax <= 0) {
    // Item destroyed — unequip and delete
    await tx.playerEquipment.updateMany({
      where: { itemId: item.id },
      data: { itemId: null },
    });
    await tx.item.delete({ where: { id: item.id } });
    return { newMax: 0, decay, destroyed: true };
  }

  const updated = await tx.item.updateMany({
    where: {
      id: item.id,
      ownerId: item.ownerId,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
    },
    data: { maxDurability: newMax, currentDurability: newMax },
  });
  if (updated.count !== 1) {
    throw new AppError(409, 'Item durability changed; try again', 'ITEM_STATE_CHANGED');
  }

  return { newMax, decay, destroyed: false };
}
```

- [ ] **Step 3: Update RepairEquippedResult type**

In the `RepairEquippedResult` interface (lines 42-61), add `destroyed` to the items array type:

```ts
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
    destroyed: boolean;
  }>;
}
```

- [ ] **Step 4: Update repairAllEquipped — use new signatures**

Replace the `repairAllEquipped` function (lines 63-120) with:

```ts
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
    turnCost: repairTurnCost(d.item.template.tier, d.current <= 0),
  }));
  const totalTurnCost = itemCosts.reduce((sum, ic) => sum + ic.turnCost, 0);

  const turnSpend = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

  const repairedItems = [];
  for (const ic of itemCosts) {
    const { newMax, decay, destroyed } = await repairItemDurability(
      tx,
      { ...ic.item, ownerId: playerId },
      randomFn,
    );

    repairedItems.push({
      itemId: ic.item.id,
      name: ic.item.template.name,
      slot: ic.slot,
      turnCost: ic.turnCost,
      currentDurability: newMax,
      maxDurability: newMax,
      maxDurabilityDecay: decay,
      destroyed,
    });
  }

  return { repaired: true, turns: turnSpend, totalTurnCost, items: repairedItems };
}
```

The key change in this function is line `repairTurnCost(d.item.template.tier, d.current <= 0)` — now uses the new tier-aware signature. The `item` spread already includes `rarity` from Prisma, so no query changes needed.

- [ ] **Step 5: Verify the file compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -30`
Expected: Errors only in `inventory.ts` (repair route still uses old `repairTurnCost` signature) and possibly test file. No errors in `repairService.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/repairService.ts
git commit -m "feat: rarity-aware decay, tier-aware cost, item destruction in repairService (#11, #12, #13)"
```

---

## Task 4: Update repairService tests

**Files:**
- Modify: `apps/api/src/services/repairService.test.ts`

- [ ] **Step 1: Update test helper to include rarity and tier**

Replace the `makeEquipped` helper (lines 18-35) with:

```ts
function makeEquipped(items: Array<{
  slot: string;
  id: string;
  rarity?: string;
  currentDurability: number | null;
  maxDurability: number | null;
  template: { name: string; itemType: string; maxDurability: number; tier?: number };
}>) {
  return items.map((i) => ({
    slot: i.slot,
    item: {
      id: i.id,
      ownerId: 'p1',
      rarity: i.rarity ?? 'common',
      currentDurability: i.currentDurability,
      maxDurability: i.maxDurability,
      template: { ...i.template, tier: i.template.tier ?? 1 },
    },
  }));
}
```

- [ ] **Step 2: Update existing tests for new constant values**

**Test "repairs a single damaged item with correct turn cost"** (line 74-79):
- Tier 1 common item, not broken → `repairTurnCost(1, false)` = 50 turns
- Change `result.totalTurnCost` expectation from `DURABILITY_CONSTANTS.REPAIR_TURN_COST` to `50`
- Change `result.items[0].turnCost` expectation from `DURABILITY_CONSTANTS.REPAIR_TURN_COST` to `50`

**Test "uses broken repair cost for items with 0 durability"** (line 96-99):
- Tier 1 common item, broken → `repairTurnCost(1, true)` = `Math.ceil(50 * 1.5)` = 75 turns
- Change `result.totalTurnCost` expectation from `DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST` to `75`
- Change `result.items[0].turnCost` expectation from `DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST` to `75`

**Test "sums costs for multiple damaged items"** (line 125-127):
- Tier 1 common (not broken) = 50, Tier 1 common (broken) = 75, total = 125
- Change `expectedCost` from `DURABILITY_CONSTANTS.REPAIR_TURN_COST + DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST` to `125`

**Test "enforces minimum max durability"** (line 149-168):
- `MIN_MAX_DURABILITY` is now 0. This test was checking that max stays >= 10. Now it should verify the item is destroyed when max reaches 0. Replace this test entirely:

```ts
  it('destroys item when maxDurability reaches 0', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 1,
          maxDurability: 1,
          template: { name: 'Old Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.playerEquipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.delete.mockResolvedValue({});

    // decay of 1 (minimum) → maxDurability 1 - 1 = 0 → destroyed
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.1);

    expect(result.items[0].destroyed).toBe(true);
    expect(result.items[0].maxDurability).toBe(0);
    expect(result.items[0].currentDurability).toBe(0);
    expect(mockPrisma.item.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });
```

- [ ] **Step 3: Add new tests for rarity-scaled decay and tier-scaled cost**

Add these tests to the end of the `repairAllEquipped` describe block:

```ts
  it('scales repair cost by item tier', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'T3 Sword', itemType: 'weapon', maxDurability: 100, tier: 3 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 3, not broken → 100 turns
    expect(result.items[0].turnCost).toBe(100);
    expect(result.totalTurnCost).toBe(100);
  });

  it('applies broken multiplier to tier-scaled cost', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 0,
          maxDurability: 100,
          template: { name: 'T5 Sword', itemType: 'weapon', maxDurability: 100, tier: 5 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 5 broken → ceil(150 * 1.5) = 225 turns
    expect(result.items[0].turnCost).toBe(225);
  });

  it('scales max-durability decay by rarity (legendary = 1)', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          rarity: 'legendary',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Legendary Blade', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    // Any random value — legendary always decays by exactly 1
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.99);

    expect(result.items[0].maxDurabilityDecay).toBe(1);
    expect(result.items[0].maxDurability).toBe(99);
  });

  it('uses higher decay for common rarity', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          rarity: 'common',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Common Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    // randomFn returns 0.99 → floor(0.99 * 6) = 5, clamped to maxDecay 5
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.99);

    expect(result.items[0].maxDurabilityDecay).toBe(5);
    expect(result.items[0].maxDurability).toBe(95);
  });

  it('includes destroyed items in result with turn cost charged', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-ok',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Good Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          slot: 'off_hand',
          id: 'item-doomed',
          currentDurability: 0,
          maxDurability: 1,
          template: { name: 'Dying Shield', itemType: 'armor', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.playerEquipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.delete.mockResolvedValue({});

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.1);

    expect(result.items).toHaveLength(2);
    const ok = result.items.find(i => i.name === 'Good Sword')!;
    const doomed = result.items.find(i => i.name === 'Dying Shield')!;
    expect(ok.destroyed).toBe(false);
    expect(doomed.destroyed).toBe(true);
    // Total cost includes both items
    expect(result.totalTurnCost).toBe(ok.turnCost + doomed.turnCost);
  });
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm run test:api -- --run repairService`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/repairService.test.ts
git commit -m "test: update repairService tests for tier/rarity scaling and item destruction"
```

---

## Task 5: Update inventory route — repair endpoints

**Files:**
- Modify: `apps/api/src/routes/inventory.ts:140-145`

- [ ] **Step 1: Update single-item repair route**

In `apps/api/src/routes/inventory.ts`, the `POST /repair` handler (line 110-159):

Change line 140 from:

```ts
    const baseCost = repairTurnCost(current);
```

to:

```ts
    const baseCost = repairTurnCost(item.template.tier, current <= 0);
```

Change line 145 from:

```ts
    const { newMax, decay } = await repairItemDurability(tx, { ...item, ownerId: playerId });
```

to:

```ts
    const { newMax, decay, destroyed } = await repairItemDurability(tx, { ...item, ownerId: playerId });
```

Change the return block (lines 147-155) from:

```ts
    return {
      repaired: true as const,
      turns: turnSpend,
      turnCost,
      itemId: item.id,
      currentDurability: newMax,
      maxDurability: newMax,
      maxDurabilityDecay: decay,
    };
```

to:

```ts
    return {
      repaired: true as const,
      turns: turnSpend,
      turnCost,
      itemId: item.id,
      currentDurability: destroyed ? 0 : newMax,
      maxDurability: destroyed ? 0 : newMax,
      maxDurabilityDecay: decay,
      destroyed,
    };
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: No type errors in `inventory.ts`. Any remaining errors should be in unrelated files.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/inventory.ts
git commit -m "feat: update repair routes for tier-aware cost and item destruction"
```

---

## Task 6: Update frontend API types

**Files:**
- Modify: `apps/web/src/lib/api/items.ts:66-97`

- [ ] **Step 1: Add destroyed field to repairItem response type**

In `apps/web/src/lib/api/items.ts`, change the `repairItem` return type (lines 67-73) from:

```ts
  return fetchApi<{
    repaired: boolean;
    turns?: TurnStateResponse;
    itemId: string;
    currentDurability: number | null;
    maxDurability: number | null;
    maxDurabilityDecay?: number;
  }>
```

to:

```ts
  return fetchApi<{
    repaired: boolean;
    turns?: TurnStateResponse;
    itemId: string;
    currentDurability: number | null;
    maxDurability: number | null;
    maxDurabilityDecay?: number;
    destroyed?: boolean;
  }>
```

- [ ] **Step 2: Add destroyed field to repairAllEquipped response type**

Change the items array type in `repairAllEquipped` (lines 85-93) from:

```ts
    items: Array<{
      itemId: string;
      name: string;
      slot: string;
      turnCost: number;
      currentDurability: number;
      maxDurability: number;
      maxDurabilityDecay: number;
    }>;
```

to:

```ts
    items: Array<{
      itemId: string;
      name: string;
      slot: string;
      turnCost: number;
      currentDurability: number;
      maxDurability: number;
      maxDurabilityDecay: number;
      destroyed: boolean;
    }>;
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`
Expected: No new type errors from this change.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/items.ts
git commit -m "feat: add destroyed field to repair API response types"
```

---

## Task 7: Full test suite + typecheck verification

**Files:** None (verification only)

- [ ] **Step 1: Run full API test suite**

Run: `npm run test:api -- --run`
Expected: All tests pass. Pay attention to any test that references `DURABILITY_CONSTANTS.REPAIR_TURN_COST`, `BROKEN_REPAIR_TURN_COST`, or `REPAIR_MAX_DECAY` — these constants no longer exist and will cause compile errors if any tests were missed.

- [ ] **Step 2: Run full typecheck**

Run: `npm run typecheck`
Expected: No new type errors. Pre-existing error in `apps/web/src/app/game/page.tsx:333` (string→SkillType) is known and expected.

- [ ] **Step 3: Run game engine tests**

Run: `npm run test:engine -- --run`
Expected: All pass. The `sellPrice.ts` in game-engine doesn't reference any changed constants.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

- [ ] **Step 5: Commit (if any fixups were needed)**

If any test or typecheck failures required fixes, commit them:

```bash
git add -A
git commit -m "fix: address test/typecheck issues from durability overhaul"
```

---

## Task 8: Update balance tracker

**Files:**
- Modify: `docs/loop-balance/tracker.md`

- [ ] **Step 1: Add implementation plan entry**

In `docs/loop-balance/tracker.md`, under the `### Ready to Implement (plans written)` section (after line 140), add:

```
8. [Durability System Overhaul](plans/08-durability-system-overhaul.md) — #11, #12, #13, #44, #45, #46
```

- [ ] **Step 2: Move from "Needs Brainstorm First" to tracker rows**

Remove the line `- **Durability System Overhaul** — #11, #12, #13, #44, #45, #46` from the "Needs Brainstorm First" section.

- [ ] **Step 3: Commit**

```bash
git add docs/loop-balance/tracker.md
git commit -m "docs: link durability overhaul plan to tracker"
```
