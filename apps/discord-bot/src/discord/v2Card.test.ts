import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { describe, expect, it } from 'vitest';

import { statusCard, textCard } from './v2Card.js';

describe('v2Card helpers', () => {
  it('builds a Components V2 status card without content or embeds', () => {
    const card = statusCard('success', 'Saved', 'Boss notifications are now ON.');

    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect('content' in card).toBe(false);
    expect('embeds' in card).toBe(false);
    expect(card.allowedMentions).toEqual({ parse: [] });
    expect(cardText(card)).toContain('✅ **Saved**');
    expect(cardText(card)).toContain('Boss notifications are now ON.');
  });

  it('uses custom emoji overrides in card headings', () => {
    const card = statusCard(
      'warning',
      'Link required',
      'Link your PocketRealm account first.',
      { warning: '<:pr_warning:123456789012345678>' },
    );

    expect(cardText(card)).toContain('<:pr_warning:123456789012345678> **Link required**');
  });

  it('builds a text card with action rows nested inside the container', () => {
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('notify:toggle:boss_defeated:1')
        .setLabel('Boss defeated: ON')
        .setStyle(ButtonStyle.Success),
    );

    const card = textCard({
      emojiKey: 'notify',
      title: 'Discord notifications',
      lines: ['Choose which PocketRealm events DM you.'],
      actionRows: [actionRow],
    });

    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(cardText(card)).toContain('🔔 **Discord notifications**');
    expect(cardJson(card)).toContain('notify:toggle:boss_defeated:1');
    expect(cardJson(card)).toContain('Boss defeated: ON');
  });

  it('allows intentional mention policies and ephemeral delivery', () => {
    const card = textCard({
      emojiKey: 'duel',
      title: 'Friendly Simulation Challenge',
      lines: ['<@111111111111111111>, <@222222222222222222> challenged you.'],
      allowedMentions: { users: ['111111111111111111'] },
      ephemeral: true,
    });

    expect(card.allowedMentions).toEqual({ users: ['111111111111111111'] });
    expect(card.ephemeral).toBe(true);
  });
});

function cardJson(payload: { components: Array<{ toJSON: () => unknown }> }): string {
  return JSON.stringify(payload.components.map((component) => component.toJSON()));
}

function cardText(payload: { components: Array<{ toJSON: () => unknown }> }): string {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;

    const record = node as { type?: number; content?: unknown; components?: unknown };
    if (record.type === 10 && typeof record.content === 'string') {
      texts.push(record.content);
    }
    if (Array.isArray(record.components)) {
      record.components.forEach(walk);
    }
  };

  payload.components.map((component) => component.toJSON()).forEach(walk);
  return texts.join('\n');
}
