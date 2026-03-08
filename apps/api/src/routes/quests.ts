import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getActiveQuests, claimQuestReward, claimDailyBonus, getQuestState, rerollQuest } from '../services/questService';

export const questsRouter = Router();
questsRouter.use(authenticate);

// GET /api/v1/quests — active quests + progress (triggers lazy reset)
questsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const quests = await getActiveQuests(playerId);
  const state = await getQuestState(playerId);
  res.json({ quests, state });
}));

// POST /api/v1/quests/bonus — claim daily completion bonus
questsRouter.post('/bonus', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await claimDailyBonus(playerId);
  res.json(result);
}));

// NOTE: Parameterized routes must come AFTER /bonus to avoid :id matching that path
const paramIdSchema = z.object({ id: z.string().uuid() });

// POST /api/v1/quests/:id/reroll — reroll an active quest
questsRouter.post('/:id/reroll', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = paramIdSchema.parse(req.params);
  const newQuest = await rerollQuest(playerId, id);
  res.json({ quest: newQuest });
}));

// POST /api/v1/quests/:id/claim — claim completed quest reward
questsRouter.post('/:id/claim', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = paramIdSchema.parse(req.params);
  const result = await claimQuestReward(playerId, id);
  res.json(result);
}));
