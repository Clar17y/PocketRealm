import { Router } from 'express';
import { z } from 'zod';
import { VOCATION_IDS, VOCATION_MASTERY } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import {
  getVocationSnapshot,
  honeVocation,
  learnTechnique,
  respecVocation,
} from '../services/vocationService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import { asyncHandler } from '../utils/asyncHandler';

const vocationIdSchema = z.enum(VOCATION_IDS);

const honeSchema = z.object({
  vocationId: vocationIdSchema,
  turns: z.number().int().min(VOCATION_MASTERY.HONE_ACTION_TURN_MIN).max(VOCATION_MASTERY.HONE_ACTION_TURN_LIMIT),
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

async function checkAndEmitVocationAchievements(playerId: string, statKeys: string[]): Promise<void> {
  const achievements = await checkAchievements(playerId, { statKeys });
  if (achievements.length > 0) {
    await emitAchievementNotifications(playerId, achievements);
  }
}

vocationsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  res.json(await getVocationSnapshot(playerId));
}));

vocationsRouter.post('/hone', asyncHandler(async (req, res) => {
  const body = honeSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const result = await honeVocation({
    playerId,
    vocationId: body.vocationId,
    turns: body.turns,
  });
  await checkAndEmitVocationAchievements(playerId, [
    'totalVocationHonedTurns',
    `vocationHonedTurns_${body.vocationId}`,
    'highestVocationRank',
    'vocationRank5Count',
    'vocationRank10Count',
    'vocationRank20Count',
  ]);

  res.json(result);
}));

vocationsRouter.post('/techniques/learn', asyncHandler(async (req, res) => {
  const body = learnTechniqueSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const result = await learnTechnique({
    playerId,
    vocationId: body.vocationId,
    techniqueId: body.techniqueId,
  });
  await checkAndEmitVocationAchievements(playerId, [
    'totalVocationTechniquesLearned',
    'vocationTechniqueVocationCount',
  ]);

  res.json(result);
}));

vocationsRouter.post('/respec', asyncHandler(async (req, res) => {
  const body = respecSchema.parse(req.body);
  const playerId = req.player!.playerId;

  res.json(await respecVocation({
    playerId,
    vocationId: body.vocationId,
  }));
}));
