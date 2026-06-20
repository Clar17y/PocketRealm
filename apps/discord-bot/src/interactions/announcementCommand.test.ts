import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { BotConfig } from '../config.js';
import type { V2CardPayload } from '../discord/v2Card.js';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { handleAnnouncementCommand } from './announcementCommand.js';

const guildId = '234567890123456789';
const staffRoleId = '345678901234567890';
const userRoleId = '456789012345678901';
const announcementChannelId = '567890123456789012';
const actorUserId = '678901234567890123';

const config = {
  announcementChannelId,
  supportStaffRoleIds: [staffRoleId],
  emojiMap: {},
} satisfies Pick<BotConfig, 'announcementChannelId' | 'supportStaffRoleIds' | 'emojiMap'>;

describe('handleAnnouncementCommand', () => {
  it('rejects usage outside the PocketRealm Discord server', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      guildId: null,
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: '/announcement only works in the PocketRealm Discord server.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects announcements when staff roles are not configured', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, {
      config: {
        announcementChannelId,
        supportStaffRoleIds: [],
        emojiMap: {},
      },
    });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Announcement commands are not configured. Ask an administrator to set support staff roles.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects non-staff users ephemerally', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([userRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Only support staff can send announcements.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('posts trimmed announcements with mentions suppressed by default', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: '  Patch notes are live @everyone <@123456789012345678>  ',
      everyone: false,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.client.channels.fetch).toHaveBeenCalledWith(announcementChannelId);
    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(payload).toEqual(expect.objectContaining({
      allowedMentions: { parse: [] },
    }));
    expect(cardText(payload)).toBe([
      '📜 **Announcement**',
      '',
      'Patch notes are live @everyone <@123456789012345678>',
    ].join('\n'));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: `Announcement posted to <#${announcementChannelId}>.`,
    });
  });

  it('posts changelog rich text as a Components V2 announcement card', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: [
        '# Weekly Realm Update',
        '',
        '## Combat',
        '⚔️ Raid bosses now show threat progress.',
        '- Duel replay damage order is fixed.',
      ].join('\n'),
      everyone: false,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toBe([
      '📜 **Weekly Realm Update**',
      '',
      '**Combat**',
      '⚔️ Raid bosses now show threat progress.',
      '• Duel replay damage order is fixed.',
    ].join('\n'));
  });

  it('uses configured announcement emoji overrides', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: '# Patch Notes',
      everyone: false,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, {
      config: {
        ...config,
        emojiMap: { announcement: '<:pr_scroll:123456789012345678>' },
      },
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toBe('<:pr_scroll:123456789012345678> **Patch Notes**');
  });

  it('rejects oversized announcements before fetching the channel', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: `# Patch Notes\n${'x'.repeat(4000)}`,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Announcement message is too long. Shorten it and try again.',
    });
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('prepends and permits @everyone when the toggle is enabled', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: 'The realm event starts now.',
      everyone: true,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(payload).toEqual(expect.objectContaining({
      allowedMentions: { parse: ['everyone'] },
    }));
    expect(cardText(payload)).toBe([
      '@everyone',
      '',
      '📜 **Announcement**',
      '',
      'The realm event starts now.',
    ].join('\n'));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: `Announcement posted to <#${announcementChannelId}>.`,
    });
  });

  it('neutralizes everyone mentions inside the body when the toggle is enabled', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: 'Event now @here @everyone <@123456789012345678> <@&234567890123456789>',
      everyone: true,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(payload).toEqual(expect.objectContaining({
      allowedMentions: { parse: ['everyone'] },
    }));
    expect(cardText(payload)).toBe([
      '@everyone',
      '',
      '📜 **Announcement**',
      '',
      'Event now @\u200Bhere @\u200Beveryone <@123456789012345678> <@&234567890123456789>',
    ].join('\n'));
  });

  it('rejects whitespace-only announcements before fetching the channel', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: '   ',
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Announcement message cannot be empty.',
    });
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('reports an unavailable announcement channel ephemerally', async () => {
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: null,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Announcement channel is unavailable. Check DISCORD_ANNOUNCEMENT_CHANNEL_ID and bot permissions.',
    });
  });

  it('reports a non-sendable announcement channel ephemerally', async () => {
    const channel = createAnnouncementChannel();
    channel.isSendable.mockReturnValueOnce(false);
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Announcement channel is unavailable. Check DISCORD_ANNOUNCEMENT_CHANNEL_ID and bot permissions.',
    });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('reports Discord send failures ephemerally', async () => {
    const channel = createAnnouncementChannel();
    channel.send.mockRejectedValueOnce(new Error('missing permissions'));
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Could not send the announcement right now. Check bot logs and channel permissions.',
    });
  });
});

function memberWithRoles(roleIds: string[]): GuildMember {
  return {
    roles: {
      cache: {
        some: (predicate: (role: { id: string }) => boolean) => roleIds.some((id) => predicate({ id })),
      },
    },
  } as unknown as GuildMember;
}

function createAnnouncementChannel() {
  return {
    isSendable: vi.fn(() => true),
    send: vi.fn(async (_payload: V2CardPayload) => ({})),
  };
}

function createAnnouncementInteraction(input: {
  member: unknown;
  message?: string;
  everyone?: boolean | null;
  announcementChannel?: ReturnType<typeof createAnnouncementChannel> | null;
  guildId?: string | null;
}): ChatInputCommandInteraction {
  return {
    commandName: 'announcement',
    guildId: input.guildId === undefined ? guildId : input.guildId,
    member: input.member,
    user: {
      id: actorUserId,
    },
    client: {
      channels: {
        fetch: vi.fn(async () => input.announcementChannel ?? null),
      },
    },
    options: {
      getString: vi.fn(() => input.message ?? 'Server reset at 20:00 UTC'),
      getBoolean: vi.fn(() => input.everyone ?? null),
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction;
}
