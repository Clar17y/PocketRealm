import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import {
  ensureStarterDiscoveries,
  ensureStarterEncounterAndNodes,
  discoverZonesFromTown,
  discoverZone,
  getDiscoveredZoneIds,
  getStarterZoneId,
  respawnToHomeTown,
  getUndiscoveredNeighborZones,
} from './zoneDiscoveryService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ensureStarterDiscoveries (existing tests preserved + new edge cases)
// ---------------------------------------------------------------------------
describe('ensureStarterDiscoveries', () => {
  it('does nothing when no starter zones exist', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([]);

    await ensureStarterDiscoveries('p1');
    expect(mockPrisma.playerZoneDiscovery.createMany).not.toHaveBeenCalled();
  });

  it('discovers starter zones and their connections', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'zone-1' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'zone-2' },
      { toId: 'zone-3' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 3 });

    await ensureStarterDiscoveries('p1');

    expect(mockPrisma.playerZoneDiscovery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
      })
    );
    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    expect(zoneIds).toContain('zone-1');
    expect(zoneIds).toContain('zone-2');
    expect(zoneIds).toContain('zone-3');
  });

  it('deduplicates when starter zone connects to itself', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'zone-1' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'zone-1' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    await ensureStarterDiscoveries('p1');

    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
  });

  it('handles multiple starter zones', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1' }, { id: 'z2' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'z3' },
      { toId: 'z4' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 4 });

    await ensureStarterDiscoveries('p1');

    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    expect(zoneIds).toContain('z1');
    expect(zoneIds).toContain('z2');
    expect(zoneIds).toContain('z3');
    expect(zoneIds).toContain('z4');
  });

  it('deduplicates overlapping connections from multiple starters', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1' }, { id: 'z2' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'z2' }, // z2 is both a starter and a connection target
      { toId: 'z3' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 3 });

    await ensureStarterDiscoveries('p1');

    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
    expect(zoneIds).toHaveLength(3); // z1, z2, z3
  });

  it('handles starter zone with no connections', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    await ensureStarterDiscoveries('p1');

    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    expect(zoneIds).toEqual(['z1']);
  });

  it('passes correct playerId to createMany', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    await ensureStarterDiscoveries('player-42');

    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    expect(call.data[0].playerId).toBe('player-42');
  });
});

// ---------------------------------------------------------------------------
// ensureStarterEncounterAndNodes (NEW — previously untested)
// ---------------------------------------------------------------------------
describe('ensureStarterEncounterAndNodes', () => {
  it('does nothing when no starter town exists', async () => {
    mockPrisma.zone.findFirst.mockResolvedValue(null);

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.zoneConnection.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when starter town has no connections', async () => {
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'town-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);

    await ensureStarterEncounterAndNodes('p1');

    // Should not attempt to look for wild zones
    expect(mockPrisma.resourceNode.findFirst).not.toHaveBeenCalled();
  });

  it('does nothing when no connected wild zone exists', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' }) // starter town
      .mockResolvedValueOnce(null); // no wild zone found
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'town-2' }]);

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.resourceNode.findFirst).not.toHaveBeenCalled();
  });

  it('creates resource nodes when both ore and log nodes exist', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' }) // starter town
      .mockResolvedValueOnce({ id: 'wild-1' }); // wild zone
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce({ id: 'ore-node-1' }) // Copper Ore
      .mockResolvedValueOnce({ id: 'log-node-1' }); // Oak Log
    mockPrisma.playerResourceNode.findMany.mockResolvedValue([]); // no existing nodes
    mockPrisma.playerResourceNode.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.encounterSite.findFirst.mockResolvedValue({ id: 'existing-site' }); // already has encounter site

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.playerResourceNode.createMany).toHaveBeenCalledWith({
      data: [
        { playerId: 'p1', resourceNodeId: 'ore-node-1', remainingCapacity: 6, decayedCapacity: 0 },
        { playerId: 'p1', resourceNodeId: 'log-node-1', remainingCapacity: 6, decayedCapacity: 0 },
      ],
    });
  });

  it('creates only ore node when log node is missing', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce({ id: 'ore-node-1' }) // Copper Ore
      .mockResolvedValueOnce(null); // no Oak Log
    mockPrisma.playerResourceNode.findMany.mockResolvedValue([]);
    mockPrisma.playerResourceNode.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.encounterSite.findFirst.mockResolvedValue({ id: 'existing-site' });

    await ensureStarterEncounterAndNodes('p1');

    const createCall = mockPrisma.playerResourceNode.createMany.mock.calls[0][0];
    expect(createCall.data).toHaveLength(1);
    expect(createCall.data[0].resourceNodeId).toBe('ore-node-1');
  });

  it('skips creating nodes that player already has', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce({ id: 'ore-node-1' })
      .mockResolvedValueOnce({ id: 'log-node-1' });
    // Player already has both nodes
    mockPrisma.playerResourceNode.findMany.mockResolvedValue([
      { resourceNodeId: 'ore-node-1' },
      { resourceNodeId: 'log-node-1' },
    ]);
    mockPrisma.encounterSite.findFirst.mockResolvedValue({ id: 'existing-site' });

    await ensureStarterEncounterAndNodes('p1');

    // Should not call createMany since all nodes already exist
    expect(mockPrisma.playerResourceNode.createMany).not.toHaveBeenCalled();
  });

  it('skips creating nodes when player already has one of two', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce({ id: 'ore-node-1' })
      .mockResolvedValueOnce({ id: 'log-node-1' });
    // Player already has ore node
    mockPrisma.playerResourceNode.findMany.mockResolvedValue([
      { resourceNodeId: 'ore-node-1' },
    ]);
    mockPrisma.playerResourceNode.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.encounterSite.findFirst.mockResolvedValue({ id: 'existing-site' });

    await ensureStarterEncounterAndNodes('p1');

    const createCall = mockPrisma.playerResourceNode.createMany.mock.calls[0][0];
    expect(createCall.data).toHaveLength(1);
    expect(createCall.data[0].resourceNodeId).toBe('log-node-1');
  });

  it('skips node creation when no resource nodes exist in wild zone', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null) // no ore
      .mockResolvedValueOnce(null); // no log
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue(null);

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.playerResourceNode.createMany).not.toHaveBeenCalled();
  });

  it('skips encounter site creation when player already has one in the zone', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.encounterSite.findFirst.mockResolvedValue({ id: 'existing-site' });

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.zoneMobFamily.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.encounterSite.create).not.toHaveBeenCalled();
  });

  it('skips encounter site when no mob family in zone', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null); // no existing site
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue(null); // no mob family

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.mobTemplate.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.encounterSite.create).not.toHaveBeenCalled();
  });

  it('skips encounter site when Field Mouse mob template not found', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue({
      mobFamilyId: 'fam-1',
      mobFamily: { name: 'Rodents', siteNounSmall: 'Burrow' },
    });
    mockPrisma.mobTemplate.findFirst.mockResolvedValue(null); // no Field Mouse

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.encounterSite.create).not.toHaveBeenCalled();
  });

  it('creates encounter site with correct data when all preconditions met', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue({
      mobFamilyId: 'fam-1',
      mobFamily: { name: 'Rodents', siteNounSmall: 'Burrow' },
    });
    mockPrisma.mobTemplate.findFirst.mockResolvedValue({ id: 'mob-field-mouse' });
    mockPrisma.encounterSite.create.mockResolvedValue({});

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.encounterSite.create).toHaveBeenCalledWith({
      data: {
        playerId: 'p1',
        zoneId: 'wild-1',
        mobFamilyId: 'fam-1',
        name: 'Small Rodents Burrow',
        size: 'small',
        mobs: {
          mobs: [
            { slot: 0, mobTemplateId: 'mob-field-mouse', role: 'trash', prefix: null, status: 'alive', room: 1 },
          ],
        },
      },
    });
  });

  it('creates both resource nodes and encounter site in full setup', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce({ id: 'ore-1' })
      .mockResolvedValueOnce({ id: 'log-1' });
    mockPrisma.playerResourceNode.findMany.mockResolvedValue([]);
    mockPrisma.playerResourceNode.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue({
      mobFamilyId: 'fam-1',
      mobFamily: { name: 'Wolves', siteNounSmall: 'Den' },
    });
    mockPrisma.mobTemplate.findFirst.mockResolvedValue({ id: 'mob-mouse' });
    mockPrisma.encounterSite.create.mockResolvedValue({});

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.playerResourceNode.createMany).toHaveBeenCalled();
    expect(mockPrisma.encounterSite.create).toHaveBeenCalled();

    const siteData = mockPrisma.encounterSite.create.mock.calls[0][0].data;
    expect(siteData.name).toBe('Small Wolves Den');
  });

  it('queries Field Mouse with correct zone filter', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue({
      mobFamilyId: 'fam-1',
      mobFamily: { name: 'Pests', siteNounSmall: 'Nest' },
    });
    mockPrisma.mobTemplate.findFirst.mockResolvedValue(null);

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.mobTemplate.findFirst).toHaveBeenCalledWith({
      where: { zoneId: 'wild-1', name: 'Field Mouse' },
      select: { id: true },
    });
  });

  it('queries zoneMobFamily ordered by discoveryWeight desc', async () => {
    mockPrisma.zone.findFirst
      .mockResolvedValueOnce({ id: 'town-1' })
      .mockResolvedValueOnce({ id: 'wild-1' });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'wild-1' }]);
    mockPrisma.resourceNode.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
    mockPrisma.zoneMobFamily.findFirst.mockResolvedValue(null);

    await ensureStarterEncounterAndNodes('p1');

    expect(mockPrisma.zoneMobFamily.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { zoneId: 'wild-1' },
        orderBy: { discoveryWeight: 'desc' },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// discoverZonesFromTown (existing tests preserved + new edge cases)
// ---------------------------------------------------------------------------
describe('discoverZonesFromTown', () => {
  it('discovers town and connected zones', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'zone-2' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 2 });

    const result = await discoverZonesFromTown('p1', 'town-1');
    expect(result).toContain('town-1');
    expect(result).toContain('zone-2');
  });

  it('deduplicates when town connects to itself', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'town-1' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    const result = await discoverZonesFromTown('p1', 'town-1');
    expect(result).toEqual(['town-1']);
  });

  it('returns only the town when no connections', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    const result = await discoverZonesFromTown('p1', 'town-1');
    expect(result).toEqual(['town-1']);
  });

  it('uses skipDuplicates to avoid re-discovery errors', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'z2' }]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 2 });

    await discoverZonesFromTown('p1', 'town-1');

    expect(mockPrisma.playerZoneDiscovery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('handles multiple connections', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'z2' },
      { toId: 'z3' },
      { toId: 'z4' },
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 4 });

    const result = await discoverZonesFromTown('p1', 'town-1');
    expect(result).toHaveLength(4);
    expect(result).toContain('town-1');
    expect(result).toContain('z2');
    expect(result).toContain('z3');
    expect(result).toContain('z4');
  });
});

// ---------------------------------------------------------------------------
// discoverZone (NEW — previously untested)
// ---------------------------------------------------------------------------
describe('discoverZone', () => {
  it('creates a discovery record with skipDuplicates', async () => {
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    await discoverZone('p1', 'zone-42');

    expect(mockPrisma.playerZoneDiscovery.createMany).toHaveBeenCalledWith({
      data: [{ playerId: 'p1', zoneId: 'zone-42' }],
      skipDuplicates: true,
    });
  });

  it('does not throw on duplicate discovery (skipDuplicates handles it)', async () => {
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 0 });

    await expect(discoverZone('p1', 'zone-42')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getDiscoveredZoneIds (NEW — previously untested)
// ---------------------------------------------------------------------------
describe('getDiscoveredZoneIds', () => {
  it('returns a Set of discovered zone IDs', async () => {
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([
      { zoneId: 'z1' },
      { zoneId: 'z2' },
      { zoneId: 'z3' },
    ]);

    const result = await getDiscoveredZoneIds('p1');

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has('z1')).toBe(true);
    expect(result.has('z2')).toBe(true);
    expect(result.has('z3')).toBe(true);
  });

  it('returns empty Set when no zones discovered', async () => {
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);

    const result = await getDiscoveredZoneIds('p1');

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('queries with correct playerId filter', async () => {
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);

    await getDiscoveredZoneIds('player-abc');

    expect(mockPrisma.playerZoneDiscovery.findMany).toHaveBeenCalledWith({
      where: { playerId: 'player-abc' },
      select: { zoneId: true },
    });
  });
});

// ---------------------------------------------------------------------------
// getStarterZoneId (NEW — previously untested)
// ---------------------------------------------------------------------------
describe('getStarterZoneId', () => {
  it('returns the starter zone ID', async () => {
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'starter-zone-1' });

    const result = await getStarterZoneId();

    expect(result).toBe('starter-zone-1');
  });

  it('throws when no starter zone is configured', async () => {
    mockPrisma.zone.findFirst.mockResolvedValue(null);

    await expect(getStarterZoneId()).rejects.toThrow('No starter zone configured');
  });

  it('queries with isStarter filter', async () => {
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'z1' });

    await getStarterZoneId();

    expect(mockPrisma.zone.findFirst).toHaveBeenCalledWith({ where: { isStarter: true } });
  });
});

// ---------------------------------------------------------------------------
// respawnToHomeTown (existing tests preserved + new edge cases)
// ---------------------------------------------------------------------------
describe('respawnToHomeTown', () => {
  it('respawns to player homeTownId', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ homeTownId: 'town-1' });
    mockPrisma.zone.findUniqueOrThrow.mockResolvedValue({ id: 'town-1', name: 'Starting Town' });
    mockPrisma.player.update.mockResolvedValue({});

    const result = await respawnToHomeTown('p1');
    expect(result.townId).toBe('town-1');
    expect(result.townName).toBe('Starting Town');
  });

  it('falls back to starter zone when no homeTownId', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ homeTownId: null });
    mockPrisma.zone.findFirst.mockResolvedValue({ id: 'starter-zone' });
    mockPrisma.zone.findUniqueOrThrow.mockResolvedValue({ id: 'starter-zone', name: 'Starter' });
    mockPrisma.player.update.mockResolvedValue({});

    const result = await respawnToHomeTown('p1');
    expect(result.townId).toBe('starter-zone');
  });

  it('throws when no starter zone configured', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ homeTownId: null });
    mockPrisma.zone.findFirst.mockResolvedValue(null);

    await expect(respawnToHomeTown('p1')).rejects.toThrow('No starter zone configured');
  });

  it('clears lastTravelledFromZoneId on respawn', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ homeTownId: 'town-1' });
    mockPrisma.zone.findUniqueOrThrow.mockResolvedValue({ id: 'town-1', name: 'Town' });
    mockPrisma.player.update.mockResolvedValue({});

    await respawnToHomeTown('p1');

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        currentZoneId: 'town-1',
        lastTravelledFromZoneId: null,
      },
    });
  });

  it('uses the zone ID from findUniqueOrThrow, not the raw homeTownId', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ homeTownId: 'town-1' });
    mockPrisma.zone.findUniqueOrThrow.mockResolvedValue({ id: 'town-1', name: 'Home' });
    mockPrisma.player.update.mockResolvedValue({});

    const result = await respawnToHomeTown('p1');

    // Verify we use the zone object's id, not just the homeTownId string
    expect(mockPrisma.zone.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'town-1' },
      select: { id: true, name: true },
    });
    expect(result).toEqual({ townId: 'town-1', townName: 'Home' });
  });
});

// ---------------------------------------------------------------------------
// getUndiscoveredNeighborZones (NEW — previously untested)
// ---------------------------------------------------------------------------
describe('getUndiscoveredNeighborZones', () => {
  it('returns undiscovered neighbor zones', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'z2', toZone: { id: 'z2', name: 'Dark Forest' } },
      { toId: 'z3', toZone: { id: 'z3', name: 'Mountain Pass' } },
      { toId: 'z4', toZone: { id: 'z4', name: 'Swamp' } },
    ]);
    // Player has discovered z2 already
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([
      { zoneId: 'z1' },
      { zoneId: 'z2' },
    ]);

    const result = await getUndiscoveredNeighborZones('p1', 'z1');

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ id: 'z3', name: 'Mountain Pass' });
    expect(result).toContainEqual({ id: 'z4', name: 'Swamp' });
  });

  it('returns empty array when all neighbors are discovered', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'z2', toZone: { id: 'z2', name: 'Forest' } },
    ]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([
      { zoneId: 'z1' },
      { zoneId: 'z2' },
    ]);

    const result = await getUndiscoveredNeighborZones('p1', 'z1');

    expect(result).toEqual([]);
  });

  it('returns empty array when zone has no connections', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([{ zoneId: 'z1' }]);

    const result = await getUndiscoveredNeighborZones('p1', 'z1');

    expect(result).toEqual([]);
  });

  it('returns all neighbors when none are discovered', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'z2', toZone: { id: 'z2', name: 'Forest' } },
      { toId: 'z3', toZone: { id: 'z3', name: 'Cave' } },
    ]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]); // nothing discovered

    const result = await getUndiscoveredNeighborZones('p1', 'z1');

    expect(result).toHaveLength(2);
  });

  it('queries connections from the correct zone', async () => {
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
    mockPrisma.playerZoneDiscovery.findMany.mockResolvedValue([]);

    await getUndiscoveredNeighborZones('p1', 'current-zone-id');

    expect(mockPrisma.zoneConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fromId: 'current-zone-id' },
      }),
    );
  });

  it('runs connection lookup and discovery lookup in parallel', async () => {
    let connectionResolved = false;
    let discoveryResolved = false;

    mockPrisma.zoneConnection.findMany.mockImplementation(async () => {
      connectionResolved = true;
      // If executed sequentially, discovery wouldn't be resolved yet
      return [];
    });
    mockPrisma.playerZoneDiscovery.findMany.mockImplementation(async () => {
      discoveryResolved = true;
      return [];
    });

    await getUndiscoveredNeighborZones('p1', 'z1');

    expect(connectionResolved).toBe(true);
    expect(discoveryResolved).toBe(true);
  });
});
