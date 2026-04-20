import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_LOADOUT } from '@pocketrealm/shared';

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
}));

import { mockPrisma } from '../__test__/setup';
import bcrypt from 'bcrypt';
import { verifyRefreshToken } from '../middleware/auth';
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
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

function setupSuccessfulRegisterState() {
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
      if (prop === 'player') return {
        create: vi.fn().mockImplementation(() => {
          txCalls.push('player.create');
          return Promise.resolve({
            id: 'player-1',
            username: 'Rook',
            email: 'rook@example.com',
            role: 'player',
            isPremium: false,
            premiumExpiresAt: null,
          });
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
      };
      if (prop === 'zoneConnection') return {
        findMany: vi.fn().mockImplementation(() => { txCalls.push('zoneConnection.findMany'); return Promise.resolve([]); }),
      };
      if (prop === 'playerZoneDiscovery') return {
        createMany: vi.fn().mockImplementation(() => { txCalls.push('playerZoneDiscovery.createMany'); return Promise.resolve({}); }),
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
    expect(txCalls).toContain('playerEquipment.findMany');
    expect(txCalls).toContain('item.create');
    expect(txCalls).toContain('playerEquipment.upsert');

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
        playerId: 'player-1',
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        playerId: 'player-1',
        token: 'refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
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
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      isBot: false,
      emailVerified: true,
      isPremium: false,
      premiumExpiresAt: null,
    });
    mockPrisma.player.update.mockResolvedValue({});
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
        playerId: 'player-1',
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        playerId: 'player-1',
        token: 'refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('triggers world event catch-up after successful login', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      isBot: false,
      emailVerified: true,
      isPremium: false,
      premiumExpiresAt: null,
    });
    mockPrisma.player.update.mockResolvedValue({});
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

  it('does not trigger world event catch-up when login fails', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
      passwordHash: 'stored-hash',
      isBot: false,
      emailVerified: true,
      isPremium: false,
      premiumExpiresAt: null,
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
      playerId: 'player-1',
      username: 'Rook',
      role: 'player',
    });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      token: 'old-refresh-token',
      playerId: 'player-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'player-1',
      role: 'player',
    });
    mockPrisma.player.update.mockResolvedValue({});

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
      where: { token: 'old-refresh-token' },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        playerId: 'player-1',
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        playerId: 'player-1',
        token: 'refresh-token',
        expiresAt: new Date('2026-03-10T12:00:00.000Z'),
      },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('triggers world event catch-up after a successful refresh', async () => {
    (verifyRefreshToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      playerId: 'player-1',
      username: 'Rook',
      role: 'player',
    });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      token: 'old-refresh-token',
      playerId: 'player-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'player-1',
      role: 'player',
    });
    mockPrisma.player.update.mockResolvedValue({});

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
});
