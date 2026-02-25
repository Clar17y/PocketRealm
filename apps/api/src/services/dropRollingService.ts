import { Prisma } from '@adventure/database';
import type { LootDrop } from '@adventure/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItemTx } from './inventoryService';
import { pickWeighted } from '../utils/pickWeighted.js';

/** Converts Prisma Decimal-like values to plain numbers. */
export function decimalLikeToNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybeNumber = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybeNumber) ? maybeNumber : 0;
  }
  return 0;
}

export interface DropTableEntry {
  itemTemplateId: string;
  dropChance: unknown;
  minQuantity: number;
  maxQuantity: number;
  itemTemplate: {
    itemType: string;
    stackable: boolean;
    maxDurability: number;
    [key: string]: unknown;
  };
}

export function createLootAccumulator() {
  const lootByTemplate = new Map<string, LootDrop>();

  return {
    add(drop: LootDrop): void {
      const existing = lootByTemplate.get(drop.itemTemplateId);
      if (existing) {
        existing.quantity += drop.quantity;
        return;
      }
      lootByTemplate.set(drop.itemTemplateId, { ...drop });
    },
    toArray(): LootDrop[] {
      return Array.from(lootByTemplate.values());
    },
  };
}

/**
 * Roll material drops from a drop table and grant them to a player.
 * Handles stackable vs non-stackable items, equipment durability, etc.
 */
export async function rollAndGrantDropsTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  dropEntries: DropTableEntry[],
  rolls: number,
  rarity: string = 'common',
): Promise<LootDrop[]> {
  const accumulator = createLootAccumulator();

  for (let i = 0; i < rolls; i++) {
    const picked = pickWeighted(dropEntries, (e: DropTableEntry) => Math.max(0, decimalLikeToNumber(e.dropChance)));
    if (!picked) continue;

    const quantity = Math.max(1, randomIntInclusive(picked.minQuantity, picked.maxQuantity));

    if (picked.itemTemplate.stackable) {
      await addStackableItemTx(tx, playerId, picked.itemTemplateId, quantity);
      accumulator.add({ itemTemplateId: picked.itemTemplateId, quantity, rarity });
      continue;
    }

    const isEquipment = picked.itemTemplate.itemType === 'weapon' || picked.itemTemplate.itemType === 'armor';
    const maxDurability = isEquipment ? picked.itemTemplate.maxDurability : null;

    for (let q = 0; q < quantity; q++) {
      await tx.item.create({
        data: {
          ownerId: playerId,
          templateId: picked.itemTemplateId,
          rarity,
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
    }
    accumulator.add({ itemTemplateId: picked.itemTemplateId, quantity, rarity });
  }

  return accumulator.toArray();
}
