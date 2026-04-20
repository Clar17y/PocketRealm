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

const mocks = vi.hoisted(() => ({
  refreshSeasonCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/seasonCacheService', () => ({
  refreshSeasonCache: mocks.refreshSeasonCache,
}));

import { mockPrisma } from '../__test__/setup';
import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import { adminRouter } from './admin';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return generateAccessToken({
    accountId: 'account-1',
    playerId: 'player-1',
    username: 'admin',
    seasonId: null,
    role: 'admin',
  });
}

describe('admin season endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.update.mockResolvedValue({});
    mockPrisma.account.findUnique.mockResolvedValue({ role: 'admin' });
    mockPrisma.season = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    mockPrisma.zone.findMany.mockResolvedValue([]);
    mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 0 });
  });

  it('creates an upcoming season with default empty features and null overrides', async () => {
    mockPrisma.season.create.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'upcoming',
    });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        name: 'Season 1',
        startsAt: '2026-05-01T00:00:00.000Z',
        endsAt: '2026-06-01T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(mockPrisma.season.create).toHaveBeenCalledWith({
      data: {
        name: 'Season 1',
        status: 'upcoming',
        startsAt: new Date('2026-05-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-01T00:00:00.000Z'),
        constantOverrides: null,
        features: [],
      },
    });
  });

  it('rejects activation when another season is already active', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({ id: 'season-active' });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/activate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(409);
    expect(mockPrisma.season.update).not.toHaveBeenCalled();
    expect(mocks.refreshSeasonCache).not.toHaveBeenCalled();
  });

  it('ends a season, refreshes the cache, and cancels active world events in seasonal zones', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      status: 'active',
    });
    mockPrisma.season.update.mockResolvedValue({
      id: 'season-1',
      status: 'ended',
    });
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'zone-1' }, { id: 'zone-2' }]);

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/end')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.worldEvent.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        zoneId: { in: ['zone-1', 'zone-2'] },
      },
      data: { status: 'cancelled' },
    });
    expect(mocks.refreshSeasonCache).toHaveBeenCalledTimes(1);
  });
});
