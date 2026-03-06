import { CASINO_CONSTANTS, getNumberColor, getNumbersForBet } from '@pocketrealm/shared';
import type { RouletteBetType } from '@pocketrealm/shared';

export { getNumberColor };

export function isWinningBet(betType: RouletteBetType, betValue: string, result: number): boolean {
  return getNumbersForBet(betType, betValue).has(result);
}

const PAYOUT_MULTIPLIERS: Record<RouletteBetType, number> = {
  straight: 36,
  split: 18,
  red: 2,
  black: 2,
  odd: 2,
  even: 2,
  dozen: 3,
  column: 3,
  corner: 9,
};

export function calculatePayout(betType: RouletteBetType, amount: number): number {
  return amount * PAYOUT_MULTIPLIERS[betType];
}

// Valid adjacent split pairs on a standard roulette layout
const VALID_SPLITS = new Set<string>();
(function initSplits() {
  for (let i = 1; i <= 36; i++) {
    if (i % 3 !== 0) VALID_SPLITS.add(`${i},${i + 1}`);
    if (i + 3 <= 36) VALID_SPLITS.add(`${i},${i + 3}`);
  }
  VALID_SPLITS.add('0,1');
  VALID_SPLITS.add('0,2');
  VALID_SPLITS.add('0,3');
})();

// Valid corner bet positions: 4 adjacent numbers on the 3-column × 12-row grid
const VALID_CORNERS = new Set<string>();
(function initCorners() {
  for (let row = 0; row < 11; row++) {
    const topLeft = row * 3 + 1;
    VALID_CORNERS.add(`${topLeft},${topLeft + 1},${topLeft + 3},${topLeft + 4}`);
    VALID_CORNERS.add(`${topLeft + 1},${topLeft + 2},${topLeft + 4},${topLeft + 5}`);
  }
})();

export interface BetValidation {
  valid: boolean;
  error?: string;
}

export function validateBet(betType: RouletteBetType, betValue: string, amount: number): BetValidation {
  if (!Number.isInteger(amount) || amount < CASINO_CONSTANTS.ROULETTE_MIN_BET) {
    return { valid: false, error: `Minimum bet is ${CASINO_CONSTANTS.ROULETTE_MIN_BET}` };
  }
  if (amount > CASINO_CONSTANTS.ROULETTE_MAX_BET) {
    return { valid: false, error: `Maximum bet is ${CASINO_CONSTANTS.ROULETTE_MAX_BET}` };
  }

  switch (betType) {
    case 'straight': {
      const n = parseInt(betValue, 10);
      if (isNaN(n) || n < 0 || n > 36) return { valid: false, error: 'Number must be 0-36' };
      return { valid: true };
    }
    case 'split': {
      const parts = betValue.split(',').map(Number);
      if (parts.length !== 2 || parts.some(isNaN)) return { valid: false, error: 'Split requires two numbers' };
      const key = parts[0] < parts[1] ? `${parts[0]},${parts[1]}` : `${parts[1]},${parts[0]}`;
      if (!VALID_SPLITS.has(key)) return { valid: false, error: 'Numbers must be adjacent' };
      return { valid: true };
    }
    case 'red':
    case 'black':
    case 'odd':
    case 'even':
      return { valid: true };
    case 'dozen':
      if (!['1-12', '13-24', '25-36'].includes(betValue)) return { valid: false, error: 'Invalid dozen' };
      return { valid: true };
    case 'column':
      if (!['col1', 'col2', 'col3'].includes(betValue)) return { valid: false, error: 'Invalid column' };
      return { valid: true };
    case 'corner': {
      const nums = betValue.split(',').map(Number);
      if (nums.length !== 4 || nums.some(isNaN)) return { valid: false, error: 'Corner bet requires 4 numbers' };
      const sorted = [...nums].sort((a, b) => a - b).join(',');
      if (!VALID_CORNERS.has(sorted)) return { valid: false, error: 'Invalid corner position' };
      return { valid: true };
    }
    default:
      return { valid: false, error: 'Invalid bet type' };
  }
}

export function generateSpinResult(): number {
  return Math.floor(Math.random() * CASINO_CONSTANTS.ROULETTE_SLOTS);
}
