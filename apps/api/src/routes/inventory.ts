import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@adventure/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getOwnedItem } from '../utils/routeHelpers.js';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { DURABILITY_CONSTANTS } from '@adventure/shared';
import { useConsumable } from '../services/consumableService';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

/**
 * GET /api/v1/inventory
 * List all items owned by the player.
 */
inventoryRouter.get('/', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    const items = await prisma.item.findMany({
      where: { ownerId: playerId },
      include: { template: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    const equipped = await prisma.playerEquipment.findMany({
      where: { playerId, itemId: { not: null } },
      select: { slot: true, itemId: true },
    });

    const equippedByItemId = new Map<string, string>();
    for (const e of equipped) {
      if (e.itemId) equippedByItemId.set(e.itemId, e.slot);
    }

    res.json({
      items: items.map((item: typeof items[number]) => ({
        ...item,
        equippedSlot: equippedByItemId.get(item.id) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const deleteParamsSchema = z.object({
  id: z.string().uuid(),
});

const deleteQuerySchema = z.object({
  quantity: z.coerce.number().int().positive().optional(),
});

/**
 * DELETE /api/v1/inventory/:id?quantity=2
 * Destroy an item or reduce a stack.
 */
inventoryRouter.delete('/:id', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const params = deleteParamsSchema.parse(req.params);
    const query = deleteQuerySchema.parse(req.query);

    const item = await getOwnedItem(playerId, params.id, {
      requireNotEquipped: true,
    });

    if (item.template.stackable && query.quantity && query.quantity < item.quantity) {
      const updated = await prisma.item.update({
        where: { id: item.id },
        data: { quantity: item.quantity - query.quantity },
      });
      res.json({ destroyed: false, itemId: updated.id, remainingQuantity: updated.quantity });
      return;
    }

    await prisma.item.delete({ where: { id: item.id } });
    res.json({ destroyed: true, itemId: item.id });
  } catch (err) {
    next(err);
  }
});

const repairSchema = z.object({
  itemId: z.string().uuid(),
});

/**
 * POST /api/v1/inventory/repair
 * Spend turns to repair an item; max durability decays on each repair.
 */
inventoryRouter.post('/repair', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = repairSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id: body.itemId },
        include: { template: true },
      });

      if (!item || item.ownerId !== playerId) {
        throw new AppError(404, 'Item not found', 'NOT_FOUND');
      }

      if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
        throw new AppError(400, 'Only weapons/armor can be repaired', 'INVALID_ITEM_TYPE');
      }

      const current = item.currentDurability ?? item.template.maxDurability;
      const max = item.maxDurability ?? item.template.maxDurability;

      if (current >= max) {
        return {
          repaired: false as const,
          itemId: item.id,
          currentDurability: current,
          maxDurability: max,
        };
      }

      const turnCost = current <= 0
        ? DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST
        : DURABILITY_CONSTANTS.REPAIR_TURN_COST;
      const turnSpend = await spendPlayerTurnsTx(tx, playerId, turnCost);
      const decay = Math.min(
        DURABILITY_CONSTANTS.REPAIR_MAX_DECAY,
        Math.max(1, Math.floor(Math.random() * (DURABILITY_CONSTANTS.REPAIR_MAX_DECAY + 1)))
      );
      const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

      const updated = await tx.item.updateMany({
        where: {
          id: item.id,
          ownerId: playerId,
          currentDurability: item.currentDurability,
          maxDurability: item.maxDurability,
        },
        data: {
          maxDurability: newMax,
          currentDurability: newMax,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, 'Item durability changed; try again', 'ITEM_STATE_CHANGED');
      }

      return {
        repaired: true as const,
        turns: turnSpend,
        turnCost,
        itemId: item.id,
        currentDurability: newMax,
        maxDurability: newMax,
        maxDurabilityDecay: decay,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const useSchema = z.object({
  itemId: z.string().uuid(),
});

/**
 * POST /api/v1/inventory/use
 * Use a consumable item (e.g. health potion).
 */
inventoryRouter.post('/use', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = useSchema.parse(req.body);
    const result = await useConsumable(playerId, body.itemId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

