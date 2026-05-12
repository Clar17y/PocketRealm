import { Router } from 'express';
import { requireActiveSeason } from '../../middleware/seasonGuard';
import { startExploration } from '../../services/exploration/startRouteService';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendRouteServiceResponse } from '../../utils/routeServiceResponse';

export const startRouter = Router();

startRouter.use(requireActiveSeason);

startRouter.post('/start', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await startExploration({ body: req.body, player: req.player! }));
}));
