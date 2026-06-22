import { describe, expect, it } from 'vitest';
import type { EncounterMobRole } from '@pocketrealm/shared';
import {
  assignEncounterRolesToRooms,
  rollNormalExplorationMobRole,
  type EncounterRoleAssignment,
  type EncounterRoleRoomLayout,
} from './encounterRolePromotion';

const alwaysRollMiniBoss = (): number => 0;
const neverRollMiniBoss = (): number => 1;
const rollSequence = (values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++] ?? 1;
};

function rolesForRoom(assignments: readonly EncounterRoleAssignment[], room: number): EncounterMobRole[] {
  return assignments
    .filter((assignment) => assignment.room === room)
    .map((assignment) => assignment.role);
}

function allRoles(assignments: readonly EncounterRoleAssignment[]): EncounterMobRole[] {
  return assignments.map((assignment) => assignment.role);
}

function expectNoEliteBeforeLaterAllTrashRoom(assignments: readonly EncounterRoleAssignment[]): void {
  const rolesByRoom = new Map<number, EncounterMobRole[]>();

  for (const assignment of assignments) {
    const roles = rolesByRoom.get(assignment.room) ?? [];
    roles.push(assignment.role);
    rolesByRoom.set(assignment.room, roles);
  }

  const rooms = Array.from(rolesByRoom.keys()).sort((a, b) => a - b);
  const eliteRooms = rooms.filter((room) => rolesByRoom.get(room)!.includes('elite'));

  for (const eliteRoom of eliteRooms) {
    const laterAllTrashRooms = rooms.filter((room) => {
      if (room <= eliteRoom) return false;
      return rolesByRoom.get(room)!.every((role) => role === 'trash');
    });

    expect(laterAllTrashRooms).toEqual([]);
  }
}

describe('assignEncounterRolesToRooms', () => {
  it('leaves 1-room and 2-room layouts all trash when elite rolls miss', () => {
    const oneRoom = assignEncounterRolesToRooms(
      [{ roomNumber: 1, mobCount: 3 }],
      { rng: neverRollMiniBoss, miniBossChance: 1 },
    );
    const twoRooms = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 2 },
        { roomNumber: 2, mobCount: 2 },
      ],
      { rng: neverRollMiniBoss, miniBossChance: 1 },
    );

    expect(allRoles(oneRoom)).toEqual(['trash', 'trash', 'trash']);
    expect(allRoles(twoRooms)).toEqual(['trash', 'trash', 'trash', 'trash']);
  });

  it('places an elite in the final room when the 3-room mini-boss roll fails', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 2 },
        { roomNumber: 2, mobCount: 2 },
        { roomNumber: 3, mobCount: 2 },
      ],
      { rng: neverRollMiniBoss },
    );

    expect(rolesForRoom(assignments, 3)).toEqual(['trash', 'elite']);
    expect(allRoles(assignments)).not.toContain('mini_boss');
  });

  it('places a mini-boss and elite in the final room when the final room has capacity', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 2 },
        { roomNumber: 2, mobCount: 2 },
        { roomNumber: 3, mobCount: 2 },
      ],
      { rng: alwaysRollMiniBoss },
    );

    expect(rolesForRoom(assignments, 3)).toEqual(['elite', 'mini_boss']);
  });

  it('suppresses the mini-boss when it would prevent the only elite from being final-room pressure', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 1 },
        { roomNumber: 2, mobCount: 1 },
        { roomNumber: 3, mobCount: 1 },
      ],
      { rng: rollSequence([1, 1, 1, 0]) },
    );

    expect(rolesForRoom(assignments, 1)).toEqual(['trash']);
    expect(rolesForRoom(assignments, 2)).toEqual(['trash']);
    expect(rolesForRoom(assignments, 3)).toEqual(['elite']);
  });

  it('suppresses the mini-boss when the only mob slot must satisfy the elite guarantee', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 0 },
        { roomNumber: 2, mobCount: 0 },
        { roomNumber: 3, mobCount: 1 },
      ],
      { rng: alwaysRollMiniBoss, miniBossChance: 1 },
    );

    expect(rolesForRoom(assignments, 3)).toEqual(['elite']);
    expect(allRoles(assignments)).not.toContain('mini_boss');
  });

  it('adds the required elite pressure to the final room in 4-room layouts when the mini-boss roll fails', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 2 },
        { roomNumber: 2, mobCount: 2 },
        { roomNumber: 3, mobCount: 2 },
        { roomNumber: 4, mobCount: 2 },
      ],
      { rng: neverRollMiniBoss },
    );

    expect(rolesForRoom(assignments, 4)).toEqual(['elite', 'elite']);
  });

  it('adds a second elite to the latest occupied room in 4-room layouts with an empty final room', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 1 },
        { roomNumber: 2, mobCount: 1 },
        { roomNumber: 3, mobCount: 1 },
        { roomNumber: 4, mobCount: 0 },
      ],
      { rng: neverRollMiniBoss, miniBossChance: 1 },
    );

    expect(assignments).toEqual([
      { room: 1, role: 'trash' },
      { room: 2, role: 'elite' },
      { room: 3, role: 'elite' },
    ]);
    expect(allRoles(assignments)).not.toContain('mini_boss');
  });

  it('does not leave an early elite before later all-trash rooms', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 1 },
        { roomNumber: 2, mobCount: 1 },
        { roomNumber: 3, mobCount: 1 },
        { roomNumber: 4, mobCount: 1 },
      ],
      { rng: rollSequence([0, 1, 1, 1, 1]), eliteChance: 0.5, miniBossChance: 0 },
    );

    expect(rolesForRoom(assignments, 1)).toEqual(['trash']);
    expect(rolesForRoom(assignments, 4)).toEqual(['elite']);
    expectNoEliteBeforeLaterAllTrashRoom(assignments);
  });

  it('moves early elite pressure into open final-room slots before leaving early elites', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 1 },
        { roomNumber: 2, mobCount: 1 },
        { roomNumber: 3, mobCount: 2 },
      ],
      { rng: rollSequence([0, 1, 0, 1, 1]), eliteChance: 0.5, miniBossChance: 0 },
    );

    expect(assignments).toEqual([
      { room: 1, role: 'trash' },
      { room: 2, role: 'trash' },
      { room: 3, role: 'elite' },
      { room: 3, role: 'elite' },
    ]);
    expectNoEliteBeforeLaterAllTrashRoom(assignments);
  });

  it('promotes the last occupied room to elite when the final room has no mob slots', () => {
    const rooms: EncounterRoleRoomLayout[] = [
      { roomNumber: 1, mobCount: 1 },
      { roomNumber: 2, mobCount: 1 },
      { roomNumber: 3, mobCount: 0 },
    ];

    const assignments = assignEncounterRolesToRooms(rooms, {
      rng: neverRollMiniBoss,
      miniBossChance: 1,
    });

    expect(assignments).toEqual([
      { room: 1, role: 'trash' },
      { room: 2, role: 'elite' },
    ]);
    expect(allRoles(assignments)).not.toContain('mini_boss');
  });

  it('keeps chance-rolled early elites when final-room elite pressure exists', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 1 },
        { roomNumber: 2, mobCount: 1 },
        { roomNumber: 3, mobCount: 1 },
      ],
      {
        rng: rollSequence([0, 1, 0, 1]),
        eliteChance: 0.5,
        miniBossChance: 0,
      },
    );

    expect(assignments).toEqual([
      { room: 1, role: 'elite' },
      { room: 2, role: 'trash' },
      { room: 3, role: 'elite' },
    ]);
  });

  it('moves the only chance-rolled elite to the final room', () => {
    const assignments = assignEncounterRolesToRooms(
      [
        { roomNumber: 1, mobCount: 1 },
        { roomNumber: 2, mobCount: 1 },
        { roomNumber: 3, mobCount: 1 },
      ],
      {
        rng: rollSequence([0, 1, 1, 1]),
        eliteChance: 0.5,
        miniBossChance: 0,
      },
    );

    expect(assignments).toEqual([
      { room: 1, role: 'trash' },
      { room: 2, role: 'trash' },
      { room: 3, role: 'elite' },
    ]);
  });
});

describe('rollNormalExplorationMobRole', () => {
  it('returns trash when the elite roll misses', () => {
    expect(rollNormalExplorationMobRole({ rng: () => 1, eliteChance: 0.05 })).toBe('trash');
  });

  it('returns elite when the elite roll hits', () => {
    expect(rollNormalExplorationMobRole({ rng: () => 0, eliteChance: 0.05 })).toBe('elite');
  });

  it('does not emit mini-boss for normal exploration', () => {
    const roles = Array.from({ length: 10 }, () =>
      rollNormalExplorationMobRole({ rng: () => 0, eliteChance: 1 }),
    );

    expect(roles).toEqual(Array(10).fill('elite'));
    expect(roles).not.toContain('mini_boss');
  });
});
