import { describe, expect, it } from 'vitest';

import { botHeadline, botStatus, compactLines } from './messageFormat.js';

describe('discord message formatting helpers', () => {
  it('formats a headline with semantic emoji and bold text', () => {
    expect(botHeadline('link', 'Link PocketRealm')).toBe('🔗 **Link PocketRealm**');
  });

  it('uses configured custom emoji in headlines', () => {
    expect(botHeadline('duel', 'Friendly simulation', { duel: '<:pr_duel:123456789012345678>' }))
      .toBe('<:pr_duel:123456789012345678> **Friendly simulation**');
  });

  it('formats short statuses as one line', () => {
    expect(botStatus('success', 'Saved', 'Boss defeated notifications are now ON.'))
      .toBe('✅ **Saved** - Boss defeated notifications are now ON.');
  });

  it('filters empty lines without trimming meaningful content', () => {
    expect(compactLines(['A', null, '', 'B'])).toBe('A\nB');
  });
});
