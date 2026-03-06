import {
  ITEM_RARITY_CONSTANTS,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@pocketrealm/shared';
import { getEligibleBonusStats, rollBonusStat } from '../crafting/craftingCrit';
import { clamp, randomUnit } from '../utils/math';

export interface RarityWeights {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface RollBonusStatsForRarityInput {
  itemType: ItemType;
  rarity: ItemRarity;
  baseStats: ItemStats | null | undefined;
  slot?: EquipmentSlot | null;
  statRolls?: number[];
  bonusPercentRolls?: number[];
}

export function getBonusSlotCount(rarity: ItemRarity): number {
  return ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY[rarity];
}

export function rarityFromBonusSlotCount(slotCount: number): ItemRarity {
  if (slotCount >= ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY.legendary) return 'legendary';
  if (slotCount >= ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY.epic) return 'epic';
  if (slotCount >= ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY.rare) return 'rare';
  if (slotCount >= ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY.uncommon) return 'uncommon';
  return 'common';
}

export function getNextRarity(rarity: ItemRarity): ItemRarity | null {
  if (rarity === 'common') return 'uncommon';
  if (rarity === 'uncommon') return 'rare';
  if (rarity === 'rare') return 'epic';
  if (rarity === 'epic') return 'legendary';
  return null;
}

export function getForgeUpgradeCost(rarity: ItemRarity): number | null {
  if (rarity === 'legendary') return null;
  return ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY[rarity];
}

export function getForgeRerollCost(rarity: ItemRarity): number | null {
  if (rarity === 'common') return null;
  return ITEM_RARITY_CONSTANTS.REROLL_TURN_COST_BY_RARITY[rarity];
}

export function calculateCraftingTurnDiscount(baseCost: number, skillLevel: number, requiredLevel: number): number {
  const levelsAbove = Math.max(0, skillLevel - requiredLevel);
  if (levelsAbove >= ITEM_RARITY_CONSTANTS.FORGE_DISCOUNT_MAX_LEVELS) return 0;
  const discount = levelsAbove * ITEM_RARITY_CONSTANTS.FORGE_DISCOUNT_PER_LEVEL_ABOVE;
  // Epsilon guards against IEEE 754 rounding (e.g. 3*0.20 = 0.6000000000000001)
  return Math.floor(baseCost * (1 - discount) + 1e-9);
}

export function calculateForgeUpgradeSuccessChance(rarity: ItemRarity, luckStat: number): number | null {
  if (rarity === 'legendary') return null;

  const baseChance = ITEM_RARITY_CONSTANTS.UPGRADE_SUCCESS_BY_RARITY[rarity];
  const luckBonusRaw = Math.max(0, luckStat) * ITEM_RARITY_CONSTANTS.FORGE_LUCK_SUCCESS_BONUS_PER_POINT;
  const luckBonus = Math.min(ITEM_RARITY_CONSTANTS.FORGE_LUCK_SUCCESS_BONUS_CAP, luckBonusRaw);
  return clamp(baseChance + luckBonus, 0, 1);
}

export function rollForgeUpgradeSuccess(rarity: ItemRarity, luckStat: number, roll?: number): boolean {
  const successChance = calculateForgeUpgradeSuccessChance(rarity, luckStat);
  if (successChance === null) return false;
  return randomUnit(roll) < successChance;
}

export function calculateDropRarityWeights(mobLevel: number, dropChanceMultiplier: number): RarityWeights {
  const base = ITEM_RARITY_CONSTANTS.DROP_WEIGHT_BY_RARITY;
  const levelsAboveOne = Math.max(0, mobLevel - 1);
  const totalShiftRequest = levelsAboveOne * ITEM_RARITY_CONSTANTS.DROP_WEIGHT_SHIFT_PER_LEVEL_ABOVE_ONE;
  const totalShift = Math.min(base.common, totalShiftRequest);

  const shiftDistribution = ITEM_RARITY_CONSTANTS.DROP_WEIGHT_SHIFT_DISTRIBUTION;
  const shiftTotal =
    shiftDistribution.uncommon +
    shiftDistribution.rare +
    shiftDistribution.epic +
    shiftDistribution.legendary;

  const uncommonShift = shiftTotal > 0 ? totalShift * (shiftDistribution.uncommon / shiftTotal) : 0;
  const rareShift = shiftTotal > 0 ? totalShift * (shiftDistribution.rare / shiftTotal) : 0;
  const epicShift = shiftTotal > 0 ? totalShift * (shiftDistribution.epic / shiftTotal) : 0;
  const legendaryShift = shiftTotal > 0 ? totalShift * (shiftDistribution.legendary / shiftTotal) : 0;

  const safeMultiplier = Math.max(0, Number.isFinite(dropChanceMultiplier) ? dropChanceMultiplier : 1);

  return {
    common: Math.max(0, base.common - totalShift),
    uncommon: Math.max(0, (base.uncommon + uncommonShift) * safeMultiplier),
    rare: Math.max(0, (base.rare + rareShift) * safeMultiplier),
    epic: Math.max(0, (base.epic + epicShift) * safeMultiplier),
    legendary: Math.max(0, (base.legendary + legendaryShift) * safeMultiplier),
  };
}

export function rollRarityByWeights(weights: RarityWeights, roll?: number): ItemRarity {
  const total = weights.common + weights.uncommon + weights.rare + weights.epic + weights.legendary;
  if (total <= 0) return 'common';

  let cursor = randomUnit(roll) * total;
  const ordered: Array<{ rarity: ItemRarity; weight: number }> = [
    { rarity: 'common', weight: weights.common },
    { rarity: 'uncommon', weight: weights.uncommon },
    { rarity: 'rare', weight: weights.rare },
    { rarity: 'epic', weight: weights.epic },
    { rarity: 'legendary', weight: weights.legendary },
  ];

  for (const entry of ordered) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.rarity;
  }
  return 'legendary';
}

export function rollDropRarity(mobLevel: number, dropChanceMultiplier: number, roll?: number): ItemRarity {
  const weights = calculateDropRarityWeights(mobLevel, dropChanceMultiplier);
  return rollRarityByWeights(weights, roll);
}

function takeRoll(rolls: number[] | undefined, index: number): number | undefined {
  if (!rolls) return undefined;
  const value = rolls[index];
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

export function rollBonusStatsForRarity(input: RollBonusStatsForRarityInput): ItemStats | null {
  const slotCount = getBonusSlotCount(input.rarity);
  if (slotCount <= 0) return null;

  const statPool = getEligibleBonusStats(input.itemType, input.baseStats, input.slot);
  if (statPool.length === 0) return null;

  const targetSlots = slotCount;
  const result: ItemStats = {};

  for (let i = 0; i < targetSlots; i++) {
    const rolled = rollBonusStat(statPool, input.baseStats, {
      statRoll: takeRoll(input.statRolls, i),
      bonusPercentRoll: takeRoll(input.bonusPercentRolls, i),
    });

    if (!rolled) break;
    const prev = result[rolled.stat];
    const prevValue = typeof prev === 'number' && Number.isFinite(prev) ? prev : 0;
    result[rolled.stat] = prevValue + rolled.value;
  }

  return Object.keys(result).length > 0 ? result : null;
}
