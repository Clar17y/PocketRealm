import { describe, expect, it } from 'vitest';
import { calculateGemCritChance, rollGemCrit, rollGemCritBatch } from './gatheringCrit';

describe('calculateGemCritChance', () => {
  it('returns base chance at exact node level with no luck', () => {
    expect(calculateGemCritChance(5, 5, 0)).toBeCloseTo(0.03);
  });

  it('applies champion multiplier to crit chance', () => {
    expect(calculateGemCritChance(5, 5, 0, 2)).toBeCloseTo(0.06);
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

  it('applies an explicit crit chance bonus after champion multiplier', () => {
    expect(calculateGemCritChance(5, 5, 0, 2, 0.04)).toBeCloseTo(0.10);
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

  it('applies champion multiplier when provided', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 }, 0.04, 2);
    expect(result.critChance).toBeCloseTo(0.06);
    expect(result.isCrit).toBe(true);
  });

  it('uses explicit crit chance bonus from input', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0, critChanceBonus: 0.04 }, 0.05);
    expect(result.critChance).toBeCloseTo(0.07);
    expect(result.isCrit).toBe(true);
  });
});

describe('rollGemCritBatch', () => {
  const input = { skillLevel: 5, nodeLevel: 5, luckStat: 0 }; // 3% chance

  it('returns 0 gems when no rolls succeed', () => {
    const rolls = [0.5, 0.6, 0.7, 0.8, 0.9];
    const result = rollGemCritBatch(input, 5, rolls);
    expect(result.gemsFound).toBe(0);
    expect(result.critChance).toBeCloseTo(0.03);
  });

  it('counts each successful roll as a gem', () => {
    // 3% chance, so rolls below 0.03 succeed
    const rolls = [0.01, 0.5, 0.02, 0.9, 0.029];
    const result = rollGemCritBatch(input, 5, rolls);
    expect(result.gemsFound).toBe(3);
  });

  it('all actions can crit', () => {
    const rolls = [0.01, 0.01, 0.01];
    const result = rollGemCritBatch(input, 3, rolls);
    expect(result.gemsFound).toBe(3);
  });

  it('handles single action', () => {
    const result = rollGemCritBatch(input, 1, [0.01]);
    expect(result.gemsFound).toBe(1);
  });

  it('uses Math.random when no rolls provided', () => {
    const result = rollGemCritBatch(input, 10);
    expect(typeof result.gemsFound).toBe('number');
    expect(result.gemsFound).toBeGreaterThanOrEqual(0);
    expect(result.gemsFound).toBeLessThanOrEqual(10);
  });

  it('uses explicit crit chance bonus from input for batch rolls', () => {
    const result = rollGemCritBatch({ ...input, critChanceBonus: 0.04 }, 3, [0.05, 0.06, 0.08]);
    expect(result.critChance).toBeCloseTo(0.07);
    expect(result.gemsFound).toBe(2);
  });
});
