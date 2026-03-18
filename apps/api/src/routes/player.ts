import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { ATTRIBUTE_TYPES, type AttributeType, ACHIEVEMENTS_BY_ID, EXPLORATION_CONSTANTS, TUTORIAL_COMPLETED, TUTORIAL_SKIPPED, STARTER_LOADOUT } from '@pocketrealm/shared';
import { shouldResetWindowCap } from '@pocketrealm/game-engine';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { ensureEquipmentSlots } from '../services/equipmentService';
import {
  allocateAttributePoints,
  getPlayerProgressionState,
  normalizePlayerAttributes,
} from '../services/attributesService';
import { trackAchievements } from '../utils/routeHelpers.js';
import { asyncHandler } from '../utils/asyncHandler';
import { getActiveBuffs } from '../services/buffService';

export const playerRouter = Router();

playerRouter.use(authenticate);

/**
 * GET /api/v1/player
 * Get current player profile
 */
playerRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const player = await prisma.player.findUnique({
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
      tutorialStep: true,
      combatLogSpeedMs: true,
      explorationSpeedMs: true,
      autoSkipKnownCombat: true,
      defaultExploreTurns: true,
      quickRestHealPercent: true,
      defaultRefiningMax: true,
      lowHpWarning: true,
      confirmRarity: true,
      lootRevealRarity: true,
      forgeConfirmRarity: true,
      activeTitle: true,
      gold: true,
      homeTownId: true,
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
}));

/**
 * GET /api/v1/player/skills
 * Get all player skills with levels and XP
 */
playerRouter.get('/skills', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
    select: {
      id: true,
      skillType: true,
      level: true,
      xp: true,
      dailyXpGained: true,
      lastXpResetAt: true,
    },
  });

  const now = new Date();

  // Convert BigInt to number and reset stale window XP for display
  const serializedSkills = skills.map((skill: typeof skills[number]) => {
    const windowExpired = shouldResetWindowCap(skill.lastXpResetAt, now);
    return {
      ...skill,
      xp: Number(skill.xp),
      dailyXpGained: windowExpired ? 0 : skill.dailyXpGained,
    };
  });

  res.json({ skills: serializedSkills });
}));

/**
 * GET /api/v1/player/attributes
 * Get character level progression and current attribute allocation.
 */
playerRouter.get('/attributes', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const progression = await getPlayerProgressionState(playerId);
  res.json(progression);
}));

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
playerRouter.post('/attributes', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = allocateAttributesSchema.parse(req.body);
  const progression = await allocateAttributePoints(playerId, body.attribute, body.points);
  res.json(progression);
}));

const SETTINGS_FIELDS = [
  'combatLogSpeedMs', 'explorationSpeedMs',
  'autoSkipKnownCombat', 'defaultExploreTurns', 'quickRestHealPercent', 'defaultRefiningMax',
  'lowHpWarning', 'confirmRarity', 'lootRevealRarity', 'forgeConfirmRarity',
  'homeTownId',
] as const;

const RARITY_ENUM = ['none', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

const settingsSchema = z.object({
  combatLogSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  explorationSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  autoSkipKnownCombat: z.boolean().optional(),
  defaultExploreTurns: z.number().int().min(EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS).max(EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS).refine(v => v % 10 === 0, { message: 'Must be a multiple of 10' }).optional(),
  quickRestHealPercent: z.number().int().min(25).max(100).refine(v => v % 25 === 0, { message: 'Must be a multiple of 25' }).optional(),
  defaultRefiningMax: z.boolean().optional(),
  lowHpWarning: z.boolean().optional(),
  confirmRarity: z.enum(RARITY_ENUM).optional(),
  lootRevealRarity: z.enum(RARITY_ENUM).optional(),
  forgeConfirmRarity: z.enum(RARITY_ENUM).optional(),
  homeTownId: z.string().uuid().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), { message: 'At least one setting required' });

/**
 * PATCH /api/v1/player/settings
 * Update player settings.
 */
playerRouter.patch('/settings', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = settingsSchema.parse(req.body);

  if (body.homeTownId) {
    const player = await prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    if (player.currentZoneId !== body.homeTownId) {
      throw new AppError(400, 'Must be in the town to set it as home', 'NOT_IN_ZONE');
    }
    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: body.homeTownId },
      select: { zoneType: true },
    });
    if (zone.zoneType !== 'town') {
      throw new AppError(400, 'Can only set a town as home', 'NOT_A_TOWN');
    }
  }

  const updated = await prisma.player.update({
    where: { id: playerId },
    data: body,
    select: Object.fromEntries(SETTINGS_FIELDS.map(f => [f, true])),
  });

  res.json(updated);
}));

const tutorialSchema = z.object({
  step: z.number().int().min(TUTORIAL_SKIPPED).max(TUTORIAL_COMPLETED),
});

/**
 * PATCH /api/v1/player/tutorial
 * Advance or skip the tutorial.
 */
playerRouter.patch('/tutorial', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = tutorialSchema.parse(req.body);

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { tutorialStep: true },
  });

  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  // Allow skip (-1) from any state, or advance by exactly 1
  const isSkip = body.step === TUTORIAL_SKIPPED;
  const isNextStep = body.step === player.tutorialStep + 1;

  if (!isSkip && !isNextStep) {
    throw new AppError(400, 'Invalid tutorial step', 'INVALID_STEP');
  }

  // Don't allow changes once tutorial is completed or skipped
  if (player.tutorialStep >= TUTORIAL_COMPLETED || player.tutorialStep === TUTORIAL_SKIPPED) {
    throw new AppError(400, 'Tutorial already completed', 'TUTORIAL_COMPLETE');
  }

  await prisma.player.update({
    where: { id: playerId },
    data: { tutorialStep: body.step },
  });

  // Grant achievement for completing the tutorial (not skipping)
  if (body.step === TUTORIAL_COMPLETED && !isSkip) {
    await trackAchievements(playerId, { tutorialCompleted: 1 });
  }

  res.json({ tutorialStep: body.step });
}));

const starterWeaponSchema = z.object({
  weaponType: z.enum(['melee', 'ranged', 'magic']),
});

/**
 * POST /api/v1/player/starter-weapon
 * Claim a starter weapon from Kessa Ironweld. One-time only.
 */
playerRouter.post('/starter-weapon', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { weaponType } = starterWeaponSchema.parse(req.body);

  const templateId = STARTER_LOADOUT.starterWeaponIds[weaponType];

  // Check if player already claimed a starter weapon (any of the 3 types)
  const allStarterIds = Object.values(STARTER_LOADOUT.starterWeaponIds);
  const existingClaim = await prisma.item.findFirst({
    where: { ownerId: playerId, templateId: { in: allStarterIds } },
    select: { id: true },
  });

  if (existingClaim) {
    throw new AppError(400, 'Starter weapon already claimed', 'ALREADY_CLAIMED');
  }

  const template = await prisma.itemTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, maxDurability: true },
  });

  if (!template) {
    throw new AppError(500, 'Starter weapon template missing', 'MISSING_TEMPLATE');
  }

  const item = await prisma.item.create({
    data: {
      ownerId: playerId,
      templateId,
      rarity: 'common',
      quantity: 1,
      maxDurability: template.maxDurability,
      currentDurability: template.maxDurability,
    },
    select: { id: true },
  });

  res.json({ success: true, itemId: item.id, weaponType });
}));

// GET /api/v1/player/buffs — list active buffs
playerRouter.get('/buffs', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const buffs = await getActiveBuffs(playerId);
  res.json({ buffs });
}));

/**
 * GET /api/v1/player/equipment
 * Get currently equipped items
 */
playerRouter.get('/equipment', asyncHandler(async (req, res) => {
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
}));
