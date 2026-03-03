import { CHEST_CONSTANTS } from '@adventure/shared';
import type { EncounterSiteSize } from '@adventure/shared';
export type { EncounterSiteSize };
export type ChestRarity = 'common' | 'uncommon' | 'rare';

export function getChestRarityForEncounterSize(size: EncounterSiteSize): ChestRarity {
  if (size === 'small') return 'common';
  if (size === 'medium') return 'uncommon';
  return 'rare';
}

export function getChestRecipeChanceForEncounterSize(size: EncounterSiteSize): number {
  if (size === 'small') return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_SMALL;
  if (size === 'medium') return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_MEDIUM;
  return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_LARGE;
}

export function getChestMaterialRollRangeForEncounterSize(size: EncounterSiteSize): { min: number; max: number } {
  if (size === 'small') return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_SMALL;
  if (size === 'medium') return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_MEDIUM;
  return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LARGE;
}

export function rollChestMaterialRolls(
  size: EncounterSiteSize,
  rng: () => number = Math.random
): number {
  const { min, max } = getChestMaterialRollRangeForEncounterSize(size);
  if (min >= max) return min;
  const roll = Math.max(0, Math.min(1, rng()));
  return Math.floor(roll * (max - min + 1)) + min;
}

export function rollEncounterChestRecipeDrop(
  size: EncounterSiteSize,
  rng: () => number = Math.random
): boolean {
  const chance = Math.max(0, Math.min(1, getChestRecipeChanceForEncounterSize(size)));
  return rng() < chance;
}

export function getUpgradedChestSize(size: EncounterSiteSize): EncounterSiteSize {
  if (size === 'small') return 'medium';
  if (size === 'medium') return 'large';
  return 'large';
}
