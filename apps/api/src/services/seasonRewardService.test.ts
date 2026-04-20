import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

const mocks = vi.hoisted(() => ({
  zrevrange: vi.fn(),
  hget: vi.fn(),
}));

vi.mock('../redis', () => ({
  redis: {
    zrevrange: mocks.zrevrange,
    hget: mocks.hget,
  },
}));

import { prisma } from '@pocketrealm/database';
import { evaluateSeasonRewards } from './seasonRewardService';

const mockPrisma = prisma as any;

describe('seasonRewardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates hall-of-fame rows, records archive rewards, and applies permanent rewards', async () => {
    mockPrisma.seasonRewardTier.findMany.mockResolvedValue([
      {
        category: 'pvp_rating',
        minRank: 1,
        maxRank: 1,
        rewards: {
          title: 'Season Champion',
          exclusiveItemTemplateId: 'template-1',
          achievementId: 'season_champion',
        },
      },
    ]);
    mocks.zrevrange.mockResolvedValue(['season-player-1', '1450']);
    mocks.hget.mockResolvedValue(JSON.stringify({ username: 'MetaName' }));
    mockPrisma.player.findUnique.mockResolvedValue({ accountId: 'account-1', username: 'Rook' });
    mockPrisma.hallOfFameEntry.upsert.mockResolvedValue({});
    mockPrisma.seasonArchive.findUnique.mockResolvedValue({ rewardsEarned: null });
    mockPrisma.seasonArchive.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.player.findFirst.mockResolvedValue({ id: 'perm-1' });
    mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);
    mockPrisma.playerAchievement.create.mockResolvedValue({});
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({ id: 'template-1', maxDurability: 100 });
    mockPrisma.item.create.mockResolvedValue({});

    const result = await evaluateSeasonRewards('season-1');

    expect(result).toEqual({ entries: 1 });
    expect(mockPrisma.hallOfFameEntry.upsert).toHaveBeenCalledWith({
      where: {
        seasonId_category_rank: {
          seasonId: 'season-1',
          category: 'pvp_rating',
          rank: 1,
        },
      },
      update: {
        accountId: 'account-1',
        username: 'Rook',
        value: 1450,
      },
      create: {
        seasonId: 'season-1',
        category: 'pvp_rating',
        rank: 1,
        accountId: 'account-1',
        username: 'Rook',
        value: 1450,
      },
    });
    expect(mockPrisma.seasonArchive.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', seasonId: 'season-1' },
      data: {
        rewardsEarned: {
          pvp_rating: {
            rank: 1,
            value: 1450,
            rewards: {
              title: 'Season Champion',
              exclusiveItemTemplateId: 'template-1',
              achievementId: 'season_champion',
            },
          },
        },
      },
    });
    expect(mockPrisma.playerAchievement.create).toHaveBeenCalledWith({
      data: {
        playerId: 'perm-1',
        achievementId: 'season_champion',
        rewardClaimed: false,
      },
    });
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'perm-1',
        templateId: 'template-1',
        rarity: 'common',
        quantity: 1,
        inStash: true,
        isSoulbound: true,
        maxDurability: 100,
        currentDurability: 100,
      },
    });
  });
});
