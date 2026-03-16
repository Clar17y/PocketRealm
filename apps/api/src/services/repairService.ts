import type { Prisma } from '@pocketrealm/database';
import { DURABILITY_CONSTANTS, repairTurnCost, type ItemRarity } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';

export { repairTurnCost };

const REPAIR_DECAY = DURABILITY_CONSTANTS.REPAIR_MAX_DECAY_BY_RARITY;

/** Apply durability repair to a single item inside a transaction. */
export async function repairItemDurability(
  tx: Prisma.TransactionClient,
  item: {
    id: string;
    ownerId: string;
    currentDurability: number | null;
    maxDurability: number | null;
    rarity: string;
    template: { maxDurability: number };
  },
  randomFn: () => number = Math.random,
): Promise<{ newMax: number; decay: number; destroyed: boolean }> {
  const max = item.maxDurability ?? item.template.maxDurability;
  const rarity = item.rarity as ItemRarity;
  const maxDecay = rarity in REPAIR_DECAY ? REPAIR_DECAY[rarity] : 5;
  const decay = Math.min(
    maxDecay,
    Math.max(1, Math.floor(randomFn() * (maxDecay + 1))),
  );
  const newMax = Math.max(DURABILITY_CONSTANTS.MIN_MAX_DURABILITY, max - decay);

  if (newMax <= 0) {
    // Item destroyed — unequip and delete
    await tx.playerEquipment.updateMany({
      where: { itemId: item.id },
      data: { itemId: null },
    });
    await tx.item.delete({ where: { id: item.id } });
    return { newMax: 0, decay, destroyed: true };
  }

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

  return { newMax, decay, destroyed: false };
}

interface RepairEquippedResult {
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
    destroyed: boolean;
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
    turnCost: repairTurnCost(d.item.template.tier, d.current <= 0),
  }));
  const totalTurnCost = itemCosts.reduce((sum, ic) => sum + ic.turnCost, 0);

  const turnSpend = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

  const repairedItems = [];
  for (const ic of itemCosts) {
    const { newMax, decay, destroyed } = await repairItemDurability(
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
      destroyed,
    });
  }

  return { repaired: true, turns: turnSpend, totalTurnCost, items: repairedItems };
}
