import { GEM_CRIT_CONSTANTS } from '@pocketrealm/shared';

export interface GemCritInput {
  skillLevel: number;
  nodeLevel: number;
  luckStat: number;
  championMultiplier?: number;
  critChanceBonus?: number;
}

export interface GemCritResult {
  isCrit: boolean;
  critChance: number;
}

export function calculateGemCritChance(
  skillLevel: number,
  nodeLevel: number,
  luckStat: number,
  championMultiplier: number = 1,
  critChanceBonus: number = 0,
): number {
  const levelsAbove = Math.max(0, skillLevel - nodeLevel);
  const raw =
    GEM_CRIT_CONSTANTS.BASE_CHANCE +
    levelsAbove * GEM_CRIT_CONSTANTS.LEVEL_BONUS +
    luckStat * GEM_CRIT_CONSTANTS.LUCK_BONUS;
  const multiplier = Number.isFinite(championMultiplier) ? Math.max(1, championMultiplier) : 1;
  const bonus = Number.isFinite(critChanceBonus) ? critChanceBonus : 0;
  return Math.min(Math.max(0, raw * multiplier + bonus), GEM_CRIT_CONSTANTS.MAX_CHANCE);
}

export function rollGemCrit(input: GemCritInput, roll?: number, championMultiplier?: number): GemCritResult {
  const critChance = calculateGemCritChance(
    input.skillLevel,
    input.nodeLevel,
    input.luckStat,
    championMultiplier ?? input.championMultiplier ?? 1,
    input.critChanceBonus ?? 0,
  );
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
  const critChance = calculateGemCritChance(
    input.skillLevel,
    input.nodeLevel,
    input.luckStat,
    input.championMultiplier ?? 1,
    input.critChanceBonus ?? 0,
  );
  let gemsFound = 0;
  for (let i = 0; i < actions; i++) {
    const r = rolls ? rolls[i] : Math.random();
    if (r < critChance) gemsFound++;
  }
  return { gemsFound, critChance };
}
