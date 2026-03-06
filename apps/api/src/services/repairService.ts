import type { Prisma } from '@pocketrealm/database';
import { DURABILITY_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';

/** Compute the turn cost to repair a single item. */
export function repairTurnCost(currentDurability: number): number {
  return currentDurability <= 0
    ? DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST
    : DURABILITY_CONSTANTS.REPAIR_TURN_COST;
}

/** Apply durability repair to a single item inside a transaction. */
export async function repairItemDurability(
  tx: Prisma.TransactionClient,
  item: { id: string; ownerId: string; currentDurability: number | null; maxDurability: number | null; template: { maxDurability: number } },
  randomFn: () => number = Math.random,
): Promise<{ newMax: number; decay: number }> {
  const max = item.maxDurability ?? item.template.maxDurability;
  const decay = Math.min(
    DURABILITY_CONSTANTS.REPAIR_MAX_DECAY,
    Math.max(1, Math.floor(randomFn() * (DURABILITY_CONSTANTS.REPAIR_MAX_DECAY + 1))),
  );
  const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

  const updated = await tx.item.updateMany({
    where: {
      id: item.id,
      ownerId: item.ownerId,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
    },
    data: { maxDurability: newMax, currentDurability: newMax },
  });
  if (updated.count !== 1) {
    throw new AppError(409, 'Item durability changed; try again', 'ITEM_STATE_CHANGED');
  }

  return { newMax, decay };
}

export interface RepairEquippedResult {
  repaired: boolean;
  turns?: {
    previousTurns: number;
    spent: number;
    currentTurns: number;
    lastRegenAt: string;
    timeToCapMs: number | null;
  };
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
}

export async function repairAllEquipped(
  tx: Prisma.TransactionClient,
  playerId: string,
  randomFn: () => number = Math.random,
): Promise<RepairEquippedResult> {
  const equipped = await tx.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    include: { item: { include: { template: true } } },
  });

  const damaged = equipped
    .filter((e) => {
      if (!e.item) return false;
      const t = e.item.template;
      if (t.itemType !== 'weapon' && t.itemType !== 'armor') return false;
      const current = e.item.currentDurability ?? t.maxDurability;
      const max = e.item.maxDurability ?? t.maxDurability;
      return current < max;
    })
    .map((e) => {
      const item = e.item!;
      const current = item.currentDurability ?? item.template.maxDurability;
      return { slot: e.slot, item, current };
    });

  if (damaged.length === 0) {
    return { repaired: false, totalTurnCost: 0, items: [] };
  }

  const itemCosts = damaged.map((d) => ({
    ...d,
    turnCost: repairTurnCost(d.current),
  }));
  const totalTurnCost = itemCosts.reduce((sum, ic) => sum + ic.turnCost, 0);

  const turnSpend = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

  const repairedItems = [];
  for (const ic of itemCosts) {
    const { newMax, decay } = await repairItemDurability(
      tx,
      { ...ic.item, ownerId: playerId },
      randomFn,
    );

    repairedItems.push({
      itemId: ic.item.id,
      name: ic.item.template.name,
      slot: ic.slot,
      turnCost: ic.turnCost,
      currentDurability: newMax,
      maxDurability: newMax,
      maxDurabilityDecay: decay,
    });
  }

  return { repaired: true, turns: turnSpend, totalTurnCost, items: repairedItems };
}
