import { describe, it, expect } from 'vitest';
import { filterAndWeightMobsByTier, selectTierWithBleedthrough } from './mobTierFilter';

const makeMob = (id: string, tier: number, weight = 100) => ({
  id,
  explorationTier: tier,
  encounterWeight: weight,
});

describe('filterAndWeightMobsByTier', () => {
  const defaultTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  it('returns only tier 1 mobs at 0% explored', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 2), makeMob('c', 3)];
    const result = filterAndWeightMobsByTier(mobs, 0, defaultTiers);
    expect(result.map(m => m.id)).toEqual(['a']);
  });

  it('returns tier 1+2 mobs at 25% explored', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 2), makeMob('c', 3)];
    const result = filterAndWeightMobsByTier(mobs, 25, defaultTiers);
    expect(result.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('returns all mobs at 100% explored', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 2), makeMob('c', 3), makeMob('d', 4)];
    const result = filterAndWeightMobsByTier(mobs, 100, defaultTiers);
    expect(result).toHaveLength(4);
  });

  it('applies 2x weight boost to highest unlocked tier', () => {
    const mobs = [makeMob('a', 1, 100), makeMob('b', 2, 100)];
    const result = filterAndWeightMobsByTier(mobs, 30, defaultTiers);
    expect(result.find(m => m.id === 'a')!.encounterWeight).toBe(100);
    expect(result.find(m => m.id === 'b')!.encounterWeight).toBe(200);
  });

  it('does not boost when only tier 1 is unlocked', () => {
    const mobs = [makeMob('a', 1, 100)];
    const result = filterAndWeightMobsByTier(mobs, 10, defaultTiers);
    expect(result[0]!.encounterWeight).toBe(100);
  });

  it('returns empty array when no mobs match', () => {
    const mobs = [makeMob('a', 2)];
    const result = filterAndWeightMobsByTier(mobs, 0, defaultTiers);
    expect(result).toEqual([]);
  });

  it('handles null explorationTiers by using default thresholds', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 2)];
    const result = filterAndWeightMobsByTier(mobs, 0, null);
    expect(result.map(m => m.id)).toEqual(['a']);
  });

  it('handles custom per-zone tier thresholds', () => {
    const customTiers = { '1': 0, '2': 10, '3': 30, '4': 60 };
    const mobs = [makeMob('a', 1), makeMob('b', 2), makeMob('c', 3)];
    const result = filterAndWeightMobsByTier(mobs, 15, customTiers);
    expect(result.map(m => m.id)).toEqual(['a', 'b']);
  });

  // --- negative / edge cases ---

  it('returns empty array for empty mobs input', () => {
    const result = filterAndWeightMobsByTier([], 50, defaultTiers);
    expect(result).toEqual([]);
  });

  it('returns empty array for negative exploration percent', () => {
    const mobs = [makeMob('a', 1)];
    const result = filterAndWeightMobsByTier(mobs, -10, defaultTiers);
    expect(result).toEqual([]);
  });

  it('treats exploration percent above 100 the same as 100', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 4)];
    const result = filterAndWeightMobsByTier(mobs, 999, defaultTiers);
    expect(result).toHaveLength(2);
  });

  it('excludes mobs whose tier is not in the tiers map', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 5)];
    const result = filterAndWeightMobsByTier(mobs, 100, defaultTiers);
    expect(result.map(m => m.id)).toEqual(['a']);
  });

  it('returns empty array when tiers map is empty', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 2)];
    const result = filterAndWeightMobsByTier(mobs, 50, {});
    expect(result).toEqual([]);
  });

  it('preserves zero encounter weight without boosting', () => {
    const mobs = [makeMob('a', 1, 0), makeMob('b', 2, 0)];
    const result = filterAndWeightMobsByTier(mobs, 30, defaultTiers);
    expect(result.find(m => m.id === 'a')!.encounterWeight).toBe(0);
    expect(result.find(m => m.id === 'b')!.encounterWeight).toBe(0);
  });

  it('does not boost when all filtered mobs share the same tier', () => {
    const mobs = [makeMob('a', 2, 100), makeMob('b', 2, 100)];
    const tiers = { '2': 0 };
    const result = filterAndWeightMobsByTier(mobs, 50, tiers);
    expect(result.every(m => m.encounterWeight === 100)).toBe(true);
  });

  it('preserves extra properties on mob objects', () => {
    const mob = { id: 'a', explorationTier: 1, encounterWeight: 100, name: 'Rat', level: 3 };
    const result = filterAndWeightMobsByTier([mob], 10, defaultTiers);
    expect(result[0]!.name).toBe('Rat');
    expect(result[0]!.level).toBe(3);
  });
});

describe('selectTierWithBleedthrough', () => {
  const defaultTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  // Tier 3 selected: base [t1=10%, t2=15%, t3=50%, t4=15%, t5=10%→t4]
  // Expected: [10, 15, 50, 25]
  it('returns tier-2 when roll < 0.10 and tier exists', () => {
    expect(selectTierWithBleedthrough(3, defaultTiers, () => 0.05)).toBe(1);
  });

  it('returns tier-1 when roll in [0.10, 0.25)', () => {
    expect(selectTierWithBleedthrough(3, defaultTiers, () => 0.15)).toBe(2);
  });

  it('returns selected tier when roll in [0.25, 0.75)', () => {
    expect(selectTierWithBleedthrough(3, defaultTiers, () => 0.50)).toBe(3);
  });

  it('returns tier+1 when roll in [0.75, 0.90)', () => {
    expect(selectTierWithBleedthrough(3, defaultTiers, () => 0.80)).toBe(4);
  });

  it('redirects above-overflow to highest available tier', () => {
    // tier+2 = tier 5 doesn't exist → goes to max (tier 4)
    expect(selectTierWithBleedthrough(3, defaultTiers, () => 0.95)).toBe(4);
  });

  // Tier 1: below-overflow → selected = 75/15/10/0
  it('tier 1: below-overflow collapses to selected', () => {
    // roll < 0.10 → tier -1 doesn't exist → selected (tier 1)
    expect(selectTierWithBleedthrough(1, defaultTiers, () => 0.00)).toBe(1);
    // roll [0.10, 0.25) → tier 0 doesn't exist → selected (tier 1)
    expect(selectTierWithBleedthrough(1, defaultTiers, () => 0.15)).toBe(1);
    // entire below range [0, 0.25) → tier 1
    expect(selectTierWithBleedthrough(1, defaultTiers, () => 0.24)).toBe(1);
    // roll [0.25, 0.75) → selected (tier 1)
    expect(selectTierWithBleedthrough(1, defaultTiers, () => 0.50)).toBe(1);
    // roll [0.75, 0.90) → tier 2
    expect(selectTierWithBleedthrough(1, defaultTiers, () => 0.80)).toBe(2);
    // roll [0.90, 1.0) → tier 3
    expect(selectTierWithBleedthrough(1, defaultTiers, () => 0.95)).toBe(3);
  });

  // Tier 2: tier-2=tier0 doesn't exist → selected. Result: 15/60/15/10
  it('tier 2: one below-overflow to selected', () => {
    // roll < 0.10 → tier 0 doesn't exist → selected (tier 2)
    expect(selectTierWithBleedthrough(2, defaultTiers, () => 0.05)).toBe(2);
    // roll [0.10, 0.25) → tier-1 = tier 1 (exists)
    expect(selectTierWithBleedthrough(2, defaultTiers, () => 0.15)).toBe(1);
    // roll [0.25, 0.75) → selected = tier 2
    expect(selectTierWithBleedthrough(2, defaultTiers, () => 0.50)).toBe(2);
    // roll [0.75, 0.90) → tier+1 = tier 3
    expect(selectTierWithBleedthrough(2, defaultTiers, () => 0.80)).toBe(3);
    // roll [0.90, 1.0) → tier+2 = tier 4
    expect(selectTierWithBleedthrough(2, defaultTiers, () => 0.95)).toBe(4);
  });

  // Tier 4: tier+1, tier+2 don't exist → highest (=selected). Result: 0/10/15/75
  it('tier 4: above-overflow collapses to selected', () => {
    // roll < 0.10 → tier-2 = tier 2 (exists)
    expect(selectTierWithBleedthrough(4, defaultTiers, () => 0.05)).toBe(2);
    // roll [0.10, 0.25) → tier-1 = tier 3 (exists)
    expect(selectTierWithBleedthrough(4, defaultTiers, () => 0.15)).toBe(3);
    // roll [0.25, 0.75) → selected = tier 4
    expect(selectTierWithBleedthrough(4, defaultTiers, () => 0.50)).toBe(4);
    // roll [0.75, 0.90) → tier+1 = tier 5 doesn't exist → highest = tier 4
    expect(selectTierWithBleedthrough(4, defaultTiers, () => 0.80)).toBe(4);
    // roll [0.90, 1.0) → tier+2 = tier 6 doesn't exist → highest = tier 4
    expect(selectTierWithBleedthrough(4, defaultTiers, () => 0.95)).toBe(4);
  });

  it('uses default tiers when zoneTiers is null', () => {
    expect(selectTierWithBleedthrough(2, null, () => 0.50)).toBe(2);
  });

  it('returns selected tier for single-tier zone', () => {
    expect(selectTierWithBleedthrough(1, { '1': 0 }, () => 0.95)).toBe(1);
  });

  it('handles custom tiers with non-standard numbering', () => {
    const custom = { '1': 0, '2': 50 };
    // tier 1 selected, roll for tier+1 → tier 2 (exists)
    expect(selectTierWithBleedthrough(1, custom, () => 0.80)).toBe(2);
    // tier 1 selected, roll for tier+2 → tier 3 doesn't exist → highest = tier 2
    expect(selectTierWithBleedthrough(1, custom, () => 0.95)).toBe(2);
  });

  it('produces mobs from multiple tiers over 1000 rolls at tier 3', () => {
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const defaultTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

    for (let i = 0; i < 1000; i++) {
      const tier = selectTierWithBleedthrough(3, defaultTiers);
      tierCounts[tier]!++;
    }

    // With 10/15/50/15/10 split centered on tier 3:
    // T1=10%, T2=15%, T3=50%, T4=25% (tier 5 overflow to T4)
    // All tiers should appear over 1000 rolls
    expect(tierCounts[1]).toBeGreaterThan(0);
    expect(tierCounts[2]).toBeGreaterThan(0);
    expect(tierCounts[3]).toBeGreaterThan(0);
    expect(tierCounts[4]).toBeGreaterThan(0);

    // Approximate distribution checks (with wide margins for randomness)
    expect(tierCounts[3]).toBeGreaterThan(350); // ~50%, should be well above 350
    expect(tierCounts[1]).toBeLessThan(200);    // ~10%, should be under 200
  });

  it('produces mobs from tiers 2-4 when selecting tier 4 over 1000 rolls', () => {
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const defaultTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

    for (let i = 0; i < 1000; i++) {
      const tier = selectTierWithBleedthrough(4, defaultTiers);
      tierCounts[tier]!++;
    }

    // Tier 4 selected: [0, 10, 15, 75]
    expect(tierCounts[1]).toBe(0);              // T1 is outside ±2 of T4... wait, T4-2=T2, so T1 IS outside
    expect(tierCounts[2]).toBeGreaterThan(0);   // ~10%
    expect(tierCounts[3]).toBeGreaterThan(0);   // ~15%
    expect(tierCounts[4]).toBeGreaterThan(500); // ~75%
  });
});
