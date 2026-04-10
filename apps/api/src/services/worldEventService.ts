import { prisma } from '@pocketrealm/database';
import {
  WORLD_EVENT_CONSTANTS,
  type ActiveZoneModifiers,
  type WorldEventData,
  type WorldEventEffectType,
  type WorldEventScope,
  type WorldEventStatus,
  type WorldEventType,
} from '@pocketrealm/shared';
import { logger } from '../logger';

function toWorldEventData(row: {
  id: string;
  type: string;
  zoneId: string | null;
  title: string;
  description: string;
  effectType: string;
  effectValue: number;
  targetMobId: string | null;
  targetFamily: string | null;
  targetResource: string | null;
  startedAt: Date;
  expiresAt: Date | null;
  status: string;
  createdBy: string;
  zone?: { name: string } | null;
}): WorldEventData {
  return {
    id: row.id,
    type: row.type as WorldEventType,
    scope: (row.zoneId ? 'zone' : 'world') as WorldEventScope,
    zoneId: row.zoneId,
    zoneName: row.zone?.name ?? null,
    title: row.title,
    description: row.description,
    effectType: row.effectType as WorldEventEffectType,
    effectValue: row.effectValue,
    targetMobId: row.targetMobId,
    targetFamily: row.targetFamily,
    targetResource: row.targetResource,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: row.status as WorldEventStatus,
    createdBy: row.createdBy as 'system' | 'player_discovery',
  };
}

const ZONE_INCLUDE = { zone: { select: { name: true } } } as const;

export async function getActiveEventsForZone(zoneId: string): Promise<WorldEventData[]> {
  const rows = await prisma.worldEvent.findMany({
    where: { zoneId, status: 'active' },
    include: ZONE_INCLUDE,
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(toWorldEventData);
}

/** Get all active world-wide events (zoneId is null). */
export async function getActiveWorldWideEvents(): Promise<WorldEventData[]> {
  const rows = await prisma.worldEvent.findMany({
    where: { zoneId: null, status: 'active' },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(toWorldEventData);
}

/** Check whether a targeted event applies to a specific mob/resource. */
function eventAppliesToTarget(
  event: WorldEventData,
  context?: { mobFamilyId?: string; resourceType?: string },
): boolean {
  // Zone-wide events (no targeting) always apply
  if (!event.targetFamily && !event.targetResource) return true;
  if (!context) return false;

  if (event.targetFamily && context.mobFamilyId) {
    return event.targetFamily === context.mobFamilyId;
  }
  if (event.targetResource && context.resourceType) {
    return event.targetResource === context.resourceType;
  }

  return false;
}

function applyModifier(mods: ActiveZoneModifiers, event: WorldEventData): void {
  switch (event.effectType) {
    case 'damage_up': mods.mobDamageMultiplier *= (1 + event.effectValue); break;
    case 'damage_down': mods.mobDamageMultiplier *= Math.max(0.1, 1 - event.effectValue); break;
    case 'hp_up': mods.mobHpMultiplier *= (1 + event.effectValue); break;
    case 'hp_down': mods.mobHpMultiplier *= Math.max(0.1, 1 - event.effectValue); break;
    case 'spawn_rate_up': mods.mobSpawnRateMultiplier *= (1 + event.effectValue); break;
    case 'spawn_rate_down': mods.mobSpawnRateMultiplier *= Math.max(0.1, 1 - event.effectValue); break;
    case 'drop_rate_up': mods.resourceDropRateMultiplier *= (1 + event.effectValue); break;
    case 'drop_rate_down': mods.resourceDropRateMultiplier *= Math.max(0.1, 1 - event.effectValue); break;
    case 'yield_up': mods.resourceYieldMultiplier *= (1 + event.effectValue); break;
    case 'yield_down': mods.resourceYieldMultiplier *= Math.max(0.1, 1 - event.effectValue); break;
  }
}

/** Compute zone modifiers from pre-fetched events (no DB calls). */
export function computeZoneModifiers(
  zoneEvents: WorldEventData[],
  worldEvents: WorldEventData[],
  context?: { mobFamilyId?: string; resourceType?: string },
): ActiveZoneModifiers {
  const mods: ActiveZoneModifiers = {
    mobDamageMultiplier: 1,
    mobHpMultiplier: 1,
    mobSpawnRateMultiplier: 1,
    resourceDropRateMultiplier: 1,
    resourceYieldMultiplier: 1,
  };

  for (const event of zoneEvents) {
    if (!eventAppliesToTarget(event, context)) continue;
    applyModifier(mods, event);
  }

  for (const event of worldEvents) {
    if (!eventAppliesToTarget(event, context)) continue;
    applyModifier(mods, event);
  }

  return mods;
}

/**
 * Compute zone modifiers from active zone-scoped AND world-wide events.
 * Pass `context` to filter targeted events (family/resource-specific).
 */
export async function getActiveZoneModifiers(
  zoneId: string,
  context?: { mobFamilyId?: string; resourceType?: string },
): Promise<ActiveZoneModifiers> {
  const [zoneEvents, worldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);
  return computeZoneModifiers(zoneEvents, worldEvents, context);
}

export interface SpawnRateModifiers {
  byFamily: Map<string, number>;
  global: number;
}

export interface EventModifierBadge {
  title: string;
  effectType: string;
  effectValue: number;
  isGlobal: boolean;
}

/**
 * Synchronous variant: filter pre-fetched events for a specific entity.
 * Use when zone/world events are already loaded (e.g., in exploration loop).
 */
export function filterEventModifiers(
  zoneEvents: WorldEventData[],
  worldEvents: WorldEventData[],
  context: { mobFamilyId?: string; resourceType?: string },
): EventModifierBadge[] {
  const badges: EventModifierBadge[] = [];

  for (const event of zoneEvents) {
    if (!eventAppliesToTarget(event, context)) continue;
    if (context.mobFamilyId && event.type === 'resource') continue;
    if (context.resourceType && event.type === 'mob') continue;
    badges.push({ title: event.title, effectType: event.effectType, effectValue: event.effectValue, isGlobal: false });
  }

  for (const event of worldEvents) {
    if (!eventAppliesToTarget(event, context)) continue;
    if (context.mobFamilyId && event.type === 'resource') continue;
    if (context.resourceType && event.type === 'mob') continue;
    badges.push({ title: event.title, effectType: event.effectType, effectValue: event.effectValue, isGlobal: true });
  }

  return badges;
}

/** Return badge data for events affecting a specific entity (mob family or resource type) in a zone. */
export async function getEventModifiersForEntity(
  zoneId: string,
  context: { mobFamilyId?: string; resourceType?: string },
): Promise<EventModifierBadge[]> {
  const [zoneEvents, worldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);
  return filterEventModifiers(zoneEvents, worldEvents, context);
}

/** Compute spawn rate modifiers from pre-fetched events (no DB calls). */
export function computeSpawnRateModifiers(
  zoneEvents: WorldEventData[],
  worldEvents: WorldEventData[],
): SpawnRateModifiers {
  const byFamily = new Map<string, number>();
  let global = 1;

  for (const event of [...zoneEvents, ...worldEvents]) {
    if (event.effectType !== 'spawn_rate_up' && event.effectType !== 'spawn_rate_down') continue;

    const multiplier = event.effectType === 'spawn_rate_up'
      ? 1 + event.effectValue
      : Math.max(0.1, 1 - event.effectValue);

    if (event.targetFamily) {
      const current = byFamily.get(event.targetFamily) ?? 1;
      byFamily.set(event.targetFamily, current * multiplier);
    } else {
      global *= multiplier;
    }
  }

  return { byFamily, global };
}

export async function getSpawnRateModifiers(zoneId: string): Promise<SpawnRateModifiers> {
  const [zoneEvents, worldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);
  return computeSpawnRateModifiers(zoneEvents, worldEvents);
}

export async function getAllActiveEvents(): Promise<WorldEventData[]> {
  const rows = await prisma.worldEvent.findMany({
    where: { status: 'active' },
    include: ZONE_INCLUDE,
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(toWorldEventData);
}

export async function spawnWorldEvent(params: {
  type: WorldEventType;
  zoneId: string | null;
  title: string;
  description: string;
  effectType: WorldEventEffectType;
  effectValue: number;
  targetMobId?: string;
  targetFamily?: string;
  targetResource?: string;
  durationHours: number;
  createdBy?: 'system' | 'player_discovery';
}): Promise<WorldEventData | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.durationHours * 60 * 60 * 1000);

  // Wrap check+create in a transaction to prevent duplicate events from concurrent spawns
  const row = await prisma.$transaction(async (tx) => {
    // Per-zone total cap (applies to all spawn paths)
    if (params.zoneId) {
      const activeInZone = await tx.worldEvent.count({
        where: { zoneId: params.zoneId, status: 'active' },
      });
      if (activeInZone >= WORLD_EVENT_CONSTANTS.MAX_ZONE_EVENTS) return null;
    }

    // Slot check: zone events — no duplicate effectType in the same zone
    if (params.zoneId) {
      const existing = await tx.worldEvent.findFirst({
        where: {
          zoneId: params.zoneId,
          effectType: params.effectType,
          status: 'active',
        },
      });
      if (existing) return null;
    }

    return tx.worldEvent.create({
      data: {
        type: params.type,
        zoneId: params.zoneId,
        title: params.title,
        description: params.description,
        effectType: params.effectType,
        effectValue: params.effectValue,
        targetMobId: params.targetMobId ?? null,
        targetFamily: params.targetFamily ?? null,
        targetResource: params.targetResource ?? null,
        expiresAt,
        status: 'active',
        createdBy: params.createdBy ?? 'system',
      },
      include: ZONE_INCLUDE,
    });
  }, { isolationLevel: 'Serializable' });

  if (!row) return null;
  const event = toWorldEventData(row);
  logger.info({ eventId: event.id, title: event.title, zoneId: event.zoneId }, 'World event spawned');
  return event;
}

export async function expireStaleEvents(): Promise<WorldEventData[]> {
  const now = new Date();
  const stale = await prisma.worldEvent.findMany({
    where: {
      status: 'active',
      expiresAt: { lte: now },
    },
    include: ZONE_INCLUDE,
  });

  if (stale.length === 0) return [];

  await prisma.worldEvent.updateMany({
    where: {
      id: { in: stale.map((e) => e.id) },
      status: 'active',
    },
    data: { status: 'expired' },
  });

  return stale.map(toWorldEventData);
}

/** Extract compact event summaries from pre-fetched events (no DB calls). */
export function computeEventSummaries(
  zoneEvents: WorldEventData[],
  worldEvents: WorldEventData[],
): Array<{ title: string; effectType: string; effectValue: number }> {
  return [...zoneEvents, ...worldEvents].map(e => ({
    title: e.title,
    effectType: e.effectType,
    effectValue: e.effectValue,
  }));
}

/** Compact summary of active events affecting a zone, for embedding in combat/gathering responses. */
export async function getActiveEventSummaries(zoneId: string): Promise<Array<{ title: string; effectType: string; effectValue: number }>> {
  const [zoneEvents, worldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);
  return computeEventSummaries(zoneEvents, worldEvents);
}

export async function getEventById(id: string): Promise<WorldEventData | null> {
  const row = await prisma.worldEvent.findUnique({
    where: { id },
    include: ZONE_INCLUDE,
  });
  return row ? toWorldEventData(row) : null;
}
