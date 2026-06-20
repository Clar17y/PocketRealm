import type {
  ActionDefinition,
  BossActiveEffect,
  CombatPotion,
  DefensiveActionEntry,
  EffectTickEntry,
  ExpeditionMobState,
  ExpeditionRoundLog,
  HealingEntry,
  MobActionResult,
  MobTelegraphEntry,
  PlayerRoundActionEntry,
  PotionConsumed,
  RaidParticipantResult,
  RaidRoundInput,
  RaidRoundResult,
} from '@pocketrealm/shared';
import { COMBAT_ACTION_CONSTANTS, mobDisplayName } from '@pocketrealm/shared';
import { applyDefenceReduction } from '../damageCalculator';
import { applyResourceCosts, resolveSupportiveActions } from '../combatHelpers';
import { tickTaunts } from '../threatSystem';
import { actionLabel, resolvePlayerOffensive, type OffensiveAttackContext, type RaidRoundRng } from '../raidPlayerPhase';
import { resolveMobActions } from '../raidMobPhase';

export function resolveRaidOutcomePhases({
  input,
  pState,
  logPlayerAttacks,
  logDefences,
  logHealing,
  offensiveCtx,
  playerActionDefs,
  getUsername,
  defStances,
  mobState,
  spawnedThisRound,
  buffActionResults,
  roll,
  combatMode,
  originalMobCount,
  mobActionDefs,
}: {
  input: RaidRoundInput;
  pState: Array<{
    playerId: string;
    hp: number;
    stamina: number;
    mana: number;
    templateRound: number;
    damageDealt: number;
    healingDone: number;
    damageTaken: number;
    actionId: string;
    wasExhausted: boolean;
    hit: boolean;
    isCritical: boolean;
    targetMobId: string | null;
    actionDef: ActionDefinition | null;
    intendedActionId: string | null;
    intendedActionDef: ActionDefinition | null;
    exhaustedReason: import('@pocketrealm/shared').ExhaustedActionReason | null;
    healTargetPlayerId: string | null;
    alternateActionDef: ActionDefinition | null;
  }>;
  logPlayerAttacks: PlayerRoundActionEntry[];
  logDefences: DefensiveActionEntry[];
  logHealing: HealingEntry[];
  offensiveCtx: OffensiveAttackContext;
  playerActionDefs: Record<string, ActionDefinition>;
  getUsername: (id: string) => string;
  defStances: Map<string, {
    avoidsPhysical: boolean;
    resistsMagic: boolean;
    damageReductionPercent: number;
    isChanneling: boolean;
  }>;
  mobState: Array<ExpeditionMobState & { hp: number; activeEffects: BossActiveEffect[] }>;
  spawnedThisRound: ExpeditionMobState[];
  buffActionResults: Map<number, BossActiveEffect[]>;
  roll: RaidRoundRng;
  combatMode: import('@pocketrealm/shared').CombatMode;
  originalMobCount: number;
  mobActionDefs: Record<string, ActionDefinition>;
}): RaidRoundResult {
  const allPotionsConsumed: PotionConsumed[] = [];
  const perParticipantPotions: Map<number, PotionConsumed[]> = new Map();
  const potionSicknessToApply: { participantIndex: number }[] = [];
  const consumedPotionIndices: Map<number, Set<number>> = new Map();
  const cleanseResults: Map<number, { debuffNames: Set<string>; dotNamesToRemove: Set<string> }> = new Map();
  const buffPotionResults: Map<number, BossActiveEffect[]> = new Map();
  const potionFallbackIndices: number[] = [];

  for (let index = 0; index < pState.length; index += 1) {
    const state = pState[index];
    const participant = input.participants[index];
    const definition = state.actionDef;
    if (state.hp <= 0 || !definition) {
      continue;
    }

    const isPotionAction = definition.actionType === 'use_potion'
      || definition.actionType === 'use_cleanse_potion'
      || definition.actionType === 'use_buff_potion';
    if (!isPotionAction) {
      continue;
    }

    const hasSickness = (participant.activeEffects ?? []).some((effect: { stat: string }) => effect.stat === 'potionSickness');
    if (hasSickness) {
      if (state.alternateActionDef) {
        potionFallbackIndices.push(index);
      }
      continue;
    }

    const potions = participant.availablePotions ?? [];
    const usedIndices = consumedPotionIndices.get(index);

    if (definition.actionType === 'use_potion') {
      const potionType = definition.potionType ?? 'hp';
      const potionIndex = potions.findIndex((potion: CombatPotion, potionIdx: number) =>
        potion.potionType === potionType && (!usedIndices || !usedIndices.has(potionIdx)),
      );
      if (potionIndex === -1) {
        if (state.alternateActionDef) {
          potionFallbackIndices.push(index);
        }
        continue;
      }

      const potion = potions[potionIndex];
      let actualRestore = 0;
      if (potionType === 'hp') {
        actualRestore = Math.min(potion.healAmount, participant.maxHp - state.hp);
        state.hp += actualRestore;
        state.healingDone = actualRestore;
      } else if (potionType === 'stamina') {
        actualRestore = Math.min(potion.healAmount, participant.maxStamina - state.stamina);
        state.stamina += actualRestore;
      } else {
        actualRestore = Math.min(potion.healAmount, participant.maxMana - state.mana);
        state.mana += actualRestore;
      }

      if (!consumedPotionIndices.has(index)) {
        consumedPotionIndices.set(index, new Set());
      }
      consumedPotionIndices.get(index)!.add(potionIndex);

      const consumed: PotionConsumed = {
        templateId: potion.templateId,
        name: potion.name,
        healAmount: actualRestore,
        round: input.roundNumber,
      };
      allPotionsConsumed.push(consumed);
      if (!perParticipantPotions.has(index)) {
        perParticipantPotions.set(index, []);
      }
      perParticipantPotions.get(index)!.push(consumed);
      potionSicknessToApply.push({ participantIndex: index });

      if (potionType === 'hp' && actualRestore > 0) {
        logHealing.push({
          playerId: state.playerId,
          username: getUsername(state.playerId),
          actionLabel: potion.name,
          amountHealed: actualRestore,
          targetPlayerId: state.playerId,
          targetUsername: getUsername(state.playerId),
        });
      }
      continue;
    }

    if (definition.actionType === 'use_cleanse_potion') {
      const potionIndex = potions.findIndex((potion: CombatPotion, potionIdx: number) =>
        potion.potionType === 'cleanse' && (!usedIndices || !usedIndices.has(potionIdx)),
      );
      if (potionIndex === -1) {
        if (state.alternateActionDef) {
          potionFallbackIndices.push(index);
        }
        continue;
      }

      const effects = participant.activeEffects ?? [];
      const statDebuffs = effects.filter(
        (effect: BossActiveEffect) => effect.stat !== 'potionSickness' && effect.modifier < 0 && !effect.damagePerRound,
      );
      const magicDots = effects.filter(
        (effect: BossActiveEffect) => effect.damagePerRound && effect.damagePerRound > 0 && effect.dotDamageType === 'magic',
      );
      if (statDebuffs.length === 0 && magicDots.length === 0) {
        if (state.alternateActionDef) {
          potionFallbackIndices.push(index);
        }
        continue;
      }

      const potion = potions[potionIndex];
      const cleansedNames: string[] = [];
      const debuffNames = new Set(statDebuffs.map((effect: BossActiveEffect) => effect.name));
      for (const name of debuffNames) {
        const count = statDebuffs.filter((effect: BossActiveEffect) => effect.name === name).length;
        cleansedNames.push(`${count}x ${name}`);
      }

      const dotGroupsToClear = potion.buffValue ?? 1;
      const dotNamesToRemove = new Set<string>();
      if (magicDots.length > 0) {
        const groups = new Map<string, { totalDmg: number; count: number }>();
        for (const dot of magicDots) {
          const group = groups.get(dot.name) ?? { totalDmg: 0, count: 0 };
          group.totalDmg += dot.damagePerRound ?? 0;
          group.count += 1;
          groups.set(dot.name, group);
        }

        const sorted = [...groups.entries()].sort((a, b) => b[1].totalDmg - a[1].totalDmg);
        const toRemove = dotGroupsToClear === 0 ? sorted : sorted.slice(0, dotGroupsToClear);
        for (const [name, group] of toRemove) {
          dotNamesToRemove.add(name);
          cleansedNames.push(`${group.count}x ${name}`);
        }
      }

      if (!cleanseResults.has(index)) {
        cleanseResults.set(index, { debuffNames, dotNamesToRemove });
      }
      if (!consumedPotionIndices.has(index)) {
        consumedPotionIndices.set(index, new Set());
      }
      consumedPotionIndices.get(index)!.add(potionIndex);

      const consumed: PotionConsumed = { templateId: potion.templateId, name: potion.name, healAmount: 0, round: input.roundNumber };
      allPotionsConsumed.push(consumed);
      if (!perParticipantPotions.has(index)) {
        perParticipantPotions.set(index, []);
      }
      perParticipantPotions.get(index)!.push(consumed);
      potionSicknessToApply.push({ participantIndex: index });

      logHealing.push({
        playerId: state.playerId,
        username: getUsername(state.playerId),
        actionLabel: `${potion.name} (cleanse ${cleansedNames.join(', ')})`,
        amountHealed: 0,
        targetPlayerId: state.playerId,
        targetUsername: getUsername(state.playerId),
      });
      continue;
    }

    if (definition.actionType === 'use_buff_potion') {
      const potionType = definition.potionType as 'buff_attack' | 'buff_defence';
      const potionIndex = potions.findIndex((potion: CombatPotion, potionIdx: number) =>
        potion.potionType === potionType && (!usedIndices || !usedIndices.has(potionIdx)),
      );
      if (potionIndex === -1) {
        if (state.alternateActionDef) {
          potionFallbackIndices.push(index);
        }
        continue;
      }

      const potion = potions[potionIndex];
      const duration = potion.buffDuration ?? 5;
      const value = potion.buffValue ?? 0;
      const buffsToApply: BossActiveEffect[] = potionType === 'buff_attack'
        ? [{
          name: 'Elixir of Power',
          stat: 'attackPercent',
          modifier: value,
          roundsRemaining: duration,
        }]
        : [
          { name: 'Resist Potion', stat: 'defence', modifier: value, roundsRemaining: duration },
          { name: 'Resist Potion (Magic)', stat: 'magicDefence', modifier: value, roundsRemaining: duration },
        ];

      if (!buffPotionResults.has(index)) {
        buffPotionResults.set(index, []);
      }
      buffPotionResults.get(index)!.push(...buffsToApply);

      if (!consumedPotionIndices.has(index)) {
        consumedPotionIndices.set(index, new Set());
      }
      consumedPotionIndices.get(index)!.add(potionIndex);
      const consumed: PotionConsumed = { templateId: potion.templateId, name: potion.name, healAmount: 0, round: input.roundNumber };
      allPotionsConsumed.push(consumed);
      if (!perParticipantPotions.has(index)) {
        perParticipantPotions.set(index, []);
      }
      perParticipantPotions.get(index)!.push(consumed);
      potionSicknessToApply.push({ participantIndex: index });

      const buffDescription = buffsToApply.map((buff) => `${buff.stat} +${buff.modifier} (${buff.roundsRemaining} rds)`).join(', ');
      logHealing.push({
        playerId: state.playerId,
        username: getUsername(state.playerId),
        actionLabel: `${potion.name} (${buffDescription})`,
        amountHealed: 0,
        targetPlayerId: state.playerId,
        targetUsername: getUsername(state.playerId),
      });
    }
  }

  for (const index of potionFallbackIndices) {
    const state = pState[index];
    const participant = input.participants[index];
    const alternateDefinition = state.alternateActionDef!;

    state.actionDef = alternateDefinition;
    state.actionId = alternateDefinition.id;
    state.stamina -= alternateDefinition.cost.stamina;
    state.mana -= alternateDefinition.cost.mana;
    state.stamina = Math.min(participant.maxStamina, state.stamina + participant.staminaRegenPerRound);
    state.mana = Math.min(participant.maxMana, state.mana + participant.manaRegenPerRound);

    if (alternateDefinition.category === 'offensive' && state.hp > 0) {
      const entries = resolvePlayerOffensive(participant, state, alternateDefinition, input.threatTable, offensiveCtx);
      logPlayerAttacks.push(...entries);
    } else if (alternateDefinition.actionType === 'heal_self' || alternateDefinition.actionType === 'heal_ally') {
      resolveSupportiveActions([participant], [state], input.threatTable);
      if (state.healingDone > 0) {
        const healTargetId = alternateDefinition.actionType === 'heal_ally' && state.healTargetPlayerId
          ? state.healTargetPlayerId
          : state.playerId;
        logHealing.push({
          playerId: state.playerId,
          username: getUsername(state.playerId),
          actionLabel: actionLabel(state.actionId, playerActionDefs),
          amountHealed: state.healingDone,
          targetPlayerId: healTargetId,
          targetUsername: getUsername(healTargetId),
        });
      }
    } else if (alternateDefinition.category === 'defensive') {
      logDefences.push({
        entryType: 'defensive',
        playerId: participant.playerId,
        username: getUsername(participant.playerId),
        actionId: alternateDefinition.id,
        actionLabel: actionLabel(alternateDefinition.id, playerActionDefs),
      });
    }
  }

  const newPlayerEffects: Map<number, BossActiveEffect[]> = new Map();
  const { mobActionResults, logMobActions } = resolveMobActions({
    mobState,
    pState,
    input,
    defStances,
    newPlayerEffects,
    buffActionResults,
    roll,
    combatMode,
    getUsername,
    spawnedThisRound,
    mobActionDefs,
  });

  for (const spawned of spawnedThisRound) {
    mobState.push(spawned);
  }

  if (input.environmentalDotPercent && input.environmentalDotPercent > 0) {
    for (let index = 0; index < pState.length; index += 1) {
      const state = pState[index];
      const participant = input.participants[index];
      if (state.hp <= 0) {
        continue;
      }

      const dotDamage = Math.floor(input.environmentalDotPercent * participant.maxHp);
      state.damageTaken += dotDamage;
      state.hp = Math.max(0, state.hp - dotDamage);
    }
  }

  applyResourceCosts(input.participants, pState);

  const logEffectTicks: EffectTickEntry[] = [];
  for (const mob of mobState) {
    if (mob.hp <= 0) {
      continue;
    }

    const remaining: BossActiveEffect[] = [];
    for (const effect of mob.activeEffects) {
      if (effect.damagePerRound && effect.damagePerRound > 0 && mob.hp > 0) {
        const defence = effect.dotDamageType === 'physical' ? mob.stats.defence : mob.stats.magicDefence;
        const dotDamage = applyDefenceReduction(effect.damagePerRound, defence);
        mob.hp = Math.max(0, mob.hp - dotDamage);
        logEffectTicks.push({
          targetType: 'mob',
          targetId: mob.id,
          targetName: mobDisplayName(mob),
          effectName: effect.name,
          damage: dotDamage,
          damageType: effect.dotDamageType ?? 'magic',
          ...(effect.sourceScalingStat ? { sourceScalingStat: effect.sourceScalingStat } : {}),
          hpAfter: mob.hp,
        });
      }
      effect.roundsRemaining -= 1;
      if (effect.roundsRemaining > 0) {
        remaining.push(effect);
      }
    }
    mob.activeEffects = remaining;
  }

  const sicknessByParticipant = new Set(potionSicknessToApply.map((entry) => entry.participantIndex));
  const participantEffectsAfter: BossActiveEffect[][] = input.participants.map((participant, index) => {
    let effects = [...(participant.activeEffects ?? [])];
    const mobAppliedEffects = newPlayerEffects.get(index);
    if (mobAppliedEffects) {
      effects.push(...mobAppliedEffects);
    }
    const buffEffects = buffActionResults.get(index);
    if (buffEffects) {
      effects.push(...buffEffects);
    }

    const cleanse = cleanseResults.get(index);
    if (cleanse) {
      effects = effects.filter((effect) => {
        if (cleanse.debuffNames.has(effect.name) && effect.stat !== 'potionSickness' && effect.modifier < 0 && !effect.damagePerRound) {
          return false;
        }
        if (cleanse.dotNamesToRemove.has(effect.name) && effect.damagePerRound && effect.damagePerRound > 0 && effect.dotDamageType === 'magic') {
          return false;
        }
        return true;
      });
    }

    const potionBuffs = buffPotionResults.get(index);
    if (potionBuffs) {
      effects.push(...potionBuffs);
    }
    if (sicknessByParticipant.has(index)) {
      effects.push({
        name: 'Potion Sickness',
        stat: 'potionSickness',
        modifier: 0,
        roundsRemaining: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      });
    }

    const remaining: BossActiveEffect[] = [];
    for (const effect of effects) {
      if (effect.damagePerRound && effect.damagePerRound > 0 && pState[index].hp > 0) {
        const defence = effect.dotDamageType === 'physical' ? participant.stats.defence : participant.stats.magicDefence;
        const dotDamage = applyDefenceReduction(effect.damagePerRound, defence);
        pState[index].hp = Math.max(0, pState[index].hp - dotDamage);
        pState[index].damageTaken += dotDamage;
        logEffectTicks.push({
          targetType: 'player',
          targetId: pState[index].playerId,
          targetName: getUsername(pState[index].playerId),
          effectName: effect.name,
          damage: dotDamage,
          damageType: effect.dotDamageType ?? 'magic',
          ...(effect.sourceScalingStat ? { sourceScalingStat: effect.sourceScalingStat } : {}),
          hpAfter: pState[index].hp,
        });
      }

      const ticked = { ...effect, roundsRemaining: effect.roundsRemaining - 1 };
      if (ticked.roundsRemaining > 0) {
        remaining.push(ticked);
      }
    }
    return remaining;
  });

  tickTaunts(input.threatTable);

  const mobsAfter: ExpeditionMobState[] = mobState
    .filter((mob) => mob.hp > 0)
    .map((mob) => ({
      id: mob.id,
      mobTemplateId: mob.mobTemplateId,
      name: mob.name,
      prefix: mob.prefix,
      ...(mob.role ? { role: mob.role } : {}),
      hp: mob.hp,
      maxHp: mob.maxHp,
      stats: mob.stats,
      actionTemplate: mob.actionTemplate,
      activeEffects: mob.activeEffects,
      ...(mob.phaseTemplates ? { phaseTemplates: mob.phaseTemplates } : {}),
    }));

  const roomCleared = mobsAfter.length === 0;
  const allPlayersDead = pState.every((state) => state.hp <= 0);
  const participantResults: RaidParticipantResult[] = pState.map((state, index) => ({
    playerId: state.playerId,
    actionId: state.actionId,
    targetMobId: state.targetMobId,
    wasExhausted: state.wasExhausted,
    damageDealt: state.damageDealt,
    healingDone: state.healingDone,
    damageTaken: state.damageTaken,
    hpAfter: Math.max(0, state.hp),
    staminaAfter: Math.max(0, state.stamina),
    manaAfter: Math.max(0, state.mana),
    templateRoundAfter: state.templateRound,
    isDead: state.hp <= 0,
    hit: state.hit,
    isCritical: state.isCritical,
    activeEffectsAfter: participantEffectsAfter[index],
    potionsConsumed: perParticipantPotions.get(index) ?? [],
  }));

  const telegraphs: MobTelegraphEntry[] = [];
  for (const mob of mobState) {
    if (mob.hp <= 0) {
      continue;
    }

    const nextIndex = input.roundNumber % mob.actionTemplate.length;
    const nextAction = mob.actionTemplate[nextIndex];
    if (nextAction?.isTelegraphed) {
      telegraphs.push({
        mobId: mob.id,
        mobName: mobDisplayName(mob),
        actionId: nextAction.actionId,
        actionLabel: nextAction.label ?? actionLabel(nextAction.actionId, mobActionDefs),
        targetMode: nextAction.targetMode,
        warningText: `${mobDisplayName(mob)} is preparing ${nextAction.label ?? actionLabel(nextAction.actionId, mobActionDefs)}!`,
      });
    }
  }

  const mobsKilledThisRound = Math.max(
    0,
    originalMobCount - mobsAfter.filter((mob) => !mob.id.startsWith('mob-summon-')).length,
  );
  const roundLog: ExpeditionRoundLog = {
    round: input.roundNumber,
    roomIndex: 0,
    phases: {
      playerAttacks: logPlayerAttacks,
      defences: logDefences,
      mobActions: logMobActions,
      healing: logHealing,
      effectTicks: logEffectTicks,
      outcome: {
        mobsAlive: mobsAfter.length,
        mobsKilled: mobsKilledThisRound,
        playersAlive: pState.filter((state) => state.hp > 0).length,
        playersKnockedOut: pState.filter((state) => state.hp <= 0).length,
        roomCleared,
        wipe: allPlayersDead,
      },
    },
    telegraphs,
  };

  return {
    mobsAfter,
    participantResults,
    mobActionResults: mobActionResults as MobActionResult[],
    threatTableAfter: input.threatTable,
    roomCleared,
    allPlayersDead,
    roundLog,
    allPotionsConsumed,
  };
}
