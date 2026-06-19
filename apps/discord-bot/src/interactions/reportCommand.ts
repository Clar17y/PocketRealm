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

import {
  SUPPORT_TICKET_AREAS,
  SUPPORT_TICKET_PRIVACY,
  type SupportTicketArea,
  type SupportTicketPrivacy,
} from '@pocketrealm/shared/support/supportTickets';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import type { DiscordEmojiMap } from '../discord/emojis.js';
import { statusCard } from '../discord/v2Card.js';

type ReportApiClient = Pick<PocketRealmApiClient, 'post'>;
type ReportLinkCheckApiClient = Pick<PocketRealmApiClient, 'get'>;
type ReportCommandConfig = Pick<BotConfig, 'guildId' | 'emojiMap'>;

interface CreateDiscordReportResponse {
  ticket: {
    publicId: string;
    status: string;
  };
}

const REPORT_MODAL_PREFIX = 'report:';
const REPORT_TITLE_FIELD = 'title';
const REPORT_DESCRIPTION_FIELD = 'description';
const REPORT_STEPS_FIELD = 'steps';
const REPORT_AREA_FIELD = 'area';
const REPORT_PRIVACY_FIELD = 'privacy';

const LINK_REQUIRED_COPY = 'Link your PocketRealm account first, or use the in-game report flow.';
const SERVER_ONLY_COPY = 'Reports only work in the PocketRealm Discord server.';

const areaSet = new Set<string>(SUPPORT_TICKET_AREAS);
const privacySet = new Set<string>(SUPPORT_TICKET_PRIVACY);

export function isReportModalCustomId(customId: string): boolean {
  return customId.startsWith(REPORT_MODAL_PREFIX);
}

export async function handleReportCommand(
  interaction: ChatInputCommandInteraction,
  api: ReportLinkCheckApiClient,
  config: ReportCommandConfig,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ...statusCard('warning', 'Server only', SERVER_ONLY_COPY, config.emojiMap, { ephemeral: true }),
    });
    return;
  }

  if (!(await isLinkedPocketRealmUser(api, interaction.user.id, config.guildId))) {
    await interaction.reply({
      ...statusCard('warning', 'Link required', LINK_REQUIRED_COPY, config.emojiMap, { ephemeral: true }),
    });
    return;
  }

  await interaction.showModal(buildReportModal(interaction.user.id));
}

/**
 * Pre-check linkage so unlinked users get a link prompt instead of filling a
 * 5-field modal that is guaranteed to fail. Fails open on API errors so an
 * API outage never blocks report submission.
 */
async function isLinkedPocketRealmUser(
  api: ReportLinkCheckApiClient,
  discordUserId: string,
  guildId: string,
): Promise<boolean> {
  try {
    await api.get(
      `/api/v1/discord/users/${encodeURIComponent(discordUserId)}/profile?guildId=${encodeURIComponent(guildId)}`,
    );
    return true;
  } catch (error) {
    if (error instanceof PocketRealmApiError && error.code === 'DISCORD_LINK_REQUIRED') {
      return false;
    }

    return true;
  }
}

export async function handleReportModalSubmit(
  interaction: ModalSubmitInteraction,
  api: ReportApiClient,
  config: Pick<BotConfig, 'emojiMap'>,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ...statusCard('warning', 'Server only', SERVER_ONLY_COPY, config.emojiMap, { ephemeral: true }),
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await api.post<CreateDiscordReportResponse>('/api/v1/discord/reports', {
      discordGuildId: interaction.guildId,
      discordUserId: interaction.user.id,
      category: 'bug',
      area: normalizeArea(interaction.fields.getTextInputValue(REPORT_AREA_FIELD)),
      privacy: normalizePrivacy(interaction.fields.getTextInputValue(REPORT_PRIVACY_FIELD)),
      title: interaction.fields.getTextInputValue(REPORT_TITLE_FIELD).trim(),
      description: interaction.fields.getTextInputValue(REPORT_DESCRIPTION_FIELD).trim(),
      ...optionalSteps(interaction.fields.getTextInputValue(REPORT_STEPS_FIELD)),
    });

    await interaction.editReply(
      statusCard(
        'support',
        'Report created',
        `Report \`${response.ticket.publicId}\` created with status \`${response.ticket.status}\`.`,
        config.emojiMap,
      ),
    );
  } catch (error) {
    await interaction.editReply(reportErrorCopy(error, config.emojiMap));
  }
}

function buildReportModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${REPORT_MODAL_PREFIX}${userId}`)
    .setTitle('Report a PocketRealm issue')
    .addComponents(
      textInputRow(
        new TextInputBuilder()
          .setCustomId(REPORT_TITLE_FIELD)
          .setLabel('Title')
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setMaxLength(120)
          .setRequired(true),
      ),
      textInputRow(
        new TextInputBuilder()
          .setCustomId(REPORT_DESCRIPTION_FIELD)
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(4000)
          .setRequired(true),
      ),
      textInputRow(
        new TextInputBuilder()
          .setCustomId(REPORT_STEPS_FIELD)
          .setLabel('Steps to reproduce')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(3000)
          .setRequired(false),
      ),
      textInputRow(
        new TextInputBuilder()
          .setCustomId(REPORT_AREA_FIELD)
          .setLabel('Area')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('combat, inventory, performance, other')
          .setMaxLength(80)
          .setRequired(false),
      ),
      textInputRow(
        new TextInputBuilder()
          .setCustomId(REPORT_PRIVACY_FIELD)
          .setLabel('Privacy')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('public_candidate, private, not_sure')
          .setMaxLength(32)
          .setRequired(false),
      ),
    );
}

function textInputRow(
  input: TextInputBuilder,
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input);
}

function normalizeArea(value: string): SupportTicketArea {
  const normalized = normalizeEnumInput(value);
  return areaSet.has(normalized) ? normalized as SupportTicketArea : 'other';
}

function normalizePrivacy(value: string): SupportTicketPrivacy {
  const normalized = normalizeEnumInput(value);
  return privacySet.has(normalized) ? normalized as SupportTicketPrivacy : 'not_sure';
}

function normalizeEnumInput(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function optionalSteps(value: string): { reproductionSteps?: string } {
  const trimmed = value.trim();
  return trimmed ? { reproductionSteps: trimmed } : {};
}

function reportErrorCopy(error: unknown, emojiMap: DiscordEmojiMap) {
  if (error instanceof PocketRealmApiError && error.code === 'DISCORD_LINK_REQUIRED') {
    return statusCard('warning', 'Link required', LINK_REQUIRED_COPY, emojiMap);
  }

  return statusCard('error', 'Report failed', 'Unable to create a report right now. Please try again later.', emojiMap);
}
