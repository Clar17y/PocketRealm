import { describe, it, expect } from 'vitest';
import { generateExpeditionRooms } from './roomGenerator';
import type { CombatantStats, ExpeditionRoomType, ExpeditionTheme } from '@pocketrealm/shared';
import { EXPEDITION_CONSTANTS } from '@pocketrealm/shared';

// --- Test theme ---

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

const TEST_THEME: ExpeditionTheme = {
  id: 'test_theme',
  name: 'Test Theme',
  tier: 1,
  mobFamilyKeys: ['test'],
  trash: [
    {
      key: 'testTrash1', name: 'Goblin', hp: 80,
      stats: makeStats({ hp: 80, maxHp: 80 }),
      actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
    },
    {
      key: 'testTrash2', name: 'Skeleton', hp: 100,
      stats: makeStats(),
      actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
    },
  ],
  elites: [
    {
      key: 'testElite1', name: 'Dire Wolf', hp: 300,
      stats: makeStats({ hp: 300, maxHp: 300, attack: 25 }),
      actionTemplate: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
      ],
    },
  ],
  miniBoss: {
    key: 'testMiniBoss', name: 'Orc Warlord', hp: 600,
    stats: makeStats({ hp: 600, maxHp: 600, attack: 30 }),
    actionTemplate: [
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_enrage', targetMode: 'single_target' },
    ],
  },
  miniBossAdds: [
    {
      key: 'testMiniBossAdd', name: 'Orc Grunt', hp: 80,
      stats: makeStats({ hp: 80, maxHp: 80 }),
      actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
    },
  ],
  casterAdd: {
    key: 'testCaster', name: 'Orc Shaman', hp: 60,
    stats: makeStats({ hp: 60, maxHp: 60, damageType: 'magic' }),
    actionTemplate: [{ actionId: 'boss_magic_attack', targetMode: 'single_target' }],
  },
  regularAdd: {
    key: 'testRegularAdd', name: 'Orc Peon', hp: 50,
    stats: makeStats({ hp: 50, maxHp: 50 }),
    actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
  },
  finalBoss: {
    mob: {
      key: 'testBoss', name: 'Dragon Lord', hp: 1200,
      stats: makeStats({ hp: 1200, maxHp: 1200, attack: 40 }),
      actionTemplate: [],
    },
    phase1: [
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
    ],
    phase2: [
      { actionId: 'boss_magic_attack', targetMode: 'single_target' },
      { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true },
    ],
    phase3: [
      { actionId: 'boss_enrage', targetMode: 'single_target' },
      { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true },
    ],
  },
};

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
  // Tier 0: 3 trash + 1 elite + 1 final_boss = 5 rooms
  // Tier 1: 3 trash + 1 elite + 1 mini_boss + 1 final_boss = 6 rooms
  // Tier 2: 3 trash + 2 elite + 1 mini_boss + 1 event + 1 final_boss = 8 rooms

  it('tier 0 generates 5 rooms with correct composition', () => {
    const rooms = generateExpeditionRooms(0, TEST_THEME, seededRng(1));
    expect(rooms).toHaveLength(5);
    const counts = countRoomTypes(rooms);
    expect(counts['trash']).toBe(3);
    expect(counts['elite']).toBe(1);
    expect(counts['final_boss']).toBe(1);
  });

  it('tier 1 generates 6 rooms with correct composition', () => {
    const rooms = generateExpeditionRooms(1, TEST_THEME, seededRng(42));
    expect(rooms).toHaveLength(6);
    const counts = countRoomTypes(rooms);
    expect(counts['trash']).toBe(3);
    expect(counts['elite']).toBe(1);
    expect(counts['mini_boss']).toBe(1);
    expect(counts['final_boss']).toBe(1);
  });

  it('tier 2 generates 8 rooms with correct composition', () => {
    const rooms = generateExpeditionRooms(2, TEST_THEME, seededRng(99));
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
      const rooms = generateExpeditionRooms(tier, TEST_THEME, seededRng(tier + 10));
      const lastRoom = rooms[rooms.length - 1];
      expect(lastRoom.roomType).toBe('final_boss');
      for (let i = 0; i < rooms.length - 1; i++) {
        expect(rooms[i].roomType).not.toBe('final_boss');
      }
    }
  });

  it('mob counts are within expected range per room type', () => {
    const { MOB_COUNTS } = EXPEDITION_CONSTANTS;
    for (let tier = 0; tier <= 2; tier++) {
      const rooms = generateExpeditionRooms(tier, TEST_THEME, seededRng(tier + 100));
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

  it('mobs use theme roster data directly (no HP scaling)', () => {
    const rooms = generateExpeditionRooms(0, TEST_THEME, seededRng(55));
    const trashNames = new Set(TEST_THEME.trash.map((m) => m.name));
    for (const room of rooms) {
      if (room.roomType === 'trash') {
        for (const mob of room.mobs) {
          expect(trashNames.has(mob.name)).toBe(true);
          const themeMob = TEST_THEME.trash.find((t) => t.name === mob.name)!;
          expect(mob.hp).toBe(themeMob.hp);
          expect(mob.maxHp).toBe(themeMob.hp);
          expect(mob.stats.attack).toBe(themeMob.stats.attack);
        }
      }
    }
  });

  it('mobs have valid structure', () => {
    const rooms = generateExpeditionRooms(0, TEST_THEME, seededRng(55));
    for (const room of rooms) {
      for (const mob of room.mobs) {
        expect(mob.hp).toBeGreaterThan(0);
        expect(mob.maxHp).toBeGreaterThan(0);
        expect(mob.hp).toBe(mob.maxHp);
        expect(mob.stats.attack).toBeGreaterThan(0);
        expect(mob.stats.damageType).toBeDefined();
        expect(mob.prefix).toBeNull();
        expect(mob.activeEffects).toEqual([]);
        expect(mob.mobTemplateId).toBe('');
      }
    }
  });

  it('event rooms have environmentalDotPercent set', () => {
    const rooms = generateExpeditionRooms(2, TEST_THEME, seededRng(200));
    const eventRooms = rooms.filter((r) => r.roomType === 'event');
    expect(eventRooms.length).toBeGreaterThan(0);
    for (const room of eventRooms) {
      expect(room.environmentalDotPercent).toBe(EXPEDITION_CONSTANTS.EVENT_DOT_PERCENT);
    }
    const nonEventRooms = rooms.filter((r) => r.roomType !== 'event');
    for (const room of nonEventRooms) {
      expect(room.environmentalDotPercent).toBeUndefined();
    }
  });

  it('mini-boss rooms have the theme miniBoss as first mob', () => {
    for (let tier = 1; tier <= 2; tier++) {
      const rooms = generateExpeditionRooms(tier, TEST_THEME, seededRng(tier + 300));
      const miniBossRooms = rooms.filter((r) => r.roomType === 'mini_boss');
      expect(miniBossRooms.length).toBe(1);
      for (const room of miniBossRooms) {
        const mainMob = room.mobs[0];
        expect(mainMob.name).toBe(TEST_THEME.miniBoss.name);
        expect(mainMob.actionTemplate).toEqual([...TEST_THEME.miniBoss.actionTemplate]);
        // Adds should be from miniBossAdds or casterAdd
        const addNames = new Set([
          ...TEST_THEME.miniBossAdds.map((a) => a.name),
          TEST_THEME.casterAdd.name,
        ]);
        for (let i = 1; i < room.mobs.length; i++) {
          expect(addNames.has(room.mobs[i].name)).toBe(true);
        }
      }
    }
  });

  it('trash rooms use theme trash mob templates', () => {
    const rooms = generateExpeditionRooms(0, TEST_THEME, seededRng(500));
    const trashTemplates = TEST_THEME.trash.map((t) => [...t.actionTemplate]);
    for (const room of rooms) {
      if (room.roomType === 'trash') {
        for (const mob of room.mobs) {
          expect(trashTemplates).toContainEqual(mob.actionTemplate);
        }
      }
    }
  });

  it('elite rooms use theme elite mob templates', () => {
    const rooms = generateExpeditionRooms(0, TEST_THEME, seededRng(500));
    const eliteTemplates = TEST_THEME.elites.map((t) => [...t.actionTemplate]);
    for (const room of rooms) {
      if (room.roomType === 'elite') {
        for (const mob of room.mobs) {
          expect(eliteTemplates).toContainEqual(mob.actionTemplate);
        }
      }
    }
  });

  it('final boss uses phase templates from theme', () => {
    const rooms = generateExpeditionRooms(0, TEST_THEME, seededRng(500));
    const bossRoom = rooms.find((r) => r.roomType === 'final_boss')!;
    const boss = bossRoom.mobs[0];
    expect(boss.name).toBe(TEST_THEME.finalBoss.mob.name);
    expect(boss.actionTemplate).toEqual([...TEST_THEME.finalBoss.phase1]);
    expect(boss.phaseTemplates).toBeDefined();
    expect(boss.phaseTemplates).toHaveLength(2);
    expect(boss.phaseTemplates![0].template).toEqual([...TEST_THEME.finalBoss.phase3]);
    expect(boss.phaseTemplates![1].template).toEqual([...TEST_THEME.finalBoss.phase2]);
  });

  it('generates unique mob IDs within a room', () => {
    const rooms = generateExpeditionRooms(2, TEST_THEME, seededRng(777));
    for (const room of rooms) {
      const ids = room.mobs.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('generates unique mob IDs across all rooms', () => {
    const rooms = generateExpeditionRooms(2, TEST_THEME, seededRng(888));
    const allIds = rooms.flatMap((r) => r.mobs.map((m) => m.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('roomIndex is sequential starting from 0', () => {
    const rooms = generateExpeditionRooms(2, TEST_THEME, seededRng(999));
    for (let i = 0; i < rooms.length; i++) {
      expect(rooms[i].roomIndex).toBe(i);
    }
  });

  it('throws for invalid tier', () => {
    expect(() => generateExpeditionRooms(5, TEST_THEME)).toThrow();
  });
});
