import type { ActionDefinition } from '../types/combatAction.types';
import type { BossTemplateDefinition } from '../types/bossTemplate.types';
import { ENCOUNTER_SITE_ROLE_CONSTANTS } from './gameConstants';

// Boss action definitions — all zero-cost (mobs don't manage resources)
const BOSS_ZERO_COST = { stamina: 0, mana: 0 } as const;

function roleSpikeMultiplier(role: 'elite' | 'mini_boss', base: number): number {
  return base * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_ACTION_MULTIPLIERS[role].spikeDamage;
}

const bossPhysicalAttack: ActionDefinition = {
  id: 'boss_physical_attack',
  name: 'Attack',
  description: 'Physical boss attack.',
  actionType: 'normal_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 1.0,
  damageType: 'physical',
};

const bossMagicAttack: ActionDefinition = {
  id: 'boss_magic_attack',
  name: 'Magic Attack',
  description: 'Magical boss attack.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 1.0,
  damageType: 'magic',
};

const bossEarthquake: ActionDefinition = {
  id: 'boss_earthquake',
  name: 'Earthquake',
  description: 'Massive physical AoE. Counter or take huge damage.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.0,
  damageType: 'physical',
  alwaysHits: true,
};

const bossArcaneStorm: ActionDefinition = {
  id: 'boss_arcane_storm',
  name: 'Arcane Storm',
  description: 'Massive magical AoE. Ward or take huge damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.0,
  damageType: 'magic',
  alwaysHits: true,
};

const bossWeaken: ActionDefinition = {
  id: 'boss_weaken',
  name: 'Weaken',
  description: 'Reduces all players\' attack for 3 rounds.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
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
  cost: BOSS_ZERO_COST,
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
  cost: BOSS_ZERO_COST,
  healPercent: 0.05,
  isChanneling: true,
};

const bossRest: ActionDefinition = {
  id: 'boss_rest',
  name: 'Rest',
  description: 'Boss rests and does nothing.',
  actionType: 'defend',
  category: 'defensive',
  cost: BOSS_ZERO_COST,
};

// --- Lethal single-target ---

const bossImpale: ActionDefinition = {
  id: 'boss_impale',
  name: 'Impale',
  description: 'A devastating thrust that impales the target.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 4.0,
  damageType: 'physical',
  alwaysHits: true,
};

const bossExecutionStrike: ActionDefinition = {
  id: 'boss_execution_strike',
  name: 'Execution Strike',
  description: 'A lethal finishing blow.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 5.0,
  damageType: 'physical',
  alwaysHits: true,
};

// --- AoE damage ---

const bossPoisonSpray: ActionDefinition = {
  id: 'boss_poison_spray',
  name: 'Poison Spray',
  description: 'Sprays venom that poisons all targets.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 1.0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Poisoned',
    stat: 'poison',
    modifier: 0,
    duration: 5,
    isDebuff: true,
    damagePerRound: 5,
    dotDamageType: 'magic',
  },
};

const bossBlightWave: ActionDefinition = {
  id: 'boss_blight_wave',
  name: 'Blight Wave',
  description: 'A wave of decay that damages all targets.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.0,
  damageType: 'magic',
  alwaysHits: true,
};

const bossDeathBloom: ActionDefinition = {
  id: 'boss_death_bloom',
  name: 'Death Bloom',
  description: 'An eruption of necrotic energy.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 3.0,
  damageType: 'magic',
  alwaysHits: true,
};

const bossDesperateFury: ActionDefinition = {
  id: 'boss_desperate_fury',
  name: 'Desperate Fury',
  description: 'A frenzied flurry of blows.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 3.0,
  damageType: 'physical',
  alwaysHits: true,
};

const bossCocoonBurst: ActionDefinition = {
  id: 'boss_cocoon_burst',
  name: 'Cocoon Burst',
  description: 'The cocoon explodes outward.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.0,
  damageType: 'physical',
  alwaysHits: true,
};

const bossTerrifyingHowl: ActionDefinition = {
  id: 'boss_terrifying_howl',
  name: 'Terrifying Howl',
  description: 'A howl that rattles bones and deals damage.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.5,
  damageType: 'physical',
  alwaysHits: true,
};

// --- Debuffs ---

const bossMarkForDeath: ActionDefinition = {
  id: 'boss_mark_for_death',
  name: 'Mark for Death',
  description: 'Marks a target, making them vulnerable.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Marked for Death',
    stat: 'marked_for_death',
    modifier: 0,
    duration: 2,
    isDebuff: true,
  },
};

const bossWither: ActionDefinition = {
  id: 'boss_wither',
  name: 'Wither',
  description: 'Drains vitality, weakening defences.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Withered',
    stat: 'defence',
    modifier: -8,
    duration: 3,
    isDebuff: true,
  },
};

const bossSmokeBomb: ActionDefinition = {
  id: 'boss_smoke_bomb',
  name: 'Smoke Bomb',
  description: 'Obscures vision, reducing accuracy.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'physical',
  alwaysHits: true,
  effect: {
    name: 'Blinded',
    stat: 'accuracy',
    modifier: -8,
    duration: 2,
    isDebuff: true,
  },
};

const bossNatureCurse: ActionDefinition = {
  id: 'boss_nature_curse',
  name: "Nature's Curse",
  description: 'Curses the target with wild magic.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: "Nature's Curse",
    stat: 'nature_cursed',
    modifier: 0,
    duration: 2,
    isDebuff: true,
  },
};

const bossRoot: ActionDefinition = {
  id: 'boss_root',
  name: 'Root',
  description: 'Roots the target in place.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Rooted',
    stat: 'rooted',
    modifier: 0,
    duration: 2, // Must be 2: applied this round, ticked to 1, forces defend next round
    isDebuff: true,
  },
};

const bossFearHowl: ActionDefinition = {
  id: 'boss_fear_howl',
  name: 'Fear Howl',
  description: 'A terrifying howl that paralyses with fear.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Feared',
    stat: 'rooted',
    modifier: 0,
    duration: 2, // Must be 2: applied this round, ticked to 1, forces defend next round
    isDebuff: true,
  },
};

// --- Buffs ---

const bossFrenzy: ActionDefinition = {
  id: 'boss_frenzy',
  name: 'Frenzy',
  description: 'Enters a frenzied state, boosting attack.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: {
    name: 'Frenzied',
    stat: 'attack',
    modifier: 20,
    duration: 3,
  },
};

const eliteVenomStrike: ActionDefinition = {
  id: 'elite_venom_strike',
  name: 'Venom Strike',
  description: 'A precise venomous strike that leaves poison behind.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.5),
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Venom-Touched',
    stat: 'poison',
    modifier: 0,
    duration: 3,
    isDebuff: true,
    damagePerRound: 4,
    dotDamageType: 'magic',
  },
};

const eliteMaul: ActionDefinition = {
  id: 'elite_maul',
  name: 'Maul',
  description: 'A brutal tearing strike.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.6),
  damageType: 'physical',
  alwaysHits: true,
};

const eliteBackstab: ActionDefinition = {
  id: 'elite_backstab',
  name: 'Backstab',
  description: 'A precise strike from a blind angle.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.7),
  damageType: 'physical',
  alwaysHits: true,
};

const eliteCrushingBlow: ActionDefinition = {
  id: 'elite_crushing_blow',
  name: 'Crushing Blow',
  description: 'A heavy blow that lands with crushing force.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.7),
  damageType: 'physical',
  alwaysHits: true,
};

const eliteArcaneLance: ActionDefinition = {
  id: 'elite_arcane_lance',
  name: 'Arcane Lance',
  description: 'A focused lance of arcane force.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.65),
  damageType: 'magic',
  alwaysHits: true,
};

const eliteDrainingStrike: ActionDefinition = {
  id: 'elite_draining_strike',
  name: 'Draining Strike',
  description: 'A draining strike that restores the attacker.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.5),
  damageType: 'magic',
  alwaysHits: true,
  lifeLeechPercent: 25,
};

const miniBossExecutionStrike: ActionDefinition = {
  id: 'mini_boss_execution_strike',
  name: 'Execution Strike',
  description: 'A telegraphed execution strike aimed at one target.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('mini_boss', 2.1),
  damageType: 'physical',
  alwaysHits: true,
};

const miniBossArcaneSpike: ActionDefinition = {
  id: 'mini_boss_arcane_spike',
  name: 'Arcane Spike',
  description: 'A telegraphed arcane spike aimed at one target.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('mini_boss', 2.1),
  damageType: 'magic',
  alwaysHits: true,
};

const bossBarkShield: ActionDefinition = {
  id: 'boss_bark_shield',
  name: 'Bark Shield',
  description: 'Grows a protective bark layer.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: {
    name: 'Bark Shield',
    stat: 'defence',
    modifier: 12,
    duration: 3,
  },
};

const bossRally: ActionDefinition = {
  id: 'boss_rally',
  name: 'Rally',
  description: 'Rallies allies, boosting attack.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: {
    name: 'Rallied',
    stat: 'attack',
    modifier: 8,
    duration: 3,
  },
};

const bossShieldWall: ActionDefinition = {
  id: 'boss_shield_wall',
  name: 'Shield Wall',
  description: 'Raises a powerful defensive barrier.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: {
    name: 'Shield Wall',
    stat: 'defence',
    modifier: 16,
    duration: 2,
  },
};

// --- Summon ---

const bossSummonAdds: ActionDefinition = {
  id: 'boss_summon_adds',
  name: 'Summon Adds',
  description: 'Summons additional creatures to fight.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
};

// --- Healing ---

const bossRegenerate: ActionDefinition = {
  id: 'boss_regenerate',
  name: 'Regenerate',
  description: 'Rapidly regenerates health.',
  actionType: 'heal_self',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  healPercent: 0.08,
};

// --- Stacking DoT ---

const bossVenomCloud: ActionDefinition = {
  id: 'boss_venom_cloud',
  name: 'Venom Cloud',
  description: 'A cloud of venom that stacks poison.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Venom',
    stat: 'stacking_dot',
    modifier: 0,
    duration: 999,
    isDebuff: true,
    damagePerRound: 5,
    dotDamageType: 'magic',
  },
};

const bossShadowBleed: ActionDefinition = {
  id: 'boss_shadow_bleed',
  name: 'Shadow Bleed',
  description: 'Inflicts a shadow wound that bleeds over time.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Shadow Bleed',
    stat: 'stacking_dot',
    modifier: 0,
    duration: 999,
    isDebuff: true,
    damagePerRound: 5,
    dotDamageType: 'magic',
  },
};

const bossThrowingKnives: ActionDefinition = {
  id: 'boss_throwing_knives',
  name: 'Throwing Knives',
  description: 'Hurls knives that cause bleeding.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'physical',
  alwaysHits: true,
  effect: {
    name: 'Bleeding',
    stat: 'stacking_dot',
    modifier: 0,
    duration: 999,
    isDebuff: true,
    damagePerRound: 5,
    dotDamageType: 'physical',
  },
};

const bossBlightCloud: ActionDefinition = {
  id: 'boss_blight_cloud',
  name: 'Blight Cloud',
  description: 'A toxic cloud that stacks blight damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Blight',
    stat: 'stacking_dot',
    modifier: 0,
    duration: 999,
    isDebuff: true,
    damagePerRound: 5,
    dotDamageType: 'magic',
  },
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
  boss_impale: bossImpale,
  boss_execution_strike: bossExecutionStrike,
  boss_poison_spray: bossPoisonSpray,
  boss_blight_wave: bossBlightWave,
  boss_death_bloom: bossDeathBloom,
  boss_desperate_fury: bossDesperateFury,
  boss_cocoon_burst: bossCocoonBurst,
  boss_terrifying_howl: bossTerrifyingHowl,
  boss_mark_for_death: bossMarkForDeath,
  boss_wither: bossWither,
  boss_smoke_bomb: bossSmokeBomb,
  boss_nature_curse: bossNatureCurse,
  boss_root: bossRoot,
  boss_fear_howl: bossFearHowl,
  boss_frenzy: bossFrenzy,
  elite_venom_strike: eliteVenomStrike,
  elite_maul: eliteMaul,
  elite_backstab: eliteBackstab,
  elite_crushing_blow: eliteCrushingBlow,
  elite_arcane_lance: eliteArcaneLance,
  elite_draining_strike: eliteDrainingStrike,
  mini_boss_execution_strike: miniBossExecutionStrike,
  mini_boss_arcane_spike: miniBossArcaneSpike,
  boss_bark_shield: bossBarkShield,
  boss_rally: bossRally,
  boss_shield_wall: bossShieldWall,
  boss_summon_adds: bossSummonAdds,
  boss_regenerate: bossRegenerate,
  boss_venom_cloud: bossVenomCloud,
  boss_shadow_bleed: bossShadowBleed,
  boss_throwing_knives: bossThrowingKnives,
  boss_blight_cloud: bossBlightCloud,
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
