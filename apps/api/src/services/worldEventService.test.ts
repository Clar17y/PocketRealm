import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import {
  getActiveEventsForZone,
  getActiveWorldWideEvents,
  getActiveZoneModifiers,
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
    it('creates a new event when no duplicate effect exists', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow());

      const result = await spawnWorldEvent({
        type: 'mob',
        zoneId: 'zone-1',
        title: 'Test',
        description: 'Desc',
        effectType: 'damage_up',
        effectValue: 0.5,
        durationHours: 6,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });

    it('returns null when duplicate effect exists in same zone', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await spawnWorldEvent({
        type: 'mob',
        zoneId: 'zone-1',
        title: 'Test',
        description: 'Desc',
        effectType: 'damage_up',
        effectValue: 0.5,
        durationHours: 6,
      });

      expect(result).toBeNull();
      expect(mockPrisma.worldEvent.create).not.toHaveBeenCalled();
    });

    it('skips slot check for world-wide events (no zoneId)', async () => {
      mockPrisma.worldEvent.create.mockResolvedValue(
        makeEventRow({ zoneId: null, zone: null }),
      );

      const result = await spawnWorldEvent({
        type: 'resource',
        zoneId: null,
        title: 'World Event',
        description: 'Desc',
        effectType: 'yield_up',
        effectValue: 0.3,
        durationHours: 6,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.worldEvent.findFirst).not.toHaveBeenCalled();
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
          id: { in: ['evt-1'] },
          status: 'active',
        },
        data: { status: 'expired' },
      });
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
});
