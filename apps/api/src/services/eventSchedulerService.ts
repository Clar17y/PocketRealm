import { WORLD_EVENT_TEMPLATES, type WorldEventTemplate } from '@pocketrealm/shared/constants/worldEventTemplates';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';
import { logger } from '../logger';
import { expireStaleEvents, spawnWorldEvent } from './worldEventService';
import { getCachedZones, getCachedBossMobTemplates, getCachedZoneMobFamilies } from './staticDataCacheService';
import { createBossEncounter, checkAndResolveDueBossRounds } from './bossEncounterService';
import { emitSystemMessage } from './systemMessageService';
import { sendPush } from './pushNotificationService';
import { pickWeighted } from '../utils/pickWeighted.js';

let lastRunAt = 0;
let lastBossSpawnAt = 0;
const MIN_INTERVAL_MS = 60_000;

/** Reset in-memory boss spawn timer — for testing only. */
export function _resetBossSpawnTimer(): void {
  lastBossSpawnAt = 0;
}

function pickRandom<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Resolve a targeted template's {target} placeholder from DB data.
 * If fixedTarget is set, matches that exact name (case-insensitive).
 * Otherwise picks a random target from the zone (or all zones for world-wide).
 */
async function resolveTarget(
  template: WorldEventTemplate,
  zoneId: string | null,
): Promise<{ title: string; description: string; targetFamily?: string; targetResource?: string } | null> {
  if (template.targeting === 'zone') {
    return { title: template.title, description: template.description };
  }

  if (template.targeting === 'family') {
    const zoneFamilies = zoneId
      ? await getCachedZoneMobFamilies(zoneId)
      : await prisma.zoneMobFamily.findMany({
          where: {},
          include: { mobFamily: { select: { id: true, name: true } } },
        });
    if (zoneFamilies.length === 0) return null;

    // Fixed target: match by name; random target: pick any
    let picked;
    if (template.fixedTarget) {
      const lower = template.fixedTarget.toLowerCase();
      picked = zoneFamilies.find((zf) => zf.mobFamily.name.toLowerCase() === lower);
      if (!picked) return null; // family doesn't exist in game data
    } else {
      picked = pickRandom(zoneFamilies);
      if (!picked) return null;
    }

    const name = picked.mobFamily.name;
    return {
      title: template.title.replace('{target}', name),
      description: template.description.replace(/\{target\}/g, name),
      targetFamily: picked.mobFamily.id,
    };
  }

  if (template.targeting === 'resource') {
    const where = zoneId ? { zoneId } : {};
    const resources = await prisma.resourceNode.findMany({
      where,
      select: { resourceType: true },
      distinct: ['resourceType'],
    });
    if (resources.length === 0) return null;

    let picked;
    if (template.fixedTarget) {
      const lower = template.fixedTarget.toLowerCase();
      picked = resources.find((r) => r.resourceType.toLowerCase() === lower);
      if (!picked) return null; // resource type doesn't exist in game data
    } else {
      picked = pickRandom(resources);
      if (!picked) return null;
    }

    const name = picked.resourceType;
    return {
      title: template.title.replace('{target}', name),
      description: template.description.replace(/\{target\}/g, name),
      targetResource: name,
    };
  }

  return null;
}

function getDuration(template: WorldEventTemplate): number {
  if (template.scope === 'world') return WORLD_EVENT_CONSTANTS.WORLD_WIDE_EVENT_DURATION_HOURS;
  if (template.type === 'resource') return WORLD_EVENT_CONSTANTS.RESOURCE_EVENT_DURATION_HOURS;
  return WORLD_EVENT_CONSTANTS.MOB_EVENT_DURATION_HOURS;
}

/**
 * Get mob family names and resource types present in zones where players
 * currently are (wild zones only). Returns null sets if nobody is in a
 * wild zone, signalling the caller to allow any target.
 */
async function getRelevantTargets(): Promise<{
  familyNames: Set<string>;
  resourceTypes: Set<string>;
  hasPlayers: boolean;
}> {
  // Distinct wild zones with at least one player (null zone = town, skip)
  const playerZones = await prisma.player.findMany({
    where: { currentZoneId: { not: null } },
    select: { currentZone: { select: { id: true, zoneType: true } } },
    distinct: ['currentZoneId'],
  });
  const wildZoneIds: string[] = [];
  for (const p of playerZones) {
    if (p.currentZone && p.currentZone.zoneType === 'wild') {
      wildZoneIds.push(p.currentZone.id);
    }
  }

  if (wildZoneIds.length === 0) {
    return { familyNames: new Set(), resourceTypes: new Set(), hasPlayers: false };
  }

  const [families, resources] = await Promise.all([
    prisma.zoneMobFamily.findMany({
      where: { zoneId: { in: wildZoneIds } },
      include: { mobFamily: { select: { name: true } } },
    }),
    prisma.resourceNode.findMany({
      where: { zoneId: { in: wildZoneIds } },
      select: { resourceType: true },
      distinct: ['resourceType'],
    }),
  ]);

  return {
    familyNames: new Set(families.map((f) => f.mobFamily.name.toLowerCase())),
    resourceTypes: new Set(resources.map((r) => r.resourceType.toLowerCase())),
    hasPlayers: true,
  };
}

/** Try to spawn a world-wide event (zoneId = null). */
async function trySpawnWorldWideEvent(io: SocketServer | null): Promise<void> {
  const activeWorldWide = await prisma.worldEvent.count({
    where: { zoneId: null, status: 'active' },
  });
  if (activeWorldWide >= WORLD_EVENT_CONSTANTS.MAX_WORLD_EVENTS) return;

  const relevant = await getRelevantTargets();

  // Filter templates: if players are in wild zones, only pick templates
  // whose fixedTarget is relevant (or generic templates that will resolve
  // to a relevant target). If everyone is in town, allow all templates.
  const allWorld = WORLD_EVENT_TEMPLATES.filter((t) => t.scope === 'world');
  let eligible: WorldEventTemplate[];

  if (relevant.hasPlayers) {
    eligible = allWorld.filter((t) => {
      if (!t.fixedTarget) return true; // generic, resolved later
      const lower = t.fixedTarget.toLowerCase();
      if (t.targeting === 'family') return relevant.familyNames.has(lower);
      if (t.targeting === 'resource') return relevant.resourceTypes.has(lower);
      return true;
    });
  } else {
    // Everyone in town — allow any template
    eligible = allWorld;
  }

  const template = pickWeighted(eligible, t => t.weight);
  if (!template) return;

  const resolved = await resolveTarget(template, null);
  if (!resolved) return;

  const event = await spawnWorldEvent({
    type: template.type,
    zoneId: null,
    title: resolved.title,
    description: resolved.description,
    effectType: template.effectType,
    effectValue: template.effectValue,
    targetFamily: resolved.targetFamily,
    targetResource: resolved.targetResource,
    durationHours: getDuration(template),
  });

  if (event) {
    await emitSystemMessage(
      io,
      'world',
      'world',
      `World event: ${event.title} — ${event.description}`,
    );
  }
}

async function trySpawnBoss(io: SocketServer | null, zoneId: string, zoneName: string): Promise<boolean> {
  const activeBosses = await prisma.bossEncounter.count({
    where: { status: { in: ['waiting', 'in_progress'] } },
  });
  if (activeBosses >= WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS) return false;

  const zoneFamilies = await getCachedZoneMobFamilies(zoneId);

  const allBossMobs = await getCachedBossMobTemplates();
  const familyMobIds = new Set(
    zoneFamilies.flatMap(zf => zf.mobFamily.members.map(m => m.mobTemplateId)),
  );
  const bossMobs = allBossMobs.filter(m => familyMobIds.has(m.id));
  if (bossMobs.length === 0) return false;

  const bossMob = bossMobs[Math.floor(Math.random() * bossMobs.length)]!;

  const event = await spawnWorldEvent({
    type: 'boss',
    zoneId,
    title: `${bossMob.name} Appears`,
    description: `A fearsome ${bossMob.name} has been spotted in ${zoneName}!`,
    effectType: 'damage_up',
    effectValue: 0,
    durationHours: 0,
  });
  if (!event) return false;

  // Bosses don't time-expire
  await prisma.worldEvent.update({
    where: { id: event.id },
    data: { expiresAt: null },
  });

  // Create boss encounter (base HP from mob template — scaled dynamically on round 1)
  const bossHp = bossMob.bossBaseHp ?? bossMob.hp;
  await createBossEncounter(event.id, bossMob.id, bossHp);

  await emitSystemMessage(io, 'world', 'world', `A boss has appeared in ${zoneName}: ${bossMob.name}!`);
  await emitSystemMessage(io, 'zone', `zone:${zoneId}`, `A boss has appeared: ${bossMob.name}! Sign up for the raid!`);

  // Push notification to all subscribed players
  const subscribedPlayers = await prisma.pushSubscription.findMany({
    select: { playerId: true },
    distinct: ['playerId'],
  });
  for (const { playerId } of subscribedPlayers) {
    void sendPush(playerId, 'bossAppeared', {
      title: 'Boss Appeared!',
      body: `${bossMob.name} has appeared in ${zoneName}!`,
      tag: 'boss-appeared',
      data: { type: 'boss' },
    });
  }

  return true;
}

/** Dedicated boss spawn timer — independent of zone event cooldowns. */
export async function checkAndSpawnBoss(io: SocketServer | null): Promise<void> {
  const now = Date.now();
  const intervalMs = WORLD_EVENT_CONSTANTS.BOSS_SPAWN_INTERVAL_HOURS * 60 * 60 * 1000;
  if (now - lastBossSpawnAt < intervalMs) return;

  // Active boss cap
  const activeBosses = await prisma.bossEncounter.count({
    where: { status: { in: ['waiting', 'in_progress'] } },
  });
  if (activeBosses >= WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS) return;

  // DB-based cooldown (survives server restarts)
  const cooldownCutoff = new Date(now - intervalMs);
  const recentBoss = await prisma.bossEncounter.findFirst({
    where: { event: { startedAt: { gte: cooldownCutoff } } },
    select: { id: true },
  });
  if (recentBoss) return;

  // Pick a random wild zone
  const allZones = await getCachedZones();
  const wildZones = allZones.filter(z => z.zoneType === 'wild');
  if (wildZones.length === 0) return;

  const zone = pickRandom(wildZones);
  if (!zone) return;

  lastBossSpawnAt = now;
  await trySpawnBoss(io, zone.id, zone.name);
}

/** Try to spawn a zone-scoped event. */
async function trySpawnZoneEvent(io: SocketServer | null): Promise<void> {
  const allZones = await getCachedZones();
  const wildZones = allZones.filter(z => z.zoneType === 'wild');
  if (wildZones.length === 0) return;

  // Get effectTypes already active per zone to prevent duplicates
  const activeZoneEvents = await prisma.worldEvent.findMany({
    where: { zoneId: { not: null }, status: 'active' },
    select: { zoneId: true, effectType: true },
  });
  const effectsByZone = new Map<string, Set<string>>();
  for (const e of activeZoneEvents) {
    if (!e.zoneId) continue;
    const set = effectsByZone.get(e.zoneId) ?? new Set();
    set.add(e.effectType);
    effectsByZone.set(e.zoneId, set);
  }

  // Zones without any events get priority; otherwise pick randomly from all wild zones
  const occupiedZoneIds = new Set(activeZoneEvents.map((e) => e.zoneId));
  const freeZones = wildZones.filter((z) => !occupiedZoneIds.has(z.id));
  const candidatePool = freeZones.length > 0 ? freeZones : wildZones;
  const zone = pickRandom(candidatePool);
  if (!zone) return;

  const zoneEffects = effectsByZone.get(zone.id) ?? new Set();

  // Pick a template that doesn't conflict with existing effects in this zone
  const templates = WORLD_EVENT_TEMPLATES.filter(
    (t) => t.scope === 'zone' && !zoneEffects.has(t.effectType),
  );
  const template = pickWeighted(templates, t => t.weight);
  if (!template) return;

  const resolved = await resolveTarget(template, zone.id);
  if (!resolved) return;

  const event = await spawnWorldEvent({
    type: template.type,
    zoneId: zone.id,
    title: resolved.title,
    description: resolved.description,
    effectType: template.effectType,
    effectValue: template.effectValue,
    targetFamily: resolved.targetFamily,
    targetResource: resolved.targetResource,
    durationHours: getDuration(template),
  });

  if (event) {
    await emitSystemMessage(
      io,
      'world',
      'world',
      `New event in ${zone.name}: ${event.title} — ${event.description}`,
    );
    await emitSystemMessage(
      io,
      'zone',
      `zone:${zone.id}`,
      `New event: ${event.title} — ${event.description}`,
    );
  }
}

export async function checkAndSpawnEvents(io: SocketServer | null): Promise<void> {
  // Step 1: Expire stale events
  try {
    const expired = await expireStaleEvents();
    for (const event of expired) {
      logger.info({ eventId: event.id, title: event.title }, 'World event expired');
      const location = event.zoneName ?? 'the world';
      await emitSystemMessage(io, 'world', 'world', `Event ended: ${event.title} in ${location}`);
      if (event.zoneId) {
        await emitSystemMessage(io, 'zone', `zone:${event.zoneId}`, `Event ended: ${event.title}`);
      }
    }
  } catch (err) {
    logger.error({ err, step: 'expireStaleEvents' }, 'Scheduler step failed');
  }

  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;
  lastRunAt = now;

  // Each scheduler step is isolated so a failure in one doesn't skip the rest.

  // Step 2: Resolve any due boss rounds
  try {
    await checkAndResolveDueBossRounds(io);
  } catch (err) {
    logger.error({ err, step: 'checkAndResolveDueBossRounds' }, 'Scheduler step failed');
  }

  // Step 3: Dedicated boss spawn timer (independent of event cooldowns)
  try {
    await checkAndSpawnBoss(io);
  } catch (err) {
    logger.error({ err, step: 'checkAndSpawnBoss' }, 'Scheduler step failed');
  }

  // Step 4: Spawn new world/zone event (respawn cooldown gated)
  try {
    const cooldownMs = WORLD_EVENT_CONSTANTS.EVENT_RESPAWN_DELAY_MINUTES * 60 * 1000;
    const cooldownCutoff = new Date(now - cooldownMs);
    const recentEvent = await prisma.worldEvent.findFirst({
      where: { startedAt: { gte: cooldownCutoff } },
      select: { id: true },
    });
    if (!recentEvent) {
      // Roll for world-wide or zone event (50/50 chance, but caps enforce limits)
      if (Math.random() < 0.5) {
        await trySpawnWorldWideEvent(io);
      } else {
        await trySpawnZoneEvent(io);
      }
    }
  } catch (err) {
    logger.error({ err, step: 'spawnNewEvent' }, 'Scheduler step failed');
  }
}
