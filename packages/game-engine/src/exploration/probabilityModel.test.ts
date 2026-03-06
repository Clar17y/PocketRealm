import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPLORATION_CONSTANTS } from '@pocketrealm/shared';
import {
  cumulativeProbability,
  estimateExploration,
  simulateExploration,
  simulateTravelAmbushes,
  validateExplorationTurns,
} from './probabilityModel';

describe('cumulativeProbability', () => {
  it('returns 0 when turns is 0', () => {
    expect(cumulativeProbability(0.5, 0)).toBe(0);
  });

  it('returns 0 when perTurnChance is 0', () => {
    expect(cumulativeProbability(0, 100)).toBe(0);
  });

  it('returns 1 when perTurnChance is 1', () => {
    expect(cumulativeProbability(1, 5)).toBe(1);
  });

  it('returns 0 for negative turns', () => {
    expect(cumulativeProbability(0.5, -5)).toBe(0);
  });

  it('calculates 1 - (1-p)^n correctly', () => {
    // 1 - (1 - 0.1)^10 = 1 - 0.9^10 ≈ 0.6513
    expect(cumulativeProbability(0.1, 10)).toBeCloseTo(1 - Math.pow(0.9, 10));
  });

  it('approaches 1 with many turns', () => {
    expect(cumulativeProbability(0.01, 1000)).toBeGreaterThan(0.99);
  });

  it('returns exact per-turn chance for 1 turn', () => {
    expect(cumulativeProbability(0.3, 1)).toBeCloseTo(0.3);
  });
});

describe('estimateExploration', () => {
  it('returns correct structure', () => {
    const est = estimateExploration(100);
    expect(est).toHaveProperty('turns', 100);
    expect(est).toHaveProperty('ambushChance');
    expect(est).toHaveProperty('encounterSiteChance');
    expect(est).toHaveProperty('resourceNodeChance');
    expect(est).toHaveProperty('hiddenCacheChance');
    expect(est).toHaveProperty('zoneExitChance');
    expect(est).toHaveProperty('expectedAmbushes');
    expect(est).toHaveProperty('expectedEncounterSites');
  });

  it('calculates cumulative probabilities using constants', () => {
    const est = estimateExploration(100);
    expect(est.ambushChance).toBeCloseTo(
      cumulativeProbability(EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN, 100)
    );
  });

  it('calculates expected values as turns * per-turn chance', () => {
    const est = estimateExploration(200);
    expect(est.expectedAmbushes).toBeCloseTo(
      200 * EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN
    );
  });

  it('returns 0 zone exit chance when no zone exit chance provided', () => {
    const est = estimateExploration(100);
    expect(est.zoneExitChance).toBe(0);
  });

  it('returns 0 zone exit chance when null', () => {
    const est = estimateExploration(100, null);
    expect(est.zoneExitChance).toBe(0);
  });

  it('calculates zone exit chance when provided', () => {
    const est = estimateExploration(100, 0.01);
    expect(est.zoneExitChance).toBeCloseTo(cumulativeProbability(0.01, 100));
  });
});

describe('simulateExploration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns empty array with deterministic no-trigger rolls', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const outcomes = simulateExploration(5);
    expect(outcomes).toEqual([]);
  });

  it('detects ambush when roll is below threshold', () => {
    // Each turn checks 4-5 events; first check is ambush
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.001) // ambush triggers (< 0.005)
      .mockReturnValue(0.999);    // everything else fails
    const outcomes = simulateExploration(1);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(true);
  });

  it('discovers zone exit at most once', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValue(0.0001); // everything triggers
    const outcomes = simulateExploration(5, 0.5);
    const zoneExits = outcomes.filter(o => o.type === 'zone_exit');
    expect(zoneExits.length).toBe(1);
  });

  it('results are sorted by turnOccurred', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0001);
    const outcomes = simulateExploration(3, 0.5);
    for (let i = 1; i < outcomes.length; i++) {
      expect(outcomes[i].turnOccurred).toBeGreaterThanOrEqual(outcomes[i - 1].turnOccurred);
    }
  });
});

describe('simulateTravelAmbushes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns empty when no ambushes trigger', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(simulateTravelAmbushes(10)).toEqual([]);
  });

  it('detects ambush on qualifying rolls', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.01) // < TRAVEL_AMBUSH_CHANCE_PER_TURN (0.04)
      .mockReturnValue(0.999);
    const result = simulateTravelAmbushes(5);
    expect(result.length).toBe(1);
    expect(result[0].turnOccurred).toBe(1);
  });
});

describe('simulateExploration with spawnRateMultiplier', () => {
  afterEach(() => vi.restoreAllMocks());

  it('increases ambush frequency with spawnRateMultiplier > 1', () => {
    // AMBUSH_CHANCE_PER_TURN is 0.005. With multiplier 2.0, effective chance is 0.01.
    // Math.random returning 0.008: 0.008 < 0.01 -> ambush triggers
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.008) // ambush check -> hit (0.008 < 0.01)
      .mockReturnValue(0.999);    // everything else -> miss
    const outcomes = simulateExploration(1, null, 2.0);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(true);
  });

  it('does not increase ambush with multiplier 1.0 for same roll', () => {
    // Same roll 0.008, but with multiplier 1.0, effective chance is 0.005 -> miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.008) // ambush: 0.008 > 0.005 -> miss
      .mockReturnValue(0.999);
    const outcomes = simulateExploration(1, null, 1.0);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(false);
  });

  it('defaults to multiplier 1 when not provided', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.008)
      .mockReturnValue(0.999);
    const outcomes = simulateExploration(1);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(false);
  });
});

describe('estimateExploration with spawnRateMultiplier', () => {
  it('scales ambush and encounter site expectations', () => {
    const base = estimateExploration(100);
    const boosted = estimateExploration(100, null, 1.5);
    expect(boosted.expectedAmbushes).toBeCloseTo(base.expectedAmbushes * 1.5);
    expect(boosted.expectedEncounterSites).toBeCloseTo(base.expectedEncounterSites * 1.5);
  });

  it('does not scale resource, cache, or zone exit chances', () => {
    const base = estimateExploration(100, 0.01);
    const boosted = estimateExploration(100, 0.01, 2.0);
    expect(boosted.resourceNodeChance).toBeCloseTo(base.resourceNodeChance);
    expect(boosted.hiddenCacheChance).toBeCloseTo(base.hiddenCacheChance);
    expect(boosted.zoneExitChance).toBeCloseTo(base.zoneExitChance);
  });
});

describe('validateExplorationTurns', () => {
  it('accepts valid turn count', () => {
    expect(validateExplorationTurns(100)).toEqual({ valid: true });
  });

  it('accepts minimum', () => {
    expect(validateExplorationTurns(EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS))
      .toEqual({ valid: true });
  });

  it('accepts maximum', () => {
    expect(validateExplorationTurns(EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS))
      .toEqual({ valid: true });
  });

  it('rejects non-integer', () => {
    const result = validateExplorationTurns(10.5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('integer');
  });

  it('rejects below minimum', () => {
    const result = validateExplorationTurns(1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Minimum');
  });

  it('rejects above maximum', () => {
    const result = validateExplorationTurns(99_999);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum');
  });
});
