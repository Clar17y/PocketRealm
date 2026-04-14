import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import {
  applyTrackedFamilyWeightBias,
  buildTrackableMobFamiliesByZone,
} from './explorationTrackingService';

describe('applyTrackedFamilyWeightBias', () => {
  it('boosts tracked candidates and suppresses non-tracked ones', () => {
    const result = applyTrackedFamilyWeightBias(
      [
        { mobFamilyId: 'family-spider', encounterWeight: 100 },
        { mobFamilyId: 'family-rat', encounterWeight: 100 },
      ],
      'family-spider',
      'encounterWeight',
    );

    expect(result).toEqual([
      { mobFamilyId: 'family-spider', encounterWeight: 400 },
      { mobFamilyId: 'family-rat', encounterWeight: 35 },
    ]);
  });

  it('returns the original candidates when the tracked family is absent', () => {
    const input = [
      { mobFamilyId: 'family-rat', encounterWeight: 100 },
    ];

    expect(applyTrackedFamilyWeightBias(input, 'family-spider', 'encounterWeight')).toEqual(input);
  });
});

describe('buildTrackableMobFamiliesByZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unique discovered families per zone using the lowest zone tier for each unlocked family', async () => {
    mockPrisma.playerBestiary.findMany.mockResolvedValue([
      { mobTemplateId: 'mob-spider-a' },
      { mobTemplateId: 'mob-spider-b' },
      { mobTemplateId: 'mob-rat-a' },
    ]);
    mockPrisma.mobFamilyMember.findMany
      .mockResolvedValueOnce([
        {
          mobFamilyId: 'family-spider',
          mobTemplate: { zoneId: 'zone-forest', explorationTier: 3 },
          mobFamily: { name: 'Spiders' },
        },
        {
          mobFamilyId: 'family-rat',
          mobTemplate: { zoneId: 'zone-forest', explorationTier: 3 },
          mobFamily: { name: 'Rats' },
        },
      ])
      .mockResolvedValueOnce([
        {
          mobFamilyId: 'family-spider',
          mobTemplate: { zoneId: 'zone-forest', explorationTier: 3 },
        },
        {
          mobFamilyId: 'family-spider',
          mobTemplate: { zoneId: 'zone-forest', explorationTier: 1 },
        },
        {
          mobFamilyId: 'family-rat',
          mobTemplate: { zoneId: 'zone-forest', explorationTier: 3 },
        },
        {
          mobFamilyId: 'family-rat',
          mobTemplate: { zoneId: 'zone-forest', explorationTier: 1 },
        },
      ]);

    const result = await buildTrackableMobFamiliesByZone('player-1', ['zone-forest']);

    expect(result.get('zone-forest')).toEqual([
      { mobFamilyId: 'family-rat', name: 'Rats', minTier: 1 },
      { mobFamilyId: 'family-spider', name: 'Spiders', minTier: 1 },
    ]);
  });
});
