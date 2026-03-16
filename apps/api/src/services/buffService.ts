import { prisma, Prisma } from '@pocketrealm/database';
import type { PlayerBuffData } from '@pocketrealm/shared';

export interface CombatBuffs {
  damageBoost: number;
  defenceBoost: number;
  durabilityShield: number;
}

export async function getActiveBuffs(playerId: string): Promise<PlayerBuffData[]> {
  const buffs = await prisma.playerBuff.findMany({
    where: { playerId },
    include: { shopItem: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return buffs.map((b) => ({
    id: b.id,
    buffType: b.buffType,
    remainingUses: b.remainingUses,
    bonusValue: b.bonusValue,
    shopItemName: b.shopItem.name,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function getBuffValue(playerId: string, buffType: string): Promise<number> {
  const buff = await prisma.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { bonusValue: true },
  });
  return buff?.bonusValue ?? 0;
}

export async function hasActiveBuff(playerId: string, buffType: string): Promise<boolean> {
  const buff = await prisma.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { id: true },
  });
  return buff !== null;
}

/**
 * Decrement a buff's remaining uses. Deletes the buff when it hits 0.
 * Must be called within a Prisma transaction.
 */
export async function consumeBuff(tx: Prisma.TransactionClient, playerId: string, buffType: string): Promise<void> {
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
export async function consumeBuffIfActive(tx: Prisma.TransactionClient, playerId: string, buffType: string): Promise<number> {
  const buff = await tx.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { bonusValue: true, id: true },
  });
  if (!buff) return 0;

  const updated = await tx.playerBuff.update({
    where: { id: buff.id },
    data: { remainingUses: { decrement: 1 } },
  });
  if (updated.remainingUses <= 0) {
    await tx.playerBuff.delete({ where: { id: buff.id } });
  }
  return buff.bonusValue;
}

/** Fetch all combat-related buff values for a player (single query). */
export async function getCombatBuffs(playerId: string): Promise<CombatBuffs> {
  const buffs = await prisma.playerBuff.findMany({
    where: { playerId, buffType: { in: ['combat_damage', 'combat_defence', 'durability_shield'] } },
    select: { buffType: true, bonusValue: true },
  });
  const map = new Map<string, number>(buffs.map((b) => [b.buffType, b.bonusValue]));
  return {
    damageBoost: map.get('combat_damage') ?? 0,
    defenceBoost: map.get('combat_defence') ?? 0,
    durabilityShield: map.get('durability_shield') ?? 0,
  };
}

interface CombatBuffRemainingUses {
  damage: number;
  defence: number;
  durability: number;
}

/** Fetch combat buff bonus values AND remaining use counts in a single query. */
export async function getCombatBuffsWithUses(playerId: string): Promise<{ buffs: CombatBuffs; uses: CombatBuffRemainingUses }> {
  const rows = await prisma.playerBuff.findMany({
    where: { playerId, buffType: { in: ['combat_damage', 'combat_defence', 'durability_shield'] } },
    select: { buffType: true, bonusValue: true, remainingUses: true },
  });
  const buffs: CombatBuffs = { damageBoost: 0, defenceBoost: 0, durabilityShield: 0 };
  const uses: CombatBuffRemainingUses = { damage: 0, defence: 0, durability: 0 };
  for (const b of rows) {
    if (b.buffType === 'combat_damage') { buffs.damageBoost = b.bonusValue; uses.damage = b.remainingUses; }
    if (b.buffType === 'combat_defence') { buffs.defenceBoost = b.bonusValue; uses.defence = b.remainingUses; }
    if (b.buffType === 'durability_shield') { buffs.durabilityShield = b.bonusValue; uses.durability = b.remainingUses; }
  }
  return { buffs, uses };
}

/** Consume one charge of each active combat buff. Mutates `uses` in place. */
export async function consumeBuffChargesPerMob(
  tx: Prisma.TransactionClient,
  playerId: string,
  uses: CombatBuffRemainingUses,
): Promise<void> {
  if (uses.damage > 0) { await consumeBuffIfActive(tx, playerId, 'combat_damage'); uses.damage--; }
  if (uses.defence > 0) { await consumeBuffIfActive(tx, playerId, 'combat_defence'); uses.defence--; }
  if (uses.durability > 0) { await consumeBuffIfActive(tx, playerId, 'durability_shield'); uses.durability--; }
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
  tx: Prisma.TransactionClient,
  playerId: string,
  buffs: CombatBuffs,
): Promise<void> {
  if (buffs.damageBoost > 0) await consumeBuffIfActive(tx, playerId, 'combat_damage');
  if (buffs.defenceBoost > 0) await consumeBuffIfActive(tx, playerId, 'combat_defence');
  if (buffs.durabilityShield > 0) await consumeBuffIfActive(tx, playerId, 'durability_shield');
}

/** Consume a buff in its own transaction when the caller has no transaction context. */
export async function consumeBuffStandalone(playerId: string, buffType: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await consumeBuffIfActive(tx, playerId, buffType);
  });
}

export interface CombatBuffBadge {
  title: string;
  effectType: string;
  effectValue: number;
  isGlobal: boolean;
  appliedToThisMob: boolean;
}

/** Build event-style badges for active combat buffs. */
export function buildCombatBuffBadges(buffs: CombatBuffs): CombatBuffBadge[] {
  const badges: CombatBuffBadge[] = [];
  if (buffs.damageBoost > 0) {
    badges.push({ title: 'Combat Power Scroll', effectType: 'player_damage_up', effectValue: buffs.damageBoost, isGlobal: false, appliedToThisMob: true });
  }
  if (buffs.defenceBoost > 0) {
    badges.push({ title: 'Iron Skin Scroll', effectType: 'player_defence_up', effectValue: buffs.defenceBoost, isGlobal: false, appliedToThisMob: true });
  }
  if (buffs.durabilityShield > 0) {
    badges.push({ title: 'Durability Shield Scroll', effectType: 'durability_shield', effectValue: buffs.durabilityShield, isGlobal: false, appliedToThisMob: true });
  }
  return badges;
}
