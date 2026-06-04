import type { ChatInputCommandInteraction, Interaction, ModalSubmitInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleSupportThreadAction } from '../support/threadActions.js';
import { routeInteraction } from './interactionRouter.js';
import { handleReportCommand, handleReportModalSubmit } from './reportCommand.js';

vi.mock('../support/threadActions.js', () => ({
  handleSupportThreadAction: vi.fn(),
}));

vi.mock('./reportCommand.js', () => ({
  handleReportCommand: vi.fn(),
  handleReportModalSubmit: vi.fn(),
  isReportModalCustomId: vi.fn((customId: string) => customId.startsWith('report:')),
}));

const routerConfig = {
  guildId: 'guild-123',
  webBaseUrl: 'https://pocketrealm.app',
  supportStaffRoleIds: ['staff-role-1'],
};

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
      config: routerConfig,
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
      config: routerConfig,
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

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'The /duel command is not available yet.',
    });
  });

  it('routes report commands to the report modal handler', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'report',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleReportCommand).toHaveBeenCalledWith(interaction);
  });

  it('routes report modal submissions to the report submit handler', async () => {
    const interaction = {
      isChatInputCommand: () => false,
      isButton: () => false,
      isModalSubmit: () => true,
      customId: 'report:invoker-1',
    } as unknown as ModalSubmitInteraction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleReportModalSubmit).toHaveBeenCalledWith(interaction, api);
  });

  it('ignores unknown chat input commands', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'unknown',
      reply,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(reply).not.toHaveBeenCalled();
  });

  it('routes support button interactions to the support thread action handler', async () => {
    const interaction = {
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: 'support:ask_reporter:SUP-ABC12345',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleSupportThreadAction).toHaveBeenCalledWith(interaction, {
      api,
      config: routerConfig,
    });
  });
});

function createApi(response: unknown): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'get'>['get'],
    post: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'post'>['post'],
  };
}
