import { Prisma, prisma } from '@pocketrealm/database';
import { redis } from '../redis';

interface SeasonRewardDefinition {
  title?: string;
  exclusiveItemTemplateId?: string;
  exclusiveItemTemplateIds?: string[];
  achievementId?: string;
  achievementIds?: string[];
}

function seasonLeaderboardKey(seasonId: string, category: string): string {
  return `leaderboard:${seasonId}:${category}`;
}

function seasonLeaderboardMetaKey(seasonId: string, category: string): string {
  return `leaderboard:meta:${seasonId}:${category}`;
}

function rewardItemTemplateIds(rewards: SeasonRewardDefinition): string[] {
  const ids = [
    ...(rewards.exclusiveItemTemplateId ? [rewards.exclusiveItemTemplateId] : []),
    ...(Array.isArray(rewards.exclusiveItemTemplateIds) ? rewards.exclusiveItemTemplateIds : []),
  ];
  return [...new Set(ids)];
}

function rewardAchievementIds(rewards: SeasonRewardDefinition): string[] {
  const ids = [
    ...(rewards.achievementId ? [rewards.achievementId] : []),
    ...(Array.isArray(rewards.achievementIds) ? rewards.achievementIds : []),
  ];
  return [...new Set(ids)];
}

async function appendRewardsToArchive(
  accountId: string,
  seasonId: string,
  category: string,
  rank: number,
  value: number,
  rewards: SeasonRewardDefinition,
): Promise<void> {
  const archive = await prisma.seasonArchive.findUnique({
    where: {
      accountId_seasonId: {
        accountId,
        seasonId,
      },
    },
    select: { rewardsEarned: true },
  });

  const rewardsEarned = {
    ...((archive?.rewardsEarned as Record<string, unknown> | null) ?? {}),
    [category]: {
      rank,
      value,
      rewards,
    },
  };

  await prisma.seasonArchive.updateMany({
    where: { accountId, seasonId },
    data: {
      rewardsEarned: rewardsEarned as Prisma.InputJsonValue,
    },
  });
}

async function applyRewardsToPermanentPlayer(
  accountId: string,
  rewards: SeasonRewardDefinition,
): Promise<void> {
  const permanentPlayer = await prisma.player.findFirst({
    where: { accountId, seasonId: null, isBot: false },
    select: { id: true },
  });
  if (!permanentPlayer) {
    return;
  }

  const achievementIds = rewardAchievementIds(rewards);
  for (const achievementId of achievementIds) {
    const existing = await prisma.playerAchievement.findUnique({
      where: {
        playerId_achievementId: {
          playerId: permanentPlayer.id,
          achievementId,
        },
      },
    });

    if (!existing) {
      await prisma.playerAchievement.create({
        data: {
          playerId: permanentPlayer.id,
          achievementId,
          rewardClaimed: false,
        },
      });
    }
  }

  const itemTemplateIds = rewardItemTemplateIds(rewards);
  for (const templateId of itemTemplateIds) {
    const template = await prisma.itemTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, maxDurability: true },
    });
    if (!template) {
      continue;
    }

    await prisma.item.create({
      data: {
        ownerId: permanentPlayer.id,
        templateId: template.id,
        rarity: 'common',
        quantity: 1,
        inStash: true,
        isSoulbound: true,
        maxDurability: template.maxDurability,
        currentDurability: template.maxDurability,
      },
    });
  }
}

export async function evaluateSeasonRewards(seasonId: string): Promise<{ entries: number }> {
  const rewardTiers = await prisma.seasonRewardTier.findMany({
    where: { seasonId },
    orderBy: [{ category: 'asc' }, { minRank: 'asc' }],
  });

  let totalEntries = 0;

  for (const tier of rewardTiers) {
    const rewards = (tier.rewards as SeasonRewardDefinition | null) ?? {};
    const members = await redis.zrevrange(
      seasonLeaderboardKey(seasonId, tier.category),
      tier.minRank - 1,
      tier.maxRank - 1,
      'WITHSCORES',
    );

    for (let index = 0; index < members.length; index += 2) {
      const playerId = members[index];
      const score = Number.parseFloat(members[index + 1] ?? '0');
      const rank = tier.minRank + (index / 2);
      if (!playerId) {
        continue;
      }

      const [metaStr, player] = await Promise.all([
        redis.hget(seasonLeaderboardMetaKey(seasonId, tier.category), playerId),
        prisma.player.findUnique({
          where: { id: playerId },
          select: { accountId: true, username: true },
        }),
      ]);

      if (!player) {
        continue;
      }

      const meta = metaStr ? JSON.parse(metaStr) as { username?: string } : {};
      const username = player.username ?? meta.username ?? 'Unknown';

      await prisma.hallOfFameEntry.upsert({
        where: {
          seasonId_category_rank: {
            seasonId,
            category: tier.category,
            rank,
          },
        },
        update: {
          accountId: player.accountId,
          username,
          value: score,
        },
        create: {
          seasonId,
          category: tier.category,
          rank,
          accountId: player.accountId,
          username,
          value: score,
        },
      });

      await appendRewardsToArchive(
        player.accountId,
        seasonId,
        tier.category,
        rank,
        score,
        rewards,
      );
      await applyRewardsToPermanentPlayer(player.accountId, rewards);
      totalEntries++;
    }
  }

  return { entries: totalEntries };
}
