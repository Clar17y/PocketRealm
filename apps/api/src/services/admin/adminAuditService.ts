import { Prisma } from '@pocketrealm/database';
import { createActivityLog } from '../activityLogService';

export async function adminAudit(adminId: string, action: string, details: Record<string, unknown>): Promise<void> {
  await createActivityLog({
    playerId: adminId,
    activityType: 'admin_action',
    turnsSpent: 0,
    result: { action, ...details },
  });
}

export async function adminAuditTx(
  tx: Prisma.TransactionClient,
  adminId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await createActivityLog({
    tx,
    playerId: adminId,
    activityType: 'admin_action',
    turnsSpent: 0,
    result: { action, ...details } as Prisma.InputJsonValue,
  });
}
