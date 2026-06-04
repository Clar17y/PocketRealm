import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from 'discord.js';

import { supportButtonId } from '../discord/components.js';

export interface SupportTriageTicketDto {
  publicId: string;
  status: string;
  privacy: string;
  category: string;
  area: string;
  sensitivityFlags: string[];
  title: string;
  summary: string;
  realmLabel: string | null;
  createdAt: string | Date;
}

export interface UnpostedTicketsResponse {
  tickets: SupportTriageTicketDto[];
}

export interface TriageCardPayload extends MessageCreateOptions {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export function buildTriageCard(ticket: SupportTriageTicketDto): TriageCardPayload {
  const embed = new EmbedBuilder()
    .setTitle(`${ticket.publicId} - ${ticket.title}`)
    .setDescription(ticket.summary || 'No summary provided.')
    .setColor(0x2f80ed)
    .setTimestamp(new Date(ticket.createdAt))
    .addFields(
      { name: 'Status', value: ticket.status, inline: true },
      { name: 'Privacy', value: ticket.privacy, inline: true },
      { name: 'Category', value: ticket.category, inline: true },
      { name: 'Area', value: ticket.area, inline: true },
      { name: 'Realm', value: ticket.realmLabel ?? 'Unknown', inline: true },
      {
        name: 'Sensitivity',
        value: ticket.sensitivityFlags.length > 0 ? ticket.sensitivityFlags.join(', ') : 'none',
        inline: false,
      },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    supportButton('Ask Reporter', 'ask_reporter', ticket.publicId, ButtonStyle.Secondary),
    supportButton('Needs Info', 'needs_info', ticket.publicId, ButtonStyle.Secondary),
    supportButton('Accepted', 'accepted', ticket.publicId, ButtonStyle.Success),
    supportButton('Closed', 'closed', ticket.publicId, ButtonStyle.Danger),
  );

  return {
    content: `New support ticket \`${ticket.publicId}\``,
    embeds: [embed],
    components: [row],
  };
}

function supportButton(
  label: string,
  action: string,
  publicId: string,
  style: ButtonStyle,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(supportButtonId(action, publicId))
    .setLabel(label)
    .setStyle(style);
}
