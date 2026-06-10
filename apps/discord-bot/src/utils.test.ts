import { describe, expect, it } from 'vitest';

import { formatDiscordTimestamp, isRecord, truncateText } from './utils.js';

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ key: 'value' })).toBe(true);
  });

  it('rejects null, primitives, and arrays', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('text')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(['value'])).toBe(false);
  });
});

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    expect(truncateText('short', 10)).toBe('short');
  });

  it('truncates long text with an ellipsis within the limit', () => {
    const truncated = truncateText('a'.repeat(20), 10);

    expect(truncated).toBe(`${'a'.repeat(7)}...`);
    expect(truncated).toHaveLength(10);
  });
});

describe('formatDiscordTimestamp', () => {
  it('formats valid dates with the requested style', () => {
    expect(formatDiscordTimestamp('2026-06-04T12:00:00.000Z', 'F', 'fallback')).toBe('<t:1780574400:F>');
    expect(formatDiscordTimestamp('2026-06-04T12:00:00.000Z', 'R', 'fallback')).toBe('<t:1780574400:R>');
  });

  it('falls back to the provided copy for invalid dates', () => {
    expect(formatDiscordTimestamp('not-a-date', 'F', 'the listed expiry time')).toBe('the listed expiry time');
    expect(formatDiscordTimestamp('not-a-date', 'R', 'unknown')).toBe('unknown');
  });
});
