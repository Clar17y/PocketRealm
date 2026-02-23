import { describe, expect, it } from 'vitest';
import { calculateGemCritChance, rollGemCrit } from './gatheringCrit';

describe('calculateGemCritChance', () => {
  it('returns base chance at exact node level with no luck', () => {
    expect(calculateGemCritChance(5, 5, 0)).toBeCloseTo(0.03);
  });

  it('scales with levels above requirement', () => {
    // 0.03 + 10 * 0.005 = 0.08
    expect(calculateGemCritChance(15, 5, 0)).toBeCloseTo(0.08);
  });

  it('scales with luck stat', () => {
    // 0.03 + 0 + 10 * 0.003 = 0.06
    expect(calculateGemCritChance(5, 5, 10)).toBeCloseTo(0.06);
  });

  it('combines level and luck bonuses', () => {
    // 0.03 + 10 * 0.005 + 20 * 0.003 = 0.14
    expect(calculateGemCritChance(15, 5, 20)).toBeCloseTo(0.14);
  });

  it('clamps to max chance', () => {
    expect(calculateGemCritChance(100, 1, 500)).toBeCloseTo(0.25);
  });

  it('returns base chance when below node level', () => {
    // levelsAbove clamped to 0
    expect(calculateGemCritChance(3, 10, 0)).toBeCloseTo(0.03);
  });
});

describe('rollGemCrit', () => {
  it('returns isCrit=true when roll < critChance', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 }, 0.01);
    expect(result.isCrit).toBe(true);
    expect(result.critChance).toBeCloseTo(0.03);
  });

  it('returns isCrit=false when roll >= critChance', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 }, 0.5);
    expect(result.isCrit).toBe(false);
  });

  it('uses Math.random when no roll override provided', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 });
    expect(typeof result.isCrit).toBe('boolean');
    expect(result.critChance).toBeCloseTo(0.03);
  });
});
