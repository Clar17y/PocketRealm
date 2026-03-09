import { describe, expect, it } from 'vitest';

import { doesAttackHit } from '../../../game-engine/src/combat/damageCalculator';
import { getAllItemTemplates } from './items';
import { validateItemTemplates } from './validation';

function getHitRate(accuracyBonus: number, targetDodge: number, targetEvasion = 0) {
  let hits = 0;
  for (let roll = 1; roll <= 20; roll += 1) {
    if (doesAttackHit(roll, accuracyBonus, targetDodge, targetEvasion)) {
      hits += 1;
    }
  }
  return hits / 20;
}

describe('item seed combat data', () => {
  it('item templates only use supported combat stat keys', () => {
    const invalidItems = validateItemTemplates(getAllItemTemplates())
      .filter((item) => item.errors.some((error) => error.startsWith('unsupported stat keys:')));

    expect(invalidItems).toEqual([]);
  });

  it('ranged weapon templates must provide rangedPower', () => {
    const invalidRangedWeapons = validateItemTemplates(getAllItemTemplates())
      .filter((item) => item.errors.includes('ranged weapon missing rangedPower'));

    expect(invalidRangedWeapons).toEqual([]);
  });

  it('tier-5 full light armor cannot force nat-20-only late-game PvE hit rates', () => {
    const slotBestDodge = new Map<string, number>();

    const tierFiveLightArmor = getAllItemTemplates().filter((item) =>
      item.itemType === 'armor' &&
      item.weightClass === 'light' &&
      item.tier === 5 &&
      ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'].includes(item.slot ?? '')
    );

    for (const item of tierFiveLightArmor) {
      const slot = item.slot ?? '';
      const dodge = item.baseStats?.dodge ?? 0;
      slotBestDodge.set(slot, Math.max(slotBestDodge.get(slot) ?? 0, dodge));
    }

    const totalDodge = [...slotBestDodge.values()].reduce((sum, dodge) => sum + dodge, 0);

    expect(getHitRate(26, totalDodge, 10)).toBeGreaterThanOrEqual(0.2);
  });
});
