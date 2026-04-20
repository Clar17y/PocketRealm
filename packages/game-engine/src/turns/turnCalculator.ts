import { TURN_CONSTANTS } from '@pocketrealm/shared';

const TURN_REGEN_SCALE = 100;

function toScaledRegenRate(regenRate: number): number {
  return Math.round(regenRate * TURN_REGEN_SCALE);
}

interface TurnSnapshot {
  accruedTurns: number;
  currentTurns: number;
  regenProgress: number;
}

function calculateTurnSnapshot(
  storedTurns: number,
  lastRegenAt: Date,
  now: Date,
  regenRate: number,
  bankCap: number,
  regenProgress: number,
): TurnSnapshot {
  if (storedTurns >= bankCap) {
    return {
      accruedTurns: 0,
      currentTurns: bankCap,
      regenProgress: 0,
    };
  }

  const elapsedMs = now.getTime() - lastRegenAt.getTime();
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const scaledRegenRate = toScaledRegenRate(regenRate);
  const totalScaledTurns = storedTurns * TURN_REGEN_SCALE + regenProgress + elapsedSeconds * scaledRegenRate;
  const cappedScaledTurns = Math.min(totalScaledTurns, bankCap * TURN_REGEN_SCALE);
  const currentTurns = Math.floor(cappedScaledTurns / TURN_REGEN_SCALE);
  const nextProgress = currentTurns >= bankCap
    ? 0
    : cappedScaledTurns - currentTurns * TURN_REGEN_SCALE;

  return {
    accruedTurns: currentTurns - storedTurns,
    currentTurns,
    regenProgress: nextProgress,
  };
}

/**
 * Calculate turns accumulated since last regeneration.
 * This is the core of the lazy turn calculation system.
 */
export function calculateAccruedTurns(
  lastRegenAt: Date,
  now: Date = new Date(),
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  regenProgress: number = 0,
): number {
  return calculateTurnSnapshot(
    0,
    lastRegenAt,
    now,
    regenRate,
    Number.MAX_SAFE_INTEGER,
    regenProgress,
  ).accruedTurns;
}

export function calculateTurnProgress(
  lastRegenAt: Date,
  now: Date = new Date(),
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  regenProgress: number = 0,
): number {
  return calculateTurnSnapshot(
    0,
    lastRegenAt,
    now,
    regenRate,
    Number.MAX_SAFE_INTEGER,
    regenProgress,
  ).regenProgress;
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
  regenProgress: number = 0,
): number {
  return calculateTurnSnapshot(
    storedTurns,
    lastRegenAt,
    now,
    regenRate,
    bankCap,
    regenProgress,
  ).currentTurns;
}

/**
 * Calculate time until turn bank is full.
 * Returns null if already at cap.
 */
export function calculateTimeToCapMs(
  currentTurns: number,
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  bankCap: number = TURN_CONSTANTS.BANK_CAP,
  regenProgress: number = 0,
): number | null {
  if (currentTurns >= bankCap) {
    return null;
  }

  const scaledRegenRate = toScaledRegenRate(regenRate);
  const currentScaledTurns = currentTurns * TURN_REGEN_SCALE + regenProgress;
  const scaledTurnsNeeded = bankCap * TURN_REGEN_SCALE - currentScaledTurns;
  const secondsNeeded = Math.ceil(scaledTurnsNeeded / scaledRegenRate);
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
