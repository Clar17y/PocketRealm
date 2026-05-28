import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/equipmentService', () => ({ ensureEquipmentSlots: vi.fn() }));
vi.mock('../services/attributesService', () => ({
  allocateAttributePoints: vi.fn(),
  getPlayerProgressionState: vi.fn(),
  normalizePlayerAttributes: vi.fn((a: unknown) => a),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

import { mockPrisma } from '../__test__/setup';
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

function buildPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    username: 'Player',
    accountId: 'account-1',
    seasonId: 'season-1',
    createdAt: new Date('2026-05-28T12:00:00.000Z'),
    lastActiveAt: new Date('2026-05-28T12:00:00.000Z'),
    characterXp: 0n,
    characterLevel: 1,
    attributePoints: 0,
    attributes: {},
    tutorialStep: 0,
    combatLogSpeedMs: 300,
    explorationSpeedMs: 300,
    autoSkipKnownCombat: false,
    defaultExploreTurns: 10,
    quickRestHealPercent: 50,
    defaultRefiningMax: false,
    lowHpWarning: true,
    confirmRarity: 'none',
    lootRevealRarity: 'none',
    forgeConfirmRarity: 'none',
    showNpcDialogue: true,
    showItemFlavourText: true,
    showBestiaryLore: true,
    activeTitle: null,
    gold: 0,
    homeTownId: 'town-1',
    currentZoneId: 'town-1',
    activeEncounterSiteId: 'site-1',
    notifyPvpAttack: true,
    notifyPvpScout: true,
    notifyBossAppeared: true,
    notifyBossKilled: true,
    notifyTurnBankFull: true,
    notifyExpeditionStarted: true,
    notifyExpeditionFinished: true,
    account: {
      email: 'player@example.com',
      role: 'player',
      emailVerified: true,
      isPremium: false,
      premiumExpiresAt: null,
    },
    ...overrides,
  };
}

describe('GET /player active encounter site lockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears stale active encounter site ids before returning the player payload', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(buildPlayer());
    mockPrisma.encounterSite.findFirst.mockResolvedValue({ zoneId: 'forest-1' });

    const req = { player: { playerId: 'p1' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('get', '/');
    await handler(req, res, next);

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { activeEncounterSiteId: null },
    });
    expect(res.json).toHaveBeenCalledWith({
      player: expect.objectContaining({
        activeEncounterSiteId: null,
      }),
    });
  });
});
