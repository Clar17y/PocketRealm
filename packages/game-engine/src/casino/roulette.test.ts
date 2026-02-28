import { describe, expect, it } from 'vitest';
import {
  isWinningBet,
  calculatePayout,
  validateBet,
  getNumberColor,
  generateSpinResult,
} from './roulette';

describe('getNumberColor', () => {
  it('returns green for 0', () => {
    expect(getNumberColor(0)).toBe('green');
  });
  it('returns red for red numbers', () => {
    expect(getNumberColor(1)).toBe('red');
    expect(getNumberColor(36)).toBe('red');
  });
  it('returns black for black numbers', () => {
    expect(getNumberColor(2)).toBe('black');
    expect(getNumberColor(35)).toBe('black');
  });
});

describe('isWinningBet', () => {
  it('straight bet wins on exact number', () => {
    expect(isWinningBet('straight', '17', 17)).toBe(true);
    expect(isWinningBet('straight', '17', 18)).toBe(false);
  });
  it('split bet wins on either number', () => {
    expect(isWinningBet('split', '1,2', 1)).toBe(true);
    expect(isWinningBet('split', '1,2', 2)).toBe(true);
    expect(isWinningBet('split', '1,2', 3)).toBe(false);
  });
  it('red/black bets', () => {
    expect(isWinningBet('red', 'red', 1)).toBe(true);
    expect(isWinningBet('red', 'red', 2)).toBe(false);
    expect(isWinningBet('red', 'red', 0)).toBe(false);
    expect(isWinningBet('black', 'black', 2)).toBe(true);
  });
  it('odd/even bets', () => {
    expect(isWinningBet('odd', 'odd', 3)).toBe(true);
    expect(isWinningBet('odd', 'odd', 4)).toBe(false);
    expect(isWinningBet('odd', 'odd', 0)).toBe(false);
    expect(isWinningBet('even', 'even', 4)).toBe(true);
  });
  it('dozen bets', () => {
    expect(isWinningBet('dozen', '1-12', 6)).toBe(true);
    expect(isWinningBet('dozen', '1-12', 13)).toBe(false);
    expect(isWinningBet('dozen', '13-24', 20)).toBe(true);
    expect(isWinningBet('dozen', '25-36', 36)).toBe(true);
    expect(isWinningBet('dozen', '1-12', 0)).toBe(false);
  });
  it('column bets', () => {
    expect(isWinningBet('column', 'col1', 1)).toBe(true);
    expect(isWinningBet('column', 'col1', 4)).toBe(true);
    expect(isWinningBet('column', 'col2', 2)).toBe(true);
    expect(isWinningBet('column', 'col3', 3)).toBe(true);
    expect(isWinningBet('column', 'col1', 0)).toBe(false);
  });
});

describe('calculatePayout', () => {
  it('straight pays 35:1', () => {
    expect(calculatePayout('straight', 10)).toBe(360);
  });
  it('split pays 17:1', () => {
    expect(calculatePayout('split', 10)).toBe(180);
  });
  it('red/black pays 1:1', () => {
    expect(calculatePayout('red', 10)).toBe(20);
    expect(calculatePayout('black', 10)).toBe(20);
  });
  it('odd/even pays 1:1', () => {
    expect(calculatePayout('odd', 10)).toBe(20);
  });
  it('dozen/column pays 2:1', () => {
    expect(calculatePayout('dozen', 10)).toBe(30);
    expect(calculatePayout('column', 10)).toBe(30);
  });
});

describe('validateBet', () => {
  it('rejects amount below min', () => {
    expect(validateBet('straight', '17', 0).valid).toBe(false);
  });
  it('rejects amount above max', () => {
    expect(validateBet('straight', '17', 1001).valid).toBe(false);
  });
  it('rejects invalid bet type', () => {
    expect(validateBet('invalid' as never, '17', 10).valid).toBe(false);
  });
  it('rejects straight bet with out-of-range number', () => {
    expect(validateBet('straight', '37', 10).valid).toBe(false);
    expect(validateBet('straight', '-1', 10).valid).toBe(false);
  });
  it('rejects split with non-adjacent numbers', () => {
    expect(validateBet('split', '1,35', 10).valid).toBe(false);
  });
  it('accepts valid bets', () => {
    expect(validateBet('straight', '17', 10).valid).toBe(true);
    expect(validateBet('red', 'red', 50).valid).toBe(true);
    expect(validateBet('dozen', '1-12', 100).valid).toBe(true);
  });
});

describe('generateSpinResult', () => {
  it('returns a number between 0 and 36', () => {
    for (let i = 0; i < 100; i++) {
      const result = generateSpinResult();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(36);
    }
  });
});
