import { Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEncounterMobDisplayName } from '@pocketrealm/shared';

const databaseMocks = vi.hoisted(() => ({
  prisma: {
    player: {
      update: vi.fn(),
    },
  },
}));

const encounterSiteCombatMocks = vi.hoisted(() => ({
  autoResolveEncounterRoom: vi.fn(),
  startManualEncounterRoom: vi.fn(),
  resolveManualEncounterRound: vi.fn(),
  clearManualCombatSession: vi.fn(),
  parseEncounterMobSlot: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({
  prisma: databaseMocks.prisma,
}));

vi.mock('../../middleware/seasonGuard', () => ({
  requireActiveSeason: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../services/worldEventService', () => ({
  computeZoneModifiers: vi.fn(),
  filterEventModifiers: vi.fn(),
  getActiveEventsForZone: vi.fn(),
  getActiveWorldWideEvents: vi.fn(),
}));

vi.mock('../../services/combat/helpers', () => ({
  listEncounterSitesQuerySchema: {
    safeParse: vi.fn(),
  },
  applyEncounterSiteDecayAndPersist: vi.fn(),
}));

vi.mock('../../services/encounterSiteMobRoleService', () => ({
  buildEncounterSiteMobPreview: vi.fn(),
}));

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

beforeEach(() => {
  vi.resetAllMocks();
  databaseMocks.prisma.player.update.mockResolvedValue({});
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

describe('POST /combat/sites/:id/start-room', () => {
  it('clears the encounter lockout when manual session startup fails', async () => {
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
});
