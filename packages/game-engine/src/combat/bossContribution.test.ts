import { describe, it, expect } from 'vitest';
import { calculateContributionScore } from './bossContribution';

describe('calculateContributionScore', () => {
  it('weights damage at 1x', () => {
    expect(calculateContributionScore({ totalDamage: 100, totalHealing: 0, damageAbsorbed: 0, roundsSurvived: 0 })).toBe(100);
  });

  it('weights healing at 1x', () => {
    expect(calculateContributionScore({ totalDamage: 0, totalHealing: 100, damageAbsorbed: 0, roundsSurvived: 0 })).toBe(100);
  });

  it('weights damage absorbed at 0.9x', () => {
    expect(calculateContributionScore({ totalDamage: 0, totalHealing: 0, damageAbsorbed: 100, roundsSurvived: 0 })).toBe(90);
  });

  it('adds flat bonus per round survived', () => {
    expect(calculateContributionScore({ totalDamage: 0, totalHealing: 0, damageAbsorbed: 0, roundsSurvived: 5 })).toBe(50);
  });

  it('combines all factors', () => {
    const score = calculateContributionScore({
      totalDamage: 200,
      totalHealing: 100,
      damageAbsorbed: 50,
      roundsSurvived: 3,
    });
    // 200*1 + 100*1 + 50*0.9 + 3*10 = 200 + 100 + 45 + 30 = 375
    expect(score).toBe(375);
  });

  it('tank with high absorb gets comparable score to DPS', () => {
    const dps = calculateContributionScore({ totalDamage: 500, totalHealing: 0, damageAbsorbed: 50, roundsSurvived: 5 });
    const tank = calculateContributionScore({ totalDamage: 200, totalHealing: 0, damageAbsorbed: 350, roundsSurvived: 5 });
    expect(tank).toBeGreaterThan(dps * 0.7);
  });

  it('healer gets fair score from healing contribution', () => {
    const dps = calculateContributionScore({ totalDamage: 400, totalHealing: 0, damageAbsorbed: 0, roundsSurvived: 5 });
    const healer = calculateContributionScore({ totalDamage: 50, totalHealing: 350, damageAbsorbed: 0, roundsSurvived: 5 });
    expect(healer).toBeGreaterThan(dps * 0.7);
  });
});
