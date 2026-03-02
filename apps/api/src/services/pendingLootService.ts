import { randomUUID } from 'crypto';
import { prisma } from '@adventure/database';
import { INVENTORY_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { redis } from '../redis';
import { getInventoryState } from './inventoryService';

export interface PendingLootItem {
  templateId: string;
  templateName: string;
  rarity: string;
  quantity: number;
  bonusStats: Record<string, number> | null;
  currentDurability: number | null;
  maxDurability: number | null;
}

function lootKey(playerId: string, sessionId: string): string {
  return `pending_loot:${playerId}:${sessionId}`;
}

function aggregateOverflow(items: PendingLootItem[]): PendingLootItem[] {
  const merged = new Map<string, PendingLootItem>();
  const result: PendingLootItem[] = [];

  for (const item of items) {
    // Only merge stackable-like items (no bonus stats, no durability = materials)
    const isStackable = !item.bonusStats && item.maxDurability == null;
    if (isStackable) {
      const key = `${item.templateId}:${item.rarity}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }
      const copy = { ...item };
      merged.set(key, copy);
      result.push(copy);
    } else {
      result.push(item);
    }
  }
  return result;
}

export async function storePendingLoot(playerId: string, items: PendingLootItem[]): Promise<string> {
  const sessionId = randomUUID();
  const key = lootKey(playerId, sessionId);
  const aggregated = aggregateOverflow(items);
  await redis.set(key, JSON.stringify(aggregated), 'EX', INVENTORY_CONSTANTS.PENDING_LOOT_TTL_SECONDS);
  return sessionId;
}

export async function getPendingLoot(playerId: string, sessionId: string): Promise<PendingLootItem[] | null> {
  const data = await redis.get(lootKey(playerId, sessionId));
  return data ? JSON.parse(data) : null;
}

export async function claimPendingLoot(
  playerId: string,
  sessionId: string,
  selectedIndices: number[]
): Promise<void> {
  const key = lootKey(playerId, sessionId);
  const data = await redis.get(key);
  if (!data) throw new AppError(404, 'Pending loot expired or not found', 'LOOT_EXPIRED');

  const items: PendingLootItem[] = JSON.parse(data);
  const { usedSlots, capacity } = await getInventoryState(playerId);

  let slotsUsed = usedSlots;

  const uniqueIndices = [...new Set(selectedIndices)];

  await prisma.$transaction(async (tx) => {
    for (const idx of uniqueIndices) {
      if (idx < 0 || idx >= items.length) continue;
      if (slotsUsed >= capacity) break;

      const lootItem = items[idx];
      await tx.item.create({
        data: {
          ownerId: playerId,
          templateId: lootItem.templateId,
          rarity: lootItem.rarity,
          quantity: lootItem.quantity,
          bonusStats: lootItem.bonusStats ?? undefined,
          currentDurability: lootItem.currentDurability,
          maxDurability: lootItem.maxDurability,
        } as any,
      });
      slotsUsed++;
    }
  });

  await redis.del(key);
}
