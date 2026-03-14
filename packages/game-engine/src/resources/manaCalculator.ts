import { MANA_CONSTANTS } from '@pocketrealm/shared';

export interface ManaCalculationInput {
  magicLevel: number;
  equipmentManaBonus: number;
}

export function calculateMaxMana(input: ManaCalculationInput): number {
  return (
    MANA_CONSTANTS.BASE_POOL +
    input.magicLevel * MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL +
    input.equipmentManaBonus
  );
}

export function calculateManaRegenPerSecond(magicLevel: number): number {
  return MANA_CONSTANTS.PASSIVE_REGEN_PER_SECOND +
    magicLevel * MANA_CONSTANTS.PASSIVE_REGEN_PER_MAGIC_LEVEL;
}

export function calculateManaRegenPerRound(magicLevel: number): number {
  return (
    MANA_CONSTANTS.BASE_REGEN_PER_ROUND +
    magicLevel * MANA_CONSTANTS.REGEN_PER_MAGIC_LEVEL
  );
}

export function calculateCurrentMana(
  storedMana: number,
  lastRegenAt: Date,
  maxMana: number,
  regenPerSecond: number,
  now: Date = new Date()
): number {
  const elapsedSeconds = (now.getTime() - lastRegenAt.getTime()) / 1000;
  const regenAmount = Math.floor(elapsedSeconds * regenPerSecond);
  return Math.min(storedMana + regenAmount, maxMana);
}

export function calculateManaRestHealPerTurn(magicLevel: number): number {
  return MANA_CONSTANTS.REST_HEAL_PER_TURN +
    magicLevel * MANA_CONSTANTS.REST_HEAL_PER_MAGIC_LEVEL;
}

export function calculateManaRestHealing(
  currentMana: number,
  maxMana: number,
  turnsToSpend: number,
  healPerTurn: number,
): { turnsUsed: number; healedAmount: number; newMana: number } {
  const needed = maxMana - currentMana;
  const maxHealAmount = healPerTurn * turnsToSpend;
  const actualHealAmount = Math.floor(Math.min(needed, maxHealAmount));
  const turnsUsed = Math.ceil(actualHealAmount / healPerTurn);

  return {
    turnsUsed: Math.max(turnsUsed, turnsToSpend > 0 ? 1 : 0),
    healedAmount: actualHealAmount,
    newMana: Math.min(currentMana + actualHealAmount, maxMana),
  };
}
