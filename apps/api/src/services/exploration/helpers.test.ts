import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));
vi.mock('@pocketrealm/game-engine', () => ({
  assignEncounterRolesToRooms: vi.fn(() => [
    { room: 1, role: 'trash' },
    { room: 2, role: 'elite' },
    { room: 3, role: 'mini_boss' },
  ]),
  generateRoomAssignments: vi.fn((size: 'small' | 'medium' | 'large') => ({
    rooms: size === 'large'
      ? [
          { roomNumber: 1, mobCount: 1 },
          { roomNumber: 2, mobCount: 1 },
          { roomNumber: 3, mobCount: 1 },
        ]
      : [{ roomNumber: 1, mobCount: 1 }],
    totalMobs: size === 'large' ? 3 : 1,
  })),
  rollMobPrefix: vi.fn(() => null),
  selectTierWithBleedthrough: vi.fn(() => 3),
}));

import { buildEncounterSiteMobs } from './helpers';

const ZONE_ID = '00000000-0000-0000-0000-000000000001';

describe('buildEncounterSiteMobs', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses role assignments for final-room promoted roles without emitting boss slots', () => {
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
              id: 'web-spinner',
              name: 'Web Spinner',
              zoneId: ZONE_ID,
              explorationTier: 3,
            },
          },
          {
            role: 'mini_boss',
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

    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'elite', 'mini_boss']);
    expect(mobs.map((mob) => mob.role)).not.toContain('boss');
    expect(mobs.at(-1)?.room).toBe(3);
    expect(mobs.at(-1)?.mobTemplateId).toBe('spider-boss');
  });

  it('can promote the same eligible base template to trash and elite roles', () => {
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
              id: 'web-spinner',
              name: 'Web Spinner',
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

    expect(mobs.map((mob) => mob.mobTemplateId)).toEqual(['web-spinner', 'web-spinner', 'web-spinner']);
    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'elite', 'mini_boss']);
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
            role: 'mini_boss',
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
    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'elite', 'mini_boss']);
  });
});
