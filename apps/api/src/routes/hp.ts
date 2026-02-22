import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import { authenticate } from '../middleware/auth';
import { getHpState, rest, recover } from '../services/hpService';
import { getTurnState } from '../services/turnBankService';
import { calculateHealPerTurn, calculateRecoveryExitHp } from '@adventure/game-engine';
import { getPlayerProgressionState } from '../services/attributesService';
import { asyncHandler } from '../utils/asyncHandler';

export const hpRouter = Router();

hpRouter.use(authenticate);

/**
 * GET /api/v1/hp
 * Get current HP state including regen info
 */
hpRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const hpState = await getHpState(playerId);
  res.json(hpState);
}));

const restSchema = z.object({
  turns: z.number().int().positive(),
});

/**
 * POST /api/v1/hp/rest
 * Spend turns to restore HP
 */
hpRouter.post('/rest', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = restSchema.parse(req.body);

  const result = await rest(playerId, body.turns);
  const turns = await getTurnState(playerId);

  // Log the activity
  await prisma.activityLog.create({
    data: {
      playerId,
      activityType: 'rest',
      turnsSpent: result.turnsSpent,
      result: {
        previousHp: result.previousHp,
        healedAmount: result.healedAmount,
        currentHp: result.currentHp,
        maxHp: result.maxHp,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  res.json({
    ...result,
    turns,
  });
}));

/**
 * POST /api/v1/hp/recover
 * Spend recovery turns to exit knockout state
 */
hpRouter.post('/recover', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const result = await recover(playerId);
  const turns = await getTurnState(playerId);

  // Log the activity
  await prisma.activityLog.create({
    data: {
      playerId,
      activityType: 'recovery',
      turnsSpent: result.turnsSpent,
      result: {
        previousState: result.previousState,
        currentHp: result.currentHp,
        maxHp: result.maxHp,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  res.json({
    ...result,
    turns,
  });
}));

const estimateSchema = z.object({
  turns: z.coerce.number().int().positive(),
});

/**
 * GET /api/v1/hp/rest/estimate?turns=100
 * Preview how much HP would be restored
 */
hpRouter.get('/rest/estimate', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const query = estimateSchema.parse(req.query);

  const hpState = await getHpState(playerId);

  if (hpState.isRecovering) {
    res.json({
      isRecovering: true,
      recoveryCost: hpState.recoveryCost,
      recoveryExitHp: calculateRecoveryExitHp(hpState.maxHp),
    });
    return;
  }

  const progression = await getPlayerProgressionState(playerId);
  const vitalityLevel = progression.attributes.vitality;

  const healPerTurn = calculateHealPerTurn(vitalityLevel);
  const hpNeeded = hpState.maxHp - hpState.currentHp;
  const maxHealAmount = healPerTurn * query.turns;
  const actualHealAmount = Math.min(hpNeeded, maxHealAmount);
  const turnsNeeded = Math.ceil(actualHealAmount / healPerTurn);

  res.json({
    isRecovering: false,
    currentHp: hpState.currentHp,
    maxHp: hpState.maxHp,
    healPerTurn,
    turnsRequested: query.turns,
    turnsNeeded: Math.min(turnsNeeded, query.turns),
    healAmount: actualHealAmount,
    resultingHp: Math.min(hpState.currentHp + actualHealAmount, hpState.maxHp),
  });
}));
