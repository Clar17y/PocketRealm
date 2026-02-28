import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { simulateFight, getCooldownRemaining } from '../services/trainingService';
import { prisma } from '@adventure/database';

export const trainingRouter = Router();
trainingRouter.use(authenticate);

const fightSchema = z.object({
  mobTemplateId: z.string().uuid(),
  prefix: z.string().nullable().optional().default(null),
});

trainingRouter.post('/fight', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { mobTemplateId, prefix } = fightSchema.parse(req.body);

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) throw new AppError(400, 'Not in a zone', 'NO_ZONE');

  const zone = await prisma.zone.findUnique({ where: { id: player.currentZoneId } });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(403, 'Must be in a town to use training grounds', 'NOT_IN_TOWN');
  }

  const result = await simulateFight(playerId, mobTemplateId, prefix);
  res.json(result);
}));

trainingRouter.get('/cooldown', asyncHandler(async (req, res) => {
  const remaining = await getCooldownRemaining(req.player!.playerId);
  res.json({ cooldownSeconds: remaining });
}));
