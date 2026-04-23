import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '@pocketrealm/database';
import { exchangeTurnsForGold, getCurrentRound, placeBet, getRouletteHistory, getRouletteStats } from '../services/casinoService';
import { assertInTown, trackAchievements } from '../utils/routeHelpers.js';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService.js';
import type { RouletteBetType } from '@pocketrealm/shared';
import { trackProgress } from '../services/progressService';
import { createEndpointLimiter } from '../middleware/rateLimiter';
import { RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';
import { requireActiveSeason } from '../middleware/seasonGuard';

const casinoLimiter = createEndpointLimiter('casino', RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS, RATE_LIMIT_CONSTANTS.CASINO_MAX);

export const casinoRouter = Router();
casinoRouter.use(authenticate);

async function updatePeakGold(playerId: string, currentGold: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO player_stats (player_id, peak_gold_held, updated_at)
    VALUES (${playerId}, ${currentGold}, NOW())
    ON CONFLICT (player_id)
    DO UPDATE SET peak_gold_held = GREATEST(player_stats.peak_gold_held, ${currentGold})
  `;
  const achievements = await checkAchievements(playerId, { statKeys: ['peakGoldHeld'] });
  if (achievements.length > 0) await emitAchievementNotifications(playerId, achievements);
}

const exchangeSchema = z.object({
  turns: z.number().int().positive(),
});

casinoRouter.post('/exchange', requireActiveSeason, casinoLimiter, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { turns } = exchangeSchema.parse(req.body);
  await assertInTown(playerId);

  const result = await exchangeTurnsForGold(playerId, turns);

  await trackAchievements(playerId, { totalTurnsExchanged: turns });
  await updatePeakGold(playerId, result.goldBalance);

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

casinoRouter.post('/roulette/bet', requireActiveSeason, casinoLimiter, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { betType, betValue, amount } = betSchema.parse(req.body);
  await assertInTown(playerId);

  const result = await placeBet(playerId, betType as RouletteBetType, betValue, amount);

  void trackProgress(playerId, 'casino_bets', 1);
  void trackProgress(playerId, 'casino_wagers', amount);

  await trackAchievements(playerId, {
    totalBetsPlaced: 1,
    totalGoldWagered: amount,
  }, { statKeys: ['totalBetsPlaced', 'totalGoldWagered'] });

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
