import type { ActionDefinition } from '../types/combatAction.types';
import type { BossTemplateDefinition } from '../types/bossTemplate.types';

// Boss action definitions — all zero-cost (mobs don't manage resources)

const bossPhysicalAttack: ActionDefinition = {
  id: 'boss_physical_attack',
  name: 'Attack',
  description: 'Physical boss attack.',
  actionType: 'normal_attack',
  category: 'offensive',
  cost: { stamina: 0, mana: 0 },
  damageMultiplier: 1.0,
  damageType: 'physical',
};

const bossMagicAttack: ActionDefinition = {
  id: 'boss_magic_attack',
  name: 'Magic Attack',
  description: 'Magical boss attack.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: { stamina: 0, mana: 0 },
  damageMultiplier: 1.0,
  damageType: 'magic',
};

const bossEarthquake: ActionDefinition = {
  id: 'boss_earthquake',
  name: 'Earthquake',
  description: 'Massive physical AoE. Counter or take huge damage.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: { stamina: 0, mana: 0 },
  damageMultiplier: 2.0,
  damageType: 'physical',
};

const bossArcaneStorm: ActionDefinition = {
  id: 'boss_arcane_storm',
  name: 'Arcane Storm',
  description: 'Massive magical AoE. Ward or take huge damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: { stamina: 0, mana: 0 },
  damageMultiplier: 2.0,
  damageType: 'magic',
};

const bossWeaken: ActionDefinition = {
  id: 'boss_weaken',
  name: 'Weaken',
  description: 'Reduces all players\' attack for 3 rounds.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: { stamina: 0, mana: 0 },
  damageMultiplier: 0,
  damageType: 'magic',
  effect: {
    name: 'Weakened',
    stat: 'attack',
    modifier: -5,
    duration: 3,
    isDebuff: true,
  },
};

const bossEnrage: ActionDefinition = {
  id: 'boss_enrage',
  name: 'Enrage',
  description: 'Boss increases its own damage for 3 rounds.',
  actionType: 'buff',
  category: 'supportive',
  cost: { stamina: 0, mana: 0 },
  effect: {
    name: 'Enraged',
    stat: 'attack',
    modifier: 10,
    duration: 3,
  },
};

const bossHealSelf: ActionDefinition = {
  id: 'boss_heal_self',
  name: 'Heal',
  description: 'Boss heals itself.',
  actionType: 'heal_self',
  category: 'supportive',
  cost: { stamina: 0, mana: 0 },
  healPercent: 0.05,
  isChanneling: true,
};

const bossRest: ActionDefinition = {
  id: 'boss_rest',
  name: 'Rest',
  description: 'Boss rests and does nothing.',
  actionType: 'defend',
  category: 'defensive',
  cost: { stamina: 0, mana: 0 },
};

export const BOSS_ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  boss_physical_attack: bossPhysicalAttack,
  boss_magic_attack: bossMagicAttack,
  boss_earthquake: bossEarthquake,
  boss_arcane_storm: bossArcaneStorm,
  boss_weaken: bossWeaken,
  boss_enrage: bossEnrage,
  boss_heal_self: bossHealSelf,
  boss_rest: bossRest,
};

export const BOSS_TEMPLATES: Record<string, BossTemplateDefinition> = {
  'Stone Colossus': {
    actions: [
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_weaken', targetMode: 'aoe' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true, label: 'EARTHQUAKE' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_heal_self', targetMode: 'single_target' },
      { actionId: 'boss_magic_attack', targetMode: 'single_target' },
      { actionId: 'boss_enrage', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true, label: 'ARCANE STORM' },
      { actionId: 'boss_rest', targetMode: 'single_target' },
    ],
    actionDefinitions: BOSS_ACTION_DEFINITIONS,
  },

  'Alpha Wolf': {
    actions: [
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_enrage', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'aoe' },
    ],
    actionDefinitions: BOSS_ACTION_DEFINITIONS,
  },

  'Ancient Spirit': {
    actions: [
      { actionId: 'boss_magic_attack', targetMode: 'single_target' },
      { actionId: 'boss_weaken', targetMode: 'aoe' },
      { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true, label: 'ARCANE STORM' },
      { actionId: 'boss_heal_self', targetMode: 'single_target' },
    ],
    actionDefinitions: BOSS_ACTION_DEFINITIONS,
  },
};
