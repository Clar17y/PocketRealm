import { describe, expect, it } from 'vitest';
import {
  calculateAutoForgeExpectedForgeTurnCost,
  calculateAutoForgeMaxForgeTurnCost,
  calculateCraftMaxReservedBaseTurnCost,
  getAutoForgeMinimumOpenSlots,
  isAutoForgeEligibleItemType,
  isAutoForgeTarget,
} from './autoForgeBudget';

describe('autoForgeBudget', () => {
  it('recognizes supported auto-forge targets', () => {
    expect(isAutoForgeTarget('rare')).toBe(true);
    expect(isAutoForgeTarget('epic')).toBe(true);
    expect(isAutoForgeTarget('legendary')).toBe(true);
    expect(isAutoForgeTarget('uncommon')).toBe(false);
    expect(isAutoForgeTarget(null)).toBe(false);
  });

  it('only allows non-stackable weapons and armor for auto-forge', () => {
    expect(isAutoForgeEligibleItemType('weapon', false)).toBe(true);
    expect(isAutoForgeEligibleItemType('armor', false)).toBe(true);
    expect(isAutoForgeEligibleItemType('weapon', true)).toBe(false);
    expect(isAutoForgeEligibleItemType('resource', false)).toBe(false);
    expect(isAutoForgeEligibleItemType('consumable', false)).toBe(false);
  });

  it('returns minimum open slots for each target', () => {
    expect(getAutoForgeMinimumOpenSlots('rare')).toBe(3);
    expect(getAutoForgeMinimumOpenSlots('epic')).toBe(4);
    expect(getAutoForgeMinimumOpenSlots('legendary')).toBe(5);
  });

  it('calculates conservative max forge cost from all-common successful cascades', () => {
    expect(calculateAutoForgeMaxForgeTurnCost(8, 'rare')).toBe(8 / 2 * 100 + 8 / 4 * 250);
    expect(calculateAutoForgeMaxForgeTurnCost(8, 'epic')).toBe(400 + 500 + 500);
    expect(calculateAutoForgeMaxForgeTurnCost(16, 'legendary')).toBe(800 + 1000 + 1000 + 1000);
  });

  it('uses discounted upgrade costs when supplied', () => {
    expect(calculateAutoForgeMaxForgeTurnCost(8, 'rare', { common: 80, uncommon: 200 })).toBe(720);
  });

  it('includes craft and max forge costs in max reserved base cost', () => {
    expect(
      calculateCraftMaxReservedBaseTurnCost({
        craftAttempts: 8,
        craftTurnCostPerAttempt: 20,
        autoForgeTarget: 'rare',
      }),
    ).toBe(160 + 900);
  });

  it('returns craft-only max reserved base cost when auto-forge is off', () => {
    expect(
      calculateCraftMaxReservedBaseTurnCost({
        craftAttempts: 8,
        craftTurnCostPerAttempt: 20,
        autoForgeTarget: null,
      }),
    ).toBe(160);
  });

  it('calculates an advisory expected forge cost lower than the conservative max for normal chance values', () => {
    const expected = calculateAutoForgeExpectedForgeTurnCost({
      craftAttempts: 8,
      target: 'rare',
      luckStat: 0,
    });
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(calculateAutoForgeMaxForgeTurnCost(8, 'rare'));
  });
});
