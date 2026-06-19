import { formatDiscordEmoji, type DiscordEmojiKey, type DiscordEmojiMap } from './emojis.js';

export function botHeadline(
  emojiKey: DiscordEmojiKey,
  title: string,
  emojiMap: DiscordEmojiMap = {},
): string {
  return `${formatDiscordEmoji(emojiKey, emojiMap)} **${title}**`;
}

export function botStatus(
  emojiKey: DiscordEmojiKey,
  title: string,
  detail: string,
  emojiMap: DiscordEmojiMap = {},
): string {
  return `${botHeadline(emojiKey, title, emojiMap)} - ${detail}`;
}

export function compactLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n');
}
