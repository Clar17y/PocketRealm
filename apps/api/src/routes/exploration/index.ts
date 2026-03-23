import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { createEndpointLimiter } from '../../middleware/rateLimiter';
import { estimateRouter } from './estimate';
import { startRouter } from './start';

export const explorationRouter = Router();

explorationRouter.use(authenticate);
explorationRouter.use(createEndpointLimiter('exploration', 60_000, 30));
explorationRouter.use(estimateRouter);
explorationRouter.use(startRouter);
