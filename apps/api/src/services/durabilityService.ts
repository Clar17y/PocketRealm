import { Prisma, prisma } from '@pocketrealm/database';
import { DURABILITY_CONSTANTS, type CombatLogEntry, type CombatActor, type DurabilityLoss } from '@pocketrealm/shared';
import { equipmentCacheKey } from './equipmentService';
import { invalidateCache } from './cacheService';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type CombatHitEntry = Pick<CombatLogEntry, 'actor' | 'damage' | 'evaded'>;

/** Count hits that landed from a combat log for durability degradation. */
export function countCombatHits(log: CombatHitEntry[]): {
  playerHitsLanded: number;
  mobHitsLanded: number;
} {
  let playerHitsLanded = 0;
  let mobHitsLanded = 0;
  for (const entry of log) {
    if (!entry.evaded && entry.damage !== undefined) {
      if (entry.actor === 'combatantA') playerHitsLanded++;
      else if (entry.actor === 'combatantB') mobHitsLanded++;
    }
  }
  return { playerHitsLanded, mobHitsLanded };
}

/**
 * Degrade equipped durability based on a combat log.
 * `perspective` controls which combatant the player is:
 *  - 'combatantA' (default): player attacks → weapon wear, enemy attacks → armor wear
 *  - 'combatantB': flipped for PvP defenders
 */
export async function degradeEquippedDurability(
  playerId: string,
  combatLog: CombatHitEntry[],
  perspective: CombatActor = 'combatantA',
  degradationMultiplier: number = 1,
): Promise<DurabilityLoss[]> {
  const hits = countCombatHits(combatLog);
  const myHits = perspective === 'combatantA' ? hits.playerHitsLanded : hits.mobHitsLanded;
  const theirHits = perspective === 'combatantA' ? hits.mobHitsLanded : hits.playerHitsLanded;
  const weaponDegradation = round2(myHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);
  const armorDegradation = round2(theirHits * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);

  if (weaponDegradation <= 0 && armorDegradation <= 0) return [];

  const equipped = await prisma.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    include: {
      item: { include: { template: true } },
    },
  });

  const losses: DurabilityLoss[] = [];
  const uniqueItems = new Map<string, (typeof equipped)[number]['item']>();
  for (const eq of equipped) {
    if (eq.item) uniqueItems.set(eq.item.id, eq.item);
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const item of uniqueItems.values()) {
      if (!item) continue;

      const template = item.template;
      const isWeapon = template.itemType === 'weapon';
      const isArmor = template.itemType === 'armor';
      if (!isWeapon && !isArmor) continue;

      const amount = isWeapon ? weaponDegradation : armorDegradation;
      if (amount <= 0) continue;

      const maxDurability = item.maxDurability ?? template.maxDurability;
      const currentDurability = item.currentDurability ?? maxDurability;

      // Normalize persisted values if missing
      if (item.maxDurability === null || item.currentDurability === null) {
        await tx.item.update({
          where: { id: item.id },
          data: {
            maxDurability,
            currentDurability,
          },
        });
      }

      const newCurrent = round2(Math.max(0, currentDurability - amount));

      const wasBroken = currentDurability <= 0;
      const nowBroken = newCurrent <= 0;
      const warningThreshold = maxDurability * DURABILITY_CONSTANTS.WARNING_THRESHOLD;
      const crossedWarning =
        !nowBroken &&
        currentDurability > warningThreshold &&
        newCurrent <= warningThreshold;

      losses.push({
        itemId: item.id,
        amount: round2(amount),
        itemName: template.name,
        newDurability: newCurrent,
        maxDurability,
        isBroken: nowBroken && !wasBroken,
        crossedWarningThreshold: crossedWarning,
      });

      if (newCurrent === currentDurability) continue;

      await tx.item.update({
        where: { id: item.id },
        data: { currentDurability: newCurrent },
      });
    }
  });

  await invalidateCache(equipmentCacheKey(playerId));

  return losses;
}
