import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@pocketrealm/database';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordAccountLink: {
      findFirst: vi.fn(),
    },
    playerSkill: {
      findMany: vi.fn(),
    },
  },
  getTurnState: vi.fn(),
  getLeaderboard: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({
  prisma: mocks.prisma,
}));

vi.mock('./turnBankService', () => ({
  getTurnState: mocks.getTurnState,
}));

vi.mock('./leaderboardService', () => ({
  getLeaderboard: mocks.getLeaderboard,
}));

import {
  getLinkedDiscordProfile,
  getLinkedDiscordRank,
  getLinkedDiscordSkills,
  getLinkedDiscordTurns,
} from './discordProfileService';

const DISCORD_USER_ID = '12345678901234567';
const DISCORD_GUILD_ID = '23456789012345678';

function linkedAccount(activePlayer: object | null = {
  id: 'player-1',
  username: 'Mira',
  characterLevel: 12,
  seasonId: 'season-1',
  activeTitle: 'discord_linked',
  season: { name: 'Spring Realm' },
}) {
  return {
    id: 'link-1',
    account: {
      id: 'account-1',
      email: 'mira@example.com',
      activePlayerId: activePlayer ? 'player-1' : null,
      activePlayer,
    },
  };
}

describe('discordProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a safe linked Discord player profile', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(linkedAccount() as never);

    const profile = await getLinkedDiscordProfile({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
    });

    expect(profile).toMatchObject({
      username: 'Mira',
      characterLevel: 12,
      activeTitle: 'Linked Adventurer',
      realmLabel: 'Spring Realm',
    });
    expect(JSON.stringify(profile)).not.toContain('account-1');
    expect(JSON.stringify(profile)).not.toContain('player-1');
    expect(JSON.stringify(profile)).not.toContain('mira@example.com');
  });

  it('requires an active Discord link', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(null);

    await expect(getLinkedDiscordProfile({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DISCORD_LINK_REQUIRED',
    });
  });

  it('requires the linked account to have an active player', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(linkedAccount(null) as never);

    await expect(getLinkedDiscordProfile({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DISCORD_PLAYER_NOT_FOUND',
    });
  });

  it('returns safe turn state for the linked active player', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(linkedAccount() as never);
    mocks.getTurnState.mockResolvedValue({
      currentTurns: 42,
      timeToCapMs: 1000,
      lastRegenAt: '2026-06-04T12:00:00.000Z',
    });

    await expect(getLinkedDiscordTurns({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
    })).resolves.toEqual({
      currentTurns: 42,
      timeToCapMs: 1000,
      lastRegenAt: '2026-06-04T12:00:00.000Z',
    });
    expect(mocks.getTurnState).toHaveBeenCalledWith('player-1');
  });

  it('returns compact top skills without internal ids', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(linkedAccount() as never);
    vi.mocked(prisma.playerSkill.findMany).mockResolvedValue([
      { id: 'skill-1', skillType: 'mining', level: 18, xp: BigInt(1200) },
      { id: 'skill-2', skillType: 'melee', level: 12, xp: BigInt(700) },
    ] as never);

    const result = await getLinkedDiscordSkills({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
    });

    expect(result.skills).toEqual([
      { skillType: 'mining', level: 18, xp: 1200 },
      { skillType: 'melee', level: 12, xp: 700 },
    ]);
    expect(JSON.stringify(result)).not.toContain('skill-1');
    expect(prisma.playerSkill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId: 'player-1' },
      take: 5,
    }));
  });

  it('returns a sanitized rank summary for a linked player', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(linkedAccount() as never);
    mocks.getLeaderboard.mockResolvedValue({
      category: 'character_level',
      period: 'alltime',
      myRank: {
        rank: 3,
        playerId: 'player-1',
        username: 'Mira',
        characterLevel: 12,
        score: 12,
      },
      totalPlayers: 80,
      lastRefreshedAt: '2026-06-04T12:00:00.000Z',
    });

    const result = await getLinkedDiscordRank({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      category: 'character_level',
    });

    expect(result).toEqual({
      category: 'character_level',
      rank: 3,
      score: 12,
      totalPlayers: 80,
      lastRefreshedAt: '2026-06-04T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('player-1');
    expect(mocks.getLeaderboard).toHaveBeenCalledWith('character_level', 'player-1', false, 'season-1');
  });
});
