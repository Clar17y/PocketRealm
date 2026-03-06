import { Prisma, prisma } from '@pocketrealm/database';

/** Create an activity log entry. Returns the created record (including id). */
export async function createActivityLog(params: {
  playerId: string;
  activityType: string;
  turnsSpent: number;
  result: unknown;
}) {
  return prisma.activityLog.create({
    data: {
      playerId: params.playerId,
      activityType: params.activityType,
      turnsSpent: params.turnsSpent,
      result: params.result as Prisma.InputJsonValue,
    },
  });
}
