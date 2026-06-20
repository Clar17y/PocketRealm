import { describe, expect, it } from 'vitest';
import { formatEncounterMobDisplayName } from '@pocketrealm/shared';

describe('encounter site route helpers', () => {
  it('includes promoted roles in encounter-site mob display names', () => {
    expect(formatEncounterMobDisplayName({
      name: 'Web Spinner',
      prefix: 'gigantic',
      role: 'mini_boss',
    })).toBe('Gigantic Mini-Boss Web Spinner');
  });
});
