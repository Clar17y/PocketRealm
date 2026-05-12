import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireActiveSeason } from '../middleware/seasonGuard';
import { listZones, travelToZone } from '../services/zoneRoutesService';
import { asyncHandler } from '../utils/asyncHandler';
import { sendRouteServiceResponse } from '../utils/routeServiceResponse';

export const zonesRouter = Router();

zonesRouter.use(authenticate);

zonesRouter.get('/', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await listZones({ player: req.player! }));
}));

zonesRouter.use(requireActiveSeason);

zonesRouter.post('/travel', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await travelToZone({ body: req.body, player: req.player! }));
}));
