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
