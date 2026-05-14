import { Router } from 'express';
import { createEndpointLimiter } from '../../middleware/rateLimiter';
import { requireActiveSeason } from '../../middleware/seasonGuard';
import { craftItem } from '../../services/crafting/craftRouteService';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendRouteServiceResponse } from '../../utils/routeServiceResponse';

export const craftRouter = Router();

craftRouter.use(createEndpointLimiter('crafting', 60_000, 20));
craftRouter.use(requireActiveSeason);

craftRouter.post('/', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await craftItem({ body: req.body, player: req.player! }));
}));
