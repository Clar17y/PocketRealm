import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getActiveQuests, claimQuestReward, claimDailyBonus, getQuestState } from '../services/questService';
import { getShopInventory, purchaseShopItem } from '../services/questShopService';

export const questsRouter = Router();
questsRouter.use(authenticate);

// GET /api/v1/quests — active quests + progress (triggers lazy reset)
questsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const quests = await getActiveQuests(playerId);
  const state = await getQuestState(playerId);
  res.json({ quests, state });
}));

// GET /api/v1/quests/shop — get shop inventory + token balance
questsRouter.get('/shop', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const items = getShopInventory();
  const state = await getQuestState(playerId);
  res.json({ items, questTokens: state.questTokens });
}));

// POST /api/v1/quests/shop/buy — purchase a shop item
const buySchema = z.object({ itemKey: z.string().min(1) });

questsRouter.post('/shop/buy', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { itemKey } = buySchema.parse(req.body);
  const result = await purchaseShopItem(playerId, itemKey);
  res.json(result);
}));

// POST /api/v1/quests/bonus — claim daily completion bonus
questsRouter.post('/bonus', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await claimDailyBonus(playerId);
  res.json(result);
}));

// POST /api/v1/quests/:id/claim — claim completed quest reward
// NOTE: Must come AFTER /shop and /bonus to avoid :id matching those paths
const claimSchema = z.object({ id: z.string().uuid() });

questsRouter.post('/:id/claim', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = claimSchema.parse(req.params);
  const result = await claimQuestReward(playerId, id);
  res.json(result);
}));
