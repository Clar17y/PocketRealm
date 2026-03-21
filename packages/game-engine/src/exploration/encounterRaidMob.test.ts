import { describe, it, expect } from 'vitest';
import type { EncounterMobSlot } from '@pocketrealm/shared';
import { buildEncounterRaidMob, type MobTemplateForConversion } from './encounterRaidMob';

function makeSlot(overrides: Partial<EncounterMobSlot> = {}): EncounterMobSlot {
  return {
    slot: 1,
    mobTemplateId: 'goblin',
    role: 'trash',
    prefix: null,
    status: 'alive',
    room: 1,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<MobTemplateForConversion> = {}): MobTemplateForConversion {
  return {
    id: 'goblin',
    name: 'Goblin',
    hp: 80,
    accuracy: 15,
    defence: 5,
    magicDefence: 3,
    evasion: 5,
    damageMin: 8,
    damageMax: 12,
    damageType: 'physical',
    actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
    critChance: 0.05,
    critMultiplier: 1.5,
    ...overrides,
  };
}

describe('buildEncounterRaidMob', () => {
  it('produces the correct id from slot number', () => {
    const result = buildEncounterRaidMob(makeSlot({ slot: 3 }), makeTemplate());
    expect(result.id).toBe('encounter-mob-3');
  });

  it('maps mobTemplateId from template.id', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ id: 'orc' }));
    expect(result.mobTemplateId).toBe('orc');
  });

  it('maps name from template.name', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ name: 'Orc Warrior' }));
    expect(result.name).toBe('Orc Warrior');
  });

  it('maps prefix from slot.prefix', () => {
    const result = buildEncounterRaidMob(makeSlot({ prefix: 'Savage' }), makeTemplate());
    expect(result.prefix).toBe('Savage');
  });

  it('maps null prefix when slot has no prefix', () => {
    const result = buildEncounterRaidMob(makeSlot({ prefix: null }), makeTemplate());
    expect(result.prefix).toBeNull();
  });

  it('sets hp and maxHp from template.hp', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ hp: 150 }));
    expect(result.hp).toBe(150);
    expect(result.maxHp).toBe(150);
  });

  it('maps stats.accuracy from template.accuracy', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ accuracy: 25 }));
    expect(result.stats.accuracy).toBe(25);
  });

  it('maps stats.defence from template.defence', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ defence: 12 }));
    expect(result.stats.defence).toBe(12);
  });

  it('maps stats.magicDefence from template.magicDefence', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ magicDefence: 8 }));
    expect(result.stats.magicDefence).toBe(8);
  });

  it('maps stats.evasion from template.evasion', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ evasion: 10 }));
    expect(result.stats.evasion).toBe(10);
  });

  it('maps stats.damageMin from template.damageMin', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ damageMin: 15 }));
    expect(result.stats.damageMin).toBe(15);
  });

  it('maps stats.damageMax from template.damageMax', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ damageMax: 25 }));
    expect(result.stats.damageMax).toBe(25);
  });

  it('maps stats.damageType from template.damageType', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ damageType: 'magic' }));
    expect(result.stats.damageType).toBe('magic');
  });

  it('maps stats.critChance from template.critChance', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ critChance: 0.10 }));
    expect(result.stats.critChance).toBe(0.10);
  });

  it('maps stats.critDamage from template.critMultiplier', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ critMultiplier: 2.0 }));
    expect(result.stats.critDamage).toBe(2.0);
  });

  it('sets stats.speed to 10', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate());
    expect(result.stats.speed).toBe(10);
  });

  it('sets stats.dodge to 0', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate());
    expect(result.stats.dodge).toBe(0);
  });

  it('maps actionTemplate from template.actionTemplate', () => {
    const actionTemplate = [
      { actionId: 'boss_magic_attack', targetMode: 'single_target' as const },
      { actionId: 'boss_physical_attack', targetMode: 'aoe' as const },
    ];
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate({ actionTemplate }));
    expect(result.actionTemplate).toEqual(actionTemplate);
  });

  it('initializes activeEffects as empty array', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate());
    expect(result.activeEffects).toEqual([]);
  });

  it('sets phaseTemplates to undefined', () => {
    const result = buildEncounterRaidMob(makeSlot(), makeTemplate());
    expect(result.phaseTemplates).toBeUndefined();
  });
});
