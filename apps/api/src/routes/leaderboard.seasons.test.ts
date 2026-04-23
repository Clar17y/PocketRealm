import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  optionalAuthenticate: vi.fn((req: any, _res: any, next: any) => {
    const requestedSeasonId = req.header('x-player-season-id');
    if (requestedSeasonId) {
      req.player = {
        playerId: 'player-1',
        seasonId: requestedSeasonId,
      };
    }
    next();
  }),
  getLeaderboard: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
  optionalAuthenticate: mocks.optionalAuthenticate,
}));

vi.mock('../services/leaderboardService', () => ({
  getCategories: vi.fn(() => ({ groups: [] })),
  getLeaderboard: mocks.getLeaderboard,
}));

import { leaderboardRouter } from './leaderboard';

function buildApp() {
  const app = express();
  app.use('/api/v1/leaderboard', leaderboardRouter);
  return app;
}

describe('leaderboard route seasonal realm selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLeaderboard.mockResolvedValue({
      category: 'pvp_rating',
      entries: [],
      myRank: null,
      totalPlayers: 0,
      lastRefreshedAt: null,
    });
  });

  it('passes an explicit seasonId query parameter through to the service', async () => {
    const res = await request(buildApp())
      .get('/api/v1/leaderboard/pvp_rating?seasonId=season-1');

    expect(res.status).toBe(200);
    expect(mocks.getLeaderboard).toHaveBeenCalledWith('pvp_rating', undefined, false, 'season-1');
  });

  it('falls back to the authenticated player realm when no query parameter is provided', async () => {
    const res = await request(buildApp())
      .get('/api/v1/leaderboard/pvp_rating')
      .set('x-player-season-id', 'season-2');

    expect(res.status).toBe(200);
    expect(mocks.getLeaderboard).toHaveBeenCalledWith('pvp_rating', 'player-1', false, 'season-2');
  });
});
