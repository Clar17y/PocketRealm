import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

const mocks = vi.hoisted(() => ({
  zrevrank: vi.fn(),
  grantSkillXp: vi.fn(),
  refreshSeasonCache: vi.fn(),
  getCategories: vi.fn(() => ({ groups: [] })),
  characterLevelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
  levelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
  invalidateCrownCollectorSnapshot: vi.fn().mockResolvedValue(undefined),
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock('../redis', () => ({
  redis: {
    zrevrank: mocks.zrevrank,
  },
}));

vi.mock('./xpService', () => ({
  grantSkillXp: mocks.grantSkillXp,
}));

vi.mock('./seasonCacheService', () => ({
  refreshSeasonCache: mocks.refreshSeasonCache,
}));

vi.mock('./leaderboardService', () => ({
  getCategories: mocks.getCategories,
}));

vi.mock('./crownLeaderboardService', () => ({
  invalidateCrownCollectorSnapshot: mocks.invalidateCrownCollectorSnapshot,
}));

vi.mock('../logger', () => ({ logger: mocks.logger }));

vi.mock('@pocketrealm/game-engine', () => ({
  characterLevelFromXp: mocks.characterLevelFromXp,
  levelFromXp: mocks.levelFromXp,
}));

import { prisma } from '@pocketrealm/database';
import { mergeSeasonalPlayer, runSeasonMerge } from './seasonMergeService';

const mockPrisma = prisma as any;

describe('seasonMergeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrisma));
    mockPrisma.playerCrown.findMany.mockResolvedValue([]);
    mockPrisma.playerCrown.createMany.mockResolvedValue({ count: 0 });
    mocks.invalidateCrownCollectorSnapshot.mockResolvedValue(undefined);
  });

  it('merges transferable data and folds seasonal skill xp into the permanent player inside the transaction', async () => {
    mockPrisma.player.findUniqueOrThrow
      .mockResolvedValueOnce({ gold: 25, characterXp: 200n })
      .mockResolvedValueOnce({ characterXp: 500n, characterLevel: 5, attributePoints: 2 });
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'item-1' }]);
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.playerSkill.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ skillType: 'woodcutting', xp: 120n }]);
    mockPrisma.playerSkill.upsert.mockResolvedValue({});
    mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiaryPrefix.findMany.mockResolvedValue([]);
    mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);
    mockPrisma.player.update.mockResolvedValue({});

    const result = await mergeSeasonalPlayer('seasonal-1', 'perm-1', 'season-1');

    expect(result).toEqual({
      items: { transferred: 1, deleted: 2 },
      gold: { amount: 25 },
      skillXp: { woodcutting: 120 },
      characterXp: { amount: 200 },
      achievements: { merged: 0 },
      crowns: { merged: 0 },
      bestiary: { merged: 0 },
      recipes: { merged: 0 },
      zoneDiscoveries: { merged: 0 },
    });
    expect(mocks.invalidateCrownCollectorSnapshot).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] } },
      data: { ownerId: 'perm-1', inStash: true },
    });
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'perm-1' },
      data: { gold: { increment: 25 } },
    });
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'perm-1' },
      data: {
        characterXp: 700n,
        characterLevel: 7,
        attributePoints: { increment: 2 },
      },
    });
    expect(mockPrisma.playerSkill.upsert).toHaveBeenCalledWith({
      where: {
        playerId_skillType: {
          playerId: 'perm-1',
          skillType: 'woodcutting',
        },
      },
      update: {
        xp: 120n,
        level: 1,
      },
      create: {
        playerId: 'perm-1',
        skillType: 'woodcutting',
        xp: 120n,
        level: 1,
      },
    });
  });

  it('transfers seasonal crowns to the permanent player before deletion', async () => {
    const awardedAt = new Date('2026-04-20T00:00:00.000Z');
    const weekStart = new Date('2026-04-13T00:00:00.000Z');
    mockPrisma.player.findUniqueOrThrow
      .mockResolvedValueOnce({ gold: 0, characterXp: 0n })
      .mockResolvedValueOnce({ characterXp: 0n, characterLevel: 1, attributePoints: 0 });
    mockPrisma.item.findMany.mockResolvedValue([]);
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.playerSkill.findMany.mockResolvedValue([]);
    mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
    mockPrisma.playerCrown.findMany.mockResolvedValue([
      { category: 'pvp_wins', realmId: 'season-1', rank: 1, weekStart, awardedAt },
    ]);
    mockPrisma.playerCrown.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiaryPrefix.findMany.mockResolvedValue([]);
    mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);

    const result = await mergeSeasonalPlayer('seasonal-1', 'perm-1', 'season-1');

    expect(result.crowns).toEqual({ merged: 1 });
    expect(mocks.invalidateCrownCollectorSnapshot).toHaveBeenCalledTimes(1);
    expect(mockPrisma.playerCrown.createMany).toHaveBeenCalledWith({
      data: [{
        playerId: 'perm-1',
        category: 'pvp_wins',
        realmId: 'season-1',
        rank: 1,
        weekStart,
        awardedAt,
      }],
      skipDuplicates: true,
    });
  });

  it('returns the merge log when crown collector invalidation fails after a direct crown transfer', async () => {
    const err = new Error('redis unavailable');
    mockPrisma.player.findUniqueOrThrow
      .mockResolvedValueOnce({ gold: 0, characterXp: 0n })
      .mockResolvedValueOnce({ characterXp: 0n, characterLevel: 1, attributePoints: 0 });
    mockPrisma.item.findMany.mockResolvedValue([]);
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.playerSkill.findMany.mockResolvedValue([]);
    mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
    mockPrisma.playerCrown.findMany.mockResolvedValue([
      {
        category: 'pvp_wins',
        realmId: 'season-1',
        rank: 1,
        weekStart: new Date('2026-04-13T00:00:00.000Z'),
        awardedAt: new Date('2026-04-20T00:00:00.000Z'),
      },
    ]);
    mockPrisma.playerCrown.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiaryPrefix.findMany.mockResolvedValue([]);
    mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);
    mocks.invalidateCrownCollectorSnapshot.mockRejectedValue(err);

    await expect(mergeSeasonalPlayer('seasonal-1', 'perm-1', 'season-1')).resolves.toMatchObject({
      crowns: { merged: 1 },
    });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      { err },
      'Failed to invalidate crown collector snapshot after seasonal crown transfer',
    );
  });

  it('archives merged seasons and refreshes the cache after cleanup', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({ id: 'season-1', status: 'ended' });
    mockPrisma.player.findMany
      .mockResolvedValueOnce([{ id: 'seasonal-1', accountId: 'account-1' }])
      .mockResolvedValueOnce([{ id: 'bot-1' }]);
    mockPrisma.player.findFirst.mockResolvedValue({ id: 'perm-1' });
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({
      id: 'seasonal-1',
      username: 'Rook',
      characterLevel: 12,
      characterXp: 1200n,
      attributes: { vitality: 3 },
      skills: [],
      stats: null,
    });
    mockPrisma.combatTemplate.findMany.mockResolvedValue([]);
    mockPrisma.seasonArchive.upsert.mockResolvedValue({});
    mockPrisma.item.findMany.mockResolvedValue([]);
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.playerSkill.findMany.mockResolvedValue([]);
    mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiaryPrefix.findMany.mockResolvedValue([]);
    mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);
    mockPrisma.seasonArchive.update.mockResolvedValue({});
    mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.player.delete.mockResolvedValue({});
    mockPrisma.guild.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.season.update.mockResolvedValue({});

    const result = await runSeasonMerge('season-1');

    expect(result).toEqual({ merged: 1, errors: [] });
    expect(mockPrisma.seasonArchive.upsert).toHaveBeenCalled();
    expect(mockPrisma.seasonArchive.update).toHaveBeenCalledWith({
      where: {
        accountId_seasonId: {
          accountId: 'account-1',
          seasonId: 'season-1',
        },
      },
      data: {
        mergeLog: expect.any(Object),
      },
    });
    expect(mockPrisma.player.delete).toHaveBeenCalledWith({ where: { id: 'seasonal-1' } });
    expect(mockPrisma.player.delete).toHaveBeenCalledWith({ where: { id: 'bot-1' } });
    expect(mockPrisma.guild.deleteMany).toHaveBeenCalledWith({ where: { seasonId: 'season-1' } });
    expect(mockPrisma.season.update).toHaveBeenCalledWith({
      where: { id: 'season-1' },
      data: { status: 'archived' },
    });
    expect(mocks.refreshSeasonCache).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateCrownCollectorSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the season ended when any player merge fails', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({ id: 'season-1', status: 'ended' });
    mockPrisma.player.findMany
      .mockResolvedValueOnce([
        { id: 'seasonal-1', accountId: 'account-1' },
        { id: 'seasonal-2', accountId: 'account-2' },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.player.findFirst
      .mockResolvedValueOnce({ id: 'perm-1' })
      .mockResolvedValueOnce(null);
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({
      id: 'seasonal-1',
      username: 'Rook',
      characterLevel: 12,
      characterXp: 1200n,
      attributes: { vitality: 3 },
      skills: [],
      stats: null,
    });
    mockPrisma.combatTemplate.findMany.mockResolvedValue([]);
    mockPrisma.seasonArchive.upsert.mockResolvedValue({});
    mockPrisma.item.findMany.mockResolvedValue([]);
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.playerSkill.findMany.mockResolvedValue([]);
    mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiaryPrefix.findMany.mockResolvedValue([]);
    mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);
    mockPrisma.seasonArchive.update.mockResolvedValue({});
    mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.player.delete.mockResolvedValue({});
    mockPrisma.guild.deleteMany.mockResolvedValue({ count: 0 });

    const result = await runSeasonMerge('season-1');

    expect(result).toEqual({
      merged: 1,
      errors: ['Failed to merge player seasonal-2: No permanent player for account account-2'],
    });
    expect(mockPrisma.season.update).not.toHaveBeenCalled();
    expect(mockPrisma.guild.deleteMany).not.toHaveBeenCalled();
    expect(mocks.refreshSeasonCache).not.toHaveBeenCalled();
  });

  it('invalidates crown collector snapshot after committed crown transfers even when a later player merge fails', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({ id: 'season-1', status: 'ended' });
    mockPrisma.player.findMany.mockReset();
    mockPrisma.player.findMany.mockResolvedValueOnce([
      { id: 'seasonal-1', accountId: 'account-1' },
      { id: 'seasonal-2', accountId: 'account-2' },
    ]);
    mockPrisma.player.findFirst
      .mockResolvedValueOnce({ id: 'perm-1' })
      .mockResolvedValueOnce(null);
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({
      id: 'seasonal-1',
      username: 'Rook',
      characterLevel: 12,
      characterXp: 1200n,
      attributes: { vitality: 3 },
      skills: [],
      stats: null,
    });
    mockPrisma.combatTemplate.findMany.mockResolvedValue([]);
    mockPrisma.seasonArchive.upsert.mockResolvedValue({});
    mockPrisma.item.findMany.mockResolvedValue([]);
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.playerSkill.findMany.mockResolvedValue([]);
    mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
    mockPrisma.playerCrown.findMany.mockResolvedValue([
      {
        category: 'pvp_wins',
        realmId: 'season-1',
        rank: 1,
        weekStart: new Date('2026-04-13T00:00:00.000Z'),
        awardedAt: new Date('2026-04-20T00:00:00.000Z'),
      },
    ]);
    mockPrisma.playerCrown.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiaryPrefix.findMany.mockResolvedValue([]);
    mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);
    mockPrisma.seasonArchive.update.mockResolvedValue({});
    mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.player.delete.mockResolvedValue({});

    const result = await runSeasonMerge('season-1');

    expect(result).toEqual({
      merged: 1,
      errors: ['Failed to merge player seasonal-2: No permanent player for account account-2'],
    });
    expect(mocks.invalidateCrownCollectorSnapshot).toHaveBeenCalledTimes(1);
    expect(mockPrisma.season.update).not.toHaveBeenCalled();
    expect(mocks.refreshSeasonCache).not.toHaveBeenCalled();
  });
});
