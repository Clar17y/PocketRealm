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
  | 'rest_stamina'
  | 'rest_mana'
  | 'recovery'
  | 'achievement'
  | 'admin_action'
  | 'mining'
  | 'foraging'
  | 'woodcutting';

/** Create an activity log entry. Returns the created record (including id). */
export async function createActivityLog(params: {
  playerId: string;
  activityType: ActivityType;
  turnsSpent: number;
  result: Record<string, unknown> | Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? prisma;

  return client.activityLog.create({
    data: {
      playerId: params.playerId,
      activityType: params.activityType,
      turnsSpent: params.turnsSpent,
      result: params.result as Prisma.InputJsonValue,
    },
  });
}
