import { HP_CONSTANTS } from '@pocketrealm/shared';

export interface HpCalculationInput {
  vitalityLevel: number;
  equipmentHealthBonus: number;
}

export function calculateMaxHp(input: HpCalculationInput): number {
  return (
    HP_CONSTANTS.BASE_HP +
    input.vitalityLevel * HP_CONSTANTS.HP_PER_VITALITY +
    input.equipmentHealthBonus
  );
}

export function calculateRegenPerSecond(vitalityLevel: number): number {
  return (
    HP_CONSTANTS.BASE_PASSIVE_REGEN +
    vitalityLevel * HP_CONSTANTS.PASSIVE_REGEN_PER_VITALITY
  );
}

export function calculateHealPerTurn(vitalityLevel: number): number {
  return (
    HP_CONSTANTS.BASE_REST_HEAL +
    vitalityLevel * HP_CONSTANTS.REST_HEAL_PER_VITALITY
  );
}

export function calculateCurrentHp(
  storedHp: number,
  lastRegenAt: Date,
  maxHp: number,
  regenPerSecond: number,
  isRecovering: boolean,
  now: Date = new Date()
): number {
  // No passive regen while recovering
  if (isRecovering) return storedHp;

  const elapsedSeconds = (now.getTime() - lastRegenAt.getTime()) / 1000;
  const regenAmount = Math.floor(elapsedSeconds * regenPerSecond);
  return Math.min(storedHp + regenAmount, maxHp);
}

export function calculateRestHealing(
  currentHp: number,
  maxHp: number,
  healPerTurn: number,
  turnsToSpend: number
): { turnsUsed: number; healedAmount: number; newHp: number } {
  const hpNeeded = maxHp - currentHp;
  const maxHealAmount = healPerTurn * turnsToSpend;
  const actualHealAmount = Math.min(hpNeeded, maxHealAmount);
  const turnsUsed = Math.ceil(actualHealAmount / healPerTurn);

  return {
    turnsUsed: Math.max(turnsUsed, turnsToSpend > 0 ? 1 : 0),
    healedAmount: actualHealAmount,
    newHp: Math.min(currentHp + actualHealAmount, maxHp),
  };
}

export function calculateRecoveryCost(maxHp: number): number {
  return maxHp * HP_CONSTANTS.RECOVERY_TURNS_PER_MAX_HP;
}

export function calculateRecoveryExitHp(maxHp: number): number {
  return Math.floor(maxHp * HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT);
}
