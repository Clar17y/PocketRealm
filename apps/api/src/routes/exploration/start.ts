import { Router } from 'express';
import { requireActiveSeason } from '../../middleware/seasonGuard';
import { runActivityWithWorker } from '../../services/activityWorkerClient';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendRouteServiceResponse } from '../../utils/routeServiceResponse';

export const startRouter = Router();

startRouter.use(requireActiveSeason);

startRouter.post('/start', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await runActivityWithWorker({
    type: 'exploration.start',
    input: { body: req.body, player: req.player! },
  }));
}));
