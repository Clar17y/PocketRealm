import { Router } from 'express';
import { z } from 'zod';
import { VOCATION_IDS } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import {
  getVocationSnapshot,
  honeVocation,
  learnTechnique,
  respecVocation,
} from '../services/vocationService';
import { asyncHandler } from '../utils/asyncHandler';

const vocationIdSchema = z.enum(VOCATION_IDS);

const honeSchema = z.object({
  vocationId: vocationIdSchema,
  turns: z.number().int().positive().max(100),
});

const learnTechniqueSchema = z.object({
  vocationId: vocationIdSchema,
  techniqueId: z.string().min(1),
});

const respecSchema = z.object({
  vocationId: vocationIdSchema,
});

export const vocationsRouter = Router();

vocationsRouter.use(authenticate);

vocationsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  res.json(await getVocationSnapshot(playerId));
}));

vocationsRouter.post('/hone', asyncHandler(async (req, res) => {
  const body = honeSchema.parse(req.body);
  const playerId = req.player!.playerId;

  res.json(await honeVocation({
    playerId,
    vocationId: body.vocationId,
    turns: body.turns,
  }));
}));

vocationsRouter.post('/techniques/learn', asyncHandler(async (req, res) => {
  const body = learnTechniqueSchema.parse(req.body);
  const playerId = req.player!.playerId;

  res.json(await learnTechnique({
    playerId,
    vocationId: body.vocationId,
    techniqueId: body.techniqueId,
  }));
}));

vocationsRouter.post('/respec', asyncHandler(async (req, res) => {
  const body = respecSchema.parse(req.body);
  const playerId = req.player!.playerId;

  res.json(await respecVocation({
    playerId,
    vocationId: body.vocationId,
  }));
}));
