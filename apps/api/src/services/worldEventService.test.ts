import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { roundTimerRegistry } from './roundTimerRegistry';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';

vi.mock('./roundTimerRegistry', () => ({
  roundTimerRegistry: {
    schedule: vi.fn(),
    cancel: vi.fn(),
    rehydrate: vi.fn(),
    clearAll: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    keys: vi.fn().mockReturnValue([]),
  },
}));

import {
  getActiveEventsForZone,
  getActiveWorldWideEvents,
  getActiveZoneModifiers,
  getEventModifiersForEntity,
  getSpawnRateModifiers,
  getAllActiveEvents,
  spawnWorldEvent,
  expireStaleEvents,
  getActiveEventSummaries,
  getEventById,
} from './worldEventService';

const makeEventRow = (overrides: Record<string, any> = {}) => ({
  id: 'evt-1',
  type: 'mob',
  zoneId: 'zone-1',
  title: 'Test Event',
  description: 'A test event',
  effectType: 'damage_up',
  effectValue: 0.5,
  targetMobId: null,
  targetFamily: null,
  targetResource: null,
  startedAt: new Date('2026-02-04T12:00:00Z'),
  expiresAt: new Date('2026-02-04T18:00:00Z'),
  status: 'active',
  createdBy: 'system',
  zone: { name: 'Dark Forest' },
  ...overrides,
});

describe('worldEventService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveEventsForZone', () => {
    it('returns transformed event data for a zone', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([makeEventRow()]);

      const result = await getActiveEventsForZone('zone-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'evt-1',
        type: 'mob',
        scope: 'zone',
        zoneId: 'zone-1',
        zoneName: 'Dark Forest',
        title: 'Test Event',
        effectType: 'damage_up',
        effectValue: 0.5,
        status: 'active',
      }));
    });

    it('returns empty array when no events exist', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);
      const result = await getActiveEventsForZone('zone-1');
      expect(result).toEqual([]);
    });
  });

  describe('getActiveWorldWideEvents', () => {
    it('returns world-wide events with scope "world"', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([
        makeEventRow({ zoneId: null, zone: null }),
      ]);

      const result = await getActiveWorldWideEvents();
      expect(result).toHaveLength(1);
      expect(result[0].scope).toBe('world');
      expect(result[0].zoneName).toBeNull();
    });
  });

  describe('getActiveZoneModifiers', () => {
    it('returns neutral modifiers when no events exist', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);

      const mods = await getActiveZoneModifiers('zone-1');
      expect(mods.mobDamageMultiplier).toBe(1);
      expect(mods.mobHpMultiplier).toBe(1);
      expect(mods.resourceYieldMultiplier).toBe(1);
    });

    it('applies damage_up modifier', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([makeEventRow({ effectType: 'damage_up', effectValue: 0.5 })])
        .mockResolvedValueOnce([]); // world-wide events

      const mods = await getActiveZoneModifiers('zone-1');
      expect(mods.mobDamageMultiplier).toBe(1.5);
    });

    it('applies damage_down modifier with 0.1 floor', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([makeEventRow({ effectType: 'damage_down', effectValue: 0.99 })])
        .mockResolvedValueOnce([]);

      const mods = await getActiveZoneModifiers('zone-1');
      // max(0.1, 1 - 0.99) = 0.1
      expect(mods.mobDamageMultiplier).toBeCloseTo(0.1, 2);
    });

    it('applies hp_up modifier', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([makeEventRow({ effectType: 'hp_up', effectValue: 1 })])
        .mockResolvedValueOnce([]);

      const mods = await getActiveZoneModifiers('zone-1');
      expect(mods.mobHpMultiplier).toBe(2);
    });

    it('applies yield_up modifier', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeEventRow({ zoneId: null, effectType: 'yield_up', effectValue: 0.3 })]);

      const mods = await getActiveZoneModifiers('zone-1');
      expect(mods.resourceYieldMultiplier).toBeCloseTo(1.3, 2);
    });

    it('stacks zone and world events multiplicatively', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([makeEventRow({ effectType: 'damage_up', effectValue: 0.5 })])
        .mockResolvedValueOnce([makeEventRow({ zoneId: null, effectType: 'damage_up', effectValue: 0.5 })]);

      const mods = await getActiveZoneModifiers('zone-1');
      expect(mods.mobDamageMultiplier).toBeCloseTo(2.25, 2); // 1.5 * 1.5
    });

    it('filters targeted events by family context', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ targetFamily: 'wolves', effectType: 'damage_up', effectValue: 0.5 }),
        ])
        .mockResolvedValueOnce([]);

      // Wrong family - should not apply
      const mods1 = await getActiveZoneModifiers('zone-1', { mobFamilyId: 'goblins' });
      expect(mods1.mobDamageMultiplier).toBe(1);

      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ targetFamily: 'wolves', effectType: 'damage_up', effectValue: 0.5 }),
        ])
        .mockResolvedValueOnce([]);

      // Matching family - should apply
      const mods2 = await getActiveZoneModifiers('zone-1', { mobFamilyId: 'wolves' });
      expect(mods2.mobDamageMultiplier).toBe(1.5);
    });
  });

  describe('spawnWorldEvent', () => {
    const baseParams = {
      type: 'mob' as const,
      zoneId: 'zone-1',
      title: 'Test',
      description: 'Desc',
      effectType: 'damage_up' as const,
      effectValue: 0.5,
      durationHours: 6,
    };

    it('creates a new event when no duplicate effect exists', async () => {
      mockPrisma.worldEvent.count.mockResolvedValue(0);
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow());

      const result = await spawnWorldEvent(baseParams);

      expect(result).not.toBeNull();
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });

    it('returns null when duplicate effect exists in same zone', async () => {
      mockPrisma.worldEvent.count.mockResolvedValue(0);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await spawnWorldEvent(baseParams);

      expect(result).toBeNull();
      expect(mockPrisma.worldEvent.create).not.toHaveBeenCalled();
    });

    it('enforces the global cap but skips per-zone checks for world-wide events', async () => {
      mockPrisma.worldEvent.count.mockResolvedValue(0); // global ambient count under cap
      mockPrisma.worldEvent.create.mockResolvedValue(
        makeEventRow({ zoneId: null, zone: null }),
      );

      const result = await spawnWorldEvent({
        ...baseParams,
        zoneId: null,
        type: 'resource',
        effectType: 'yield_up',
        effectValue: 0.3,
      });

      expect(result).not.toBeNull();
      // No per-zone dedup for world-wide events
      expect(mockPrisma.worldEvent.findFirst).not.toHaveBeenCalled();
      // But the global ambient cap IS checked
      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
    });

    it('returns null when the global MAX_ACTIVE_EVENTS cap is reached', async () => {
      // Per-zone count under its cap, but global ambient count at the cap
      mockPrisma.worldEvent.count.mockImplementation((args: any) =>
        Promise.resolve(
          'zoneId' in (args?.where ?? {}) ? 0 : WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS,
        ),
      );

      const result = await spawnWorldEvent(baseParams);

      expect(result).toBeNull();
      // Global cap short-circuits before dedup / create
      expect(mockPrisma.worldEvent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.worldEvent.create).not.toHaveBeenCalled();
    });

    it('allows spawn when below the global MAX_ACTIVE_EVENTS cap', async () => {
      // Per-zone under cap (1), global one below cap
      mockPrisma.worldEvent.count.mockImplementation((args: any) =>
        Promise.resolve(
          'zoneId' in (args?.where ?? {})
            ? 1
            : WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS - 1,
        ),
      );
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow());

      const result = await spawnWorldEvent(baseParams);

      expect(result).not.toBeNull();
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });

    it('allows boss spawn even when the global ambient cap is reached', async () => {
      // Global ambient at cap, but bosses skip the global gate; per-zone count is 0
      mockPrisma.worldEvent.count.mockImplementation((args: any) =>
        Promise.resolve(
          'zoneId' in (args?.where ?? {}) ? 0 : WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS,
        ),
      );
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow({ type: 'boss' }));

      const result = await spawnWorldEvent({
        ...baseParams,
        type: 'boss',
        effectType: 'damage_up',
        effectValue: 0,
      });

      expect(result).not.toBeNull();
      // The global ambient cap query must NOT run for boss spawns
      expect(mockPrisma.worldEvent.count).not.toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });

    it('returns null when zone already has MAX_ZONE_EVENTS active', async () => {
      mockPrisma.worldEvent.count.mockResolvedValue(2); // MAX_ZONE_EVENTS = 2

      const result = await spawnWorldEvent(baseParams);

      expect(result).toBeNull();
      // Should short-circuit before effectType dedup or create
      expect(mockPrisma.worldEvent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.worldEvent.create).not.toHaveBeenCalled();
    });

    it('allows spawn when zone has fewer than MAX_ZONE_EVENTS', async () => {
      mockPrisma.worldEvent.count.mockResolvedValue(1);
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow());

      const result = await spawnWorldEvent(baseParams);

      expect(result).not.toBeNull();
      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { zoneId: 'zone-1', status: 'active' },
      });
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });
  });

  describe('expireStaleEvents', () => {
    it('returns empty array when no stale events exist', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);

      const result = await expireStaleEvents();
      expect(result).toEqual([]);
      expect(mockPrisma.worldEvent.updateMany).not.toHaveBeenCalled();
    });

    it('expires stale events and returns them', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([makeEventRow()]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });

      const result = await expireStaleEvents();
      expect(result).toHaveLength(1);
      expect(mockPrisma.worldEvent.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'evt-1',
          status: 'active',
        },
        data: { status: 'expired' },
      });
      expect(mockPrisma.bossEncounter.findMany).not.toHaveBeenCalled();
      expect(roundTimerRegistry.cancel).not.toHaveBeenCalled();
    });

    it('returns only events actually expired by this invocation', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([makeEventRow()]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await expireStaleEvents();

      expect(result).toEqual([]);
      expect(mockPrisma.bossEncounter.findMany).not.toHaveBeenCalled();
      expect(roundTimerRegistry.cancel).not.toHaveBeenCalled();
    });

    it('expires linked boss encounters and cancels their timers when a boss event goes stale', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([makeEventRow({ type: 'boss' })]);
      mockPrisma.worldEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bossEncounter.findMany.mockResolvedValue([{ id: 'enc-1' }]);
      mockPrisma.bossEncounter.updateMany.mockResolvedValue({ count: 1 });

      await expireStaleEvents();

      expect(mockPrisma.bossEncounter.findMany).toHaveBeenCalledWith({
        where: {
          eventId: { in: ['evt-1'] },
          status: { in: ['waiting', 'in_progress'] },
        },
        select: { id: true },
      });
      expect(mockPrisma.bossEncounter.updateMany).toHaveBeenCalledWith({
        where: {
          eventId: { in: ['evt-1'] },
          status: { in: ['waiting', 'in_progress'] },
        },
        data: {
          status: 'expired',
          nextRoundAt: null,
        },
      });
      expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('bossEncounter', 'enc-1');
    });
  });

  describe('getActiveEventSummaries', () => {
    it('returns compact summaries from zone + world events', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([makeEventRow({ effectType: 'damage_up', effectValue: 0.5 })])
        .mockResolvedValueOnce([makeEventRow({ id: 'evt-2', zoneId: null, effectType: 'yield_up', effectValue: 0.3 })]);

      const result = await getActiveEventSummaries('zone-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ title: 'Test Event', effectType: 'damage_up', effectValue: 0.5 });
    });
  });

  describe('getEventById', () => {
    it('returns event data when found', async () => {
      mockPrisma.worldEvent.findUnique.mockResolvedValue(makeEventRow());

      const result = await getEventById('evt-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('evt-1');
    });

    it('returns null when not found', async () => {
      mockPrisma.worldEvent.findUnique.mockResolvedValue(null);

      const result = await getEventById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getAllActiveEvents', () => {
    it('returns all active events', async () => {
      mockPrisma.worldEvent.findMany.mockResolvedValue([
        makeEventRow(),
        makeEventRow({ id: 'evt-2', zoneId: null, zone: null }),
      ]);

      const result = await getAllActiveEvents();
      expect(result).toHaveLength(2);
    });
  });

  describe('getEventModifiersForEntity', () => {
    it('returns mob-relevant events for a mob family context', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ type: 'mob', effectType: 'damage_up', effectValue: 0.5, targetFamily: 'wolves' }),
        ])
        .mockResolvedValueOnce([]);

      const badges = await getEventModifiersForEntity('zone-1', { mobFamilyId: 'wolves' });
      expect(badges).toHaveLength(1);
      expect(badges[0]).toEqual({
        title: 'Test Event',
        effectType: 'damage_up',
        effectValue: 0.5,
        isGlobal: false,
      });
    });

    it('returns resource-relevant events for a resource type context', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ type: 'resource', effectType: 'yield_up', effectValue: 0.3, targetResource: 'iron_ore' }),
        ])
        .mockResolvedValueOnce([]);

      const badges = await getEventModifiersForEntity('zone-1', { resourceType: 'iron_ore' });
      expect(badges).toHaveLength(1);
      expect(badges[0]).toEqual({
        title: 'Test Event',
        effectType: 'yield_up',
        effectValue: 0.3,
        isGlobal: false,
      });
    });

    it('includes untargeted zone-wide events', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ type: 'mob', effectType: 'hp_up', effectValue: 0.5, targetFamily: null, targetResource: null }),
        ])
        .mockResolvedValueOnce([]);

      const badges = await getEventModifiersForEntity('zone-1', { mobFamilyId: 'wolves' });
      expect(badges).toHaveLength(1);
      expect(badges[0].effectType).toBe('hp_up');
    });

    it('excludes resource events when querying for mobs', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ type: 'resource', effectType: 'yield_up', effectValue: 0.3, targetFamily: null, targetResource: null }),
        ])
        .mockResolvedValueOnce([]);

      const badges = await getEventModifiersForEntity('zone-1', { mobFamilyId: 'wolves' });
      expect(badges).toHaveLength(0);
    });

    it('excludes mob events when querying for resources', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ type: 'mob', effectType: 'damage_up', effectValue: 0.5, targetFamily: null, targetResource: null }),
        ])
        .mockResolvedValueOnce([]);

      const badges = await getEventModifiersForEntity('zone-1', { resourceType: 'iron_ore' });
      expect(badges).toHaveLength(0);
    });

    it('marks zone events as isGlobal false and world events as isGlobal true', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ id: 'evt-zone', type: 'mob', effectType: 'damage_up', effectValue: 0.2 }),
        ])
        .mockResolvedValueOnce([
          makeEventRow({ id: 'evt-world', zoneId: null, type: 'mob', effectType: 'hp_up', effectValue: 0.3 }),
        ]);

      const badges = await getEventModifiersForEntity('zone-1', { mobFamilyId: 'wolves' });
      expect(badges).toHaveLength(2);
      expect(badges[0].isGlobal).toBe(false);
      expect(badges[1].isGlobal).toBe(true);
    });
  });

  describe('getSpawnRateModifiers', () => {
    it('returns global: 1 and empty byFamily when no active events', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([]) // zone events
        .mockResolvedValueOnce([]); // world-wide events

      const result = await getSpawnRateModifiers('zone-1');
      expect(result.global).toBe(1);
      expect(result.byFamily.size).toBe(0);
    });

    it('returns family-specific multiplier for targeted spawn_rate_up', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ effectType: 'spawn_rate_up', effectValue: 0.75, targetFamily: 'wolves' }),
        ])
        .mockResolvedValueOnce([]);

      const result = await getSpawnRateModifiers('zone-1');
      expect(result.byFamily.get('wolves')).toBeCloseTo(1.75);
      expect(result.global).toBe(1);
    });

    it('returns global multiplier for untargeted spawn_rate_up', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ effectType: 'spawn_rate_up', effectValue: 0.5, targetFamily: null }),
        ])
        .mockResolvedValueOnce([]);

      const result = await getSpawnRateModifiers('zone-1');
      expect(result.global).toBeCloseTo(1.5);
      expect(result.byFamily.size).toBe(0);
    });

    it('handles spawn_rate_down correctly', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ effectType: 'spawn_rate_down', effectValue: 0.5, targetFamily: null }),
        ])
        .mockResolvedValueOnce([]);

      const result = await getSpawnRateModifiers('zone-1');
      expect(result.global).toBeCloseTo(0.5);
    });

    it('combines multiple events: stacks family + global multipliers', async () => {
      mockPrisma.worldEvent.findMany
        .mockResolvedValueOnce([
          makeEventRow({ id: 'evt-1', effectType: 'spawn_rate_up', effectValue: 0.5, targetFamily: 'wolves' }),
        ])
        .mockResolvedValueOnce([
          makeEventRow({ id: 'evt-2', zoneId: null, effectType: 'spawn_rate_up', effectValue: 0.25, targetFamily: 'wolves' }),
          makeEventRow({ id: 'evt-3', zoneId: null, effectType: 'spawn_rate_up', effectValue: 0.5, targetFamily: null }),
        ]);

      const result = await getSpawnRateModifiers('zone-1');
      // wolves: 1.5 * 1.25 = 1.875
      expect(result.byFamily.get('wolves')).toBeCloseTo(1.875);
      // global: 1.5
      expect(result.global).toBeCloseTo(1.5);
    });
  });
});
