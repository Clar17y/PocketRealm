import { FLEE_CONSTANTS } from '@pocketrealm/shared';
import type { FleeOutcome } from '@pocketrealm/shared';

export interface FleeInput {
  evasionLevel: number;
  mobLevel: number;
  maxHp: number;
  currentGold: number;
}

export interface FleeCalculationResult {
  outcome: FleeOutcome;
  remainingHp: number;
  goldLost: number;
  recoveryCost: number | null;
}

/**
 * Calculate flee chance based on evasion vs mob level.
 * When evasion equals mob level, you get BASE_FLEE_CHANCE (30%).
 * Each level difference adjusts by FLEE_CHANCE_PER_LEVEL_DIFF (2%).
 */
export function calculateFleeChance(evasionLevel: number, mobLevel: number): number {
  const levelDiff = evasionLevel - mobLevel;
  const rawChance = FLEE_CONSTANTS.BASE_FLEE_CHANCE +
    levelDiff * FLEE_CONSTANTS.FLEE_CHANCE_PER_LEVEL_DIFF;

  return Math.max(
    FLEE_CONSTANTS.MIN_FLEE_CHANCE,
    Math.min(FLEE_CONSTANTS.MAX_FLEE_CHANCE, rawChance)
  );
}

export function determineFleeOutcome(
  roll: number,
  fleeChance: number
): FleeOutcome {
  // If roll >= fleeChance, you fail to escape entirely → knockout
  if (roll >= fleeChance) {
    return 'knockout';
  }

  // Successfully fled! Determine quality of escape
  // Normalize roll within the success range [0, fleeChance) to [0, 1)
  // Higher normalized roll = better escape quality
  const normalizedRoll = roll / fleeChance;

  if (normalizedRoll >= FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD) {
    return 'clean_escape'; // Top 20% of successful escapes
  }
  return 'wounded_escape'; // Bottom 80% of successful escapes
}

export function calculateFleeResult(
  input: FleeInput,
  roll: number = Math.random()
): FleeCalculationResult {
  const fleeChance = calculateFleeChance(input.evasionLevel, input.mobLevel);
  const outcome = determineFleeOutcome(roll, fleeChance);

  let remainingHp: number;
  let goldLossPercent: number;
  let recoveryCost: number | null = null;

  switch (outcome) {
    case 'clean_escape':
      remainingHp = Math.max(
        1,
        Math.floor(input.maxHp * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT)
      );
      goldLossPercent = FLEE_CONSTANTS.GOLD_LOSS_MINOR;
      break;
    case 'wounded_escape':
      remainingHp = FLEE_CONSTANTS.PARTIAL_SUCCESS_HP;
      goldLossPercent = FLEE_CONSTANTS.GOLD_LOSS_MODERATE;
      break;
    case 'knockout':
      remainingHp = 0;
      goldLossPercent = FLEE_CONSTANTS.GOLD_LOSS_SEVERE;
      recoveryCost = input.maxHp; // 1 turn per max HP
      break;
  }

  const goldLost = Math.floor(input.currentGold * goldLossPercent);

  return {
    outcome,
    remainingHp,
    goldLost,
    recoveryCost,
  };
}
