import { describe, expect, it } from 'vitest';
import { formatEncounterMobDisplayName } from '@pocketrealm/shared';

import {
  buildEncounterSiteMobPreview,
} from './sites';

describe('encounter site route helpers', () => {
  it('builds role-scaled preview HP for promoted current-room mobs', () => {
    const preview = buildEncounterSiteMobPreview(
      {
        slot: 4,
        prefix: null,
        role: 'elite',
      },
      {
        name: 'Web Spinner',
        hp: 100,
      },
      1.25,
    );

    expect(preview).toEqual({
      slot: 4,
      name: 'Web Spinner',
      prefix: null,
      role: 'elite',
      hp: 200,
      maxHp: 200,
    });
  });

  it('includes promoted roles in encounter-site mob display names', () => {
    expect(formatEncounterMobDisplayName({
      name: 'Web Spinner',
      prefix: 'gigantic',
      role: 'mini_boss',
    })).toBe('Gigantic Mini-Boss Web Spinner');
  });
});
