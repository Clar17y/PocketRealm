import { Prisma, prisma } from '@pocketrealm/database';

export type ActivityType =
  | 'combat'
  | 'exploration'
  | 'crafting'
  | 'forge_upgrade'
  | 'forge_reroll'
  | 'salvage'
  | 'salvage_batch'
  | 'rest'
  | 'recovery'
  | 'achievement'
  | 'admin_action';

/** Create an activity log entry. Returns the created record (including id). */
export async function createActivityLog(params: {
  playerId: string;
  activityType: string;
  turnsSpent: number;
  result: Record<string, unknown> | Prisma.InputJsonValue;
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
