import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { recipesRouter } from './crafting/recipes';
import { craftRouter } from './crafting/craft';
import { forgeRouter } from './crafting/forge';
import { salvageRouter } from './crafting/salvage';

export const craftingRouter = Router();

craftingRouter.use(authenticate);

craftingRouter.use('/recipes', recipesRouter);
craftingRouter.use('/craft', craftRouter);
craftingRouter.use('/forge', forgeRouter);
craftingRouter.use('/salvage', salvageRouter);
