import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireActiveSeason } from '../middleware/seasonGuard';
import { asyncHandler } from '../utils/asyncHandler';
import { buildStateUpdates, fetchEquipmentMap, fetchItemDTOs } from '../services/stateUpdateHelpers';
import { listVexExchanges, purchaseVexExchange } from '../services/vexExchangeService';

export const vexRouter = Router();

vexRouter.use(authenticate);

const purchaseParamsSchema = z.object({
  exchangeKey: z.string().min(1),
});

const purchaseBodySchema = z.object({
  targetItemId: z.string().uuid().optional(),
}).default({});

vexRouter.get('/exchanges', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  res.json(await listVexExchanges(playerId));
}));

vexRouter.post('/exchanges/:exchangeKey/purchase', requireActiveSeason, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { exchangeKey } = purchaseParamsSchema.parse(req.params);
  const body = purchaseBodySchema.parse(req.body);
  const result = await purchaseVexExchange(playerId, exchangeKey, body);

  const [stateUpdates, inventoryAdded, inventoryUpdated] = await Promise.all([
    buildStateUpdates(playerId, [
      'gold',
      'inventoryUsedSlots',
      'inventoryCapacity',
      'materialTotals',
    ]),
    fetchItemDTOs(result.addedItemIds),
    fetchItemDTOs(result.updatedItemIds),
  ]);

  if (inventoryAdded.length > 0) {
    stateUpdates.inventoryAdded = inventoryAdded;
  }
  if (inventoryUpdated.length > 0) {
    stateUpdates.inventoryUpdated = inventoryUpdated;
  }
  if (result.removedItemIds.length > 0) {
    stateUpdates.inventoryRemoved = result.removedItemIds;
  }

  if (result.invalidatesEquipment) {
    stateUpdates.equipment = await fetchEquipmentMap(playerId);
  }

  res.json({
    exchangeKey: result.exchangeKey,
    message: result.message,
    stateUpdates,
  });
}));
