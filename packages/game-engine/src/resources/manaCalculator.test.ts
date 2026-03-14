import { describe, expect, it } from 'vitest';
import { MANA_CONSTANTS } from '@pocketrealm/shared';
import {
  calculateMaxMana,
  calculateManaRegenPerSecond,
  calculateManaRegenPerRound,
  calculateCurrentMana,
  calculateManaRestHealing,
  calculateManaRestHealPerTurn,
} from './manaCalculator';

describe('calculateMaxMana', () => {
  it('returns base pool with zero magic and no equipment', () => {
    expect(
      calculateMaxMana({ magicLevel: 0, equipmentManaBonus: 0 })
    ).toBe(MANA_CONSTANTS.BASE_POOL);
  });

  it('scales with magic level', () => {
    const result = calculateMaxMana({ magicLevel: 20, equipmentManaBonus: 0 });
    expect(result).toBe(
      MANA_CONSTANTS.BASE_POOL + 20 * MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL
    );
  });

  it('adds equipment mana bonus', () => {
    const result = calculateMaxMana({ magicLevel: 0, equipmentManaBonus: 30 });
    expect(result).toBe(MANA_CONSTANTS.BASE_POOL + 30);
  });

  it('combines magic level and equipment bonus', () => {
    const result = calculateMaxMana({ magicLevel: 10, equipmentManaBonus: 15 });
    expect(result).toBe(
      MANA_CONSTANTS.BASE_POOL +
        10 * MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL +
        15
    );
  });
});

describe('calculateManaRegenPerSecond', () => {
  it('returns base regen at zero magic level', () => {
    expect(calculateManaRegenPerSecond(0)).toBe(
      MANA_CONSTANTS.PASSIVE_REGEN_PER_SECOND
    );
  });

  it('scales with magic level', () => {
    expect(calculateManaRegenPerSecond(20)).toBeCloseTo(
      MANA_CONSTANTS.PASSIVE_REGEN_PER_SECOND +
        20 * MANA_CONSTANTS.PASSIVE_REGEN_PER_MAGIC_LEVEL
    );
  });
});

describe('calculateManaRegenPerRound', () => {
  it('returns base regen at zero magic', () => {
    expect(calculateManaRegenPerRound(0)).toBe(
      MANA_CONSTANTS.BASE_REGEN_PER_ROUND
    );
  });

  it('scales with magic level', () => {
    expect(calculateManaRegenPerRound(20)).toBeCloseTo(
      MANA_CONSTANTS.BASE_REGEN_PER_ROUND +
        20 * MANA_CONSTANTS.REGEN_PER_MAGIC_LEVEL
    );
  });
});

describe('calculateCurrentMana', () => {
  const baseTime = new Date('2025-01-01T00:00:00Z');

  it('adds regen over elapsed time', () => {
    const later = new Date(baseTime.getTime() + 10_000); // 10s
    // floor(10 * 0.5) = 5
    expect(calculateCurrentMana(30, baseTime, 100, 0.5, later)).toBe(35);
  });

  it('caps at maxMana', () => {
    const later = new Date(baseTime.getTime() + 100_000); // 100s
    expect(calculateCurrentMana(95, baseTime, 100, 0.5, later)).toBe(100);
  });

  it('returns stored mana when no time has passed', () => {
    expect(calculateCurrentMana(40, baseTime, 100, 0.5, baseTime)).toBe(40);
  });

  it('floors regen amount', () => {
    const later = new Date(baseTime.getTime() + 3_000); // 3s
    // floor(3 * 0.5) = 1
    expect(calculateCurrentMana(50, baseTime, 200, 0.5, later)).toBe(51);
  });

  it('handles higher regen rate', () => {
    const later = new Date(baseTime.getTime() + 5_000); // 5s
    // floor(5 * 2.0) = 10
    expect(calculateCurrentMana(50, baseTime, 200, 2.0, later)).toBe(60);
  });
});

describe('calculateManaRestHealPerTurn', () => {
  it('returns base heal at zero magic level', () => {
    expect(calculateManaRestHealPerTurn(0)).toBe(
      MANA_CONSTANTS.REST_HEAL_PER_TURN
    );
  });

  it('scales with magic level', () => {
    expect(calculateManaRestHealPerTurn(20)).toBeCloseTo(
      MANA_CONSTANTS.REST_HEAL_PER_TURN +
        20 * MANA_CONSTANTS.REST_HEAL_PER_MAGIC_LEVEL
    );
  });
});

describe('calculateManaRestHealing', () => {
  // Use level 0 for baseline tests (healPerTurn = base constant)
  const healPerTurn = MANA_CONSTANTS.REST_HEAL_PER_TURN;

  it('heals to full when enough turns', () => {
    const result = calculateManaRestHealing(20, 50, 100, 0);
    expect(result.newMana).toBe(50);
    expect(result.healedAmount).toBe(30);
    expect(result.turnsUsed).toBe(Math.ceil(30 / healPerTurn));
  });

  it('partially heals when not enough turns', () => {
    const result = calculateManaRestHealing(20, 50, 3, 0);
    const expectedHeal = healPerTurn * 3;
    expect(result.healedAmount).toBe(Math.min(30, expectedHeal));
    expect(result.newMana).toBe(20 + result.healedAmount);
    expect(result.turnsUsed).toBe(3);
  });

  it('uses at least 1 turn if turns > 0', () => {
    const result = calculateManaRestHealing(50, 50, 10, 0);
    expect(result.turnsUsed).toBeGreaterThanOrEqual(1);
  });

  it('heals 0 when already at max', () => {
    const result = calculateManaRestHealing(50, 50, 10, 0);
    expect(result.healedAmount).toBe(0);
    expect(result.newMana).toBe(50);
  });

  it('uses 0 turns when turnsToSpend is 0', () => {
    const result = calculateManaRestHealing(20, 50, 0, 0);
    expect(result.turnsUsed).toBe(0);
    expect(result.healedAmount).toBe(0);
  });

  it('heals faster with higher magic level', () => {
    // Level 50: healPerTurn = 3 + 50*0.2 = 13
    const resultLow = calculateManaRestHealing(0, 50, 5, 0);
    const resultHigh = calculateManaRestHealing(0, 50, 5, 50);
    expect(resultHigh.healedAmount).toBeGreaterThan(resultLow.healedAmount);
  });
});
