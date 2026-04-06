import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import { AppError } from '../middleware/errorHandler';
import { getShopItems, purchaseItem } from './questShopService';
import {
  GUILD_CONTRACT_DEFINITIONS,
  GUILD_CONTRACT_CONSTANTS,
  getAllMobPrefixes,
} from '@pocketrealm/shared';

vi.mock('./achievementService', () => ({
  emitAchievementNotifications: vi.fn(),
}));

vi.mock('../utils/random', () => ({
  randomIntInclusive: vi.fn().mockReturnValue(0),
}));

vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
}));

vi.mock('./expeditionLockoutService', () => ({
  checkExpeditionLockout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./inventoryService', () => ({
  assertNotOverEncumbered: vi.fn().mockResolvedValue(undefined),
}));

import { emitAchievementNotifications } from './achievementService';
import { assertNotOverEncumbered } from './inventoryService';
import { randomIntInclusive } from '../utils/random';

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
    playerAchievement: mockModel(),
    guildExpeditionMember: mockModel(),
  };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: SHOP_ITEM_ID,
    key: 'xp_boost_scroll',
    name: 'XP Boost',
    description: 'Boosts XP',
    cost: 5,
    category: 'upgrade',
    weeklyLimit: null,
    lifetimeLimit: null,
    buffType: null,
    buffValue: null,
    buffUses: null,
    sortOrder: 0,
    enabled: true,
    ...overrides,
  };
}

/** Set up tx for a standard purchaseItem call and wire db.$transaction. */
function setupTx(item: Record<string, unknown>, txOverrides?: (tx: ReturnType<typeof makeTx>) => void) {
  db.shopItem.findUnique.mockResolvedValue(item);
  const tx = makeTx();
  tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 999 });
  tx.playerQuestState.update.mockResolvedValue({ questTokens: 999 - (item.cost as number) });
  tx.playerShopPurchase.create.mockResolvedValue({});
  tx.playerShopPurchase.count.mockResolvedValue(0);
  tx.playerBuff.findUnique.mockResolvedValue(null);
  if (txOverrides) txOverrides(tx);
  db.$transaction.mockImplementation(async (cb: any) => cb(tx));
  return tx;
}

beforeEach(() => vi.clearAllMocks());

// ============================================================================
// getShopItems
// ============================================================================
describe('getShopItems', () => {
  it('returns items with purchase counts and canPurchase flag', async () => {
    const item = makeItem({ buffType: 'xp_boost', buffValue: 0.1, buffUses: 50, weeklyLimit: 1 });

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
    const item = makeItem({ buffType: 'xp_boost', buffValue: 0.1, buffUses: 50 });

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([{ buffType: 'xp_boost' }]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(false);
  });

  it('marks canPurchase false when tokens insufficient', async () => {
    const item = makeItem({ cost: 100 });

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 5 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(false);
  });

  it('marks canPurchase false when weekly limit reached', async () => {
    const item = makeItem({ weeklyLimit: 1 });

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 100 });
    // Purchase from within this week
    db.playerShopPurchase.findMany.mockResolvedValue([
      { shopItemId: SHOP_ITEM_ID, purchasedAt: new Date() },
    ]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(false);
    expect(result.items[0].purchasesThisWeek).toBe(1);
  });

  it('marks canPurchase false when lifetime limit reached', async () => {
    const item = makeItem({ lifetimeLimit: 2 });
    const oldDate = new Date('2020-01-01');

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 100 });
    db.playerShopPurchase.findMany.mockResolvedValue([
      { shopItemId: SHOP_ITEM_ID, purchasedAt: oldDate },
      { shopItemId: SHOP_ITEM_ID, purchasedAt: oldDate },
    ]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(false);
    expect(result.items[0].purchasesLifetime).toBe(2);
  });

  it('defaults questTokens to 0 when questState is null', async () => {
    db.shopItem.findMany.mockResolvedValue([makeItem({ cost: 1 })]);
    db.playerQuestState.findUnique.mockResolvedValue(null);
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.questTokens).toBe(0);
    expect(result.items[0].canPurchase).toBe(false);
  });

  it('returns empty items list when no shop items', async () => {
    db.shopItem.findMany.mockResolvedValue([]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 100 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items).toEqual([]);
    expect(result.questTokens).toBe(100);
  });

  it('handles multiple items with mixed purchaseability', async () => {
    const affordable = makeItem({ id: 'a', cost: 5, buffType: null });
    const tooExpensive = makeItem({ id: 'b', cost: 999, buffType: null });

    db.shopItem.findMany.mockResolvedValue([affordable, tooExpensive]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(true);
    expect(result.items[1].canPurchase).toBe(false);
  });

  it('counts old weekly purchases separately from current week', async () => {
    const item = makeItem({ weeklyLimit: 2 });
    const oldDate = new Date('2020-01-01');

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 100 });
    db.playerShopPurchase.findMany.mockResolvedValue([
      { shopItemId: SHOP_ITEM_ID, purchasedAt: oldDate },
      { shopItemId: SHOP_ITEM_ID, purchasedAt: new Date() },
    ]);
    db.playerBuff.findMany.mockResolvedValue([]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].purchasesThisWeek).toBe(1);
    expect(result.items[0].purchasesLifetime).toBe(2);
    // weeklyLimit=2, purchasesThisWeek=1 → still under
    expect(result.items[0].canPurchase).toBe(true);
  });

  it('items without buffType never trigger buff stacking check', async () => {
    const item = makeItem({ buffType: null });

    db.shopItem.findMany.mockResolvedValue([item]);
    db.playerQuestState.findUnique.mockResolvedValue({ questTokens: 100 });
    db.playerShopPurchase.findMany.mockResolvedValue([]);
    // Even if there are buffs active, non-buff items don't check stacking
    db.playerBuff.findMany.mockResolvedValue([{ buffType: 'random_buff' }]);

    const result = await getShopItems(PLAYER_ID);
    expect(result.items[0].canPurchase).toBe(true);
  });
});

// ============================================================================
// purchaseItem — validation
// ============================================================================
describe('purchaseItem — validation', () => {
  it('throws when item not found', async () => {
    db.shopItem.findUnique.mockResolvedValue(null);

    await expect(purchaseItem(PLAYER_ID, 'bad-id')).rejects.toThrow('Shop item not found');
  });

  it('throws when item is disabled', async () => {
    db.shopItem.findUnique.mockResolvedValue(makeItem({ enabled: false }));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Shop item not found');
  });

  it('rejects insufficient tokens', async () => {
    const item = makeItem({ cost: 50 });
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 2 });
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Not enough quest tokens');
  });

  it('rejects when questState is null (no tokens)', async () => {
    const item = makeItem({ cost: 1 });
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Not enough quest tokens');
  });

  it('rejects weekly limit exceeded', async () => {
    const item = makeItem({ key: 'efficiency_reset_scroll', cost: 3, weeklyLimit: 1, category: 'reset' });
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerShopPurchase.count.mockResolvedValue(1);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Weekly purchase limit reached');
  });

  it('rejects lifetime limit exceeded', async () => {
    const item = makeItem({ key: 'title_questmaster', cost: 500, lifetimeLimit: 1, category: 'prestige' });
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 999 });
    tx.playerShopPurchase.count.mockResolvedValue(1);
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Lifetime purchase limit reached');
  });

  it('rejects buff stacking when buff already active', async () => {
    const item = makeItem({ buffType: 'xp_boost', buffValue: 0.1, buffUses: 50 });
    db.shopItem.findUnique.mockResolvedValue(item);

    const tx = makeTx();
    tx.playerQuestState.findUnique.mockResolvedValue({ questTokens: 10 });
    tx.playerBuff.findUnique.mockResolvedValue({ id: 'existing-buff' });
    db.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Buff already active');
  });

  it('skips weekly check when weeklyLimit is null', async () => {
    const item = makeItem({
      key: 'xp_boost_scroll', buffType: 'xp_boost', buffValue: 0.1,
      buffUses: 50, weeklyLimit: null, lifetimeLimit: null,
    });

    const tx = setupTx(item);
    tx.playerBuff.create.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);
    expect(result.success).toBe(true);
    // count should not have been called for weekly check
    expect(tx.playerShopPurchase.count).not.toHaveBeenCalled();
  });

  it('skips buff check when buffType is null', async () => {
    const item = makeItem({ key: 'efficiency_reset_scroll', category: 'reset', buffType: null });

    const tx = setupTx(item);
    tx.playerSkill.updateMany.mockResolvedValue({ count: 0 });

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);
    expect(tx.playerBuff.findUnique).not.toHaveBeenCalled();
  });
});

// ============================================================================
// purchaseItem — buff item (happy path)
// ============================================================================
describe('purchaseItem — buff item', () => {
  it('deducts tokens, creates buff, and records purchase', async () => {
    const item = makeItem({
      cost: 5, buffType: 'xp_boost', buffValue: 0.1, buffUses: 50, weeklyLimit: 1,
    });

    const tx = setupTx(item);
    tx.playerBuff.create.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(994);
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
    expect(result.effect).toEqual({ type: 'buff', buffType: 'xp_boost', uses: 50, value: 0.1 });
  });
});

// ============================================================================
// purchaseItem — attribute_reset_scroll
// ============================================================================
describe('purchaseItem — attribute_reset_scroll', () => {
  it('refunds all attribute points', async () => {
    const item = makeItem({ key: 'attribute_reset_scroll', cost: 8, category: 'reset' });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({
      attributes: { vitality: 5, strength: 10, dexterity: 3, intelligence: 0, luck: 2, evasion: 0 },
      attributePoints: 0,
    });
    tx.player.update.mockResolvedValue({});

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

  it('throws when player not found', async () => {
    const item = makeItem({ key: 'attribute_reset_scroll', cost: 8 });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue(null);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Player not found');
  });

  it('handles zero-point attributes (no-op refund)', async () => {
    const item = makeItem({ key: 'attribute_reset_scroll', cost: 8 });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({
      attributes: { strength: 0, dexterity: 0 },
      attributePoints: 5,
    });
    tx.player.update.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);
    expect(result.effect).toEqual({ type: 'attribute_reset', refundedPoints: 0 });
  });
});

// ============================================================================
// purchaseItem — talent_reset_scroll
// ============================================================================
describe('purchaseItem — talent_reset_scroll', () => {
  it('resets skill point allocations to empty object', async () => {
    const item = makeItem({ key: 'talent_reset_scroll', cost: 10, category: 'reset' });

    const tx = setupTx(item);
    tx.skillPointAllocation.upsert.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'talent_reset' });
    expect(tx.skillPointAllocation.upsert).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      update: { allocations: {} },
      create: { playerId: PLAYER_ID, allocations: {} },
    });
  });
});

// ============================================================================
// purchaseItem — efficiency_reset_scroll
// ============================================================================
describe('purchaseItem — efficiency_reset_scroll', () => {
  it('resets dailyXpGained to 0 on all skills', async () => {
    const item = makeItem({ key: 'efficiency_reset_scroll', cost: 3, category: 'reset' });

    const tx = setupTx(item);
    tx.playerSkill.updateMany.mockResolvedValue({ count: 5 });

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'efficiency_reset' });
    expect(tx.playerSkill.updateMany).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { dailyXpGained: 0 },
    });
  });
});

// ============================================================================
// purchaseItem — teleport_scroll
// ============================================================================
describe('purchaseItem — teleport_scroll', () => {
  it('teleports player to target zone', async () => {
    const item = makeItem({ key: 'teleport_scroll', cost: 6, category: 'utility' });
    const targetZoneId = 'zone-42';

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);
    tx.zone.findUnique.mockResolvedValue({ id: targetZoneId, name: 'Darkwood Forest' });
    tx.playerZoneDiscovery.findFirst.mockResolvedValue({ id: 'd1' });
    tx.player.update.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetZoneId });

    expect(result.effect).toEqual({ type: 'teleport', zoneId: targetZoneId, zoneName: 'Darkwood Forest' });
    expect(tx.player.update).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      data: { currentZoneId: targetZoneId, lastTravelledFromZoneId: 'zone-1' },
    });
  });

  it('throws when targetZoneId is missing', async () => {
    const item = makeItem({ key: 'teleport_scroll', cost: 6 });
    const tx = setupTx(item);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Target zone required');
  });

  it('throws when zone not found', async () => {
    const item = makeItem({ key: 'teleport_scroll', cost: 6 });
    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);
    tx.zone.findUnique.mockResolvedValue(null);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetZoneId: 'bad' })).rejects.toThrow('Zone not found');
  });

  it('throws when zone not discovered', async () => {
    const item = makeItem({ key: 'teleport_scroll', cost: 6 });
    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);
    tx.zone.findUnique.mockResolvedValue({ id: 'zone-42', name: 'Secret Place' });
    tx.playerZoneDiscovery.findFirst.mockResolvedValue(null);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetZoneId: 'zone-42' })).rejects.toThrow('Zone not discovered');
  });

  it('throws when player is over-encumbered', async () => {
    const item = makeItem({ key: 'teleport_scroll', cost: 6 });
    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);

    vi.mocked(assertNotOverEncumbered).mockRejectedValueOnce(
      new AppError(400, 'Over-encumbered! Drop, sell, stash, or salvage items to make space.', 'OVER_ENCUMBERED'),
    );

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetZoneId: 'zone-42' })).rejects.toThrow('Over-encumbered');
  });
});

// ============================================================================
// purchaseItem — hearthstone
// ============================================================================
describe('purchaseItem — hearthstone', () => {
  it('teleports player to home town', async () => {
    const item = makeItem({ key: 'hearthstone', cost: 4, category: 'utility' });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, homeTownId: 'town-1', currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);
    tx.player.update.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'hearthstone', zoneId: 'town-1' });
    expect(tx.player.update).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      data: { currentZoneId: 'town-1', lastTravelledFromZoneId: 'zone-1' },
    });
  });

  it('throws when player has no home town', async () => {
    const item = makeItem({ key: 'hearthstone', cost: 4 });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, homeTownId: null, currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('No home town set');
  });

  it('throws when player not found', async () => {
    const item = makeItem({ key: 'hearthstone', cost: 4 });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue(null);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Player not found');
  });

  it('throws when player is over-encumbered', async () => {
    const item = makeItem({ key: 'hearthstone', cost: 4 });

    const tx = setupTx(item);
    tx.player.findUnique.mockResolvedValue({ isRecovering: false, currentHp: 100, homeTownId: 'town-1', currentZoneId: 'zone-1' });
    tx.guildExpeditionMember.findFirst.mockResolvedValue(null);

    vi.mocked(assertNotOverEncumbered).mockRejectedValueOnce(
      new AppError(400, 'Over-encumbered! Drop, sell, stash, or salvage items to make space.', 'OVER_ENCUMBERED'),
    );

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Over-encumbered');
  });
});

// ============================================================================
// purchaseItem — bestiary_tome
// ============================================================================
describe('purchaseItem — bestiary_tome', () => {
  const allPrefixes = getAllMobPrefixes();

  it('creates bestiary entry and all prefix entries for new mob', async () => {
    const item = makeItem({ key: 'bestiary_tome', cost: 20, category: 'utility' });
    const mobId = 'mob-wolf';

    const tx = setupTx(item);
    tx.mobTemplate.findUnique.mockResolvedValue({ id: mobId, name: 'Wolf' });
    tx.playerBestiary.findUnique.mockResolvedValue(null);
    tx.playerBestiary.create.mockResolvedValue({});
    tx.playerBestiaryPrefix.findUnique.mockResolvedValue(null);
    tx.playerBestiaryPrefix.create.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetMobTemplateId: mobId });

    expect(result.effect).toEqual({ type: 'bestiary_tome', mobName: 'Wolf', prefixCount: allPrefixes.length });
    expect(tx.playerBestiary.create).toHaveBeenCalledWith({
      data: { playerId: PLAYER_ID, mobTemplateId: mobId, kills: 1 },
    });
    expect(tx.playerBestiaryPrefix.create).toHaveBeenCalledTimes(allPrefixes.length);
  });

  it('does not overwrite existing bestiary entry with sufficient kills', async () => {
    const item = makeItem({ key: 'bestiary_tome', cost: 20 });
    const mobId = 'mob-wolf';

    const tx = setupTx(item);
    tx.mobTemplate.findUnique.mockResolvedValue({ id: mobId, name: 'Wolf' });
    tx.playerBestiary.findUnique.mockResolvedValue({ kills: 50 });
    tx.playerBestiaryPrefix.findUnique.mockResolvedValue({ kills: 99 });

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetMobTemplateId: mobId });

    expect(tx.playerBestiary.create).not.toHaveBeenCalled();
    expect(tx.playerBestiary.update).not.toHaveBeenCalled();
    expect(tx.playerBestiaryPrefix.create).not.toHaveBeenCalled();
    expect(tx.playerBestiaryPrefix.update).not.toHaveBeenCalled();
  });

  it('updates existing bestiary entry when kills below threshold', async () => {
    const item = makeItem({ key: 'bestiary_tome', cost: 20 });
    const mobId = 'mob-wolf';

    const tx = setupTx(item);
    tx.mobTemplate.findUnique.mockResolvedValue({ id: mobId, name: 'Wolf' });
    tx.playerBestiary.findUnique.mockResolvedValue({ kills: 0 });
    tx.playerBestiary.update.mockResolvedValue({});
    // Prefix below threshold
    tx.playerBestiaryPrefix.findUnique.mockResolvedValue({ kills: 3 });
    tx.playerBestiaryPrefix.update.mockResolvedValue({});

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetMobTemplateId: mobId });

    expect(tx.playerBestiary.update).toHaveBeenCalledWith({
      where: { playerId_mobTemplateId: { playerId: PLAYER_ID, mobTemplateId: mobId } },
      data: { kills: 1 },
    });
    // Each prefix should be updated to 10
    expect(tx.playerBestiaryPrefix.update).toHaveBeenCalledTimes(allPrefixes.length);
  });

  it('throws when targetMobTemplateId is missing', async () => {
    const item = makeItem({ key: 'bestiary_tome', cost: 20 });
    const tx = setupTx(item);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Target mob template required');
  });

  it('throws when mob template not found', async () => {
    const item = makeItem({ key: 'bestiary_tome', cost: 20 });

    const tx = setupTx(item);
    tx.mobTemplate.findUnique.mockResolvedValue(null);

    await expect(
      purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetMobTemplateId: 'bad-id' }),
    ).rejects.toThrow('Mob template not found');
  });
});

// ============================================================================
// purchaseItem — recipe_scroll
// ============================================================================
describe('purchaseItem — recipe_scroll', () => {
  it('learns a random eligible recipe', async () => {
    const item = makeItem({ key: 'recipe_scroll', cost: 15, category: 'utility' });

    const tx = setupTx(item);
    tx.craftingRecipe.findMany.mockResolvedValue([
      { id: 'r1', skillType: 'weaponsmithing', requiredLevel: 1, resultTemplate: { name: 'Iron Sword' } },
      { id: 'r2', skillType: 'weaponsmithing', requiredLevel: 10, resultTemplate: { name: 'Steel Sword' } },
      { id: 'r3', skillType: 'mining', requiredLevel: 5, resultTemplate: { name: 'Gold Ring' } },
    ]);
    tx.playerRecipe.findMany.mockResolvedValue([{ recipeId: 'r1' }]);
    tx.playerSkill.findMany.mockResolvedValue([
      { skillType: 'weaponsmithing', level: 15 },
      { skillType: 'mining', level: 10 },
    ]);
    tx.playerRecipe.create.mockResolvedValue({});

    vi.mocked(randomIntInclusive).mockReturnValue(0);

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect.type).toBe('recipe_scroll');
    expect(tx.playerRecipe.create).toHaveBeenCalled();
  });

  it('throws when no eligible recipes exist', async () => {
    const item = makeItem({ key: 'recipe_scroll', cost: 15 });

    const tx = setupTx(item);
    tx.craftingRecipe.findMany.mockResolvedValue([
      { id: 'r1', skillType: 'weaponsmithing', requiredLevel: 1, resultTemplate: { name: 'Iron Sword' } },
    ]);
    tx.playerRecipe.findMany.mockResolvedValue([{ recipeId: 'r1' }]); // already knows it
    tx.playerSkill.findMany.mockResolvedValue([]);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('No eligible recipes to learn');
  });

  it('filters out recipes above player skill level', async () => {
    const item = makeItem({ key: 'recipe_scroll', cost: 15 });

    const tx = setupTx(item);
    tx.craftingRecipe.findMany.mockResolvedValue([
      { id: 'r1', skillType: 'weaponsmithing', requiredLevel: 50, resultTemplate: { name: 'Advanced Sword' } },
    ]);
    tx.playerRecipe.findMany.mockResolvedValue([]);
    tx.playerSkill.findMany.mockResolvedValue([{ skillType: 'weaponsmithing', level: 5 }]);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('No eligible recipes to learn');
  });

  it('treats missing skill as level 0 for eligibility', async () => {
    const item = makeItem({ key: 'recipe_scroll', cost: 15 });

    const tx = setupTx(item);
    tx.craftingRecipe.findMany.mockResolvedValue([
      { id: 'r1', skillType: 'alchemy', requiredLevel: 0, resultTemplate: { name: 'Basic Recipe' } },
    ]);
    tx.playerRecipe.findMany.mockResolvedValue([]);
    tx.playerSkill.findMany.mockResolvedValue([]); // no skills → all at 0
    tx.playerRecipe.create.mockResolvedValue({});

    vi.mocked(randomIntInclusive).mockReturnValue(0);

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);
    expect(result.effect).toEqual({ type: 'recipe_scroll', recipeName: 'Basic Recipe' });
  });

  it('only queries soulbound recipes', async () => {
    const item = makeItem({ key: 'recipe_scroll', cost: 15 });

    const tx = setupTx(item);
    tx.craftingRecipe.findMany.mockResolvedValue([
      { id: 'r1', skillType: 'weaponsmithing', requiredLevel: 1, resultTemplate: { name: 'Soul Blade' } },
    ]);
    tx.playerRecipe.findMany.mockResolvedValue([]);
    tx.playerSkill.findMany.mockResolvedValue([{ skillType: 'weaponsmithing', level: 10 }]);
    tx.playerRecipe.create.mockResolvedValue({});
    vi.mocked(randomIntInclusive).mockReturnValue(0);

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(tx.craftingRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { soulbound: true } }),
    );
  });

  it('picks from eligible recipes using randomIntInclusive', async () => {
    const item = makeItem({ key: 'recipe_scroll', cost: 15 });

    const tx = setupTx(item);
    tx.craftingRecipe.findMany.mockResolvedValue([
      { id: 'r1', skillType: 'mining', requiredLevel: 0, resultTemplate: { name: 'Recipe A' } },
      { id: 'r2', skillType: 'mining', requiredLevel: 0, resultTemplate: { name: 'Recipe B' } },
      { id: 'r3', skillType: 'mining', requiredLevel: 0, resultTemplate: { name: 'Recipe C' } },
    ]);
    tx.playerRecipe.findMany.mockResolvedValue([]);
    tx.playerSkill.findMany.mockResolvedValue([{ skillType: 'mining', level: 99 }]);
    tx.playerRecipe.create.mockResolvedValue({});

    // Pick the third recipe (index 2)
    vi.mocked(randomIntInclusive).mockReturnValue(2);

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);
    expect(result.effect).toEqual({ type: 'recipe_scroll', recipeName: 'Recipe C' });
    expect(vi.mocked(randomIntInclusive)).toHaveBeenCalledWith(0, 2);
  });
});

// ============================================================================
// purchaseItem — guild_contract_reroll
// ============================================================================
describe('purchaseItem — guild_contract_reroll', () => {
  const CONTRACT_ID = 'contract-1';
  const GUILD_ID = 'guild-1';

  it('rerolls a guild contract', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25, category: 'utility' });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: GUILD_ID,
      status: 'active',
      contractKey: 'kill_count',
      weekStartedAt: new Date(),
      expiresAt: new Date(),
    });
    // Only the current contract is active
    tx.guildContract.findMany.mockResolvedValue([{ contractKey: 'kill_count' }]);
    tx.guild.findUnique.mockResolvedValue({ level: 5 });
    tx.guildContract.delete.mockResolvedValue({});
    tx.guildContract.create.mockResolvedValue({});
    tx.guildLog.create.mockResolvedValue({});

    // randomIntInclusive picks the first available definition
    vi.mocked(randomIntInclusive).mockReturnValue(0);

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID });

    expect(result.effect.type).toBe('contract_reroll');
    expect(result.effect['oldKey']).toBe('kill_count');
    expect(tx.guildContract.delete).toHaveBeenCalledWith({ where: { id: CONTRACT_ID } });
    expect(tx.guildContract.create).toHaveBeenCalled();
    expect(tx.guildLog.create).toHaveBeenCalled();
  });

  it('throws when targetContractId is missing', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });
    const tx = setupTx(item);

    await expect(purchaseItem(PLAYER_ID, SHOP_ITEM_ID)).rejects.toThrow('Target contract required');
  });

  it('throws when player is not leader or officer', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue(null);

    await expect(
      purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID }),
    ).rejects.toThrow('Must be guild leader or officer');
  });

  it('throws when contract is not found', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'officer' });
    tx.guildContract.findUnique.mockResolvedValue(null);

    await expect(
      purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: 'bad' }),
    ).rejects.toThrow('Invalid contract');
  });

  it('throws when contract belongs to different guild', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: 'other-guild',
      status: 'active',
      contractKey: 'kill_count',
    });

    await expect(
      purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID }),
    ).rejects.toThrow('Invalid contract');
  });

  it('throws when contract is not active', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: GUILD_ID,
      status: 'completed',
      contractKey: 'kill_count',
    });

    await expect(
      purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID }),
    ).rejects.toThrow('Invalid contract');
  });

  it('throws when all contract definitions are already in use', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: GUILD_ID,
      status: 'active',
      contractKey: GUILD_CONTRACT_DEFINITIONS[0].key,
      weekStartedAt: new Date(),
      expiresAt: new Date(),
    });
    // All definitions in use
    tx.guildContract.findMany.mockResolvedValue(
      GUILD_CONTRACT_DEFINITIONS.map((d) => ({ contractKey: d.key })),
    );

    await expect(
      purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID }),
    ).rejects.toThrow('No alternative contracts available');
  });

  it('uses level bracket to determine target value', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: GUILD_ID,
      status: 'active',
      contractKey: 'kill_count',
      weekStartedAt: new Date('2026-01-01'),
      expiresAt: new Date('2026-01-08'),
    });
    tx.guildContract.findMany.mockResolvedValue([{ contractKey: 'kill_count' }]);
    // High level guild → 'high' bracket
    tx.guild.findUnique.mockResolvedValue({ level: 30 });
    tx.guildContract.delete.mockResolvedValue({});
    tx.guildContract.create.mockResolvedValue({});
    tx.guildLog.create.mockResolvedValue({});

    vi.mocked(randomIntInclusive)
      .mockReturnValueOnce(0) // pick first available contract def
      .mockReturnValueOnce(GUILD_CONTRACT_CONSTANTS.REWARD_GUILD_XP_MIN)
      .mockReturnValueOnce(GUILD_CONTRACT_CONSTANTS.REWARD_TREASURY_MIN);

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID });

    // The new contract should use 'high' bracket target
    const createCall = tx.guildContract.create.mock.calls[0][0];
    const firstAvailableDef = GUILD_CONTRACT_DEFINITIONS.find((d) => d.key !== 'kill_count')!;
    expect(createCall.data.targetValue).toBe(firstAvailableDef.targets.high);
  });

  it('preserves timing from original contract', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });
    const weekStartedAt = new Date('2026-03-01');
    const expiresAt = new Date('2026-03-08');

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: GUILD_ID,
      status: 'active',
      contractKey: 'kill_count',
      weekStartedAt,
      expiresAt,
    });
    tx.guildContract.findMany.mockResolvedValue([{ contractKey: 'kill_count' }]);
    tx.guild.findUnique.mockResolvedValue({ level: 1 });
    tx.guildContract.delete.mockResolvedValue({});
    tx.guildContract.create.mockResolvedValue({});
    tx.guildLog.create.mockResolvedValue({});

    vi.mocked(randomIntInclusive).mockReturnValue(0);

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID });

    const createCall = tx.guildContract.create.mock.calls[0][0];
    expect(createCall.data.weekStartedAt).toBe(weekStartedAt);
    expect(createCall.data.expiresAt).toBe(expiresAt);
  });

  it('logs the reroll with old and new key', async () => {
    const item = makeItem({ key: 'guild_contract_reroll', cost: 25 });

    const tx = setupTx(item);
    tx.guildMember.findFirst.mockResolvedValue({ guildId: GUILD_ID, role: 'leader' });
    tx.guildContract.findUnique.mockResolvedValue({
      id: CONTRACT_ID,
      guildId: GUILD_ID,
      status: 'active',
      contractKey: 'kill_count',
      weekStartedAt: new Date(),
      expiresAt: new Date(),
    });
    tx.guildContract.findMany.mockResolvedValue([{ contractKey: 'kill_count' }]);
    tx.guild.findUnique.mockResolvedValue({ level: 1 });
    tx.guildContract.delete.mockResolvedValue({});
    tx.guildContract.create.mockResolvedValue({});
    tx.guildLog.create.mockResolvedValue({});

    vi.mocked(randomIntInclusive).mockReturnValue(0);

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID, { targetContractId: CONTRACT_ID });

    const logCall = tx.guildLog.create.mock.calls[0][0];
    expect(logCall.data.eventType).toBe('contract_rerolled');
    expect(logCall.data.guildId).toBe(GUILD_ID);
    expect(logCall.data.metadata.playerId).toBe(PLAYER_ID);
    expect(logCall.data.metadata.oldKey).toBe('kill_count');
  });
});

// ============================================================================
// purchaseItem — prestige titles
// ============================================================================
describe('purchaseItem — prestige titles', () => {
  it('unlocks title_questmaster achievement', async () => {
    const item = makeItem({
      key: 'title_questmaster', cost: 500, category: 'prestige', lifetimeLimit: 1,
    });

    const tx = setupTx(item);
    tx.playerAchievement.upsert.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'prestige', achievementId: 'shop_title_questmaster' });
    expect(tx.playerAchievement.upsert).toHaveBeenCalledWith({
      where: { playerId_achievementId: { playerId: PLAYER_ID, achievementId: 'shop_title_questmaster' } },
      create: { playerId: PLAYER_ID, achievementId: 'shop_title_questmaster' },
      update: {},
    });
  });

  it('unlocks title_token_hoarder achievement', async () => {
    const item = makeItem({
      key: 'title_token_hoarder', cost: 1000, category: 'prestige', lifetimeLimit: 1,
    });

    const tx = setupTx(item, (t) => {
      t.playerQuestState.findUnique.mockResolvedValue({ questTokens: 2000 });
      t.playerQuestState.update.mockResolvedValue({ questTokens: 1000 });
    });
    tx.playerAchievement.upsert.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'prestige', achievementId: 'shop_title_token_hoarder' });
  });


});

// ============================================================================
// purchaseItem — unknown item key
// ============================================================================
describe('purchaseItem — unknown item key', () => {
  it('returns type unknown for unrecognised item key without buff', async () => {
    const item = makeItem({ key: 'some_future_item', category: 'misc' });

    const tx = setupTx(item);

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({ type: 'unknown' });
  });

  it('falls back to buff apply for unknown key with buffType+buffValue+buffUses', async () => {
    const item = makeItem({
      key: 'mysterious_boost',
      buffType: 'damage_boost',
      buffValue: 0.25,
      buffUses: 100,
    });

    const tx = setupTx(item);
    tx.playerBuff.create.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.effect).toEqual({
      type: 'buff',
      buffType: 'damage_boost',
      uses: 100,
      value: 0.25,
    });
  });
});

// ============================================================================
// purchaseItem — token deduction and purchase recording
// ============================================================================
describe('purchaseItem — token deduction and purchase recording', () => {
  it('always records purchase in playerShopPurchase', async () => {
    const item = makeItem({ key: 'efficiency_reset_scroll', cost: 3, category: 'reset' });

    const tx = setupTx(item);
    tx.playerSkill.updateMany.mockResolvedValue({ count: 0 });

    await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(tx.playerShopPurchase.create).toHaveBeenCalledWith({
      data: { playerId: PLAYER_ID, shopItemId: SHOP_ITEM_ID },
    });
  });

  it('returns correct newBalance after deduction', async () => {
    const item = makeItem({ key: 'talent_reset_scroll', cost: 42, category: 'reset' });

    const tx = setupTx(item);
    tx.playerQuestState.update.mockResolvedValue({ questTokens: 57 });
    tx.skillPointAllocation.upsert.mockResolvedValue({});

    const result = await purchaseItem(PLAYER_ID, SHOP_ITEM_ID);

    expect(result.newBalance).toBe(57);
    expect(result.itemKey).toBe('talent_reset_scroll');
  });
});
