import { Prisma, prisma } from '@pocketrealm/database';
import { characterLevelFromXp, levelFromXp } from '@pocketrealm/game-engine';
import { redis } from '../redis';
import { getCategories } from './leaderboardService';
import { refreshSeasonCache } from './seasonCacheService';
import { leaderboardKey } from './leaderboardKeys';
import { SEASON_STATUSES } from './season.constants';
import { transferCrownsToPlayerTx } from './crownService';
import { invalidateCrownCollectorSnapshot } from './crownLeaderboardService';

export interface MergeLog {
  items: { transferred: number; deleted: number };
  gold: { amount: number };
  skillXp: Record<string, number>;
  characterXp: { amount: number };
  achievements: { merged: number };
  crowns: { merged: number };
  bestiary: { merged: number };
  recipes: { merged: number };
  zoneDiscoveries: { merged: number };
}

export const EMPTY_MERGE_LOG: MergeLog = {
  items: { transferred: 0, deleted: 0 },
  gold: { amount: 0 },
  skillXp: {},
  characterXp: { amount: 0 },
  achievements: { merged: 0 },
  crowns: { merged: 0 },
  bestiary: { merged: 0 },
  recipes: { merged: 0 },
  zoneDiscoveries: { merged: 0 },
};

function cloneEmptyMergeLog(): MergeLog {
  return {
    items: { transferred: 0, deleted: 0 },
    gold: { amount: 0 },
    skillXp: {},
    characterXp: { amount: 0 },
    achievements: { merged: 0 },
    crowns: { merged: 0 },
    bestiary: { merged: 0 },
    recipes: { merged: 0 },
    zoneDiscoveries: { merged: 0 },
  };
}

async function snapshotLeaderboardRanks(seasonId: string, playerId: string): Promise<Record<string, number>> {
  const categories = getCategories().groups.flatMap((group) => group.categories.map((category) => category.slug));
  const ranks: Record<string, number> = {};

  await Promise.all(categories.map(async (category) => {
    const rank = await redis.zrevrank(leaderboardKey(category, seasonId), playerId);
    if (typeof rank === 'number') {
      ranks[category] = rank + 1;
    }
  }));

  return ranks;
}

function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const isolationLevel = Prisma.TransactionIsolationLevel?.Serializable;

  if (!isolationLevel) {
    return prisma.$transaction(operation);
  }

  return prisma.$transaction(operation, { isolationLevel });
}

async function mergeSeasonalPlayerTx(
  tx: Prisma.TransactionClient,
  seasonalPlayerId: string,
  permanentPlayerId: string,
  _seasonId: string,
): Promise<MergeLog> {
  const log = cloneEmptyMergeLog();

  const [seasonal, permanent] = await Promise.all([
    tx.player.findUniqueOrThrow({
      where: { id: seasonalPlayerId },
      select: {
        gold: true,
        characterXp: true,
      },
    }),
    tx.player.findUniqueOrThrow({
      where: { id: permanentPlayerId },
      select: {
        characterXp: true,
        characterLevel: true,
        attributePoints: true,
      },
    }),
  ]);

  const transferableItems = await tx.item.findMany({
    where: {
      ownerId: seasonalPlayerId,
      template: { seasonId: null },
    },
    select: { id: true },
  });
  if (transferableItems.length > 0) {
    await tx.item.updateMany({
      where: { id: { in: transferableItems.map((item) => item.id) } },
      data: { ownerId: permanentPlayerId, inStash: true },
    });
  }
  log.items.transferred = transferableItems.length;

  const deleted = await tx.item.deleteMany({
    where: {
      ownerId: seasonalPlayerId,
      template: { seasonId: { not: null } },
    },
  });
  log.items.deleted = deleted.count;

  log.gold.amount = seasonal.gold;
  if (seasonal.gold > 0) {
    await tx.player.update({
      where: { id: permanentPlayerId },
      data: { gold: { increment: seasonal.gold } },
    });
  }

  const permanentSkills = await tx.playerSkill.findMany({
    where: { playerId: permanentPlayerId },
    select: {
      skillType: true,
      xp: true,
    },
  });
  const permanentSkillMap = new Map(
    permanentSkills.map((skill) => [skill.skillType, Number(skill.xp)]),
  );

  const seasonalSkills = await tx.playerSkill.findMany({
    where: { playerId: seasonalPlayerId },
    select: { skillType: true, xp: true },
  });
  for (const skill of seasonalSkills) {
    const xpEarned = Number(skill.xp);
    if (xpEarned <= 0) {
      continue;
    }

    log.skillXp[skill.skillType] = xpEarned;
    const nextTotalXp = (permanentSkillMap.get(skill.skillType) ?? 0) + xpEarned;
    await tx.playerSkill.upsert({
      where: {
        playerId_skillType: {
          playerId: permanentPlayerId,
          skillType: skill.skillType,
        },
      },
      update: {
        xp: BigInt(nextTotalXp),
        level: levelFromXp(nextTotalXp),
      },
      create: {
        playerId: permanentPlayerId,
        skillType: skill.skillType,
        xp: BigInt(nextTotalXp),
        level: levelFromXp(nextTotalXp),
      },
    });
    permanentSkillMap.set(skill.skillType, nextTotalXp);
  }

  log.characterXp.amount = Number(seasonal.characterXp);
  if (log.characterXp.amount > 0) {
    const nextCharacterXp = Number(permanent.characterXp) + log.characterXp.amount;
    const nextCharacterLevel = characterLevelFromXp(nextCharacterXp);
    const levelDiff = Math.max(0, nextCharacterLevel - permanent.characterLevel);

    await tx.player.update({
      where: { id: permanentPlayerId },
      data: {
        characterXp: BigInt(nextCharacterXp),
        characterLevel: nextCharacterLevel,
        attributePoints: levelDiff > 0
          ? { increment: levelDiff }
          : undefined,
      },
    });
  }

  const seasonalAchievements = await tx.playerAchievement.findMany({
    where: { playerId: seasonalPlayerId },
  });
  for (const achievement of seasonalAchievements) {
    const existing = await tx.playerAchievement.findUnique({
      where: {
        playerId_achievementId: {
          playerId: permanentPlayerId,
          achievementId: achievement.achievementId,
        },
      },
    });

    if (!existing) {
      await tx.playerAchievement.create({
        data: {
          playerId: permanentPlayerId,
          achievementId: achievement.achievementId,
          unlockedAt: achievement.unlockedAt,
          rewardClaimed: achievement.rewardClaimed,
        },
      });
      log.achievements.merged++;
      continue;
    }

    if (achievement.unlockedAt < existing.unlockedAt) {
      await tx.playerAchievement.update({
        where: {
          playerId_achievementId: {
            playerId: permanentPlayerId,
            achievementId: achievement.achievementId,
          },
        },
        data: {
          unlockedAt: achievement.unlockedAt,
          rewardClaimed: existing.rewardClaimed || achievement.rewardClaimed,
        },
      });
    }
  }

  log.crowns.merged = await transferCrownsToPlayerTx(tx, seasonalPlayerId, permanentPlayerId);

  const seasonalBestiary = await tx.playerBestiary.findMany({
    where: { playerId: seasonalPlayerId },
  });
  for (const entry of seasonalBestiary) {
    const existing = await tx.playerBestiary.findUnique({
      where: {
        playerId_mobTemplateId: {
          playerId: permanentPlayerId,
          mobTemplateId: entry.mobTemplateId,
        },
      },
    });

    if (existing) {
      await tx.playerBestiary.update({
        where: {
          playerId_mobTemplateId: {
            playerId: permanentPlayerId,
            mobTemplateId: entry.mobTemplateId,
          },
        },
        data: {
          kills: { increment: entry.kills },
          firstEncounteredAt: entry.firstEncounteredAt < existing.firstEncounteredAt
            ? entry.firstEncounteredAt
            : existing.firstEncounteredAt,
        },
      });
    } else {
      await tx.playerBestiary.create({
        data: {
          playerId: permanentPlayerId,
          mobTemplateId: entry.mobTemplateId,
          kills: entry.kills,
          firstEncounteredAt: entry.firstEncounteredAt,
        },
      });
    }

    log.bestiary.merged++;
  }

  const seasonalPrefixes = await tx.playerBestiaryPrefix.findMany({
    where: { playerId: seasonalPlayerId },
  });
  for (const entry of seasonalPrefixes) {
    const existing = await tx.playerBestiaryPrefix.findUnique({
      where: {
        playerId_mobTemplateId_prefix: {
          playerId: permanentPlayerId,
          mobTemplateId: entry.mobTemplateId,
          prefix: entry.prefix,
        },
      },
    });

    if (existing) {
      await tx.playerBestiaryPrefix.update({
        where: {
          playerId_mobTemplateId_prefix: {
            playerId: permanentPlayerId,
            mobTemplateId: entry.mobTemplateId,
            prefix: entry.prefix,
          },
        },
        data: {
          kills: { increment: entry.kills },
          firstSeenAt: entry.firstSeenAt < existing.firstSeenAt
            ? entry.firstSeenAt
            : existing.firstSeenAt,
        },
      });
    } else {
      await tx.playerBestiaryPrefix.create({
        data: {
          playerId: permanentPlayerId,
          mobTemplateId: entry.mobTemplateId,
          prefix: entry.prefix,
          kills: entry.kills,
          firstSeenAt: entry.firstSeenAt,
        },
      });
    }
  }

  const seasonalRecipes = await tx.playerRecipe.findMany({
    where: {
      playerId: seasonalPlayerId,
      recipe: { seasonId: null },
    },
    select: { recipeId: true, learnedAt: true },
  });
  for (const recipe of seasonalRecipes) {
    const existing = await tx.playerRecipe.findUnique({
      where: {
        playerId_recipeId: {
          playerId: permanentPlayerId,
          recipeId: recipe.recipeId,
        },
      },
    });

    if (!existing) {
      await tx.playerRecipe.create({
        data: {
          playerId: permanentPlayerId,
          recipeId: recipe.recipeId,
          learnedAt: recipe.learnedAt,
        },
      });
      log.recipes.merged++;
    }
  }

  const seasonalDiscoveries = await tx.playerZoneDiscovery.findMany({
    where: {
      playerId: seasonalPlayerId,
      zone: { seasonId: null },
    },
    select: { zoneId: true, discoveredAt: true },
  });
  for (const discovery of seasonalDiscoveries) {
    const existing = await tx.playerZoneDiscovery.findUnique({
      where: {
        playerId_zoneId: {
          playerId: permanentPlayerId,
          zoneId: discovery.zoneId,
        },
      },
    });

    if (!existing) {
      await tx.playerZoneDiscovery.create({
        data: {
          playerId: permanentPlayerId,
          zoneId: discovery.zoneId,
          discoveredAt: discovery.discoveredAt,
        },
      });
      log.zoneDiscoveries.merged++;
    }
  }

  return log;
}

export async function mergeSeasonalPlayer(
  seasonalPlayerId: string,
  permanentPlayerId: string,
  seasonId: string,
): Promise<MergeLog> {
  const log = await prisma.$transaction((tx) =>
    mergeSeasonalPlayerTx(tx, seasonalPlayerId, permanentPlayerId, seasonId));

  if (log.crowns.merged > 0) {
    await invalidateCrownCollectorSnapshot();
  }

  return log;
}

export async function createSeasonArchive(
  seasonalPlayerId: string,
  accountId: string,
  seasonId: string,
  mergeLog: MergeLog,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const player = await tx.player.findUniqueOrThrow({
    where: { id: seasonalPlayerId },
    include: {
      skills: {
        orderBy: { skillType: 'asc' },
      },
      stats: true,
    },
  });

  const combatTemplates = await tx.combatTemplate.findMany({
    where: { playerId: seasonalPlayerId },
    include: {
      slots: {
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const leaderboardRanks = await snapshotLeaderboardRanks(seasonId, seasonalPlayerId);
  const stats = player.stats
    ? {
        totalCrafts: player.stats.totalCrafts,
        totalTurnsSpent: player.stats.totalTurnsSpent,
        totalDeaths: player.stats.totalDeaths,
        peakGoldHeld: player.stats.peakGoldHeld,
        totalBetsPlaced: player.stats.totalBetsPlaced,
        totalGoldWagered: player.stats.totalGoldWagered,
      }
    : {};

  await tx.seasonArchive.upsert({
    where: {
      accountId_seasonId: {
        accountId,
        seasonId,
      },
    },
    update: {
      username: player.username,
      characterLevel: player.characterLevel,
      characterXp: player.characterXp,
      attributes: player.attributes as Prisma.InputJsonValue,
      skills: player.skills.map((skill) => ({
        skillType: skill.skillType,
        level: skill.level,
        xp: Number(skill.xp),
      })) as Prisma.InputJsonValue,
      stats: stats as Prisma.InputJsonValue,
      combatTemplates: combatTemplates.map((template) => ({
        name: template.name,
        isActive: template.isActive,
        slots: template.slots.map((slot) => ({
          actionId: slot.actionId,
          sortOrder: slot.sortOrder,
          conditionType: slot.conditionType,
          resource: slot.resource,
          threshold: slot.threshold,
          effectName: slot.effectName,
          thenActionId: slot.thenActionId,
        })),
      })) as Prisma.InputJsonValue,
      leaderboardRanks: leaderboardRanks as Prisma.InputJsonValue,
      mergeLog: mergeLog as unknown as Prisma.InputJsonValue,
    },
    create: {
      accountId,
      seasonId,
      username: player.username,
      characterLevel: player.characterLevel,
      characterXp: player.characterXp,
      attributes: player.attributes as Prisma.InputJsonValue,
      skills: player.skills.map((skill) => ({
        skillType: skill.skillType,
        level: skill.level,
        xp: Number(skill.xp),
      })) as Prisma.InputJsonValue,
      stats: stats as Prisma.InputJsonValue,
      combatTemplates: combatTemplates.map((template) => ({
        name: template.name,
        isActive: template.isActive,
        slots: template.slots.map((slot) => ({
          actionId: slot.actionId,
          sortOrder: slot.sortOrder,
          conditionType: slot.conditionType,
          resource: slot.resource,
          threshold: slot.threshold,
          effectName: slot.effectName,
          thenActionId: slot.thenActionId,
        })),
      })) as Prisma.InputJsonValue,
      leaderboardRanks: leaderboardRanks as Prisma.InputJsonValue,
      mergeLog: mergeLog as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function runSeasonMerge(seasonId: string): Promise<{ merged: number; errors: string[] }> {
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { id: true, status: true },
  });
  if (season.status !== SEASON_STATUSES.ENDED) {
    throw new Error('Season must be in "ended" state to merge');
  }

  const seasonalPlayers = await prisma.player.findMany({
    where: { seasonId, isBot: false },
    select: { id: true, accountId: true },
  });

  let merged = 0;
  const errors: string[] = [];
  let crownCollectorsChanged = false;

  for (const seasonalPlayer of seasonalPlayers) {
    try {
      const mergeLog = await runSerializableTransaction(async (tx) => {
        const permanent = await tx.player.findFirst({
          where: {
            accountId: seasonalPlayer.accountId,
            seasonId: null,
            isBot: false,
          },
          select: { id: true },
        });
        if (!permanent) {
          throw new Error(`No permanent player for account ${seasonalPlayer.accountId}`);
        }

        await createSeasonArchive(
          seasonalPlayer.id,
          seasonalPlayer.accountId,
          seasonId,
          cloneEmptyMergeLog(),
          tx,
        );

        const mergeLog = await mergeSeasonalPlayerTx(
          tx,
          seasonalPlayer.id,
          permanent.id,
          seasonId,
        );

        await tx.seasonArchive.update({
          where: {
            accountId_seasonId: {
              accountId: seasonalPlayer.accountId,
              seasonId,
            },
          },
          data: {
            mergeLog: mergeLog as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.account.updateMany({
          where: {
            id: seasonalPlayer.accountId,
            activePlayerId: seasonalPlayer.id,
          },
          data: { activePlayerId: permanent.id },
        });

        await tx.player.delete({
          where: { id: seasonalPlayer.id },
        });

        return mergeLog;
      });

      if (mergeLog.crowns.merged > 0) {
        crownCollectorsChanged = true;
      }
      merged++;
    } catch (error) {
      errors.push(`Failed to merge player ${seasonalPlayer.id}: ${(error as Error).message}`);
    }
  }

  if (errors.length === 0) {
    await runSerializableTransaction(async (tx) => {
      const seasonalBots = await tx.player.findMany({
        where: { seasonId, isBot: true },
        select: { id: true },
      });
      for (const bot of seasonalBots) {
        await tx.player.delete({
          where: { id: bot.id },
        });
      }

      await tx.guild.deleteMany({
        where: { seasonId },
      });

      await tx.season.update({
        where: { id: seasonId },
        data: { status: SEASON_STATUSES.ARCHIVED },
      });
    });

    await refreshSeasonCache();

    if (crownCollectorsChanged) {
      await invalidateCrownCollectorSnapshot();
    }
  }

  return { merged, errors };
}
