import { z } from 'zod';
import { Prisma, prisma } from '@pocketrealm/database';
import {
  EXPLORATION_CONSTANTS,
  GATHERING_CONSTANTS,
  GATHERING_SKILLS,
  GEM_CONSTANTS,
  PREMIUM_CONSTANTS,
  applyGatheringTechniqueEffects,
  getGatheringResourceCategory,
  getEligibleTechniquesForGathering,
  getResourceTypesForGatheringCategory,
  levelToGemTier,
  normalizeGatheringSkillType,
  normalizeResourceType,
  resolveGatheringVocation,
  type SkillType,
  type VocationTechniqueDefinition,
} from '@pocketrealm/shared';
import { createActivityLog, type ActivityType } from '../services/activityLogService';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { addStackableItemTx, getInventoryState, assertNotOverEncumbered, getStackIdentityKey } from '../services/inventoryService';
import { grantSkillXp } from '../services/xpService';
import { serializeXpGrant, paginationSchema, buildPagination, assertNotRecovering, trackAchievements } from '../utils/routeHelpers.js';
import { getSkillLevel } from '../services/combatStatsService.js';
import { getEquipmentStats } from '../services/equipmentService.js';
import { fetchItemDTOs, fetchSkillDTOs, fetchCharacterProgression, fetchResourceState, fetchInventoryMeta, fetchMaterialTotals } from '../services/stateUpdateHelpers.js';
import { computeZoneModifiers, computeEventSummaries, getActiveEventsForZone, getActiveWorldWideEvents, getEventModifiersForEntity, type EventModifierBadge } from '../services/worldEventService';
import { rollGemCritBatch, computeEventTurnCost } from '@pocketrealm/game-engine';
import { applyGuildTaxTx, getPlayerTaxRateTx, calculateInflatedCost, calculateEffectiveTurns, taxInfoFromResult } from '../services/guildTaxService';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { getBuffValue, consumeBuffStandalone } from '../services/buffService';
import { getHasActivePremiumEntitlement } from '../services/premiumEntitlement';
import { trackProgress } from '../services/progressService';
import { checkActivityLockout } from '../services/expeditionLockoutService';
import { buildGatheringResultDetails } from './gatheringResult';
import { grantPassiveVocationXpTx, getVocationSnapshot } from './vocationService';
import {
  routeJson,
  type AuthenticatedRouteServiceRequest,
  type RouteServiceResponse,
} from '../utils/routeServiceResponse';


const nodesQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  resourceType: z.string().trim().toLowerCase().regex(/^[a-z0-9_]+$/).max(32).optional(),
  skillRequired: z.string().trim().toLowerCase().refine((value) => GATHERING_SKILLS.includes(value as SkillType), {
    message: 'Invalid gathering skill',
  }).optional(),
  ...paginationSchema,
});

function calculateNodeDecay(
  node: { remainingCapacity: number; decayedCapacity: number; discoveredAt: Date },
  now: Date
): {
  targetDecay: number;
  newlyDecayed: number;
  effectiveCapacity: number;
} {
  const elapsedMs = Math.max(0, now.getTime() - node.discoveredAt.getTime());
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const targetDecay = Math.max(0, Math.floor(elapsedHours * EXPLORATION_CONSTANTS.RESOURCE_NODE_DECAY_RATE_PER_HOUR));
  const newlyDecayed = Math.max(0, targetDecay - node.decayedCapacity);
  const effectiveCapacity = Math.max(0, node.remainingCapacity - newlyDecayed);

  return { targetDecay, newlyDecayed, effectiveCapacity };
}

function getNodeSizeName(remaining: number, maxCapacity: number): string {
  const ratio = remaining / maxCapacity;
  if (ratio <= 0.25) return 'Tiny';
  if (ratio <= 0.5) return 'Small';
  if (ratio <= 0.75) return 'Medium';
  if (ratio <= 0.9) return 'Large';
  return 'Huge';
}

function buildResourceTypeFilter(resourceType: string): Prisma.ResourceNodeWhereInput {
  const knownResourceTypes = getResourceTypesForGatheringCategory(resourceType);
  return {
    OR: [
      { resourceType: { equals: resourceType, mode: 'insensitive' } },
      { resourceType: { endsWith: `_${resourceType}`, mode: 'insensitive' } },
      { resourceType: { endsWith: ` ${resourceType}`, mode: 'insensitive' } },
      ...(knownResourceTypes.length > 0 ? [{ resourceType: { in: knownResourceTypes } }] : []),
    ],
  };
}

function matchesResourceTypeFilter(resourceType: string, filter: string | undefined): boolean {
  if (!filter) return true;
  return getGatheringResourceCategory(resourceType) === filter
    || normalizeResourceType(resourceType) === normalizeResourceType(filter);
}
export async function listResourceNodes(input: AuthenticatedRouteServiceRequest): Promise<RouteServiceResponse> {
  const playerId = input.player.playerId;
  const query = nodesQuerySchema.parse(input.query);
  const now = new Date();

  const resourceNodeWhere: Prisma.ResourceNodeWhereInput = {};
  if (query.zoneId) {
    resourceNodeWhere.zoneId = query.zoneId;
  }
  if (query.resourceType) {
    Object.assign(resourceNodeWhere, buildResourceTypeFilter(query.resourceType));
  }
  if (query.skillRequired) {
    resourceNodeWhere.skillRequired = query.skillRequired;
  }

  const where: Prisma.PlayerResourceNodeWhereInput = {
    playerId,
    ...(Object.keys(resourceNodeWhere).length > 0 ? { resourceNode: resourceNodeWhere } : {}),
  };

  const playerNodes = await prisma.playerResourceNode.findMany({
    where,
    include: {
      resourceNode: {
        include: { zone: true },
      },
    },
    orderBy: [{ discoveredAt: 'desc' }],
  });

  const activeNodes: Array<(typeof playerNodes)[number] & { effectiveCapacity: number }> = [];
  for (const node of playerNodes) {
    if (!matchesResourceTypeFilter(node.resourceNode.resourceType, query.resourceType)) continue;
    const decay = calculateNodeDecay(node, now);
    if (decay.newlyDecayed > 0) {
      if (decay.effectiveCapacity <= 0) {
        await prisma.playerResourceNode.deleteMany({
          where: { id: node.id, playerId },
        });
        continue;
      }

      await prisma.playerResourceNode.updateMany({
        where: {
          id: node.id,
          playerId,
          remainingCapacity: node.remainingCapacity,
          decayedCapacity: node.decayedCapacity,
        },
        data: {
          remainingCapacity: decay.effectiveCapacity,
          decayedCapacity: decay.targetDecay,
        },
      });
    }

    const effectiveCapacity = decay.newlyDecayed > 0 ? decay.effectiveCapacity : node.remainingCapacity;
    if (effectiveCapacity <= 0) continue;
    activeNodes.push({
      ...node,
      remainingCapacity: effectiveCapacity,
      decayedCapacity: decay.newlyDecayed > 0 ? decay.targetDecay : node.decayedCapacity,
      effectiveCapacity,
    });
  }

  const zoneById = new Map<string, string>();
  const resourceTypeSet = new Set<string>();
  for (const node of activeNodes) {
    const template = node.resourceNode;
    zoneById.set(template.zoneId, template.zone.name);
    resourceTypeSet.add(getGatheringResourceCategory(template.resourceType));
  }

  const zones = Array.from(zoneById.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const resourceTypes = Array.from(resourceTypeSet).sort((a, b) => a.localeCompare(b));
  const total = activeNodes.length;
  const pagination = buildPagination(query.page, query.pageSize, total);
  const page = Math.min(query.page, pagination.totalPages);
  const offset = (page - 1) * query.pageSize;
  const pageNodes = activeNodes.slice(offset, offset + query.pageSize);

  const nodeBadgeCache = new Map<string, EventModifierBadge[]>();
  for (const pn of pageNodes) {
    const key = `${pn.resourceNode.zoneId}:${pn.resourceNode.resourceType}`;
    if (!nodeBadgeCache.has(key)) {
      nodeBadgeCache.set(key, await getEventModifiersForEntity(
        pn.resourceNode.zoneId, { resourceType: pn.resourceNode.resourceType }
      ));
    }
  }

  const shopGatheringYieldForList = await getBuffValue(playerId, 'gathering_yield');
  const gatheringBuffBadge: EventModifierBadge | null = shopGatheringYieldForList > 0
    ? { title: 'Gathering Yield Scroll', effectType: 'yield_up', effectValue: shopGatheringYieldForList, isGlobal: false }
    : null;

  return routeJson({
    nodes: pageNodes.map((pn) => {
      const template = pn.resourceNode;
      const eventMods = nodeBadgeCache.get(`${template.zoneId}:${template.resourceType}`) ?? [];
      return {
        id: pn.id, // PlayerResourceNode ID (what frontend uses to mine)
        templateId: template.id,
        zoneId: template.zoneId,
        zoneName: template.zone.name,
        resourceType: template.resourceType,
        resourceTypeCategory: getGatheringResourceCategory(template.resourceType),
        skillRequired: template.skillRequired,
        levelRequired: template.levelRequired,
        baseYield: template.baseYield,
        remainingCapacity: pn.effectiveCapacity,
        maxCapacity: template.maxCapacity,
        sizeName: getNodeSizeName(pn.effectiveCapacity, template.maxCapacity),
        discoveredAt: pn.discoveredAt.toISOString(),
        weathered: pn.decayedCapacity > 0,
        eventModifiers: [...eventMods, ...(gatheringBuffBadge ? [gatheringBuffBadge] : [])],
      };
    }),
    pagination: { ...pagination, page },
    filters: {
      zones,
      resourceTypes,
    },
  });
}

const mineSchema = z.object({
  playerNodeId: z.string().uuid(),
  turns: z.number().int().positive(),
  techniqueId: z.string().trim().min(1).optional(),
});

function scaleTurnCost(turnCost: number, multiplier: number): number {
  if (turnCost <= 0) return 0;
  return Math.max(1, Math.ceil(turnCost * multiplier));
}

function isInventoryPressureSatisfied(
  effects: ReturnType<typeof applyGatheringTechniqueEffects>,
  availableSlots: number | null,
): boolean {
  if (effects.inventoryPressureRules.length === 0) return true;
  if (availableSlots === null) return false;
  return effects.inventoryPressureRules.every((rule) => availableSlots >= rule.minFreeSlots);
}

function getGemCritChanceBonus(effects: ReturnType<typeof applyGatheringTechniqueEffects>): number {
  return effects.critChanceDeltas
    .filter((delta) => delta.critType === 'gem_crit')
    .reduce((total, delta) => total + delta.value, 0);
}

async function incrementVocationCounterTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  statKey: string,
  increment: number,
): Promise<void> {
  if (increment <= 0) return;
  await tx.playerVocationCounter.upsert({
    where: { playerId_statKey: { playerId, statKey } },
    create: { playerId, statKey, value: increment },
    update: { value: { increment } },
  });
}

function toResourceTemplateKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

async function getGemTemplateId(skill: string, tier: number): Promise<string | null> {
  const gemName = GEM_CONSTANTS.GEM_BY_SKILL_TIER[skill]?.[tier];
  if (!gemName) return null;
  const template = await prisma.itemTemplate.findFirst({
    where: { name: gemName, itemType: 'resource' },
    select: { id: true },
  });
  return template?.id ?? null;
}

async function getResourceTemplateId(resourceType: string): Promise<string> {
  const normalizedResourceType = toResourceTemplateKey(resourceType);
  const templates = await prisma.itemTemplate.findMany({
    where: { itemType: 'resource' },
    select: { id: true, name: true },
  });

  const match = templates.find((t: typeof templates[number]) => toResourceTemplateKey(t.name) === normalizedResourceType);
  if (!match) {
    throw new AppError(400, `No resource item template found for resourceType=${resourceType}`, 'MISSING_TEMPLATE');
  }
  return match.id;
}

export async function mineResourceNode(input: AuthenticatedRouteServiceRequest): Promise<RouteServiceResponse> {
  const playerId = input.player.playerId;
  const body = mineSchema.parse(input.body);

  await checkActivityLockout(playerId);

  // Pre-flight: not recovering (encumbrance checked after stack check)
  const hpState = await assertNotRecovering(playerId);

  // Find the player's discovered node
  const playerNode = await prisma.playerResourceNode.findUnique({
    where: { id: body.playerNodeId },
    include: {
      resourceNode: {
        include: { zone: true },
      },
    },
  });

  if (!playerNode || playerNode.playerId !== playerId) {
    throw new AppError(404, 'Resource node not found', 'NOT_FOUND');
  }

  const template = playerNode.resourceNode;
  const now = new Date();
  const decay = calculateNodeDecay(playerNode, now);
  const effectiveCapacity = decay.effectiveCapacity;

  if (effectiveCapacity <= 0) {
    await prisma.playerResourceNode.deleteMany({
      where: { id: playerNode.id, playerId },
    });
    throw new AppError(400, 'Node is depleted', 'NODE_DEPLETED');
  }

  const skillRequired = normalizeGatheringSkillType(template.skillRequired);
  if (!skillRequired) {
    throw new AppError(400, 'Resource node has invalid gathering skill', 'INVALID_GATHERING_SKILL');
  }
  const level = await getSkillLevel(playerId, skillRequired);
  if (level < template.levelRequired) {
    throw new AppError(400, 'Insufficient level to gather this resource', 'INSUFFICIENT_LEVEL');
  }

  const vocationId = resolveGatheringVocation(skillRequired);
  if (body.techniqueId && !vocationId) {
    throw new AppError(400, 'Vocation is not available for this gathering skill', 'VOCATION_NOT_AVAILABLE');
  }

  let selectedTechnique: VocationTechniqueDefinition | null = null;
  if (body.techniqueId && vocationId) {
    const learnedTechniques = await prisma.playerVocationTechnique.findMany({
      where: { playerId, vocationId },
      select: { techniqueId: true },
    });
    const eligibleTechniques = getEligibleTechniquesForGathering({
      vocationId,
      learnedTechniqueIds: learnedTechniques.map((technique) => technique.techniqueId),
      skillType: skillRequired,
      resourceCategory: getGatheringResourceCategory(template.resourceType),
    });
    selectedTechnique = eligibleTechniques.find((technique) => technique.id === body.techniqueId) ?? null;
    if (!selectedTechnique) {
      throw new AppError(400, 'Technique is not eligible for this gather', 'TECHNIQUE_NOT_ELIGIBLE');
    }
  }
  const techniqueEffects = applyGatheringTechniqueEffects(selectedTechnique);

  const resourceTemplateId = await getResourceTemplateId(template.resourceType);

  // Check backpack capacity: gathered resources merge only into the normal unmarked stack.
  const normalResourceStackKey = getStackIdentityKey({
    templateId: resourceTemplateId,
    rarity: 'common',
    bonusStats: null,
    craftMarks: null,
  });
  const stackCandidates = await prisma.item.findMany({
    where: { ownerId: playerId, templateId: resourceTemplateId, inStash: false },
    select: { templateId: true, rarity: true, bonusStats: true, craftMarks: true },
  });
  const existingStack = stackCandidates.find((item) => getStackIdentityKey(item) === normalResourceStackKey) ?? null;
  let availableSlotsForTechnique: number | null = null;
  if (existingStack) {
    // Resource will stack onto existing item — no new slot needed, skip encumbrance check
    if (techniqueEffects.inventoryPressureRules.length > 0) {
      availableSlotsForTechnique = (await getInventoryState(playerId)).availableSlots;
    }
  } else {
    // Need a new slot: enforce both over-encumbered and full-backpack checks
    await assertNotOverEncumbered(playerId);
    const { availableSlots } = await getInventoryState(playerId);
    availableSlotsForTechnique = availableSlots;
    if (availableSlots <= 0) {
      throw new AppError(400, 'Backpack is full. Make space before gathering.', 'BACKPACK_FULL');
    }
  }

  // Linear yield scaling: +10% per level above requirement
  const levelsAbove = Math.max(0, level - template.levelRequired);
  const yieldMultiplier = 1 + levelsAbove * GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL;
  const baseYield = Math.max(template.baseYield, GATHERING_CONSTANTS.BASE_YIELD);

  // Apply world event resource modifiers + guild gathering yield — fetch events once
  const [cachedZoneEvents, cachedWorldEvents] = await Promise.all([
    getActiveEventsForZone(template.zoneId),
    getActiveWorldWideEvents(),
  ]);
  const zoneModifiers = computeZoneModifiers(cachedZoneEvents, cachedWorldEvents, { resourceType: template.resourceType });
  const activeEventEffects = computeEventSummaries(cachedZoneEvents, cachedWorldEvents);
  const guildMods = await getPlayerGuildModifiers(playerId);
  const shopGatheringYield = await getBuffValue(playerId, 'gathering_yield');
  const hasChampion = await getHasActivePremiumEntitlement(prisma, playerId);
  const championMultiplier = hasChampion ? PREMIUM_CONSTANTS.BONUS_MULTIPLIER : 1;

  // Apply level + guild/shop multipliers to batch total, not per-action
  // (fixes dead zone where Math.floor discards fractional multipliers every action)
  const combinedYieldBonus = guildMods.gatheringYield + shopGatheringYield;
  const totalMultiplier = yieldMultiplier * (1 + combinedYieldBonus) * championMultiplier;
  // Unrounded effective yield for capacity planning
  const effectiveYieldPerAction = baseYield * totalMultiplier;
  // Display value for yieldBreakdown (rounded for display only)
  const baseYieldPerAction = Math.floor(baseYield * yieldMultiplier);

  // yield_down → increase turn cost (so players still collect the full amount)
  // yield_up  → bonus yield (applied after raw yield calculation)
  const eventMultiplier = zoneModifiers.resourceYieldMultiplier;
  const turnCostPerAction = scaleTurnCost(computeEventTurnCost(eventMultiplier), techniqueEffects.turnCostMultiplier);
  if (body.turns < turnCostPerAction) {
    throw new AppError(400, `Minimum is ${turnCostPerAction} turns`, 'INVALID_TURNS');
  }
  const techniqueOutputDelta = isInventoryPressureSatisfied(techniqueEffects, availableSlotsForTechnique)
    ? techniqueEffects.outputQuantityDelta
    : 0;
  const gemCritChanceBonus = getGemCritChanceBonus(techniqueEffects);
  const xpPerAction = GATHERING_CONSTANTS.XP_PER_ACTION_BASE
    + Math.floor(template.levelRequired / GATHERING_CONSTANTS.XP_LEVEL_SCALING_DIVISOR);

  const { turnSpend, taxResult, actions, totalYield, rawTotalYield, unclampedRawYield, newCapacity, nodeDepleted, stack } = await prisma.$transaction(async (tx) => {
    // Validate player is actually in the node's zone inside the transaction to prevent TOCTOU race
    const playerForZone = await tx.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    if (template.zoneId !== playerForZone?.currentZoneId) {
      throw new AppError(400, 'You must travel to this zone to gather this resource', 'WRONG_ZONE');
    }

    // Look up tax rate to calculate effective turns
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const effectiveTurns = calculateEffectiveTurns(body.turns, taxRate);

    const maxActionsByTurns = Math.floor(effectiveTurns / turnCostPerAction);
    const effectiveCapacityPerAction = Math.max(1, effectiveYieldPerAction + Math.max(0, techniqueOutputDelta));
    const maxActionsByCapacity = Math.ceil(effectiveCapacity / effectiveCapacityPerAction);
    const innerActions = Math.min(maxActionsByTurns, maxActionsByCapacity);

    if (innerActions <= 0) {
      throw new AppError(400, 'Not enough turns after guild tax', 'INSUFFICIENT_TURNS');
    }

    const baseTurns = innerActions * turnCostPerAction;
    const actualTurns = calculateInflatedCost(baseTurns, taxRate);

    // Batch-level floor: apply multipliers to total, not per-action (fixes fractional dead zone)
    const techniqueYieldBonus = innerActions * techniqueOutputDelta;
    const innerUnclampedRawYield = Math.max(1, Math.floor(innerActions * effectiveYieldPerAction) + techniqueYieldBonus);
    const innerRawYield = Math.min(innerUnclampedRawYield, effectiveCapacity);
    const eventAdjustedYield = eventMultiplier > 1
      ? Math.max(1, Math.floor(innerRawYield * eventMultiplier))
      : innerRawYield;
    const innerTotalYield = Math.min(eventAdjustedYield, effectiveCapacity);
    const capacityAfterYield = effectiveCapacity - innerTotalYield;
    const capacityPreserved = capacityAfterYield > 0
      && techniqueEffects.capacityPreserveChance > 0
      && Math.random() < techniqueEffects.capacityPreserveChance;
    const preservedCapacity = capacityPreserved ? capacityAfterYield + innerTotalYield : capacityAfterYield;
    const innerNewCapacity = Math.max(0, Math.min(preservedCapacity, effectiveCapacity, template.maxCapacity));
    const innerNodeDepleted = innerNewCapacity <= 0;

    const spent = await spendPlayerTurnsTx(tx, playerId, actualTurns);
    const tax = await applyGuildTaxTx(tx, playerId, actualTurns);

    if (innerNodeDepleted) {
      const depleted = await tx.playerResourceNode.deleteMany({
        where: {
          id: playerNode.id,
          playerId,
          remainingCapacity: playerNode.remainingCapacity,
          decayedCapacity: playerNode.decayedCapacity,
        },
      });
      if (depleted.count !== 1) {
        throw new AppError(409, 'Resource node state changed; try again', 'NODE_STATE_CHANGED');
      }
    } else {
      const updated = await tx.playerResourceNode.updateMany({
        where: {
          id: playerNode.id,
          playerId,
          remainingCapacity: playerNode.remainingCapacity,
          decayedCapacity: playerNode.decayedCapacity,
        },
        data: {
          remainingCapacity: innerNewCapacity,
          decayedCapacity: decay.targetDecay,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, 'Resource node state changed; try again', 'NODE_STATE_CHANGED');
      }
    }

    const minedStack = await addStackableItemTx(tx, playerId, resourceTemplateId, innerTotalYield);
    if (vocationId) {
      await grantPassiveVocationXpTx({
        tx,
        playerId,
        vocationId,
        source: 'gather',
        baseXp: innerActions * xpPerAction,
      });
      await incrementVocationCounterTx(tx, playerId, `vocation_gathers_${vocationId}`, innerActions);
      if (selectedTechnique) {
        await incrementVocationCounterTx(tx, playerId, `vocation_technique_uses_${selectedTechnique.id}`, 1);
        if (capacityPreserved) {
          await incrementVocationCounterTx(tx, playerId, `vocation_capacity_preserved_${selectedTechnique.id}`, 1);
        }
      }
    }

    return {
      turnSpend: spent,
      taxResult: tax,
      actions: innerActions,
      totalYield: innerTotalYield,
      rawTotalYield: innerRawYield,
      unclampedRawYield: innerUnclampedRawYield,
      newCapacity: innerNewCapacity,
      nodeDepleted: innerNodeDepleted,
      stack: minedStack,
    };
  });

  const resultDetails = buildGatheringResultDetails({
    levelMultiplier: yieldMultiplier,
    guildAndBuffBonus: combinedYieldBonus,
    championMultiplier,
    eventMultiplier,
    unclampedRawYield,
    rawTotalYield,
    totalYield,
    effectiveCapacity,
  });

  // Consume shop gathering yield buff (one use per gather action)
  if (shopGatheringYield > 0) await consumeBuffStandalone(playerId, 'gathering_yield');

  // XP: scaled by node level requirement
  const rawXp = actions * xpPerAction;
  const xpGrant = await grantSkillXp(playerId, skillRequired, rawXp, undefined, guildMods.xpBoost || undefined);

  // Guild contract + quest progress for gathering
  const questProgress = await trackProgress(playerId, 'gather_actions', actions);

  // --- Gem crit rolls (one per gathering action) ---
  let gemCrit: { itemTemplateId: string; itemId: string; gemName: string; gemsFound: number; critChance: number } | null = null;
  let gemExistedBeforeAdd = false;
  const gemTemplateId = await getGemTemplateId(skillRequired, levelToGemTier(template.levelRequired));
  if (gemTemplateId) {
    const equipStats = await getEquipmentStats(playerId);
    const luckStat = equipStats.luck;

    const critResult = rollGemCritBatch(
      { skillLevel: level, nodeLevel: template.levelRequired, luckStat, championMultiplier, critChanceBonus: gemCritChanceBonus },
      actions,
    );

    if (critResult.gemsFound > 0) {
      const gemStack = await prisma.$transaction(async (tx) => {
        const addedGemStack = await addStackableItemTx(tx, playerId, gemTemplateId, critResult.gemsFound);
        if (selectedTechnique) {
          await incrementVocationCounterTx(
            tx,
            playerId,
            `vocation_gather_crits_${selectedTechnique.id}_gem_crit`,
            critResult.gemsFound,
          );
        }
        return addedGemStack;
      });
      gemExistedBeforeAdd = !gemStack.created;
      const gemTier = levelToGemTier(template.levelRequired);
      gemCrit = {
        itemTemplateId: gemTemplateId,
        itemId: gemStack.itemId,
        gemName: GEM_CONSTANTS.GEM_BY_SKILL_TIER[skillRequired]?.[gemTier] ?? 'Unknown Gem',
        gemsFound: critResult.gemsFound,
        critChance: critResult.critChance,
      };
    }
  }

  // --- Achievement tracking (counters + derived checks) ---
  const gatherAchKeys = ['totalGatheringActions'];
  if (xpGrant.newLevel) gatherAchKeys.push('highestSkillLevel');
  if (xpGrant.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) gatherAchKeys.push('highestCharacterLevel');
  if (vocationId) {
    gatherAchKeys.push(
      'totalVocationGathers',
      `vocationGathers_${vocationId}`,
      'highestVocationRank',
      'vocationRank5Count',
      'vocationRank10Count',
      'vocationRank20Count',
    );
    if (gemCrit) {
      gatherAchKeys.push('totalVocationGatherCrits');
    }
  }
  await trackAchievements(playerId, {
    totalGatheringActions: actions,
    totalTurnsSpent: turnSpend.spent,
  }, { statKeys: gatherAchKeys });

  // --- Build stateUpdates ---
  const resourceItemIds = [stack.itemId];
  const inventoryAdded: string[] = stack.created ? resourceItemIds : [];
  const inventoryUpdated: string[] = stack.created ? [] : resourceItemIds;

  // Include gem item in the appropriate bucket if a gem crit occurred
  if (gemCrit) {
    if (gemExistedBeforeAdd) {
      inventoryUpdated.push(gemCrit.itemId);
    } else {
      inventoryAdded.push(gemCrit.itemId);
    }
  }

  const [inventoryAddedDTOs, inventoryUpdatedDTOs, skills, characterProgression, resources, inventoryMeta, materialTotals, vocationSnapshot] = await Promise.all([
    fetchItemDTOs(inventoryAdded),
    fetchItemDTOs(inventoryUpdated),
    fetchSkillDTOs(playerId),
    fetchCharacterProgression(playerId),
    fetchResourceState(playerId),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
    vocationId ? getVocationSnapshot(playerId) : Promise.resolve(null),
  ]);

  const stateUpdates = {
    ...(inventoryAddedDTOs.length > 0 ? { inventoryAdded: inventoryAddedDTOs } : {}),
    ...(inventoryUpdatedDTOs.length > 0 ? { inventoryUpdated: inventoryUpdatedDTOs } : {}),
    skills,
    characterProgression,
    resources,
    inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
    materialTotals,
    ...(vocationSnapshot ? { vocations: vocationSnapshot } : {}),
  };

  const log = await createActivityLog({
    playerId,
    activityType: skillRequired as ActivityType,
    turnsSpent: turnSpend.spent,
    result: {
      zoneId: template.zoneId,
      zoneName: template.zone.name,
      playerNodeId: playerNode.id,
      resourceNodeId: template.id,
      resourceType: template.resourceType,
      actions,
      baseYield,
      yieldMultiplier,
      totalYield,
      remainingCapacity: nodeDepleted ? 0 : newCapacity,
      nodeDepleted,
      itemTemplateId: resourceTemplateId,
      itemId: stack.itemId,
      xp: serializeXpGrant(xpGrant),
      gemCrit: gemCrit ? { itemTemplateId: gemCrit.itemTemplateId, gemName: gemCrit.gemName, gemsFound: gemCrit.gemsFound } : undefined,
    },
  });

  return routeJson({
    logId: log.id,
    turns: turnSpend,
    node: {
      id: playerNode.id,
      templateId: template.id,
      zoneId: template.zoneId,
      zoneName: template.zone.name,
      resourceType: template.resourceType,
      levelRequired: template.levelRequired,
      remainingCapacity: nodeDepleted ? 0 : newCapacity,
      nodeDepleted,
    },
    results: {
      actions,
      baseYield,
      yieldMultiplier,
      totalMultiplier: resultDetails.totalMultiplier,
      championMultiplier: resultDetails.championMultiplier,
      totalYield,
      capacityLimited: resultDetails.capacityLimited,
      itemTemplateId: resourceTemplateId,
      itemId: stack.itemId,
    },
    xp: serializeXpGrant(xpGrant),
    gemCrit: gemCrit ?? undefined,
    activeEvents: (() => {
      const badges = [
        ...activeEventEffects,
        ...(shopGatheringYield > 0 ? [{ title: 'Gathering Yield Scroll', effectType: 'yield_up', effectValue: shopGatheringYield, isGlobal: false }] : []),
      ];
      return badges.length > 0 ? badges : undefined;
    })(),
    yieldBreakdown: zoneModifiers.resourceYieldMultiplier !== 1
      ? {
          baseYieldPerAction,
          totalYieldPerAction: baseYieldPerAction, // deprecated; kept for client compat
          totalMultiplier: resultDetails.totalMultiplier,
          championMultiplier: resultDetails.championMultiplier,
          bonusMultiplier: resultDetails.bonusMultiplier,
          rawTotalYield,
          unclampedRawYield,
          capacityLimited: resultDetails.capacityLimited,
          eventModifier: zoneModifiers.resourceYieldMultiplier,
          turnCostPerAction,
          eventTitle: activeEventEffects.find((e: { effectType: string }) => e.effectType === 'yield_up' || e.effectType === 'yield_down')?.title ?? null,
        }
      : {
          baseYieldPerAction,
          totalYieldPerAction: baseYieldPerAction,
          totalMultiplier: resultDetails.totalMultiplier,
          championMultiplier: resultDetails.championMultiplier,
          bonusMultiplier: resultDetails.bonusMultiplier,
          rawTotalYield,
          unclampedRawYield,
          capacityLimited: resultDetails.capacityLimited,
          eventModifier: zoneModifiers.resourceYieldMultiplier,
          turnCostPerAction,
          eventTitle: null,
        },
    tax: taxInfoFromResult(taxResult),
    ...(questProgress.length > 0 ? { questProgress } : {}),
    stateUpdates,
  });
}
