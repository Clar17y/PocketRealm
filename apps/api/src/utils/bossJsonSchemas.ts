/**
 * Zod schemas and parse helpers for boss-encounter JSON columns.
 *
 * These validate the internal structure of Prisma JSON columns that were
 * previously cast with a bare `as T`. Malformed data is now caught early
 * with a descriptive warning instead of causing random runtime crashes
 * downstream.
 */
import { z } from 'zod';
import type { BossActiveEffect, BossRoundSummary, BossPlayerReward } from '@pocketrealm/shared';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// BossActiveEffect
// ---------------------------------------------------------------------------

export const bossActiveEffectSchema: z.ZodType<BossActiveEffect> = z.object({
  name: z.string(),
  stat: z.string(),
  modifier: z.number(),
  roundsRemaining: z.number(),
  damagePerRound: z.number().optional(),
  dotDamageType: z.enum(['physical', 'magic']).optional(),
});

// ---------------------------------------------------------------------------
// BossRoundSummary
// ---------------------------------------------------------------------------

export const bossRoundSummarySchema: z.ZodType<BossRoundSummary> = z.object({
  round: z.number(),
  bossDamage: z.number(),
  totalPlayerDamage: z.number(),
  bossHpPercent: z.number(),
  playersAlive: z.number(),
  playersDead: z.number(),
});

// ---------------------------------------------------------------------------
// BossPlayerReward
// ---------------------------------------------------------------------------

const bossLootItemSchema = z.object({
  itemTemplateId: z.string(),
  quantity: z.number(),
  rarity: z.string().optional(),
  itemName: z.string().optional(),
});

const bossXpRewardSchema = z.object({
  skillType: z.string(),
  rawXp: z.number(),
  xpAfterEfficiency: z.number(),
  leveledUp: z.boolean(),
  newLevel: z.number(),
});

const bossRecipeRewardSchema = z.object({
  recipeId: z.string(),
  recipeName: z.string(),
  soulbound: z.boolean(),
});

export const bossPlayerRewardSchema: z.ZodType<BossPlayerReward> = z.object({
  loot: z.array(bossLootItemSchema),
  xp: bossXpRewardSchema.optional(),
  recipeUnlocked: bossRecipeRewardSchema.optional(),
});

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON column expected to contain BossActiveEffect[].
 * Returns [] on null/undefined, and [] with a warning on malformed data.
 */
export function parseBossEffects(
  value: unknown,
  columnName: string,
): BossActiveEffect[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    logger.warn({ columnName, actualType: typeof value }, 'Boss JSON column expected array');
    return [];
  }
  const result = z.array(bossActiveEffectSchema).safeParse(value);
  if (!result.success) {
    logger.warn({ columnName, error: result.error.message }, 'Boss JSON column validation failed');
    return [];
  }
  return result.data;
}

/**
 * Parse a JSON column expected to contain BossRoundSummary[] | null.
 * Returns null on null/undefined, and null with a warning on malformed data.
 */
export function parseBossRoundSummaries(
  value: unknown,
  columnName: string,
): BossRoundSummary[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    logger.warn({ columnName, actualType: typeof value }, 'Boss JSON column expected array');
    return null;
  }
  const result = z.array(bossRoundSummarySchema).safeParse(value);
  if (!result.success) {
    logger.warn({ columnName, error: result.error.message }, 'Boss JSON column validation failed');
    return null;
  }
  return result.data;
}

/**
 * Parse a JSON column expected to contain Record<string, BossPlayerReward> | null.
 * Returns null on null/undefined, and null with a warning on malformed data.
 */
export function parseBossRewardsByPlayer(
  value: unknown,
  columnName: string,
): Record<string, BossPlayerReward> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    logger.warn({ columnName, actualType: Array.isArray(value) ? 'array' : typeof value }, 'Boss JSON column expected object');
    return null;
  }
  const result = z.record(z.string(), bossPlayerRewardSchema).safeParse(value);
  if (!result.success) {
    logger.warn({ columnName, error: result.error.message }, 'Boss JSON column validation failed');
    return null;
  }
  return result.data;
}
