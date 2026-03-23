import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { createEndpointLimiter } from '../../middleware/rateLimiter';
import { RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';
import { estimateRouter } from './estimate';
import { startRouter } from './start';

export const explorationRouter = Router();

explorationRouter.use(authenticate);
explorationRouter.use(createEndpointLimiter('exploration', RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS, RATE_LIMIT_CONSTANTS.EXPLORATION_MAX));
explorationRouter.use(estimateRouter);
explorationRouter.use(startRouter);
