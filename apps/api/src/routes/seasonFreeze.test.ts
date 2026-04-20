import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let mockSeason: { id: string; status: string } | undefined = {
  id: 'season-1',
  status: 'ended',
};

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.player = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: mockSeason?.id ?? null,
      role: 'player',
    };
    req.account = { id: 'account-1', role: 'player' };
    req.season = mockSeason;
    next();
  }),
}));

vi.mock('../services/questService', () => ({
  getActiveQuests: vi.fn().mockResolvedValue([]),
  getQuestState: vi.fn().mockResolvedValue({}),
  claimDailyBonus: vi.fn().mockResolvedValue({ success: true }),
  rerollQuest: vi.fn().mockResolvedValue({}),
  claimQuestReward: vi.fn().mockResolvedValue({}),
}));

vi.mock('../services/questShopService', () => ({
  getShopItems: vi.fn().mockResolvedValue({ items: [] }),
  purchaseItem: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockResolvedValue({}),
}));

import { claimDailyBonus } from '../services/questService';
import { purchaseItem } from '../services/questShopService';
import { errorHandler } from '../middleware/errorHandler';
import { questsRouter } from './quests';
import { shopRouter } from './shop';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/quests', questsRouter);
  app.use('/api/v1/shop', shopRouter);
  app.use(errorHandler);
  return app;
}

describe('season freeze route protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeason = { id: 'season-1', status: 'ended' };
  });

  it('blocks router-level guarded quest mutations for ended seasons', async () => {
    const res = await request(buildApp()).post('/api/v1/quests/bonus').send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: expect.objectContaining({
        message: 'This season has ended. Your character is frozen pending merge.',
        code: 'SEASON_ENDED',
      }),
    });
    expect(claimDailyBonus).not.toHaveBeenCalled();
  });

  it('blocks route-level guarded shop mutations for ended seasons', async () => {
    const res = await request(buildApp())
      .post('/api/v1/shop/purchase/11111111-1111-1111-1111-111111111111')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: expect.objectContaining({
        message: 'This season has ended. Your character is frozen pending merge.',
        code: 'SEASON_ENDED',
      }),
    });
    expect(purchaseItem).not.toHaveBeenCalled();
  });

  it('allows active seasons through to the underlying handlers', async () => {
    mockSeason = { id: 'season-1', status: 'active' };

    const [questsRes, shopRes] = await Promise.all([
      request(buildApp()).post('/api/v1/quests/bonus').send({}),
      request(buildApp())
        .post('/api/v1/shop/purchase/11111111-1111-1111-1111-111111111111')
        .send({}),
    ]);

    expect(questsRes.status).toBe(200);
    expect(shopRes.status).toBe(200);
    expect(claimDailyBonus).toHaveBeenCalledWith('player-1');
    expect(purchaseItem).toHaveBeenCalledWith(
      'player-1',
      '11111111-1111-1111-1111-111111111111',
      {},
    );
  });
});
