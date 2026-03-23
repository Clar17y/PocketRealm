import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_LOADOUT } from '@pocketrealm/shared';

vi.mock('../utils/passwordValidation', () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../services/authTokenService', () => ({
  createEmailVerificationToken: vi.fn().mockResolvedValue({ rawToken: 'test-token' }),
}));

vi.mock('../services/emailService', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/lockoutService', () => ({
  recordFailedLogin: vi.fn().mockResolvedValue(undefined),
  isLockedOut: vi.fn().mockResolvedValue(false),
  clearLockout: vi.fn().mockResolvedValue(undefined),
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
    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'starter-town' });
    mockPrisma.zoneConnection.findFirst.mockResolvedValue({
      toZone: { id: 'forest-edge' },
    });
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: STARTER_LOADOUT.tutorialOffHandTemplateId,
      maxDurability: 40,
    });

    // Track calls made via the transaction client (tx)
    const txCalls: string[] = [];
    const txClient: any = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'player') return {
          create: vi.fn().mockImplementation(() => {
            txCalls.push('player.create');
            return Promise.resolve({
              id: 'player-1', username: 'Rook', email: 'rook@example.com', role: 'player',
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
        // Return no-op for any other model
        return new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) });
      },
    });

    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(txClient);
      return Promise.all(fn);
    });

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
});
