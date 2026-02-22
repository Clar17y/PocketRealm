import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import {
  buildPlayerCombatStats,
  runCombat,
  applyMobPrefix,
  rollMobPrefix,
  simulateTravelAmbushes,
  calculateFleeResult,
  mobToCombatantStats,
  filterAndWeightMobsByTier,
} from '@adventure/game-engine';
import type { Combatant, MobTemplate, SkillType } from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurns, refundPlayerTurns } from '../services/turnBankService';
import { getHpState, enterRecoveringState, setHp } from '../services/hpService';
import { getEquipmentStats } from '../services/equipmentService';
import { getPlayerProgressionState } from '../services/attributesService';
import { grantSkillXp } from '../services/xpService';
import { rollAndGrantLoot } from '../services/lootService';
import { serializeXpGrant, toMobTemplate, recordBestiaryKill, trackAchievements } from '../utils/routeHelpers.js';
import { prismaAny } from '../utils/prismaAny.js';
import { pickWeighted } from '../utils/pickWeighted.js';
import { degradeEquippedDurability } from '../services/durabilityService';
import {
  ensureStarterDiscoveries,
  getDiscoveredZoneIds,
  discoverZonesFromTown,
  respawnToHomeTown,
} from '../services/zoneDiscoveryService';
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from '../services/combatStatsService';
import { calculateExplorationPercent, getExplorationPercent } from '../services/zoneExplorationService';


export const zonesRouter = Router();

zonesRouter.use(authenticate);

/**
 * GET /api/v1/zones
 * Returns zones with discovery state, connections between discovered zones, and currentZoneId.
 */
zonesRouter.get('/', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    // Lazy-init starter discoveries for this player
    await ensureStarterDiscoveries(playerId);

    // Fetch all data in parallel
    const [zones, connections, discoveredZoneIds, player, explorations] = await Promise.all([
      prismaAny.zone.findMany({
        orderBy: [{ isStarter: 'desc' }, { difficulty: 'asc' }, { name: 'asc' }],
      }),
      prismaAny.zoneConnection.findMany({ select: { fromId: true, toId: true, explorationThreshold: true } }),
      getDiscoveredZoneIds(playerId),
      prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } }),
      prismaAny.playerZoneExploration.findMany({
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
      const starterZone = await prismaAny.zone.findFirst({ where: { isStarter: true } });
      if (starterZone) {
        currentZoneId = starterZone.id;
        await prisma.player.update({
          where: { id: playerId },
          data: { currentZoneId: starterZone.id, homeTownId: starterZone.id },
        });
      }
    }

    // Only include connections where both endpoints are discovered
    const filteredConnections = connections.filter(
      (c: { fromId: string; toId: string; explorationThreshold: number | null }) =>
        discoveredZoneIds.has(c.fromId) && discoveredZoneIds.has(c.toId),
    );

    res.json({
      zones: zones.map((z: { id: string; name: string; description: string | null; difficulty: number; travelCost: number; isStarter: boolean; zoneType: string; zoneExitChance: number | null; maxCraftingLevel: number | null; turnsToExplore: number | null; explorationTiers: Record<string, number> | null }) => {
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
      currentZoneId,
    });
  } catch (err) {
    next(err);
  }
});

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
zonesRouter.post('/travel', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = travelSchema.parse(req.body);
    const destinationId = body.zoneId;

    // 1. Get player with zone info
    const player = await prismaAny.player.findUniqueOrThrow({
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

    // 3. Can't travel while recovering or at 0 HP
    const hpState = await getHpState(playerId);
    if (hpState.isRecovering || hpState.currentHp <= 0) {
      throw new AppError(400, 'Cannot travel while recovering', 'IS_RECOVERING');
    }

    // 4. Validate destination is discovered
    const discovery = await prismaAny.playerZoneDiscovery.findUnique({
      where: { playerId_zoneId: { playerId, zoneId: destinationId } },
    });
    if (!discovery) {
      throw new AppError(400, 'Zone not discovered', 'ZONE_NOT_DISCOVERED');
    }

    // 5. Validate connection exists
    const connection = await prismaAny.zoneConnection.findUnique({
      where: { fromId_toId: { fromId: currentZoneId, toId: destinationId } },
    });
    if (!connection) {
      throw new AppError(400, 'No path to that zone', 'NO_CONNECTION');
    }

    // 6. Get current zone and destination zone data
    const [currentZone, destinationZone] = await Promise.all([
      prismaAny.zone.findUniqueOrThrow({ where: { id: currentZoneId } }),
      prismaAny.zone.findUniqueOrThrow({ where: { id: destinationId } }),
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
      await prismaAny.player.update({
        where: { id: playerId },
        data: {
          currentZoneId: destinationId,
          lastTravelledFromZoneId: currentZoneId,
        },
      });

      let newDiscoveries: Array<{ id: string; name: string }> = [];
      if (destinationZone.zoneType === 'town') {
        await prismaAny.player.update({
          where: { id: playerId },
          data: { homeTownId: destinationId },
        });
        const discoveredIds = await discoverZonesFromTown(playerId, destinationId);
        const discoveredZones = await prismaAny.zone.findMany({
          where: { id: { in: discoveredIds } },
          select: { id: true, name: true },
        });
        newDiscoveries = discoveredZones;
      }

      return res.json({
        zone: { id: destinationZone.id, name: destinationZone.name, zoneType: destinationZone.zoneType },
        turns: await getTurnSnapshot(),
        travelCost: 0,
        breadcrumbReturn: true,
        events: [],
        aborted: false,
        refundedTurns: 0,
        respawnedTo: null,
        newDiscoveries,
      });
    }

    // 8. Determine travel cost
    // Town departure: destination's travelCost, no ambushes
    // Wild traversal: current zone's travelCost, ambushes from current zone
    const isTownDeparture = currentZone.zoneType === 'town';
    const travelCost: number = isTownDeparture ? destinationZone.travelCost : currentZone.travelCost;

    // 9. Spend turns
    await spendPlayerTurns(playerId, travelCost);

    const events: TravelEvent[] = [];

    // Achievement tracking accumulators for ambush encounters
    let ambushKillCount = 0;
    const ambushMobFamilyIds: string[] = [];


    // 10. Run travel ambushes (only for wild traversal)
    if (!isTownDeparture) {
      const ambushes = simulateTravelAmbushes(travelCost);

      if (ambushes.length > 0) {
        // Get player combat stats (same pattern as combat route)
        const mainHandAttackSkill = await getMainHandAttackSkill(playerId);
        const attackSkill: AttackSkill = mainHandAttackSkill ?? 'melee';
        const [attackLevel, progression, equipmentStats] = await Promise.all([
          getSkillLevel(playerId, attackSkill),
          getPlayerProgressionState(playerId),
          getEquipmentStats(playerId),
        ]);

        // Get mob pool from current zone, filtered by exploration tier
        const mobTemplates = await prisma.mobTemplate.findMany({ where: { zoneId: currentZoneId } });
        const explorationProgress = await getExplorationPercent(playerId, currentZoneId);
        const zoneTiers = (currentZone as unknown as { explorationTiers: Record<string, number> | null }).explorationTiers;
        const tieredMobs = filterAndWeightMobsByTier(
          mobTemplates.map(m => ({
            ...m,
            explorationTier: (m as unknown as { explorationTier: number | null }).explorationTier ?? 1,
          })),
          explorationProgress.percent,
          zoneTiers,
        );

        let currentHp = hpState.currentHp;

        for (const ambush of ambushes) {
          if (tieredMobs.length === 0) break;

          const rawMob = pickWeighted(tieredMobs, m => m.encounterWeight) ?? tieredMobs[0]!;
          const baseMob = toMobTemplate(rawMob as unknown as Record<string, unknown>);
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

          const combatantA: Combatant = {
            id: playerId,
            name: req.player!.username,
            stats: playerStats,
          };
          const combatantB: Combatant = {
            id: prefixedMob.id,
            name: prefixedMob.mobDisplayName ?? prefixedMob.name,
            stats: mobToCombatantStats(prefixedMob),
            spells: prefixedMob.spellPattern,
          };
          const combatResult = runCombat(combatantA, combatantB);
          currentHp = combatResult.combatantAHpRemaining;

          const durabilityLost = await degradeEquippedDurability(playerId);

          if (combatResult.outcome === 'victory') {
            const loot = await rollAndGrantLoot(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
            const xpGrant = await grantSkillXp(playerId, attackSkill, prefixedMob.xpReward);
            const xpGain = xpGrant.xpResult.xpAfterEfficiency;
            await setHp(playerId, currentHp);

            // Update bestiary
            await recordBestiaryKill(playerId, prefixedMob.id, prefixedMob.mobPrefix);

            // Track ambush kill for achievement checks
            ambushKillCount++;
            const familyMember = await prisma.mobFamilyMember.findFirst({
              where: { mobTemplateId: prefixedMob.id },
              select: { mobFamilyId: true },
            });
            if (familyMember) {
              ambushMobFamilyIds.push(familyMember.mobFamilyId);
            }

            await prisma.activityLog.create({
              data: {
                playerId,
                activityType: 'combat',
                turnsSpent: 0,
                result: {
                  zoneId: currentZoneId,
                  zoneName: currentZone.name,
                  mobTemplateId: prefixedMob.id,
                  mobName: baseMob.name,
                  mobPrefix: prefixedMob.mobPrefix,
                  mobDisplayName: prefixedMob.mobDisplayName,
                  source: 'travel_ambush',
                  encounterSiteId: null,
                  attackSkill,
                  outcome: combatResult.outcome,
                  playerMaxHp: combatResult.combatantAMaxHp,
                  mobMaxHp: combatResult.combatantBMaxHp,
                  log: combatResult.log,
                  rewards: {
                    xp: prefixedMob.xpReward,
                    baseXp: prefixedMob.xpReward,
                    loot,
                    durabilityLost,
                    skillXp: serializeXpGrant(xpGrant),
                  },
                } as unknown as Prisma.InputJsonValue,
              },
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
                log: combatResult.log,
                xp: xpGain,
                loot,
                durabilityLost,
              },
            });
          } else {
            // Player lost — calculate flee result
            const fleeResult = calculateFleeResult({
              evasionLevel: progression.attributes.evasion,
              mobLevel: prefixedMob.level,
              maxHp: hpState.maxHp,
              currentGold: 0,
            });

            if (fleeResult.outcome === 'knockout') {
              currentHp = 0;
              await enterRecoveringState(playerId, hpState.maxHp);
              const respawn = await respawnToHomeTown(playerId);

              await prisma.activityLog.create({
                data: {
                  playerId,
                  activityType: 'combat',
                  turnsSpent: 0,
                  result: {
                    zoneId: currentZoneId,
                    zoneName: currentZone.name,
                    mobTemplateId: prefixedMob.id,
                    mobName: baseMob.name,
                    mobPrefix: prefixedMob.mobPrefix,
                    mobDisplayName: prefixedMob.mobDisplayName,
                    source: 'travel_ambush',
                    encounterSiteId: null,
                    attackSkill,
                    outcome: combatResult.outcome,
                    playerMaxHp: combatResult.combatantAMaxHp,
                    mobMaxHp: combatResult.combatantBMaxHp,
                    log: combatResult.log,
                    rewards: {
                      xp: 0,
                      baseXp: 0,
                      loot: [],
                      durabilityLost,
                      skillXp: null,
                    },
                  } as unknown as Prisma.InputJsonValue,
                },
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
                  log: combatResult.log,
                  fleeResult: { outcome: fleeResult.outcome, remainingHp: fleeResult.remainingHp },
                  durabilityLost,
                },
              });

              // Refund remaining turns
              const refundAmount = travelCost - ambush.turnOccurred;
              if (refundAmount > 0) {
                await refundPlayerTurns(playerId, refundAmount);
              }

              const discoveredIds = await discoverZonesFromTown(playerId, respawn.townId);
              const discoveredZones = await prismaAny.zone.findMany({
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

              return res.json({
                zone: { id: respawn.townId, name: respawn.townName, zoneType: 'town' },
                turns: await getTurnSnapshot(),
                travelCost,
                breadcrumbReturn: false,
                events,
                aborted: true,
                refundedTurns: refundAmount,
                respawnedTo: respawn,
                newDiscoveries: discoveredZones,
              });
            } else {
              // Fled — abort travel, stay in current zone
              currentHp = fleeResult.remainingHp;
              await setHp(playerId, currentHp);

              await prisma.activityLog.create({
                data: {
                  playerId,
                  activityType: 'combat',
                  turnsSpent: 0,
                  result: {
                    zoneId: currentZoneId,
                    zoneName: currentZone.name,
                    mobTemplateId: prefixedMob.id,
                    mobName: baseMob.name,
                    mobPrefix: prefixedMob.mobPrefix,
                    mobDisplayName: prefixedMob.mobDisplayName,
                    source: 'travel_ambush',
                    encounterSiteId: null,
                    attackSkill,
                    outcome: combatResult.outcome,
                    playerMaxHp: combatResult.combatantAMaxHp,
                    mobMaxHp: combatResult.combatantBMaxHp,
                    log: combatResult.log,
                    rewards: {
                      xp: 0,
                      baseXp: 0,
                      loot: [],
                      durabilityLost,
                      skillXp: null,
                    },
                  } as unknown as Prisma.InputJsonValue,
                },
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
                  log: combatResult.log,
                  remainingHp: currentHp,
                  fleeResult: { outcome: fleeResult.outcome, remainingHp: fleeResult.remainingHp },
                  durabilityLost,
                },
              });

              // Refund remaining turns
              const refundAmount = travelCost - ambush.turnOccurred;
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

              return res.json({
                zone: { id: currentZoneId, name: currentZone.name, zoneType: currentZone.zoneType },
                turns: await getTurnSnapshot(),
                travelCost,
                breadcrumbReturn: false,
                events,
                aborted: true,
                refundedTurns: refundAmount,
                respawnedTo: null,
                newDiscoveries: [],
              });
            }
          }
        }
      }
    }

    // 11. Successful arrival
    const updateData: Record<string, unknown> = {
      currentZoneId: destinationId,
      lastTravelledFromZoneId: currentZoneId,
    };

    let newDiscoveries: Array<{ id: string; name: string }> = [];
    if (destinationZone.zoneType === 'town') {
      updateData.homeTownId = destinationId;
      const discoveredIds = await discoverZonesFromTown(playerId, destinationId);
      const discoveredZones = await prismaAny.zone.findMany({
        where: { id: { in: discoveredIds } },
        select: { id: true, name: true },
      });
      newDiscoveries = discoveredZones;
    }

    await prismaAny.player.update({
      where: { id: playerId },
      data: updateData,
    });

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

    return res.json({
      zone: { id: destinationZone.id, name: destinationZone.name, zoneType: destinationZone.zoneType },
      turns: await getTurnSnapshot(),
      travelCost,
      breadcrumbReturn: false,
      events,
      aborted: false,
      refundedTurns: 0,
      respawnedTo: null,
      newDiscoveries,
    });
  } catch (err) {
    next(err);
  }
});

