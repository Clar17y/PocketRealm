import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type MessageMentionOptions,
} from 'discord.js';

import type { DiscordEmojiKey, DiscordEmojiMap } from './emojis.js';
import { botHeadline } from './messageFormat.js';

export interface V2CardPayload {
  flags: MessageFlags.IsComponentsV2;
  components: ContainerBuilder[];
  allowedMentions: MessageMentionOptions;
  ephemeral?: boolean;
}

export interface V2CardOptions {
  emojiMap?: DiscordEmojiMap;
  allowedMentions?: MessageMentionOptions;
  ephemeral?: boolean;
  accentColor?: number;
  actionRows?: ActionRowBuilder<ButtonBuilder>[];
}

interface TextCardInput extends V2CardOptions {
  emojiKey?: DiscordEmojiKey;
  title: string;
  lines: string[];
}

const SUPPRESS_MENTIONS: MessageMentionOptions = { parse: [] };

export function statusCard(
  emojiKey: DiscordEmojiKey,
  title: string,
  detail: string,
  emojiMap: DiscordEmojiMap = {},
  options: Omit<V2CardOptions, 'emojiMap'> = {},
): V2CardPayload {
  return textCard({
    ...options,
    emojiKey,
    title,
    emojiMap,
    lines: [detail],
  });
}

export function textCard(input: TextCardInput): V2CardPayload {
  const container = new ContainerBuilder();
  if (typeof input.accentColor === 'number') {
    container.setAccentColor(input.accentColor);
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(cardContent(input)),
  );

  for (const row of input.actionRows ?? []) {
    container.addActionRowComponents(row);
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: input.allowedMentions ?? SUPPRESS_MENTIONS,
    ...(input.ephemeral === true && { ephemeral: true }),
  };
}

function cardContent(input: TextCardInput): string {
  const title = input.emojiKey
    ? botHeadline(input.emojiKey, input.title, input.emojiMap)
    : `**${input.title}**`;
  return [title, ...input.lines].filter((line) => line.length > 0).join('\n');
}
