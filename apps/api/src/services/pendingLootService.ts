import { randomUUID } from 'crypto';
import { prisma } from '@pocketrealm/database';
import { INVENTORY_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { redis } from '../redis';
import { getInventoryState } from './inventoryService';
import { pendingLootArraySchema, safeParseRedisJson } from '../utils/jsonColumnSchemas';

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
  if (!data) return null;
  return safeParseRedisJson(data, pendingLootArraySchema, [], `pending_loot:${playerId}`);
}

export async function claimPendingLoot(
  playerId: string,
  sessionId: string,
  selectedIndices: number[]
): Promise<void> {
  const key = lootKey(playerId, sessionId);

  // Atomically read-and-delete to prevent double-claim race condition
  const data = await redis.getdel(key);
  if (!data) throw new AppError(404, 'Pending loot expired or already claimed', 'LOOT_EXPIRED');

  let items: PendingLootItem[];
  try {
    const parsed = JSON.parse(data);
    items = pendingLootArraySchema.parse(parsed);
  } catch (err) {
    // Restore the Redis key so the player can retry — schema failure must not destroy loot
    await redis.set(key, data, 'EX', INVENTORY_CONSTANTS.PENDING_LOOT_TTL_SECONDS);
    throw new AppError(500, 'Failed to parse pending loot data', 'LOOT_PARSE_ERROR');
  }
  const { usedSlots, capacity } = await getInventoryState(playerId);

  let slotsUsed = usedSlots;

  const uniqueIndices = [...new Set(selectedIndices)];

  try {
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
          },
        });
        slotsUsed++;
      }
    });
  } catch (err) {
    // Restore the Redis key so the player can retry — prevents loot loss on DB failure
    await redis.set(key, data, 'EX', INVENTORY_CONSTANTS.PENDING_LOOT_TTL_SECONDS);
    throw err;
  }
}
