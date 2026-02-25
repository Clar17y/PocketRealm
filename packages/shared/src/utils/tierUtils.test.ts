import { describe, it, expect } from 'vitest';
import { resolveZoneTiers, getUnlockedTiers, getHighestUnlockedTier, getTierName } from './tierUtils';

describe('resolveZoneTiers', () => {
  it('returns provided tiers when not null', () => {
    const custom = { '1': 0, '2': 50 };
    expect(resolveZoneTiers(custom)).toBe(custom);
  });

  it('returns default tiers when null', () => {
    const result = resolveZoneTiers(null);
    expect(result).toHaveProperty('1');
    expect(result).toHaveProperty('4');
  });
});

describe('getUnlockedTiers', () => {
  const tiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  it('returns only tier 1 at 0%', () => {
    expect(getUnlockedTiers(0, tiers)).toEqual([1]);
  });

  it('returns tiers 1-2 at 25%', () => {
    expect(getUnlockedTiers(25, tiers)).toEqual([1, 2]);
  });

  it('returns tiers 1-3 at 50%', () => {
    expect(getUnlockedTiers(50, tiers)).toEqual([1, 2, 3]);
  });

  it('returns all tiers at 100%', () => {
    expect(getUnlockedTiers(100, tiers)).toEqual([1, 2, 3, 4]);
  });

  it('returns empty array at negative percent', () => {
    expect(getUnlockedTiers(-10, tiers)).toEqual([]);
  });

  it('handles null tiers (uses defaults)', () => {
    expect(getUnlockedTiers(0, null)).toEqual([1]);
  });

  it('returns empty array when tiers map is empty', () => {
    expect(getUnlockedTiers(50, {})).toEqual([]);
  });

  it('handles custom tier thresholds', () => {
    const custom = { '1': 0, '2': 10, '3': 30, '4': 60 };
    expect(getUnlockedTiers(15, custom)).toEqual([1, 2]);
  });
});

describe('getTierName', () => {
  it('returns Outskirts for tier 1', () => {
    expect(getTierName(1)).toBe('Outskirts');
  });

  it('returns Interior for tier 2', () => {
    expect(getTierName(2)).toBe('Interior');
  });

  it('returns Depths for tier 3', () => {
    expect(getTierName(3)).toBe('Depths');
  });

  it('returns Apex for tier 4', () => {
    expect(getTierName(4)).toBe('Apex');
  });

  it('returns fallback for unknown tier', () => {
    expect(getTierName(99)).toBe('Tier 99');
  });
});

describe('getHighestUnlockedTier', () => {
  const tiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  it('returns 1 at 0%', () => {
    expect(getHighestUnlockedTier(0, tiers)).toBe(1);
  });

  it('returns 2 at 25%', () => {
    expect(getHighestUnlockedTier(25, tiers)).toBe(2);
  });

  it('returns 4 at 100%', () => {
    expect(getHighestUnlockedTier(100, tiers)).toBe(4);
  });

  it('returns 0 at negative percent', () => {
    expect(getHighestUnlockedTier(-10, tiers)).toBe(0);
  });

  it('returns 0 when tiers map is empty', () => {
    expect(getHighestUnlockedTier(50, {})).toBe(0);
  });

  it('handles null tiers (uses defaults)', () => {
    expect(getHighestUnlockedTier(0, null)).toBe(1);
  });
});
