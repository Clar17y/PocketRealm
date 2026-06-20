import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import {
  AnnouncementCardValidationError,
  MAX_ANNOUNCEMENT_TEXT_LENGTH,
  buildAnnouncementCard,
} from './announcementCard.js';

const zeroWidthSpace = '\u200B';

describe('buildAnnouncementCard', () => {
  it('renders changelog markdown as a readable Components V2 card', () => {
    const card = buildAnnouncementCard({
      message: [
        '# Weekly Realm Update',
        '',
        '## Combat',
        '⚔️ Raid bosses now show threat progress.',
        '- Duel replay damage order is fixed.',
        '',
        '## Fixes',
        '🛠️ Inventory sync is faster after crafting and selling.',
        '',
        'Read more: https://pocketrealm.app/changelog',
      ].join('\n'),
      everyone: false,
    });

    expectV2Card(card);
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(card.allowedMentions).toEqual({ parse: [] });
    expect(cardText(card)).toBe([
      '📜 **Weekly Realm Update**',
      '',
      '**Combat**',
      '⚔️ Raid bosses now show threat progress.',
      '• Duel replay damage order is fixed.',
      '',
      '**Fixes**',
      '🛠️ Inventory sync is faster after crafting and selling.',
      '',
      'Read more: https://pocketrealm.app/changelog',
    ].join('\n'));
  });

  it('falls back to Announcement when no top-level heading is provided', () => {
    const card = buildAnnouncementCard({
      message: [
        '## Combat',
        '* Buffed raid boss rewards.',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toBe([
      '📜 **Announcement**',
      '',
      '**Combat**',
      '• Buffed raid boss rewards.',
    ].join('\n'));
  });

  it('allows a title-only card when the input has a meaningful title', () => {
    const card = buildAnnouncementCard({
      message: '# Server restart at 20:00 UTC',
      everyone: false,
    });

    expect(cardText(card)).toBe('📜 **Server restart at 20:00 UTC**');
  });

  it('uses the first top-level heading as title even after body text', () => {
    const card = buildAnnouncementCard({
      message: [
        'Intro text',
        '# Real Title',
        'Body',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toBe([
      '📜 **Real Title**',
      '',
      'Intro text',
      'Body',
    ].join('\n'));
  });

  it('preserves top-level heading text without a whitespace separator', () => {
    const card = buildAnnouncementCard({
      message: '#Title',
      everyone: false,
    });

    expect(cardText(card)).toBe([
      '📜 **Announcement**',
      '',
      '#Title',
    ].join('\n'));
  });

  it('preserves a lone hash line as body text', () => {
    const card = buildAnnouncementCard({
      message: [
        '#',
        'Body',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toBe([
      '📜 **Announcement**',
      '',
      '#',
      'Body',
    ].join('\n'));
  });

  it('keeps unsupported markdown as text instead of interpreting it', () => {
    const card = buildAnnouncementCard({
      message: [
        '# Patch Notes',
        '',
        '> Quoted text stays as text.',
        '| Area | Change |',
        '| --- | --- |',
        '| Combat | Faster logs |',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toContain('> Quoted text stays as text.');
    expect(cardText(card)).toContain('| Area | Change |');
    expect(cardText(card)).toContain('| Combat | Faster logs |');
  });

  it('preserves unsupported deep headings as literal text', () => {
    const card = buildAnnouncementCard({
      message: [
        '# Patch Notes',
        '#### Deep Heading',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toBe([
      '📜 **Patch Notes**',
      '',
      '#### Deep Heading',
    ].join('\n'));
  });

  it('prefixes one intentional everyone mention and neutralizes body mass mentions', () => {
    const card = buildAnnouncementCard({
      message: 'Event now @here @everyone <@123456789012345678> <@&234567890123456789>',
      everyone: true,
    });

    expect(card.allowedMentions).toEqual({ parse: ['everyone'] });
    expect(cardText(card)).toBe([
      '@everyone',
      '',
      '📜 **Announcement**',
      '',
      `Event now @${zeroWidthSpace}here @${zeroWidthSpace}everyone <@123456789012345678> <@&234567890123456789>`,
    ].join('\n'));
  });

  it('neutralizes title mass mentions when sending an intentional everyone mention', () => {
    const card = buildAnnouncementCard({
      message: '# Update @everyone and @here',
      everyone: true,
    });

    expect(cardText(card)).toBe([
      '@everyone',
      '',
      `📜 **Update @${zeroWidthSpace}everyone and @${zeroWidthSpace}here**`,
    ].join('\n'));
  });

  it('uses custom announcement emoji overrides', () => {
    const card = buildAnnouncementCard(
      {
        message: '# Patch Notes',
        everyone: false,
      },
      {
        emojiMap: { announcement: '<:pr_scroll:123456789012345678>' },
      },
    );

    expect(cardText(card)).toBe('<:pr_scroll:123456789012345678> **Patch Notes**');
  });

  it('rejects empty announcement text', () => {
    expect(() => buildAnnouncementCard({ message: '   ', everyone: false })).toThrow(AnnouncementCardValidationError);
  });

  it('rejects output that exceeds the card text limit', () => {
    const oversized = `# Patch Notes\n${'x'.repeat(MAX_ANNOUNCEMENT_TEXT_LENGTH)}`;

    expect(() => buildAnnouncementCard({ message: oversized, everyone: false })).toThrow(
      'Announcement message is too long. Shorten it and try again.',
    );
  });
});
