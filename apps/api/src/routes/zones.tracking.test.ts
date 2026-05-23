import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../services/zoneDiscoveryService', () => ({
  ensureStarterDiscoveries: vi.fn().mockResolvedValue(undefined),
  getDiscoveredZoneIds: vi.fn().mockResolvedValue(new Set(['zone-forest'])),
}));
vi.mock('../services/staticDataCacheService', () => ({
  getCachedZones: vi.fn().mockResolvedValue([
    {
      id: 'zone-forest',
      name: 'Forest Edge',
      description: 'A starting forest',
      difficulty: 1,
      travelCost: 10,
      isStarter: false,
      zoneType: 'wild',
      zoneExitChance: 0.12,
      maxCraftingLevel: null,
      arrivalText: 'You arrive',
      ambientTexts: [],
      environmentalTexts: [],
      explorationTiers: null,
      turnsToExplore: 100,
    },
    {
      id: 'zone-town',
      name: 'Home Town',
      description: 'Safe streets',
      difficulty: 0,
      travelCost: 0,
      isStarter: true,
      zoneType: 'town',
      zoneExitChance: null,
      maxCraftingLevel: 1,
      arrivalText: 'Welcome home',
      ambientTexts: [],
      environmentalTexts: [],
      explorationTiers: null,
      turnsToExplore: null,
    },
  ]),
  getCachedZoneConnections: vi.fn().mockResolvedValue([]),
  getCachedMobTemplatesByZone: vi.fn(),
}));
vi.mock('../services/explorationTrackingService', async () => {
  const actual = await vi.importActual<typeof import('../services/explorationTrackingService')>('../services/explorationTrackingService');
  return {
    ...actual,
    buildTrackableMobFamiliesByZone: vi.fn(),
  };
});
vi.mock('../services/resourceProspectingService', async () => {
  const actual = await vi.importActual<typeof import('../services/resourceProspectingService')>('../services/resourceProspectingService');
  return {
    ...actual,
    buildProspectableResourceNodesByZone: vi.fn(),
  };
});
vi.mock('../services/zoneService', () => ({
  invalidateZoneIdCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../middleware/errorHandler', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, message: string, code: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));
vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { mockPrisma } from '../__test__/setup';
import { zonesRouter } from './zones';
import { buildTrackableMobFamiliesByZone } from '../services/explorationTrackingService';
import { buildProspectableResourceNodesByZone } from '../services/resourceProspectingService';

const mockBuildTrackableMobFamiliesByZone = buildTrackableMobFamiliesByZone as ReturnType<typeof vi.fn>;
const mockBuildProspectableResourceNodesByZone = buildProspectableResourceNodesByZone as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (zonesRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.set = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('GET /zones tracking contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-forest' });
    mockPrisma.playerZoneExploration.findMany.mockResolvedValue([]);
    mockBuildTrackableMobFamiliesByZone.mockResolvedValue(new Map([
      ['zone-forest', [{ mobFamilyId: 'family-spider', name: 'Spiders', minTier: 2 }]],
    ]));
    mockBuildProspectableResourceNodesByZone.mockResolvedValue(new Map([
      [
        'zone-forest',
        [{ resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 }],
      ],
    ]));
  });

  it('includes trackableMobFamilies and prospectableResourceNodes on discovered wild zones', async () => {
    const req = { player: { playerId: 'p1' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('get', '/');
    await handler(req, res, next);

    expect(mockBuildTrackableMobFamiliesByZone).toHaveBeenCalledWith('p1', ['zone-forest']);
    expect(mockBuildProspectableResourceNodesByZone).toHaveBeenCalledWith(['zone-forest']);

    const payload = res.json.mock.calls[0][0];
    expect(payload.zones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'zone-forest',
          discovered: true,
          trackableMobFamilies: [{ mobFamilyId: 'family-spider', name: 'Spiders', minTier: 2 }],
          prospectableResourceNodes: [
            { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
          ],
        }),
      ]),
    );
    expect(payload.zones.find((zone: { id: string }) => zone.id === 'zone-town')?.trackableMobFamilies).toBeUndefined();
    expect(payload.zones.find((zone: { id: string }) => zone.id === 'zone-town')?.prospectableResourceNodes).toBeUndefined();
  });
});
