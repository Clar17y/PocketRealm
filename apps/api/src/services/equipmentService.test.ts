import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cacheService', () => ({
  cachedQuery: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  invalidateCache: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import {
  isSkillType,
  getEquipmentStats,
  equipItem,
  unequipSlot,
} from './equipmentService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isSkillType', () => {
  it('returns true for valid skill types', () => {
    expect(isSkillType('melee')).toBe(true);
    expect(isSkillType('ranged')).toBe(true);
    expect(isSkillType('magic')).toBe(true);
    expect(isSkillType('mining')).toBe(true);
    expect(isSkillType('weaponsmithing')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isSkillType('swimming')).toBe(false);
    expect(isSkillType('')).toBe(false);
    expect(isSkillType('MELEE')).toBe(false);
  });
});

describe('getEquipmentStats', () => {
  it('returns zeroes when nothing equipped', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);

    const stats = await getEquipmentStats('p1');
    expect(stats.attack).toBe(0);
    expect(stats.armor).toBe(0);
    expect(stats.health).toBe(0);
  });

  it('sums base + bonus stats from equipped items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      {
        item: {
          currentDurability: 10,
          template: { baseStats: { attack: 5, accuracy: 2 }, maxDurability: 50 },
          bonusStats: { attack: 1 },
        },
      },
      {
        item: {
          currentDurability: 20,
          template: { baseStats: { armor: 10 }, maxDurability: 50 },
          bonusStats: null,
        },
      },
    ]);

    const stats = await getEquipmentStats('p1');
    expect(stats.attack).toBe(6); // 5 + 1
    expect(stats.accuracy).toBe(2);
    expect(stats.armor).toBe(10);
  });

  it('broken gear contributes zero stats', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      {
        item: {
          currentDurability: 0,
          template: { baseStats: { attack: 100 }, maxDurability: 50 },
          bonusStats: null,
        },
      },
    ]);

    const stats = await getEquipmentStats('p1');
    expect(stats.attack).toBe(0);
  });

  it('uses template maxDurability when item durability is null', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      {
        item: {
          currentDurability: null,
          template: { baseStats: { attack: 5 }, maxDurability: 50 },
          bonusStats: null,
        },
      },
    ]);

    const stats = await getEquipmentStats('p1');
    // null ?? 50 = 50, 50 > 0, so stats count
    expect(stats.attack).toBe(5);
  });

  it('ignores unsupported stat keys while still summing supported combat stats', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      {
        item: {
          currentDurability: 25,
          template: {
            baseStats: {
              evasion: 10,
              defence: 7,
              healthRegen: 2,
              dodge: 3,
              magicDefence: 1,
            },
            maxDurability: 50,
          },
          bonusStats: {
            defence: 4,
            health: 5,
          },
        },
      },
    ]);

    const stats = await getEquipmentStats('p1');
    expect(stats.dodge).toBe(3);
    expect(stats.magicDefence).toBe(1);
    expect(stats.health).toBe(5);
    expect(stats.attack).toBe(0);
    expect(stats.armor).toBe(0);
  });
});

describe('equipItem', () => {
  beforeEach(() => {
    // ensureEquipmentSlots calls
    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
    mockPrisma.playerEquipment.createMany.mockResolvedValue({ count: 11 });
    mockPrisma.playerEquipment.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.playerEquipment.upsert.mockResolvedValue({});
  });

  it('throws 404 when item not found', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);

    await expect(equipItem('p1', 'missing', 'main_hand')).rejects.toThrow('Item not found');
  });

  it('throws when item not owned by player', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'other-player',
      template: { itemType: 'weapon', slot: 'main_hand' },
    });

    await expect(equipItem('p1', 'item-1', 'main_hand')).rejects.toThrow('Item not found');
  });

  it('throws for non-equipment item type', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: { itemType: 'material', slot: null },
    });

    await expect(equipItem('p1', 'item-1', 'main_hand')).rejects.toThrow(
      'Only weapons/armor can be equipped'
    );
  });

  it('throws for wrong slot', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: { itemType: 'weapon', slot: 'main_hand', requiredSkill: 'melee', requiredLevel: 1 },
    });

    await expect(equipItem('p1', 'item-1', 'head')).rejects.toThrow('Item must be equipped in slot');
  });

  it('throws for stacked items', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 5,
      template: { itemType: 'weapon', slot: 'main_hand', requiredSkill: 'melee', requiredLevel: 1 },
    });

    await expect(equipItem('p1', 'item-1', 'main_hand')).rejects.toThrow('Cannot equip stacked items');
  });

  it('throws for insufficient character level (armor)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: { itemType: 'armor', slot: 'chest', requiredLevel: 10 },
    });
    mockPrisma.player.findUnique.mockResolvedValue({ characterLevel: 5 });

    await expect(equipItem('p1', 'item-1', 'chest')).rejects.toThrow(
      'Insufficient character level'
    );
  });

  it('successfully equips armor when level is sufficient', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: { itemType: 'armor', slot: 'chest', requiredLevel: 5 },
    });
    mockPrisma.player.findUnique.mockResolvedValue({ characterLevel: 10 });

    await equipItem('p1', 'item-1', 'chest');
    expect(mockPrisma.playerEquipment.upsert).toHaveBeenCalled();
  });

  it('throws for insufficient skill level (weapon)', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: { itemType: 'weapon', slot: 'main_hand', requiredSkill: 'melee', requiredLevel: 20 },
    });
    mockPrisma.playerSkill.findUnique.mockResolvedValue({ level: 5 });

    await expect(equipItem('p1', 'item-1', 'main_hand')).rejects.toThrow(
      'Insufficient skill level'
    );
  });
});

describe('unequipSlot', () => {
  it('sets slot itemId to null', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
    mockPrisma.playerEquipment.createMany.mockResolvedValue({ count: 11 });
    mockPrisma.playerEquipment.update.mockResolvedValue({});

    await unequipSlot('p1', 'main_hand');
    expect(mockPrisma.playerEquipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { itemId: null } })
    );
  });
});
