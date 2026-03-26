import { Prisma, prisma } from '@pocketrealm/database';
import { invalidateZoneIdCache } from './zoneService';

/** Shape of a mob entry stored in the encounterSite JSON `mobs` column. */
interface EncounterSiteMob {
  slot: number;
  mobTemplateId: string;
  role: string;
  prefix: string | null;
  status: string;
  room?: number;
}

/** Ensure starter zone + town-adjacent discoveries exist for a player. */
export async function ensureStarterDiscoveries(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const starterZones = await db.zone.findMany({
    where: { isStarter: true },
    select: { id: true },
  });

  if (starterZones.length === 0) return;

  const starterIds: string[] = starterZones.map((z: { id: string }) => z.id);

  // Get all connections from starter zones
  const connections = await db.zoneConnection.findMany({
    where: { fromId: { in: starterIds } },
    select: { toId: true },
  });

  const connectedIds: string[] = connections.map((c: { toId: string }) => c.toId);

  // Combine starter zones + connected zones, deduplicate
  const allZoneIds = [...new Set([...starterIds, ...connectedIds])];

  await db.playerZoneDiscovery.createMany({
    data: allZoneIds.map((zoneId: string) => ({ playerId, zoneId })),
    skipDuplicates: true,
  });
}

/** Seed starter resource nodes and an encounter site for a new player in the first wild zone. */
export async function ensureStarterEncounterAndNodes(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  // Find the starter town and its first connected wild zone
  const starterTown = await db.zone.findFirst({ where: { isStarter: true }, select: { id: true } });
  if (!starterTown) return;

  const connections = await db.zoneConnection.findMany({
    where: { fromId: starterTown.id },
    select: { toId: true },
  });
  if (connections.length === 0) return;

  const wildZone = await db.zone.findFirst({
    where: {
      id: { in: connections.map((c: { toId: string }) => c.toId) },
      zoneType: 'wild',
    },
    select: { id: true },
  });
  if (!wildZone) return;

  // --- Resource nodes ---
  const oreNode = await db.resourceNode.findFirst({
    where: { zoneId: wildZone.id, resourceType: 'Copper Ore' },
    select: { id: true },
  });
  const logNode = await db.resourceNode.findFirst({
    where: { zoneId: wildZone.id, resourceType: 'Oak Log' },
    select: { id: true },
  });

  const nodeData: Array<{ playerId: string; resourceNodeId: string; remainingCapacity: number; decayedCapacity: number }> = [];
  if (oreNode) nodeData.push({ playerId, resourceNodeId: oreNode.id, remainingCapacity: 6, decayedCapacity: 0 });
  if (logNode) nodeData.push({ playerId, resourceNodeId: logNode.id, remainingCapacity: 6, decayedCapacity: 0 });

  if (nodeData.length > 0) {
    // Guard: only create if player doesn't already have these nodes
    const existing = await db.playerResourceNode.findMany({
      where: {
        playerId,
        resourceNodeId: { in: nodeData.map((n: { resourceNodeId: string }) => n.resourceNodeId) },
      },
      select: { resourceNodeId: true },
    });
    const existingIds = new Set(existing.map((e: { resourceNodeId: string }) => e.resourceNodeId));
    const toCreate = nodeData.filter((n) => !existingIds.has(n.resourceNodeId));
    if (toCreate.length > 0) {
      await db.playerResourceNode.createMany({ data: toCreate });
    }
  }

  // --- Encounter site ---
  // Only create if player has no encounter sites in this zone yet
  const existingSite = await db.encounterSite.findFirst({
    where: { playerId, zoneId: wildZone.id },
    select: { id: true },
  });
  if (existingSite) return;

  const zoneMobFamily = await db.zoneMobFamily.findFirst({
    where: { zoneId: wildZone.id },
    orderBy: { discoveryWeight: 'desc' },
    select: { mobFamilyId: true, mobFamily: { select: { name: true, siteNounSmall: true } } },
  });
  if (!zoneMobFamily) return;

  // Use a single Field Mouse specifically for tutorial seeding so the first
  // guaranteed encounter site stays safe even if other starter mobs are retuned later.
  const fieldMouse = await db.mobTemplate.findFirst({
    where: { zoneId: wildZone.id, name: 'Field Mouse' },
    select: { id: true },
  });
  if (!fieldMouse) return;

  const mobs: EncounterSiteMob[] = [
    { slot: 0, mobTemplateId: fieldMouse.id, role: 'trash', prefix: null, status: 'alive', room: 1 },
  ];

  const siteName = `Small ${zoneMobFamily.mobFamily.name} ${zoneMobFamily.mobFamily.siteNounSmall}`;

  await db.encounterSite.create({
    data: {
      playerId,
      zoneId: wildZone.id,
      mobFamilyId: zoneMobFamily.mobFamilyId,
      name: siteName,
      size: 'small',
      mobs: { mobs } as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Auto-discover all zones connected to a town when arriving. Returns discovered zone IDs. */
export async function discoverZonesFromTown(
  playerId: string,
  townZoneId: string,
): Promise<string[]> {
  const connections = await prisma.zoneConnection.findMany({
    where: { fromId: townZoneId },
    select: { toId: true },
  });

  const connectedIds: string[] = connections.map((c: { toId: string }) => c.toId);
  const allZoneIds = [...new Set([townZoneId, ...connectedIds])];

  await prisma.playerZoneDiscovery.createMany({
    data: allZoneIds.map((zoneId: string) => ({ playerId, zoneId })),
    skipDuplicates: true,
  });

  return allZoneIds;
}

/** Discover a single specific zone (e.g. when exploration finds a zone exit). */
export async function discoverZone(playerId: string, zoneId: string): Promise<void> {
  await prisma.playerZoneDiscovery.createMany({
    data: [{ playerId, zoneId }],
    skipDuplicates: true,
  });
}

/** Get all discovered zone IDs for a player. */
export async function getDiscoveredZoneIds(playerId: string): Promise<Set<string>> {
  const discoveries: Array<{ zoneId: string }> = await prisma.playerZoneDiscovery.findMany({
    where: { playerId },
    select: { zoneId: true },
  });
  return new Set(discoveries.map((d) => d.zoneId));
}

/** Get the starter zone ID (first zone with isStarter=true). */
export async function getStarterZoneId(): Promise<string> {
  const zone = await prisma.zone.findFirst({ where: { isStarter: true } });
  if (!zone) throw new Error('No starter zone configured');
  return zone.id;
}

/** Respawn player to their homeTownId (or starter zone fallback). Returns the town info. */
export async function respawnToHomeTown(playerId: string): Promise<{ townId: string; townName: string }> {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { homeTownId: true },
  });

  const townId = player.homeTownId ?? (await getStarterZoneId());
  const town = await prisma.zone.findUniqueOrThrow({
    where: { id: townId },
    select: { id: true, name: true },
  });

  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentZoneId: town.id,
      lastTravelledFromZoneId: null,
    },
  });
  await invalidateZoneIdCache(playerId);

  return { townId: town.id, townName: town.name };
}

/** Get undiscovered neighbor zones (for zone_exit rolls during exploration). */
export async function getUndiscoveredNeighborZones(
  playerId: string,
  currentZoneId: string,
): Promise<Array<{ id: string; name: string }>> {
  const [connections, discovered] = await Promise.all([
    prisma.zoneConnection.findMany({
      where: { fromId: currentZoneId },
      select: {
        toId: true,
        toZone: { select: { id: true, name: true } },
      },
    }),
    getDiscoveredZoneIds(playerId),
  ]);

  return connections
    .filter((c: { toId: string }) => !discovered.has(c.toId))
    .map((c: { toZone: { id: string; name: string } }) => c.toZone);
}
