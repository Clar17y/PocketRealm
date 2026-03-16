import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lootService', () => ({
  rollAndGrantLoot: vi.fn().mockResolvedValue([]),
  enrichLootWithNames: vi.fn().mockResolvedValue([]),
}));

import { mockPrisma } from '../__test__/setup';
import { EXPEDITION_CONSTANTS } from '@pocketrealm/shared';
import {
  distributeRoomLoot,
  awardRoomTokens,
  awardCompletionBonus,
} from './expeditionLootService';
import { rollAndGrantLoot, enrichLootWithNames } from './lootService';

describe('distributeRoomLoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty when no contributors', async () => {
    const result = await distributeRoomLoot([], 'trash', 1, ['mob-1']);
    expect(result).toEqual({});
    expect(rollAndGrantLoot).not.toHaveBeenCalled();
  });

  it('returns empty when no mob template ids', async () => {
    const result = await distributeRoomLoot(
      [{ playerId: 'p1', roomDamage: 100, roomHealing: 0 }],
      'trash',
      1,
      [],
    );
    expect(result).toEqual({});
  });

  it('gives more loot chance to player with higher contribution', async () => {
    const contributors = [
      { playerId: 'p1', roomDamage: 800, roomHealing: 0 },
      { playerId: 'p2', roomDamage: 200, roomHealing: 0 },
    ];

    await distributeRoomLoot(contributors, 'trash', 1, ['mob-1']);

    expect(rollAndGrantLoot).toHaveBeenCalledTimes(2);

    // p1: ratio = 800/1000 = 0.8, multiplier = max(0.5, min(2, 0.8*2*1.0)) = 1.6
    const p1Call = (rollAndGrantLoot as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'p1',
    );
    expect(p1Call).toBeDefined();
    expect(p1Call![3]).toBeCloseTo(1.6, 5);

    // p2: ratio = 200/1000 = 0.2, multiplier = max(0.5, min(2, 0.2*2*1.0)) = 0.5 (clamped)
    const p2Call = (rollAndGrantLoot as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'p2',
    );
    expect(p2Call).toBeDefined();
    expect(p2Call![3]).toBeCloseTo(0.5, 5);
  });

  it('includes KO\'d players who dealt damage', async () => {
    const contributors = [
      { playerId: 'p1', roomDamage: 100, roomHealing: 0 },
      { playerId: 'p2', roomDamage: 50, roomHealing: 50 },
    ];

    const result = await distributeRoomLoot(contributors, 'elite', 1, ['mob-1']);

    // Both contributors get loot entries
    expect(result['p1']).toBeDefined();
    expect(result['p2']).toBeDefined();
    expect(rollAndGrantLoot).toHaveBeenCalledTimes(2);
  });

  it('uses higher loot multiplier for boss rooms', async () => {
    const contributors = [
      { playerId: 'p1', roomDamage: 100, roomHealing: 0 },
    ];

    // Trash: multiplier = 1.0
    await distributeRoomLoot(contributors, 'trash', 1, ['mob-1']);
    const trashCall = (rollAndGrantLoot as ReturnType<typeof vi.fn>).mock.calls[0];

    vi.clearAllMocks();

    // Final boss: multiplier = 3.0
    await distributeRoomLoot(contributors, 'final_boss', 1, ['mob-1']);
    const bossCall = (rollAndGrantLoot as ReturnType<typeof vi.fn>).mock.calls[0];

    // Solo player, ratio = 1.0, so dropMultiplier = ratio * count * lootMult = 1 * 1 * mult
    // Trash: 1 * 1 * 1.0 = 1.0, Boss: 1 * 1 * 3.0 = clamped to 2.0
    expect(trashCall![3]).toBeCloseTo(1.0, 5);
    expect(bossCall![3]).toBeCloseTo(2.0, 5); // clamped at 2
  });

  it('scales mob level by tier', async () => {
    const contributors = [
      { playerId: 'p1', roomDamage: 100, roomHealing: 0 },
    ];

    await distributeRoomLoot(contributors, 'trash', 2, ['mob-1']);

    // tier 2 → mobLevel = 10
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p1', 'mob-1', 10, expect.any(Number));
  });

  it('rolls loot for each mob template', async () => {
    const contributors = [
      { playerId: 'p1', roomDamage: 100, roomHealing: 0 },
    ];

    await distributeRoomLoot(contributors, 'trash', 1, ['mob-1', 'mob-2', 'mob-3']);

    // 1 contributor × 3 mobs = 3 calls
    expect(rollAndGrantLoot).toHaveBeenCalledTimes(3);
  });

  it('enriches loot drops with item names', async () => {
    const mockDrops = [
      { itemTemplateId: 'tmpl-1', quantity: 2, rarity: 'common' },
    ];
    const mockEnriched = [
      { itemTemplateId: 'tmpl-1', quantity: 2, rarity: 'common', itemName: 'Iron Ore' },
    ];
    (rollAndGrantLoot as ReturnType<typeof vi.fn>).mockResolvedValue(mockDrops);
    (enrichLootWithNames as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnriched);

    const contributors = [
      { playerId: 'p1', roomDamage: 100, roomHealing: 0 },
    ];

    const result = await distributeRoomLoot(contributors, 'trash', 1, ['mob-1']);

    expect(enrichLootWithNames).toHaveBeenCalledWith(mockDrops);
    expect(result['p1']!.loot).toEqual([
      { itemTemplateId: 'tmpl-1', quantity: 2, rarity: 'common', itemName: 'Iron Ore' },
    ]);
  });

  it('splits evenly when total contribution is zero', async () => {
    const contributors = [
      { playerId: 'p1', roomDamage: 0, roomHealing: 0 },
      { playerId: 'p2', roomDamage: 0, roomHealing: 0 },
    ];

    await distributeRoomLoot(contributors, 'trash', 1, ['mob-1']);

    // ratio = 1/2 = 0.5, multiplier = max(0.5, min(2, 0.5*2*1.0)) = 1.0
    for (const call of (rollAndGrantLoot as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[3]).toBeCloseTo(1.0, 5);
    }
  });
});

describe('awardRoomTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
  });

  it('calculates correct tokens for room type and tier', async () => {
    const members = [{ playerId: 'p1' }, { playerId: 'p2' }];

    const tokens = await awardRoomTokens(members, 'elite', 1);

    const expected = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM.elite * EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[0];
    expect(tokens).toBe(expected);
  });

  it('increments expeditionTokens for all members via updateMany', async () => {
    const members = [{ playerId: 'p1' }, { playerId: 'p2' }, { playerId: 'p3' }];

    await awardRoomTokens(members, 'trash', 1);

    expect(mockPrisma.player.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2', 'p3'] } },
      data: { expeditionTokens: { increment: expect.any(Number) } },
    });
  });

  it('scales tokens by tier multiplier', async () => {
    const members = [{ playerId: 'p1' }];

    const tier1 = await awardRoomTokens(members, 'final_boss', 1);
    vi.clearAllMocks();
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
    const tier2 = await awardRoomTokens(members, 'final_boss', 2);

    expect(tier2).toBe(tier1 * EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[1] / EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[0]);
  });

  it('returns correct tokens for final_boss room', async () => {
    const members = [{ playerId: 'p1' }];

    const tokens = await awardRoomTokens(members, 'final_boss', 2);

    const expected = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM.final_boss * EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[1];
    expect(tokens).toBe(expected);
  });
});

describe('awardCompletionBonus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
  });

  it('calculates correct bonus from room types and tier', async () => {
    const members = [{ playerId: 'p1' }];
    const roomTypes: Array<'trash' | 'elite' | 'final_boss'> = ['trash', 'elite', 'final_boss'];

    const bonus = await awardCompletionBonus(members, 1, roomTypes);

    let expectedTotal = 0;
    for (const rt of roomTypes) {
      expectedTotal += EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[rt] * EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[0];
    }
    const expectedBonus = Math.floor(expectedTotal * EXPEDITION_CONSTANTS.COMPLETION_BONUS_MULTIPLIER);
    expect(bonus).toBe(expectedBonus);
  });

  it('increments tokens for all members via updateMany', async () => {
    const members = [{ playerId: 'p1' }, { playerId: 'p2' }];
    const roomTypes: Array<'trash' | 'elite'> = ['trash', 'elite'];

    await awardCompletionBonus(members, 1, roomTypes);

    expect(mockPrisma.player.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      data: { expeditionTokens: { increment: expect.any(Number) } },
    });
  });

  it('scales bonus by tier', async () => {
    const members = [{ playerId: 'p1' }];
    const roomTypes: Array<'trash'> = ['trash'];

    const tier1 = await awardCompletionBonus(members, 1, roomTypes);
    vi.clearAllMocks();
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
    const tier2 = await awardCompletionBonus(members, 2, roomTypes);

    expect(tier2).toBe(tier1 * EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[1] / EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[0]);
  });

  it('returns zero bonus when no rooms', async () => {
    const members = [{ playerId: 'p1' }];

    const bonus = await awardCompletionBonus(members, 1, []);

    expect(bonus).toBe(0);
    expect(mockPrisma.player.updateMany).not.toHaveBeenCalled();
  });
});
