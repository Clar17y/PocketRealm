import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CASINO_CONSTANTS } from '@adventure/shared';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 1000,
    spent: 100,
    currentTurns: 900,
    lastRegenAt: new Date().toISOString(),
    timeToCapMs: 1000,
  }),
}));

vi.mock('@adventure/game-engine', () => ({
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

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import {
  exchangeTurnsForGold,
  getCurrentRound,
  placeBet,
  getRouletteHistory,
} from './casinoService';
import { validateBet, generateSpinResult, isWinningBet, calculatePayout } from '@adventure/game-engine';

const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockValidateBet = validateBet as ReturnType<typeof vi.fn>;
const mockGenerateSpinResult = generateSpinResult as ReturnType<typeof vi.fn>;
const mockIsWinningBet = isWinningBet as ReturnType<typeof vi.fn>;
const mockCalculatePayout = calculatePayout as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

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

  it('throws for zero turns', async () => {
    await expect(exchangeTurnsForGold('p1', 0)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws for non-integer turns', async () => {
    await expect(exchangeTurnsForGold('p1', 1.5)).rejects.toThrow('Turns must be a positive integer');
  });

  it('propagates error from turnBankService', async () => {
    const { spendPlayerTurnsTx } = await import('./turnBankService');
    (spendPlayerTurnsTx as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Insufficient turns')
    );

    await expect(exchangeTurnsForGold('p1', 100)).rejects.toThrow('Insufficient turns');
  });
});

describe('getCurrentRound', () => {
  it('returns idle state when no active round in Redis', async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await getCurrentRound();

    expect(result.phase).toBe('idle');
    expect(result.roundId).toBe('');
    expect(result.result).toBeNull();
    expect(result.bets).toEqual([]);
  });

  it('returns betting phase with time remaining', async () => {
    const startedAt = Date.now() - 5000; // 5 seconds ago (within 50s betting window)
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
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
    // 55 seconds ago: past 50s betting window but within 60s round duration
    const startedAt = Date.now() - 55_000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockPrisma.rouletteBet.findMany.mockResolvedValue([]);

    const result = await getCurrentRound();

    expect(result.phase).toBe('spinning');
    expect(result.roundId).toBe('round-1');
    expect(result.result).toBeNull();
    expect(result.timeRemainingMs).toBeGreaterThan(0);
  });

  it('resolves round and returns result when past total duration', async () => {
    // 65 seconds ago: past 60s round duration
    const startedAt = Date.now() - 65_000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockGenerateSpinResult.mockReturnValue(7);
    mockPrisma.rouletteBet.findMany
      .mockResolvedValueOnce([]) // findMany for bets in resolveRound
      .mockResolvedValueOnce([]); // findMany for getPublicBets
    mockPrisma.rouletteRound.update.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    const result = await getCurrentRound();

    expect(result.phase).toBe('result');
    expect(result.result).toBe(7);
    expect(result.roundId).toBe('round-1');
  });
});

describe('placeBet', () => {
  it('places a valid bet, deducts gold', async () => {
    // getOrCreateRound: round exists in Redis and is within window
    const startedAt = Date.now() - 1000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockValidateBet.mockReturnValue({ valid: true });

    mockPrisma.player.findUnique.mockResolvedValue({ gold: 500 });
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

  it('rejects invalid bet type/value', async () => {
    mockValidateBet.mockReturnValue({ valid: false, error: 'Invalid bet' });

    await expect(placeBet('p1', 'straight' as any, 'invalid', 100)).rejects.toThrow('Invalid bet');
  });

  it('throws when insufficient gold', async () => {
    const startedAt = Date.now() - 1000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockValidateBet.mockReturnValue({ valid: true });

    mockPrisma.player.findUnique.mockResolvedValue({ gold: 50 });

    await expect(placeBet('p1', 'red', 'red', 100)).rejects.toThrow('Insufficient gold');
  });

  it('throws when betting window is closed', async () => {
    // Round started 55s ago — past 50s betting window
    const startedAt = Date.now() - 55_000;
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ roundId: 'round-1', startedAt })
    );
    mockValidateBet.mockReturnValue({ valid: true });

    await expect(placeBet('p1', 'red', 'red', 100)).rejects.toThrow('Betting window closed');
  });
});

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
});
