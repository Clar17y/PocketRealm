import { WORLD_EVENT_TEMPLATES } from '@pocketrealm/shared/constants/worldEventTemplates';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';
import { prisma } from '@pocketrealm/database';
import { broadcastZoneDiscoveryActivity } from './chatActivityService';
import { logger } from '../logger';
import { discoverZone } from './zoneDiscoveryService';
import { createBossEncounter } from './bossEncounterService';
import { spawnWorldEvent, computeZoneModifiers, filterEventModifiers } from './worldEventService';
import { getCachedBossMobTemplates } from './staticDataCacheService';
import { getIo } from '../socket';
import { emitSystemMessage } from './systemMessageService';
import { applyTrackedFamilyWeightBias } from './explorationTrackingService';
import { applyProspectingResourceWeightBias } from './resourceProspectingService';
import {
  pickWeighted,
  randomIntInclusive,
  type NarrativeEvent,
  type ZoneFamilyRow,
  type ZoneFamilyMember,
  type PendingResourceDiscovery,
  type PendingEncounterSiteDiscovery,
  type PendingAmbushCombatLog,
  getSiteName,
  pickEncounterSize,
  buildEncounterSiteMobs,
  getNodeSizeName,
} from './exploration/helpers';
import { processAmbushOutcome } from './explorationOutcome/ambush';
import type { ExplorationOutcomeContext, ExplorationOutcomeResult } from './explorationOutcome/types';
export type { ExplorationOutcomeContext, ExplorationOutcomeResult } from './explorationOutcome/types';

export async function processExplorationOutcomes(
  ctx: ExplorationOutcomeContext,
  outcomes: Array<{ turnOccurred: number; type: string }>,
): Promise<ExplorationOutcomeResult> {
  const {
    playerId,
    username,
    zoneId,
    zone,
    hpState,
    combatPrep,
    mobTemplates,
    zoneFamilies,
    zoneTiers,
    selectedTier,
    explorationProgress,
    spawnMods,
    trackingFamilyId,
    prospectingResourceNodeId,
    prospectingSkillLevel,
    cachedZoneEvents,
    cachedWorldEvents,
    resourceNodes,
    thresholdByToId,
  } = ctx;
  const { resources } = combatPrep;

  // Mutable copies of the state that changes across the loop
  let { buffUsesLeft } = ctx;
  const potionPool = [...combatPrep.potionPool];
  const undiscoveredNeighbors = [...ctx.undiscoveredNeighbors];

  const events: NarrativeEvent[] = [];
  const pendingResources: PendingResourceDiscovery[] = [];
  const pendingSites: PendingEncounterSiteDiscovery[] = [];
  const pendingCombatLogs: PendingAmbushCombatLog[] = [];
  const pendingCacheLoot: Array<{ turnOccurred: number; mobFamilyId: string }> = [];
  const hiddenCaches: Array<{
    turnOccurred: number;
    loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>;
    soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null;
  }> = [];
  const allPotionsConsumed = [] as ExplorationOutcomeResult['allPotionsConsumed'];
  const ambushPendingLootSessionIds: string[] = [];
  const allNewItemIds: string[] = [];
  const allUpdatedItemIds: string[] = [];
  const allQuestProgress = [] as ExplorationOutcomeResult['allQuestProgress'];

  let currentHp = hpState.currentHp;
  let currentStamina = resources.stamina;
  let currentMana = resources.mana;
  let aborted = false;
  let abortedAtTurn: number | null = null;
  let wasKnockedOut = false;
  let respawnedTo: { townId: string; townName: string } | null = null;
  let zoneExitDiscovered = false;

  function familyHasTierEligibleMember(family: ZoneFamilyRow): boolean {
    return family.mobFamily.members.some(
      (member: ZoneFamilyMember) =>
        member.mobTemplate.zoneId === zoneId && (member.mobTemplate.explorationTier ?? 1) <= selectedTier,
    );
  }

  for (const outcome of outcomes) {
    if (aborted) break;

    if (outcome.type === 'ambush' && mobTemplates.length > 0) {
      const ambushResult = await processAmbushOutcome({
        ctx,
        outcome,
        currentHp,
        currentStamina,
        currentMana,
        buffUsesLeft,
        potionPool,
        events,
        pendingCombatLogs,
        allPotionsConsumed,
        ambushPendingLootSessionIds,
        allNewItemIds,
        allUpdatedItemIds,
        allQuestProgress,
      });
      currentHp = ambushResult.currentHp;
      currentStamina = ambushResult.currentStamina;
      currentMana = ambushResult.currentMana;
      aborted = ambushResult.aborted;
      abortedAtTurn = ambushResult.abortedAtTurn;
      wasKnockedOut = ambushResult.wasKnockedOut;
      respawnedTo = ambushResult.respawnedTo;

      continue;
    }

    if (outcome.type === 'encounter_site' && zoneFamilies.length > 0) {
      const adjustedFamilies = zoneFamilies.map((f: ZoneFamilyRow) => ({
        ...f,
        discoveryWeight: f.discoveryWeight * (spawnMods.byFamily.get(f.mobFamilyId) ?? 1) * spawnMods.global,
      }));
      const eligibleFamilies = adjustedFamilies.filter((family) => familyHasTierEligibleMember(family));
      if (eligibleFamilies.length === 0) continue;

      const trackedFamilyHasEligibleMembers = trackingFamilyId
        ? eligibleFamilies.some((family) => family.mobFamilyId === trackingFamilyId)
        : false;
      const weightedFamilies = trackedFamilyHasEligibleMembers
        ? applyTrackedFamilyWeightBias(eligibleFamilies, trackingFamilyId, 'discoveryWeight')
        : eligibleFamilies;
      let pickedFamily = pickWeighted(weightedFamilies, 'discoveryWeight') as ZoneFamilyRow | null;
      if (!pickedFamily) continue;

      let size = pickEncounterSize(pickedFamily.minSize, pickedFamily.maxSize);
      let mobs = buildEncounterSiteMobs(
        pickedFamily.mobFamily,
        size,
        zoneId,
        explorationProgress.percent,
        zoneTiers,
        selectedTier,
      );

      if (mobs.length === 0 && trackingFamilyId && pickedFamily.mobFamilyId === trackingFamilyId) {
        const fallbackFamilies = eligibleFamilies.filter((family) => family.mobFamilyId !== trackingFamilyId);
        pickedFamily = pickWeighted(fallbackFamilies, 'discoveryWeight') as ZoneFamilyRow | null;
        if (!pickedFamily) continue;

        size = pickEncounterSize(pickedFamily.minSize, pickedFamily.maxSize);
        mobs = buildEncounterSiteMobs(
          pickedFamily.mobFamily,
          size,
          zoneId,
          explorationProgress.percent,
          zoneTiers,
          selectedTier,
        );
      }

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
      const weightedResourceNodes = prospectingResourceNodeId
        ? applyProspectingResourceWeightBias(
            resourceNodes,
            prospectingResourceNodeId,
            prospectingSkillLevel ?? 1,
          )
        : resourceNodes;
      const nodeTemplate = pickWeighted(weightedResourceNodes, 'discoveryWeight') as typeof resourceNodes[number] | null;
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
      const eligibleNeighbors = undiscoveredNeighbors.filter((n) => {
        const threshold = thresholdByToId.get(n.id) ?? 0;
        return explorationProgress.percent >= threshold;
      });

      if (eligibleNeighbors.length === 0) continue;

      const neighborIndex = randomIntInclusive(0, eligibleNeighbors.length - 1);
      const neighbor = eligibleNeighbors[neighborIndex]!;
      await discoverZone(playerId, neighbor.id);
      void broadcastZoneDiscoveryActivity({
        zoneId,
        actorPlayerId: playerId,
        actorUsername: username,
        discoveredZoneName: neighbor.name,
      }).catch((error: unknown) => {
        logger.error({ err: error, playerId, zoneId, discoveredZoneId: neighbor.id }, 'Zone discovery activity broadcast failed');
      });
      // Remove discovered neighbor so subsequent zone_exit rolls don't pick it again
      const origIndex = undiscoveredNeighbors.findIndex((n) => n.id === neighbor.id);
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
          const allBossMobs = await getCachedBossMobTemplates();
          const familyMobIds = new Set(
            zoneFamilies.flatMap((zf: ZoneFamilyRow) => zf.mobFamily.members.map((m: ZoneFamilyMember) => m.mobTemplate.id)),
          );
          const bossMobs = allBossMobs.filter((m) => familyMobIds.has(m.id));

          if (bossMobs.length > 0) {
            const bossMob = bossMobs[Math.floor(Math.random() * bossMobs.length)]!;
            const bossHp = bossMob.bossBaseHp ?? bossMob.hp;

            // Create a boss world event with no expiry (lasts until defeated)
            const bossEvent = await prisma.worldEvent.create({
              data: {
                type: 'boss',
                zoneId,
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
              `zone:${zoneId}`,
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
          zoneId,
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

  return {
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
  };
}
