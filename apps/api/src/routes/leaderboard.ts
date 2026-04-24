import { Router } from 'express';
import { CACHE_HEADER_CONSTANTS } from '@pocketrealm/shared';
import { optionalAuthenticate } from '../middleware/auth';
import { getCategories, getLeaderboard } from '../services/leaderboardService';
import { getCrownCollectorLeaderboard, type CrownCollectorEntry } from '../services/crownLeaderboardService';
import { getPublicLeaderboardSummary } from '../services/publicLeaderboardSummaryService';
import { asyncHandler } from '../utils/asyncHandler';

export const leaderboardRouter = Router();

leaderboardRouter.get('/public-summary', asyncHandler(async (_req, res) => {
  const result = await getPublicLeaderboardSummary();
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_MEDIUM);
  res.json(result);
}));

leaderboardRouter.get('/categories', (_req, res) => {
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
  res.json(getCategories());
});

leaderboardRouter.use(optionalAuthenticate);

function optionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return parsed > 0 ? parsed : undefined;
}

function toPublicCrownEntry(entry: CrownCollectorEntry): CrownCollectorEntry {
  return {
    rank: entry.rank,
    username: entry.username,
    characterLevel: entry.characterLevel,
    title: entry.title,
    titleTier: entry.titleTier,
    titleStyle: entry.titleStyle,
    crowns: entry.crowns,
    topGroups: entry.topGroups,
  };
}

leaderboardRouter.get('/crowns', asyncHandler(async (req, res) => {
  const result = await getCrownCollectorLeaderboard(
    req.player?.playerId,
    req.query.around_me === 'true',
    optionalPositiveInt(req.query.limit),
  );
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PRIVATE_SHORT);
  res.json({
    ...result,
    entries: result.entries.map(toPublicCrownEntry),
    myRank: result.myRank ? toPublicCrownEntry(result.myRank) : null,
  });
}));

leaderboardRouter.get('/:category', asyncHandler(async (req, res) => {
  const { category } = req.params;
  const aroundMe = req.query.around_me === 'true';
  const period = req.query.period === 'weekly' ? 'weekly' : 'alltime';
  const playerId = req.player?.playerId;
  const seasonId =
    typeof req.query.seasonId === 'string'
      ? req.query.seasonId
      : (req.player?.seasonId ?? null);

  const result = await getLeaderboard(category, playerId, aroundMe, seasonId, period);

  // Strip playerId and isAdmin from public entries to prevent UUID enumeration
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PRIVATE_SHORT);
  res.json({
    ...result,
    entries: result.entries.map(({ playerId: _pid, isAdmin: _adm, ...rest }) => rest),
  });
}));
