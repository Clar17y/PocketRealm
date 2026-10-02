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
  type UpgradeableRarity,
} from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { normalizeBonusStats } from './helpers';

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

function isUpgradeResultRarity(rarity: ItemRarity): rarity is CraftAutoForgeAttempt['toRarity'] {
  return rarity !== 'common';
}

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
    isCrit: true,
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

        const target = pool.shift();
        const sacrifice = pool.shift();
        if (!target || !sacrifice) {
          throw new AppError(500, 'Auto-forge pool desynchronized', 'AUTO_FORGE_POOL_INVALID');
        }

        const nextRarity = getNextRarity(rarity);
        const successChance = calculateForgeUpgradeSuccessChance(rarity, accumulator.luckStat);
        const turnCost = accumulator.upgradeCostsByRarity[rarity];

        if (!nextRarity || !isUpgradeResultRarity(nextRarity) || successChance === null) {
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
