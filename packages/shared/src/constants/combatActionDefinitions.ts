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

// --- Registry ---

export const BASE_ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  light_attack: lightAttack,
  normal_attack: normalAttack,
  heavy_attack: heavyAttack,
  defend,
  counter,
  ward,
  use_hp_potion: useHpPotion,
  use_stamina_potion: useStaminaPotion,
  use_mana_potion: useManaPotion,
};

export function getActionDefinition(id: string): ActionDefinition | undefined {
  return BASE_ACTION_DEFINITIONS[id];
}
