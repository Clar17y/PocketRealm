import { fetchApi, type TurnStateResponse } from './core';

// Inventory

export async function getInventory() {
  return fetchApi<{
    items: Array<{
      id: string;
      templateId: string;
      ownerId: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      currentDurability: number | null;
      maxDurability: number | null;
      quantity: number;
      bonusStats: Record<string, number> | null;
      createdAt: string;
        template: {
          id: string;
          name: string;
          itemType: string;
          weightClass: 'heavy' | 'medium' | 'light' | null;
          slot: string | null;
          tier: number;
          baseStats: Record<string, unknown>;
        requiredSkill: string | null;
        requiredLevel: number;
        maxDurability: number;
        stackable: boolean;
      };
      equippedSlot: string | null;
    }>;
  }>('/api/v1/inventory');
}

export async function destroyInventoryItem(id: string, quantity?: number) {
  const q = quantity ? `?quantity=${quantity}` : '';
  return fetchApi<{ destroyed: boolean; itemId: string; remainingQuantity?: number }>(`/api/v1/inventory/${id}${q}`, {
    method: 'DELETE',
  });
}

export async function useItem(itemId: string) {
  return fetchApi<{
    itemName: string;
    previousHp: number;
    currentHp: number;
    maxHp: number;
    healedAmount: number;
    remainingQuantity: number | null;
  }>('/api/v1/inventory/use', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export async function repairItem(itemId: string) {
  return fetchApi<{
    repaired: boolean;
    turns?: TurnStateResponse;
    itemId: string;
    currentDurability: number | null;
    maxDurability: number | null;
    maxDurabilityDecay?: number;
  }>('/api/v1/inventory/repair', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export async function repairAllEquipped() {
  return fetchApi<{
    repaired: boolean;
    turns?: TurnStateResponse;
    totalTurnCost: number;
    items: Array<{
      itemId: string;
      name: string;
      slot: string;
      turnCost: number;
      currentDurability: number;
      maxDurability: number;
      maxDurabilityDecay: number;
    }>;
  }>('/api/v1/inventory/repair-equipped', {
    method: 'POST',
  });
}

// Equipment

export async function equip(itemId: string, slot: string) {
  return fetchApi<{ success: true }>('/api/v1/equipment/equip', {
    method: 'POST',
    body: JSON.stringify({ itemId, slot }),
  });
}

export async function unequip(slot: string) {
  return fetchApi<{ success: true }>('/api/v1/equipment/unequip', {
    method: 'POST',
    body: JSON.stringify({ slot }),
  });
}

// Gathering

export interface GatheringNodesQuery {
  page?: number;
  pageSize?: number;
  zoneId?: string;
  resourceType?: string;
  skillRequired?: 'mining' | 'foraging' | 'woodcutting';
}

export interface GatheringNodesResponse {
  nodes: Array<{
    id: string;
    templateId: string;
    zoneId: string;
    zoneName: string;
    resourceType: string;
    resourceTypeCategory: string;
    skillRequired: string;
    levelRequired: number;
    baseYield: number;
    remainingCapacity: number;
    maxCapacity: number;
    sizeName: string;
    discoveredAt: string;
    weathered: boolean;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: {
    zones: Array<{ id: string; name: string }>;
    resourceTypes: string[];
  };
}

export async function getGatheringNodes(query: GatheringNodesQuery = {}) {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.zoneId) params.set('zoneId', query.zoneId);
  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.skillRequired) params.set('skillRequired', query.skillRequired);

  const suffix = params.toString();
  return fetchApi<GatheringNodesResponse>(`/api/v1/gathering/nodes${suffix ? `?${suffix}` : ''}`);
}

export async function mine(playerNodeId: string, turns: number, currentZoneId: string) {
  return fetchApi<{
    logId: string;
    turns: TurnStateResponse;
    node: {
      id: string;
      templateId: string;
      zoneId: string;
      zoneName: string;
      resourceType: string;
      levelRequired: number;
      remainingCapacity: number;
      nodeDepleted: boolean;
    };
    results: { actions: number; baseYield: number; yieldMultiplier: number; totalYield: number; itemTemplateId: string; itemId: string };
    xp: {
      skillType: string;
      xpAfterEfficiency: number;
      efficiency: number;
      leveledUp: boolean;
      newLevel: number;
      atDailyCap: boolean;
      newTotalXp: number;
      newDailyXpGained: number;
      characterXpGain: number;
      characterXpAfter: number;
      characterLevelBefore: number;
      characterLevelAfter: number;
      attributePointsAfter: number;
      characterLeveledUp: boolean;
    };
    gemCrit?: { itemTemplateId: string; gemName: string; gemsFound: number };
    activeEvents?: Array<{ title: string; effectType: string; effectValue: number }>;
  }>('/api/v1/gathering/mine', {
    method: 'POST',
    body: JSON.stringify({ playerNodeId, turns, currentZoneId }),
  });
}

// Crafting

export async function getCraftingRecipes() {
  return fetchApi<{
    recipes: Array<{
      id: string;
      skillType: string;
      requiredLevel: number;
      isAdvanced: boolean;
      isDiscovered: boolean;
      discoveryHint: string | null;
      soulbound: boolean;
      mobFamilyId: string | null;
      resultTemplate: {
        id: string;
        name: string;
        itemType: string;
        weightClass: 'heavy' | 'medium' | 'light' | null;
        setId: string | null;
        slot: string | null;
        tier: number;
        baseStats: Record<string, unknown>;
        requiredSkill: string | null;
        requiredLevel: number;
        maxDurability: number;
        stackable: boolean;
      };
      turnCost: number;
      materials: Array<{ templateId: string; quantity: number }>;
      materialTemplates: Array<{ id: string; name: string; itemType: string; stackable: boolean }>;
      xpReward: number;
    }>;
    zoneCraftingLevel: number | null;
    zoneName: string | null;
  }>('/api/v1/crafting/recipes');
}

export async function craft(recipeId: string, quantity: number = 1) {
  return fetchApi<{
    logId: string;
    turns: TurnStateResponse;
    crafted: { recipeId: string; resultTemplateId: string; quantity: number; craftedItemIds: string[] };
    craftedItemDetails: Array<{
      id: string;
      isCrit: boolean;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      bonusStats?: Record<string, number>;
    }>;
    xp: {
      skillType: string;
      xpAfterEfficiency: number;
      efficiency: number;
      leveledUp: boolean;
      newLevel: number;
      atDailyCap: boolean;
      newTotalXp: number;
      newDailyXpGained: number;
      characterXpGain: number;
      characterXpAfter: number;
      characterLevelBefore: number;
      characterLevelAfter: number;
      attributePointsAfter: number;
      characterLeveledUp: boolean;
    };
  }>('/api/v1/crafting/craft', {
    method: 'POST',
    body: JSON.stringify({ recipeId, quantity }),
  });
}

export async function salvage(itemId: string) {
  return fetchApi<{
    logId: string;
    turns: TurnStateResponse;
    salvage: {
      salvagedItemId: string;
      salvagedTemplateId: string;
      returnedMaterials: Array<{ templateId: string; name: string; quantity: number }>;
    };
  }>('/api/v1/crafting/salvage', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export async function forgeUpgrade(itemId: string, sacrificialItemId: string) {
  return fetchApi<{
    logId: string;
    turns: TurnStateResponse;
    forge: {
      action: 'upgrade';
      success: boolean;
      destroyed: boolean;
      itemId: string;
      fromRarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      toRarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
      successChance: number;
      roll: number;
      sacrificialItemId: string;
      bonusStats?: Record<string, number> | null;
    };
  }>('/api/v1/crafting/forge/upgrade', {
    method: 'POST',
    body: JSON.stringify({ itemId, sacrificialItemId }),
  });
}

export async function forgeReroll(itemId: string, sacrificialItemId: string) {
  return fetchApi<{
    logId: string;
    turns: TurnStateResponse;
    forge: {
      action: 'reroll';
      success: true;
      itemId: string;
      rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
      sacrificialItemId: string;
      bonusStats: Record<string, number> | null;
    };
  }>('/api/v1/crafting/forge/reroll', {
    method: 'POST',
    body: JSON.stringify({ itemId, sacrificialItemId }),
  });
}
