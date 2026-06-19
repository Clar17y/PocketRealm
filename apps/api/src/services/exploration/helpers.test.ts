import { describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));
vi.mock('@pocketrealm/game-engine', () => ({
  generateRoomAssignments: vi.fn((size: 'small' | 'medium' | 'large') => ({
    rooms: size === 'large'
      ? [{ roomNumber: 1, mobCount: 3 }]
      : [{ roomNumber: 1, mobCount: 1 }],
    totalMobs: size === 'large' ? 3 : 1,
  })),
  rollMobPrefix: vi.fn(() => null),
  selectTierWithBleedthrough: vi.fn(() => 3),
}));

import { buildEncounterSiteMobs } from './helpers';

const ZONE_ID = '00000000-0000-0000-0000-000000000001';

describe('buildEncounterSiteMobs', () => {
  it('emits mini_boss slots for large encounter sites with legacy boss family members', () => {
    const mobs = buildEncounterSiteMobs(
      {
        id: 'family-spider',
        name: 'Spiders',
        siteNounSmall: 'Nest',
        siteNounMedium: 'Nest',
        siteNounLarge: 'Nest',
        members: [
          {
            role: 'elite',
            mobTemplate: {
              id: 'spider-elite',
              name: 'Elite Spider',
              zoneId: ZONE_ID,
              explorationTier: 3,
            },
          },
          {
            role: 'boss',
            mobTemplate: {
              id: 'spider-boss',
              name: 'Spider Queen',
              zoneId: ZONE_ID,
              explorationTier: 3,
            },
          },
        ],
      },
      'large',
      ZONE_ID,
      100,
      null,
      3,
    );

    expect(mobs.map((mob) => mob.role)).toEqual(['elite', 'elite', 'mini_boss']);
    expect(mobs.at(-1)?.mobTemplateId).toBe('spider-boss');
  });

  it('only uses tier-eligible members when building tracked encounter sites', () => {
    const mobs = buildEncounterSiteMobs(
      {
        id: 'family-spider',
        name: 'Spiders',
        siteNounSmall: 'Nest',
        siteNounMedium: 'Nest',
        siteNounLarge: 'Nest',
        members: [
          {
            role: 'trash',
            mobTemplate: {
              id: 'spider-trap',
              name: 'Spiderling',
              zoneId: ZONE_ID,
              explorationTier: 1,
            },
          },
          {
            role: 'elite',
            mobTemplate: {
              id: 'spider-elite',
              name: 'Elite Spider',
              zoneId: ZONE_ID,
              explorationTier: 3,
            },
          },
          {
            role: 'boss',
            mobTemplate: {
              id: 'spider-boss',
              name: 'Spider Queen',
              zoneId: ZONE_ID,
              explorationTier: 3,
            },
          },
        ],
      },
      'large',
      ZONE_ID,
      100,
      null,
      1,
    );

    expect(mobs).toHaveLength(3);
    expect(mobs.map((mob) => mob.mobTemplateId)).toEqual([
      'spider-trap',
      'spider-trap',
      'spider-trap',
    ]);
  });
});
