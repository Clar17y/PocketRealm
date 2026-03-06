import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import { getShopItems, purchaseItem } from './questShopService';

const PLAYER_ID = 'player-1';
const SHOP_ITEM_ID = 'si-1';

function mockModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
}

function makeTx() {
  return {
    playerQuestState: mockModel(),
    playerShopPurchase: mockModel(),
    playerBuff: mockModel(),
    player: mockModel(),
    skillPointAllocation: mockModel(),
    playerSkill: mockModel(),
    zone: mockModel(),
    playerZoneDiscovery: mockModel(),
    mobTemplate: mockModel(),
    playerBestiary: mockModel(),
    playerBestiaryPrefix: mockModel(),
    craftingRecipe: mockModel(),
    playerRecipe: mockModel(),
    guildMember: mockModel(),
    guildContract: mockModel(),
    guild: mockModel(),
    guildLog: mockModel(),
    shopItem: mockModel(),
  };
}

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// getShopItems
// ============================================================================
describe('getShopItems', () => {
  it('returns items with purchase counts and canPurchase flag', async () => {
    const item = {
      id: SHOP_ITEM_ID,
      key: 'xp_boost_scroll',
      name: 'XP Boost',
      description: 'Boosts XP',
      cost: 5,
      category: 'upgrade',
      weeklyLimit: 1,
      lifetimeLimit: null,
      buffType: 'xp_boost',
      buffValue: 0.1,
      buffUses: 50,
      sortOrder: 0,
      enabled: true,
    };

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);

    expect(result.questTokens).toBe(10);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].canPurchase).toBe(true);
    expect(result.items[0].purchasesThisWeek).toBe(0);
    expect(result.items[0].purchasesLifetime).toBe(0);
  });

  it('marks canPurchase false when buff already active', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'xp_boost_scroll', name: 'XP Boost', description: 'desc',
      cost: 5, category: 'upgrade', weeklyLimit: null, lifetimeLimit: null,
      buffType: 'xp_boost', buffValue: 0.1, buffUses: 50, sortOrder: 0, enabled: true,
    };

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([{ buffType: 'xp_boost' }]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(false);
  });
});

// ============================================================================
// purchaseItem — happy path (buff)
// ============================================================================
describe('purchaseItem', () => {
  it('deducts tokens, creates buff, and records purchase for buff item', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'xp_boost_scroll', name: 'XP Boost', description: 'desc',
      cost: 5, category: 'upgrade', weeklyLimit: 1, lifetimeLimit: null,
      buffType: 'xp_boost', buffValue: 0.1, buffUses: 50, sortOrder: 0, enabled: true,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerShopPurchase.count.mockResolvedValue(0);
    tx.playerBuff.findUnique.mockResolvedValue(null);
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 5 });
    tx.playerShopPurchase.create.mockResolvedValue({});
    tx.playerBuff.create.mockResolvedValue({});

    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(5);
    expect(tx.playerQuestState.update).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { questTokens: { decrement: 5 } },
    });
    expect(tx.playerBuff.create).toHaveBeenCalledWith({
      data: {
        playerId: PLAYER_ID,
        buffType: 'xp_boost',
        remainingUses: 50,
        bonusValue: 0.1,
        shopItemId: SHOP_ITEM_ID,
      },
    });
  });

  it('rejects insufficient tokens', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'xp_boost_scroll', cost: 5, enabled: true,
      category: 'upgrade', buffType: null, weeklyLimit: null, lifetimeLimit: null,
      buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 2 });
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Not enough quest tokens');
  });

  it('rejects weekly limit exceeded', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'efficiency_reset_scroll', cost: 3, enabled: true,
      category: 'reset', weeklyLimit: 1, lifetimeLimit: null,
      buffType: null, buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerShopPurchase.count.mockResolvedValue(1); // already bought this week
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Weekly purchase limit reached');
  });

  it('rejects buff stacking when buff already active', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'xp_boost_scroll', cost: 5, enabled: true,
      category: 'upgrade', weeklyLimit: null, lifetimeLimit: null,
      buffType: 'xp_boost', buffValue: 0.1, buffUses: 50,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerBuff.findUnique.mockResolvedValue({ id: 'existing-buff' });
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Buff already active');
  });

  // === Effect tests ===

  it('attribute reset refunds all points', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'attribute_reset_scroll', cost: 8, enabled: true,
      category: 'reset', weeklyLimit: null, lifetimeLimit: null,
      buffType: null, buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 2 });
    tx.playerShopPurchase.create.mockResolvedValue({});
    tx.player.findUnique.mockResolvedValue({
      attributes: { vitality: 5, strength: 10, dexterity: 3, intelligence: 0, luck: 2, evasion: 0 },
      attributePoints: 0,
    });
    tx.player.update.mockResolvedValue({});
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'attribute_reset', refundedPoints: 20 });
    expect(tx.player.update).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      data: {
        attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
        attributePoints: { increment: 20 },
      },
    });
  });

  it('efficiency reset sets dailyXpGained to 0 on all skills', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'efficiency_reset_scroll', cost: 3, enabled: true,
      category: 'reset', weeklyLimit: null, lifetimeLimit: null,
      buffType: null, buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 7 });
    tx.playerShopPurchase.create.mockResolvedValue({});
    tx.playerSkill.updateMany.mockResolvedValue({ count: 5 });
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'efficiency_reset' });
    expect(tx.playerSkill.updateMany).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { dailyXpGained: 0 },
    });
  });

  it('teleport updates player zone', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'teleport_scroll', cost: 6, enabled: true,
      category: 'utility', weeklyLimit: null, lifetimeLimit: null,
      buffType: null, buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const targetZoneId = 'zone-42';
    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 4 });
    tx.playerShopPurchase.create.mockResolvedValue({});
    tx.zone.findUnique.mockResolvedValue({ id: targetZoneId, name: 'Darkwood Forest' });
    tx.playerZoneDiscovery.findFirst.mockResolvedValue({ id: 'd1' });
    tx.player.update.mockResolvedValue({});
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetZoneId });

    expect(result.effect).toEqual({ type: 'teleport', zoneId: targetZoneId, zoneName: 'Darkwood Forest' });
    expect(tx.player.update).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      data: { currentZoneId: targetZoneId, lastTravelledFromZoneId: targetZoneId },
    });
  });

  it('teleport rejects undiscovered zone', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'teleport_scroll', cost: 6, enabled: true,
      category: 'utility', weeklyLimit: null, lifetimeLimit: null,
      buffType: null, buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 4 });
    tx.playerShopPurchase.create.mockResolvedValue({});
    tx.zone.findUnique.mockResolvedValue({ id: 'zone-42', name: 'Unknown' });
    tx.playerZoneDiscovery.findFirst.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetZoneId: 'zone-42' })).rejects.toThrow('Zone not discovered');
  });

  it('prestige item records purchase and returns title', async () => {
    const item = {
      id: SHOP_ITEM_ID, key: 'title_champion', cost: 20, enabled: true,
      category: 'prestige', weeklyLimit: null, lifetimeLimit: 1,
      buffType: null, buffValue: null, buffUses: null,
    };
    db.shopItem.findUnique.mockResolvedValue({ ...item, name: 'Champion' });

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 30 });
    tx.playerShopPurchase.count.mockResolvedValue(0);
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 10 });
    tx.playerShopPurchase.create.mockResolvedValue({});
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);
    expect(result.effect).toEqual({ type: 'prestige', title: 'Champion' });
  });
});
