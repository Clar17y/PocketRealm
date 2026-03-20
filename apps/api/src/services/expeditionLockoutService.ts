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

export async function checkEncounterSiteLockout(playerId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { activeEncounterSiteId: true },
  });

  if (player?.activeEncounterSiteId) {
    throw new AppError(400, 'Cannot perform this action while in an active encounter site', 'ENCOUNTER_SITE_LOCKED');
  }
}

export async function checkActivityLockout(playerId: string): Promise<void> {
  const [player, activeMembership] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: { activeEncounterSiteId: true },
    }),
    prisma.guildExpeditionMember.findFirst({
      where: { playerId, expedition: { status: 'in_progress' } },
      select: { expeditionId: true },
    }),
  ]);
  if (player?.activeEncounterSiteId) {
    throw new AppError(400, 'Cannot perform this action while in an active encounter site', 'ENCOUNTER_SITE_LOCKED');
  }
  if (activeMembership) {
    throw new AppError(400, 'Cannot perform this action while on an active expedition', 'EXPEDITION_LOCKED');
  }
}
