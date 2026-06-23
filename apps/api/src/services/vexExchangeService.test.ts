import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./inventoryService', () => ({
  consumeItemsByTemplateTx: vi.fn(),
  getTotalQuantityByTemplate: vi.fn(),
}));

vi.mock('./equipmentService', () => ({
  invalidateEquipmentCache: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { AppError } from '../middleware/errorHandler';
import { invalidateEquipmentCache } from './equipmentService';
import { consumeItemsByTemplateTx, getTotalQuantityByTemplate } from './inventoryService';
import { VEX_EXCHANGES } from './vexExchangeDefinitions';
import { listVexExchanges, purchaseVexExchange } from './vexExchangeService';

type Template = {
  id: string;
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  baseStats: Record<string, number>;
  maxDurability: number;
  seasonId: string | null;
  stackable?: boolean;
};

type ItemRow = {
  id: string;
  ownerId: string;
  templateId: string;
  template: Template;
  rarity: string;
  quantity: number;
  currentDurability: number | null;
  maxDurability: number | null;
  bonusStats: Record<string, number> | null;
  isSoulbound?: boolean;
  itemAugments: Array<{ augmentType: string }>;
  equipment: Array<{ playerId: string; slot: string }>;
};

const playerId = 'player-1';
const seasonId = 'season-1';

const templates: Template[] = [
  template('tpl-fang', 'Alpha Wolf Fang', 'resource', null, 1, {}, 0, true),
  template('tpl-essence', 'Spirit Essence', 'resource', null, 1, {}, 0, true),
  template('tpl-wayfarer', 'Wayfarer Aegis', 'armor', 'off_hand', 2, { accuracy: 4 }, 80),
  template('tpl-spiritbound', 'Spiritbound Aegis', 'armor', 'off_hand', 4, { accuracy: 8, magicDefence: 3 }, 140),
  template('tpl-iron', 'Iron Sword', 'weapon', 'main_hand', 2, { attack: 5 }, 100),
  template('tpl-mythril', 'Mythril Sword', 'weapon', 'main_hand', 4, { attack: 12 }, 150),
  template('tpl-wolfsbane', 'Wolfsbane Blade', 'weapon', 'main_hand', 3, { attack: 10 }, 120),
  template('tpl-pelt', 'Alpha Pelt Chest', 'armor', 'chest', 3, { armor: 8 }, 130),
  template('tpl-staff', 'Spirit Staff', 'weapon', 'main_hand', 5, { magicPower: 11 }, 110),
  template('tpl-robes', 'Ethereal Robes', 'armor', 'chest', 5, { magicDefence: 9 }, 100),
];

function template(
  id: string,
  name: string,
  itemType: string,
  slot: string | null,
  tier: number,
  baseStats: Record<string, number>,
  maxDurability: number,
  stackable = false,
  templateSeasonId: string | null = seasonId,
): Template {
  return { id, name, itemType, slot, tier, baseStats, maxDurability, seasonId: templateSeasonId, stackable };
}

function item(overrides: Partial<ItemRow> & { id: string; template: Template }): ItemRow {
  return {
    id: overrides.id,
    ownerId: overrides.ownerId ?? playerId,
    templateId: overrides.template.id,
    template: overrides.template,
    rarity: overrides.rarity ?? 'common',
    quantity: overrides.quantity ?? 1,
    currentDurability: overrides.currentDurability === undefined ? overrides.template.maxDurability : overrides.currentDurability,
    maxDurability: overrides.maxDurability === undefined ? overrides.template.maxDurability : overrides.maxDurability,
    bonusStats: overrides.bonusStats ?? null,
    isSoulbound: overrides.isSoulbound ?? false,
    itemAugments: overrides.itemAugments ?? [],
    equipment: overrides.equipment ?? [],
  };
}

function byName(name: string): Template {
  const found = templates.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`Missing test template ${name}`);
  }
  return found;
}

function setupTemplateLookup(): void {
  mockPrisma.itemTemplate.findFirst.mockImplementation(async ({ where }: { where?: { name?: string; seasonId?: string | null } }) => {
    if (!where?.name) return null;
    return templates.find((candidate) => (
      candidate.name === where.name &&
      (!('seasonId' in where) || candidate.seasonId === where.seasonId)
    )) ?? null;
  });
}

function setupPurchaseDefaults(): void {
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma));
  mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
  vi.mocked(consumeItemsByTemplateTx).mockResolvedValue({ fullyConsumedIds: [], partiallyConsumedIds: [] });
}

async function expectAppCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.itemAugment ??= { create: vi.fn() };
  mockPrisma.itemAugment.create.mockReset();
  setupTemplateLookup();
  mockPrisma.player.findUnique.mockResolvedValue({ id: playerId, gold: 6000, seasonId });
  mockPrisma.item.findMany.mockResolvedValue([]);
  vi.mocked(getTotalQuantityByTemplate).mockResolvedValue(99);
});

describe('listVexExchanges', () => {
  it('returns all exchanges with player gold and owned material quantities', async () => {
    vi.mocked(getTotalQuantityByTemplate).mockImplementation(async (_playerId, templateId) => {
      if (templateId === byName('Alpha Wolf Fang').id) return 7;
      if (templateId === byName('Spirit Essence').id) return 99;
      return 0;
    });

    const result = await listVexExchanges(playerId);

    expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
      where: { id: playerId },
      select: { gold: true, seasonId: true },
    });
    expect(mockPrisma.itemTemplate.findFirst).toHaveBeenCalledWith({
      where: { name: 'Alpha Wolf Fang', seasonId },
      select: { id: true, name: true, maxDurability: true },
    });
    expect(result.gold).toBe(6000);
    expect(result.exchanges.map((exchange) => exchange.key)).toEqual(
      VEX_EXCHANGES.map((exchange) => exchange.key),
    );
    expect(result.exchanges[0]).toMatchObject({
      key: 'wayfarer_aegis',
      playerGold: 6000,
      requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 4, ownedQuantity: 7 }],
      canPurchase: true,
      blockedReason: null,
    });
    expect(result.exchanges.find((exchange) => exchange.key === 'spiritbound_aegis')).toMatchObject({
      canPurchase: false,
      blockedReason: 'No eligible target item',
    });
  });

  it('marks already-applied target augments', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      item({
        id: 'fang-target',
        template: byName('Wolfsbane Blade'),
        itemAugments: [{ augmentType: 'boss_stone' }],
      }),
    ]);

    const result = await listVexExchanges(playerId);

    const fangstone = result.exchanges.find((exchange) => exchange.key === 'fangstone');
    expect(fangstone?.targetOptions).toEqual([
      expect.objectContaining({
        itemId: 'fang-target',
        itemName: 'Wolfsbane Blade',
        alreadyApplied: true,
        baseStats: { attack: 10 },
        bonusStats: null,
      }),
    ]);
    expect(fangstone).toMatchObject({
      canPurchase: false,
      blockedReason: 'No eligible target item without this augment',
    });
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
  });

  it('tier-filters Vex Temper target options using minTier and maxTier', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      item({ id: 'tier-2-sword', template: byName('Iron Sword') }),
      item({ id: 'tier-4-sword', template: byName('Mythril Sword') }),
      item({ id: 'boss-staff', template: byName('Spirit Staff') }),
    ]);

    const result = await listVexExchanges(playerId);

    expect(result.exchanges.find((exchange) => exchange.key === 'vex_temper_tier_1_3')?.targetOptions).toEqual([
      expect.objectContaining({ itemId: 'tier-2-sword', itemName: 'Iron Sword' }),
    ]);
    expect(result.exchanges.find((exchange) => exchange.key === 'vex_temper_tier_4_5')?.targetOptions).toEqual([
      expect.objectContaining({ itemId: 'tier-4-sword', itemName: 'Mythril Sword' }),
      expect.objectContaining({ itemId: 'boss-staff', itemName: 'Spirit Staff' }),
    ]);
  });

  it('sorts exchanges by sortOrder even when definitions are declared out of order', async () => {
    const unsortedExchanges = [
      {
        key: 'third',
        name: 'Third',
        description: 'Third by sort order',
        category: 'item',
        goldCost: 0,
        requiredItems: [],
        targetRule: { type: 'none' },
        effect: { type: 'create_item', itemTemplateName: 'Third Item', soulbound: true },
        sortOrder: 30,
      },
      {
        key: 'first',
        name: 'First',
        description: 'First by sort order',
        category: 'item',
        goldCost: 0,
        requiredItems: [],
        targetRule: { type: 'none' },
        effect: { type: 'create_item', itemTemplateName: 'First Item', soulbound: true },
        sortOrder: 10,
      },
      {
        key: 'second',
        name: 'Second',
        description: 'Second by sort order',
        category: 'item',
        goldCost: 0,
        requiredItems: [],
        targetRule: { type: 'none' },
        effect: { type: 'create_item', itemTemplateName: 'Second Item', soulbound: true },
        sortOrder: 20,
      },
    ];

    vi.resetModules();
    vi.doMock('./vexExchangeDefinitions', () => ({ VEX_EXCHANGES: unsortedExchanges }));

    try {
      const { listVexExchanges: listWithMockedDefinitions } = await import('./vexExchangeService.js');

      const result = await listWithMockedDefinitions(playerId);

      expect(result.exchanges.map((exchange) => exchange.key)).toEqual(['first', 'second', 'third']);
    } finally {
      vi.doUnmock('./vexExchangeDefinitions');
      vi.resetModules();
    }
  });
});

describe('purchaseVexExchange', () => {
  beforeEach(() => {
    setupPurchaseDefaults();
  });

  it('rejects an unknown exchange key', async () => {
    await expectAppCode(purchaseVexExchange(playerId, 'missing_exchange', {}), 'INVALID_EXCHANGE');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates Wayfarer Aegis by spending gold/materials and creating a soulbound full-durability item', async () => {
    mockPrisma.item.create.mockResolvedValue({ id: 'created-aegis', template: byName('Wayfarer Aegis') });

    const result = await purchaseVexExchange(playerId, 'wayfarer_aegis', {});

    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: { id: playerId, gold: { gte: 750 } },
      data: { gold: { decrement: 750 } },
    });
    expect(consumeItemsByTemplateTx).toHaveBeenCalledWith(mockPrisma, playerId, byName('Alpha Wolf Fang').id, 4);
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: playerId,
        templateId: byName('Wayfarer Aegis').id,
        rarity: 'common',
        quantity: 1,
        maxDurability: 80,
        currentDurability: 80,
        isSoulbound: true,
      }),
    });
    expect(mockPrisma.item.create.mock.calls[0][0].data).not.toHaveProperty('bonusStats');
    expect(mockPrisma.itemTemplate.findFirst).toHaveBeenCalledWith({
      where: { name: 'Wayfarer Aegis', seasonId },
      select: { id: true, name: true, maxDurability: true },
    });
    expect(result).toEqual({
      exchangeKey: 'wayfarer_aegis',
      message: expect.stringContaining('Wayfarer Aegis'),
      invalidatesEquipment: false,
    });
    expect(invalidateEquipmentCache).not.toHaveBeenCalled();
  });

  it('uses deterministic global template fallback when a season template is missing', async () => {
    mockPrisma.itemTemplate.findFirst.mockImplementation(async ({ where }: { where?: { name?: string; seasonId?: string | null } }) => {
      if (where?.name === 'Wayfarer Aegis' && where.seasonId === seasonId) return null;
      if (!where?.name) return null;
      return templates.find((candidate) => (
        candidate.name === where.name &&
        (!('seasonId' in where) || candidate.seasonId === where.seasonId)
      )) ?? null;
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValue([
      { id: 'global-wayfarer-a', name: 'Wayfarer Aegis', maxDurability: 75 },
      { id: 'global-wayfarer-b', name: 'Wayfarer Aegis', maxDurability: 80 },
    ]);

    await purchaseVexExchange(playerId, 'wayfarer_aegis', {});

    expect(mockPrisma.itemTemplate.findMany).toHaveBeenCalledWith({
      where: { name: 'Wayfarer Aegis', seasonId: null },
      orderBy: [{ id: 'asc' }],
      take: 1,
      select: { id: true, name: true, maxDurability: true },
    });
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'global-wayfarer-a',
        maxDurability: 75,
        currentDurability: 75,
      }),
    });
  });

  it('transforms Spiritbound Aegis in place and invalidates equipment when equipped', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      item({
        id: 'aegis-1',
        template: byName('Wayfarer Aegis'),
        bonusStats: { accuracy: 99 },
        equipment: [{ playerId, slot: 'off_hand' }],
      }),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await purchaseVexExchange(playerId, 'spiritbound_aegis', { targetItemId: 'aegis-1' });

    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'aegis-1',
        ownerId: playerId,
        templateId: byName('Wayfarer Aegis').id,
        quantity: 1,
      },
      data: expect.objectContaining({
        templateId: byName('Spiritbound Aegis').id,
        maxDurability: 140,
        currentDurability: 140,
        isSoulbound: true,
      }),
    });
    expect(mockPrisma.item.updateMany.mock.calls[0][0].data).toHaveProperty('bonusStats');
    expect(result.invalidatesEquipment).toBe(true);
    expect(invalidateEquipmentCache).toHaveBeenCalledWith(playerId);
  });

  it('rejects transform when the guarded target update no longer matches', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item({ id: 'aegis-1', template: byName('Wayfarer Aegis') }));
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });

    await expectAppCode(
      purchaseVexExchange(playerId, 'spiritbound_aegis', { targetItemId: 'aegis-1' }),
      'INVALID_TARGET',
    );
  });

  it('reinforces Vex Temper durability, records an augment, and restores current durability', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      item({
        id: 'iron-1',
        template: byName('Iron Sword'),
        currentDurability: 5,
        maxDurability: 80,
      }),
    );

    const result = await purchaseVexExchange(playerId, 'vex_temper_tier_1_3', { targetItemId: 'iron-1' });

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'iron-1' },
      data: { maxDurability: 120, currentDurability: 120 },
    });
    expect(mockPrisma.itemAugment.create).toHaveBeenCalledWith({
      data: {
        itemId: 'iron-1',
        augmentType: 'durability_reinforcement',
        sourceKey: 'vex_temper_tier_1_3',
        metadata: { previousMaxDurability: 80, newMaxDurability: 120 },
      },
    });
    expect(result.invalidatesEquipment).toBe(false);
  });

  it('rejects Vex Temper when already applied or outside the exchange tier range', async () => {
    mockPrisma.item.findUnique.mockResolvedValueOnce(
      item({
        id: 'tempered-1',
        template: byName('Iron Sword'),
        itemAugments: [{ augmentType: 'durability_reinforcement' }],
      }),
    );
    await expectAppCode(
      purchaseVexExchange(playerId, 'vex_temper_tier_1_3', { targetItemId: 'tempered-1' }),
      'AUGMENT_ALREADY_APPLIED',
    );

    mockPrisma.item.findUnique.mockResolvedValueOnce(item({ id: 'tier-4', template: byName('Mythril Sword') }));
    await expectAppCode(
      purchaseVexExchange(playerId, 'vex_temper_tier_1_3', { targetItemId: 'tier-4' }),
      'INVALID_TARGET',
    );
  });

  it('maps duplicate Vex Temper augment writes to the expected AppError', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item({ id: 'iron-1', template: byName('Iron Sword') }));
    mockPrisma.itemAugment.create.mockRejectedValueOnce({ code: 'P2002' });

    await expectAppCode(
      purchaseVexExchange(playerId, 'vex_temper_tier_1_3', { targetItemId: 'iron-1' }),
      'AUGMENT_ALREADY_APPLIED',
    );
  });

  it('applies Fangstone bonus stats only to eligible boss-crafted templates and prevents duplicates', async () => {
    mockPrisma.item.findUnique.mockResolvedValueOnce(
      item({
        id: 'wolfsbane-1',
        template: byName('Wolfsbane Blade'),
        bonusStats: { attack: 1, dodge: 1 },
      }),
    );

    const result = await purchaseVexExchange(playerId, 'fangstone', { targetItemId: 'wolfsbane-1' });

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'wolfsbane-1' },
      data: { bonusStats: { attack: 3, dodge: 1, accuracy: 2, armor: 1, health: 3 } },
    });
    expect(mockPrisma.itemAugment.create).toHaveBeenCalledWith({
      data: {
        itemId: 'wolfsbane-1',
        augmentType: 'boss_stone',
        sourceKey: 'fangstone',
        metadata: { bonusStats: { attack: 2, accuracy: 2, armor: 1, health: 3 } },
      },
    });
    expect(result.message).toContain('Fangstone');

    mockPrisma.item.findUnique.mockResolvedValueOnce(
      item({
        id: 'used-stone',
        template: byName('Wolfsbane Blade'),
        itemAugments: [{ augmentType: 'boss_stone' }],
      }),
    );
    await expectAppCode(
      purchaseVexExchange(playerId, 'fangstone', { targetItemId: 'used-stone' }),
      'AUGMENT_ALREADY_APPLIED',
    );

    mockPrisma.item.findUnique.mockResolvedValueOnce(item({ id: 'wrong-template', template: byName('Spirit Staff') }));
    await expectAppCode(
      purchaseVexExchange(playerId, 'fangstone', { targetItemId: 'wrong-template' }),
      'INVALID_TARGET',
    );
  });

  it('maps duplicate boss-stone augment writes to the expected AppError', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(item({ id: 'wolfsbane-1', template: byName('Wolfsbane Blade') }));
    mockPrisma.itemAugment.create.mockRejectedValueOnce({ code: 'P2002' });

    await expectAppCode(
      purchaseVexExchange(playerId, 'fangstone', { targetItemId: 'wolfsbane-1' }),
      'AUGMENT_ALREADY_APPLIED',
    );
  });

  it('applies Spiritstone only to Spirit boss-crafted templates and merges bonus stats', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      item({
        id: 'staff-1',
        template: byName('Spirit Staff'),
        bonusStats: { magicPower: 1, health: 2 },
      }),
    );

    await purchaseVexExchange(playerId, 'spiritstone', { targetItemId: 'staff-1' });

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { bonusStats: { magicPower: 4, health: 6, accuracy: 2, magicDefence: 2 } },
    });
  });

  it('fails purchases for insufficient gold, missing target, wrong owner, and invalid target item', async () => {
    mockPrisma.player.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectAppCode(purchaseVexExchange(playerId, 'wayfarer_aegis', {}), 'INSUFFICIENT_GOLD');

    await expectAppCode(purchaseVexExchange(playerId, 'spiritbound_aegis', {}), 'TARGET_REQUIRED');

    mockPrisma.item.findUnique.mockResolvedValueOnce(item({ id: 'other-aegis', ownerId: 'other-player', template: byName('Wayfarer Aegis') }));
    await expectAppCode(
      purchaseVexExchange(playerId, 'spiritbound_aegis', { targetItemId: 'other-aegis' }),
      'NOT_FOUND',
    );

    mockPrisma.item.findUnique.mockResolvedValueOnce(null);
    await expectAppCode(
      purchaseVexExchange(playerId, 'spiritbound_aegis', { targetItemId: 'missing-item' }),
      'NOT_FOUND',
    );

    mockPrisma.item.findUnique.mockResolvedValueOnce(item({ id: 'wrong-aegis', template: byName('Iron Sword') }));
    await expectAppCode(
      purchaseVexExchange(playerId, 'spiritbound_aegis', { targetItemId: 'wrong-aegis' }),
      'INVALID_TARGET',
    );
  });

  it('throws AppError when list player is missing', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(listVexExchanges(playerId)).rejects.toBeInstanceOf(AppError);
    await expectAppCode(listVexExchanges(playerId), 'NOT_FOUND');
  });
});
