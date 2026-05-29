import { Prisma, prisma } from '@pocketrealm/database';
import {
  DURABILITY_CONSTANTS,
  getEquipmentActionModifiers,
  parseCraftMarks,
  type CombatLogEntry,
  type CombatActor,
  type DurabilityLoss,
} from '@pocketrealm/shared';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { applyEquipmentActionModifiers } from '@pocketrealm/game-engine';
import { invalidateEquipmentCache } from './equipmentService';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type CombatHitEntry = Pick<CombatLogEntry, 'actor' | 'damage' | 'evaded'> & {
  combatantAAction?: string;
  combatantBAction?: string;
};

type WeaponActionId = string | null;

interface DurabilityHitCounts {
  playerHitsLanded: number;
  mobHitsLanded: number;
  playerWeaponActionIds: WeaponActionId[];
  mobWeaponActionIds: WeaponActionId[];
}

export interface DurabilityEquipmentSnapshotItem {
  itemId: string;
  slot: string;
  itemName: string;
  itemType: string;
  currentDurability: number | null;
  maxDurability: number | null;
  templateMaxDurability: number;
  craftMarks: unknown;
}

/** Count hits that landed from a combat log for durability degradation. */
export function countCombatHits(log: CombatHitEntry[]): {
  playerHitsLanded: number;
  mobHitsLanded: number;
} {
  const counts = countCombatWear(log);
  return {
    playerHitsLanded: counts.playerHitsLanded,
    mobHitsLanded: counts.mobHitsLanded,
  };
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
  const hits = countCombatWear(combatLog);
  const myHits = perspective === 'combatantA' ? hits.playerHitsLanded : hits.mobHitsLanded;
  const theirHits = perspective === 'combatantA' ? hits.mobHitsLanded : hits.playerHitsLanded;
  const myWeaponActionIds = perspective === 'combatantA' ? hits.playerWeaponActionIds : hits.mobWeaponActionIds;

  return degradeEquippedDurabilityByHits(playerId, myHits, theirHits, degradationMultiplier, {
    weaponActionIds: myWeaponActionIds,
  });
}

/**
 * Degrade equipped durability from pre-counted hit totals.
 * Used by encounter site / raid combat where the log format differs from 1v1.
 */
export async function degradeEquippedDurabilityByHits(
  playerId: string,
  playerHitsLanded: number,
  mobHitsLanded: number,
  degradationMultiplier: number = 1,
  options: {
    weaponActionIds?: readonly WeaponActionId[];
    equipmentSnapshot?: readonly DurabilityEquipmentSnapshotItem[];
  } = {},
): Promise<DurabilityLoss[]> {
  const weaponBaseDegradation = DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier;
  const weaponActionIds = normalizeWeaponActionIds(playerHitsLanded, options.weaponActionIds);
  const weaponDegradation = round2(playerHitsLanded * weaponBaseDegradation);
  const armorDegradation = round2(mobHitsLanded * DURABILITY_CONSTANTS.COMBAT_DEGRADATION * degradationMultiplier);

  if (weaponDegradation <= 0 && armorDegradation <= 0) return [];

  const equipped = options.equipmentSnapshot ?? await getEquippedDurabilitySnapshot(playerId);

  const losses: DurabilityLoss[] = [];
  const uniqueItems = new Map<string, DurabilityEquipmentSnapshotItem>();
  for (const item of equipped) {
    uniqueItems.set(item.itemId, item);
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const equippedItem of uniqueItems.values()) {
      const isWeapon = equippedItem.itemType === 'weapon';
      const isArmor = equippedItem.itemType === 'armor';
      if (!isWeapon && !isArmor) continue;

      const amount = isWeapon
        ? calculateWeaponWearAmount(equippedItem, weaponBaseDegradation, weaponActionIds)
        : armorDegradation;
      if (amount <= 0) continue;

      const maxDurability = equippedItem.maxDurability ?? equippedItem.templateMaxDurability;
      const currentDurability = equippedItem.currentDurability ?? maxDurability;

      // Normalize persisted values if missing
      if (equippedItem.maxDurability === null || equippedItem.currentDurability === null) {
        await tx.item.update({
          where: { id: equippedItem.itemId },
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
        itemId: equippedItem.itemId,
        amount: round2(amount),
        itemName: equippedItem.itemName,
        newDurability: newCurrent,
        maxDurability,
        isBroken: nowBroken && !wasBroken,
        crossedWarningThreshold: crossedWarning,
      });

      if (newCurrent === currentDurability) continue;

      await tx.item.update({
        where: { id: equippedItem.itemId },
        data: { currentDurability: newCurrent },
      });
    }
  });

  await invalidateEquipmentCache(playerId);

  return losses;
}

export async function getEquippedDurabilitySnapshot(playerId: string): Promise<DurabilityEquipmentSnapshotItem[]> {
  const equipped = await prisma.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    include: {
      item: { include: { template: true } },
    },
  });

  return equipped.flatMap((entry): DurabilityEquipmentSnapshotItem[] => {
    if (!entry.item) return [];
    return [{
      itemId: entry.item.id,
      slot: entry.slot,
      itemName: entry.item.template.name,
      itemType: entry.item.template.itemType,
      currentDurability: entry.item.currentDurability,
      maxDurability: entry.item.maxDurability,
      templateMaxDurability: entry.item.template.maxDurability,
      craftMarks: entry.item.craftMarks,
    }];
  });
}

function countCombatWear(log: CombatHitEntry[]): DurabilityHitCounts {
  let playerHitsLanded = 0;
  let mobHitsLanded = 0;
  const playerWeaponActionIds: WeaponActionId[] = [];
  const mobWeaponActionIds: WeaponActionId[] = [];

  for (const entry of log) {
    if (entry.evaded || entry.damage === undefined) continue;

    if (entry.actor === 'combatantA') {
      playerHitsLanded++;
      playerWeaponActionIds.push(entry.combatantAAction ?? null);
    } else if (entry.actor === 'combatantB') {
      mobHitsLanded++;
      mobWeaponActionIds.push(entry.combatantBAction ?? null);
    }
  }

  return { playerHitsLanded, mobHitsLanded, playerWeaponActionIds, mobWeaponActionIds };
}

function normalizeWeaponActionIds(
  hitCount: number,
  actionIds: readonly WeaponActionId[] | undefined,
): WeaponActionId[] {
  return Array.from({ length: Math.max(0, hitCount) }, (_entry, index) => actionIds?.[index] ?? null);
}

function calculateWeaponWearAmount(
  item: DurabilityEquipmentSnapshotItem,
  baseDegradation: number,
  actionIds: readonly WeaponActionId[],
): number {
  if (actionIds.length === 0 || baseDegradation <= 0) return 0;

  const modifiers = getEquipmentActionModifiers({
    slot: item.slot,
    craftMarks: parseCraftMarks(item.craftMarks),
  });
  if (modifiers.length === 0) return round2(actionIds.length * baseDegradation);

  let total = 0;
  for (const actionId of actionIds) {
    if (!actionId) {
      total += baseDegradation;
      continue;
    }

    const action = BASE_ACTION_DEFINITIONS[actionId];
    if (!action) {
      total += baseDegradation;
      continue;
    }

    const modified = applyEquipmentActionModifiers({ action, modifiers });
    total += baseDegradation * sanitizeWearMultiplier(modified.durabilityWearMultiplier);
  }

  return round2(total);
}

function sanitizeWearMultiplier(multiplier: number | undefined): number {
  return typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0
    ? multiplier
    : 1;
}
