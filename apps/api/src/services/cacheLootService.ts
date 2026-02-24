import { Prisma } from '@adventure/database';
import { HIDDEN_CACHE_CONSTANTS, type LootDrop } from '@adventure/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItemTx } from './inventoryService';
import { pickWeighted } from '../utils/pickWeighted.js';

export interface CacheLootResult {
  materials: LootDrop[];
  soulboundItem: { itemTemplateId: string; name: string; rarity: string } | null;
}

function decimalLikeToNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybeNumber = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybeNumber) ? maybeNumber : 0;
  }
  return 0;
}

export function rollRarityWithLuck(luck: number): 'common' | 'uncommon' | 'rare' | 'epic' {
  const { RARITY_WEIGHTS, LUCK_RARITY_SCALING } = HIDDEN_CACHE_CONSTANTS;
  // Luck shifts weight from common toward higher rarities
  const luckBonus = luck * LUCK_RARITY_SCALING;
  const commonWeight = Math.max(5, RARITY_WEIGHTS.common - luckBonus * 100);
  const uncommonWeight = RARITY_WEIGHTS.uncommon + luckBonus * 30;
  const rareWeight = RARITY_WEIGHTS.rare + luckBonus * 40;
  const epicWeight = RARITY_WEIGHTS.epic + luckBonus * 30;

  const total = commonWeight + uncommonWeight + rareWeight + epicWeight;
  const roll = Math.random() * total;

  if (roll < commonWeight) return 'common';
  if (roll < commonWeight + uncommonWeight) return 'uncommon';
  if (roll < commonWeight + uncommonWeight + rareWeight) return 'rare';
  return 'epic';
}

interface ChestDropEntry {
  itemTemplateId: string;
  dropChance: unknown;
  minQuantity: number;
  maxQuantity: number;
  itemTemplate: {
    itemType: string;
    stackable: boolean;
    maxDurability: number;
    name: string;
  };
}

export async function grantCacheLootTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    mobFamilyId: string;
    luck: number;
  }
): Promise<CacheLootResult> {
  const txAny = tx as unknown as Record<string, unknown>;
  const { MATERIAL_ROLLS_MIN, MATERIAL_ROLLS_MAX, SOULBOUND_DROP_CHANCE } = HIDDEN_CACHE_CONSTANTS;

  const materialRolls = randomIntInclusive(MATERIAL_ROLLS_MIN, MATERIAL_ROLLS_MAX);

  // Use 'common' chest drop table for materials (same as encounter site chests)
  const dropEntries = (await (txAny as any).chestDropTable.findMany({
    where: {
      mobFamilyId: params.mobFamilyId,
      chestRarity: 'common',
    },
    include: {
      itemTemplate: {
        select: { itemType: true, stackable: true, maxDurability: true, name: true },
      },
    },
  })) as ChestDropEntry[];

  const lootByTemplate = new Map<string, LootDrop>();
  const addLoot = (drop: LootDrop): void => {
    const existing = lootByTemplate.get(drop.itemTemplateId);
    if (existing) {
      existing.quantity += drop.quantity;
      return;
    }
    lootByTemplate.set(drop.itemTemplateId, { ...drop });
  };

  for (let i = 0; i < materialRolls; i++) {
    const picked = pickWeighted(dropEntries, (e) => Math.max(0, decimalLikeToNumber(e.dropChance)));
    if (!picked) continue;

    const quantity = Math.max(1, randomIntInclusive(picked.minQuantity, picked.maxQuantity));

    if (picked.itemTemplate.stackable) {
      await addStackableItemTx(tx, params.playerId, picked.itemTemplateId, quantity);
      addLoot({ itemTemplateId: picked.itemTemplateId, quantity, rarity: 'common' });
      continue;
    }

    const isEquipment = picked.itemTemplate.itemType === 'weapon' || picked.itemTemplate.itemType === 'armor';
    const maxDurability = isEquipment ? picked.itemTemplate.maxDurability : null;

    for (let q = 0; q < quantity; q++) {
      await tx.item.create({
        data: {
          ownerId: params.playerId,
          templateId: picked.itemTemplateId,
          rarity: 'common',
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
        } as any,
      });
    }
    addLoot({ itemTemplateId: picked.itemTemplateId, quantity, rarity: 'common' });
  }

  // Soulbound item roll
  let soulboundItem: CacheLootResult['soulboundItem'] = null;

  if (Math.random() < SOULBOUND_DROP_CHANCE) {
    const soulboundRecipes = (await (txAny as any).craftingRecipe.findMany({
      where: {
        soulbound: true,
        mobFamilyId: params.mobFamilyId,
      },
      select: {
        resultTemplateId: true,
        resultTemplate: { select: { name: true, itemType: true, stackable: true, maxDurability: true } },
      },
    })) as Array<{
      resultTemplateId: string;
      resultTemplate: { name: string; itemType: string; stackable: boolean; maxDurability: number };
    }>;

    if (soulboundRecipes.length > 0) {
      const picked = soulboundRecipes[randomIntInclusive(0, soulboundRecipes.length - 1)]!;
      const rarity = rollRarityWithLuck(params.luck);

      const isEquipment = picked.resultTemplate.itemType === 'weapon' || picked.resultTemplate.itemType === 'armor';
      const maxDurability = isEquipment ? picked.resultTemplate.maxDurability : null;

      await tx.item.create({
        data: {
          ownerId: params.playerId,
          templateId: picked.resultTemplateId,
          rarity,
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
        } as any,
      });

      soulboundItem = {
        itemTemplateId: picked.resultTemplateId,
        name: picked.resultTemplate.name,
        rarity,
      };
    }
  }

  return { materials: Array.from(lootByTemplate.values()), soulboundItem };
}
