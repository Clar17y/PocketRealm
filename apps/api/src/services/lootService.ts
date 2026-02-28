import { Prisma, prisma } from '@adventure/database';
import { rollBonusStatsForRarity, rollDropRarity } from '@adventure/game-engine';
import type { EquipmentSlot, ItemStats, ItemType, LootDrop } from '@adventure/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItem, getUsedSlots, getPlayerCapacity } from './inventoryService';
import { storePendingLoot, type PendingLootItem } from './pendingLootService';

export type LootDropWithName = LootDrop & { itemName: string | null };

export async function rollAndGrantLoot(
  playerId: string,
  mobTemplateId: string,
  mobLevel: number,
  dropChanceMultiplier = 1
): Promise<LootDrop[]> {
  const entries = await prisma.dropTable.findMany({
    where: { mobTemplateId },
    include: { itemTemplate: true },
  });

  const drops: LootDrop[] = [];

  for (const entry of entries) {
    const chance = Math.min(1, Math.max(0, entry.dropChance.toNumber()));
    if (chance <= 0) continue;

    if (Math.random() >= chance) continue;

    const quantity = randomIntInclusive(entry.minQuantity, entry.maxQuantity);
    if (quantity <= 0) continue;

    // Create/merge item instances
    if (entry.itemTemplate.stackable) {
      await addStackableItem(playerId, entry.itemTemplateId, quantity);
      drops.push({ itemTemplateId: entry.itemTemplateId, quantity, rarity: 'common' });
      continue;
    }

    const itemType = entry.itemTemplate.itemType as ItemType;
    const isEquipment = itemType === 'weapon' || itemType === 'armor';
    const needsDurability = isEquipment;
    const maxDurability = needsDurability ? entry.itemTemplate.maxDurability : null;
    const templateBaseStats = entry.itemTemplate.baseStats as ItemStats | null | undefined;

    for (let i = 0; i < quantity; i++) {
      const rarity = isEquipment
        ? rollDropRarity(mobLevel, dropChanceMultiplier)
        : 'common';
      const templateSlot = entry.itemTemplate.slot as EquipmentSlot | null;
      const bonusStats = isEquipment
        ? rollBonusStatsForRarity({
            itemType,
            rarity,
            baseStats: templateBaseStats,
            slot: templateSlot,
          })
        : null;

      await prisma.item.create({
        data: {
          ownerId: playerId,
          templateId: entry.itemTemplateId,
          rarity,
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
          bonusStats: bonusStats ? (bonusStats as Prisma.InputJsonObject) : undefined,
        } as any,
      });

      drops.push({ itemTemplateId: entry.itemTemplateId, quantity: 1, rarity });
    }
  }

  return drops;
}

export async function rollAndGrantLootWithCapacity(
  playerId: string,
  mobTemplateId: string,
  mobLevel: number,
  dropChanceMultiplier = 1
): Promise<{ drops: LootDrop[]; pendingLootSessionId: string | null }> {
  const entries = await prisma.dropTable.findMany({
    where: { mobTemplateId },
    include: { itemTemplate: true },
  });

  const [usedSlots, capacity] = await Promise.all([
    getUsedSlots(playerId),
    getPlayerCapacity(playerId),
  ]);

  let slotsUsed = usedSlots;
  const drops: LootDrop[] = [];
  const overflow: PendingLootItem[] = [];

  for (const entry of entries) {
    const chance = Math.min(1, Math.max(0, entry.dropChance.toNumber()));
    if (chance <= 0 || Math.random() >= chance) continue;

    const quantity = randomIntInclusive(entry.minQuantity, entry.maxQuantity);
    if (quantity <= 0) continue;

    if (entry.itemTemplate.stackable) {
      const existing = await prisma.item.findFirst({
        where: { ownerId: playerId, templateId: entry.itemTemplateId, inStash: false },
      });
      if (!existing && slotsUsed >= capacity) {
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
      await addStackableItem(playerId, entry.itemTemplateId, quantity);
      if (!existing) slotsUsed++;
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

      await prisma.item.create({
        data: {
          ownerId: playerId,
          templateId: entry.itemTemplateId,
          rarity,
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
          bonusStats: bonusStats ? (bonusStats as Prisma.InputJsonObject) : undefined,
        } as any,
      });
      slotsUsed++;
      drops.push({ itemTemplateId: entry.itemTemplateId, quantity: 1, rarity });
    }
  }

  let pendingLootSessionId: string | null = null;
  if (overflow.length > 0) {
    pendingLootSessionId = await storePendingLoot(playerId, overflow);
  }

  return { drops, pendingLootSessionId };
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
