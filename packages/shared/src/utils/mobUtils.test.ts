import { describe, it, expect } from 'vitest';
import { formatEncounterMobDisplayName, splitEncounterMobDisplayName } from './mobUtils';

describe('formatEncounterMobDisplayName', () => {
  it('prepends the role label after the prefix', () => {
    expect(formatEncounterMobDisplayName({ name: 'Web Spinner', prefix: 'ancient', role: 'elite' }))
      .toBe('Ancient Elite Web Spinner');
    expect(formatEncounterMobDisplayName({ name: 'Wolf', prefix: null, role: 'mini_boss' }))
      .toBe('Mini-Boss Wolf');
  });

  it('omits the role label when includeRole is false', () => {
    expect(formatEncounterMobDisplayName({ name: 'Web Spinner', prefix: 'ancient', role: 'elite' }, { includeRole: false }))
      .toBe('Ancient Web Spinner');
  });

  it('shows no role label for trash or missing role', () => {
    expect(formatEncounterMobDisplayName({ name: 'Wolf', prefix: null, role: 'trash' })).toBe('Wolf');
    expect(formatEncounterMobDisplayName({ name: 'Wolf', prefix: null })).toBe('Wolf');
  });
});

describe('splitEncounterMobDisplayName', () => {
  it('extracts the role and strips its token, preserving the prefix', () => {
    expect(splitEncounterMobDisplayName('Ancient Elite Web Spinner'))
      .toEqual({ role: 'elite', name: 'Ancient Web Spinner' });
    expect(splitEncounterMobDisplayName('Mini-Boss Wolf'))
      .toEqual({ role: 'mini_boss', name: 'Wolf' });
  });

  it('returns a null role for names without a role token', () => {
    expect(splitEncounterMobDisplayName('Ancient Web Spinner'))
      .toEqual({ role: null, name: 'Ancient Web Spinner' });
    expect(splitEncounterMobDisplayName('Goblin Raider'))
      .toEqual({ role: null, name: 'Goblin Raider' });
  });

  it('round-trips with formatEncounterMobDisplayName', () => {
    for (const role of ['elite', 'mini_boss'] as const) {
      const display = formatEncounterMobDisplayName({ name: 'Web Spinner', prefix: 'ancient', role });
      const split = splitEncounterMobDisplayName(display);
      expect(split.role).toBe(role);
      expect(split.name).toBe(formatEncounterMobDisplayName({ name: 'Web Spinner', prefix: 'ancient', role }, { includeRole: false }));
    }
  });
});
