import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { buildTriageCard, type SupportTriageTicketDto } from './triageCards.js';

const ticket: SupportTriageTicketDto = {
  publicId: 'SUP-1',
  status: 'new',
  privacy: 'private',
  category: 'bug',
  area: 'crafting',
  sensitivityFlags: ['personal_data', 'security'],
  title: 'Forge failed after upgrade',
  summary: 'Private report body withheld. Review in staff support tools.',
  realmLabel: 'Spring Realm',
  createdAt: '2026-06-04T12:00:00.000Z',
};

describe('buildTriageCard', () => {
  it('builds a support triage card from sanitized ticket fields', () => {
    const payload = serializeCard(buildTriageCard(ticket));

    expect(payload.content).toBe('New support ticket `SUP-1`');
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds?.[0]).toMatchObject({
      title: 'SUP-1 - Forge failed after upgrade',
      description: 'Private report body withheld. Review in staff support tools.',
      fields: expect.arrayContaining([
        { name: 'Status', value: 'new', inline: true },
        { name: 'Privacy', value: 'private', inline: true },
        { name: 'Category', value: 'bug', inline: true },
        { name: 'Area', value: 'crafting', inline: true },
        { name: 'Realm', value: 'Spring Realm', inline: true },
        { name: 'Sensitivity', value: 'personal_data, security', inline: false },
      ]),
    });
    expect(JSON.stringify(payload)).not.toContain('Mira');
    expect(JSON.stringify(payload)).not.toContain('Raw private body');
    expect(JSON.stringify(payload)).not.toContain('player@example.com');
  });

  it('includes the required support action button ids', () => {
    const payload = serializeCard(buildTriageCard(ticket));
    const customIds = payload.components
      ?.flatMap((row) => row.components)
      .filter((component) => component.type === ComponentType.Button)
      .map((component) => component.custom_id);

    expect(customIds).toEqual(expect.arrayContaining([
      'support:ask_reporter:SUP-1',
      'support:needs_info:SUP-1',
      'support:accepted:SUP-1',
      'support:rejected:SUP-1',
      'support:security:SUP-1',
      'support:closed:SUP-1',
      'support:archive_thread:SUP-1',
    ]));
  });
});

function serializeCard(card: ReturnType<typeof buildTriageCard>) {
  return {
    content: card.content,
    embeds: card.embeds.map((embed) => embed.toJSON()),
    components: card.components.map((row) => row.toJSON()) as Array<{
      components: Array<{ type: ComponentType; custom_id?: string }>;
    }>,
  };
}
