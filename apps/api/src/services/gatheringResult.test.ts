import { describe, expect, it } from 'vitest';
import { buildGatheringResultDetails } from './gatheringResult';

describe('buildGatheringResultDetails', () => {
  it('reports the full Champion-adjusted multiplier and capacity clamp', () => {
    const result = buildGatheringResultDetails({
      levelMultiplier: 1,
      guildAndBuffBonus: 0,
      championMultiplier: 1.1,
      eventMultiplier: 1,
      unclampedRawYield: 33,
      rawTotalYield: 32,
      totalYield: 32,
      effectiveCapacity: 32,
    });

    expect(result).toEqual({
      levelMultiplier: 1,
      bonusMultiplier: 1,
      championMultiplier: 1.1,
      totalMultiplier: 1.1,
      eventMultiplier: 1,
      unclampedRawYield: 33,
      rawTotalYield: 32,
      totalYield: 32,
      effectiveCapacity: 32,
      capacityLimited: true,
    });
  });

  it('does not report a capacity clamp when the yield fit naturally', () => {
    const result = buildGatheringResultDetails({
      levelMultiplier: 1.2,
      guildAndBuffBonus: 0.15,
      championMultiplier: 1.1,
      eventMultiplier: 1.3,
      unclampedRawYield: 27,
      rawTotalYield: 27,
      totalYield: 35,
      effectiveCapacity: 80,
    });

    expect(result.capacityLimited).toBe(false);
    expect(result.totalMultiplier).toBeCloseTo(1.518, 3);
    expect(result.bonusMultiplier).toBe(1.15);
  });
});
