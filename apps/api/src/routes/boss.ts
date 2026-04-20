import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  getActiveBossEncounters,
  getBossEncounterStatus,
  getBossHistory,
  signUpForBossRound,
  checkAndResolveDueBossRounds,
} from '../services/bossEncounterService';
import { getIo } from '../socket';
import { paginationSchema, buildPagination, assertNotRecovering } from '../utils/routeHelpers.js';
import { asyncHandler } from '../utils/asyncHandler';
import { trackProgress } from '../services/progressService';
import { requireActiveSeason } from '../middleware/seasonGuard';

export const bossRouter = Router();

bossRouter.use(authenticate);

async function resolveKilledByUsername(killedBy: string | null): Promise<string | null> {
  if (!killedBy) return null;
  const player = await prisma.player.findUnique({
    where: { id: killedBy },
    select: { username: true },
  });
  return player?.username ?? null;
}

/**
 * GET /api/v1/boss/active
 */
bossRouter.get('/active', asyncHandler(async (_req, res) => {
  await checkAndResolveDueBossRounds(getIo());
  const encounters = await getActiveBossEncounters();

  const enriched = await Promise.all(
    encounters.map(async (enc) => {
      const [mob, event, killedByUsername] = await Promise.all([
        prisma.mobTemplate.findUnique({
          where: { id: enc.mobTemplateId },
          select: { name: true, level: true },
        }),
        prisma.worldEvent.findUnique({
          where: { id: enc.eventId },
          select: { zoneId: true, title: true, zone: { select: { name: true } } },
        }),
        resolveKilledByUsername(enc.killedBy),
      ]);
      const { rewardsByPlayer: _rewards, ...encWithoutRewards } = enc;
      return {
        ...encWithoutRewards,
        mobName: mob?.name ?? 'Unknown',
        mobLevel: mob?.level ?? 1,
        zoneId: event?.zoneId ?? '',
        zoneName: event?.zone?.name ?? 'Unknown',
        eventTitle: event?.title ?? '',
        killedByUsername,
      };
    }),
  );

  res.json({ encounters: enriched });
}));

const historyQuerySchema = z.object({
  ...paginationSchema,
});

/**
 * GET /api/v1/boss/history
 * Must be registered before /:id to avoid param capture.
 */
bossRouter.get('/history', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { page, pageSize } = historyQuerySchema.parse(req.query);
  const result = await getBossHistory(playerId, page, pageSize);
  const entries = result.entries.map((entry) => {
    const myRewards = entry.encounter.rewardsByPlayer?.[playerId] ?? null;
    const { rewardsByPlayer: _full, ...encounterWithoutRewardsMap } = entry.encounter;
    return { ...entry, encounter: encounterWithoutRewardsMap, myRewards };
  });
  res.json({
    entries,
    pagination: buildPagination(page, pageSize, result.total),
  });
}));

const encounterIdSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/v1/boss/:id
 */
bossRouter.get('/:id', asyncHandler(async (req, res) => {
  await checkAndResolveDueBossRounds(getIo());
  const { id } = encounterIdSchema.parse(req.params);
  const data = await getBossEncounterStatus(id);
  if (!data) {
    throw new AppError(404, 'Boss encounter not found', 'NOT_FOUND');
  }

  // Resolve mob info, killer username, and participant usernames in parallel
  const participantPlayerIds = [...new Set(data.participants.map((p) => p.playerId))];
  const [mob, killedByUsername, players] = await Promise.all([
    prisma.mobTemplate.findUnique({
      where: { id: data.encounter.mobTemplateId },
      select: { name: true, level: true },
    }),
    resolveKilledByUsername(data.encounter.killedBy),
    prisma.player.findMany({
      where: { id: { in: participantPlayerIds } },
      select: { id: true, username: true },
    }),
  ]);
  const usernameMap = new Map(players.map((p) => [p.id, p.username]));

  const playerId = req.player!.playerId;
  const myRewards = data.encounter.rewardsByPlayer?.[playerId] ?? null;
  const { rewardsByPlayer: _full, ...encounterWithoutRewardsMap } = data.encounter;

  res.json({
    encounter: {
      ...encounterWithoutRewardsMap,
      mobName: mob?.name ?? 'Unknown',
      mobLevel: mob?.level ?? 1,
      killedByUsername,
    },
    participants: data.participants.map((p) => ({
      ...p,
      username: usernameMap.get(p.playerId) ?? null,
    })),
    myRewards,
  });
}));

const signupSchema = z.object({
  autoSignUp: z.boolean().optional(),
});

/**
 * POST /api/v1/boss/:id/signup
 * Kept with try/catch because the catch block does custom error mapping.
 */
bossRouter.post('/:id/signup', requireActiveSeason, async (req, res, next) => {
  try {
    await checkAndResolveDueBossRounds(getIo());
    const playerId = req.player!.playerId;
    const { id } = encounterIdSchema.parse(req.params);
    const body = signupSchema.parse(req.body);

    const encounter = await prisma.bossEncounter.findUnique({
      where: { id },
      select: { eventId: true },
    });
    if (!encounter) {
      throw new AppError(404, 'Boss encounter not found', 'NOT_FOUND');
    }

    const event = await prisma.worldEvent.findUnique({
      where: { id: encounter.eventId },
      select: { zoneId: true },
    });
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    if (!event?.zoneId || player?.currentZoneId !== event.zoneId) {
      throw new AppError(400, 'You must be in the boss zone to sign up', 'WRONG_ZONE');
    }

    const hpState = await assertNotRecovering(playerId);

    const participant = await signUpForBossRound(
      id,
      playerId,
      hpState.currentHp,
      body.autoSignUp ?? false,
    );

    // Guild contract + quest progress for boss participation
    void trackProgress(playerId, 'boss_rounds', 1);

    res.json({ participant });
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(500, 'Failed to sign up for boss round', 'BOSS_SIGNUP_FAILED'));
  }
});

const roundParamsSchema = z.object({
  id: z.string().uuid(),
  num: z.coerce.number().int().min(1),
});

/**
 * GET /api/v1/boss/:id/round/:num
 */
bossRouter.get('/:id/round/:num', asyncHandler(async (req, res) => {
  const { id, num } = roundParamsSchema.parse(req.params);

  const participants = await prisma.bossParticipant.findMany({
    where: { encounterId: id, roundNumber: num },
    orderBy: { totalDamage: 'desc' },
  });

  if (participants.length === 0) {
    throw new AppError(404, 'Round not found', 'NOT_FOUND');
  }

  res.json({
    round: num,
    participants: participants.map((p) => ({
      playerId: p.playerId,
      turnsCommitted: p.turnsCommitted,
      totalDamage: p.totalDamage,
      totalHealing: p.totalHealing,
      attacks: p.attacks,
      hits: p.hits,
      crits: p.crits,
      currentHp: p.currentHp,
      currentStamina: p.currentStamina,
      currentMana: p.currentMana,
      threat: p.threat,
      damageAbsorbed: p.damageAbsorbed,
      status: p.status,
    })),
  });
}));
