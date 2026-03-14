import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/turnBankService', () => ({
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 5000 }),
}));
vi.mock('../services/inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue({ id: 'item-1', quantity: 10 }),
}));
vi.mock('../services/worldEventService', () => ({
  spawnWorldEvent: vi.fn(),
  getEventById: vi.fn(),
}));
vi.mock('../services/bossEncounterService', () => ({
  createBossEncounter: vi.fn().mockResolvedValue({ id: 'boss-enc-1' }),
}));
vi.mock('../services/attributesService', () => ({
  normalizePlayerAttributes: vi.fn((attrs: any) => attrs ?? { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 }),
}));
vi.mock('../services/activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));
vi.mock('@pocketrealm/game-engine', () => ({
  xpForLevel: vi.fn((lvl: number) => lvl * 100),
  characterLevelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
  rollMobPrefix: vi.fn(() => null),
  rollBonusStatsForRarity: vi.fn(() => null),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock('../middleware/admin', () => ({
  requireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { mockPrisma } from '../__test__/setup';
import { refundPlayerTurns } from '../services/turnBankService';
import { addStackableItem } from '../services/inventoryService';
import { spawnWorldEvent, getEventById } from '../services/worldEventService';
import { createBossEncounter } from '../services/bossEncounterService';
import { adminRouter } from './admin';

const mockSpawnWorldEvent = spawnWorldEvent as ReturnType<typeof vi.fn>;
const mockGetEventById = getEventById as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (adminRouter as any).stack.find(
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

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /turns/grant', () => {
    it('grants turns and returns result', async () => {
      const req = { player: { playerId: 'p1' }, body: { amount: 1000 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/turns/grant');
      await handler(req, res, vi.fn());

      expect(refundPlayerTurns).toHaveBeenCalledWith('p1', 1000);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /player/level', () => {
    it('sets player level and grants attribute points for level difference', async () => {
      mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ characterLevel: 5 });
      mockPrisma.player.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { level: 10 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/player/level');
      await handler(req, res, vi.fn());

      expect(mockPrisma.player.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          characterLevel: 10,
          attributePoints: { increment: 5 },
        }),
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, level: 10 }));
    });
  });

  describe('POST /items/grant', () => {
    it('grants stackable items via addStackableItem', async () => {
      mockPrisma.itemTemplate.findUniqueOrThrow.mockResolvedValue({
        id: 'tpl-1', stackable: true, maxDurability: 0,
      });

      const req = { player: { playerId: 'p1' }, body: { templateId: 'tpl-1', quantity: 5 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/items/grant');
      await handler(req, res, vi.fn());

      expect(addStackableItem).toHaveBeenCalledWith('p1', 'tpl-1', 5);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('creates individual items for non-stackable templates', async () => {
      mockPrisma.itemTemplate.findUniqueOrThrow.mockResolvedValue({
        id: 'tpl-2', stackable: false, maxDurability: 100,
        itemType: 'weapon', baseStats: null, slot: 'main_hand',
      });
      mockPrisma.item.create.mockResolvedValue({ id: 'item-new' });

      const req = { player: { playerId: 'p1' }, body: { templateId: 'tpl-2', rarity: 'rare', quantity: 2 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/items/grant');
      await handler(req, res, vi.fn());

      expect(mockPrisma.item.create).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /events/spawn', () => {
    it('spawns a world event from template', async () => {
      mockSpawnWorldEvent.mockResolvedValue({ id: 'evt-1', title: 'Test Event' });

      const req = {
        player: { playerId: 'p1' },
        body: { templateIndex: 0, zoneId: '00000000-0000-0000-0000-000000000001', durationHours: 2 },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/spawn');
      await handler(req, res, vi.fn());

      expect(mockSpawnWorldEvent).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 400 for invalid template index', async () => {
      const req = {
        player: { playerId: 'p1' },
        body: { templateIndex: 9999, zoneId: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/spawn');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 409 when event slot conflict', async () => {
      mockSpawnWorldEvent.mockResolvedValue(null);

      const req = {
        player: { playerId: 'p1' },
        body: { templateIndex: 0, zoneId: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/spawn');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('POST /events/:id/cancel', () => {
    it('cancels an active event', async () => {
      mockGetEventById.mockResolvedValue({ id: 'evt-1', status: 'active' });
      mockPrisma.worldEvent.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, params: { id: 'evt-1' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/:id/cancel');
      await handler(req, res, vi.fn());

      expect(mockPrisma.worldEvent.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ status: 'expired' }),
      }));
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 404 when event not found', async () => {
      mockGetEventById.mockResolvedValue(null);

      const req = { params: { id: 'not-found' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/:id/cancel');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /boss/spawn', () => {
    it('spawns a boss encounter', async () => {
      mockPrisma.mobTemplate.findUniqueOrThrow.mockResolvedValue({ id: 'mob-1', name: 'Dragon', hp: 1000, bossBaseHp: 5000 });
      mockSpawnWorldEvent.mockResolvedValue({ id: 'evt-boss' });
      mockPrisma.worldEvent.update.mockResolvedValue({});

      const req = {
        player: { playerId: 'p1' },
        body: { mobTemplateId: '00000000-0000-0000-0000-000000000001', zoneId: '00000000-0000-0000-0000-000000000002' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/boss/spawn');
      await handler(req, res, vi.fn());

      expect(createBossEncounter).toHaveBeenCalledWith('evt-boss', '00000000-0000-0000-0000-000000000001', 5000);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /zones/teleport', () => {
    it('teleports player to target zone', async () => {
      mockPrisma.zone.findUniqueOrThrow.mockResolvedValue({ id: 'z1' });
      mockPrisma.player.update.mockResolvedValue({});

      const req = {
        player: { playerId: 'p1' },
        body: { zoneId: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/zones/teleport');
      await handler(req, res, vi.fn());

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { currentZoneId: '00000000-0000-0000-0000-000000000001' },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, zoneId: '00000000-0000-0000-0000-000000000001' });
    });
  });

  describe('POST /zones/discover-all', () => {
    it('upserts discovery for all zones', async () => {
      mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1' }, { id: 'z2' }, { id: 'z3' }]);
      mockPrisma.$transaction.mockResolvedValue([]);

      const req = { player: { playerId: 'p1' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/zones/discover-all');
      await handler(req, res, vi.fn());

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, discoveredCount: 3 });
    });
  });

  describe('POST /encounter/spawn', () => {
    it('creates an encounter site with mobs', async () => {
      mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValue({
        id: 'fam-1', name: 'Wolves', siteNounSmall: 'Den', siteNounMedium: 'Lair', siteNounLarge: 'Cavern',
        members: [{ mobTemplate: { id: 'mob-1' } }],
      });
      mockPrisma.encounterSite.create.mockResolvedValue({ id: 'site-1' });

      const req = {
        player: { playerId: 'p1' },
        body: { mobFamilyId: '00000000-0000-0000-0000-000000000001', zoneId: '00000000-0000-0000-0000-000000000002', size: 'small' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/encounter/spawn');
      await handler(req, res, vi.fn());

      expect(mockPrisma.encounterSite.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 400 when mob family has no members', async () => {
      mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValue({
        id: 'fam-1', name: 'Empty', siteNounSmall: 'Den', siteNounMedium: 'Lair', siteNounLarge: 'Cavern',
        members: [],
      });

      const req = {
        player: { playerId: 'p1' },
        body: { mobFamilyId: '00000000-0000-0000-0000-000000000001', zoneId: '00000000-0000-0000-0000-000000000002', size: 'small' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/encounter/spawn');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /resource-nodes/spawn', () => {
    it('creates a player resource node with explicit capacity', async () => {
      mockPrisma.resourceNode.findUniqueOrThrow.mockResolvedValue({
        id: 'rn-1', resourceType: 'iron_ore', minCapacity: 10, maxCapacity: 50,
      });
      mockPrisma.playerResourceNode.create.mockResolvedValue({ id: 'prn-1' });

      const req = {
        player: { playerId: 'p1' },
        body: { resourceNodeId: '00000000-0000-0000-0000-000000000001', capacity: 30 },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/resource-nodes/spawn');
      await handler(req, res, vi.fn());

      expect(mockPrisma.playerResourceNode.create).toHaveBeenCalledWith({
        data: {
          playerId: 'p1',
          resourceNodeId: '00000000-0000-0000-0000-000000000001',
          remainingCapacity: 30,
          decayedCapacity: 0,
        },
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true, resourceType: 'iron_ore', capacity: 30,
      }));
    });
  });
});
