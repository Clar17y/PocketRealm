import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import { EXPLORATION_CONSTANTS, GATHERING_CONSTANTS, GATHERING_SKILLS, type SkillType } from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { addStackableItemTx } from '../services/inventoryService';
import { grantSkillXp } from '../services/xpService';
import { serializeXpGrant, paginationSchema, buildPagination, assertNotRecovering, trackAchievements } from '../utils/routeHelpers.js';
import { getSkillLevel } from '../services/combatStatsService.js';
import { getActiveZoneModifiers, getActiveEventSummaries } from '../services/worldEventService';
import { applyResourceEventModifiers } from '@adventure/game-engine';
import { asyncHandler } from '../utils/asyncHandler';
import { applyGuildTaxTx } from '../services/guildTaxService';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { getPlayerGuildId } from '../services/guildService';
import { incrementContractProgress } from '../services/guildContractService';

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

  res.json({
    nodes: pageNodes.map((pn) => {
      const template = pn.resourceNode;
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
  currentZoneId: z.string().uuid(),
});

function toResourceTemplateKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
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

  // Check if player is recovering
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

  // Validate player is in the correct zone
  if (template.zoneId !== body.currentZoneId) {
    throw new AppError(400, 'You must travel to this zone to gather this resource', 'WRONG_ZONE');
  }

  const skillRequired = template.skillRequired as SkillType;
  const level = await getSkillLevel(playerId, skillRequired);
  if (level < template.levelRequired) {
    throw new AppError(400, 'Insufficient level to gather this resource', 'INSUFFICIENT_LEVEL');
  }

  if (body.turns < GATHERING_CONSTANTS.BASE_TURN_COST) {
    throw new AppError(400, `Minimum is ${GATHERING_CONSTANTS.BASE_TURN_COST} turns`, 'INVALID_TURNS');
  }

  // Calculate how many actions we can do (limited by turns AND remaining capacity)
  const maxActionsByTurns = Math.floor(body.turns / GATHERING_CONSTANTS.BASE_TURN_COST);

  // Linear yield scaling: +10% per level above requirement
  const levelsAbove = Math.max(0, level - template.levelRequired);
  const yieldMultiplier = 1 + levelsAbove * GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL;
  const baseYield = Math.max(template.baseYield, GATHERING_CONSTANTS.BASE_YIELD);
  const baseYieldPerAction = Math.floor(baseYield * yieldMultiplier);

  // Apply world event resource modifiers + guild gathering yield
  const zoneModifiers = await getActiveZoneModifiers(template.zoneId);
  const activeEventEffects = await getActiveEventSummaries(template.zoneId);
  const guildMods = await getPlayerGuildModifiers(playerId);
  const eventYield = applyResourceEventModifiers(baseYieldPerAction, zoneModifiers);
  const yieldPerAction = guildMods.gatheringYield > 0
    ? Math.floor(eventYield * (1 + guildMods.gatheringYield))
    : eventYield;

  // Cap actions by remaining capacity
  const maxActionsByCapacity = Math.ceil(effectiveCapacity / yieldPerAction);
  const actions = Math.min(maxActionsByTurns, maxActionsByCapacity);

  if (actions <= 0) {
    throw new AppError(400, 'Node is depleted', 'NODE_DEPLETED');
  }

  const turnsSpent = actions * GATHERING_CONSTANTS.BASE_TURN_COST;
  const totalYield = Math.min(actions * yieldPerAction, effectiveCapacity);

  const newCapacity = effectiveCapacity - totalYield;
  const nodeDepleted = newCapacity <= 0;

  const resourceTemplateId = await getResourceTemplateId(template.resourceType);
  const { turnSpend, stack } = await prisma.$transaction(async (tx) => {
    const spent = await spendPlayerTurnsTx(tx, playerId, turnsSpent);
    await applyGuildTaxTx(tx, playerId, turnsSpent);

    if (nodeDepleted) {
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
          remainingCapacity: newCapacity,
          decayedCapacity: decay.targetDecay,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, 'Resource node state changed; try again', 'NODE_STATE_CHANGED');
      }
    }

    const minedStack = await addStackableItemTx(tx, playerId, resourceTemplateId, totalYield);
    return { turnSpend: spent, stack: minedStack };
  });

  // XP: 5 XP per action
  const rawXp = actions * 5;
  const xpGrant = await grantSkillXp(playerId, skillRequired, rawXp, undefined, guildMods.xpBoost || undefined);

  // Guild contract progress for gathering
  const guildId = await getPlayerGuildId(playerId);
  if (guildId) void incrementContractProgress(guildId, 'gather_actions', actions).catch(() => {});

  // --- Achievement tracking (counters + derived checks) ---
  const gatherAchKeys = ['totalGatheringActions'];
  if (xpGrant.newLevel) gatherAchKeys.push('highestSkillLevel');
  if (xpGrant.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) gatherAchKeys.push('highestCharacterLevel');
  await trackAchievements(playerId, {
    totalGatheringActions: actions,
    totalTurnsSpent: turnsSpent,
  }, { statKeys: gatherAchKeys });

  const log = await prisma.activityLog.create({
    data: {
      playerId,
      activityType: skillRequired,
      turnsSpent,
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
      } as unknown as Prisma.InputJsonValue,
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
    activeEvents: activeEventEffects.length > 0 ? activeEventEffects : undefined,
  });
}));
