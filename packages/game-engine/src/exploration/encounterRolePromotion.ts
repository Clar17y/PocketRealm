import { ENCOUNTER_SITE_ROLE_CONSTANTS, type EncounterMobRole } from '@pocketrealm/shared';

export interface EncounterRoleRoomLayout {
  roomNumber: number;
  mobCount: number;
}

export interface EncounterRoleAssignment {
  room: number;
  role: EncounterMobRole;
}

export interface AssignEncounterRolesOptions {
  rng?: () => number;
  miniBossChance?: number;
}

export function assignEncounterRolesToRooms(
  rooms: readonly EncounterRoleRoomLayout[],
  options: AssignEncounterRolesOptions = {},
): EncounterRoleAssignment[] {
  const rng = options.rng ?? Math.random;
  const miniBossChance = options.miniBossChance ?? ENCOUNTER_SITE_ROLE_CONSTANTS.MINI_BOSS_CHANCE;
  const assignments: EncounterRoleAssignment[] = rooms.flatMap((room) =>
    Array.from(
      { length: room.mobCount },
      () => ({ room: room.roomNumber, role: 'trash' }),
    ),
  );

  if (
    rooms.length < ENCOUNTER_SITE_ROLE_CONSTANTS.MIN_ROOMS_FOR_PROMOTED_ROLES
    || assignments.length === 0
  ) {
    return assignments;
  }

  const lastRoom = rooms[rooms.length - 1]!;
  const finalIndexes: number[] = [];
  for (let index = 0; index < assignments.length; index += 1) {
    if (assignments[index]!.room === lastRoom.roomNumber) {
      finalIndexes.push(index);
    }
  }

  if (finalIndexes.length === 0) {
    return assignments;
  }

  const lastFinalIndex = finalIndexes[finalIndexes.length - 1]!;
  const shouldAddMiniBoss = rng() < miniBossChance;
  if (shouldAddMiniBoss) {
    assignments[lastFinalIndex]!.role = 'mini_boss';

    const finalEliteIndex = finalIndexes.find((index) => assignments[index]!.role === 'trash');
    if (finalEliteIndex !== undefined) {
      assignments[finalEliteIndex]!.role = 'elite';
    } else {
      promoteLastTrashBeforeRoom(assignments, lastRoom.roomNumber);
    }
  } else {
    assignments[lastFinalIndex]!.role = 'elite';
  }

  if (rooms.length >= 4) {
    const remainingFinalTrash = finalIndexes.find((index) => assignments[index]!.role === 'trash');
    if (remainingFinalTrash !== undefined) {
      assignments[remainingFinalTrash]!.role = 'elite';
    } else {
      promoteLastTrashBeforeRoom(assignments, lastRoom.roomNumber);
    }
  }

  return assignments;
}

function promoteLastTrashBeforeRoom(assignments: EncounterRoleAssignment[], roomNumber: number): void {
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index]!;
    if (assignment.room < roomNumber && assignment.role === 'trash') {
      assignment.role = 'elite';
      return;
    }
  }
}
