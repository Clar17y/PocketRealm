import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { exchangeTurnsForGold, getCurrentRound, placeBet, getRouletteHistory } from '../services/casinoService';
import { prisma } from '@adventure/database';
import type { RouletteBetType } from '@adventure/shared';

export const casinoRouter = Router();
casinoRouter.use(authenticate);

const exchangeSchema = z.object({
  turns: z.number().int().positive(),
});

casinoRouter.post('/exchange', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { turns } = exchangeSchema.parse(req.body);

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) throw new AppError(400, 'Not in a zone', 'NO_ZONE');

  const zone = await prisma.zone.findUnique({ where: { id: player.currentZoneId } });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(403, 'Must be in a town to exchange gold', 'NOT_IN_TOWN');
  }

  const result = await exchangeTurnsForGold(playerId, turns);
  res.json(result);
}));

const betSchema = z.object({
  betType: z.enum(['straight', 'split', 'red', 'black', 'odd', 'even', 'dozen', 'column']),
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

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) throw new AppError(400, 'Not in a zone', 'NO_ZONE');

  const zone = await prisma.zone.findUnique({ where: { id: player.currentZoneId } });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(403, 'Must be in a town to gamble', 'NOT_IN_TOWN');
  }

  const result = await placeBet(playerId, betType as RouletteBetType, betValue, amount);
  res.json(result);
}));

casinoRouter.get('/roulette/history', asyncHandler(async (_req, res) => {
  const history = await getRouletteHistory();
  res.json({ history });
}));
