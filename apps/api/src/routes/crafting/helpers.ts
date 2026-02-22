import { z } from 'zod';
import { prisma } from '@adventure/database';
import {
  ALL_SKILLS,
  CRAFTING_CONSTANTS,
  type CraftingMaterial,
  type ItemRarity,
  type ItemStats,
  type ItemType,
  type SkillType,
} from '@adventure/shared';
import { AppError } from '../../middleware/errorHandler';
import { getSkillLevel } from '../../services/combatStatsService.js';

export const prismaAny = prisma as unknown as any;

// ── Type guards ──────────────────────────────────────────────────────

export function isSkillType(value: string): value is SkillType {
  return ALL_SKILLS.includes(value as SkillType);
}

export function isItemType(value: string): value is ItemType {
  return value === 'weapon' || value === 'armor' || value === 'resource' || value === 'consumable';
}

export function isItemRarity(value: string): value is ItemRarity {
  return value === 'common' || value === 'uncommon' || value === 'rare' || value === 'epic' || value === 'legendary';
}

export function parseItemRarity(value: string): ItemRarity {
  if (isItemRarity(value)) return value;
  throw new AppError(400, 'Invalid item rarity value', 'INVALID_ITEM');
}

// ── DB helpers ───────────────────────────────────────────────────────

export { getSkillLevel } from '../../services/combatStatsService.js';

export async function getZoneCraftingLevel(playerId: string): Promise<{ maxCraftingLevel: number | null; zoneName: string }> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) {
    throw new AppError(400, 'You must be in a zone to craft', 'NO_ZONE');
  }
  const zone = await prisma.zone.findUnique({
    where: { id: player.currentZoneId },
    select: { name: true, maxCraftingLevel: true },
  });
  if (!zone) {
    throw new AppError(400, 'Current zone not found', 'NO_ZONE');
  }
  return { maxCraftingLevel: zone.maxCraftingLevel, zoneName: zone.name };
}

// ── Zone assertions ──────────────────────────────────────────────────

export function assertZoneAllowsCrafting(zone: { maxCraftingLevel: number | null; zoneName: string }): void {
  if (zone.maxCraftingLevel === 0) {
    throw new AppError(400, 'No crafting facilities available here. Travel to a town to craft.', 'NO_CRAFTING_FACILITY');
  }
}

export function assertZoneAllowsRecipeLevel(zone: { maxCraftingLevel: number | null; zoneName: string }, requiredLevel: number): void {
  if (zone.maxCraftingLevel !== null && requiredLevel > zone.maxCraftingLevel) {
    throw new AppError(
      400,
      `${zone.zoneName}'s forge can only craft up to level ${zone.maxCraftingLevel} recipes. This recipe requires level ${requiredLevel}.`,
      'FORGE_LEVEL_TOO_LOW',
    );
  }
}

// ── Material helpers ─────────────────────────────────────────────────

export function parseMaterials(value: unknown): CraftingMaterial[] {
  const materialSchema = z.object({
    templateId: z.string().uuid(),
    quantity: z.number().int().positive(),
  });

  const arraySchema = z.array(materialSchema);
  return arraySchema.parse(value);
}

export function calculateSalvageMaterials(materials: CraftingMaterial[]): CraftingMaterial[] {
  const refunded = materials.map((material) => ({
    templateId: material.templateId,
    quantity: Math.floor(material.quantity * CRAFTING_CONSTANTS.SALVAGE_BASE_REFUND_RATE),
  }));

  if (refunded.length > 0 && refunded.every((material) => material.quantity <= 0)) {
    let richestIndex = 0;
    for (let i = 1; i < materials.length; i++) {
      if (materials[i]!.quantity > materials[richestIndex]!.quantity) richestIndex = i;
    }
    refunded[richestIndex] = {
      templateId: materials[richestIndex]!.templateId,
      quantity: CRAFTING_CONSTANTS.SALVAGE_MIN_PRIMARY_RETURN,
    };
  }

  return refunded.filter((material) => material.quantity > 0);
}

// ── Recipe discovery hint ────────────────────────────────────────────

function toSingularFamilyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.endsWith('ies')) return `${trimmed.slice(0, -3)}y`;
  if (trimmed.endsWith('s') && !trimmed.endsWith('ss')) return trimmed.slice(0, -1);
  return trimmed;
}

export function buildRecipeDiscoveryHint(mobFamily: { name: string; siteNounLarge: string } | null | undefined): string {
  if (!mobFamily) return 'A unique drop from a large encounter site.';
  const familyName = toSingularFamilyName(mobFamily.name).toLowerCase();
  const siteNoun = mobFamily.siteNounLarge.toLowerCase();
  return `A unique drop from a large ${familyName} ${siteNoun}!`;
}

// ── Bonus stats ──────────────────────────────────────────────────────

export function normalizeBonusStats(value: unknown): ItemStats {
  const out: ItemStats = {};
  if (!value || typeof value !== 'object') return out;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) continue;
    (out as Record<string, number>)[key] = raw;
  }

  return out;
}

// ── Sacrificial item validation ──────────────────────────────────────

export interface SacrificialItemMatch {
  id: string;
  templateId: string;
  rarity: string;
}

export async function getValidatedSacrificialItem(params: {
  playerId: string;
  targetItemId: string;
  sacrificialItemId: string;
  rarity: ItemRarity;
  itemType?: string;
  templateId?: string;
  action: 'upgrade' | 'reroll';
}): Promise<SacrificialItemMatch> {
  if (params.sacrificialItemId === params.targetItemId) {
    throw new AppError(400, 'Sacrificial item must be different from target item', 'FORGE_INVALID_SACRIFICE');
  }

  const sacrificial = await (prisma as any).item.findUnique({
    where: { id: params.sacrificialItemId },
    include: { template: true },
  });
  if (!sacrificial || sacrificial.ownerId !== params.playerId) {
    throw new AppError(404, 'Sacrificial item not found', 'NOT_FOUND');
  }

  if (sacrificial.quantity !== 1) {
    throw new AppError(400, 'Cannot use stacked items as sacrifice', 'INVALID_STACK');
  }

  const equipped = await prisma.playerEquipment.findFirst({
    where: { playerId: params.playerId, itemId: sacrificial.id },
    select: { slot: true },
  });
  if (equipped) {
    throw new AppError(400, 'Cannot use an equipped item as sacrifice', 'ITEM_EQUIPPED');
  }

  const sacrificialRarity = parseItemRarity(sacrificial.rarity);
  if (sacrificialRarity !== params.rarity) {
    throw new AppError(
      400,
      `Sacrificial item must be ${params.rarity} rarity for ${params.action}`,
      'FORGE_INVALID_SACRIFICE'
    );
  }

  if (params.itemType && sacrificial.template.itemType !== params.itemType) {
    throw new AppError(
      400,
      `Sacrificial item must be the same item type (${params.itemType})`,
      'FORGE_INVALID_SACRIFICE'
    );
  }

  if (params.templateId && sacrificial.templateId !== params.templateId) {
    throw new AppError(400, 'Sacrificial item must be the same item template', 'FORGE_INVALID_SACRIFICE');
  }

  return {
    id: sacrificial.id,
    templateId: sacrificial.templateId,
    rarity: sacrificial.rarity,
  };
}

// ── Zod schemas ──────────────────────────────────────────────────────

export const craftSchema = z.object({
  recipeId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

export const salvageSchema = z.object({
  itemId: z.string().uuid(),
});

export const forgeUpgradeSchema = z.object({
  itemId: z.string().uuid(),
  sacrificialItemId: z.string().uuid(),
});

export const forgeRerollSchema = z.object({
  itemId: z.string().uuid(),
  sacrificialItemId: z.string().uuid(),
});
