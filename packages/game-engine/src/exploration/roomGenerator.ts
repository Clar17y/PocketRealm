import { ROOM_CONSTANTS } from '@pocketrealm/shared';
import type { EncounterSiteSize } from '@pocketrealm/shared';

interface RoomLayout {
  roomNumber: number;
  mobCount: number;
}

export interface RoomAssignments {
  rooms: RoomLayout[];
  totalMobs: number;
}

function rollRange(min: number, max: number, rng: () => number): number {
  if (min >= max) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function generateRoomAssignments(
  size: EncounterSiteSize,
  rng: () => number = Math.random,
): RoomAssignments {
  const roomRange = size === 'small' ? ROOM_CONSTANTS.ROOMS_SMALL
    : size === 'medium' ? ROOM_CONSTANTS.ROOMS_MEDIUM
    : ROOM_CONSTANTS.ROOMS_LARGE;

  const mobRange = size === 'small' ? ROOM_CONSTANTS.MOBS_PER_ROOM_SMALL
    : size === 'medium' ? ROOM_CONSTANTS.MOBS_PER_ROOM_MEDIUM
    : ROOM_CONSTANTS.MOBS_PER_ROOM_LARGE;

  const roomCount = rollRange(roomRange.min, roomRange.max, rng);

  const rooms: RoomLayout[] = [];
  let totalMobs = 0;

  for (let i = 0; i < roomCount; i++) {
    const mobCount = rollRange(mobRange.min, mobRange.max, rng);
    rooms.push({ roomNumber: i + 1, mobCount });
    totalMobs += mobCount;
  }

  return { rooms, totalMobs };
}
