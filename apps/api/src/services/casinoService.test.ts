import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CASINO_CONSTANTS } from '@pocketrealm/shared';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 1000,
    spent: 100,
    currentTurns: 900,
    lastRegenAt: new Date().toISOString(),
    timeToCapMs: 1000,
  }),
}));

const mockEmit = vi.fn();
const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
vi.mock('../socket', () => ({ getIo: vi.fn() }));

vi.mock('@pocketrealm/game-engine', () => ({
  validateBet: vi.fn().mockReturnValue({ valid: true }),
  generateSpinResult: vi.fn().mockReturnValue(17),
  isWinningBet: vi.fn().mockReturnValue(false),
  calculatePayout: vi.fn().mockReturnValue(0),
}));

vi.mock('../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
  },
}));

vi.mock('./achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
  emitAchievementNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import { getIo } from '../socket';
import {
  exchangeTurnsForGold,
  getCurrentRound,
  placeBet,
  getRouletteHistory,
  getRouletteStats,
} from './casinoService';
import { validateBet, generateSpinResult, isWinningBet, calculatePayout } from '@pocketrealm/game-engine';
import { checkAchievements, emitAchievementNotifications } from './achievementService';

const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockGetIo = getIo as ReturnType<typeof vi.fn>;
const mockValidateBet = validateBet as ReturnType<typeof vi.fn>;
const mockGenerateSpinResult = generateSpinResult as ReturnType<typeof vi.fn>;
const mockIsWinningBet = isWinningBet as ReturnType<typeof vi.fn>;
const mockCalculatePayout = calculatePayout as ReturnType<typeof vi.fn>;
const mockCheckAchievements = checkAchievements as ReturnType<typeof vi.fn>;
const mockEmitAchievementNotifications = emitAchievementNotifications as ReturnType<typeof vi.fn>;

// Add $executeRaw to mockPrisma since it's not in the default mock
mockPrisma.$executeRaw = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mockGetIo.mockReturnValue(null);
});

// ── exchangeTurnsForGold ────────────────────────────────────────

describe('exchangeTurnsForGold', () => {
  it('deducts turns and adds gold, returns correct balances', async () => {
    mockPrisma.player.update.mockResolvedValue({ gold: 100 });

    const result = await exchangeTurnsForGold('p1', 100);

    expect(result.turnsSpent).toBe(100);
    expect(result.goldGained).toBe(100 * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE);
    expect(result.goldBalance).toBe(100);
    expect(result.turnsRemaining).toBe(900);
  });

  it('throws for negative turns', async () => {
    await expect(exchangeTurnsForGold('p1', -5)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws for non-integer turns', async () => {
    await expect(exchangeTurnsForGold('p1', 1.5)).rejects.toThrow('Turns must be a positive integer');
  });

  it('propagates error from turnBankService', async () => {
    const { spendPlayerTurnsTx } = await import('./turnBankService.js');
    (spendPlayerTurnsTx as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Insufficient turns')
    );

    await expect(exchangeTurnsForGold('p1', 100)).rejects.toThrow('Insufficient turns');
  });

  it('uses GOLD_EXCHANGE_RATE for gold calculation', async () => {
    mockPrisma.player.update.mockResolvedValue({ gold: 500 });

    const result = await exchangeTurnsForGold('p1', 50);

    expect(result.goldGained).toBe(50 * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gold: { increment: 50 * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE } },
      })
    );
  });

  it('INVALID_AMOUNT error code for bad input', async () => {
    try {
      await exchangeTurnsForGold('p1', 0);
    } catch (e: any) {
      expect(e.code).toBe('INVALID_AMOUNT');
      expect(e.statusCode).toBe(400);
    }
  });

  it('runs within a $transaction', async () => {
    mockPrisma.player.update.mockResolvedValue({ gold: 10 });

    await exchangeTurnsForGold('p1', 10);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});

// ── getCurrentRound ─────────────────────────────────────────────

describe('getCurrentRound', () => {
  it('auto-creates a new round when no active round in Redis', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.rouletteRound.create.mockResolvedValue({ id: 'new-round' });
    mockRedis.set.mockResolvedValue('OK');

    const result = await getCurrentRound();

    expect(result.phase).toBe('betting');
    expect(result.roundId).toBe('new-round');
    expect(result.result).toBeNull();
    expect(result.bets).toEqual([]);
    expect(mockPrisma.rouletteRound.create).toHaveBeenCalled();
  });

  it('returns betting phase with time remaining', async () => {
    const startedAt = Date.now() - 5000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === 'roulette:current_round' ? roundData : null)
    );
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    const result = await getCurrentRound();

    expect(result.phase).toBe('betting');
    expect(result.roundId).toBe('round-1');
    expect(result.result).toBeNull();
    expect(result.timeRemainingMs).toBeGreaterThan(0);
    expect(result.timeRemainingMs).toBeLessThanOrEqual(
      CASINO_CONSTANTS.ROUND_DURATION_SECONDS * 1000
    );
  });

  it('returns spinning phase when past betting window', async () => {
    const startedAt = Date.now() - 55_000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === 'roulette:current_round' ? roundData : null)
    );
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    const result = await getCurrentRound();

    expect(result.phase).toBe('spinning');
    expect(result.roundId).toBe('round-1');
    expect(result.result).toBeNull();
    expect(result.timeRemainingMs).toBeGreaterThan(0);
  });

  it('resolves round and returns result when past total duration', async () => {
    const startedAt = Date.now() - 65_000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === 'roulette:current_round' ? roundData : null)
    );
    mockGenerateSpinResult.mockReturnValue(7);
    mockRedis.set.mockResolvedValue('OK');
    mockPrisma.rouletteBet.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.rouletteRound.update.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    const result = await getCurrentRound();

    expect(result.phase).toBe('result');
    expect(result.result).toBe(7);
    expect(result.roundId).toBe('round-1');
  });

  it('returns result phase from RESULT_KEY when resolved round is being displayed', async () => {
    const resolvedData = JSON.stringify({
      roundId: 'resolved-round',
      startedAt: Date.now() - 62_000,
      result: 22,
    });
    // First call is for RESULT_KEY, second for ROUND_KEY
    mockRedis.get.mockResolvedValueOnce(resolvedData);
    mockPrisma.rouletteBet.findMany.mockResolvedValue([
      { player: { username: 'Alice' }, betType: 'red', betValue: 'red', amount: 50 },
    ]);

    const result = await getCurrentRound();

    expect(result.phase).toBe('result');
    expect(result.result).toBe(22);
    expect(result.roundId).toBe('resolved-round');
    expect(result.timeRemainingMs).toBe(0);
    expect(result.bets).toEqual([
      { playerName: 'Alice', betType: 'red', betValue: 'red', amount: 50 },
    ]);
  });

  it('formats startedAt as ISO string', async () => {
    const startedAt = Date.now() - 5000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === 'roulette:current_round' ? roundData : null)
    );
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    const result = await getCurrentRound();

    expect(result.startedAt).toBe(new Date(startedAt).toISOString());
  });

  it('includes public bets from DB for active round', async () => {
    const startedAt = Date.now() - 5000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === 'roulette:current_round' ? roundData : null)
    );
    mockPrisma.rouletteBet.findMany.mockResolvedValue([
      { player: { username: 'Bob' }, betType: 'straight', betValue: '17', amount: 100 },
      { player: { username: 'Eve' }, betType: 'black', betValue: 'black', amount: 50 },
    ]);

    const result = await getCurrentRound();

    expect(result.bets).toEqual([
      { playerName: 'Bob', betType: 'straight', betValue: '17', amount: 100 },
      { playerName: 'Eve', betType: 'black', betValue: 'black', amount: 50 },
    ]);
  });

  it('emits casino:phase event when io is available and phase changed', async () => {
    mockGetIo.mockReturnValue({ to: mockTo });
    const startedAt = Date.now() - 5000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'roulette:resolved_round') return Promise.resolve(null);
      if (key === 'roulette:current_round') return Promise.resolve(roundData);
      if (key === 'roulette:last_phase') return Promise.resolve(null); // different from current phase
      return Promise.resolve(null);
    });
    mockRedis.set.mockResolvedValue('OK');
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    await getCurrentRound();

    expect(mockTo).toHaveBeenCalledWith('chat:casino');
    expect(mockEmit).toHaveBeenCalledWith('casino:phase', expect.objectContaining({
      phase: 'betting',
      roundId: 'round-1',
    }));
  });

  it('skips casino:phase emission when phase has not changed', async () => {
    mockGetIo.mockReturnValue({ to: mockTo });
    const startedAt = Date.now() - 5000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'roulette:resolved_round') return Promise.resolve(null);
      if (key === 'roulette:current_round') return Promise.resolve(roundData);
      if (key === 'roulette:last_phase') return Promise.resolve('betting'); // same phase
      return Promise.resolve(null);
    });
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    await getCurrentRound();

    // No casino:phase emission because phase didn't change
    expect(mockEmit).not.toHaveBeenCalledWith('casino:phase', expect.anything());
  });
});

// ── resolveRound (tested via getCurrentRound with elapsed >= totalMs) ──

describe('resolveRound (via getCurrentRound)', () => {
  function setupExpiredRound(opts?: { bets?: any[]; result?: number }) {
    const startedAt = Date.now() - 65_000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockGenerateSpinResult.mockReturnValue(opts?.result ?? 17);
    mockRedis.set.mockResolvedValue('OK'); // lock + RESULT_KEY
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'roulette:resolved_round') return Promise.resolve(null);
      if (key === 'roulette:current_round') return Promise.resolve(roundData);
      if (key === 'roulette:last_phase') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockPrisma.rouletteRound.update.mockResolvedValue({});
    mockPrisma.rouletteBet.update.mockResolvedValue({});
    mockPrisma.rouletteBet.findMany
      .mockResolvedValueOnce(opts?.bets ?? []) // bets in resolveRound
      .mockResolvedValueOnce([]); // getPublicBets after resolution
  }

  it('acquires a Redis lock before resolving', async () => {
    setupExpiredRound();

    await getCurrentRound();

    expect(mockRedis.set).toHaveBeenCalledWith(
      'roulette:lock:round-1', '1', 'EX', 30, 'NX'
    );
  });

  it('updates round result and resolvedAt in DB', async () => {
    setupExpiredRound({ result: 22 });

    await getCurrentRound();

    expect(mockPrisma.rouletteRound.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'round-1' },
        data: expect.objectContaining({ result: 22 }),
      })
    );
  });

  it('processes winning bets and increments player gold', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
      { id: 'bet-2', playerId: 'p2', betType: 'black', betValue: 'black', amount: 50, player: { username: 'Bob' } },
    ];
    mockIsWinningBet.mockImplementation((betType: string) => betType === 'red');
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 300 });

    await getCurrentRound();

    // Winning bet payout updated
    expect(mockPrisma.rouletteBet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bet-1' },
        data: { payout: 200 },
      })
    );
    // Losing bet payout = 0
    expect(mockPrisma.rouletteBet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bet-2' },
        data: { payout: 0 },
      })
    );
    // Winner gets gold increment
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { gold: { increment: 200 } },
      })
    );
  });

  it('aggregates payouts for same player with multiple winning bets', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
      { id: 'bet-2', playerId: 'p1', betType: 'odd', betValue: 'odd', amount: 50, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockImplementation((_: string, amount: number) => amount * 2);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500 });

    await getCurrentRound();

    // Total payout for p1: 200 + 100 = 300
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { gold: { increment: 300 } },
      })
    );
  });

  it('emits casino:result socket event with winning bets when io is available', async () => {
    mockGetIo.mockReturnValue({ to: mockTo });
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
      { id: 'bet-2', playerId: 'p2', betType: 'black', betValue: 'black', amount: 50, player: { username: 'Bob' } },
    ];
    mockIsWinningBet.mockImplementation((betType: string) => betType === 'red');
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 300 });

    await getCurrentRound();

    expect(mockEmit).toHaveBeenCalledWith('casino:result', expect.objectContaining({
      result: 7,
      winningBets: [
        expect.objectContaining({
          playerName: 'Alice',
          betType: 'red',
          betValue: 'red',
          amount: 100,
          payout: 200,
        }),
      ],
    }));
  });

  it('does not emit casino:result when io is null', async () => {
    mockGetIo.mockReturnValue(null);
    setupExpiredRound();

    await getCurrentRound();

    expect(mockEmit).not.toHaveBeenCalledWith('casino:result', expect.anything());
  });

  it('checks peakGoldHeld achievement for winners', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500 });

    await getCurrentRound();

    expect(mockCheckAchievements).toHaveBeenCalledWith('p1', { statKeys: ['peakGoldHeld'] });
  });

  it('emits achievement notifications when achievements are unlocked', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500 });
    mockCheckAchievements.mockResolvedValue([{ id: 'gold_1000' }]);

    await getCurrentRound();

    expect(mockEmitAchievementNotifications).toHaveBeenCalledWith('p1', [{ id: 'gold_1000' }]);
  });

  it('does not emit achievement notifications when no achievements unlocked', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500 });
    mockCheckAchievements.mockResolvedValue([]);

    await getCurrentRound();

    expect(mockEmitAchievementNotifications).not.toHaveBeenCalled();
  });

  it('skips achievement check for losers', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(false);
    setupExpiredRound({ bets, result: 7 });

    await getCurrentRound();

    expect(mockCheckAchievements).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('updates peakGoldHeld via $executeRaw for winners', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 750 });

    await getCurrentRound();

    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('skips $executeRaw when player not found for winner', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockReturnValue(200);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await getCurrentRound();

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    expect(mockCheckAchievements).not.toHaveBeenCalled();
  });

  it('deduplicates winner IDs for achievement checks', async () => {
    const bets = [
      { id: 'bet-1', playerId: 'p1', betType: 'red', betValue: 'red', amount: 100, player: { username: 'Alice' } },
      { id: 'bet-2', playerId: 'p1', betType: 'odd', betValue: 'odd', amount: 50, player: { username: 'Alice' } },
    ];
    mockIsWinningBet.mockReturnValue(true);
    mockCalculatePayout.mockReturnValue(100);
    setupExpiredRound({ bets, result: 7 });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 400 });

    await getCurrentRound();

    // Should only check achievements once for p1 even with 2 winning bets
    expect(mockCheckAchievements).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('deletes ROUND_KEY and sets RESULT_KEY after resolution', async () => {
    setupExpiredRound({ result: 17 });

    await getCurrentRound();

    expect(mockRedis.del).toHaveBeenCalledWith('roulette:current_round');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'roulette:resolved_round',
      expect.stringContaining('"roundId":"round-1"'),
      'EX',
      5 // RESULT_DISPLAY_SECONDS
    );
  });

  it('polls for result when lock is not acquired (concurrent resolution)', async () => {
    const startedAt = Date.now() - 65_000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'roulette:resolved_round') return Promise.resolve(null);
      if (key === 'roulette:current_round') return Promise.resolve(roundData);
      if (key === 'roulette:last_phase') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    // Lock not acquired (another process has it)
    mockRedis.set.mockResolvedValue(null);
    // Polling: first call returns null, second returns the result
    mockPrisma.rouletteRound.findUnique
      .mockResolvedValueOnce({ result: null })
      .mockResolvedValueOnce({ result: 22 });
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);
    vi.useFakeTimers();

    const promise = getCurrentRound();
    // Advance past the setTimeout(r, 300) polls
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    vi.useRealTimers();

    expect(result.phase).toBe('result');
    expect(result.result).toBe(22);
  });

  it('throws when polling times out after 10 attempts (lock contention)', async () => {
    const startedAt = Date.now() - 65_000;
    const roundData = JSON.stringify({ roundId: 'round-1', startedAt });
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'roulette:resolved_round') return Promise.resolve(null);
      if (key === 'roulette:current_round') return Promise.resolve(roundData);
      if (key === 'roulette:last_phase') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockRedis.set.mockResolvedValue(null); // lock not acquired
    mockPrisma.rouletteRound.findUnique.mockResolvedValue({ result: null });
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);
    vi.useFakeTimers();

    // Attach .catch() immediately to prevent unhandled rejection during timer advancement
    let caughtError: unknown;
    const promise = getCurrentRound().catch((e) => { caughtError = e; });
    // 10 polls * 300ms
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    vi.useRealTimers();

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('Round resolution in progress, retry later');
    expect((caughtError as any).statusCode).toBe(409);
    expect((caughtError as any).code).toBe('LOCK_CONTENTION');
  });
});

// ── placeBet ────────────────────────────────────────────────────

describe('placeBet', () => {
  function setupActiveBettingRound() {
    const startedAt = Date.now() - 1000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockValidateBet.mockReturnValue({ valid: true });
  }

  it('places a valid bet, deducts gold', async () => {
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500, username: 'Alice' });
    mockPrisma.player.update.mockResolvedValue({ gold: 400 });
    mockPrisma.rouletteBet.create.mockResolvedValue({});

    const result = await placeBet('p1', 'red', 'red', 100);

    expect(result.roundId).toBe('round-1');
    expect(result.goldRemaining).toBe(400);
    expect(mockPrisma.rouletteBet.create).toHaveBeenCalledWith({
      data: {
        roundId: 'round-1',
        playerId: 'p1',
        betType: 'red',
        betValue: 'red',
        amount: 100,
      },
    });
  });

  it('throws INVALID_BET error code', async () => {
    mockValidateBet.mockReturnValue({ valid: false, error: 'Bad bet' });

    try {
      await placeBet('p1', 'red', 'red', 100);
    } catch (e: any) {
      expect(e.code).toBe('INVALID_BET');
      expect(e.statusCode).toBe(400);
    }
  });

  it('throws when player not found (null)', async () => {
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(placeBet('p1', 'red', 'red', 100)).rejects.toThrow('Insufficient gold');
  });

  it('throws INSUFFICIENT_GOLD error code', async () => {
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 10, username: 'A' });

    try {
      await placeBet('p1', 'red', 'red', 100);
    } catch (e: any) {
      expect(e.code).toBe('INSUFFICIENT_GOLD');
    }
  });

  it('throws BETTING_CLOSED error code when window is closed', async () => {
    const startedAt = Date.now() - 55_000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockValidateBet.mockReturnValue({ valid: true });

    try {
      await placeBet('p1', 'red', 'red', 100);
    } catch (e: any) {
      expect(e.code).toBe('BETTING_CLOSED');
    }
  });

  it('emits casino:bet socket event when io is available', async () => {
    mockGetIo.mockReturnValue({ to: mockTo });
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500, username: 'Bob' });
    mockPrisma.player.update.mockResolvedValue({ gold: 400 });
    mockPrisma.rouletteBet.create.mockResolvedValue({});

    await placeBet('p1', 'straight', '17', 100);

    expect(mockTo).toHaveBeenCalledWith('chat:casino');
    expect(mockEmit).toHaveBeenCalledWith('casino:bet', {
      playerName: 'Bob',
      playerId: 'p1',
      betType: 'straight',
      betValue: '17',
      amount: 100,
    });
  });

  it('does not emit casino:bet when io is null', async () => {
    mockGetIo.mockReturnValue(null);
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500, username: 'Bob' });
    mockPrisma.player.update.mockResolvedValue({ gold: 400 });
    mockPrisma.rouletteBet.create.mockResolvedValue({});

    await placeBet('p1', 'red', 'red', 100);

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('calculates goldRemaining as player.gold - amount', async () => {
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 1000, username: 'X' });
    mockPrisma.player.update.mockResolvedValue({ gold: 700 });
    mockPrisma.rouletteBet.create.mockResolvedValue({});

    const result = await placeBet('p1', 'red', 'red', 300);

    // goldRemaining is player.gold - amount (1000 - 300), not the updated value
    expect(result.goldRemaining).toBe(700);
  });

  it('decrements player gold by bet amount', async () => {
    setupActiveBettingRound();
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500, username: 'X' });
    mockPrisma.player.update.mockResolvedValue({ gold: 350 });
    mockPrisma.rouletteBet.create.mockResolvedValue({});

    await placeBet('p1', 'red', 'red', 150);

    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { gold: { decrement: 150 } },
      })
    );
  });
});

// ── getRouletteHistory ──────────────────────────────────────────

describe('getRouletteHistory', () => {
  it('returns formatted history entries', async () => {
    const resolvedAt = new Date('2025-06-01T12:00:00Z');
    mockPrisma.rouletteRound.findMany.mockResolvedValue([
      { spinNumber: 5, result: 17, resolvedAt },
      { spinNumber: 4, result: 0, resolvedAt },
    ]);

    const result = await getRouletteHistory();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      spinNumber: 5,
      result: 17,
      resolvedAt: resolvedAt.toISOString(),
    });
    expect(result[1]).toEqual({
      spinNumber: 4,
      result: 0,
      resolvedAt: resolvedAt.toISOString(),
    });
  });

  it('returns empty array when no resolved rounds', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([]);

    const result = await getRouletteHistory();

    expect(result).toEqual([]);
  });

  it('queries with ROULETTE_HISTORY_LENGTH limit', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([]);

    await getRouletteHistory();

    expect(mockPrisma.rouletteRound.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: CASINO_CONSTANTS.ROULETTE_HISTORY_LENGTH,
        where: { result: { not: null } },
        orderBy: { resolvedAt: 'desc' },
      })
    );
  });

  it('converts resolvedAt Date to ISO string', async () => {
    const date = new Date('2026-01-15T08:30:00.000Z');
    mockPrisma.rouletteRound.findMany.mockResolvedValue([
      { spinNumber: 1, result: 36, resolvedAt: date },
    ]);

    const result = await getRouletteHistory();

    expect(result[0].resolvedAt).toBe('2026-01-15T08:30:00.000Z');
  });
});

// ── getRouletteStats ────────────────────────────────────────────

describe('getRouletteStats', () => {
  it('returns counts for all 37 numbers (0-36) when no rounds exist', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([]);

    const result = await getRouletteStats();

    expect(result).toHaveLength(37);
    for (const entry of result) {
      expect(entry.count).toBe(0);
    }
    // Verify all numbers 0-36 are present
    const numbers = result.map((r) => r.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });

  it('counts occurrences of each result number', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([
      { result: 7 },
      { result: 7 },
      { result: 7 },
      { result: 22 },
      { result: 0 },
    ]);

    const result = await getRouletteStats();

    const map = new Map(result.map((r) => [r.number, r.count]));
    expect(map.get(7)).toBe(3);
    expect(map.get(22)).toBe(1);
    expect(map.get(0)).toBe(1);
    expect(map.get(1)).toBe(0);
    expect(map.get(36)).toBe(0);
  });

  it('queries with ROULETTE_STATS_DEPTH limit', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([]);

    await getRouletteStats();

    expect(mockPrisma.rouletteRound.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: CASINO_CONSTANTS.ROULETTE_STATS_DEPTH,
        where: { result: { not: null } },
        orderBy: { resolvedAt: 'desc' },
      })
    );
  });

  it('only selects result field', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([]);

    await getRouletteStats();

    expect(mockPrisma.rouletteRound.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { result: true },
      })
    );
  });

  it('handles all results being the same number', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([
      { result: 0 },
      { result: 0 },
      { result: 0 },
    ]);

    const result = await getRouletteStats();

    const map = new Map(result.map((r) => [r.number, r.count]));
    expect(map.get(0)).toBe(3);
    // All others should be 0
    for (let n = 1; n <= 36; n++) {
      expect(map.get(n)).toBe(0);
    }
  });

  it('handles single result', async () => {
    mockPrisma.rouletteRound.findMany.mockResolvedValue([{ result: 17 }]);

    const result = await getRouletteStats();

    const map = new Map(result.map((r) => [r.number, r.count]));
    expect(map.get(17)).toBe(1);
    expect(result).toHaveLength(37);
  });
});

// ── getOrCreateRound (tested via placeBet and getCurrentRound) ──

describe('getOrCreateRound (via placeBet)', () => {
  it('reuses existing round within duration', async () => {
    const startedAt = Date.now() - 1000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'existing', startedAt })
    );
    mockValidateBet.mockReturnValue({ valid: true });
    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500, username: 'X' });
    mockPrisma.player.update.mockResolvedValue({ gold: 400 });
    mockPrisma.rouletteBet.create.mockResolvedValue({});

    const result = await placeBet('p1', 'red', 'red', 100);

    expect(result.roundId).toBe('existing');
    expect(mockPrisma.rouletteRound.create).not.toHaveBeenCalled();
  });

  it('returns round from RESULT_KEY during display window', async () => {
    // First redis.get for ROUND_KEY returns null
    // But getOrCreateRound first checks ROUND_KEY, finds nothing,
    // then checks RESULT_KEY
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'roulette:current_round') return Promise.resolve(null);
      if (key === 'roulette:resolved_round') {
        return Promise.resolve(JSON.stringify({
          roundId: 'resolved',
          startedAt: Date.now() - 62_000,
          result: 5,
        }));
      }
      return Promise.resolve(null);
    });
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    const result = await getCurrentRound();

    // Should hit the RESULT_KEY branch in getOrCreateRound via getCurrentRound's auto-start path
    // Actually, getCurrentRound checks RESULT_KEY first before ROUND_KEY.
    // So it will return the 'result' phase directly.
    expect(result.phase).toBe('result');
    expect(result.roundId).toBe('resolved');
  });

  it('creates a new round via DB when no existing and no resolved', async () => {
    // getCurrentRound: RESULT_KEY = null, ROUND_KEY = null
    // Then getOrCreateRound: ROUND_KEY = null, RESULT_KEY = null
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockPrisma.rouletteRound.create.mockResolvedValue({ id: 'fresh-round' });

    const result = await getCurrentRound();

    expect(result.roundId).toBe('fresh-round');
    expect(mockPrisma.rouletteRound.create).toHaveBeenCalledWith({ data: {} });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'roulette:current_round',
      expect.any(String),
      'EX',
      CASINO_CONSTANTS.ROUND_DURATION_SECONDS + 10,
    );
  });
});
