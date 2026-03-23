import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth';
import { getCategories, getLeaderboard } from '../services/leaderboardService';
import { asyncHandler } from '../utils/asyncHandler';

export const leaderboardRouter = Router();

leaderboardRouter.use(optionalAuthenticate);

leaderboardRouter.get('/categories', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(getCategories());
});

leaderboardRouter.get('/:category', asyncHandler(async (req, res) => {
  const { category } = req.params;
  const aroundMe = req.query.around_me === 'true';
  const playerId = req.player?.playerId;

  const result = await getLeaderboard(category, playerId, aroundMe);

  // Strip playerId and isAdmin from public entries to prevent UUID enumeration
  res.set('Cache-Control', 'private, max-age=60');
  res.json({
    ...result,
    entries: result.entries.map(({ playerId: _pid, isAdmin: _adm, ...rest }) => rest),
  });
}));
