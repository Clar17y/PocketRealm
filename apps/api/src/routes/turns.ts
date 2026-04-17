import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getTurnState } from '../services/turnBankService';
import { asyncHandler } from '../utils/asyncHandler';

export const turnsRouter = Router();

// All turn routes require authentication
turnsRouter.use(authenticate);

/**
 * GET /api/v1/turns
 * Get current turn balance and regeneration info
 */
turnsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  res.json(await getTurnState(playerId));
}));
