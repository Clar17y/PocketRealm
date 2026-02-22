import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@adventure/database';
import { ATTRIBUTE_TYPES, type AttributeType, ACHIEVEMENTS_BY_ID } from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { ensureEquipmentSlots } from '../services/equipmentService';
import {
  allocateAttributePoints,
  getPlayerProgressionState,
  normalizePlayerAttributes,
} from '../services/attributesService';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';

export const playerRouter = Router();
const prismaAny = prisma as unknown as any;

playerRouter.use(authenticate);

/**
 * GET /api/v1/player
 * Get current player profile
 */
playerRouter.get('/', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    const player = await prismaAny.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        lastActiveAt: true,
        characterXp: true,
        characterLevel: true,
        attributePoints: true,
        attributes: true,
        autoPotionThreshold: true,
        tutorialStep: true,
        combatLogSpeedMs: true,
        explorationSpeedMs: true,
        autoSkipKnownCombat: true,
        defaultExploreTurns: true,
        quickRestHealPercent: true,
        defaultRefiningMax: true,
        activeTitle: true,
      },
    });

    if (!player) {
      throw new AppError(404, 'Player not found', 'NOT_FOUND');
    }

    const titleDef = player.activeTitle ? ACHIEVEMENTS_BY_ID.get(player.activeTitle) : null;

    res.json({
      player: {
        ...player,
        characterXp: Number(player.characterXp),
        attributes: normalizePlayerAttributes(player.attributes),
        activeTitle: titleDef?.titleReward ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/player/skills
 * Get all player skills with levels and XP
 */
playerRouter.get('/skills', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    const skills = await prisma.playerSkill.findMany({
      where: { playerId },
      select: {
        skillType: true,
        level: true,
        xp: true,
        dailyXpGained: true,
        lastXpResetAt: true,
      },
    });

    // Convert BigInt to number for JSON serialization
    const serializedSkills = skills.map((skill: typeof skills[number]) => ({
      ...skill,
      xp: Number(skill.xp),
    }));

    res.json({ skills: serializedSkills });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/player/attributes
 * Get character level progression and current attribute allocation.
 */
playerRouter.get('/attributes', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const progression = await getPlayerProgressionState(playerId);
    res.json(progression);
  } catch (err) {
    next(err);
  }
});

const allocateAttributesSchema = z.object({
  attribute: z.custom<AttributeType>((value) => ATTRIBUTE_TYPES.includes(value as AttributeType), {
    message: 'Invalid attribute type',
  }),
  points: z.number().int().positive().default(1),
});

/**
 * POST /api/v1/player/attributes
 * Spend unallocated attribute points.
 */
playerRouter.post('/attributes', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = allocateAttributesSchema.parse(req.body);
    const progression = await allocateAttributePoints(playerId, body.attribute, body.points);
    res.json(progression);
  } catch (err) {
    next(err);
  }
});

const SETTINGS_FIELDS = [
  'autoPotionThreshold', 'combatLogSpeedMs', 'explorationSpeedMs',
  'autoSkipKnownCombat', 'defaultExploreTurns', 'quickRestHealPercent', 'defaultRefiningMax',
] as const;

const settingsSchema = z.object({
  autoPotionThreshold: z.number().int().min(0).max(100).optional(),
  combatLogSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  explorationSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  autoSkipKnownCombat: z.boolean().optional(),
  defaultExploreTurns: z.number().int().min(10).max(10000).refine(v => v % 10 === 0, { message: 'Must be a multiple of 10' }).optional(),
  quickRestHealPercent: z.number().int().min(25).max(100).refine(v => v % 25 === 0, { message: 'Must be a multiple of 25' }).optional(),
  defaultRefiningMax: z.boolean().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), { message: 'At least one setting required' });

/**
 * PATCH /api/v1/player/settings
 * Update player settings.
 */
playerRouter.patch('/settings', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = settingsSchema.parse(req.body);

    const updated = await prismaAny.player.update({
      where: { id: playerId },
      data: body,
      select: Object.fromEntries(SETTINGS_FIELDS.map(f => [f, true])),
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const tutorialSchema = z.object({
  step: z.number().int().min(-1).max(9),
});

/**
 * PATCH /api/v1/player/tutorial
 * Advance or skip the tutorial.
 */
playerRouter.patch('/tutorial', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = tutorialSchema.parse(req.body);

    const player = await prismaAny.player.findUnique({
      where: { id: playerId },
      select: { tutorialStep: true },
    });

    if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

    // Allow skip (-1) from any state, or advance by exactly 1
    const isSkip = body.step === -1;
    const isNextStep = body.step === player.tutorialStep + 1;

    if (!isSkip && !isNextStep) {
      throw new AppError(400, 'Invalid tutorial step', 'INVALID_STEP');
    }

    // Don't allow changes once tutorial is completed or skipped
    if (player.tutorialStep >= 9 || player.tutorialStep === -1) {
      throw new AppError(400, 'Tutorial already completed', 'TUTORIAL_COMPLETE');
    }

    await prismaAny.player.update({
      where: { id: playerId },
      data: { tutorialStep: body.step },
    });

    // Grant achievement for completing the tutorial (not skipping)
    if (body.step === 9 && !isSkip) {
      await incrementStats(playerId, { tutorialCompleted: 1 });
      const newAchievements = await checkAchievements(playerId, { statKeys: ['tutorialCompleted'] });
      await emitAchievementNotifications(playerId, newAchievements);
    }

    res.json({ tutorialStep: body.step });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/player/equipment
 * Get currently equipped items
 */
playerRouter.get('/equipment', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    await ensureEquipmentSlots(playerId);

    const equipment = await prisma.playerEquipment.findMany({
      where: { playerId },
      include: {
        item: {
          include: {
            template: true,
          },
        },
      },
    });

    res.json({ equipment });
  } catch (err) {
    next(err);
  }
});
