import { describe, expect, it } from 'vitest';
import { HP_CONSTANTS } from '@pocketrealm/shared';
import {
  calculateMaxHp,
  calculateRegenPerSecond,
  calculateHealPerTurn,
  calculateCurrentHp,
  calculateRestHealing,
  calculateRecoveryCost,
  calculateRecoveryExitHp,
} from './hpCalculator';

describe('calculateMaxHp', () => {
  it('returns base HP with zero vitality and no equipment', () => {
    expect(calculateMaxHp({ vitalityLevel: 0, equipmentHealthBonus: 0 }))
      .toBe(HP_CONSTANTS.BASE_HP);
  });

  it('scales with vitality level', () => {
    const result = calculateMaxHp({ vitalityLevel: 10, equipmentHealthBonus: 0 });
    expect(result).toBe(HP_CONSTANTS.BASE_HP + 10 * HP_CONSTANTS.HP_PER_VITALITY);
  });

  it('adds equipment health bonus', () => {
    const result = calculateMaxHp({ vitalityLevel: 0, equipmentHealthBonus: 25 });
    expect(result).toBe(HP_CONSTANTS.BASE_HP + 25);
  });

  it('combines vitality and equipment', () => {
    const result = calculateMaxHp({ vitalityLevel: 5, equipmentHealthBonus: 20 });
    expect(result).toBe(
      HP_CONSTANTS.BASE_HP + 5 * HP_CONSTANTS.HP_PER_VITALITY + 20
    );
  });
});

describe('calculateRegenPerSecond', () => {
  it('returns base regen at vitality 0', () => {
    expect(calculateRegenPerSecond(0)).toBe(HP_CONSTANTS.BASE_PASSIVE_REGEN);
  });

  it('scales with vitality', () => {
    expect(calculateRegenPerSecond(10)).toBeCloseTo(
      HP_CONSTANTS.BASE_PASSIVE_REGEN + 10 * HP_CONSTANTS.PASSIVE_REGEN_PER_VITALITY
    );
  });
});

describe('calculateHealPerTurn', () => {
  it('returns base heal at vitality 0', () => {
    expect(calculateHealPerTurn(0)).toBe(HP_CONSTANTS.BASE_REST_HEAL);
  });

  it('scales with vitality', () => {
    expect(calculateHealPerTurn(10)).toBeCloseTo(
      HP_CONSTANTS.BASE_REST_HEAL + 10 * HP_CONSTANTS.REST_HEAL_PER_VITALITY
    );
  });
});

describe('calculateCurrentHp', () => {
  const baseTime = new Date('2025-01-01T00:00:00Z');

  it('returns stored HP when recovering', () => {
    const later = new Date(baseTime.getTime() + 60_000);
    expect(calculateCurrentHp(50, baseTime, 200, 1, true, later)).toBe(50);
  });

  it('adds regen over elapsed time', () => {
    const later = new Date(baseTime.getTime() + 10_000); // 10s
    // floor(10 * 0.8) = 8
    expect(calculateCurrentHp(50, baseTime, 200, 0.8, false, later)).toBe(58);
  });

  it('caps at maxHp', () => {
    const later = new Date(baseTime.getTime() + 100_000);
    expect(calculateCurrentHp(95, baseTime, 100, 1, false, later)).toBe(100);
  });

  it('returns stored HP when no time has passed', () => {
    expect(calculateCurrentHp(75, baseTime, 100, 1, false, baseTime)).toBe(75);
  });

  it('floors regen amount', () => {
    const later = new Date(baseTime.getTime() + 1_500); // 1.5s
    // floor(1.5 * 1) = 1
    expect(calculateCurrentHp(50, baseTime, 200, 1, false, later)).toBe(51);
  });
});

describe('calculateRestHealing', () => {
  it('heals to full when enough turns', () => {
    const result = calculateRestHealing(50, 100, 5, 100);
    expect(result.newHp).toBe(100);
    expect(result.healedAmount).toBe(50);
    expect(result.turnsUsed).toBe(10); // ceil(50/5)
  });

  it('partially heals when not enough turns', () => {
    const result = calculateRestHealing(50, 100, 5, 5);
    expect(result.healedAmount).toBe(25); // 5 turns * 5 heal
    expect(result.newHp).toBe(75);
    expect(result.turnsUsed).toBe(5);
  });

  it('uses at least 1 turn if turns > 0', () => {
    const result = calculateRestHealing(100, 100, 5, 10);
    expect(result.turnsUsed).toBeGreaterThanOrEqual(1);
  });

  it('heals 0 when already at max', () => {
    const result = calculateRestHealing(100, 100, 5, 10);
    expect(result.healedAmount).toBe(0);
    expect(result.newHp).toBe(100);
  });

  it('uses 0 turns when turnsToSpend is 0', () => {
    const result = calculateRestHealing(50, 100, 5, 0);
    expect(result.turnsUsed).toBe(0);
    expect(result.healedAmount).toBe(0);
  });
});

describe('calculateRecoveryCost', () => {
  it('returns maxHp * RECOVERY_TURNS_PER_MAX_HP', () => {
    expect(calculateRecoveryCost(100)).toBe(100 * HP_CONSTANTS.RECOVERY_TURNS_PER_MAX_HP);
  });

  it('scales with maxHp', () => {
    expect(calculateRecoveryCost(200)).toBe(200 * HP_CONSTANTS.RECOVERY_TURNS_PER_MAX_HP);
  });
});

describe('calculateRecoveryExitHp', () => {
  it('returns floor of maxHp * RECOVERY_EXIT_HP_PERCENT', () => {
    expect(calculateRecoveryExitHp(100)).toBe(
      Math.floor(100 * HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT)
    );
  });

  it('floors the result', () => {
    // 33 * 0.25 = 8.25 → 8
    expect(calculateRecoveryExitHp(33)).toBe(8);
  });
});
