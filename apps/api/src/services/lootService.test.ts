import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Module mocks (must be before imports) ---

vi.mock('./inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue({ itemId: 'stack-1', quantity: 1 }),
  getInventoryState: vi.fn().mockResolvedValue({ usedSlots: 0, capacity: 20, availableSlots: 20 }),
}));

vi.mock('./pendingLootService', () => ({
  storePendingLoot: vi.fn().mockResolvedValue('session-abc'),
}));

vi.mock('../utils/random', () => ({
  randomIntInclusive: vi.fn().mockReturnValue(1),
}));

vi.mock('@pocketrealm/game-engine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    rollDropRarity: vi.fn().mockReturnValue('common'),
    rollBonusStatsForRarity: vi.fn().mockReturnValue(null),
  };
});

import { mockPrisma } from '../__test__/setup';
import { rollAndGrantLoot, rollAndGrantLootWithCapacity, enrichLootWithNames } from './lootService';
import { addStackableItem, getInventoryState } from './inventoryService';
import { storePendingLoot } from './pendingLootService';
import { randomIntInclusive } from '../utils/random';
import { rollDropRarity, rollBonusStatsForRarity } from '@pocketrealm/game-engine';

// --- Helpers ---

function makeDropEntry(overrides: Record<string, unknown> = {}) {
  return {
    dropChance: { toNumber: () => 1.0 },
    minQuantity: 1,
    maxQuantity: 1,
    itemTemplateId: 'tpl-mat',
    itemTemplate: {
      name: 'Iron Ore',
      stackable: true,
      itemType: 'material',
      maxDurability: null,
      baseStats: null,
      slot: null,
    },
    ...overrides,
  };
}

function makeWeaponDropEntry(overrides: Record<string, unknown> = {}) {
  return makeDropEntry({
    itemTemplateId: 'tpl-sword',
    itemTemplate: {
      name: 'Iron Sword',
      stackable: false,
      itemType: 'weapon',
      maxDurability: 100,
      baseStats: { attack: 5 },
      slot: 'main_hand',
    },
    ...overrides,
  });
}

function makeArmorDropEntry(overrides: Record<string, unknown> = {}) {
  return makeDropEntry({
    itemTemplateId: 'tpl-helm',
    itemTemplate: {
      name: 'Iron Helm',
      stackable: false,
      itemType: 'armor',
      maxDurability: 80,
      baseStats: { defence: 3 },
      slot: 'head',
    },
    ...overrides,
  });
}

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  // Default: Math.random always succeeds drop rolls (returns low value)
  vi.spyOn(Math, 'random').mockReturnValue(0.01);
  // Default: randomIntInclusive returns 1
  vi.mocked(randomIntInclusive).mockReturnValue(1);
  // Default: no existing stack in inventory
  mockPrisma.item.findFirst.mockResolvedValue(null);
  mockPrisma.item.create.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =====================================================
// rollAndGrantLoot (wrapper — delegates with Infinity)
// =====================================================
describe('rollAndGrantLoot', () => {
  it('returns empty array when no drop entries', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([]);
    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toEqual([]);
  });

  it('returns empty when roll exceeds drop chance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockPrisma.dropTable.findMany.mockResolvedValue([
      makeDropEntry({ dropChance: { toNumber: () => 0.5 } }),
    ]);
    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toEqual([]);
  });

  it('grants stackable loot when drop succeeds', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toHaveLength(1);
    expect(drops[0].itemTemplateId).toBe('tpl-mat');
    expect(drops[0].rarity).toBe('common');
  });

  it('creates unique equipment items with rarity', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toHaveLength(1);
    expect(mockPrisma.item.create).toHaveBeenCalled();
  });

  it('skips entries with 0 drop chance', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([
      makeDropEntry({ dropChance: { toNumber: () => 0 } }),
    ]);
    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toEqual([]);
  });

  it('passes Infinity capacity so no overflow occurs', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([
      makeWeaponDropEntry(),
      makeWeaponDropEntry({ itemTemplateId: 'tpl-axe', itemTemplate: { name: 'Axe', stackable: false, itemType: 'weapon', maxDurability: 90, baseStats: { attack: 8 }, slot: 'main_hand' } }),
    ]);
    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    // Both should be granted, no overflow
    expect(drops).toHaveLength(2);
    expect(storePendingLoot).not.toHaveBeenCalled();
  });

  it('passes dropChanceMultiplier to rollDropRarity for equipment', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
    await rollAndGrantLoot('p1', 'mob-1', 10, 2.5);
    expect(rollDropRarity).toHaveBeenCalledWith(10, 2.5);
  });
});

// =====================================================
// rollAndGrantLootWithCapacity
// =====================================================
describe('rollAndGrantLootWithCapacity', () => {
  describe('capacity and overflow', () => {
    it('uses capacityOverride when provided (skips getInventoryState)', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(getInventoryState).not.toHaveBeenCalled();
    });

    it('calls getInventoryState when no capacityOverride', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1);
      expect(getInventoryState).toHaveBeenCalledWith('p1');
    });

    it('puts non-stackable items in overflow when capacity exhausted', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      expect(result.drops).toHaveLength(0);
      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0]).toMatchObject({
        templateId: 'tpl-sword',
        templateName: 'Iron Sword',
        quantity: 1,
      });
    });

    it('puts stackable items in overflow when no existing stack and capacity full', async () => {
      mockPrisma.item.findFirst.mockResolvedValue(null); // no existing stack
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      expect(result.drops).toHaveLength(0);
      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0]).toMatchObject({
        templateId: 'tpl-mat',
        templateName: 'Iron Ore',
        rarity: 'common',
        quantity: 1,
        bonusStats: null,
        currentDurability: null,
        maxDurability: null,
      });
    });

    it('allows stackable item when existing stack exists even at full capacity', async () => {
      mockPrisma.item.findFirst.mockResolvedValue({ id: 'existing-stack', quantity: 5 });
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      // Existing stack found, so it can merge — no new slot needed
      expect(result.drops).toHaveLength(1);
      expect(result.overflow).toHaveLength(0);
      expect(addStackableItem).toHaveBeenCalledWith('p1', 'tpl-mat', 1);
    });

    it('stores pending loot and returns sessionId when overflow exists', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      expect(storePendingLoot).toHaveBeenCalledWith('p1', result.overflow);
      expect(result.pendingLootSessionId).toBe('session-abc');
    });

    it('returns null pendingLootSessionId when no overflow', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(storePendingLoot).not.toHaveBeenCalled();
      expect(result.pendingLootSessionId).toBeNull();
    });

    it('tracks slot usage across multiple non-stackable items', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(3); // 3 items per entry
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      // Capacity = 2, so only 2 fit, 1 overflows
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 2);
      expect(result.drops).toHaveLength(2);
      expect(result.overflow).toHaveLength(1);
      expect(mockPrisma.item.create).toHaveBeenCalledTimes(2);
    });

    it('increments slotsUsed for new stackable items (no existing stack)', async () => {
      mockPrisma.item.findFirst.mockResolvedValue(null);
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ itemTemplateId: 'tpl-mat-a', itemTemplate: { name: 'Mat A', stackable: true, itemType: 'material' } }),
        makeDropEntry({ itemTemplateId: 'tpl-mat-b', itemTemplate: { name: 'Mat B', stackable: true, itemType: 'material' } }),
      ]);
      // Capacity = 1, first stackable takes the slot, second overflows
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 1);
      expect(result.drops).toHaveLength(1);
      expect(result.drops[0].itemTemplateId).toBe('tpl-mat-a');
      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0].templateId).toBe('tpl-mat-b');
    });

    it('does not increment slotsUsed for stackable with existing stack', async () => {
      mockPrisma.item.findFirst.mockResolvedValue({ id: 'existing', quantity: 10 });
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ itemTemplateId: 'tpl-mat-a' }),
        makeDropEntry({ itemTemplateId: 'tpl-mat-b' }),
      ]);
      // Both have existing stacks, so no new slots consumed
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      expect(result.drops).toHaveLength(2);
      expect(result.overflow).toHaveLength(0);
    });
  });

  describe('stackable items', () => {
    it('calls addStackableItem with correct params', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(5);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(addStackableItem).toHaveBeenCalledWith('p1', 'tpl-mat', 5);
    });

    it('always assigns common rarity to stackable drops', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops[0].rarity).toBe('common');
      // rollDropRarity should NOT be called for stackable items
      expect(rollDropRarity).not.toHaveBeenCalled();
    });

    it('quantity from stackable drop appears in the returned drop', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(7);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops[0].quantity).toBe(7);
    });
  });

  describe('non-stackable equipment items', () => {
    it('creates item records with correct data for weapons', async () => {
      vi.mocked(rollDropRarity).mockReturnValue('rare' as any);
      vi.mocked(rollBonusStatsForRarity).mockReturnValue({ attack: 3, critChance: 0.05 } as any);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);

      await rollAndGrantLootWithCapacity('p1', 'mob-1', 10, 1, 10);

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'p1',
          templateId: 'tpl-sword',
          rarity: 'rare',
          quantity: 1,
          maxDurability: 100,
          currentDurability: 100,
          bonusStats: { attack: 3, critChance: 0.05 },
        }),
      });
    });

    it('creates item records with correct data for armor', async () => {
      vi.mocked(rollDropRarity).mockReturnValue('epic' as any);
      vi.mocked(rollBonusStatsForRarity).mockReturnValue({ defence: 5 } as any);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeArmorDropEntry()]);

      await rollAndGrantLootWithCapacity('p1', 'mob-1', 10, 1, 10);

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: 'tpl-helm',
          rarity: 'epic',
          maxDurability: 80,
          currentDurability: 80,
          bonusStats: { defence: 5 },
        }),
      });
    });

    it('creates each item individually when quantity > 1', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(3);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(mockPrisma.item.create).toHaveBeenCalledTimes(3);
      expect(result.drops).toHaveLength(3);
      // Each drop should have quantity 1
      result.drops.forEach(d => expect(d.quantity).toBe(1));
    });

    it('rolls rarity independently for each item', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(2);
      vi.mocked(rollDropRarity)
        .mockReturnValueOnce('uncommon' as any)
        .mockReturnValueOnce('legendary' as any);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops[0].rarity).toBe('uncommon');
      expect(result.drops[1].rarity).toBe('legendary');
    });

    it('passes correct params to rollBonusStatsForRarity for weapons', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);
      vi.mocked(rollDropRarity).mockReturnValue('rare' as any);

      await rollAndGrantLootWithCapacity('p1', 'mob-1', 10, 1, 10);

      expect(rollBonusStatsForRarity).toHaveBeenCalledWith({
        itemType: 'weapon',
        rarity: 'rare',
        baseStats: { attack: 5 },
        slot: 'main_hand',
      });
    });

    it('sets bonusStats to undefined when rollBonusStatsForRarity returns null', async () => {
      vi.mocked(rollBonusStatsForRarity).mockReturnValue(null);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);

      await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bonusStats: undefined,
        }),
      });
    });

    it('does not call rollDropRarity or rollBonusStatsForRarity for non-equipment types', async () => {
      // Consumable: not weapon/armor, but non-stackable
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({
          itemTemplateId: 'tpl-potion',
          itemTemplate: {
            name: 'Health Potion',
            stackable: false,
            itemType: 'consumable',
            maxDurability: null,
            baseStats: null,
            slot: null,
          },
        }),
      ]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(rollDropRarity).not.toHaveBeenCalled();
      expect(rollBonusStatsForRarity).not.toHaveBeenCalled();
      expect(result.drops[0].rarity).toBe('common');
    });

    it('sets maxDurability and currentDurability to null for non-equipment', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({
          itemTemplateId: 'tpl-potion',
          itemTemplate: {
            name: 'Health Potion',
            stackable: false,
            itemType: 'consumable',
            maxDurability: null,
            baseStats: null,
            slot: null,
          },
        }),
      ]);

      await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxDurability: null,
          currentDurability: null,
        }),
      });
    });
  });

  describe('drop chance mechanics', () => {
    it('clamps drop chance to max 1 (entries with > 1.0 always drop)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ dropChance: { toNumber: () => 1.5 } }),
      ]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(1);
    });

    it('clamps negative drop chance to 0 (never drops)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.001);
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ dropChance: { toNumber: () => -0.5 } }),
      ]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(0);
    });

    it('skips entries when random exactly equals chance', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ dropChance: { toNumber: () => 0.5 } }),
      ]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      // Math.random() >= chance is 0.5 >= 0.5 → true → skipped
      expect(result.drops).toHaveLength(0);
    });

    it('drops when random is just below chance', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.499);
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ dropChance: { toNumber: () => 0.5 } }),
      ]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(1);
    });

    it('skips when quantity rolls to 0', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(0);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(0);
      expect(addStackableItem).not.toHaveBeenCalled();
    });

    it('skips when quantity rolls to negative', async () => {
      vi.mocked(randomIntInclusive).mockReturnValue(-1);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(0);
    });
  });

  describe('multiple entries', () => {
    it('processes all drop table entries independently', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ itemTemplateId: 'tpl-mat-a', itemTemplate: { name: 'Mat A', stackable: true, itemType: 'material' } }),
        makeWeaponDropEntry(),
        makeArmorDropEntry(),
      ]);
      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(3);
      expect(result.drops.map(d => d.itemTemplateId)).toEqual(['tpl-mat-a', 'tpl-sword', 'tpl-helm']);
    });

    it('handles mixed success and failure across entries', async () => {
      // First call: succeeds (0.01), second call: fails (0.999), third call: succeeds (0.01)
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.01)
        .mockReturnValueOnce(0.999)
        .mockReturnValueOnce(0.01);

      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeDropEntry({ itemTemplateId: 'tpl-a', dropChance: { toNumber: () => 0.5 }, itemTemplate: { name: 'A', stackable: true, itemType: 'material' } }),
        makeDropEntry({ itemTemplateId: 'tpl-b', dropChance: { toNumber: () => 0.5 }, itemTemplate: { name: 'B', stackable: true, itemType: 'material' } }),
        makeDropEntry({ itemTemplateId: 'tpl-c', dropChance: { toNumber: () => 0.5 }, itemTemplate: { name: 'C', stackable: true, itemType: 'material' } }),
      ]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 10);
      expect(result.drops).toHaveLength(2);
      expect(result.drops.map(d => d.itemTemplateId)).toEqual(['tpl-a', 'tpl-c']);
    });

    it('partial overflow: some items fit, some overflow', async () => {
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeWeaponDropEntry({ itemTemplateId: 'tpl-sword-1', itemTemplate: { name: 'Sword 1', stackable: false, itemType: 'weapon', maxDurability: 100, baseStats: null, slot: 'main_hand' } }),
        makeWeaponDropEntry({ itemTemplateId: 'tpl-sword-2', itemTemplate: { name: 'Sword 2', stackable: false, itemType: 'weapon', maxDurability: 100, baseStats: null, slot: 'main_hand' } }),
        makeWeaponDropEntry({ itemTemplateId: 'tpl-sword-3', itemTemplate: { name: 'Sword 3', stackable: false, itemType: 'weapon', maxDurability: 100, baseStats: null, slot: 'main_hand' } }),
      ]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 2);
      expect(result.drops).toHaveLength(2);
      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0].templateId).toBe('tpl-sword-3');
      expect(result.pendingLootSessionId).toBe('session-abc');
    });
  });

  describe('overflow item shape', () => {
    it('overflow for equipment includes rarity, bonusStats, durability', async () => {
      vi.mocked(rollDropRarity).mockReturnValue('epic' as any);
      vi.mocked(rollBonusStatsForRarity).mockReturnValue({ attack: 10 } as any);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeWeaponDropEntry()]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      expect(result.overflow[0]).toEqual({
        templateId: 'tpl-sword',
        templateName: 'Iron Sword',
        rarity: 'epic',
        quantity: 1,
        bonusStats: { attack: 10 },
        currentDurability: 100,
        maxDurability: 100,
      });
    });

    it('overflow for stackable has null bonusStats and durability', async () => {
      mockPrisma.item.findFirst.mockResolvedValue(null);
      mockPrisma.dropTable.findMany.mockResolvedValue([makeDropEntry()]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1, 0);
      expect(result.overflow[0]).toEqual({
        templateId: 'tpl-mat',
        templateName: 'Iron Ore',
        rarity: 'common',
        quantity: 1,
        bonusStats: null,
        currentDurability: null,
        maxDurability: null,
      });
    });
  });

  describe('getInventoryState integration', () => {
    it('starts slotsUsed from current inventory usedSlots', async () => {
      vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 19, capacity: 20, availableSlots: 1 });
      // Two weapon drops, but only 1 slot available
      mockPrisma.dropTable.findMany.mockResolvedValue([
        makeWeaponDropEntry({ itemTemplateId: 'tpl-sword-1', itemTemplate: { name: 'Sword 1', stackable: false, itemType: 'weapon', maxDurability: 100, baseStats: null, slot: 'main_hand' } }),
        makeWeaponDropEntry({ itemTemplateId: 'tpl-sword-2', itemTemplate: { name: 'Sword 2', stackable: false, itemType: 'weapon', maxDurability: 100, baseStats: null, slot: 'main_hand' } }),
      ]);

      const result = await rollAndGrantLootWithCapacity('p1', 'mob-1', 5, 1);
      expect(result.drops).toHaveLength(1);
      expect(result.overflow).toHaveLength(1);
    });
  });
});

// =====================================================
// enrichLootWithNames
// =====================================================
describe('enrichLootWithNames', () => {
  it('returns empty array for empty input', async () => {
    const result = await enrichLootWithNames([]);
    expect(result).toEqual([]);
    expect(mockPrisma.itemTemplate.findMany).not.toHaveBeenCalled();
  });

  it('uses existing itemName when available', async () => {
    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-1', quantity: 3, rarity: 'common', itemName: 'Iron Ore' },
    ]);
    expect(result).toEqual([
      { itemTemplateId: 'tpl-1', quantity: 3, rarity: 'common', itemName: 'Iron Ore' },
    ]);
    // Should not query DB since name was provided
    expect(mockPrisma.itemTemplate.findMany).not.toHaveBeenCalled();
  });

  it('fetches names from DB for items missing itemName', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValue([
      { id: 'tpl-1', name: 'Iron Sword' },
    ]);

    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-1', quantity: 1 },
    ]);

    expect(mockPrisma.itemTemplate.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['tpl-1'] } },
      select: { id: true, name: true },
    });
    expect(result[0].itemName).toBe('Iron Sword');
  });

  it('deduplicates template IDs for the DB query', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValue([
      { id: 'tpl-1', name: 'Iron Ore' },
    ]);

    await enrichLootWithNames([
      { itemTemplateId: 'tpl-1', quantity: 2 },
      { itemTemplateId: 'tpl-1', quantity: 5 },
    ]);

    // Should query for 'tpl-1' only once
    expect(mockPrisma.itemTemplate.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['tpl-1'] } },
      select: { id: true, name: true },
    });
  });

  it('returns null itemName when template not found in DB', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValue([]);

    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-unknown', quantity: 1 },
    ]);

    expect(result[0].itemName).toBeNull();
  });

  it('mixes items with and without names', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValue([
      { id: 'tpl-2', name: 'Dragon Scale' },
    ]);

    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-1', quantity: 1, itemName: 'Iron Sword' },
      { itemTemplateId: 'tpl-2', quantity: 3 },
      { itemTemplateId: 'tpl-3', quantity: 1, itemName: null },
    ]);

    expect(result[0].itemName).toBe('Iron Sword');
    expect(result[1].itemName).toBe('Dragon Scale');
    expect(result[2].itemName).toBeNull(); // null itemName, tpl-3 not in mock response
    // Only tpl-2 and tpl-3 should be queried (tpl-1 has name)
    expect(mockPrisma.itemTemplate.findMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['tpl-2', 'tpl-3']) } },
      select: { id: true, name: true },
    });
  });

  it('preserves quantity and rarity in output', async () => {
    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-1', quantity: 5, rarity: 'legendary', itemName: 'Excalibur' },
    ]);

    expect(result[0]).toEqual({
      itemTemplateId: 'tpl-1',
      quantity: 5,
      rarity: 'legendary',
      itemName: 'Excalibur',
    });
  });

  it('handles undefined rarity gracefully', async () => {
    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-1', quantity: 1, itemName: 'Stick' },
    ]);

    expect(result[0].rarity).toBeUndefined();
    expect(result[0].itemName).toBe('Stick');
  });

  it('handles null vs empty string itemName differently due to ?? operator', async () => {
    // Both null and '' are falsy for the filter (!drop.itemName) — both trigger DB lookup.
    // But the output mapping uses `drop.itemName ?? templateNameById.get(...)`:
    //   null ?? 'DB Name' → 'DB Name' (null is nullish)
    //   '' ?? 'DB Name'   → '' (?? treats '' as non-nullish, so keeps it)
    mockPrisma.itemTemplate.findMany.mockResolvedValue([
      { id: 'tpl-null', name: 'Null Item' },
      { id: 'tpl-empty', name: 'Empty Item' },
    ]);

    const result = await enrichLootWithNames([
      { itemTemplateId: 'tpl-null', quantity: 1, itemName: null },
      { itemTemplateId: 'tpl-empty', quantity: 1, itemName: '' },
      { itemTemplateId: 'tpl-named', quantity: 1, itemName: 'Has Name' },
    ]);

    // null → nullish coalescing picks up DB name
    expect(result[0].itemName).toBe('Null Item');
    // '' → not nullish, ?? keeps the empty string (subtle edge case)
    expect(result[1].itemName).toBe('');
    // already has name → kept
    expect(result[2].itemName).toBe('Has Name');
  });
});
