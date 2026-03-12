# Rare Crafting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the crafting crit system so a single roll can produce rare or epic gear (legendary never craftable).

**Architecture:** The existing `calculateCraftingCrit()` uses a single roll against one threshold. We add two smaller thresholds (epic < rare < crit) checked in order against the same roll. The API route replaces its hardcoded rarity mapping with `critResult.rarity`.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add rare/epic crafting constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:182-222`

**Step 1: Add 8 constants to `CRAFTING_CONSTANTS`**

Insert before the `SALVAGE_TURN_COST` line (line 214). Add these after `MIN_BONUS_MAGNITUDE`:

```typescript
  // Rare Craft (chance a crit produces rare instead of uncommon)
  RARE_CRAFT_BASE_CHANCE: 0.005,
  RARE_CRAFT_CHANCE_PER_LEVEL: 0.001,
  RARE_CRAFT_LUCK_BONUS_PER_POINT: 0.0005,
  RARE_CRAFT_MAX_CHANCE: 0.04,

  // Epic Craft (chance a crit produces epic)
  EPIC_CRAFT_BASE_CHANCE: 0.0005,
  EPIC_CRAFT_CHANCE_PER_LEVEL: 0.0001,
  EPIC_CRAFT_LUCK_BONUS_PER_POINT: 0.00005,
  EPIC_CRAFT_MAX_CHANCE: 0.004,
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add rare/epic crafting chance constants"
```

---

### Task 2: Write failing tests for tiered crit

**Files:**
- Modify: `packages/game-engine/src/crafting/craftingCrit.test.ts`

**Step 1: Add imports**

Add `calculateRareCraftChance` and `calculateEpicCraftChance` to the existing import block at the top of the file:

```typescript
import {
  calculateCraftingCrit,
  calculateCritChance,
  calculateRareCraftChance,
  calculateEpicCraftChance,
  getEligibleBonusStats,
  rollBonusStat,
} from './craftingCrit';
```

**Step 2: Add `calculateRareCraftChance` tests**

Add after the existing `calculateCritChance` describe block (after line 22):

```typescript
describe('calculateRareCraftChance', () => {
  it('returns base rare chance at exact recipe level', () => {
    expect(calculateRareCraftChance(10, 10, 0)).toBeCloseTo(0.005);
  });

  it('scales with level advantage and luck', () => {
    // 0.005 + 10*0.001 + 15*0.0005 = 0.005 + 0.01 + 0.0075 = 0.0225
    expect(calculateRareCraftChance(20, 10, 15)).toBeCloseTo(0.0225);
  });

  it('clamps to max', () => {
    expect(calculateRareCraftChance(100, 1, 500)).toBeCloseTo(0.04);
  });

  it('floors at 0 when underlevel', () => {
    expect(calculateRareCraftChance(1, 50, 0)).toBe(0);
  });
});
```

**Step 3: Add `calculateEpicCraftChance` tests**

```typescript
describe('calculateEpicCraftChance', () => {
  it('returns base epic chance at exact recipe level', () => {
    expect(calculateEpicCraftChance(10, 10, 0)).toBeCloseTo(0.0005);
  });

  it('scales with level advantage and luck', () => {
    // 0.0005 + 10*0.0001 + 15*0.00005 = 0.0005 + 0.001 + 0.00075 = 0.00225
    expect(calculateEpicCraftChance(20, 10, 15)).toBeCloseTo(0.00225);
  });

  it('clamps to max', () => {
    expect(calculateEpicCraftChance(100, 1, 500)).toBeCloseTo(0.004);
  });

  it('floors at 0 when underlevel', () => {
    expect(calculateEpicCraftChance(1, 50, 0)).toBe(0);
  });
});
```

**Step 4: Add tiered crit result tests to the existing `calculateCraftingCrit` describe block**

Add these tests inside the existing `describe('calculateCraftingCrit', ...)` block (after the last `it` at line 222):

```typescript
  it('returns rarity epic when roll is below epic threshold', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.001,   // below epicCraftChance (0.0005) — wait, 0.001 > 0.0005
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    // critRoll 0.001 > epicCraftChance 0.0005, so NOT epic
    // critRoll 0.001 < rareCraftChance 0.005, so rare
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('rare');
  });

  it('returns rarity epic when roll is below epic threshold', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.0001,  // below epicCraftChance (0.0005)
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('epic');
  });

  it('returns rarity uncommon for normal crit (above rare threshold)', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.01,    // above rareCraftChance (0.005), below critChance (0.05)
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('uncommon');
  });

  it('returns rarity common when roll misses crit', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.9,     // above critChance (0.05)
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(false);
    expect(result.rarity).toBe('common');
  });

  it('returns rarity common for non-equipment even with low roll', () => {
    const result = calculateCraftingCrit({
      skillLevel: 20,
      requiredLevel: 1,
      luckStat: 20,
      itemType: 'resource',
      baseStats: {},
    }, {
      critRoll: 0,
    });
    expect(result.isCrit).toBe(false);
    expect(result.rarity).toBe('common');
  });
```

**Step 5: Run tests to verify they fail**

Run: `npm run test:engine -- --reporter=verbose 2>&1 | head -80`
Expected: FAIL — `calculateRareCraftChance` and `calculateEpicCraftChance` are not exported, and `rarity` property doesn't exist on `CraftingCritResult`.

**Step 6: Commit**

```bash
git add packages/game-engine/src/crafting/craftingCrit.test.ts
git commit -m "test: add failing tests for tiered crafting crit"
```

---

### Task 3: Implement tiered crit in game-engine

**Files:**
- Modify: `packages/game-engine/src/crafting/craftingCrit.ts`

**Step 1: Add `ItemRarity` import**

Add `type ItemRarity` to the existing import from `@adventure/shared` (line 1-8):

```typescript
import {
  CRAFTING_CONSTANTS,
  CRIT_STAT_CONSTANTS,
  SLOT_STAT_POOLS,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@adventure/shared';
```

**Step 2: Add `rarity` to `CraftingCritResult` interface**

Update `CraftingCritResult` (line 27-32) to:

```typescript
export interface CraftingCritResult {
  isCrit: boolean;
  rarity: ItemRarity;
  critChance: number;
  rareCraftChance: number;
  epicCraftChance: number;
  bonusStat: CraftingCritStat | null;
  bonusValue: number | null;
}
```

**Step 3: Add `calculateRareCraftChance` function**

Add after `calculateCritChance` (after line 61):

```typescript
export function calculateRareCraftChance(
  skillLevel: number,
  requiredLevel: number,
  luckStat: number
): number {
  const levelDelta = skillLevel - requiredLevel;
  const luckBonus = luckStat * CRAFTING_CONSTANTS.RARE_CRAFT_LUCK_BONUS_PER_POINT;
  const rawChance = CRAFTING_CONSTANTS.RARE_CRAFT_BASE_CHANCE +
    levelDelta * CRAFTING_CONSTANTS.RARE_CRAFT_CHANCE_PER_LEVEL +
    luckBonus;

  return clamp(rawChance, 0, CRAFTING_CONSTANTS.RARE_CRAFT_MAX_CHANCE);
}
```

**Step 4: Add `calculateEpicCraftChance` function**

Add immediately after `calculateRareCraftChance`:

```typescript
export function calculateEpicCraftChance(
  skillLevel: number,
  requiredLevel: number,
  luckStat: number
): number {
  const levelDelta = skillLevel - requiredLevel;
  const luckBonus = luckStat * CRAFTING_CONSTANTS.EPIC_CRAFT_LUCK_BONUS_PER_POINT;
  const rawChance = CRAFTING_CONSTANTS.EPIC_CRAFT_BASE_CHANCE +
    levelDelta * CRAFTING_CONSTANTS.EPIC_CRAFT_CHANCE_PER_LEVEL +
    luckBonus;

  return clamp(rawChance, 0, CRAFTING_CONSTANTS.EPIC_CRAFT_MAX_CHANCE);
}
```

**Step 5: Rewrite `calculateCraftingCrit` with tiered thresholds**

Replace the entire `calculateCraftingCrit` function (lines 153-199) with:

```typescript
export function calculateCraftingCrit(
  input: CalculateCraftingCritInput,
  rolls?: CraftingCritRolls
): CraftingCritResult {
  const critChance = calculateCritChance(input.skillLevel, input.requiredLevel, input.luckStat);
  const rareCraftChance = calculateRareCraftChance(input.skillLevel, input.requiredLevel, input.luckStat);
  const epicCraftChance = calculateEpicCraftChance(input.skillLevel, input.requiredLevel, input.luckStat);
  const eligibleStats = getEligibleBonusStats(input.itemType, input.baseStats, input.slot);

  const noChances = { critChance, rareCraftChance, epicCraftChance };

  if (eligibleStats.length === 0) {
    return { isCrit: false, rarity: 'common', ...noChances, bonusStat: null, bonusValue: null };
  }

  const critRoll = randomUnit(rolls?.critRoll);
  if (critRoll >= critChance) {
    return { isCrit: false, rarity: 'common', ...noChances, bonusStat: null, bonusValue: null };
  }

  // Crit succeeded — determine tier (epic < rare < uncommon)
  let rarity: ItemRarity;
  if (critRoll < epicCraftChance) {
    rarity = 'epic';
  } else if (critRoll < rareCraftChance) {
    rarity = 'rare';
  } else {
    rarity = 'uncommon';
  }

  const rolledBonus = rollBonusStat(eligibleStats, input.baseStats, {
    statRoll: rolls?.statRoll,
    bonusPercentRoll: rolls?.bonusPercentRoll,
  });

  if (!rolledBonus) {
    return { isCrit: false, rarity: 'common', ...noChances, bonusStat: null, bonusValue: null };
  }

  return {
    isCrit: true,
    rarity,
    ...noChances,
    bonusStat: rolledBonus.stat,
    bonusValue: rolledBonus.value,
  };
}
```

**Step 6: Build shared and game-engine**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine`
Expected: Clean build.

**Step 7: Run tests**

Run: `npm run test:engine -- --reporter=verbose 2>&1 | head -100`
Expected: All tests pass, including the new tiered crit tests.

**Step 8: Commit**

```bash
git add packages/game-engine/src/crafting/craftingCrit.ts
git commit -m "feat: implement tiered crafting crit (rare/epic from single roll)"
```

---

### Task 4: Update API route to use `critResult.rarity`

**Files:**
- Modify: `apps/api/src/routes/crafting.ts:498-500`

**Step 1: Replace hardcoded rarity mapping**

Replace lines 498-500:

```typescript
        const rarity: ItemRarity = (itemType === 'weapon' || itemType === 'armor') && critResult.isCrit
          ? 'uncommon'
          : 'common';
```

With:

```typescript
        const rarity: ItemRarity = critResult.rarity;
```

**Step 2: Build API**

Run: `npm run build:api`
Expected: Clean build.

**Step 3: Commit**

```bash
git add apps/api/src/routes/crafting.ts
git commit -m "feat: use tiered crit rarity in crafting route"
```

---

### Task 5: Fix existing tests for new `rarity` field

The existing `calculateCraftingCrit` tests assert on result properties but don't check `rarity`. After our changes, the result object shape changed (added `rarity`, `rareCraftChance`, `epicCraftChance`). Existing tests should still pass since they use partial assertions (`expect(result.isCrit).toBe(true)` etc.), but verify:

**Step 1: Run all tests**

Run: `npm run test 2>&1 | tail -30`
Expected: All pass. If any fail due to the new fields, update assertions.

**Step 2: Final commit**

```bash
git add -A
git commit -m "chore: verify all tests pass with tiered crafting crit"
```

Only commit if there were changes needed. If all tests pass with no changes, skip this commit.
