import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { getSkillPoints, allocatePoints, respecPoints } from '../services/skillPointService';
import { asyncHandler } from '../utils/asyncHandler';
import { TALENT_TREE_DEFINITIONS } from '@adventure/shared';

export const skillPointsRouter = Router();
skillPointsRouter.use(authenticate);

/** GET /api/v1/skillpoints — Get current skill point state + all tree definitions */
skillPointsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const state = await getSkillPoints(playerId);
  res.json({
    ...state,
    trees: TALENT_TREE_DEFINITIONS,
  });
}));

const allocateSchema = z.object({
  nodeId: z.string().min(1),
});

/** POST /api/v1/skillpoints/allocate — Allocate points to a talent node */
skillPointsRouter.post('/allocate', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = allocateSchema.parse(req.body);
  const state = await allocatePoints(playerId, body.nodeId);
  res.json(state);
}));

/** POST /api/v1/skillpoints/respec — Reset all allocations (costs turns) */
skillPointsRouter.post('/respec', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const state = await respecPoints(playerId);
  res.json(state);
}));
