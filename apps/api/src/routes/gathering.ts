import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import { EXPLORATION_CONSTANTS, GATHERING_CONSTANTS, GATHERING_SKILLS, type SkillType } from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { applyGuildTaxTx } from '../services/guildTaxService';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { addStackableItemTx } from '../services/inventoryService';
import { grantSkillXp } from '../services/xpService';
import { getHpState } from '../services/hpService';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import { getActiveZoneModifiers, getActiveEventSummaries } from '../services/worldEventService';
import { applyResourceEventModifiers } from '@adventure/game-engine';

export const gatheringRouter = Router();

gatheringRouter.use(authenticate);

const nodesQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  resourceType: z.string().trim().toLowerCase().regex(/^[a-z0-9_]+$/).max(32).optional(),
  skillRequired: z.string().trim().toLowerCase().refine((value) => GATHERING_SKILLS.includes(value as SkillType), {
    message: 'Invalid gathering skill',
  }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
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
gatheringRouter.get('/nodes', async (req, res, next) => {
  try {
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
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
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
      pagination: {
        page,
        pageSize: query.pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
      filters: {
        zones,
        resourceTypes,
      },
    });
  } catch (err) {
    next(err);
  }
});

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

async function getSkillLevel(playerId: string, skillType: SkillType): Promise<number> {
  const skill = await prisma.playerSkill.findUnique({
    where: { playerId_skillType: { playerId, skillType } },
    select: { level: true },
  });

  return skill?.level ?? 1;
}

/**
 * POST /api/v1/gathering/mine
 * Mine from a discovered resource node, depleting its capacity.
 */
gatheringRouter.post('/mine', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = mineSchema.parse(req.body);

    // Check if player is recovering
    const hpState = await getHpState(playerId);
    if (hpState.isRecovering) {
      throw new AppError(400, 'Cannot gather while recovering', 'IS_RECOVERING');
    }

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
    const xpGrant = await grantSkillXp(playerId, skillRequired, rawXp);

    // --- Achievement tracking (counters + derived checks) ---
    await incrementStats(playerId, {
      totalGatheringActions: actions,
      totalTurnsSpent: turnsSpent,
    });

    const gatherAchKeys = ['totalGatheringActions'];
    if (xpGrant.newLevel) gatherAchKeys.push('highestSkillLevel');
    if (xpGrant.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) gatherAchKeys.push('highestCharacterLevel');
    const gatherAchievements = await checkAchievements(playerId, { statKeys: gatherAchKeys });
    await emitAchievementNotifications(playerId, gatherAchievements);

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
          xp: {
            skillType: xpGrant.skillType,
            ...xpGrant.xpResult,
            newTotalXp: xpGrant.newTotalXp,
            newDailyXpGained: xpGrant.newDailyXpGained,
            characterXpGain: xpGrant.characterXpGain,
            characterXpAfter: xpGrant.characterXpAfter,
            characterLevelBefore: xpGrant.characterLevelBefore,
            characterLevelAfter: xpGrant.characterLevelAfter,
            attributePointsAfter: xpGrant.attributePointsAfter,
            characterLeveledUp: xpGrant.characterLeveledUp,
          },
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
      xp: {
        skillType: xpGrant.skillType,
        ...xpGrant.xpResult,
        newTotalXp: xpGrant.newTotalXp,
        newDailyXpGained: xpGrant.newDailyXpGained,
        characterXpGain: xpGrant.characterXpGain,
        characterXpAfter: xpGrant.characterXpAfter,
        characterLevelBefore: xpGrant.characterLevelBefore,
        characterLevelAfter: xpGrant.characterLevelAfter,
        attributePointsAfter: xpGrant.attributePointsAfter,
        characterLeveledUp: xpGrant.characterLeveledUp,
      },
      activeEvents: activeEventEffects.length > 0 ? activeEventEffects : undefined,
    });
  } catch (err) {
    next(err);
  }
});
