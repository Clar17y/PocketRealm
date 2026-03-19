import { describe, it, expect } from 'vitest';
import type { CombatantStats } from '@pocketrealm/shared';
import { computeCrowdedMultiplier, applyCrowdedDebuff } from './crowdedDebuff';

function makeStats(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    hp: 100, maxHp: 100, attack: 20, accuracy: 50, defence: 10,
    magicDefence: 8, dodge: 5, evasion: 0, damageMin: 20, damageMax: 30,
    speed: 10, critChance: 0.05, critDamage: 0.5, damageType: 'physical',
    ...overrides,
  };
}

describe('computeCrowdedMultiplier', () => {
  it('returns 1.0 for 1 alive mob', () => {
    expect(computeCrowdedMultiplier(1)).toBeCloseTo(1.0);
  });

  it('returns ~0.8696 for 2 alive mobs', () => {
    expect(computeCrowdedMultiplier(2)).toBeCloseTo(1 / (1 + 0.15), 4);
  });

  it('returns ~0.7692 for 3 alive mobs', () => {
    expect(computeCrowdedMultiplier(3)).toBeCloseTo(1 / (1 + 0.30), 4);
  });

  it('returns ~0.6897 for 4 alive mobs', () => {
    expect(computeCrowdedMultiplier(4)).toBeCloseTo(1 / (1 + 0.45), 4);
  });

  it('returns ~0.6250 for 5 alive mobs', () => {
    expect(computeCrowdedMultiplier(5)).toBeCloseTo(1 / (1 + 0.60), 4);
  });

  it('accepts a custom factor override', () => {
    const customFactor = 0.20;
    expect(computeCrowdedMultiplier(3, customFactor)).toBeCloseTo(1 / (1 + 0.40), 4);
  });
});

describe('applyCrowdedDebuff', () => {
  it('does not modify stats for 1 mob (multiplier = 1)', () => {
    const stats = makeStats({ damageMin: 20, damageMax: 30, accuracy: 50 });
    const result = applyCrowdedDebuff(stats, 1);
    expect(result.damageMin).toBe(20);
    expect(result.damageMax).toBe(30);
    expect(result.accuracy).toBe(50);
  });

  it('reduces damageMin, damageMax, and accuracy by the multiplier (floor)', () => {
    const stats = makeStats({ damageMin: 20, damageMax: 30, accuracy: 50 });
    // 2 mobs: mult = 1/(1+0.15) ≈ 0.8696
    const result = applyCrowdedDebuff(stats, 2);
    const mult = 1 / (1 + 0.15);
    expect(result.damageMin).toBe(Math.floor(20 * mult));
    expect(result.damageMax).toBe(Math.floor(30 * mult));
    expect(result.accuracy).toBe(Math.floor(50 * mult));
  });

  it('does NOT modify defence', () => {
    const stats = makeStats({ defence: 10 });
    const result = applyCrowdedDebuff(stats, 3);
    expect(result.defence).toBe(10);
  });

  it('does NOT modify magicDefence', () => {
    const stats = makeStats({ magicDefence: 8 });
    const result = applyCrowdedDebuff(stats, 3);
    expect(result.magicDefence).toBe(8);
  });

  it('does NOT modify evasion', () => {
    const stats = makeStats({ evasion: 5 });
    const result = applyCrowdedDebuff(stats, 3);
    expect(result.evasion).toBe(5);
  });

  it('does NOT modify hp', () => {
    const stats = makeStats({ hp: 100 });
    const result = applyCrowdedDebuff(stats, 3);
    expect(result.hp).toBe(100);
  });

  it('returns a new stats object (does not mutate input)', () => {
    const stats = makeStats({ damageMin: 20, damageMax: 30, accuracy: 50 });
    const result = applyCrowdedDebuff(stats, 2);
    // Original should be unchanged
    expect(stats.damageMin).toBe(20);
    expect(stats.damageMax).toBe(30);
    expect(stats.accuracy).toBe(50);
    // Result should differ
    expect(result).not.toBe(stats);
  });
});
