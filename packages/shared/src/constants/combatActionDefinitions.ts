import type { ActionDefinition } from '../types/combatAction.types';
import { COMBAT_ACTION_CONSTANTS } from './gameConstants';

// --- Offensive Actions (available to all) ---

const lightAttack: ActionDefinition = {
  id: 'light_attack',
  name: 'Light Attack',
  description: 'A quick, light strike. Low cost, low damage.',
  actionType: 'light_attack',
  category: 'offensive',
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
  cost: { stamina: 0, mana: 0 },
  damageReductionPercent: COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION,
};

const counter: ActionDefinition = {
  id: 'counter',
  name: 'Counter',
  description: 'Anticipate a physical attack and avoid it entirely. Wasted against spells.',
  actionType: 'counter',
  category: 'defensive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.COUNTER_STAMINA_COST, mana: 0 },
  avoidsPhysical: true,
};

const ward: ActionDefinition = {
  id: 'ward',
  name: 'Ward',
  description: 'Raise a magical barrier to resist spells. Wasted against physical attacks.',
  actionType: 'ward',
  category: 'defensive',
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
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_POTION_STAMINA, mana: 0 },
  potionType: 'mana',
  isChanneling: true,
};

// --- Melee Talent Actions ---

const powerStrike: ActionDefinition = {
  id: 'power_strike',
  name: 'Power Strike',
  description: 'A focused physical strike dealing 1.3x weapon damage.',
  actionType: 'skill_attack',
  category: 'offensive',
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
  cost: { stamina: COMBAT_ACTION_CONSTANTS.BATTLE_CRY_STAMINA, mana: 0 },
  effect: { name: 'Battle Cry', stat: 'attack', modifier: 15, duration: 4, isDebuff: false },
};

const devastatingBlow: ActionDefinition = {
  id: 'devastating_blow',
  name: 'Devastating Blow',
  description: 'A devastating strike dealing 2.0x weapon damage. Heavy stamina cost.',
  actionType: 'skill_attack',
  category: 'offensive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.DEVASTATING_BLOW_STAMINA, mana: 0 },
  damageMultiplier: 2.0,
  accuracyModifier: 0,
  isChanneling: true,
};

const berserkerRage: ActionDefinition = {
  id: 'berserker_rage',
  name: 'Berserker Rage',
  description: 'Enter a frenzy: +30% attack but -15% defence for 5 rounds.',
  actionType: 'buff',
  category: 'supportive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.BERSERKER_RAGE_STAMINA, mana: 0 },
  effect: { name: 'Berserker Rage', stat: 'attack', modifier: 30, duration: 5, isDebuff: false },
  defenceReduction: 15,
};

const execute: ActionDefinition = {
  id: 'execute',
  name: 'Execute',
  description: 'Finishing strike that deals bonus damage when target is below 30% HP.',
  actionType: 'skill_attack',
  category: 'offensive',
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
  cost: { stamina: COMBAT_ACTION_CONSTANTS.EAGLE_EYE_STAMINA, mana: 0 },
  effect: { name: 'Eagle Eye', stat: 'accuracy', modifier: 30, duration: 3, isDebuff: false },
};

const volley: ActionDefinition = {
  id: 'volley',
  name: 'Volley',
  description: 'A rain of arrows hitting all enemies in raids.',
  actionType: 'skill_attack',
  category: 'offensive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.VOLLEY_STAMINA, mana: 0 },
  damageMultiplier: 0.7,
  accuracyModifier: 0,
};

const snipersMark: ActionDefinition = {
  id: 'snipers_mark',
  name: "Sniper's Mark",
  description: 'Mark a target to take +20% damage for 3 rounds.',
  actionType: 'debuff_spell',
  category: 'supportive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.SNIPERS_MARK_STAMINA, mana: 0 },
  effect: { name: "Sniper's Mark", stat: 'defence', modifier: -20, duration: 3, isDebuff: true },
};

const piercingShot: ActionDefinition = {
  id: 'piercing_shot',
  name: 'Piercing Shot',
  description: 'An armor-piercing shot that ignores 50% of target defence.',
  actionType: 'skill_attack',
  category: 'offensive',
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
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.MINOR_HEAL_MANA },
  healPercent: 0.20,
  isChanneling: true,
};

const frostNova: ActionDefinition = {
  id: 'frost_nova',
  name: 'Frost Nova',
  description: 'Blast of frost dealing magic damage and slowing target for 3 rounds.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.FROST_NOVA_MANA },
  damageMultiplier: 0.9,
  damageType: 'magic',
  effect: { name: 'Frozen', stat: 'speed', modifier: -20, duration: 3, isDebuff: true },
};

const enhancedFortitude: ActionDefinition = {
  id: 'enhanced_fortitude',
  name: 'Enhanced Fortitude',
  description: 'Magical barrier boosting defence for 4 rounds.',
  actionType: 'buff',
  category: 'defensive',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.ENHANCED_FORTITUDE_MANA },
  effect: { name: 'Fortitude', stat: 'defence', modifier: 20, duration: 4, isDebuff: false },
};

const chainLightning: ActionDefinition = {
  id: 'chain_lightning',
  name: 'Chain Lightning',
  description: 'Lightning arcs between enemies in raids.',
  actionType: 'damage_spell',
  category: 'offensive',
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
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.REGENERATION_MANA },
  effect: { name: 'Regeneration', stat: 'hp', modifier: 0, duration: 4, isDebuff: false, healPerRound: 8 },
};

const meteorStrike: ActionDefinition = {
  id: 'meteor_strike',
  name: 'Meteor Strike',
  description: 'Call down a meteor dealing 2.5x magic AoE damage.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.METEOR_STRIKE_MANA },
  damageMultiplier: 2.5,
  damageType: 'magic',
  isChanneling: true,
};

// --- General Talent Actions ---

const taunt: ActionDefinition = {
  id: 'taunt',
  name: 'Taunt',
  description: 'Force a boss to target you for 2 rounds. Raid only.',
  actionType: 'taunt',
  category: 'defensive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.TAUNT_STAMINA, mana: 0 },
  tauntDuration: 2,
};

const fortify: ActionDefinition = {
  id: 'fortify',
  name: 'Fortify',
  description: 'Magical fortification boosting defence and magic defence for 3 rounds.',
  actionType: 'buff',
  category: 'defensive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.FORTIFY_STAMINA, mana: COMBAT_ACTION_CONSTANTS.FORTIFY_MANA },
  effect: { name: 'Fortified', stat: 'defence', modifier: 30, duration: 3, isDebuff: false },
};

// --- Registry ---

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
  // General talents
  taunt,
  fortify,
};

export function getActionDefinition(id: string): ActionDefinition | undefined {
  return BASE_ACTION_DEFINITIONS[id];
}
