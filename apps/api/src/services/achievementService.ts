import {
  ALL_ACHIEVEMENTS,
  ACHIEVEMENTS_BY_STAT_KEY,
  ACHIEVEMENTS_BY_FAMILY_KEY,
  ACHIEVEMENTS_BY_ID,
} from '@pocketrealm/shared/constants/achievementDefinitions';
import { prisma } from '@pocketrealm/database';
import { refundPlayerTurnsTx } from './turnBankService';
import type { AchievementDef, PlayerAchievementProgress } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';
import { getIo } from '../socket';
import { broadcastAchievementActivity } from './chatActivityService';
import { resolveAllStats, resolveFamilyKills, resolveAllFamilyKills, resolveStats } from './statsService';

// Maps MobFamily DB name to the family key used in achievement definitions
const FAMILY_NAME_TO_KEY: Record<string, string> = {
  'Vermin': 'vermin', 'Spiders': 'spiders', 'Boars': 'boars',
  'Wolves': 'wolves', 'Bandits': 'bandits', 'Treants': 'treants',
  'Spirits': 'spirits', 'Fae': 'fae', 'Bats': 'bats',
  'Goblins': 'goblins', 'Golems': 'golems', 'Crawlers': 'crawlers',
  'Harpies': 'harpies', 'Undead': 'undead', 'Swamp Beasts': 'swampBeasts',
  'Witches': 'witches', 'Elementals': 'elementals', 'Serpents': 'serpents',
  'Abominations': 'abominations',
};

interface CheckOptions {
  statKeys?: string[];
  familyId?: string;
}

export async function checkAchievements(
  playerId: string,
  options: CheckOptions,
): Promise<AchievementDef[]> {
  // Resolve only the stats we need for the requested keys
  const neededStatKeys = options.statKeys ?? [];
  const [resolvedStats, unlocked] = await Promise.all([
    neededStatKeys.length > 0 ? resolveStats(playerId, neededStatKeys) : Promise.resolve({} as Record<string, number>),
    prisma.playerAchievement.findMany({ where: { playerId }, select: { achievementId: true } }),
  ]);

  const unlockedSet = new Set(unlocked.map((u) => u.achievementId));

  // Collect candidate achievements to check
  const candidates: AchievementDef[] = [];

  if (options.statKeys) {
    for (const key of options.statKeys) {
      const matching = ACHIEVEMENTS_BY_STAT_KEY.get(key) ?? [];
      candidates.push(...matching);
    }
  }

  let familyKey: string | undefined;
  let familyKills = 0;
  if (options.familyId) {
    const family = await prisma.mobFamily.findUnique({ where: { id: options.familyId } });
    if (family) {
      familyKey = FAMILY_NAME_TO_KEY[family.name];
      if (familyKey) {
        const matching = ACHIEVEMENTS_BY_FAMILY_KEY.get(familyKey) ?? [];
        candidates.push(...matching);
        familyKills = await resolveFamilyKills(playerId, options.familyId);
      }
    }
  }

  // Check each candidate and batch-insert all that meet threshold
  const toUnlock: AchievementDef[] = [];

  for (const achievement of candidates) {
    if (unlockedSet.has(achievement.id)) continue;

    let progress = 0;
    if (achievement.statKey) {
      progress = resolvedStats[achievement.statKey] ?? 0;
    } else if (achievement.familyKey && options.familyId) {
      progress = familyKills;
    }

    if (progress >= achievement.threshold) {
      toUnlock.push(achievement);
    }
  }

  if (toUnlock.length === 0) return [];

  // Batch insert with skipDuplicates to prevent TOCTOU race
  // where concurrent calls both see achievements as not-yet-unlocked
  const { count } = await prisma.playerAchievement.createMany({
    data: toUnlock.map(a => ({ playerId, achievementId: a.id })),
    skipDuplicates: true,
  });

  if (count === 0) return [];

  // count === toUnlock.length means all were new (common case).
  // count < toUnlock.length means a concurrent call beat us on some — return
  // all eligible since they ARE unlocked either way; duplicate notifications
  // are harmless and this avoids an extra DB round-trip on the hot path.
  return toUnlock;
}

export async function getPlayerAchievements(playerId: string): Promise<{
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
}> {
  const [allStats, unlocked, families] = await Promise.all([
    resolveAllStats(playerId),
    prisma.playerAchievement.findMany({ where: { playerId } }),
    prisma.mobFamily.findMany({ select: { id: true, name: true } }),
  ]);

  // Build family kill map by family key
  const familyIdToKey = new Map<string, string>();
  for (const f of families) {
    const key = FAMILY_NAME_TO_KEY[f.name];
    if (key) familyIdToKey.set(f.id, key);
  }

  const familyKillsById = await resolveAllFamilyKills(playerId);
  const familyKillsByKey = new Map<string, number>();
  for (const [id, kills] of familyKillsById) {
    const key = familyIdToKey.get(id);
    if (key) familyKillsByKey.set(key, kills);
  }

  const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u]));
  let unclaimedCount = 0;

  const achievements: PlayerAchievementProgress[] = ALL_ACHIEVEMENTS.map((def) => {
    const playerAch = unlockedMap.get(def.id);
    const isUnlocked = !!playerAch;

    if (isUnlocked && !playerAch.rewardClaimed && def.rewards?.length) {
      unclaimedCount++;
    }

    let progress = 0;
    if (def.statKey) {
      progress = (allStats as Record<string, number>)[def.statKey] ?? 0;
    } else if (def.familyKey) {
      progress = familyKillsByKey.get(def.familyKey) ?? 0;
    }

    // Secret achievements hide title/description when not unlocked
    const title = def.secret && !isUnlocked ? '???' : def.title;
    const description = def.secret && !isUnlocked ? '???' : def.description;

    return {
      id: def.id,
      category: def.category,
      title,
      description,
      flavorText: isUnlocked ? def.flavorText : undefined,
      titleReward: isUnlocked ? def.titleReward : undefined,
      titleStyle: isUnlocked ? def.titleStyle : undefined,
      threshold: def.threshold,
      secret: def.secret,
      tier: def.tier,
      statKey: def.statKey,
      familyKey: def.familyKey,
      progress: Math.min(progress, def.threshold),
      unlocked: isUnlocked,
      unlockedAt: playerAch?.unlockedAt?.toISOString(),
      rewardClaimed: playerAch?.rewardClaimed,
      rewards: def.rewards,
    };
  });

  return { achievements, unclaimedCount };
}

export async function claimReward(playerId: string, achievementId: string) {
  const def = ACHIEVEMENTS_BY_ID.get(achievementId);
  if (!def) throw new AppError(404, 'Unknown achievement', 'NOT_FOUND');

  const playerAch = await prisma.playerAchievement.findUnique({
    where: { playerId_achievementId: { playerId, achievementId } },
  });

  if (!playerAch) throw new AppError(400, 'Achievement not unlocked', 'NOT_UNLOCKED');
  if (playerAch.rewardClaimed) throw new AppError(400, 'Reward already claimed', 'ALREADY_CLAIMED');

  const rewards = def.rewards ?? [];

  await prisma.$transaction(async (tx) => {
    // Optimistic lock: only claim if not already claimed (prevents double-reward race)
    const updated = await tx.playerAchievement.updateMany({
      where: { playerId, achievementId, rewardClaimed: false },
      data: { rewardClaimed: true },
    });
    if (updated.count === 0) {
      throw new AppError(400, 'Reward already claimed', 'ALREADY_CLAIMED');
    }

    for (const reward of rewards) {
      switch (reward.type) {
        case 'attribute_points':
          await tx.player.update({
            where: { id: playerId },
            data: { attributePoints: { increment: reward.amount } },
          });
          break;
        case 'turns':
          await refundPlayerTurnsTx(tx, playerId, reward.amount);
          break;
        case 'item':
          if (!reward.itemTemplateId) {
            throw new AppError(500, 'Achievement reward has no item template', 'INVALID_REWARD');
          }
          {
            const template = await tx.itemTemplate.findUnique({
              where: { id: reward.itemTemplateId },
            });
            if (!template) {
              throw new AppError(500, `Item template ${reward.itemTemplateId} not found`, 'INVALID_REWARD');
            }
            await tx.item.create({
              data: {
                ownerId: playerId,
                templateId: reward.itemTemplateId,
                rarity: 'legendary',
                quantity: reward.amount,
              },
            });
          }
          break;
      }
    }
  });

  return { success: true, rewards };
}

export async function setActiveTitle(playerId: string, achievementId: string | null) {
  if (achievementId) {
    const def = ACHIEVEMENTS_BY_ID.get(achievementId);
    if (!def?.titleReward) throw new AppError(400, 'Achievement has no title reward', 'NO_TITLE_REWARD');

    const playerAch = await prisma.playerAchievement.findUnique({
      where: { playerId_achievementId: { playerId, achievementId } },
    });
    if (!playerAch) throw new AppError(400, 'Achievement not unlocked', 'NOT_UNLOCKED');
  }

  const player = await prisma.player.update({
    where: { id: playerId },
    data: { activeTitle: achievementId },
    select: { activeTitle: true },
  });

  return player;
}

export async function getUnclaimedCount(playerId: string): Promise<number> {
  const unlocked = await prisma.playerAchievement.findMany({
    where: { playerId, rewardClaimed: false },
    select: { achievementId: true },
  });

  return unlocked.filter((u) => {
    const def = ACHIEVEMENTS_BY_ID.get(u.achievementId);
    return def?.rewards?.length;
  }).length;
}

/** Log + emit socket notifications for newly unlocked achievements. */
export async function emitAchievementNotifications(
  playerId: string,
  achievements: AchievementDef[],
): Promise<void> {
  if (achievements.length === 0) return;

  // Batch-insert all activity logs in one query
  await prisma.activityLog.createMany({
    data: achievements.map((ach) => ({
      playerId,
      activityType: 'achievement' as const,
      turnsSpent: 0,
      result: { achievementId: ach.id, title: ach.title },
    })),
  });

  // Per-achievement socket emit + activity broadcast (broadcast performs Redis + DB writes per call)
  const io = getIo();
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { username: true, currentZoneId: true },
  });
  for (const ach of achievements) {
    io?.to(playerId).emit('achievement_unlocked', {
      id: ach.id,
      title: ach.title,
      category: ach.category,
    });

    if (player?.currentZoneId) {
      void broadcastAchievementActivity({
        zoneId: player.currentZoneId,
        actorPlayerId: playerId,
        actorUsername: player.username,
        achievementTitle: ach.title,
      }).catch((error: unknown) => {
        logger.error({ err: error, playerId, achievementId: ach.id }, 'Achievement activity broadcast failed');
      });
    }
  }
}
