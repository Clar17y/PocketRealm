import { describe, it, expect } from 'vitest';
import { generateExpeditionRooms, type MobPoolEntry } from './roomGenerator';
import type { CombatantStats, ExpeditionRoomType } from '@pocketrealm/shared';
import {
  EXPEDITION_CONSTANTS,
  MINI_BOSS_TEMPLATE,
  TRASH_MOB_TEMPLATE,
  ELITE_MOB_TEMPLATE,
  FINAL_BOSS_PHASE1_TEMPLATE,
} from '@pocketrealm/shared';

// --- Test mob pool ---

function makeStats(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    hp: 100,
    maxHp: 100,
    attack: 20,
    accuracy: 15,
    defence: 10,
    magicDefence: 8,
    dodge: 5,
    evasion: 5,
    damageMin: 8,
    damageMax: 14,
    speed: 10,
    damageType: 'physical',
    ...overrides,
  };
}

const TEST_MOB_POOL: MobPoolEntry[] = [
  { mobTemplateId: 'goblin', name: 'Goblin', level: 5, hp: 80, stats: makeStats({ hp: 80, maxHp: 80 }) },
  { mobTemplateId: 'skeleton', name: 'Skeleton', level: 6, hp: 100, stats: makeStats() },
  { mobTemplateId: 'wolf', name: 'Dire Wolf', level: 4, hp: 60, stats: makeStats({ hp: 60, maxHp: 60, speed: 15 }) },
  { mobTemplateId: 'orc', name: 'Orc Warrior', level: 8, hp: 150, stats: makeStats({ hp: 150, maxHp: 150, attack: 25 }) },
  { mobTemplateId: 'spider', name: 'Giant Spider', level: 5, hp: 70, stats: makeStats({ hp: 70, maxHp: 70, dodge: 10 }) },
  { mobTemplateId: 'bat', name: 'Cave Bat', level: 3, hp: 40, stats: makeStats({ hp: 40, maxHp: 40, speed: 20 }) },
  { mobTemplateId: 'troll', name: 'Troll', level: 10, hp: 200, stats: makeStats({ hp: 200, maxHp: 200, defence: 15 }) },
  { mobTemplateId: 'wraith', name: 'Wraith', level: 9, hp: 120, stats: makeStats({ hp: 120, maxHp: 120, damageType: 'magic' }) },
];

// Deterministic seeded RNG for reproducible tests
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function countRoomTypes(rooms: { roomType: ExpeditionRoomType }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rooms) {
    counts[r.roomType] = (counts[r.roomType] ?? 0) + 1;
  }
  return counts;
}

describe('generateExpeditionRooms', () => {
  // Composition from constants:
  // Tier 0: ['trash', 'elite', 'mini_boss', 'event', 'final_boss'] = 5 rooms
  // Tier 1: ['trash', 'elite', 'trash', 'mini_boss', 'event', 'final_boss'] = 6 rooms
  // Tier 2: ['trash', 'elite', 'trash', 'elite', 'mini_boss', 'event', 'trash', 'final_boss'] = 8 rooms

  it('tier 0 generates 5 rooms with correct composition', () => {
    const rooms = generateExpeditionRooms(0, TEST_MOB_POOL, seededRng(1));
    expect(rooms).toHaveLength(5);
    const counts = countRoomTypes(rooms);
    expect(counts['trash']).toBe(1);
    expect(counts['elite']).toBe(1);
    expect(counts['mini_boss']).toBe(1);
    expect(counts['event']).toBe(1);
    expect(counts['final_boss']).toBe(1);
  });

  it('tier 1 generates 6 rooms with correct composition', () => {
    const rooms = generateExpeditionRooms(1, TEST_MOB_POOL, seededRng(42));
    expect(rooms).toHaveLength(6);
    const counts = countRoomTypes(rooms);
    expect(counts['trash']).toBe(2);
    expect(counts['elite']).toBe(1);
    expect(counts['mini_boss']).toBe(1);
    expect(counts['event']).toBe(1);
    expect(counts['final_boss']).toBe(1);
  });

  it('tier 2 generates 8 rooms with correct composition', () => {
    const rooms = generateExpeditionRooms(2, TEST_MOB_POOL, seededRng(99));
    expect(rooms).toHaveLength(8);
    const counts = countRoomTypes(rooms);
    expect(counts['trash']).toBe(3);
    expect(counts['elite']).toBe(2);
    expect(counts['mini_boss']).toBe(1);
    expect(counts['event']).toBe(1);
    expect(counts['final_boss']).toBe(1);
  });

  it('final boss is always the last room', () => {
    for (let tier = 0; tier <= 2; tier++) {
      const rooms = generateExpeditionRooms(tier, TEST_MOB_POOL, seededRng(tier + 10));
      const lastRoom = rooms[rooms.length - 1];
      expect(lastRoom.roomType).toBe('final_boss');
      // Ensure no final_boss appears earlier
      for (let i = 0; i < rooms.length - 1; i++) {
        expect(rooms[i].roomType).not.toBe('final_boss');
      }
    }
  });

  it('mob counts are within expected range per room type', () => {
    const { MOB_COUNTS } = EXPEDITION_CONSTANTS;
    for (let tier = 0; tier <= 2; tier++) {
      const rooms = generateExpeditionRooms(tier, TEST_MOB_POOL, seededRng(tier + 100));
      for (const room of rooms) {
        switch (room.roomType) {
          case 'trash':
            expect(room.mobs.length).toBeGreaterThanOrEqual(MOB_COUNTS.trash[0]);
            expect(room.mobs.length).toBeLessThanOrEqual(MOB_COUNTS.trash[1]);
            break;
          case 'elite':
            expect(room.mobs.length).toBeGreaterThanOrEqual(MOB_COUNTS.elite[0]);
            expect(room.mobs.length).toBeLessThanOrEqual(MOB_COUNTS.elite[1]);
            break;
          case 'mini_boss':
            // 1 main + adds
            expect(room.mobs.length).toBeGreaterThanOrEqual(1 + MOB_COUNTS.mini_boss_adds[0]);
            expect(room.mobs.length).toBeLessThanOrEqual(1 + MOB_COUNTS.mini_boss_adds[1]);
            break;
          case 'event':
            expect(room.mobs.length).toBeGreaterThanOrEqual(MOB_COUNTS.event[0]);
            expect(room.mobs.length).toBeLessThanOrEqual(MOB_COUNTS.event[1]);
            break;
          case 'final_boss':
            expect(room.mobs.length).toBe(1);
            break;
        }
      }
    }
  });

  it('mobs have valid stats from pool', () => {
    const rooms = generateExpeditionRooms(0, TEST_MOB_POOL, seededRng(55));
    const poolTemplateIds = new Set(TEST_MOB_POOL.map((m) => m.mobTemplateId));
    for (const room of rooms) {
      for (const mob of room.mobs) {
        expect(poolTemplateIds.has(mob.mobTemplateId)).toBe(true);
        expect(mob.hp).toBeGreaterThan(0);
        expect(mob.maxHp).toBeGreaterThan(0);
        expect(mob.hp).toBe(mob.maxHp);
        expect(mob.stats.attack).toBeGreaterThan(0);
        expect(mob.stats.damageType).toBeDefined();
        expect(mob.prefix).toBeNull();
        expect(mob.activeEffects).toEqual([]);
      }
    }
  });

  it('event rooms have environmentalDotPercent set', () => {
    for (let tier = 0; tier <= 2; tier++) {
      const rooms = generateExpeditionRooms(tier, TEST_MOB_POOL, seededRng(tier + 200));
      const eventRooms = rooms.filter((r) => r.roomType === 'event');
      expect(eventRooms.length).toBeGreaterThan(0);
      for (const room of eventRooms) {
        expect(room.environmentalDotPercent).toBe(EXPEDITION_CONSTANTS.EVENT_DOT_PERCENT);
      }
      // Non-event rooms should not have it
      const nonEventRooms = rooms.filter((r) => r.roomType !== 'event');
      for (const room of nonEventRooms) {
        expect(room.environmentalDotPercent).toBeUndefined();
      }
    }
  });

  it('mini-boss rooms have 1 main mob with MINI_BOSS_TEMPLATE', () => {
    for (let tier = 0; tier <= 2; tier++) {
      const rooms = generateExpeditionRooms(tier, TEST_MOB_POOL, seededRng(tier + 300));
      const miniBossRooms = rooms.filter((r) => r.roomType === 'mini_boss');
      expect(miniBossRooms.length).toBe(1);
      for (const room of miniBossRooms) {
        // First mob is the main mini-boss
        const mainMob = room.mobs[0];
        expect(mainMob.actionTemplate).toEqual([...MINI_BOSS_TEMPLATE]);
        // Remaining mobs are adds with a different template
        for (let i = 1; i < room.mobs.length; i++) {
          expect(room.mobs[i].actionTemplate).not.toEqual([...MINI_BOSS_TEMPLATE]);
        }
      }
    }
  });

  it('assigns correct action templates per room type', () => {
    const rooms = generateExpeditionRooms(1, TEST_MOB_POOL, seededRng(500));
    for (const room of rooms) {
      for (const mob of room.mobs) {
        switch (room.roomType) {
          case 'trash':
            expect(mob.actionTemplate).toEqual([...TRASH_MOB_TEMPLATE]);
            break;
          case 'elite':
            expect(mob.actionTemplate).toEqual([...ELITE_MOB_TEMPLATE]);
            break;
          case 'event':
            expect(mob.actionTemplate).toEqual([...TRASH_MOB_TEMPLATE]);
            break;
          case 'final_boss':
            expect(mob.actionTemplate).toEqual([...FINAL_BOSS_PHASE1_TEMPLATE]);
            break;
          // mini_boss handled in dedicated test
        }
      }
    }
  });

  it('HP scales by tier', () => {
    const baseMob = TEST_MOB_POOL[0]; // goblin, hp=80
    // Use a pool with only one mob to ensure deterministic picks
    const singlePool = [baseMob];

    const rooms0 = generateExpeditionRooms(0, singlePool, seededRng(1));
    const rooms1 = generateExpeditionRooms(1, singlePool, seededRng(1));
    const rooms2 = generateExpeditionRooms(2, singlePool, seededRng(1));

    // Find a trash mob in each tier's rooms
    const trashRoom0 = rooms0.find((r) => r.roomType === 'trash')!;
    const trashRoom1 = rooms1.find((r) => r.roomType === 'trash')!;
    const trashRoom2 = rooms2.find((r) => r.roomType === 'trash')!;

    // T0: 1x, T1: 1.5x, T2: 2x
    expect(trashRoom0.mobs[0].hp).toBe(Math.round(baseMob.hp * 1));
    expect(trashRoom1.mobs[0].hp).toBe(Math.round(baseMob.hp * 1.5));
    expect(trashRoom2.mobs[0].hp).toBe(Math.round(baseMob.hp * 2));
  });

  it('generates unique mob IDs within a room', () => {
    const rooms = generateExpeditionRooms(2, TEST_MOB_POOL, seededRng(777));
    for (const room of rooms) {
      const ids = room.mobs.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('generates unique mob IDs across all rooms', () => {
    const rooms = generateExpeditionRooms(2, TEST_MOB_POOL, seededRng(888));
    const allIds = rooms.flatMap((r) => r.mobs.map((m) => m.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('roomIndex is sequential starting from 0', () => {
    const rooms = generateExpeditionRooms(2, TEST_MOB_POOL, seededRng(999));
    for (let i = 0; i < rooms.length; i++) {
      expect(rooms[i].roomIndex).toBe(i);
    }
  });

  it('throws for invalid tier', () => {
    expect(() => generateExpeditionRooms(5, TEST_MOB_POOL)).toThrow();
  });
});
