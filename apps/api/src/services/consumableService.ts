import { prisma } from '@pocketrealm/database';
import type { ConsumableEffect, ConsumableEffectType } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getHpState } from './hpService';

const COMBAT_ONLY_EFFECT_TYPES: ReadonlySet<ConsumableEffectType> = new Set([
  'restore_stamina', 'restore_mana', 'cleanse_magic_dot', 'buff_attack', 'buff_defence',
]);

export interface UseConsumableResult {
  itemName: string;
  previousHp: number;
  currentHp: number;
  maxHp: number;
  healedAmount: number;
  remainingQuantity: number | null;
}

export async function useConsumable(
  playerId: string,
  itemId: string,
  now: Date = new Date()
): Promise<UseConsumableResult> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { template: true },
  });

  if (!item || item.ownerId !== playerId) {
    throw new AppError(404, 'Item not found', 'NOT_FOUND');
  }

  if (item.template.itemType !== 'consumable') {
    throw new AppError(400, 'Item is not a consumable', 'INVALID_ITEM_TYPE');
  }

  const effect = item.template.consumableEffect as ConsumableEffect | null;
  if (!effect) {
    throw new AppError(400, 'This consumable has no usable effect yet', 'NO_EFFECT');
  }

  if (COMBAT_ONLY_EFFECT_TYPES.has(effect.type)) {
    throw new AppError(400, 'This potion can only be used in combat', 'COMBAT_ONLY');
  }

  const hpState = await getHpState(playerId, now);

  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot use potions while knocked out', 'IS_RECOVERING');
  }

  if (hpState.currentHp >= hpState.maxHp) {
    throw new AppError(400, 'Already at full HP', 'FULL_HP');
  }

  let healAmount: number;
  if (effect.type === 'heal_flat') {
    healAmount = effect.value;
  } else {
    healAmount = Math.floor(hpState.maxHp * effect.value);
  }

  const newHp = Math.min(hpState.maxHp, hpState.currentHp + healAmount);
  const actualHealed = newHp - hpState.currentHp;

  const result = await prisma.$transaction(async (tx) => {
    // Fetch fresh player row for optimistic lock
    const player = await tx.player.findUnique({
      where: { id: playerId },
      select: { currentHp: true, lastHpRegenAt: true, isRecovering: true },
    });

    if (!player) {
      throw new AppError(404, 'Player not found', 'NOT_FOUND');
    }

    // Apply HP update with optimistic locking
    const updated = await tx.player.updateMany({
      where: {
        id: playerId,
        currentHp: player.currentHp,
        lastHpRegenAt: player.lastHpRegenAt,
        isRecovering: false,
      },
      data: {
        currentHp: newHp,
        lastHpRegenAt: now,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(409, 'HP state changed; try again', 'HP_STATE_CHANGED');
    }

    // Decrement item quantity or delete
    let remainingQuantity: number | null = null;
    if (item.quantity > 1) {
      const updatedItem = await tx.item.update({
        where: { id: item.id },
        data: { quantity: item.quantity - 1 },
      });
      remainingQuantity = updatedItem.quantity;
    } else {
      await tx.item.delete({ where: { id: item.id } });
    }

    return remainingQuantity;
  });

  return {
    itemName: item.template.name,
    previousHp: hpState.currentHp,
    currentHp: newHp,
    maxHp: hpState.maxHp,
    healedAmount: actualHealed,
    remainingQuantity: result,
  };
}
