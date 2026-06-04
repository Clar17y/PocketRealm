import { prisma } from '@pocketrealm/database';
import { resolveAchievementTitleDisplay } from '@pocketrealm/shared/utils/titleDisplay';
import { AppError } from '../middleware/errorHandler';
import { getLeaderboard } from './leaderboardService';
import { getTurnState } from './turnBankService';

export interface DiscordUserLookup {
  guildId: string;
  discordUserId: string;
}

interface LinkedDiscordActivePlayer {
  id: string;
  username: string;
  characterLevel: number;
  seasonId: string | null;
  activeTitle: string | null;
  season: { name: string } | null;
}

interface LinkedDiscordContext {
  accountId: string;
  player: LinkedDiscordActivePlayer;
}

function realmLabelFor(player: Pick<LinkedDiscordActivePlayer, 'seasonId' | 'season'>): string {
  if (!player.seasonId) return 'Preseason';
  return player.season?.name ?? 'Seasonal Realm';
}

async function getLinkedDiscordContext(input: DiscordUserLookup): Promise<LinkedDiscordContext> {
  const link = await prisma.discordAccountLink.findFirst({
    where: {
      discordGuildId: input.guildId,
      discordUserId: input.discordUserId,
      unlinkedAt: null,
    },
    orderBy: { linkedAt: 'desc' },
    select: {
      account: {
        select: {
          id: true,
          activePlayerId: true,
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
    throw new AppError(404, 'Discord account is not linked to a PocketRealm account', 'DISCORD_LINK_REQUIRED');
  }

  const player = link.account.activePlayer;
  if (!link.account.activePlayerId || !player) {
    throw new AppError(404, 'Linked PocketRealm account has no active player', 'DISCORD_PLAYER_NOT_FOUND');
  }

  return {
    accountId: link.account.id,
    player,
  };
}

export async function getLinkedDiscordProfile(input: DiscordUserLookup) {
  const { player } = await getLinkedDiscordContext(input);
  const titleDisplay = resolveAchievementTitleDisplay(player.activeTitle);

  return {
    username: player.username,
    characterLevel: player.characterLevel,
    activeTitle: titleDisplay.title ?? null,
    realmLabel: realmLabelFor(player),
  };
}

export async function getLinkedDiscordTurns(input: DiscordUserLookup) {
  const { player } = await getLinkedDiscordContext(input);
  return getTurnState(player.id);
}

export async function getLinkedDiscordSkills(input: DiscordUserLookup) {
  const { player } = await getLinkedDiscordContext(input);
  const skills = await prisma.playerSkill.findMany({
    where: { playerId: player.id },
    orderBy: [
      { level: 'desc' },
      { xp: 'desc' },
      { skillType: 'asc' },
    ],
    take: 5,
    select: {
      skillType: true,
      level: true,
      xp: true,
    },
  });

  return {
    skills: skills.map((skill) => ({
      skillType: skill.skillType,
      level: skill.level,
      xp: Number(skill.xp),
    })),
  };
}

function assertSafeLeaderboardCategory(category: string): void {
  if (!/^[a-z0-9_]{1,64}$/.test(category)) {
    throw new AppError(400, `Invalid leaderboard category: ${category}`, 'INVALID_CATEGORY');
  }
}

export async function getLinkedDiscordRank(input: DiscordUserLookup & { category: string }) {
  assertSafeLeaderboardCategory(input.category);

  const { player } = await getLinkedDiscordContext(input);
  const leaderboard = await getLeaderboard(input.category, player.id, false, player.seasonId);

  return {
    category: leaderboard.category,
    rank: leaderboard.myRank?.rank ?? null,
    score: leaderboard.myRank?.score ?? null,
    totalPlayers: leaderboard.totalPlayers,
    lastRefreshedAt: leaderboard.lastRefreshedAt,
  };
}
