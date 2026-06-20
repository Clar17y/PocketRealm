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
  eliteChance?: number;
  miniBossChance?: number;
}

export interface RollNormalExplorationMobRoleOptions {
  rng?: () => number;
  eliteChance?: number;
}

export function rollNormalExplorationMobRole(
  options: RollNormalExplorationMobRoleOptions = {},
): EncounterMobRole {
  const rng = options.rng ?? Math.random;
  const eliteChance = options.eliteChance ?? ENCOUNTER_SITE_ROLE_CONSTANTS.NORMAL_EXPLORATION_ELITE_CHANCE;
  return rng() < eliteChance ? 'elite' : 'trash';
}

export function assignEncounterRolesToRooms(
  rooms: readonly EncounterRoleRoomLayout[],
  options: AssignEncounterRolesOptions = {},
): EncounterRoleAssignment[] {
  const rng = options.rng ?? Math.random;
  const eliteChance = options.eliteChance ?? ENCOUNTER_SITE_ROLE_CONSTANTS.ENCOUNTER_SITE_ELITE_CHANCE;
  const miniBossChance = options.miniBossChance ?? ENCOUNTER_SITE_ROLE_CONSTANTS.MINI_BOSS_CHANCE;
  const assignments: EncounterRoleAssignment[] = rooms.flatMap((room) =>
    Array.from(
      { length: room.mobCount },
      () => ({ room: room.roomNumber, role: rng() < eliteChance ? 'elite' : 'trash' }),
    ),
  );

  if (
    rooms.length < ENCOUNTER_SITE_ROLE_CONSTANTS.MIN_ROOMS_FOR_PROMOTED_ROLES
    || assignments.length === 0
  ) {
    return assignments;
  }

  const lastRoom = rooms[rooms.length - 1]!;
  const finalIndexes = indexesForRoom(assignments, lastRoom.roomNumber);
  const shouldAddMiniBoss = rng() < miniBossChance;

  if (finalIndexes.length === 0) {
    promoteLatestTrashAtOrBeforeRoom(assignments, lastRoom.roomNumber);
  } else if (shouldAddMiniBoss && finalIndexes.length >= 2) {
    const lastFinalIndex = finalIndexes[finalIndexes.length - 1]!;
    assignments[lastFinalIndex]!.role = 'mini_boss';
    ensureFinalRoomElite(assignments, finalIndexes, lastFinalIndex);
  } else {
    ensureFinalRoomElitePressure(assignments, finalIndexes);
  }

  if (rooms.length >= 4) {
    ensureEliteCount(assignments, lastRoom.roomNumber, 2);
  }

  ensureSingleEliteIsInFinalRoom(assignments, finalIndexes);

  return assignments;
}

function indexesForRoom(
  assignments: readonly EncounterRoleAssignment[],
  roomNumber: number,
): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < assignments.length; index += 1) {
    if (assignments[index]!.room === roomNumber) indexes.push(index);
  }
  return indexes;
}

function ensureFinalRoomElite(
  assignments: EncounterRoleAssignment[],
  finalIndexes: readonly number[],
  excludedIndex?: number,
): void {
  if (finalIndexes.some((index) => index !== excludedIndex && assignments[index]!.role === 'elite')) return;

  const target = findLatestTrashIndex(finalIndexes, assignments, excludedIndex)
    ?? findLatestNonMiniBossIndex(finalIndexes, assignments, excludedIndex);
  if (target === undefined) return;

  assignments[target]!.role = 'elite';
}

function ensureFinalRoomElitePressure(
  assignments: EncounterRoleAssignment[],
  finalIndexes: readonly number[],
): void {
  if (finalIndexes.some((index) => assignments[index]!.role === 'elite')) return;

  if (countRoles(assignments, 'elite') === 1) {
    ensureSingleEliteIsInFinalRoom(assignments, finalIndexes);
    return;
  }

  ensureFinalRoomElite(assignments, finalIndexes);
}

function ensureEliteCount(
  assignments: EncounterRoleAssignment[],
  roomNumber: number,
  minimumEliteCount: number,
): void {
  while (countRoles(assignments, 'elite') < minimumEliteCount) {
    const before = countRoles(assignments, 'elite');
    promoteLatestTrashAtOrBeforeRoom(assignments, roomNumber);
    if (countRoles(assignments, 'elite') === before) return;
  }
}

function ensureSingleEliteIsInFinalRoom(
  assignments: EncounterRoleAssignment[],
  finalIndexes: readonly number[],
): void {
  const eliteIndexes = assignments
    .map((assignment, index) => ({ assignment, index }))
    .filter(({ assignment }) => assignment.role === 'elite')
    .map(({ index }) => index);
  if (eliteIndexes.length !== 1) return;
  if (finalIndexes.includes(eliteIndexes[0]!)) return;

  const finalTarget = findLatestTrashIndex(finalIndexes, assignments);
  if (finalTarget === undefined) return;

  assignments[eliteIndexes[0]!]!.role = 'trash';
  assignments[finalTarget]!.role = 'elite';
}

function countRoles(
  assignments: readonly EncounterRoleAssignment[],
  role: EncounterMobRole,
): number {
  return assignments.filter((assignment) => assignment.role === role).length;
}

function findLatestTrashIndex(
  indexes: readonly number[],
  assignments: readonly EncounterRoleAssignment[],
  excludedIndex?: number,
): number | undefined {
  for (let cursor = indexes.length - 1; cursor >= 0; cursor -= 1) {
    const index = indexes[cursor]!;
    if (index === excludedIndex) continue;
    if (assignments[index]!.role === 'trash') return index;
  }
  return undefined;
}

function findLatestNonMiniBossIndex(
  indexes: readonly number[],
  assignments: readonly EncounterRoleAssignment[],
  excludedIndex?: number,
): number | undefined {
  for (let cursor = indexes.length - 1; cursor >= 0; cursor -= 1) {
    const index = indexes[cursor]!;
    if (index === excludedIndex) continue;
    if (assignments[index]!.role !== 'mini_boss') return index;
  }
  return undefined;
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
