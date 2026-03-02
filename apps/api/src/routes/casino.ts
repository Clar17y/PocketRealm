import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { exchangeTurnsForGold, getCurrentRound, placeBet, getRouletteHistory, getRouletteStats } from '../services/casinoService';
import { assertInTown } from '../utils/routeHelpers.js';
import type { RouletteBetType } from '@adventure/shared';

export const casinoRouter = Router();
casinoRouter.use(authenticate);

const exchangeSchema = z.object({
  turns: z.number().int().positive(),
});

casinoRouter.post('/exchange', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { turns } = exchangeSchema.parse(req.body);
  await assertInTown(playerId);

  const result = await exchangeTurnsForGold(playerId, turns);
  res.json(result);
}));

const betSchema = z.object({
  betType: z.enum(['straight', 'split', 'red', 'black', 'odd', 'even', 'dozen', 'column', 'corner']),
  betValue: z.string(),
  amount: z.number().int().positive(),
});

casinoRouter.get('/roulette/round', asyncHandler(async (_req, res) => {
  const round = await getCurrentRound();
  res.json(round);
}));

casinoRouter.post('/roulette/bet', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { betType, betValue, amount } = betSchema.parse(req.body);
  await assertInTown(playerId);

  const result = await placeBet(playerId, betType as RouletteBetType, betValue, amount);
  res.json(result);
}));

casinoRouter.get('/roulette/history', asyncHandler(async (_req, res) => {
  const history = await getRouletteHistory();
  res.json({ history });
}));

casinoRouter.get('/roulette/stats', asyncHandler(async (_req, res) => {
  const stats = await getRouletteStats();
  res.json({ stats });
}));
