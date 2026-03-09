import { describe, expect, it } from 'vitest';

import { getAllItemTemplates } from './items';

const SUPPORTED_ITEM_STAT_KEYS = new Set([
  'accuracy',
  'armor',
  'attack',
  'critChance',
  'critDamage',
  'dodge',
  'health',
  'inventorySlots',
  'luck',
  'magicDefence',
  'magicPower',
  'rangedPower',
]);

function getUnsupportedStatKeys(stats: Record<string, number>) {
  return Object.keys(stats).filter((key) => !SUPPORTED_ITEM_STAT_KEYS.has(key));
}

describe('item seed combat data', () => {
  it('item templates only use supported combat stat keys', () => {
    const invalidItems = getAllItemTemplates()
      .map((item) => ({
        name: item.name,
        invalidKeys: getUnsupportedStatKeys(item.baseStats ?? {}),
      }))
      .filter((item) => item.invalidKeys.length > 0);

    expect(invalidItems).toEqual([]);
  });

  it('ranged weapon templates must provide rangedPower', () => {
    const invalidRangedWeapons = getAllItemTemplates()
      .filter((item) => item.itemType === 'weapon' && item.requiredSkill === 'ranged')
      .map((item) => ({
        name: item.name,
        rangedPower: item.baseStats?.rangedPower ?? 0,
        attack: item.baseStats?.attack ?? 0,
      }))
      .filter((item) => item.rangedPower <= 0);

    expect(invalidRangedWeapons).toEqual([]);
  });
});
