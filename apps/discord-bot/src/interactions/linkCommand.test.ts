import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleLinkCommand } from './linkCommand.js';

describe('handleLinkCommand', () => {
  it('creates a link code and replies ephemerally with the code', async () => {
    const linkCodeResponse = {
      code: 'ABC12345',
      expiresAt: '2026-06-04T12:00:00.000Z',
    };
    const post = vi.fn(async <T>(): Promise<T> => linkCodeResponse as T);
    const api = { post } as Pick<PocketRealmApiClient, 'post'>;
    const reply = vi.fn<ChatInputCommandInteraction['reply']>();
    const interaction = {
      user: { id: '123456789012345678' },
      guildId: '234567890123456789',
      reply,
    } as unknown as ChatInputCommandInteraction;

    await handleLinkCommand(interaction, api);

    expect(post).toHaveBeenCalledWith('/api/v1/discord/link-codes', {
      discordUserId: '123456789012345678',
      discordGuildId: '234567890123456789',
    });
    expect(reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: expect.stringContaining('Enter this code in PocketRealm Settings: ABC12345'),
    });
  });
});
