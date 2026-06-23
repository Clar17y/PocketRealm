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

  it('boss-crafted item templates have target combat stats', () => {
    const templates = new Map(getAllItemTemplates().map((item) => [item.name, item]));

    expect(templates.get('Wolfsbane Blade')).toMatchObject({
      itemType: 'weapon',
      slot: 'main_hand',
      tier: 2,
      requiredLevel: 8,
      maxDurability: 110,
      baseStats: { attack: 13, accuracy: 4, critChance: 0.03 },
    });
    expect(templates.get('Alpha Pelt Chest')).toMatchObject({
      itemType: 'armor',
      slot: 'chest',
      tier: 2,
      requiredLevel: 8,
      maxDurability: 120,
      baseStats: { armor: 7, health: 8, dodge: 3 },
    });
    expect(templates.get('Spirit Staff')).toMatchObject({
      itemType: 'weapon',
      slot: 'main_hand',
      tier: 4,
      requiredLevel: 16,
      maxDurability: 130,
      baseStats: { magicPower: 24, accuracy: 4, critChance: 0.04 },
    });
    expect(templates.get('Ethereal Robes')).toMatchObject({
      itemType: 'armor',
      slot: 'chest',
      tier: 4,
      requiredLevel: 16,
      maxDurability: 140,
      baseStats: { magicDefence: 12, health: 12, dodge: 4, magicPower: 3 },
    });
  });

  it('defines Vex Aegis off-hand templates', () => {
    const templates = new Map(getAllItemTemplates().map((item) => [item.name, item]));

    expect(templates.get('Wayfarer Aegis')).toMatchObject({
      itemType: 'armor',
      weightClass: 'medium',
      slot: 'off_hand',
      tier: 2,
      requiredSkill: null,
      requiredLevel: 8,
      maxDurability: 100,
      stackable: false,
      sellPrice: 0,
      baseStats: { accuracy: 10, armor: 4, health: 8 },
    });
    expect(templates.get('Spiritbound Aegis')).toMatchObject({
      itemType: 'armor',
      weightClass: 'medium',
      slot: 'off_hand',
      tier: 4,
      requiredSkill: null,
      requiredLevel: 16,
      maxDurability: 140,
      stackable: false,
      sellPrice: 0,
      baseStats: { accuracy: 14, magicDefence: 8, armor: 5, health: 12 },
    });
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
