import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import {
  ensureStarterDiscoveries,
  discoverZonesFromTown,
  respawnToHomeTown,
} from './zoneDiscoveryService';

beforeEach(() => {
  vi.clearAllMocks();
});

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
    // Should include zone-1, zone-2, zone-3
    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    expect(zoneIds).toContain('zone-1');
    expect(zoneIds).toContain('zone-2');
    expect(zoneIds).toContain('zone-3');
  });

  it('deduplicates when starter zone connects to itself', async () => {
    mockPrisma.zone.findMany.mockResolvedValue([{ id: 'zone-1' }]);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      { toId: 'zone-1' }, // connects back to itself
    ]);
    mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 1 });

    await ensureStarterDiscoveries('p1');

    const call = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0];
    const zoneIds = call.data.map((d: { zoneId: string }) => d.zoneId);
    // Should be deduplicated
    expect(new Set(zoneIds).size).toBe(zoneIds.length);
  });
});

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
});

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
});
