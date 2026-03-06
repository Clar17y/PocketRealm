import { TURN_CONSTANTS } from '@pocketrealm/shared';

/**
 * Calculate turns accumulated since last regeneration.
 * This is the core of the lazy turn calculation system.
 */
export function calculateAccruedTurns(
  lastRegenAt: Date,
  now: Date = new Date()
): number {
  const elapsedMs = now.getTime() - lastRegenAt.getTime();
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return elapsedSeconds * TURN_CONSTANTS.REGEN_RATE;
}

/**
 * Calculate current turn balance, applying bank cap.
 */
export function calculateCurrentTurns(
  storedTurns: number,
  lastRegenAt: Date,
  now: Date = new Date()
): number {
  const accrued = calculateAccruedTurns(lastRegenAt, now);
  const total = storedTurns + accrued;
  return Math.min(total, TURN_CONSTANTS.BANK_CAP);
}

/**
 * Calculate time until turn bank is full.
 * Returns null if already at cap.
 */
export function calculateTimeToCapMs(
  currentTurns: number
): number | null {
  if (currentTurns >= TURN_CONSTANTS.BANK_CAP) {
    return null;
  }
  const turnsNeeded = TURN_CONSTANTS.BANK_CAP - currentTurns;
  const secondsNeeded = turnsNeeded / TURN_CONSTANTS.REGEN_RATE;
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
