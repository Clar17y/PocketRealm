import { Router } from 'express';
import { prisma } from '@pocketrealm/database';
import { calculateCurrentTurns, calculateTimeToCapMs } from '@pocketrealm/game-engine';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
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

  const turnBank = await prisma.turnBank.findUnique({
    where: { playerId },
  });

  if (!turnBank) {
    throw new AppError(404, 'Turn bank not found', 'NOT_FOUND');
  }

  const now = new Date();
  const currentTurns = calculateCurrentTurns(
    turnBank.currentTurns,
    turnBank.lastRegenAt,
    now
  );
  const timeToCapMs = calculateTimeToCapMs(currentTurns);

  res.json({
    currentTurns,
    timeToCapMs,
    lastRegenAt: turnBank.lastRegenAt.toISOString(),
  });
}));
