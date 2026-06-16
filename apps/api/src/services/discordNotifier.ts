import { prisma } from '@pocketrealm/database';

export interface DiscordTarget {
  discordUserId: string;
  guildId: string;
}

/**
 * Resolves a player to their active linked Discord user, or null when the
 * player is unlinked. Mirrors the lookup shape in discordLinkedPlayer.ts.
 */
export async function resolveDiscordTarget(playerId: string): Promise<DiscordTarget | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { accountId: true },
  });
  if (!player) return null;

  const link = await prisma.discordAccountLink.findFirst({
    where: { accountId: player.accountId, unlinkedAt: null },
    orderBy: { linkedAt: 'desc' },
    select: { discordUserId: true, discordGuildId: true },
  });
  if (!link) return null;

  return { discordUserId: link.discordUserId, guildId: link.discordGuildId };
}
