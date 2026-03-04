import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getActiveQuests, claimQuestReward, claimDailyBonus, getQuestState } from '../services/questService';

export const questsRouter = Router();
questsRouter.use(authenticate);

// GET /api/v1/quests — active quests + progress (triggers lazy reset)
questsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const quests = await getActiveQuests(playerId);
  const state = await getQuestState(playerId);
  res.json({ quests, state });
}));

// POST /api/v1/quests/:id/claim — claim completed quest reward
const claimSchema = z.object({ id: z.string().uuid() });

questsRouter.post('/:id/claim', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = claimSchema.parse(req.params);
  const result = await claimQuestReward(playerId, id);
  res.json(result);
}));

// POST /api/v1/quests/bonus — claim daily completion bonus
questsRouter.post('/bonus', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await claimDailyBonus(playerId);
  res.json(result);
}));
