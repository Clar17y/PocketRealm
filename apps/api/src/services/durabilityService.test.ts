import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DURABILITY_CONSTANTS } from '@pocketrealm/shared';

import { mockPrisma } from '../__test__/setup';
import { degradeEquippedDurability, countCombatHits } from './durabilityService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEquipped(items: Array<{
  id: string;
  currentDurability: number | null;
  maxDurability: number | null;
  template: { name: string; itemType: string; maxDurability: number };
}>) {
  return items.map((item) => ({
    item: {
      id: item.id,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
      template: item.template,
    },
  }));
}

/** Helper: build a combat log with N player hits and M mob hits. */
function makeLog(playerHits: number, mobHits: number) {
  const log: Array<{ actor: 'combatantA' | 'combatantB'; damage: number; evaded: boolean }> = [];
  for (let i = 0; i < playerHits; i++) log.push({ actor: 'combatantA', damage: 5, evaded: false });
  for (let i = 0; i < mobHits; i++) log.push({ actor: 'combatantB', damage: 3, evaded: false });
  return log;
}

describe('countCombatHits', () => {
  it('counts player and mob hits that landed', () => {
    const log = [
      { actor: 'combatantA' as const, damage: 10, evaded: false },
      { actor: 'combatantB' as const, damage: 5, evaded: false },
      { actor: 'combatantA' as const, damage: 0, evaded: false },   // blocked but still counts
      { actor: 'combatantB' as const, damage: 8, evaded: true },    // evaded — doesn't count
      { actor: 'combatantA' as const, damage: 12, evaded: false },
      { actor: 'combatantB' as const, damage: undefined, evaded: false }, // no attack action (e.g. spell buff)
    ];
    const result = countCombatHits(log);
    expect(result.playerHitsLanded).toBe(3); // 10 + 0 + 12
    expect(result.mobHitsLanded).toBe(1);    // 5 only (evaded and undefined excluded)
  });

  it('returns zero for empty log', () => {
    const result = countCombatHits([]);
    expect(result.playerHitsLanded).toBe(0);
    expect(result.mobHitsLanded).toBe(0);
  });
});

describe('degradeEquippedDurability', () => {
  it('returns empty array for empty combat log', async () => {
    const result = await degradeEquippedDurability('p1', []);
    expect(result).toEqual([]);
  });

  it('degrades weapon based on player hits landed', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 5 player hits = 0.05 weapon degradation
    const losses = await degradeEquippedDurability('p1', makeLog(5, 3));
    expect(losses).toHaveLength(1);
    expect(losses[0].newDurability).toBe(49.95);
    expect(losses[0].amount).toBe(0.05);
    expect(losses[0].isBroken).toBe(false);
  });

  it('degrades armor based on mob hits landed', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Shield', itemType: 'armor', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 3 mob hits = 0.03 armor degradation
    const losses = await degradeEquippedDurability('p1', makeLog(5, 3));
    expect(losses).toHaveLength(1);
    expect(losses[0].newDurability).toBe(49.97);
    expect(losses[0].amount).toBe(0.03);
  });

  it('applies correct degradation to mixed weapon and armor', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'weapon-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          id: 'armor-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Shield', itemType: 'armor', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 10 player hits = 0.10 weapon, 5 mob hits = 0.05 armor
    const losses = await degradeEquippedDurability('p1', makeLog(10, 5));
    expect(losses).toHaveLength(2);
    const weapon = losses.find(l => l.itemName === 'Sword')!;
    const armor = losses.find(l => l.itemName === 'Shield')!;
    expect(weapon.newDurability).toBe(49.9);
    expect(armor.newDurability).toBe(49.95);
  });

  it('skips weapons when no player hits landed', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'weapon-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          id: 'armor-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Shield', itemType: 'armor', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 0 player hits, 5 mob hits — only armor degrades
    const losses = await degradeEquippedDurability('p1', makeLog(0, 5));
    expect(losses).toHaveLength(1);
    expect(losses[0].itemName).toBe('Shield');
  });

  it('detects broken items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 0.01,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', makeLog(1, 0));
    expect(losses[0].isBroken).toBe(true);
    expect(losses[0].newDurability).toBe(0);
  });

  it('does not flag already-broken items as newly broken', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 0,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', makeLog(1, 0));
    expect(losses[0].isBroken).toBe(false);
  });

  it('detects warning threshold crossing', async () => {
    const maxDur = 100;
    const threshold = maxDur * DURABILITY_CONSTANTS.WARNING_THRESHOLD; // 10
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: threshold + 0.01, // 10.01
          maxDurability: maxDur,
          template: { name: 'Shield', itemType: 'armor', maxDurability: maxDur },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 2 mob hits = 0.02 armor degradation → 10.01 - 0.02 = 9.99 (below threshold 10)
    const losses = await degradeEquippedDurability('p1', makeLog(0, 2));
    expect(losses[0].crossedWarningThreshold).toBe(true);
  });

  it('deduplicates same item in multiple slots', async () => {
    const item = {
      id: 'ring-1',
      currentDurability: 50,
      maxDurability: 100,
      template: { name: 'Ring', itemType: 'armor', maxDurability: 100 },
    };
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      { item: { ...item } },
      { item: { ...item } },
    ]);
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', makeLog(0, 5));
    expect(losses).toHaveLength(1);
  });

  it('normalizes missing durability to template max', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: null,
          maxDurability: null,
          template: { name: 'Axe', itemType: 'weapon', maxDurability: 80 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 5 player hits = 0.05 weapon degradation → 80 - 0.05 = 79.95
    const losses = await degradeEquippedDurability('p1', makeLog(5, 0));
    expect(losses[0].maxDurability).toBe(80);
    expect(losses[0].newDurability).toBe(79.95);
    // Should have been called twice: once to normalize, once to update
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(2);
  });

  it('skips non-weapon/armor items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Potion', itemType: 'consumable', maxDurability: 100 },
        },
      ])
    );

    const losses = await degradeEquippedDurability('p1', makeLog(5, 5));
    expect(losses).toHaveLength(0);
  });

  it('flips perspective for combatantB (PvP defender)', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'weapon-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          id: 'armor-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Shield', itemType: 'armor', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    // 10 player (combatantA) hits, 5 mob (combatantB) hits
    // As combatantB: my hits = 5 (weapon wear), their hits = 10 (armor wear)
    const losses = await degradeEquippedDurability('p1', makeLog(10, 5), 'combatantB');
    const weapon = losses.find(l => l.itemName === 'Sword')!;
    const armor = losses.find(l => l.itemName === 'Shield')!;
    expect(weapon.amount).toBe(0.05); // 5 of my hits
    expect(armor.amount).toBe(0.10);  // 10 hits I received
  });
});
