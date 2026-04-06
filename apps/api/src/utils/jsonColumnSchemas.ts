/**
 * Zod schemas and helpers for validating JSON columns from PostgreSQL (Prisma)
 * and JSON.parse results from Redis.
 *
 * Prisma JSON columns are typed as `JsonValue` (essentially `unknown`). The codebase
 * was using raw `as T` casts without runtime checks. These utilities add lightweight
 * validation so malformed data is caught early instead of silently producing runtime
 * errors downstream.
 */
import { z } from 'zod';
import type { ConsumableEffectType } from '@pocketrealm/shared';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Consumable Effect (used by consumableService, potionService)
// ---------------------------------------------------------------------------

const consumableEffectTypeValues: readonly ConsumableEffectType[] = [
  'heal_flat', 'heal_percent', 'restore_stamina', 'restore_mana',
  'cleanse_magic_dot', 'buff_attack', 'buff_defence',
];

export const consumableEffectSchema = z.object({
  type: z.enum(consumableEffectTypeValues as unknown as [string, ...string[]]),
  value: z.number().optional(),
  duration: z.number().optional(),
}).nullable();

// ---------------------------------------------------------------------------
// Materials Progress (used by guildProjectService)
// ---------------------------------------------------------------------------

export const materialsProgressSchema = z.record(z.string(), z.number());

// ---------------------------------------------------------------------------
// Skill Point Allocations (used by skillPointService)
// ---------------------------------------------------------------------------

export const skillPointAllocationsSchema = z.record(z.string(), z.number());

// ---------------------------------------------------------------------------
// Pending Loot Item (used by pendingLootService for Redis JSON)
// ---------------------------------------------------------------------------

export const pendingLootItemSchema = z.object({
  templateId: z.string(),
  templateName: z.string(),
  rarity: z.string(),
  quantity: z.number(),
  bonusStats: z.record(z.string(), z.number()).nullable(),
  currentDurability: z.number().nullable(),
  maxDurability: z.number().nullable(),
});

export const pendingLootArraySchema = z.array(pendingLootItemSchema);

// ---------------------------------------------------------------------------
// Casino Redis JSON (used by casinoService)
// ---------------------------------------------------------------------------

export const activeRoundSchema = z.object({
  roundId: z.string(),
  startedAt: z.number(),
});

export const resolvedRoundSchema = z.object({
  roundId: z.string(),
  startedAt: z.number(),
  result: z.number(),
});

// ---------------------------------------------------------------------------
// Safe JSON column parser (pragmatic approach for complex nested types)
// ---------------------------------------------------------------------------

/**
 * Attempts to validate `value` as an array; returns the cast array on success
 * or the provided default on failure. Logs a warning when data is malformed.
 *
 * Used for deeply-nested JSON columns (expedition rooms, boss round summaries,
 * etc.) where writing full Zod schemas is impractical.
 */
export function parseJsonArray<T>(
  value: unknown,
  columnName: string,
  fallback: T[] = [],
): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined) return fallback;
  logger.warn({ columnName, actualType: typeof value }, 'JSON column expected array');
  return fallback;
}

/**
 * Attempts to validate `value` as a non-null object (Record); returns the
 * cast record on success or the provided default on failure.
 */
export function parseJsonRecord<V = number>(
  value: unknown,
  columnName: string,
  fallback: Record<string, V> = {} as Record<string, V>,
): Record<string, V> {
  if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, V>;
  }
  if (value === null || value === undefined) return fallback;
  logger.warn({ columnName, actualType: typeof value }, 'JSON column expected object');
  return fallback;
}

/**
 * Wraps a Redis JSON.parse call with try/catch and optional Zod validation.
 * Returns the parsed+validated value on success, or the fallback on failure.
 */
export function safeParseRedisJson<T, F = T>(
  raw: string | null,
  schema: z.ZodType<T>,
  fallback: F,
  context: string,
): T | F {
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return schema.parse(parsed);
  } catch (err) {
    logger.warn({ context, error: err instanceof Error ? err.message : String(err) }, 'Failed to parse Redis JSON');
    return fallback;
  }
}
