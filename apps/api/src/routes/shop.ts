import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getShopItems, purchaseItem } from '../services/questShopService';

export const shopRouter = Router();
shopRouter.use(authenticate);

// GET /api/v1/shop — list all shop items with purchase counts
shopRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await getShopItems(playerId);
  res.json(result);
}));

// POST /api/v1/shop/purchase/:itemId — purchase a shop item
const purchaseParamsSchema = z.object({
  itemId: z.string().uuid(),
});

const purchaseBodySchema = z.object({
  targetZoneId: z.string().uuid().optional(),
  targetMobTemplateId: z.string().uuid().optional(),
  targetContractId: z.string().uuid().optional(),
}).default({});

shopRouter.post('/purchase/:itemId', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { itemId } = purchaseParamsSchema.parse(req.params);
  const body = purchaseBodySchema.parse(req.body);
  const result = await purchaseItem(playerId, itemId, body);
  res.json(result);
}));
