import type { ActionDefinition, CombatTemplateSlotData, ActiveEffect, CombatActor } from '@adventure/shared';
import { BASE_ACTION_DEFINITIONS, COMBAT_ACTION_CONSTANTS } from '@adventure/shared';
import { evaluateCondition } from './conditionEvaluator';

// --- Result Types ---

export interface ResolvedAction {
  action: ActionDefinition;
  wasExhausted: boolean;
  /** The other branch's action (else when condition matched, then when it didn't) */
  alternateAction?: ActionDefinition;
}

export interface RoundInteraction {
  attackerAction: ResolvedAction;
  defenderAction: ResolvedAction;
  attackerDamageMultiplier: number;
  defenderDamageMultiplier: number;
  attackerHitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal';
  defenderHitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal';
  attackerDamageReduction: number;
  defenderDamageReduction: number;
}

// --- Helpers ---

export const DEFEND_FALLBACK: ActionDefinition = BASE_ACTION_DEFINITIONS['defend'];

function canAfford(
  action: ActionDefinition,
  currentStamina: number,
  currentMana: number,
): boolean {
  return (
    currentStamina >= action.cost.stamina && currentMana >= action.cost.mana
  );
}

// --- Public API ---

/**
 * Pick the action for a given round from the template slots, evaluating
 * conditions and checking resource costs. Falls back to Defend
 * (wasExhausted = true) when the combatant cannot afford the chosen
 * action or the action ID is unrecognised.
 */
export function resolveAction(
  slots: CombatTemplateSlotData[],
  roundNumber: number,
  currentHp: number,
  maxHp: number,
  currentStamina: number,
  maxStamina: number,
  currentMana: number,
  maxMana: number,
  activeEffects: ActiveEffect[],
  actorKey: CombatActor,
  actionDefinitions: Record<string, ActionDefinition> = BASE_ACTION_DEFINITIONS,
): ResolvedAction {
  const index = (roundNumber - 1) % slots.length;
  const slot = slots[index];

  const conditionMet = evaluateCondition(
    slot.condition, currentHp, maxHp, currentStamina, maxStamina, currentMana, maxMana, activeEffects, actorKey,
  );

  const actionId = conditionMet && slot.thenActionId ? slot.thenActionId : slot.actionId;
  const definition = actionDefinitions[actionId];

  // Resolve the other branch's action (for potion fallback in engine)
  const altId = slot.condition && slot.thenActionId
    ? (conditionMet ? slot.actionId : slot.thenActionId)
    : undefined;
  const altDef = altId ? actionDefinitions[altId] : undefined;
  const alternateAction = altDef && canAfford(altDef, currentStamina, currentMana) ? altDef : undefined;

  if (!definition || !canAfford(definition, currentStamina, currentMana)) {
    return { action: DEFEND_FALLBACK, wasExhausted: true };
  }

  return { action: definition, wasExhausted: false, alternateAction };
}

/**
 * Resolve the RPS interaction between two combatants' chosen actions.
 *
 * Rules applied symmetrically for each side:
 *  - Counter (avoidsPhysical) vs physical offensive → attacker guaranteed miss
 *  - Ward (resistsMagic) vs magic damage → attacker guaranteed miss
 *  - Attacking a channeling target → attacker gets CHANNELING_BONUS_DAMAGE multiplier
 *  - Defend (damageReductionPercent) → defender gets damage reduction
 */
export function resolveInteraction(
  combatantAAction: ResolvedAction,
  combatantBAction: ResolvedAction,
): RoundInteraction {
  const result: RoundInteraction = {
    attackerAction: combatantAAction,
    defenderAction: combatantBAction,
    attackerDamageMultiplier: 1.0,
    defenderDamageMultiplier: 1.0,
    attackerHitOverride: 'normal',
    defenderHitOverride: 'normal',
    attackerDamageReduction: 0,
    defenderDamageReduction: 0,
  };

  const a = combatantAAction.action;
  const b = combatantBAction.action;

  // --- B's defences against A ---

  // Counter: avoids physical offensive actions
  if (
    b.avoidsPhysical &&
    a.category === 'offensive' &&
    a.damageType !== 'magic'
  ) {
    result.attackerHitOverride = 'guaranteed_miss';
  }

  // Ward: resists magic damage
  if (b.resistsMagic && a.damageType === 'magic') {
    result.attackerHitOverride = 'guaranteed_miss';
  }

  // Defend: flat damage reduction
  if (b.damageReductionPercent) {
    result.defenderDamageReduction = b.damageReductionPercent;
  }

  // --- A's defences against B ---

  if (
    a.avoidsPhysical &&
    b.category === 'offensive' &&
    b.damageType !== 'magic'
  ) {
    result.defenderHitOverride = 'guaranteed_miss';
  }

  if (a.resistsMagic && b.damageType === 'magic') {
    result.defenderHitOverride = 'guaranteed_miss';
  }

  if (a.damageReductionPercent) {
    result.attackerDamageReduction = a.damageReductionPercent;
  }

  // --- Channeling vulnerability ---

  // B is channeling and A is offensive → A gets bonus damage
  if (b.isChanneling && a.category === 'offensive') {
    result.attackerDamageMultiplier =
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE;
  }

  // A is channeling and B is offensive → B gets bonus damage
  if (a.isChanneling && b.category === 'offensive') {
    result.defenderDamageMultiplier =
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE;
  }

  return result;
}
