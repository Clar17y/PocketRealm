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
  CombatPotion,
  CombatMode,
} from '@pocketrealm/shared';
import { COMBAT_ACTION_CONSTANTS, COMBAT_CONSTANTS } from '@pocketrealm/shared';
import { resolveAction, resolveInteraction, DEFEND_FALLBACK, type RoundInteraction } from './actionResolver';
import {
  rollD20,
  rollDamage,
  calculateHitChance,
  resolveHitCheck,
  guaranteedHitResult,
  calculateAvoidScore,
  isCriticalHit,
  calculateFinalDamage,
  calculateDefenceReduction,
  rollInitiative,
  resolveActionDamageStats,
  resolveScalingStat,
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
  /** Damage dealt by combatantA grouped by resolved scaling stat. */
  damageByScalingStat: { melee: number; ranged: number; magic: number };
  /** Resource cost (stamina + mana) spent by combatantA grouped by resolved scaling stat. */
  resourceCostByScalingStat: { melee: number; ranged: number; magic: number };
}

// --- Internal State ---

interface CombatantState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaRegen: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
}

interface TemplateCombatState {
  combatants: Record<CombatActor, CombatantState>;
  round: number;
  log: TemplateCombatLogEntry[];
  outcome: CombatOutcome | null;
  activeEffects: ActiveEffect[];
  damageByScalingStat: { melee: number; ranged: number; magic: number };
  resourceCostByScalingStat: { melee: number; ranged: number; magic: number };
}

/** Shared params passed through every action execution within a round. */
interface RoundContext {
  combatantAAction: string;
  combatantBAction: string;
  wasExhausted: boolean;
  interactionResult: string;
}

// --- Helpers ---

function opponent(actor: CombatActor): CombatActor {
  return actor === 'combatantA' ? 'combatantB' : 'combatantA';
}

function applyActionDefenceReduction(defence: number, reductionPercent?: number): number {
  if (!reductionPercent || reductionPercent <= 0) {
    return defence;
  }

  return Math.max(0, Math.floor(defence * (1 - reductionPercent / 100)));
}

/** Build a log entry with HP/resource snapshots and round context baked in. */
function buildLogEntry(
  state: TemplateCombatState,
  ctx: RoundContext | null,
  fields: Partial<TemplateCombatLogEntry> & Pick<TemplateCombatLogEntry, 'actor' | 'actorName' | 'action' | 'message'>,
): TemplateCombatLogEntry {
  const a = state.combatants.combatantA;
  const b = state.combatants.combatantB;
  return {
    round: state.round,
    combatantAHpAfter: Math.max(0, a.hp),
    combatantBHpAfter: Math.max(0, b.hp),
    combatantAStaminaAfter: a.stamina,
    combatantBStaminaAfter: b.stamina,
    combatantAManaAfter: a.mana,
    combatantBManaAfter: b.mana,
    combatantAAction: ctx?.combatantAAction ?? '',
    combatantBAction: ctx?.combatantBAction ?? '',
    wasExhausted: ctx?.wasExhausted,
    interactionResult: ctx?.interactionResult,
    ...fields,
  };
}

/**
 * Apply an action's effect (buff/debuff/DOT/HOT) to the state.
 * Same-name effects refresh rather than stack. Buffs respect the cap; debuffs always apply.
 * Returns the list of applied effects (for log display), or undefined if none.
 */
function applyActionEffect(
  state: TemplateCombatState,
  effect: ActionEffect,
  actorKey: CombatActor,
  opts?: { damageForPercentCalc?: number; sourceScalingStat?: 'melee' | 'ranged' | 'magic' },
): Array<{ stat: string; modifier: number; duration: number; target: CombatActor }> | undefined {
  const targetKey = effect.isDebuff !== false ? opponent(actorKey) : actorKey;

  const newEffect: ActiveEffect = {
    name: effect.name,
    target: targetKey,
    stat: effect.stat,
    modifier: effect.modifier,
    remainingRounds: effect.duration,
    ...(opts?.sourceScalingStat ? { sourceScalingStat: opts.sourceScalingStat } : {}),
    ...snapshotEffectValues(effect, opts?.damageForPercentCalc),
  };

  // Same-name effects refresh, not stack
  const existingIdx = state.activeEffects.findIndex(
    e => e.name === newEffect.name && e.target === newEffect.target,
  );
  if (existingIdx >= 0) {
    state.activeEffects[existingIdx] = { ...state.activeEffects[existingIdx], ...newEffect };
    return [{ stat: effect.stat, modifier: effect.modifier, duration: effect.duration, target: targetKey }];
  }

  if (effect.isDebuff) {
    state.activeEffects.push(newEffect);
    return [{ stat: effect.stat, modifier: effect.modifier, duration: effect.duration, target: targetKey }];
  }

  // Buffs respect cap
  const activeBufCount = state.activeEffects.filter(
    (e) => e.target === actorKey && e.stat !== 'potionSickness' && e.modifier >= 0,
  ).length;
  if (activeBufCount >= COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS) {
    return undefined;
  }

  state.activeEffects.push(newEffect);
  return [{ stat: effect.stat, modifier: effect.modifier, duration: effect.duration, target: targetKey }];
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

      state.combatants[targetKey].hp -= tickDamage;

      // Track DOT damage by scaling stat (combatantA dealing to combatantB)
      if (targetKey === 'combatantB' && tickDamage > 0) {
        const dotStat = effect.sourceScalingStat ?? (effect.dotDamageType === 'physical' ? 'melee' : 'magic');
        state.damageByScalingStat[dotStat] += tickDamage;
      }

      state.log.push(buildLogEntry(state, null, {
        actor: targetKey === 'combatantA' ? 'combatantB' : 'combatantA',
        actorName: targetKey === 'combatantA' ? combatantB.name : combatantA.name,
        action: 'spell',
        spellName: effect.name,
        damage: tickDamage,
        message: `${effect.name} deals ${tickDamage} ${effect.dotDamageType ?? 'magic'} damage to ${target.name}`,
        tickType: 'dot_tick',
      }));
    }

    // HOT tick
    if (effect.resolvedHealPerRound && effect.resolvedHealPerRound > 0) {
      const targetKey = effect.target;
      const target = targetKey === 'combatantA' ? combatantA : combatantB;
      const c = state.combatants[targetKey];
      const maxHeal = target.stats.maxHp - c.hp;
      const actualHeal = Math.min(effect.resolvedHealPerRound, maxHeal);

      if (actualHeal > 0) {
        c.hp = Math.min(c.maxHp, c.hp + actualHeal);
        state.log.push(buildLogEntry(state, null, {
          actor: targetKey,
          actorName: target.name,
          action: 'spell',
          spellName: effect.name,
          healAmount: actualHeal,
          message: `${effect.name} heals ${target.name} for ${actualHeal} HP`,
          tickType: 'hot_tick',
        }));
      }
    }
  }
}

function hasPotionSickness(state: TemplateCombatState, actor: CombatActor): boolean {
  return state.activeEffects.some(
    (e) => e.target === actor && e.stat === 'potionSickness',
  );
}

export function isStatDebuff(e: ActiveEffect, actor: CombatActor): boolean {
  return e.target === actor && e.stat !== 'potionSickness' && e.modifier < 0 && !e.resolvedDamagePerRound;
}

export function isMagicDot(e: ActiveEffect, actor: CombatActor): boolean {
  return e.target === actor && e.resolvedDamagePerRound != null && e.resolvedDamagePerRound > 0 && e.dotDamageType === 'magic';
}

function consumePotionAndApplySickness(
  state: TemplateCombatState,
  actorKey: CombatActor,
  availablePotions: CombatPotion[],
  potionIndex: number,
  potionsConsumed: PotionConsumed[],
  healAmount: number,
): CombatPotion {
  const potion = availablePotions[potionIndex];
  availablePotions.splice(potionIndex, 1);
  potionsConsumed.push({
    templateId: potion.templateId,
    name: potion.name,
    healAmount,
    round: state.round,
  });
  state.activeEffects.push({
    name: 'Potion Sickness',
    target: actorKey,
    stat: 'potionSickness',
    modifier: 0,
    remainingRounds: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
  });
  return potion;
}

function actionToCombatAction(action: ActionDefinition): CombatAction {
  if (action.category === 'offensive') return 'attack';
  if (action.category === 'defensive') return 'defend';
  if (action.actionType === 'use_potion') return 'potion';
  if (action.actionType === 'use_cleanse_potion') return 'cleanse';
  if (action.actionType === 'use_buff_potion') return 'potion';
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
  ctx: RoundContext,
  combatMode: CombatMode,
  perActionScaling?: PerActionScaling,
): void {
  // Guaranteed miss (counter/ward blocked the attack)
  if (hitOverride === 'guaranteed_miss') {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} avoids ${actorName}'s ${action.name}!`,
    }));
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
    // when per-action stats replaced the pre-computed effective stats).
    // Also collect attackPercent in the same pass.
    let attackPercentModifier = 0;
    for (const effect of state.activeEffects) {
      if (effect.target !== actorKey) continue;
      if (effect.stat === 'attack') { baseDamageMin += effect.modifier; baseDamageMax += effect.modifier; }
      else if (effect.stat === 'accuracy') baseAccuracy += effect.modifier;
      else if (effect.stat === 'damageMin') baseDamageMin += effect.modifier;
      else if (effect.stat === 'damageMax') baseDamageMax += effect.modifier;
      else if (effect.stat === 'attackPercent') attackPercentModifier += effect.modifier;
    }
    // Apply guild damage multiplier
    if (perActionScaling.guildDamageMultiplier && perActionScaling.guildDamageMultiplier > 0) {
      baseDamageMin = Math.round(baseDamageMin * (1 + perActionScaling.guildDamageMultiplier));
      baseDamageMax = Math.round(baseDamageMax * (1 + perActionScaling.guildDamageMultiplier));
    }

    baseDamageMin = Math.max(1, baseDamageMin);
    baseDamageMax = Math.max(baseDamageMin, baseDamageMax);

    if (attackPercentModifier !== 0) {
      baseDamageMin = Math.max(1, Math.floor(baseDamageMin * (1 + attackPercentModifier)));
      baseDamageMax = Math.max(baseDamageMin, Math.floor(baseDamageMax * (1 + attackPercentModifier)));
    }
  } else {
    // No per-action scaling (mobs) — effective stats already include flat buffs
    // from getEffectiveStats, but attackPercent is only handled here.
    let attackPercentModifier = 0;
    for (const effect of state.activeEffects) {
      if (effect.target === actorKey && effect.stat === 'attackPercent') {
        attackPercentModifier += effect.modifier;
      }
    }
    if (attackPercentModifier !== 0) {
      baseDamageMin = Math.max(1, Math.floor(baseDamageMin * (1 + attackPercentModifier)));
      baseDamageMax = Math.max(baseDamageMin, Math.floor(baseDamageMax * (1 + attackPercentModifier)));
    }
  }

  const attackRoll = hitOverride === 'guaranteed_hit' ? 20 : rollD20();
  const accuracyBonus = baseAccuracy + (action.accuracyModifier ?? 0);
  const hitScore = accuracyBonus;
  const avoidScore = calculateAvoidScore(targetStats);
  const hitResolution = hitOverride === 'guaranteed_hit' || action.alwaysHits
    ? guaranteedHitResult(hitScore, avoidScore)
    : attackRoll === 1 || attackRoll === 20
      ? { ...calculateHitChance(combatMode, hitScore, avoidScore), hitRollValue: attackRoll === 1 ? 1 : 0, didHit: attackRoll === 20 }
      : resolveHitCheck({
        combatMode,
        hitScore,
        avoidScore,
      });
  const hits = hitResolution.didHit;

  if (!hits) {
    const appliedEffects = action.effect?.alwaysApplies
      ? applyActionEffect(state, action.effect, actorKey, {
        sourceScalingStat: perActionScaling
          ? resolveScalingStat(
            action.scalingStat ?? 'weapon',
            perActionScaling.weaponRequiredSkill,
            perActionScaling.skillLevels,
          )
          : undefined,
      })
      : undefined;
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      roll: attackRoll,
      hitChance: hitResolution.hitChance,
      hitRollValue: hitResolution.hitRollValue,
      attackerHitScore: hitResolution.hitScore,
      defenderAvoidScore: hitResolution.avoidScore,
      accuracyModifier: accuracyBonus,
      targetDodge: targetStats.dodge,
      targetEvasion: targetStats.evasion,
      effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
      message: `${actorName} uses ${action.name} but misses ${targetName}!`,
    }));
    return;
  }

  // Resolve scaling stat for this action (used for damage type + XP tracking)
  const resolvedScaling = perActionScaling
    ? resolveScalingStat(action.scalingStat ?? 'weapon', perActionScaling.weaponRequiredSkill, perActionScaling.skillLevels)
    : null;

  // Determine damage type from the action.
  // If the action doesn't specify, resolve from scalingStat:
  // - 'weapon' scalingStat -> use weapon's combat style (magic weapons deal magic damage)
  // - explicit scalingStat -> default to 'physical' (cross-type actions set damageType explicitly)
  let actionDamageType: 'physical' | 'magic' = action.damageType ?? 'physical';
  if (!action.damageType && (action.scalingStat ?? 'weapon') === 'weapon' && resolvedScaling) {
    actionDamageType = resolvedScaling === 'magic' ? 'magic' : 'physical';
  }
  const effectiveDefence = actionDamageType === 'magic'
    ? targetStats.magicDefence
    : applyActionDefenceReduction(targetStats.defence, action.defenceReduction);

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

  state.combatants[opponent(actorKey)].hp -= finalDamage;

  // Resolved scaling stat for XP attribution (damage tracking + DOT source)
  const xpStat = resolvedScaling ?? (actorStats.damageType === 'magic' ? 'magic' as const : 'melee' as const);

  // Track damage by scaling stat for XP splitting (combatantA only)
  if (actorKey === 'combatantA' && finalDamage > 0) {
    state.damageByScalingStat[xpStat] += finalDamage;
  }

  // Life leech -- heal attacker for % of damage dealt
  let leechHeal = 0;
  if (action.lifeLeechPercent && action.lifeLeechPercent > 0 && finalDamage > 0) {
    const rawLeech = Math.floor(finalDamage * action.lifeLeechPercent / 100);
    if (rawLeech > 0) {
      const ac = state.combatants[actorKey];
      const before = ac.hp;
      ac.hp = Math.min(ac.maxHp, ac.hp + rawLeech);
      leechHeal = ac.hp - before;
    }
  }

  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));
  const critText = crit ? ' CRITICAL HIT!' : '';
  const leechText = leechHeal > 0 ? ` Leeches ${leechHeal} HP!` : '';

  const appliedEffects = action.effect
    ? applyActionEffect(state, action.effect, actorKey, {
      damageForPercentCalc: finalDamage,
      sourceScalingStat: xpStat,
    })
    : undefined;

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: actionToCombatAction(action),
    roll: attackRoll,
    hitChance: hitResolution.hitChance,
    hitRollValue: hitResolution.hitRollValue,
    attackerHitScore: hitResolution.hitScore,
    defenderAvoidScore: hitResolution.avoidScore,
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
    effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name} on ${targetName} for ${finalDamage} damage!${critText}${leechText}`,
  }));

  // Check for kill
  if (state.combatants[opponent(actorKey)].hp <= 0) {
    state.outcome = actorKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} falls defeated!`,
    }));
  }
}

function executeSupportiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  // Resource potion use (hp/stamina/mana)
  if (action.actionType === 'use_potion') {
    executePotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Cleanse potion
  if (action.actionType === 'use_cleanse_potion') {
    executeCleanseAction(state, actorKey, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Buff potion (resist / elixir)
  if (action.actionType === 'use_buff_potion') {
    executeBuffPotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Buff or heal
  let healAmount = 0;
  let appliedEffects: CombatLogEntry['effectsApplied'];

  // Apply heal
  if (action.healFlat || action.healPercent) {
    const c = state.combatants[actorKey];
    const flatHeal = action.healFlat ?? 0;
    const percentHeal = Math.floor((action.healPercent ?? 0) * c.maxHp);
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + flatHeal + percentHeal);
    healAmount = c.hp - before;
  }

  // Apply buff/debuff effect
  if (action.effect) {
    appliedEffects = applyActionEffect(state, action.effect, actorKey);
  }

  const parts: string[] = [];
  if (healAmount > 0) {
    parts.push(`+${healAmount} HP`);
  }
  if (appliedEffects && appliedEffects.length > 0) {
    const desc = appliedEffects.map(
      (e) => `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier} (${e.duration} rds)`,
    ).join(', ');
    parts.push(desc);
  }

  const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'spell',
    spellName: action.name,
    healAmount: healAmount > 0 ? healAmount : undefined,
    effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name}!${detail}`,
  }));
}

function executePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  const potionType = (action.potionType ?? 'hp') as 'hp' | 'stamina' | 'mana';

  // Check potion sickness
  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  // Find a matching potion by type
  const potionIndex = availablePotions.findIndex(p => p.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but has none left!`,
    }));
    return;
  }

  const c = state.combatants[actorKey];
  let actualRestore = 0;
  let resourceLabel: string;

  if (potionType === 'hp') {
    const hpBefore = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(c.hp - hpBefore);
    resourceLabel = 'HP';
  } else if (potionType === 'stamina') {
    const before = c.stamina;
    c.stamina = Math.min(c.maxStamina, c.stamina + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(c.stamina - before);
    resourceLabel = 'Stamina';
  } else {
    const before = c.mana;
    c.mana = Math.min(c.maxMana, c.mana + availablePotions[potionIndex].healAmount);
    actualRestore = Math.round(c.mana - before);
    resourceLabel = 'Mana';
  }

  const potion = consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, actualRestore);

  state.log.push(buildLogEntry(state, ctx, {
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
  }));
}

function executeCleanseAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  const potionIndex = availablePotions.findIndex(p => p.potionType === 'cleanse');
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a cleanse potion but has none left!`,
    }));
    return;
  }

  // Find all stat debuffs and magic DOTs
  const statDebuffs = state.activeEffects.filter(e => isStatDebuff(e, actorKey));
  const magicDots = state.activeEffects.filter(e => isMagicDot(e, actorKey));

  if (statDebuffs.length === 0 && magicDots.length === 0) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to cleanse but has no debuffs to remove!`,
    }));
    return;
  }

  const cleansedEntries: Array<{ name: string; target: CombatActor; stacksRemoved: number }> = [];
  const cleansedNames: string[] = [];

  // Always clear ALL stat debuffs
  if (statDebuffs.length > 0) {
    const debuffNames = new Set(statDebuffs.map(e => e.name));
    state.activeEffects = state.activeEffects.filter(e => !isStatDebuff(e, actorKey));
    for (const name of debuffNames) {
      const count = statDebuffs.filter(e => e.name === name).length;
      cleansedEntries.push({ name, target: actorKey, stacksRemoved: count });
      cleansedNames.push(`${count}x ${name}`);
    }
  }

  // Clear N worst magic DOT groups (N = potion's buffValue, 0 = all)
  const dotGroupsToClear = availablePotions[potionIndex].buffValue ?? 1;

  if (magicDots.length > 0) {
    // Group by name, sum damage per group
    const groups = new Map<string, { totalDamage: number; count: number }>();
    for (const dot of magicDots) {
      const existing = groups.get(dot.name) ?? { totalDamage: 0, count: 0 };
      existing.totalDamage += dot.resolvedDamagePerRound!;
      existing.count++;
      groups.set(dot.name, existing);
    }

    // Sort groups by total damage descending
    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].totalDamage - a[1].totalDamage);

    // Clear N groups (0 = all)
    const groupsToRemove = dotGroupsToClear === 0 ? sortedGroups : sortedGroups.slice(0, dotGroupsToClear);
    const namesToRemove = new Set(groupsToRemove.map(([name]) => name));

    state.activeEffects = state.activeEffects.filter(
      e => !(isMagicDot(e, actorKey) && namesToRemove.has(e.name)),
    );

    for (const [name, group] of groupsToRemove) {
      cleansedEntries.push({ name, target: actorKey, stacksRemoved: group.count });
      cleansedNames.push(`${group.count}x ${name}`);
    }
  }

  const potion = consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, 0);

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'cleanse',
    spellName: potion.name,
    effectsCleansed: cleansedEntries,
    effectsApplied: [{
      stat: 'potionSickness',
      modifier: 0,
      duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      target: actorKey,
    }],
    message: `${actorName} drinks ${potion.name}! Cleanses ${cleansedNames.join(', ')}!`,
  }));
}

function executeBuffPotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  const potionType = action.potionType as 'buff_attack' | 'buff_defence';

  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  const potionIndex = availablePotions.findIndex(p => p.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a buff potion but has none left!`,
    }));
    return;
  }

  const potion = availablePotions[potionIndex];
  const duration = potion.buffDuration ?? 5;
  const value = potion.buffValue ?? 0;

  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  if (potionType === 'buff_attack') {
    const applied = applyActionEffect(state, {
      name: 'Elixir of Power',
      stat: 'attackPercent',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (applied) appliedEffects.push(...applied);
  } else {
    const defApplied = applyActionEffect(state, {
      name: 'Resist Potion',
      stat: 'defence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (defApplied) appliedEffects.push(...defApplied);

    const mdefApplied = applyActionEffect(state, {
      name: 'Resist Potion (Magic)',
      stat: 'magicDefence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (mdefApplied) appliedEffects.push(...mdefApplied);
  }

  consumePotionAndApplySickness(state, actorKey, availablePotions, potionIndex, potionsConsumed, 0);

  const buffDesc = appliedEffects.length > 0
    ? appliedEffects.map(e => `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier} (${e.duration} rds)`).join(', ')
    : 'buff cap reached';

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'potion',
    spellName: potion.name,
    effectsApplied: [
      ...(appliedEffects.length > 0 ? appliedEffects : []),
      { stat: 'potionSickness', modifier: 0, duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS, target: actorKey },
    ],
    message: `${actorName} drinks ${potion.name}! ${buffDesc}`,
  }));
}

function canUsePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  availablePotions: CombatPotion[],
): boolean {
  if (!action.potionType) return true;
  if (hasPotionSickness(state, actorKey)) return false;

  if (action.potionType === 'cleanse') {
    const hasPotion = availablePotions.some(p => p.potionType === 'cleanse');
    const hasDebuff = state.activeEffects.some(e => isStatDebuff(e, actorKey) || isMagicDot(e, actorKey));
    return hasPotion && hasDebuff;
  }

  return availablePotions.some(p => p.potionType === action.potionType);
}

function executeDefensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
): void {
  // Defensive actions are passive -- they modify the interaction result,
  // which is already factored into the opponent's attack execution.
  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'defend',
    message: `${actorName} uses ${action.name}!`,
  }));
}

// --- Main Engine ---

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
        { combatantAAction, combatantBAction, wasExhausted: resolvedA.wasExhausted, interactionResult },
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
        { combatantAAction, combatantBAction, wasExhausted: resolvedB.wasExhausted, interactionResult },
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
        { combatantAAction, combatantBAction, wasExhausted: resolvedB.wasExhausted, interactionResult },
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
        { combatantAAction, combatantBAction, wasExhausted: resolvedA.wasExhausted, interactionResult },
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
  ctx: RoundContext,
  combatMode: CombatMode,
  availablePotions: CombatPotion[],
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

  // Track resource cost by scaling stat for XP splitting (combatantA only)
  if (actorKey === 'combatantA' && perActionScaling) {
    const cost = action.cost.stamina + action.cost.mana;
    if (cost > 0) {
      const resolved = resolveScalingStat(action.scalingStat ?? 'weapon', perActionScaling.weaponRequiredSkill, perActionScaling.skillLevels);
      state.resourceCostByScalingStat[resolved] += cost;
    }
  }

  if (action.category === 'offensive') {
    executeOffensiveAction(
      state, actorKey, actorStats, targetStats, action,
      hitOverride, interactionDmgMult, dmgReduction,
      actorName, targetName, ctx, combatMode,
      perActionScaling,
    );
  } else if (action.category === 'supportive') {
    executeSupportiveAction(
      state, actorKey, actorStats, action,
      actorName, ctx,
      availablePotions, potionsConsumed,
    );
  } else if (action.effect || action.healFlat || action.healPercent) {
    executeSupportiveAction(
      state, actorKey, actorStats, action,
      actorName, ctx,
      availablePotions, potionsConsumed,
    );
  } else {
    executeDefensiveAction(state, actorKey, action, actorName, ctx);
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
