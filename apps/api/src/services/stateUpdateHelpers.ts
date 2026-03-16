import { prisma } from '@pocketrealm/database';
import type { InventoryItemDTO, SkillStateDTO, StateUpdates, BuffStateDTO } from '@pocketrealm/shared';
import { getHpState } from './hpService.js';
import { getResourceState } from './resourceService.js';
import { getInventoryState } from './inventoryService.js';

// ---------------------------------------------------------------------------
// Prisma item+template join type
// ---------------------------------------------------------------------------

type PrismaItemWithTemplate = NonNullable<
  Awaited<ReturnType<typeof prisma.item.findFirst<{ include: { template: true } }>>>
>;

/** Input type accepted by toInventoryItemDTO — the Prisma shape with optional extras. */
type ItemWithTemplateInput = Omit<PrismaItemWithTemplate, 'bonusStats'> & {
  bonusStats?: Record<string, number> | null;
};

// ---------------------------------------------------------------------------
// toInventoryItemDTO
// ---------------------------------------------------------------------------

/**
 * Convert a Prisma item+template join result to an InventoryItemDTO.
 * Strips Prisma-only fields (inStash, consumableEffect, etc.) and converts
 * Date createdAt to an ISO string.
 */
export function toInventoryItemDTO(
  item: ItemWithTemplateInput,
  equippedSlot: string | null = null,
): InventoryItemDTO {
  return {
    id: item.id,
    templateId: item.templateId,
    ownerId: item.ownerId,
    rarity: item.rarity as InventoryItemDTO['rarity'],
    currentDurability: item.currentDurability,
    maxDurability: item.maxDurability,
    quantity: item.quantity,
    bonusStats: item.bonusStats ?? null,
    createdAt: item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : String(item.createdAt),
    template: {
      id: item.template.id,
      name: item.template.name,
      itemType: item.template.itemType,
      weightClass: item.template.weightClass as InventoryItemDTO['template']['weightClass'],
      slot: item.template.slot,
      tier: item.template.tier,
      baseStats: item.template.baseStats as Record<string, unknown>,
      requiredSkill: item.template.requiredSkill,
      requiredLevel: item.template.requiredLevel,
      maxDurability: item.template.maxDurability,
      stackable: item.template.stackable,
      sellPrice: item.template.sellPrice,
    },
    equippedSlot,
  };
}

// ---------------------------------------------------------------------------
// toSkillStateDTO
// ---------------------------------------------------------------------------

type PrismaPlayerSkill = {
  id: string;
  skillType: string;
  level: number;
  xp: bigint;
  dailyXpGained: number;
};

/**
 * Convert a Prisma PlayerSkill row to a SkillStateDTO.
 * Converts BigInt xp to a Number.
 */
export function toSkillStateDTO(skill: PrismaPlayerSkill): SkillStateDTO {
  return {
    id: skill.id,
    skillType: skill.skillType,
    level: skill.level,
    xp: Number(skill.xp),
    dailyXpGained: skill.dailyXpGained,
  };
}

// ---------------------------------------------------------------------------
// fetchItemDTOs
// ---------------------------------------------------------------------------

/**
 * Fetch items by IDs with template join, return as DTOs.
 * @param itemIds - Item IDs to fetch.
 * @param equippedSlotMap - Optional map of itemId → slot name.
 */
export async function fetchItemDTOs(
  itemIds: string[],
  equippedSlotMap?: Map<string, string>,
): Promise<InventoryItemDTO[]> {
  if (itemIds.length === 0) return [];

  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    include: { template: true },
  });

  return items.map((item) =>
    toInventoryItemDTO(
      { ...item, bonusStats: item.bonusStats as Record<string, number> | null },
      equippedSlotMap?.get(item.id) ?? null,
    ),
  );
}

// ---------------------------------------------------------------------------
// fetchSkillDTOs
// ---------------------------------------------------------------------------

/**
 * Fetch all skills for a player, returned as DTOs.
 */
export async function fetchSkillDTOs(playerId: string): Promise<SkillStateDTO[]> {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
    select: {
      id: true,
      skillType: true,
      level: true,
      xp: true,
      dailyXpGained: true,
    },
  });

  return skills.map(toSkillStateDTO);
}

// ---------------------------------------------------------------------------
// fetchCharacterProgression
// ---------------------------------------------------------------------------

/**
 * Fetch characterXp, characterLevel, attributePoints for a player.
 */
export async function fetchCharacterProgression(
  playerId: string,
): Promise<StateUpdates['characterProgression']> {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: {
      characterXp: true,
      characterLevel: true,
      attributePoints: true,
    },
  });

  return {
    characterXp: Number(player.characterXp),
    characterLevel: player.characterLevel,
    attributePoints: player.attributePoints,
  };
}

// ---------------------------------------------------------------------------
// fetchHpState
// ---------------------------------------------------------------------------

/**
 * Delegate to the existing getHpState from hpService.
 */
export async function fetchHpState(
  playerId: string,
): Promise<StateUpdates['hp']> {
  return getHpState(playerId);
}

// ---------------------------------------------------------------------------
// fetchResourceState
// ---------------------------------------------------------------------------

/**
 * Fetch stamina and mana resource state, mapping ResourceState to ResourceStateDTO.
 */
export async function fetchResourceState(
  playerId: string,
): Promise<StateUpdates['resources']> {
  const now = new Date();

  const [resources, player] = await Promise.all([
    getResourceState(playerId, now),
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        lastStaminaRegenAt: true,
        lastManaRegenAt: true,
      },
    }),
  ]);

  return {
    stamina: {
      current: resources.stamina.current,
      max: resources.stamina.max,
      regenPerSecond: resources.stamina.regenPerSecond,
      lastRegenAt: player.lastStaminaRegenAt.toISOString(),
    },
    mana: {
      current: resources.mana.current,
      max: resources.mana.max,
      regenPerSecond: resources.mana.regenPerSecond,
      lastRegenAt: player.lastManaRegenAt.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// fetchInventoryMeta
// ---------------------------------------------------------------------------

/**
 * Fetch inventory capacity and used slots.
 */
export async function fetchInventoryMeta(
  playerId: string,
): Promise<{ inventoryCapacity: number; inventoryUsedSlots: number }> {
  const { capacity, usedSlots } = await getInventoryState(playerId);
  return { inventoryCapacity: capacity, inventoryUsedSlots: usedSlots };
}

// ---------------------------------------------------------------------------
// fetchGold
// ---------------------------------------------------------------------------

/**
 * Fetch a player's current gold.
 */
export async function fetchGold(playerId: string): Promise<number> {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { gold: true },
  });
  return player.gold;
}

// ---------------------------------------------------------------------------
// fetchEquipmentMap
// ---------------------------------------------------------------------------

/**
 * Fetch the full equipment map for a player.
 * Returns a Record mapping each slot to an InventoryItemDTO or null.
 */
export async function fetchEquipmentMap(playerId: string): Promise<Record<string, InventoryItemDTO | null>> {
  const rows = await prisma.playerEquipment.findMany({
    where: { playerId },
    include: { item: { include: { template: true } } },
  });
  const map: Record<string, InventoryItemDTO | null> = {};
  for (const row of rows) {
    map[row.slot] = row.item
      ? toInventoryItemDTO(
          { ...row.item, bonusStats: row.item.bonusStats as Record<string, number> | null },
          row.slot,
        )
      : null;
  }
  return map;
}

// ---------------------------------------------------------------------------
// fetchBuffDTOs
// ---------------------------------------------------------------------------

/**
 * Fetch all active buffs for a player, returned as DTOs.
 */
export async function fetchBuffDTOs(playerId: string): Promise<BuffStateDTO[]> {
  const buffs = await prisma.playerBuff.findMany({
    where: { playerId },
    select: { id: true, buffType: true, remainingUses: true, bonusValue: true },
  });
  return buffs.map((b) => ({
    id: b.id,
    buffType: b.buffType,
    remainingRounds: b.remainingUses,
    value: b.bonusValue,
  }));
}

// ---------------------------------------------------------------------------
// fetchMaterialTotals
// ---------------------------------------------------------------------------

/**
 * Fetch aggregated material totals (including stash items) keyed by templateId.
 */
export async function fetchMaterialTotals(playerId: string): Promise<Record<string, number>> {
  const rows = await prisma.item.groupBy({
    by: ['templateId'],
    where: { ownerId: playerId },
    _sum: { quantity: true },
  });
  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.templateId] = row._sum.quantity ?? 0;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// buildStateUpdates
// ---------------------------------------------------------------------------

type StateUpdateField =
  | 'skills'
  | 'hp'
  | 'resources'
  | 'characterProgression'
  | 'gold'
  | 'buffs'
  | 'inventoryUsedSlots'
  | 'inventoryCapacity'
  | 'materialTotals';

/**
 * Fetch only the requested state fields in parallel, returning a Partial<StateUpdates>.
 */
export async function buildStateUpdates(
  playerId: string,
  fields: StateUpdateField[],
): Promise<Partial<StateUpdates>> {
  const fieldSet = new Set(fields);
  const result: Partial<StateUpdates> = {};

  const needsInventoryMeta =
    fieldSet.has('inventoryUsedSlots') || fieldSet.has('inventoryCapacity');

  const [
    skills,
    hp,
    resources,
    characterProgression,
    gold,
    buffs,
    inventoryMeta,
    materialTotals,
  ] = await Promise.all([
    fieldSet.has('skills') ? fetchSkillDTOs(playerId) : Promise.resolve(undefined),
    fieldSet.has('hp') ? fetchHpState(playerId) : Promise.resolve(undefined),
    fieldSet.has('resources') ? fetchResourceState(playerId) : Promise.resolve(undefined),
    fieldSet.has('characterProgression')
      ? fetchCharacterProgression(playerId)
      : Promise.resolve(undefined),
    fieldSet.has('gold') ? fetchGold(playerId) : Promise.resolve(undefined),
    fieldSet.has('buffs') ? fetchBuffDTOs(playerId) : Promise.resolve(undefined),
    needsInventoryMeta ? fetchInventoryMeta(playerId) : Promise.resolve(undefined),
    fieldSet.has('materialTotals') ? fetchMaterialTotals(playerId) : Promise.resolve(undefined),
  ]);

  if (skills !== undefined) result.skills = skills;
  if (hp !== undefined) result.hp = hp;
  if (resources !== undefined) result.resources = resources;
  if (characterProgression !== undefined) result.characterProgression = characterProgression;
  if (gold !== undefined) result.gold = gold;
  if (buffs !== undefined) {
    result.buffs = buffs;
  }
  if (inventoryMeta !== undefined) {
    if (fieldSet.has('inventoryCapacity')) result.inventoryCapacity = inventoryMeta.inventoryCapacity;
    if (fieldSet.has('inventoryUsedSlots')) result.inventoryUsedSlots = inventoryMeta.inventoryUsedSlots;
  }
  if (materialTotals !== undefined) result.materialTotals = materialTotals;

  return result;
}
