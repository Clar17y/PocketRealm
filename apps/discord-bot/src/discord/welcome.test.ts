import type { Client, GuildMember, MessageCreateOptions } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { BotConfig } from '../config.js';
import { shouldWelcomeAfterMemberUpdate, welcomeGuildMember } from './welcome.js';

const GUILD_ID = '234567890123456789';
const WELCOME_CHANNEL_ID = '345678901234567890';
const DUELS_CHANNEL_ID = '456789012345678901';
const USER_ID = '567890123456789012';

const baseConfig = {
  guildId: GUILD_ID,
  webBaseUrl: 'https://pocketrealm.test',
  welcomeChannelId: WELCOME_CHANNEL_ID,
  duelsChannelId: DUELS_CHANNEL_ID,
  emojiMap: {},
} as BotConfig;

describe('welcomeGuildMember', () => {
  it('posts a lightweight welcome for a non-pending member', async () => {
    const send = vi.fn(async (_message: MessageCreateOptions) => ({ id: 'message-1' }));
    const client = clientWithChannel({ isSendable: () => true, send });

    const result = await welcomeGuildMember(member(), { client, config: baseConfig });

    expect(result).toEqual({ sent: true });
    expect(client.channels.fetch).toHaveBeenCalledWith(WELCOME_CHANNEL_ID);
    const payload = send.mock.calls[0][0];
    expect(payload.content).toContain('👋 **Welcome to PocketRealm');
    expect(payload.content).toContain('/link');
    expect(payload.content).toContain('/wiki');
    expect(payload.content).toContain('/report');
    expect(payload.content).toContain(`<#${DUELS_CHANNEL_ID}>`);
    expect(payload.content).toContain('Play: https://pocketrealm.test');
    expect(payload).toEqual(expect.objectContaining({
      allowedMentions: { users: [USER_ID], roles: [], parse: [] },
    }));
  });

  it('waits for members who have not completed membership screening', async () => {
    const send = vi.fn(async (_message: MessageCreateOptions) => ({ id: 'message-1' }));
    const client = clientWithChannel({ isSendable: () => true, send });

    const result = await welcomeGuildMember(member({ pending: true }), { client, config: baseConfig });

    expect(result).toEqual({ sent: false, reason: 'membership_screening_pending' });
    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips bots and guilds outside the configured server', async () => {
    const send = vi.fn(async (_message: MessageCreateOptions) => ({ id: 'message-1' }));
    const client = clientWithChannel({ isSendable: () => true, send });

    await expect(welcomeGuildMember(member({ bot: true }), { client, config: baseConfig })).resolves.toEqual({
      sent: false,
      reason: 'bot_user',
    });
    await expect(welcomeGuildMember(member({ guildId: '111111111111111111' }), { client, config: baseConfig })).resolves.toEqual({
      sent: false,
      reason: 'guild_mismatch',
    });

    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('shouldWelcomeAfterMemberUpdate', () => {
  it('only welcomes when Discord membership screening changes from pending to accepted', () => {
    expect(shouldWelcomeAfterMemberUpdate(member({ pending: true }), member({ pending: false }))).toBe(true);
    expect(shouldWelcomeAfterMemberUpdate(member({ pending: false }), member({ pending: false }))).toBe(false);
    expect(shouldWelcomeAfterMemberUpdate(member({ pending: true }), member({ pending: true }))).toBe(false);
  });
});

function member(options: { guildId?: string; userId?: string; bot?: boolean; pending?: boolean } = {}): GuildMember {
  const userId = options.userId ?? USER_ID;

  return {
    id: userId,
    guild: { id: options.guildId ?? GUILD_ID },
    user: { id: userId, bot: options.bot ?? false },
    pending: options.pending ?? false,
  } as unknown as GuildMember;
}

function clientWithChannel(channel: { isSendable(): boolean; send(message: MessageCreateOptions): Promise<unknown> }) {
  return {
    channels: {
      fetch: vi.fn(async () => channel),
    },
  } as unknown as Pick<Client, 'channels'>;
}
