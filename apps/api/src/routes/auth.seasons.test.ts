import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/passwordValidation', () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../services/authTokenService', () => ({
  createEmailVerificationToken: vi.fn().mockResolvedValue({ rawToken: 'test-token' }),
  verifyEmailToken: vi.fn().mockResolvedValue(null),
  createPasswordResetToken: vi.fn().mockResolvedValue({ rawToken: 'reset-token' }),
  verifyPasswordResetToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/emailService', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/eventSchedulerService', () => ({
  checkAndSpawnEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/rateLimiter', () => ({
  createEndpointLimiter: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../services/lockoutService', () => ({
  recordFailedLogin: vi.fn().mockResolvedValue(undefined),
  isLockedOut: vi.fn().mockResolvedValue(false),
  clearLockout: vi.fn().mockResolvedValue(undefined),
  checkEmailRateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(() => 'refresh-token'),
  refreshTokenExpiresAt: vi.fn(() => new Date('2026-03-10T12:00:00.000Z')),
  verifyRefreshToken: vi.fn(),
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
}));

vi.mock('../services/equipmentService', () => ({
  ensureEquipmentSlots: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/zoneDiscoveryService', () => ({
  ensureStarterDiscoveries: vi.fn().mockResolvedValue(undefined),
  ensureStarterEncounterAndNodes: vi.fn().mockResolvedValue(undefined),
}));

import { mockPrisma } from '../__test__/setup';
import { authRouter } from './auth';

function findHandler(method: string, path: string) {
  const layer = (authRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('GET /characters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every non-bot character for the authenticated account', async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      {
        id: 'player-perm',
        username: 'Rook',
        characterLevel: 17,
        seasonId: null,
        season: null,
      },
      {
        id: 'player-s1',
        username: 'RookS1',
        characterLevel: 9,
        seasonId: 'season-1',
        season: {
          name: 'Season 1',
          status: 'active',
          endsAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      },
    ]);

    const req = {
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('get', '/characters');
    await handler(req, res, next);

    expect(mockPrisma.player.findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', isBot: false },
      select: {
        id: true,
        username: true,
        characterLevel: true,
        seasonId: true,
        season: {
          select: {
            name: true,
            status: true,
            endsAt: true,
          },
        },
      },
      orderBy: [
        { seasonId: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    expect(res.json).toHaveBeenCalledWith({
      characters: [
        {
          id: 'player-perm',
          username: 'Rook',
          characterLevel: 17,
          seasonId: null,
          seasonName: null,
          seasonStatus: null,
          seasonEndsAt: null,
        },
        {
          id: 'player-s1',
          username: 'RookS1',
          characterLevel: 9,
          seasonId: 'season-1',
          seasonName: 'Season 1',
          seasonStatus: 'active',
          seasonEndsAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ],
      activePlayerId: 'player-perm',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('GET /season-archives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns season archive summaries for the authenticated account', async () => {
    mockPrisma.seasonArchive.findMany.mockResolvedValue([
      {
        id: 'archive-1',
        username: 'RookS1',
        characterLevel: 23,
        characterXp: 2300n,
        attributes: { vitality: 4 },
        skills: [{ skillType: 'melee', level: 12, xp: 1400 }],
        stats: { totalCrafts: 12 },
        combatTemplates: [{ name: 'Boss' }],
        leaderboardRanks: { pvp_rating: 3 },
        rewardsEarned: { pvp_rating: { rank: 3 } },
        mergeLog: { gold: { amount: 1000 } },
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        season: {
          id: 'season-1',
          name: 'Season 1',
          startsAt: new Date('2026-05-01T00:00:00.000Z'),
          endsAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      },
    ]);

    const req = {
      player: {
        accountId: 'account-1',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('get', '/season-archives');
    await handler(req, res, next);

    expect(mockPrisma.seasonArchive.findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      select: {
        id: true,
        username: true,
        characterLevel: true,
        characterXp: true,
        attributes: true,
        skills: true,
        stats: true,
        combatTemplates: true,
        leaderboardRanks: true,
        rewardsEarned: true,
        mergeLog: true,
        createdAt: true,
        season: {
          select: {
            id: true,
            name: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(res.json).toHaveBeenCalledWith({
      archives: [
        expect.objectContaining({
          id: 'archive-1',
          username: 'RookS1',
          characterXp: 2300,
          season: expect.objectContaining({ id: 'season-1', name: 'Season 1' }),
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('POST /switch-player', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
  });

  it('switches the active player and returns a fresh token pair', async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 'player-s1',
      username: 'RookS1',
      accountId: 'account-1',
      seasonId: 'season-1',
      season: { id: 'season-1', status: 'active' },
    });
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({
      id: 'account-1',
      role: 'player',
    });

    const req = {
      body: { playerId: 'player-s1' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/switch-player');
    await handler(req, res, next);

    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { activePlayerId: 'player-s1' },
      select: {
        id: true,
        role: true,
      },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        accountId: 'account-1',
        token: 'refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      player: { id: 'player-s1', username: 'RookS1' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects switching into an ended seasonal character', async () => {
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 'player-s1',
      username: 'RookS1',
      accountId: 'account-1',
      seasonId: 'season-1',
      season: { id: 'season-1', status: 'ended' },
    });

    const req = {
      body: { playerId: 'player-s1' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/switch-player');
    await handler(req, res, next);

    expect(mockPrisma.account.update).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toContain('no longer playable');
  });
});

describe('POST /join-season', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    mockPrisma.season = {
      findFirst: vi.fn(),
    };
  });

  it('creates a new seasonal character and switches the account to it', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
    });
    mockPrisma.player.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.zone.findFirst.mockResolvedValue({
      id: 'starter-town',
      seasonId: 'season-1',
    });
    mockPrisma.zoneConnection.findFirst.mockResolvedValue({
      toZone: { id: 'season-forest' },
    });
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: 'starter-offhand',
      maxDurability: 40,
    });
    mockPrisma.account.update.mockResolvedValue({});

    const txClient = {
      player: {
        create: vi.fn().mockResolvedValue({
          id: 'player-s1',
          username: 'SeasonRook',
          seasonId: 'season-1',
        }),
      },
      item: {
        create: vi.fn().mockResolvedValue({
          id: 'starter-item-1',
        }),
      },
      playerEquipment: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      account: {
        update: vi.fn().mockResolvedValue({
          id: 'account-1',
          role: 'player',
        }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txClient));

    const req = {
      body: { username: 'SeasonRook' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/join-season');
    await handler(req, res, next);

    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'account-1', seasonId: 'season-1' },
      select: { id: true },
    });
    expect(mockPrisma.player.findFirst).toHaveBeenNthCalledWith(2, {
      where: { username: 'SeasonRook', seasonId: 'season-1' },
      select: { id: true },
    });
    expect(txClient.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'SeasonRook',
        accountId: 'account-1',
        seasonId: 'season-1',
        currentZoneId: 'season-forest',
        lastTravelledFromZoneId: 'starter-town',
        homeTownId: 'starter-town',
      }),
      select: {
        id: true,
        username: true,
        seasonId: true,
      },
    });
    expect(txClient.item.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'player-s1',
        templateId: 'starter-offhand',
        rarity: 'common',
        quantity: 1,
        maxDurability: 40,
        currentDurability: 40,
      },
      select: { id: true },
    });
    expect(txClient.playerEquipment.upsert).toHaveBeenCalledWith({
      where: { playerId_slot: { playerId: 'player-s1', slot: 'off_hand' } },
      create: { playerId: 'player-s1', slot: 'off_hand', itemId: 'starter-item-1' },
      update: { itemId: 'starter-item-1' },
    });
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { activePlayerId: 'player-s1' },
      select: {
        id: true,
        role: true,
      },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      player: { id: 'player-s1', username: 'SeasonRook' },
      seasonId: 'season-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects joining when there is no active season', async () => {
    mockPrisma.season.findFirst.mockResolvedValue(null);

    const req = {
      body: { username: 'SeasonRook' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/join-season');
    await handler(req, res, next);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toContain('No active season');
  });

  it('requires a seasonal starter zone instead of falling back to the permanent realm starter', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
    });
    mockPrisma.player.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.zone.findFirst.mockResolvedValue(null);

    const req = {
      body: { username: 'SeasonRook' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/join-season');
    await handler(req, res, next);

    expect(mockPrisma.zone.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toContain('No starter zone configured');
  });

  it('allows reusing a permanent-realm username in a season', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
    });
    mockPrisma.player.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.zone.findFirst.mockResolvedValue({
      id: 'starter-town',
      seasonId: 'season-1',
    });
    mockPrisma.zoneConnection.findFirst.mockResolvedValue({
      toZone: { id: 'season-forest' },
    });
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: 'starter-offhand',
      maxDurability: 40,
    });

    const txClient = {
      player: {
        create: vi.fn().mockResolvedValue({
          id: 'player-s1',
          username: 'Rook',
          seasonId: 'season-1',
        }),
      },
      item: {
        create: vi.fn().mockResolvedValue({ id: 'starter-item-1' }),
      },
      playerEquipment: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      account: {
        update: vi.fn().mockResolvedValue({
          id: 'account-1',
          role: 'player',
        }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txClient));

    const req = {
      body: { username: 'Rook' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/join-season');
    await handler(req, res, next);

    expect(mockPrisma.player.findFirst).toHaveBeenNthCalledWith(2, {
      where: { username: 'Rook', seasonId: 'season-1' },
      select: { id: true },
    });
    expect(txClient.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'Rook',
        seasonId: 'season-1',
      }),
      select: {
        id: true,
        username: true,
        seasonId: true,
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects usernames already taken within the active season', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
    });
    mockPrisma.player.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other-season-player' });

    const req = {
      body: { username: 'SeasonRook' },
      player: {
        accountId: 'account-1',
        playerId: 'player-perm',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/join-season');
    await handler(req, res, next);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toContain('Username already taken');
  });
});
