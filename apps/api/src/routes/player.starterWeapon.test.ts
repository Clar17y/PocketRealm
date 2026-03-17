import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/statsService', () => ({ incrementStats: vi.fn() }));
vi.mock('../services/achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
  emitAchievementNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/equipmentService', () => ({ ensureEquipmentSlots: vi.fn() }));
vi.mock('../services/attributesService', () => ({
  allocateAttributePoints: vi.fn(),
  getPlayerProgressionState: vi.fn(),
  normalizePlayerAttributes: vi.fn((a: any) => a),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { mockPrisma } from '../__test__/setup';
import { STARTER_LOADOUT } from '@pocketrealm/shared';
import { playerRouter } from './player';

function findHandler(method: string, path: string) {
  const layer = (playerRouter as any).stack.find(
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

describe('POST /starter-weapon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and equips a melee starter weapon', async () => {
    const templateId = STARTER_LOADOUT.starterWeaponIds.melee;
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: templateId, maxDurability: 70,
    });
    mockPrisma.item.findFirst.mockResolvedValue(null);
    mockPrisma.item.create.mockResolvedValue({ id: 'item-1' });
    mockPrisma.playerEquipment.upsert.mockResolvedValue({});

    const req = { player: { playerId: 'p1' }, body: { weaponType: 'melee' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/starter-weapon');
    await handler(req, res, next);

    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'p1',
        templateId,
        rarity: 'common',
      }),
      select: { id: true },
    });
    expect(mockPrisma.playerEquipment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId_slot: { playerId: 'p1', slot: 'main_hand' } },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, itemId: 'item-1' }),
    );
  });

  it('rejects if player already claimed a starter weapon', async () => {
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'existing-item' });

    const req = { player: { playerId: 'p1' }, body: { weaponType: 'melee' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/starter-weapon');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'ALREADY_CLAIMED' }),
    );
  });

  it('rejects invalid weapon type', async () => {
    const req = { player: { playerId: 'p1' }, body: { weaponType: 'axe' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/starter-weapon');
    await handler(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
