import { prisma } from '@pocketrealm/database';
import type { PlayerBuffData } from '@pocketrealm/shared';

export async function getActiveBuffs(playerId: string): Promise<PlayerBuffData[]> {
  const buffs = await (prisma as any).playerBuff.findMany({
    where: { playerId },
    include: { shopItem: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return buffs.map((b: any) => ({
    id: b.id,
    buffType: b.buffType,
    remainingUses: b.remainingUses,
    bonusValue: b.bonusValue,
    shopItemName: b.shopItem.name,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function getBuffValue(playerId: string, buffType: string): Promise<number> {
  const buff = await (prisma as any).playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { bonusValue: true },
  });
  return buff?.bonusValue ?? 0;
}

export async function hasActiveBuff(playerId: string, buffType: string): Promise<boolean> {
  const buff = await (prisma as any).playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { id: true },
  });
  return buff !== null;
}

/**
 * Decrement a buff's remaining uses. Deletes the buff when it hits 0.
 * Must be called within a Prisma transaction.
 */
export async function consumeBuff(tx: any, playerId: string, buffType: string): Promise<void> {
  const updated = await tx.playerBuff.update({
    where: { playerId_buffType: { playerId, buffType } },
    data: { remainingUses: { decrement: 1 } },
  });
  if (updated.remainingUses <= 0) {
    await tx.playerBuff.delete({ where: { id: updated.id } });
  }
}

/**
 * Check for an active buff and consume one use if it exists.
 * Returns the bonus value (0 if no buff).
 * Must be called within a Prisma transaction.
 */
export async function consumeBuffIfActive(tx: any, playerId: string, buffType: string): Promise<number> {
  const buff = await tx.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { bonusValue: true, remainingUses: true, id: true },
  });
  if (!buff) return 0;

  const newUses = buff.remainingUses - 1;
  if (newUses <= 0) {
    await tx.playerBuff.delete({ where: { id: buff.id } });
  } else {
    await tx.playerBuff.update({
      where: { id: buff.id },
      data: { remainingUses: newUses },
    });
  }
  return buff.bonusValue;
}
