import type { ChatInputCommandInteraction, GuildMember, ModalSubmitInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { BotConfig } from '../config.js';
import type { V2CardPayload } from '../discord/v2Card.js';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import {
  handleAnnouncementCommand,
  handleAnnouncementModalSubmit,
  isAnnouncementModalCustomId,
} from './announcementCommand.js';

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

type MockAnnouncementInteraction = ChatInputCommandInteraction & {
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  showModal: ReturnType<typeof vi.fn>;
  client: { channels: { fetch: ReturnType<typeof vi.fn> } };
};

type MockAnnouncementModalInteraction = ModalSubmitInteraction & {
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  client: { channels: { fetch: ReturnType<typeof vi.fn> } };
};

describe('handleAnnouncementCommand', () => {
  it('matches announcement modal custom ids only', () => {
    expect(isAnnouncementModalCustomId('announcement:0')).toBe(true);
    expect(isAnnouncementModalCustomId('announcement:1')).toBe(true);
    expect(isAnnouncementModalCustomId('announcement:bad')).toBe(false);
    expect(isAnnouncementModalCustomId('report:user-1')).toBe(false);
  });

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

  it('shows a multi-line announcement modal when no quick message is supplied', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: null,
      everyone: false,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(shownModalCustomId(interaction)).toBe('announcement:0');
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('shows a multi-line announcement modal with the everyone toggle encoded', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: null,
      everyone: true,
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(shownModalCustomId(interaction)).toBe('announcement:1');
  });

  it('posts trimmed quick announcements with mentions suppressed by default', async () => {
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

  it('shows the multi-line editor for whitespace-only quick messages before fetching the channel', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementInteraction({
      member: memberWithRoles([staffRoleId]),
      message: '   ',
      announcementChannel: channel,
    });

    await handleAnnouncementCommand(interaction, { config });

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
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

describe('handleAnnouncementModalSubmit', () => {
  it('rejects invalid modal custom ids without posting', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementModalInteraction({
      member: memberWithRoles([staffRoleId]),
      customId: 'announcement:bad',
      message: 'The realm event starts now.',
      announcementChannel: channel,
    });

    await handleAnnouncementModalSubmit(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'This announcement editor is no longer supported. Run /announcement again.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects non-staff modal submissions without posting', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementModalInteraction({
      member: memberWithRoles([userRoleId]),
      customId: 'announcement:0',
      message: 'The realm event starts now.',
      announcementChannel: channel,
    });

    await handleAnnouncementModalSubmit(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Only support staff can send announcements.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only modal announcements before fetching the channel', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementModalInteraction({
      member: memberWithRoles([staffRoleId]),
      customId: 'announcement:0',
      message: '   ',
      announcementChannel: channel,
    });

    await handleAnnouncementModalSubmit(interaction, { config });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Announcement message cannot be empty.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('posts multi-line modal announcements through the card formatter', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementModalInteraction({
      member: memberWithRoles([staffRoleId]),
      customId: 'announcement:0',
      message: [
        '# Stamina Potions Recharged ⚡',
        '',
        'Stamina potions just got a major combat buff.',
        '',
        '## What changed',
        '• Tier 1 stamina potions now restore **75 stamina**',
        '• Tier 2 stamina potions now restore **100 stamina**',
      ].join('\n'),
      announcementChannel: channel,
    });

    await handleAnnouncementModalSubmit(interaction, { config });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.client.channels.fetch).toHaveBeenCalledWith(announcementChannelId);
    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toBe([
      '📜 **Stamina Potions Recharged ⚡**',
      '',
      'Stamina potions just got a major combat buff.',
      '',
      '**What changed**',
      '• Tier 1 stamina potions now restore **75 stamina**',
      '• Tier 2 stamina potions now restore **100 stamina**',
    ].join('\n'));
  });

  it('prepends and permits @everyone for modal announcements when encoded', async () => {
    const channel = createAnnouncementChannel();
    const interaction = createAnnouncementModalInteraction({
      member: memberWithRoles([staffRoleId]),
      customId: 'announcement:1',
      message: 'The realm event starts now.',
      announcementChannel: channel,
    });

    await handleAnnouncementModalSubmit(interaction, { config });

    const payload = channel.send.mock.calls[0]?.[0];
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

function shownModalCustomId(interaction: MockAnnouncementInteraction): string | undefined {
  const modal = interaction.showModal.mock.calls[0]?.[0] as { toJSON: () => { custom_id: string } } | undefined;
  return modal?.toJSON().custom_id;
}

function createAnnouncementInteraction(input: {
  member: unknown;
  message?: string | null;
  everyone?: boolean | null;
  announcementChannel?: ReturnType<typeof createAnnouncementChannel> | null;
  guildId?: string | null;
}): MockAnnouncementInteraction {
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
      getString: vi.fn(() => input.message === undefined ? 'Server reset at 20:00 UTC' : input.message),
      getBoolean: vi.fn(() => input.everyone ?? null),
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    showModal: vi.fn(),
  } as unknown as MockAnnouncementInteraction;
}

function createAnnouncementModalInteraction(input: {
  member: unknown;
  customId: string;
  message: string;
  announcementChannel?: ReturnType<typeof createAnnouncementChannel> | null;
  guildId?: string | null;
}): MockAnnouncementModalInteraction {
  return {
    guildId: input.guildId === undefined ? guildId : input.guildId,
    customId: input.customId,
    member: input.member,
    client: {
      channels: {
        fetch: vi.fn(async () => input.announcementChannel ?? null),
      },
    },
    fields: {
      getTextInputValue: vi.fn(() => input.message),
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as MockAnnouncementModalInteraction;
}
