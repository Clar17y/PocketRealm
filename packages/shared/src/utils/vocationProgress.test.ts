import { describe, expect, it } from 'vitest';
import {
  getMasteryPointsForRank,
  getPartialRespecRefund,
  getVocationRankForXp,
  getVocationXpForRank,
} from './vocationProgress';

describe('vocationProgress', () => {
  it('returns monotonic ranks as XP increases', () => {
    let previousRank = getVocationRankForXp(0);

    for (let xp = 0; xp <= 250_000; xp += 250) {
      const rank = getVocationRankForXp(xp);
      expect(rank, `rank at ${xp} XP`).toBeGreaterThanOrEqual(previousRank);
      previousRank = rank;
    }
  });

  it('never decreases mastery points as ranks increase', () => {
    let previousPoints = getMasteryPointsForRank(0);

    for (let rank = 1; rank <= 100; rank += 1) {
      const points = getMasteryPointsForRank(rank);
      expect(points, `mastery points at rank ${rank}`).toBeGreaterThanOrEqual(previousPoints);
      previousPoints = points;
    }
  });

  it('uses increasing XP thresholds for higher ranks', () => {
    let previousThreshold = getVocationXpForRank(1);

    for (let rank = 2; rank <= 100; rank += 1) {
      const threshold = getVocationXpForRank(rank);
      expect(threshold, `XP threshold for rank ${rank}`).toBeGreaterThan(previousThreshold);
      previousThreshold = threshold;
    }
  });

  it('clamps invalid negative inputs to safe values', () => {
    expect(getVocationRankForXp(-500)).toBe(getVocationRankForXp(0));
    expect(getMasteryPointsForRank(-3)).toBe(0);
    expect(getVocationXpForRank(-2)).toBe(0);
    expect(getPartialRespecRefund(-20)).toBe(0);
  });

  it('returns a partial and sensible respec refund', () => {
    expect(getPartialRespecRefund(10)).toBeGreaterThan(0);
    expect(getPartialRespecRefund(10)).toBeLessThan(10);
    expect(getPartialRespecRefund(10)).toBe(6);
    expect(getPartialRespecRefund(0)).toBe(0);
  });
});
