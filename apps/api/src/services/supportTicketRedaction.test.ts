import { describe, expect, it } from 'vitest';
import { redactSupportText, toSupportTicketJsonlRecord } from './supportTicketRedaction';

describe('support ticket redaction', () => {
  it('redacts email addresses and bearer tokens from free text', () => {
    const result = redactSupportText('email me at player@example.com with Bearer abc.def.ghi');
    expect(result).toBe('email me at [redacted-email] with Bearer [redacted-token]');
  });

  it('redacts UUID-like internal identifiers', () => {
    const result = redactSupportText('player id 123e4567-e89b-12d3-a456-426614174000 broke');
    expect(result).toBe('player id [redacted-id] broke');
  });

  it('creates a compact JSONL-safe record without internal ids', () => {
    const record = toSupportTicketJsonlRecord({
      publicId: 'SUP-1',
      status: 'new',
      privacy: 'private',
      category: 'bug',
      area: 'crafting',
      title: 'Forge broke',
      description: 'My email is player@example.com',
      expectedBehavior: null,
      actualBehavior: null,
      reproductionSteps: null,
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      screen: 'forge',
      appVersion: '0.1.0',
      apiVersion: null,
      browser: 'Chrome',
      device: null,
      requestId: 'req-1',
      sentryEventId: null,
      attachmentMetadata: null,
      duplicateTicketIds: [],
      githubIssueUrl: null,
      sensitivityFlags: ['personal_data'],
      createdAt: new Date('2026-05-30T12:00:00.000Z'),
      updatedAt: new Date('2026-05-30T12:01:00.000Z'),
    });

    expect(record).toEqual({
      id: 'SUP-1',
      status: 'new',
      privacy: 'private',
      category: 'bug',
      area: 'crafting',
      title: 'Forge broke',
      body: 'My email is [redacted-email]',
      reporter: { displayName: 'Mira', realm: 'Preseason' },
      context: { screen: 'forge', appVersion: '0.1.0', browser: 'Chrome', requestId: 'req-1' },
      sensitivityFlags: ['personal_data'],
      duplicateTicketIds: [],
      githubIssueUrl: null,
      createdAt: '2026-05-30T12:00:00.000Z',
      updatedAt: '2026-05-30T12:01:00.000Z',
    });
    expect(JSON.stringify(record)).not.toContain('player@example.com');
  });
});
