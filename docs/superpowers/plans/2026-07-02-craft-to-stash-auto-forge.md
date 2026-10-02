# Craft To Stash Auto-Forge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add craft-to-stash and craft-scoped auto-forge so players can run large craft attempt budgets without backpack size blocking the workflow.

**Architecture:** Extend the craft API with destination and auto-forge target options while keeping manual forge unchanged. Use pure helpers for shared rarity/cost math, API service helpers for virtual auto-forge planning, and persist only final survivors plus leftovers from the current craft request.

**Tech Stack:** Next.js 16, React 18, Express 4, Prisma 6, PostgreSQL 16, Vitest, Zod, TypeScript 5.

## Global Constraints

- Feature work happens in `D:\Code\Adventure\.worktrees\pocketrealm-codex_craft_stash_auto_forge`.
- Do not start dev servers unless the user asks for a running server or browser verification.
- Manual Forge screen and API behavior remain unchanged; auto-forge is part of crafting only.
- Auto-forge only consumes virtual items created by the current craft request.
- Auto-forge target values are `rare`, `epic`, and `legendary`.
- Craft destination values are `inventory` and `stash`; default is `inventory`.
- `quantity` remains an attempt budget with a maximum request sanity cap of `CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY`.
- Auto-forge is only valid for non-stackable `weapon` and `armor` recipe outputs.
- Crafting to stash bypasses backpack slot checks and over-encumbrance, but still enforces recovery, activity lockout, zone, recipe unlock, skill, material, and turn rules.
- Crafting to inventory with auto-forge requires minimum open slots: `rare` requires `3`, `epic` requires `4`, and `legendary` requires `5`.
- Server turn preflight uses conservative maximum possible base spend including craft attempts and auto-forge attempts; actual turn spend only charges work performed.
- Auto-forge does not consume Forge Luck or Forge Protection buffs.
- Below-target leftovers are persisted in the selected destination and reported in the response summary.
- Use `apply_patch` for manual edits and keep route handlers thin.
- After code changes, use the global `simplify` skill before final handoff.

---

## File Structure

- `packages/shared/src/types/item.types.ts`: shared request/response types for craft destination, auto-forge target, attempt log, and summary.
- `packages/shared/src/constants/gameConstants.ts`: shared auto-forge target list and minimum inventory slot table.
- `packages/game-engine/src/crafting/autoForgeBudget.ts`: pure auto-forge eligibility, slot, max cost, and expected cost helpers.
- `packages/game-engine/src/crafting/autoForgeBudget.test.ts`: pure helper tests.
- `packages/game-engine/src/index.ts`: export the new pure helper module.
- `apps/api/src/services/turnBankService.ts`: add turn affordability preview without mutating turn state.
- `apps/api/src/services/turnBankService.test.ts`: cover the new turn affordability helper.
- `apps/api/src/services/guildTaxService.ts`: add tax-aware affordability preflight.
- `apps/api/src/services/guildTaxService.test.ts`: cover max-reserved tax preflight.
- `apps/api/src/services/crafting/autoForgePlanner.ts`: craft-scoped virtual auto-forge accumulator and result builder.
- `apps/api/src/services/crafting/autoForgePlanner.test.ts`: deterministic planner tests.
- `apps/api/src/services/crafting/helpers.ts`: extend `craftSchema` and export destination/target schema pieces.
- `apps/api/src/services/crafting/craftRouteService.ts`: integrate craft destination, stash persistence, auto-forge, max-cost preflight, state updates, logs, XP, achievements, and response shape.
- `apps/api/src/services/crafting/craftRouteService.test.ts`: service-level craft-to-stash and auto-forge regression tests.
- `apps/web/src/lib/api/items.ts`: extend craft request and response types.
- `apps/web/src/app/game/hooks/useCraftingActions.ts`: pass craft options and add auto-forge activity log lines.
- `apps/web/src/app/game/renderers/professionScreenRenderers.tsx`: pass item type and crafting handler shape into the Crafting screen.
- `apps/web/src/components/screens/Crafting.tsx`: add destination and auto-forge controls, cost preview, button labels, and disabled states.
- `apps/web/src/components/screens/Crafting.test.tsx`: UI tests for destination, target, attempt label, minimum slot messaging, and request payload.
- `docs/business-rules.md`: document craft-to-stash and craft auto-forge rules.

---

### Task 1: Shared Contracts And Pure Auto-Forge Budget Helpers

**Files:**
- Modify: `packages/shared/src/types/item.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Create: `packages/game-engine/src/crafting/autoForgeBudget.ts`
- Create: `packages/game-engine/src/crafting/autoForgeBudget.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Interfaces:**
- Consumes: `ItemRarity`, `ItemType`, `CRAFTING_CONSTANTS`, `ITEM_RARITY_CONSTANTS`, `calculateForgeUpgradeSuccessChance`, `getForgeUpgradeCost`.
- Produces:
  - `type CraftDestination = 'inventory' | 'stash'`
  - `type AutoForgeTarget = 'rare' | 'epic' | 'legendary'`
  - `interface CraftAutoForgeAttempt`
  - `interface CraftAutoForgeSummary`
  - `function isAutoForgeTarget(value: unknown): value is AutoForgeTarget`
  - `function isAutoForgeEligibleItemType(itemType: ItemType, stackable: boolean): boolean`
  - `function getAutoForgeMinimumOpenSlots(target: AutoForgeTarget): number`
  - `function calculateAutoForgeMaxForgeTurnCost(craftAttempts: number, target: AutoForgeTarget, upgradeCostsByRarity?: Partial<Record<UpgradeableRarity, number>>): number`
  - `function calculateAutoForgeExpectedForgeTurnCost(input: { craftAttempts: number; target: AutoForgeTarget; luckStat: number; upgradeCostsByRarity?: Partial<Record<UpgradeableRarity, number>> }): number`
  - `function calculateCraftMaxReservedBaseTurnCost(input: { craftAttempts: number; craftTurnCostPerAttempt: number; autoForgeTarget: AutoForgeTarget | null; upgradeCostsByRarity?: Partial<Record<UpgradeableRarity, number>> }): number`

- [ ] **Step 1: Write failing shared/game-engine tests**

Create `packages/game-engine/src/crafting/autoForgeBudget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  calculateAutoForgeExpectedForgeTurnCost,
  calculateAutoForgeMaxForgeTurnCost,
  calculateCraftMaxReservedBaseTurnCost,
  getAutoForgeMinimumOpenSlots,
  isAutoForgeEligibleItemType,
  isAutoForgeTarget,
} from './autoForgeBudget';

describe('autoForgeBudget', () => {
  it('recognizes supported auto-forge targets', () => {
    expect(isAutoForgeTarget('rare')).toBe(true);
    expect(isAutoForgeTarget('epic')).toBe(true);
    expect(isAutoForgeTarget('legendary')).toBe(true);
    expect(isAutoForgeTarget('uncommon')).toBe(false);
    expect(isAutoForgeTarget(null)).toBe(false);
  });

  it('only allows non-stackable weapons and armor for auto-forge', () => {
    expect(isAutoForgeEligibleItemType('weapon', false)).toBe(true);
    expect(isAutoForgeEligibleItemType('armor', false)).toBe(true);
    expect(isAutoForgeEligibleItemType('weapon', true)).toBe(false);
    expect(isAutoForgeEligibleItemType('resource', false)).toBe(false);
    expect(isAutoForgeEligibleItemType('consumable', false)).toBe(false);
  });

  it('returns minimum open slots for each target', () => {
    expect(getAutoForgeMinimumOpenSlots('rare')).toBe(3);
    expect(getAutoForgeMinimumOpenSlots('epic')).toBe(4);
    expect(getAutoForgeMinimumOpenSlots('legendary')).toBe(5);
  });

  it('calculates conservative max forge cost from all-common successful cascades', () => {
    expect(calculateAutoForgeMaxForgeTurnCost(8, 'rare')).toBe(8 / 2 * 100 + 8 / 4 * 250);
    expect(calculateAutoForgeMaxForgeTurnCost(8, 'epic')).toBe(400 + 500 + 500);
    expect(calculateAutoForgeMaxForgeTurnCost(16, 'legendary')).toBe(800 + 1000 + 1000 + 1000);
  });

  it('uses discounted upgrade costs when supplied', () => {
    expect(calculateAutoForgeMaxForgeTurnCost(8, 'rare', { common: 80, uncommon: 200 })).toBe(720);
  });

  it('includes craft and max forge costs in max reserved base cost', () => {
    expect(calculateCraftMaxReservedBaseTurnCost({
      craftAttempts: 8,
      craftTurnCostPerAttempt: 20,
      autoForgeTarget: 'rare',
    })).toBe(160 + 900);
  });

  it('returns craft-only max reserved base cost when auto-forge is off', () => {
    expect(calculateCraftMaxReservedBaseTurnCost({
      craftAttempts: 8,
      craftTurnCostPerAttempt: 20,
      autoForgeTarget: null,
    })).toBe(160);
  });

  it('calculates an advisory expected forge cost lower than the conservative max for normal chance values', () => {
    const expected = calculateAutoForgeExpectedForgeTurnCost({
      craftAttempts: 8,
      target: 'rare',
      luckStat: 0,
    });
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(calculateAutoForgeMaxForgeTurnCost(8, 'rare'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm run test -w packages/game-engine -- --run src/crafting/autoForgeBudget.test.ts`

Expected: FAIL with module resolution error for `./autoForgeBudget`.

- [ ] **Step 3: Add shared types and constants**

In `packages/shared/src/types/item.types.ts`, append after `export type ItemRarity = ...`:

```ts
export type CraftDestination = 'inventory' | 'stash';
export type AutoForgeTarget = 'rare' | 'epic' | 'legendary';

export interface CraftAutoForgeAttempt {
  action: 'upgrade';
  fromRarity: 'common' | 'uncommon' | 'rare' | 'epic';
  toRarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
  success: boolean;
  roll: number;
  successChance: number;
  turnCost: number;
  targetVirtualId: string;
  sacrificeVirtualId: string;
  resultVirtualId: string | null;
}

export interface CraftAutoForgeSummary {
  targetRarity: AutoForgeTarget;
  attempts: CraftAutoForgeAttempt[];
  finalCountsByRarity: Partial<Record<ItemRarity, number>>;
  leftoverCountsByRarity: Partial<Record<ItemRarity, number>>;
  actualForgeTurnCost: number;
  maxReservedTurnCost: number;
}
```

In `packages/shared/src/constants/gameConstants.ts`, add these properties inside `CRAFTING_CONSTANTS` after `MAX_CRAFT_QUANTITY_SANITY`:

```ts
  AUTO_FORGE_TARGETS: ['rare', 'epic', 'legendary'] as const,
  AUTO_FORGE_MIN_OPEN_SLOTS: {
    rare: 3,
    epic: 4,
    legendary: 5,
  } as const,
```

- [ ] **Step 4: Add pure budget helper implementation**

Create `packages/game-engine/src/crafting/autoForgeBudget.ts`:

```ts
import {
  CRAFTING_CONSTANTS,
  ITEM_RARITY_CONSTANTS,
  type AutoForgeTarget,
  type ItemRarity,
  type ItemType,
} from '@pocketrealm/shared';
import { calculateForgeUpgradeSuccessChance, getForgeUpgradeCost } from '../items/itemRarity';

export type UpgradeableRarity = Exclude<ItemRarity, 'legendary'>;

const UPGRADEABLE_RARITIES: readonly UpgradeableRarity[] = ['common', 'uncommon', 'rare', 'epic'];
const RARITY_INDEX = new Map<ItemRarity, number>(
  ITEM_RARITY_CONSTANTS.ORDER.map((rarity, index) => [rarity, index]),
);

function rarityIndex(rarity: ItemRarity): number {
  return RARITY_INDEX.get(rarity) ?? 0;
}

function raritiesBelowTarget(target: AutoForgeTarget): UpgradeableRarity[] {
  const targetIndex = rarityIndex(target);
  return UPGRADEABLE_RARITIES.filter((rarity) => rarityIndex(rarity) < targetIndex);
}

function nextRarity(rarity: UpgradeableRarity): ItemRarity {
  const index = rarityIndex(rarity);
  return ITEM_RARITY_CONSTANTS.ORDER[index + 1] as ItemRarity;
}

function upgradeCost(
  rarity: UpgradeableRarity,
  upgradeCostsByRarity: Partial<Record<UpgradeableRarity, number>> | undefined,
): number {
  const override = upgradeCostsByRarity?.[rarity];
  if (override !== undefined) return override;
  return getForgeUpgradeCost(rarity) ?? 0;
}

export function isAutoForgeTarget(value: unknown): value is AutoForgeTarget {
  return value === 'rare' || value === 'epic' || value === 'legendary';
}

export function isAutoForgeEligibleItemType(itemType: ItemType, stackable: boolean): boolean {
  return !stackable && (itemType === 'weapon' || itemType === 'armor');
}

export function getAutoForgeMinimumOpenSlots(target: AutoForgeTarget): number {
  return CRAFTING_CONSTANTS.AUTO_FORGE_MIN_OPEN_SLOTS[target];
}

export function calculateAutoForgeMaxForgeTurnCost(
  craftAttempts: number,
  target: AutoForgeTarget,
  upgradeCostsByRarity?: Partial<Record<UpgradeableRarity, number>>,
): number {
  if (craftAttempts <= 1) return 0;

  const pool: Partial<Record<ItemRarity, number>> = { common: craftAttempts };
  let total = 0;

  for (const rarity of raritiesBelowTarget(target)) {
    const pairs = Math.floor((pool[rarity] ?? 0) / 2);
    if (pairs <= 0) continue;
    total += pairs * upgradeCost(rarity, upgradeCostsByRarity);
    const promoted = nextRarity(rarity);
    pool[promoted] = (pool[promoted] ?? 0) + pairs;
  }

  return total;
}

export function calculateAutoForgeExpectedForgeTurnCost(input: {
  craftAttempts: number;
  target: AutoForgeTarget;
  luckStat: number;
  upgradeCostsByRarity?: Partial<Record<UpgradeableRarity, number>>;
}): number {
  if (input.craftAttempts <= 1) return 0;

  let expectedItems = input.craftAttempts;
  let total = 0;

  for (const rarity of raritiesBelowTarget(input.target)) {
    const expectedAttempts = expectedItems / 2;
    total += expectedAttempts * upgradeCost(rarity, input.upgradeCostsByRarity);
    const successChance = calculateForgeUpgradeSuccessChance(rarity, input.luckStat) ?? 0;
    expectedItems = expectedAttempts * successChance;
  }

  return Math.ceil(total);
}

export function calculateCraftMaxReservedBaseTurnCost(input: {
  craftAttempts: number;
  craftTurnCostPerAttempt: number;
  autoForgeTarget: AutoForgeTarget | null;
  upgradeCostsByRarity?: Partial<Record<UpgradeableRarity, number>>;
}): number {
  const craftCost = input.craftAttempts * input.craftTurnCostPerAttempt;
  if (!input.autoForgeTarget) return craftCost;
  return craftCost + calculateAutoForgeMaxForgeTurnCost(
    input.craftAttempts,
    input.autoForgeTarget,
    input.upgradeCostsByRarity,
  );
}
```

In `packages/game-engine/src/index.ts`, add:

```ts
export * from './crafting/autoForgeBudget';
```

- [ ] **Step 5: Run focused tests**

Run: `rtk npm run test -w packages/game-engine -- --run src/crafting/autoForgeBudget.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/shared/src/types/item.types.ts packages/shared/src/constants/gameConstants.ts packages/game-engine/src/crafting/autoForgeBudget.ts packages/game-engine/src/crafting/autoForgeBudget.test.ts packages/game-engine/src/index.ts
git commit -m "feat: add craft auto-forge budget helpers"
```

---

### Task 2: Tax-Aware Max Reserved Turn Preflight

**Files:**
- Modify: `apps/api/src/services/turnBankService.ts`
- Modify: `apps/api/src/services/turnBankService.test.ts`
- Modify: `apps/api/src/services/guildTaxService.ts`
- Modify: `apps/api/src/services/guildTaxService.test.ts`

**Interfaces:**
- Consumes: `calculateCurrentTurns`, `calculateTurnProgress`, `calculateTimeToCapMs`, `getTurnConfig`, `calculateInflatedCost`, `getPlayerTaxRateTx`.
- Produces:
  - `interface TurnAffordabilityResult { currentTurns: number; requiredTurns: number; timeToCapMs: number | null; lastRegenAt: string }`
  - `function assertPlayerCanSpendTurnsTx(tx: Prisma.TransactionClient, playerId: string, amount: number, now?: Date): Promise<TurnAffordabilityResult>`
  - `interface TaxAffordabilityResult { baseCost: number; inflatedCost: number; taxRatePercent: number; guildId: string | null; currentTurns: number }`
  - `function assertCanSpendWithTaxTx(tx: Prisma.TransactionClient, playerId: string, baseCost: number, now?: Date): Promise<TaxAffordabilityResult>`

- [ ] **Step 1: Add failing turn-bank tests**

In `apps/api/src/services/turnBankService.test.ts`, add:

```ts
import { assertPlayerCanSpendTurnsTx } from './turnBankService';

describe('assertPlayerCanSpendTurnsTx', () => {
  it('returns current turn state without updating the bank when affordable', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1',
      currentTurns: 500,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });

    const result = await assertPlayerCanSpendTurnsTx(prisma, 'p1', 400, now);

    expect(result.currentTurns).toBe(500);
    expect(result.requiredTurns).toBe(400);
    expect(mockPrisma.turnBank.updateMany).not.toHaveBeenCalled();
  });

  it('throws INSUFFICIENT_TURNS when current turns are below the required amount', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1',
      currentTurns: 399,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });

    await expect(assertPlayerCanSpendTurnsTx(prisma, 'p1', 400, now)).rejects.toMatchObject({
      code: 'INSUFFICIENT_TURNS',
    });
    expect(mockPrisma.turnBank.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run turn-bank tests to verify failure**

Run: `rtk npm run test -w apps/api -- --run src/services/turnBankService.test.ts`

Expected: FAIL with `assertPlayerCanSpendTurnsTx` export missing.

- [ ] **Step 3: Implement non-mutating affordability preview**

In `apps/api/src/services/turnBankService.ts`, add after `getTurnConfig`:

```ts
export interface TurnAffordabilityResult {
  currentTurns: number;
  requiredTurns: number;
  timeToCapMs: number | null;
  lastRegenAt: string;
}

export async function assertPlayerCanSpendTurnsTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  amount: number,
  now: Date = new Date(),
): Promise<TurnAffordabilityResult> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new AppError(400, 'Turn spend amount must be a non-negative integer', 'INVALID_TURNS');
  }

  const [turnBank, turnConfig] = await Promise.all([
    tx.turnBank.findUnique({ where: { playerId } }),
    getTurnConfig(tx, playerId, now),
  ]);

  if (!turnBank) {
    throw new AppError(404, 'Turn bank not found', 'NOT_FOUND');
  }

  const currentTurns = calculateCurrentTurns(
    turnBank.currentTurns,
    turnBank.lastRegenAt,
    now,
    turnConfig.regenRate,
    turnConfig.bankCap,
    turnBank.regenProgress,
  );
  const regenProgress = calculateTurnProgress(
    turnBank.lastRegenAt,
    now,
    turnConfig.regenRate,
    turnBank.regenProgress,
  );

  if (currentTurns < amount) {
    throw new AppError(400, 'Insufficient turns', 'INSUFFICIENT_TURNS');
  }

  return {
    currentTurns,
    requiredTurns: amount,
    lastRegenAt: turnBank.lastRegenAt.toISOString(),
    timeToCapMs: calculateTimeToCapMs(
      currentTurns,
      turnConfig.regenRate,
      turnConfig.bankCap,
      currentTurns >= turnConfig.bankCap ? 0 : regenProgress,
    ),
  };
}
```

- [ ] **Step 4: Add failing guild-tax preflight tests**

In `apps/api/src/services/guildTaxService.test.ts`, add `assertCanSpendWithTaxTx` to the import list and add:

```ts
describe('assertCanSpendWithTaxTx', () => {
  it('checks inflated cost when the player has guild tax', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guild: { id: 'g1', taxRate: 20 } });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1',
      currentTurns: 625,
      regenProgress: 0,
      lastRegenAt: new Date('2026-07-02T12:00:00.000Z'),
    });
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });

    const result = await assertCanSpendWithTaxTx(prisma, 'p1', 500, new Date('2026-07-02T12:00:00.000Z'));

    expect(result).toMatchObject({
      baseCost: 500,
      inflatedCost: 625,
      taxRatePercent: 20,
      guildId: 'g1',
      currentTurns: 625,
    });
    expect(spendPlayerTurnsTx).not.toHaveBeenCalled();
  });

  it('throws before spending when inflated max reserved cost is not affordable', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guild: { id: 'g1', taxRate: 20 } });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1',
      currentTurns: 624,
      regenProgress: 0,
      lastRegenAt: new Date('2026-07-02T12:00:00.000Z'),
    });
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });

    await expect(assertCanSpendWithTaxTx(prisma, 'p1', 500, new Date('2026-07-02T12:00:00.000Z')))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_TURNS' });
    expect(spendPlayerTurnsTx).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Implement guild-tax preflight**

In `apps/api/src/services/guildTaxService.ts`, change the turn-bank import:

```ts
import { assertPlayerCanSpendTurnsTx, spendPlayerTurnsTx, type SpendTurnsResult } from './turnBankService';
```

Add after `calculateEffectiveTurns`:

```ts
export interface TaxAffordabilityResult {
  baseCost: number;
  inflatedCost: number;
  taxRatePercent: number;
  guildId: string | null;
  currentTurns: number;
}

export async function assertCanSpendWithTaxTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  baseCost: number,
  now: Date = new Date(),
): Promise<TaxAffordabilityResult> {
  if (!Number.isInteger(baseCost) || baseCost < 0) {
    throw new AppError(400, 'Turn spend amount must be a non-negative integer', 'INVALID_TURNS');
  }

  const { taxRate, guildId } = baseCost > 0
    ? await getPlayerTaxRateTx(tx, playerId)
    : { taxRate: 0, guildId: null };
  const inflatedCost = calculateInflatedCost(baseCost, taxRate);
  const affordability = await assertPlayerCanSpendTurnsTx(tx, playerId, inflatedCost, now);

  return {
    baseCost,
    inflatedCost,
    taxRatePercent: taxRate,
    guildId,
    currentTurns: affordability.currentTurns,
  };
}
```

- [ ] **Step 6: Run focused tests**

Run: `rtk npm run test -w apps/api -- --run src/services/turnBankService.test.ts src/services/guildTaxService.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/services/turnBankService.ts apps/api/src/services/turnBankService.test.ts apps/api/src/services/guildTaxService.ts apps/api/src/services/guildTaxService.test.ts
git commit -m "feat: add tax-aware turn affordability preflight"
```

---

### Task 3: Craft-Scoped Virtual Auto-Forge Planner

**Files:**
- Create: `apps/api/src/services/crafting/autoForgePlanner.ts`
- Create: `apps/api/src/services/crafting/autoForgePlanner.test.ts`

**Interfaces:**
- Consumes: `AutoForgeTarget`, `CraftAutoForgeAttempt`, `CraftAutoForgeSummary`, `EquipmentSlot`, `ItemRarity`, `ItemStats`, `ItemType`, `isRarityAtLeast`, `getNextRarity`, `calculateForgeUpgradeSuccessChance`, `rollBonusStat`, `getEligibleBonusStats`, `normalizeBonusStats`.
- Produces:
  - `interface CraftVirtualItem`
  - `interface CraftAutoForgeAccumulator`
  - `function createCraftAutoForgeAccumulator(input: CreateCraftAutoForgeAccumulatorInput): CraftAutoForgeAccumulator`
  - `function addCraftedItemToAutoForge(accumulator: CraftAutoForgeAccumulator, item: CraftVirtualItem): void`
  - `function getAutoForgePersistedItemCount(accumulator: CraftAutoForgeAccumulator): number`
  - `function finishCraftAutoForge(accumulator: CraftAutoForgeAccumulator): CraftAutoForgePlanResult`

- [ ] **Step 1: Write failing planner tests**

Create `apps/api/src/services/crafting/autoForgePlanner.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCraftedItemToAutoForge,
  createCraftAutoForgeAccumulator,
  finishCraftAutoForge,
  getAutoForgePersistedItemCount,
  type CraftVirtualItem,
} from './autoForgePlanner';

vi.mock('@pocketrealm/game-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pocketrealm/game-engine')>();
  return {
    ...actual,
    calculateForgeUpgradeSuccessChance: vi.fn((rarity: string) => {
      if (rarity === 'common') return 1;
      if (rarity === 'uncommon') return 1;
      if (rarity === 'rare') return 1;
      if (rarity === 'epic') return 1;
      return null;
    }),
    getEligibleBonusStats: vi.fn(() => ['attack']),
    rollBonusStat: vi.fn(() => ({ stat: 'attack', value: 2 })),
  };
});

function virtualItem(id: string, rarity: CraftVirtualItem['rarity']): CraftVirtualItem {
  return {
    virtualId: id,
    rarity,
    bonusStats: null,
    isCrit: rarity !== 'common',
    bonusEntries: [],
  };
}

function makeAccumulator(rolls: number[]) {
  let index = 0;
  return createCraftAutoForgeAccumulator({
    targetRarity: 'rare',
    itemType: 'armor',
    baseStats: { armor: 5 },
    slot: 'chest',
    luckStat: 0,
    upgradeCostsByRarity: { common: 100, uncommon: 250, rare: 500, epic: 1000 },
    roll: () => rolls[index++] ?? 0,
  });
}

describe('autoForgePlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upgrades only newly crafted virtual items into final survivors', () => {
    const accumulator = makeAccumulator([0, 0, 0]);

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v3', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v4', 'common'));

    const result = finishCraftAutoForge(accumulator);

    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]).toMatchObject({ rarity: 'rare', bonusStats: { attack: 4 } });
    expect(result.leftovers).toHaveLength(0);
    expect(result.summary.attempts).toHaveLength(3);
    expect(result.summary.actualForgeTurnCost).toBe(450);
    expect(result.summary.finalCountsByRarity).toEqual({ rare: 1 });
  });

  it('keeps below-target leftovers when no more pairs exist', () => {
    const accumulator = makeAccumulator([0]);

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v3', 'common'));

    const result = finishCraftAutoForge(accumulator);

    expect(result.survivors).toHaveLength(0);
    expect(result.leftovers.map((item) => item.rarity).sort()).toEqual(['common', 'uncommon']);
    expect(result.summary.leftoverCountsByRarity).toEqual({ common: 1, uncommon: 1 });
  });

  it('destroys both virtual items on failed forge and records null resultVirtualId', () => {
    const accumulator = createCraftAutoForgeAccumulator({
      targetRarity: 'rare',
      itemType: 'weapon',
      baseStats: { attack: 5 },
      slot: 'main_hand',
      luckStat: 0,
      upgradeCostsByRarity: { common: 100, uncommon: 250, rare: 500, epic: 1000 },
      roll: () => 0.99,
    });

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));

    const result = finishCraftAutoForge(accumulator);

    expect(result.survivors).toHaveLength(0);
    expect(result.leftovers).toHaveLength(0);
    expect(result.summary.attempts[0]).toMatchObject({
      success: false,
      targetVirtualId: 'v1',
      sacrificeVirtualId: 'v2',
      resultVirtualId: null,
    });
  });

  it('tracks persisted item count during incremental crafting', () => {
    const accumulator = makeAccumulator([0]);

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    expect(getAutoForgePersistedItemCount(accumulator)).toBe(1);

    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));
    expect(getAutoForgePersistedItemCount(accumulator)).toBe(1);
  });
});
```

- [ ] **Step 2: Run planner tests to verify failure**

Run: `rtk npm run test -w apps/api -- --run src/services/crafting/autoForgePlanner.test.ts`

Expected: FAIL with module resolution error for `./autoForgePlanner`.

- [ ] **Step 3: Implement planner types and accumulator**

Create `apps/api/src/services/crafting/autoForgePlanner.ts`:

```ts
import { Prisma } from '@pocketrealm/database';
import {
  ITEM_RARITY_CONSTANTS,
  isRarityAtLeast,
  type AutoForgeTarget,
  type CraftAutoForgeAttempt,
  type CraftAutoForgeSummary,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@pocketrealm/shared';
import {
  calculateForgeUpgradeSuccessChance,
  getEligibleBonusStats,
  getNextRarity,
  rollBonusStat,
} from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { normalizeBonusStats } from './helpers';
import type { UpgradeableRarity } from '@pocketrealm/game-engine';

export interface CraftVirtualItem {
  virtualId: string;
  rarity: ItemRarity;
  bonusStats: Prisma.InputJsonObject | Record<string, number> | null | undefined;
  isCrit: boolean;
  bonusEntries: [string, number][];
}

export interface CreateCraftAutoForgeAccumulatorInput {
  targetRarity: AutoForgeTarget;
  itemType: ItemType;
  baseStats: ItemStats | null | undefined;
  slot?: EquipmentSlot | null;
  luckStat: number;
  upgradeCostsByRarity: Record<UpgradeableRarity, number>;
  roll?: () => number;
}

export interface CraftAutoForgeAccumulator {
  targetRarity: AutoForgeTarget;
  itemType: ItemType;
  baseStats: ItemStats | null | undefined;
  slot?: EquipmentSlot | null;
  luckStat: number;
  upgradeCostsByRarity: Record<UpgradeableRarity, number>;
  roll: () => number;
  pools: Record<UpgradeableRarity, CraftVirtualItem[]>;
  survivors: CraftVirtualItem[];
  attempts: CraftAutoForgeAttempt[];
  actualForgeTurnCost: number;
}

export interface CraftAutoForgePlanResult {
  survivors: CraftVirtualItem[];
  leftovers: CraftVirtualItem[];
  allPersistedItems: CraftVirtualItem[];
  summary: CraftAutoForgeSummary;
}

const EMPTY_POOLS = (): Record<UpgradeableRarity, CraftVirtualItem[]> => ({
  common: [],
  uncommon: [],
  rare: [],
  epic: [],
});

const ORDERED_UPGRADEABLE: readonly UpgradeableRarity[] = ['common', 'uncommon', 'rare', 'epic'];
const RARITY_INDEX = new Map<ItemRarity, number>(
  ITEM_RARITY_CONSTANTS.ORDER.map((rarity, index) => [rarity, index]),
);

function rarityIndex(rarity: ItemRarity): number {
  return RARITY_INDEX.get(rarity) ?? 0;
}

function isBelowTarget(rarity: ItemRarity, target: AutoForgeTarget): rarity is UpgradeableRarity {
  return rarity !== 'legendary' && rarityIndex(rarity) < rarityIndex(target);
}

function countByRarity(items: CraftVirtualItem[]): Partial<Record<ItemRarity, number>> {
  const counts: Partial<Record<ItemRarity, number>> = {};
  for (const item of items) {
    counts[item.rarity] = (counts[item.rarity] ?? 0) + 1;
  }
  return counts;
}

function addBonusStat(input: {
  item: CraftVirtualItem;
  itemType: ItemType;
  nextRarity: ItemRarity;
  baseStats: ItemStats | null | undefined;
  slot?: EquipmentSlot | null;
}): CraftVirtualItem {
  const eligibleStats = getEligibleBonusStats(input.itemType, input.baseStats, input.slot ?? undefined);
  if (eligibleStats.length === 0) {
    throw new AppError(400, 'No eligible bonus stats for this item', 'INVALID_ITEM');
  }

  const rolled = rollBonusStat(eligibleStats, input.baseStats);
  if (!rolled) {
    throw new AppError(500, 'Failed to roll upgrade bonus stat', 'FORGE_ROLL_FAILED');
  }

  const existingBonusStats = normalizeBonusStats(input.item.bonusStats);
  const previous = existingBonusStats[rolled.stat];
  const previousNumeric = typeof previous === 'number' && Number.isFinite(previous) ? previous : 0;
  const nextBonusStats: ItemStats = {
    ...existingBonusStats,
    [rolled.stat]: previousNumeric + rolled.value,
  };

  return {
    ...input.item,
    rarity: input.nextRarity,
    bonusStats: nextBonusStats as Prisma.InputJsonObject,
    bonusEntries: Object.entries(nextBonusStats).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  };
}

function placeItem(accumulator: CraftAutoForgeAccumulator, item: CraftVirtualItem): void {
  if (isRarityAtLeast(item.rarity, accumulator.targetRarity)) {
    accumulator.survivors.push(item);
    return;
  }

  if (!isBelowTarget(item.rarity, accumulator.targetRarity)) {
    accumulator.survivors.push(item);
    return;
  }

  accumulator.pools[item.rarity].push(item);
}

function reducePools(accumulator: CraftAutoForgeAccumulator): void {
  let changed = true;
  while (changed) {
    changed = false;

    for (const rarity of ORDERED_UPGRADEABLE) {
      if (!isBelowTarget(rarity, accumulator.targetRarity)) continue;
      const pool = accumulator.pools[rarity];

      while (pool.length >= 2) {
        changed = true;
        const target = pool.shift()!;
        const sacrifice = pool.shift()!;
        const nextRarity = getNextRarity(rarity);
        const successChance = calculateForgeUpgradeSuccessChance(rarity, accumulator.luckStat);
        const turnCost = accumulator.upgradeCostsByRarity[rarity];

        if (!nextRarity || successChance === null) {
          throw new AppError(400, 'Legendary items cannot be upgraded', 'MAX_RARITY');
        }

        const roll = accumulator.roll();
        const success = roll < successChance;
        accumulator.actualForgeTurnCost += turnCost;

        if (!success) {
          accumulator.attempts.push({
            action: 'upgrade',
            fromRarity: rarity,
            toRarity: nextRarity,
            success: false,
            roll,
            successChance,
            turnCost,
            targetVirtualId: target.virtualId,
            sacrificeVirtualId: sacrifice.virtualId,
            resultVirtualId: null,
          });
          continue;
        }

        const upgraded = addBonusStat({
          item: target,
          itemType: accumulator.itemType,
          nextRarity,
          baseStats: accumulator.baseStats,
          slot: accumulator.slot,
        });

        accumulator.attempts.push({
          action: 'upgrade',
          fromRarity: rarity,
          toRarity: nextRarity,
          success: true,
          roll,
          successChance,
          turnCost,
          targetVirtualId: target.virtualId,
          sacrificeVirtualId: sacrifice.virtualId,
          resultVirtualId: upgraded.virtualId,
        });

        placeItem(accumulator, upgraded);
      }
    }
  }
}

export function createCraftAutoForgeAccumulator(
  input: CreateCraftAutoForgeAccumulatorInput,
): CraftAutoForgeAccumulator {
  return {
    targetRarity: input.targetRarity,
    itemType: input.itemType,
    baseStats: input.baseStats,
    slot: input.slot,
    luckStat: input.luckStat,
    upgradeCostsByRarity: input.upgradeCostsByRarity,
    roll: input.roll ?? Math.random,
    pools: EMPTY_POOLS(),
    survivors: [],
    attempts: [],
    actualForgeTurnCost: 0,
  };
}

export function addCraftedItemToAutoForge(
  accumulator: CraftAutoForgeAccumulator,
  item: CraftVirtualItem,
): void {
  placeItem(accumulator, item);
  reducePools(accumulator);
}

export function getAutoForgePersistedItemCount(accumulator: CraftAutoForgeAccumulator): number {
  return accumulator.survivors.length + ORDERED_UPGRADEABLE.reduce(
    (sum, rarity) => sum + accumulator.pools[rarity].length,
    0,
  );
}

export function finishCraftAutoForge(
  accumulator: CraftAutoForgeAccumulator,
): CraftAutoForgePlanResult {
  const leftovers = ORDERED_UPGRADEABLE.flatMap((rarity) => accumulator.pools[rarity]);
  const allPersistedItems = [...accumulator.survivors, ...leftovers];

  return {
    survivors: accumulator.survivors,
    leftovers,
    allPersistedItems,
    summary: {
      targetRarity: accumulator.targetRarity,
      attempts: accumulator.attempts,
      finalCountsByRarity: countByRarity(accumulator.survivors),
      leftoverCountsByRarity: countByRarity(leftovers),
      actualForgeTurnCost: accumulator.actualForgeTurnCost,
      maxReservedTurnCost: 0,
    },
  };
}
```

- [ ] **Step 4: Run planner tests**

Run: `rtk npm run test -w apps/api -- --run src/services/crafting/autoForgePlanner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/services/crafting/autoForgePlanner.ts apps/api/src/services/crafting/autoForgePlanner.test.ts
git commit -m "feat: add craft auto-forge planner"
```

---

### Task 4: Craft-To-Stash API Path

**Files:**
- Modify: `apps/api/src/services/crafting/helpers.ts`
- Modify: `apps/api/src/services/crafting/craftRouteService.ts`
- Create: `apps/api/src/services/crafting/craftRouteService.test.ts`

**Interfaces:**
- Consumes: `CraftDestination`, `craftSchema`, `addStackableItemTx`, `assertNotRecovering`, `assertNotOverEncumbered`, `buildInventoryStateUpdates`.
- Produces:
  - `craftSchema` parses `{ destination?: 'inventory' | 'stash'; autoForgeMinRarity?: 'rare' | 'epic' | 'legendary' | null }`.
  - `craftItem` creates crafted outputs with `inStash: true` when destination is `stash`.
  - `craftItem` omits newly stashed output IDs from `stateUpdates.inventoryAdded`.

- [ ] **Step 1: Write failing craft-to-stash tests**

Create `apps/api/src/services/crafting/craftRouteService.test.ts` with this starting structure:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@pocketrealm/database';
import { mockPrisma } from '../../__test__/setup';
import { craftItem } from './craftRouteService';

vi.mock('../../services/activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));
vi.mock('../../services/chatActivityService', () => ({
  broadcastCraftActivity: vi.fn(),
}));
vi.mock('../../services/equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({ luck: 0 }),
}));
vi.mock('../../services/guildService', () => ({
  addGuildXp: vi.fn(),
  getPlayerGuildId: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../services/guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({ craftingCrit: 0 }),
}));
vi.mock('../../services/buffService', () => ({
  getBuffValue: vi.fn().mockResolvedValue(0),
  consumeBuffStandalone: vi.fn(),
}));
vi.mock('../../services/premiumEntitlement', () => ({
  getHasActivePremiumEntitlement: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../services/expeditionLockoutService', () => ({
  checkActivityLockout: vi.fn(),
}));
vi.mock('../../services/xpService', () => ({
  grantSkillXp: vi.fn().mockResolvedValue({
    skillType: 'tailoring',
    xpAfterEfficiency: 10,
    efficiency: 1,
    leveledUp: false,
    newLevel: 10,
    atDailyCap: false,
    newTotalXp: 100,
    newDailyXpGained: 10,
    characterXpGain: 3,
    characterXpAfter: 3,
    characterLevelBefore: 1,
    characterLevelAfter: 1,
    attributePointsAfter: 0,
    characterLeveledUp: false,
  }),
}));
vi.mock('../../services/progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../utils/routeHelpers.js', () => ({
  serializeXpGrant: vi.fn((grant) => grant),
  assertNotRecovering: vi.fn(),
  assertCanAct: vi.fn(),
  trackAchievements: vi.fn(),
}));

function baseInput(body: Record<string, unknown>) {
  return {
    player: { playerId: 'player-1', username: 'Tester' },
    body,
  } as Parameters<typeof craftItem>[0];
}

function mockRecipe(stackable = false) {
  mockPrisma.craftingRecipe.findUnique.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    skillType: 'tailoring',
    requiredLevel: 1,
    isAdvanced: false,
    materials: [{ templateId: '22222222-2222-4222-8222-222222222222', quantity: 2 }],
    resultTemplateId: '33333333-3333-4333-8333-333333333333',
    turnCost: 20,
    xpReward: 10,
    resultTemplate: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Silk Robe',
      itemType: 'armor',
      slot: 'chest',
      stackable,
      maxDurability: 100,
      baseStats: { armor: 5 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecipe(false);
  mockPrisma.zone.findFirst.mockResolvedValue({
    zone: { name: 'Millbrook', maxCraftingLevel: null },
  });
  mockPrisma.playerSkill.findUnique.mockResolvedValue({ level: 10 });
  mockPrisma.item.findMany.mockResolvedValue([{ id: 'mat-1', quantity: 10 }]);
  mockPrisma.item.findFirst.mockResolvedValue(null);
  mockPrisma.itemTemplate.findUnique.mockResolvedValue({ stackable: true });
  mockPrisma.item.create.mockResolvedValue({ id: 'crafted-1' });
  mockPrisma.turnBank.findUnique.mockResolvedValue({
    playerId: 'player-1',
    currentTurns: 5000,
    regenProgress: 0,
    lastRegenAt: new Date('2026-07-02T12:00:00.000Z'),
  });
  mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });
  mockPrisma.guildMember.findUnique.mockResolvedValue(null);
  mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.fetchItemDTOs?.mockReset?.();
});

describe('craftItem stash destination', () => {
  it('creates non-stackable crafted items in stash and does not append them to backpack state', async () => {
    const res = await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      destination: 'stash',
    }));

    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inStash: true }),
    }));
    expect(res.body.stateUpdates.inventoryAdded).toBeUndefined();
    expect(res.body.stateUpdates.materialTotals).toBeDefined();
  });

  it('allows stash destination while over-encumbered by skipping assertCanAct', async () => {
    const routeHelpers = await import('../../utils/routeHelpers.js');

    await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      destination: 'stash',
    }));

    expect(routeHelpers.assertNotRecovering).toHaveBeenCalledWith('player-1');
    expect(routeHelpers.assertCanAct).not.toHaveBeenCalled();
  });

  it('keeps current inventory destination guard behavior', async () => {
    const routeHelpers = await import('../../utils/routeHelpers.js');

    await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      destination: 'inventory',
    }));

    expect(routeHelpers.assertCanAct).toHaveBeenCalledWith('player-1');
  });
});
```

If this scaffold exposes missing mocks after the first run, add only the missing mocked method named by Vitest and keep the three assertions unchanged.

- [ ] **Step 2: Run stash tests to verify failure**

Run: `rtk npm run test -w apps/api -- --run src/services/crafting/craftRouteService.test.ts`

Expected: FAIL because `destination` is not parsed and stash persistence is absent.

- [ ] **Step 3: Extend craft schema**

In `apps/api/src/services/crafting/helpers.ts`, replace `craftSchema` with:

```ts
const autoForgeTargetSchema = z.enum(['rare', 'epic', 'legendary']);

export const craftSchema = z.object({
  recipeId: z.string().uuid(),
  quantity: z.number().int().positive().max(CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY).default(1),
  destination: z.enum(['inventory', 'stash']).default('inventory'),
  autoForgeMinRarity: autoForgeTargetSchema.nullable().default(null),
});
```

- [ ] **Step 4: Split recovery and over-encumbrance preflight**

In `apps/api/src/services/crafting/craftRouteService.ts`, add imports:

```ts
import type { CraftDestination } from '@pocketrealm/shared';
import { addStackableItemTx, assertNotOverEncumbered, consumeItemsByTemplateTx, getTotalQuantityByTemplate, getInventoryState } from '../../services/inventoryService';
import { serializeXpGrant, assertCanAct, assertNotRecovering, trackAchievements } from '../../utils/routeHelpers.js';
```

Replace the existing preflight:

```ts
    // Pre-flight: not recovering, not over-encumbered
    await assertCanAct(playerId);
```

with:

```ts
    const destination: CraftDestination = body.destination;

    if (destination === 'inventory') {
      await assertCanAct(playerId);
    } else {
      await assertNotRecovering(playerId);
    }
```

- [ ] **Step 5: Skip backpack capacity for stash destination**

Wrap the existing backpack capacity block in:

```ts
    if (destination === 'inventory') {
      if (recipe.resultTemplate.stackable) {
        const existingStack = await prisma.item.findFirst({
          where: { ownerId: playerId, templateId: recipe.resultTemplateId, inStash: false },
        });
        if (!existingStack) {
          const { availableSlots } = await getInventoryState(playerId);
          if (availableSlots < 1) {
            throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
          }
        }
      } else {
        const { availableSlots } = await getInventoryState(playerId);
        if (availableSlots < quantity) {
          throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
        }
      }
    }
```

- [ ] **Step 6: Persist stackable and non-stackable outputs to selected destination**

In the transaction output creation block, use `const outputInStash = destination === 'stash';`.

For stackable results, replace the custom find/update/create branch with:

```ts
        const added = await addStackableItemTx(
          tx,
          playerId,
          recipe.resultTemplateId,
          quantity,
          outputInStash,
        );
        if (added.created) {
          newItemIds.push(added.itemId);
        } else {
          updatedItemIds.push(added.itemId);
        }
```

For non-stackable `tx.item.create`, include:

```ts
              inStash: outputInStash,
```

- [ ] **Step 7: Keep stashed outputs out of backpack state updates**

Before fetching item DTOs near the return response, derive backpack output IDs:

```ts
    const backpackNewItemIds = destination === 'inventory' ? newItemIds : [];
    const backpackUpdatedOutputIds = destination === 'inventory' ? updatedItemIds : [];
```

Then change the Promise list:

```ts
      fetchItemDTOs(backpackNewItemIds),
      fetchItemDTOs([...partiallyConsumedIds, ...backpackUpdatedOutputIds]),
```

Keep `crafted.craftedItemIds` as `allCraftedItemIds` for both destinations.

- [ ] **Step 8: Run focused stash tests**

Run: `rtk npm run test -w apps/api -- --run src/services/crafting/craftRouteService.test.ts`

Expected: PASS for the stash tests added in this task.

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/services/crafting/helpers.ts apps/api/src/services/crafting/craftRouteService.ts apps/api/src/services/crafting/craftRouteService.test.ts
git commit -m "feat: allow crafting directly to stash"
```

---

### Task 5: Craft Auto-Forge API Integration

**Files:**
- Modify: `apps/api/src/services/crafting/craftRouteService.ts`
- Modify: `apps/api/src/services/crafting/craftRouteService.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 helpers from `@pocketrealm/game-engine`
  - Task 2 `assertCanSpendWithTaxTx`
  - Task 3 auto-forge accumulator
  - Existing `getRecipeDiscountedCost`, `spendWithTaxTx`, `grantSkillXp`, `trackProgress`, `trackAchievements`, `createActivityLog`
- Produces:
  - Auto-forge request validation for eligible recipes only.
  - Max reserved preflight before material consumption.
  - Actual spend based on actual craft attempts plus rolled forge attempts.
  - `autoForge` response summary with ordered attempt log.
  - `crafted.quantity` equal to actual craft attempts used.

- [ ] **Step 1: Add failing auto-forge service tests**

Extend `apps/api/src/services/crafting/craftRouteService.test.ts`:

```ts
describe('craftItem auto-forge', () => {
  it('rejects auto-forge for stackable recipes', async () => {
    mockRecipe(true);

    await expect(craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 2,
      autoForgeMinRarity: 'rare',
    }))).rejects.toMatchObject({
      code: 'AUTO_FORGE_INELIGIBLE',
    });
  });

  it('preflights max reserved turns before consuming materials', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'player-1',
      currentTurns: 10,
      regenProgress: 0,
      lastRegenAt: new Date('2026-07-02T12:00:00.000Z'),
    });

    await expect(craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 4,
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    }))).rejects.toMatchObject({
      code: 'INSUFFICIENT_TURNS',
    });

    expect(mockPrisma.item.delete).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: expect.any(Number) }),
    }));
  });

  it('spends actual craft plus forge turns, not max reserved turns', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.99);

    await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 2,
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    }));

    expect(mockPrisma.turnBank.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentTurns: 5000 - 140 }),
    }));
  });

  it('persists below-target leftovers and reports them', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const res = await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 3,
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    }));

    expect(res.body.autoForge.leftoverCountsByRarity).toEqual({ common: 1 });
    expect(res.body.autoForge.attempts[0].success).toBe(false);
    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inStash: true }),
    }));
  });

  it('stops inventory auto-forge when persisted outputs fill available slots', async () => {
    mockPrisma.item.findFirst.mockResolvedValue(null);
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'mat-1', quantity: 20 }]);
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });
    mockPrisma.item.count?.mockResolvedValue?.(21);

    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);

    const res = await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 10,
      destination: 'inventory',
      autoForgeMinRarity: 'rare',
    }));

    expect(res.body.crafted.quantity).toBeLessThanOrEqual(10);
    expect(res.body.crafted.craftedItemIds.length).toBeLessThanOrEqual(3);
  });
});
```

If the inventory-capacity test needs a different mock for `getInventoryState`, adjust the mock return for the Prisma method used by `getUsedSlots` so `availableSlots` is exactly `3`.

- [ ] **Step 2: Run auto-forge tests to verify failure**

Run: `rtk npm run test -w apps/api -- --run src/services/crafting/craftRouteService.test.ts`

Expected: FAIL because auto-forge validation, planning, and response are not integrated.

- [ ] **Step 3: Add auto-forge imports and local helper types**

In `apps/api/src/services/crafting/craftRouteService.ts`, add imports:

```ts
import {
  calculateCraftMaxReservedBaseTurnCost,
  getAutoForgeMinimumOpenSlots,
  isAutoForgeEligibleItemType,
  type UpgradeableRarity,
} from '@pocketrealm/game-engine';
import { assertCanSpendWithTaxTx } from '../../services/guildTaxService';
import {
  addCraftedItemToAutoForge,
  createCraftAutoForgeAccumulator,
  finishCraftAutoForge,
  getAutoForgePersistedItemCount,
  type CraftVirtualItem,
} from './autoForgePlanner';
```

Add local helpers near the top of the file:

```ts
function makeVirtualId(index: number): string {
  return `craft-${index}`;
}

function countRareOrBetter(details: Array<{ rarity: ItemRarity }>): number {
  return details.filter((d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary').length;
}
```

- [ ] **Step 4: Validate auto-forge eligibility and inventory slots**

After recipe validation and before material validation:

```ts
    const autoForgeTarget = body.autoForgeMinRarity;
    const itemType: ItemType = isItemType(recipe.resultTemplate.itemType)
      ? recipe.resultTemplate.itemType
      : 'resource';
    const autoForgeEnabled = autoForgeTarget !== null;

    if (autoForgeEnabled && !isAutoForgeEligibleItemType(itemType, recipe.resultTemplate.stackable)) {
      throw new AppError(
        400,
        'Auto-forge can only be used on non-stackable weapon and armor recipes',
        'AUTO_FORGE_INELIGIBLE',
      );
    }

    const inventoryState = await getInventoryState(playerId);
    if (autoForgeEnabled && destination === 'inventory') {
      const minimumSlots = getAutoForgeMinimumOpenSlots(autoForgeTarget);
      if (inventoryState.availableSlots < minimumSlots) {
        throw new AppError(
          400,
          `Auto-forge to ${autoForgeTarget}+ requires ${minimumSlots} open backpack slots`,
          'BACKPACK_FULL',
        );
      }
    }
```

Reuse `inventoryState` in the existing non-auto capacity checks to avoid a second capacity query.

- [ ] **Step 5: Compute discounted upgrade costs and max reserved base cost**

Before the transaction:

```ts
    const upgradeCostsByRarity: Record<UpgradeableRarity, number> = {
      common: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.common),
      uncommon: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.uncommon),
      rare: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.rare),
      epic: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.epic),
    };

    const maxReservedBaseTurnCost = calculateCraftMaxReservedBaseTurnCost({
      craftAttempts: quantity,
      craftTurnCostPerAttempt: recipe.turnCost,
      autoForgeTarget,
      upgradeCostsByRarity,
    });
```

- [ ] **Step 6: Build virtual craft results incrementally when auto-forge is enabled**

Replace the non-stackable pre-roll loop with a branch that can stop for inventory capacity:

```ts
    let actualQuantity = quantity;
    let autoForgePlan: ReturnType<typeof finishCraftAutoForge> | null = null;
    let preRolledItems: Array<{
      rarity: ItemRarity;
      bonusStats: Prisma.InputJsonObject | undefined;
      isCrit: boolean;
      bonusEntries: [string, number][];
    }> | null = null;

    if (!recipe.resultTemplate.stackable) {
      const equipStats = await getEquipmentStats(playerId);
      const guildMods = await getPlayerGuildModifiers(playerId);
      const hasChampion = await getHasActivePremiumEntitlement(prisma, playerId);
      const championMultiplier = hasChampion ? PREMIUM_CONSTANTS.BONUS_MULTIPLIER : 1;
      const combinedCritBonus = guildMods.craftingCrit + shopCraftingCrit;
      const effectiveCraftLuck = combinedCritBonus > 0
        ? equipStats.luck + Math.floor(combinedCritBonus / CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT)
        : equipStats.luck;
      const forgeLuck = equipStats.luck;
      const templateBaseStats = recipe.resultTemplate.baseStats as ItemStats | null | undefined;
      const templateSlot = (recipe.resultTemplate.slot as EquipmentSlot | null) ?? undefined;

      if (autoForgeEnabled) {
        const accumulator = createCraftAutoForgeAccumulator({
          targetRarity: autoForgeTarget,
          itemType,
          baseStats: templateBaseStats,
          slot: templateSlot,
          luckStat: forgeLuck,
          upgradeCostsByRarity,
        });

        for (let i = 0; i < quantity; i++) {
          const critResult = calculateCraftingCrit({
            skillLevel,
            requiredLevel: recipe.requiredLevel,
            luckStat: effectiveCraftLuck,
            itemType,
            baseStats: templateBaseStats,
            slot: templateSlot,
            championMultiplier,
          });
          const rolledBonusStats = rollBonusStatsForRarity({
            itemType,
            rarity: critResult.rarity,
            baseStats: templateBaseStats,
            slot: templateSlot,
          });
          const bonusEntries = Object.entries(rolledBonusStats ?? {})
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));

          const virtualItem: CraftVirtualItem = {
            virtualId: makeVirtualId(i + 1),
            rarity: critResult.rarity,
            bonusStats: rolledBonusStats ? (rolledBonusStats as Prisma.InputJsonObject) : undefined,
            isCrit: critResult.isCrit,
            bonusEntries,
          };
          addCraftedItemToAutoForge(accumulator, virtualItem);
          actualQuantity = i + 1;

          if (destination === 'inventory' && getAutoForgePersistedItemCount(accumulator) >= inventoryState.availableSlots) {
            break;
          }
        }

        autoForgePlan = finishCraftAutoForge(accumulator);
      } else {
        preRolledItems = [];
        for (let i = 0; i < quantity; i++) {
          const critResult = calculateCraftingCrit({
            skillLevel,
            requiredLevel: recipe.requiredLevel,
            luckStat: effectiveCraftLuck,
            itemType,
            baseStats: templateBaseStats,
            slot: templateSlot,
            championMultiplier,
          });
          const rolledBonusStats = rollBonusStatsForRarity({
            itemType,
            rarity: critResult.rarity,
            baseStats: templateBaseStats,
            slot: templateSlot,
          });
          const bonusStats = rolledBonusStats
            ? (rolledBonusStats as Prisma.InputJsonObject)
            : undefined;
          const bonusEntries = Object.entries(rolledBonusStats ?? {})
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
          preRolledItems.push({ rarity: critResult.rarity, bonusStats, isCrit: critResult.isCrit, bonusEntries });
        }
      }
    }
```

- [ ] **Step 7: Move spend preflight and actual spend into the transaction**

Inside the transaction, before spending and material consumption:

```ts
      await assertCanSpendWithTaxTx(tx, playerId, maxReservedBaseTurnCost);
      const actualBaseTurnCost = recipe.turnCost * actualQuantity + (autoForgePlan?.summary.actualForgeTurnCost ?? 0);
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, actualBaseTurnCost);
```

Change material consumption to use `actualQuantity`:

```ts
        const consumeResult = await consumeItemsByTemplateTx(tx, playerId, mat.templateId, mat.quantity * actualQuantity);
```

- [ ] **Step 8: Persist auto-forge final items and leftovers**

In the non-stackable creation branch:

```ts
        const persistedVirtualItems = autoForgePlan?.allPersistedItems ?? preRolledItems!.map((rolled, index) => ({
          virtualId: makeVirtualId(index + 1),
          rarity: rolled.rarity,
          bonusStats: rolled.bonusStats,
          isCrit: rolled.isCrit,
          bonusEntries: rolled.bonusEntries,
        }));

        for (const virtualItem of persistedVirtualItems) {
          const created = await tx.item.create({
            data: {
              ownerId: playerId,
              templateId: recipe.resultTemplateId,
              rarity: virtualItem.rarity,
              quantity: 1,
              maxDurability: craftedMax,
              currentDurability: craftedMax,
              bonusStats: virtualItem.bonusStats ?? undefined,
              inStash: outputInStash,
            },
            select: { id: true },
          });
          newItemIds.push(created.id);
          if (virtualItem.isCrit && virtualItem.bonusEntries.length > 0) {
            itemDetails.push({
              id: created.id,
              isCrit: true,
              rarity: virtualItem.rarity,
              bonusStats: Object.fromEntries(virtualItem.bonusEntries),
            });
          } else {
            itemDetails.push({ id: created.id, isCrit: false, rarity: virtualItem.rarity });
          }
        }
```

- [ ] **Step 9: Return auto-forge summary and use actual quantity everywhere**

Change `quantity` to `actualQuantity` in XP, guild XP, quest progress, achievement counters, activity log result, and `crafted.quantity`.

Before `return routeJson`, build:

```ts
    const autoForgeSummary = autoForgePlan
      ? {
          ...autoForgePlan.summary,
          maxReservedTurnCost: maxReservedBaseTurnCost,
        }
      : undefined;
```

Add to route JSON:

```ts
      ...(autoForgeSummary ? { autoForge: autoForgeSummary } : {}),
```

For rare craft progress and chat broadcast, use `const rareCount = countRareOrBetter(craftedItemDetails);`.

- [ ] **Step 10: Include auto-forge details in persisted activity log**

In the `createActivityLog` result payload, include:

```ts
        destination,
        requestedQuantity: quantity,
        actualQuantity,
        autoForge: autoForgeSummary ?? null,
```

Keep `turnsSpent: turnSpend.spent` as the actual taxed spend.

- [ ] **Step 11: Run focused API tests**

Run: `rtk npm run test -w apps/api -- --run src/services/crafting/autoForgePlanner.test.ts src/services/crafting/craftRouteService.test.ts src/services/turnBankService.test.ts src/services/guildTaxService.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit**

```powershell
git add apps/api/src/services/crafting/craftRouteService.ts apps/api/src/services/crafting/craftRouteService.test.ts
git commit -m "feat: add craft-scoped auto-forge"
```

---

### Task 6: Frontend Craft Controls, API Types, And Activity Log

**Files:**
- Modify: `apps/web/src/lib/api/items.ts`
- Modify: `apps/web/src/app/game/hooks/useCraftingActions.ts`
- Modify: `apps/web/src/app/game/renderers/professionScreenRenderers.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/components/screens/Crafting.test.tsx`

**Interfaces:**
- Consumes:
  - `CraftDestination`, `AutoForgeTarget`, `CraftAutoForgeSummary`
  - `calculateAutoForgeExpectedForgeTurnCost`, `calculateCraftMaxReservedBaseTurnCost`, `getAutoForgeMinimumOpenSlots`, `isAutoForgeEligibleItemType`
  - Existing `inflateCost`, `ActivityLogEntry`, `CraftingRecipeResponse`
- Produces:
  - `interface CraftRequestOptions { destination?: CraftDestination; autoForgeMinRarity?: AutoForgeTarget | null }`
  - `craft(recipeId: string, quantity?: number, options?: CraftRequestOptions)`
  - `onCraft(recipeId: string, quantity: number, options: CraftRequestOptions)`
  - Crafting screen destination segmented control and auto-forge segmented control.

- [ ] **Step 1: Write failing Crafting UI tests**

Extend `apps/web/src/components/screens/Crafting.test.tsx`:

```tsx
// Add to baseRecipe:
// itemType: 'resource',

function renderCraftingWithSpy(
  recipes: React.ComponentProps<typeof Crafting>['recipes'],
  props: Partial<React.ComponentProps<typeof Crafting>> = {},
) {
  const onCraft = vi.fn();
  render(
    <Crafting
      skillName="Tailoring"
      skillLevel={10}
      xpRate={100}
      recipes={recipes}
      onCraft={onCraft}
      activityLog={[]}
      zoneCraftingLevel={null}
      zoneName={null}
      showNpcDialogue={false}
      availableSlots={10}
      {...props}
    />,
  );
  return onCraft;
}

const equipmentRecipe = {
  ...baseRecipe,
  id: 'robe',
  name: 'Silk Robe',
  itemType: 'armor',
  stackable: false,
  materials: [{ name: 'Silk', icon: '?', required: 1, owned: 200 }],
};

it('defaults craft destination to inventory', () => {
  const onCraft = renderCraftingWithSpy([equipmentRecipe]);

  fireEvent.click(screen.getByRole('button', { name: /Craft Silk Robe/i }));

  expect(onCraft).toHaveBeenCalledWith('robe', 1, {
    destination: 'inventory',
    autoForgeMinRarity: null,
  });
});

it('sends stash destination and rare auto-forge target', () => {
  const onCraft = renderCraftingWithSpy([equipmentRecipe]);

  fireEvent.click(screen.getByRole('button', { name: 'Stash' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rare+' }));
  fireEvent.click(screen.getByRole('button', { name: /Craft Silk Robe to stash and forge to Rare\+/i }));

  expect(screen.getByText('Craft attempts')).toBeTruthy();
  expect(onCraft).toHaveBeenCalledWith('robe', 1, {
    destination: 'stash',
    autoForgeMinRarity: 'rare',
  });
});

it('hides auto-forge controls for stackable recipes', () => {
  renderCraftingWithSpy([{ ...baseRecipe, id: 'thread', name: 'Thread', itemType: 'resource', stackable: true }]);

  expect(screen.queryByRole('button', { name: 'Rare+' })).toBeNull();
});

it('disables inventory auto-forge when minimum open slots are missing', () => {
  renderCraftingWithSpy([equipmentRecipe], { availableSlots: 2 });

  fireEvent.click(screen.getByRole('button', { name: 'Rare+' }));

  expect(screen.getByText('Rare+ auto-forge needs 3 open backpack slots.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Need 3 Open Slots/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run: `rtk npm run test -w apps/web -- --run src/components/screens/Crafting.test.tsx`

Expected: FAIL because Crafting props and controls do not exist.

- [ ] **Step 3: Extend web API types**

In `apps/web/src/lib/api/items.ts`, add:

```ts
import type {
  AutoForgeTarget,
  CraftAutoForgeSummary,
  CraftDestination,
} from '@pocketrealm/shared';
```

Add near crafting API:

```ts
export interface CraftRequestOptions {
  destination?: CraftDestination;
  autoForgeMinRarity?: AutoForgeTarget | null;
}
```

Change `craft` signature and body:

```ts
export async function craft(recipeId: string, quantity: number = 1, options: CraftRequestOptions = {}) {
```

```ts
    autoForge?: CraftAutoForgeSummary;
```

```ts
    body: JSON.stringify({
      recipeId,
      quantity,
      destination: options.destination ?? 'inventory',
      autoForgeMinRarity: options.autoForgeMinRarity ?? null,
    }),
```

- [ ] **Step 4: Update crafting action signature and log lines**

In `apps/web/src/app/game/hooks/useCraftingActions.ts`, import `CraftRequestOptions`:

```ts
import { craft, type CraftRequestOptions } from '@/lib/api';
```

Change `handleCraft` signature:

```ts
  const handleCraft = useCallback(async (
    recipeId: string,
    quantity: number = 1,
    options: CraftRequestOptions = {},
  ) => {
```

Change API call:

```ts
      const res = await craft(recipeId, quantity, options);
```

After crit craft logs, add:

```ts
      if (data.autoForge) {
        for (const attempt of data.autoForge.attempts) {
          newLogs.push({
            timestamp,
            type: attempt.success ? 'success' : 'info',
            message: attempt.success
              ? `Auto-forge ${attempt.fromRarity} -> ${attempt.toRarity} succeeded.`
              : `Auto-forge ${attempt.fromRarity} -> ${attempt.toRarity} failed.`,
          });
        }

        const finalSummary = Object.entries(data.autoForge.finalCountsByRarity)
          .map(([rarity, count]) => `${rarity} x${count}`)
          .join(', ');
        if (finalSummary) {
          newLogs.push({
            timestamp,
            type: 'success',
            message: `Auto-forge results: ${finalSummary}.`,
          });
        }

        const leftoverSummary = Object.entries(data.autoForge.leftoverCountsByRarity)
          .map(([rarity, count]) => `${rarity} x${count}`)
          .join(', ');
        if (leftoverSummary) {
          newLogs.push({
            timestamp,
            type: 'info',
            message: `Auto-forge leftovers: ${leftoverSummary}.`,
          });
        }
      }
```

Change tracking craft turn estimate:

```ts
      const craftTurns = recipe ? recipe.turnCost * data.crafted.quantity : 50;
```

- [ ] **Step 5: Pass item type through renderer**

In `apps/web/src/app/game/renderers/professionScreenRenderers.tsx`, add `itemType` to the recipe map:

```ts
          itemType: recipe.resultTemplate.itemType,
```

No changes to `ForgeScreenRenderer`; it continues to use `gc.inventory` only.

- [ ] **Step 6: Add Crafting component state and types**

In `apps/web/src/components/screens/Crafting.tsx`, add imports:

```ts
import {
  calculateAutoForgeExpectedForgeTurnCost,
  calculateCraftMaxReservedBaseTurnCost,
  getAutoForgeMinimumOpenSlots,
  isAutoForgeEligibleItemType,
} from '@pocketrealm/game-engine';
import type { AutoForgeTarget, CraftDestination, ItemType } from '@pocketrealm/shared';
```

Extend `Recipe`:

```ts
  itemType: string;
```

Change `onCraft`:

```ts
  onCraft: (
    recipeId: string,
    quantity: number,
    options: { destination: CraftDestination; autoForgeMinRarity: AutoForgeTarget | null },
  ) => void;
```

Add state inside the component:

```ts
  const [destination, setDestination] = useState<CraftDestination>('inventory');
  const [autoForgeMinRarity, setAutoForgeMinRarity] = useState<AutoForgeTarget | null>(null);
```

Add this local type guard near the other helper functions:

```ts
function isKnownItemType(value: string): value is ItemType {
  return value === 'weapon' || value === 'armor' || value === 'resource' || value === 'consumable';
}
```

Reset when selected recipe changes:

```ts
      setAutoForgeMinRarity(null);
      setDestination('inventory');
```

Derive selected auto-forge state:

```ts
  const autoForgeEligible = selectedRecipe
    ? isKnownItemType(selectedRecipe.itemType)
      && isAutoForgeEligibleItemType(selectedRecipe.itemType, Boolean(selectedRecipe.stackable))
    : false;
  const selectedAutoForgeTarget = autoForgeEligible ? autoForgeMinRarity : null;
  const quantityLabel = selectedAutoForgeTarget ? 'Craft attempts' : 'Quantity';
  const minimumOpenSlots = selectedAutoForgeTarget ? getAutoForgeMinimumOpenSlots(selectedAutoForgeTarget) : 0;
  const lacksAutoForgeSlots = destination === 'inventory'
    && selectedAutoForgeTarget !== null
    && availableSlots < minimumOpenSlots;
```

- [ ] **Step 7: Allow stash destination to ignore backpack quantity caps in UI**

Change `maxCraftable` for non-stackable recipes:

```ts
    if (recipe.materials.length === 0) {
      if (recipe.stackable) return 99;
      return destination === 'stash' || selectedAutoForgeTarget ? 99 : Math.min(99, availableSlots);
    }
    const materialMax = Math.min(...recipe.materials.map((m) => Math.floor(m.owned / m.required)));
    if (recipe.stackable) return materialMax;
    if (destination === 'stash' || selectedAutoForgeTarget) return materialMax;
    return Math.min(materialMax, availableSlots);
```

Change button disabled logic so over-encumbrance and full backpack only block inventory destination without auto-forge:

```ts
            disabled={
              (destination === 'inventory' && isOverEncumbered)
              || isRecovering
              || isActivityLocked
              || noFacility
              || selectedMax < 1
              || (destination === 'inventory' && !selectedAutoForgeTarget && backpackFull)
              || lacksAutoForgeSlots
            }
```

- [ ] **Step 8: Add controls, preview, labels, and click payload**

Inside `DockedActionBar`, before the quantity selector, add:

```tsx
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['inventory', 'stash'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDestination(value)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  destination === value
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                }`}
              >
                {value === 'inventory' ? 'Inventory' : 'Stash'}
              </button>
            ))}
          </div>

          {autoForgeEligible && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[
                { label: 'Off', value: null },
                { label: 'Rare+', value: 'rare' as const },
                { label: 'Epic+', value: 'epic' as const },
                { label: 'Legendary', value: 'legendary' as const },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setAutoForgeMinRarity(option.value)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    autoForgeMinRarity === option.value
                      ? 'bg-[var(--rpg-blue)] text-white'
                      : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
```

Change quantity label:

```tsx
              <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{quantityLabel}</span>
```

Add preview text under the cost cards or above the button:

```tsx
          {selectedAutoForgeTarget && selectedRecipe && (
            <div className="mb-2 text-xs text-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)] rounded-lg p-3 space-y-1">
              {(() => {
                const craftCost = selectedRecipe.turnCost * quantity;
                const expectedForge = calculateAutoForgeExpectedForgeTurnCost({
                  craftAttempts: quantity,
                  target: selectedAutoForgeTarget,
                  luckStat: 0,
                });
                const maxReserved = calculateCraftMaxReservedBaseTurnCost({
                  craftAttempts: quantity,
                  craftTurnCostPerAttempt: selectedRecipe.turnCost,
                  autoForgeTarget: selectedAutoForgeTarget,
                });
                return (
                  <>
                    <div>Craft: {inflateCost(craftCost, guildTaxRate).toLocaleString()} turns</div>
                    <div>Expected forge: ~{inflateCost(expectedForge, guildTaxRate).toLocaleString()} turns</div>
                    <div>Max reserved: {inflateCost(maxReserved, guildTaxRate).toLocaleString()} turns</div>
                    <div>Unspent turns are kept</div>
                  </>
                );
              })()}
              {lacksAutoForgeSlots && (
                <div className="text-[var(--rpg-red)]">
                  {selectedAutoForgeTarget[0].toUpperCase() + selectedAutoForgeTarget.slice(1)}+ auto-forge needs {minimumOpenSlots} open backpack slots.
                </div>
              )}
            </div>
          )}
```

Change button click:

```tsx
              onCraft(selectedRecipe.id, quantity, {
                destination,
                autoForgeMinRarity: selectedAutoForgeTarget,
              });
```

Change button text branch:

```tsx
              : lacksAutoForgeSlots
              ? `Need ${minimumOpenSlots} Open Slots`
              : selectedAutoForgeTarget && destination === 'stash'
              ? `Craft ${quantity > 1 ? `${quantity}x ` : ''}${selectedRecipe.name} to stash and forge to ${selectedAutoForgeTarget[0].toUpperCase() + selectedAutoForgeTarget.slice(1)}+`
              : selectedAutoForgeTarget
              ? `Craft ${quantity > 1 ? `${quantity}x ` : ''}${selectedRecipe.name} and forge to ${selectedAutoForgeTarget[0].toUpperCase() + selectedAutoForgeTarget.slice(1)}+`
              : destination === 'stash'
              ? `Craft ${quantity > 1 ? `${quantity}x ` : ''}${selectedRecipe.name} to stash`
```

Keep the existing quantity-only labels after the new stash/auto-forge branches.

- [ ] **Step 9: Run focused web tests**

Run: `rtk npm run test -w apps/web -- --run src/components/screens/Crafting.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add apps/web/src/lib/api/items.ts apps/web/src/app/game/hooks/useCraftingActions.ts apps/web/src/app/game/renderers/professionScreenRenderers.tsx apps/web/src/components/screens/Crafting.tsx apps/web/src/components/screens/Crafting.test.tsx
git commit -m "feat: add craft stash and auto-forge controls"
```

---

### Task 7: Documentation, Simplification, And Verification

**Files:**
- Modify: `docs/business-rules.md`
- Review touched code from Tasks 1-6.

**Interfaces:**
- Consumes: Completed code from Tasks 1-6.
- Produces: Business rules documentation and verified feature branch.

- [ ] **Step 1: Update business rules**

Add this section to `docs/business-rules.md` under the crafting rules area:

```md
### Craft To Stash

Crafting can output directly to stash when the craft request uses `destination: "stash"`.
Craft-to-stash still requires recovery, activity lockout, zone, recipe unlock, skill, material, and turn checks.
Craft-to-stash is an exception to the over-encumbrance action block and does not require backpack slots for crafted outputs.

### Craft Auto-Forge

Craft auto-forge is selected in the crafting workflow with `autoForgeMinRarity: "rare" | "epic" | "legendary"`.
It is valid only for non-stackable weapon and armor recipes.
It only uses virtual items created by the current craft request, never existing backpack or stash items.
The server checks conservative max reserved turns before consuming materials, then charges only actual craft and forge work performed.
Forge Luck and Forge Protection buffs are not consumed by craft auto-forge.
Below-target leftovers are kept in the selected craft destination and reported in the craft response.
```

- [ ] **Step 2: Invoke simplify skill**

Use the global `simplify` skill and review only the diff from this branch. Apply changes only when they reduce repetition or clarify touched code without expanding scope.

- [ ] **Step 3: Re-run focused tests after simplification**

Run:

```powershell
rtk npm run test -w packages/game-engine -- --run src/crafting/autoForgeBudget.test.ts
rtk npm run test -w apps/api -- --run src/services/crafting/autoForgePlanner.test.ts src/services/crafting/craftRouteService.test.ts src/services/turnBankService.test.ts src/services/guildTaxService.test.ts
rtk npm run test -w apps/web -- --run src/components/screens/Crafting.test.tsx
```

Expected: all commands PASS.

- [ ] **Step 4: Run broader verification**

Run:

```powershell
rtk npm run test:engine
rtk npm run test:api
rtk npm run test -w apps/web
rtk npm run typecheck
```

Expected: all commands PASS. If `typecheck` reveals unrelated pre-existing failures, record the exact failing files and rerun the narrow checks from Step 3.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
rtk git diff --stat
rtk git diff --check
```

Expected: `git diff --check` exits 0 with no whitespace errors.

- [ ] **Step 6: Commit**

```powershell
git add docs/business-rules.md
git commit -m "docs: describe craft stash auto-forge rules"
```

---

## Self-Review Notes

- Spec coverage: Task 1 covers shared targets, slot constants, and cost helpers. Task 2 covers conservative taxed affordability without spending. Task 3 covers craft-scoped virtual auto-forge and leftovers. Tasks 4 and 5 cover API behavior, stash persistence, turn cost, materials, actual attempts, state updates, and unchanged manual forge. Task 6 covers UI controls, request payload, labels, preview, and logs. Task 7 covers docs, simplification, and verification.
- Type consistency: The plan uses `CraftDestination`, `AutoForgeTarget`, `CraftAutoForgeAttempt`, `CraftAutoForgeSummary`, `CraftVirtualItem`, and `UpgradeableRarity` consistently across shared, engine, API, and web tasks.
- Manual forge boundary: No task changes `apps/api/src/routes/crafting/forge.ts` or `apps/web/src/components/screens/Forge.tsx`; `ForgeScreenRenderer` remains backpack-only.
