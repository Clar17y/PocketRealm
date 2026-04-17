import { Router } from 'express';
import { prisma } from '@pocketrealm/database';
import { estimateExploration, validateExplorationTurns } from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPlayerTaxRate, calculateEffectiveTurns } from '../../services/guildTaxService';
import { getActiveZoneModifiers } from '../../services/worldEventService';
import { getHasActivePremiumEntitlement } from '../../services/premiumEntitlement';
import { EXPLORATION_CONSTANTS } from '@pocketrealm/shared';
import { estimateQuerySchema } from './helpers';

export const estimateRouter = Router();
const CHAMPION_BONUS_MULTIPLIER = 1.1;

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

    let spawnRateMultiplier = 1;
    if (query.zoneId) {
      const zoneMods = await getActiveZoneModifiers(query.zoneId);
      spawnRateMultiplier = zoneMods.mobSpawnRateMultiplier;
    }

    const { taxRate } = await getPlayerTaxRate(req.player!.playerId);
    const effectiveTurns = calculateEffectiveTurns(query.turns, taxRate);
    const hasChampion = await getHasActivePremiumEntitlement(prisma, req.player!.playerId);
    const hiddenCacheChance = hasChampion
      ? EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE * CHAMPION_BONUS_MULTIPLIER
      : null;

    res.json({
      estimate: estimateExploration(effectiveTurns, zoneExitChance, spawnRateMultiplier, hiddenCacheChance),
      taxRate,
      effectiveTurns,
    });
}));
