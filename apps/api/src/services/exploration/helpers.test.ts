import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));
vi.mock('@pocketrealm/game-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pocketrealm/game-engine')>();
  return {
    ...actual,
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
  };
});

import { buildEncounterSiteMobs, pickEncounterFamilyMemberForRole } from './helpers';

const ZONE_ID = '00000000-0000-0000-0000-000000000001';

type EncounterFamily = Parameters<typeof buildEncounterSiteMobs>[0];
type EncounterFamilyMember = EncounterFamily['members'][number];

function spiderFamily(members: EncounterFamilyMember[]): EncounterFamily {
  return {
    id: 'family-spider',
    name: 'Spiders',
    siteNounSmall: 'Nest',
    siteNounMedium: 'Nest',
    siteNounLarge: 'Nest',
    members,
  };
}

function webSpinnerMember(explorationTier: number = 3): EncounterFamilyMember {
  return {
    role: 'trash',
    mobTemplate: {
      id: 'web-spinner',
      name: 'Web Spinner',
      zoneId: ZONE_ID,
      explorationTier,
    },
  };
}

describe('buildEncounterSiteMobs', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses final-room promoted role assignments without emitting boss slots', () => {
    const mobs = buildEncounterSiteMobs(
      spiderFamily([
        webSpinnerMember(),
        {
          role: 'mini_boss',
          mobTemplate: {
            id: 'spider-boss',
            name: 'Spider Queen',
            zoneId: ZONE_ID,
            explorationTier: 3,
          },
        },
      ]),
      'large',
      ZONE_ID,
      100,
      null,
      3,
    );

    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'trash', 'elite']);
    expect(mobs.map((mob) => mob.role)).not.toContain('boss');
    expect(mobs.at(-1)?.room).toBe(3);
    expect(mobs.at(-1)?.mobTemplateId).toBe('web-spinner');
  });

  it('moves an early-only elite roll to the final room when persisted', () => {
    vi.mocked(Math.random)
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.99);

    const mobs = buildEncounterSiteMobs(
      spiderFamily([webSpinnerMember()]),
      'large',
      ZONE_ID,
      100,
      null,
      3,
    );

    expect(mobs.map((mob) => ({ room: mob.room, role: mob.role }))).toEqual([
      { room: 1, role: 'trash' },
      { room: 2, role: 'trash' },
      { room: 3, role: 'elite' },
    ]);
  });

  it('keeps an earlier elite when another elite provides final-room pressure', () => {
    vi.mocked(Math.random)
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.99);

    const mobs = buildEncounterSiteMobs(
      spiderFamily([webSpinnerMember()]),
      'large',
      ZONE_ID,
      100,
      null,
      3,
    );

    expect(mobs.map((mob) => ({ room: mob.room, role: mob.role }))).toEqual([
      { room: 1, role: 'elite' },
      { room: 2, role: 'trash' },
      { room: 3, role: 'elite' },
    ]);
  });

  it('can promote the same eligible base template to trash and elite roles', () => {
    const mobs = buildEncounterSiteMobs(
      spiderFamily([webSpinnerMember()]),
      'large',
      ZONE_ID,
      100,
      null,
      3,
    );

    expect(mobs.map((mob) => mob.mobTemplateId)).toEqual(['web-spinner', 'web-spinner', 'web-spinner']);
    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'trash', 'elite']);
  });

  it('only uses tier-eligible members when building tracked encounter sites', () => {
    const mobs = buildEncounterSiteMobs(
      spiderFamily([
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
      ]),
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
    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'trash', 'elite']);
  });

  it('skips tiers that only have expedition members when building encounter sites', () => {
    const mobs = buildEncounterSiteMobs(
      spiderFamily([
        webSpinnerMember(2),
        {
          role: 'expedition_normal',
          mobTemplate: {
            id: 'expedition-broodguard',
            name: 'Expedition Broodguard',
            zoneId: ZONE_ID,
            explorationTier: 3,
          },
        },
      ]),
      'large',
      ZONE_ID,
      100,
      null,
      3,
    );

    expect(mobs).toHaveLength(3);
    expect(mobs.map((mob) => mob.mobTemplateId)).toEqual([
      'web-spinner',
      'web-spinner',
      'web-spinner',
    ]);
    expect(mobs.map((mob) => mob.role)).toEqual(['trash', 'trash', 'elite']);
  });
});

describe('pickEncounterFamilyMemberForRole', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses base encounter templates for promoted instance roles when available', () => {
    const trash = webSpinnerMember();
    const elite: EncounterFamilyMember = {
      role: 'elite',
      mobTemplate: {
        id: 'giant-web-spinner',
        name: 'Giant Web Spinner',
        zoneId: ZONE_ID,
        explorationTier: 3,
      },
    };
    const miniBoss: EncounterFamilyMember = {
      role: 'mini_boss',
      mobTemplate: {
        id: 'web-queen',
        name: 'Web Queen',
        zoneId: ZONE_ID,
        explorationTier: 3,
      },
    };

    expect(pickEncounterFamilyMemberForRole([trash, elite, miniBoss], 'elite')?.mobTemplate.id)
      .toBe('web-spinner');
    expect(pickEncounterFamilyMemberForRole([trash, elite, miniBoss], 'mini_boss')?.mobTemplate.id)
      .toBe('web-spinner');
  });
});
