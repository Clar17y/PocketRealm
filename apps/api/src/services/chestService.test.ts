import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./inventoryService', () => ({
  addStackableItemTx: vi.fn().mockResolvedValue({ itemId: 'stack-1', quantity: 1 }),
}));

import { mockPrisma } from '../__test__/setup';
import { grantEncounterSiteChestRewardsTx } from './chestService';
import { addStackableItemTx } from './inventoryService';
import { ENCOUNTER_SITE_CONSTANTS, ENCOUNTER_SITE_ROLE_CONSTANTS } from '@pocketrealm/shared';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: recipe roll fails (high random value)
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const baseParams = {
  playerId: 'p1',
  mobFamilyId: 'family-1',
  totalRooms: 1,
  autoResolvedBonusRooms: 0,
};

// Helper to set up a single stackable drop entry
function setupStackableDrop(templateId = 'ore-1') {
  mockPrisma.chestDropTable.findMany.mockResolvedValue([
    {
      itemTemplateId: templateId,
      dropChance: 10,
      minQuantity: 1,
      maxQuantity: 1,
      itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
    },
  ]);
}

// Helper to set up a non-stackable equipment drop entry
function setupEquipmentDrop(templateId = 'sword-1', itemType = 'weapon') {
  mockPrisma.chestDropTable.findMany.mockResolvedValue([
    {
      itemTemplateId: templateId,
      dropChance: 10,
      minQuantity: 1,
      maxQuantity: 1,
      itemTemplate: { itemType, stackable: false, maxDurability: 100 },
    },
  ]);
}

describe('grantEncounterSiteChestRewardsTx', () => {
  // ── Basic flow ────────────────────────────────────────────────────────────

  describe('basic flow', () => {
    it('returns chest rewards with empty loot when no drop entries', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);
      expect(result.chestRarity).toBe('common'); // 1 room → common
      expect(result.materialRolls).toBeGreaterThanOrEqual(1);
      expect(result.loot).toEqual([]);
      expect(result.recipeUnlocked).toBeNull();
      expect(result.overflow).toEqual([]);
      expect(result.slotsConsumed).toBe(0);
    });

    it('queries chestDropTable with correct mobFamilyId and chestRarity', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);

      expect(mockPrisma.chestDropTable.findMany).toHaveBeenCalledWith({
        where: {
          mobFamilyId: 'family-1',
          zoneId: null,
          chestRarity: 'common',
        },
        include: {
          mobFamily: {
            select: { name: true },
          },
          zone: {
            select: { name: true },
          },
          itemTemplate: {
            select: {
              name: true,
              itemType: true,
              stackable: true,
              maxDurability: true,
            },
          },
        },
      });
    });

    it('prefers zone-specific chest rows when a matching zone table exists', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValueOnce([
        {
          itemTemplateId: 'zone-cloth',
          dropChance: 10,
          minQuantity: 1,
          maxQuantity: 1,
          zoneId: 'deep-forest-zone',
          mobFamily: { name: 'Bandits' },
          zone: { name: 'Deep Forest' },
          itemTemplate: { name: 'Bandit Cloth', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        zoneId: 'deep-forest-zone',
      });

      expect(result.loot.some((drop) => drop.itemTemplateId === 'zone-cloth')).toBe(true);
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            mobFamilyId: 'family-1',
            chestRarity: 'common',
            zoneId: 'deep-forest-zone',
          },
        }),
      );
    });

    it('falls back to family-wide chest rows when a zone has no specific table', async () => {
      mockPrisma.chestDropTable.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            itemTemplateId: 'fallback-cloth',
            dropChance: 10,
            minQuantity: 1,
            maxQuantity: 1,
            zoneId: null,
            mobFamily: { name: 'Bandits' },
            itemTemplate: { name: 'Bandit Cloth', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
        ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        zoneId: 'unconfigured-zone',
      });

      expect(result.loot.some((drop) => drop.itemTemplateId === 'fallback-cloth')).toBe(true);
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            mobFamilyId: 'family-1',
            chestRarity: 'common',
            zoneId: 'unconfigured-zone',
          },
        }),
      );
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            mobFamilyId: 'family-1',
            chestRarity: 'common',
            zoneId: null,
          },
        }),
      );
    });

    it('returns loot from drop table entries', async () => {
      // random=0.999: rollChestMaterialRollsByRoomCount(1) → Math.floor(0.999 * 2) + 1 = 2 rolls
      // Both rolls pick the single drop entry (ore-1) → aggregated into 1 loot entry
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      setupStackableDrop();
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);
      expect(result.loot.length).toBe(1);
      expect(result.loot[0].itemTemplateId).toBe('ore-1');
      expect(result.loot[0].rarity).toBe('common');
    });
  });

  // ── Family signature rewards ─────────────────────────────────────────────

  describe('family signature rewards', () => {
    it('guarantees a family signature material when current rarity only has ambient resources', async () => {
      mockPrisma.chestDropTable.findMany
        .mockResolvedValueOnce([
          {
            itemTemplateId: 'copper-ore',
            dropChance: 80,
            minQuantity: 1,
            maxQuantity: 2,
            itemTemplate: { name: 'Copper Ore', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
          {
            itemTemplateId: 'oak-log',
            dropChance: 80,
            minQuantity: 1,
            maxQuantity: 2,
            itemTemplate: { name: 'Oak Log', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
          {
            itemTemplateId: 'minor-health-potion',
            dropChance: 30,
            minQuantity: 1,
            maxQuantity: 1,
            itemTemplate: { name: 'Minor Health Potion', itemType: 'consumable', stackable: true, maxDurability: 0 },
          },
        ])
        .mockResolvedValueOnce([
          {
            chestRarity: 'uncommon',
            itemTemplateId: 'spider-silk',
            dropChance: 75,
            minQuantity: 4,
            maxQuantity: 8,
            itemTemplate: { name: 'Spider Silk', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
          {
            chestRarity: 'rare',
            itemTemplateId: 'spider-silk',
            dropChance: 85,
            minQuantity: 6,
            maxQuantity: 12,
            itemTemplate: { name: 'Spider Silk', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
        ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);

      expect(result.loot.some((drop) => drop.itemTemplateId === 'spider-silk')).toBe(true);
      expect(result.loot.some((drop) => drop.itemTemplateId === 'copper-ore' || drop.itemTemplateId === 'oak-log')).toBe(false);
      expect(result.loot.some((drop) => drop.itemTemplateId === 'minor-health-potion')).toBe(false);
      expect(addStackableItemTx).toHaveBeenCalledWith(expect.anything(), 'p1', 'spider-silk', 8);
      expect(addStackableItemTx).not.toHaveBeenCalledWith(expect.anything(), 'p1', 'copper-ore', expect.any(Number));
      expect(addStackableItemTx).not.toHaveBeenCalledWith(expect.anything(), 'p1', 'oak-log', expect.any(Number));
      expect(addStackableItemTx).not.toHaveBeenCalledWith(expect.anything(), 'p1', 'minor-health-potion', expect.any(Number));
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mobFamilyId: 'family-1',
            zoneId: null,
            chestRarity: { in: ['uncommon', 'rare', 'epic', 'legendary'] },
          }),
        })
      );
    });

    it('guarantees the preferred current-rarity signature material even when other family drops have higher weight', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.03);
      mockPrisma.chestDropTable.findMany.mockResolvedValueOnce([
        {
          itemTemplateId: 'copper-ore',
          dropChance: 80,
          minQuantity: 1,
          maxQuantity: 2,
          mobFamily: { name: 'Boars' },
          itemTemplate: { name: 'Copper Ore', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'oak-log',
          dropChance: 80,
          minQuantity: 1,
          maxQuantity: 2,
          mobFamily: { name: 'Boars' },
          itemTemplate: { name: 'Oak Log', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'boar-tusk',
          dropChance: 70,
          minQuantity: 2,
          maxQuantity: 4,
          mobFamily: { name: 'Boars' },
          itemTemplate: { name: 'Boar Tusk', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'boar-hide',
          dropChance: 60,
          minQuantity: 2,
          maxQuantity: 4,
          mobFamily: { name: 'Boars' },
          itemTemplate: { name: 'Boar Hide', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });

      expect(result.loot.some((drop) => drop.itemTemplateId === 'boar-hide')).toBe(true);
      expect(addStackableItemTx).toHaveBeenNthCalledWith(1, expect.anything(), 'p1', 'boar-hide', expect.any(Number));
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenCalledTimes(1);
    });

    it('keeps logs for treants but filters non-thematic ore', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.03);
      mockPrisma.chestDropTable.findMany.mockResolvedValueOnce([
        {
          itemTemplateId: 'tin-ore',
          dropChance: 80,
          minQuantity: 1,
          maxQuantity: 2,
          mobFamily: { name: 'Treants' },
          itemTemplate: { name: 'Tin Ore', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'maple-log',
          dropChance: 80,
          minQuantity: 1,
          maxQuantity: 2,
          mobFamily: { name: 'Treants' },
          itemTemplate: { name: 'Maple Log', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'ancient-bark',
          dropChance: 70,
          minQuantity: 2,
          maxQuantity: 4,
          mobFamily: { name: 'Treants' },
          itemTemplate: { name: 'Ancient Bark', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });

      expect(result.loot.some((drop) => drop.itemTemplateId === 'maple-log')).toBe(true);
      expect(result.loot.some((drop) => drop.itemTemplateId === 'tin-ore')).toBe(false);
    });

    it('keeps ore for mining-themed families', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4);
      mockPrisma.chestDropTable.findMany.mockResolvedValueOnce([
        {
          itemTemplateId: 'iron-ore',
          dropChance: 80,
          minQuantity: 1,
          maxQuantity: 2,
          mobFamily: { name: 'Golems' },
          itemTemplate: { name: 'Iron Ore', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'glowcap',
          dropChance: 80,
          minQuantity: 1,
          maxQuantity: 2,
          mobFamily: { name: 'Golems' },
          itemTemplate: { name: 'Glowcap Mushroom', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'crystal-shard',
          dropChance: 70,
          minQuantity: 2,
          maxQuantity: 4,
          mobFamily: { name: 'Golems' },
          itemTemplate: { name: 'Crystal Shard', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });

      expect(result.loot.some((drop) => drop.itemTemplateId === 'iron-ore')).toBe(true);
      expect(result.loot.some((drop) => drop.itemTemplateId === 'glowcap')).toBe(false);
    });
  });

  // ── Chest rarity per room count ───────────────────────────────────────────

  describe('chest rarity based on room count', () => {
    it('returns common rarity for 1-room encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 1,
      });
      expect(result.chestRarity).toBe('common');
    });

    it('returns uncommon rarity for 2-room encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });
      expect(result.chestRarity).toBe('uncommon');
    });

    it('returns rare rarity for 3-room encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });
      expect(result.chestRarity).toBe('rare');
    });
  });

  // ── Auto-resolve bonus ────────────────────────────────────────────────────

  describe('auto-resolve bonus', () => {
    it('applies DROP_MULTIPLIER proportionally when all rooms auto-resolved', async () => {
      // Use a deterministic random that gives a known material roll
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      // With totalRooms=3 and autoResolvedBonusRooms=3 (full bonus, bonusFraction=1):
      // baseRolls = rollChestMaterialRollsByRoomCount(3) with random=0.999 → max(3-6 range) = 6
      // materialRolls = Math.ceil(6 * (1 + 1 * (1.5-1))) = Math.ceil(6 * 1.5) = 9
      const withFullBonus = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        autoResolvedBonusRooms: 3,
      });

      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      const withNoBonus = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        autoResolvedBonusRooms: 0,
      });

      expect(withFullBonus.materialRolls).toBe(
        Math.ceil(withNoBonus.materialRolls * ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER)
      );
    });

    it('applies partial multiplier when some rooms auto-resolved', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      // totalRooms=2, autoResolvedBonusRooms=1 → bonusFraction=0.5
      // baseRolls with random=0.999 for 2 rooms: Math.floor(0.999 * 3) + 2 = 4
      // materialRolls = Math.ceil(4 * (1 + 0.5 * 0.5)) = Math.ceil(4 * 1.25) = 5
      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
        autoResolvedBonusRooms: 1,
      });

      expect(result.materialRolls).toBeGreaterThan(4); // More than base
    });

    it('does not apply bonus when autoResolvedBonusRooms is 0', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 1,
        autoResolvedBonusRooms: 0,
      });

      // No bonus: materialRolls = baseRolls
      expect(result.materialRolls).toBeGreaterThanOrEqual(1);
      expect(result.materialRolls).toBeLessThanOrEqual(2);
    });

    it('adds material rolls for defeated promoted roles', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        autoResolvedBonusRooms: 0,
        defeatedPromotedRoleCounts: { elite: 1, mini_boss: 1 },
      });

      const expectedMultiplier = 1
        + ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.elite.materialRollMultiplier
        + ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.mini_boss.materialRollMultiplier;
      expect(result.materialRolls).toBe(Math.ceil(6 * expectedMultiplier));
    });

    it('does not spend promoted-role material bonus rolls on consumables', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([
        {
          itemTemplateId: 'copper-ore',
          dropChance: 1,
          minQuantity: 1,
          maxQuantity: 1,
          mobFamily: { name: 'Golems' },
          itemTemplate: { name: 'Copper Ore', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'minor-health-potion',
          dropChance: 100,
          minQuantity: 1,
          maxQuantity: 1,
          mobFamily: { name: 'Golems' },
          itemTemplate: { name: 'Minor Health Potion', itemType: 'consumable', stackable: true, maxDurability: 0 },
        },
      ]);

      const withoutPromotedRoles = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });
      const withPromotedRoles = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        defeatedPromotedRoleCounts: { elite: 1, mini_boss: 1 },
      });

      const quantity = (loot: typeof withPromotedRoles.loot, templateId: string) =>
        loot.find((drop) => drop.itemTemplateId === templateId)?.quantity ?? 0;

      expect(quantity(withPromotedRoles.loot, 'minor-health-potion'))
        .toBe(quantity(withoutPromotedRoles.loot, 'minor-health-potion'));
      expect(quantity(withPromotedRoles.loot, 'copper-ore'))
        .toBeGreaterThan(quantity(withoutPromotedRoles.loot, 'copper-ore'));
    });

    it('adds extra signature resource rolls for defeated promoted roles', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([
        {
          itemTemplateId: 'spider-silk',
          dropChance: 1,
          minQuantity: 1,
          maxQuantity: 1,
          mobFamily: { name: 'Spiders' },
          itemTemplate: { name: 'Spider Silk', itemType: 'resource', stackable: true, maxDurability: 0 },
        },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        defeatedPromotedRoleCounts: { elite: 1, mini_boss: 1 },
      });

      const expectedSignatureRolls = 1
        + ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.elite.signatureRolls
        + ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.mini_boss.signatureRolls;
      expect(result.loot).toContainEqual({
        itemTemplateId: 'spider-silk',
        quantity: expectedSignatureRolls + result.materialRolls,
        rarity: 'common',
      });
    });

    it('queries drop table with rarity matching totalRooms', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
        autoResolvedBonusRooms: 2,
      });

      // 2 rooms → uncommon rarity
      expect(mockPrisma.chestDropTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chestRarity: 'uncommon',
          }),
        })
      );
    });
  });

  // ── Recipe unlock ─────────────────────────────────────────────────────────

  describe('recipe unlock', () => {
    it('does not unlock recipe when random roll fails', async () => {
      // Recipe chance for 1 room is 0.004, so 0.999 won't trigger it.
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);
      expect(result.recipeUnlocked).toBeNull();
    });

    it('does not query advanced recipes when recipe roll fails', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3, // has non-zero recipe chance (0.04)
      });

      // random 0.999 > 0.04 (3-room recipe chance), so recipe roll fails.
      expect(mockPrisma.craftingRecipe.findMany).not.toHaveBeenCalled();
    });

    it('unlocks a recipe when random roll succeeds and unknown recipes exist', async () => {
      // For 3 rooms: recipe chance = 0.04, so random < 0.04 triggers recipe.
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: false,
          resultTemplate: { name: 'Iron Sword' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]); // no known recipes
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked).toEqual({
        recipeId: 'recipe-1',
        resultTemplateId: 'template-1',
        recipeName: 'Iron Sword',
        soulbound: false,
      });
    });

    it('creates playerRecipe entry when recipe is unlocked', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: false,
          resultTemplate: { name: 'Iron Sword' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(mockPrisma.playerRecipe.create).toHaveBeenCalledWith({
        data: {
          playerId: 'p1',
          recipeId: 'recipe-1',
        },
      });
    });

    it('skips recipe when all advanced recipes are already known', async () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0.01) // recipe roll succeeds
        .mockReturnValueOnce(0.999); // advanced item copy fails
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: false,
          resultTemplate: { name: 'Iron Sword' },
        },
      ]);
      // Player already knows recipe-1
      mockPrisma.playerRecipe.findMany.mockResolvedValue([{ recipeId: 'recipe-1' }]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked).toBeNull();
      expect(mockPrisma.playerRecipe.create).not.toHaveBeenCalled();
    });

    it('returns null recipe when no advanced recipes exist for the family', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]); // no advanced recipes

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked).toBeNull();
    });

    it('picks from unknown recipes only, skipping known ones', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: false,
          resultTemplate: { name: 'Iron Sword' },
        },
        {
          id: 'recipe-2',
          resultTemplateId: 'template-2',
          soulbound: true,
          resultTemplate: { name: 'Dragon Blade' },
        },
      ]);
      // Player knows recipe-1 but not recipe-2
      mockPrisma.playerRecipe.findMany.mockResolvedValue([{ recipeId: 'recipe-1' }]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      // Should unlock recipe-2 (the only unknown)
      expect(result.recipeUnlocked).toEqual({
        recipeId: 'recipe-2',
        resultTemplateId: 'template-2',
        recipeName: 'Dragon Blade',
        soulbound: true,
      });
    });

    it('queries advanced recipes for the correct mob family', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        mobFamilyId: 'wolves-family',
        totalRooms: 3,
      });

      expect(mockPrisma.craftingRecipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isAdvanced: true,
            mobFamilyId: 'wolves-family',
          },
          orderBy: [{ requiredLevel: 'asc' }, { id: 'asc' }],
        })
      );
    });

    it('applies AUTO_RESOLVE_RECIPE_MULTIPLIER proportionally', async () => {
      // 3-room base recipe chance is 0.04
      // With full auto-resolve (bonusFraction=1): 0.04 * 1.5 = 0.06
      // So a recipe roll of 0.05 succeeds with full bonus but fails without.
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0.05) // recipe unlock fails without bonus
        .mockReturnValueOnce(0.999); // advanced item copy also fails
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      // Without auto-resolve bonus, 0.05 > 0.04, so no recipe.
      const resultWithout = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        autoResolvedBonusRooms: 0,
      });
      expect(resultWithout.recipeUnlocked).toBeNull();

      // With full auto-resolve bonus, 0.05 < 0.06, so recipe roll passes.
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0.05); // recipe unlock succeeds with bonus
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: false,
          resultTemplate: { name: 'Enchanted Blade' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const resultWith = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        autoResolvedBonusRooms: 3,
      });
      expect(resultWith.recipeUnlocked).not.toBeNull();
    });

    it('converts soulbound to boolean in recipe result', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: 0, // falsy but not boolean
          resultTemplate: { name: 'Basic Sword' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      // Boolean(0) === false
      expect(result.recipeUnlocked!.soulbound).toBe(false);
    });

    it('returns soulbound true when recipe is soulbound', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: true,
          resultTemplate: { name: 'Soulbound Artifact' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked!.soulbound).toBe(true);
    });

    it('skips recipe unlock for 1-room encounters when roll exceeds chance', async () => {
      // 1-room recipe chance is 0.004, so random = 0.01 won't trigger.
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 1,
      });

      expect(result.recipeUnlocked).toBeNull();
      expect(mockPrisma.craftingRecipe.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Material rolls (count) ────────────────────────────────────────────────

  describe('material rolls', () => {
    it('produces material rolls within range for 1-room chest', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 1,
      });

      // CHEST_MATERIAL_ROLLS_SMALL: { min: 1, max: 2 }
      expect(result.materialRolls).toBeGreaterThanOrEqual(1);
      expect(result.materialRolls).toBeLessThanOrEqual(2);
    });

    it('produces material rolls within range for 2-room chest', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });

      // CHEST_MATERIAL_ROLLS_MEDIUM: { min: 2, max: 4 }
      expect(result.materialRolls).toBeGreaterThanOrEqual(2);
      expect(result.materialRolls).toBeLessThanOrEqual(4);
    });

    it('produces material rolls within range for 3-room chest', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      // CHEST_MATERIAL_ROLLS_LARGE: { min: 3, max: 6 }
      expect(result.materialRolls).toBeGreaterThanOrEqual(3);
      expect(result.materialRolls).toBeLessThanOrEqual(6);
    });

    it('applies auto-resolve DROP multiplier with ceiling', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 1,
        autoResolvedBonusRooms: 1,
      });

      // With random 0.999, rollChestMaterialRollsByRoomCount for 1 room gives max (2)
      // Then multiplied by 1.5 and ceiled: Math.ceil(2 * 1.5) = 3
      expect(result.materialRolls).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Loot accumulation ─────────────────────────────────────────────────────

  describe('loot accumulation', () => {
    it('grants stackable materials via addStackableItemTx', async () => {
      // random=0.5: rollChestMaterialRollsByRoomCount(1) → Math.floor(0.5 * 2) + 1 = 2 rolls
      // Each roll picks the single drop entry and calls addStackableItemTx with qty=1
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      setupStackableDrop('ore-1');
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);

      expect(addStackableItemTx).toHaveBeenCalledTimes(2);
      expect(addStackableItemTx).toHaveBeenCalledWith(expect.anything(), 'p1', 'ore-1', 1);
    });

    it('aggregates loot for same template into one entry', async () => {
      // Use a random that will reliably pick the drop
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([
        {
          itemTemplateId: 'ore-1',
          dropChance: 10,
          minQuantity: 1,
          maxQuantity: 1,
          itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
        },
      ]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3, // more rolls → more chances for aggregation
      });

      const oreEntries = result.loot.filter(l => l.itemTemplateId === 'ore-1');
      // All loot of same template should be aggregated into max 1 entry
      expect(oreEntries.length).toBeLessThanOrEqual(1);
    });

    it('produces loot with common rarity from dropRollingService', async () => {
      // random=0.5: 2 rolls on 1-room chest, single entry always picked → 1 loot entry guaranteed
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      setupStackableDrop();
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);

      expect(result.loot.length).toBe(1);
      expect(result.loot[0].rarity).toBe('common');
    });
  });

  // ── Available slots / overflow ────────────────────────────────────────────

  describe('available slots and overflow', () => {
    it('subtracts guaranteed signature slots before rolling thematic ambient rewards', async () => {
      mockPrisma.chestDropTable.findMany
        .mockResolvedValueOnce([
          {
            itemTemplateId: 'maple-log',
            dropChance: 80,
            minQuantity: 1,
            maxQuantity: 1,
            mobFamily: { name: 'Treants' },
            itemTemplate: { name: 'Maple Log', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
        ])
        .mockResolvedValueOnce([
          {
            chestRarity: 'uncommon',
            itemTemplateId: 'ancient-bark',
            dropChance: 75,
            minQuantity: 1,
            maxQuantity: 1,
            itemTemplate: { name: 'Ancient Bark', itemType: 'resource', stackable: true, maxDurability: 0 },
          },
        ]);
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'maple-log', name: 'Maple Log' },
        { id: 'ancient-bark', name: 'Ancient Bark' },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        availableSlots: 1,
      });

      expect(result.slotsConsumed).toBe(1);
      expect(result.loot.some((drop) => drop.itemTemplateId === 'ancient-bark')).toBe(true);
      expect(result.overflow.some((item) => item.templateId === 'maple-log')).toBe(true);
    });

    it('passes availableSlots through to rollAndGrantDropsTx', async () => {
      // random=0.5: 2 rolls on 1-room chest, single stackable entry
      // Roll 1: new slot needed → slotsConsumed++ (total 1)
      // Roll 2: template already granted → merges, no new slot
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      setupStackableDrop();
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'ore-1', name: 'Iron Ore' },
      ]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        availableSlots: 10,
      });

      expect(result.slotsConsumed).toBe(1);
    });

    it('produces overflow when available slots is 0', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      setupStackableDrop();
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'ore-1', name: 'Iron Ore' },
      ]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        availableSlots: 0,
      });

      // All items should overflow since no slots available
      expect(result.slotsConsumed).toBe(0);
      if (result.overflow.length > 0) {
        expect(result.overflow[0].templateId).toBe('ore-1');
        expect(result.overflow[0].templateName).toBe('Iron Ore');
      }
    });

    it('does not track slots when availableSlots is not provided', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      setupStackableDrop();
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, baseParams);

      // Without availableSlots, slotsConsumed should be 0
      expect(result.slotsConsumed).toBe(0);
      // And item.findMany should not be called (no slot tracking)
      expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
    });

    it('returns overflow items with correct shape', async () => {
      // random=0.5: 2 rolls on 1-room chest, non-stackable equipment, 0 slots available
      // Both rolls overflow → 2 overflow entries with correct shape
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      setupEquipmentDrop('sword-1', 'weapon');
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'sword-1', name: 'Iron Sword' },
      ]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        availableSlots: 0,
      });

      expect(result.overflow.length).toBe(2);
      const item = result.overflow[0];
      expect(item).toHaveProperty('templateId', 'sword-1');
      expect(item).toHaveProperty('templateName', 'Iron Sword');
      expect(item).toHaveProperty('rarity', 'common');
      expect(item).toHaveProperty('quantity', 1);
    });
  });

  // ── Recipe chance for 2-room encounters ───────────────────────────────────

  describe('recipe unlock for 2-room encounters', () => {
    it('triggers recipe unlock for 2-room encounters when roll succeeds', async () => {
      // 2-room recipe chance is 0.015.
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-m1',
          resultTemplateId: 'template-m1',
          soulbound: false,
          resultTemplate: { name: 'Steel Helmet' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });

      expect(result.recipeUnlocked).not.toBeNull();
      expect(result.recipeUnlocked!.recipeName).toBe('Steel Helmet');
    });
  });

  // ── Advanced item drops ─────────────────────────────────────────────────

  describe('advanced item drops', () => {
    it('can grant an advanced family item while leaving the recipe locked', async () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0.999) // recipe unlock fails
        .mockReturnValueOnce(0) // advanced item drop succeeds
        .mockReturnValueOnce(0); // picks the only advanced recipe result
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-crown',
          resultTemplateId: 'goblin-crown',
          soulbound: true,
          resultTemplate: {
            name: "Goblin King's Crown",
            itemType: 'armor',
            stackable: false,
            maxDurability: 120,
          },
        },
      ]);
      mockPrisma.item.create.mockResolvedValue({ id: 'crown-item-1' });

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked).toBeNull();
      expect(result.loot).toContainEqual({
        itemTemplateId: 'goblin-crown',
        quantity: 1,
        rarity: 'common',
      });
      expect(mockPrisma.playerRecipe.create).not.toHaveBeenCalled();
      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'p1',
          templateId: 'goblin-crown',
          rarity: 'common',
          quantity: 1,
          maxDurability: 120,
          currentDurability: 120,
        },
        select: { id: true },
      });
    });

    it('does not grant an advanced item copy when an unknown recipe unlocks', async () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0) // recipe unlock succeeds
        .mockReturnValueOnce(0); // would grant an advanced item copy if evaluated
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-new-crown',
          resultTemplateId: 'new-goblin-crown',
          soulbound: true,
          resultTemplate: {
            name: "Goblin King's Crown",
            itemType: 'armor',
            stackable: false,
            maxDurability: 120,
          },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked).toEqual({
        recipeId: 'recipe-new-crown',
        resultTemplateId: 'new-goblin-crown',
        recipeName: "Goblin King's Crown",
        soulbound: true,
      });
      expect(mockPrisma.playerRecipe.create).toHaveBeenCalledWith({
        data: {
          playerId: 'p1',
          recipeId: 'recipe-new-crown',
        },
      });
      expect(mockPrisma.item.create).not.toHaveBeenCalled();
      expect(result.loot).not.toContainEqual(
        expect.objectContaining({ itemTemplateId: 'new-goblin-crown' }),
      );
    });

    it('can grant an advanced family item when the recipe roll finds only known recipes', async () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0) // recipe roll succeeds
        .mockReturnValueOnce(0) // advanced item drop succeeds because no recipe unlock happened
        .mockReturnValueOnce(0); // picks the only advanced recipe result
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-known-crown',
          resultTemplateId: 'known-goblin-crown',
          soulbound: true,
          resultTemplate: {
            name: "Goblin King's Crown",
            itemType: 'armor',
            stackable: false,
            maxDurability: 120,
          },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([{ recipeId: 'recipe-known-crown' }]);
      mockPrisma.item.create.mockResolvedValue({ id: 'known-crown-item-1' });

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(result.recipeUnlocked).toBeNull();
      expect(result.loot).toContainEqual({
        itemTemplateId: 'known-goblin-crown',
        quantity: 1,
        rarity: 'common',
      });
      expect(mockPrisma.playerRecipe.create).not.toHaveBeenCalled();
      expect(mockPrisma.item.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: 'p1',
            templateId: 'known-goblin-crown',
          }),
        }),
      );
    });

    it('overflows an advanced family item when no backpack slots remain', async () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.999) // material roll count
        .mockReturnValueOnce(0.999) // recipe unlock fails
        .mockReturnValueOnce(0) // advanced item drop succeeds
        .mockReturnValueOnce(0); // picks the only advanced recipe result
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.itemTemplate.findMany.mockResolvedValue([
        { id: 'overflow-goblin-crown', name: "Goblin King's Crown" },
      ]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-overflow-crown',
          resultTemplateId: 'overflow-goblin-crown',
          soulbound: true,
          resultTemplate: {
            name: "Goblin King's Crown",
            itemType: 'armor',
            stackable: false,
            maxDurability: 120,
          },
        },
      ]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        availableSlots: 0,
      });

      expect(result.recipeUnlocked).toBeNull();
      expect(result.loot).toContainEqual({
        itemTemplateId: 'overflow-goblin-crown',
        quantity: 1,
        rarity: 'common',
      });
      expect(result.overflow).toContainEqual({
        templateId: 'overflow-goblin-crown',
        templateName: "Goblin King's Crown",
        rarity: 'common',
        quantity: 1,
        bonusStats: null,
        currentDurability: 120,
        maxDurability: 120,
      });
      expect(result.slotsConsumed).toBe(0);
      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });
  });

  // ── Auto-resolve + recipe combined ───────────────────────────────────────

  describe('auto-resolve bonus with recipe', () => {
    it('uses totalRooms for rarity and auto-resolve bonus for recipe chance', async () => {
      // 1 room → common rarity
      // With full auto-resolve bonus (bonusFraction=1): recipe chance = 0.004 * 1.5 = 0.006.
      vi.spyOn(Math, 'random').mockReturnValue(0.005);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-fc1',
          resultTemplateId: 'template-fc1',
          soulbound: false,
          resultTemplate: { name: 'Auto Resolve Reward' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 1,
        autoResolvedBonusRooms: 1,
      });

      // 1 room → common
      expect(result.chestRarity).toBe('common');
      // 0.005 < 0.006 → recipe unlocks.
      expect(result.recipeUnlocked).not.toBeNull();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty drop table with large materialRolls gracefully', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
        autoResolvedBonusRooms: 3,
      });

      // No drops possible from empty table, but function should not error
      expect(result.loot).toEqual([]);
      expect(result.overflow).toEqual([]);
    });

    it('handles multiple drop table entries (weighted selection)', async () => {
      // random=0.5: rollChestMaterialRollsByRoomCount(2) → Math.floor(0.5 * 3) + 2 = 3 rolls
      // pickWeighted: totalWeight=10, roll=0.5*10=5; after ore-1's weight (5): 5-5=0 ≤ 0 → ore-1 always picked
      // All 3 rolls pick ore-1, aggregated into 1 loot entry
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([
        {
          itemTemplateId: 'ore-1',
          dropChance: 5,
          minQuantity: 1,
          maxQuantity: 2,
          itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
        },
        {
          itemTemplateId: 'herb-1',
          dropChance: 5,
          minQuantity: 1,
          maxQuantity: 1,
          itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
        },
      ]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 2,
      });

      expect(result.loot.length).toBe(1);
      expect(result.loot[0].itemTemplateId).toBe('ore-1');
    });

    it('queries known recipes with correct player filter', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-1',
          resultTemplateId: 'template-1',
          soulbound: false,
          resultTemplate: { name: 'Test Recipe' },
        },
        {
          id: 'recipe-2',
          resultTemplateId: 'template-2',
          soulbound: false,
          resultTemplate: { name: 'Test Recipe 2' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        totalRooms: 3,
      });

      expect(mockPrisma.playerRecipe.findMany).toHaveBeenCalledWith({
        where: {
          playerId: 'p1',
          recipeId: { in: ['recipe-1', 'recipe-2'] },
        },
        select: { recipeId: true },
      });
    });
  });
});
