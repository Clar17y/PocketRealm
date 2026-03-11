import { prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';

export async function checkExpeditionLockout(playerId: string): Promise<void> {
  const activeMembership = await prisma.guildExpeditionMember.findFirst({
    where: {
      playerId,
      expedition: { status: 'in_progress' },
    },
    select: { expeditionId: true },
  });

  if (activeMembership) {
    throw new AppError(400, 'Cannot perform this action while on an active expedition', 'EXPEDITION_LOCKED');
  }
}
