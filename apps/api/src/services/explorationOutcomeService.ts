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
  WORLD_EVENT_TEMPLATES,
  WORLD_EVENT_CONSTANTS,
  type MobTemplate,
  type PotionConsumed,
  type QuestProgressUpdate,
  type CombatPotion,
  type CombatTemplateSlotData,
  type PerActionScaling,
  type WorldEventData,
} from '@pocketrealm/shared';
import { setHp, enterRecoveringState } from './hpService';
import { degradeEquippedDurability } from './durabilityService';
import { applyCombatBuffs, consumeBuffChargesPerMob, buildCombatBuffBadges, type CombatBuffBadge } from './buffService';
import { buildPlayerTemplateCombatant, processCombatVictoryRewards, buildCombatLogResult } from './combatOrchestrationService';
import { persistMobHp } from './persistedMobService';
import { discoverZone, respawnToHomeTown } from './zoneDiscoveryService';
import { createBossEncounter } from './bossEncounterService';
import { spawnWorldEvent, computeZoneModifiers, filterEventModifiers } from './worldEventService';
import { getCachedBossMobTemplates } from './staticDataCacheService';
import { getIo } from '../socket';
import { emitSystemMessage } from './systemMessageService';
import { mapTemplateCombatLog } from './combatLogMapper';
import { serializeXpGrant, toMobTemplate, calculateFleeWithGold, buildPveCombatOptions } from '../utils/routeHelpers.js';
import { applyTrackedFamilyWeightBias } from './explorationTrackingService';
import type { GrantXpResult } from './xpService';
import type { PlayerProgressionState } from './attributesService';
import type { EquipmentStats } from './equipmentService';
import type { PlayerGuildModifiers } from './guildUpgradeService';
import type { AttackSkill } from './combatStatsService';
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
} from '../routes/exploration/helpers';

export interface ExplorationOutcomeContext {
  playerId: string;
  username: string;
  zoneId: string;
  zone: { id: string; name: string; difficulty: number };
  hpState: { currentHp: number; maxHp: number };
  combatPrep: {
    attackSkill: AttackSkill;
    attackLevel: number;
    guildMods: PlayerGuildModifiers;
    perActionScaling: PerActionScaling;
    playerTemplate: CombatTemplateSlotData[];
    potionPool: CombatPotion[];
    resources: {
      stamina: number;
      maxStamina: number;
      staminaRegenPerRound: number;
      mana: number;
      maxMana: number;
      manaRegenPerRound: number;
    };
    unlockedActions: string[];
  };
  combatBuffs: { damageBoost: number; defenceBoost: number; durabilityShield: number };
  buffUsesLeft: { damage: number; defence: number; durability: number };
  progression: PlayerProgressionState;
  equipmentStats: EquipmentStats;
  mobTemplates: unknown[];
  zoneFamilies: ZoneFamilyRow[];
  zoneTiers: Record<string, number> | null;
  selectedTier: number;
  explorationProgress: { percent: number; turnsExplored: number; turnsToExplore: number | null };
  zoneModifiers: ReturnType<typeof computeZoneModifiers>;
  spawnMods: {
    global: number;
    byFamily: Map<string, number>;
  };
  mobToFamilyMap: Map<string, string>;
  trackingFamilyId: string | null;
  cachedZoneEvents: WorldEventData[];
  cachedWorldEvents: WorldEventData[];
  isTutorialExplore: boolean;
  resourceNodes: Array<{
    id: string;
    discoveryWeight: number;
    resourceType: string;
    minCapacity: number;
    maxCapacity: number;
  }>;
  undiscoveredNeighbors: Array<{ id: string; name: string }>;
  thresholdByToId: Map<string, number>;
}

export interface ExplorationOutcomeResult {
  events: NarrativeEvent[];
  pendingResources: PendingResourceDiscovery[];
  pendingSites: PendingEncounterSiteDiscovery[];
  pendingCombatLogs: PendingAmbushCombatLog[];
  pendingCacheLoot: Array<{ turnOccurred: number; mobFamilyId: string }>;
  hiddenCaches: Array<{
    turnOccurred: number;
    loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>;
    soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null;
  }>;
  allPotionsConsumed: PotionConsumed[];
  ambushPendingLootSessionIds: string[];
  allNewItemIds: string[];
  allUpdatedItemIds: string[];
  allQuestProgress: QuestProgressUpdate[];
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  aborted: boolean;
  abortedAtTurn: number | null;
  wasKnockedOut: boolean;
  respawnedTo: { townId: string; townName: string } | null;
  zoneExitDiscovered: boolean;
}

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
    resourceNodes,
    thresholdByToId,
  } = ctx;

  const { attackSkill, attackLevel, perActionScaling, playerTemplate, resources, unlockedActions: explorationUnlockedActions } = combatPrep;

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
  const allPotionsConsumed: PotionConsumed[] = [];
  const ambushPendingLootSessionIds: string[] = [];
  const allNewItemIds: string[] = [];
  const allUpdatedItemIds: string[] = [];
  const allQuestProgress: QuestProgressUpdate[] = [];

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
      let baseMob: MobTemplate;
      let prefixedMob: ReturnType<typeof applyMobPrefix>;

      if (isTutorialExplore) {
        // Tutorial: guaranteed Field Mouse with no prefix
        const fieldMouse = mobTemplates.find((m) => (m as { name: string }).name === 'Field Mouse')
          ?? mobTemplates[0]!;
        baseMob = toMobTemplate(fieldMouse as Parameters<typeof toMobTemplate>[0]);
        prefixedMob = applyMobPrefix(baseMob, null);
      } else {
        const tieredMobs = filterAndWeightMobsByTier(
          mobTemplates.map((m) => ({ ...(m as object), explorationTier: (m as { explorationTier?: number }).explorationTier ?? 1 })) as Parameters<typeof filterAndWeightMobsByTier>[0],
          explorationProgress.percent,
          zoneTiers,
        );
        if (tieredMobs.length === 0) continue;

        // Apply tier bleedthrough: select a target tier, filter to it, fall back to lower tiers
        const targetTier = selectTierWithBleedthrough(selectedTier, zoneTiers);
        let candidates = tieredMobs.filter((m) => m.explorationTier === targetTier);
        if (candidates.length === 0) {
          for (let t = targetTier - 1; t >= 1; t--) {
            candidates = tieredMobs.filter((m) => m.explorationTier === t);
            if (candidates.length > 0) break;
          }
        }
        if (candidates.length === 0) candidates = tieredMobs;

        // Boost encounter weights for mobs in families affected by spawn rate events
        const weightedCandidates = candidates.map((c) => {
          let weightMod = spawnMods.global;
          for (const [familyId, mod] of spawnMods.byFamily) {
            const family = zoneFamilies.find((f: ZoneFamilyRow) => f.mobFamilyId === familyId);
            if (family?.mobFamily?.members?.some((m: ZoneFamilyMember) => m.mobTemplate.id === (c as { id: string }).id)) {
              weightMod *= mod;
              break;
            }
          }
          return weightMod !== 1 ? { ...c, encounterWeight: (c as { encounterWeight: number }).encounterWeight * weightMod } : c;
        });
        const trackedWeightedCandidates = applyTrackedFamilyWeightBias(
          weightedCandidates.map((c) => ({
            ...c,
            mobFamilyId: ctx.mobToFamilyMap.get((c as { id: string }).id) ?? '',
          })) as Array<(typeof weightedCandidates)[number] & { mobFamilyId: string }>,
          trackingFamilyId,
          'encounterWeight',
        );

        const mob = pickWeighted(trackedWeightedCandidates, 'encounterWeight') as typeof candidates[number] | null;
        if (!mob) continue;

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

      // Apply quest shop combat buffs
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
      });
      const combatantB = mobToTemplateCombatant(prefixedMob);
      const combatResult = runTemplateCombat(combatantA, combatantB, combatOptions);

      // Remove consumed potions from the shared pool
      for (const consumed of combatResult.potionsConsumed) {
        const idx = potionPool.findIndex((p) => p.templateId === consumed.templateId);
        if (idx !== -1) potionPool.splice(idx, 1);
        allPotionsConsumed.push(consumed);
      }

      const explDurabilityMult = prefixedMob.mobPrefix
        ? DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.elite
        : DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.default;
      const durabilityLost = buffUsesLeft.durability > 0
        ? []
        : await degradeEquippedDurability(playerId, combatResult.log, 'combatantA', explDurabilityMult);
      for (const d of durabilityLost) allUpdatedItemIds.push(d.itemId);

      // Consume combat buff charges per ambush mob
      await prisma.$transaction(async (tx) => {
        await consumeBuffChargesPerMob(tx, playerId, buffUsesLeft);
      });

      // Determine mob family once for event modifier badges (used in both victory and defeat paths)
      const ambushMobFamily = zoneFamilies.find((f: ZoneFamilyRow) =>
        f.mobFamily.members.some((m: ZoneFamilyMember) => m.mobTemplate.id === prefixedMob.id),
      );
      const ambushEventModifiers = ambushMobFamily
        ? filterEventModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: ambushMobFamily.mobFamilyId })
        : [];

      // Build buff badges for this ambush (reflect state at time of fight)
      const shieldWasActive = buffUsesLeft.durability + 1 > 0 && combatBuffs.durabilityShield > 0 && durabilityLost.length === 0;
      const ambushBuffBadges: CombatBuffBadge[] = buildCombatBuffBadges({
        damageBoost: mobBuffs.damageBoost,
        defenceBoost: mobBuffs.defenceBoost,
        durabilityShield: shieldWasActive ? combatBuffs.durabilityShield : 0,
      });

      let loot: Array<{ itemTemplateId: string; quantity: number; rarity?: string }> = [];
      let xpGain = 0;
      let xpGrants: GrantXpResult[] = [];

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
        allNewItemIds.push(...rewards.newItemIds);
        allUpdatedItemIds.push(...rewards.updatedItemIds);
        if (rewards.pendingLootSessionId) {
          ambushPendingLootSessionIds.push(rewards.pendingLootSessionId);
        }
        allQuestProgress.push(...rewards.questProgress);
        xpGrants = rewards.xpGrants;
        xpGain = xpGrants.reduce((sum, g) => sum + g.boostedXpAfterEfficiency, 0);

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

        // Persist the mob's remaining HP for potential reencounter
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

      continue;
    }

    if (outcome.type === 'encounter_site' && zoneFamilies.length > 0) {
      const adjustedFamilies = zoneFamilies.map((f: ZoneFamilyRow) => ({
        ...f,
        discoveryWeight: f.discoveryWeight * (spawnMods.byFamily.get(f.mobFamilyId) ?? 1) * spawnMods.global,
      }));
      const trackedFamilyHasEligibleMembers = trackingFamilyId
        ? adjustedFamilies.some((family) => family.mobFamilyId === trackingFamilyId && familyHasTierEligibleMember(family))
        : false;
      const weightedFamilies = trackedFamilyHasEligibleMembers
        ? applyTrackedFamilyWeightBias(adjustedFamilies, trackingFamilyId, 'discoveryWeight')
        : adjustedFamilies;
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
        const fallbackFamilies = adjustedFamilies.filter((family) => family.mobFamilyId !== trackingFamilyId);
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
      const eligibleNeighbors = undiscoveredNeighbors.filter((n) => {
        const threshold = thresholdByToId.get(n.id) ?? 0;
        return explorationProgress.percent >= threshold;
      });

      if (eligibleNeighbors.length === 0) continue;

      const neighborIndex = randomIntInclusive(0, eligibleNeighbors.length - 1);
      const neighbor = eligibleNeighbors[neighborIndex]!;
      await discoverZone(playerId, neighbor.id);
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
