import { describe, expect, it } from 'vitest';
import type { MobTemplate } from '@pocketrealm/shared';
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

  it('gives spider elites a spider-themed special rotation', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'elite',
      damageType: 'physical',
      familyName: 'Spiders',
      mobName: 'Web Spinner',
    });

    expect(actions.map(action => action.actionId)).toEqual([
      'boss_physical_attack',
      'boss_poison_spray',
      'boss_physical_attack',
    ]);
  });

  it('gives magic mini-bosses a telegraphed arcane pressure action', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'magic',
      familyName: 'Fae Spirits',
      mobName: 'Glimmer Wisp',
    });

    expect(actions).toContainEqual(expect.objectContaining({
      actionId: 'boss_arcane_storm',
      targetMode: 'aoe',
      isTelegraphed: true,
    }));
  });

  it('gives physical mini-bosses a telegraphed earthquake pressure action', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'physical',
      familyName: 'Golems',
      mobName: 'Stone Golem',
    });

    expect(actions).toContainEqual(expect.objectContaining({
      actionId: 'boss_earthquake',
      targetMode: 'aoe',
      isTelegraphed: true,
    }));
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
