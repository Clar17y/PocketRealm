import { describe, expect, it } from 'vitest';
import {
  PRIVATE_SUPPORT_SUMMARY,
  redactSupportText,
  toSupportTicketJsonlRecord,
  type SupportTicketExportSource,
} from './supportTicketRedaction';

function exportSource(overrides: Partial<SupportTicketExportSource> = {}): SupportTicketExportSource {
  return {
    publicId: 'SUP-1',
    status: 'new',
    privacy: 'public_candidate',
    category: 'bug',
    area: 'crafting',
    title: 'Forge broke',
    description: 'My email is player@example.com',
    expectedBehavior: null,
    actualBehavior: null,
    reproductionSteps: null,
    reporterDisplayName: 'Mira',
    discordReporterUserId: null,
    realmLabel: 'Preseason',
    seasonId: null,
    screen: 'forge',
    appVersion: '0.1.0',
    apiVersion: null,
    browser: 'Chrome',
    device: null,
    requestId: 'req-1',
    sentryEventId: null,
    duplicateTicketIds: [],
    githubIssueUrl: null,
    sensitivityFlags: ['personal_data'],
    staffNotes: null,
    createdAt: new Date('2026-05-30T12:00:00.000Z'),
    updatedAt: new Date('2026-05-30T12:01:00.000Z'),
    ...overrides,
  };
}

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
    const record = toSupportTicketJsonlRecord(exportSource());

    expect(record).toEqual({
      id: 'SUP-1',
      status: 'new',
      privacy: 'public_candidate',
      category: 'bug',
      area: 'crafting',
      title: 'Forge broke',
      body: 'My email is [redacted-email]',
      reporter: { displayName: 'Reporter SUP-1', realm: 'Preseason', seasonId: null },
      context: { screen: 'forge', appVersion: '0.1.0', browser: 'Chrome', requestId: 'req-1' },
      sensitivityFlags: ['personal_data'],
      duplicateTicketIds: [],
      githubIssueUrl: null,
      createdAt: '2026-05-30T12:00:00.000Z',
      updatedAt: '2026-05-30T12:01:00.000Z',
    });
    expect(JSON.stringify(record)).not.toContain('player@example.com');
  });

  it.each(['private', 'not_sure'] as const)('withholds the body for %s tickets in JSONL records', (privacy) => {
    const record = toSupportTicketJsonlRecord(exportSource({
      privacy,
      description: 'Raw private body that staff should review in support tools.',
      expectedBehavior: 'Expected behaviour text.',
      actualBehavior: 'Actual behaviour text.',
      reproductionSteps: 'Step one, step two.',
    }));

    expect(record.body).toBe(PRIVATE_SUPPORT_SUMMARY);
    expect(JSON.stringify(record)).not.toContain('Raw private body');
    expect(JSON.stringify(record)).not.toContain('Expected behaviour text');
    expect(JSON.stringify(record)).not.toContain('Step one, step two');
  });

  it('includes the Discord reporter id in JSONL records when present', () => {
    const record = toSupportTicketJsonlRecord(exportSource({
      discordReporterUserId: '12345678901234567',
    }));

    expect(record.reporter).toEqual({
      displayName: 'Reporter SUP-1',
      discordId: '12345678901234567',
      realm: 'Preseason',
      seasonId: null,
    });
  });

  it('omits the Discord reporter id from JSONL records when null', () => {
    const record = toSupportTicketJsonlRecord(exportSource());

    expect(record.reporter).not.toHaveProperty('discordId');
  });

  it('pseudonymizes reporter display names in JSONL export records', () => {
    const record = toSupportTicketJsonlRecord(exportSource({
      publicId: 'SUP-2',
      privacy: 'private',
      area: 'inventory',
      title: 'Inventory bug',
      description: 'Potions did not stack.',
      reporterDisplayName: 'player@example.com',
      screen: null,
      appVersion: null,
      browser: null,
      requestId: null,
      sensitivityFlags: [],
    }));

    expect(record.reporter.displayName).toBe('Reporter SUP-2');
    expect(JSON.stringify(record)).not.toContain('player@example.com');
  });
});
