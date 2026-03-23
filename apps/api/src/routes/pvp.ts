import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import {
  getLadder,
  getOrCreateRating,
  scoutOpponent,
  challenge,
  getHistory,
  getMatchDetail,
  getNotificationCount,
  getNotifications,
  markNotificationsRead,
  getScoutNotificationCount,
  getScoutNotifications,
  markScoutNotificationsRead,
} from '../services/pvpService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import { sendPush } from '../services/pushNotificationService';
import { paginationSchema } from '../utils/routeHelpers.js';
import { asyncHandler } from '../utils/asyncHandler';
import { buildStateUpdates } from '../services/stateUpdateHelpers';
import { trackProgress } from '../services/progressService';
import { checkActivityLockout } from '../services/expeditionLockoutService';
import { createEndpointLimiter } from '../middleware/rateLimiter';

export const pvpRouter = Router();
pvpRouter.use(authenticate);
pvpRouter.use(createEndpointLimiter('pvp', 60_000, 10));

const scoutSchema = z.object({
  targetId: z.string().uuid(),
});

const challengeSchema = z.object({
  targetId: z.string().uuid(),
});

const matchIdSchema = z.object({
  matchId: z.string().uuid(),
});

const historyQuerySchema = z.object({
  ...paginationSchema,
});

const markReadSchema = z.object({
  matchIds: z.array(z.string().uuid()).optional(),
});

/**
 * GET /api/v1/pvp/ladder
 * Returns opponents in the player's rating bracket.
 */
pvpRouter.get('/ladder', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await getLadder(playerId);
  res.json(result);
}));

/**
 * GET /api/v1/pvp/rating
 * Returns the player's PvP rating.
 */
pvpRouter.get('/rating', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const rating = await getOrCreateRating(playerId);
  res.json({
    rating: rating.rating,
    wins: rating.wins,
    losses: rating.losses,
    draws: rating.draws,
    winStreak: rating.winStreak,
    bestRating: rating.bestRating,
  });
}));

/**
 * POST /api/v1/pvp/scout
 * Scout an opponent for 100 turns.
 */
pvpRouter.post('/scout', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await checkActivityLockout(playerId);
  const body = scoutSchema.parse(req.body);
  const result = await scoutOpponent(playerId, body.targetId);

  // Fire-and-forget push notification to scouted player
  void sendPush(body.targetId, 'pvpScout', {
    title: 'PvP Scout',
    body: `${req.player!.username} is sizing you up in the arena!`,
    tag: 'pvp-scout',
    data: { type: 'pvp' },
  });

  const stateUpdates = await buildStateUpdates(playerId, ['resources']);
  res.json({ ...result, stateUpdates });
}));

/**
 * POST /api/v1/pvp/challenge
 * Challenge an opponent. Costs 500 turns (or 250 for revenge).
 */
pvpRouter.post('/challenge', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await checkActivityLockout(playerId);
  const body = challengeSchema.parse(req.body);
  const result = await challenge(playerId, req.player!.username, body.targetId);

  // --- Achievement check + contract progress for the winner ---
  if (result.winnerId) {
    const pvpAchievements = await checkAchievements(result.winnerId, {
      statKeys: ['totalPvpWins', 'bestPvpWinStreak'],
    });
    await emitAchievementNotifications(result.winnerId, pvpAchievements);

    void trackProgress(result.winnerId, 'pvp_wins', 1);
  }

  // Track pvp_damage for both combatants (quest: "Deal X damage in the arena")
  const log = result.combat?.log ?? [];
  const attackerDamage = log
    .filter((e: { actor: string; damage?: number }) => e.actor === 'combatantA' && e.damage)
    .reduce((sum: number, e: { damage?: number }) => sum + (e.damage ?? 0), 0);
  const defenderDamage = log
    .filter((e: { actor: string; damage?: number }) => e.actor === 'combatantB' && e.damage)
    .reduce((sum: number, e: { damage?: number }) => sum + (e.damage ?? 0), 0);

  if (attackerDamage > 0) {
    void trackProgress(playerId, 'pvp_damage', attackerDamage);
  }
  if (defenderDamage > 0) {
    void trackProgress(body.targetId, 'pvp_damage', defenderDamage);
  }

  // Fire-and-forget push notification to defender
  void sendPush(result.defenderId, 'pvpAttack', {
    title: 'PvP Attack!',
    body: `${result.attackerName} challenged you in the arena!`,
    tag: 'pvp-attack',
    data: { type: 'pvp', matchId: result.matchId },
  });

  const stateUpdates = await buildStateUpdates(playerId, ['hp', 'resources', 'skills', 'characterProgression']);
  res.json({ ...result, stateUpdates });
}));

/**
 * GET /api/v1/pvp/history
 * Paginated match history.
 */
pvpRouter.get('/history', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const query = historyQuerySchema.parse({
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  const result = await getHistory(playerId, query.page, query.pageSize);
  res.json(result);
}));

/**
 * GET /api/v1/pvp/history/:matchId
 * Full match detail including combat log.
 */
pvpRouter.get('/history/:matchId', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { matchId } = matchIdSchema.parse(req.params);
  const result = await getMatchDetail(playerId, matchId);
  res.json(result);
}));

/**
 * GET /api/v1/pvp/notifications/count
 * Read-only count of unread attack results (for badge polling).
 */
pvpRouter.get('/notifications/count', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const count = await getNotificationCount(playerId);
  res.json({ count });
}));

/**
 * GET /api/v1/pvp/notifications
 * Unread attack results (read-only, does NOT mark as read).
 */
pvpRouter.get('/notifications', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const unread = await getNotifications(playerId);
  res.json({
    notifications: unread.map((m) => ({
      matchId: m.id,
      attackerName: m.attacker.username,
      winnerId: m.winnerId,
      defenderRatingChange: m.defenderRatingChange,
      isRevenge: m.isRevenge,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}));

/**
 * POST /api/v1/pvp/notifications/read
 * Mark notifications as read. Optionally pass matchIds to mark specific ones.
 */
pvpRouter.post('/notifications/read', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = markReadSchema.parse(req.body ?? {});
  await markNotificationsRead(playerId, body.matchIds);
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Scout Notifications
// ---------------------------------------------------------------------------

pvpRouter.get('/notifications/scouts/count', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const count = await getScoutNotificationCount(playerId);
  res.json({ count });
}));

pvpRouter.get('/notifications/scouts', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const notifications = await getScoutNotifications(playerId);
  res.json({ notifications });
}));

const scoutReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});

pvpRouter.post('/notifications/scouts/read', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = scoutReadSchema.parse(req.body ?? {});
  await markScoutNotificationsRead(playerId, body.ids);
  res.json({ success: true });
}));
