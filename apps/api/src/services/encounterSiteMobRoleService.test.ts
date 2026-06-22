import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_SITE_ROLE_CONSTANTS,
  type MobTemplate,
} from '@pocketrealm/shared';
import { BOSS_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/bossTemplateDefinitions';
import {
  applyEncounterRoleModifiers,
  buildEncounterSiteMobPreview,
  resolveEncounterRoleActionTemplate,
} from './encounterSiteMobRoleService';

const baseMob: MobTemplate = {
  id: 'web-spinner',
  name: 'Web Spinner',
  zoneId: 'zone-1',
  level: 3,
  hp: 100,
  accuracy: 100,
  defence: 80,
  magicDefence: 60,
  evasion: 40,
  damageMin: 5,
  damageMax: 9,
  xpReward: 20,
  encounterWeight: 1,
  spellPattern: [],
  damageType: 'physical',
};

describe('applyEncounterRoleModifiers', () => {
  it('keeps trash stats at the base template values', () => {
    const result = applyEncounterRoleModifiers(baseMob, 'trash');

    expect(result.hp).toBe(baseMob.hp);
    expect(result.damageMin).toBe(baseMob.damageMin);
    expect(result.damageMax).toBe(baseMob.damageMax);
    expect(result.xpReward).toBe(baseMob.xpReward);
  });

  it('scales elite combat stats and XP above trash', () => {
    const trash = applyEncounterRoleModifiers(baseMob, 'trash');
    const elite = applyEncounterRoleModifiers(baseMob, 'elite');

    expect(elite.hp).toBeGreaterThan(trash.hp);
    expect(elite.damageMin).toBeGreaterThan(trash.damageMin);
    expect(elite.damageMax).toBeGreaterThan(trash.damageMax);
    expect(elite.accuracy).toBeGreaterThan(trash.accuracy);
    expect(elite.defence).toBeGreaterThan(trash.defence);
    expect(elite.xpReward).toBeGreaterThan(trash.xpReward);
  });

  it('scales mini_boss stats and XP above elite', () => {
    const elite = applyEncounterRoleModifiers(baseMob, 'elite');
    const miniBoss = applyEncounterRoleModifiers(baseMob, 'mini_boss');

    expect(miniBoss.hp).toBeGreaterThan(elite.hp);
    expect(miniBoss.damageMin).toBeGreaterThan(elite.damageMin);
    expect(miniBoss.damageMax).toBeGreaterThan(elite.damageMax);
    expect(miniBoss.accuracy).toBeGreaterThan(elite.accuracy);
    expect(miniBoss.defence).toBeGreaterThan(elite.defence);
    expect(miniBoss.xpReward).toBeGreaterThan(elite.xpReward);
  });
});

describe('resolveEncounterRoleActionTemplate', () => {
  it('gives trash mobs one basic action based on damage type', () => {
    expect(resolveEncounterRoleActionTemplate({
      role: 'trash',
      damageType: 'physical',
      familyName: 'Spiders',
      mobName: 'Web Spinner',
    })).toEqual([{ actionId: 'boss_physical_attack', targetMode: 'single_target' }]);

    expect(resolveEncounterRoleActionTemplate({
      role: 'trash',
      damageType: 'magic',
      familyName: 'Witches',
      mobName: 'Hedge Witch',
    })).toEqual([{ actionId: 'boss_magic_attack', targetMode: 'single_target' }]);
  });

  it('gives spider elites a single-target setup and spike rotation', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'elite',
      damageType: 'physical',
      familyName: 'Spiders',
      mobName: 'Web Spinner',
    });

    expect(actions).toEqual([
      { actionId: 'boss_root', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'elite_venom_strike', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
    ]);
  });

  it('keeps elite and mini-boss generated templates single-target', () => {
    const inputs = [
      { role: 'elite', damageType: 'physical', familyName: 'Spiders', mobName: 'Web Spinner' },
      { role: 'elite', damageType: 'magic', familyName: 'Witches', mobName: 'Hedge Witch' },
      { role: 'mini_boss', damageType: 'physical', familyName: 'Golems', mobName: 'Stone Golem' },
      { role: 'mini_boss', damageType: 'magic', familyName: 'Fae Spirits', mobName: 'Glimmer Wisp' },
    ] as const;

    for (const input of inputs) {
      const actions = resolveEncounterRoleActionTemplate(input);

      expect(actions.map(action => action.targetMode)).toEqual(
        Array.from({ length: actions.length }, () => 'single_target'),
      );
      expect(actions).not.toContainEqual(expect.objectContaining({ targetMode: 'aoe' }));
    }
  });

  it('gives magic mini-bosses a telegraphed single-target arcane finisher', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'magic',
      familyName: 'Fae Spirits',
      mobName: 'Glimmer Wisp',
    });

    expect(actions).toContainEqual({
      actionId: 'mini_boss_arcane_spike',
      targetMode: 'single_target',
      isTelegraphed: true,
      label: 'ARCANE SPIKE',
    });
  });

  it('gives physical mini-bosses a telegraphed single-target execution finisher', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'physical',
      familyName: 'Golems',
      mobName: 'Stone Golem',
    });

    expect(actions).toContainEqual({
      actionId: 'mini_boss_execution_strike',
      targetMode: 'single_target',
      isTelegraphed: true,
      label: 'EXECUTION STRIKE',
    });
  });

  it('builds mini-bosses with basic, special, setup, basic, and finisher actions', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'physical',
      familyName: 'Golems',
      mobName: 'Stone Golem',
    });

    expect(actions.map(action => action.actionId)).toEqual([
      'boss_physical_attack',
      'mini_boss_crushing_blow',
      'mini_boss_root',
      'boss_physical_attack',
      'mini_boss_execution_strike',
    ]);
  });

  it('uses mini-boss-specific special actions with mini-boss special tuning', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'physical',
      familyName: 'Wolves',
      mobName: 'Dire Wolf',
    });
    const special = actions.find(action => action.actionId === 'mini_boss_maul')!;
    const definition = BOSS_ACTION_DEFINITIONS[special.actionId]!;

    expect(special.actionId).toBe('mini_boss_maul');
    expect(special.actionId).not.toBe('elite_maul');
    expect(definition.damageMultiplier).toBe(
      1.6 * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_ACTION_MULTIPLIERS.mini_boss.specialDamage,
    );
  });
});

describe('buildEncounterSiteMobPreview', () => {
  it('builds role-scaled preview HP for promoted current-room mobs', () => {
    const preview = buildEncounterSiteMobPreview(
      {
        slot: 4,
        prefix: null,
        role: 'elite',
      },
      {
        name: 'Web Spinner',
        hp: 100,
      },
      1.25,
    );

    expect(preview).toEqual({
      slot: 4,
      name: 'Web Spinner',
      prefix: null,
      role: 'elite',
      hp: 200,
      maxHp: 200,
    });
  });
});
