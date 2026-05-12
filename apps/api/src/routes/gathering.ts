import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireActiveSeason } from '../middleware/seasonGuard';
import { listResourceNodes, mineResourceNode } from '../services/gatheringRouteService';
import { asyncHandler } from '../utils/asyncHandler';
import { sendRouteServiceResponse } from '../utils/routeServiceResponse';

export const gatheringRouter = Router();

gatheringRouter.use(authenticate);

gatheringRouter.get('/nodes', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await listResourceNodes({ query: req.query, player: req.player! }));
}));

gatheringRouter.use(requireActiveSeason);

gatheringRouter.post('/mine', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await mineResourceNode({ body: req.body, player: req.player! }));
}));
