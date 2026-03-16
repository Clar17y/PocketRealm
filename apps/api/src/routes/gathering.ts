import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@pocketrealm/database';
import { EXPLORATION_CONSTANTS, GATHERING_CONSTANTS, GATHERING_SKILLS, GEM_CONSTANTS, levelToGemTier, type SkillType } from '@pocketrealm/shared';
import { createActivityLog } from '../services/activityLogService';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { addStackableItemTx, getInventoryState, assertNotOverEncumbered } from '../services/inventoryService';
import { grantSkillXp } from '../services/xpService';
import { serializeXpGrant, paginationSchema, buildPagination, assertNotRecovering, trackAchievements } from '../utils/routeHelpers.js';
import { getSkillLevel } from '../services/combatStatsService.js';
import { getEquipmentStats } from '../services/equipmentService.js';
import { fetchItemDTOs, fetchSkillDTOs, fetchCharacterProgression, fetchResourceState, fetchInventoryMeta, fetchMaterialTotals } from '../services/stateUpdateHelpers.js';
import { computeZoneModifiers, computeEventSummaries, getActiveEventsForZone, getActiveWorldWideEvents, getEventModifiersForEntity, type EventModifierBadge } from '../services/worldEventService';
import { rollGemCritBatch, computeEventTurnCost } from '@pocketrealm/game-engine';
import { asyncHandler } from '../utils/asyncHandler';
import { applyGuildTaxTx, getPlayerTaxRateTx, calculateInflatedCost, calculateEffectiveTurns, taxInfoFromResult } from '../services/guildTaxService';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { getBuffValue, consumeBuffStandalone } from '../services/buffService';
import { trackProgress } from '../services/progressService';

export const gatheringRouter = Router();

gatheringRouter.use(authenticate);

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

function getResourceTypeCategory(resourceType: string): string {
  const normalized = resourceType.trim().toLowerCase();
  const parts = normalized.split('_').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : normalized;
}

/**
 * GET /api/v1/gathering/nodes?zoneId=...&resourceType=...&skillRequired=...&page=...&pageSize=...
 * List player's discovered resource nodes with remaining capacity, pagination, and filter metadata.
 */
gatheringRouter.get('/nodes', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const query = nodesQuerySchema.parse(req.query);
  const now = new Date();

  const resourceNodeWhere: Prisma.ResourceNodeWhereInput = {};
  if (query.zoneId) {
    resourceNodeWhere.zoneId = query.zoneId;
  }
  if (query.resourceType) {
    resourceNodeWhere.OR = [
      { resourceType: query.resourceType },
      { resourceType: { endsWith: `_${query.resourceType}` } },
    ];
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
    resourceTypeSet.add(getResourceTypeCategory(template.resourceType));
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

  res.json({
    nodes: pageNodes.map((pn) => {
      const template = pn.resourceNode;
      const eventMods = nodeBadgeCache.get(`${template.zoneId}:${template.resourceType}`) ?? [];
      return {
        id: pn.id, // PlayerResourceNode ID (what frontend uses to mine)
        templateId: template.id,
        zoneId: template.zoneId,
        zoneName: template.zone.name,
        resourceType: template.resourceType,
        resourceTypeCategory: getResourceTypeCategory(template.resourceType),
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
}));

const mineSchema = z.object({
  playerNodeId: z.string().uuid(),
  turns: z.number().int().positive(),
});

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

/**
 * POST /api/v1/gathering/mine
 * Mine from a discovered resource node, depleting its capacity.
 */
gatheringRouter.post('/mine', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = mineSchema.parse(req.body);

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

  const skillRequired = template.skillRequired as SkillType;
  const level = await getSkillLevel(playerId, skillRequired);
  if (level < template.levelRequired) {
    throw new AppError(400, 'Insufficient level to gather this resource', 'INSUFFICIENT_LEVEL');
  }

  if (body.turns < GATHERING_CONSTANTS.BASE_TURN_COST) {
    throw new AppError(400, `Minimum is ${GATHERING_CONSTANTS.BASE_TURN_COST} turns`, 'INVALID_TURNS');
  }

  const resourceTemplateId = await getResourceTemplateId(template.resourceType);

  // Check backpack capacity — resources stack, so only block if no existing stack
  const existingStack = await prisma.item.findFirst({
    where: { ownerId: playerId, templateId: resourceTemplateId, inStash: false },
  });
  if (existingStack) {
    // Resource will stack onto existing item — no new slot needed, skip encumbrance check
  } else {
    // Need a new slot: enforce both over-encumbered and full-backpack checks
    await assertNotOverEncumbered(playerId);
    const { availableSlots } = await getInventoryState(playerId);
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

  // Apply level + guild/shop multipliers to batch total, not per-action
  // (fixes dead zone where Math.floor discards fractional multipliers every action)
  const combinedYieldBonus = guildMods.gatheringYield + shopGatheringYield;
  const totalMultiplier = yieldMultiplier * (1 + combinedYieldBonus);
  // Unrounded effective yield for capacity planning
  const effectiveYieldPerAction = baseYield * totalMultiplier;
  // Display value for yieldBreakdown (rounded for display only)
  const baseYieldPerAction = Math.floor(baseYield * yieldMultiplier);

  // yield_down → increase turn cost (so players still collect the full amount)
  // yield_up  → bonus yield (applied after raw yield calculation)
  const eventMultiplier = zoneModifiers.resourceYieldMultiplier;
  const turnCostPerAction = computeEventTurnCost(eventMultiplier);

  const { turnSpend, taxResult, actions, totalYield, rawTotalYield, newCapacity, nodeDepleted, stack } = await prisma.$transaction(async (tx) => {
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
    const maxActionsByCapacity = Math.ceil(effectiveCapacity / effectiveYieldPerAction);
    const innerActions = Math.min(maxActionsByTurns, maxActionsByCapacity);

    if (innerActions <= 0) {
      throw new AppError(400, 'Not enough turns after guild tax', 'INSUFFICIENT_TURNS');
    }

    const baseTurns = innerActions * turnCostPerAction;
    const actualTurns = calculateInflatedCost(baseTurns, taxRate);

    // Batch-level floor: apply multipliers to total, not per-action (fixes fractional dead zone)
    const innerRawYield = Math.min(Math.max(1, Math.floor(innerActions * effectiveYieldPerAction)), effectiveCapacity);
    const innerTotalYield = eventMultiplier > 1
      ? Math.max(1, Math.floor(innerRawYield * eventMultiplier))
      : innerRawYield;
    const innerNewCapacity = effectiveCapacity - innerTotalYield;
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
    return {
      turnSpend: spent,
      taxResult: tax,
      actions: innerActions,
      totalYield: innerTotalYield,
      rawTotalYield: innerRawYield,
      newCapacity: innerNewCapacity,
      nodeDepleted: innerNodeDepleted,
      stack: minedStack,
    };
  });

  // Consume shop gathering yield buff (one use per gather action)
  if (shopGatheringYield > 0) await consumeBuffStandalone(playerId, 'gathering_yield');

  // XP: scaled by node level requirement
  const xpPerAction = GATHERING_CONSTANTS.XP_PER_ACTION_BASE
    + Math.floor(template.levelRequired / GATHERING_CONSTANTS.XP_LEVEL_SCALING_DIVISOR);
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
      { skillLevel: level, nodeLevel: template.levelRequired, luckStat },
      actions,
    );

    if (critResult.gemsFound > 0) {
      // Check if a gem stack already exists before adding (to classify created vs updated)
      const existingGemStack = await prisma.item.findFirst({
        where: { ownerId: playerId, templateId: gemTemplateId, inStash: false },
      });
      gemExistedBeforeAdd = existingGemStack !== null;

      const gemStack = await prisma.$transaction(async (tx) => {
        return addStackableItemTx(tx, playerId, gemTemplateId, critResult.gemsFound);
      });
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
  await trackAchievements(playerId, {
    totalGatheringActions: actions,
    totalTurnsSpent: turnSpend.spent,
  }, { statKeys: gatherAchKeys });

  // --- Build stateUpdates ---
  // Classify resource item as created or updated based on existingStack check done earlier
  const resourceItemIds = [stack.itemId];
  const inventoryAdded: string[] = existingStack ? [] : resourceItemIds;
  const inventoryUpdated: string[] = existingStack ? resourceItemIds : [];

  // Include gem item in the appropriate bucket if a gem crit occurred
  if (gemCrit) {
    if (gemExistedBeforeAdd) {
      inventoryUpdated.push(gemCrit.itemId);
    } else {
      inventoryAdded.push(gemCrit.itemId);
    }
  }

  const [inventoryAddedDTOs, inventoryUpdatedDTOs, skills, characterProgression, resources, inventoryMeta, materialTotals] = await Promise.all([
    fetchItemDTOs(inventoryAdded),
    fetchItemDTOs(inventoryUpdated),
    fetchSkillDTOs(playerId),
    fetchCharacterProgression(playerId),
    fetchResourceState(playerId),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);

  const stateUpdates = {
    ...(inventoryAddedDTOs.length > 0 ? { inventoryAdded: inventoryAddedDTOs } : {}),
    ...(inventoryUpdatedDTOs.length > 0 ? { inventoryUpdated: inventoryUpdatedDTOs } : {}),
    skills,
    characterProgression,
    resources,
    inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
    materialTotals,
  };

  const log = await createActivityLog({
    playerId,
    activityType: skillRequired,
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

  res.json({
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
      totalYield,
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
          rawTotalYield,
          eventModifier: zoneModifiers.resourceYieldMultiplier,
          turnCostPerAction,
          eventTitle: activeEventEffects.find((e: { effectType: string }) => e.effectType === 'yield_up' || e.effectType === 'yield_down')?.title ?? null,
        }
      : undefined,
    tax: taxInfoFromResult(taxResult),
    ...(questProgress.length > 0 ? { questProgress } : {}),
    stateUpdates,
  });
}));
