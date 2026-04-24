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
  getPlayerCrownCollection: vi.fn(),
  getCrownCollectorLeaderboard: vi.fn(),
  getPublicLeaderboardSummary: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
  optionalAuthenticate: mocks.optionalAuthenticate,
}));

vi.mock('../services/leaderboardService', () => ({
  getCategories: vi.fn(() => ({ groups: [] })),
  getLeaderboard: mocks.getLeaderboard,
}));

vi.mock('../services/crownService', () => ({
  getPlayerCrownCollection: mocks.getPlayerCrownCollection,
}));

vi.mock('../services/crownLeaderboardService', () => ({
  getCrownCollectorLeaderboard: mocks.getCrownCollectorLeaderboard,
}));

vi.mock('../services/publicLeaderboardSummaryService', () => ({
  getPublicLeaderboardSummary: mocks.getPublicLeaderboardSummary,
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
      period: 'alltime',
      entries: [],
      myRank: null,
      totalPlayers: 0,
      lastRefreshedAt: null,
    });
    mocks.getCrownCollectorLeaderboard.mockResolvedValue({
      entries: [],
      myRank: null,
      totalPlayers: 0,
      lastRefreshedAt: null,
    });
    mocks.getPublicLeaderboardSummary.mockResolvedValue({
      crownCollectors: [],
      weeklyLeaders: [],
      lastRefreshedAt: null,
    });
  });

  it('passes an explicit seasonId query parameter through to the service', async () => {
    const res = await request(buildApp())
      .get('/api/v1/leaderboard/pvp_rating?seasonId=season-1');

    expect(res.status).toBe(200);
    expect(mocks.getLeaderboard).toHaveBeenCalledWith('pvp_rating', undefined, false, 'season-1', 'alltime');
  });

  it('falls back to the authenticated player realm when no query parameter is provided', async () => {
    const res = await request(buildApp())
      .get('/api/v1/leaderboard/pvp_rating')
      .set('x-player-season-id', 'season-2');

    expect(res.status).toBe(200);
    expect(mocks.getLeaderboard).toHaveBeenCalledWith('pvp_rating', 'player-1', false, 'season-2', 'alltime');
  });

  it('passes the weekly period query parameter through to the service', async () => {
    const res = await request(buildApp())
      .get('/api/v1/leaderboard/pvp_rating?period=weekly&seasonId=season-1');

    expect(res.status).toBe(200);
    expect(mocks.getLeaderboard).toHaveBeenCalledWith('pvp_rating', undefined, false, 'season-1', 'weekly');
  });

  it('returns a player crown collection before category routing', async () => {
    mocks.getPlayerCrownCollection.mockResolvedValue({
      crowns: [{ category: 'pvp_wins', realmId: 'permanent', rank: 1, weekStart: '2026-04-20' }],
      totalByGroup: { pvp: 1 },
    });

    const res = await request(buildApp())
      .get('/api/v1/leaderboard/crowns/player-1');

    expect(res.status).toBe(200);
    expect(mocks.getLeaderboard).not.toHaveBeenCalled();
    expect(mocks.getPlayerCrownCollection).toHaveBeenCalledWith('player-1');
    expect(res.body.totalByGroup.pvp).toBe(1);
  });

  it('returns lifetime crown collectors before player crown collection routing', async () => {
    mocks.getCrownCollectorLeaderboard.mockResolvedValue({
      entries: [{
        rank: 1,
        playerId: 'player-1',
        username: 'Ada',
        totalCrowns: 7,
        crownsByGroup: { pvp: 7 },
      }],
      myRank: null,
      totalPlayers: 1,
      lastRefreshedAt: null,
    });

    const res = await request(buildApp())
      .get('/api/v1/leaderboard/crowns?limit=5');

    expect(res.status).toBe(200);
    expect(mocks.getCrownCollectorLeaderboard).toHaveBeenCalledWith(undefined, false, 5);
    expect(mocks.getPlayerCrownCollection).not.toHaveBeenCalled();
    expect(res.body.entries[0].username).toBe('Ada');
    expect(res.body.entries[0]).not.toHaveProperty('playerId');
  });

  it('passes authenticated playerId and around_me to crown collectors', async () => {
    const res = await request(buildApp())
      .get('/api/v1/leaderboard/crowns?around_me=true')
      .set('x-player-season-id', 'season-2');

    expect(res.status).toBe(200);
    expect(mocks.getCrownCollectorLeaderboard).toHaveBeenCalledWith('player-1', true, undefined);
  });

  it('returns cache-only public summary', async () => {
    const summary = {
      crownCollectors: [{ rank: 1, username: 'Ada', totalCrowns: 7, crownsByGroup: { pvp: 7 } }],
      weeklyLeaders: [{ category: 'pvp_wins', username: 'Grace', score: 12 }],
      lastRefreshedAt: '2026-04-24T10:00:00.000Z',
    };
    mocks.getPublicLeaderboardSummary.mockResolvedValue(summary);

    const res = await request(buildApp())
      .get('/api/v1/leaderboard/public-summary');

    expect(res.status).toBe(200);
    expect(mocks.getPublicLeaderboardSummary).toHaveBeenCalledTimes(1);
    expect(mocks.getLeaderboard).not.toHaveBeenCalled();
    expect(res.body).toEqual(summary);
  });
});
