import { prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';

export interface DiscordLinkedPlayerLookup {
  guildId: string;
  discordUserId: string;
}

export interface DiscordLinkedPlayerErrorSpec {
  message: string;
  code: string;
}

export interface LinkedDiscordActivePlayer {
  id: string;
  username: string;
  characterLevel: number;
  seasonId: string | null;
  activeTitle: string | null;
  season: { name: string } | null;
}

export interface LinkedDiscordPlayerContext {
  accountId: string;
  player: LinkedDiscordActivePlayer | null;
}

/** Default error for callers that share the generic "link required" contract. */
export const DISCORD_LINK_REQUIRED_ERROR: DiscordLinkedPlayerErrorSpec = {
  message: 'Discord account is not linked to a PocketRealm account',
  code: 'DISCORD_LINK_REQUIRED',
};

/**
 * Finds the active Discord link for a guild user and returns the linked
 * account id plus its active player (null when the account has none).
 * Throws 404 with the caller-supplied error when no active link exists.
 */
export async function findLinkedDiscordPlayer(
  lookup: DiscordLinkedPlayerLookup,
  errors: { linkRequired: DiscordLinkedPlayerErrorSpec },
): Promise<LinkedDiscordPlayerContext> {
  const link = await prisma.discordAccountLink.findFirst({
    where: {
      discordGuildId: lookup.guildId,
      discordUserId: lookup.discordUserId,
      unlinkedAt: null,
    },
    orderBy: { linkedAt: 'desc' },
    select: {
      account: {
        select: {
          id: true,
          activePlayer: {
            select: {
              id: true,
              username: true,
              characterLevel: true,
              seasonId: true,
              activeTitle: true,
              season: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!link) {
    throw new AppError(404, errors.linkRequired.message, errors.linkRequired.code);
  }

  return {
    accountId: link.account.id,
    player: link.account.activePlayer,
  };
}

/**
 * Like findLinkedDiscordPlayer but additionally requires an active player,
 * throwing 404 with the caller-supplied error when the account has none.
 */
export async function requireLinkedDiscordPlayer(
  lookup: DiscordLinkedPlayerLookup,
  errors: {
    linkRequired: DiscordLinkedPlayerErrorSpec;
    playerRequired: DiscordLinkedPlayerErrorSpec;
  },
): Promise<{ accountId: string; player: LinkedDiscordActivePlayer }> {
  const { accountId, player } = await findLinkedDiscordPlayer(lookup, errors);

  if (!player) {
    throw new AppError(404, errors.playerRequired.message, errors.playerRequired.code);
  }

  return { accountId, player };
}
