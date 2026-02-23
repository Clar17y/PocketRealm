import { Router } from 'express';
import { prisma } from '@adventure/database';
import { estimateExploration, validateExplorationTurns } from '@adventure/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPlayerTaxRate, calculateEffectiveTurns } from '../../services/guildTaxService';
import { estimateQuerySchema } from './helpers';

export const estimateRouter = Router();

/**
 * GET /api/v1/exploration/estimate?turns=123
 * Returns probability preview for exploration outcomes.
 */
estimateRouter.get('/estimate', asyncHandler(async (req, res) => {
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

    const { taxRate } = await getPlayerTaxRate(req.player!.playerId);
    const effectiveTurns = calculateEffectiveTurns(query.turns, taxRate);

    res.json({
      estimate: estimateExploration(effectiveTurns, zoneExitChance),
      taxRate,
      effectiveTurns,
    });
}));
