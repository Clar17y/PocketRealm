import { describe, expect, it } from 'vitest';
import { FLEE_CONSTANTS } from '@pocketrealm/shared';
import {
  calculateFleeChance,
  determineFleeOutcome,
  calculateFleeResult,
} from './fleeMechanics';

describe('calculateFleeChance', () => {
  it('returns base chance when evasion equals mob level', () => {
    expect(calculateFleeChance(5, 5)).toBeCloseTo(FLEE_CONSTANTS.BASE_FLEE_CHANCE);
  });

  it('increases with higher evasion', () => {
    const chance = calculateFleeChance(10, 5);
    expect(chance).toBeCloseTo(
      FLEE_CONSTANTS.BASE_FLEE_CHANCE + 5 * FLEE_CONSTANTS.FLEE_CHANCE_PER_LEVEL_DIFF
    );
  });

  it('decreases with lower evasion', () => {
    const chance = calculateFleeChance(1, 5);
    expect(chance).toBeCloseTo(
      FLEE_CONSTANTS.BASE_FLEE_CHANCE + (-4) * FLEE_CONSTANTS.FLEE_CHANCE_PER_LEVEL_DIFF
    );
  });

  it('clamps at minimum', () => {
    expect(calculateFleeChance(1, 100)).toBe(FLEE_CONSTANTS.MIN_FLEE_CHANCE);
  });

  it('clamps at maximum', () => {
    expect(calculateFleeChance(100, 1)).toBe(FLEE_CONSTANTS.MAX_FLEE_CHANCE);
  });
});

describe('determineFleeOutcome', () => {
  it('returns knockout when roll >= fleeChance', () => {
    expect(determineFleeOutcome(0.5, 0.3)).toBe('knockout');
    expect(determineFleeOutcome(0.3, 0.3)).toBe('knockout');
  });

  it('returns clean_escape for high success rolls', () => {
    // normalizedRoll = roll/fleeChance >= HIGH_SUCCESS_THRESHOLD(0.8)
    // With fleeChance=0.5, roll needs to be >= 0.4 and < 0.5
    expect(determineFleeOutcome(0.45, 0.5)).toBe('clean_escape');
  });

  it('returns wounded_escape for lower success rolls', () => {
    // normalizedRoll = 0.1/0.5 = 0.2 < 0.8
    expect(determineFleeOutcome(0.1, 0.5)).toBe('wounded_escape');
  });

  it('returns wounded_escape at the boundary', () => {
    // normalizedRoll = 0 < 0.8
    expect(determineFleeOutcome(0, 0.5)).toBe('wounded_escape');
  });
});

describe('calculateFleeResult', () => {
  const baseInput = {
    evasionLevel: 5,
    mobLevel: 5,
    maxHp: 100,
    currentGold: 1000,
  };

  it('returns clean_escape with high roll in success range', () => {
    // fleeChance for equal levels = 0.5
    // For clean_escape: roll/0.5 >= 0.8, so roll >= 0.40
    const result = calculateFleeResult(baseInput, 0.41);
    expect(result.outcome).toBe('clean_escape');
    expect(result.remainingHp).toBe(
      Math.max(1, Math.floor(100 * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT))
    );
    expect(result.goldLost).toBe(Math.floor(1000 * FLEE_CONSTANTS.GOLD_LOSS_MINOR));
    expect(result.recoveryCost).toBeNull();
  });

  it('returns wounded_escape with low roll in success range', () => {
    // roll/0.5 < 0.8, so roll < 0.40
    const result = calculateFleeResult(baseInput, 0.1);
    expect(result.outcome).toBe('wounded_escape');
    expect(result.remainingHp).toBe(FLEE_CONSTANTS.PARTIAL_SUCCESS_HP);
    expect(result.goldLost).toBe(Math.floor(1000 * FLEE_CONSTANTS.GOLD_LOSS_MODERATE));
    expect(result.recoveryCost).toBeNull();
  });

  it('returns knockout when roll exceeds flee chance', () => {
    const result = calculateFleeResult(baseInput, 0.5);
    expect(result.outcome).toBe('knockout');
    expect(result.remainingHp).toBe(0);
    expect(result.goldLost).toBe(Math.floor(1000 * FLEE_CONSTANTS.GOLD_LOSS_SEVERE));
    expect(result.recoveryCost).toBe(100);
  });

  it('handles zero gold', () => {
    const result = calculateFleeResult({ ...baseInput, currentGold: 0 }, 0.5);
    expect(result.goldLost).toBe(0);
  });

  it('ensures clean_escape HP is at least 1', () => {
    const result = calculateFleeResult({ ...baseInput, maxHp: 1 }, 0.41);
    expect(result.outcome).toBe('clean_escape');
    expect(result.remainingHp).toBeGreaterThanOrEqual(1);
  });
});
