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
  evaluateSeasonRewards: vi.fn(),
  runSeasonMerge: vi.fn(),
  bootstrapSeason: vi.fn(),
}));

vi.mock('../services/seasonCacheService', () => ({
  refreshSeasonCache: mocks.refreshSeasonCache,
}));
vi.mock('../services/seasonRewardService', () => ({
  evaluateSeasonRewards: mocks.evaluateSeasonRewards,
}));
vi.mock('../services/seasonMergeService', () => ({
  runSeasonMerge: mocks.runSeasonMerge,
}));
vi.mock('../services/seasonBootstrapService', () => ({
  bootstrapSeason: mocks.bootstrapSeason,
}));

import { mockPrisma } from '../__test__/setup';
import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import { adminRouter } from './admin';
import { activateSeason } from '../services/seasonLifecycleService';

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

function stubBootstrappedSeason(
  status: 'upcoming' | 'active' | 'ended' | 'archived' = 'upcoming',
  includeOptionalContent = true,
) {
  mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
    id: 'season-1',
    name: 'Season 1',
    status,
  });
  mockPrisma.zone.findFirst.mockResolvedValue({ id: 'zone-season-1' });
  mockPrisma.itemTemplate.findFirst.mockResolvedValue({ id: 'item-season-1' });
  mockPrisma.mobTemplate.findFirst.mockResolvedValue({ id: 'mob-season-1' });
  mockPrisma.craftingRecipe.findFirst.mockResolvedValue({ id: 'recipe-season-1' });
  mockPrisma.mobFamilyMember.findFirst.mockResolvedValue(includeOptionalContent ? { mobFamilyId: 'family-season-1' } : null);
  mockPrisma.zoneMobFamily.findFirst.mockResolvedValue(includeOptionalContent ? { zoneId: 'zone-season-1' } : null);
  mockPrisma.dropTable.findFirst.mockResolvedValue(includeOptionalContent ? { id: 'drop-season-1' } : null);
  mockPrisma.chestDropTable.findFirst.mockResolvedValue(includeOptionalContent ? { id: 'chest-season-1' } : null);
  mockPrisma.resourceNode.findFirst.mockResolvedValue(includeOptionalContent ? { id: 'node-season-1' } : null);
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
    mockPrisma.zone = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    };
    mockPrisma.itemTemplate = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    };
    mockPrisma.mobTemplate = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    };
    mockPrisma.craftingRecipe = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    };
    mockPrisma.zone.findMany.mockResolvedValue([]);
    mockPrisma.zone.findFirst.mockResolvedValue(null);
    mockPrisma.itemTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.mobTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValue(null);
    mockPrisma.mobFamilyMember.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue(null);
    mockPrisma.dropTable.findFirst.mockResolvedValue(null);
    mockPrisma.chestDropTable.findFirst.mockResolvedValue(null);
    mockPrisma.resourceNode.findFirst.mockResolvedValue(null);
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

  it('returns seasons with computed isBootstrapped when optional season content is absent', async () => {
    mockPrisma.season.findMany.mockResolvedValue([
      {
        id: 'season-1',
        name: 'Season 1',
        status: 'upcoming',
        startsAt: new Date('2026-05-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-21T00:00:00.000Z'),
      },
      {
        id: 'season-2',
        name: 'Season 2',
        status: 'upcoming',
        startsAt: new Date('2026-07-01T00:00:00.000Z'),
        endsAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-20T00:00:00.000Z'),
      },
    ]);
    mockPrisma.zone.findFirst.mockImplementation(async ({ where }: { where?: { seasonId?: string } }) => (
      where?.seasonId === 'season-1'
        ? { id: 'zone-season-1' }
        : null
    ));
    mockPrisma.itemTemplate.findFirst.mockImplementation(async ({ where }: { where?: { seasonId?: string } }) => (
      where?.seasonId === 'season-1'
        ? { id: 'item-season-1' }
        : null
    ));
    mockPrisma.mobTemplate.findFirst.mockImplementation(async ({ where }: { where?: { seasonId?: string } }) => (
      where?.seasonId === 'season-1'
        ? { id: 'mob-season-1' }
        : null
    ));
    mockPrisma.craftingRecipe.findFirst.mockImplementation(async ({ where }: { where?: { seasonId?: string } }) => (
      where?.seasonId === 'season-1'
        ? { id: 'recipe-season-1' }
        : null
    ));

    const res = await request(buildApp())
      .get('/api/v1/admin/seasons')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.seasons).toEqual([
      expect.objectContaining({ id: 'season-1', isBootstrapped: true }),
      expect.objectContaining({ id: 'season-2', isBootstrapped: false }),
    ]);
  });

  it('rejects activation at the service layer when a season is not upcoming', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'archived',
    });

    await expect(activateSeason('season-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'SEASON_NOT_UPCOMING',
    });
    expect(mockPrisma.season.findFirst).not.toHaveBeenCalled();
    expect(mocks.refreshSeasonCache).not.toHaveBeenCalled();
  });

  it('bootstraps a season through the admin endpoint', async () => {
    mocks.bootstrapSeason.mockResolvedValue({ seasonId: 'season-1' });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/bootstrap')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mocks.bootstrapSeason).toHaveBeenCalledWith('season-1');
    expect(res.body).toEqual({
      message: 'Season bootstrapped',
      seasonId: 'season-1',
    });
  });

  it('activates a bootstrapped season through the admin endpoint', async () => {
    stubBootstrappedSeason('upcoming', false);
    mockPrisma.season.findFirst.mockResolvedValue(null);
    mockPrisma.season.update.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
    });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/activate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.season.update).toHaveBeenCalledWith({
      where: { id: 'season-1' },
      data: { status: 'active' },
    });
    expect(mocks.refreshSeasonCache).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      season: {
        id: 'season-1',
        name: 'Season 1',
        status: 'active',
      },
    });
  });

  it('rejects activation when another season is already active', async () => {
    stubBootstrappedSeason();
    mockPrisma.season.findFirst.mockResolvedValue({ id: 'season-active' });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/activate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(409);
    expect(mockPrisma.season.update).not.toHaveBeenCalled();
    expect(mocks.refreshSeasonCache).not.toHaveBeenCalled();
  });

  it('rejects activation through the admin endpoint when a season is not upcoming', async () => {
    stubBootstrappedSeason('ended');

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/activate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: 'SEASON_NOT_UPCOMING',
      },
    });
    expect(mockPrisma.season.update).not.toHaveBeenCalled();
    expect(mocks.refreshSeasonCache).not.toHaveBeenCalled();
  });

  it('rejects activation when the season is not bootstrapped', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'upcoming',
    });
    mockPrisma.season.findFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/activate')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: 'SEASON_NOT_BOOTSTRAPPED',
      },
    });
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

  it('evaluates rewards only for ended seasons', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      status: 'ended',
    });
    mocks.evaluateSeasonRewards.mockResolvedValue({ entries: 7 });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/evaluate-rewards')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mocks.evaluateSeasonRewards).toHaveBeenCalledWith('season-1');
    expect(res.body).toEqual({
      message: 'Rewards evaluated',
      hallOfFameEntries: 7,
    });
  });

  it('runs the merge pipeline from the admin endpoint', async () => {
    mocks.runSeasonMerge.mockResolvedValue({
      merged: 3,
      errors: ['player-4 failed'],
    });

    const res = await request(buildApp())
      .post('/api/v1/admin/seasons/season-1/merge')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mocks.runSeasonMerge).toHaveBeenCalledWith('season-1');
    expect(res.body).toEqual({
      message: 'Merge complete',
      merged: 3,
      errors: ['player-4 failed'],
    });
  });
});
