import type {
  CombatTemplateSlotData,
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
  PerActionScaling,
} from '@adventure/shared';
import { COMBAT_ACTION_CONSTANTS, COMBAT_CONSTANTS, POTION_CONSTANTS } from '@adventure/shared';
import { resolveAction, resolveInteraction, DEFEND_FALLBACK, type RoundInteraction } from './actionResolver';
import {
  rollD20,
  rollDamage,
  doesAttackHit,
  isCriticalHit,
  calculateFinalDamage,
  calculateDefenceReduction,
  rollInitiative,
  resolveActionDamageStats,
} from './damageCalculator';

const MAX_ROUNDS = 100;

// --- Public Types ---

export interface TemplateCombatant {
  id: string;
  name: string;
  stats: CombatantStats;
  template: CombatTemplateSlotData[];
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  actionDefinitions: Record<string, ActionDefinition>;
  /** Per-action scaling data -- present for players, absent for mobs */
  perActionScaling?: PerActionScaling;
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
  tickType?: 'dot_tick' | 'hot_tick';
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

function applyEffectTicks(
  state: TemplateCombatState,
  combatantA: TemplateCombatant,
  combatantB: TemplateCombatant,
): void {
  for (const effect of state.activeEffects) {
    // DOT tick
    if (effect.resolvedDamagePerRound && effect.resolvedDamagePerRound > 0) {
      const targetKey = effect.target;
      const target = targetKey === 'combatantA' ? combatantA : combatantB;
      const effectiveStats = getEffectiveStats(target.stats, state.activeEffects, targetKey);
      const defence = effect.dotDamageType === 'physical'
        ? effectiveStats.defence
        : effectiveStats.magicDefence;
      const reduction = calculateDefenceReduction(defence);
      const tickDamage = Math.max(
        COMBAT_CONSTANTS.MIN_DAMAGE,
        Math.floor(effect.resolvedDamagePerRound * (1 - reduction)),
      );

      applyDamage(state, targetKey, tickDamage);

      state.log.push({
        round: state.round,
        actor: targetKey === 'combatantA' ? 'combatantB' : 'combatantA',
        actorName: targetKey === 'combatantA' ? combatantB.name : combatantA.name,
        action: 'spell',
        spellName: effect.name,
        damage: tickDamage,
        message: `${effect.name} deals ${tickDamage} ${effect.dotDamageType ?? 'magic'} damage to ${target.name}`,
        tickType: 'dot_tick',
        combatantAAction: '',
        combatantBAction: '',
        ...hpSnapshot(state),
        ...resourceSnapshot(state),
      });
    }

    // HOT tick
    if (effect.resolvedHealPerRound && effect.resolvedHealPerRound > 0) {
      const targetKey = effect.target;
      const target = targetKey === 'combatantA' ? combatantA : combatantB;
      const currentHp = getHp(state, targetKey);
      const maxHeal = target.stats.maxHp - currentHp;
      const actualHeal = Math.min(effect.resolvedHealPerRound, maxHeal);

      if (actualHeal > 0) {
        applyHeal(state, targetKey, actualHeal);
        state.log.push({
          round: state.round,
          actor: targetKey,
          actorName: target.name,
          action: 'spell',
          spellName: effect.name,
          healAmount: actualHeal,
          message: `${effect.name} heals ${target.name} for ${actualHeal} HP`,
          tickType: 'hot_tick',
          combatantAAction: '',
          combatantBAction: '',
          ...hpSnapshot(state),
          ...resourceSnapshot(state),
        });
      }
    }
  }
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

function snapshotEffectValues(
  effect: ActionEffect,
  damageForPercentCalc?: number,
): Pick<ActiveEffect, 'resolvedDamagePerRound' | 'dotDamageType' | 'resolvedHealPerRound'> {
  const snapshot: Pick<ActiveEffect, 'resolvedDamagePerRound' | 'dotDamageType' | 'resolvedHealPerRound'> = {};

  if (effect.damagePerRound || effect.damagePerRoundPercent) {
    const dotFlat = effect.damagePerRound ?? 0;
    const dotPercent = damageForPercentCalc
      ? Math.floor(damageForPercentCalc * (effect.damagePerRoundPercent ?? 0) / 100)
      : 0;
    snapshot.resolvedDamagePerRound = dotFlat + dotPercent;
    snapshot.dotDamageType = effect.dotDamageType ?? 'magic';
  }

  if (effect.healPerRound) {
    snapshot.resolvedHealPerRound = effect.healPerRound;
  }

  return snapshot;
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
  perActionScaling?: PerActionScaling,
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

  // Resolve per-action damage stats when scaling data is available (players),
  // otherwise fall back to pre-computed combatant stats (mobs).
  let baseDamageMin = actorStats.damageMin;
  let baseDamageMax = actorStats.damageMax;
  let baseAccuracy = actorStats.accuracy;

  if (perActionScaling) {
    const actionStats = resolveActionDamageStats(
      action.scalingStat ?? 'weapon',
      perActionScaling,
    );
    baseDamageMin = actionStats.damageMin;
    baseDamageMax = actionStats.damageMax;
    baseAccuracy = actionStats.accuracy;

    // Re-apply buff/debuff modifiers from active effects (these were lost
    // when per-action stats replaced the pre-computed effective stats)
    for (const effect of state.activeEffects) {
      if (effect.target !== actorKey) continue;
      if (effect.stat === 'attack') { baseDamageMin += effect.modifier; baseDamageMax += effect.modifier; }
      if (effect.stat === 'accuracy') baseAccuracy += effect.modifier;
      if (effect.stat === 'damageMin') baseDamageMin += effect.modifier;
      if (effect.stat === 'damageMax') baseDamageMax += effect.modifier;
    }
    baseDamageMin = Math.max(1, baseDamageMin);
    baseDamageMax = Math.max(baseDamageMin, baseDamageMax);
  }

  const attackRoll = hitOverride === 'guaranteed_hit' ? 20 : rollD20();
  const accuracyBonus = baseAccuracy + (action.accuracyModifier ?? 0);
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

  // Determine damage type from the action, falling back to combatant stats
  const actionDamageType = action.damageType ?? actorStats.damageType;
  const effectiveDefence = actionDamageType === 'magic' ? targetStats.magicDefence : targetStats.defence;

  // Roll and apply damage multiplier from action
  let rawDamage = rollDamage(baseDamageMin, baseDamageMax);
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

  // Life leech -- heal attacker for % of damage dealt
  let leechHeal = 0;
  if (action.lifeLeechPercent && action.lifeLeechPercent > 0 && finalDamage > 0) {
    const rawLeech = Math.floor(finalDamage * action.lifeLeechPercent / 100);
    if (rawLeech > 0) {
      leechHeal = applyHeal(state, actorKey, rawLeech);
    }
  }

  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));
  const critText = crit ? ' CRITICAL HIT!' : '';
  const leechText = leechHeal > 0 ? ` Leeches ${leechHeal} HP!` : '';

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
    ...(leechHeal > 0 ? { leechHeal } : {}),
    accuracyModifier: accuracyBonus,
    targetDodge: targetStats.dodge,
    targetEvasion: targetStats.evasion,
    targetDefence: actionDamageType === 'magic' ? undefined : targetStats.defence,
    targetMagicDefence: actionDamageType === 'magic' ? targetStats.magicDefence : undefined,
    armorReduction: actionDamageType === 'magic' ? undefined : armorReduction,
    magicDefenceReduction: actionDamageType === 'magic' ? armorReduction : undefined,
    message: `${actorName} uses ${action.name} on ${targetName} for ${finalDamage} damage!${critText}${leechText}`,
    combatantAAction,
    combatantBAction,
    wasExhausted,
    interactionResult,
    ...hpSnapshot(state),
    ...resourceSnapshot(state),
  });

  // Apply effect (DOT debuff on the target)
  if (action.effect) {
    const effect = action.effect;
    const targetKey = effect.isDebuff !== false ? opponent(actorKey) : actorKey;

    const newEffect: ActiveEffect = {
      name: effect.name,
      target: targetKey,
      stat: effect.stat,
      modifier: effect.modifier,
      remainingRounds: effect.duration,
    };

    Object.assign(newEffect, snapshotEffectValues(action.effect, finalDamage));

    // Same-name effects refresh, not stack
    const existingIdx = state.activeEffects.findIndex(
      e => e.name === newEffect.name && e.target === newEffect.target,
    );
    if (existingIdx >= 0) {
      state.activeEffects[existingIdx] = { ...state.activeEffects[existingIdx], ...newEffect };
    } else {
      // Debuffs always apply; buffs respect cap
      if (effect.isDebuff) {
        state.activeEffects.push(newEffect);
      } else {
        const activeBufCount = state.activeEffects.filter(
          (e) => e.target === actorKey && e.stat !== 'potionSickness' && e.modifier >= 0,
        ).length;
        if (activeBufCount < COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS) {
          state.activeEffects.push(newEffect);
        }
      }
    }
  }

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

    const newEffect: ActiveEffect = {
      name: effect.name,
      target,
      stat: effect.stat,
      modifier: effect.modifier,
      remainingRounds: effect.duration,
    };

    Object.assign(newEffect, snapshotEffectValues(action.effect));

    // Same-name effects refresh, not stack
    const existingIdx = state.activeEffects.findIndex(
      e => e.name === newEffect.name && e.target === newEffect.target,
    );
    if (existingIdx >= 0) {
      state.activeEffects[existingIdx] = { ...state.activeEffects[existingIdx], ...newEffect };
      appliedEffects.push({
        stat: effect.stat,
        modifier: effect.modifier,
        duration: effect.duration,
        target,
      });
    } else if (!effect.isDebuff) {
      const activeBufCount = state.activeEffects.filter(
        (e) => e.target === actorKey && e.stat !== 'potionSickness' && e.modifier >= 0,
      ).length;
      if (activeBufCount >= COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS) {
        // At buff cap — skip applying the new buff
      } else {
        state.activeEffects.push(newEffect);
        appliedEffects.push({
          stat: effect.stat,
          modifier: effect.modifier,
          duration: effect.duration,
          target,
        });
      }
    } else {
      // Debuffs are always applied (no cap)
      state.activeEffects.push(newEffect);
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
    actualRestore = Math.round(getHp(state, actorKey) - hpBefore);
    resourceLabel = 'HP';
  } else if (potionType === 'stamina') {
    const before = getStamina(state, actorKey);
    const maxStam = getMaxStamina(state, actorKey);
    const newStam = Math.min(before + potion.healAmount, maxStam);
    setStamina(state, actorKey, newStam);
    actualRestore = Math.round(newStam - before);
    resourceLabel = 'Stamina';
  } else {
    const before = getMana(state, actorKey);
    const maxM = getMaxMana(state, actorKey);
    const newMana = Math.min(before + potion.healAmount, maxM);
    setMana(state, actorKey, newMana);
    actualRestore = Math.round(newMana - before);
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
    healResourceType: potionType,
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
      const beforeA = { stamina: state.combatantAStamina, mana: state.combatantAMana };
      const beforeB = { stamina: state.combatantBStamina, mana: state.combatantBMana };
      applyResourceRegen(state);
      const aChanged = state.combatantAStamina !== beforeA.stamina || state.combatantAMana !== beforeA.mana;
      const bChanged = state.combatantBStamina !== beforeB.stamina || state.combatantBMana !== beforeB.mana;
      if (aChanged || bChanged) {
        state.log.push({
          round: state.round,
          actor: 'combatantA',
          actorName: combatantA.name,
          action: 'regen',
          message: 'Resources regenerate.',
          combatantAAction: '',
          combatantBAction: '',
          ...hpSnapshot(state),
          ...resourceSnapshot(state),
        });
      }
    }

    // Resolve actions for both combatants
    let resolvedA = resolveAction(
      combatantA.template,
      state.round,
      getHp(state, 'combatantA'),
      state.combatantAMaxHp,
      getStamina(state, 'combatantA'),
      state.combatantAMaxStamina,
      getMana(state, 'combatantA'),
      state.combatantAMaxMana,
      state.activeEffects,
      'combatantA',
      combatantA.actionDefinitions,
    );
    let resolvedB = resolveAction(
      combatantB.template,
      state.round,
      getHp(state, 'combatantB'),
      state.combatantBMaxHp,
      getStamina(state, 'combatantB'),
      state.combatantBMaxStamina,
      getMana(state, 'combatantB'),
      state.combatantBMaxMana,
      state.activeEffects,
      'combatantB',
      combatantB.actionDefinitions,
    );

    // When a potion action can't fire (sick or empty), try the other branch first, then Defend
    if (resolvedA.action.potionType) {
      const canUsePotion = !hasPotionSickness(state, 'combatantA') &&
        availablePotions.some(p => p.potionType === resolvedA.action.potionType);
      if (!canUsePotion) {
        resolvedA = resolvedA.alternateAction
          ? { action: resolvedA.alternateAction, wasExhausted: false }
          : { action: DEFEND_FALLBACK, wasExhausted: true };
      }
    }
    if (resolvedB.action.potionType) {
      const canUsePotion = !hasPotionSickness(state, 'combatantB') &&
        availablePotions.some(p => p.potionType === resolvedB.action.potionType);
      if (!canUsePotion) {
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
      deductStamina(state, 'combatantA', resolvedA.action.cost.stamina);
      deductMana(state, 'combatantA', resolvedA.action.cost.mana);
      executeAction(
        state, 'combatantA', effectiveA, effectiveB,
        resolvedA.action, interaction, true,
        combatantA.name, combatantB.name,
        combatantAAction, combatantBAction,
        resolvedA.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
        combatantA.perActionScaling,
      );
      deductStamina(state, 'combatantB', resolvedB.action.cost.stamina);
      deductMana(state, 'combatantB', resolvedB.action.cost.mana);
      if (state.outcome) break;
      executeAction(
        state, 'combatantB', effectiveB, effectiveA,
        resolvedB.action, interaction, false,
        combatantB.name, combatantA.name,
        combatantAAction, combatantBAction,
        resolvedB.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
        combatantB.perActionScaling,
      );
    } else {
      deductStamina(state, 'combatantB', resolvedB.action.cost.stamina);
      deductMana(state, 'combatantB', resolvedB.action.cost.mana);
      executeAction(
        state, 'combatantB', effectiveB, effectiveA,
        resolvedB.action, interaction, false,
        combatantB.name, combatantA.name,
        combatantAAction, combatantBAction,
        resolvedB.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
        combatantB.perActionScaling,
      );
      deductStamina(state, 'combatantA', resolvedA.action.cost.stamina);
      deductMana(state, 'combatantA', resolvedA.action.cost.mana);
      if (state.outcome) break;
      executeAction(
        state, 'combatantA', effectiveA, effectiveB,
        resolvedA.action, interaction, true,
        combatantA.name, combatantB.name,
        combatantAAction, combatantBAction,
        resolvedA.wasExhausted, interactionResult,
        availablePotions, potionsConsumed,
        combatantA.perActionScaling,
      );
    }

    if (state.outcome) break;

    // Apply DOT/HOT ticks
    applyEffectTicks(state, combatantA, combatantB);

    // Check for DOT death
    if (getHp(state, 'combatantA') <= 0 || getHp(state, 'combatantB') <= 0) {
      if (getHp(state, 'combatantA') <= 0 && getHp(state, 'combatantB') <= 0) {
        state.outcome = 'draw';
      } else if (getHp(state, 'combatantA') <= 0) {
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
  perActionScaling?: PerActionScaling,
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
      perActionScaling,
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
