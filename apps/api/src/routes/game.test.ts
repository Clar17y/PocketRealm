import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/gameBootstrapService', () => ({
  getGameBootstrap: vi.fn(),
}));

import { generateAccessToken } from '../middleware/auth';
import { errorHandler } from '../middleware/errorHandler';
import { getGameBootstrap } from '../services/gameBootstrapService';
import { gameRouter } from './game';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/game', gameRouter);
  app.use(errorHandler);
  return app;
}

describe('game router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authenticated player bootstrap payload from the service', async () => {
    vi.mocked(getGameBootstrap).mockResolvedValue({
      turns: { currentTurns: 42, timeToCapMs: null, lastRegenAt: '2026-06-24T08:00:00.000Z' },
      player: { player: { id: 'player-1', username: 'hero' } },
      skills: { skills: [] },
      zones: { zones: [], connections: [], undiscoveredZones: [], currentZoneId: 'zone-1' },
      inventory: { items: [], capacity: 24, usedSlots: 0, materialTotals: {} },
      equipment: { equipment: [] },
      hp: { currentHp: 10, maxHp: 10, regenPerSecond: 1, lastHpRegenAt: '2026-06-24T08:00:00.000Z', isRecovering: false, recoveryCost: null },
      resources: {
        stamina: { current: 10, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
        mana: { current: 10, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
      },
      skillPoints: { availablePoints: 0, spentPoints: 0, allocations: [], trees: [] },
      buffs: { buffs: [] },
      expeditionCooldowns: { weeklyCooldowns: {}, betweenCooldown: null, hasActiveExpedition: false },
      zoneEvents: { events: [] },
      crafting: { recipes: [], zoneCraftingLevel: 0, zoneName: null },
      guild: null,
    } as never);
    const token = generateAccessToken({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'hero',
      seasonId: null,
      role: 'player',
    });

    const res = await request(buildApp())
      .get('/api/v1/game/bootstrap')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.turns.currentTurns).toBe(42);
    expect(getGameBootstrap).toHaveBeenCalledWith('player-1');
  });
});
