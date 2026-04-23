import { Router } from 'express';
import { prisma } from '@pocketrealm/database';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  getScaledZoneExitChance,
  simulateExploration,
  validateExplorationTurns,
} from '@pocketrealm/game-engine';
import {
  EXPLORATION_CONSTANTS,
  PREMIUM_CONSTANTS,
  getUnlockedTiers,
  getHighestUnlockedTier,
  type PotionConsumed,
  type QuestProgressUpdate,
  EXPLORATION_TRACKING_CONSTANTS,
  TUTORIAL_STEP_EXPLORE,
} from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { refundPlayerTurns, spendPlayerTurnsTx } from '../../services/turnBankService';
import { applyGuildTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { trackProgress } from '../../services/progressService';
import { setAllResources } from '../../services/resourceService';
import { assertCanAct, assertInZone, trackAchievements } from '../../utils/routeHelpers.js';
import { preparePlayerForCombat } from '../../services/combatOrchestrationService';
import { getEquipmentStats } from '../../services/equipmentService';
import { getPlayerProgressionState } from '../../services/attributesService';
import { discoverZone, getUndiscoveredNeighborZones } from '../../services/zoneDiscoveryService';
import { addExplorationTurns, calculateExplorationPercent, getExplorationPercent } from '../../services/zoneExplorationService';
import { computeZoneModifiers, computeSpawnRateModifiers, getActiveEventsForZone, getActiveWorldWideEvents } from '../../services/worldEventService';
import { checkAndSpawnEvents } from '../../services/eventSchedulerService';
import { getIo } from '../../socket';
import { deductConsumedPotions } from '../../services/potionService';
import { getCombatBuffsWithUses } from '../../services/buffService';
import { getMainHandAttackSkill } from '../../services/combatStatsService';
import { checkActivityLockout } from '../../services/expeditionLockoutService';
import { buildStateUpdates, mergeLootIntoStateUpdates } from '../../services/stateUpdateHelpers';
import { getHasActivePremiumEntitlement } from '../../services/premiumEntitlement';
import {
  getCachedMobTemplatesByZone,
  getCachedResourceNodesByZone,
  getCachedZoneMobFamilies,
} from '../../services/staticDataCacheService';
import { buildTrackableMobFamiliesByZone } from '../../services/explorationTrackingService';
import { processExplorationOutcomes } from '../../services/explorationOutcomeService';
import { persistExplorationResults } from '../../services/explorationPersistenceService';
import {
  startSchema,
  type ZoneFamilyRow,
} from './helpers';
import { requireActiveSeason } from '../../middleware/seasonGuard';


export const startRouter = Router();
startRouter.use(requireActiveSeason);

function familyHasEligibleMembersForTier(
  family: ZoneFamilyRow,
  zoneId: string,
  selectedTier: number,
): boolean {
  return family.mobFamily.members.some((member) =>
    member.mobTemplate.zoneId === zoneId && (member.mobTemplate.explorationTier ?? 1) <= selectedTier,
  );
}


/**
 * POST /api/v1/exploration/start
 * Spend turns to explore a zone and return discovered outcomes.
 */
startRouter.post('/start', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    await checkActivityLockout(playerId);
    const body = startSchema.parse(req.body);

    const hpState = await assertCanAct(playerId);
    if (hpState.currentHp <= 0) {
      throw new AppError(400, 'Cannot explore with 0 HP. Rest before exploring.', 'NO_HP');
    }

    await assertInZone(playerId, body.zoneId);

    const validation = validateExplorationTurns(body.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    const playerRecord = await prisma.player.findUnique({
      where: { id: playerId },
      select: { tutorialStep: true },
    });
    const isTutorialExplore = playerRecord?.tutorialStep === TUTORIAL_STEP_EXPLORE;
    const trackingFamilyId = isTutorialExplore ? null : body.trackingFamilyId ?? null;
    let effectiveTrackingFamilyId = trackingFamilyId;

    const zone = await prisma.zone.findUnique({ where: { id: body.zoneId } });
    if (!zone) {
      throw new AppError(404, 'Zone not found', 'NOT_FOUND');
    }
    if (zone.zoneType === 'town') {
      throw new AppError(400, 'Cannot explore in towns. Travel to a wild zone first.', 'TOWN_ZONE');
    }

    const [mobTemplates, resourceNodes, zoneFamilies, progression, equipmentStats, mainHandAttackSkill] = await Promise.all([
      getCachedMobTemplatesByZone(body.zoneId),
      getCachedResourceNodesByZone(body.zoneId),
      getCachedZoneMobFamilies(body.zoneId) as Promise<ZoneFamilyRow[]>,
      getPlayerProgressionState(playerId),
      getEquipmentStats(playerId),
      getMainHandAttackSkill(playerId),
    ]);

    // Prepare player combat data (using pre-fetched equipment/progression/weapon)
    const combatPrep = await preparePlayerForCombat(playerId, {
      maxHp: hpState.maxHp,
      preloaded: { mainHandAttackSkill, equipmentStats, progression },
    });

    // Quest shop combat buffs — track remaining uses for per-ambush consumption
    const { buffs: combatBuffs, uses: buffUsesLeft } = await getCombatBuffsWithUses(playerId);

    const explorationProgress = await getExplorationPercent(playerId, body.zoneId);
    const zoneTiers = zone.explorationTiers as Record<string, number> | null;

    // Determine unlocked tiers and selected tier
    const unlockedTiers = getUnlockedTiers(explorationProgress.percent, zoneTiers);
    const maxUnlockedTier = getHighestUnlockedTier(explorationProgress.percent, zoneTiers);
    const selectedTier = trackingFamilyId ? maxUnlockedTier : (body.tier ?? maxUnlockedTier);

    if (!trackingFamilyId && body.tier !== undefined && !unlockedTiers.includes(selectedTier)) {
      throw new AppError(400, `Tier ${selectedTier} is not unlocked. Max unlocked: ${maxUnlockedTier}`, 'INVALID_TIER');
    }

    if (trackingFamilyId) {
      const trackableFamiliesByZone = await buildTrackableMobFamiliesByZone(playerId, [body.zoneId]);
      const unlockedFamilies = trackableFamiliesByZone.get(body.zoneId) ?? [];
      if (!unlockedFamilies.some((family) => family.mobFamilyId === trackingFamilyId)) {
        throw new AppError(400, 'That mob family is not unlocked for tracking in this zone.', 'INVALID_TRACKING_FAMILY');
      }

      const trackingFamily = zoneFamilies.find((family) => family.mobFamilyId === trackingFamilyId);
      if (!trackingFamily || !familyHasEligibleMembersForTier(trackingFamily, body.zoneId, selectedTier)) {
        effectiveTrackingFamilyId = null;
      }
    }

    const undiscoveredNeighbors = await getUndiscoveredNeighborZones(playerId, body.zoneId);
    const rawExitChance = undiscoveredNeighbors.length > 0 ? zone.zoneExitChance : null;
    const effectiveExitChance = rawExitChance != null && rawExitChance > 0
      ? getScaledZoneExitChance(rawExitChance, explorationProgress.percent)
      : null;

    // Pre-fetch connection thresholds for zone exit gating (used inside the loop)
    const connectionThresholds = undiscoveredNeighbors.length > 0
      ? await prisma.zoneConnection.findMany({
          where: { fromId: body.zoneId },
          select: { toId: true, explorationThreshold: true },
        })
      : [];
    const thresholdByToId = new Map(connectionThresholds.map(c => [c.toId, c.explorationThreshold]));

    // Trigger lazy event scheduler
    await checkAndSpawnEvents(getIo());

    // Fetch raw events once; derive modifiers synchronously (avoids redundant DB queries)
    const [cachedZoneEvents, cachedWorldEvents] = await Promise.all([
      getActiveEventsForZone(body.zoneId),
      getActiveWorldWideEvents(),
    ]);
    const zoneModifiers = computeZoneModifiers(cachedZoneEvents, cachedWorldEvents);
    const spawnMods = computeSpawnRateModifiers(cachedZoneEvents, cachedWorldEvents);

    // Build mob → family lookup for per-mob event targeting
    const mobToFamilyMap = new Map<string, string>();
    for (const zf of zoneFamilies) {
      for (const member of (zf as ZoneFamilyRow).mobFamily.members) {
        mobToFamilyMap.set(member.mobTemplate.id, zf.mobFamilyId);
      }
    }

    // Tutorial detection
    // Tutorial explore step: force 100 turns and a single guaranteed ambush
    const turnsToSpend = isTutorialExplore ? 100 : body.turns;

    // Spend turns and apply guild tax atomically
    const { turnSpend, taxResult } = await prisma.$transaction(async (tx) => {
      const spend = await spendPlayerTurnsTx(tx, playerId, turnsToSpend);
      const tax = await applyGuildTaxTx(tx, playerId, turnsToSpend);
      return { turnSpend: spend, taxResult: tax };
    });

    // Guild tax reduces effective exploration turns
    const effectiveTurns = isTutorialExplore ? turnsToSpend : taxResult.postTaxAmount;

    // Compute aggregate spawn rate multiplier from per-family and global event modifiers
    let spawnRateMultiplier = 1;
    if (zoneFamilies.length > 0) {
      const baseTotal = zoneFamilies.reduce((sum: number, f: ZoneFamilyRow) => sum + f.discoveryWeight, 0);
      const adjustedTotal = zoneFamilies.reduce((sum: number, f: ZoneFamilyRow) => {
        const familyMod = spawnMods.byFamily.get(f.mobFamilyId) ?? 1;
        return sum + f.discoveryWeight * familyMod * spawnMods.global;
      }, 0);
      spawnRateMultiplier = baseTotal > 0 ? adjustedTotal / baseTotal : 1;
    }
    if (effectiveTrackingFamilyId) {
      spawnRateMultiplier *= EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER;
    }

    const hasChampion = await getHasActivePremiumEntitlement(prisma, playerId);
    const hiddenCacheChance = hasChampion
      ? EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE * PREMIUM_CONSTANTS.BONUS_MULTIPLIER
      : null;

    const outcomes = isTutorialExplore
      ? [{ turnOccurred: 50, type: 'ambush' as const }]
      : simulateExploration(effectiveTurns, effectiveExitChance, spawnRateMultiplier, hiddenCacheChance);

    // --- Process all outcome events ---
    const outcomeResult = await processExplorationOutcomes(
      {
        playerId,
        username: req.player!.username,
        zoneId: body.zoneId,
        zone: { id: zone.id, name: zone.name, difficulty: zone.difficulty },
        hpState,
        combatPrep,
        combatBuffs,
        buffUsesLeft,
        progression,
        equipmentStats,
        mobTemplates,
        zoneFamilies,
        zoneTiers,
        selectedTier,
        explorationProgress,
        zoneModifiers,
        spawnMods,
        mobToFamilyMap,
        trackingFamilyId: effectiveTrackingFamilyId,
        cachedZoneEvents,
        cachedWorldEvents,
        isTutorialExplore,
        resourceNodes,
        undiscoveredNeighbors,
        thresholdByToId,
      },
      outcomes,
    );

    const {
      events,
      pendingResources,
      pendingSites,
      pendingCombatLogs,
      pendingCacheLoot,
      hiddenCaches,
      allPotionsConsumed,
      ambushPendingLootSessionIds,
      allNewItemIds,
      allUpdatedItemIds,
      allQuestProgress,
      currentHp,
      currentStamina,
      currentMana,
      aborted,
      abortedAtTurn,
      wasKnockedOut,
      respawnedTo,
      zoneExitDiscovered,
    } = outcomeResult;

    // Deduct all potions consumed across ambushes
    await deductConsumedPotions(playerId, allPotionsConsumed as PotionConsumed[]);

    // Persist stamina/mana after all ambush combats
    await setAllResources(playerId, currentHp, currentStamina, currentMana);

    const spentTurns = aborted && abortedAtTurn ? abortedAtTurn : effectiveTurns;
    const explorationTurnsToAdd = selectedTier === maxUnlockedTier ? spentTurns : 0;
    const explorationBefore = explorationProgress;
    if (explorationTurnsToAdd > 0) {
      await addExplorationTurns(playerId, body.zoneId, explorationTurnsToAdd, {
        turnsToExplore: explorationProgress.turnsToExplore,
        currentTurnsExplored: explorationProgress.turnsExplored,
      });
    }
    const explorationAfter = explorationTurnsToAdd > 0
      ? await getExplorationPercent(playerId, body.zoneId)
      : explorationBefore;
    const zoneJustFullyExplored = explorationBefore.percent < 100 && explorationAfter.percent >= 100;

    // Auto-discover undiscovered neighbors when zone reaches 100%
    let finalZoneExitDiscovered = zoneExitDiscovered;
    const remainingUndiscovered = [...undiscoveredNeighbors].filter(
      (n) => !events.some((e) => e.type === 'zone_exit' && (e.details as Record<string, unknown>)?.discoveredZoneId === n.id),
    );
    if (zoneJustFullyExplored && remainingUndiscovered.length > 0) {
      const autoDiscoverNeighbors = remainingUndiscovered.filter((n) => {
        const threshold = thresholdByToId.get(n.id) ?? 0;
        return explorationAfter.percent >= threshold;
      });
      for (const neighbor of autoDiscoverNeighbors) {
        await discoverZone(playerId, neighbor.id);
        finalZoneExitDiscovered = true;
        events.push({
          turn: effectiveTurns,
          type: 'zone_exit',
          description: `Zone fully explored! You discovered ${neighbor.name}.`,
          details: {
            discoveredZoneId: neighbor.id,
            discoveredZoneName: neighbor.name,
          },
        });
      }
    }

    const refundAmount = aborted && abortedAtTurn ? Math.max(0, effectiveTurns - abortedAtTurn) : 0;
    const refundedTurns = refundAmount > 0 ? await refundPlayerTurns(playerId, refundAmount) : null;

    // --- Persist all results ---
    const persisted = await persistExplorationResults({
      playerId,
      zoneId: body.zoneId,
      zoneName: zone.name,
      turnsToSpend,
      aborted,
      abortedAtTurn,
      refundAmount,
      events,
      pendingResources,
      pendingSites,
      pendingCombatLogs,
      pendingCacheLoot,
      hiddenCaches,
      allNewItemIds,
      allUpdatedItemIds,
      currentHp,
      zoneExitDiscovered: finalZoneExitDiscovered,
      luck: progression.attributes.luck as number,
    });

    // Collect all pending loot session IDs from both ambush and cache overflow
    const pendingLootSessionIds = [
      ...ambushPendingLootSessionIds,
      ...(persisted.cachePendingLootSessionId ? [persisted.cachePendingLootSessionId] : []),
    ];

    // Assign combatLogIds to ambush events and strip full combat logs from response
    let combatLogIdx = 0;
    for (const event of events) {
      if ((event.type === 'ambush_victory' || event.type === 'ambush_defeat') && event.details) {
        event.details.combatLogId = persisted.combatLogIds[combatLogIdx++];
        delete event.details.log;
      }
    }

    // --- Achievement tracking (counter-only + derived checks) ---
    const explorationCounters: Record<string, number> = {};
    if (spentTurns > 0) explorationCounters.totalTurnsSpent = spentTurns;
    if (wasKnockedOut) explorationCounters.totalDeaths = 1;

    // Build family IDs from ambush victories for family achievement checks
    const mobTemplateToFamilyId = new Map<string, string>();
    for (const zf of zoneFamilies) {
      for (const member of (zf as ZoneFamilyRow).mobFamily.members) {
        mobTemplateToFamilyId.set(member.mobTemplate.id, zf.mobFamilyId);
      }
    }
    const familyIdSet = new Set<string>();
    let ambushKillCount = 0;
    for (const ev of events) {
      if (ev.type === 'ambush_victory') {
        ambushKillCount++;
        const mobTemplateId = (ev.details as Record<string, unknown>)?.mobTemplateId as string | undefined;
        if (mobTemplateId) {
          const familyId = mobTemplateToFamilyId.get(mobTemplateId);
          if (familyId) familyIdSet.add(familyId);
        }
      }
    }

    const explorationAchievementKeys: string[] = ['totalTurnsSpent'];
    if (ambushKillCount > 0) explorationAchievementKeys.push('totalKills', 'totalUniqueMonsterKills', 'totalBestiaryCompleted');
    if (finalZoneExitDiscovered) explorationAchievementKeys.push('totalZonesDiscovered');
    if (zoneJustFullyExplored) explorationAchievementKeys.push('totalZonesFullyExplored');
    if (wasKnockedOut) explorationAchievementKeys.push('totalDeaths');

    await trackAchievements(playerId, explorationCounters, {
      statKeys: explorationAchievementKeys,
      familyIds: [...familyIdSet],
    });

    // Guild contract + quest progress: track exploration turns
    const explorationQuestProgress = await trackProgress(playerId, 'exploration_turns', spentTurns);
    const combinedQuestProgress: QuestProgressUpdate[] = [...allQuestProgress, ...explorationQuestProgress];

    // Track chest_open quest progress for hidden caches found
    if (hiddenCaches.length > 0) {
      const chestProgress = await trackProgress(playerId, 'chest_open', hiddenCaches.length);
      combinedQuestProgress.push(...chestProgress);
    }

    if (events.length === 0) {
      events.push({
        turn: effectiveTurns,
        type: 'hidden_cache',
        description: `You explored the ${zone.name} for ${effectiveTurns} turns but found nothing of interest.`,
        details: {},
      });
    }

    const stateUpdates = await buildStateUpdates(playerId, ['hp', 'resources']);
    await mergeLootIntoStateUpdates(playerId, allNewItemIds, allUpdatedItemIds, stateUpdates);

    res.json({
      logId: persisted.logId,
      zone: {
        id: zone.id,
        name: zone.name,
        difficulty: zone.difficulty,
      },
      turns: refundAmount > 0 && refundedTurns ? refundedTurns : turnSpend,
      aborted,
      refundedTurns: refundAmount,
      events,
      encounterSites: persisted.encounterSites,
      resourceDiscoveries: persisted.resourceDiscoveries,
      hiddenCaches,
      zoneExitDiscovered: finalZoneExitDiscovered,
      ...(respawnedTo ? { respawnedTo } : {}),
      ...(pendingLootSessionIds.length > 0 ? { pendingLootSessionIds } : {}),
      explorationProgress: {
        turnsExplored: explorationProgress.turnsExplored + explorationTurnsToAdd,
        percent: calculateExplorationPercent(explorationProgress.turnsExplored + explorationTurnsToAdd, explorationProgress.turnsToExplore),
        turnsToExplore: explorationProgress.turnsToExplore,
      },
      tax: taxInfoFromResult(taxResult),
      ...(combinedQuestProgress.length > 0 ? { questProgress: combinedQuestProgress } : {}),
      stateUpdates,
    });
}));
