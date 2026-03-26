import type {
  CombatantStats,
  ActiveEffect,
  ActionEffect,
  CombatActor,
  CombatPotion,
  PotionConsumed,
} from '@pocketrealm/shared';
import { COMBAT_ACTION_CONSTANTS, COMBAT_CONSTANTS } from '@pocketrealm/shared';
import { calculateDefenceReduction } from './damageCalculator';
import {
  opponent,
  buildLogEntry,
  type TemplateCombatant,
  type TemplateCombatState,
} from './templateCombatTypes';

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

/**
 * Apply an action's effect (buff/debuff/DOT/HOT) to the state.
 * Same-name effects refresh rather than stack. Buffs respect the cap; debuffs always apply.
 * Returns the list of applied effects (for log display), or undefined if none.
 */
export function applyActionEffect(
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

export function getEffectiveStats(
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

export function tickEffects(state: TemplateCombatState): void {
  const remaining: ActiveEffect[] = [];

  for (const effect of state.activeEffects) {
    effect.remainingRounds--;
    if (effect.remainingRounds > 0) {
      remaining.push(effect);
    }
  }

  state.activeEffects = remaining;
}

export function applyEffectTicks(
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

export function hasPotionSickness(state: TemplateCombatState, actor: CombatActor): boolean {
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

export function consumePotionAndApplySickness(
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
