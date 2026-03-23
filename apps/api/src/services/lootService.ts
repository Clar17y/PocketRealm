import { Prisma, prisma } from '@pocketrealm/database';
import { rollBonusStatsForRarity, rollDropRarity } from '@pocketrealm/game-engine';
import type { EquipmentSlot, ItemStats, ItemType, LootDrop } from '@pocketrealm/shared';
import { randomIntInclusive } from '../utils/random';
import { cachedQuery } from './cacheService';
import { getInventoryState } from './inventoryService';
import { storePendingLoot, type PendingLootItem } from './pendingLootService';
import type { GrantedItemIds } from './stateUpdateHelpers';

async function getDropTable(mobTemplateId: string) {
  return cachedQuery(
    `droptable:${mobTemplateId}`,
    () => prisma.dropTable.findMany({
      where: { mobTemplateId },
      include: { itemTemplate: true },
    }),
    86400, // 24h TTL — static data
  );
}

export type LootDropWithName = LootDrop & { itemName: string | null };

/** Grants loot without capacity limits (e.g. boss drops). */
export async function rollAndGrantLoot(
  playerId: string,
  mobTemplateId: string,
  mobLevel: number,
  dropChanceMultiplier = 1
): Promise<LootDrop[]> {
  const { drops } = await rollAndGrantLootWithCapacity(
    playerId, mobTemplateId, mobLevel, dropChanceMultiplier, Infinity,
  );
  return drops;
}

export async function rollAndGrantLootWithCapacity(
  playerId: string,
  mobTemplateId: string,
  mobLevel: number,
  dropChanceMultiplier = 1,
  capacityOverride?: number,
): Promise<{ drops: LootDrop[]; overflow: PendingLootItem[]; pendingLootSessionId: string | null } & GrantedItemIds> {
  const entries = await getDropTable(mobTemplateId);

  let usedSlots: number;
  let capacity: number;
  if (capacityOverride !== undefined) {
    usedSlots = 0;
    capacity = capacityOverride;
  } else {
    ({ usedSlots, capacity } = await getInventoryState(playerId));
  }

  // Pre-fetch all existing stacks for stackable drops in one query
  const stackableTemplateIds = entries
    .filter(d => d.itemTemplate.stackable)
    .map(d => d.itemTemplateId);

  const existingStacks = stackableTemplateIds.length > 0
    ? await prisma.item.findMany({
        where: { ownerId: playerId, templateId: { in: stackableTemplateIds }, inStash: false },
        select: { id: true, templateId: true, quantity: true },
      })
    : [];
  const stackMap = new Map(existingStacks.map(s => [s.templateId, s]));

  let slotsUsed = usedSlots;
  const drops: LootDrop[] = [];
  const overflow: PendingLootItem[] = [];
  /** IDs of newly created items (for frontend inventoryAdded). */
  const newItemIds: string[] = [];
  /** IDs of existing items with updated quantity (for frontend inventoryUpdated). */
  const updatedItemIds: string[] = [];

  const pendingCreates: Prisma.ItemCreateManyInput[] = [];
  const pendingDrops: LootDrop[] = [];

  for (const entry of entries) {
    const chance = Math.min(1, Math.max(0, Number(entry.dropChance)));
    if (chance <= 0 || Math.random() >= chance) continue;

    const quantity = randomIntInclusive(entry.minQuantity, entry.maxQuantity);
    if (quantity <= 0) continue;

    if (entry.itemTemplate.stackable) {
      const existingStack = stackMap.get(entry.itemTemplateId);
      if (!existingStack && slotsUsed >= capacity) {
        overflow.push({
          templateId: entry.itemTemplateId,
          templateName: entry.itemTemplate.name,
          rarity: 'common',
          quantity,
          bonusStats: null,
          currentDurability: null,
          maxDurability: null,
        });
        continue;
      }
      if (existingStack) {
        await prisma.item.update({
          where: { id: existingStack.id },
          data: { quantity: { increment: quantity } },
        });
        existingStack.quantity += quantity; // update local state for subsequent same-template drops
        updatedItemIds.push(existingStack.id);
      } else {
        const newItem = await prisma.item.create({
          data: { ownerId: playerId, templateId: entry.itemTemplateId, quantity, rarity: 'common' },
          select: { id: true, templateId: true, quantity: true },
        });
        stackMap.set(entry.itemTemplateId, newItem);
        slotsUsed++;
        newItemIds.push(newItem.id);
      }
      drops.push({ itemTemplateId: entry.itemTemplateId, quantity, rarity: 'common' });
      continue;
    }

    const itemType = entry.itemTemplate.itemType as ItemType;
    const isEquipment = itemType === 'weapon' || itemType === 'armor';
    const maxDurability = isEquipment ? entry.itemTemplate.maxDurability : null;
    const templateBaseStats = entry.itemTemplate.baseStats as ItemStats | null | undefined;
    const templateSlot = entry.itemTemplate.slot as EquipmentSlot | null;

    for (let i = 0; i < quantity; i++) {
      const rarity = isEquipment ? rollDropRarity(mobLevel, dropChanceMultiplier) : 'common';
      const bonusStats = isEquipment
        ? rollBonusStatsForRarity({ itemType, rarity, baseStats: templateBaseStats, slot: templateSlot })
        : null;

      if (slotsUsed >= capacity) {
        overflow.push({
          templateId: entry.itemTemplateId,
          templateName: entry.itemTemplate.name,
          rarity,
          quantity: 1,
          bonusStats: bonusStats as Record<string, number> | null,
          currentDurability: maxDurability,
          maxDurability,
        });
        continue;
      }

      pendingCreates.push({
        ownerId: playerId,
        templateId: entry.itemTemplateId,
        rarity,
        quantity: 1,
        maxDurability,
        currentDurability: maxDurability,
        bonusStats: bonusStats ? (bonusStats as Prisma.InputJsonObject) : undefined,
      });
      pendingDrops.push({ itemTemplateId: entry.itemTemplateId, quantity: 1, rarity });
      slotsUsed++;
    }
  }

  if (pendingCreates.length > 0) {
    const created = await prisma.item.createManyAndReturn({
      data: pendingCreates,
      select: { id: true },
    });
    newItemIds.push(...created.map((c) => c.id));
    drops.push(...pendingDrops);
  }

  let pendingLootSessionId: string | null = null;
  if (overflow.length > 0) {
    pendingLootSessionId = await storePendingLoot(playerId, overflow);
  }

  return { drops, overflow, pendingLootSessionId, newItemIds: [...new Set(newItemIds)], updatedItemIds: [...new Set(updatedItemIds)] };
}

export async function enrichLootWithNames(
  loot: Array<{
    itemTemplateId: string;
    quantity: number;
    rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    itemName?: string | null;
  }>
): Promise<LootDropWithName[]> {
  if (loot.length === 0) return [];

  const templateIdsMissingName = Array.from(
    new Set(
      loot
        .filter((drop) => !drop.itemName)
        .map((drop) => drop.itemTemplateId)
    )
  );

  let templateNameById = new Map<string, string>();
  if (templateIdsMissingName.length > 0) {
    const templates = await prisma.itemTemplate.findMany({
      where: { id: { in: templateIdsMissingName } },
      select: { id: true, name: true },
    });
    templateNameById = new Map(templates.map((template) => [template.id, template.name]));
  }

  return loot.map((drop) => ({
    itemTemplateId: drop.itemTemplateId,
    quantity: drop.quantity,
    rarity: drop.rarity,
    itemName: drop.itemName ?? templateNameById.get(drop.itemTemplateId) ?? null,
  }));
}
