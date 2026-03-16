import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MobTemplate } from '@pocketrealm/shared';
import { COMBAT_CONSTANTS } from '@pocketrealm/shared';
import {
  buildPlayerCombatStats,
  calculateHitChance,
  calculateFinalDamage,
  calculateDefenceReduction,
  isCriticalHit,
  mobToCombatantStats,
  resolveHitCheck,
  resolveScalingStat,
  resolveActionDamageStats,
  rollD20,
  rollDamage,
  rollInitiative,
} from './damageCalculator';

import type { PerActionScaling } from '@pocketrealm/shared';

const baseScaling: PerActionScaling = {
  skillLevels: { melee: 10, ranged: 20, magic: 30 },
  attributes: { strength: 5, dexterity: 15, intelligence: 25 },
  weaponPower: { attack: 10, rangedPower: 16, magicPower: 24 },
  equipmentAccuracy: 5,
  weaponRequiredSkill: 'magic',
};

describe('resolveScalingStat', () => {
  it('returns concrete stat as-is for melee/ranged/magic', () => {
    const skills = { melee: 10, ranged: 20, magic: 30 };
    expect(resolveScalingStat('melee', null, skills)).toBe('melee');
    expect(resolveScalingStat('ranged', null, skills)).toBe('ranged');
    expect(resolveScalingStat('magic', null, skills)).toBe('magic');
  });

  it('weapon resolves to weaponRequiredSkill when present', () => {
    const skills = { melee: 10, ranged: 20, magic: 30 };
    expect(resolveScalingStat('weapon', 'ranged', skills)).toBe('ranged');
    expect(resolveScalingStat('weapon', 'melee', skills)).toBe('melee');
    expect(resolveScalingStat('weapon', 'magic', skills)).toBe('magic');
  });

  it('weapon resolves to highest skill when no weapon', () => {
    expect(resolveScalingStat('weapon', null, { melee: 5, ranged: 10, magic: 20 })).toBe('magic');
    expect(resolveScalingStat('weapon', null, { melee: 5, ranged: 20, magic: 10 })).toBe('ranged');
    expect(resolveScalingStat('weapon', null, { melee: 20, ranged: 5, magic: 10 })).toBe('melee');
  });

  it('weapon with tied skills picks melee (first in priority)', () => {
    expect(resolveScalingStat('weapon', null, { melee: 10, ranged: 10, magic: 10 })).toBe('melee');
    expect(resolveScalingStat('weapon', null, { melee: 10, ranged: 10, magic: 5 })).toBe('melee');
    expect(resolveScalingStat('weapon', null, { melee: 5, ranged: 10, magic: 10 })).toBe('ranged');
  });
});

describe('resolveActionDamageStats', () => {
  it('melee scaling uses melee level + attack + strength', () => {
    // totalAttack = 10 + 10 + 5 = 25, damageMin = 1+5 = 6, damageMax = 5+12 = 17
    // accuracy = floor(10/2) + 5 + 5 = 15
    const result = resolveActionDamageStats('melee', baseScaling);
    expect(result.damageMin).toBe(6);
    expect(result.damageMax).toBe(17);
    expect(result.accuracy).toBe(15);
  });

  it('ranged scaling uses ranged level + rangedPower + dexterity', () => {
    // totalAttack = 20 + 16 + 15 = 51, damageMin = 1+10 = 11, damageMax = 5+25 = 30
    // accuracy = floor(20/2) + 5 + 15 = 30
    const result = resolveActionDamageStats('ranged', baseScaling);
    expect(result.damageMin).toBe(11);
    expect(result.damageMax).toBe(30);
    expect(result.accuracy).toBe(30);
  });

  it('magic scaling uses magic level + magicPower + intelligence', () => {
    // totalAttack = 30 + 24 + 25 = 79, damageMin = 1+15 = 16, damageMax = 5+39 = 44
    // accuracy = floor(30/2) + 5 + 25 = 45
    const result = resolveActionDamageStats('magic', baseScaling);
    expect(result.damageMin).toBe(16);
    expect(result.damageMax).toBe(44);
    expect(result.accuracy).toBe(45);
  });

  it('weapon scaling resolves via weaponRequiredSkill', () => {
    // weaponRequiredSkill = 'magic', so same as magic scaling
    const result = resolveActionDamageStats('weapon', baseScaling);
    expect(result.damageMin).toBe(16);
    expect(result.damageMax).toBe(44);
    expect(result.accuracy).toBe(45);
  });

  it('weapon scaling with no weapon uses highest skill', () => {
    const noWeapon: PerActionScaling = {
      ...baseScaling,
      weaponRequiredSkill: null,
    };
    // highest skill is magic (30), so resolves to magic
    const result = resolveActionDamageStats('weapon', noWeapon);
    expect(result.damageMin).toBe(16);
    expect(result.damageMax).toBe(44);
    expect(result.accuracy).toBe(45);
  });

  it('zero stats produce minimum damage (1-5)', () => {
    const zeroScaling: PerActionScaling = {
      skillLevels: { melee: 0, ranged: 0, magic: 0 },
      attributes: { strength: 0, dexterity: 0, intelligence: 0 },
      weaponPower: { attack: 0, rangedPower: 0, magicPower: 0 },
      equipmentAccuracy: 0,
      weaponRequiredSkill: null,
    };
    // totalAttack = 0, damageMin = 1+0 = 1, damageMax = 5+0 = 5
    // accuracy = 0+0+0 = 0
    const result = resolveActionDamageStats('melee', zeroScaling);
    expect(result.damageMin).toBe(1);
    expect(result.damageMax).toBe(5);
    expect(result.accuracy).toBe(0);
  });
});

describe('isCriticalHit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps total crit chance at 100%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(isCriticalHit(5)).toBe(true);
  });

  it('clamps total crit chance at 0%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(isCriticalHit(-5)).toBe(false);
  });

  it('treats invalid bonus crit chance as zero bonus', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.04);
    expect(isCriticalHit(Number.NaN)).toBe(true);
  });
});

describe('calculateFinalDamage', () => {
  it('applies crit bonus damage and returns actual multiplier used', () => {
    const result = calculateFinalDamage(10, 0, true, 0.25);
    expect(result.actualMultiplier).toBe(1.75);
    expect(result.damage).toBe(17);
  });

  it('clamps invalid negative crit multiplier to zero', () => {
    const result = calculateFinalDamage(10, 0, true, -10);
    expect(result.actualMultiplier).toBe(0);
    expect(result.damage).toBe(1);
  });

  it('uses multiplier 1 when hit is not critical', () => {
    const result = calculateFinalDamage(10, 0, false, 0.5);
    expect(result.actualMultiplier).toBe(1);
    expect(result.damage).toBe(10);
  });
});

describe('buildPlayerCombatStats', () => {
  it('threads crit stats from equipment', () => {
    const stats = buildPlayerCombatStats(
      80,
      100,
      {
        attackStyle: 'melee',
        skillLevel: 10,
        attributes: {
          vitality: 5,
          strength: 5,
          dexterity: 0,
          intelligence: 0,
          luck: 0,
          evasion: 4,
        },
      },
      {
        attack: 5,
        rangedPower: 0,
        magicPower: 0,
        accuracy: 3,
        armor: 2,
        magicDefence: 1,
        health: 10,
        dodge: 1,
        critChance: 0.2,
        critDamage: 0.35,
      }
    );

    expect(stats.critChance).toBe(0.2);
    expect(stats.critDamage).toBe(0.35);
  });

  it('adds strength-based accuracy for melee', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'melee', skillLevel: 10, attributes: { vitality: 0, strength: 8, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 } },
      { attack: 5, rangedPower: 0, magicPower: 0, accuracy: 3, armor: 0, magicDefence: 0, health: 0, dodge: 0 }
    );
    // floor(10/2) + 3 equipAccuracy + 8 strength = 16
    expect(stats.accuracy).toBe(16);
  });

  it('adds dexterity-based accuracy for ranged', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'ranged', skillLevel: 10, attributes: { vitality: 0, strength: 0, dexterity: 8, intelligence: 0, luck: 0, evasion: 0 } },
      { attack: 0, rangedPower: 5, magicPower: 0, accuracy: 3, armor: 0, magicDefence: 0, health: 0, dodge: 0 }
    );
    // floor(10/2) + 3 equipAccuracy + 8 dexterity = 16
    expect(stats.accuracy).toBe(16);
  });

  it('adds intelligence-based accuracy for magic', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'magic', skillLevel: 10, attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 8, luck: 0, evasion: 0 } },
      { attack: 0, rangedPower: 0, magicPower: 5, accuracy: 3, armor: 0, magicDefence: 0, health: 0, dodge: 0 }
    );
    // floor(10/2) + 3 equipAccuracy + 8 intelligence = 16
    expect(stats.accuracy).toBe(16);
  });

  it('does not use off-attribute for accuracy', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'melee', skillLevel: 10, attributes: { vitality: 0, strength: 0, dexterity: 10, intelligence: 10, luck: 0, evasion: 0 } },
      { attack: 5, rangedPower: 0, magicPower: 0, accuracy: 3, armor: 0, magicDefence: 0, health: 0, dodge: 0 }
    );
    // floor(10/2) + 3 equipAccuracy + 0 (strength is 0, dex/int ignored) = 8
    expect(stats.accuracy).toBe(8);
  });

  it('sets damageType to physical for melee attackStyle', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'melee', skillLevel: 10, attributes: { vitality: 5, strength: 5, dexterity: 0, intelligence: 0, luck: 0, evasion: 4 } },
      { attack: 5, rangedPower: 0, magicPower: 0, accuracy: 3, armor: 2, magicDefence: 1, health: 10, dodge: 1 }
    );
    expect(stats.damageType).toBe('physical');
  });

  it('sets damageType to physical for ranged attackStyle', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'ranged', skillLevel: 10, attributes: { vitality: 5, strength: 0, dexterity: 5, intelligence: 0, luck: 0, evasion: 4 } },
      { attack: 0, rangedPower: 5, magicPower: 0, accuracy: 3, armor: 2, magicDefence: 1, health: 10, dodge: 1 }
    );
    expect(stats.damageType).toBe('physical');
  });

  it('sets damageType to magic for magic attackStyle', () => {
    const stats = buildPlayerCombatStats(
      80, 100,
      { attackStyle: 'magic', skillLevel: 10, attributes: { vitality: 5, strength: 0, dexterity: 0, intelligence: 5, luck: 0, evasion: 4 } },
      { attack: 0, rangedPower: 0, magicPower: 5, accuracy: 3, armor: 2, magicDefence: 1, health: 10, dodge: 1 }
    );
    expect(stats.damageType).toBe('magic');
  });
});

describe('mobToCombatantStats', () => {
  const baseMob: MobTemplate = {
    id: 'mob1', name: 'Goblin', zoneId: 'z1', level: 5,
    hp: 50, accuracy: 12, defence: 8, magicDefence: 4, evasion: 6,
    damageMin: 3, damageMax: 7, xpReward: 25, encounterWeight: 1,
    spellPattern: [], damageType: 'physical',
  };

  it('maps MobTemplate fields to CombatantStats', () => {
    const stats = mobToCombatantStats(baseMob);
    expect(stats.hp).toBe(50);
    expect(stats.maxHp).toBe(50);
    expect(stats.attack).toBe(12);
    expect(stats.accuracy).toBe(12);
    expect(stats.defence).toBe(8);
    expect(stats.dodge).toBe(6);
    expect(stats.evasion).toBe(0);
    expect(stats.speed).toBe(0);
    expect(stats.damageType).toBe('physical');
  });

  it('uses currentHp/maxHp overrides when provided', () => {
    const wounded = { ...baseMob, currentHp: 30, maxHp: 60 };
    const stats = mobToCombatantStats(wounded);
    expect(stats.hp).toBe(30);
    expect(stats.maxHp).toBe(60);
  });
});

describe('calculateHitChance', () => {
  it('starter open-world hit math should keep the tutorial floor against a Field Mouse profile', () => {
    const result = calculateHitChance('pve_open_world', 11, 2);
    expect(result.hitChance).toBeGreaterThanOrEqual(0.45);
  });

  it('sanitizes non-finite hit and avoid scores', () => {
    const result = calculateHitChance('pvp', Number.NaN, Number.NEGATIVE_INFINITY);

    expect(result.hitScore).toBe(1);
    expect(result.avoidScore).toBe(0);
    expect(result.hitChance).toBeGreaterThanOrEqual(0.10);
  });
});

describe('resolveHitCheck', () => {
  it('pvp curve allows unchecked evasion to push hit chance below 0.30', () => {
    const result = resolveHitCheck({
      combatMode: 'pvp',
      hitScore: 30,
      avoidScore: 95,
      hitRollValue: 0.5,
    });

    expect(result.hitChance).toBeLessThan(0.30);
    expect(result.didHit).toBe(false);
  });

  it('boss curve preserves a stronger minimum hit floor', () => {
    const result = resolveHitCheck({
      combatMode: 'pve_boss',
      hitScore: 30,
      avoidScore: 95,
      hitRollValue: 0.5,
    });

    expect(result.hitChance).toBeGreaterThanOrEqual(0.35);
    expect(result.didHit).toBe(false);
  });

  it('sanitizes a non-finite sampled hit roll value', () => {
    const result = resolveHitCheck({
      combatMode: 'pvp',
      hitScore: 30,
      avoidScore: 5,
      hitRollValue: Number.NaN,
    });

    expect(result.hitRollValue).toBe(0);
    expect(result.didHit).toBe(true);
  });
});

describe('rollD20', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns values between 1 and 20', () => {
    // Test boundaries
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollD20()).toBe(1);

    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(rollD20()).toBe(20);
  });

  it('returns integer values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = rollD20();
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('rollDamage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns min when random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollDamage(5, 10)).toBe(5);
  });

  it('returns max when random is near 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(rollDamage(5, 10)).toBe(10);
  });

  it('returns min when min equals max', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(rollDamage(7, 7)).toBe(7);
  });
});

describe('rollInitiative', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds speed to d20 roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 roll = 11
    expect(rollInitiative(5)).toBe(16);
  });

  it('works with 0 speed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 roll = 1
    expect(rollInitiative(0)).toBe(1);
  });
});

describe('calculateDefenceReduction', () => {
  it('returns 0 for 0 defence', () => {
    expect(calculateDefenceReduction(0)).toBe(0);
  });

  it('returns 0.5 for 100 defence', () => {
    expect(calculateDefenceReduction(100)).toBe(0.5);
  });

  it('has diminishing returns', () => {
    const at50 = calculateDefenceReduction(50);
    const at100 = calculateDefenceReduction(100);
    const at200 = calculateDefenceReduction(200);
    // Each 100 defence gives less reduction
    expect(at100 - at50).toBeGreaterThan(at200 - at100);
  });

  it('treats negative defence as 0', () => {
    expect(calculateDefenceReduction(-10)).toBe(0);
  });

  it('treats NaN as 0', () => {
    expect(calculateDefenceReduction(NaN)).toBe(0);
  });

  it('never reaches 1', () => {
    expect(calculateDefenceReduction(10000)).toBeLessThan(1);
  });
});
