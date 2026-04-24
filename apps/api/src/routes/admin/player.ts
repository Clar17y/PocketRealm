import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  ALL_SKILLS,
  CHARACTER_CONSTANTS,
  SKILL_CONSTANTS,
} from '@pocketrealm/shared';
import {
  grantAdminPremium,
  grantAdminQuestTokens,
  grantAdminTurns,
  grantAdminXp,
  listPlayerPremiumPurchases,
  setAdminPlayerAttributes,
  setAdminPlayerLevel,
  setAdminSkillLevel,
  setAdminSkillLevels,
} from '../../services/admin/playerAdminService';

const grantTurnsSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000),
});

const premiumPurchasesParamsSchema = z.object({
  playerId: z.string().min(1),
});

const premiumGrantSchema = z.object({
  playerId: z.string().min(1),
  days: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(1).max(500).optional(),
});

const setLevelSchema = z.object({
  level: z.number().int().min(1).max(CHARACTER_CONSTANTS.MAX_LEVEL),
});

const skillEnum = z.enum(ALL_SKILLS as [string, ...string[]]);

const setSkillLevelSchema = z.object({
  skillType: skillEnum,
  level: z.number().int().min(1).max(SKILL_CONSTANTS.MAX_LEVEL),
});

const setSkillLevelsSchema = z.object({
  skillTypes: z.array(skillEnum).min(1),
  level: z.number().int().min(1).max(SKILL_CONSTANTS.MAX_LEVEL),
});

const grantXpSchema = z.object({
  amount: z.number().int().min(1),
});

const attributeKeyEnum = z.enum([
  'vitality',
  'strength',
  'dexterity',
  'intelligence',
  'luck',
  'evasion',
]);

const setAttributesSchema = z.object({
  attributePoints: z.number().int().min(0).optional(),
  attributes: z.record(attributeKeyEnum, z.number().int().min(0)).optional(),
});

const grantTokensSchema = z.object({
  amount: z.number().int().min(1).max(100_000),
});

export function registerPlayerAdminRoutes(router: Router): void {
  router.post('/turns/grant', asyncHandler(async (req, res) => {
    const { amount } = grantTurnsSchema.parse(req.body);
    const result = await grantAdminTurns(req.player!.playerId, amount);
    res.json({ success: true, ...result });
  }));

  router.get('/premium/purchases/:playerId', asyncHandler(async (req, res) => {
    const { playerId } = premiumPurchasesParamsSchema.parse(req.params);
    const purchases = await listPlayerPremiumPurchases(playerId);
    res.json({ purchases });
  }));

  router.post('/premium/grant', asyncHandler(async (req, res) => {
    const body = premiumGrantSchema.parse(req.body);
    const purchase = await grantAdminPremium({
      adminId: req.player!.playerId,
      ...body,
    });
    res.json({ success: true, purchase });
  }));

  router.post('/player/level', asyncHandler(async (req, res) => {
    const { level } = setLevelSchema.parse(req.body);
    const result = await setAdminPlayerLevel(req.player!.playerId, level);
    res.json({ success: true, ...result });
  }));

  router.post('/set-skill-level', asyncHandler(async (req, res) => {
    const { skillType, level } = setSkillLevelSchema.parse(req.body);
    const result = await setAdminSkillLevel(
      req.player!.playerId,
      skillType as (typeof ALL_SKILLS)[number],
      level,
    );
    res.json({ success: true, ...result });
  }));

  router.post('/set-skill-levels', asyncHandler(async (req, res) => {
    const { skillTypes, level } = setSkillLevelsSchema.parse(req.body);
    const result = await setAdminSkillLevels(
      req.player!.playerId,
      skillTypes as Array<(typeof ALL_SKILLS)[number]>,
      level,
    );
    res.json({ success: true, ...result });
  }));

  router.post('/player/xp', asyncHandler(async (req, res) => {
    const { amount } = grantXpSchema.parse(req.body);
    const result = await grantAdminXp(req.player!.playerId, amount);
    res.json({ success: true, ...result });
  }));

  router.post('/player/attributes', asyncHandler(async (req, res) => {
    const body = setAttributesSchema.parse(req.body);
    const result = await setAdminPlayerAttributes(req.player!.playerId, body);
    res.json({ success: true, ...result });
  }));

  router.post('/tokens/grant', asyncHandler(async (req, res) => {
    const { amount } = grantTokensSchema.parse(req.body);
    const result = await grantAdminQuestTokens(req.player!.playerId, amount);
    res.json({ success: true, ...result });
  }));
}
