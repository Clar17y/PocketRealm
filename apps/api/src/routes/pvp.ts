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
} from '../services/pvpService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import { paginationSchema } from '../utils/routeHelpers.js';

export const pvpRouter = Router();
pvpRouter.use(authenticate);

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
pvpRouter.get('/ladder', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const result = await getLadder(playerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pvp/rating
 * Returns the player's PvP rating.
 */
pvpRouter.get('/rating', async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pvp/scout
 * Scout an opponent for 100 turns.
 */
pvpRouter.post('/scout', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = scoutSchema.parse(req.body);
    const result = await scoutOpponent(playerId, body.targetId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pvp/challenge
 * Challenge an opponent. Costs 500 turns (or 250 for revenge).
 */
pvpRouter.post('/challenge', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = challengeSchema.parse(req.body);
    const result = await challenge(playerId, req.player!.username, body.targetId);

    // --- Achievement check for the winner (stats derived from pvp_ratings table) ---
    if (result.winnerId) {
      const pvpAchievements = await checkAchievements(result.winnerId, {
        statKeys: ['totalPvpWins', 'bestPvpWinStreak'],
      });
      await emitAchievementNotifications(result.winnerId, pvpAchievements);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pvp/history
 * Paginated match history.
 */
pvpRouter.get('/history', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const query = historyQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    const result = await getHistory(playerId, query.page, query.pageSize);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pvp/history/:matchId
 * Full match detail including combat log.
 */
pvpRouter.get('/history/:matchId', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const { matchId } = matchIdSchema.parse(req.params);
    const result = await getMatchDetail(playerId, matchId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pvp/notifications/count
 * Read-only count of unread attack results (for badge polling).
 */
pvpRouter.get('/notifications/count', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const count = await getNotificationCount(playerId);
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pvp/notifications
 * Unread attack results (read-only, does NOT mark as read).
 */
pvpRouter.get('/notifications', async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pvp/notifications/read
 * Mark notifications as read. Optionally pass matchIds to mark specific ones.
 */
pvpRouter.post('/notifications/read', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = markReadSchema.parse(req.body ?? {});
    await markNotificationsRead(playerId, body.matchIds);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
