import { describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/shared', async () => import('../../../shared/src/index'));

import { calculateHitChance } from '../../../game-engine/src/combat/damageCalculator';
import { getAllItemTemplates } from './items';
import { PVP_TARGETS, validateItemTemplates } from './validation';

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

  it('max-dodge PvP loadouts remain evasive but counterable by high-accuracy builds', () => {
    const slotBestDodge = new Map<string, number>();
    const equippableSlots = new Set([
      'main_hand',
      'off_hand',
      'head',
      'chest',
      'legs',
      'boots',
      'gloves',
      'belt',
      'ring',
      'neck',
      'charm',
    ]);

    for (const item of getAllItemTemplates()) {
      const slot = item.slot ?? '';
      if (!equippableSlots.has(slot)) continue;

      const dodge = item.baseStats?.dodge ?? 0;
      slotBestDodge.set(slot, Math.max(slotBestDodge.get(slot) ?? 0, dodge));
    }

    const maxDodgeLoadout = [...slotBestDodge.values()].reduce((sum, dodge) => sum + dodge, 0);
    const uncheckedGlassCannonChance = calculateHitChance('pvp', 35, maxDodgeLoadout + 60).hitChance;
    const dedicatedCounterChance = calculateHitChance('pvp', 95, maxDodgeLoadout + 60).hitChance;

    expect(uncheckedGlassCannonChance).toBeLessThanOrEqual(PVP_TARGETS.uncheckedDodgeHitChanceMax);
    expect(dedicatedCounterChance).toBeGreaterThanOrEqual(PVP_TARGETS.counterBuildHitChanceMin);
  });
});
