import { Prisma, prisma } from '@pocketrealm/database';
import { assignEncounterRolesToRooms, generateRoomAssignments, rollMobPrefix } from '@pocketrealm/game-engine';
import {
  isPermanentEncounterFamilyRole,
} from '@pocketrealm/shared';
import { teleportPlayer } from '../zoneService';
import { adminAudit } from './adminAuditService';
import { pickEncounterFamilyMemberForRole } from '../exploration/helpers';

export async function listAdminZones() {
  return prisma.zone.findMany({
    include: { connectionsFrom: { select: { toId: true, explorationThreshold: true } } },
    orderBy: { difficulty: 'asc' },
  });
}

export async function discoverAllAdminZones(playerId: string) {
  const zones = await prisma.zone.findMany({ select: { id: true } });

  await prisma.$transaction(
    zones.map((zone) =>
      prisma.playerZoneDiscovery.upsert({
        where: { playerId_zoneId: { playerId, zoneId: zone.id } },
        create: { playerId, zoneId: zone.id },
        update: {},
      }),
    ),
  );
  await adminAudit(playerId, 'discover_all_zones', { discoveredCount: zones.length });
  return { discoveredCount: zones.length };
}

export async function teleportAdminPlayer(playerId: string, zoneId: string) {
  await teleportPlayer(playerId, zoneId);
  await adminAudit(playerId, 'teleport', { zoneId });
  return {
    zoneId,
    stateUpdates: { currentZoneId: zoneId },
  };
}

export async function listAdminMobFamilies(zoneId?: string) {
  if (zoneId) {
    const zoneFamilies = await prisma.zoneMobFamily.findMany({
      where: { zoneId },
      include: { mobFamily: { select: { id: true, name: true } } },
    });
    return zoneFamilies.map((zoneFamily) => zoneFamily.mobFamily);
  }

  return prisma.mobFamily.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function spawnAdminEncounter(
  playerId: string,
  input: { mobFamilyId: string; zoneId: string; size: 'small' | 'medium' | 'large' },
) {
  const family = await prisma.mobFamily.findUniqueOrThrow({
    where: { id: input.mobFamilyId },
    include: { members: { include: { mobTemplate: true } } },
  });

  if (family.members.length === 0) {
    return {
      ok: false as const,
      status: 400,
      error: { message: 'Mob family has no members', code: 'NO_MEMBERS' },
    };
  }

  const encounterMembers = family.members.filter((member) => isPermanentEncounterFamilyRole(member.role));
  if (encounterMembers.length === 0) {
    return {
      ok: false as const,
      status: 400,
      error: { message: 'Mob family has no encounter-site members', code: 'NO_ENCOUNTER_MEMBERS' },
    };
  }

  const roomAssignments = generateRoomAssignments(input.size);
  const roleAssignments = assignEncounterRolesToRooms(roomAssignments.rooms);
  const mobs: Array<{
    slot: number;
    room: number;
    mobTemplateId: string;
    role: string;
    prefix: string | null;
    status: string;
  }> = [];

  let slot = 0;
  for (const assignment of roleAssignments) {
    const member = pickEncounterFamilyMemberForRole(encounterMembers, assignment.role);
    if (!member) continue;

    mobs.push({
      slot: slot++,
      room: assignment.room,
      mobTemplateId: member.mobTemplate.id,
      role: assignment.role,
      prefix: rollMobPrefix(),
      status: 'alive',
    });
  }

  const sizeNounField = input.size === 'small'
    ? 'siteNounSmall'
    : input.size === 'medium'
      ? 'siteNounMedium'
      : 'siteNounLarge';
  const noun = family[sizeNounField as 'siteNounSmall' | 'siteNounMedium' | 'siteNounLarge'];
  const namePrefix = input.size === 'small' ? 'Small ' : input.size === 'large' ? 'Large ' : '';
  const siteName = `${namePrefix}${family.name} ${noun}`;

  const site = await prisma.encounterSite.create({
    data: {
      playerId,
      zoneId: input.zoneId,
      mobFamilyId: input.mobFamilyId,
      name: siteName,
      size: input.size,
      mobs: { mobs },
      totalRooms: roomAssignments.rooms.length,
    },
  });

  await adminAudit(playerId, 'spawn_encounter', {
    siteId: site.id,
    siteName,
    zoneId: input.zoneId,
    size: input.size,
    mobCount: mobs.length,
  });

  return {
    ok: true as const,
    site,
  };
}

export async function listAdminResourceNodes(zoneId?: string) {
  const where: Prisma.ResourceNodeWhereInput = {};
  if (zoneId) {
    where.zoneId = zoneId;
  }

  return prisma.resourceNode.findMany({
    where,
    include: { zone: { select: { name: true } } },
    orderBy: [{ zone: { name: 'asc' } }, { resourceType: 'asc' }],
  });
}

export async function spawnAdminResourceNode(
  playerId: string,
  input: { resourceNodeId: string; capacity?: number },
) {
  const template = await prisma.resourceNode.findUniqueOrThrow({
    where: { id: input.resourceNodeId },
  });
  const finalCapacity = input.capacity
    ?? Math.floor(Math.random() * (template.maxCapacity - template.minCapacity + 1)) + template.minCapacity;

  const node = await prisma.playerResourceNode.create({
    data: {
      playerId,
      resourceNodeId: input.resourceNodeId,
      remainingCapacity: finalCapacity,
      decayedCapacity: 0,
    },
  });

  await adminAudit(playerId, 'spawn_resource_node', {
    resourceNodeId: input.resourceNodeId,
    resourceType: template.resourceType,
    capacity: finalCapacity,
  });

  return {
    node,
    resourceType: template.resourceType,
    capacity: finalCapacity,
  };
}
