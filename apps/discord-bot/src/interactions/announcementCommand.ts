import type { ChatInputCommandInteraction, MessageMentionOptions } from 'discord.js';

import type { BotConfig } from '../config.js';
import { isStaffMember } from '../support/threadActions.js';

type AnnouncementConfig = Pick<BotConfig, 'announcementChannelId' | 'supportStaffRoleIds'>;

interface AnnouncementCommandOptions {
  config: AnnouncementConfig;
}

interface AnnouncementPayload {
  content: string;
  allowedMentions: MessageMentionOptions;
}

interface SendableAnnouncementChannel {
  isSendable(): boolean;
  send(payload: AnnouncementPayload): Promise<unknown>;
}

export async function handleAnnouncementCommand(
  interaction: ChatInputCommandInteraction,
  options: AnnouncementCommandOptions,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: '/announcement only works in the PocketRealm Discord server.',
    });
    return;
  }

  const staffRoleIds = new Set(options.config.supportStaffRoleIds);
  if (staffRoleIds.size === 0) {
    await interaction.reply({
      ephemeral: true,
      content: 'Announcement commands are not configured. Ask an administrator to set support staff roles.',
    });
    return;
  }

  if (!isStaffMember(interaction.member, staffRoleIds)) {
    await interaction.reply({
      ephemeral: true,
      content: 'Only support staff can send announcements.',
    });
    return;
  }

  const message = interaction.options.getString('message', true).trim();
  if (!message) {
    await interaction.reply({
      ephemeral: true,
      content: 'Announcement message cannot be empty.',
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels
    .fetch(options.config.announcementChannelId)
    .catch(() => null);

  if (!isSendableAnnouncementChannel(channel)) {
    await interaction.editReply({
      content: 'Announcement channel is unavailable. Check DISCORD_ANNOUNCEMENT_CHANNEL_ID and bot permissions.',
    });
    return;
  }

  const everyone = interaction.options.getBoolean('everyone') ?? false;

  try {
    await channel.send(buildAnnouncementPayload(message, everyone));
  } catch {
    await interaction.editReply({
      content: 'Could not send the announcement right now. Check bot logs and channel permissions.',
    });
    return;
  }

  await interaction.editReply({
    content: `Announcement posted to <#${options.config.announcementChannelId}>.`,
  });
}

function buildAnnouncementPayload(message: string, everyone: boolean): AnnouncementPayload {
  const allowedMentions: MessageMentionOptions = everyone ? { parse: ['everyone'] } : { parse: [] };

  return {
    content: everyone ? `@everyone\n\n${message}` : message,
    allowedMentions,
  };
}

function isSendableAnnouncementChannel(channel: unknown): channel is SendableAnnouncementChannel {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  if (!('isSendable' in channel) || typeof channel.isSendable !== 'function') {
    return false;
  }

  if (!('send' in channel) || typeof channel.send !== 'function') {
    return false;
  }

  return channel.isSendable();
}
