import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleReportCommand, handleReportModalSubmit } from './reportCommand.js';

describe('handleReportCommand', () => {
  it('shows the report modal in a guild', async () => {
    const showModal = vi.fn<ChatInputCommandInteraction['showModal']>();
    const interaction = {
      guildId: 'guild-123',
      user: { id: 'user-123' },
      showModal,
    } as unknown as ChatInputCommandInteraction;

    await handleReportCommand(interaction);

    expect(showModal).toHaveBeenCalledTimes(1);
    const modal = showModal.mock.calls[0]?.[0] as { toJSON: () => { custom_id: string } } | undefined;
    expect(modal?.toJSON().custom_id).toBe('report:user-123');
  });

  it('replies ephemerally outside a guild', async () => {
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      guildId: null,
      reply,
    } as unknown as ChatInputCommandInteraction;

    await handleReportCommand(interaction);

    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Reports only work in the PocketRealm Discord server.',
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
    const reply = vi.fn();
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
      reply,
    });

    await handleReportModalSubmit(interaction, api);

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
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Report SUP-ABC12345 created with status open.',
    });
  });

  it('tells an unlinked user to link first', async () => {
    const api = createApi(null);
    vi.mocked(api.post).mockRejectedValue(
      new PocketRealmApiError('Link required', 404, 'DISCORD_LINK_REQUIRED', {}),
    );
    const reply = vi.fn();
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
      reply,
    });

    await handleReportModalSubmit(interaction, api);

    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Link your PocketRealm account first, or use the in-game report flow.',
    });
  });
});

function createApi(response: unknown): Pick<PocketRealmApiClient, 'post'> {
  return {
    post: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'post'>['post'],
  };
}

function createModalInteraction(options: {
  guildId: string | null;
  userId: string;
  values: Record<string, string>;
  reply: ReturnType<typeof vi.fn>;
}): ModalSubmitInteraction {
  return {
    guildId: options.guildId,
    user: { id: options.userId },
    fields: {
      getTextInputValue: vi.fn((fieldId: string) => options.values[fieldId] ?? ''),
    },
    reply: options.reply,
  } as unknown as ModalSubmitInteraction;
}
