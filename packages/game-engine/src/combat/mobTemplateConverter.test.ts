import { describe, expect, it } from 'vitest';
import type { MobTemplate, SpellAction } from '@adventure/shared';
import { BASE_ACTION_DEFINITIONS } from '@adventure/shared';
import {
  mobToTemplate,
  buildMobActionDefinitions,
  mobToTemplateCombatant,
} from './mobTemplateConverter';
import { mobToCombatantStats } from './damageCalculator';

// --- Helpers ---

function makeMob(overrides: Partial<MobTemplate> = {}): MobTemplate {
  return {
    id: 'mob-1',
    name: 'Test Mob',
    zoneId: 'zone-1',
    level: 5,
    hp: 100,
    accuracy: 10,
    defence: 5,
    magicDefence: 3,
    evasion: 2,
    damageMin: 5,
    damageMax: 10,
    xpReward: 50,
    encounterWeight: 1,
    spellPattern: [],
    damageType: 'physical',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mobToTemplate
// ---------------------------------------------------------------------------

describe('mobToTemplate', () => {
  it('returns [normal_attack] for a mob with no spells', () => {
    const mob = makeMob();
    const template = mobToTemplate(mob);
    expect(template).toEqual([{ id: 'mob-slot-0', sortOrder: 0, actionId: 'normal_attack' }]);
  });

  it('creates correct template for a mob with spellPattern', () => {
    const mob = makeMob({
      spellPattern: [{ round: 3, name: 'Fire Blast', damage: 20 }],
    });
    const template = mobToTemplate(mob);
    expect(template).toHaveLength(3);
    expect(template[0]).toEqual({ id: 'mob-slot-0', sortOrder: 0, actionId: 'normal_attack' });
    expect(template[1]).toEqual({ id: 'mob-slot-1', sortOrder: 1, actionId: 'normal_attack' });
    expect(template[2]).toEqual({ id: 'mob-slot-2', sortOrder: 2, actionId: 'mob_spell_fire_blast' });
  });

  it('merges prefix spells with mob spellPattern', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: 'Bite', damage: 10 }],
    });
    const prefixSpells: SpellAction[] = [
      { round: 3, name: 'Enrage', effects: [{ stat: 'attack', modifier: 5, duration: 3 }] },
    ];
    const template = mobToTemplate(mob, prefixSpells);
    expect(template).toHaveLength(3);
    expect(template[0]).toEqual({ id: 'mob-slot-0', sortOrder: 0, actionId: 'mob_spell_bite' });
    expect(template[1]).toEqual({ id: 'mob-slot-1', sortOrder: 1, actionId: 'normal_attack' });
    expect(template[2]).toEqual({ id: 'mob-slot-2', sortOrder: 2, actionId: 'mob_spell_enrage' });
  });

  it('sanitizes spell names into valid action IDs', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: "Dragon's Fire!", damage: 30 }],
    });
    const template = mobToTemplate(mob);
    expect(template[0].actionId).toBe('mob_spell_dragon_s_fire_');
  });
});

// ---------------------------------------------------------------------------
// buildMobActionDefinitions
// ---------------------------------------------------------------------------

describe('buildMobActionDefinitions', () => {
  it('includes all base action definitions', () => {
    const mob = makeMob();
    const defs = buildMobActionDefinitions(mob);
    for (const key of Object.keys(BASE_ACTION_DEFINITIONS)) {
      expect(defs[key]).toBeDefined();
    }
  });

  it('creates proper ActionDefinition for a damage spell', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: 'Fire Blast', damage: 20 }],
    });
    const defs = buildMobActionDefinitions(mob);
    const def = defs['mob_spell_fire_blast'];
    expect(def).toBeDefined();
    expect(def.id).toBe('mob_spell_fire_blast');
    expect(def.name).toBe('Fire Blast');
    expect(def.actionType).toBe('damage_spell');
    expect(def.category).toBe('offensive');
    expect(def.cost).toEqual({ stamina: 0, mana: 0 });
    expect(def.damageMultiplier).toBe(1.0);
    expect(def.damageType).toBe('magic');
    expect(def.isChanneling).toBe(false);
    expect(def.healFlat).toBeUndefined();
    expect(def.effect).toBeUndefined();
  });

  it('creates proper ActionDefinition for a heal spell', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: 'Heal', heal: 30 }],
    });
    const defs = buildMobActionDefinitions(mob);
    const def = defs['mob_spell_heal'];
    expect(def).toBeDefined();
    expect(def.actionType).toBe('heal_self');
    expect(def.category).toBe('supportive');
    expect(def.healFlat).toBe(30);
    expect(def.damageMultiplier).toBeUndefined();
    expect(def.isChanneling).toBe(true);
  });

  it('creates proper ActionDefinition for a buff/debuff spell', () => {
    const mob = makeMob({
      spellPattern: [{
        round: 1,
        name: 'Weaken',
        effects: [{ stat: 'attack', modifier: -5, duration: 3 }],
      }],
    });
    const defs = buildMobActionDefinitions(mob);
    const def = defs['mob_spell_weaken'];
    expect(def).toBeDefined();
    expect(def.actionType).toBe('buff');
    expect(def.category).toBe('supportive');
    expect(def.effect).toEqual({
      name: 'Weaken',
      stat: 'attack',
      modifier: -5,
      duration: 3,
      isDebuff: true,
    });
    expect(def.isChanneling).toBe(true);
    expect(def.damageMultiplier).toBeUndefined();
  });

  it('marks positive modifier effects as non-debuff', () => {
    const mob = makeMob({
      spellPattern: [{
        round: 1,
        name: 'Shield Up',
        effects: [{ stat: 'defence', modifier: 10, duration: 2 }],
      }],
    });
    const defs = buildMobActionDefinitions(mob);
    const def = defs['mob_spell_shield_up'];
    expect(def.effect!.isDebuff).toBe(false);
  });

  it('includes prefix spell definitions', () => {
    const mob = makeMob();
    const prefixSpells: SpellAction[] = [
      { round: 2, name: 'Shadow Strike', damage: 15 },
    ];
    const defs = buildMobActionDefinitions(mob, prefixSpells);
    expect(defs['mob_spell_shadow_strike']).toBeDefined();
    expect(defs['mob_spell_shadow_strike'].category).toBe('offensive');
  });
});

// ---------------------------------------------------------------------------
// mobToTemplateCombatant
// ---------------------------------------------------------------------------

describe('mobToTemplateCombatant', () => {
  it('returns correct structure with Infinity resources', () => {
    const mob = makeMob();
    const combatant = mobToTemplateCombatant(mob);

    expect(combatant.id).toBe('mob-1');
    expect(combatant.name).toBe('Test Mob');
    expect(combatant.stamina).toBe(Infinity);
    expect(combatant.maxStamina).toBe(Infinity);
    expect(combatant.staminaRegenPerRound).toBe(0);
    expect(combatant.mana).toBe(Infinity);
    expect(combatant.maxMana).toBe(Infinity);
    expect(combatant.manaRegenPerRound).toBe(0);
    expect(combatant.template).toEqual([{ id: 'mob-slot-0', sortOrder: 0, actionId: 'normal_attack' }]);
    expect(combatant.actionDefinitions).toBeDefined();
  });

  it('uses correct stats from mobToCombatantStats', () => {
    const mob = makeMob({
      hp: 200,
      accuracy: 15,
      defence: 8,
      magicDefence: 6,
      evasion: 4,
      damageMin: 10,
      damageMax: 20,
    });
    const combatant = mobToTemplateCombatant(mob);
    const expectedStats = mobToCombatantStats(mob);

    expect(combatant.stats).toEqual(expectedStats);
    expect(combatant.stats.hp).toBe(200);
    expect(combatant.stats.maxHp).toBe(200);
    expect(combatant.stats.accuracy).toBe(15);
    expect(combatant.stats.defence).toBe(8);
    expect(combatant.stats.magicDefence).toBe(6);
    expect(combatant.stats.damageMin).toBe(10);
    expect(combatant.stats.damageMax).toBe(20);
  });

  it('respects currentHp/maxHp overrides', () => {
    const mob = makeMob({ hp: 100 });
    const combatant = mobToTemplateCombatant({ ...mob, currentHp: 50, maxHp: 120 });
    expect(combatant.stats.hp).toBe(50);
    expect(combatant.stats.maxHp).toBe(120);
  });

  it('includes spell template and action definitions for mobs with spells', () => {
    const mob = makeMob({
      spellPattern: [
        { round: 2, name: 'Fireball', damage: 25 },
        { round: 4, name: 'Heal', heal: 15 },
      ],
    });
    const combatant = mobToTemplateCombatant(mob);

    expect(combatant.template).toHaveLength(4);
    expect(combatant.template[0].actionId).toBe('normal_attack');
    expect(combatant.template[1].actionId).toBe('mob_spell_fireball');
    expect(combatant.template[2].actionId).toBe('normal_attack');
    expect(combatant.template[3].actionId).toBe('mob_spell_heal');

    expect(combatant.actionDefinitions['mob_spell_fireball']).toBeDefined();
    expect(combatant.actionDefinitions['mob_spell_heal']).toBeDefined();
  });

  it('merges prefix spells into the combatant', () => {
    const mob = makeMob();
    const prefixSpells: SpellAction[] = [
      { round: 1, name: 'Charge', damage: 12 },
    ];
    const combatant = mobToTemplateCombatant(mob, prefixSpells);

    expect(combatant.template).toEqual([
      { id: 'mob-slot-0', sortOrder: 0, actionId: 'mob_spell_charge' },
    ]);
    expect(combatant.actionDefinitions['mob_spell_charge']).toBeDefined();
  });
});
