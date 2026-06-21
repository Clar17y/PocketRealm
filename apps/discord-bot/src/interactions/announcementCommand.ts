import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ModalActionRowComponentBuilder,
  ModalSubmitInteraction,
} from 'discord.js';

import type { BotConfig } from '../config.js';
import {
  AnnouncementCardValidationError,
  MAX_ANNOUNCEMENT_TEXT_LENGTH,
  buildAnnouncementCard,
} from '../discord/announcementCard.js';
import type { V2CardPayload } from '../discord/v2Card.js';
import { isStaffMember } from '../support/threadActions.js';

type AnnouncementConfig = Pick<BotConfig, 'announcementChannelId' | 'supportStaffRoleIds' | 'emojiMap'>;

interface AnnouncementCommandOptions {
  config: AnnouncementConfig;
}

interface SendableAnnouncementChannel {
  isSendable(): boolean;
  send(payload: V2CardPayload): Promise<unknown>;
}

const ANNOUNCEMENT_MODAL_PREFIX = 'announcement:';
const ANNOUNCEMENT_MESSAGE_FIELD = 'message';
const STALE_ANNOUNCEMENT_MODAL_COPY = 'This announcement editor is no longer supported. Run /announcement again.';

interface AnnouncementModalState {
  everyone: boolean;
}

export function isAnnouncementModalCustomId(customId: string): boolean {
  return parseAnnouncementModalCustomId(customId) !== null;
}

export async function handleAnnouncementCommand(
  interaction: ChatInputCommandInteraction,
  options: AnnouncementCommandOptions,
): Promise<void> {
  if (!(await assertCanPostAnnouncement(interaction, options.config))) {
    return;
  }

  const everyone = interaction.options.getBoolean('everyone') ?? false;
  const message = interaction.options.getString('message', false)?.trim() ?? '';
  if (!message) {
    await interaction.showModal(buildAnnouncementModal(everyone));
    return;
  }

  await postAnnouncement(interaction, options.config, message, everyone);
}

export async function handleAnnouncementModalSubmit(
  interaction: ModalSubmitInteraction,
  options: AnnouncementCommandOptions,
): Promise<void> {
  const modalState = parseAnnouncementModalCustomId(interaction.customId);
  if (!modalState) {
    await interaction.reply({
      ephemeral: true,
      content: STALE_ANNOUNCEMENT_MODAL_COPY,
    });
    return;
  }

  if (!(await assertCanPostAnnouncement(interaction, options.config))) {
    return;
  }

  const message = interaction.fields.getTextInputValue(ANNOUNCEMENT_MESSAGE_FIELD).trim();
  if (!message) {
    await interaction.reply({
      ephemeral: true,
      content: 'Announcement message cannot be empty.',
    });
    return;
  }

  await postAnnouncement(interaction, options.config, message, modalState.everyone);
}

function parseAnnouncementModalCustomId(customId: string): AnnouncementModalState | null {
  if (!customId.startsWith(ANNOUNCEMENT_MODAL_PREFIX)) {
    return null;
  }

  const value = customId.slice(ANNOUNCEMENT_MODAL_PREFIX.length);
  if (value === '0') {
    return { everyone: false };
  }

  if (value === '1') {
    return { everyone: true };
  }

  return null;
}

async function assertCanPostAnnouncement(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  config: AnnouncementConfig,
): Promise<boolean> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: '/announcement only works in the PocketRealm Discord server.',
    });
    return false;
  }

  const staffRoleIds = new Set(config.supportStaffRoleIds);
  if (staffRoleIds.size === 0) {
    await interaction.reply({
      ephemeral: true,
      content: 'Announcement commands are not configured. Ask an administrator to set support staff roles.',
    });
    return false;
  }

  if (!isStaffMember(interaction.member, staffRoleIds)) {
    await interaction.reply({
      ephemeral: true,
      content: 'Only support staff can send announcements.',
    });
    return false;
  }

  return true;
}

async function postAnnouncement(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  config: AnnouncementConfig,
  message: string,
  everyone: boolean,
): Promise<void> {
  let announcementPayload: V2CardPayload;
  try {
    announcementPayload = buildAnnouncementCard(
      { message, everyone },
      { emojiMap: config.emojiMap },
    );
  } catch (error) {
    if (error instanceof AnnouncementCardValidationError) {
      await interaction.reply({
        ephemeral: true,
        content: error.message,
      });
      return;
    }

    throw error;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.client.channels
    .fetch(config.announcementChannelId)
    .catch(() => null);

  if (!isSendableAnnouncementChannel(channel)) {
    await interaction.editReply({
      content: 'Announcement channel is unavailable. Check DISCORD_ANNOUNCEMENT_CHANNEL_ID and bot permissions.',
    });
    return;
  }

  try {
    await channel.send(announcementPayload);
  } catch {
    await interaction.editReply({
      content: 'Could not send the announcement right now. Check bot logs and channel permissions.',
    });
    return;
  }

  await interaction.editReply({
    content: `Announcement posted to <#${config.announcementChannelId}>.`,
  });
}

function buildAnnouncementModal(everyone: boolean): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${ANNOUNCEMENT_MODAL_PREFIX}${everyone ? '1' : '0'}`)
    .setTitle('Post a PocketRealm announcement')
    .addComponents(
      textInputRow(
        new TextInputBuilder()
          .setCustomId(ANNOUNCEMENT_MESSAGE_FIELD)
          .setLabel('Announcement')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(MAX_ANNOUNCEMENT_TEXT_LENGTH)
          .setRequired(true),
      ),
    );
}

function textInputRow(
  input: TextInputBuilder,
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input);
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
