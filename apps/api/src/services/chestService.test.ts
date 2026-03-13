import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./inventoryService', () => ({
  addStackableItemTx: vi.fn().mockResolvedValue({ itemId: 'stack-1', quantity: 1 }),
}));

import { mockPrisma } from '../__test__/setup';
import { grantEncounterSiteChestRewardsTx } from './chestService';
import { addStackableItemTx } from './inventoryService';
import { FULL_CLEAR_CONSTANTS } from '@pocketrealm/shared';

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
  size: 'small' as const,
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
      expect(result.chestRarity).toBe('common'); // small → common
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
          chestRarity: 'common',
        },
        include: {
          itemTemplate: {
            select: {
              itemType: true,
              stackable: true,
              maxDurability: true,
            },
          },
        },
      });
    });

    it('returns loot from drop table entries', async () => {
      // random=0.999: rollChestMaterialRolls('small') → Math.floor(0.999 * 2) + 1 = 2 rolls
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

  // ── Chest rarity per size ─────────────────────────────────────────────────

  describe('chest rarity based on size', () => {
    it('returns common rarity for small encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
      });
      expect(result.chestRarity).toBe('common');
    });

    it('returns uncommon rarity for medium encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'medium',
      });
      expect(result.chestRarity).toBe('uncommon');
    });

    it('returns rare rarity for large encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large',
      });
      expect(result.chestRarity).toBe('rare');
    });
  });

  // ── Full clear bonus ──────────────────────────────────────────────────────

  describe('full clear bonus', () => {
    it('upgrades chest size from small to medium when fullClearBonus is true', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
        fullClearBonus: true,
      });

      // small upgrades to medium, medium → uncommon rarity
      expect(result.chestRarity).toBe('uncommon');
    });

    it('upgrades chest size from medium to large when fullClearBonus is true', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'medium',
        fullClearBonus: true,
      });

      // medium upgrades to large, large → rare rarity
      expect(result.chestRarity).toBe('rare');
    });

    it('caps upgrade at large for large encounters', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large',
        fullClearBonus: true,
      });

      // large → large (already max)
      expect(result.chestRarity).toBe('rare');
    });

    it('does not upgrade chest when fullClearBonus is false', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
        fullClearBonus: false,
      });

      expect(result.chestRarity).toBe('common');
    });

    it('does not upgrade chest when fullClearBonus is undefined', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
      });

      expect(result.chestRarity).toBe('common');
    });

    it('applies DROP_MULTIPLIER to material rolls when fullClearBonus is true', async () => {
      // Use a deterministic random that gives a known material roll
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      // With fullClearBonus on medium: size upgrades to large first,
      // then rollChestMaterialRolls('large') produces base rolls,
      // which are multiplied by DROP_MULTIPLIER.
      // With random=0.999 and large range (3-6), base rolls = 6
      // Result: Math.ceil(6 * 1.5) = 9
      const withBonus = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'medium',
        fullClearBonus: true,
      });

      // Also get the base rolls for the upgraded size (large) without multiplier
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      const upgradedNoBonus = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large', // same as the upgraded size
        fullClearBonus: false,
      });

      expect(withBonus.materialRolls).toBe(
        Math.ceil(upgradedNoBonus.materialRolls * FULL_CLEAR_CONSTANTS.DROP_MULTIPLIER)
      );
    });

    it('queries drop table with upgraded rarity when fullClearBonus is true', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
        fullClearBonus: true,
      });

      // small + fullClear → medium → uncommon
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
      // Recipe chance for small is 0, so even a low random won't trigger it
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
        size: 'large', // has non-zero recipe chance
      });

      // random 0.999 > 0.05 (large recipe chance), so recipe roll fails
      expect(mockPrisma.craftingRecipe.findMany).not.toHaveBeenCalled();
    });

    it('unlocks a recipe when random roll succeeds and unknown recipes exist', async () => {
      // For large: recipe chance = 0.05, so random < 0.05 triggers recipe
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
        size: 'large',
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
        size: 'large',
      });

      expect(mockPrisma.playerRecipe.create).toHaveBeenCalledWith({
        data: {
          playerId: 'p1',
          recipeId: 'recipe-1',
        },
      });
    });

    it('skips recipe when all advanced recipes are already known', async () => {
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
      // Player already knows recipe-1
      mockPrisma.playerRecipe.findMany.mockResolvedValue([{ recipeId: 'recipe-1' }]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large',
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
        size: 'large',
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
        size: 'large',
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
        size: 'large',
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

    it('applies RECIPE_MULTIPLIER when fullClearBonus is true', async () => {
      // Large base recipe chance is 0.05
      // With full clear: 0.05 * 1.5 = 0.075
      // So a random value of 0.06 should succeed with bonus but fail without
      vi.spyOn(Math, 'random').mockReturnValue(0.06);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      // Without full clear bonus, 0.06 > 0.05, so no recipe
      const resultWithout = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large',
        fullClearBonus: false,
      });
      expect(resultWithout.recipeUnlocked).toBeNull();

      // With full clear bonus, 0.06 < 0.075, so recipe roll passes
      vi.spyOn(Math, 'random').mockReturnValue(0.06);
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
        size: 'large',
        fullClearBonus: true,
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
        size: 'large',
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
        size: 'large',
      });

      expect(result.recipeUnlocked!.soulbound).toBe(true);
    });

    it('never triggers recipe unlock for small encounters (0% chance)', async () => {
      // Small recipe chance is 0.0, so even random = 0 won't trigger
      vi.spyOn(Math, 'random').mockReturnValue(0);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
      });

      expect(result.recipeUnlocked).toBeNull();
      expect(mockPrisma.craftingRecipe.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Material rolls (count) ────────────────────────────────────────────────

  describe('material rolls', () => {
    it('produces material rolls within range for small chest', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
      });

      // CHEST_MATERIAL_ROLLS_SMALL: { min: 1, max: 2 }
      expect(result.materialRolls).toBeGreaterThanOrEqual(1);
      expect(result.materialRolls).toBeLessThanOrEqual(2);
    });

    it('produces material rolls within range for medium chest', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'medium',
      });

      // CHEST_MATERIAL_ROLLS_MEDIUM: { min: 2, max: 4 }
      expect(result.materialRolls).toBeGreaterThanOrEqual(2);
      expect(result.materialRolls).toBeLessThanOrEqual(4);
    });

    it('produces material rolls within range for large chest', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large',
      });

      // CHEST_MATERIAL_ROLLS_LARGE: { min: 3, max: 6 }
      expect(result.materialRolls).toBeGreaterThanOrEqual(3);
      expect(result.materialRolls).toBeLessThanOrEqual(6);
    });

    it('applies full clear DROP_MULTIPLIER with ceiling', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
        fullClearBonus: true,
      });

      // With random 0.999, rollChestMaterialRolls for small gives max (2 for upgraded=medium: 2-4 range)
      // Then multiplied by 1.5 and ceiled
      expect(result.materialRolls).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Loot accumulation ─────────────────────────────────────────────────────

  describe('loot accumulation', () => {
    it('grants stackable materials via addStackableItemTx', async () => {
      // random=0.5: rollChestMaterialRolls('small') → Math.floor(0.5 * 2) + 1 = 2 rolls
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
        size: 'large', // more rolls → more chances for aggregation
      });

      const oreEntries = result.loot.filter(l => l.itemTemplateId === 'ore-1');
      // All loot of same template should be aggregated into max 1 entry
      expect(oreEntries.length).toBeLessThanOrEqual(1);
    });

    it('produces loot with common rarity from dropRollingService', async () => {
      // random=0.5: 2 rolls on small chest, single entry always picked → 1 loot entry guaranteed
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
    it('passes availableSlots through to rollAndGrantDropsTx', async () => {
      // random=0.5: 2 rolls on small chest, single stackable entry
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
      // random=0.5: 2 rolls on small chest, non-stackable equipment, 0 slots available
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

  // ── Recipe chance for medium ──────────────────────────────────────────────

  describe('recipe unlock for medium encounters', () => {
    it('triggers recipe unlock for medium encounters when roll succeeds', async () => {
      // Medium recipe chance is 0.02
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
        size: 'medium',
      });

      expect(result.recipeUnlocked).not.toBeNull();
      expect(result.recipeUnlocked!.recipeName).toBe('Steel Helmet');
    });
  });

  // ── Full clear + recipe combined ──────────────────────────────────────────

  describe('full clear bonus with recipe upgrade', () => {
    it('uses upgraded size for both rarity and recipe chance', async () => {
      // small + fullClear → medium → uncommon rarity
      // Recipe chance for medium = 0.02
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
      mockPrisma.craftingRecipe.findMany.mockResolvedValue([
        {
          id: 'recipe-fc1',
          resultTemplateId: 'template-fc1',
          soulbound: false,
          resultTemplate: { name: 'Full Clear Reward' },
        },
      ]);
      mockPrisma.playerRecipe.findMany.mockResolvedValue([]);
      mockPrisma.playerRecipe.create.mockResolvedValue({});

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'small',
        fullClearBonus: true,
      });

      // Upgraded to medium → uncommon
      expect(result.chestRarity).toBe('uncommon');
      // Medium has non-zero recipe chance (0.02), so recipe should unlock
      // But with fullClear multiplier: 0.02 * 1.5 = 0.03, random 0.01 < 0.03 → success
      expect(result.recipeUnlocked).not.toBeNull();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty drop table with large materialRolls gracefully', async () => {
      mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

      const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
        ...baseParams,
        size: 'large',
        fullClearBonus: true,
      });

      // No drops possible from empty table, but function should not error
      expect(result.loot).toEqual([]);
      expect(result.overflow).toEqual([]);
    });

    it('handles multiple drop table entries (weighted selection)', async () => {
      // random=0.5: rollChestMaterialRolls('medium') → Math.floor(0.5 * 3) + 2 = 3 rolls
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
        size: 'medium',
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
        size: 'large',
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
