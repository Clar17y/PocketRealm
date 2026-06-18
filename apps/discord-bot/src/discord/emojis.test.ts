import { describe, expect, it } from 'vitest';

import {
  DISCORD_EMOJI_KEYS,
  DEFAULT_DISCORD_EMOJIS,
  formatDiscordEmoji,
  parseDiscordEmojiMap,
} from './emojis.js';

describe('discord emoji catalog', () => {
  it('has a fallback for every semantic key', () => {
    for (const key of DISCORD_EMOJI_KEYS) {
      expect(DEFAULT_DISCORD_EMOJIS[key]).toBeTruthy();
    }
  });

  it('uses a custom emoji mention when configured', () => {
    const emojiMap = parseDiscordEmojiMap('duel=<:pr_duel:123456789012345678>,success=<a:pr_yes:234567890123456789>');

    expect(formatDiscordEmoji('duel', emojiMap)).toBe('<:pr_duel:123456789012345678>');
    expect(formatDiscordEmoji('success', emojiMap)).toBe('<a:pr_yes:234567890123456789>');
  });

  it('falls back to Unicode when a key is not configured', () => {
    const emojiMap = parseDiscordEmojiMap('duel=<:pr_duel:123456789012345678>');

    expect(formatDiscordEmoji('wiki', emojiMap)).toBe(DEFAULT_DISCORD_EMOJIS.wiki);
  });

  it('rejects unknown keys and invalid custom emoji mentions', () => {
    expect(() => parseDiscordEmojiMap('unknown=<:x:123456789012345678>')).toThrow('Unknown Discord emoji key');
    expect(() => parseDiscordEmojiMap('duel=:crossed_swords:')).toThrow('Invalid Discord custom emoji');
  });
});
