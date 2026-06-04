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

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';

type ReportApiClient = Pick<PocketRealmApiClient, 'post'>;

type SupportTicketArea = typeof SUPPORT_TICKET_AREAS[number];
type SupportTicketPrivacy = typeof SUPPORT_TICKET_PRIVACY[number];

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

const SUPPORT_TICKET_AREAS = [
  'combat',
  'exploration',
  'crafting',
  'inventory',
  'social',
  'guild',
  'casino',
  'payments',
  'auth',
  'mobile',
  'performance',
  'other',
] as const;

const SUPPORT_TICKET_PRIVACY = ['public_candidate', 'private', 'not_sure'] as const;

const areaSet = new Set<string>(SUPPORT_TICKET_AREAS);
const privacySet = new Set<string>(SUPPORT_TICKET_PRIVACY);

export function isReportModalCustomId(customId: string): boolean {
  return customId.startsWith(REPORT_MODAL_PREFIX);
}

export async function handleReportCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: 'Reports only work in the PocketRealm Discord server.',
    });
    return;
  }

  await interaction.showModal(buildReportModal(interaction.user.id));
}

export async function handleReportModalSubmit(
  interaction: ModalSubmitInteraction,
  api: ReportApiClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: 'Reports only work in the PocketRealm Discord server.',
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

    await interaction.editReply({
      content: `Report ${response.ticket.publicId} created with status ${response.ticket.status}.`,
    });
  } catch (error) {
    await interaction.editReply({
      content: reportErrorCopy(error),
    });
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

function reportErrorCopy(error: unknown): string {
  if (error instanceof PocketRealmApiError && error.code === 'DISCORD_LINK_REQUIRED') {
    return 'Link your PocketRealm account first, or use the in-game report flow.';
  }

  return 'Unable to create a report right now. Please try again later.';
}
