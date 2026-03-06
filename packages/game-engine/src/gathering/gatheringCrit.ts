import { GEM_CRIT_CONSTANTS } from '@pocketrealm/shared';

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

export interface GemCritBatchResult {
  gemsFound: number;
  critChance: number;
}

export function rollGemCritBatch(
  input: GemCritInput,
  actions: number,
  rolls?: number[],
): GemCritBatchResult {
  const critChance = calculateGemCritChance(input.skillLevel, input.nodeLevel, input.luckStat);
  let gemsFound = 0;
  for (let i = 0; i < actions; i++) {
    const r = rolls ? rolls[i] : Math.random();
    if (r < critChance) gemsFound++;
  }
  return { gemsFound, critChance };
}
