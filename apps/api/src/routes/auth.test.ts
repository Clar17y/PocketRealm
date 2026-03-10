import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_LOADOUT } from '@pocketrealm/shared';

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
  sessionInactivityCutoff: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('../services/zoneDiscoveryService', () => ({
  ensureStarterDiscoveries: vi.fn().mockResolvedValue(undefined),
  ensureStarterEncounterAndNodes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/equipmentService', () => ({
  ensureEquipmentSlots: vi.fn().mockResolvedValue(undefined),
}));

import { mockPrisma } from '../__test__/setup';
import { ensureStarterDiscoveries, ensureStarterEncounterAndNodes } from '../services/zoneDiscoveryService';
import { ensureEquipmentSlots } from '../services/equipmentService';
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

  it('grants and equips the starter off-hand for a newly registered player', async () => {
    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'starter-town' });
    mockPrisma.zoneConnection.findFirst.mockResolvedValue({
      toZone: { id: 'forest-edge' },
    });
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: STARTER_LOADOUT.tutorialOffHandTemplateId,
      maxDurability: 40,
    });
    mockPrisma.player.create.mockResolvedValue({
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
    });
    mockPrisma.item.create.mockResolvedValue({ id: 'starter-item-1' });
    mockPrisma.playerEquipment.upsert.mockResolvedValue({});
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

    expect(mockPrisma.itemTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: STARTER_LOADOUT.tutorialOffHandTemplateId },
      select: { id: true, maxDurability: true },
    });
    expect(ensureEquipmentSlots).toHaveBeenCalledWith('player-1');
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'player-1',
        templateId: STARTER_LOADOUT.tutorialOffHandTemplateId,
        rarity: 'common',
        quantity: 1,
        maxDurability: 40,
        currentDurability: 40,
      },
      select: { id: true },
    });
    expect(mockPrisma.playerEquipment.upsert).toHaveBeenCalledWith({
      where: { playerId_slot: { playerId: 'player-1', slot: 'off_hand' } },
      create: { playerId: 'player-1', slot: 'off_hand', itemId: 'starter-item-1' },
      update: { itemId: 'starter-item-1' },
    });
    expect(ensureStarterDiscoveries).toHaveBeenCalledWith('player-1');
    expect(ensureStarterEncounterAndNodes).toHaveBeenCalledWith('player-1');
    expect(next).not.toHaveBeenCalled();
  });
});
