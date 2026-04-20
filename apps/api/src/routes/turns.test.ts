import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/turnBankService', () => ({
  getTurnState: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import { getTurnState } from '../services/turnBankService';
import { turnsRouter } from './turns';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/turns', turnsRouter);
  app.use(errorHandler);
  return app;
}

describe('turns router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.update.mockResolvedValue({});
  });

  it('delegates GET / to the premium-aware turn bank service', async () => {
    vi.mocked(getTurnState).mockResolvedValue({
      currentTurns: 95040,
      timeToCapMs: null,
      lastRegenAt: '2026-04-17T12:00:00.000Z',
    });
    const token = generateAccessToken({
      playerId: 'player-1',
      username: 'hero',
      role: 'player',
    });

    const res = await request(buildApp())
      .get('/api/v1/turns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      currentTurns: 95040,
      timeToCapMs: null,
      lastRegenAt: '2026-04-17T12:00:00.000Z',
    });
    expect(getTurnState).toHaveBeenCalledWith('player-1');
  });
});
