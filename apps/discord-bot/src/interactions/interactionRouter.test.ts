import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { routeInteraction } from './interactionRouter.js';

describe('routeInteraction', () => {
  it('routes wiki commands to the wiki handler', async () => {
    const api = createApi({ results: [] });
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'wiki',
      options: {
        getString: vi.fn(() => 'forge'),
      },
      deferReply,
      editReply,
    } as unknown as Interaction;

    await routeInteraction(interaction, {
      api,
      config: { guildId: 'guild-123' },
    });

    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/wiki/search?q=forge');
    expect(editReply).toHaveBeenCalledWith({
      content: 'No wiki results found for "forge".',
    });
  });

  it('routes player commands with guild config', async () => {
    const api = createApi({
      turns: {
        currentTurns: 5,
      },
    });
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'turns',
      user: { id: 'invoker-1' },
      deferReply: vi.fn<ChatInputCommandInteraction['deferReply']>(),
      editReply: vi.fn<ChatInputCommandInteraction['editReply']>(),
    } as unknown as Interaction;

    await routeInteraction(interaction, {
      api,
      config: { guildId: 'guild-123' },
    });

    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/users/invoker-1/turns?guildId=guild-123');
  });

  it('replies ephemerally for a known registered command without an implementation', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'duel',
      reply,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: { guildId: 'guild-123' } });

    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'The /duel command is not available yet.',
    });
  });

  it('ignores unknown chat input commands', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'unknown',
      reply,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: { guildId: 'guild-123' } });

    expect(reply).not.toHaveBeenCalled();
  });
});

function createApi(response: unknown): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'get'>['get'],
    post: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'post'>['post'],
  };
}
