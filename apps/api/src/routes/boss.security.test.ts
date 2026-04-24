import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBossEncounterStatus: vi.fn(),
  checkAndResolveDueBossRounds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../middleware/seasonGuard', () => ({
  requireActiveSeason: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../services/bossEncounterService', () => ({
  getActiveBossEncounters: vi.fn(),
  getBossEncounterStatus: mocks.getBossEncounterStatus,
  getBossHistory: vi.fn(),
  signUpForBossRound: vi.fn(),
  checkAndResolveDueBossRounds: mocks.checkAndResolveDueBossRounds,
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
}));

vi.mock('../services/progressService', () => ({
  trackProgress: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { bossRouter } from './boss';

function findHandler(method: string, path: string) {
  const layer = (bossRouter as any).stack.find(
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

const encounterId = '00000000-0000-0000-0000-000000000001';

function participant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'boss-participant-1',
    encounterId,
    playerId: 'other-player-id',
    roundNumber: 2,
    turnsCommitted: 100,
    totalDamage: 500,
    totalHealing: 50,
    attacks: 10,
    hits: 8,
    crits: 2,
    autoSignUp: true,
    currentHp: 77,
    currentStamina: 66,
    currentMana: 55,
    threat: 444,
    damageAbsorbed: 12,
    templateRound: 3,
    status: 'alive',
    ...overrides,
  };
}

describe('boss route public telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.mobTemplate.findUnique.mockResolvedValue({ name: 'Stone Tyrant', level: 9 });
    mockPrisma.player.findUnique.mockResolvedValue(null);
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 'other-player-id', username: 'OtherHero' },
    ]);
  });

  it('sanitizes raw participant IDs and live resources for non-participant boss detail viewers', async () => {
    mocks.getBossEncounterStatus.mockResolvedValue({
      encounter: {
        id: encounterId,
        eventId: 'event-1',
        mobTemplateId: 'mob-1',
        currentHp: 1000,
        maxHp: 2000,
        baseHp: 2000,
        roundNumber: 2,
        nextRoundAt: null,
        status: 'active',
        killedBy: null,
        rewardsByPlayer: null,
      },
      participants: [participant()],
    });

    const req = {
      params: { id: encounterId },
      player: { playerId: 'viewer-player-id', role: 'player' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await findHandler('get', '/:id')(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.participants[0]).toEqual(expect.objectContaining({
      id: 'participant-1',
      playerId: 'participant-1',
      username: 'OtherHero',
      turnsCommitted: 0,
      autoSignUp: false,
      currentHp: 0,
      currentStamina: 0,
      currentMana: 0,
      threat: 0,
      templateRound: 0,
    }));
    expect(JSON.stringify(body)).not.toContain('other-player-id');
    expect(next).not.toHaveBeenCalled();
  });

  it('sanitizes raw participant IDs and live resources for non-participant round detail viewers', async () => {
    mockPrisma.bossParticipant.findMany.mockResolvedValue([participant()]);

    const req = {
      params: { id: encounterId, num: '2' },
      player: { playerId: 'viewer-player-id', role: 'player' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await findHandler('get', '/:id/round/:num')(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.participants[0]).toEqual(expect.objectContaining({
      id: 'participant-1',
      playerId: 'participant-1',
      turnsCommitted: 0,
      currentHp: 0,
      currentStamina: 0,
      currentMana: 0,
      threat: 0,
    }));
    expect(JSON.stringify(body)).not.toContain('other-player-id');
    expect(next).not.toHaveBeenCalled();
  });
});
