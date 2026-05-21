import { describe, expect, it } from 'vitest';

import { getGatheringResourceCategory, getResourceTypesForGatheringCategory } from './gatheringResourceCategory';

describe('gatheringResourceCategory', () => {
  it.each([
    ['Iron Ore', 'ore'],
    ['iron_ore', 'ore'],
    ['Sandstone', 'ore'],
    ['Oak Log', 'wood'],
    ['Forest Sage', 'herb'],
    ['Moonpetal', 'herb'],
    ['Cave Moss', 'herb'],
  ])('maps %s to %s', (resourceType, expectedCategory) => {
    expect(getGatheringResourceCategory(resourceType)).toBe(expectedCategory);
  });

  it('returns known seeded resource names for category filters', () => {
    expect(getResourceTypesForGatheringCategory('ore')).toEqual(expect.arrayContaining(['Iron Ore', 'Sandstone']));
    expect(getResourceTypesForGatheringCategory('wood')).toEqual(expect.arrayContaining(['Oak Log']));
    expect(getResourceTypesForGatheringCategory('herb')).toEqual(expect.arrayContaining(['Forest Sage', 'Moonpetal']));
  });
});
