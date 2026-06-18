import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleReportCommand, handleReportModalSubmit } from './reportCommand.js';

const commandConfig = { guildId: '234567890123456789', emojiMap: {} };

describe('handleReportCommand', () => {
  it('shows the report modal for linked users in a guild', async () => {
    const api = createLinkCheckApi(async () => ({ profile: { username: 'Astra' } }));
    const showModal = vi.fn<ChatInputCommandInteraction['showModal']>();
    const interaction = {
      guildId: 'guild-123',
      user: { id: 'user-123' },
      showModal,
      reply: vi.fn(),
    } as unknown as ChatInputCommandInteraction;

    await handleReportCommand(interaction, api, commandConfig);

    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/discord/users/user-123/profile?guildId=234567890123456789',
    );
    expect(showModal).toHaveBeenCalledTimes(1);
    const modal = showModal.mock.calls[0]?.[0] as { toJSON: () => { custom_id: string } } | undefined;
    expect(modal?.toJSON().custom_id).toBe('report:user-123');
  });

  it('prompts unlinked users to link instead of showing the modal', async () => {
    const api = createLinkCheckApi(async () => {
      throw new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {});
    });
    const showModal = vi.fn<ChatInputCommandInteraction['showModal']>();
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      guildId: 'guild-123',
      user: { id: 'user-123' },
      showModal,
      reply,
    } as unknown as ChatInputCommandInteraction;

    await handleReportCommand(interaction, api, commandConfig);

    expect(showModal).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: expect.stringContaining('⚠️ **Link required**'),
    });
    expect(replyContent(reply.mock.calls[0]?.[0])).toContain('or use the in-game report flow');
  });

  it('fails open and shows the modal when the link pre-check errors', async () => {
    const api = createLinkCheckApi(async () => {
      throw new Error('API down');
    });
    const showModal = vi.fn<ChatInputCommandInteraction['showModal']>();
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      guildId: 'guild-123',
      user: { id: 'user-123' },
      showModal,
      reply,
    } as unknown as ChatInputCommandInteraction;

    await handleReportCommand(interaction, api, commandConfig);

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
  });

  it('replies ephemerally outside a guild without calling the API', async () => {
    const api = createLinkCheckApi(async () => ({}));
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      guildId: null,
      reply,
    } as unknown as ChatInputCommandInteraction;

    await handleReportCommand(interaction, api, commandConfig);

    expect(api.get).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: expect.stringContaining('⚠️ **Server only**'),
    });
  });
});

describe('handleReportModalSubmit', () => {
  it('posts a linked user report to the Discord reports API', async () => {
    const api = createApi({
      ticket: {
        publicId: 'SUP-ABC12345',
        status: 'open',
      },
    });
    const deferReply = vi.fn();
    const editReply = vi.fn();
    const interaction = createModalInteraction({
      guildId: 'guild-123',
      userId: 'user-123',
      values: {
        title: 'Combat soft lock',
        description: 'The fight stopped after I stunned a spider.',
        steps: 'Stun a spider during its turn.',
        area: 'combat',
        privacy: 'private',
      },
      deferReply,
      editReply,
    });

    await handleReportModalSubmit(interaction, api, commandConfig);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/reports', {
      discordGuildId: 'guild-123',
      discordUserId: 'user-123',
      category: 'bug',
      area: 'combat',
      privacy: 'private',
      title: 'Combat soft lock',
      description: 'The fight stopped after I stunned a spider.',
      reproductionSteps: 'Stun a spider during its turn.',
    });
    const content = replyContent(editReply.mock.calls[0]?.[0]);
    expect(content).toContain('🛟 **Report created**');
    expect(content).toContain('`SUP-ABC12345`');
  });

  it('normalizes blank or unknown optional fields before posting', async () => {
    const api = createApi({
      ticket: {
        publicId: 'SUP-ABC12345',
        status: 'open',
      },
    });
    const interaction = createModalInteraction({
      guildId: 'guild-123',
      userId: 'user-123',
      values: {
        title: '  Inventory soft lock  ',
        description: '  Inventory stopped accepting item moves.  ',
        steps: '   ',
        area: 'Not A Real Area',
        privacy: 'not-sure',
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await handleReportModalSubmit(interaction, api, commandConfig);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/reports', expect.objectContaining({
      area: 'other',
      privacy: 'not_sure',
      title: 'Inventory soft lock',
      description: 'Inventory stopped accepting item moves.',
    }));
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/discord/reports',
      expect.not.objectContaining({ reproductionSteps: expect.any(String) }),
    );
  });

  it('tells an unlinked user to link first', async () => {
    const api = createApi(null);
    vi.mocked(api.post).mockRejectedValue(
      new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {}),
    );
    const editReply = vi.fn();
    const interaction = createModalInteraction({
      guildId: 'guild-123',
      userId: 'user-123',
      values: {
        title: 'Inventory disappeared',
        description: 'My backpack emptied after login.',
        steps: '',
        area: 'inventory',
        privacy: 'not sure',
      },
      deferReply: vi.fn(),
      editReply,
    });

    await handleReportModalSubmit(interaction, api, commandConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('⚠️ **Link required**'),
    });
    expect(replyContent(editReply.mock.calls[0]?.[0])).toContain('or use the in-game report flow');
  });

  it('uses safe retry copy for generic API failures', async () => {
    const api = createApi(null);
    vi.mocked(api.post).mockRejectedValue(new Error('API down'));
    const editReply = vi.fn();
    const interaction = createModalInteraction({
      guildId: 'guild-123',
      userId: 'user-123',
      values: {
        title: 'Inventory disappeared',
        description: 'My backpack emptied after login.',
        steps: '',
        area: 'inventory',
        privacy: 'not_sure',
      },
      deferReply: vi.fn(),
      editReply,
    });

    await handleReportModalSubmit(interaction, api, commandConfig);

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('❌ **Report failed**'),
    });
  });

  it('does not call the API outside a guild', async () => {
    const api = createApi(null);
    const reply = vi.fn();
    const interaction = createModalInteraction({
      guildId: null,
      userId: 'user-123',
      values: {},
      reply,
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await handleReportModalSubmit(interaction, api, commandConfig);

    expect(api.post).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: expect.stringContaining('⚠️ **Server only**'),
    });
  });
});

function createApi(response: unknown): Pick<PocketRealmApiClient, 'post'> {
  return {
    post: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'post'>['post'],
  };
}

function replyContent(reply: unknown): string {
  if (typeof reply !== 'object' || reply === null || !('content' in reply)) return '';
  return typeof reply.content === 'string' ? reply.content : '';
}

function createLinkCheckApi(get: () => Promise<unknown>): Pick<PocketRealmApiClient, 'get'> {
  return {
    get: vi.fn(get) as Pick<PocketRealmApiClient, 'get'>['get'],
  };
}

function createModalInteraction(options: {
  guildId: string | null;
  userId: string;
  values: Record<string, string>;
  reply?: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
}): ModalSubmitInteraction {
  return {
    guildId: options.guildId,
    user: { id: options.userId },
    fields: {
      getTextInputValue: vi.fn((fieldId: string) => options.values[fieldId] ?? ''),
    },
    reply: options.reply ?? vi.fn(),
    deferReply: options.deferReply,
    editReply: options.editReply,
  } as unknown as ModalSubmitInteraction;
}
