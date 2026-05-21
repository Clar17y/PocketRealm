import { prisma } from '@pocketrealm/database';
import {
  applyMobEventModifiers,
  applyMobPrefix,
  buildPlayerCombatStats,
  filterAndWeightMobsByTier,
  mobToTemplateCombatant,
  rollMobPrefix,
  runTemplateCombat,
  selectTierWithBleedthrough,
} from '@pocketrealm/game-engine';
import {
  DURABILITY_CONSTANTS,
  type LootDrop,
  type MobTemplate,
  type PotionConsumed,
  type QuestProgressUpdate,
} from '@pocketrealm/shared';
import { applyCombatBuffs, buildCombatBuffBadges, consumeBuffChargesPerMob, type CombatBuffBadge } from '../buffService';
import { broadcastRareLootActivity } from '../chatActivityService';
import { logger } from '../../logger';
import { buildCombatLogResult, buildPlayerTemplateCombatant, processCombatVictoryRewards } from '../combatOrchestrationService';
import { mapTemplateCombatLog } from '../combatLogMapper';
import { degradeEquippedDurability } from '../durabilityService';
import { enrichLootWithNames } from '../lootService';
import { setHp, enterRecoveringState } from '../hpService';
import { persistMobHp } from '../persistedMobService';
import { applyTrackedFamilyWeightBias } from '../explorationTrackingService';
import { respawnToHomeTown } from '../zoneDiscoveryService';
import { computeZoneModifiers, filterEventModifiers } from '../worldEventService';
import { buildPveCombatOptions, calculateFleeWithGold, serializeXpGrant, toMobTemplate } from '../../utils/routeHelpers.js';
import type { GrantXpResult } from '../xpService';
import type { ExplorationOutcomeContext, ExplorationTurnOutcome, AmbushProcessingResult } from './types';
import { pickWeighted, type NarrativeEvent, type PendingAmbushCombatLog } from '../exploration/helpers';

export async function processAmbushOutcome(args: {
  ctx: ExplorationOutcomeContext;
  outcome: ExplorationTurnOutcome;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  buffUsesLeft: ExplorationOutcomeContext['buffUsesLeft'];
  potionPool: ExplorationOutcomeContext['combatPrep']['potionPool'];
  events: NarrativeEvent[];
  pendingCombatLogs: PendingAmbushCombatLog[];
  allPotionsConsumed: PotionConsumed[];
  ambushPendingLootSessionIds: string[];
  allNewItemIds: string[];
  allUpdatedItemIds: string[];
  allQuestProgress: QuestProgressUpdate[];
}): Promise<AmbushProcessingResult> {
  const {
    ctx,
    outcome,
    buffUsesLeft,
    potionPool,
    events,
    pendingCombatLogs,
    allPotionsConsumed,
    ambushPendingLootSessionIds,
    allNewItemIds,
    allUpdatedItemIds,
    allQuestProgress,
  } = args;
  const {
    playerId,
    username,
    zoneId,
    zone,
    hpState,
    combatPrep,
    combatBuffs,
    progression,
    equipmentStats,
    mobTemplates,
    zoneFamilies,
    zoneTiers,
    selectedTier,
    explorationProgress,
    spawnMods,
    trackingFamilyId,
    cachedZoneEvents,
    cachedWorldEvents,
    isTutorialExplore,
  } = ctx;

  let { currentHp, currentStamina, currentMana } = args;
  const { attackSkill, attackLevel, perActionScaling, playerTemplate, resources, unlockedActions: explorationUnlockedActions } = combatPrep;

  let baseMob: MobTemplate;
  let prefixedMob: ReturnType<typeof applyMobPrefix>;

  if (isTutorialExplore) {
    const fieldMouse = mobTemplates.find((mob) => (mob as { name: string }).name === 'Field Mouse') ?? mobTemplates[0]!;
    baseMob = toMobTemplate(fieldMouse as Parameters<typeof toMobTemplate>[0]);
    prefixedMob = applyMobPrefix(baseMob, null);
  } else {
    const tieredMobs = filterAndWeightMobsByTier(
      mobTemplates.map((mob) => ({
        ...(mob as object),
        explorationTier: (mob as { explorationTier?: number }).explorationTier ?? 1,
      })) as Parameters<typeof filterAndWeightMobsByTier>[0],
      explorationProgress.percent,
      zoneTiers,
    );
    if (tieredMobs.length === 0) {
      return {
        currentHp,
        currentStamina,
        currentMana,
        aborted: false,
        abortedAtTurn: null,
        wasKnockedOut: false,
        respawnedTo: null,
      };
    }

    const targetTier = selectTierWithBleedthrough(selectedTier, zoneTiers);
    let candidates = tieredMobs.filter((mob) => mob.explorationTier === targetTier);
    if (candidates.length === 0) {
      for (let tier = targetTier - 1; tier >= 1; tier -= 1) {
        candidates = tieredMobs.filter((mob) => mob.explorationTier === tier);
        if (candidates.length > 0) {
          break;
        }
      }
    }
    if (candidates.length === 0) {
      candidates = tieredMobs;
    }

    const weightedCandidates = candidates.map((candidate) => {
      let weightModifier = spawnMods.global;
      for (const [familyId, modifier] of spawnMods.byFamily) {
        const family = zoneFamilies.find((zoneFamily) => zoneFamily.mobFamilyId === familyId);
        if (family?.mobFamily?.members?.some((member) => member.mobTemplate.id === (candidate as { id: string }).id)) {
          weightModifier *= modifier;
          break;
        }
      }
      return weightModifier !== 1
        ? { ...candidate, encounterWeight: (candidate as { encounterWeight: number }).encounterWeight * weightModifier }
        : candidate;
    });
    const trackedWeightedCandidates = applyTrackedFamilyWeightBias(
      weightedCandidates.map((candidate) => ({
        ...candidate,
        mobFamilyId: ctx.mobToFamilyMap.get((candidate as { id: string }).id) ?? '',
      })) as Array<(typeof weightedCandidates)[number] & { mobFamilyId: string }>,
      trackingFamilyId,
      'encounterWeight',
    );
    const mob = pickWeighted(trackedWeightedCandidates, 'encounterWeight') as typeof candidates[number] | null;
    if (!mob) {
      return {
        currentHp,
        currentStamina,
        currentMana,
        aborted: false,
        abortedAtTurn: null,
        wasKnockedOut: false,
        respawnedTo: null,
      };
    }

    baseMob = toMobTemplate(mob as Parameters<typeof toMobTemplate>[0]);
    const ambushFamilyId = ctx.mobToFamilyMap.get(baseMob.id);
    const ambushModifiers = ambushFamilyId
      ? computeZoneModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: ambushFamilyId })
      : ctx.zoneModifiers;
    const modifiedMob = applyMobEventModifiers(baseMob, ambushModifiers);
    prefixedMob = applyMobPrefix(modifiedMob, rollMobPrefix());
  }

  const playerStats = buildPlayerCombatStats(
    currentHp,
    hpState.maxHp,
    {
      attackStyle: attackSkill,
      skillLevel: attackLevel,
      attributes: progression.attributes,
    },
    equipmentStats,
  );

  const mobBuffs = {
    damageBoost: buffUsesLeft.damage > 0 ? combatBuffs.damageBoost : 0,
    defenceBoost: buffUsesLeft.defence > 0 ? combatBuffs.defenceBoost : 0,
  };
  applyCombatBuffs(playerStats, mobBuffs);

  const combatOptions = buildPveCombatOptions(potionPool);
  const combatantA = buildPlayerTemplateCombatant({
    playerId,
    username,
    playerStats,
    template: playerTemplate,
    stamina: currentStamina,
    maxStamina: resources.maxStamina,
    staminaRegenPerRound: resources.staminaRegenPerRound,
    mana: currentMana,
    maxMana: resources.maxMana,
    manaRegenPerRound: resources.manaRegenPerRound,
    unlockedActions: explorationUnlockedActions,
    perActionScaling,
    actionModifiers: equipmentStats.actionModifiers,
  });
  const combatantB = mobToTemplateCombatant(prefixedMob);
  const combatResult = runTemplateCombat(combatantA, combatantB, combatOptions);

  for (const consumed of combatResult.potionsConsumed) {
    const index = potionPool.findIndex((potion) => potion.templateId === consumed.templateId);
    if (index !== -1) {
      potionPool.splice(index, 1);
    }
    allPotionsConsumed.push(consumed);
  }

  const explorationDurabilityMultiplier = prefixedMob.mobPrefix
    ? DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.elite
    : DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.default;
  const durabilityLost = buffUsesLeft.durability > 0
    ? []
    : await degradeEquippedDurability(playerId, combatResult.log, 'combatantA', explorationDurabilityMultiplier);
  for (const durability of durabilityLost) {
    allUpdatedItemIds.push(durability.itemId);
  }

  await prisma.$transaction(async (tx) => {
    await consumeBuffChargesPerMob(tx, playerId, buffUsesLeft);
  });

  const ambushMobFamily = zoneFamilies.find((zoneFamily) =>
    zoneFamily.mobFamily.members.some((member) => member.mobTemplate.id === prefixedMob.id),
  );
  const ambushEventModifiers = ambushMobFamily
    ? filterEventModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: ambushMobFamily.mobFamilyId })
    : [];
  const shieldWasActive = buffUsesLeft.durability + 1 > 0
    && combatBuffs.durabilityShield > 0
    && durabilityLost.length === 0;
  const ambushBuffBadges: CombatBuffBadge[] = buildCombatBuffBadges({
    damageBoost: mobBuffs.damageBoost,
    defenceBoost: mobBuffs.defenceBoost,
    durabilityShield: shieldWasActive ? combatBuffs.durabilityShield : 0,
  });

  let loot: LootDrop[] = [];
  let xpGain = 0;
  let xpGrants: GrantXpResult[] = [];
  let aborted = false;
  let abortedAtTurn: number | null = null;
  let wasKnockedOut = false;
  let respawnedTo: { townId: string; townName: string } | null = null;

  if (combatResult.outcome === 'victory') {
    currentHp = combatResult.combatantAHpRemaining;
    currentStamina = combatResult.combatantAStaminaRemaining;
    currentMana = combatResult.combatantAManaRemaining;
    await setHp(playerId, currentHp);

    const rewards = await processCombatVictoryRewards({
      playerId,
      mob: prefixedMob,
      attackSkill,
      damageByScalingStat: combatResult.damageByScalingStat,
      resourceCostByScalingStat: combatResult.resourceCostByScalingStat,
    });
    loot = rewards.loot;
    const lootWithNames = await enrichLootWithNames(loot);
    void broadcastRareLootActivity({
      zoneId,
      actorPlayerId: playerId,
      actorUsername: username,
      loot: lootWithNames,
    }).catch((error: unknown) => {
      logger.error({ err: error, playerId, zoneId }, 'Rare loot activity broadcast failed');
    });
    allNewItemIds.push(...rewards.newItemIds);
    allUpdatedItemIds.push(...rewards.updatedItemIds);
    if (rewards.pendingLootSessionId) {
      ambushPendingLootSessionIds.push(rewards.pendingLootSessionId);
    }
    allQuestProgress.push(...rewards.questProgress);
    xpGrants = rewards.xpGrants;
    xpGain = xpGrants.reduce((sum, grant) => sum + grant.boostedXpAfterEfficiency, 0);

    pendingCombatLogs.push({
      turnsSpent: 0,
      result: buildCombatLogResult({
        zoneId,
        zoneName: zone.name,
        mob: { id: prefixedMob.id, name: baseMob.name, mobPrefix: prefixedMob.mobPrefix, mobDisplayName: prefixedMob.mobDisplayName },
        source: 'exploration_ambush',
        encounterSiteId: null,
        attackSkill,
        combatResult,
        rewards: {
          xp: prefixedMob.xpReward,
          baseXp: prefixedMob.xpReward,
          loot,
          durabilityLost,
          skillXpGrants: xpGrants.map(serializeXpGrant),
        },
        eventModifiers: [...ambushEventModifiers, ...ambushBuffBadges],
      }),
    });

    events.push({
      turn: outcome.turnOccurred,
      type: 'ambush_victory',
      description: `A ${prefixedMob.mobDisplayName} ambushed you - you defeated it! (+${xpGain} XP)`,
      details: {
        mobTemplateId: prefixedMob.id,
        mobName: baseMob.name,
        mobPrefix: prefixedMob.mobPrefix,
        mobDisplayName: prefixedMob.mobDisplayName,
        outcome: combatResult.outcome,
        playerMaxHp: combatResult.combatantAMaxHp,
        mobMaxHp: combatResult.combatantBMaxHp,
        log: mapTemplateCombatLog(combatResult.log),
        playerHpRemaining: currentHp,
        xp: xpGain,
        loot,
        durabilityLost,
        eventModifiers: [...ambushEventModifiers, ...ambushBuffBadges],
      },
    });
  } else {
    currentStamina = combatResult.combatantAStaminaRemaining;
    currentMana = combatResult.combatantAManaRemaining;

    const fleeResult = await calculateFleeWithGold(playerId, {
      evasionLevel: progression.attributes.evasion,
      mobLevel: prefixedMob.level,
      maxHp: hpState.maxHp,
    });

    if (fleeResult.outcome === 'knockout') {
      currentHp = 0;
      wasKnockedOut = true;
      await enterRecoveringState(playerId, hpState.maxHp);
      respawnedTo = await respawnToHomeTown(playerId);
    } else {
      currentHp = fleeResult.remainingHp;
      await setHp(playerId, currentHp);
    }

    if (combatResult.combatantBHpRemaining > 0) {
      await persistMobHp(playerId, prefixedMob.id, zoneId, combatResult.combatantBHpRemaining, prefixedMob.hp);
    }

    const defeatDescription = fleeResult.outcome === 'knockout'
      ? `A ${prefixedMob.mobDisplayName} ambushed you - you were defeated and knocked out!`
      : `A ${prefixedMob.mobDisplayName} ambushed you - you were defeated but escaped with ${fleeResult.remainingHp} HP.`;

    pendingCombatLogs.push({
      turnsSpent: 0,
      result: buildCombatLogResult({
        zoneId,
        zoneName: zone.name,
        mob: { id: prefixedMob.id, name: baseMob.name, mobPrefix: prefixedMob.mobPrefix, mobDisplayName: prefixedMob.mobDisplayName },
        source: 'exploration_ambush',
        encounterSiteId: null,
        attackSkill,
        combatResult,
        rewards: {
          xp: 0,
          baseXp: 0,
          loot: [],
          durabilityLost,
          skillXpGrants: [],
        },
        eventModifiers: [...ambushEventModifiers, ...ambushBuffBadges],
      }),
    });

    events.push({
      turn: outcome.turnOccurred,
      type: 'ambush_defeat',
      description: defeatDescription,
      details: {
        mobTemplateId: prefixedMob.id,
        mobName: baseMob.name,
        mobPrefix: prefixedMob.mobPrefix,
        mobDisplayName: prefixedMob.mobDisplayName,
        outcome: combatResult.outcome,
        playerMaxHp: combatResult.combatantAMaxHp,
        mobMaxHp: combatResult.combatantBMaxHp,
        log: mapTemplateCombatLog(combatResult.log),
        playerHpRemaining: currentHp,
        fleeResult: {
          outcome: fleeResult.outcome,
          remainingHp: fleeResult.remainingHp,
          goldLost: fleeResult.goldLost,
          recoveryCost: fleeResult.recoveryCost,
        },
        durabilityLost,
        eventModifiers: [...ambushEventModifiers, ...ambushBuffBadges],
      },
    });

    aborted = true;
    abortedAtTurn = outcome.turnOccurred;
  }

  return {
    currentHp,
    currentStamina,
    currentMana,
    aborted,
    abortedAtTurn,
    wasKnockedOut,
    respawnedTo,
  };
}
