import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@adventure/database';
import { calculateCurrentTurns, calculateTimeToCapMs, spendTurns } from '@adventure/game-engine';
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

const spendSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().optional(),
});

/**
 * POST /api/v1/turns/spend
 * Spend turns (generic endpoint, usually called by other services)
 */
turnsRouter.post('/spend', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = spendSchema.parse(req.body);

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

  const newBalance = spendTurns(currentTurns, body.amount);
  if (newBalance === null) {
    throw new AppError(400, 'Insufficient turns', 'INSUFFICIENT_TURNS');
  }

  // Update turn bank
  await prisma.turnBank.update({
    where: { playerId },
    data: {
      currentTurns: newBalance,
      lastRegenAt: now,
    },
  });

  res.json({
    previousTurns: currentTurns,
    spent: body.amount,
    currentTurns: newBalance,
  });
}));
