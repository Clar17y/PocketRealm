import { STAMINA_CONSTANTS } from '@pocketrealm/shared';

export interface StaminaCalculationInput {
  meleeLevel: number;
  rangedLevel: number;
  evasionLevel: number;
  equipmentStaminaBonus: number;
}

export function calculateMaxStamina(input: StaminaCalculationInput): number {
  const avgLevel = Math.floor(
    (input.meleeLevel + input.rangedLevel + input.evasionLevel) / 3
  );
  return (
    STAMINA_CONSTANTS.BASE_POOL +
    avgLevel * STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL +
    input.equipmentStaminaBonus
  );
}

export function calculateStaminaRegenPerSecond(): number {
  return STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SECOND;
}

export function calculateStaminaRegenPerRound(
  meleeLevel: number,
  rangedLevel: number,
  evasionLevel: number
): number {
  const avgLevel = Math.floor((meleeLevel + rangedLevel + evasionLevel) / 3);
  return (
    STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND +
    avgLevel * STAMINA_CONSTANTS.REGEN_PER_SKILL_LEVEL
  );
}

export function calculateCurrentStamina(
  storedStamina: number,
  lastRegenAt: Date,
  maxStamina: number,
  regenPerSecond: number,
  now: Date = new Date()
): number {
  const elapsedSeconds = (now.getTime() - lastRegenAt.getTime()) / 1000;
  const regenAmount = Math.floor(elapsedSeconds * regenPerSecond);
  return Math.min(storedStamina + regenAmount, maxStamina);
}

export function calculateStaminaRestHealing(
  currentStamina: number,
  maxStamina: number,
  turnsToSpend: number
): { turnsUsed: number; healedAmount: number; newStamina: number } {
  const healPerTurn = STAMINA_CONSTANTS.REST_HEAL_PER_TURN;
  const needed = maxStamina - currentStamina;
  const maxHealAmount = healPerTurn * turnsToSpend;
  const actualHealAmount = Math.min(needed, maxHealAmount);
  const turnsUsed = Math.ceil(actualHealAmount / healPerTurn);

  return {
    turnsUsed: Math.max(turnsUsed, turnsToSpend > 0 ? 1 : 0),
    healedAmount: actualHealAmount,
    newStamina: Math.min(currentStamina + actualHealAmount, maxStamina),
  };
}
