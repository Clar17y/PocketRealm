import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { simulateFight, getCooldownRemaining } from '../services/trainingService';
import { assertInTown } from '../utils/routeHelpers.js';
import { checkActivityLockout } from '../services/expeditionLockoutService';
import { requireActiveSeason } from '../middleware/seasonGuard';

export const trainingRouter = Router();
trainingRouter.use(authenticate);

const fightSchema = z.object({
  mobTemplateId: z.string().uuid(),
  prefix: z.string().nullable().optional().default(null),
});

trainingRouter.post('/fight', requireActiveSeason, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await checkActivityLockout(playerId);
  const { mobTemplateId, prefix } = fightSchema.parse(req.body);
  await assertInTown(playerId);

  const result = await simulateFight(playerId, mobTemplateId, prefix);
  res.json(result);
}));

trainingRouter.get('/cooldown', asyncHandler(async (req, res) => {
  const remaining = await getCooldownRemaining(req.player!.playerId);
  res.json({ cooldownSeconds: remaining });
}));
