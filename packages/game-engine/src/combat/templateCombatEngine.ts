import type {
  CombatOutcome,
  PotionConsumed,
  CombatOptions,
} from '@pocketrealm/shared';
import { resolveAction, resolveInteraction, DEFEND_FALLBACK, type ResolvedAction } from './actionResolver';
import { rollInitiative } from './damageCalculator';
import {
  MAX_ROUNDS,
  buildLogEntry,
  type RoundContext,
  type TemplateCombatState,
  type TemplateCombatLogEntry,
  type TemplateCombatant,
} from './templateCombatTypes';
import { getEffectiveStats, tickEffects, applyEffectTicks } from './templateEffects';
import { executeAction, describeInteraction, canUsePotionAction } from './templateActions';

// --- Public Types (re-exported from sub-modules) ---

export type { TemplateCombatant } from './templateCombatTypes';
export type { TemplateCombatLogEntry } from './templateCombatTypes';

export interface TemplateCombatResult {
  outcome: CombatOutcome;
  log: TemplateCombatLogEntry[];
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  combatantAHpRemaining: number;
  combatantBHpRemaining: number;
  combatantAMaxStamina: number;
  combatantBMaxStamina: number;
  combatantAStaminaRemaining: number;
  combatantBStaminaRemaining: number;
  combatantAMaxMana: number;
  combatantBMaxMana: number;
  combatantAManaRemaining: number;
  combatantBManaRemaining: number;
  potionsConsumed: PotionConsumed[];
  totalRounds: number;
  /** Damage dealt by combatantA grouped by resolved scaling stat. */
  damageByScalingStat: { melee: number; ranged: number; magic: number };
  /** Resource cost (stamina + mana) spent by combatantA grouped by resolved scaling stat. */
  resourceCostByScalingStat: { melee: number; ranged: number; magic: number };
}

// --- Re-exports for consumers ---

export { isStatDebuff, isMagicDot } from './templateEffects';
export type { CombatantState, TemplateCombatState, RoundContext } from './templateCombatTypes';

// --- Main Engine ---

function buildRoundContext(
  resolvedAction: ResolvedAction,
  combatantAAction: string,
  combatantBAction: string,
  interactionResult: string,
): RoundContext {
  return {
    combatantAAction,
    combatantBAction,
    wasExhausted: resolvedAction.wasExhausted,
    interactionResult,
    forcedActionReason: resolvedAction.forcedActionReason,
  };
}

export function runTemplateCombat(
  combatantA: TemplateCombatant,
  combatantB: TemplateCombatant,
  options?: CombatOptions,
): TemplateCombatResult {
  const combatMode = options?.combatMode ?? 'pve_open_world';
  const availablePotions = options?.potions ? [...options.potions] : [];
  const potionsConsumed: PotionConsumed[] = [];

  const state: TemplateCombatState = {
    combatants: {
      combatantA: {
        hp: combatantA.stats.hp,
        maxHp: combatantA.stats.maxHp,
        stamina: combatantA.stamina,
        maxStamina: combatantA.maxStamina,
        staminaRegen: combatantA.staminaRegenPerRound,
        mana: combatantA.mana,
        maxMana: combatantA.maxMana,
        manaRegen: combatantA.manaRegenPerRound,
      },
      combatantB: {
        hp: combatantB.stats.hp,
        maxHp: combatantB.stats.maxHp,
        stamina: combatantB.stamina,
        maxStamina: combatantB.maxStamina,
        staminaRegen: combatantB.staminaRegenPerRound,
        mana: combatantB.mana,
        maxMana: combatantB.maxMana,
        manaRegen: combatantB.manaRegenPerRound,
      },
    },
    round: 0,
    log: [],
    outcome: null,
    activeEffects: [],
    damageByScalingStat: { melee: 0, ranged: 0, magic: 0 },
    resourceCostByScalingStat: { melee: 0, ranged: 0, magic: 0 },
  };

  // Roll initiative
  const initA = rollInitiative(combatantA.stats.speed);
  const initB = rollInitiative(combatantB.stats.speed);
  const aGoesFirst = initA >= initB;

  // Main combat loop
  while (state.round < MAX_ROUNDS && state.outcome === null) {
    state.round++;
    const cA = state.combatants.combatantA;
    const cB = state.combatants.combatantB;

    // Resource regen at the start of each round (skip round 1)
    if (state.round > 1) {
      const beforeA = { stamina: cA.stamina, mana: cA.mana };
      const beforeB = { stamina: cB.stamina, mana: cB.mana };

      cA.stamina = Math.min(cA.maxStamina, cA.stamina + cA.staminaRegen);
      cB.stamina = Math.min(cB.maxStamina, cB.stamina + cB.staminaRegen);
      cA.mana = Math.min(cA.maxMana, cA.mana + cA.manaRegen);
      cB.mana = Math.min(cB.maxMana, cB.mana + cB.manaRegen);

      const aChanged = cA.stamina !== beforeA.stamina || cA.mana !== beforeA.mana;
      const bChanged = cB.stamina !== beforeB.stamina || cB.mana !== beforeB.mana;
      if (aChanged || bChanged) {
        state.log.push(buildLogEntry(state, null, {
          actor: 'combatantA',
          actorName: combatantA.name,
          action: 'regen',
          message: 'Resources regenerate.',
        }));
      }
    }

    // Resolve actions for both combatants
    let resolvedA = resolveAction(
      combatantA.template,
      state.round,
      cA.hp, cA.maxHp,
      cA.stamina, cA.maxStamina,
      cA.mana, cA.maxMana,
      state.activeEffects,
      'combatantA',
      combatantA.actionDefinitions,
    );
    let resolvedB = resolveAction(
      combatantB.template,
      state.round,
      cB.hp, cB.maxHp,
      cB.stamina, cB.maxStamina,
      cB.mana, cB.maxMana,
      state.activeEffects,
      'combatantB',
      combatantB.actionDefinitions,
    );

    // When a potion action can't fire (sick, empty, or no valid target), try the other branch first, then Defend
    if (resolvedA.action.potionType) {
      if (!canUsePotionAction(state, 'combatantA', resolvedA.action, availablePotions)) {
        resolvedA = resolvedA.alternateAction
          ? { action: resolvedA.alternateAction, wasExhausted: false }
          : { action: DEFEND_FALLBACK, wasExhausted: true };
      }
    }
    if (resolvedB.action.potionType) {
      if (!canUsePotionAction(state, 'combatantB', resolvedB.action, availablePotions)) {
        resolvedB = resolvedB.alternateAction
          ? { action: resolvedB.alternateAction, wasExhausted: false }
          : { action: DEFEND_FALLBACK, wasExhausted: true };
      }
    }

    // Resolve RPS interaction
    const interaction = resolveInteraction(resolvedA, resolvedB);

    // Get effective stats with active buffs/debuffs applied
    const effectiveA = getEffectiveStats(combatantA.stats, state.activeEffects, 'combatantA');
    const effectiveB = getEffectiveStats(combatantB.stats, state.activeEffects, 'combatantB');

    const combatantAAction = resolvedA.action.id;
    const combatantBAction = resolvedB.action.id;
    const interactionResult = describeInteraction(interaction);

    // Execute actions in initiative order.
    // Deduct each combatant's resource cost immediately before their action
    // so the log entry snapshot reflects the cost at the right moment.
    if (aGoesFirst) {
      cA.stamina = Math.max(0, cA.stamina - resolvedA.action.cost.stamina);
      cA.mana = Math.max(0, cA.mana - resolvedA.action.cost.mana);
      executeAction(
        state, 'combatantA', effectiveA, effectiveB,
        resolvedA.action, interaction, true,
        combatantA.name, combatantB.name,
        buildRoundContext(resolvedA, combatantAAction, combatantBAction, interactionResult),
        combatMode,
        availablePotions, potionsConsumed,
        combatantA.perActionScaling,
      );
      cB.stamina = Math.max(0, cB.stamina - resolvedB.action.cost.stamina);
      cB.mana = Math.max(0, cB.mana - resolvedB.action.cost.mana);
      if (state.outcome) break;
      executeAction(
        state, 'combatantB', effectiveB, effectiveA,
        resolvedB.action, interaction, false,
        combatantB.name, combatantA.name,
        buildRoundContext(resolvedB, combatantAAction, combatantBAction, interactionResult),
        combatMode,
        availablePotions, potionsConsumed,
        combatantB.perActionScaling,
      );
    } else {
      cB.stamina = Math.max(0, cB.stamina - resolvedB.action.cost.stamina);
      cB.mana = Math.max(0, cB.mana - resolvedB.action.cost.mana);
      executeAction(
        state, 'combatantB', effectiveB, effectiveA,
        resolvedB.action, interaction, false,
        combatantB.name, combatantA.name,
        buildRoundContext(resolvedB, combatantAAction, combatantBAction, interactionResult),
        combatMode,
        availablePotions, potionsConsumed,
        combatantB.perActionScaling,
      );
      cA.stamina = Math.max(0, cA.stamina - resolvedA.action.cost.stamina);
      cA.mana = Math.max(0, cA.mana - resolvedA.action.cost.mana);
      if (state.outcome) break;
      executeAction(
        state, 'combatantA', effectiveA, effectiveB,
        resolvedA.action, interaction, true,
        combatantA.name, combatantB.name,
        buildRoundContext(resolvedA, combatantAAction, combatantBAction, interactionResult),
        combatMode,
        availablePotions, potionsConsumed,
        combatantA.perActionScaling,
      );
    }

    if (state.outcome) break;

    // Apply DOT/HOT ticks
    applyEffectTicks(state, combatantA, combatantB);

    // Check for DOT death
    if (cA.hp <= 0 || cB.hp <= 0) {
      if (cA.hp <= 0 && cB.hp <= 0) {
        state.outcome = 'draw';
      } else if (cA.hp <= 0) {
        state.outcome = 'defeat';
      } else {
        state.outcome = 'victory';
      }
      break;
    }

    // Tick effects (decrement duration, remove expired)
    tickEffects(state);
  }

  // Handle draw / timeout
  if (state.outcome === null) {
    const a = state.combatants.combatantA;
    const b = state.combatants.combatantB;
    const bothAlive = a.hp > 0 && b.hp > 0;
    state.outcome = bothAlive ? 'draw' : 'defeat';
  }

  const a = state.combatants.combatantA;
  const b = state.combatants.combatantB;

  return {
    outcome: state.outcome,
    log: state.log,
    combatantAMaxHp: a.maxHp,
    combatantBMaxHp: b.maxHp,
    combatantAHpRemaining: Math.max(0, a.hp),
    combatantBHpRemaining: Math.max(0, b.hp),
    combatantAMaxStamina: a.maxStamina,
    combatantBMaxStamina: b.maxStamina,
    combatantAStaminaRemaining: a.stamina,
    combatantBStaminaRemaining: b.stamina,
    combatantAMaxMana: a.maxMana,
    combatantBMaxMana: b.maxMana,
    combatantAManaRemaining: a.mana,
    combatantBManaRemaining: b.mana,
    potionsConsumed,
    totalRounds: state.round,
    damageByScalingStat: { ...state.damageByScalingStat },
    resourceCostByScalingStat: { ...state.resourceCostByScalingStat },
  };
}
