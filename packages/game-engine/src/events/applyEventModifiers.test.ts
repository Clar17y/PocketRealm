import { describe, expect, it } from 'vitest';
import {
  applyMobEventModifiers,
  applyResourceEventModifiers,
} from './applyEventModifiers';
import type { ActiveZoneModifiers, MobTemplate } from '@adventure/shared';

const baseMob: MobTemplate = {
  id: 'mob-1',
  name: 'Test Goblin',
  level: 5,
  hp: 100,
  damageMin: 10,
  damageMax: 20,
  defense: 5,
  accuracy: 10,
  evasion: 5,
  damageType: 'physical',
  magicDefence: 3,
  attackStyle: 'melee',
  spells: [],
};

const neutralModifiers: ActiveZoneModifiers = {
  mobDamageMultiplier: 1,
  mobHpMultiplier: 1,
  resourceYieldMultiplier: 1,
};

describe('applyMobEventModifiers', () => {
  it('returns same mob reference when multipliers are both 1', () => {
    const result = applyMobEventModifiers(baseMob, neutralModifiers);
    expect(result).toBe(baseMob); // same reference, not a copy
  });

  it('applies HP multiplier', () => {
    const mods: ActiveZoneModifiers = {
      ...neutralModifiers,
      mobHpMultiplier: 2,
    };
    const result = applyMobEventModifiers(baseMob, mods);
    expect(result.hp).toBe(200);
    expect(result.damageMin).toBe(10);
    expect(result.damageMax).toBe(20);
  });

  it('applies damage multiplier', () => {
    const mods: ActiveZoneModifiers = {
      ...neutralModifiers,
      mobDamageMultiplier: 1.5,
    };
    const result = applyMobEventModifiers(baseMob, mods);
    expect(result.damageMin).toBe(15);
    expect(result.damageMax).toBe(30);
    expect(result.hp).toBe(100);
  });

  it('applies both multipliers together', () => {
    const mods: ActiveZoneModifiers = {
      mobHpMultiplier: 2,
      mobDamageMultiplier: 3,
      resourceYieldMultiplier: 1,
    };
    const result = applyMobEventModifiers(baseMob, mods);
    expect(result.hp).toBe(200);
    expect(result.damageMin).toBe(30);
    expect(result.damageMax).toBe(60);
  });

  it('clamps multiplier to minimum 0.1', () => {
    const mods: ActiveZoneModifiers = {
      mobHpMultiplier: 0,
      mobDamageMultiplier: -1,
      resourceYieldMultiplier: 1,
    };
    const result = applyMobEventModifiers(baseMob, mods);
    // 0 clamped to 0.1 → 100 * 0.1 = 10
    expect(result.hp).toBe(10);
    // -1 clamped to 0.1 → 10 * 0.1 = 1
    expect(result.damageMin).toBe(1);
  });

  it('ensures minimum of 1 for hp and damage', () => {
    const tinyMob: MobTemplate = {
      ...baseMob,
      hp: 1,
      damageMin: 1,
      damageMax: 1,
    };
    const mods: ActiveZoneModifiers = {
      mobHpMultiplier: 0.1,
      mobDamageMultiplier: 0.1,
      resourceYieldMultiplier: 1,
    };
    const result = applyMobEventModifiers(tinyMob, mods);
    expect(result.hp).toBeGreaterThanOrEqual(1);
    expect(result.damageMin).toBeGreaterThanOrEqual(1);
    expect(result.damageMax).toBeGreaterThanOrEqual(1);
  });

  it('does not mutate the original mob', () => {
    const mods: ActiveZoneModifiers = {
      ...neutralModifiers,
      mobHpMultiplier: 5,
    };
    applyMobEventModifiers(baseMob, mods);
    expect(baseMob.hp).toBe(100);
  });
});

describe('applyResourceEventModifiers', () => {
  it('returns base yield when multiplier is 1', () => {
    expect(applyResourceEventModifiers(10, neutralModifiers)).toBe(10);
  });

  it('doubles yield with 2x multiplier', () => {
    const mods: ActiveZoneModifiers = {
      ...neutralModifiers,
      resourceYieldMultiplier: 2,
    };
    expect(applyResourceEventModifiers(10, mods)).toBe(20);
  });

  it('ensures minimum yield of 1', () => {
    const mods: ActiveZoneModifiers = {
      ...neutralModifiers,
      resourceYieldMultiplier: 0,
    };
    expect(applyResourceEventModifiers(10, mods)).toBe(1);
  });

  it('rounds the result', () => {
    const mods: ActiveZoneModifiers = {
      ...neutralModifiers,
      resourceYieldMultiplier: 1.5,
    };
    // 10 * 1.5 = 15 (exact)
    expect(applyResourceEventModifiers(10, mods)).toBe(15);
    // 3 * 1.5 = 4.5 → round = 5
    expect(applyResourceEventModifiers(3, mods)).toBe(5);
  });
});
