import { describe, it, expect } from 'vitest';
import { validateEnum } from './validateEnum';

describe('validateEnum', () => {
  const VALID = new Set(['a', 'b', 'c'] as const);
  type Letter = 'a' | 'b' | 'c';

  it('returns value when it is in the valid set', () => {
    expect(validateEnum<Letter>('a', VALID, 'c')).toBe('a');
    expect(validateEnum<Letter>('b', VALID, 'c')).toBe('b');
  });

  it('returns fallback for invalid value', () => {
    expect(validateEnum<Letter>('x', VALID, 'c')).toBe('c');
  });

  it('returns fallback for empty string', () => {
    expect(validateEnum<Letter>('', VALID, 'c')).toBe('c');
  });
});
