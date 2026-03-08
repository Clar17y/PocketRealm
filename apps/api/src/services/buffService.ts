import { prisma } from '@pocketrealm/database';
import type { PlayerBuffData } from '@pocketrealm/shared';

export interface CombatBuffs {
  damageBoost: number;
  defenceBoost: number;
  durabilityShield: number;
}

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

/** Fetch all combat-related buff values for a player. */
export async function getCombatBuffs(playerId: string): Promise<CombatBuffs> {
  const [damageBoost, defenceBoost, durabilityShield] = await Promise.all([
    getBuffValue(playerId, 'combat_damage'),
    getBuffValue(playerId, 'combat_defence'),
    getBuffValue(playerId, 'durability_shield'),
  ]);
  return { damageBoost, defenceBoost, durabilityShield };
}

/** Apply combat buffs to player stats before combat resolution. Mutates in place. */
export function applyCombatBuffs(
  playerStats: { damageMin: number; damageMax: number; defence: number },
  buffs: { damageBoost: number; defenceBoost: number },
): void {
  if (buffs.damageBoost > 0) {
    playerStats.damageMin = Math.floor(playerStats.damageMin * (1 + buffs.damageBoost));
    playerStats.damageMax = Math.floor(playerStats.damageMax * (1 + buffs.damageBoost));
  }
  if (buffs.defenceBoost > 0) {
    playerStats.defence = Math.floor(playerStats.defence * (1 + buffs.defenceBoost));
  }
}

/** Consume all active combat buffs in a transaction. */
export async function consumeCombatBuffs(
  tx: any,
  playerId: string,
  buffs: CombatBuffs,
): Promise<void> {
  if (buffs.damageBoost > 0) await consumeBuffIfActive(tx, playerId, 'combat_damage');
  if (buffs.defenceBoost > 0) await consumeBuffIfActive(tx, playerId, 'combat_defence');
  if (buffs.durabilityShield > 0) await consumeBuffIfActive(tx, playerId, 'durability_shield');
}

/** Consume a buff in its own transaction when the caller has no transaction context. */
export async function consumeBuffStandalone(playerId: string, buffType: string): Promise<void> {
  await (prisma as any).$transaction(async (tx: any) => {
    await consumeBuffIfActive(tx, playerId, buffType);
  });
}
