import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/turnBankService', () => ({
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 5000 }),
}));
vi.mock('../services/inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue({ itemId: 'item-1', quantity: 10, created: false }),
  addStackableItemTx: vi.fn(),
}));
vi.mock('../services/worldEventService', () => ({
  spawnWorldEvent: vi.fn(),
  getEventById: vi.fn(),
}));
vi.mock('../services/bossEncounterService', () => ({
  createBossEncounter: vi.fn().mockResolvedValue({ id: 'boss-enc-1' }),
}));
vi.mock('../services/attributesService', () => ({
  normalizePlayerAttributes: vi.fn((attrs: any) => attrs ?? {
    vitality: 1,
    strength: 1,
    dexterity: 1,
    intelligence: 1,
    luck: 1,
    evasion: 1,
  }),
}));
vi.mock('../services/activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));
vi.mock('../services/pushNotificationService', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/analyticsService', () => ({
  getBalanceReport: vi.fn(),
}));
vi.mock('../services/roundTimerRegistry', () => ({
  roundTimerRegistry: {
    schedule: vi.fn(),
    cancel: vi.fn(),
    rehydrate: vi.fn(),
    clearAll: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    keys: vi.fn().mockReturnValue([]),
  },
}));
vi.mock('@pocketrealm/game-engine', () => ({
  xpForLevel: vi.fn((lvl: number) => lvl * 100),
  characterLevelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
  rollMobPrefix: vi.fn(() => null),
  rollBonusStatsForRarity: vi.fn(() => null),
  generateRoomAssignments: vi.fn(() => ({
    rooms: [{ roomNumber: 1, mobCount: 2 }],
  })),
  calculateMaxStamina: vi.fn(() => 100),
  calculateMaxMana: vi.fn(() => 50),
}));
vi.mock('../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockResolvedValue({}),
  fetchItemDTOs: vi.fn().mockResolvedValue([]),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryCapacity: 50, inventoryUsedSlots: 10 }),
  fetchMaterialTotals: vi.fn().mockResolvedValue({}),
  buildInventoryStateUpdates: vi.fn().mockReturnValue({ inventoryUsedSlots: 10 }),
}));

import { mockPrisma } from '../__test__/setup';
import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import { roundTimerRegistry } from '../services/roundTimerRegistry';
import { adminRouter } from './admin';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

describe('admin router auth chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.update.mockResolvedValue({});
    mockPrisma.account.findUnique.mockResolvedValue({ role: 'player' });
    mockPrisma.bossEncounter.count.mockResolvedValue(0);
    mockPrisma.guildExpedition.count.mockResolvedValue(0);
  });

  it('returns 403 for non-admin access to GET /scheduler-status before reaching the handler', async () => {
    const token = generateAccessToken({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'user',
      seasonId: null,
      role: 'player',
    });

    const res = await request(buildApp())
      .get('/api/v1/admin/scheduler-status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: expect.objectContaining({
        message: 'Admin access required',
        code: 'FORBIDDEN',
      }),
    });
    expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      select: { role: true },
    });
    expect(roundTimerRegistry.size).not.toHaveBeenCalled();
    expect(mockPrisma.bossEncounter.count).not.toHaveBeenCalled();
    expect(mockPrisma.guildExpedition.count).not.toHaveBeenCalled();
  });
});
