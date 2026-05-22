import { Prisma, prisma } from '@pocketrealm/database';
import type { CraftMark, EquipmentActionModifier, EquipmentSlot, ItemStatModifier, SkillType } from '@pocketrealm/shared';
import { ALL_EQUIPMENT_SLOTS, ALL_SKILLS, getEquipmentActionModifiers, parseCraftMarks } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { cachedQuery, invalidateCache } from './cacheService';

const equipmentCacheKey = (playerId: string) => `equipment:stats:${playerId}`;

/** Invalidate the equipment stats cache for a player. Call after transactions commit. */
export async function invalidateEquipmentCache(playerId: string): Promise<void> {
  await invalidateCache(equipmentCacheKey(playerId));
}

export interface EquipmentStats {
  attack: number;
  rangedPower: number;
  magicPower: number;
  accuracy: number;
  armor: number;
  magicDefence: number;
  health: number;
  dodge: number;
  luck: number;
  critChance: number;
  critDamage: number;
  inventorySlots: number;
  actionModifiers?: EquipmentActionModifier[];
}

type NumericEquipmentStatKey = Exclude<keyof EquipmentStats, 'actionModifiers'>;
type StatTotals = Record<NumericEquipmentStatKey, number>;

const NUMERIC_EQUIPMENT_STAT_KEYS: readonly NumericEquipmentStatKey[] = [
  'attack',
  'rangedPower',
  'magicPower',
  'accuracy',
  'armor',
  'magicDefence',
  'health',
  'dodge',
  'luck',
  'critChance',
  'critDamage',
  'inventorySlots',
];

export function isSkillType(value: string): value is SkillType {
  return ALL_SKILLS.includes(value as SkillType);
}

export async function ensureEquipmentSlots(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const existing = await db.playerEquipment.findMany({
    where: { playerId },
    select: { slot: true },
  });

  const existingSlots = new Set(existing.map((e: typeof existing[number]) => e.slot));
  const missing = ALL_EQUIPMENT_SLOTS.filter((slot) => !existingSlots.has(slot));
  if (missing.length === 0) return;

  await db.playerEquipment.createMany({
    data: missing.map((slot) => ({ playerId, slot, itemId: null })),
  });
}

/** Fetch the item currently in an equipment slot (with template), or null if empty. */
export async function getEquippedItemInSlot(playerId: string, slot: EquipmentSlot) {
  await ensureEquipmentSlots(playerId);
  const row = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot } },
    include: { item: { include: { template: true } } },
  });
  return row?.item ?? null;
}

export async function getEquipmentStats(playerId: string): Promise<EquipmentStats> {
  return cachedQuery(equipmentCacheKey(playerId), () => computeEquipmentStats(playerId), 600);
}

async function computeEquipmentStats(playerId: string): Promise<EquipmentStats> {
  const equipped = await prisma.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    select: {
      slot: true,
      item: {
        select: {
          currentDurability: true,
          bonusStats: true,
          craftMarks: true,
          template: {
            select: {
              baseStats: true,
              maxDurability: true,
            },
          },
        },
      },
    },
  });

  const totals = createEmptyStatTotals();
  const actionModifiers: EquipmentActionModifier[] = [];

  for (const slot of equipped) {
    // Broken gear contributes zero stats
    const cur = slot.item?.currentDurability ?? slot.item?.template?.maxDurability ?? 1;
    if (cur <= 0) continue;

    const craftMarks = parseCraftMarks(slot.item?.craftMarks);
    actionModifiers.push(...getEquipmentActionModifiers({
      slot: slot.slot,
      craftMarks,
    }));

    const baseStats = slot.item?.template?.baseStats as Record<string, unknown> | null | undefined;
    const bonusStats = slot.item?.bonusStats as Record<string, unknown> | null | undefined;
    const itemStats = readItemStats([baseStats, bonusStats]);
    applyCraftMarkStatModifiers(itemStats, craftMarks);

    for (const key of NUMERIC_EQUIPMENT_STAT_KEYS) {
      totals[key] += itemStats[key];
    }
  }

  return { ...totals, actionModifiers };
}

function createEmptyStatTotals(): StatTotals {
  return {
    attack: 0,
    rangedPower: 0,
    magicPower: 0,
    accuracy: 0,
    armor: 0,
    magicDefence: 0,
    health: 0,
    dodge: 0,
    luck: 0,
    critChance: 0,
    critDamage: 0,
    inventorySlots: 0,
  };
}

function readItemStats(statSources: ReadonlyArray<Record<string, unknown> | null | undefined>): StatTotals {
  const itemStats = createEmptyStatTotals();
  for (const stats of statSources) {
    if (!stats) continue;
    for (const key of NUMERIC_EQUIPMENT_STAT_KEYS) {
      const value = stats[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        itemStats[key] += value;
      }
    }
  }
  return itemStats;
}

function applyCraftMarkStatModifiers(
  itemStats: StatTotals,
  craftMarks: readonly CraftMark[],
): void {
  const baseItemStats = { ...itemStats };
  for (const mark of craftMarks) {
    for (const modifier of mark.itemStatBenefits ?? []) {
      applyCraftMarkStatModifier(itemStats, baseItemStats, modifier);
    }
    for (const modifier of mark.itemStatDrawbacks ?? []) {
      applyCraftMarkStatModifier(itemStats, baseItemStats, modifier);
    }
  }
}

function applyCraftMarkStatModifier(
  itemStats: StatTotals,
  baseItemStats: StatTotals,
  modifier: ItemStatModifier,
): void {
  itemStats[modifier.stat] += modifier.isPercent
    ? baseItemStats[modifier.stat] * modifier.value
    : modifier.value;
}

export async function equipItem(
  playerId: string,
  itemId: string,
  slot: EquipmentSlot
): Promise<void> {
  await ensureEquipmentSlots(playerId);

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { template: true },
  });

  if (!item || item.ownerId !== playerId) {
    throw new AppError(404, 'Item not found', 'NOT_FOUND');
  }

  if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
    throw new AppError(400, 'Only weapons/armor can be equipped', 'INVALID_ITEM_TYPE');
  }

  if (!item.template.slot) {
    throw new AppError(400, 'Item is not equipable', 'NOT_EQUIPABLE');
  }

  if (item.template.slot !== slot) {
    throw new AppError(400, `Item must be equipped in slot ${item.template.slot}`, 'INVALID_SLOT');
  }

  if (item.quantity !== 1) {
    throw new AppError(400, 'Cannot equip stacked items', 'INVALID_STACK');
  }

  // Armor is gated by character level only.
  if (item.template.itemType === 'armor') {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { characterLevel: true },
    });
    if (!player) {
      throw new AppError(404, 'Player not found', 'NOT_FOUND');
    }
    if (player.characterLevel < item.template.requiredLevel) {
      throw new AppError(400, `Insufficient character level to equip ${item.template.slot ?? 'armor'} (requires level ${item.template.requiredLevel})`, 'INSUFFICIENT_LEVEL');
    }
  } else if (item.template.requiredSkill) {
    // Weapons still use skill-based requirements.
    if (!isSkillType(item.template.requiredSkill)) {
      throw new AppError(400, 'Item template has invalid requiredSkill', 'INVALID_TEMPLATE');
    }

    const skill = await prisma.playerSkill.findUnique({
      where: {
        playerId_skillType: { playerId, skillType: item.template.requiredSkill },
      },
      select: { level: true },
    });

    const level = skill?.level ?? 1;
    if (level < item.template.requiredLevel) {
      throw new AppError(400, 'Insufficient skill level to equip item', 'INSUFFICIENT_LEVEL');
    }
  }

  // Ensure the item isn't equipped in another slot (same player)
  await prisma.playerEquipment.updateMany({
    where: { playerId, itemId },
    data: { itemId: null },
  });

  await prisma.playerEquipment.upsert({
    where: { playerId_slot: { playerId, slot } },
    create: { playerId, slot, itemId },
    update: { itemId },
  });

  await invalidateCache(equipmentCacheKey(playerId));
}

export async function unequipSlot(playerId: string, slot: EquipmentSlot): Promise<void> {
  await ensureEquipmentSlots(playerId);

  await prisma.playerEquipment.update({
    where: { playerId_slot: { playerId, slot } },
    data: { itemId: null },
  });

  await invalidateCache(equipmentCacheKey(playerId));
}

