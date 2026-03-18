import { Prisma } from '@pocketrealm/database';
import type { LootDrop, ItemRarity } from '@pocketrealm/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItemTx } from './inventoryService';
import { pickWeighted } from '../utils/pickWeighted.js';
import type { PendingLootItem } from './pendingLootService';

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

export interface DropGrantResult {
  loot: LootDrop[];
  overflow: PendingLootItem[];
  slotsConsumed: number;
  newItemIds: string[];
  updatedItemIds: string[];
}

/**
 * Roll material drops from a drop table and grant them to a player.
 * When `availableSlots` is provided, items that don't fit go to overflow.
 */
export async function rollAndGrantDropsTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  dropEntries: DropTableEntry[],
  rolls: number,
  rarity: ItemRarity = 'common',
  availableSlots?: number,
): Promise<DropGrantResult> {
  const accumulator = createLootAccumulator();
  const overflow: PendingLootItem[] = [];
  const newItemIds: string[] = [];
  const updatedItemIds: string[] = [];
  const initialSlots = availableSlots ?? Infinity;
  let remainingSlots = initialSlots;

  // Track existing stacks so merges don't consume a slot
  const grantedStackableTemplates = new Set<string>();
  let existingStacks: Set<string> | null = null;
  if (availableSlots != null) {
    const playerItems = await tx.item.findMany({
      where: { ownerId: playerId, inStash: false },
      select: { templateId: true },
    });
    existingStacks = new Set(playerItems.map((i) => i.templateId));
  }

  // Fetch template names for overflow display
  const templateNameCache = new Map<string, string>();
  if (availableSlots != null) {
    const templates = await tx.itemTemplate.findMany({
      where: { id: { in: dropEntries.map(e => e.itemTemplateId) } },
      select: { id: true, name: true },
    });
    for (const t of templates) templateNameCache.set(t.id, t.name);
  }

  for (let i = 0; i < rolls; i++) {
    const picked = pickWeighted(dropEntries, (e: DropTableEntry) => Math.max(0, decimalLikeToNumber(e.dropChance)));
    if (!picked) continue;

    const quantity = Math.max(1, randomIntInclusive(picked.minQuantity, picked.maxQuantity));

    if (picked.itemTemplate.stackable) {
      const hasStack = existingStacks?.has(picked.itemTemplateId) || grantedStackableTemplates.has(picked.itemTemplateId);
      const needsNewSlot = !hasStack;

      if (needsNewSlot && remainingSlots <= 0) {
        const existing = overflow.find(o => o.templateId === picked.itemTemplateId);
        if (existing) { existing.quantity += quantity; }
        else { overflow.push({ templateId: picked.itemTemplateId, templateName: templateNameCache.get(picked.itemTemplateId) ?? 'Unknown', rarity, quantity, bonusStats: null, currentDurability: null, maxDurability: null }); }
        continue;
      }

      if (needsNewSlot) remainingSlots--;
      grantedStackableTemplates.add(picked.itemTemplateId);
      const stackResult = await addStackableItemTx(tx, playerId, picked.itemTemplateId, quantity);
      (stackResult.created ? newItemIds : updatedItemIds).push(stackResult.itemId);
      accumulator.add({ itemTemplateId: picked.itemTemplateId, quantity, rarity });
      continue;
    }

    // Non-stackable: each item needs its own slot
    const isEquipment = picked.itemTemplate.itemType === 'weapon' || picked.itemTemplate.itemType === 'armor';
    const maxDurability = isEquipment ? picked.itemTemplate.maxDurability : null;

    for (let q = 0; q < quantity; q++) {
      if (remainingSlots <= 0) {
        overflow.push({ templateId: picked.itemTemplateId, templateName: templateNameCache.get(picked.itemTemplateId) ?? 'Unknown', rarity, quantity: 1, bonusStats: null, currentDurability: maxDurability, maxDurability });
        continue;
      }
      remainingSlots--;
      const created = await tx.item.create({
        data: {
          ownerId: playerId,
          templateId: picked.itemTemplateId,
          rarity,
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
        },
        select: { id: true },
      });
      newItemIds.push(created.id);
    }
    accumulator.add({ itemTemplateId: picked.itemTemplateId, quantity, rarity });
  }

  const slotsConsumed = initialSlots === Infinity ? 0 : Math.max(0, initialSlots - remainingSlots);
  return { loot: accumulator.toArray(), overflow, slotsConsumed, newItemIds: [...new Set(newItemIds)], updatedItemIds: [...new Set(updatedItemIds)] };
}
