import type { ActionDefinition } from '../types/combatAction.types';
import { COMBAT_ACTION_CONSTANTS } from './gameConstants';

// --- Offensive Actions (available to all) ---

const lightAttack: ActionDefinition = {
  id: 'light_attack',
  name: 'Light Attack',
  description: 'A quick, light strike. Low cost, low damage.',
  actionType: 'light_attack',
  category: 'offensive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.LIGHT_ATTACK_STAMINA, mana: 0 },
  damageMultiplier: 0.6,
  accuracyModifier: 0,
};

const normalAttack: ActionDefinition = {
  id: 'normal_attack',
  name: 'Normal Attack',
  description: 'A standard weapon strike.',
  actionType: 'normal_attack',
  category: 'offensive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.NORMAL_ATTACK_STAMINA, mana: 0 },
  damageMultiplier: 1.0,
  accuracyModifier: 0,
};

const heavyAttack: ActionDefinition = {
  id: 'heavy_attack',
  name: 'Heavy Attack',
  description: 'A powerful, committed swing. High damage but leaves you vulnerable.',
  actionType: 'heavy_attack',
  category: 'offensive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.HEAVY_ATTACK_STAMINA, mana: 0 },
  damageMultiplier: 1.5,
  accuracyModifier: 5,
  isChanneling: true,
};

// --- Defensive Actions (available to all) ---

const defend: ActionDefinition = {
  id: 'defend',
  name: 'Defend',
  description: 'Brace for impact. Reduces incoming damage. Free fallback when out of resources.',
  actionType: 'defend',
  category: 'defensive',
  scalingStat: 'weapon',
  cost: { stamina: 0, mana: 0 },
  damageReductionPercent: COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION,
};

const counter: ActionDefinition = {
  id: 'counter',
  name: 'Counter',
  description: 'Anticipate a physical attack and avoid it entirely. Wasted against spells.',
  actionType: 'counter',
  category: 'defensive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.COUNTER_STAMINA_COST, mana: 0 },
  avoidsPhysical: true,
};

const ward: ActionDefinition = {
  id: 'ward',
  name: 'Ward',
  description: 'Raise a magical barrier to resist spells. Wasted against physical attacks.',
  actionType: 'ward',
  category: 'defensive',
  scalingStat: 'weapon',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.WARD_MANA_COST },
  resistsMagic: true,
};

// --- Supportive Actions (available to all) ---

const useHpPotion: ActionDefinition = {
  id: 'use_hp_potion',
  name: 'Use Health Potion',
  description: 'Drink a health potion to restore HP. Triggers potion sickness.',
  actionType: 'use_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_POTION_STAMINA, mana: 0 },
  potionType: 'hp',
  isChanneling: true,
};

const useStaminaPotion: ActionDefinition = {
  id: 'use_stamina_potion',
  name: 'Use Stamina Potion',
  description: 'Drink a stamina potion to restore stamina. Triggers potion sickness.',
  actionType: 'use_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_POTION_STAMINA, mana: 0 },
  potionType: 'stamina',
  isChanneling: true,
};

const useManaPotion: ActionDefinition = {
  id: 'use_mana_potion',
  name: 'Use Mana Potion',
  description: 'Drink a mana potion to restore mana. Triggers potion sickness.',
  actionType: 'use_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_POTION_STAMINA, mana: 0 },
  potionType: 'mana',
  isChanneling: true,
};

const useCleansePotion: ActionDefinition = {
  id: 'use_cleanse_potion',
  name: 'Use Cleanse Potion',
  description: 'Drink a cleanse potion to remove magic DOTs (Poison, Burn, etc.). Triggers potion sickness.',
  actionType: 'use_cleanse_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_CLEANSE_POTION_STAMINA, mana: 0 },
  potionType: 'cleanse',
  isChanneling: true,
};

const useResistPotion: ActionDefinition = {
  id: 'use_resist_potion',
  name: 'Use Resist Potion',
  description: 'Drink a resist potion to boost defence and magic defence. Triggers potion sickness.',
  actionType: 'use_buff_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_BUFF_POTION_STAMINA, mana: 0 },
  potionType: 'buff_defence',
  isChanneling: true,
};

const useElixirOfPower: ActionDefinition = {
  id: 'use_elixir_of_power',
  name: 'Use Elixir of Power',
  description: 'Drink an elixir to boost attack damage. Triggers potion sickness.',
  actionType: 'use_buff_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_BUFF_POTION_STAMINA, mana: 0 },
  potionType: 'buff_attack',
  isChanneling: true,
};

// --- Melee Talent Actions ---

const powerStrike: ActionDefinition = {
  id: 'power_strike',
  name: 'Power Strike',
  description: 'A focused physical strike dealing 1.3x weapon damage.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.POWER_STRIKE_STAMINA, mana: 0 },
  damageMultiplier: 1.3,
  accuracyModifier: 0,
};

const cleave: ActionDefinition = {
  id: 'cleave',
  name: 'Cleave',
  description: 'A wide swing dealing 1.1x damage. Hits additional enemies in raids.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.CLEAVE_STAMINA, mana: 0 },
  damageMultiplier: 1.1,
  accuracyModifier: 0,
};

const battleCry: ActionDefinition = {
  id: 'battle_cry',
  name: 'Battle Cry',
  description: 'War cry that boosts attack power for 4 rounds.',
  actionType: 'buff',
  category: 'supportive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.BATTLE_CRY_STAMINA, mana: 0 },
  effect: { name: 'Battle Cry', stat: 'attack', modifier: 15, duration: 4, isDebuff: false },
};

const devastatingBlow: ActionDefinition = {
  id: 'devastating_blow',
  name: 'Devastating Blow',
  description: 'A devastating strike dealing 2.0x weapon damage. Heavy stamina cost.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.DEVASTATING_BLOW_STAMINA, mana: 0 },
  damageMultiplier: 2.0,
  accuracyModifier: 0,
  isChanneling: true,
};

const berserkerRage: ActionDefinition = {
  id: 'berserker_rage',
  name: 'Berserker Rage',
  description: 'Enter a frenzy: +30% attack for 5 rounds.',
  actionType: 'buff',
  category: 'supportive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.BERSERKER_RAGE_STAMINA, mana: 0 },
  effect: { name: 'Berserker Rage', stat: 'attackPercent', modifier: 0.30, duration: 5, isDebuff: false },
};

const execute: ActionDefinition = {
  id: 'execute',
  name: 'Execute',
  description: 'Finishing strike that deals bonus damage when target is below 30% HP.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.EXECUTE_STAMINA, mana: 0 },
  damageMultiplier: 2.5,
  accuracyModifier: 0,
};

const titansWrath: ActionDefinition = {
  id: 'titans_wrath',
  name: "Titan's Wrath",
  description: 'Ultimate melee strike dealing 2.5x weapon damage.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.TITANS_WRATH_STAMINA, mana: 0 },
  damageMultiplier: 2.5,
  accuracyModifier: 0,
  isChanneling: true,
};

// --- Ranged Talent Actions ---

const aimedShot: ActionDefinition = {
  id: 'aimed_shot',
  name: 'Aimed Shot',
  description: 'A carefully aimed shot dealing 1.3x ranged damage.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.AIMED_SHOT_STAMINA, mana: 0 },
  damageMultiplier: 1.3,
  accuracyModifier: 5,
};

const cripplingShot: ActionDefinition = {
  id: 'crippling_shot',
  name: 'Crippling Shot',
  description: 'A debilitating shot that reduces target speed for 3 rounds.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.CRIPPLING_SHOT_STAMINA, mana: 0 },
  damageMultiplier: 0.8,
  accuracyModifier: 0,
  effect: { name: 'Crippled', stat: 'speed', modifier: -20, duration: 3, isDebuff: true },
};

const eagleEye: ActionDefinition = {
  id: 'eagle_eye',
  name: 'Eagle Eye',
  description: 'Intense focus grants massive accuracy boost for 3 rounds.',
  actionType: 'buff',
  category: 'supportive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.EAGLE_EYE_STAMINA, mana: 0 },
  effect: { name: 'Eagle Eye', stat: 'accuracy', modifier: 30, duration: 3, isDebuff: false },
};

const volley: ActionDefinition = {
  id: 'volley',
  name: 'Volley',
  description: 'A rain of arrows hitting all enemies in raids.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.VOLLEY_STAMINA, mana: 0 },
  damageMultiplier: 0.7,
  accuracyModifier: 0,
};

const snipersMark: ActionDefinition = {
  id: 'snipers_mark',
  name: "Sniper's Mark",
  description: 'Mark a target, reducing evasion for 3 rounds and setting up follow-up shots.',
  actionType: 'debuff_spell',
  category: 'supportive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.SNIPERS_MARK_STAMINA, mana: 0 },
  alwaysHits: true,
  effect: { name: "Sniper's Mark", stat: 'evasion', modifier: -20, duration: 3, isDebuff: true, alwaysApplies: true },
};

const piercingShot: ActionDefinition = {
  id: 'piercing_shot',
  name: 'Piercing Shot',
  description: 'An armor-piercing shot that ignores 50% of target defence.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.PIERCING_SHOT_STAMINA, mana: 0 },
  damageMultiplier: 1.8,
  accuracyModifier: 0,
  defenceReduction: 50,
};

const deathMark: ActionDefinition = {
  id: 'death_mark',
  name: 'Death Mark',
  description: 'Ultimate ranged shot dealing 2.5x damage and applying vulnerable debuff.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.DEATH_MARK_STAMINA, mana: 0 },
  damageMultiplier: 2.5,
  accuracyModifier: 0,
  effect: { name: 'Death Mark', stat: 'defence', modifier: -40, duration: 4, isDebuff: true, damagePerRound: 5 },
};

// --- Magic Talent Actions ---

const fireBolt: ActionDefinition = {
  id: 'fire_bolt',
  name: 'Fire Bolt',
  description: 'Hurl a bolt of fire dealing magic damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.FIRE_BOLT_MANA },
  damageMultiplier: 1.2,
  damageType: 'magic',
};

const minorHeal: ActionDefinition = {
  id: 'minor_heal',
  name: 'Minor Heal',
  description: 'Channel healing energy to restore HP.',
  actionType: 'heal_self',
  category: 'supportive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.MINOR_HEAL_MANA },
  healPercent: 0.20,
  isChanneling: true,
};

const frostNova: ActionDefinition = {
  id: 'frost_nova',
  name: 'Frost Nova',
  description: 'Blast of frost dealing magic damage and reducing target evasion for 3 rounds.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.FROST_NOVA_MANA },
  damageMultiplier: 0.9,
  damageType: 'magic',
  effect: { name: 'Frozen', stat: 'evasion', modifier: -15, duration: 3, isDebuff: true, alwaysApplies: true },
};

const enhancedFortitude: ActionDefinition = {
  id: 'enhanced_fortitude',
  name: 'Enhanced Fortitude',
  description: 'Magical barrier boosting defence for 4 rounds.',
  actionType: 'buff',
  category: 'defensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.ENHANCED_FORTITUDE_MANA },
  effect: { name: 'Fortitude', stat: 'defence', modifier: 20, duration: 4, isDebuff: false },
};

const chainLightning: ActionDefinition = {
  id: 'chain_lightning',
  name: 'Chain Lightning',
  description: 'Lightning arcs between enemies in raids.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.CHAIN_LIGHTNING_MANA },
  damageMultiplier: 1.5,
  damageType: 'magic',
};

const healAlly: ActionDefinition = {
  id: 'heal_ally',
  name: 'Heal Ally',
  description: 'Powerful healing spell targeting an ally in raids.',
  actionType: 'heal_ally',
  category: 'supportive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.HEAL_ALLY_MANA },
  healPercent: 0.30,
  isChanneling: true,
};

const arcaneBlast: ActionDefinition = {
  id: 'arcane_blast',
  name: 'Arcane Blast',
  description: 'Concentrated arcane energy dealing 2.0x magic damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.ARCANE_BLAST_MANA },
  damageMultiplier: 2.0,
  damageType: 'magic',
  effect: { name: 'Arcane Burn', stat: 'magicDefence', modifier: -15, duration: 3, isDebuff: true },
};

const regeneration: ActionDefinition = {
  id: 'regeneration',
  name: 'Regeneration',
  description: 'Healing over time restoring 5% max HP per round for 4 rounds.',
  actionType: 'heal_self',
  category: 'supportive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.REGENERATION_MANA },
  effect: { name: 'Regeneration', stat: 'hp', modifier: 0, duration: 4, isDebuff: false, healPerRound: 8 },
};

const meteorStrike: ActionDefinition = {
  id: 'meteor_strike',
  name: 'Meteor Strike',
  description: 'Call down a meteor dealing 2.5x magic AoE damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.METEOR_STRIKE_MANA },
  damageMultiplier: 2.5,
  damageType: 'magic',
  isChanneling: true,
};

// --- Cross-Type Talent Actions (categorised by unlock tree) ---
// Melee tree:

const flameSword: ActionDefinition = {
  id: 'flame_sword',
  name: 'Flame Sword',
  description: 'Engulf your blade in fire, dealing magic damage that bypasses physical armour.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.FLAME_SWORD_STAMINA, mana: COMBAT_ACTION_CONSTANTS.FLAME_SWORD_MANA },
  damageMultiplier: 1.2,
  damageType: 'magic',
  effect: {
    name: 'Burn',
    stat: 'attack',
    modifier: 0,
    duration: 3,
    isDebuff: true,
    damagePerRound: 5,
    damagePerRoundPercent: 15,
    dotDamageType: 'magic',
  },
};

const venomousStrike: ActionDefinition = {
  id: 'venomous_strike',
  name: 'Venomous Strike',
  description: 'Coat your weapon in poison, applying a lingering toxin.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.VENOMOUS_STRIKE_STAMINA, mana: COMBAT_ACTION_CONSTANTS.VENOMOUS_STRIKE_MANA },
  damageMultiplier: 0.9,
  damageType: 'physical',
  effect: {
    name: 'Poison',
    stat: 'attack',
    modifier: 0,
    duration: 3,
    isDebuff: true,
    damagePerRound: 5,
    damagePerRoundPercent: 20,
    dotDamageType: 'magic',
  },
};

const rendingSlash: ActionDefinition = {
  id: 'rending_slash',
  name: 'Rending Slash',
  description: 'A brutal slash that causes deep bleeding.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.RENDING_SLASH_STAMINA, mana: 0 },
  damageMultiplier: 1.1,
  damageType: 'physical',
  effect: {
    name: 'Bleed',
    stat: 'attack',
    modifier: 0,
    duration: 3,
    isDebuff: true,
    damagePerRound: 4,
    damagePerRoundPercent: 15,
    dotDamageType: 'physical',
  },
};

const flameArrow: ActionDefinition = {
  id: 'flame_arrow',
  name: 'Flame Arrow',
  description: 'Ignite your arrow, scorching the target even on a glancing hit.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.FLAME_ARROW_STAMINA, mana: COMBAT_ACTION_CONSTANTS.FLAME_ARROW_MANA },
  damageMultiplier: 1.1,
  damageType: 'magic',
  effect: {
    name: 'Burn',
    stat: 'attack',
    modifier: 0,
    duration: 2,
    isDebuff: true,
    alwaysApplies: true,
    damagePerRound: 6,
    damagePerRoundPercent: 15,
    dotDamageType: 'magic',
  },
};

// Ranged tree:

const barbedArrow: ActionDefinition = {
  id: 'barbed_arrow',
  name: 'Barbed Arrow',
  description: 'A serrated arrowhead tears flesh, causing deep bleeding.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.BARBED_ARROW_STAMINA, mana: 0 },
  damageMultiplier: 0.9,
  damageType: 'physical',
  effect: {
    name: 'Bleed',
    stat: 'attack',
    modifier: 0,
    duration: 3,
    isDebuff: true,
    damagePerRound: 4,
    damagePerRoundPercent: 15,
    dotDamageType: 'physical',
  },
};

const shadowArrow: ActionDefinition = {
  id: 'shadow_arrow',
  name: 'Shadow Arrow',
  description: 'An arrow infused with dark energy that siphons life on impact.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.SHADOW_ARROW_STAMINA, mana: COMBAT_ACTION_CONSTANTS.SHADOW_ARROW_MANA },
  damageMultiplier: 1.2,
  damageType: 'magic',
  lifeLeechPercent: 25,
};

// Magic tree:

const earthSpikes: ActionDefinition = {
  id: 'earth_spikes',
  name: 'Earth Spikes',
  description: 'Conjure jagged stone that pierces armour, dealing physical damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.EARTH_SPIKES_STAMINA, mana: COMBAT_ACTION_CONSTANTS.EARTH_SPIKES_MANA },
  damageMultiplier: 1.3,
  damageType: 'physical',
  effect: {
    name: 'Armor Break',
    stat: 'defence',
    modifier: -15,
    duration: 3,
    isDebuff: true,
  },
};

const lifeDrain: ActionDefinition = {
  id: 'life_drain',
  name: 'Life Drain',
  description: "Siphon the target's life force to heal yourself.",
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.LIFE_DRAIN_MANA },
  damageMultiplier: 1.0,
  damageType: 'magic',
  lifeLeechPercent: 25,
};

const curse: ActionDefinition = {
  id: 'curse',
  name: 'Curse',
  description: "Weaken the target's magical resistance.",
  actionType: 'debuff_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.CURSE_MANA },
  damageMultiplier: 0.5,
  damageType: 'magic',
  effect: {
    name: 'Curse',
    stat: 'magicDefence',
    modifier: -20,
    duration: 4,
    isDebuff: true,
  },
};

const enfeeble: ActionDefinition = {
  id: 'enfeeble',
  name: 'Enfeeble',
  description: "Sap the target's strength, reducing their attack power.",
  actionType: 'debuff_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.ENFEEBLE_MANA },
  damageMultiplier: 0.5,
  damageType: 'magic',
  effect: {
    name: 'Enfeeble',
    stat: 'attack',
    modifier: -20,
    duration: 4,
    isDebuff: true,
  },
};

// --- General Talent Actions ---

const taunt: ActionDefinition = {
  id: 'taunt',
  name: 'Taunt',
  description: 'Force a boss to target you for 2 rounds. Raid only.',
  actionType: 'taunt',
  category: 'defensive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.TAUNT_STAMINA, mana: 0 },
  tauntDuration: 2,
};

const fortify: ActionDefinition = {
  id: 'fortify',
  name: 'Fortify',
  description: 'Magical fortification boosting defence and magic defence for 3 rounds.',
  actionType: 'buff',
  category: 'defensive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.FORTIFY_STAMINA, mana: COMBAT_ACTION_CONSTANTS.FORTIFY_MANA },
  effect: { name: 'Fortified', stat: 'defence', modifier: 30, duration: 3, isDebuff: false },
};

// --- Registry ---

/** The 9 base actions available to all players without talent unlocks */
export const ALWAYS_AVAILABLE_ACTION_IDS = new Set([
  'light_attack', 'normal_attack', 'heavy_attack',
  'defend', 'counter', 'ward',
  'use_hp_potion', 'use_stamina_potion', 'use_mana_potion',
  'use_cleanse_potion', 'use_resist_potion', 'use_elixir_of_power',
]);

export const BASE_ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  // Base actions
  light_attack: lightAttack,
  normal_attack: normalAttack,
  heavy_attack: heavyAttack,
  defend,
  counter,
  ward,
  use_hp_potion: useHpPotion,
  use_stamina_potion: useStaminaPotion,
  use_mana_potion: useManaPotion,
  use_cleanse_potion: useCleansePotion,
  use_resist_potion: useResistPotion,
  use_elixir_of_power: useElixirOfPower,
  // Melee talents
  power_strike: powerStrike,
  cleave,
  battle_cry: battleCry,
  devastating_blow: devastatingBlow,
  berserker_rage: berserkerRage,
  execute,
  titans_wrath: titansWrath,
  // Ranged talents
  aimed_shot: aimedShot,
  crippling_shot: cripplingShot,
  eagle_eye: eagleEye,
  volley,
  snipers_mark: snipersMark,
  piercing_shot: piercingShot,
  death_mark: deathMark,
  // Magic talents
  fire_bolt: fireBolt,
  minor_heal: minorHeal,
  frost_nova: frostNova,
  enhanced_fortitude: enhancedFortitude,
  chain_lightning: chainLightning,
  heal_ally: healAlly,
  arcane_blast: arcaneBlast,
  regeneration,
  meteor_strike: meteorStrike,
  // Cross-type talents
  flame_sword: flameSword,
  venomous_strike: venomousStrike,
  rending_slash: rendingSlash,
  flame_arrow: flameArrow,
  barbed_arrow: barbedArrow,
  shadow_arrow: shadowArrow,
  earth_spikes: earthSpikes,
  life_drain: lifeDrain,
  curse,
  enfeeble,
  // General talents
  taunt,
  fortify,
};

export function getActionDefinition(id: string): ActionDefinition | undefined {
  return BASE_ACTION_DEFINITIONS[id];
}
