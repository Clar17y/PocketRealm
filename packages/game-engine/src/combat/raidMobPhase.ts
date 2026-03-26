import type {
  ActionDefinition,
  BossActiveEffect,
  RaidRoundInput,
  MobActionResult,
  ExpeditionMobState,
  MobActionLogEntry,
} from '@pocketrealm/shared';
import { COMBAT_CONSTANTS, COMBAT_ACTION_CONSTANTS, EXPEDITION_CONSTANTS, mobDisplayName } from '@pocketrealm/shared';
import type { CombatParticipantState } from './combatHelpers';
import { getEffectiveStatValue } from './combatHelpers';
import { getSingleTarget } from './threatSystem';
import { resolveHitCheck, calculateAvoidScore } from './damageCalculator';
import type { HitResolution } from './damageCalculator';
import type { CombatMode } from '@pocketrealm/shared';
import type { RaidRoundRng } from './raidPlayerPhase';
import { actionLabel } from './raidPlayerPhase';

export function resolveMobActions(params: {
  mobState: (ExpeditionMobState & { hp: number; activeEffects: BossActiveEffect[] })[];
  pState: (CombatParticipantState & {
    hp: number;
    stamina: number;
    mana: number;
    damageTaken: number;
    damageDealt: number;
    healingDone: number;
  })[];
  input: RaidRoundInput;
  defStances: Map<string, { avoidsPhysical: boolean; resistsMagic: boolean; damageReductionPercent: number; isChanneling: boolean }>;
  newPlayerEffects: Map<number, BossActiveEffect[]>;
  buffActionResults: Map<number, BossActiveEffect[]>;
  roll: RaidRoundRng;
  combatMode: CombatMode;
  getUsername: (id: string) => string;
  spawnedThisRound: ExpeditionMobState[];
  mobActionDefs: Record<string, ActionDefinition>;
}): { mobActionResults: MobActionResult[]; logMobActions: MobActionLogEntry[] } {
  const {
    mobState, pState, input, defStances, newPlayerEffects,
    buffActionResults, roll, combatMode, getUsername, spawnedThisRound, mobActionDefs,
  } = params;

  const mobActionResults: MobActionResult[] = [];
  const logMobActions: MobActionLogEntry[] = [];

  for (const mob of mobState) {
    if (mob.hp <= 0) continue;

    // Pinned mobs skip their attack (forced defend)
    const isPinned = mob.activeEffects.some(
      e => e.stat === 'pinned' && e.roundsRemaining > 0,
    );
    if (isPinned) {
      logMobActions.push({
        mobId: mob.id,
        mobName: mobDisplayName(mob),
        actionId: 'pinned',
        actionLabel: 'Pinned',
        targetMode: 'single_target',
        wasTelegraphed: false,
        targets: [],
      });
      mobActionResults.push({
        mobId: mob.id,
        actionId: 'pinned',
        targetMode: 'single_target',
        targetPlayerIds: [],
        damageDealt: 0,
        healingDone: 0,
      });
      continue;
    }

    const actionIndex = (input.roundNumber - 1) % mob.actionTemplate.length;
    const templateAction = mob.actionTemplate[actionIndex];
    const mActionDef = mobActionDefs[templateAction.actionId];
    if (!mActionDef) continue;

    const mobResult: MobActionResult = {
      mobId: mob.id,
      actionId: templateAction.actionId,
      targetMode: templateAction.targetMode,
      targetPlayerIds: [],
      damageDealt: 0,
      healingDone: 0,
    };

    const mobLogEntry: MobActionLogEntry = {
      mobId: mob.id,
      mobName: mobDisplayName(mob),
      actionId: templateAction.actionId,
      actionLabel: actionLabel(templateAction.actionId, mobActionDefs),
      targetMode: templateAction.targetMode,
      wasTelegraphed: templateAction.isTelegraphed ?? false,
      targets: [],
    };

    // boss_summon_adds: spawn new mobs from the summon pool
    if (templateAction.actionId === 'boss_summon_adds' && input.summonPool && input.summonPool.length > 0) {
      const MAX_TOTAL_SUMMONS = EXPEDITION_CONSTANTS.MAX_TOTAL_SUMMONS;
      const existingSummonCount = mobState.filter(m => m.id.startsWith('mob-summon-')).length + spawnedThisRound.length;
      const remainingBudget = MAX_TOTAL_SUMMONS - existingSummonCount;

      if (remainingBudget > 0) {
        const spawnCount = Math.min(2 + (roll.rollDamage(0, 1) >= 1 ? 1 : 0), remainingBudget); // 2-3 adds, capped
        const mutablePool = [...input.summonPool];
        for (let s = 0; s < spawnCount && mutablePool.length > 0; s++) {
          const poolIndex = roll.rollDamage(0, mutablePool.length - 1);
          const template = mutablePool.splice(poolIndex, 1)[0];
          const spawnedMob: ExpeditionMobState = {
            ...template,
            id: `mob-summon-${input.roundNumber}-${s}`,
            hp: template.maxHp,
            activeEffects: [],
          };
          spawnedThisRound.push(spawnedMob);
        }
      }
      logMobActions.push({
        mobId: mob.id,
        mobName: mobDisplayName(mob),
        actionId: 'boss_summon_adds',
        actionLabel: 'Summon Adds',
        targetMode: 'aoe',
        wasTelegraphed: templateAction.isTelegraphed ?? false,
        targets: [],
      });
      mobActionResults.push({
        mobId: mob.id,
        actionId: 'boss_summon_adds',
        targetMode: 'aoe',
        targetPlayerIds: [],
        damageDealt: 0,
        healingDone: 0,
      });
      continue;
    }

    // Refresh alive set
    const aliveAfterOffensive = new Set(pState.filter(s => s.hp > 0).map(s => s.playerId));
    if (aliveAfterOffensive.size === 0) {
      mobActionResults.push(mobResult);
      logMobActions.push(mobLogEntry);
      continue;
    }

    if (mActionDef.category === 'offensive' || mActionDef.actionType === 'debuff_spell') {
      let targets: string[] = [];
      const currentAggroHolder = getSingleTarget(input.threatTable, aliveAfterOffensive);

      if (templateAction.targetMode === 'single_target') {
        if (currentAggroHolder) targets = [currentAggroHolder];
      } else {
        targets = Array.from(aliveAfterOffensive);
      }

      const isMagic = mActionDef.damageType === 'magic';
      const isPhysical = !isMagic;

      for (const targetId of targets) {
        mobResult.targetPlayerIds.push(targetId);
        const targetState = pState.find(ps => ps.playerId === targetId);
        const targetParticipant = input.participants.find(pp => pp.playerId === targetId);
        if (!targetState || !targetParticipant) continue;

        const targetIdx = pState.findIndex(ps => ps.playerId === targetId);
        const stance = defStances.get(targetId);

        // Compute hit scores for all attacks (needed for log entries)
        const mobHitScore = mob.stats.accuracy + (mActionDef.accuracyModifier ?? 0);
        const playerAvoidScore = calculateAvoidScore(targetParticipant.stats);

        // Counter avoids physical, Ward avoids magic
        const blocked = (stance?.avoidsPhysical && isPhysical) || (stance?.resistsMagic && isMagic);
        if (blocked) {
          mobLogEntry.targets.push({
            playerId: targetId,
            username: getUsername(targetId),
            damageTaken: 0,
            blocked: true,
            dodged: false,
            knockedOut: false,
            mobHitScore,
            playerAvoidScore,
          });
          continue;
        }

        // Hit resolution: normal attacks can be dodged, boss specials (alwaysHits) cannot
        let hitResult: HitResolution | undefined;
        if (!mActionDef.alwaysHits) {
          hitResult = resolveHitCheck({
            combatMode,
            hitScore: mobHitScore,
            avoidScore: playerAvoidScore,
            hitRollValue: roll.rollHitChance(),
          });

          if (!hitResult.didHit) {
            // Apply alwaysApplies effects even on dodge (symmetrical with player miss path)
            if (mActionDef.effect?.alwaysApplies && mActionDef.effect.isDebuff && targetState.hp > 0 && targetIdx >= 0) {
              const newEffect: BossActiveEffect = {
                name: mActionDef.effect.name,
                stat: mActionDef.effect.stat,
                modifier: mActionDef.effect.modifier,
                roundsRemaining: mActionDef.effect.duration,
              };
              if (!newPlayerEffects.has(targetIdx)) newPlayerEffects.set(targetIdx, []);
              newPlayerEffects.get(targetIdx)!.push(newEffect);
            }
            mobLogEntry.targets.push({
              playerId: targetId,
              username: getUsername(targetId),
              damageTaken: 0,
              blocked: false,
              dodged: true,
              knockedOut: false,
              hitChance: hitResult.hitChance,
              hitRollValue: hitResult.hitRollValue,
              mobHitScore,
              playerAvoidScore,
            });
            continue;
          }
        }

        const dmgRaw = roll.rollDamage(mob.stats.damageMin, mob.stats.damageMax);
        // Apply mob attack buffs (rally/frenzy) as flat bonus damage
        const mobAttackBonus = getEffectiveStatValue(0, mob.activeEffects, 'attack');
        let baseDmg = Math.floor(dmgRaw * (mActionDef.damageMultiplier ?? 1.0)) + mobAttackBonus;
        const combinedTargetEffects = [
          ...(targetParticipant.activeEffects ?? []),
          ...(targetIdx >= 0 ? (newPlayerEffects.get(targetIdx) ?? []) : []),
          ...(targetIdx >= 0 ? (buffActionResults.get(targetIdx) ?? []) : []),
        ];

        // Execution strike + marked_for_death combo: 3x damage (before defence)
        if (templateAction.actionId === 'boss_execution_strike') {
          const isMarked = combinedTargetEffects.some(e => e.stat === 'marked_for_death' && e.roundsRemaining > 0);
          if (isMarked) {
            baseDmg *= 3;
          }
        }

        // Nature cursed: magic damage amplified 3x (before defence)
        if (isMagic) {
          const isCursed = combinedTargetEffects.some(
            e => e.stat === 'nature_cursed' && e.roundsRemaining > 0,
          );
          if (isCursed) {
            baseDmg *= 3;
          }
        }

        // Use effect-modified player defence (accounts for wither etc.)
        const effectivePlayerDefence = isMagic
          ? getEffectiveStatValue(targetParticipant.stats.magicDefence, combinedTargetEffects, 'magicDefence')
          : getEffectiveStatValue(targetParticipant.stats.defence, combinedTargetEffects, 'defence');

        let damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, baseDmg - effectivePlayerDefence);

        if (stance?.isChanneling) {
          damage = Math.floor(damage * COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE);
        }

        if (stance?.damageReductionPercent && stance.damageReductionPercent > 0) {
          damage = Math.floor(damage * (1 - stance.damageReductionPercent));
          damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, damage);
        }

        targetState.damageTaken += damage;
        targetState.hp = Math.max(0, targetState.hp - damage);
        mobResult.damageDealt += damage;

        mobLogEntry.targets.push({
          playerId: targetId,
          username: getUsername(targetId),
          damageTaken: damage,
          blocked: false,
          dodged: false,
          knockedOut: targetState.hp <= 0,
          hitChance: hitResult?.hitChance,
          hitRollValue: hitResult?.hitRollValue,
          mobHitScore,
          playerAvoidScore,
          damageRoll: dmgRaw,
        });

        // Apply mob debuff/DoT effects to player on hit
        if (mActionDef.effect?.isDebuff && targetState.hp > 0 && targetIdx >= 0) {
          const newEffect: BossActiveEffect = {
            name: mActionDef.effect.name,
            stat: mActionDef.effect.stat,
            modifier: mActionDef.effect.modifier,
            roundsRemaining: mActionDef.effect.duration,
            ...(mActionDef.effect.damagePerRound ? {
              damagePerRound: mActionDef.effect.damagePerRound,
              dotDamageType: mActionDef.effect.dotDamageType,
            } : {}),
          };
          if (!newPlayerEffects.has(targetIdx)) newPlayerEffects.set(targetIdx, []);
          newPlayerEffects.get(targetIdx)!.push(newEffect);
        }
      }
    }

    // Mob heal_self
    if (mActionDef.actionType === 'heal_self') {
      const healAmount = Math.floor((mActionDef.healPercent ?? 0) * mob.maxHp) + (mActionDef.healFlat ?? 0);
      const actualHeal = Math.min(healAmount, mob.maxHp - mob.hp);
      mob.hp += actualHeal;
      mobResult.healingDone = actualHeal;
    }

    // boss_rally — buff ALL alive mobs, not just self
    if (templateAction.actionId === 'boss_rally' && mActionDef.effect) {
      for (const m of mobState) {
        if (m.hp <= 0) continue;
        m.activeEffects.push({
          name: mActionDef.effect.name,
          stat: mActionDef.effect.stat,
          modifier: mActionDef.effect.modifier,
          roundsRemaining: mActionDef.effect.duration,
        });
      }
      mobActionResults.push(mobResult);
      logMobActions.push(mobLogEntry);
      continue;
    }

    // Mob enrage/buff — applied to the mob itself
    if (mActionDef.actionType === 'buff' && mActionDef.effect) {
      mob.activeEffects.push({
        name: mActionDef.effect.name,
        stat: mActionDef.effect.stat,
        modifier: mActionDef.effect.modifier,
        roundsRemaining: mActionDef.effect.duration,
      });
    }

    mobActionResults.push(mobResult);
    logMobActions.push(mobLogEntry);
  }

  return { mobActionResults, logMobActions };
}
