import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/turnBankService', () => ({
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 5000 }),
}));
vi.mock('../services/inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue({ itemId: 'item-1', quantity: 10, created: false }),
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
vi.mock('../services/pushNotificationService', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/premiumService', () => ({
  grantPremiumDays: vi.fn(),
  listPremiumPurchases: vi.fn(),
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
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock('../middleware/admin', () => ({
  requireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock('../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockImplementation((_playerId: string, fields: string[]) => {
    const result: Record<string, unknown> = {};
    if (fields.includes('characterProgression')) {
      result.characterProgression = { characterXp: 1000, characterLevel: 10, attributePoints: 5 };
    }
    if (fields.includes('skills')) {
      result.skills = [{ id: 's1', skillType: 'mining', level: 20, xp: 0, dailyXpGained: 0 }];
    }
    if (fields.includes('resources')) {
      result.resources = { stamina: { current: 100, max: 100, regenPerSecond: 1, lastRegenAt: new Date().toISOString() }, mana: { current: 50, max: 50, regenPerSecond: 0.5, lastRegenAt: new Date().toISOString() } };
    }
    if (fields.includes('hp')) {
      result.hp = { currentHp: 100, maxHp: 100, lastRegenAt: new Date().toISOString() };
    }
    return Promise.resolve(result);
  }),
  fetchItemDTOs: vi.fn().mockResolvedValue([]),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryCapacity: 50, inventoryUsedSlots: 10 }),
  fetchMaterialTotals: vi.fn().mockResolvedValue({}),
  buildInventoryStateUpdates: vi.fn().mockReturnValue({ inventoryUsedSlots: 10 }),
}));

import { mockPrisma } from '../__test__/setup';
import { refundPlayerTurns } from '../services/turnBankService';
import { addStackableItem } from '../services/inventoryService';
import { spawnWorldEvent, getEventById } from '../services/worldEventService';
import { createBossEncounter } from '../services/bossEncounterService';
import { buildStateUpdates } from '../services/stateUpdateHelpers';
import { grantPremiumDays, listPremiumPurchases } from '../services/premiumService';
import { roundTimerRegistry } from '../services/roundTimerRegistry';
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
    mockPrisma.activityLog.create.mockResolvedValue({ id: 'log-1' });
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
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, level: 10, stateUpdates: expect.any(Object) }));
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
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, stateUpdates: expect.any(Object) }));
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
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, stateUpdates: expect.any(Object) }));
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

    it('expires the related boss encounter and cancels its timer when cancelling a boss event', async () => {
      mockGetEventById.mockResolvedValue({ id: 'evt-boss', status: 'active', type: 'boss', title: 'Boss' });
      mockPrisma.worldEvent.update.mockResolvedValue({});
      mockPrisma.bossEncounter.findUnique.mockResolvedValue({
        id: 'enc-1',
        status: 'waiting',
      });
      mockPrisma.bossEncounter.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, params: { id: 'evt-boss' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/:id/cancel');
      await handler(req, res, vi.fn());

      expect(mockPrisma.bossEncounter.findUnique).toHaveBeenCalledWith({
        where: { eventId: 'evt-boss' },
        select: { id: true, status: true },
      });
      expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
        where: { eventId: 'evt-boss' },
        data: {
          status: 'expired',
          nextRoundAt: null,
        },
      });
      expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('bossEncounter', 'enc-1');
    });
  });

  describe('POST /boss/spawn', () => {
    it('spawns a boss encounter', async () => {
      mockPrisma.mobTemplate.findUniqueOrThrow.mockResolvedValue({ id: 'mob-1', name: 'Dragon', hp: 1000, bossBaseHp: 5000 });
      mockSpawnWorldEvent.mockResolvedValue({ id: 'evt-boss' });
      mockPrisma.worldEvent.update.mockResolvedValue({});
      mockPrisma.zone.findUnique.mockResolvedValue({ name: 'Test Zone' });
      mockPrisma.pushSubscription.findMany.mockResolvedValue([]);

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

  describe('GET /scheduler-status', () => {
    it('returns registry size and DB counts', async () => {
      mockPrisma.bossEncounter.count.mockResolvedValue(1);
      mockPrisma.guildExpedition.count.mockResolvedValue(2);
      (roundTimerRegistry.size as unknown as ReturnType<typeof vi.fn>).mockReturnValue(3);
      (roundTimerRegistry.keys as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        'bossEncounter:enc-1',
        'guildExpedition:exp-1',
        'guildExpedition:exp-2',
      ]);

      const req = { player: { playerId: 'p1' } } as any;
      const res = mockRes();
      const handler = findHandler('get', '/scheduler-status');
      await handler(req, res, vi.fn());

      expect(mockPrisma.bossEncounter.count).toHaveBeenCalledWith({
        where: { status: 'in_progress', nextRoundAt: { not: null } },
      });
      expect(mockPrisma.guildExpedition.count).toHaveBeenCalledWith({
        where: {
          status: { in: ['recruiting', 'in_progress'] },
          nextRoundAt: { not: null },
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        pendingTimers: 3,
        timerKeys: ['bossEncounter:enc-1', 'guildExpedition:exp-1', 'guildExpedition:exp-2'],
        pendingBossEncounters: 1,
        pendingGuildExpeditions: 2,
        pendingEnumeratedFromDb: 3,
        hasDrift: false,
      });
    });

    it('reports drift when registry disagrees with DB counts', async () => {
      mockPrisma.bossEncounter.count.mockResolvedValue(1);
      mockPrisma.guildExpedition.count.mockResolvedValue(1);
      (roundTimerRegistry.size as unknown as ReturnType<typeof vi.fn>).mockReturnValue(0);
      (roundTimerRegistry.keys as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const req = { player: { playerId: 'p1' } } as any;
      const res = mockRes();
      const handler = findHandler('get', '/scheduler-status');
      await handler(req, res, vi.fn());

      expect(res.json).toHaveBeenCalledWith({
        pendingTimers: 0,
        timerKeys: [],
        pendingBossEncounters: 1,
        pendingGuildExpeditions: 1,
        pendingEnumeratedFromDb: 2,
        hasDrift: true,
      });
    });
  });

  describe('GET /premium/purchases/:playerId', () => {
    it('returns premium purchases for the requested player', async () => {
      vi.mocked(listPremiumPurchases).mockResolvedValue([
        { id: 'purchase-1', playerId: 'player-target' },
      ] as never);

      const req = {
        player: { playerId: 'admin-1' },
        params: { playerId: 'player-target' },
      } as any;
      const res = mockRes();
      const handler = findHandler('get', '/premium/purchases/:playerId');
      await handler(req, res, vi.fn());

      expect(listPremiumPurchases).toHaveBeenCalledWith('player-target');
      expect(res.json).toHaveBeenCalledWith({
        purchases: [{ id: 'purchase-1', playerId: 'player-target' }],
      });
    });
  });

  describe('POST /premium/grant', () => {
    it('grants premium days through the shared premium service', async () => {
      vi.mocked(grantPremiumDays).mockResolvedValue({
        id: 'purchase-2',
        playerId: 'player-target',
        championDaysGranted: 14,
      } as never);

      const req = {
        player: { playerId: 'admin-1' },
        body: {
          playerId: 'player-target',
          days: 14,
          reason: 'Support recovery',
        },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/premium/grant');
      await handler(req, res, vi.fn());

      expect(grantPremiumDays).toHaveBeenCalledWith({
        playerId: 'player-target',
        provider: 'admin',
        productType: 'admin_grant',
        amount: 0,
        currency: 'usd',
        days: 14,
        metadata: {
          grantedByAdminId: 'admin-1',
          reason: 'Support recovery',
        },
      }, mockPrisma);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          playerId: 'admin-1',
          activityType: 'admin_action',
          turnsSpent: 0,
          result: {
            action: 'grant_premium',
            targetPlayerId: 'player-target',
            days: 14,
            purchaseId: 'purchase-2',
            reason: 'Support recovery',
          },
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        purchase: {
          id: 'purchase-2',
          playerId: 'player-target',
          championDaysGranted: 14,
        },
      });
    });

    it('surfaces an audit failure without writing a success response', async () => {
      vi.mocked(grantPremiumDays).mockResolvedValue({
        id: 'purchase-3',
        playerId: 'player-target',
      } as never);
      mockPrisma.activityLog.create.mockRejectedValueOnce(new Error('audit write failed'));

      const req = {
        player: { playerId: 'admin-1' },
        body: {
          playerId: 'player-target',
          days: 7,
        },
      } as any;
      const res = mockRes();
      const next = vi.fn();
      const handler = findHandler('post', '/premium/grant');
      await handler(req, res, next);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(grantPremiumDays).toHaveBeenCalledWith({
        playerId: 'player-target',
        provider: 'admin',
        productType: 'admin_grant',
        amount: 0,
        currency: 'usd',
        days: 7,
        metadata: {
          grantedByAdminId: 'admin-1',
        },
      }, mockPrisma);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
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
      expect(res.json).toHaveBeenCalledWith({ success: true, zoneId: '00000000-0000-0000-0000-000000000001', stateUpdates: { currentZoneId: '00000000-0000-0000-0000-000000000001' } });
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

  describe('POST /player/xp', () => {
    it('grants XP and returns stateUpdates with characterProgression', async () => {
      mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ characterXp: BigInt(500), characterLevel: 5 });
      mockPrisma.player.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { amount: 500 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/player/xp');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['characterProgression']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stateUpdates: expect.any(Object),
      }));
    });
  });

  describe('POST /set-skill-level', () => {
    it('sets skill level and returns stateUpdates with skills and resources', async () => {
      mockPrisma.playerSkill.upsert.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { skillType: 'mining', level: 20 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/set-skill-level');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['skills', 'resources']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stateUpdates: expect.objectContaining({
          skills: expect.any(Array),
          resources: expect.any(Object),
        }),
      }));
    });
  });

  describe('POST /set-skill-levels', () => {
    it('sets multiple skill levels and returns stateUpdates', async () => {
      mockPrisma.$transaction.mockResolvedValue([]);

      const req = { player: { playerId: 'p1' }, body: { skillTypes: ['melee', 'ranged'], level: 15 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/set-skill-levels');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['skills', 'resources']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stateUpdates: expect.objectContaining({
          skills: expect.any(Array),
          resources: expect.any(Object),
        }),
      }));
    });
  });

  describe('POST /player/attributes', () => {
    it('sets attributes and returns stateUpdates with hp, resources, and characterProgression', async () => {
      mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ attributes: null, attributePoints: 5 });
      mockPrisma.player.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { attributes: { vitality: 10, strength: 10, dexterity: 5, intelligence: 5, luck: 5, evasion: 5 } } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/player/attributes');
      await handler(req, res, vi.fn());

      expect(buildStateUpdates).toHaveBeenCalledWith('p1', ['hp', 'resources', 'characterProgression']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stateUpdates: expect.objectContaining({
          hp: expect.any(Object),
          resources: expect.any(Object),
          characterProgression: expect.objectContaining({ attributePoints: expect.any(Number) }),
        }),
      }));
    });
  });
});
