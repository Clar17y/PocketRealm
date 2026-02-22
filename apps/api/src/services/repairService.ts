import type { Prisma } from '@adventure/database';
import { DURABILITY_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';

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
    turnCost: d.current <= 0
      ? DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST
      : DURABILITY_CONSTANTS.REPAIR_TURN_COST,
  }));
  const totalTurnCost = itemCosts.reduce((sum, ic) => sum + ic.turnCost, 0);

  const turnSpend = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

  const repairedItems = [];
  for (const ic of itemCosts) {
    const max = ic.item.maxDurability ?? ic.item.template.maxDurability;
    const decay = Math.min(
      DURABILITY_CONSTANTS.REPAIR_MAX_DECAY,
      Math.max(1, Math.floor(randomFn() * (DURABILITY_CONSTANTS.REPAIR_MAX_DECAY + 1))),
    );
    const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

    const updated = await tx.item.updateMany({
      where: {
        id: ic.item.id,
        ownerId: playerId,
        currentDurability: ic.item.currentDurability,
        maxDurability: ic.item.maxDurability,
      },
      data: { maxDurability: newMax, currentDurability: newMax },
    });
    if (updated.count !== 1) {
      throw new AppError(409, 'Item durability changed; try again', 'ITEM_STATE_CHANGED');
    }

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
