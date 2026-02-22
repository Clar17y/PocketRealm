import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { estimateRouter } from './estimate';
import { startRouter } from './start';

export const explorationRouter = Router();

explorationRouter.use(authenticate);
explorationRouter.use(estimateRouter);
explorationRouter.use(startRouter);
