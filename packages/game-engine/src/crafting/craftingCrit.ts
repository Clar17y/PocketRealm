import {
  CRAFTING_CONSTANTS,
  CRIT_STAT_CONSTANTS,
  SLOT_STAT_POOLS,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@pocketrealm/shared';
import { clamp, randomUnit } from '../utils/math';

export type CraftingCritStat = keyof ItemStats;

export interface CalculateCraftingCritInput {
  skillLevel: number;
  requiredLevel: number;
  luckStat: number;
  itemType: ItemType;
  baseStats: ItemStats | null | undefined;
  slot?: EquipmentSlot | null;
}

export interface CraftingCritRolls {
  critRoll?: number;
  statRoll?: number;
  bonusPercentRoll?: number;
}

export interface CraftingCritResult {
  isCrit: boolean;
  rarity: ItemRarity;
  critChance: number;
  rareCraftChance: number;
  epicCraftChance: number;
  bonusStat: CraftingCritStat | null;
  bonusValue: number | null;
}

export function calculateCritChance(
  skillLevel: number,
  requiredLevel: number,
  luckStat: number
): number {
  const levelDelta = skillLevel - requiredLevel;
  const luckBonus = luckStat * CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT;
  const rawChance = CRAFTING_CONSTANTS.BASE_CRIT_CHANCE +
    levelDelta * CRAFTING_CONSTANTS.CRIT_CHANCE_PER_LEVEL +
    luckBonus;

  return clamp(
    rawChance,
    CRAFTING_CONSTANTS.MIN_CRIT_CHANCE,
    CRAFTING_CONSTANTS.MAX_CRIT_CHANCE
  );
}

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

function hasPositiveBase(baseStats: ItemStats | null | undefined, stat: string): boolean {
  const value = baseStats?.[stat as keyof ItemStats];
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const OFFENSIVE_STATS = new Set(['attack', 'magicPower', 'rangedPower']);

function filterSlotPool(
  pool: string[],
  baseStats: ItemStats | null | undefined,
  slot: string
): CraftingCritStat[] {
  if (slot !== 'main_hand') return pool as CraftingCritStat[];

  // For main_hand: filter offensive stats by baseStats > 0, keep everything else
  const offensiveInPool = pool.filter((s) => OFFENSIVE_STATS.has(s));
  const nonOffensiveInPool = pool.filter((s) => !OFFENSIVE_STATS.has(s));
  const filteredOffensive = offensiveInPool.filter((s) => hasPositiveBase(baseStats, s));
  const offensive = filteredOffensive.length > 0 ? filteredOffensive : offensiveInPool;
  return [...offensive, ...nonOffensiveInPool] as CraftingCritStat[];
}

export function getEligibleBonusStats(
  itemType: ItemType,
  baseStats?: ItemStats | null | undefined,
  slot?: EquipmentSlot | null
): CraftingCritStat[] {
  if (itemType !== 'weapon' && itemType !== 'armor') return [];

  // Slot-aware path
  if (slot && SLOT_STAT_POOLS[slot]) {
    const { primary, utility } = SLOT_STAT_POOLS[slot]!;
    return [
      ...filterSlotPool(primary, baseStats, slot),
      ...filterSlotPool(utility, baseStats, slot),
    ];
  }

  // Fallback: legacy behavior (no slot provided)
  const utility: CraftingCritStat[] = ['dodge', 'accuracy', 'luck'];

  if (itemType === 'weapon') {
    const offensive: CraftingCritStat[] = ['attack', 'magicPower', 'rangedPower'];
    const primary = offensive.filter((stat) => hasPositiveBase(baseStats, stat));
    return [...(primary.length > 0 ? primary : offensive), ...utility];
  }
  if (itemType === 'armor') {
    const defensive: CraftingCritStat[] = ['armor', 'health'];
    const primary = defensive.filter((stat) => hasPositiveBase(baseStats, stat));
    return [...(primary.length > 0 ? primary : defensive), ...utility];
  }
  return [];
}

function rollBonusPercent(roll?: number): number {
  const unit = randomUnit(roll);
  const span = CRAFTING_CONSTANTS.MAX_BONUS_PERCENT - CRAFTING_CONSTANTS.MIN_BONUS_PERCENT;
  return CRAFTING_CONSTANTS.MIN_BONUS_PERCENT + unit * span;
}

export function rollBonusStat(
  eligibleStats: CraftingCritStat[],
  baseStats: ItemStats | null | undefined,
  rolls?: Pick<CraftingCritRolls, 'statRoll' | 'bonusPercentRoll'>
): { stat: CraftingCritStat; value: number } | null {
  if (eligibleStats.length === 0) return null;

  const statIndex = Math.floor(randomUnit(rolls?.statRoll) * eligibleStats.length);
  const stat = eligibleStats[statIndex]!;

  // Fixed-range crit stats (critChance, critDamage)
  const fixedRange = CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS[stat as keyof typeof CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS];
  if (fixedRange) {
    const unit = randomUnit(rolls?.bonusPercentRoll);
    const value = Math.round((fixedRange.min + unit * (fixedRange.max - fixedRange.min)) * 100) / 100;
    return { stat, value };
  }

  // Standard % of base logic
  const baseValueRaw = baseStats?.[stat];
  const baseValue = typeof baseValueRaw === 'number' && Number.isFinite(baseValueRaw)
    ? Math.max(0, baseValueRaw)
    : 0;
  const bonusPercent = rollBonusPercent(rolls?.bonusPercentRoll);
  const scaled = Math.round(baseValue * bonusPercent);
  const value = Math.max(CRAFTING_CONSTANTS.MIN_BONUS_MAGNITUDE, scaled);

  return { stat, value };
}

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
