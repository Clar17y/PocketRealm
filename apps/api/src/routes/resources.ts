import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { getResourceState, restStamina, restMana } from '../services/resourceService';
import { getTurnState } from '../services/turnBankService';
import { asyncHandler } from '../utils/asyncHandler';
import { getPlayerTaxRate, calculateEffectiveTurns, taxInfoFromResult } from '../services/guildTaxService';
import { STAMINA_CONSTANTS, MANA_CONSTANTS } from '@pocketrealm/shared';
import { createActivityLog } from '../services/activityLogService';

export const resourcesRouter = Router();
resourcesRouter.use(authenticate);

/**
 * GET /api/v1/resources
 * Get current stamina + mana state (lazy regen applied)
 */
resourcesRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const state = await getResourceState(playerId);
  res.json(state);
}));

const restSchema = z.object({
  type: z.enum(['stamina', 'mana']),
  turns: z.number().int().positive(),
});

/**
 * POST /api/v1/resources/rest
 * Spend turns to recover stamina or mana
 */
resourcesRouter.post('/rest', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = restSchema.parse(req.body);

  const { taxResult, ...result } = body.type === 'stamina'
    ? await restStamina(playerId, body.turns)
    : await restMana(playerId, body.turns);

  const turns = await getTurnState(playerId);

  await createActivityLog({
    playerId,
    activityType: `rest_${body.type}`,
    turnsSpent: taxResult.preTaxAmount,
    result: {
      type: body.type,
      healedAmount: result.healedAmount,
      newValue: result.newValue,
      max: result.max,
    },
  });

  res.json({
    ...result,
    turns,
    tax: taxInfoFromResult(taxResult),
  });
}));

const estimateSchema = z.object({
  type: z.enum(['stamina', 'mana']),
  turns: z.coerce.number().int().positive(),
});

/**
 * GET /api/v1/resources/estimate?type=stamina&turns=100
 * Preview rest healing for stamina or mana
 */
resourcesRouter.get('/estimate', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const query = estimateSchema.parse(req.query);

  const state = await getResourceState(playerId);
  const { taxRate } = await getPlayerTaxRate(playerId);
  const effectiveTurns = calculateEffectiveTurns(query.turns, taxRate);

  const resource = query.type === 'stamina' ? state.stamina : state.mana;
  const healPerTurn = query.type === 'stamina'
    ? STAMINA_CONSTANTS.REST_HEAL_PER_TURN
    : MANA_CONSTANTS.REST_HEAL_PER_TURN;

  const needed = resource.max - resource.current;
  const maxHealAmount = healPerTurn * effectiveTurns;
  const actualHealAmount = Math.min(needed, maxHealAmount);
  const turnsNeeded = Math.ceil(actualHealAmount / healPerTurn);

  res.json({
    type: query.type,
    current: resource.current,
    max: resource.max,
    healPerTurn,
    turnsRequested: query.turns,
    effectiveTurns,
    turnsNeeded: Math.min(turnsNeeded, effectiveTurns),
    healAmount: actualHealAmount,
    resultingValue: Math.min(resource.current + actualHealAmount, resource.max),
    taxRate,
  });
}));
