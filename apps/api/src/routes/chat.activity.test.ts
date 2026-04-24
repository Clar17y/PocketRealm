import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/chatActivityService', () => ({
  getNpcActivityReaction: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import { getNpcActivityReaction } from '../services/chatActivityService';
import { chatRouter } from './chat';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/chat', chatRouter);
  app.use(errorHandler);
  return app;
}

function playerToken() {
  return generateAccessToken({
    accountId: 'account-1',
    playerId: 'player-1',
    username: 'hero',
    seasonId: null,
    role: 'player',
  });
}

describe('chat activity route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.update.mockResolvedValue({});
  });

  it('returns an NPC activity reaction for an authenticated player', async () => {
    vi.mocked(getNpcActivityReaction).mockResolvedValue({
      activityId: 'activity-1',
      eventType: 'craft_crit',
      line: 'Fine work.',
    });

    const res = await request(buildApp())
      .get('/api/v1/chat/activity/npc-reaction')
      .query({ npcKey: 'kessa-weaponsmithing' })
      .set('Authorization', `Bearer ${playerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reaction: {
        activityId: 'activity-1',
        eventType: 'craft_crit',
        line: 'Fine work.',
      },
    });
    expect(getNpcActivityReaction).toHaveBeenCalledWith('player-1', 'kessa-weaponsmithing');
  });

  it('returns null when no NPC activity reaction is available', async () => {
    vi.mocked(getNpcActivityReaction).mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/v1/chat/activity/npc-reaction')
      .query({ npcKey: 'kessa-weaponsmithing' })
      .set('Authorization', `Bearer ${playerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reaction: null });
    expect(getNpcActivityReaction).toHaveBeenCalledWith('player-1', 'kessa-weaponsmithing');
  });

  it('rejects a missing NPC key without calling the activity service', async () => {
    const res = await request(buildApp())
      .get('/api/v1/chat/activity/npc-reaction')
      .set('Authorization', `Bearer ${playerToken()}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { message: 'Invalid query', code: 'VALIDATION_ERROR' },
    });
    expect(getNpcActivityReaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown NPC key without calling the activity service', async () => {
    const res = await request(buildApp())
      .get('/api/v1/chat/activity/npc-reaction')
      .query({ npcKey: 'unknown-npc' })
      .set('Authorization', `Bearer ${playerToken()}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { message: 'Unknown NPC', code: 'UNKNOWN_NPC' },
    });
    expect(getNpcActivityReaction).not.toHaveBeenCalled();
  });
});
