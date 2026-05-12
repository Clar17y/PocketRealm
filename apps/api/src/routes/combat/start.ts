import { Router } from 'express';
import { RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';
import { createEndpointLimiter } from '../../middleware/rateLimiter';
import { requireActiveSeason } from '../../middleware/seasonGuard';
import { startZoneCombat } from '../../services/combat/startRouteService';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendRouteServiceResponse } from '../../utils/routeServiceResponse';

const startRouter = Router();
const combatLimiter = createEndpointLimiter('combat', RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS, RATE_LIMIT_CONSTANTS.COMBAT_MAX);

startRouter.post('/start', requireActiveSeason, combatLimiter, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await startZoneCombat({ body: req.body, player: req.player! }));
}));

export function registerStartRoutes(router: Router): void {
  router.use(startRouter);
}
