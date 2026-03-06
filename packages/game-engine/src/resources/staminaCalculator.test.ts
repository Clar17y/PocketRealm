import { describe, expect, it } from 'vitest';
import { STAMINA_CONSTANTS } from '@pocketrealm/shared';
import {
  calculateMaxStamina,
  calculateStaminaRegenPerSecond,
  calculateStaminaRegenPerRound,
  calculateCurrentStamina,
  calculateStaminaRestHealing,
} from './staminaCalculator';

describe('calculateMaxStamina', () => {
  it('returns base pool with zero levels and no equipment', () => {
    expect(
      calculateMaxStamina({
        meleeLevel: 0,
        rangedLevel: 0,
        evasionLevel: 0,
        equipmentStaminaBonus: 0,
      })
    ).toBe(STAMINA_CONSTANTS.BASE_POOL);
  });

  it('scales with average skill level', () => {
    // avg of (30, 30, 30) = 30
    const result = calculateMaxStamina({
      meleeLevel: 30,
      rangedLevel: 30,
      evasionLevel: 30,
      equipmentStaminaBonus: 0,
    });
    expect(result).toBe(
      STAMINA_CONSTANTS.BASE_POOL + 30 * STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL
    );
  });

  it('floors the average skill level', () => {
    // avg of (10, 11, 12) = floor(33/3) = 11
    const result = calculateMaxStamina({
      meleeLevel: 10,
      rangedLevel: 11,
      evasionLevel: 12,
      equipmentStaminaBonus: 0,
    });
    expect(result).toBe(
      STAMINA_CONSTANTS.BASE_POOL + 11 * STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL
    );
  });

  it('adds equipment stamina bonus', () => {
    const result = calculateMaxStamina({
      meleeLevel: 0,
      rangedLevel: 0,
      evasionLevel: 0,
      equipmentStaminaBonus: 25,
    });
    expect(result).toBe(STAMINA_CONSTANTS.BASE_POOL + 25);
  });

  it('combines skill levels and equipment bonus', () => {
    // avg of (12, 12, 12) = 12
    const result = calculateMaxStamina({
      meleeLevel: 12,
      rangedLevel: 12,
      evasionLevel: 12,
      equipmentStaminaBonus: 15,
    });
    expect(result).toBe(
      STAMINA_CONSTANTS.BASE_POOL +
        12 * STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL +
        15
    );
  });
});

describe('calculateStaminaRegenPerSecond', () => {
  it('returns the passive regen constant', () => {
    expect(calculateStaminaRegenPerSecond()).toBe(
      STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SECOND
    );
  });
});

describe('calculateStaminaRegenPerRound', () => {
  it('returns base regen at zero levels', () => {
    expect(calculateStaminaRegenPerRound(0, 0, 0)).toBe(
      STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND
    );
  });

  it('scales with average skill level', () => {
    // avg of (15, 15, 15) = 15
    expect(calculateStaminaRegenPerRound(15, 15, 15)).toBeCloseTo(
      STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND +
        15 * STAMINA_CONSTANTS.REGEN_PER_SKILL_LEVEL
    );
  });

  it('floors the average skill level', () => {
    // avg of (10, 11, 12) = floor(33/3) = 11
    expect(calculateStaminaRegenPerRound(10, 11, 12)).toBeCloseTo(
      STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND +
        11 * STAMINA_CONSTANTS.REGEN_PER_SKILL_LEVEL
    );
  });
});

describe('calculateCurrentStamina', () => {
  const baseTime = new Date('2025-01-01T00:00:00Z');

  it('adds regen over elapsed time', () => {
    const later = new Date(baseTime.getTime() + 10_000); // 10s
    // floor(10 * 1.0) = 10
    expect(calculateCurrentStamina(50, baseTime, 200, 1.0, later)).toBe(60);
  });

  it('caps at maxStamina', () => {
    const later = new Date(baseTime.getTime() + 100_000); // 100s
    expect(calculateCurrentStamina(95, baseTime, 100, 1.0, later)).toBe(100);
  });

  it('returns stored stamina when no time has passed', () => {
    expect(calculateCurrentStamina(75, baseTime, 100, 1.0, baseTime)).toBe(75);
  });

  it('floors regen amount', () => {
    const later = new Date(baseTime.getTime() + 1_500); // 1.5s
    // floor(1.5 * 1.0) = 1
    expect(calculateCurrentStamina(50, baseTime, 200, 1.0, later)).toBe(51);
  });

  it('handles fractional regen rate', () => {
    const later = new Date(baseTime.getTime() + 5_000); // 5s
    // floor(5 * 0.5) = 2
    expect(calculateCurrentStamina(50, baseTime, 200, 0.5, later)).toBe(52);
  });
});

describe('calculateStaminaRestHealing', () => {
  const healPerTurn = STAMINA_CONSTANTS.REST_HEAL_PER_TURN;

  it('heals to full when enough turns', () => {
    const result = calculateStaminaRestHealing(50, 100, 100);
    expect(result.newStamina).toBe(100);
    expect(result.healedAmount).toBe(50);
    expect(result.turnsUsed).toBe(Math.ceil(50 / healPerTurn));
  });

  it('partially heals when not enough turns', () => {
    const result = calculateStaminaRestHealing(50, 100, 5);
    const expectedHeal = healPerTurn * 5;
    expect(result.healedAmount).toBe(Math.min(50, expectedHeal));
    expect(result.newStamina).toBe(50 + result.healedAmount);
    expect(result.turnsUsed).toBe(5);
  });

  it('uses at least 1 turn if turns > 0', () => {
    const result = calculateStaminaRestHealing(100, 100, 10);
    expect(result.turnsUsed).toBeGreaterThanOrEqual(1);
  });

  it('heals 0 when already at max', () => {
    const result = calculateStaminaRestHealing(100, 100, 10);
    expect(result.healedAmount).toBe(0);
    expect(result.newStamina).toBe(100);
  });

  it('uses 0 turns when turnsToSpend is 0', () => {
    const result = calculateStaminaRestHealing(50, 100, 0);
    expect(result.turnsUsed).toBe(0);
    expect(result.healedAmount).toBe(0);
  });
});
