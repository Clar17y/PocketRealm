import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_CONSTANTS, STARTER_LOADOUT } from '@pocketrealm/shared';

vi.mock('../utils/passwordValidation', () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../services/authTokenService', () => ({
  hashToken: vi.fn((token: string) => `hashed:${token}`),
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
  createEndpointLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
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
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
  disconnectAccountSockets: vi.fn(),
  disconnectPlayerSockets: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import bcrypt from 'bcrypt';
import { createEndpointLimiter } from '../middleware/rateLimiter';
import { verifyRefreshToken } from '../middleware/auth';
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { disconnectPlayerSockets } from '../socket';
import { authRouter } from './auth';

it('configures registration rate limiting to fail closed when Redis is unavailable', () => {
  expect(createEndpointLimiter).toHaveBeenCalledWith(
    'register',
    RATE_LIMIT_CONSTANTS.REGISTER_WINDOW_MS,
    RATE_LIMIT_CONSTANTS.REGISTER_MAX,
    { message: 'Too many registration attempts, please try again later', passOnStoreError: false },
  );
});

function findHandler(method: string, path: string) {
  const handlers = findHandlers(method, path);
  return handlers[handlers.length - 1];
}

function findHandlers(method: string, path: string) {
  const layer = (authRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  return layer.route.stack.map((s: any) => s.handle);
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function setupSuccessfulRegisterState() {
  mockPrisma.account.findUnique.mockResolvedValue(null);
  mockPrisma.player.findFirst.mockResolvedValue(null);
  mockPrisma.zone.findFirst.mockResolvedValue({ id: 'starter-town' });
  mockPrisma.zoneConnection.findFirst.mockResolvedValue({
    toZone: { id: 'forest-edge' },
  });
  mockPrisma.itemTemplate.findUnique.mockResolvedValue({
    id: STARTER_LOADOUT.tutorialOffHandTemplateId,
    maxDurability: 40,
  });

  const txCalls: string[] = [];
  const txClient: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'account') return {
        create: vi.fn().mockImplementation(() => {
          txCalls.push('account.create');
          return Promise.resolve({
            id: 'account-1', email: 'rook@example.com', role: 'player',
          });
        }),
        update: vi.fn().mockImplementation(() => {
          txCalls.push('account.update');
          return Promise.resolve({});
        }),
      };
      if (prop === 'player') return {
        create: vi.fn().mockImplementation(() => {
          txCalls.push('player.create');
          return Promise.resolve({
            id: 'player-1', username: 'Rook', seasonId: null,
          });
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          homeTownId: 'starter-town',
          seasonId: null,
        }),
      };
      if (prop === 'playerEquipment') return {
        findMany: vi.fn().mockImplementation(() => { txCalls.push('playerEquipment.findMany'); return Promise.resolve([]); }),
        createMany: vi.fn().mockImplementation(() => { txCalls.push('playerEquipment.createMany'); return Promise.resolve({}); }),
        upsert: vi.fn().mockImplementation(() => { txCalls.push('playerEquipment.upsert'); return Promise.resolve({}); }),
      };
      if (prop === 'item') return {
        create: vi.fn().mockImplementation(() => { txCalls.push('item.create'); return Promise.resolve({ id: 'starter-item-1' }); }),
      };
      if (prop === 'zone') return {
        findMany: vi.fn().mockImplementation(() => { txCalls.push('zone.findMany'); return Promise.resolve([{ id: 'starter-town' }]); }),
        findFirst: vi.fn().mockImplementation(() => { txCalls.push('zone.findFirst'); return Promise.resolve({ id: 'starter-town' }); }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'starter-town',
          isStarter: true,
          seasonId: null,
        }),
      };
      if (prop === 'zoneConnection') return {
        findMany: vi.fn().mockImplementation(() => { txCalls.push('zoneConnection.findMany'); return Promise.resolve([]); }),
      };
      if (prop === 'playerZoneDiscovery') return {
        createMany: vi.fn().mockImplementation(() => { txCalls.push('playerZoneDiscovery.createMany'); return Promise.resolve({}); }),
      };
      if (prop === 'resourceNode') return {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      if (prop === 'playerResourceNode') return {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({}),
      };
      if (prop === 'encounterSite') return {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      };
      if (prop === 'zoneMobFamily') return {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      if (prop === 'mobTemplate') return {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      return new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) });
    },
  });

  mockPrisma.$transaction.mockImplementation(async (fn: any) => {
    if (typeof fn === 'function') return fn(txClient);
    return Promise.all(fn);
  });

  return txCalls;
}

describe('POST /register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    };
  });

  it('applies a registration-specific limiter before the handler', () => {
    const handlers = findHandlers('post', '/register');

    expect(handlers.length).toBeGreaterThan(1);
  });

  it('wraps all registration steps in a transaction', async () => {
    const txCalls = setupSuccessfulRegisterState();

    const req = {
      body: {
        username: 'Rook',
        email: 'rook@example.com',
        password: 'supersecure',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/register');
    await handler(req, res, next);

    // Verify transaction was used
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    // Verify key operations happened via tx, not top-level prisma
    expect(txCalls).toContain('player.create');
    expect(txCalls).toContain('account.create');
    expect(txCalls).toContain('playerEquipment.findMany');
    expect(txCalls).toContain('item.create');
    expect(txCalls).toContain('playerEquipment.upsert');
    expect(txCalls).toContain('account.update');

    // Verify the response
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('cleans up expired refresh tokens before storing a registration refresh token', async () => {
    setupSuccessfulRegisterState();

    const req = {
      body: {
        username: 'Rook',
        email: 'rook@example.com',
        password: 'supersecure',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/register');
    await handler(req, res, next);

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        accountId: 'account-1',
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        accountId: 'account-1',
        tokenHash: 'hashed:refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows registration when the username only exists in a seasonal realm', async () => {
    mockPrisma.account.findUnique.mockResolvedValue(null);
    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'starter-town' });
    mockPrisma.zoneConnection.findFirst.mockResolvedValue({
      toZone: { id: 'forest-edge' },
    });
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: STARTER_LOADOUT.tutorialOffHandTemplateId,
      maxDurability: 40,
    });

    const txCalls = setupSuccessfulRegisterState();
    const req = {
      body: {
        username: 'Rook',
        email: 'rook@example.com',
        password: 'supersecure',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/register');
    await handler(req, res, next);

    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({
      where: {
        username: 'Rook',
        seasonId: null,
      },
      select: { id: true },
    });
    expect(txCalls).toContain('player.create');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('POST /login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
  });

  it('cleans up expired refresh tokens before storing a new login refresh token', async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      emailVerified: true,
      activePlayer: {
        id: 'player-1',
        username: 'Rook',
        seasonId: null,
        isBot: false,
      },
      players: [],
    });
    mockPrisma.account.update.mockResolvedValue({});
    (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const req = {
      body: {
        email: 'rook@example.com',
        password: 'supersecure',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/login');
    await handler(req, res, next);

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        accountId: 'account-1',
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        accountId: 'account-1',
        tokenHash: 'hashed:refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('triggers world event catch-up after successful login', async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      emailVerified: true,
      activePlayer: {
        id: 'player-1',
        username: 'Rook',
        seasonId: null,
        isBot: false,
      },
      players: [],
    });
    mockPrisma.account.update.mockResolvedValue({});
    (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const req = {
      body: {
        email: 'rook@example.com',
        password: 'supersecure',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/login');
    await handler(req, res, next);

    expect(checkAndSpawnEvents).toHaveBeenCalledTimes(1);
    expect(checkAndSpawnEvents).toHaveBeenCalledWith(null);
    expect(next).not.toHaveBeenCalled();
  });

  it('repairs missing activePlayerId by falling back to the first account character after password validation', async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      emailVerified: true,
      activePlayer: null,
      players: [
        {
          id: 'player-fallback',
          username: 'Rook',
          seasonId: null,
          isBot: false,
        },
      ],
      isPremium: false,
      premiumExpiresAt: null,
    });
    mockPrisma.account.update.mockResolvedValue({});
    (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const req = {
      body: {
        email: 'rook@example.com',
        password: 'supersecure',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/login');
    await handler(req, res, next);

    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: {
        lastActiveAt: expect.any(Date),
        activePlayerId: 'player-fallback',
      },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      player: expect.objectContaining({ id: 'player-fallback', username: 'Rook' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('does not trigger world event catch-up when login fails', async () => {
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      emailVerified: true,
      activePlayer: {
        id: 'player-1',
        username: 'Rook',
        seasonId: null,
        isBot: false,
      },
      players: [],
    });
    (bcrypt.compare as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const req = {
      body: {
        email: 'rook@example.com',
        password: 'wrong-password',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/login');
    await handler(req, res, next);

    expect(checkAndSpawnEvents).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('POST /refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
  });

  it('extends refresh token rotation transaction with expired-token cleanup', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: null,
      role: 'player',
    });
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      role: 'player',
    });
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      seasonId: null,
    });
    mockPrisma.account.update.mockResolvedValue({});

    const req = {
      body: {
        refreshToken: 'old-refresh-token',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/refresh');
    await handler(req, res, next);

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        tokenHash: 'hashed:old-refresh-token',
        accountId: 'account-1',
        expiresAt: { gte: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        accountId: 'account-1',
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        accountId: 'account-1',
        tokenHash: 'hashed:refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects refresh rotation when the stored refresh token was already consumed', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: null,
      role: 'player',
    });
    mockPrisma.refreshToken.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      role: 'player',
    });
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      seasonId: null,
    });

    const req = {
      body: {
        refreshToken: 'old-refresh-token',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/refresh');
    await handler(req, res, next);

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        tokenHash: 'hashed:old-refresh-token',
        accountId: 'account-1',
        expiresAt: { gte: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('triggers world event catch-up after a successful refresh', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: null,
      role: 'player',
    });
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      role: 'player',
    });
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      seasonId: null,
    });
    mockPrisma.account.update.mockResolvedValue({});

    const req = {
      body: {
        refreshToken: 'old-refresh-token',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/refresh');
    await handler(req, res, next);

    expect(checkAndSpawnEvents).toHaveBeenCalledTimes(1);
    expect(checkAndSpawnEvents).toHaveBeenCalledWith(null);
    expect(next).not.toHaveBeenCalled();
  });

  it('refreshes against the token player instead of the account active player', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accountId: 'account-1',
      playerId: 'player-seasonal',
      username: 'RookSeasonal',
      seasonId: 'season-1',
      role: 'player',
    });
    mockPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      role: 'player',
    });
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 'player-seasonal',
      username: 'RookSeasonal',
      seasonId: 'season-1',
    });
    mockPrisma.account.update.mockResolvedValue({});

    const req = {
      body: {
        refreshToken: 'old-refresh-token',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/refresh');
    await handler(req, res, next);

    expect(mockPrisma.player.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'player-seasonal',
        accountId: 'account-1',
        isBot: false,
      },
      select: {
        id: true,
        username: true,
        seasonId: true,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('POST /logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
  });

  it('deletes refresh tokens by hash only', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: null,
      role: 'player',
    });
    const req = {
      body: {
        refreshToken: 'refresh-token-to-revoke',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/logout');
    await handler(req, res, next);

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: 'hashed:refresh-token-to-revoke' },
    });
    expect(disconnectPlayerSockets).toHaveBeenCalledWith('player-1', 'logout');
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not disconnect sockets when the refresh token row is already gone', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: null,
      role: 'player',
    });
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const req = {
      body: {
        refreshToken: 'already-revoked-refresh-token',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/logout');
    await handler(req, res, next);

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: 'hashed:already-revoked-refresh-token' },
    });
    expect(disconnectPlayerSockets).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });
});
