import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@pocketrealm/database';
import { createActivityLog } from '../services/activityLogService';
import {
  buildPlayerCombatStats,
  applyMobPrefix,
  rollMobPrefix,
  simulateTravelAmbushes,
  mobToTemplateCombatant,
  filterAndWeightMobsByTier,
  runTemplateCombat,
} from '@pocketrealm/game-engine';
import { DURABILITY_CONSTANTS, CACHE_HEADER_CONSTANTS, type PotionConsumed } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { refundPlayerTurns } from '../services/turnBankService';
import { getHpState, enterRecoveringState, setHp } from '../services/hpService';
import { storePendingLoot, type PendingLootItem } from '../services/pendingLootService';
import { serializeXpGrant, toMobTemplate, trackAchievements, calculateFleeWithGold, buildPveCombatOptions } from '../utils/routeHelpers.js';
import { preparePlayerForCombat, buildPlayerTemplateCombatant, applyGuildCombatModifiers, processCombatVictoryRewards, buildCombatLogResult } from '../services/combatOrchestrationService';
import { pickWeighted } from '../utils/pickWeighted.js';
import { degradeEquippedDurability } from '../services/durabilityService';
import { deductConsumedPotions } from '../services/potionService';
import {
  ensureStarterDiscoveries,
  getDiscoveredZoneIds,
  discoverZonesFromTown,
  respawnToHomeTown,
} from '../services/zoneDiscoveryService';
import { setAllResources } from '../services/resourceService';
import { mapTemplateCombatLog } from '../services/combatLogMapper';
import { calculateExplorationPercent, getExplorationPercent } from '../services/zoneExplorationService';
import { asyncHandler } from '../utils/asyncHandler';
import { assertNotOverEncumbered } from '../services/inventoryService';
import { spendWithTaxTx, taxInfoFromResult } from '../services/guildTaxService';
import { buildStateUpdates, mergeLootIntoStateUpdates } from '../services/stateUpdateHelpers';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { getActiveEventsForZone, getActiveWorldWideEvents, filterEventModifiers } from '../services/worldEventService';
import { trackProgress } from '../services/progressService';
import { checkActivityLockout } from '../services/expeditionLockoutService';
import { getCachedZones, getCachedZoneConnections, getCachedMobTemplatesByZone } from '../services/staticDataCacheService';
import { invalidateZoneIdCache } from '../services/zoneService';



export const zonesRouter = Router();

zonesRouter.use(authenticate);

/**
 * GET /api/v1/zones
 * Returns zones with discovery state, connections between discovered zones, and currentZoneId.
 */
zonesRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  // Lazy-init starter discoveries for this player
  await ensureStarterDiscoveries(playerId);

  // Fetch all data in parallel
  const [zones, connections, discoveredZoneIds, player, explorations] = await Promise.all([
    getCachedZones(),
    getCachedZoneConnections(),
    getDiscoveredZoneIds(playerId),
    prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } }),
    prisma.playerZoneExploration.findMany({
      where: { playerId },
      select: { zoneId: true, turnsExplored: true },
    }),
  ]);
  const explorationByZoneId = new Map<string, number>(
    (explorations as Array<{ zoneId: string; turnsExplored: number }>).map(
      (e: { zoneId: string; turnsExplored: number }) => [e.zoneId, e.turnsExplored],
    ),
  );

  if (zones.length === 0) {
    throw new AppError(500, 'No zones configured. Run database seed.', 'NO_ZONES_CONFIGURED');
  }

  // Lazy-init currentZoneId if null (existing players from before this feature)
  let currentZoneId = player?.currentZoneId ?? null;
  if (!currentZoneId) {
    const starterZone = await prisma.zone.findFirst({ where: { isStarter: true } });
    if (starterZone) {
      currentZoneId = starterZone.id;
      await prisma.player.update({
        where: { id: playerId },
        data: { currentZoneId: starterZone.id, homeTownId: starterZone.id },
      });
      void invalidateZoneIdCache(playerId);
    }
  }

  // Only include connections where both endpoints are discovered
  const filteredConnections = connections.filter(
    (c: { fromId: string; toId: string; explorationThreshold: number | null }) =>
      discoveredZoneIds.has(c.fromId) && discoveredZoneIds.has(c.toId),
  );

  // Build undiscovered zone hints from connections leading to undiscovered zones
  const seenUndiscovered = new Set<string>();
  const undiscoveredHints = connections
    .filter((c: { fromId: string; toId: string; explorationThreshold: number | null }) =>
      discoveredZoneIds.has(c.fromId) && !discoveredZoneIds.has(c.toId)
    )
    .filter((c: { toId: string }) => {
      if (seenUndiscovered.has(c.toId)) return false;
      seenUndiscovered.add(c.toId);
      return true;
    })
    .map((c: { fromId: string; toId: string; explorationThreshold: number | null }) => ({
      id: c.toId,
      name: '???',
      explorationThreshold: c.explorationThreshold ?? 0,
      fromZoneId: c.fromId,
      discovered: false as const,
    }));

  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PRIVATE_SHORT);
  res.json({
    zones: zones.map((z) => {
      const discovered = discoveredZoneIds.has(z.id);
      return {
        id: z.id,
        name: discovered ? z.name : '???',
        description: discovered ? z.description : null,
        difficulty: discovered ? z.difficulty : 0,
        travelCost: discovered ? z.travelCost : 0,
        isStarter: z.isStarter,
        discovered,
        zoneType: z.zoneType,
        zoneExitChance: discovered ? z.zoneExitChance : null,
        maxCraftingLevel: discovered ? z.maxCraftingLevel : null,
        arrivalText: discovered ? z.arrivalText : null,
        ambientTexts: discovered ? z.ambientTexts : null,
        environmentalTexts: discovered ? z.environmentalTexts : null,
        exploration: z.zoneType === 'town' ? null : {
          turnsExplored: explorationByZoneId.get(z.id) ?? 0,
          turnsToExplore: z.turnsToExplore ?? null,
          percent: calculateExplorationPercent(explorationByZoneId.get(z.id) ?? 0, z.turnsToExplore ?? null),
          tiers: z.explorationTiers ?? null,
        },
      };
    }),
    connections: filteredConnections.map((c: { fromId: string; toId: string; explorationThreshold: number | null }) => ({
      fromId: c.fromId,
      toId: c.toId,
      explorationThreshold: c.explorationThreshold ?? 0,
    })),
    undiscoveredZones: undiscoveredHints,
    currentZoneId,
  });
}));

const travelSchema = z.object({
  zoneId: z.string().uuid(),
});

interface TravelEvent {
  turn: number;
  type: string;
  description: string;
  details?: Record<string, unknown>;
}

/**
 * POST /api/v1/zones/travel
 * Travel between discovered, connected zones. Costs turns and may trigger ambushes in the wild.
 */
zonesRouter.post('/travel', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = travelSchema.parse(req.body);
  const destinationId = body.zoneId;

  // 1. Get player with zone info
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: {
      currentZoneId: true,
      lastTravelledFromZoneId: true,
      homeTownId: true,
    },
  });

  if (!player.currentZoneId) {
    throw new AppError(400, 'Player has no current zone', 'NO_CURRENT_ZONE');
  }

  const currentZoneId: string = player.currentZoneId;

  // 2. Can't travel to where you already are
  if (destinationId === currentZoneId) {
    throw new AppError(400, 'Already in this zone', 'ALREADY_IN_ZONE');
  }

  // 3. Can't travel while recovering, at 0 HP, or on an expedition
  const hpState = await getHpState(playerId);
  if (hpState.isRecovering || hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot travel while recovering', 'IS_RECOVERING');
  }
  await checkActivityLockout(playerId);
  await assertNotOverEncumbered(playerId);

  // 4. Validate destination is discovered
  const discovery = await prisma.playerZoneDiscovery.findUnique({
    where: { playerId_zoneId: { playerId, zoneId: destinationId } },
  });
  if (!discovery) {
    throw new AppError(400, 'Zone not discovered', 'ZONE_NOT_DISCOVERED');
  }

  // 5. Validate connection exists
  const connection = await prisma.zoneConnection.findUnique({
    where: { fromId_toId: { fromId: currentZoneId, toId: destinationId } },
  });
  if (!connection) {
    throw new AppError(400, 'No path to that zone', 'NO_CONNECTION');
  }

  // 6. Get current zone and destination zone data
  const [currentZone, destinationZone] = await Promise.all([
    prisma.zone.findUniqueOrThrow({ where: { id: currentZoneId } }),
    prisma.zone.findUniqueOrThrow({ where: { id: destinationId } }),
  ]);

  // Helper to fetch current turn state for the response
  const getTurnSnapshot = async () => {
    const turnBank = await prisma.turnBank.findUnique({ where: { playerId } });
    if (!turnBank) return null;
    return {
      currentTurns: turnBank.currentTurns,
      timeToCapMs: null,
      lastRegenAt: turnBank.lastRegenAt.toISOString(),
    };
  };

  // 7. BREADCRUMB RETURN: free travel back to where you came from
  if (destinationId === player.lastTravelledFromZoneId) {
    await prisma.player.update({
      where: { id: playerId },
      data: {
        currentZoneId: destinationId,
        lastTravelledFromZoneId: currentZoneId,
      },
    });
    await invalidateZoneIdCache(playerId);

    let newDiscoveries: Array<{ id: string; name: string }> = [];
    if (destinationZone.zoneType === 'town') {
      await prisma.player.update({
        where: { id: playerId },
        data: { homeTownId: destinationId },
      });
      const discoveredIds = await discoverZonesFromTown(playerId, destinationId);
      const discoveredZones = await prisma.zone.findMany({
        where: { id: { in: discoveredIds } },
        select: { id: true, name: true },
      });
      newDiscoveries = discoveredZones;
    }

    void trackProgress(playerId, 'zone_travel', 1);

    const breadcrumbStateUpdates = await buildStateUpdates(playerId, ['hp', 'resources']);
    breadcrumbStateUpdates.currentZoneId = destinationZone.id;
    res.json({
      zone: { id: destinationZone.id, name: destinationZone.name, zoneType: destinationZone.zoneType },
      turns: await getTurnSnapshot(),
      travelCost: 0,
      breadcrumbReturn: true,
      events: [],
      aborted: false,
      refundedTurns: 0,
      respawnedTo: null,
      newDiscoveries,
      tax: null,
      stateUpdates: breadcrumbStateUpdates,
    });
    return;
  }

  // 8. Determine travel cost
  // Town departure: destination's travelCost, no ambushes
  // Wild traversal: current zone's travelCost, ambushes from current zone
  const isTownDeparture = currentZone.zoneType === 'town';
  const baseTravelCost: number = isTownDeparture ? destinationZone.travelCost : currentZone.travelCost;
  const guildMods = await getPlayerGuildModifiers(playerId);
  const guildReducedCost = guildMods.travelCostReduction > 0
    ? Math.max(1, Math.round(baseTravelCost * (1 - guildMods.travelCostReduction)))
    : baseTravelCost;

  // 9. Atomically inflate by guild tax, spend turns, and route tax to treasury
  const { turnSpend: travelTurnSpend, taxResult } = await prisma.$transaction(
    async (tx) => spendWithTaxTx(tx, playerId, guildReducedCost),
  );
  const travelCost = travelTurnSpend.spent;

  const events: TravelEvent[] = [];

  // Achievement tracking accumulators for ambush encounters
  let ambushKillCount = 0;
  const ambushMobFamilyIds: string[] = [];


  // 10. Run travel ambushes (only for wild traversal)
  let travelPendingLootSessionId: string | null = null;
  const allTravelNewItemIds: string[] = [];
  const allTravelUpdatedItemIds: string[] = [];

  if (!isTownDeparture) {
    const ambushes = simulateTravelAmbushes(guildReducedCost);

    if (ambushes.length > 0) {
      const allPotionsConsumed: PotionConsumed[] = [];

      // Prepare player combat data (parallelized) + zone-specific data
      const [combatPrep, mobTemplates, explorationProgress, travelZoneEvents, travelWorldEvents, mobFamilyMembers] = await Promise.all([
        preparePlayerForCombat(playerId, { maxHp: hpState.maxHp, preloaded: { guildMods } }),
        getCachedMobTemplatesByZone(currentZoneId),
        getExplorationPercent(playerId, currentZoneId),
        getActiveEventsForZone(currentZoneId),
        getActiveWorldWideEvents(),
        prisma.mobFamilyMember.findMany({
          where: { mobTemplate: { zoneId: currentZoneId } },
          select: { mobTemplateId: true, mobFamilyId: true },
        }),
      ]);

      const { attackSkill, attackLevel, progression, equipmentStats, perActionScaling, playerTemplate, potionPool, resources, unlockedActions } = combatPrep;
      // Pre-build mob→family lookup to avoid N+1 queries in the loop
      const mobToFamilyMap = new Map(mobFamilyMembers.map(m => [m.mobTemplateId, m.mobFamilyId]));

      const zoneTiers = currentZone.explorationTiers as Record<string, number> | null;
      const tieredMobs = filterAndWeightMobsByTier(
        mobTemplates.map(m => ({
          ...m,
          explorationTier: m.explorationTier ?? 1,
        })),
        explorationProgress.percent,
        zoneTiers,
      );

      let currentStamina = resources.stamina;
      let currentMana = resources.mana;
      let currentHp = hpState.currentHp;
      let ambushAbort: {
        type: 'knockout';
        respawn: Awaited<ReturnType<typeof respawnToHomeTown>>;
        refundAmount: number;
        newDiscoveries: Array<{ id: string; name: string }>;
      } | {
        type: 'flee';
        refundAmount: number;
      } | null = null;

      const allTravelOverflow: PendingLootItem[] = [];

      for (const ambush of ambushes) {
        if (tieredMobs.length === 0) break;

        const rawMob = pickWeighted(tieredMobs, m => m.encounterWeight) ?? tieredMobs[0]!;
        const baseMob = toMobTemplate(rawMob);
        const prefixedMob = applyMobPrefix(baseMob, rollMobPrefix());

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
        applyGuildCombatModifiers(playerStats, guildMods);

        const combatantA = buildPlayerTemplateCombatant({
          playerId,
          username: req.player!.username,
          playerStats,
          template: playerTemplate,
          stamina: currentStamina,
          maxStamina: resources.maxStamina,
          staminaRegenPerRound: resources.staminaRegenPerRound,
          mana: currentMana,
          maxMana: resources.maxMana,
          manaRegenPerRound: resources.manaRegenPerRound,
          unlockedActions,
          perActionScaling,
        });
        const combatantB = mobToTemplateCombatant(prefixedMob);
        const combatOptions = buildPveCombatOptions(potionPool);
        const combatResult = runTemplateCombat(combatantA, combatantB, combatOptions);
        currentHp = combatResult.combatantAHpRemaining;
        currentStamina = combatResult.combatantAStaminaRemaining;
        currentMana = combatResult.combatantAManaRemaining;

        // Remove consumed potions from the shared pool
        for (const consumed of combatResult.potionsConsumed) {
          const idx = potionPool.findIndex(p => p.templateId === consumed.templateId);
          if (idx !== -1) potionPool.splice(idx, 1);
          allPotionsConsumed.push(consumed);
        }

        const travelDurabilityMult = prefixedMob.mobPrefix
          ? DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.elite
          : DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.default;
        const durabilityLost = await degradeEquippedDurability(playerId, combatResult.log, 'combatantA', travelDurabilityMult);
        for (const d of durabilityLost) allTravelUpdatedItemIds.push(d.itemId);

        // Resolve mob family for event badges + achievement tracking (pre-fetched)
        const travelMobFamilyId = mobToFamilyMap.get(prefixedMob.id) ?? null;
        const travelMobBadges = travelMobFamilyId
          ? filterEventModifiers(travelZoneEvents, travelWorldEvents, { mobFamilyId: travelMobFamilyId })
          : [];

        if (combatResult.outcome === 'victory') {
          const rewards = await processCombatVictoryRewards({
            playerId,
            mob: prefixedMob,
            attackSkill,
            damageByScalingStat: combatResult.damageByScalingStat,
            resourceCostByScalingStat: combatResult.resourceCostByScalingStat,
          });
          const loot = rewards.loot;
          allTravelOverflow.push(...rewards.overflow);
          allTravelNewItemIds.push(...rewards.newItemIds);
          allTravelUpdatedItemIds.push(...rewards.updatedItemIds);
          const xpGain = rewards.xpGrants.reduce((sum, g) => sum + g.boostedXpAfterEfficiency, 0);
          await setHp(playerId, currentHp);

          // Track ambush kill for achievement checks
          ambushKillCount++;
          if (travelMobFamilyId) {
            ambushMobFamilyIds.push(travelMobFamilyId);
          }

          await createActivityLog({
            playerId,
            activityType: 'combat',
            turnsSpent: 0,
            result: buildCombatLogResult({
              zoneId: currentZoneId,
              zoneName: currentZone.name,
              mob: { id: prefixedMob.id, name: baseMob.name, mobPrefix: prefixedMob.mobPrefix, mobDisplayName: prefixedMob.mobDisplayName },
              source: 'travel_ambush',
              encounterSiteId: null,
              attackSkill,
              combatResult,
              rewards: {
                xp: prefixedMob.xpReward,
                baseXp: prefixedMob.xpReward,
                loot,
                durabilityLost,
                skillXpGrants: rewards.xpGrants.map(serializeXpGrant),
              },
              eventModifiers: travelMobBadges,
            }),
          });

          events.push({
            turn: ambush.turnOccurred,
            type: 'ambush_victory',
            description: `Ambushed by ${prefixedMob.mobDisplayName}! You defeated it. (+${xpGain} XP)`,
            details: {
              mobName: baseMob.name,
              mobDisplayName: prefixedMob.mobDisplayName,
              outcome: combatResult.outcome,
              playerMaxHp: combatResult.combatantAMaxHp,
              mobMaxHp: combatResult.combatantBMaxHp,
              log: mapTemplateCombatLog(combatResult.log),
              xp: xpGain,
              loot,
              durabilityLost,
            },
          });
        } else {
          // Player lost — calculate flee result and deduct gold loss
          const fleeResult = await calculateFleeWithGold(playerId, {
            evasionLevel: progression.attributes.evasion,
            mobLevel: prefixedMob.level,
            maxHp: hpState.maxHp,
          });

          if (fleeResult.outcome === 'knockout') {
            currentHp = 0;
            await enterRecoveringState(playerId, hpState.maxHp);
            const respawn = await respawnToHomeTown(playerId);

            await createActivityLog({
              playerId,
              activityType: 'combat',
              turnsSpent: 0,
              result: buildCombatLogResult({
                zoneId: currentZoneId,
                zoneName: currentZone.name,
                mob: { id: prefixedMob.id, name: baseMob.name, mobPrefix: prefixedMob.mobPrefix, mobDisplayName: prefixedMob.mobDisplayName },
                source: 'travel_ambush',
                encounterSiteId: null,
                attackSkill,
                combatResult,
                rewards: { xp: 0, baseXp: 0, loot: [], durabilityLost, skillXpGrants: [] },
                eventModifiers: travelMobBadges,
              }),
            });

            events.push({
              turn: ambush.turnOccurred,
              type: 'ambush_defeat',
              description: `Ambushed by ${prefixedMob.mobDisplayName}! You were knocked out.`,
              details: {
                mobName: baseMob.name,
                mobDisplayName: prefixedMob.mobDisplayName,
                outcome: combatResult.outcome,
                playerMaxHp: combatResult.combatantAMaxHp,
                mobMaxHp: combatResult.combatantBMaxHp,
                log: mapTemplateCombatLog(combatResult.log),
                fleeResult: { outcome: fleeResult.outcome, remainingHp: fleeResult.remainingHp },
                durabilityLost,
              },
            });

            // Use pre-tax cost for refund to prevent turn inflation from guild tax
            const refundAmount = guildReducedCost - ambush.turnOccurred;
            if (refundAmount > 0) {
              await refundPlayerTurns(playerId, refundAmount);
            }

            const discoveredIds = await discoverZonesFromTown(playerId, respawn.townId);
            const discoveredZones = await prisma.zone.findMany({
              where: { id: { in: discoveredIds } },
              select: { id: true, name: true },
            });

            // --- Achievement tracking (counters + derived checks) ---
            const koCounters: Record<string, number> = { totalDeaths: 1 };
            const netTurnsKo = ambush.turnOccurred;
            if (netTurnsKo > 0) koCounters.totalTurnsSpent = netTurnsKo;

            const koAchievementKeys = ['totalDeaths', 'totalTurnsSpent'];
            if (ambushKillCount > 0) koAchievementKeys.push('totalKills', 'totalUniqueMonsterKills', 'totalBestiaryCompleted');
            if (discoveredZones.length > 0) koAchievementKeys.push('totalZonesDiscovered');
            await trackAchievements(playerId, koCounters, { statKeys: koAchievementKeys, familyIds: ambushMobFamilyIds });

            ambushAbort = { type: 'knockout', respawn, refundAmount, newDiscoveries: discoveredZones };
            break;
          } else {
            // Fled — abort travel, stay in current zone
            currentHp = fleeResult.remainingHp;
            await setHp(playerId, currentHp);

            await createActivityLog({
              playerId,
              activityType: 'combat',
              turnsSpent: 0,
              result: buildCombatLogResult({
                zoneId: currentZoneId,
                zoneName: currentZone.name,
                mob: { id: prefixedMob.id, name: baseMob.name, mobPrefix: prefixedMob.mobPrefix, mobDisplayName: prefixedMob.mobDisplayName },
                source: 'travel_ambush',
                encounterSiteId: null,
                attackSkill,
                combatResult,
                rewards: { xp: 0, baseXp: 0, loot: [], durabilityLost, skillXpGrants: [] },
                eventModifiers: travelMobBadges,
              }),
            });

            events.push({
              turn: ambush.turnOccurred,
              type: 'ambush_defeat',
              description: `Ambushed by ${prefixedMob.mobDisplayName}! You escaped with ${currentHp} HP.`,
              details: {
                mobName: baseMob.name,
                mobDisplayName: prefixedMob.mobDisplayName,
                outcome: combatResult.outcome,
                playerMaxHp: combatResult.combatantAMaxHp,
                mobMaxHp: combatResult.combatantBMaxHp,
                log: mapTemplateCombatLog(combatResult.log),
                remainingHp: currentHp,
                fleeResult: { outcome: fleeResult.outcome, remainingHp: fleeResult.remainingHp },
                durabilityLost,
              },
            });

            // Use pre-tax cost for refund to prevent turn inflation from guild tax
            const refundAmount = guildReducedCost - ambush.turnOccurred;
            if (refundAmount > 0) {
              await refundPlayerTurns(playerId, refundAmount);
            }

            // --- Achievement tracking (counters + derived checks) ---
            const fleeCounters: Record<string, number> = {};
            const netTurnsFlee = ambush.turnOccurred;
            if (netTurnsFlee > 0) fleeCounters.totalTurnsSpent = netTurnsFlee;

            const fleeAchKeys: string[] = [];
            if (netTurnsFlee > 0) fleeAchKeys.push('totalTurnsSpent');
            if (ambushKillCount > 0) fleeAchKeys.push('totalKills', 'totalUniqueMonsterKills', 'totalBestiaryCompleted');
            if (Object.keys(fleeCounters).length > 0 || fleeAchKeys.length > 0 || ambushMobFamilyIds.length > 0) {
              await trackAchievements(playerId, fleeCounters, { statKeys: fleeAchKeys, familyIds: ambushMobFamilyIds });
            }

            ambushAbort = { type: 'flee', refundAmount };
            break;
          }
        }
      }

      // Single deduction point for all exit paths
      await deductConsumedPotions(playerId, allPotionsConsumed);

      // Persist stamina/mana after all ambush combats
      await setAllResources(playerId, currentHp, currentStamina, currentMana);

      // Store travel ambush overflow as pending loot
      if (allTravelOverflow.length > 0) {
        travelPendingLootSessionId = await storePendingLoot(playerId, allTravelOverflow);
      }

      if (ambushAbort?.type === 'knockout') {
        const knockoutStateUpdates = await buildStateUpdates(playerId, ['hp', 'resources']);
        knockoutStateUpdates.currentZoneId = ambushAbort.respawn.townId;
        res.json({
          zone: { id: ambushAbort.respawn.townId, name: ambushAbort.respawn.townName, zoneType: 'town' },
          turns: await getTurnSnapshot(),
          travelCost,
          breadcrumbReturn: false,
          events,
          aborted: true,
          refundedTurns: ambushAbort.refundAmount,
          respawnedTo: ambushAbort.respawn,
          newDiscoveries: ambushAbort.newDiscoveries,
          tax: taxInfoFromResult(taxResult),
          ...(travelPendingLootSessionId ? { pendingLootSessionId: travelPendingLootSessionId } : {}),
          stateUpdates: knockoutStateUpdates,
        });
        return;
      }

      if (ambushAbort?.type === 'flee') {
        const fleeStateUpdates = await buildStateUpdates(playerId, ['hp', 'resources']);
        fleeStateUpdates.currentZoneId = currentZoneId;
        res.json({
          zone: { id: currentZoneId, name: currentZone.name, zoneType: currentZone.zoneType },
          turns: await getTurnSnapshot(),
          travelCost,
          breadcrumbReturn: false,
          events,
          aborted: true,
          refundedTurns: ambushAbort.refundAmount,
          respawnedTo: null,
          newDiscoveries: [],
          tax: taxInfoFromResult(taxResult),
          ...(travelPendingLootSessionId ? { pendingLootSessionId: travelPendingLootSessionId } : {}),
          stateUpdates: fleeStateUpdates,
        });
        return;
      }
    }
  }

  // 11. Successful arrival
  const updateData: Prisma.PlayerUncheckedUpdateInput = {
    currentZoneId: destinationId,
    lastTravelledFromZoneId: currentZoneId,
  };

  let newDiscoveries: Array<{ id: string; name: string }> = [];
  if (destinationZone.zoneType === 'town') {
    updateData.homeTownId = destinationId;
    const discoveredIds = await discoverZonesFromTown(playerId, destinationId);
    const discoveredZones = await prisma.zone.findMany({
      where: { id: { in: discoveredIds } },
      select: { id: true, name: true },
    });
    newDiscoveries = discoveredZones;
  }

  await prisma.player.update({
    where: { id: playerId },
    data: updateData,
  });
  await invalidateZoneIdCache(playerId);

  void trackProgress(playerId, 'zone_travel', 1);

  // --- Achievement tracking (counters + derived checks) ---
  const travelCounters: Record<string, number> = {};
  if (travelCost > 0) travelCounters.totalTurnsSpent = travelCost;

  const travelAchKeys: string[] = [];
  if (travelCost > 0) travelAchKeys.push('totalTurnsSpent');
  if (ambushKillCount > 0) travelAchKeys.push('totalKills', 'totalUniqueMonsterKills', 'totalBestiaryCompleted');
  if (newDiscoveries.length > 0) travelAchKeys.push('totalZonesDiscovered');
  if (Object.keys(travelCounters).length > 0 || travelAchKeys.length > 0 || ambushMobFamilyIds.length > 0) {
    await trackAchievements(playerId, travelCounters, { statKeys: travelAchKeys, familyIds: ambushMobFamilyIds });
  }

  const [travelStateUpdates] = await Promise.all([
    buildStateUpdates(playerId, ['hp', 'resources']),
  ]);
  await mergeLootIntoStateUpdates(playerId, allTravelNewItemIds, allTravelUpdatedItemIds, travelStateUpdates);
  travelStateUpdates.currentZoneId = destinationId;
  res.json({
    zone: { id: destinationZone.id, name: destinationZone.name, zoneType: destinationZone.zoneType },
    turns: await getTurnSnapshot(),
    travelCost,
    breadcrumbReturn: false,
    events,
    aborted: false,
    refundedTurns: 0,
    respawnedTo: null,
    newDiscoveries,
    tax: taxInfoFromResult(taxResult),
    ...(travelPendingLootSessionId ? { pendingLootSessionId: travelPendingLootSessionId } : {}),
    stateUpdates: travelStateUpdates,
  });
}));
