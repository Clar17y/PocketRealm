import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_CONSTANTS, TURN_CONSTANTS } from '@pocketrealm/shared';
import { mockPrisma } from '../__test__/setup';
import {
  getTurnState,
  spendPlayerTurns,
  refundPlayerTurns,
  assertPlayerCanSpendTurnsTx,
} from './turnBankService';
const now = new Date('2025-06-01T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTurnState', () => {
  it('returns current turns and time to cap', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 1000,
      regenProgress: 0,
      lastRegenAt: new Date(now.getTime() - 5000), // 5s ago
    });

    const result = await getTurnState('p1', now);
    expect(result.currentTurns).toBe(1005); // 1000 + 5 * 1
    expect(result.timeToCapMs).not.toBeNull();
    expect(result.lastRegenAt).toBeTruthy();
  });

  it('throws 404 when turn bank not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue(null);

    await expect(getTurnState('missing', now)).rejects.toThrow('Turn bank not found');
  });

  it('caps turns at BANK_CAP', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: TURN_CONSTANTS.BANK_CAP,
      regenProgress: 0,
      lastRegenAt: new Date(now.getTime() - 100_000),
    });

    const result = await getTurnState('p1', now);
    expect(result.currentTurns).toBe(TURN_CONSTANTS.BANK_CAP);
    expect(result.timeToCapMs).toBeNull();
  });

  it('uses Champion regen rate and bank cap for premium players', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: PREMIUM_CONSTANTS.TURN_BANK_CAP - 2,
      regenProgress: 0,
      lastRegenAt: new Date(now.getTime() - 2_000), // +2.2 turns
    });

    const result = await getTurnState('p1', now);
    expect(result.currentTurns).toBe(PREMIUM_CONSTANTS.TURN_BANK_CAP);
    expect(result.timeToCapMs).toBeNull();
  });

  it('falls back to free turn settings when premium entitlement is expired', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date(now.getTime() - 60_000),
      },
    });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: TURN_CONSTANTS.BANK_CAP - 1,
      regenProgress: 0,
      lastRegenAt: new Date(now.getTime() - 2_000),
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
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue(null);

    await expect(spendPlayerTurns('missing', 10, now)).rejects.toThrow('Turn bank not found');
  });

  it('throws when insufficient turns', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 5,
      regenProgress: 0,
      lastRegenAt: now,
    });

    await expect(spendPlayerTurns('p1', 100, now)).rejects.toThrow('Insufficient turns');
  });

  it('succeeds on first attempt with optimistic lock', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 500,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await spendPlayerTurns('p1', 100, now);
    expect(result.previousTurns).toBe(500);
    expect(result.spent).toBe(100);
    expect(result.currentTurns).toBe(400);
  });

  it('retries on optimistic lock failure', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 500,
      regenProgress: 0,
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
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 500,
      regenProgress: 0,
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
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: TURN_CONSTANTS.BANK_CAP - 50,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await refundPlayerTurns('p1', 200, now);
    expect(result.currentTurns).toBe(TURN_CONSTANTS.BANK_CAP);
  });

  it('succeeds on first attempt', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 100,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await refundPlayerTurns('p1', 50, now);
    expect(result.currentTurns).toBe(150);
    expect(result.refunded).toBe(50);
  });

  it('refunds premium players up to the Champion bank cap', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: PREMIUM_CONSTANTS.TURN_BANK_CAP - 20,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await refundPlayerTurns('p1', 50, now);
    expect(result.currentTurns).toBe(PREMIUM_CONSTANTS.TURN_BANK_CAP);
  });

  it('refunds expired premium players using the free bank cap', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date(now.getTime() - 60_000),
      },
    });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: TURN_CONSTANTS.BANK_CAP - 20,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await refundPlayerTurns('p1', 50, now);
    expect(result.currentTurns).toBe(TURN_CONSTANTS.BANK_CAP);
  });

  it('preserves premium fractional progress when spending turns', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 100,
      regenProgress: 0,
      lastRegenAt: new Date(now.getTime() - 1_000),
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    await spendPlayerTurns('p1', 1, now);

    expect(mockPrisma.turnBank.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        currentTurns: 100,
        regenProgress: 10,
      }),
    }));
  });
});

describe('assertPlayerCanSpendTurnsTx', () => {
  it('returns current turn state without updating the bank when affordable', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1',
      currentTurns: 500,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });

    const result = await assertPlayerCanSpendTurnsTx(mockPrisma, 'p1', 400, now);

    expect(result.currentTurns).toBe(500);
    expect(result.requiredTurns).toBe(400);
    expect(mockPrisma.turnBank.updateMany).not.toHaveBeenCalled();
  });

  it('throws INSUFFICIENT_TURNS when current turns are below the required amount', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1',
      currentTurns: 399,
      regenProgress: 0,
      lastRegenAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ account: { isPremium: false, premiumExpiresAt: null } });

    await expect(assertPlayerCanSpendTurnsTx(mockPrisma, 'p1', 400, now)).rejects.toMatchObject({
      code: 'INSUFFICIENT_TURNS',
    });
    expect(mockPrisma.turnBank.updateMany).not.toHaveBeenCalled();
  });
});
