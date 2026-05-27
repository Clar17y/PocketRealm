import type {
  ActionDefinition,
  CombatActor,
  CombatMode,
  CombatantStats,
  PerActionScaling,
} from '@pocketrealm/shared';
import {
  calculateAvoidScore,
  calculateDefenceReduction,
  calculateFinalDamage,
  calculateHitChance,
  guaranteedHitResult,
  isCriticalHit,
  resolveActionDamageStats,
  resolveHitCheck,
  resolveScalingStat,
  rollD20,
  rollDamage,
} from '../damageCalculator';
import {
  buildLogEntry,
  opponent,
  type RoundContext,
  type TemplateCombatState,
} from '../templateCombatTypes';
import { applyActionEffect } from '../templateEffects';
import { actionToCombatAction, applyActionDefenceReduction } from './shared';

export function executeOffensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  targetStats: CombatantStats,
  action: ActionDefinition,
  hitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal',
  interactionDamageMultiplier: number,
  damageReduction: number,
  targetAvoidanceModifier: number,
  actorName: string,
  targetName: string,
  ctx: RoundContext,
  combatMode: CombatMode,
  perActionScaling?: PerActionScaling,
): void {
  if (hitOverride === 'guaranteed_miss') {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: actionToCombatAction(action),
      message: `${targetName} avoids ${actorName}'s ${action.name}!`,
    }));
    return;
  }

  let baseDamageMin = actorStats.damageMin;
  let baseDamageMax = actorStats.damageMax;
  let baseAccuracy = actorStats.accuracy;

  if (perActionScaling) {
    const actionStats = resolveActionDamageStats(action.scalingStat ?? 'weapon', perActionScaling);
    baseDamageMin = actionStats.damageMin;
    baseDamageMax = actionStats.damageMax;
    baseAccuracy = actionStats.accuracy;

    // Re-apply buff/debuff modifiers from active effects (these were lost when
    // per-action stats replaced the pre-computed effective stats).
    // Also collect attackPercent in the same pass for application below.
    let attackPercentModifier = 0;
    for (const effect of state.activeEffects) {
      if (effect.target !== actorKey) {
        continue;
      }
      if (effect.stat === 'attack') {
        baseDamageMin += effect.modifier;
        baseDamageMax += effect.modifier;
      } else if (effect.stat === 'accuracy') {
        baseAccuracy += effect.modifier;
      } else if (effect.stat === 'damageMin') {
        baseDamageMin += effect.modifier;
      } else if (effect.stat === 'damageMax') {
        baseDamageMax += effect.modifier;
      } else if (effect.stat === 'attackPercent') {
        attackPercentModifier += effect.modifier;
      }
    }

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
  const avoidScore = calculateAvoidScore(targetStats) + targetAvoidanceModifier;
  const hitResolution = hitOverride === 'guaranteed_hit' || action.alwaysHits
    ? guaranteedHitResult(hitScore, avoidScore)
    : attackRoll === 1 || attackRoll === 20
      ? {
        ...calculateHitChance(combatMode, hitScore, avoidScore),
        hitRollValue: attackRoll === 1 ? 1 : 0,
        didHit: attackRoll === 20,
      }
      : resolveHitCheck({
        combatMode,
        hitScore,
        avoidScore,
      });

  if (!hitResolution.didHit) {
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

  const resolvedScaling = perActionScaling
    ? resolveScalingStat(action.scalingStat ?? 'weapon', perActionScaling.weaponRequiredSkill, perActionScaling.skillLevels)
    : null;

  let actionDamageType: 'physical' | 'magic' = action.damageType ?? 'physical';
  if (!action.damageType && (action.scalingStat ?? 'weapon') === 'weapon' && resolvedScaling) {
    actionDamageType = resolvedScaling === 'magic' ? 'magic' : 'physical';
  }

  const effectiveDefence = actionDamageType === 'magic'
    ? targetStats.magicDefence
    : applyActionDefenceReduction(targetStats.defence, action.defenceReduction);

  let rawDamage = rollDamage(baseDamageMin, baseDamageMax);
  const actionMultiplier = action.damageMultiplier ?? 1;
  rawDamage = Math.floor(rawDamage * actionMultiplier * interactionDamageMultiplier);

  const critical = isCriticalHit(actorStats.critChance ?? 0);
  const { damage: damageAfterDefence, actualMultiplier } = calculateFinalDamage(
    rawDamage,
    effectiveDefence,
    critical,
    actorStats.critDamage ?? 0,
  );

  let finalDamage = damageAfterDefence;
  if (damageReduction > 0) {
    finalDamage = Math.max(1, Math.floor(finalDamage * (1 - damageReduction)));
  }

  state.combatants[opponent(actorKey)].hp -= finalDamage;

  const xpStat = resolvedScaling ?? (actorStats.damageType === 'magic' ? 'magic' as const : 'melee' as const);
  if (actorKey === 'combatantA' && finalDamage > 0) {
    state.damageByScalingStat[xpStat] += finalDamage;
  }

  let leechHeal = 0;
  if (action.lifeLeechPercent && action.lifeLeechPercent > 0 && finalDamage > 0) {
    const rawLeech = Math.floor(finalDamage * action.lifeLeechPercent / 100);
    if (rawLeech > 0) {
      const combatant = state.combatants[actorKey];
      const before = combatant.hp;
      combatant.hp = Math.min(combatant.maxHp, combatant.hp + rawLeech);
      leechHeal = combatant.hp - before;
    }
  }

  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));
  const criticalText = critical ? ' CRITICAL HIT!' : '';
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
    isCritical: critical,
    ...(critical ? { critMultiplier: actualMultiplier } : {}),
    ...(leechHeal > 0 ? { leechHeal } : {}),
    accuracyModifier: accuracyBonus,
    targetDodge: targetStats.dodge,
    targetEvasion: targetStats.evasion,
    targetDefence: actionDamageType === 'magic' ? undefined : targetStats.defence,
    targetMagicDefence: actionDamageType === 'magic' ? targetStats.magicDefence : undefined,
    armorReduction: actionDamageType === 'magic' ? undefined : armorReduction,
    magicDefenceReduction: actionDamageType === 'magic' ? armorReduction : undefined,
    effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name} on ${targetName} for ${finalDamage} damage!${criticalText}${leechText}`,
  }));

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
