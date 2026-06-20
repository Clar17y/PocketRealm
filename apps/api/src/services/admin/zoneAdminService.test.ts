import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/game-engine', () => ({
  assignEncounterRolesToRooms: vi.fn(() => [
    { room: 1, role: 'trash' },
    { room: 2, role: 'elite' },
    { room: 3, role: 'mini_boss' },
  ]),
  generateRoomAssignments: vi.fn(() => ({
    rooms: [
      { roomNumber: 1, mobCount: 1 },
      { roomNumber: 2, mobCount: 1 },
      { roomNumber: 3, mobCount: 1 },
    ],
    totalMobs: 3,
  })),
  rollMobPrefix: vi.fn(() => null),
}));
vi.mock('../zoneService', () => ({ teleportPlayer: vi.fn() }));
vi.mock('./adminAuditService', () => ({ adminAudit: vi.fn() }));

import { mockPrisma } from '../../__test__/setup';
import { assignEncounterRolesToRooms, generateRoomAssignments } from '@pocketrealm/game-engine';
import { adminAudit } from './adminAuditService';
import { spawnAdminEncounter } from './zoneAdminService';

const mockAssignEncounterRolesToRooms = vi.mocked(assignEncounterRolesToRooms);
const mockGenerateRoomAssignments = vi.mocked(generateRoomAssignments);
const mockAdminAudit = vi.mocked(adminAudit);

describe('spawnAdminEncounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValue({
      id: 'family-spider',
      name: 'Spiders',
      siteNounSmall: 'Web',
      siteNounMedium: 'Nest',
      siteNounLarge: 'Lair',
      members: [
        {
          role: 'trash',
          mobTemplate: {
            id: 'web-spinner',
          },
        },
      ],
    });
    mockPrisma.encounterSite.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'site-1',
      ...data,
    }));
    mockAdminAudit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses encounter role assignments for spawned site mobs', async () => {
    const result = await spawnAdminEncounter('player-1', {
      mobFamilyId: 'family-spider',
      zoneId: 'zone-1',
      size: 'large',
    });

    expect(result.ok).toBe(true);
    expect(mockAssignEncounterRolesToRooms).toHaveBeenCalledWith([
      { roomNumber: 1, mobCount: 1 },
      { roomNumber: 2, mobCount: 1 },
      { roomNumber: 3, mobCount: 1 },
    ]);

    expect(mockPrisma.encounterSite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Large Spiders Lair',
        size: 'large',
        totalRooms: 3,
        mobs: {
          mobs: [
            { slot: 0, room: 1, mobTemplateId: 'web-spinner', role: 'trash', prefix: null, status: 'alive' },
            { slot: 1, room: 2, mobTemplateId: 'web-spinner', role: 'elite', prefix: null, status: 'alive' },
            { slot: 2, room: 3, mobTemplateId: 'web-spinner', role: 'mini_boss', prefix: null, status: 'alive' },
          ],
        },
      }),
    });
    expect(mockAdminAudit).toHaveBeenCalledWith('player-1', 'spawn_encounter', expect.objectContaining({
      mobCount: 3,
      size: 'large',
    }));
    expect(JSON.stringify(result.site)).not.toContain('"boss"');
    expect(mockGenerateRoomAssignments).toHaveBeenCalledWith('large');
  });

  it('does not use permanent mini boss templates for trash or elite admin slots when alternatives exist', async () => {
    mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'family-spider',
      name: 'Spiders',
      siteNounSmall: 'Web',
      siteNounMedium: 'Nest',
      siteNounLarge: 'Lair',
      members: [
        {
          role: 'mini_boss',
          mobTemplate: {
            id: 'web-matron',
          },
        },
        {
          role: 'trash',
          mobTemplate: {
            id: 'web-spinner',
          },
        },
      ],
    });

    const result = await spawnAdminEncounter('player-1', {
      mobFamilyId: 'family-spider',
      zoneId: 'zone-1',
      size: 'large',
    });

    expect(result.ok).toBe(true);
    expect(mockPrisma.encounterSite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mobs: {
          mobs: [
            { slot: 0, room: 1, mobTemplateId: 'web-spinner', role: 'trash', prefix: null, status: 'alive' },
            { slot: 1, room: 2, mobTemplateId: 'web-spinner', role: 'elite', prefix: null, status: 'alive' },
            { slot: 2, room: 3, mobTemplateId: 'web-matron', role: 'mini_boss', prefix: null, status: 'alive' },
          ],
        },
      }),
    });
  });

  it('rejects admin encounter spawns for families without encounter-site members', async () => {
    mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'family-spider',
      name: 'Spiders',
      siteNounSmall: 'Web',
      siteNounMedium: 'Nest',
      siteNounLarge: 'Lair',
      members: [
        {
          role: 'expedition_normal',
          mobTemplate: {
            id: 'expedition-broodguard',
          },
        },
      ],
    });

    const result = await spawnAdminEncounter('player-1', {
      mobFamilyId: 'family-spider',
      zoneId: 'zone-1',
      size: 'large',
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: { message: 'Mob family has no encounter-site members', code: 'NO_ENCOUNTER_MEMBERS' },
    });
    expect(mockPrisma.encounterSite.create).not.toHaveBeenCalled();
  });
});
