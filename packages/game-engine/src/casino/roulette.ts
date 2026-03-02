import { CASINO_CONSTANTS, ROULETTE_RED_NUMBERS, getNumberColor } from '@adventure/shared';
import type { RouletteBetType } from '@adventure/shared';

export { getNumberColor };

const RED_SET = new Set<number>(ROULETTE_RED_NUMBERS);

export function isWinningBet(betType: RouletteBetType, betValue: string, result: number): boolean {
  switch (betType) {
    case 'straight':
      return result === parseInt(betValue, 10);
    case 'split': {
      const [a, b] = betValue.split(',').map(Number);
      return result === a || result === b;
    }
    case 'red':
      return result > 0 && RED_SET.has(result);
    case 'black':
      return result > 0 && !RED_SET.has(result);
    case 'odd':
      return result > 0 && result % 2 === 1;
    case 'even':
      return result > 0 && result % 2 === 0;
    case 'dozen': {
      if (result === 0) return false;
      if (betValue === '1-12') return result >= 1 && result <= 12;
      if (betValue === '13-24') return result >= 13 && result <= 24;
      if (betValue === '25-36') return result >= 25 && result <= 36;
      return false;
    }
    case 'column': {
      if (result === 0) return false;
      const col = ((result - 1) % 3) + 1;
      if (betValue === 'col1') return col === 1;
      if (betValue === 'col2') return col === 2;
      if (betValue === 'col3') return col === 3;
      return false;
    }
    default:
      return false;
  }
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
    default:
      return { valid: false, error: 'Invalid bet type' };
  }
}

export function generateSpinResult(): number {
  return Math.floor(Math.random() * CASINO_CONSTANTS.ROULETTE_SLOTS);
}
