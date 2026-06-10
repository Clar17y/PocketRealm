import { prisma } from '@pocketrealm/database';
import { resolveAchievementTitleDisplay } from '@pocketrealm/shared/utils/titleDisplay';
import { AppError } from '../middleware/errorHandler';
import {
  DISCORD_LINK_REQUIRED_ERROR,
  requireLinkedDiscordPlayer,
  type LinkedDiscordActivePlayer,
} from './discordLinkedPlayer';
import { getLeaderboard } from './leaderboardService';
import { realmLabelFor } from './supportTicketService';
import { getTurnState } from './turnBankService';

export interface DiscordUserLookup {
  guildId: string;
  discordUserId: string;
}

interface LinkedDiscordContext {
  accountId: string;
  player: LinkedDiscordActivePlayer;
}

async function getLinkedDiscordContext(input: DiscordUserLookup): Promise<LinkedDiscordContext> {
  return requireLinkedDiscordPlayer(input, {
    linkRequired: DISCORD_LINK_REQUIRED_ERROR,
    playerRequired: {
      message: 'Linked PocketRealm account has no active player',
      code: 'DISCORD_PLAYER_NOT_FOUND',
    },
  });
}

export async function getLinkedDiscordProfile(input: DiscordUserLookup) {
  const { player } = await getLinkedDiscordContext(input);
  const titleDisplay = resolveAchievementTitleDisplay(player.activeTitle);

  return {
    username: player.username,
    characterLevel: player.characterLevel,
    activeTitle: titleDisplay.title ?? null,
    realmLabel: realmLabelFor(player.seasonId, player.season?.name),
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
