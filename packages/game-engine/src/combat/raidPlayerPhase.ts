import type {
  ActionDefinition,
  BossActiveEffect,
  RaidParticipant,
  RaidThreatEntry,
  ExpeditionMobState,
  PlayerAttackEntry,
  CombatantStats,
} from '@pocketrealm/shared';
import { mobDisplayName } from '@pocketrealm/shared';
import type { CombatParticipantState } from './combatHelpers';
import { getEffectiveStatValue } from './combatHelpers';
import { addDamageThreat } from './threatSystem';
import {
  resolveHitCheck,
  guaranteedHitResult,
  calculateAvoidScore,
  calculateFinalDamage,
} from './damageCalculator';
import type { CombatMode } from '@pocketrealm/shared';

// Re-exported from raidRoundResolver — defined here to avoid circular imports
export interface RaidRoundRng {
  /** Returns a 0-1 float used as the hit roll against the computed hit probability. */
  rollHitChance: () => number;
  rollDamage: (min: number, max: number) => number;
  rollCrit: (chance: number) => boolean;
}

// AoE player actions — these target all surviving mobs instead of one
export const AOE_ACTION_IDS = new Set([
  'cleave', 'scatter_shot', 'volley', 'frost_nova', 'blizzard', 'whirlwind', 'meteor_strike',
]);

// --- Phase Transition ---

export function checkPhaseTransition(mob: ExpeditionMobState): void {
  if (!mob.phaseTemplates || mob.phaseTemplates.length === 0) return;
  for (const phase of mob.phaseTemplates) {
    if (mob.hp <= mob.maxHp * phase.hpThreshold && mob.actionTemplate !== phase.template) {
      mob.actionTemplate = phase.template;
      break;
    }
  }
}

export function actionLabel(actionId: string, defs: Record<string, ActionDefinition>): string {
  return defs[actionId]?.name ?? actionId.replace(/_/g, ' ');
}

function getActionEffectSourceScalingStat(def: ActionDefinition): Pick<BossActiveEffect, 'sourceScalingStat'> {
  const scalingStat = def.scalingStat ?? 'weapon';
  return scalingStat === 'weapon' ? {} : { sourceScalingStat: scalingStat };
}

// --- Shared offensive attack resolution ---

export interface OffensiveAttackContext {
  combatMode: CombatMode;
  roll: RaidRoundRng;
  mobState: { id: string; hp: number; maxHp: number; stats: CombatantStats; activeEffects: BossActiveEffect[]; name: string; prefix: string | null }[];
  playerActionDefs: Record<string, ActionDefinition>;
  getUsername: (id: string) => string;
  splashCascade?: boolean;
}

/**
 * Resolve a player's offensive attack against mobs. Handles target selection,
 * hit resolution, damage, debuff/DoT application, and log generation.
 * Used by both Step 4 (primary offensive) and Step 5c (potion fallback).
 */
export function resolvePlayerOffensive(
  p: RaidParticipant,
  s: CombatParticipantState & { hit: boolean; isCritical: boolean; targetMobId: string | null; damageDealt: number },
  def: ActionDefinition,
  threatTable: RaidThreatEntry[],
  ctx: OffensiveAttackContext,
): PlayerAttackEntry[] {
  const entries: PlayerAttackEntry[] = [];
  const aliveMobs = ctx.mobState.filter(m => m.hp > 0);
  if (aliveMobs.length === 0) return entries;

  const isAoe = AOE_ACTION_IDS.has(s.actionId);
  let targets: typeof aliveMobs;
  if (isAoe) {
    targets = aliveMobs;
  } else if (p.targetMobId) {
    const preferred = aliveMobs.find(m => m.id === p.targetMobId);
    targets = [preferred ?? aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];
  } else {
    targets = [aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];
  }

  s.targetMobId = isAoe ? null : targets[0].id;

  let totalDamageDealt = 0;
  const effectiveAccuracy = getEffectiveStatValue(p.stats.accuracy, p.activeEffects, 'accuracy');
  const hitScore = effectiveAccuracy + (def.accuracyModifier ?? 0);

  for (const target of targets) {
    const avoidScore = calculateAvoidScore(target.stats);
    const hitResolution = def.alwaysHits
      ? guaranteedHitResult(hitScore, avoidScore)
      : resolveHitCheck({
          combatMode: ctx.combatMode,
          hitScore,
          avoidScore,
          hitRollValue: ctx.roll.rollHitChance(),
        });

    const hits = hitResolution.didHit;
    const baseEntry = {
      entryType: 'attack' as const,
      playerId: p.playerId,
      username: ctx.getUsername(p.playerId),
      actionId: s.actionId,
      actionLabel: actionLabel(s.actionId, ctx.playerActionDefs),
      targetMobId: target.id,
      targetMobName: mobDisplayName(target),
      hitChance: hitResolution.hitChance,
      hitRollValue: hitResolution.hitRollValue,
      attackerHitScore: hitResolution.hitScore,
      defenderAvoidScore: hitResolution.avoidScore,
      staminaCost: def.cost.stamina,
      manaCost: def.cost.mana,
    };

    if (!hits) {
      if (def.effect?.alwaysApplies && def.effect.isDebuff && target.hp > 0) {
        target.activeEffects.push({
          name: def.effect.name,
          stat: def.effect.stat,
          modifier: def.effect.modifier,
          roundsRemaining: def.effect.duration,
        });
      }

      // Splash hit cascade: on miss, try other alive mobs in order
      if (ctx.splashCascade && !isAoe) {
        const otherMobs = aliveMobs.filter(m => m.id !== target.id && m.hp > 0);
        const cascadeAttempts: import('@pocketrealm/shared').SplashCascadeAttempt[] = [];
        let cascadeTarget: typeof target | null = null;
        for (const candidateMob of otherMobs) {
          const cascadeAvoid = calculateAvoidScore(candidateMob.stats);
          const cascadeResult = def.alwaysHits
            ? guaranteedHitResult(hitScore, cascadeAvoid)
            : resolveHitCheck({
                combatMode: ctx.combatMode,
                hitScore,
                avoidScore: cascadeAvoid,
                hitRollValue: ctx.roll.rollHitChance(),
              });
          if (cascadeResult.didHit) {
            cascadeTarget = candidateMob;
            // Cascade hit: compute damage against cascade target
            s.hit = true;
            const rawDmg = ctx.roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
            const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
            const crit = ctx.roll.rollCrit(p.stats.critChance ?? 0);
            if (crit) s.isCritical = true;
            const isMagicAttack = def.damageType === 'magic' || p.stats.damageType === 'magic';
            const effectiveDefence = isMagicAttack
              ? getEffectiveStatValue(candidateMob.stats.magicDefence, candidateMob.activeEffects, 'magicDefence')
              : getEffectiveStatValue(candidateMob.stats.defence, candidateMob.activeEffects, 'defence');
            const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);
            candidateMob.hp = Math.max(0, candidateMob.hp - damage);
            totalDamageDealt += damage;
            if (def.effect?.isDebuff && candidateMob.hp > 0) {
              const dotFlat = def.effect.damagePerRound ?? 0;
              const dotPct = def.effect.damagePerRoundPercent ?? 0;
              const resolvedDot = dotFlat + Math.floor((dotPct / 100) * damage);
              candidateMob.activeEffects.push({
                name: def.effect.name,
                stat: def.effect.stat,
                modifier: def.effect.modifier,
                roundsRemaining: def.effect.duration,
                ...(resolvedDot > 0 ? {
                  damagePerRound: resolvedDot,
                  dotDamageType: def.effect.dotDamageType,
                  ...getActionEffectSourceScalingStat(def),
                } : {}),
              });
            }
            cascadeAttempts.push({
              targetMobName: mobDisplayName(candidateMob),
              hitChance: cascadeResult.hitChance,
              hitRollValue: cascadeResult.hitRollValue,
              attackerHitScore: cascadeResult.hitScore,
              defenderAvoidScore: cascadeAvoid,
              hit: true,
              crit,
              damageRoll: rawDmg,
              totalDamage: damage,
            });
            break;
          } else {
            cascadeAttempts.push({
              targetMobName: mobDisplayName(candidateMob),
              hitChance: cascadeResult.hitChance,
              hitRollValue: cascadeResult.hitRollValue,
              attackerHitScore: cascadeResult.hitScore,
              defenderAvoidScore: cascadeAvoid,
              hit: false,
            });
          }
        }
        // Log entry shows original miss + cascade chain
        entries.push({
          ...baseEntry,
          hit: !!cascadeTarget,
          crit: cascadeTarget ? cascadeAttempts[cascadeAttempts.length - 1]?.crit ?? false : false,
          ...(cascadeTarget ? {
            damageRoll: cascadeAttempts[cascadeAttempts.length - 1]?.damageRoll,
            totalDamage: cascadeAttempts[cascadeAttempts.length - 1]?.totalDamage,
          } : {}),
          splashCascade: cascadeAttempts,
        });
        continue;
      }

      entries.push({ ...baseEntry, hit: false, crit: false });
      continue;
    }

    s.hit = true;
    const rawDmg = ctx.roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
    const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
    const crit = ctx.roll.rollCrit(p.stats.critChance ?? 0);
    if (crit) s.isCritical = true;

    const isMagicAttack = def.damageType === 'magic' || p.stats.damageType === 'magic';
    const effectiveDefence = isMagicAttack
      ? getEffectiveStatValue(target.stats.magicDefence, target.activeEffects, 'magicDefence')
      : getEffectiveStatValue(target.stats.defence, target.activeEffects, 'defence');
    const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);

    target.hp = Math.max(0, target.hp - damage);
    totalDamageDealt += damage;

    if (def.effect?.isDebuff && target.hp > 0) {
      const dotFlat = def.effect.damagePerRound ?? 0;
      const dotPct = def.effect.damagePerRoundPercent ?? 0;
      const resolvedDot = dotFlat + Math.floor((dotPct / 100) * damage);
      target.activeEffects.push({
        name: def.effect.name,
        stat: def.effect.stat,
        modifier: def.effect.modifier,
        roundsRemaining: def.effect.duration,
        ...(resolvedDot > 0 ? {
          damagePerRound: resolvedDot,
          dotDamageType: def.effect.dotDamageType,
          ...getActionEffectSourceScalingStat(def),
        } : {}),
      });
    }

    entries.push({ ...baseEntry, hit: true, crit, damageRoll: rawDmg, totalDamage: damage });
  }

  s.damageDealt = totalDamageDealt;
  if (totalDamageDealt > 0) {
    addDamageThreat(threatTable, s.playerId, totalDamageDealt);
  }

  return entries;
}
