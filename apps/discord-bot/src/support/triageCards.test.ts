import { describe, expect, it } from 'vitest';

import { cardJson, cardText, expectV2Card } from '../test/v2CardAssertions.js';
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
    const payload = buildTriageCard(ticket);
    const text = cardText(payload);
    const createdTimestamp = Math.floor(new Date(ticket.createdAt).getTime() / 1000);

    expectV2Card(payload);
    expect(text).toContain('SUP-1 - Forge failed after upgrade');
    expect(text).toContain('Private report body withheld. Review in staff support tools.');
    expect(text).toContain('Status: `new`');
    expect(text).toContain('Privacy: `private`');
    expect(text).toContain('Category: `bug`');
    expect(text).toContain('Area: `crafting`');
    expect(text).toContain('Realm: Spring Realm');
    expect(text).toContain('Sensitivity: personal_data, security');
    expect(text).toContain(`Created: <t:${createdTimestamp}:f>`);
    expect(JSON.stringify(payload)).not.toContain('Mira');
    expect(JSON.stringify(payload)).not.toContain('Raw private body');
    expect(JSON.stringify(payload)).not.toContain('player@example.com');
  });

  it('includes the required support action button ids', () => {
    const json = cardJson(buildTriageCard(ticket));

    expect(json).toContain('support:ask_reporter:SUP-1');
    expect(json).toContain('support:needs_info:SUP-1');
    expect(json).toContain('support:accepted:SUP-1');
    expect(json).toContain('support:rejected:SUP-1');
    expect(json).toContain('support:security:SUP-1');
    expect(json).toContain('support:closed:SUP-1');
    expect(json).toContain('support:archive_thread:SUP-1');
  });

  it('uses the fallback summary and realm values when optional ticket details are absent', () => {
    const payload = buildTriageCard({
      ...ticket,
      summary: '',
      realmLabel: null,
      sensitivityFlags: [],
    });
    const text = cardText(payload);

    expectV2Card(payload);
    expect(text).toContain('No summary provided.');
    expect(text).toContain('Realm: Unknown');
    expect(text).toContain('Sensitivity: none');
  });
});
