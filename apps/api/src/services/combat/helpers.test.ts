import { describe, expect, it } from 'vitest';
import { getAllAliveMobsInRoom, parseEncounterSiteMobs } from './helpers';

describe('parseEncounterSiteMobs', () => {
  it('parses current mini_boss roles', () => {
    const mobs = parseEncounterSiteMobs({
      mobs: [
        {
          slot: 1,
          mobTemplateId: 'mob-1',
          role: 'mini_boss',
          status: 'alive',
          prefix: null,
          room: 3,
        },
      ],
    });

    expect(mobs).toEqual([
      {
        slot: 1,
        mobTemplateId: 'mob-1',
        role: 'mini_boss',
        status: 'alive',
        prefix: null,
        room: 3,
      },
    ]);
  });

  it('normalizes legacy boss roles to mini_boss', () => {
    const mobs = parseEncounterSiteMobs({
      mobs: [
        {
          slot: 2,
          mobTemplateId: 'mob-2',
          role: 'boss',
          status: 'alive',
          prefix: 'gigantic',
          room: 4,
        },
      ],
    });

    expect(mobs[0]?.role).toBe('mini_boss');
    expect(mobs[0]?.prefix).toBe('gigantic');
  });

  it('rejects invalid role values', () => {
    const mobs = parseEncounterSiteMobs({
      mobs: [
        {
          slot: 1,
          mobTemplateId: 'mob-1',
          role: 'final_boss',
          status: 'alive',
          prefix: null,
          room: 1,
        },
      ],
    });

    expect(mobs).toEqual([]);
  });
});

describe('getAllAliveMobsInRoom', () => {
  it('orders alive room mobs by role pressure before slot number', () => {
    const mobs = parseEncounterSiteMobs({
      mobs: [
        { slot: 3, mobTemplateId: 'mob-3', role: 'mini_boss', status: 'alive', prefix: null, room: 1 },
        { slot: 2, mobTemplateId: 'mob-2', role: 'elite', status: 'alive', prefix: null, room: 1 },
        { slot: 1, mobTemplateId: 'mob-1', role: 'trash', status: 'alive', prefix: null, room: 1 },
        { slot: 0, mobTemplateId: 'mob-0', role: 'trash', status: 'defeated', prefix: null, room: 1 },
      ],
    });

    expect(getAllAliveMobsInRoom(mobs, 1).map((mob) => mob.role)).toEqual([
      'trash',
      'elite',
      'mini_boss',
    ]);
  });
});
