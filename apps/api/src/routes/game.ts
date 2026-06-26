import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getGameBootstrap } from '../services/gameBootstrapService';
import { asyncHandler } from '../utils/asyncHandler';

export const gameRouter = Router();

gameRouter.use(authenticate);

gameRouter.get('/bootstrap', asyncHandler(async (req, res) => {
  res.json(await getGameBootstrap(req.player!.playerId));
}));
