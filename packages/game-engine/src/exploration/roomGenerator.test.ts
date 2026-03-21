import { describe, it, expect } from 'vitest';
import { generateRoomAssignments } from './roomGenerator';

describe('generateRoomAssignments', () => {
  it('assigns all mobs to 1 room for small sites', () => {
    const result = generateRoomAssignments('small', () => 0.5);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]!.mobCount).toBeGreaterThanOrEqual(2);
    expect(result.rooms[0]!.mobCount).toBeLessThanOrEqual(4);
  });

  it('assigns mobs to 2 rooms for medium sites', () => {
    const result = generateRoomAssignments('medium', () => 0.5);
    expect(result.rooms).toHaveLength(2);
    for (const room of result.rooms) {
      expect(room.mobCount).toBeGreaterThanOrEqual(3);
      expect(room.mobCount).toBeLessThanOrEqual(5);
    }
  });

  it('assigns mobs to 3-4 rooms for large sites', () => {
    const result = generateRoomAssignments('large', () => 0.5);
    expect(result.rooms.length).toBeGreaterThanOrEqual(3);
    expect(result.rooms.length).toBeLessThanOrEqual(4);
    for (const room of result.rooms) {
      expect(room.mobCount).toBeGreaterThanOrEqual(2);
      expect(room.mobCount).toBeLessThanOrEqual(5);
    }
  });

  it('room numbers are 1-indexed and sequential', () => {
    const result = generateRoomAssignments('medium', () => 0.5);
    expect(result.rooms.map(r => r.roomNumber)).toEqual([1, 2]);
  });

  it('totalMobs equals sum of all room mobCounts', () => {
    const result = generateRoomAssignments('large', () => 0.5);
    const sum = result.rooms.reduce((s, r) => s + r.mobCount, 0);
    expect(result.totalMobs).toBe(sum);
  });

  it('returns deterministic results with fixed rng', () => {
    const a = generateRoomAssignments('medium', () => 0.5);
    const b = generateRoomAssignments('medium', () => 0.5);
    expect(a).toEqual(b);
  });
});

describe('medium mob differentiation', () => {
  it('medium rooms have min 3 mobs (higher than small min 2)', () => {
    // With rng always returning 0 (minimum), medium room should have 3 mobs
    const result = generateRoomAssignments('medium', () => 0);
    const room = result.rooms[0];
    expect(room!.mobCount).toBeGreaterThanOrEqual(3);
  });
});
