import { GEM_CRIT_CONSTANTS } from '@adventure/shared';

export interface GemCritInput {
  skillLevel: number;
  nodeLevel: number;
  luckStat: number;
}

export interface GemCritResult {
  isCrit: boolean;
  critChance: number;
}

export function calculateGemCritChance(
  skillLevel: number,
  nodeLevel: number,
  luckStat: number,
): number {
  const levelsAbove = Math.max(0, skillLevel - nodeLevel);
  const raw =
    GEM_CRIT_CONSTANTS.BASE_CHANCE +
    levelsAbove * GEM_CRIT_CONSTANTS.LEVEL_BONUS +
    luckStat * GEM_CRIT_CONSTANTS.LUCK_BONUS;
  return Math.min(raw, GEM_CRIT_CONSTANTS.MAX_CHANCE);
}

export function rollGemCrit(input: GemCritInput, roll?: number): GemCritResult {
  const critChance = calculateGemCritChance(input.skillLevel, input.nodeLevel, input.luckStat);
  const r = typeof roll === 'number' ? roll : Math.random();
  return { isCrit: r < critChance, critChance };
}
