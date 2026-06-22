import { describe, expect, it } from 'vitest';
import {
  encounterMobDisplayName,
  encounterMobRoleBadge,
} from './combatHelpers';

describe('encounterMobDisplayName', () => {
  it('keeps normal mobs as their base name', () => {
    expect(encounterMobDisplayName({ name: 'Web Spinner', prefix: null, role: 'trash' })).toBe('Web Spinner');
  });

  it('inserts elite role between prefix and base name', () => {
    expect(encounterMobDisplayName({ name: 'Web Spinner', prefix: 'gigantic', role: 'elite' })).toBe('Gigantic Elite Web Spinner');
  });

  it('inserts mini-boss role between prefix and base name', () => {
    expect(encounterMobDisplayName({ name: 'Web Spinner', prefix: 'frail', role: 'mini_boss' })).toBe('Frail Mini-Boss Web Spinner');
  });

  it('does not duplicate a prefix already included in the mob name', () => {
    expect(encounterMobDisplayName({ name: 'Gigantic Web Spinner', prefix: 'gigantic', role: 'elite' })).toBe('Gigantic Elite Web Spinner');
  });
});

describe('encounterMobRoleBadge', () => {
  it('labels promoted encounter roles without using Boss', () => {
    expect(encounterMobRoleBadge('elite').label).toBe('Elite');
    expect(encounterMobRoleBadge('mini_boss').label).toBe('Mini-Boss');
  });
});
