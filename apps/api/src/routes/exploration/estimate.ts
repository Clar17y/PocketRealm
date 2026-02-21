import { Router } from 'express';
import { prisma } from '@adventure/database';
import { estimateExploration, validateExplorationTurns } from '@adventure/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { estimateQuerySchema } from './helpers';

export const estimateRouter = Router();

/**
 * GET /api/v1/exploration/estimate?turns=123
 * Returns probability preview for exploration outcomes.
 */
estimateRouter.get('/estimate', async (req, res, next) => {
  try {
    const query = estimateQuerySchema.parse(req.query);

    const validation = validateExplorationTurns(query.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    let zoneExitChance: number | null = null;
    if (query.zoneId) {
      const zone = await prisma.zone.findUnique({
        where: { id: query.zoneId },
        select: { zoneExitChance: true },
      });
      if (zone) {
        zoneExitChance = zone.zoneExitChance;
      }
    }

    res.json({ estimate: estimateExploration(query.turns, zoneExitChance) });
  } catch (err) {
    next(err);
  }
});
