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

const config = { guildId: 'guild-123' };

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
    expect(editReply).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Astra',
          }),
        }),
      ],
    });
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

    expect(editReply).toHaveBeenCalledWith({
      content: 'Link your PocketRealm account first with /link.',
    });
  });

  it('makes selected-user unlinked copy clear', async () => {
    const get = vi.fn(async (): Promise<never> => {
      throw new PocketRealmApiError('Not found', 404, 'POCKETREALM_API_ERROR', {});
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

    expect(editReply).toHaveBeenCalledWith({
      content: 'That Discord user needs to link their PocketRealm account with /link first.',
    });
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
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('34 turns available'),
    });
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
    expect(editReply).toHaveBeenCalledWith({
      content: 'Link your PocketRealm account first with /link.',
    });
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
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Forging Lv 7'),
    });
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
    expect(editReply).toHaveBeenCalledWith({
      content: 'Link your PocketRealm account first with /link.',
    });
  });
});

describe('handleRankCommand', () => {
  it('returns an ephemeral rank embed', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      rank: {
        category: 'level',
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
        getString: vi.fn(() => 'level'),
      },
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleRankCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/users/invoker-1/rank/level?guildId=guild-123');
    expect(editReply).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Level Rank',
          }),
        }),
      ],
    });
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
    expect(editReply).toHaveBeenCalledWith({
      content: 'Link your PocketRealm account first with /link.',
    });
  });
});
