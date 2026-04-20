import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

const mocks = vi.hoisted(() => ({
  zrevrank: vi.fn(),
  grantSkillXp: vi.fn(),
  refreshSeasonCache: vi.fn(),
  getCategories: vi.fn(() => ({ groups: [] })),
  characterLevelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
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

vi.mock('@pocketrealm/game-engine', () => ({
  characterLevelFromXp: mocks.characterLevelFromXp,
}));

import { prisma } from '@pocketrealm/database';
import { mergeSeasonalPlayer, runSeasonMerge } from './seasonMergeService';

const mockPrisma = prisma as any;

describe('seasonMergeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrisma));
  });

  it('merges transferable data and grants seasonal skill xp to the permanent player', async () => {
    mockPrisma.player.findUniqueOrThrow
      .mockResolvedValueOnce({ gold: 25, characterXp: 200n })
      .mockResolvedValueOnce({ characterXp: 500n, characterLevel: 5, attributePoints: 2 });
    mockPrisma.item.findMany.mockResolvedValue([{ id: 'item-1' }]);
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.playerSkill.findMany.mockResolvedValue([{ skillType: 'woodcutting', xp: 120n }]);
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
      bestiary: { merged: 0 },
      recipes: { merged: 0 },
      zoneDiscoveries: { merged: 0 },
    });
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
    expect(mocks.grantSkillXp).toHaveBeenCalledWith('perm-1', 'woodcutting', 120);
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
  });
});
