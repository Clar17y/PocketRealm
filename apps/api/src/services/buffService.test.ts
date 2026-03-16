import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma } from '@pocketrealm/database';
import { mockPrisma as db } from '../__test__/setup';

/** Shorthand to cast a partial mock object as a Prisma TransactionClient for test purposes. */
const asTx = (mock: unknown) => mock as unknown as Prisma.TransactionClient;
import {
  getActiveBuffs,
  getBuffValue,
  hasActiveBuff,
  consumeBuff,
  consumeBuffIfActive,
  getCombatBuffs,
  getCombatBuffsWithUses,
  consumeBuffChargesPerMob,
  applyCombatBuffs,
  consumeCombatBuffs,
  consumeBuffStandalone,
  buildCombatBuffBadges,
} from './buffService';

const PLAYER_ID = 'player-1';

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Existing tests (getActiveBuffs, getBuffValue, hasActiveBuff, consumeBuff, consumeBuffIfActive)
// ---------------------------------------------------------------------------

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

  it('maps multiple buffs preserving order', async () => {
    const t1 = new Date('2026-03-06T10:00:00Z');
    const t2 = new Date('2026-03-06T11:00:00Z');
    db.playerBuff.findMany.mockResolvedValue([
      { id: 'b1', buffType: 'xp_boost', remainingUses: 10, bonusValue: 0.05, createdAt: t1, shopItem: { name: 'XP Scroll' } },
      { id: 'b2', buffType: 'combat_damage', remainingUses: 3, bonusValue: 0.20, createdAt: t2, shopItem: { name: 'Power Scroll' } },
    ]);
    const result = await getActiveBuffs(PLAYER_ID);
    expect(result).toHaveLength(2);
    expect(result[0]!.buffType).toBe('xp_boost');
    expect(result[1]!.buffType).toBe('combat_damage');
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
    await consumeBuff(asTx(mockTx), PLAYER_ID, 'xp_boost');
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
    await consumeBuff(asTx(mockTx), PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });

  it('deletes buff when remaining uses goes negative', async () => {
    const mockTx = {
      playerBuff: {
        update: vi.fn().mockResolvedValue({ id: 'b1', remainingUses: -1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    await consumeBuff(asTx(mockTx), PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });
});

describe('consumeBuffIfActive', () => {
  it('returns bonus value and decrements when buff exists', async () => {
    const mockTx = {
      playerBuff: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', bonusValue: 0.15, remainingUses: 10 }),
        update: vi.fn().mockResolvedValue({ remainingUses: 9 }),
        delete: vi.fn(),
      },
    };
    const value = await consumeBuffIfActive(asTx(mockTx), PLAYER_ID, 'gathering_yield');
    expect(value).toBe(0.15);
    expect(mockTx.playerBuff.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { remainingUses: { decrement: 1 } },
    });
  });

  it('returns 0 when no buff', async () => {
    const mockTx = {
      playerBuff: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const value = await consumeBuffIfActive(asTx(mockTx), PLAYER_ID, 'xp_boost');
    expect(value).toBe(0);
  });

  it('deletes buff when last use consumed', async () => {
    const mockTx = {
      playerBuff: {
        findUnique: vi.fn().mockResolvedValue({ id: 'b1', bonusValue: 0.10, remainingUses: 1 }),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({ id: 'b1', remainingUses: 0 }),
      },
    };
    const value = await consumeBuffIfActive(asTx(mockTx), PLAYER_ID, 'xp_boost');
    expect(value).toBe(0.10);
    expect(mockTx.playerBuff.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { remainingUses: { decrement: 1 } },
    });
    expect(mockTx.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });

  it('does not call update or delete when buff not found', async () => {
    const mockTx = {
      playerBuff: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    await consumeBuffIfActive(asTx(mockTx), PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.update).not.toHaveBeenCalled();
    expect(mockTx.playerBuff.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// New tests: getCombatBuffs
// ---------------------------------------------------------------------------

describe('getCombatBuffs', () => {
  it('returns all three combat buff values when present', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'combat_damage', bonusValue: 0.15 },
      { buffType: 'combat_defence', bonusValue: 0.10 },
      { buffType: 'durability_shield', bonusValue: 0.50 },
    ]);
    const result = await getCombatBuffs(PLAYER_ID);
    expect(result).toEqual({
      damageBoost: 0.15,
      defenceBoost: 0.10,
      durabilityShield: 0.50,
    });
  });

  it('defaults missing buffs to 0', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'combat_damage', bonusValue: 0.20 },
    ]);
    const result = await getCombatBuffs(PLAYER_ID);
    expect(result).toEqual({
      damageBoost: 0.20,
      defenceBoost: 0,
      durabilityShield: 0,
    });
  });

  it('returns all zeros when no combat buffs exist', async () => {
    db.playerBuff.findMany.mockResolvedValue([]);
    const result = await getCombatBuffs(PLAYER_ID);
    expect(result).toEqual({
      damageBoost: 0,
      defenceBoost: 0,
      durabilityShield: 0,
    });
  });

  it('queries with correct filter (combat buff types only)', async () => {
    db.playerBuff.findMany.mockResolvedValue([]);
    await getCombatBuffs(PLAYER_ID);
    expect(db.playerBuff.findMany).toHaveBeenCalledWith({
      where: {
        playerId: PLAYER_ID,
        buffType: { in: ['combat_damage', 'combat_defence', 'durability_shield'] },
      },
      select: { buffType: true, bonusValue: true },
    });
  });

  it('handles only defence buff present', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'combat_defence', bonusValue: 0.25 },
    ]);
    const result = await getCombatBuffs(PLAYER_ID);
    expect(result.damageBoost).toBe(0);
    expect(result.defenceBoost).toBe(0.25);
    expect(result.durabilityShield).toBe(0);
  });

  it('handles only durability shield present', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'durability_shield', bonusValue: 1.0 },
    ]);
    const result = await getCombatBuffs(PLAYER_ID);
    expect(result.damageBoost).toBe(0);
    expect(result.defenceBoost).toBe(0);
    expect(result.durabilityShield).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// New tests: getCombatBuffsWithUses
// ---------------------------------------------------------------------------

describe('getCombatBuffsWithUses', () => {
  it('returns buff values and remaining uses for all three types', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'combat_damage', bonusValue: 0.15, remainingUses: 10 },
      { buffType: 'combat_defence', bonusValue: 0.10, remainingUses: 5 },
      { buffType: 'durability_shield', bonusValue: 0.50, remainingUses: 3 },
    ]);
    const { buffs, uses } = await getCombatBuffsWithUses(PLAYER_ID);
    expect(buffs).toEqual({ damageBoost: 0.15, defenceBoost: 0.10, durabilityShield: 0.50 });
    expect(uses).toEqual({ damage: 10, defence: 5, durability: 3 });
  });

  it('defaults everything to 0 when no buffs', async () => {
    db.playerBuff.findMany.mockResolvedValue([]);
    const { buffs, uses } = await getCombatBuffsWithUses(PLAYER_ID);
    expect(buffs).toEqual({ damageBoost: 0, defenceBoost: 0, durabilityShield: 0 });
    expect(uses).toEqual({ damage: 0, defence: 0, durability: 0 });
  });

  it('handles partial buffs (only damage)', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'combat_damage', bonusValue: 0.30, remainingUses: 7 },
    ]);
    const { buffs, uses } = await getCombatBuffsWithUses(PLAYER_ID);
    expect(buffs.damageBoost).toBe(0.30);
    expect(buffs.defenceBoost).toBe(0);
    expect(buffs.durabilityShield).toBe(0);
    expect(uses.damage).toBe(7);
    expect(uses.defence).toBe(0);
    expect(uses.durability).toBe(0);
  });

  it('queries with correct filter including remainingUses', async () => {
    db.playerBuff.findMany.mockResolvedValue([]);
    await getCombatBuffsWithUses(PLAYER_ID);
    expect(db.playerBuff.findMany).toHaveBeenCalledWith({
      where: {
        playerId: PLAYER_ID,
        buffType: { in: ['combat_damage', 'combat_defence', 'durability_shield'] },
      },
      select: { buffType: true, bonusValue: true, remainingUses: true },
    });
  });

  it('handles single remaining use (edge: about to expire)', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { buffType: 'combat_damage', bonusValue: 0.05, remainingUses: 1 },
    ]);
    const { buffs, uses } = await getCombatBuffsWithUses(PLAYER_ID);
    expect(buffs.damageBoost).toBe(0.05);
    expect(uses.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// New tests: consumeBuffChargesPerMob
// ---------------------------------------------------------------------------

describe('consumeBuffChargesPerMob', () => {
  function makeTx() {
    return {
      playerBuff: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ remainingUses: 1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it('consumes all three buffs when all have remaining uses', async () => {
    const tx = makeTx();
    // Each consumeBuffIfActive call: findUnique returns a buff with uses > 1
    tx.playerBuff.findUnique
      .mockResolvedValueOnce({ id: 'bd', bonusValue: 0.10, remainingUses: 5 })
      .mockResolvedValueOnce({ id: 'bf', bonusValue: 0.10, remainingUses: 3 })
      .mockResolvedValueOnce({ id: 'bs', bonusValue: 0.50, remainingUses: 2 });
    const uses = { damage: 5, defence: 3, durability: 2 };

    await consumeBuffChargesPerMob(asTx(tx), PLAYER_ID, uses);

    expect(uses.damage).toBe(4);
    expect(uses.defence).toBe(2);
    expect(uses.durability).toBe(1);
    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(3);
  });

  it('skips buffs with 0 remaining uses', async () => {
    const tx = makeTx();
    const uses = { damage: 0, defence: 0, durability: 0 };

    await consumeBuffChargesPerMob(asTx(tx), PLAYER_ID, uses);

    expect(tx.playerBuff.findUnique).not.toHaveBeenCalled();
    expect(uses).toEqual({ damage: 0, defence: 0, durability: 0 });
  });

  it('consumes only damage when others are 0', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique.mockResolvedValueOnce({ id: 'bd', bonusValue: 0.10, remainingUses: 3 });
    const uses = { damage: 3, defence: 0, durability: 0 };

    await consumeBuffChargesPerMob(asTx(tx), PLAYER_ID, uses);

    expect(uses.damage).toBe(2);
    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(1);
  });

  it('consumes only durability when others are 0', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique.mockResolvedValueOnce({ id: 'bs', bonusValue: 0.50, remainingUses: 10 });
    const uses = { damage: 0, defence: 0, durability: 10 };

    await consumeBuffChargesPerMob(asTx(tx), PLAYER_ID, uses);

    expect(uses.durability).toBe(9);
    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(1);
  });

  it('mutates the uses object in place', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique.mockResolvedValue({ id: 'b1', bonusValue: 0.10, remainingUses: 5 });
    const uses = { damage: 2, defence: 2, durability: 2 };
    const ref = uses; // same reference

    await consumeBuffChargesPerMob(asTx(tx), PLAYER_ID, uses);

    expect(ref.damage).toBe(1);
    expect(ref.defence).toBe(1);
    expect(ref.durability).toBe(1);
    expect(ref).toBe(uses);
  });
});

// ---------------------------------------------------------------------------
// New tests: applyCombatBuffs (pure function - no mocks needed)
// ---------------------------------------------------------------------------

describe('applyCombatBuffs', () => {
  it('applies damage boost to damageMin and damageMax', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 50 };
    applyCombatBuffs(stats, { damageBoost: 0.5, defenceBoost: 0 });
    expect(stats.damageMin).toBe(15); // floor(10 * 1.5)
    expect(stats.damageMax).toBe(30); // floor(20 * 1.5)
    expect(stats.defence).toBe(50);   // unchanged
  });

  it('applies defence boost', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 50 };
    applyCombatBuffs(stats, { damageBoost: 0, defenceBoost: 0.2 });
    expect(stats.damageMin).toBe(10); // unchanged
    expect(stats.damageMax).toBe(20); // unchanged
    expect(stats.defence).toBe(60);   // floor(50 * 1.2)
  });

  it('applies both boosts simultaneously', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 50 };
    applyCombatBuffs(stats, { damageBoost: 0.1, defenceBoost: 0.1 });
    expect(stats.damageMin).toBe(11); // floor(10 * 1.1)
    expect(stats.damageMax).toBe(22); // floor(20 * 1.1)
    expect(stats.defence).toBe(55);   // floor(50 * 1.1)
  });

  it('does nothing when both boosts are 0', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 50 };
    applyCombatBuffs(stats, { damageBoost: 0, defenceBoost: 0 });
    expect(stats).toEqual({ damageMin: 10, damageMax: 20, defence: 50 });
  });

  it('floors fractional damage results', () => {
    const stats = { damageMin: 7, damageMax: 13, defence: 30 };
    applyCombatBuffs(stats, { damageBoost: 0.33, defenceBoost: 0 });
    expect(stats.damageMin).toBe(Math.floor(7 * 1.33));  // 9
    expect(stats.damageMax).toBe(Math.floor(13 * 1.33)); // 17
  });

  it('floors fractional defence results', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 33 };
    applyCombatBuffs(stats, { damageBoost: 0, defenceBoost: 0.33 });
    expect(stats.defence).toBe(Math.floor(33 * 1.33)); // 43
  });

  it('mutates the stats object in place', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 50 };
    const ref = stats;
    applyCombatBuffs(stats, { damageBoost: 0.5, defenceBoost: 0.5 });
    expect(ref).toBe(stats);
    expect(ref.damageMin).toBe(15);
  });

  it('handles 100% boost (doubles)', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 50 };
    applyCombatBuffs(stats, { damageBoost: 1.0, defenceBoost: 1.0 });
    expect(stats.damageMin).toBe(20);
    expect(stats.damageMax).toBe(40);
    expect(stats.defence).toBe(100);
  });

  it('handles zero base stats', () => {
    const stats = { damageMin: 0, damageMax: 0, defence: 0 };
    applyCombatBuffs(stats, { damageBoost: 0.5, defenceBoost: 0.5 });
    expect(stats.damageMin).toBe(0);
    expect(stats.damageMax).toBe(0);
    expect(stats.defence).toBe(0);
  });

  it('handles small fractional boost on small values', () => {
    const stats = { damageMin: 1, damageMax: 2, defence: 1 };
    applyCombatBuffs(stats, { damageBoost: 0.01, defenceBoost: 0.01 });
    // floor(1 * 1.01) = 1, floor(2 * 1.01) = 2, floor(1 * 1.01) = 1
    expect(stats.damageMin).toBe(1);
    expect(stats.damageMax).toBe(2);
    expect(stats.defence).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// New tests: consumeCombatBuffs
// ---------------------------------------------------------------------------

describe('consumeCombatBuffs', () => {
  function makeTx() {
    return {
      playerBuff: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ remainingUses: 1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it('consumes all three combat buffs when all are active', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique
      .mockResolvedValueOnce({ id: 'bd', bonusValue: 0.10, remainingUses: 5 })
      .mockResolvedValueOnce({ id: 'bf', bonusValue: 0.10, remainingUses: 3 })
      .mockResolvedValueOnce({ id: 'bs', bonusValue: 0.50, remainingUses: 2 });

    const buffs = { damageBoost: 0.10, defenceBoost: 0.10, durabilityShield: 0.50 };
    await consumeCombatBuffs(asTx(tx), PLAYER_ID, buffs);

    // Each buff should have been looked up via consumeBuffIfActive
    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(3);
  });

  it('skips damage consume when damageBoost is 0', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique
      .mockResolvedValueOnce({ id: 'bf', bonusValue: 0.10, remainingUses: 5 })
      .mockResolvedValueOnce({ id: 'bs', bonusValue: 0.50, remainingUses: 3 });

    const buffs = { damageBoost: 0, defenceBoost: 0.10, durabilityShield: 0.50 };
    await consumeCombatBuffs(asTx(tx), PLAYER_ID, buffs);

    // Only 2 calls: defence + durability
    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(2);
  });

  it('skips defence consume when defenceBoost is 0', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique
      .mockResolvedValueOnce({ id: 'bd', bonusValue: 0.10, remainingUses: 5 })
      .mockResolvedValueOnce({ id: 'bs', bonusValue: 0.50, remainingUses: 3 });

    const buffs = { damageBoost: 0.10, defenceBoost: 0, durabilityShield: 0.50 };
    await consumeCombatBuffs(asTx(tx), PLAYER_ID, buffs);

    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(2);
  });

  it('skips durability consume when durabilityShield is 0', async () => {
    const tx = makeTx();
    tx.playerBuff.findUnique.mockResolvedValueOnce({ id: 'bd', bonusValue: 0.10, remainingUses: 5 });

    const buffs = { damageBoost: 0.10, defenceBoost: 0, durabilityShield: 0 };
    await consumeCombatBuffs(asTx(tx), PLAYER_ID, buffs);

    expect(tx.playerBuff.findUnique).toHaveBeenCalledTimes(1);
  });

  it('does nothing when all buffs are 0', async () => {
    const tx = makeTx();
    const buffs = { damageBoost: 0, defenceBoost: 0, durabilityShield: 0 };
    await consumeCombatBuffs(asTx(tx), PLAYER_ID, buffs);

    expect(tx.playerBuff.findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// New tests: consumeBuffStandalone
// ---------------------------------------------------------------------------

describe('consumeBuffStandalone', () => {
  it('wraps consumeBuffIfActive in a $transaction', async () => {
    // The mock $transaction executes the callback with the mock prisma as tx
    db.playerBuff.findUnique.mockResolvedValue({ id: 'b1', bonusValue: 0.10, remainingUses: 5 });
    db.playerBuff.update.mockResolvedValue({ remainingUses: 4 });

    await consumeBuffStandalone(PLAYER_ID, 'xp_boost');

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.playerBuff.findUnique).toHaveBeenCalled();
  });

  it('gracefully handles missing buff', async () => {
    db.playerBuff.findUnique.mockResolvedValue(null);

    await consumeBuffStandalone(PLAYER_ID, 'nonexistent');

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.playerBuff.update).not.toHaveBeenCalled();
    expect(db.playerBuff.delete).not.toHaveBeenCalled();
  });

  it('deletes buff when last use consumed via standalone', async () => {
    db.playerBuff.findUnique.mockResolvedValue({ id: 'b1', bonusValue: 0.10, remainingUses: 1 });
    db.playerBuff.update.mockResolvedValue({ id: 'b1', remainingUses: 0 });
    db.playerBuff.delete.mockResolvedValue({});

    await consumeBuffStandalone(PLAYER_ID, 'xp_boost');

    expect(db.playerBuff.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { remainingUses: { decrement: 1 } },
    });
    expect(db.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });
});

// ---------------------------------------------------------------------------
// New tests: buildCombatBuffBadges (pure function - no mocks needed)
// ---------------------------------------------------------------------------

describe('buildCombatBuffBadges', () => {
  it('returns empty array when no buffs are active', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0, defenceBoost: 0, durabilityShield: 0 });
    expect(badges).toEqual([]);
  });

  it('returns damage badge when damageBoost > 0', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0.15, defenceBoost: 0, durabilityShield: 0 });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toEqual({
      title: 'Combat Power Scroll',
      effectType: 'player_damage_up',
      effectValue: 0.15,
      isGlobal: false,
      appliedToThisMob: true,
    });
  });

  it('returns defence badge when defenceBoost > 0', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0, defenceBoost: 0.20, durabilityShield: 0 });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toEqual({
      title: 'Iron Skin Scroll',
      effectType: 'player_defence_up',
      effectValue: 0.20,
      isGlobal: false,
      appliedToThisMob: true,
    });
  });

  it('returns durability badge when durabilityShield > 0', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0, defenceBoost: 0, durabilityShield: 0.50 });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toEqual({
      title: 'Durability Shield Scroll',
      effectType: 'durability_shield',
      effectValue: 0.50,
      isGlobal: false,
      appliedToThisMob: true,
    });
  });

  it('returns all three badges when all buffs are active', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0.10, defenceBoost: 0.10, durabilityShield: 0.50 });
    expect(badges).toHaveLength(3);
    expect(badges.map(b => b.effectType)).toEqual([
      'player_damage_up',
      'player_defence_up',
      'durability_shield',
    ]);
  });

  it('preserves correct order: damage, defence, durability', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0.01, defenceBoost: 0.01, durabilityShield: 0.01 });
    expect(badges[0]!.title).toBe('Combat Power Scroll');
    expect(badges[1]!.title).toBe('Iron Skin Scroll');
    expect(badges[2]!.title).toBe('Durability Shield Scroll');
  });

  it('all badges have isGlobal=false and appliedToThisMob=true', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0.10, defenceBoost: 0.10, durabilityShield: 0.10 });
    for (const badge of badges) {
      expect(badge.isGlobal).toBe(false);
      expect(badge.appliedToThisMob).toBe(true);
    }
  });

  it('includes exact effectValue from buff input', () => {
    const badges = buildCombatBuffBadges({ damageBoost: 0.123, defenceBoost: 0.456, durabilityShield: 0.789 });
    expect(badges[0]!.effectValue).toBe(0.123);
    expect(badges[1]!.effectValue).toBe(0.456);
    expect(badges[2]!.effectValue).toBe(0.789);
  });
});
