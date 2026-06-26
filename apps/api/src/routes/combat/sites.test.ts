import { Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEncounterMobDisplayName } from '@pocketrealm/shared';

const databaseMocks = vi.hoisted(() => ({
  prisma: {
    encounterSite: {
      findMany: vi.fn(),
    },
    mobTemplate: {
      findMany: vi.fn(),
    },
    player: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const combatHelperMocks = vi.hoisted(() => ({
  listEncounterSitesQuerySchema: {
    safeParse: vi.fn(),
  },
  applyEncounterSiteDecayInMemory: vi.fn(),
  applyEncounterSiteDecayAndPersist: vi.fn(),
  countEncounterSiteState: vi.fn(),
  parseEncounterSiteMobs: vi.fn(),
}));

const encounterSiteCombatMocks = vi.hoisted(() => ({
  autoResolveEncounterRoom: vi.fn(),
  startManualEncounterRoom: vi.fn(),
  resolveManualEncounterRound: vi.fn(),
  clearManualCombatSession: vi.fn(),
  isManualCombatSessionPersistenceError: vi.fn(),
  parseEncounterMobSlot: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({
  prisma: databaseMocks.prisma,
}));

vi.mock('../../middleware/seasonGuard', () => ({
  requireActiveSeason: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

const worldEventMocks = vi.hoisted(() => ({
  computeZoneModifiers: vi.fn(),
  filterEventModifiers: vi.fn(),
  getActiveEventsForZone: vi.fn(),
  getActiveWorldWideEvents: vi.fn(),
}));

vi.mock('../../services/worldEventService', () => worldEventMocks);

vi.mock('../../services/combat/helpers', () => combatHelperMocks);

const encounterSiteMobRoleMocks = vi.hoisted(() => ({
  buildEncounterSiteMobPreview: vi.fn(),
}));

vi.mock('../../services/encounterSiteMobRoleService', () => encounterSiteMobRoleMocks);

vi.mock('../../services/encounterSiteCombatService', () => encounterSiteCombatMocks);

vi.mock('../../services/stateUpdateHelpers.js', () => ({
  buildStateUpdates: vi.fn(),
  mergeLootIntoStateUpdates: vi.fn(),
}));

import { registerSiteRoutes } from './sites';

type TestHandler = (req: unknown, res: unknown, next: unknown) => void | Promise<void>;
type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: TestHandler }>;
  };
};

function findHandler(router: Router, method: string, path: string) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find(
    (l) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer?.route) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res = {} as {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const playerId = 'player-1';
const millbrookZoneId = '10000000-0000-4000-8000-000000000001';
const forestZoneId = '10000000-0000-4000-8000-000000000002';
const thornwallZoneId = '10000000-0000-4000-8000-000000000003';
const wolfFamilyId = '20000000-0000-4000-8000-000000000001';
const spiderFamilyId = '20000000-0000-4000-8000-000000000002';
const wolfMobTemplateId = '30000000-0000-4000-8000-000000000001';
const spiderMobTemplateId = '30000000-0000-4000-8000-000000000002';

type EncounterSiteFindManyArgs = {
  where?: {
    playerId?: string;
    zoneId?: string;
    mobFamilyId?: string;
  };
};

type EncounterSiteRow = {
  id: string;
  playerId: string;
  zoneId: string;
  mobFamilyId: string;
  name: string;
  size: string;
  discoveredAt: Date;
  mobs: unknown;
  currentRoom: number;
  totalRooms: number;
  zone: { name: string };
  mobFamily: { id: string; name: string };
};

function buildEncounterSiteRow(overrides: Partial<EncounterSiteRow>): EncounterSiteRow {
  return {
    id: 'site-1',
    playerId,
    zoneId: forestZoneId,
    mobFamilyId: wolfFamilyId,
    name: 'Wolf Den',
    size: 'large',
    discoveredAt: new Date('2026-05-19T22:06:32.628Z'),
    mobs: {
      mobs: [{
        slot: 1,
        mobTemplateId: wolfMobTemplateId,
        role: 'trash',
        prefix: null,
        status: 'alive',
        room: 1,
      }],
    },
    currentRoom: 1,
    totalRooms: 1,
    zone: { name: 'Forest Edge' },
    mobFamily: { id: wolfFamilyId, name: 'Wolves' },
    ...overrides,
  };
}

function mockEncounterSiteRows(rows: EncounterSiteRow[]) {
  databaseMocks.prisma.encounterSite.findMany.mockImplementation(async (args: EncounterSiteFindManyArgs) => {
    const where = args.where ?? {};
    return rows.filter((row) => (
      (!where.playerId || row.playerId === where.playerId) &&
      (!where.zoneId || row.zoneId === where.zoneId) &&
      (!where.mobFamilyId || row.mobFamilyId === where.mobFamilyId)
    ));
  });
}

function mockSiteDecay(mobTemplateIdBySiteId: Map<string, string>) {
  combatHelperMocks.applyEncounterSiteDecayAndPersist.mockImplementation(async ({ id }: { id: string }) => {
    const mobTemplateId = mobTemplateIdBySiteId.get(id) ?? wolfMobTemplateId;
    return {
      mobs: [{
        slot: 1,
        mobTemplateId,
        role: 'trash',
        prefix: null,
        status: 'alive',
        room: 1,
      }],
      state: {
        total: 1,
        alive: 1,
        defeated: 0,
        decayed: 0,
      },
      nextMob: {
        mobTemplateId,
        role: 'trash',
        prefix: null,
      },
    };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  databaseMocks.prisma.player.findUnique.mockResolvedValue({
    currentZoneId: millbrookZoneId,
    currentZone: { id: millbrookZoneId, name: 'Millbrook' },
  });
  databaseMocks.prisma.player.update.mockResolvedValue({});
  databaseMocks.prisma.mobTemplate.findMany.mockResolvedValue([
    { id: wolfMobTemplateId, name: 'Wolf', hp: 22 },
    { id: spiderMobTemplateId, name: 'Spider', hp: 18 },
  ]);
  combatHelperMocks.parseEncounterSiteMobs.mockImplementation((raw: { mobs?: unknown[] } | null | undefined) => (
    Array.isArray(raw?.mobs) ? raw.mobs : []
  ));
  combatHelperMocks.applyEncounterSiteDecayInMemory.mockImplementation((mobs: unknown[]) => ({
    mobs,
    changed: false,
  }));
  combatHelperMocks.countEncounterSiteState.mockImplementation((mobs: Array<{ status?: string }>) => ({
    total: mobs.length,
    alive: mobs.filter((mob) => mob.status === 'alive').length,
    defeated: mobs.filter((mob) => mob.status === 'defeated').length,
    decayed: mobs.filter((mob) => mob.status === 'decayed').length,
  }));
  worldEventMocks.getActiveWorldWideEvents.mockResolvedValue([]);
  worldEventMocks.getActiveEventsForZone.mockResolvedValue([]);
  worldEventMocks.filterEventModifiers.mockReturnValue([]);
  worldEventMocks.computeZoneModifiers.mockReturnValue({ mobHpMultiplier: 1 });
  encounterSiteMobRoleMocks.buildEncounterSiteMobPreview.mockImplementation((
    mob: { slot: number; role: string; prefix: string | null },
    template: { name?: string; hp?: number } | undefined,
  ) => ({
    slot: mob.slot,
    name: template?.name ?? 'Unknown',
    prefix: mob.prefix,
    role: mob.role,
    hp: template?.hp ?? 1,
    maxHp: template?.hp ?? 1,
  }));
  encounterSiteCombatMocks.isManualCombatSessionPersistenceError.mockReturnValue(false);
});

describe('encounter site route helpers', () => {
  it('includes promoted roles in encounter-site mob display names', () => {
    expect(formatEncounterMobDisplayName({
      name: 'Web Spinner',
      prefix: 'gigantic',
      role: 'mini_boss',
    })).toBe('Gigantic Mini-Boss Web Spinner');
  });
});

describe('GET /combat/sites', () => {
  it('keeps other discovered zones available when the current-zone filter has no matches', async () => {
    const router = Router();
    registerSiteRoutes(router);
    const forestSite = buildEncounterSiteRow({ id: 'site-forest' });
    mockEncounterSiteRows([forestSite]);
    combatHelperMocks.listEncounterSitesQuerySchema.safeParse.mockReturnValue({
      success: true,
      data: {
        zoneId: millbrookZoneId,
        sort: 'danger',
        page: 1,
        pageSize: 8,
      },
    });

    const req = {
      query: { zoneId: millbrookZoneId },
      player: { playerId, username: 'Tester' },
    };
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler(router, 'get', '/sites');
    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      encounterSites: [],
      pagination: expect.objectContaining({
        total: 0,
      }),
      filters: {
        zones: [
          { id: forestZoneId, name: 'Forest Edge' },
          { id: millbrookZoneId, name: 'Millbrook' },
        ],
        mobFamilies: [
          { id: wolfFamilyId, name: 'Wolves' },
        ],
      },
    }));
    expect(combatHelperMocks.applyEncounterSiteDecayAndPersist).not.toHaveBeenCalled();
  });

  it('does not add an inactive non-current selected zone to filter metadata', async () => {
    const router = Router();
    registerSiteRoutes(router);
    const forestSite = buildEncounterSiteRow({ id: 'site-forest' });
    mockEncounterSiteRows([forestSite]);
    combatHelperMocks.listEncounterSitesQuerySchema.safeParse.mockReturnValue({
      success: true,
      data: {
        zoneId: thornwallZoneId,
        sort: 'danger',
        page: 1,
        pageSize: 8,
      },
    });

    const req = {
      query: { zoneId: thornwallZoneId },
      player: { playerId, username: 'Tester' },
    };
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler(router, 'get', '/sites');
    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      encounterSites: [],
      filters: expect.objectContaining({
        zones: [
          { id: forestZoneId, name: 'Forest Edge' },
        ],
      }),
    }));
  });

  it('filters encounter-site results to the selected zone while retaining all discovered zone filters', async () => {
    const router = Router();
    registerSiteRoutes(router);
    const millbrookSite = buildEncounterSiteRow({
      id: 'site-millbrook',
      zoneId: millbrookZoneId,
      name: 'Spider Cellar',
      mobFamilyId: spiderFamilyId,
      zone: { name: 'Millbrook' },
      mobFamily: { id: spiderFamilyId, name: 'Spiders' },
      discoveredAt: new Date('2026-05-20T22:06:32.628Z'),
    });
    const forestSite = buildEncounterSiteRow({ id: 'site-forest' });
    mockEncounterSiteRows([millbrookSite, forestSite]);
    mockSiteDecay(new Map([
      [millbrookSite.id, spiderMobTemplateId],
      [forestSite.id, wolfMobTemplateId],
    ]));
    combatHelperMocks.listEncounterSitesQuerySchema.safeParse.mockReturnValue({
      success: true,
      data: {
        zoneId: millbrookZoneId,
        sort: 'danger',
        page: 1,
        pageSize: 8,
      },
    });

    const req = {
      query: { zoneId: millbrookZoneId },
      player: { playerId, username: 'Tester' },
    };
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler(router, 'get', '/sites');
    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      encounterSites: [
        expect.objectContaining({
          encounterSiteId: millbrookSite.id,
          zoneId: millbrookZoneId,
          siteName: 'Spider Cellar',
        }),
      ],
      pagination: expect.objectContaining({
        total: 1,
      }),
      filters: {
        zones: [
          { id: forestZoneId, name: 'Forest Edge' },
          { id: millbrookZoneId, name: 'Millbrook' },
        ],
        mobFamilies: [
          { id: spiderFamilyId, name: 'Spiders' },
          { id: wolfFamilyId, name: 'Wolves' },
        ],
      },
    }));
  });

  it('returns other-zone sites with scoped pagination after the zone filter changes', async () => {
    const router = Router();
    registerSiteRoutes(router);
    const millbrookSite = buildEncounterSiteRow({
      id: 'site-millbrook',
      zoneId: millbrookZoneId,
      name: 'Spider Cellar',
      mobFamilyId: spiderFamilyId,
      zone: { name: 'Millbrook' },
      mobFamily: { id: spiderFamilyId, name: 'Spiders' },
      discoveredAt: new Date('2026-05-20T22:06:32.628Z'),
    });
    const forestSite = buildEncounterSiteRow({ id: 'site-forest' });
    mockEncounterSiteRows([millbrookSite, forestSite]);
    mockSiteDecay(new Map([
      [millbrookSite.id, spiderMobTemplateId],
      [forestSite.id, wolfMobTemplateId],
    ]));
    combatHelperMocks.listEncounterSitesQuerySchema.safeParse.mockReturnValue({
      success: true,
      data: {
        zoneId: forestZoneId,
        sort: 'danger',
        page: 1,
        pageSize: 8,
      },
    });

    const req = {
      query: { zoneId: forestZoneId },
      player: { playerId, username: 'Tester' },
    };
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler(router, 'get', '/sites');
    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      encounterSites: [
        expect.objectContaining({
          encounterSiteId: forestSite.id,
          zoneId: forestZoneId,
          siteName: 'Wolf Den',
        }),
      ],
      pagination: expect.objectContaining({
        total: 1,
      }),
      filters: {
        zones: [
          { id: forestZoneId, name: 'Forest Edge' },
          { id: millbrookZoneId, name: 'Millbrook' },
        ],
        mobFamilies: [
          { id: spiderFamilyId, name: 'Spiders' },
          { id: wolfFamilyId, name: 'Wolves' },
        ],
      },
    }));
  });
});

describe('POST /combat/sites/:id/start-room', () => {
  it('clears the encounter lockout when manual session startup fails', async () => {
    const router = Router();
    registerSiteRoutes(router);
    const siteId = '8d0b93ac-3f3b-4de9-8cef-ea7066a12261';
    const error = new Error('Combat session storage is unavailable. Try again shortly.');
    encounterSiteCombatMocks.startManualEncounterRoom.mockRejectedValueOnce(error);
    encounterSiteCombatMocks.isManualCombatSessionPersistenceError.mockReturnValueOnce(true);

    const req = {
      params: { id: siteId },
      player: { playerId: 'player-1', username: 'Tester' },
      body: {},
    };
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler(router, 'post', '/sites/:id/start-room');
    await handler(req, res, next);

    expect(databaseMocks.prisma.player.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'player-1' },
      data: { activeEncounterSiteId: siteId },
    });
    expect(databaseMocks.prisma.player.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'player-1' },
      data: { activeEncounterSiteId: null },
    });
    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('preserves the encounter lockout when manual session startup fails before persistence', async () => {
    const router = Router();
    registerSiteRoutes(router);
    const siteId = '8d0b93ac-3f3b-4de9-8cef-ea7066a12261';
    const error = new Error('Combat session storage is unavailable. Try again shortly.');
    encounterSiteCombatMocks.startManualEncounterRoom.mockRejectedValueOnce(error);

    const req = {
      params: { id: siteId },
      player: { playerId: 'player-1', username: 'Tester' },
      body: {},
    };
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler(router, 'post', '/sites/:id/start-room');
    await handler(req, res, next);

    expect(databaseMocks.prisma.player.update).toHaveBeenCalledTimes(1);
    expect(databaseMocks.prisma.player.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { activeEncounterSiteId: siteId },
    });
    expect(encounterSiteCombatMocks.isManualCombatSessionPersistenceError).toHaveBeenCalledWith(error);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
