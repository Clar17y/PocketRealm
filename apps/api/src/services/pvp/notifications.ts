import { prisma } from '@pocketrealm/database';
import { QUERY_LIMITS } from '@pocketrealm/shared';

export async function getNotificationCount(playerId: string) {
  return prisma.pvpMatch.count({
    where: { defenderId: playerId, defenderRead: false },
  });
}

export async function getNotifications(playerId: string) {
  return prisma.pvpMatch.findMany({
    where: { defenderId: playerId, defenderRead: false },
    select: {
      id: true,
      attackerId: true,
      attackerRating: true,
      defenderRating: true,
      attackerRatingChange: true,
      defenderRatingChange: true,
      attackerStyle: true,
      defenderStyle: true,
      winnerId: true,
      isRevenge: true,
      createdAt: true,
      attacker: { select: { username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: QUERY_LIMITS.MAX_PVP_NOTIFICATIONS,
  });
}

export async function markNotificationsRead(playerId: string, matchIds?: string[]) {
  const where = matchIds
    ? { id: { in: matchIds }, defenderId: playerId }
    : { defenderId: playerId, defenderRead: false };

  await prisma.pvpMatch.updateMany({
    where,
    data: { defenderRead: true },
  });
}

export async function getScoutNotificationCount(playerId: string): Promise<number> {
  return prisma.pvpScoutLog.count({
    where: { targetId: playerId, isRead: false },
  });
}

export async function getScoutNotifications(playerId: string) {
  const logs = await prisma.pvpScoutLog.findMany({
    where: { targetId: playerId, isRead: false },
    include: { scouter: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
    take: QUERY_LIMITS.MAX_SCOUT_NOTIFICATIONS,
  });

  return logs.map((log) => ({
    id: log.id,
    scouterName: log.scouter.username,
    createdAt: log.createdAt.toISOString(),
  }));
}

export async function markScoutNotificationsRead(playerId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length > 0) {
    await prisma.pvpScoutLog.updateMany({
      where: { id: { in: ids }, targetId: playerId },
      data: { isRead: true },
    });
    return;
  }

  await prisma.pvpScoutLog.updateMany({
    where: { targetId: playerId, isRead: false },
    data: { isRead: true },
  });
}
