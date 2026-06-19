import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { handleLinkCommand } from './linkCommand.js';

const config = { emojiMap: {} };

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

    await handleLinkCommand(interaction, api, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(post).toHaveBeenCalledWith('/api/v1/discord/link-codes', {
      discordUserId: '123456789012345678',
      discordGuildId: '234567890123456789',
    });
    const payload = editReply.mock.calls[0][0];
    expectV2Card(payload);
    const content = cardText(payload);
    expect(content).toContain('🔗 **Link PocketRealm**');
    expect(content).toContain('`ABC12345`');
    expect(content).toContain('<t:1780574400:F>');
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

    await handleLinkCommand(interaction, api, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const payload = editReply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain('❌ **Link failed**');
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

    await handleLinkCommand(interaction, api, config);

    expect(postMock).not.toHaveBeenCalled();
    const payload = reply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(payload).toEqual(expect.objectContaining({ ephemeral: true }));
    expect(cardText(payload)).toContain('⚠️ **Server only**');
  });
});
