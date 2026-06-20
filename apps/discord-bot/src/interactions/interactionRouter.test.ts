import type { ChatInputCommandInteraction, Interaction, ModalSubmitInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { handleSupportThreadAction } from '../support/threadActions.js';
import { handleAnnouncementCommand } from './announcementCommand.js';
import { handleDuelButton, handleDuelCommand } from './duelCommand.js';
import { routeInteraction } from './interactionRouter.js';
import { handleLinkCommand } from './linkCommand.js';
import { handleNotifyCommand, handleNotifyToggleButton } from './notifyCommand.js';
import { handleReportCommand, handleReportModalSubmit } from './reportCommand.js';
import { handleStaffCommand } from './staffCommands.js';

vi.mock('../support/threadActions.js', () => ({
  handleSupportThreadAction: vi.fn(),
}));

vi.mock('./announcementCommand.js', () => ({
  handleAnnouncementCommand: vi.fn(),
}));

vi.mock('./duelCommand.js', () => ({
  handleDuelButton: vi.fn(),
  handleDuelCommand: vi.fn(),
}));

vi.mock('./linkCommand.js', () => ({
  handleLinkCommand: vi.fn(),
}));

vi.mock('./notifyCommand.js', () => ({
  handleNotifyCommand: vi.fn(),
  handleNotifyToggleButton: vi.fn(),
}));

vi.mock('./reportCommand.js', () => ({
  handleReportCommand: vi.fn(),
  handleReportModalSubmit: vi.fn(),
  isReportModalCustomId: vi.fn((customId: string) => customId.startsWith('report:')),
}));

vi.mock('./staffCommands.js', () => ({
  handleStaffCommand: vi.fn(),
}));

const routerConfig = {
  guildId: 'guild-123',
  webBaseUrl: 'https://pocketrealm.app',
  playerRoleId: 'player-role-1',
  verifiedRoleId: 'verified-role-1',
  duelsChannelId: 'duels-channel-1',
  supportTriageChannelId: 'support-triage-channel-1',
  supportStaffRoleIds: ['staff-role-1'],
  levelRoleMap: new Map<number, string>(),
  announcementChannelId: 'announcement-channel-1',
  emojiMap: { success: '<:pr_success:123456789012345678>' },
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
    const payload = editReply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain('ℹ️ **No wiki results**');
    expect(cardText(payload)).toContain('"forge"');
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

  it('responds to rank category autocomplete interactions', async () => {
    const respond = vi.fn();
    const interaction = {
      isAutocomplete: () => true,
      commandName: 'rank',
      options: {
        getFocused: vi.fn(() => 'level'),
      },
      respond,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, {
      api,
      config: routerConfig,
    });

    expect(respond).toHaveBeenCalledWith(expect.arrayContaining([
      { name: 'Character Level', value: 'character_level' },
    ]));
  });

  it('responds with empty choices for unhandled autocomplete commands', async () => {
    const respond = vi.fn();
    const interaction = {
      isAutocomplete: () => true,
      commandName: 'wiki',
      options: {
        getFocused: vi.fn(() => 'forge'),
      },
      respond,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, {
      api,
      config: routerConfig,
    });

    expect(respond).toHaveBeenCalledWith([]);
  });

  it('routes duel commands to the duel handler', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'duel',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleDuelCommand).toHaveBeenCalledWith(interaction, api, routerConfig);
  });

  it('routes link commands to the link handler with config', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'link',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleLinkCommand).toHaveBeenCalledWith(interaction, api, routerConfig);
  });

  it('routes duel button interactions to the duel handler', async () => {
    const interaction = {
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: 'duel:accept:duel-1:target-1',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleDuelButton).toHaveBeenCalledWith(interaction, api, routerConfig);
    expect(handleSupportThreadAction).not.toHaveBeenCalledWith(interaction, {
      api,
      config: routerConfig,
    });
  });

  it('routes notify commands to the notify command handler', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'notify',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleNotifyCommand).toHaveBeenCalledWith(interaction, api, routerConfig);
  });

  it('routes notify toggle buttons to the toggle handler', async () => {
    const interaction = {
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: 'notify:toggle:turns_capped:1',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleNotifyToggleButton).toHaveBeenCalledWith(interaction, api, routerConfig);
  });

  it('routes report commands to the report modal handler', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'report',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleReportCommand).toHaveBeenCalledWith(interaction, api, routerConfig);
  });

  it('routes announcement commands to the announcement handler', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      isRepliable: () => true,
      commandName: 'announcement',
      replied: false,
      deferred: false,
      reply,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleAnnouncementCommand).toHaveBeenCalledTimes(1);
    expect(handleAnnouncementCommand).toHaveBeenCalledWith(interaction, {
      config: routerConfig,
    });
    expect(reply).not.toHaveBeenCalled();
  });

  it('routes staff commands to the staff handler', async () => {
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'staff',
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    expect(handleStaffCommand).toHaveBeenCalledWith(interaction, {
      api,
      config: routerConfig,
    });
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

    expect(handleReportModalSubmit).toHaveBeenCalledWith(interaction, api, routerConfig);
  });

  it('replies ephemerally to unknown chat input commands', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => true,
      isRepliable: () => true,
      commandName: 'unknown',
      replied: false,
      deferred: false,
      reply,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    const payload = reply.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({ ephemeral: true }));
    expectV2Card(payload);
    expect(cardText(payload)).toContain('This interaction is no longer supported. Try the command again.');
  });

  it('replies ephemerally to unknown button interactions', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      isChatInputCommand: () => false,
      isButton: () => true,
      isRepliable: () => true,
      customId: 'unknown:button',
      replied: false,
      deferred: false,
      reply,
    } as unknown as Interaction;
    const api = createApi(null);

    await routeInteraction(interaction, { api, config: routerConfig });

    const payload = reply.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({ ephemeral: true }));
    expectV2Card(payload);
    expect(cardText(payload)).toContain('This interaction is no longer supported. Try the command again.');
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
