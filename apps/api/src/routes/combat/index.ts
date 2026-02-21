import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { registerSiteRoutes } from './sites';
import { registerStartRoutes } from './start';
import { registerLogRoutes } from './logs';

export const combatRouter = Router();

combatRouter.use(authenticate);

registerSiteRoutes(combatRouter);
registerStartRoutes(combatRouter);
registerLogRoutes(combatRouter);
