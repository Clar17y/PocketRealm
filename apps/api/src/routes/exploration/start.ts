import { Router } from 'express';
import { Prisma, prisma } from '@adventure/database';
import { prismaAny } from '../../utils/prismaAny.js';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  applyMobEventModifiers,
  applyMobPrefix,
  buildPlayerCombatStats,
  calculateFleeResult,
  filterAndWeightMobsByTier,
  getScaledZoneExitChance,
  mobToCombatantStats,
  rollMobPrefix,
  runCombat,
  selectTierWithBleedthrough,
  simulateExploration,
  validateExplorationTurns,
} from '@adventure/game-engine';
import {
  WORLD_EVENT_TEMPLATES,
  WORLD_EVENT_CONSTANTS,
  getUnlockedTiers,
  getHighestUnlockedTier,
  type Combatant,
  type CombatOptions,
  type MobTemplate,
  type PotionConsumed,
} from '@adventure/shared';
import { AppError } from '../../middleware/errorHandler';
import { refundPlayerTurns, spendPlayerTurnsTx } from '../../services/turnBankService';
import { enterRecoveringState, setHp } from '../../services/hpService';
import { applyGuildTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { getPlayerGuildId } from '../../services/guildService';
import { incrementContractProgress } from '../../services/guildContractService';
import { rollAndGrantLoot } from '../../services/lootService';
import { grantSkillXp } from '../../services/xpService';
import { degradeEquippedDurability } from '../../services/durabilityService';
import { serializeXpGrant, toMobTemplate, assertNotRecovering, recordBestiaryKill, trackAchievements } from '../../utils/routeHelpers.js';
import { getEquipmentStats } from '../../services/equipmentService';
import { getPlayerProgressionState } from '../../services/attributesService';
import { discoverZone, getUndiscoveredNeighborZones, respawnToHomeTown } from '../../services/zoneDiscoveryService';
import { addExplorationTurns, calculateExplorationPercent, getExplorationPercent } from '../../services/zoneExplorationService';
import { computeZoneModifiers, computeSpawnRateModifiers, getActiveEventsForZone, getActiveWorldWideEvents, filterEventModifiers, spawnWorldEvent } from '../../services/worldEventService';
import { createBossEncounter } from '../../services/bossEncounterService';
import { checkAndSpawnEvents } from '../../services/eventSchedulerService';
import { getIo } from '../../socket';
import { emitSystemMessage } from '../../services/systemMessageService';
import { persistMobHp } from '../../services/persistedMobService';
import { buildPotionPool, deductConsumedPotions } from '../../services/potionService';
import { grantCacheLootTx } from '../../services/cacheLootService';
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from '../../services/combatStatsService';
import {
  startSchema,
  pickWeighted,
  randomIntInclusive,
  getNodeSizeName,
  pickEncounterSize,
  getSiteName,
  buildEncounterSiteMobs,
  type EncounterSiteSize,
  type NarrativeEvent,
  type ZoneFamilyRow,
  type ZoneFamilyMember,
  type PendingResourceDiscovery,
  type PendingEncounterSiteDiscovery,
  type PendingAmbushCombatLog,
} from './helpers';

export const startRouter = Router();


/**
 * POST /api/v1/exploration/start
 * Spend turns to explore a zone and return discovered outcomes.
 */
startRouter.post('/start', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = startSchema.parse(req.body);

    const hpState = await assertNotRecovering(playerId);
    if (hpState.currentHp <= 0) {
      throw new AppError(400, 'Cannot explore with 0 HP. Rest before exploring.', 'NO_HP');
    }

    const validation = validateExplorationTurns(body.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    const zone = await prisma.zone.findUnique({ where: { id: body.zoneId } });
    if (!zone) {
      throw new AppError(404, 'Zone not found', 'NOT_FOUND');
    }
    if (zone.zoneType === 'town') {
      throw new AppError(400, 'Cannot explore in towns. Travel to a wild zone first.', 'TOWN_ZONE');
    }

    const [mobTemplates, resourceNodes, zoneFamilies, progression, equipmentStats, mainHandAttackSkill] = await Promise.all([
      prisma.mobTemplate.findMany({ where: { zoneId: body.zoneId } }),
      prisma.resourceNode.findMany({ where: { zoneId: body.zoneId } }),
      prismaAny.zoneMobFamily.findMany({
        where: { zoneId: body.zoneId },
        include: {
          mobFamily: {
            include: {
              members: {
                include: {
                  mobTemplate: {
                    select: { id: true, name: true, zoneId: true, explorationTier: true },
                  },
                },
              },
            },
          },
        },
      }) as Promise<ZoneFamilyRow[]>,
      getPlayerProgressionState(playerId),
      getEquipmentStats(playerId),
      getMainHandAttackSkill(playerId),
    ]);

    const attackSkill: AttackSkill = mainHandAttackSkill ?? 'melee';
    const attackLevel = await getSkillLevel(playerId, attackSkill);

    const explorationProgress = await getExplorationPercent(playerId, body.zoneId);
    const zoneTiers = zone.explorationTiers as Record<string, number> | null;

    // Determine unlocked tiers and selected tier
    const unlockedTiers = getUnlockedTiers(explorationProgress.percent, zoneTiers);
    const maxUnlockedTier = getHighestUnlockedTier(explorationProgress.percent, zoneTiers);
    const selectedTier = body.tier ?? maxUnlockedTier;

    if (body.tier !== undefined && !unlockedTiers.includes(selectedTier)) {
      throw new AppError(400, `Tier ${selectedTier} is not unlocked. Max unlocked: ${maxUnlockedTier}`, 'INVALID_TIER');
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

    // Auto-potion setup + tutorial detection
    const playerRecord = await prismaAny.player.findUnique({
      where: { id: playerId },
      select: { autoPotionThreshold: true, tutorialStep: true },
    });
    const isTutorialExplore = playerRecord?.tutorialStep === 1;
    const autoPotionThreshold = playerRecord?.autoPotionThreshold ?? 0;

    // Tutorial explore step: force 100 turns and a single guaranteed ambush
    const turnsToSpend = isTutorialExplore ? 100 : body.turns;
    const potionPool = autoPotionThreshold > 0
      ? await buildPotionPool(playerId, hpState.maxHp)
      : [];
    const allPotionsConsumed: PotionConsumed[] = [];

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

    const outcomes = isTutorialExplore
      ? [{ turnOccurred: 50, type: 'ambush' as const }]
      : simulateExploration(effectiveTurns, effectiveExitChance, spawnRateMultiplier);

    interface PendingCacheLoot {
      turnOccurred: number;
      mobFamilyId: string;
    }

    const pendingResources: PendingResourceDiscovery[] = [];
    const pendingSites: PendingEncounterSiteDiscovery[] = [];
    const pendingCombatLogs: PendingAmbushCombatLog[] = [];
    const pendingCacheLoot: PendingCacheLoot[] = [];
    const events: NarrativeEvent[] = [];

    const hiddenCaches: Array<{
      turnOccurred: number;
      loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>;
      soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null;
    }> = [];
    let zoneExitDiscovered = false;
    let wasKnockedOut = false;

    let currentHp = hpState.currentHp;
    let aborted = false;
    let abortedAtTurn: number | null = null;
    let respawnedTo: { townId: string; townName: string } | null = null;

    for (const outcome of outcomes) {
      if (aborted) break;

      if (outcome.type === 'ambush' && mobTemplates.length > 0) {
        let baseMob: MobTemplate;
        let prefixedMob: ReturnType<typeof applyMobPrefix>;

        if (isTutorialExplore) {
          // Tutorial: guaranteed Field Mouse with no prefix
          const fieldMouse = mobTemplates.find(m => m.name === 'Field Mouse')
            ?? mobTemplates[0]!;
          baseMob = toMobTemplate(fieldMouse as unknown as Record<string, unknown>);
          prefixedMob = applyMobPrefix(baseMob, null);
        } else {
          const tieredMobs = filterAndWeightMobsByTier(
            mobTemplates.map(m => ({ ...m, explorationTier: m.explorationTier ?? 1 })),
            explorationProgress.percent,
            zoneTiers,
          );
          if (tieredMobs.length === 0) continue;

          // Apply tier bleedthrough: select a target tier, filter to it, fall back to lower tiers
          const targetTier = selectTierWithBleedthrough(selectedTier, zoneTiers);
          let candidates = tieredMobs.filter(m => m.explorationTier === targetTier);
          if (candidates.length === 0) {
            for (let t = targetTier - 1; t >= 1; t--) {
              candidates = tieredMobs.filter(m => m.explorationTier === t);
              if (candidates.length > 0) break;
            }
          }
          if (candidates.length === 0) candidates = tieredMobs;

          // Boost encounter weights for mobs in families affected by spawn rate events
          const weightedCandidates = candidates.map(c => {
            let weightMod = spawnMods.global;
            for (const [familyId, mod] of spawnMods.byFamily) {
              const family = zoneFamilies.find((f: ZoneFamilyRow) => f.mobFamilyId === familyId);
              if (family?.mobFamily?.members?.some((m: ZoneFamilyMember) => m.mobTemplate.id === c.id)) {
                weightMod *= mod;
                break;
              }
            }
            return weightMod !== 1 ? { ...c, encounterWeight: c.encounterWeight * weightMod } : c;
          });

          const mob = pickWeighted(weightedCandidates, 'encounterWeight') as typeof candidates[number] | null;
          if (!mob) continue;

          baseMob = toMobTemplate(mob as unknown as Record<string, unknown>);

          const modifiedMob = applyMobEventModifiers(baseMob, zoneModifiers);
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
          equipmentStats
        );

        let combatOptions: CombatOptions | undefined;
        if (autoPotionThreshold > 0 && potionPool.length > 0) {
          combatOptions = { autoPotionThreshold, potions: [...potionPool] };
        }

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
        const combatResult = runCombat(combatantA, combatantB, combatOptions);

        // Remove consumed potions from the shared pool
        for (const consumed of combatResult.potionsConsumed) {
          const idx = potionPool.findIndex(p => p.templateId === consumed.templateId);
          if (idx !== -1) potionPool.splice(idx, 1);
          allPotionsConsumed.push(consumed);
        }

        const durabilityLost = await degradeEquippedDurability(playerId);

        // Determine mob family once for event modifier badges (used in both victory and defeat paths)
        const ambushMobFamily = zoneFamilies.find((f: ZoneFamilyRow) =>
          f.mobFamily.members.some((m: ZoneFamilyMember) => m.mobTemplate.id === prefixedMob.id),
        );
        const ambushEventModifiers = ambushMobFamily
          ? filterEventModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: ambushMobFamily.mobFamilyId })
          : [];

        let loot: Array<{ itemTemplateId: string; quantity: number; rarity?: string }> = [];
        let xpGain = 0;
        let xpGrant: Awaited<ReturnType<typeof grantSkillXp>> | null = null;

        if (combatResult.outcome === 'victory') {
          currentHp = combatResult.combatantAHpRemaining;
          await setHp(playerId, currentHp);

          loot = await rollAndGrantLoot(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
          xpGrant = await grantSkillXp(playerId, attackSkill, prefixedMob.xpReward);
          xpGain = xpGrant.xpResult.xpAfterEfficiency;

          await recordBestiaryKill(playerId, prefixedMob.id, prefixedMob.mobPrefix);

          const skillXpReward = xpGrant
            ? serializeXpGrant(xpGrant)
            : null;

          pendingCombatLogs.push({
            turnsSpent: 0,
            result: {
              zoneId: body.zoneId,
              zoneName: zone.name,
              mobTemplateId: prefixedMob.id,
              mobName: baseMob.name,
              mobPrefix: prefixedMob.mobPrefix,
              mobDisplayName: prefixedMob.mobDisplayName,
              source: 'exploration_ambush',
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
                skillXp: skillXpReward,
              },
            } as unknown as Prisma.InputJsonValue,
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
              log: combatResult.log,
              playerHpRemaining: currentHp,
              xp: xpGain,
              loot,
              durabilityLost,
              eventModifiers: ambushEventModifiers,
            },
          });
        } else {
          const fleeResult = calculateFleeResult({
            evasionLevel: progression.attributes.evasion,
            mobLevel: prefixedMob.level,
            maxHp: hpState.maxHp,
            currentGold: 0, // TODO: wire gold when economy is implemented
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

          // Persist the mob's remaining HP for potential reencounter
          if (combatResult.combatantBHpRemaining > 0) {
            await persistMobHp(playerId, prefixedMob.id, body.zoneId, combatResult.combatantBHpRemaining, prefixedMob.hp);
          }

          const defeatDescription = fleeResult.outcome === 'knockout'
            ? `A ${prefixedMob.mobDisplayName} ambushed you - you were defeated and knocked out!`
            : `A ${prefixedMob.mobDisplayName} ambushed you - you were defeated but escaped with ${fleeResult.remainingHp} HP.`;

          pendingCombatLogs.push({
            turnsSpent: 0,
            result: {
              zoneId: body.zoneId,
              zoneName: zone.name,
              mobTemplateId: prefixedMob.id,
              mobName: baseMob.name,
              mobPrefix: prefixedMob.mobPrefix,
              mobDisplayName: prefixedMob.mobDisplayName,
              source: 'exploration_ambush',
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
              log: combatResult.log,
              playerHpRemaining: currentHp,
              fleeResult: {
                outcome: fleeResult.outcome,
                remainingHp: fleeResult.remainingHp,
                goldLost: fleeResult.goldLost,
                recoveryCost: fleeResult.recoveryCost,
              },
              durabilityLost,
              eventModifiers: ambushEventModifiers,
            },
          });

          aborted = true;
          abortedAtTurn = outcome.turnOccurred;
        }

        continue;
      }

      if (outcome.type === 'encounter_site' && zoneFamilies.length > 0) {
        const adjustedFamilies = zoneFamilies.map((f: ZoneFamilyRow) => ({
          ...f,
          discoveryWeight: f.discoveryWeight * (spawnMods.byFamily.get(f.mobFamilyId) ?? 1) * spawnMods.global,
        }));
        const pickedFamily = pickWeighted(adjustedFamilies, 'discoveryWeight') as ZoneFamilyRow | null;
        if (!pickedFamily) continue;

        const size = pickEncounterSize(pickedFamily.minSize, pickedFamily.maxSize);
        const mobs = buildEncounterSiteMobs(pickedFamily.mobFamily, size, body.zoneId, explorationProgress.percent, zoneTiers, selectedTier);
        if (mobs.length === 0) continue;

        const siteName = getSiteName(pickedFamily.mobFamily.name, size, pickedFamily.mobFamily);

        pendingSites.push({
          turnOccurred: outcome.turnOccurred,
          mobFamilyId: pickedFamily.mobFamilyId,
          siteName,
          size,
          mobs,
        });

        events.push({
          turn: outcome.turnOccurred,
          type: 'encounter_site',
          description: `You stumbled into a ${siteName} (${mobs.length} mobs inside).`,
          details: {
            mobFamilyId: pickedFamily.mobFamilyId,
            mobFamilyName: pickedFamily.mobFamily.name,
            siteName,
            size,
            totalMobs: mobs.length,
            eventModifiers: filterEventModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: pickedFamily.mobFamilyId }),
          },
        });

        continue;
      }

      if (outcome.type === 'resource_node' && resourceNodes.length > 0) {
        const nodeTemplate = pickWeighted(resourceNodes, 'discoveryWeight') as typeof resourceNodes[number] | null;
        if (!nodeTemplate) continue;

        const capacity = randomIntInclusive(nodeTemplate.minCapacity, nodeTemplate.maxCapacity);
        const sizeName = getNodeSizeName(capacity, nodeTemplate.maxCapacity);

        pendingResources.push({
          turnOccurred: outcome.turnOccurred,
          resourceNodeId: nodeTemplate.id,
          resourceType: nodeTemplate.resourceType,
          capacity,
          sizeName,
        });

        events.push({
          turn: outcome.turnOccurred,
          type: 'resource_node',
          description: `You discovered a ${sizeName} ${nodeTemplate.resourceType.replace(/_/g, ' ')} node (${capacity} capacity).`,
          details: {
            resourceNodeId: nodeTemplate.id,
            resourceType: nodeTemplate.resourceType,
            sizeName,
            capacity,
          },
        });

        continue;
      }

      if (outcome.type === 'hidden_cache') {
        hiddenCaches.push({ turnOccurred: outcome.turnOccurred });

        // Pick a mob family for cache loot (same pool as encounter sites)
        const cacheFamily = zoneFamilies.length > 0
          ? pickWeighted(zoneFamilies, 'discoveryWeight') as ZoneFamilyRow | null
          : null;

        if (cacheFamily) {
          pendingCacheLoot.push({
            turnOccurred: outcome.turnOccurred,
            mobFamilyId: cacheFamily.mobFamilyId,
          });
        }

        events.push({
          turn: outcome.turnOccurred,
          type: 'hidden_cache',
          description: 'You found a hidden cache!',
          details: {},
        });
        continue;
      }

      if (outcome.type === 'zone_exit' && undiscoveredNeighbors.length > 0) {
        const eligibleNeighbors = undiscoveredNeighbors.filter(n => {
          const threshold = thresholdByToId.get(n.id) ?? 0;
          return explorationProgress.percent >= threshold;
        });

        if (eligibleNeighbors.length === 0) continue;

        const neighborIndex = randomIntInclusive(0, eligibleNeighbors.length - 1);
        const neighbor = eligibleNeighbors[neighborIndex]!;
        await discoverZone(playerId, neighbor.id);
        // Remove discovered neighbor so subsequent zone_exit rolls don't pick it again
        const origIndex = undiscoveredNeighbors.findIndex(n => n.id === neighbor.id);
        if (origIndex !== -1) undiscoveredNeighbors.splice(origIndex, 1);

        zoneExitDiscovered = true;
        events.push({
          turn: outcome.turnOccurred,
          type: 'zone_exit',
          description: `You discovered a path leading to **${neighbor.name}**.`,
          details: {
            discoveredZoneId: neighbor.id,
            discoveredZoneName: neighbor.name,
          },
        });
      }

      if (outcome.type === 'event_discovery') {
        // Roll for boss discovery first
        if (Math.random() < WORLD_EVENT_CONSTANTS.BOSS_DISCOVERY_CHANCE) {
          const activeBosses = await prisma.bossEncounter.count({
            where: { status: { in: ['waiting', 'in_progress'] } },
          });

          if (activeBosses < WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS) {
            const familyIds = zoneFamilies.map((f: ZoneFamilyRow) => f.mobFamilyId);
            const bossMobs = await prisma.mobTemplate.findMany({
              where: {
                isBoss: true,
                familyMembers: { some: { mobFamilyId: { in: familyIds } } },
              },
            });

            if (bossMobs.length > 0) {
              const bossMob = bossMobs[Math.floor(Math.random() * bossMobs.length)]!;
              const bossHp = bossMob.bossBaseHp ?? bossMob.hp;

              // Create a boss world event with no expiry (lasts until defeated)
              const bossEvent = await prisma.worldEvent.create({
                data: {
                  type: 'boss',
                  zoneId: body.zoneId,
                  title: `${bossMob.name} Awakens`,
                  description: `A powerful ${bossMob.name} has appeared in ${zone.name}!`,
                  effectType: 'damage_up',
                  effectValue: 0,
                  expiresAt: null,
                  status: 'active',
                  createdBy: 'player_discovery',
                },
                include: { zone: { select: { name: true } } },
              });

              const bossEncounter = await createBossEncounter(bossEvent.id, bossMob.id, bossHp);

              await emitSystemMessage(
                getIo(),
                'world',
                'world',
                `A boss has appeared in ${zone.name}: ${bossMob.name} Awakens!`,
              );
              await emitSystemMessage(
                getIo(),
                'zone',
                `zone:${body.zoneId}`,
                `${bossMob.name} has awakened! Rally adventurers to defeat it.`,
              );

              events.push({
                turn: outcome.turnOccurred,
                type: 'event_discovery',
                description: `You discovered a boss: **${bossMob.name} Awakens** — a powerful ${bossMob.name} has appeared in ${zone.name}!`,
                details: {
                  eventId: bossEvent.id,
                  eventTitle: `${bossMob.name} Awakens`,
                  bossEncounterId: bossEncounter.id,
                  bossMobName: bossMob.name,
                },
              });

              continue;
            }
          }
        }

        // Pick a random zone-scoped, zone-wide template (no world-wide or targeted)
        const eligible = WORLD_EVENT_TEMPLATES.filter(
          (t) => t.scope === 'zone' && t.targeting === 'zone',
        );
        if (eligible.length > 0) {
          const template = eligible[randomIntInclusive(0, eligible.length - 1)]!;
          const durationHours = template.type === 'resource'
            ? WORLD_EVENT_CONSTANTS.RESOURCE_EVENT_DURATION_HOURS
            : WORLD_EVENT_CONSTANTS.MOB_EVENT_DURATION_HOURS;
          const spawned = await spawnWorldEvent({
            type: template.type,
            zoneId: body.zoneId,
            title: template.title,
            description: template.description,
            effectType: template.effectType,
            effectValue: template.effectValue,
            durationHours,
            createdBy: 'player_discovery',
          });

          if (spawned) {
            await emitSystemMessage(
              getIo(),
              'world',
              'world',
              `New event in ${zone.name}: ${spawned.title} — ${spawned.description}`,
            );
            events.push({
              turn: outcome.turnOccurred,
              type: 'event_discovery',
              description: `You triggered a world event: **${spawned.title}** — ${spawned.description}`,
              details: { eventId: spawned.id, eventTitle: spawned.title },
            });
          }
        }
      }
    }

    // Deduct all potions consumed across ambushes
    await deductConsumedPotions(playerId, allPotionsConsumed);

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
    if (zoneJustFullyExplored && undiscoveredNeighbors.length > 0) {
      const autoDiscoverNeighbors = undiscoveredNeighbors.filter(n => {
        const threshold = thresholdByToId.get(n.id) ?? 0;
        return explorationAfter.percent >= threshold;
      });
      for (const neighbor of autoDiscoverNeighbors) {
        await discoverZone(playerId, neighbor.id);
        const idx = undiscoveredNeighbors.findIndex(n => n.id === neighbor.id);
        if (idx !== -1) undiscoveredNeighbors.splice(idx, 1);
        zoneExitDiscovered = true;
        events.push({
          turn: effectiveTurns,
          type: 'zone_exit',
          description: `Zone fully explored! You discovered ${neighbor.name}.`,
          details: { zoneId: neighbor.id, zoneName: neighbor.name },
        });
      }
    }

    const refundAmount = aborted && abortedAtTurn ? Math.max(0, effectiveTurns - abortedAtTurn) : 0;
    const refundedTurns = refundAmount > 0 ? await refundPlayerTurns(playerId, refundAmount) : null;

    const persisted = await prisma.$transaction(async (tx) => {
      const txAny = tx as unknown as any;
      const createdResourceDiscoveries: Array<{
        turnOccurred: number;
        playerNodeId: string;
        resourceNodeId: string;
        resourceType: string;
        capacity: number;
        sizeName: string;
      }> = [];

      for (const discovery of pendingResources) {
        const playerNode = await tx.playerResourceNode.create({
          data: {
            playerId,
            resourceNodeId: discovery.resourceNodeId,
            remainingCapacity: discovery.capacity,
            decayedCapacity: 0,
          },
          select: { id: true },
        });

        createdResourceDiscoveries.push({
          turnOccurred: discovery.turnOccurred,
          playerNodeId: playerNode.id,
          resourceNodeId: discovery.resourceNodeId,
          resourceType: discovery.resourceType,
          capacity: discovery.capacity,
          sizeName: discovery.sizeName,
        });
      }

      const createdEncounterSites: Array<{
        turnOccurred: number;
        encounterSiteId: string;
        mobFamilyId: string;
        siteName: string;
        size: EncounterSiteSize;
        totalMobs: number;
        discoveredAt: string;
      }> = [];

      for (const discovery of pendingSites) {
        const distinctRooms = new Set(discovery.mobs.map(m => m.room)).size;
        const site = await txAny.encounterSite.create({
          data: {
            playerId,
            zoneId: body.zoneId,
            mobFamilyId: discovery.mobFamilyId,
            name: discovery.siteName,
            size: discovery.size,
            mobs: { mobs: discovery.mobs },
            ...(distinctRooms <= 1 ? { clearStrategy: 'full_clear', fullClearActive: true } : {}),
          },
          select: {
            id: true,
            discoveredAt: true,
          },
        });

        createdEncounterSites.push({
          turnOccurred: discovery.turnOccurred,
          encounterSiteId: site.id,
          mobFamilyId: discovery.mobFamilyId,
          siteName: discovery.siteName,
          size: discovery.size,
          totalMobs: discovery.mobs.length,
          discoveredAt: site.discoveredAt.toISOString(),
        });
      }

      const createdCombatLogIds: string[] = [];
      for (const combatLog of pendingCombatLogs) {
        const created = await tx.activityLog.create({
          data: {
            playerId,
            activityType: 'combat',
            turnsSpent: combatLog.turnsSpent,
            result: combatLog.result as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        createdCombatLogIds.push(created.id);
      }

      // Grant hidden cache loot
      for (const cache of pendingCacheLoot) {
        const cacheLoot = await grantCacheLootTx(tx, {
          playerId,
          zoneId: body.zoneId,
          mobFamilyId: cache.mobFamilyId,
          luck: progression.attributes.luck,
        });

        const lootSummary = cacheLoot.materials.map(m => ({
          itemTemplateId: m.itemTemplateId,
          name: m.name,
          quantity: m.quantity,
        }));

        // Build human-readable description listing actual items
        const itemList = lootSummary.map(m => `${m.quantity}x ${m.name}`).join(', ');

        // Update the corresponding event's details
        const cacheEvent = events.find(e => e.type === 'hidden_cache' && e.turn === cache.turnOccurred);
        if (cacheEvent) {
          cacheEvent.details = {
            materials: lootSummary,
            soulboundItem: cacheLoot.soulboundItem,
          };
          if (cacheLoot.soulboundItem) {
            const article = /^[aeiou]/i.test(cacheLoot.soulboundItem.rarity) ? 'an' : 'a';
            cacheEvent.description = `You found a hidden cache containing ${article} ${cacheLoot.soulboundItem.rarity} ${cacheLoot.soulboundItem.name}! (${itemList})`;
          } else {
            cacheEvent.description = `You found a hidden cache: ${itemList}`;
          }
        }

        // Enrich hiddenCaches response entry with loot details
        const cacheEntry = hiddenCaches.find(h => h.turnOccurred === cache.turnOccurred);
        if (cacheEntry) {
          cacheEntry.loot = lootSummary;
          cacheEntry.soulboundItem = cacheLoot.soulboundItem;
        }
      }

      // Strip combat logs from events stored in the exploration activity log
      // (full logs are already stored in separate combat activity log records)
      const cleanedEvents = events.map(ev => {
        if ((ev.type === 'ambush_victory' || ev.type === 'ambush_defeat') && ev.details) {
          const { log: _log, ...rest } = ev.details;
          return { ...ev, details: rest };
        }
        return ev;
      });

      const explorationLog = await tx.activityLog.create({
        data: {
          playerId,
          activityType: 'exploration',
          turnsSpent: turnsToSpend,
          result: {
            zoneId: body.zoneId,
            zoneName: zone.name,
            aborted,
            abortedAtTurn,
            refundedTurns: refundAmount,
            events: cleanedEvents,
            resourceDiscoveries: createdResourceDiscoveries,
            encounterSites: createdEncounterSites,
            hiddenCaches,
            zoneExitDiscovered,
            finalHp: currentHp,
          } as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      return {
        logId: explorationLog.id,
        resourceDiscoveries: createdResourceDiscoveries,
        encounterSites: createdEncounterSites,
        combatLogIds: createdCombatLogIds,
      };
    });

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
      for (const member of zf.mobFamily.members) {
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
    if (zoneExitDiscovered) explorationAchievementKeys.push('totalZonesDiscovered');
    if (zoneJustFullyExplored) explorationAchievementKeys.push('totalZonesFullyExplored');
    if (wasKnockedOut) explorationAchievementKeys.push('totalDeaths');

    await trackAchievements(playerId, explorationCounters, {
      statKeys: explorationAchievementKeys,
      familyIds: [...familyIdSet],
    });

    // Guild contract progress: track exploration turns
    const guildId = taxResult.guildId ?? await getPlayerGuildId(playerId);
    if (guildId) void incrementContractProgress(guildId, 'exploration_turns', spentTurns).catch(() => {});

    if (events.length === 0) {
      events.push({
        turn: effectiveTurns,
        type: 'hidden_cache',
        description: `You explored the ${zone.name} for ${effectiveTurns} turns but found nothing of interest.`,
        details: {},
      });
    }

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
      zoneExitDiscovered,
      ...(respawnedTo ? { respawnedTo } : {}),
      explorationProgress: {
        turnsExplored: explorationProgress.turnsExplored + explorationTurnsToAdd,
        percent: calculateExplorationPercent(explorationProgress.turnsExplored + explorationTurnsToAdd, explorationProgress.turnsToExplore),
        turnsToExplore: explorationProgress.turnsToExplore,
      },
      tax: taxInfoFromResult(taxResult),
    });
}));
