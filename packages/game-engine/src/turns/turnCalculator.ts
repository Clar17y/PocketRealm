import { TURN_CONSTANTS } from '@pocketrealm/shared';

/**
 * Calculate turns accumulated since last regeneration.
 * This is the core of the lazy turn calculation system.
 */
export function calculateAccruedTurns(
  lastRegenAt: Date,
  now: Date = new Date(),
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
): number {
  const elapsedMs = now.getTime() - lastRegenAt.getTime();
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return elapsedSeconds * regenRate;
}

/**
 * Calculate current turn balance, applying bank cap.
 */
export function calculateCurrentTurns(
  storedTurns: number,
  lastRegenAt: Date,
  now: Date = new Date(),
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  bankCap: number = TURN_CONSTANTS.BANK_CAP,
): number {
  const accrued = calculateAccruedTurns(lastRegenAt, now, regenRate);
  const total = storedTurns + accrued;
  return Math.min(total, bankCap);
}

/**
 * Calculate time until turn bank is full.
 * Returns null if already at cap.
 */
export function calculateTimeToCapMs(
  currentTurns: number,
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  bankCap: number = TURN_CONSTANTS.BANK_CAP,
): number | null {
  if (currentTurns >= bankCap) {
    return null;
  }
  const turnsNeeded = bankCap - currentTurns;
  const secondsNeeded = turnsNeeded / regenRate;
  return secondsNeeded * 1000;
}

/**
 * Spend turns from the bank.
 * Returns new balance, or null if insufficient turns.
 */
export function spendTurns(
  currentTurns: number,
  amount: number
): number | null {
  if (amount <= 0) {
    throw new Error('Turn amount must be positive');
  }
  if (currentTurns < amount) {
    return null;
  }
  return currentTurns - amount;
}

/**
 * Validate turn amount is within acceptable range.
 */
export function isValidTurnAmount(amount: number, min: number, max: number): boolean {
  return Number.isInteger(amount) && amount >= min && amount <= max;
}
