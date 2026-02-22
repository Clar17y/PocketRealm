import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@adventure/database';
import { authenticate } from '../middleware/auth';
import {
  getPlayerAchievements,
  claimReward,
  setActiveTitle,
  getUnclaimedCount,
} from '../services/achievementService';
import { asyncHandler } from '../utils/asyncHandler';

const setTitleSchema = z.object({
  achievementId: z.string().nullable().optional(),
});

export const achievementsRouter = Router();
achievementsRouter.use(authenticate);

// GET /achievements — all definitions + player progress
achievementsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await getPlayerAchievements(playerId);
  res.json(result);
}));

// GET /achievements/unclaimed-count — just the count for badge
achievementsRouter.get('/unclaimed-count', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const count = await getUnclaimedCount(playerId);
  res.json({ unclaimedCount: count });
}));

// POST /achievements/:id/claim — claim rewards
achievementsRouter.post('/:id/claim', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = req.params;
  const result = await claimReward(playerId, id);
  res.json(result);
}));

// GET /achievements/title — get active title
achievementsRouter.get('/title', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { activeTitle: true },
  });
  res.json({ activeTitle: player?.activeTitle ?? null });
}));

// PUT /achievements/title — set active title
achievementsRouter.put('/title', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { achievementId } = setTitleSchema.parse(req.body);
  const result = await setActiveTitle(playerId, achievementId ?? null);
  res.json(result);
}));
