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
const AUTO_FORGE_TARGETS = new Set(CRAFTING_CONSTANTS.AUTO_FORGE_TARGETS);

function rarityIndex(rarity: ItemRarity): number {
  return RARITY_INDEX.get(rarity) ?? 0;
}

function raritiesBelowTarget(target: AutoForgeTarget): UpgradeableRarity[] {
  const targetIndex = rarityIndex(target);
  return UPGRADEABLE_RARITIES.filter((rarity) => rarityIndex(rarity) < targetIndex);
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
  return typeof value === 'string' && AUTO_FORGE_TARGETS.has(value as AutoForgeTarget);
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

  const rarities = raritiesBelowTarget(target);
  let states = new Map<string, number>([['0:0', 0]]);

  for (let rarityPosition = 0; rarityPosition < rarities.length; rarityPosition++) {
    const rarity = rarities[rarityPosition];
    const nextStates = new Map<string, number>();

    for (const [stateKey, totalCost] of states) {
      const [usedItemsText, carryItemsText] = stateKey.split(':');
      const usedItems = Number(usedItemsText);
      const carryItems = Number(carryItemsText);
      const remainingItems = craftAttempts - usedItems;

      for (let startItems = 0; startItems <= remainingItems; startItems++) {
        const totalItemsAtRarity = carryItems + startItems;
        const pairs = Math.floor(totalItemsAtRarity / 2);
        const nextUsedItems = usedItems + startItems;
        const nextCarryItems = rarityPosition === rarities.length - 1 ? 0 : pairs;
        const nextCost = totalCost + pairs * upgradeCost(rarity, upgradeCostsByRarity);
        const nextKey = `${nextUsedItems}:${nextCarryItems}`;
        const previousBest = nextStates.get(nextKey) ?? -1;

        if (nextCost > previousBest) {
          nextStates.set(nextKey, nextCost);
        }
      }
    }

    states = nextStates;
  }

  let maximumCost = 0;
  for (const [stateKey, totalCost] of states) {
    const [usedItemsText] = stateKey.split(':');
    if (Number(usedItemsText) === craftAttempts && totalCost > maximumCost) {
      maximumCost = totalCost;
    }
  }

  return maximumCost;
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
