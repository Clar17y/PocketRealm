export const DISCORD_EMOJI_KEYS = [
  'duel',
  'scout',
  'boss',
  'victory',
  'expedition',
  'turns',
  'link',
  'notify',
  'wiki',
  'item',
  'mob',
  'profile',
  'skills',
  'support',
  'welcome',
  'success',
  'warning',
  'error',
  'info',
] as const;

export type DiscordEmojiKey = (typeof DISCORD_EMOJI_KEYS)[number];
export type DiscordEmojiMap = Partial<Record<DiscordEmojiKey, string>>;

export const DEFAULT_DISCORD_EMOJIS: Record<DiscordEmojiKey, string> = {
  duel: '⚔️',
  scout: '🔍',
  boss: '🐉',
  victory: '🏆',
  expedition: '🧭',
  turns: '⚡',
  link: '🔗',
  notify: '🔔',
  wiki: '📖',
  item: '🗡️',
  mob: '👹',
  profile: '🧙',
  skills: '✨',
  support: '🛟',
  welcome: '👋',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
};

const emojiKeys = new Set<string>(DISCORD_EMOJI_KEYS);
const customEmojiMentionPattern = /^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/;

export function isDiscordEmojiKey(value: string): value is DiscordEmojiKey {
  return emojiKeys.has(value);
}

export function parseDiscordEmojiMap(raw: string | undefined): DiscordEmojiMap {
  const trimmed = raw?.trim();
  if (!trimmed) return {};

  const parsed: DiscordEmojiMap = {};
  for (const entry of trimmed.split(',')) {
    const [rawKey, rawValue, ...extra] = entry.split('=');
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (!key || !value || extra.length > 0) {
      throw new Error(`Invalid Discord emoji mapping: ${entry}`);
    }

    if (!isDiscordEmojiKey(key)) {
      throw new Error(`Unknown Discord emoji key: ${key}`);
    }

    if (!customEmojiMentionPattern.test(value)) {
      throw new Error(`Invalid Discord custom emoji for ${key}: ${value}`);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function formatDiscordEmoji(
  key: DiscordEmojiKey,
  emojiMap: DiscordEmojiMap = {},
  fallback: string = DEFAULT_DISCORD_EMOJIS[key],
): string {
  return emojiMap[key] ?? fallback;
}
