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

interface StarterContext {
  starterTownId: string;
  connectedZoneIds: string[];
  firstWildZoneId: string | null;
}

async function resolveStarterTownId(
  homeTownId: string | null,
  seasonId: string | null,
  db: Prisma.TransactionClient | typeof prisma,
): Promise<string | null> {
  if (homeTownId) {
    const homeTown = await db.zone.findUnique({
      where: { id: homeTownId },
      select: { id: true, isStarter: true, seasonId: true },
    });

    if (homeTown?.isStarter && homeTown.seasonId === seasonId) {
      return homeTown.id;
    }
  }

  return (
    await db.zone.findFirst({
      where: { isStarter: true, seasonId },
      select: { id: true },
    })
  )?.id ?? null;
}

async function getStarterContextForPlayer(
  playerId: string,
  db: Prisma.TransactionClient | typeof prisma,
): Promise<StarterContext | null> {
  const player = await db.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { homeTownId: true, seasonId: true },
  });

  const starterTownId = await resolveStarterTownId(player.homeTownId, player.seasonId, db);
  if (!starterTownId) return null;

  const connections = await db.zoneConnection.findMany({
    where: { fromId: starterTownId },
    select: { toId: true },
  });
  const connectedZoneIds = connections.map((connection: { toId: string }) => connection.toId);

  if (connectedZoneIds.length === 0) {
    return {
      starterTownId,
      connectedZoneIds,
      firstWildZoneId: null,
    };
  }

  const firstWildZone = await db.zone.findFirst({
    where: {
      id: { in: connectedZoneIds },
      zoneType: 'wild',
    },
    select: { id: true },
  });

  return {
    starterTownId,
    connectedZoneIds,
    firstWildZoneId: firstWildZone?.id ?? null,
  };
}

/** Ensure starter zone + town-adjacent discoveries exist for a player. */
export async function ensureStarterDiscoveries(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const starterContext = await getStarterContextForPlayer(playerId, db);
  if (!starterContext) return;

  // Combine starter zones + connected zones, deduplicate
  const allZoneIds = [...new Set([starterContext.starterTownId, ...starterContext.connectedZoneIds])];

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
  const starterContext = await getStarterContextForPlayer(playerId, db);
  if (!starterContext?.firstWildZoneId) return;
  const wildZoneId = starterContext.firstWildZoneId;

  // --- Resource nodes ---
  const oreNode = await db.resourceNode.findFirst({
    where: { zoneId: wildZoneId, resourceType: 'Copper Ore' },
    select: { id: true },
  });
  const logNode = await db.resourceNode.findFirst({
    where: { zoneId: wildZoneId, resourceType: 'Oak Log' },
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
    where: { playerId, zoneId: wildZoneId },
    select: { id: true },
  });
  if (existingSite) return;

  const zoneMobFamily = await db.zoneMobFamily.findFirst({
    where: { zoneId: wildZoneId },
    orderBy: { discoveryWeight: 'desc' },
    select: { mobFamilyId: true, mobFamily: { select: { name: true, siteNounSmall: true } } },
  });
  if (!zoneMobFamily) return;

  // Use a single Field Mouse specifically for tutorial seeding so the first
  // guaranteed encounter site stays safe even if other starter mobs are retuned later.
  const fieldMouse = await db.mobTemplate.findFirst({
    where: { zoneId: wildZoneId, name: 'Field Mouse' },
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
      zoneId: wildZoneId,
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
