import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import {
  handleProfileCommand,
  handleRankCommand,
  handleSkillsCommand,
  handleTurnsCommand,
} from './playerCommands.js';

const config = { guildId: 'guild-123', emojiMap: {} };

describe('handleProfileCommand', () => {
  it('uses the selected Discord user id when provided', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      profile: {
        username: 'Astra',
        characterLevel: 12,
        activeTitle: 'Forge Warden',
        realmLabel: 'Emberfall',
      },
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getUser: vi.fn(() => ({ id: 'selected-2', username: 'OtherUser' })),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleProfileCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/users/selected-2/profile?guildId=guild-123');
    const title = firstEmbedTitle(editReply.mock.calls[0]?.[0]);
    expect(title).toContain('🧙');
    expect(title).toContain('Astra');
  });

  it('tells the user to run /link when their profile is unlinked', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getUser: vi.fn(() => null),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleProfileCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚠️ **Link required**');
    expect(content).toContain('/link');
  });

  it('makes selected-user unlinked copy clear', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getUser: vi.fn(() => ({ id: 'selected-2', username: 'OtherUser' })),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleProfileCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚠️ **Link required**');
    expect(content).toContain('/link');
  });

  it('reports a linked account with no active player without telling the user to run /link', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Player not found', 404, 'DISCORD_PLAYER_NOT_FOUND', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getUser: vi.fn(() => null),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleProfileCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚠️ **Character missing**');
    expect(content).not.toContain('/link');
  });

  it('uses generic data failure copy for other 404 errors', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Not found', 404, 'POCKETREALM_API_ERROR', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getUser: vi.fn(() => null),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleProfileCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('❌ **Player data unavailable**');
    expect(content).not.toContain('/link');
  });
});

describe('handleTurnsCommand', () => {
  it('defers ephemerally and returns current turns', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      turns: {
        currentTurns: 34,
        timeToCapMs: 1800000,
        lastRegenAt: '2026-06-04T11:45:00.000Z',
      },
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleTurnsCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/users/invoker-1/turns?guildId=guild-123');
    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚡ **Turns**');
    expect(content).toContain('34 turns available');
  });

  it('tells unlinked users to run /link ephemerally', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleTurnsCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚠️ **Link required**');
    expect(content).toContain('/link');
  });
});

describe('handleSkillsCommand', () => {
  it('returns compact skill text', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      skills: [
        { skillType: 'forging', level: 7, xp: 820 },
        { skillType: 'alchemy', level: 3, xp: 210 },
      ],
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleSkillsCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('✨ **Skills**');
    expect(content).toContain('Forging Lv 7');
  });

  it('tells unlinked users to run /link ephemerally', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleSkillsCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚠️ **Link required**');
    expect(content).toContain('/link');
  });
});

describe('handleRankCommand', () => {
  it('returns an ephemeral rank embed', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      rank: {
        category: 'character_level',
        rank: 8,
        score: 1234,
        totalPlayers: 250,
        lastRefreshedAt: '2026-06-04T10:00:00.000Z',
      },
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getString: vi.fn(() => 'character_level'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/users/invoker-1/rank/character_level?guildId=guild-123');
    const title = firstEmbedTitle(editReply.mock.calls[0]?.[0]);
    expect(title).toContain('🏆');
    expect(title).toContain('Character Level Rank');
  });

  it('normalizes common rank category aliases before calling the API', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      rank: {
        category: 'character_level',
        rank: 8,
        score: 12,
      },
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getString: vi.fn(() => 'level'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(get).toHaveBeenCalledWith('/api/v1/discord/users/invoker-1/rank/character_level?guildId=guild-123');
  });

  it('explains locally unknown rank categories without calling the API', async () => {
    const get = vi.fn();
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getString: vi.fn(() => 'not a board'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(get).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Unknown ranking category'),
    });
  });

  it('explains API-invalid rank categories instead of using the generic data failure copy', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Invalid category', 400, 'INVALID_CATEGORY', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getString: vi.fn(() => 'character_level'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(get).toHaveBeenCalledWith('/api/v1/discord/users/invoker-1/rank/character_level?guildId=guild-123');
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Unknown ranking category'),
    });
  });

  it('formats null rank and score as unranked', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      rank: {
        category: 'level',
        rank: null,
        score: null,
        totalPlayers: 250,
      },
    }) as T);
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getString: vi.fn(() => 'level'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const reply = editReply.mock.calls[0]?.[0];
    const embed = typeof reply === 'object' && 'embeds' in reply ? reply.embeds?.[0] : undefined;
    expect(embed).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        description: 'Rank: Unranked',
      }),
    }));
  });

  it('tells unlinked users to run /link ephemerally', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {});
    });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: 'invoker-1' },
      options: {
        getString: vi.fn(() => 'level'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('⚠️ **Link required**');
    expect(content).toContain('/link');
  });
});

function replyContent(reply: unknown): string {
  if (typeof reply !== 'object' || reply === null || !('content' in reply)) return '';
  return typeof reply.content === 'string' ? reply.content : '';
}

function firstEmbedTitle(reply: unknown): string | undefined {
  if (typeof reply !== 'object' || reply === null || !('embeds' in reply)) return undefined;
  const embeds = reply.embeds;
  if (!Array.isArray(embeds)) return undefined;
  const firstEmbed = embeds[0] as { data?: { title?: string } } | undefined;
  return firstEmbed?.data?.title;
}
