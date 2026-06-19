import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { supportButtonId } from '../discord/components.js';
import type { DiscordEmojiMap } from '../discord/emojis.js';
import { textCard, type V2CardPayload } from '../discord/v2Card.js';

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

export type TriageCardPayload = V2CardPayload;

export function buildTriageCard(ticket: SupportTriageTicketDto, emojiMap: DiscordEmojiMap = {}): TriageCardPayload {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    supportButton('Ask Reporter', 'ask_reporter', ticket.publicId, ButtonStyle.Secondary),
    supportButton('Needs Info', 'needs_info', ticket.publicId, ButtonStyle.Secondary),
    supportButton('Accepted', 'accepted', ticket.publicId, ButtonStyle.Success),
    supportButton('Rejected', 'rejected', ticket.publicId, ButtonStyle.Danger),
    supportButton('Security', 'security', ticket.publicId, ButtonStyle.Primary),
  );
  const archiveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    supportButton('Closed', 'closed', ticket.publicId, ButtonStyle.Danger),
    supportButton('Archive Thread', 'archive_thread', ticket.publicId, ButtonStyle.Secondary),
  );

  return textCard({
    emojiKey: 'support',
    title: `${ticket.publicId} - ${ticket.title}`,
    emojiMap,
    lines: [
      ticket.summary || 'No summary provided.',
      `Status: \`${ticket.status}\``,
      `Privacy: \`${ticket.privacy}\``,
      `Category: \`${ticket.category}\``,
      `Area: \`${ticket.area}\``,
      `Realm: ${ticket.realmLabel ?? 'Unknown'}`,
      `Sensitivity: ${ticket.sensitivityFlags.length > 0 ? ticket.sensitivityFlags.join(', ') : 'none'}`,
      `Created: <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:f>`,
    ],
    accentColor: 0x2f80ed,
    actionRows: [row, archiveRow],
  });
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
