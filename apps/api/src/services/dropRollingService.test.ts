import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock inventoryService before importing the module under test
vi.mock('./inventoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./inventoryService')>();
  return {
    ...actual,
    addStackableItemTx: vi.fn().mockResolvedValue({ itemId: 'stack-1', quantity: 1 }),
  };
});

// Mock pickWeighted so we can control which drop entry is selected
vi.mock('../utils/pickWeighted.js', () => ({
  pickWeighted: vi.fn(),
}));

// Mock randomIntInclusive so we can control quantity rolls
vi.mock('../utils/random', () => ({
  randomIntInclusive: vi.fn(),
}));

// Import setup to mock @pocketrealm/database (needed by dropRollingService for Prisma type import)
import '../__test__/setup';

import {
  decimalLikeToNumber,
  createLootAccumulator,
  rollAndGrantDropsTx,
  type DropTableEntry,
} from './dropRollingService';
import { addStackableItemTx } from './inventoryService';
import { pickWeighted } from '../utils/pickWeighted.js';
import { randomIntInclusive } from '../utils/random';

const mockedPickWeighted = pickWeighted as ReturnType<typeof vi.fn>;
const mockedRandomInt = randomIntInclusive as ReturnType<typeof vi.fn>;
const mockedAddStackable = addStackableItemTx as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// decimalLikeToNumber
// ---------------------------------------------------------------------------
describe('decimalLikeToNumber', () => {
  it('returns a plain number directly', () => {
    expect(decimalLikeToNumber(42)).toBe(42);
  });

  it('returns 0 for NaN', () => {
    expect(decimalLikeToNumber(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(decimalLikeToNumber(Infinity)).toBe(0);
  });

  it('returns 0 for -Infinity', () => {
    expect(decimalLikeToNumber(-Infinity)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(decimalLikeToNumber(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(decimalLikeToNumber(undefined)).toBe(0);
  });

  it('returns 0 for a string', () => {
    expect(decimalLikeToNumber('hello')).toBe(0);
  });

  it('converts a Prisma Decimal-like object via toNumber()', () => {
    const decimal = { toNumber: () => 0.75 };
    expect(decimalLikeToNumber(decimal)).toBe(0.75);
  });

  it('returns 0 when toNumber() returns NaN', () => {
    const decimal = { toNumber: () => NaN };
    expect(decimalLikeToNumber(decimal)).toBe(0);
  });

  it('returns 0 when toNumber() returns Infinity', () => {
    const decimal = { toNumber: () => Infinity };
    expect(decimalLikeToNumber(decimal)).toBe(0);
  });

  it('handles zero correctly', () => {
    expect(decimalLikeToNumber(0)).toBe(0);
  });

  it('handles negative numbers correctly', () => {
    expect(decimalLikeToNumber(-5)).toBe(-5);
  });

  it('handles an object without toNumber as 0', () => {
    expect(decimalLikeToNumber({ foo: 'bar' })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createLootAccumulator
// ---------------------------------------------------------------------------
describe('createLootAccumulator', () => {
  it('starts with an empty array', () => {
    const acc = createLootAccumulator();
    expect(acc.toArray()).toEqual([]);
  });

  it('adds a single drop', () => {
    const acc = createLootAccumulator();
    acc.add({ itemTemplateId: 'tpl-1', quantity: 3, rarity: 'common' });
    expect(acc.toArray()).toEqual([
      { itemTemplateId: 'tpl-1', quantity: 3, rarity: 'common' },
    ]);
  });

  it('merges quantities for same template', () => {
    const acc = createLootAccumulator();
    acc.add({ itemTemplateId: 'tpl-1', quantity: 2, rarity: 'common' });
    acc.add({ itemTemplateId: 'tpl-1', quantity: 5, rarity: 'common' });
    const result = acc.toArray();
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(7);
  });

  it('keeps different templates separate', () => {
    const acc = createLootAccumulator();
    acc.add({ itemTemplateId: 'tpl-1', quantity: 1, rarity: 'common' });
    acc.add({ itemTemplateId: 'tpl-2', quantity: 2, rarity: 'rare' });
    expect(acc.toArray()).toHaveLength(2);
  });

  it('does not mutate the original drop object when merging', () => {
    const acc = createLootAccumulator();
    const originalDrop = { itemTemplateId: 'tpl-1', quantity: 3, rarity: 'common' as const };
    acc.add(originalDrop);
    acc.add({ itemTemplateId: 'tpl-1', quantity: 5, rarity: 'common' });
    // The original object should not be mutated because createLootAccumulator spreads on first add
    expect(originalDrop.quantity).toBe(3);
  });

  it('handles adding the same template many times', () => {
    const acc = createLootAccumulator();
    for (let i = 0; i < 100; i++) {
      acc.add({ itemTemplateId: 'tpl-1', quantity: 1, rarity: 'common' });
    }
    const result = acc.toArray();
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// rollAndGrantDropsTx
// ---------------------------------------------------------------------------
describe('rollAndGrantDropsTx', () => {
  function makeTx(overrides: Record<string, any> = {}) {
    return {
      item: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'new-item' }),
        ...overrides.item,
      },
      itemTemplate: {
        findMany: vi.fn().mockResolvedValue([]),
        ...overrides.itemTemplate,
      },
    } as any;
  }

  const stackableEntry: DropTableEntry = {
    itemTemplateId: 'mat-1',
    dropChance: 1.0,
    minQuantity: 1,
    maxQuantity: 3,
    itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
  };

  const weaponEntry: DropTableEntry = {
    itemTemplateId: 'sword-1',
    dropChance: 1.0,
    minQuantity: 1,
    maxQuantity: 1,
    itemTemplate: { itemType: 'weapon', stackable: false, maxDurability: 100 },
  };

  const armorEntry: DropTableEntry = {
    itemTemplateId: 'helm-1',
    dropChance: 1.0,
    minQuantity: 1,
    maxQuantity: 1,
    itemTemplate: { itemType: 'armor', stackable: false, maxDurability: 80 },
  };

  const nonEquipEntry: DropTableEntry = {
    itemTemplateId: 'gem-1',
    dropChance: 1.0,
    minQuantity: 1,
    maxQuantity: 1,
    itemTemplate: { itemType: 'gem', stackable: false, maxDurability: 0 },
  };

  it('returns empty loot when pickWeighted returns null every time', async () => {
    mockedPickWeighted.mockReturnValue(null);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 3);
    expect(result.loot).toEqual([]);
    expect(result.overflow).toEqual([]);
    expect(result.slotsConsumed).toBe(0);
  });

  it('returns empty loot for zero rolls', async () => {
    const tx = makeTx();
    const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 0);
    expect(result.loot).toEqual([]);
    expect(result.overflow).toEqual([]);
  });

  it('grants stackable items via addStackableItemTx', async () => {
    mockedPickWeighted.mockReturnValue(stackableEntry);
    mockedRandomInt.mockReturnValue(2);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1);

    expect(mockedAddStackable).toHaveBeenCalledWith(tx, 'p1', 'mat-1', 2);
    expect(result.loot).toHaveLength(1);
    expect(result.loot[0]).toEqual({
      itemTemplateId: 'mat-1',
      quantity: 2,
      rarity: 'common',
    });
  });

  it('uses provided rarity for stackable items', async () => {
    mockedPickWeighted.mockReturnValue(stackableEntry);
    mockedRandomInt.mockReturnValue(1);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1, 'epic');

    expect(result.loot[0].rarity).toBe('epic');
  });

  it('accumulates quantities across multiple rolls for stackable items', async () => {
    mockedPickWeighted.mockReturnValue(stackableEntry);
    mockedRandomInt.mockReturnValue(1);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 3);

    expect(result.loot).toHaveLength(1);
    expect(result.loot[0].quantity).toBe(3);
    expect(mockedAddStackable).toHaveBeenCalledTimes(3);
  });

  it('creates non-stackable weapon items with durability via tx.item.create', async () => {
    mockedPickWeighted.mockReturnValue(weaponEntry);
    mockedRandomInt.mockReturnValue(1);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [weaponEntry], 1);

    expect(tx.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'p1',
        templateId: 'sword-1',
        rarity: 'common',
        quantity: 1,
        maxDurability: 100,
        currentDurability: 100,
      }),
      select: { id: true },
    });
    expect(result.loot).toHaveLength(1);
    expect(result.loot[0].itemTemplateId).toBe('sword-1');
  });

  it('creates non-stackable armor items with durability', async () => {
    mockedPickWeighted.mockReturnValue(armorEntry);
    mockedRandomInt.mockReturnValue(1);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [armorEntry], 1);

    expect(tx.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        maxDurability: 80,
        currentDurability: 80,
      }),
      select: { id: true },
    });
    expect(result.loot[0].itemTemplateId).toBe('helm-1');
  });

  it('creates non-equipment non-stackable items with null durability', async () => {
    mockedPickWeighted.mockReturnValue(nonEquipEntry);
    mockedRandomInt.mockReturnValue(1);
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [nonEquipEntry], 1);

    expect(tx.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        maxDurability: null,
        currentDurability: null,
      }),
      select: { id: true },
    });
    expect(result.loot[0].itemTemplateId).toBe('gem-1');
  });

  it('randomIntInclusive clamps quantity to at least 1', async () => {
    mockedPickWeighted.mockReturnValue(stackableEntry);
    mockedRandomInt.mockReturnValue(0); // would be below 1
    const tx = makeTx();

    const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1);

    // Math.max(1, 0) = 1
    expect(mockedAddStackable).toHaveBeenCalledWith(tx, 'p1', 'mat-1', 1);
    expect(result.loot[0].quantity).toBe(1);
  });

  // -- Inventory slot tracking / overflow tests --

  describe('with availableSlots tracking', () => {
    it('tracks slot consumption for stackable items that need new slots', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'mat-1', name: 'Iron Ore' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1, 'common', 5);

      expect(result.slotsConsumed).toBe(1);
      expect(result.overflow).toEqual([]);
    });

    it('does not consume a slot when player already has a stack of that item', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: {
          findMany: vi.fn().mockResolvedValue([{ templateId: 'mat-1', rarity: 'common', bonusStats: null, craftMarks: null }]),
          create: vi.fn(),
        },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'mat-1', name: 'Iron Ore' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1, 'common', 5);

      expect(result.slotsConsumed).toBe(0);
    });

    it('overflows stackable drops when only a marked same-template stack exists and no slots remain', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: {
          findMany: vi.fn().mockResolvedValue([
            {
              templateId: 'mat-1',
              rarity: 'common',
              bonusStats: null,
              craftMarks: [{ markId: 'mark-1', sourceTechniqueId: 'tech-1' }],
            },
          ]),
          create: vi.fn(),
        },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'mat-1', name: 'Iron Ore' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1, 'common', 0);

      expect(result.loot).toEqual([]);
      expect(result.overflow).toEqual([
        expect.objectContaining({ templateId: 'mat-1', quantity: 1, rarity: 'common' }),
      ]);
      expect(mockedAddStackable).not.toHaveBeenCalled();
    });

    it('does not consume an extra slot when same stackable is rolled twice', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'mat-1', name: 'Iron Ore' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 3, 'common', 5);

      // First roll consumes 1 slot; subsequent rolls for same template use existing stack
      expect(result.slotsConsumed).toBe(1);
    });

    it('sends stackable items to overflow when no slots remain', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(2);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'mat-1', name: 'Iron Ore' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1, 'common', 0);

      expect(result.loot).toEqual([]);
      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0]).toEqual(expect.objectContaining({
        templateId: 'mat-1',
        templateName: 'Iron Ore',
        rarity: 'common',
        quantity: 2,
      }));
      expect(mockedAddStackable).not.toHaveBeenCalled();
    });

    it('accumulates overflow quantities for the same stackable template', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'mat-1', name: 'Iron Ore' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 3, 'common', 0);

      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0].quantity).toBe(3);
    });

    it('sends non-stackable items to overflow when no slots remain', async () => {
      mockedPickWeighted.mockReturnValue(weaponEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'sword-1', name: 'Iron Sword' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [weaponEntry], 1, 'common', 0);

      // loot accumulator records the full rolled quantity regardless of overflow
      expect(result.loot).toHaveLength(1);
      expect(result.loot[0].itemTemplateId).toBe('sword-1');
      expect(result.overflow).toHaveLength(1);
      expect(result.overflow[0]).toEqual(expect.objectContaining({
        templateId: 'sword-1',
        templateName: 'Iron Sword',
        rarity: 'common',
        quantity: 1,
        maxDurability: 100,
        currentDurability: 100,
      }));
      // No items actually created in DB since no slots
      expect(tx.item.create).not.toHaveBeenCalled();
    });

    it('partially fills inventory then overflows remaining non-stackable items', async () => {
      // Entry with quantity 3 but only 1 slot available
      const multiEntry: DropTableEntry = {
        itemTemplateId: 'sword-1',
        dropChance: 1.0,
        minQuantity: 3,
        maxQuantity: 3,
        itemTemplate: { itemType: 'weapon', stackable: false, maxDurability: 100 },
      };
      mockedPickWeighted.mockReturnValue(multiEntry);
      mockedRandomInt.mockReturnValue(3);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'i' }) },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([{ id: 'sword-1', name: 'Iron Sword' }]) },
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [multiEntry], 1, 'common', 1);

      // 1 item created, 2 overflow
      expect(tx.item.create).toHaveBeenCalledTimes(1);
      expect(result.overflow).toHaveLength(2);
      expect(result.slotsConsumed).toBe(1);
      // loot accumulator records total quantity from the roll (3)
      expect(result.loot[0].quantity).toBe(3);
    });

    it('uses "Unknown" for template name when not found in cache', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx({
        item: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        itemTemplate: { findMany: vi.fn().mockResolvedValue([]) }, // empty — no names
      });

      const result = await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1, 'common', 0);

      expect(result.overflow[0].templateName).toBe('Unknown');
    });
  });

  describe('slotsConsumed without availableSlots', () => {
    it('returns 0 slotsConsumed when availableSlots is not provided', async () => {
      mockedPickWeighted.mockReturnValue(weaponEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx();

      const result = await rollAndGrantDropsTx(tx, 'p1', [weaponEntry], 2);

      // When no slot tracking, slotsConsumed is always 0
      expect(result.slotsConsumed).toBe(0);
    });

    it('does not query existing items when availableSlots is not provided', async () => {
      mockedPickWeighted.mockReturnValue(stackableEntry);
      mockedRandomInt.mockReturnValue(1);
      const tx = makeTx();

      await rollAndGrantDropsTx(tx, 'p1', [stackableEntry], 1);

      expect(tx.item.findMany).not.toHaveBeenCalled();
      expect(tx.itemTemplate.findMany).not.toHaveBeenCalled();
    });
  });
});
