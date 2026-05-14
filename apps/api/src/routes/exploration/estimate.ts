import { Router } from 'express';
import { prisma } from '@pocketrealm/database';
import { estimateExploration, validateExplorationTurns } from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPlayerTaxRate, calculateEffectiveTurns } from '../../services/guildTaxService';
import { getActiveZoneModifiers } from '../../services/worldEventService';
import { getHasActivePremiumEntitlement } from '../../services/premiumEntitlement';
import { EXPLORATION_CONSTANTS, PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { estimateQuerySchema } from '../../services/exploration/helpers';

export const estimateRouter = Router();

/**
 * GET /api/v1/exploration/estimate?turns=123
 * Returns probability preview for exploration outcomes.
 */
estimateRouter.get('/estimate', asyncHandler(async (req, res) => {
    const query = estimateQuerySchema.parse(req.query);
    const playerId = req.player!.playerId;

    const validation = validateExplorationTurns(query.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    if (query.zoneId) {
      const discovery = await prisma.playerZoneDiscovery.findUnique({
        where: {
          playerId_zoneId: {
            playerId,
            zoneId: query.zoneId,
          },
        },
        select: { zoneId: true },
      });
      if (!discovery) {
        throw new AppError(403, 'Zone has not been discovered', 'ZONE_NOT_DISCOVERED');
      }
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

    const { taxRate } = await getPlayerTaxRate(playerId);
    const effectiveTurns = calculateEffectiveTurns(query.turns, taxRate);
    const hasChampion = await getHasActivePremiumEntitlement(prisma, playerId);
    const hiddenCacheChance = hasChampion
      ? EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE * PREMIUM_CONSTANTS.BONUS_MULTIPLIER
      : null;

    res.json({
      estimate: estimateExploration(effectiveTurns, zoneExitChance, spawnRateMultiplier, hiddenCacheChance),
      taxRate,
      effectiveTurns,
    });
}));
