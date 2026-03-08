import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import { getActiveBuffs, getBuffValue, hasActiveBuff, consumeBuff, consumeBuffIfActive } from './buffService';

const PLAYER_ID = 'player-1';

beforeEach(() => vi.clearAllMocks());

describe('getActiveBuffs', () => {
  it('returns mapped buff data', async () => {
    const now = new Date('2026-03-06T12:00:00Z');
    db.playerBuff.findMany.mockResolvedValue([
      { id: 'b1', playerId: PLAYER_ID, buffType: 'xp_boost', remainingUses: 50, bonusValue: 0.10, shopItemId: 'si-1', createdAt: now, shopItem: { name: 'XP Boost Scroll' } },
    ]);
    const result = await getActiveBuffs(PLAYER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'b1',
      buffType: 'xp_boost',
      remainingUses: 50,
      bonusValue: 0.10,
      shopItemName: 'XP Boost Scroll',
      createdAt: now.toISOString(),
    });
  });

  it('returns empty array when no buffs', async () => {
    db.playerBuff.findMany.mockResolvedValue([]);
    const result = await getActiveBuffs(PLAYER_ID);
    expect(result).toEqual([]);
  });
});

describe('getBuffValue', () => {
  it('returns bonus value when buff exists', async () => {
    db.playerBuff.findUnique.mockResolvedValue({ bonusValue: 0.10 });
    expect(await getBuffValue(PLAYER_ID, 'xp_boost')).toBe(0.10);
  });

  it('returns 0 when no buff exists', async () => {
    db.playerBuff.findUnique.mockResolvedValue(null);
    expect(await getBuffValue(PLAYER_ID, 'xp_boost')).toBe(0);
  });
});

describe('hasActiveBuff', () => {
  it('returns true when buff exists', async () => {
    db.playerBuff.findUnique.mockResolvedValue({ id: 'b1' });
    expect(await hasActiveBuff(PLAYER_ID, 'xp_boost')).toBe(true);
  });

  it('returns false when no buff', async () => {
    db.playerBuff.findUnique.mockResolvedValue(null);
    expect(await hasActiveBuff(PLAYER_ID, 'xp_boost')).toBe(false);
  });
});

describe('consumeBuff', () => {
  it('decrements remaining uses', async () => {
    const mockTx = {
      playerBuff: {
        update: vi.fn().mockResolvedValue({ id: 'b1', remainingUses: 49 }),
        delete: vi.fn(),
      },
    };
    await consumeBuff(mockTx, PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.update).toHaveBeenCalledWith({
      where: { playerId_buffType: { playerId: PLAYER_ID, buffType: 'xp_boost' } },
      data: { remainingUses: { decrement: 1 } },
    });
    expect(mockTx.playerBuff.delete).not.toHaveBeenCalled();
  });

  it('deletes buff when remaining uses reaches 0', async () => {
    const mockTx = {
      playerBuff: {
        update: vi.fn().mockResolvedValue({ id: 'b1', remainingUses: 0 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    await consumeBuff(mockTx, PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });
});

describe('consumeBuffIfActive', () => {
  it('returns bonus value and decrements when buff exists', async () => {
    const mockTx = {
      playerBuff: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', bonusValue: 0.15, remainingUses: 10 }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn(),
      },
    };
    const value = await consumeBuffIfActive(mockTx, PLAYER_ID, 'gathering_yield');
    expect(value).toBe(0.15);
    expect(mockTx.playerBuff.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { remainingUses: 9 },
    });
  });

  it('returns 0 when no buff', async () => {
    const mockTx = {
      playerBuff: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const value = await consumeBuffIfActive(mockTx, PLAYER_ID, 'xp_boost');
    expect(value).toBe(0);
  });

  it('deletes buff when last use consumed', async () => {
    const mockTx = {
      playerBuff: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', bonusValue: 0.10, remainingUses: 1 }),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn(),
      },
    };
    const value = await consumeBuffIfActive(mockTx, PLAYER_ID, 'xp_boost');
    expect(value).toBe(0.10);
    expect(mockTx.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(mockTx.playerBuff.update).not.toHaveBeenCalled();
  });
});
