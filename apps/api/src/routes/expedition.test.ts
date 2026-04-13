import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock('../services/expeditionService', () => ({
  checkAndResolveExpeditionRounds: vi.fn(),
  getActiveExpedition: vi.fn(),
  getExpeditionStatus: vi.fn(),
  getExpeditionCooldowns: vi.fn(),
  launchExpedition: vi.fn(),
  signUpForExpedition: vi.fn(),
  recoverFromKO: vi.fn(),
  forceStartExpedition: vi.fn(),
  resolveExpeditionRound: vi.fn(),
  setTargetMob: vi.fn(),
  setHealTarget: vi.fn(),
  abandonExpedition: vi.fn(),
}));

vi.mock('../services/expeditionShopService', () => ({
  getShopItems: vi.fn(),
  getPlayerTokens: vi.fn(),
  purchaseShopItem: vi.fn(),
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { checkAndResolveExpeditionRounds, getExpeditionCooldowns, getExpeditionStatus, resolveExpeditionRound } from '../services/expeditionService';
import { getIo } from '../socket';
import { expeditionRouter } from './expedition';

const mockGetExpeditionCooldowns = getExpeditionCooldowns as ReturnType<typeof vi.fn>;
const mockCheckAndResolveExpeditionRounds = checkAndResolveExpeditionRounds as ReturnType<typeof vi.fn>;
const mockGetExpeditionStatus = getExpeditionStatus as ReturnType<typeof vi.fn>;
const mockResolveExpeditionRound = resolveExpeditionRound as ReturnType<typeof vi.fn>;
const mockGetIo = getIo as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (expeditionRouter as any).stack.find(
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

describe('expedition routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIo.mockReturnValue({ kind: 'io' });
  });

  describe('GET /cooldowns', () => {
    it('returns top-level cooldown fields for guild members', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'guild-1' });
      mockGetExpeditionCooldowns.mockResolvedValue({
        weeklyCooldowns: { 1: null, 2: '2026-03-10T00:00:00.000Z', 3: null },
        betweenCooldown: '2026-03-09T18:00:00.000Z',
        hasActiveExpedition: false,
      });

      const req = { player: { playerId: 'player-1' } } as any;
      const res = mockRes();
      const handler = findHandler('get', '/cooldowns');

      await handler(req, res, vi.fn());

      expect(mockGetExpeditionCooldowns).toHaveBeenCalledWith('guild-1', 'player-1');
      expect(res.json).toHaveBeenCalledWith({
        weeklyCooldowns: { 1: null, 2: '2026-03-10T00:00:00.000Z', 3: null },
        betweenCooldown: '2026-03-09T18:00:00.000Z',
        hasActiveExpedition: false,
      });
    });

    it('returns top-level empty cooldown fields for players without a guild', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue(null);

      const req = { player: { playerId: 'player-1' } } as any;
      const res = mockRes();
      const handler = findHandler('get', '/cooldowns');

      await handler(req, res, vi.fn());

      expect(mockGetExpeditionCooldowns).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        weeklyCooldowns: {},
        betweenCooldown: null,
        hasActiveExpedition: false,
      });
    });
  });

  describe('GET /active', () => {
    it('resolves due rounds with the current socket server before reading status', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'guild-1' });

      const req = { player: { playerId: 'player-1' } } as any;
      const res = mockRes();
      const handler = findHandler('get', '/active');

      await handler(req, res, vi.fn());

      expect(mockCheckAndResolveExpeditionRounds).toHaveBeenCalledWith({ kind: 'io' });
    });
  });

  describe('GET /:id', () => {
    it('resolves due rounds with the current socket server before returning expedition details', async () => {
      mockCheckAndResolveExpeditionRounds.mockResolvedValue(undefined);
      mockGetExpeditionStatus.mockResolvedValue({
        expedition: {
          id: 'exp-1',
          guildId: 'guild-1',
          launchedBy: 'player-1',
        },
        members: [],
      });
      mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'guild-1' });
      mockPrisma.player.findUnique.mockResolvedValue({ username: 'Rook' });

      const req = {
        player: { playerId: 'player-1' },
        params: { id: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('get', '/:id');

      await handler(req, res, vi.fn());

      expect(mockCheckAndResolveExpeditionRounds).toHaveBeenCalledWith({ kind: 'io' });
    });
  });

  describe('POST /:id/force-round', () => {
    it('passes the current socket server into force-round resolution', async () => {
      mockPrisma.guildExpedition.findUnique
        .mockResolvedValueOnce({
          id: '00000000-0000-0000-0000-000000000001',
          guildId: 'guild-1',
          status: 'in_progress',
          nextRoundAt: new Date(),
        })
        .mockResolvedValueOnce({
          status: 'in_progress',
          currentRoom: 0,
          roundNumber: 1,
        });
      mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'guild-1', role: 'leader' });
      mockResolveExpeditionRound.mockResolvedValue(undefined);

      const req = {
        player: { playerId: 'player-1' },
        params: { id: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/:id/force-round');

      await handler(req, res, vi.fn());

      expect(mockResolveExpeditionRound).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001', { kind: 'io' });
    });
  });
});
