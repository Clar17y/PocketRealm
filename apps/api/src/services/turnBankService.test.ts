import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TURN_CONSTANTS } from '@pocketrealm/shared';
import { mockPrisma } from '../__test__/setup';
import {
  getTurnState,
  spendPlayerTurns,
  refundPlayerTurns,
} from './turnBankService';
const now = new Date('2025-06-01T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTurnState', () => {
  it('returns current turns and time to cap', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 1000,
      lastRegenAt: new Date(now.getTime() - 5000), // 5s ago
    });

    const result = await getTurnState('p1', now);
    expect(result.currentTurns).toBe(1005); // 1000 + 5 * 1
    expect(result.timeToCapMs).not.toBeNull();
    expect(result.lastRegenAt).toBeTruthy();
  });

  it('throws 404 when turn bank not found', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue(null);

    await expect(getTurnState('missing', now)).rejects.toThrow('Turn bank not found');
  });

  it('caps turns at BANK_CAP', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: TURN_CONSTANTS.BANK_CAP,
      lastRegenAt: new Date(now.getTime() - 100_000),
    });

    const result = await getTurnState('p1', now);
    expect(result.currentTurns).toBe(TURN_CONSTANTS.BANK_CAP);
    expect(result.timeToCapMs).toBeNull();
  });
});

describe('spendPlayerTurns', () => {
  it('throws for non-positive amount', async () => {
    await expect(spendPlayerTurns('p1', 0, now)).rejects.toThrow(
      'Turn spend amount must be a positive integer'
    );
    await expect(spendPlayerTurns('p1', -5, now)).rejects.toThrow(
      'Turn spend amount must be a positive integer'
    );
  });

  it('throws for non-integer amount', async () => {
    await expect(spendPlayerTurns('p1', 1.5, now)).rejects.toThrow(
      'Turn spend amount must be a positive integer'
    );
  });

  it('throws 404 when turn bank not found', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue(null);

    await expect(spendPlayerTurns('missing', 10, now)).rejects.toThrow('Turn bank not found');
  });

  it('throws when insufficient turns', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 5,
      lastRegenAt: now,
    });

    await expect(spendPlayerTurns('p1', 100, now)).rejects.toThrow('Insufficient turns');
  });

  it('succeeds on first attempt with optimistic lock', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 500,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await spendPlayerTurns('p1', 100, now);
    expect(result.previousTurns).toBe(500);
    expect(result.spent).toBe(100);
    expect(result.currentTurns).toBe(400);
  });

  it('retries on optimistic lock failure', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 500,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany
      .mockResolvedValueOnce({ count: 0 }) // first attempt fails
      .mockResolvedValueOnce({ count: 1 }); // second succeeds

    const result = await spendPlayerTurns('p1', 100, now);
    expect(result.currentTurns).toBe(400);
    expect(mockPrisma.turnBank.updateMany).toHaveBeenCalledTimes(2);
  });

  it('throws after 3 failed attempts', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 500,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 0 });

    await expect(spendPlayerTurns('p1', 100, now)).rejects.toThrow(
      'Turn bank state changed'
    );
    expect(mockPrisma.turnBank.updateMany).toHaveBeenCalledTimes(3);
  });
});

describe('refundPlayerTurns', () => {
  it('throws for non-positive amount', async () => {
    await expect(refundPlayerTurns('p1', 0, now)).rejects.toThrow(
      'Turn refund amount must be a positive integer'
    );
  });

  it('refunds turns clamped at BANK_CAP', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: TURN_CONSTANTS.BANK_CAP - 50,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await refundPlayerTurns('p1', 200, now);
    expect(result.currentTurns).toBe(TURN_CONSTANTS.BANK_CAP);
  });

  it('succeeds on first attempt', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 100,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await refundPlayerTurns('p1', 50, now);
    expect(result.currentTurns).toBe(150);
    expect(result.refunded).toBe(50);
  });
});
