import { prisma } from '@pocketrealm/database';
import { WORLD_EVENT_TEMPLATES } from '@pocketrealm/shared';
import { createBossEncounter } from '../bossEncounterService';
import { sendPush } from '../pushNotificationService';
import { roundTimerRegistry } from '../roundTimerRegistry';
import { getEventById, spawnWorldEvent } from '../worldEventService';
import { adminAudit } from './adminAuditService';

export async function listAdminWorldEvents() {
  const events = await prisma.worldEvent.findMany({
    where: { status: 'active' },
    include: { zone: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    effectType: event.effectType,
    effectValue: event.effectValue,
    zoneName: event.zone?.name ?? 'World',
    status: event.status,
    expiresAt: event.expiresAt?.toISOString() ?? null,
  }));
}

export async function spawnAdminWorldEvent(
  adminId: string,
  input: {
    templateIndex: number;
    zoneId: string;
    durationHours: number;
    target?: string;
  },
) {
  const template = WORLD_EVENT_TEMPLATES[input.templateIndex];
  if (!template) {
    return {
      ok: false as const,
      status: 400,
      error: { message: 'Invalid template index', code: 'INVALID_TEMPLATE' },
    };
  }

  let targetFamily: string | undefined;
  let targetFamilyName: string | undefined;
  let targetResource: string | undefined;

  if (template.targeting === 'family') {
    const families = await prisma.zoneMobFamily.findMany({
      where: { zoneId: input.zoneId },
      include: { mobFamily: { select: { id: true, name: true } } },
    });
    const familyName = input.target ?? template.fixedTarget;
    let picked: (typeof families)[number] | undefined;

    if (familyName) {
      const lowerFamilyName = familyName.toLowerCase();
      picked = families.find((family) => family.mobFamily.name.toLowerCase() === lowerFamilyName);
    } else if (families.length > 0) {
      picked = families[Math.floor(Math.random() * families.length)];
    }

    if (picked) {
      targetFamily = picked.mobFamily.id;
      targetFamilyName = picked.mobFamily.name;
    }
  } else if (template.targeting === 'resource') {
    const nodes = await prisma.resourceNode.findMany({
      where: { zoneId: input.zoneId },
      select: { resourceType: true },
    });
    const resourceTypes = [...new Set(nodes.map((node) => node.resourceType))];
    const resourceName = input.target ?? template.fixedTarget;

    if (resourceName) {
      const lowerResourceName = resourceName.toLowerCase();
      targetResource = resourceTypes.find((type) => type.toLowerCase() === lowerResourceName);
    } else if (resourceTypes.length > 0) {
      targetResource = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
    }
  }

  const displayTarget = targetFamilyName ?? targetResource ?? 'Unknown';
  const title = template.title.replace('{target}', displayTarget);
  const description = template.description.replace('{target}', displayTarget);

  const event = await spawnWorldEvent({
    type: template.type,
    zoneId: input.zoneId,
    title,
    description,
    effectType: template.effectType,
    effectValue: template.effectValue,
    targetFamily,
    targetResource,
    durationHours: input.durationHours,
    createdBy: 'system',
  });

  if (!event) {
    return {
      ok: false as const,
      status: 409,
      error: { message: 'Could not spawn event (slot conflict)', code: 'SLOT_CONFLICT' },
    };
  }

  await adminAudit(adminId, 'spawn_event', {
    eventId: event.id,
    title,
    zoneId: input.zoneId,
    durationHours: input.durationHours,
  });

  return {
    ok: true as const,
    event,
  };
}

export async function cancelAdminEvent(eventId: string, adminId?: string) {
  const event = await getEventById(eventId);
  if (!event) {
    return null;
  }

  await prisma.worldEvent.update({
    where: { id: eventId },
    data: { status: 'expired', expiresAt: new Date() },
  });

  if (event.type === 'boss') {
    const encounter = await prisma.bossEncounter.findUnique({
      where: { eventId },
      select: { id: true, status: true },
    });
    if (encounter && (encounter.status === 'waiting' || encounter.status === 'in_progress')) {
      await prisma.bossEncounter.update({
        where: { eventId },
        data: { status: 'expired', nextRoundAt: null },
      });
      roundTimerRegistry.cancel('bossEncounter', encounter.id);
    }
  }

  if (adminId) {
    await adminAudit(adminId, 'cancel_event', { eventId, eventTitle: event.title });
  }
  return event;
}

export async function listAdminMobs() {
  return prisma.mobTemplate.findMany({
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, level: true, hp: true, bossBaseHp: true },
  });
}

export async function spawnAdminBoss(
  adminId: string,
  input: { mobTemplateId: string; zoneId: string },
) {
  const mob = await prisma.mobTemplate.findUniqueOrThrow({ where: { id: input.mobTemplateId } });

  const event = await spawnWorldEvent({
    type: 'boss',
    zoneId: input.zoneId,
    title: `${mob.name} Sighted`,
    description: `A fearsome ${mob.name} has appeared!`,
    effectType: 'damage_up',
    effectValue: 0,
    targetMobId: input.mobTemplateId,
    durationHours: 0,
    createdBy: 'system',
  });

  if (!event) {
    return {
      ok: false as const,
      status: 409,
      error: { message: 'Could not spawn boss event (slot conflict)', code: 'SLOT_CONFLICT' },
    };
  }

  // Bosses don't time-expire — lifecycle is managed by the encounter system.
  await prisma.worldEvent.update({
    where: { id: event.id },
    data: { expiresAt: null },
  });

  const encounter = await createBossEncounter(event.id, input.mobTemplateId, mob.bossBaseHp ?? mob.hp);
  await adminAudit(adminId, 'spawn_boss', {
    mobTemplateId: input.mobTemplateId,
    mobName: mob.name,
    zoneId: input.zoneId,
    eventId: event.id,
  });

  const zone = await prisma.zone.findUnique({
    where: { id: input.zoneId },
    select: { name: true },
  });
  const subscribedPlayers = await prisma.pushSubscription.findMany({
    select: { playerId: true },
    distinct: ['playerId'],
  });
  const zoneName = zone?.name ?? 'unknown';

  for (const { playerId } of subscribedPlayers) {
    void sendPush(playerId, 'bossAppeared', {
      title: 'Boss Appeared!',
      body: `${mob.name} has appeared in ${zoneName}!`,
      tag: 'boss-appeared',
      data: { type: 'boss' },
    });
  }

  return {
    ok: true as const,
    event,
    encounter,
  };
}
