import { describe, expect, it } from 'vitest';
import { validatePassword } from './passwordValidation';

describe('validatePassword', () => {
  it('rejects passwords shorter than 10 characters', () => {
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/at least 10 characters/i);
  });

  it('rejects passwords longer than 100 characters', () => {
    const result = validatePassword('a'.repeat(101));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/100 characters/i);
  });

  it('rejects common passwords from blocklist', () => {
    const result = validatePassword('password123');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too common/i);
  });

  it('rejects common passwords case-insensitively', () => {
    const result = validatePassword('Password123');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too common/i);
  });

  it('accepts valid passwords', () => {
    const result = validatePassword('myUniquePassphrase2026');
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('accepts passwords at exactly 10 characters', () => {
    const result = validatePassword('abcdefghij');
    expect(result.valid).toBe(true);
  });

  it('accepts passwords at exactly 100 characters', () => {
    const result = validatePassword('a'.repeat(100));
    expect(result.valid).toBe(true);
  });
});
