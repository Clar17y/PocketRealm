import { describe, expect, it } from 'vitest';
import { TURN_CONSTANTS } from '@pocketrealm/shared';
import {
  calculateAccruedTurns,
  calculateCurrentTurns,
  calculateTimeToCapMs,
  spendTurns,
  isValidTurnAmount,
} from './turnCalculator';

describe('calculateAccruedTurns', () => {
  const base = new Date('2025-01-01T00:00:00Z');

  it('returns 0 when no time elapsed', () => {
    expect(calculateAccruedTurns(base, base)).toBe(0);
  });

  it('returns elapsed seconds * REGEN_RATE', () => {
    const later = new Date(base.getTime() + 60_000); // 60 seconds
    expect(calculateAccruedTurns(base, later)).toBe(60 * TURN_CONSTANTS.REGEN_RATE);
  });

  it('floors partial seconds', () => {
    const later = new Date(base.getTime() + 1_500); // 1.5s → floor to 1
    expect(calculateAccruedTurns(base, later)).toBe(1 * TURN_CONSTANTS.REGEN_RATE);
  });

  it('handles large time gaps', () => {
    const later = new Date(base.getTime() + 3_600_000); // 1 hour
    expect(calculateAccruedTurns(base, later)).toBe(3600 * TURN_CONSTANTS.REGEN_RATE);
  });
});

describe('calculateCurrentTurns', () => {
  const base = new Date('2025-01-01T00:00:00Z');

  it('adds stored and accrued turns', () => {
    const later = new Date(base.getTime() + 10_000); // 10s
    const result = calculateCurrentTurns(100, base, later);
    expect(result).toBe(100 + 10 * TURN_CONSTANTS.REGEN_RATE);
  });

  it('caps at BANK_CAP', () => {
    const later = new Date(base.getTime() + 200_000_000); // way over cap
    expect(calculateCurrentTurns(0, base, later)).toBe(TURN_CONSTANTS.BANK_CAP);
  });

  it('returns stored turns if already at cap', () => {
    expect(calculateCurrentTurns(TURN_CONSTANTS.BANK_CAP, base, base))
      .toBe(TURN_CONSTANTS.BANK_CAP);
  });
});

describe('calculateTimeToCapMs', () => {
  it('returns null when already at cap', () => {
    expect(calculateTimeToCapMs(TURN_CONSTANTS.BANK_CAP)).toBeNull();
  });

  it('returns null when above cap', () => {
    expect(calculateTimeToCapMs(TURN_CONSTANTS.BANK_CAP + 100)).toBeNull();
  });

  it('calculates ms to fill remaining turns', () => {
    const current = 0;
    const expected = (TURN_CONSTANTS.BANK_CAP / TURN_CONSTANTS.REGEN_RATE) * 1000;
    expect(calculateTimeToCapMs(current)).toBe(expected);
  });

  it('returns correct time for partial fill', () => {
    const current = TURN_CONSTANTS.BANK_CAP - 100;
    const expected = (100 / TURN_CONSTANTS.REGEN_RATE) * 1000;
    expect(calculateTimeToCapMs(current)).toBe(expected);
  });
});

describe('spendTurns', () => {
  it('deducts turns and returns new balance', () => {
    expect(spendTurns(100, 30)).toBe(70);
  });

  it('returns null when insufficient turns', () => {
    expect(spendTurns(10, 30)).toBeNull();
  });

  it('returns 0 when spending exact balance', () => {
    expect(spendTurns(50, 50)).toBe(0);
  });

  it('throws when amount is 0', () => {
    expect(() => spendTurns(100, 0)).toThrow('Turn amount must be positive');
  });

  it('throws when amount is negative', () => {
    expect(() => spendTurns(100, -5)).toThrow('Turn amount must be positive');
  });
});

describe('isValidTurnAmount', () => {
  it('returns true for valid integer in range', () => {
    expect(isValidTurnAmount(50, 10, 100)).toBe(true);
  });

  it('returns true at min boundary', () => {
    expect(isValidTurnAmount(10, 10, 100)).toBe(true);
  });

  it('returns true at max boundary', () => {
    expect(isValidTurnAmount(100, 10, 100)).toBe(true);
  });

  it('returns false for non-integer', () => {
    expect(isValidTurnAmount(10.5, 10, 100)).toBe(false);
  });

  it('returns false below min', () => {
    expect(isValidTurnAmount(5, 10, 100)).toBe(false);
  });

  it('returns false above max', () => {
    expect(isValidTurnAmount(150, 10, 100)).toBe(false);
  });
});
