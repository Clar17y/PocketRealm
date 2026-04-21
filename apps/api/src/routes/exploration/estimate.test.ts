import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));
vi.mock('../../services/guildTaxService', () => ({
  getPlayerTaxRate: vi.fn().mockResolvedValue({ taxRate: 0 }),
  calculateEffectiveTurns: vi.fn((turns: number) => turns),
}));
vi.mock('../../services/worldEventService', () => ({
  getActiveZoneModifiers: vi.fn().mockResolvedValue({ mobSpawnRateMultiplier: 1 }),
}));
vi.mock('@pocketrealm/game-engine', () => ({
  estimateExploration: vi.fn().mockReturnValue({
    turns: 100,
    ambushChance: 0,
    encounterSiteChance: 0,
    resourceNodeChance: 0,
    hiddenCacheChance: 0,
    zoneExitChance: 0,
    expectedAmbushes: 0,
    expectedEncounterSites: 0,
  }),
  validateExplorationTurns: vi.fn().mockReturnValue({ valid: true }),
}));

import { mockPrisma } from '../../__test__/setup';
import { estimateRouter } from './estimate';
import { estimateExploration } from '@pocketrealm/game-engine';
import { EXPLORATION_CONSTANTS } from '@pocketrealm/shared';

const mockEstimateExploration = estimateExploration as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (estimateRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`Handler not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  return {
    json: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.zone.findUnique.mockResolvedValue({
    zoneExitChance: 0.01,
  });
  mockPrisma.player.findUnique.mockResolvedValue({
    account: {
      isPremium: true,
      premiumExpiresAt: new Date('2026-06-02T00:00:00.000Z'),
    },
  });
});

describe('GET /exploration/estimate', () => {
  it('passes Champion-adjusted hidden cache chance into estimateExploration for premium players', async () => {
    const req = {
      player: { playerId: 'p1', username: 'TestPlayer' },
      query: { turns: '100', zoneId: '11111111-1111-1111-1111-111111111111' },
    } as any;
    const res = mockRes();
    const handler = findHandler('get', '/estimate');

    await handler(req, res, vi.fn());

    expect(mockEstimateExploration).toHaveBeenCalledWith(
      100,
      0.01,
      1,
      EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE * 1.1,
    );
  });
});
