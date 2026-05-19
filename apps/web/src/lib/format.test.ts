import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent, relativeTime, titleCaseFromSnake } from './format';

describe('titleCaseFromSnake', () => {
  it('converts snake_case to Title Case', () => {
    expect(titleCaseFromSnake('hello_world')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(titleCaseFromSnake('hello')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(titleCaseFromSnake('')).toBe('');
  });

  it('handles multiple underscores', () => {
    expect(titleCaseFromSnake('one_two_three')).toBe('One Two Three');
  });

  it('handles strings with numbers', () => {
    expect(titleCaseFromSnake('level_10_boss')).toBe('Level 10 Boss');
  });

  it('handles already capitalized input', () => {
    expect(titleCaseFromSnake('HELLO_WORLD')).toBe('HELLO WORLD');
  });
});

describe('formatNumber', () => {
  it('limits fractional digits to two and strips trailing zeroes', () => {
    expect(formatNumber(1.2345)).toBe('1.23');
    expect(formatNumber(1.2)).toBe('1.2');
    expect(formatNumber(1)).toBe('1');
  });

  it('rounds tiny floating point residue down to zero', () => {
    expect(formatNumber(0.00000001)).toBe('0');
    expect(formatNumber(0.0009)).toBe('0');
  });

  it('shows real sub-cent values instead of rounding them to zero', () => {
    expect(formatNumber(0.001)).toBe('<0.01');
    expect(formatNumber(0.0049)).toBe('<0.01');
    expect(formatNumber(-0.0049)).toBe('-<0.01');
    expect(formatNumber(0.005)).toBe('0.01');
  });

  it('keeps locale grouping for large values', () => {
    expect(formatNumber(12345.678)).toBe('12,345.68');
  });
});

describe('formatPercent', () => {
  it('formats ratios as percentages with at most two decimal places', () => {
    expect(formatPercent(0.0015)).toBe('0.15%');
    expect(formatPercent(0.0001)).toBe('0.01%');
    expect(formatPercent(0.04)).toBe('4%');
  });

  it('keeps real sub-cent percentages while hiding residue', () => {
    expect(formatPercent(0.00001)).toBe('<0.01%');
    expect(formatPercent(0.000009)).toBe('0%');
  });
});

describe('relativeTime', () => {
  it('returns "just now" for sub-60s deltas', () => {
    expect(relativeTime(0)).toBe('just now');
    expect(relativeTime(59_000)).toBe('just now');
  });

  it('returns minutes for 1-59 min', () => {
    expect(relativeTime(60_000)).toBe('1m ago');
    expect(relativeTime(45 * 60_000)).toBe('45m ago');
  });

  it('returns hours for 1-23h', () => {
    expect(relativeTime(3_600_000)).toBe('1h ago');
    expect(relativeTime(23 * 3_600_000)).toBe('23h ago');
  });

  it('returns days for 1-6d', () => {
    expect(relativeTime(86_400_000)).toBe('1d ago');
    expect(relativeTime(6 * 86_400_000)).toBe('6d ago');
  });

  it('returns weeks for 7d+', () => {
    expect(relativeTime(7 * 86_400_000)).toBe('1w ago');
    expect(relativeTime(21 * 86_400_000)).toBe('3w ago');
  });

  it('clamps negative deltas to "just now"', () => {
    expect(relativeTime(-5000)).toBe('just now');
  });

  it('accepts ISO string input', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinAgo)).toBe('5m ago');
  });
});
