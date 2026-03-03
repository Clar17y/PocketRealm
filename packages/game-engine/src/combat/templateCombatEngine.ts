import type {
  CombatTemplateAction,
  ActionDefinition,
  CombatOutcome,
  CombatLogEntry,
  CombatantStats,
  PotionConsumed,
  CombatOptions,
  ActiveEffect,
  CombatActor,
  ActionEffect,
  CombatAction,
} from '@adventure/shared';
import { COMBAT_ACTION_CONSTANTS, POTION_CONSTANTS } from '@adventure/shared';
import { resolveAction, resolveInteraction, type RoundInteraction } from './actionResolver';
import {
  rollD20,
  rollDamage,
  doesAttackHit,
  isCriticalHit,
  calculateFinalDamage,
  calculateDefenceReduction,
  rollInitiative,
} from './damageCalculator';

const MAX_ROUNDS = 100;

// --- Public Types ---

export interface TemplateCombatant {
  id: string;
  name: string;
  stats: CombatantStats;
  template: CombatTemplateAction[];
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  actionDefinitions: Record<string, ActionDefinition>;
}

export interface TemplateCombatLogEntry extends CombatLogEntry {
  combatantAAction: string;
  combatantBAction: string;
  combatantAStaminaAfter: number;
  combatantBStaminaAfter: number;
  combatantAManaAfter: number;
  combatantBManaAfter: number;
  wasExhausted?: boolean;
  interactionResult?: string;
}

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
}

// --- Internal State ---

interface TemplateCombatState {
  combatantAHp: number;
  combatantAMaxHp: number;
  combatantBHp: number;
  combatantBMaxHp: number;
  combatantAStamina: number;
  combatantAMaxStamina: number;
  combatantAStaminaRegen: number;
  combatantBStamina: number;
  combatantBMaxStamina: number;
  combatantBStaminaRegen: number;
  combatantAMana: number;
  combatantAMaxMana: number;
  combatantAManaRegen: number;
  combatantBMana: number;
  combatantBMaxMana: number;
  combatantBManaRegen: number;
  round: number;
  log: TemplateCombatLogEntry[];
  outcome: CombatOutcome | null;
  activeEffects: ActiveEffect[];
}

// --- Helpers ---

function getHp(state: TemplateCombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAHp : state.combatantBHp;
}

function applyDamage(state: TemplateCombatState, target: CombatActor, damage: number): void {
  if (target === 'combatantA') {
    state.combatantAHp -= damage;
  } else {
    state.combatantBHp -= damage;
  }
}

function applyHeal(state: TemplateCombatState, target: CombatActor, heal: number): number {
  if (target === 'combatantA') {
    const before = state.combatantAHp;
    state.combatantAHp = Math.min(state.combatantAMaxHp, state.combatantAHp + heal);
    return state.combatantAHp - before;
  } else {
    const before = state.combatantBHp;
    state.combatantBHp = Math.min(state.combatantBMaxHp, state.combatantBHp + heal);
    return state.combatantBHp - before;
  }
}

function opponent(actor: CombatActor): CombatActor {
  return actor === 'combatantA' ? 'combatantB' : 'combatantA';
}

function hpSnapshot(state: TemplateCombatState): { combatantAHpAfter: number; combatantBHpAfter: number } {
  return {
    combatantAHpAfter: Math.max(0, state.combatantAHp),
    combatantBHpAfter: Math.max(0, state.combatantBHp),
  };
}

function resourceSnapshot(state: TemplateCombatState) {
  return {
    combatantAStaminaAfter: state.combatantAStamina,
    combatantBStaminaAfter: state.combatantBStamina,
    combatantAManaAfter: state.combatantAMana,
    combatantBManaAfter: state.combatantBMana,
  };
}

function getStamina(state: TemplateCombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAStamina : state.combatantBStamina;
}

function getMana(state: TemplateCombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAMana : state.combatantBMana;
}

function deductStamina(state: TemplateCombatState, actor: CombatActor, amount: number): void {
  if (actor === 'combatantA') {
    state.combatantAStamina = Math.max(0, state.combatantAStamina - amount);
  } else {
    state.combatantBStamina = Math.max(0, state.combatantBStamina - amount);
  }
}

function deductMana(state: TemplateCombatState, actor: CombatActor, amount: number): void {
  if (actor === 'combatantA') {
    state.combatantAMana = Math.max(0, state.combatantAMana - amount);
  } else {
    state.combatantBMana = Math.max(0, state.combatantBMana - amount);
  }
}

function applyResourceRegen(state: TemplateCombatState): void {
  state.combatantAStamina = Math.min(
    state.combatantAMaxStamina,
    state.combatantAStamina + state.combatantAStaminaRegen,
  );
  state.combatantBStamina = Math.min(
    state.combatantBMaxStamina,
    state.combatantBStamina + state.combatantBStaminaRegen,
  );
  state.combatantAMana = Math.min(
    state.combatantAMaxMana,
    state.combatantAMana + state.combatantAManaRegen,
  );
  state.combatantBMana = Math.min(
    state.combatantBMaxMana,
    state.combatantBMana + state.combatantBManaRegen,
  );
}

function getEffectiveStats(
  baseStats: CombatantStats,
  activeEffects: ActiveEffect[],
  target: CombatActor,
): CombatantStats {
  const effective = { ...baseStats };

  for (const effect of activeEffects) {
    if (effect.target !== target) continue;

    switch (effect.stat) {
      case 'attack':
        effective.damageMin += effect.modifier;
        effective.damageMax += effect.modifier;
        break;
      case 'accuracy': effective.accuracy += effect.modifier; break;
      case 'defence': effective.defence += effect.modifier; break;
      case 'magicDefence': effective.magicDefence += effect.modifier; break;
      case 'dodge': effective.dodge += effect.modifier; break;
      case 'evasion': effective.evasion += effect.modifier; break;
      case 'speed': effective.speed += effect.modifier; break;
      case 'critChance': effective.critChance = (effective.critChance ?? 0) + effect.modifier; break;
      case 'damageMin': effective.damageMin += effect.modifier; break;
      case 'damageMax': effective.damageMax += effect.modifier; break;
    }
  }

  effective.defence = Math.max(0, effective.defence);
  effective.magicDefence = Math.max(0, effective.magicDefence);
  effective.dodge = Math.max(0, effective.dodge);
  effective.evasion = Math.max(0, effective.evasion);
  effective.damageMin = Math.max(1, effective.damageMin);
  effective.damageMax = Math.max(effective.damageMin, effective.damageMax);

  return effective;
}

function tickEffects(state: TemplateCombatState): void {
  const remaining: ActiveEffect[] = [];

  for (const effect of state.activeEffects) {
    effect.remainingRounds--;
    if (effect.remainingRounds > 0) {
      remaining.push(effect);
    }
  }

  state.activeEffects = remaining;
}

function hasPotionSickness(state: TemplateCombatState, actor: CombatActor): boolean {
  return state.activeEffects.some(
    (e) => e.target === actor && e.stat === 'potionSickness',
  );
}

function actionToCombatAction(action: ActionDefinition): CombatAction {
  if (action.category === 'offensive') return 'attack';
  if (action.category === 'defensive') return 'defend';
  if (action.actionType === 'use_potion') return 'potion';
  return 'spell';
}

// --- Action Execution ---

function executeOffensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  targetStats: CombatantStats,
  action: ActionDefinition,
  hitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal',
  interactionDamageMultiplier: number,
  damageReduction: number,
  actorName: string,
  targetName: string,
  combatantAAction: string,
  combatantBAction: string,
  wasExhausted: boolean,
  interactionResult: string,
): void {
  // Guaranteed miss (counter/ward blocked the attack)
  if (hitOverride === 'guaranteed_miss') {
    state.log.push({
      round: state.round,
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} avoids ${actorName}'s ${action.name}!`,
      combatantAAction,
      combatantBAction,
      wasExhausted,
      interactionResult,
      ...hpSnapshot(state),
      ...resourceSnapshot(state),
    });
    return;
  }

  const attackRoll = hitOverride === 'guaranteed_hit' ? 20 : rollD20();
  const accuracyBonus = actorStats.accuracy + (action.accuracyModifier ?? 0);
  const hits = hitOverride === 'guaranteed_hit' || doesAttackHit(attackRoll, accuracyBonus, targetStats.dodge, targetStats.evasion);

  if (!hits) {
    state.log.push({
      round: state.round,
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      roll: attackRoll,
      accuracyModifier: accuracyBonus,
      targetDodge: targetStats.dodge,
      targetEvasion: targetStats.evasion,
      message: `${actorName} uses ${action.name} but misses ${targetName}!`,
      combatantAAction,
      combatantBAction,
      wasExhausted,
      interactionResult,
      ...hpSnapshot(state),
      ...resourceSnapshot(state),
    });
    return;
  }

  // Determine damage type — use action override or fall back to combatant stats
  const damageType = action.damageType ?? actorStats.damageType;
  const effectiveDefence = damageType === 'magic' ? targetStats.magicDefence : targetStats.defence;

  // Roll and apply damage multiplier from action
  let rawDamage = rollDamage(actorStats.damageMin, actorStats.damageMax);
  const actionMultiplier = action.damageMultiplier ?? 1.0;
  rawDamage = Math.floor(rawDamage * actionMultiplier * interactionDamageMultiplier);

  const crit = isCriticalHit(actorStats.critChance ?? 0);
  const { damage: damageAfterDefence, actualMultiplier } = calculateFinalDamage(
    rawDamage,
    effectiveDefence,
    crit,
    actorStats.critDamage ?? 0,
  );

  // Apply defend's damage reduction (percentage)
  let finalDamage = damageAfterDefence;
  if (damageReduction > 0) {
    finalDamage = Math.max(1, Math.floor(finalDamage * (1 - damageReduction)));
  }

  applyDamage(state, opponent(actorKey), finalDamage);

  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));
  const critText = crit ? ' CRITICAL HIT!' : '';

  state.log.push({
    round: state.round,
    actor: actorKey,
    actorName,
    action: actionToCombatAction(action),
    roll: attackRoll,
    damage: finalDamage,
    rawDamage,
    isCritical: crit,
    ...(crit ? { critMultiplier: actualMultiplier } : {}),
    accuracyModifier: accuracyBonus,
    targetDodge: targetStats.dodge,
    targetEvasion: targetStats.evasion,
    targetDefence: damageType === 'magic' ? undefined : targetStats.defence,
    targetMagicDefence: damageType === 'magic' ? targetStats.magicDefence : undefined,
    armorReduction: damageType === 'magic' ? undefined : armorReduction,
    magicDefenceReduction: damageType === 'magic' ? armorReduction : undefined,
    message: `${actorName} uses ${action.name} on ${targetName} for ${finalDamage} damage!${critText}`,
    combatantAAction,
    combatantBAction,
    wasExhausted,
    interactionResult,
    ...hpSnapshot(state),
    ...resourceSnapshot(state),
  });

  // Check for kill
  if (getHp(state, opponent(actorKey)) <= 0) {
    state.outcome = actorKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push({
      round: state.round,
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} falls defeated!`,
      combatantAAction,
      combatantBAction,
      ...hpSnapshot(state),
      ...resourceSnapshot(state),
    });
  }
}

function executeSupportiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  action: ActionDefinition,
  actorName: string,
  combatantAAction: string,
  combatantBAction: string,
  wasExhausted: boolean,
  interactionResult: string,
  availablePotions: import('@adventure/shared').CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  // Potion use
  if (action.actionType === 'use_potion') {
    executePotionAction(
      state, actorKey, action, actorName,
      combatantAAction, combatantBAction, wasExhausted, interactionResult,
      availablePotions, potionsConsumed,
    );
    return;
  }

  // Buff or heal
  let healAmount = 0;
  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  // Apply heal
  if (action.healFlat || action.healPercent) {
    const maxHp = actorKey === 'combatantA' ? state.combatantAMaxHp : state.combatantBMaxHp;
    const flatHeal = action.healFlat ?? 0;
    const percentHeal = Math.floor((action.healPercent ?? 0) * maxHp);
    healAmount = applyHeal(state, actorKey, flatHeal + percentHeal);
  }

  // Apply buff/debuff effect (enforce MAX_ACTIVE_BUFFS for non-debuff effects)
  if (action.effect) {
    const effect = action.effect;
    const target = effect.isDebuff ? opponent(actorKey) : actorKey;

    if (!effect.isDebuff) {
      const activeBufCount = state.activeEffects.filter(
        (e) => e.target === actorKey && e.stat !== 'potionSickness' && e.modifier >= 0,
      ).length;
      if (activeBufCount >= COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS) {
        // At buff cap — skip applying the new buff
      } else {
        state.activeEffects.push({
          name: effect.name,
          target,
          stat: effect.stat,
          modifier: effect.modifier,
          remainingRounds: effect.duration,
        });
        appliedEffects.push({
          stat: effect.stat,
          modifier: effect.modifier,
          duration: effect.duration,
          target,
        });
      }
    } else {
      // Debuffs are always applied (no cap)
      state.activeEffects.push({
        name: effect.name,
        target,
        stat: effect.stat,
        modifier: effect.modifier,
        remainingRounds: effect.duration,
      });
      appliedEffects.push({
        stat: effect.stat,
        modifier: effect.modifier,
        duration: effect.duration,
        target,
      });
    }
  }

  const parts: string[] = [];
  if (healAmount > 0) {
    parts.push(`+${healAmount} HP`);
  }
  if (appliedEffects.length > 0) {
    const desc = appliedEffects.map(
      (e) => `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier} (${e.duration} rds)`,
    ).join(', ');
    parts.push(desc);
  }

  const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';

  state.log.push({
    round: state.round,
    actor: actorKey,
    actorName,
    action: 'spell',
    spellName: action.name,
    healAmount: healAmount > 0 ? healAmount : undefined,
    effectsApplied: appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name}!${detail}`,
    combatantAAction,
    combatantBAction,
    wasExhausted,
    interactionResult,
    ...hpSnapshot(state),
    ...resourceSnapshot(state),
  });
}

function getMaxStamina(state: TemplateCombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAMaxStamina : state.combatantBMaxStamina;
}

function getMaxMana(state: TemplateCombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAMaxMana : state.combatantBMaxMana;
}

function setStamina(state: TemplateCombatState, actor: CombatActor, value: number): void {
  if (actor === 'combatantA') {
    state.combatantAStamina = value;
  } else {
    state.combatantBStamina = value;
  }
}

function setMana(state: TemplateCombatState, actor: CombatActor, value: number): void {
  if (actor === 'combatantA') {
    state.combatantAMana = value;
  } else {
    state.combatantBMana = value;
  }
}

function executePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  combatantAAction: string,
  combatantBAction: string,
  wasExhausted: boolean,
  interactionResult: string,
  availablePotions: import('@adventure/shared').CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  const potionType = action.potionType ?? 'hp';

  // Check potion sickness
  if (hasPotionSickness(state, actorKey)) {
    state.log.push({
      round: state.round,
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
      combatantAAction,
      combatantBAction,
      wasExhausted,
      interactionResult,
      ...hpSnapshot(state),
      ...resourceSnapshot(state),
    });
    return;
  }

  // Find a matching potion by type
  const potionIndex = availablePotions.findIndex(p => p.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push({
      round: state.round,
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but has none left!`,
      combatantAAction,
      combatantBAction,
      wasExhausted,
      interactionResult,
      ...hpSnapshot(state),
      ...resourceSnapshot(state),
    });
    return;
  }

  const potion = availablePotions[potionIndex];
  let actualRestore = 0;
  let resourceLabel: string;

  if (potionType === 'hp') {
    const hpBefore = getHp(state, actorKey);
    const maxHp = actorKey === 'combatantA' ? state.combatantAMaxHp : state.combatantBMaxHp;
    if (actorKey === 'combatantA') {
      state.combatantAHp = Math.min(maxHp, state.combatantAHp + potion.healAmount);
    } else {
      state.combatantBHp = Math.min(maxHp, state.combatantBHp + potion.healAmount);
    }
    actualRestore = getHp(state, actorKey) - hpBefore;
    resourceLabel = 'HP';
  } else if (potionType === 'stamina') {
    const before = getStamina(state, actorKey);
    const maxStam = getMaxStamina(state, actorKey);
    const newStam = Math.min(before + potion.healAmount, maxStam);
    setStamina(state, actorKey, newStam);
    actualRestore = newStam - before;
    resourceLabel = 'Stamina';
  } else {
    const before = getMana(state, actorKey);
    const maxM = getMaxMana(state, actorKey);
    const newMana = Math.min(before + potion.healAmount, maxM);
    setMana(state, actorKey, newMana);
    actualRestore = newMana - before;
    resourceLabel = 'Mana';
  }

  // Remove from pool
  availablePotions.splice(potionIndex, 1);

  // Record consumption
  potionsConsumed.push({
    templateId: potion.templateId,
    name: potion.name,
    healAmount: actualRestore,
    round: state.round,
  });

  // Apply potion sickness (shared across all potion types)
  const sicknessEffect: ActiveEffect = {
    name: 'Potion Sickness',
    target: actorKey,
    stat: 'potionSickness',
    modifier: 0,
    remainingRounds: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
  };
  state.activeEffects.push(sicknessEffect);

  state.log.push({
    round: state.round,
    actor: actorKey,
    actorName,
    action: 'potion',
    spellName: potion.name,
    healAmount: actualRestore,
    effectsApplied: [{
      stat: 'potionSickness',
      modifier: 0,
      duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      target: actorKey,
    }],
    message: `${actorName} drinks a ${potion.name}! +${actualRestore} ${resourceLabel}`,
    combatantAAction,
    combatantBAction,
    wasExhausted,
    interactionResult,
    ...hpSnapshot(state),
    ...resourceSnapshot(state),
  });
}

function executeDefensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  combatantAAction: string,
  combatantBAction: string,
  wasExhausted: boolean,
  interactionResult: string,
): void {
  // Defensive actions are passive — they modify the interaction result,
  // which is already factored into the opponent's attack execution.
  // Just log the defensive stance.
  state.log.push({
    round: state.round,
    actor: actorKey,
    actorName,
    action: 'defend',
    message: `${actorName} uses ${action.name}!`,
    combatantAAction,
    combatantBAction,
    wasExhausted,
    interactionResult,
    ...hpSnapshot(state),
    ...resourceSnapshot(state),
  });
}

// --- Main Engine ---

export function runTemplateCombat(
  combatantA: TemplateCombatant,
  combatantB: TemplateCombatant,
  options?: CombatOptions,
): TemplateCombatResult {
  const availablePotions = options?.potions ? [...options.potions] : [];
  const potionsConsumed: PotionConsumed[] = [];

  const state: TemplateCombatState = {
    combatantAHp: combatantA.stats.hp,
    combatantAMaxHp: combatantA.stats.maxHp,
    combatantBHp: combatantB.stats.hp,
    combatantBMaxHp: combatantB.stats.maxHp,
    combatantAStamina: combatantA.stamina,
    combatantAMaxStamina: combatantA.maxStamina,
    combatantAStaminaRegen: combatantA.staminaRegenPerRound,
    combatantBStamina: combatantB.stamina,
    combatantBMaxStamina: combatantB.maxStamina,
    combatantBStaminaRegen: combatantB.staminaRegenPerRound,
    combatantAMana: combatantA.mana,
    combatantAMaxMana: combatantA.maxMana,
    combatantAManaRegen: combatantA.manaRegenPerRound,
    combatantBMana: combatantB.mana,
    combatantBMaxMana: combatantB.maxMana,
    combatantBManaRegen: combatantB.manaRegenPerRound,
    round: 0,
    log: [],
    outcome: null,
    activeEffects: [],
  };

  // Roll initiative
  const initA = rollInitiative(combatantA.stats.speed);
  const initB = rollInitiative(combatantB.stats.speed);
  const aGoesFirst = initA >= initB;

  // Main combat loop
  while (state.round < MAX_ROUNDS && state.outcome === null) {
    state.round++;

    // Resource regen at the start of each round (skip round 1)
    if (state.round > 1) {
      applyResourceRegen(state);
    }

    // Resolve actions for both combatants
    const resolvedA = resolveAction(
      combatantA.template,
      state.round,
      getStamina(state, 'combatantA'),
      getMana(state, 'combatantA'),
      combatantA.actionDefinitions,
    );
    const resolvedB = resolveAction(
      combatantB.template,
      state.round,
      getStamina(state, 'combatantB'),
      getMana(state, 'combatantB'),
      combatantB.actionDefinitions,
    );

    // Resolve RPS interaction
    const interaction = resolveInteraction(resolvedA, resolvedB);

    // Get effective stats with active buffs/debuffs applied
    const effectiveA = getEffectiveStats(combatantA.stats, state.activeEffects, 'combatantA');
    const effectiveB = getEffectiveStats(combatantB.stats, state.activeEffects, 'combatantB');

    const combatantAAction = resolvedA.action.id;
    const combatantBAction = resolvedB.action.id;
    const interactionResult = describeInteraction(interaction);

    // Execute actions in initiative order
    if (aGoesFirst) {
      executeAction(
        state, 'combatantA', effectiveA, effectiveB,
        resolvedA.action, interaction, true,
        combatantA.name, combatantB.name,
        combatantAAction, combatantBAction,
        resolvedA.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
      );
      if (state.outcome) break;
      executeAction(
        state, 'combatantB', effectiveB, effectiveA,
        resolvedB.action, interaction, false,
        combatantB.name, combatantA.name,
        combatantAAction, combatantBAction,
        resolvedB.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
      );
    } else {
      executeAction(
        state, 'combatantB', effectiveB, effectiveA,
        resolvedB.action, interaction, false,
        combatantB.name, combatantA.name,
        combatantAAction, combatantBAction,
        resolvedB.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
      );
      if (state.outcome) break;
      executeAction(
        state, 'combatantA', effectiveA, effectiveB,
        resolvedA.action, interaction, true,
        combatantA.name, combatantB.name,
        combatantAAction, combatantBAction,
        resolvedA.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
      );
    }

    if (state.outcome) break;

    // Deduct action costs AFTER both actions resolve
    deductStamina(state, 'combatantA', resolvedA.action.cost.stamina);
    deductMana(state, 'combatantA', resolvedA.action.cost.mana);
    deductStamina(state, 'combatantB', resolvedB.action.cost.stamina);
    deductMana(state, 'combatantB', resolvedB.action.cost.mana);

    // Tick effects (decrement duration, remove expired)
    tickEffects(state);
  }

  // Handle draw / timeout
  if (state.outcome === null) {
    const bothAlive = state.combatantAHp > 0 && state.combatantBHp > 0;
    state.outcome = bothAlive ? 'draw' : 'defeat';
  }

  return {
    outcome: state.outcome,
    log: state.log,
    combatantAMaxHp: state.combatantAMaxHp,
    combatantBMaxHp: state.combatantBMaxHp,
    combatantAHpRemaining: Math.max(0, state.combatantAHp),
    combatantBHpRemaining: Math.max(0, state.combatantBHp),
    combatantAMaxStamina: state.combatantAMaxStamina,
    combatantBMaxStamina: state.combatantBMaxStamina,
    combatantAStaminaRemaining: state.combatantAStamina,
    combatantBStaminaRemaining: state.combatantBStamina,
    combatantAMaxMana: state.combatantAMaxMana,
    combatantBMaxMana: state.combatantBMaxMana,
    combatantAManaRemaining: state.combatantAMana,
    combatantBManaRemaining: state.combatantBMana,
    potionsConsumed,
    totalRounds: state.round,
  };
}

// Dispatch a single combatant's action
function executeAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  targetStats: CombatantStats,
  action: ActionDefinition,
  interaction: RoundInteraction,
  isAttacker: boolean,
  actorName: string,
  targetName: string,
  combatantAAction: string,
  combatantBAction: string,
  wasExhausted: boolean,
  interactionResult: string,
  availablePotions: import('@adventure/shared').CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  // Determine hit override, damage multiplier, and damage reduction for this actor
  const hitOverride = isAttacker ? interaction.attackerHitOverride : interaction.defenderHitOverride;
  const interactionDmgMult = isAttacker ? interaction.attackerDamageMultiplier : interaction.defenderDamageMultiplier;
  // Damage reduction applies when this actor is being attacked (the opponent's reduction on us)
  // But actually: attackerDamageReduction = A's defend reduction (A takes less damage)
  // When A is executing their offensive action against B, B's defenderDamageReduction applies
  const dmgReduction = isAttacker ? interaction.defenderDamageReduction : interaction.attackerDamageReduction;

  if (action.category === 'offensive') {
    executeOffensiveAction(
      state, actorKey, actorStats, targetStats, action,
      hitOverride, interactionDmgMult, dmgReduction,
      actorName, targetName,
      combatantAAction, combatantBAction,
      wasExhausted, interactionResult,
    );
  } else if (action.category === 'supportive') {
    executeSupportiveAction(
      state, actorKey, actorStats, action,
      actorName, combatantAAction, combatantBAction,
      wasExhausted, interactionResult,
      availablePotions, potionsConsumed,
    );
  } else {
    executeDefensiveAction(
      state, actorKey, action, actorName,
      combatantAAction, combatantBAction,
      wasExhausted, interactionResult,
    );
  }
}

function describeInteraction(interaction: RoundInteraction): string {
  const parts: string[] = [];
  if (interaction.attackerHitOverride === 'guaranteed_miss') parts.push('A blocked');
  if (interaction.defenderHitOverride === 'guaranteed_miss') parts.push('B blocked');
  if (interaction.attackerDamageMultiplier > 1) parts.push('A channeling bonus');
  if (interaction.defenderDamageMultiplier > 1) parts.push('B channeling bonus');
  if (interaction.attackerDamageReduction > 0) parts.push('A defending');
  if (interaction.defenderDamageReduction > 0) parts.push('B defending');
  return parts.length > 0 ? parts.join(', ') : 'normal';
}
