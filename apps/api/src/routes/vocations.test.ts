import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/vocationService', () => ({
  getVocationSnapshot: vi.fn(),
  honeVocation: vi.fn(),
  learnTechnique: vi.fn(),
  respecVocation: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { AppError, errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import {
  getVocationSnapshot,
  honeVocation,
  learnTechnique,
  respecVocation,
  type VocationActionResult,
  type VocationSnapshotResponse,
} from '../services/vocationService';
import { vocationsRouter } from './vocations';

const PLAYER_ID = 'player-1';

const snapshot = {
  playerId: PLAYER_ID,
  vocations: [
    {
      vocationId: 'prospector',
      xp: 30,
      rank: 1,
      xpForCurrentRank: 0,
      xpForNextRank: 300,
      masteryPointsEarned: 0,
      availableMasteryPoints: 0,
      spentPoints: 0,
      learnedTechniqueIds: [],
    },
  ],
  dailyCap: {
    dayStart: '2026-05-21T00:00:00.000Z',
    turnsSpent: 3,
    turnsLimit: 100,
    turnsRemaining: 97,
  },
} satisfies VocationSnapshotResponse;

const actionResult = {
  snapshot,
  vocation: snapshot.vocations[0],
} satisfies VocationActionResult;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/vocations', vocationsRouter);
  app.use(errorHandler);
  return app;
}

function authHeader() {
  const token = generateAccessToken({
    accountId: 'account-1',
    playerId: PLAYER_ID,
    username: 'hero',
    seasonId: null,
    role: 'player',
  });

  return { Authorization: `Bearer ${token}` };
}

describe('vocations router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.update.mockResolvedValue({});
  });

  it('requires authentication', async () => {
    const res = await request(buildApp()).get('/api/v1/vocations');

    expect(res.status).toBe(401);
    expect(getVocationSnapshot).not.toHaveBeenCalled();
  });

  it('delegates GET / to getVocationSnapshot with the player ID', async () => {
    vi.mocked(getVocationSnapshot).mockResolvedValue(snapshot);

    const res = await request(buildApp())
      .get('/api/v1/vocations')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual(snapshot);
    expect(getVocationSnapshot).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('validates and delegates POST /hone', async () => {
    vi.mocked(honeVocation).mockResolvedValue(actionResult);

    const res = await request(buildApp())
      .post('/api/v1/vocations/hone')
      .set(authHeader())
      .send({ vocationId: 'prospector', turns: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(actionResult);
    expect(honeVocation).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      turns: 3,
    });
  });

  it.each([0, 101])('rejects invalid hone turns %s without delegating', async (turns) => {
    const res = await request(buildApp())
      .post('/api/v1/vocations/hone')
      .set(authHeader())
      .send({ vocationId: 'prospector', turns });

    expect(res.status).toBe(400);
    expect(honeVocation).not.toHaveBeenCalled();
  });

  it.each(['', 'unknown'])('rejects invalid hone vocationId %s without delegating', async (vocationId) => {
    const res = await request(buildApp())
      .post('/api/v1/vocations/hone')
      .set(authHeader())
      .send({ vocationId, turns: 3 });

    expect(res.status).toBe(400);
    expect(honeVocation).not.toHaveBeenCalled();
  });

  it('delegates POST /techniques/learn', async () => {
    vi.mocked(learnTechnique).mockResolvedValue(actionResult);

    const res = await request(buildApp())
      .post('/api/v1/vocations/techniques/learn')
      .set(authHeader())
      .send({ vocationId: 'prospector', techniqueId: 'prospector_clean_split' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(actionResult);
    expect(learnTechnique).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      techniqueId: 'prospector_clean_split',
    });
  });

  it.each([
    { vocationId: '', techniqueId: 'prospector_clean_split' },
    { vocationId: 'unknown', techniqueId: 'prospector_clean_split' },
    { vocationId: 'prospector', techniqueId: '' },
    { vocationId: 'prospector' },
  ])('rejects invalid learn body %# without delegating', async (body) => {
    const res = await request(buildApp())
      .post('/api/v1/vocations/techniques/learn')
      .set(authHeader())
      .send(body);

    expect(res.status).toBe(400);
    expect(learnTechnique).not.toHaveBeenCalled();
  });

  it('delegates POST /respec', async () => {
    vi.mocked(respecVocation).mockResolvedValue(actionResult);

    const res = await request(buildApp())
      .post('/api/v1/vocations/respec')
      .set(authHeader())
      .send({ vocationId: 'prospector' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(actionResult);
    expect(respecVocation).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      vocationId: 'prospector',
    });
  });

  it.each(['', 'unknown'])('rejects invalid respec vocationId %s without delegating', async (vocationId) => {
    const res = await request(buildApp())
      .post('/api/v1/vocations/respec')
      .set(authHeader())
      .send({ vocationId });

    expect(res.status).toBe(400);
    expect(respecVocation).not.toHaveBeenCalled();
  });

  it('propagates service AppError responses', async () => {
    vi.mocked(respecVocation).mockRejectedValue(
      new AppError(400, 'No vocation mastery points to respec', 'NOTHING_TO_RESPEC'),
    );

    const res = await request(buildApp())
      .post('/api/v1/vocations/respec')
      .set(authHeader())
      .send({ vocationId: 'prospector' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      message: 'No vocation mastery points to respec',
      code: 'NOTHING_TO_RESPEC',
    });
  });
});
