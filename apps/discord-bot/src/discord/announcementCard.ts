import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type MessageMentionOptions,
} from 'discord.js';

import type { DiscordEmojiMap } from './emojis.js';
import { botHeadline } from './messageFormat.js';
import type { V2CardPayload } from './v2Card.js';

export const MAX_ANNOUNCEMENT_TEXT_LENGTH = 3900;

const ANNOUNCEMENT_ACCENT_COLOR = 0x57f287;
const massMentionPattern = /@(everyone|here)\b/g;
const neutralizedMentionPrefix = '@\u200B';
const headingPattern = /^(#{1,3})(?!#)\s+(.*)$/;
const bulletPattern = /^[-*•]\s+(.+)$/;

export class AnnouncementCardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnouncementCardValidationError';
  }
}

interface AnnouncementCardInput {
  message: string;
  everyone: boolean;
}

interface AnnouncementCardOptions {
  emojiMap?: DiscordEmojiMap;
}

interface ParsedAnnouncement {
  title: string;
  bodyLines: string[];
}

export function buildAnnouncementCard(
  input: AnnouncementCardInput,
  options: AnnouncementCardOptions = {},
): V2CardPayload {
  const normalized = normalizeAnnouncementText(input.message);
  if (!normalized) {
    throw new AnnouncementCardValidationError('Announcement message cannot be empty.');
  }

  const parsed = parseAnnouncement(normalized);
  const title = input.everyone
    ? neutralizeMassMentions(parsed.title)
    : parsed.title;
  const bodyLines = input.everyone
    ? parsed.bodyLines.map(neutralizeMassMentions)
    : parsed.bodyLines;
  const content = renderAnnouncementText({
    title,
    bodyLines,
    everyone: input.everyone,
    emojiMap: options.emojiMap ?? {},
  });

  if (content.length > MAX_ANNOUNCEMENT_TEXT_LENGTH) {
    throw new AnnouncementCardValidationError('Announcement message is too long. Shorten it and try again.');
  }

  const container = new ContainerBuilder()
    .setAccentColor(ANNOUNCEMENT_ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: allowedMentionsForAnnouncement(input.everyone),
  };
}

function normalizeAnnouncementText(message: string): string {
  return message.replace(/\r\n?/g, '\n').trim();
}

function parseAnnouncement(message: string): ParsedAnnouncement {
  const rawLines = message.split('\n');
  const firstContentIndex = rawLines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) {
    throw new AnnouncementCardValidationError('Announcement message cannot be empty.');
  }

  let title = 'Announcement';
  const bodySourceLines = [...rawLines];
  const titleLineIndex = rawLines.findIndex((line) => {
    const trimmed = line.trim();
    const heading = headingPattern.exec(trimmed);
    return heading?.[1] === '#' || trimmed === '#';
  });

  if (titleLineIndex !== -1) {
    const titleHeading = headingPattern.exec(rawLines[titleLineIndex]?.trim() ?? '');
    title = titleHeading?.[2]?.trim() || 'Announcement';
    bodySourceLines.splice(titleLineIndex, 1);
  }

  const bodyLines = normalizeBodyLines(bodySourceLines);
  if (title === 'Announcement' && bodyLines.length === 0) {
    throw new AnnouncementCardValidationError('Announcement message cannot be empty.');
  }

  return { title, bodyLines };
}

function normalizeBodyLines(lines: string[]): string[] {
  const normalized: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== '') {
        normalized.push('');
      }
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading && (heading[1] === '##' || heading[1] === '###') && heading[2]?.trim()) {
      normalized.push(`**${heading[2].trim()}**`);
      continue;
    }

    const bullet = bulletPattern.exec(line);
    if (bullet?.[1]) {
      normalized.push(`• ${bullet[1].trim()}`);
      continue;
    }

    normalized.push(line);
  }

  while (normalized[normalized.length - 1] === '') {
    normalized.pop();
  }

  return normalized;
}

function renderAnnouncementText(input: {
  title: string;
  bodyLines: string[];
  everyone: boolean;
  emojiMap: DiscordEmojiMap;
}): string {
  const lines = [
    ...(input.everyone ? ['@everyone', ''] : []),
    botHeadline('announcement', input.title, input.emojiMap),
    ...(input.bodyLines.length > 0 ? ['', ...input.bodyLines] : []),
  ];

  return lines.join('\n');
}

function allowedMentionsForAnnouncement(everyone: boolean): MessageMentionOptions {
  return everyone ? { parse: ['everyone'] } : { parse: [] };
}

function neutralizeMassMentions(message: string): string {
  return message.replace(massMentionPattern, `${neutralizedMentionPrefix}$1`);
}
