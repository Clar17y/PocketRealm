import { prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';

interface EncounterLockoutPlayer {
  activeEncounterSiteId: string | null;
  currentZoneId?: string | null;
}

async function getEncounterLockoutCurrentZoneId(
  playerId: string,
  player: EncounterLockoutPlayer,
): Promise<string | null> {
  if (player.currentZoneId !== undefined) {
    return player.currentZoneId;
  }

  const currentPlayer = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  return currentPlayer?.currentZoneId ?? null;
}

export async function clearStaleEncounterSiteLockout(
  playerId: string,
  player: EncounterLockoutPlayer | null,
): Promise<boolean> {
  if (!player?.activeEncounterSiteId) return false;

  const [activeSite, currentZoneId] = await Promise.all([
    prisma.encounterSite.findFirst({
      where: { id: player.activeEncounterSiteId, playerId },
      select: { zoneId: true },
    }),
    getEncounterLockoutCurrentZoneId(playerId, player),
  ]);

  if (activeSite && activeSite.zoneId === currentZoneId) {
    return false;
  }

  const result = await prisma.player.updateMany({
    where: { id: playerId, activeEncounterSiteId: player.activeEncounterSiteId },
    data: { activeEncounterSiteId: null },
  });
  return result.count > 0;
}

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
    select: { activeEncounterSiteId: true, currentZoneId: true },
  });

  const staleLockoutCleared = await clearStaleEncounterSiteLockout(playerId, player);
  if (player?.activeEncounterSiteId && !staleLockoutCleared) {
    throw new AppError(400, 'Cannot perform this action while in an active encounter site', 'ENCOUNTER_SITE_LOCKED');
  }
}

export async function checkActivityLockout(playerId: string): Promise<void> {
  const [player, activeMembership] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: { activeEncounterSiteId: true, currentZoneId: true },
    }),
    prisma.guildExpeditionMember.findFirst({
      where: { playerId, expedition: { status: 'in_progress' } },
      select: { expeditionId: true },
    }),
  ]);
  const staleLockoutCleared = await clearStaleEncounterSiteLockout(playerId, player);
  if (player?.activeEncounterSiteId && !staleLockoutCleared) {
    throw new AppError(400, 'Cannot perform this action while in an active encounter site', 'ENCOUNTER_SITE_LOCKED');
  }
  if (activeMembership) {
    throw new AppError(400, 'Cannot perform this action while on an active expedition', 'EXPEDITION_LOCKED');
  }
}
