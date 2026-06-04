import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { formatDiscordTimestamp, handleLinkCommand } from './linkCommand.js';

describe('handleLinkCommand', () => {
  it('defers ephemerally, creates a link code, and edits the reply with the code', async () => {
    const linkCodeResponse = {
      code: 'ABC12345',
      expiresAt: '2026-06-04T12:00:00.000Z',
    };
    const post = vi.fn(async <T>(): Promise<T> => linkCodeResponse as T);
    const api = { post } as Pick<PocketRealmApiClient, 'post'>;
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: '123456789012345678' },
      guildId: '234567890123456789',
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleLinkCommand(interaction, api);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(post).toHaveBeenCalledWith('/api/v1/discord/link-codes', {
      discordUserId: '123456789012345678',
      discordGuildId: '234567890123456789',
    });
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Enter this code in PocketRealm Settings: ABC12345'),
    });
  });

  it('edits the deferred reply with safe copy when the API fails', async () => {
    const post = vi.fn(async (): Promise<never> => {
      throw new Error('api unavailable');
    });
    const api = { post } as Pick<PocketRealmApiClient, 'post'>;
    const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
    const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
    const interaction = {
      user: { id: '123456789012345678' },
      guildId: '234567890123456789',
      deferReply,
      editReply,
    } as unknown as ChatInputCommandInteraction;

    await handleLinkCommand(interaction, api);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReply).toHaveBeenCalledWith({
      content: 'Unable to create a PocketRealm link code right now. Please try again later.',
    });
  });

  it('responds immediately without calling the API when used outside a guild', async () => {
    const postMock = vi.fn(async <T>(): Promise<T> => null as T);
    const post = postMock as unknown as Pick<PocketRealmApiClient, 'post'>['post'];
    const api = { post };
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      user: { id: '123456789012345678' },
      guildId: null,
      reply,
    } as unknown as ChatInputCommandInteraction;

    await handleLinkCommand(interaction, api);

    expect(postMock).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: '/link only works in the PocketRealm Discord server.',
    });
  });
});

describe('formatDiscordTimestamp', () => {
  it('formats valid dates as Discord timestamps', () => {
    expect(formatDiscordTimestamp('2026-06-04T12:00:00.000Z')).toBe('<t:1780574400:F>');
  });

  it('falls back to clear copy for invalid dates', () => {
    expect(formatDiscordTimestamp('not-a-date')).toBe('the listed expiry time');
  });
});
