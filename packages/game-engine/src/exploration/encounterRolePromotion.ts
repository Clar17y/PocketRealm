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
    promoteLatestTrashAtOrBeforeRoom(assignments, lastRoom.roomNumber);
  } else {
    const lastFinalIndex = finalIndexes[finalIndexes.length - 1]!;
    const shouldAddMiniBoss = rng() < miniBossChance;
    const hasEliteSlotAfterMiniBoss = findLatestTrashIndexAtOrBeforeRoom(
      assignments,
      lastRoom.roomNumber,
      lastFinalIndex,
    ) !== undefined;

    if (shouldAddMiniBoss && hasEliteSlotAfterMiniBoss) {
      assignments[lastFinalIndex]!.role = 'mini_boss';
      promoteLatestTrashAtOrBeforeRoom(assignments, lastRoom.roomNumber, lastFinalIndex);
    } else {
      assignments[lastFinalIndex]!.role = 'elite';
    }
  }

  if (rooms.length >= 4) {
    promoteLatestTrashAtOrBeforeRoom(assignments, lastRoom.roomNumber);
  }

  return assignments;
}

function promoteLatestTrashAtOrBeforeRoom(
  assignments: EncounterRoleAssignment[],
  roomNumber: number,
  excludedIndex?: number,
): void {
  const index = findLatestTrashIndexAtOrBeforeRoom(assignments, roomNumber, excludedIndex);
  if (index === undefined) return;

  assignments[index]!.role = 'elite';
}

function findLatestTrashIndexAtOrBeforeRoom(
  assignments: readonly EncounterRoleAssignment[],
  roomNumber: number,
  excludedIndex?: number,
): number | undefined {
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    if (index === excludedIndex) continue;

    const assignment = assignments[index]!;
    if (assignment.room <= roomNumber && assignment.role === 'trash') {
      return index;
    }
  }

  return undefined;
}
