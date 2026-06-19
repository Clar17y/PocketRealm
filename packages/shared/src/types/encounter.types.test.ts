import { describe, expect, it } from 'vitest';
import { isEncounterMobRole, normalizeEncounterMobRole } from './encounter.types';

describe('encounter role normalization', () => {
  it('accepts current encounter mob roles', () => {
    expect(isEncounterMobRole('trash')).toBe(true);
    expect(isEncounterMobRole('elite')).toBe(true);
    expect(isEncounterMobRole('mini_boss')).toBe(true);
  });

  it('normalizes legacy boss encounter slots to mini_boss', () => {
    expect(normalizeEncounterMobRole('boss')).toBe('mini_boss');
  });

  it('rejects invalid role values', () => {
    expect(normalizeEncounterMobRole('final_boss')).toBeNull();
    expect(normalizeEncounterMobRole(null)).toBeNull();
  });
});
