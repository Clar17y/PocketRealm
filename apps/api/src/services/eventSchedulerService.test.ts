import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./worldEventService', () => ({
  expireStaleEvents: vi.fn().mockResolvedValue([]),
  spawnWorldEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock('./bossEncounterService', () => ({
  createBossEncounter: vi.fn().mockResolvedValue({}),
  checkAndResolveDueBossRounds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./systemMessageService', () => ({
  emitSystemMessage: vi.fn().mockResolvedValue({
    id: 'msg-1',
    createdAt: new Date('2026-02-04T12:00:00Z'),
  }),
}));
vi.mock('./pushNotificationService', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./discordNotificationService', () => ({
  broadcastDiscordNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./staticDataCacheService', () => ({
  getCachedZones: vi.fn().mockResolvedValue([]),
  getCachedZoneConnections: vi.fn().mockResolvedValue([]),
  getCachedMobTemplatesByZone: vi.fn().mockResolvedValue([]),
  getCachedBossMobTemplates: vi.fn().mockResolvedValue([]),
  getCachedExpeditionMobTemplates: vi.fn().mockResolvedValue([]),
  getCachedResourceNodesByZone: vi.fn().mockResolvedValue([]),
  getCachedZoneMobFamilies: vi.fn().mockResolvedValue([]),
  getCachedCraftingRecipes: vi.fn().mockResolvedValue([]),
  invalidateStaticCache: vi.fn().mockResolvedValue(undefined),
}));

import { mockPrisma } from '../__test__/setup';
import { checkAndSpawnEvents, _resetBossSpawnTimer } from './eventSchedulerService';
import { expireStaleEvents, spawnWorldEvent } from './worldEventService';
import { createBossEncounter, checkAndResolveDueBossRounds } from './bossEncounterService';
import { emitSystemMessage } from './systemMessageService';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';
import { getCachedZones, getCachedBossMobTemplates, getCachedZoneMobFamilies } from './staticDataCacheService';

const mockGetCachedZones = getCachedZones as ReturnType<typeof vi.fn>;
const mockGetCachedBossMobTemplates = getCachedBossMobTemplates as ReturnType<typeof vi.fn>;
const mockGetCachedZoneMobFamilies = getCachedZoneMobFamilies as ReturnType<typeof vi.fn>;

const BASE = new Date('2099-01-01T00:00:00Z').getTime();
let epoch = 0;

describe('eventSchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    epoch += 10_000_000;
    vi.setSystemTime(BASE + epoch);

    // Reset overridden mock implementations back to defaults
    vi.mocked(expireStaleEvents).mockResolvedValue([]);
    vi.mocked(spawnWorldEvent).mockResolvedValue(null);
    vi.mocked(createBossEncounter).mockResolvedValue({} as any);
    vi.mocked(checkAndResolveDueBossRounds).mockResolvedValue(undefined);
    vi.mocked(emitSystemMessage).mockResolvedValue({
      id: 'msg-1',
      createdAt: new Date('2026-02-04T12:00:00Z'),
    });

    // Block boss spawn timer by default (boss-specific tests override)
    mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);
    // Default: global ambient cap not reached (zone-spawn tests rely on this)
    mockPrisma.worldEvent.count.mockResolvedValue(0);

    // Reset in-memory boss spawn debounce so each test starts fresh
    _resetBossSpawnTimer();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Core checkAndSpawnEvents
  // =========================================================================
  describe('checkAndSpawnEvents', () => {
    it('throttles calls within MIN_INTERVAL_MS', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });
      await checkAndSpawnEvents(null);
      expect(expireStaleEvents).toHaveBeenCalledTimes(1);

      await checkAndSpawnEvents(null);
      expect(expireStaleEvents).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(61_000);
      await checkAndSpawnEvents(null);
      expect(expireStaleEvents).toHaveBeenCalledTimes(3);
    });

    it('calls expireStaleEvents and checkAndResolveDueBossRounds', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });
      await checkAndSpawnEvents(null);

      expect(expireStaleEvents).toHaveBeenCalledOnce();
      expect(checkAndResolveDueBossRounds).toHaveBeenCalledWith(null);
    });

    it('skips spawning if a recent event exists (respawn cooldown)', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent-event' });
      await checkAndSpawnEvents(null);

      expect(expireStaleEvents).toHaveBeenCalledOnce();
      expect(checkAndResolveDueBossRounds).toHaveBeenCalledOnce();
      expect(mockPrisma.worldEvent.count).not.toHaveBeenCalled();
    });

    it('queries worldEvent.findFirst with correct cooldown cutoff', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_WORLD_EVENTS);
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      await checkAndSpawnEvents(null);

      const cooldownMs = WORLD_EVENT_CONSTANTS.EVENT_RESPAWN_DELAY_MINUTES * 60 * 1000;
      const expectedCutoff = new Date(BASE + epoch - cooldownMs);
      expect(mockPrisma.worldEvent.findFirst).toHaveBeenCalledWith({
        where: { startedAt: { gte: expectedCutoff } },
        select: { id: true },
      });
    });

    it('does not attempt to spawn an event when the global ambient cap is reached', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null); // respawn cooldown clear
      // Global ambient count at the cap
      mockPrisma.worldEvent.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS);
      // bossEncounter.count defaults to MAX in beforeEach → boss path skipped
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // would otherwise pick the zone path

      await checkAndSpawnEvents(null);

      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
      expect(spawnWorldEvent).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Expired event messages
  // =========================================================================
  describe('expired event messages', () => {
    it('emits world-scope system message for each expired event', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([
        { id: 'e1', title: 'Full Moon', zoneId: null, zoneName: null },
        { id: 'e2', title: 'Frenzy', zoneId: null, zoneName: null },
      ] as any);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      expect(emitSystemMessage).toHaveBeenCalledTimes(2);
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('Full Moon'),
      );
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('Frenzy'),
      );
    });

    it('emits zone-scope message additionally for zone-scoped expired events', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([
        { id: 'e1', title: 'Bountiful Harvest', zoneId: 'z1', zoneName: 'Dark Forest' },
      ] as any);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      expect(emitSystemMessage).toHaveBeenCalledTimes(2);
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('Dark Forest'),
      );
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'zone', 'zone:z1', expect.stringContaining('Bountiful Harvest'),
      );
    });

    it('uses "the world" when zoneName is null for world-wide expired events', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([
        { id: 'e1', title: 'Blood Moon', zoneId: null, zoneName: null },
      ] as any);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('the world'),
      );
    });

    it('does not emit zone message for world-wide expired events (no zoneId)', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([
        { id: 'e1', title: 'Event A', zoneId: null, zoneName: null },
      ] as any);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      // Only one call (world scope), no zone:X message
      expect(emitSystemMessage).toHaveBeenCalledTimes(1);
      expect(emitSystemMessage).toHaveBeenCalledWith(null, 'world', 'world', expect.any(String));
    });

    it('passes io to emitSystemMessage for expired events', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([
        { id: 'e1', title: 'Test', zoneId: 'z1', zoneName: 'Forest' },
      ] as any);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      const fakeIo = { emit: vi.fn() } as any;
      await checkAndSpawnEvents(fakeIo);

      expect(emitSystemMessage).toHaveBeenCalledWith(fakeIo, 'world', 'world', expect.any(String));
      expect(emitSystemMessage).toHaveBeenCalledWith(fakeIo, 'zone', 'zone:z1', expect.any(String));
    });
  });

  // =========================================================================
  // trySpawnWorldWideEvent
  // =========================================================================
  describe('world-wide event spawning', () => {
    function setupWorldWidePath() {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.count.mockResolvedValue(0);
    }

    it('spawns a world-wide event when template and target resolve successfully', async () => {
      setupWorldWidePath();
      const randomSpy = vi.spyOn(Math, 'random');
      // random=0.01 picks first world template: "Corruption Surge" (fixedTarget: "Abominations")
      randomSpy.mockReturnValue(0.01);

      // getRelevantTargets — no players in wild zones → hasPlayers=false → all templates eligible
      mockPrisma.player.findMany.mockResolvedValue([]);

      // resolveTarget for "Corruption Surge": fixedTarget="Abominations"
      // Must match case-insensitively in the returned families
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Abominations' } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({
        id: 'we1',
        title: 'Corruption Surge',
        description: 'A wave of corruption strengthens Abominations everywhere.',
      } as any);

      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: null }),
      );
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('Corruption Surge'),
      );
    });

    it('skips spawning when world-wide cap is reached', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_WORLD_EVENTS);
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      await checkAndSpawnEvents(null);

      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { zoneId: null, status: 'active' },
      });
      expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
      expect(spawnWorldEvent).not.toHaveBeenCalled();
    });

    it('queries player zones for relevant target filtering', async () => {
      setupWorldWidePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([
        { currentZone: { id: 'wz1', zoneType: 'wild' } },
      ]);
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamily: { name: 'Wolves' } },
      ]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([
        { resourceType: 'Copper Ore' },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'we1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      expect(mockPrisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { currentZoneId: { not: null } },
        }),
      );
    });

    it('collects families and resources from wild zones (excludes towns)', async () => {
      setupWorldWidePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([
        { currentZone: { id: 't1', zoneType: 'town' } },
        { currentZone: { id: 'wz1', zoneType: 'wild' } },
      ]);
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamily: { name: 'Wolves' } },
      ]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      // getRelevantTargets only queries families/resources in wild zones
      expect(mockPrisma.zoneMobFamily.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { zoneId: { in: ['wz1'] } },
        }),
      );
    });

    it('does not spawn when resolveTarget returns null (no families/resources)', async () => {
      setupWorldWidePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([]);
      // No families or resources anywhere → resolveTarget returns null
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).not.toHaveBeenCalled();
    });

    it('does not emit system message when spawnWorldEvent returns null', async () => {
      setupWorldWidePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([]);
      // First picked template is "Corruption Surge" (fixedTarget: "Abominations")
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Abominations' } },
      ]);

      // spawnWorldEvent returns null (e.g. per-zone cap enforced there)
      vi.mocked(spawnWorldEvent).mockResolvedValue(null);
      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalled();
      expect(emitSystemMessage).not.toHaveBeenCalled();
    });

    it('passes WORLD_WIDE_EVENT_DURATION_HOURS for world-scope templates', async () => {
      setupWorldWidePath();
      // random=0.01 → world path, and pickWeighted picks first template "Corruption Surge" (fixedTarget: "Abominations")
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Abominations' } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'we1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      expect(args.durationHours).toBe(WORLD_EVENT_CONSTANTS.WORLD_WIDE_EVENT_DURATION_HOURS);
    });

    it('replaces {target} placeholder in title and description for family targeting', async () => {
      setupWorldWidePath();
      // random=0.01 → world path, pickWeighted picks "Corruption Surge" (fixedTarget: "Abominations")
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Abominations' } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'we1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      // "Corruption Surge" template title has no {target}; description has none either
      expect(args.title).not.toContain('{target}');
      expect(args.description).not.toContain('{target}');
    });

    it('includes targetFamily in spawn params for family-targeting template', async () => {
      setupWorldWidePath();
      // random=0.01 → world path, pickWeighted picks "Corruption Surge" (fixedTarget: "Abominations")
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Abominations' } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'we1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      // "Corruption Surge" is family-targeting — resolveTarget sets targetFamily to the matched family's id
      expect(args.targetFamily).toBe('f1');
    });
  });

  // =========================================================================
  // trySpawnZoneEvent
  // =========================================================================
  describe('zone event spawning', () => {
    function setupZonePath() {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
    }

    it('skips when no wild zones exist', async () => {
      setupZonePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.9);
      mockGetCachedZones.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).not.toHaveBeenCalled();
    });

    it('prefers zones without active events (free zones)', async () => {
      setupZonePath();
      // random=0.99 → zone path; pickRandom([z2]) → z2;
      // pickWeighted picks last zone template "{target} Weakening" (family targeting, hp_down)
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Forest', zoneType: 'wild' },
        { id: 'z2', name: 'Swamp', zoneType: 'wild' },
      ]);
      // z1 has an active event, z2 is free → freeZones = [z2] → z2 selected
      mockPrisma.worldEvent.findMany.mockResolvedValue([
        { zoneId: 'z1', effectType: 'damage_up' },
      ]);
      // Boss cap reached to skip boss path
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      // Provide family data so "{target} Weakening" (family template) resolves
      mockGetCachedZoneMobFamilies.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Wolves', members: [] } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({
        id: 'ze1', title: 'Test', description: 'Test',
      } as any);

      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      expect(vi.mocked(spawnWorldEvent).mock.calls[0]![0]).toEqual(
        expect.objectContaining({ zoneId: 'z2' }),
      );
    });

    it('filters out templates whose effectType conflicts with active zone events', async () => {
      setupZonePath();
      // random=0.99 → zone path; only zone z1 selected;
      // pickWeighted with damage_up filtered out picks "{target} Weakening" (hp_down, family)
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Forest', zoneType: 'wild' },
      ]);
      mockPrisma.worldEvent.findMany.mockResolvedValue([
        { zoneId: 'z1', effectType: 'damage_up' },
      ]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      mockGetCachedZoneMobFamilies.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Wolves', members: [] } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({
        id: 'ze1', title: 'Test', description: 'Test',
      } as any);

      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      // Should not duplicate the already active effectType
      expect(args.effectType).not.toBe('damage_up');
    });

    it('emits both world and zone system messages on successful zone event spawn', async () => {
      setupZonePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Dark Forest', zoneType: 'wild' },
      ]);
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      // Provide both families and resources so any template (family/resource/zone targeting) resolves
      mockGetCachedZoneMobFamilies.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Wolves', members: [] } },
      ]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([
        { resourceType: 'Iron Ore' },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({
        id: 'ze1',
        title: 'Zone Event Title',
        description: 'Zone event description.',
      } as any);

      await checkAndSpawnEvents(null);

      // Verify world-scope message mentioning the zone name
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('Dark Forest'),
      );
      // Verify zone-scope message
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'zone', 'zone:z1', expect.stringContaining('Zone Event Title'),
      );
    });

    it('does not emit messages when spawnWorldEvent returns null for zone event', async () => {
      setupZonePath();
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Forest', zoneType: 'wild' },
      ]);
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      mockGetCachedZoneMobFamilies.mockResolvedValue([]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([
        { resourceType: 'Copper Ore' },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue(null);
      await checkAndSpawnEvents(null);

      expect(emitSystemMessage).not.toHaveBeenCalled();
    });

    it('uses zone duration for resource-type zone events', async () => {
      setupZonePath();
      // Controlled random sequence:
      //   call 1: 0.99 → zone path
      //   call 2: 0.0  → pickRandom picks first (only) zone
      //   call 3: 0.30 → pickWeighted picks "Rich {target} Veins" (resource targeting, yield_up)
      let callIdx = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return 0.99;
        if (callIdx === 2) return 0.0;
        return 0.30; // picks "Rich {target} Veins"
      });

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Forest', zoneType: 'wild' },
      ]);
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      mockGetCachedZoneMobFamilies.mockResolvedValue([]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([
        { resourceType: 'Copper Ore' },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'ze1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      // "Rich {target} Veins" is a resource-type template → uses RESOURCE_EVENT_DURATION_HOURS
      expect(args.durationHours).toBe(WORLD_EVENT_CONSTANTS.RESOURCE_EVENT_DURATION_HOURS);
    });

    it('falls back to all wild zones when all have active events', async () => {
      setupZonePath();
      // random=0.99 → zone path; freeZones empty → candidatePool = all wild zones;
      // pickRandom([z1,z2]) with 0.99 → Math.floor(0.99*2)=1 → z2;
      // "{target} Weakening" (family, hp_down) picked by pickWeighted
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Forest', zoneType: 'wild' },
        { id: 'z2', name: 'Swamp', zoneType: 'wild' },
      ]);
      // Both zones have active events → freeZones is empty → candidatePool = wildZones
      mockPrisma.worldEvent.findMany.mockResolvedValue([
        { zoneId: 'z1', effectType: 'damage_up' },
        { zoneId: 'z2', effectType: 'hp_up' },
      ]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      // Provide family data so "{target} Weakening" (family template) can resolve
      mockGetCachedZoneMobFamilies.mockResolvedValue([
        { mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Wolves', members: [] } },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'ze1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      // Falls back to all zones; z2 is selected (index 1 of [z1,z2])
      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      expect(args.zoneId).toBe('z2');
    });
  });

  // =========================================================================
  // Boss spawning (dedicated timer)
  // =========================================================================
  describe('boss spawning (dedicated timer)', () => {
    function setupBossSpawnPath() {
      // Block event spawning — only test boss spawning
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });
      // Allow boss spawning
      mockPrisma.bossEncounter.count.mockResolvedValue(0);
      mockPrisma.bossEncounter.findFirst.mockResolvedValue(null);
    }

    it('spawns a boss when timer elapses and boss mob exists', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Cursed Swamp', zoneType: 'wild' },
      ]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([
        { mobFamilyId: 'fam1', mobFamily: { id: 'fam1', name: 'Swamp', members: [{ mobTemplateId: 'boss1' }] } },
      ]);
      mockGetCachedBossMobTemplates.mockResolvedValue([
        { id: 'boss1', name: 'Swamp Horror', hp: 500, bossBaseHp: 1000, isBoss: true },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({
        id: 'be1',
        title: 'Swamp Horror Appears',
        description: 'A fearsome Swamp Horror has been spotted in Cursed Swamp!',
      } as any);
      mockPrisma.worldEvent.update.mockResolvedValue({});

      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'boss',
          zoneId: 'z1',
          title: 'Swamp Horror Appears',
          effectType: 'damage_up',
          effectValue: 0,
          durationHours: 0,
        }),
      );
      // expiresAt set to null
      expect(mockPrisma.worldEvent.update).toHaveBeenCalledWith({
        where: { id: 'be1' },
        data: { expiresAt: null },
      });
      // createBossEncounter uses bossBaseHp
      expect(createBossEncounter).toHaveBeenCalledWith('be1', 'boss1', 1000);
      // System messages
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'world', 'world', expect.stringContaining('Swamp Horror'),
      );
      expect(emitSystemMessage).toHaveBeenCalledWith(
        null, 'zone', 'zone:z1', expect.stringContaining('Swamp Horror'),
      );
    });

    it('falls back to mob hp when bossBaseHp is null', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Forest', zoneType: 'wild' }]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([{ mobFamilyId: 'fam1', mobFamily: { id: 'fam1', name: 'Forest', members: [{ mobTemplateId: 'boss1' }] } }]);
      mockGetCachedBossMobTemplates.mockResolvedValue([
        { id: 'boss1', name: 'Forest Guardian', hp: 300, bossBaseHp: null, isBoss: true },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'be2', title: 'Forest Guardian Appears' } as any);
      mockPrisma.worldEvent.update.mockResolvedValue({});

      await checkAndSpawnEvents(null);

      expect(createBossEncounter).toHaveBeenCalledWith('be2', 'boss1', 300);
    });

    it('skips boss spawn when MAX_BOSS_ENCOUNTERS reached', async () => {
      // bossEncounter.count defaults to MAX in beforeEach — don't override
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      expect(mockPrisma.bossEncounter.count).toHaveBeenCalledWith({
        where: { status: { in: ['waiting', 'in_progress'] } },
      });
      expect(createBossEncounter).not.toHaveBeenCalled();
    });

    it('respects 12-hour DB-based cooldown', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });
      mockPrisma.bossEncounter.count.mockResolvedValue(0);
      mockPrisma.bossEncounter.findFirst.mockResolvedValue({ id: 'recent-boss' });

      await checkAndSpawnEvents(null);

      const intervalMs = WORLD_EVENT_CONSTANTS.BOSS_SPAWN_INTERVAL_HOURS * 60 * 60 * 1000;
      const expectedCutoff = new Date(BASE + epoch - intervalMs);
      expect(mockPrisma.bossEncounter.findFirst).toHaveBeenCalledWith({
        where: { event: { startedAt: { gte: expectedCutoff } } },
        select: { id: true },
      });
      expect(createBossEncounter).not.toHaveBeenCalled();
    });

    it('picks a random wild zone for boss spawn', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([
        { id: 'z1', name: 'Forest', zoneType: 'wild' },
        { id: 'z2', name: 'Swamp', zoneType: 'wild' },
      ]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([]);
      mockGetCachedBossMobTemplates.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      expect(mockGetCachedZones).toHaveBeenCalled();
    });

    it('skips boss spawn when no wild zones exist', async () => {
      setupBossSpawnPath();
      mockGetCachedZones.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      expect(createBossEncounter).not.toHaveBeenCalled();
    });

    it('skips boss spawn when no boss mobs exist for zone families', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Forest', zoneType: 'wild' }]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([{ mobFamilyId: 'fam1', mobFamily: { id: 'fam1', name: 'Forest', members: [] } }]);
      mockGetCachedBossMobTemplates.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      expect(createBossEncounter).not.toHaveBeenCalled();
    });

    it('does not create boss encounter when spawnWorldEvent returns null', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Forest', zoneType: 'wild' }]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([{ mobFamilyId: 'fam1', mobFamily: { id: 'fam1', name: 'Forest', members: [{ mobTemplateId: 'boss1' }] } }]);
      mockGetCachedBossMobTemplates.mockResolvedValue([
        { id: 'boss1', name: 'Boss', hp: 100, bossBaseHp: null, isBoss: true },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue(null);
      await checkAndSpawnEvents(null);

      expect(createBossEncounter).not.toHaveBeenCalled();
      expect(mockPrisma.worldEvent.update).not.toHaveBeenCalled();
    });

    it('fetches boss mobs from cache and filters by zone family members', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Forest', zoneType: 'wild' }]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([
        { mobFamilyId: 'fam1', mobFamily: { id: 'fam1', name: 'Forest', members: [{ mobTemplateId: 'mob1' }] } },
        { mobFamilyId: 'fam2', mobFamily: { id: 'fam2', name: 'Swamp', members: [{ mobTemplateId: 'mob2' }] } },
      ]);
      mockGetCachedBossMobTemplates.mockResolvedValue([]);

      await checkAndSpawnEvents(null);

      expect(mockGetCachedBossMobTemplates).toHaveBeenCalled();
      expect(mockGetCachedZoneMobFamilies).toHaveBeenCalledWith('z1');
    });

    it('passes io parameter to emitSystemMessage for boss spawn', async () => {
      setupBossSpawnPath();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Forest', zoneType: 'wild' }]);
      mockGetCachedZoneMobFamilies.mockResolvedValue([{ mobFamilyId: 'f1', mobFamily: { id: 'f1', name: 'Forest', members: [{ mobTemplateId: 'b1' }] } }]);
      mockGetCachedBossMobTemplates.mockResolvedValue([
        { id: 'b1', name: 'Boss', hp: 100, bossBaseHp: null, isBoss: true },
      ]);
      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'be1', title: 'Boss' } as any);
      mockPrisma.worldEvent.update.mockResolvedValue({});

      const fakeIo = { emit: vi.fn() } as any;
      await checkAndSpawnEvents(fakeIo);

      expect(emitSystemMessage).toHaveBeenCalledWith(fakeIo, 'world', 'world', expect.any(String));
      expect(emitSystemMessage).toHaveBeenCalledWith(fakeIo, 'zone', 'zone:z1', expect.any(String));
    });
  });

  // =========================================================================
  // resolveTarget — family and resource targeting
  // =========================================================================
  describe('resolveTarget (via spawn flow)', () => {
    it('resolves resource targeting with targetResource set', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      // Controlled random sequence to deterministically pick "Rich {target} Veins" (resource targeting):
      //   call 1: 0.99 → zone path
      //   call 2: 0.0  → pickRandom picks first (only) zone
      //   call 3: 0.30 → pickWeighted picks "Rich {target} Veins" (resource targeting, yield_up)
      let callIdx = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return 0.99;
        if (callIdx === 2) return 0.0;
        return 0.30;
      });

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Mine', zoneType: 'wild' }]);
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      mockGetCachedZoneMobFamilies.mockResolvedValue([]);
      mockPrisma.resourceNode.findMany.mockResolvedValue([
        { resourceType: 'Iron Ore' },
      ]);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'ev1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      const args = vi.mocked(spawnWorldEvent).mock.calls[0]![0] as any;
      expect(args.targetResource).toBe('Iron Ore');
      expect(args.title).not.toContain('{target}');
    });

    it('resolves zone targeting without DB lookups for families/resources', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      // Controlled random sequence to pick "Bountiful Harvest" (zone targeting — no DB lookups):
      //   call 1: 0.99 → zone path
      //   call 2: 0.0  → pickRandom picks first (only) zone
      //   call 3: 0.0  → pickWeighted picks first template "Bountiful Harvest" (zone targeting)
      let callIdx = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return 0.99;
        if (callIdx === 2) return 0.0;
        return 0.0;
      });

      mockGetCachedZones.mockResolvedValue([{ id: 'z1', name: 'Forest', zoneType: 'wild' }]);
      mockPrisma.worldEvent.findMany.mockResolvedValue([]);
      mockPrisma.bossEncounter.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS);

      vi.mocked(spawnWorldEvent).mockResolvedValue({ id: 'ev1', title: 'T', description: 'D' } as any);
      await checkAndSpawnEvents(null);

      // Zone-targeting resolveTarget returns immediately — no family/resource lookups
      expect(spawnWorldEvent).toHaveBeenCalledOnce();
      expect(mockGetCachedZoneMobFamilies).not.toHaveBeenCalled();
      expect(mockPrisma.resourceNode.findMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // IO parameter forwarding
  // =========================================================================
  describe('IO parameter forwarding', () => {
    it('passes io parameter to checkAndResolveDueBossRounds', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });
      const fakeIo = { emit: vi.fn() } as any;
      await checkAndSpawnEvents(fakeIo);

      expect(checkAndResolveDueBossRounds).toHaveBeenCalledWith(fakeIo);
    });

    // Boss IO forwarding test moved to 'boss spawning (dedicated timer)' section
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('handles empty expired events array gracefully', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([]);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      expect(emitSystemMessage).not.toHaveBeenCalled();
    });

    it('handles multiple expired events including mix of world and zone', async () => {
      vi.mocked(expireStaleEvents).mockResolvedValue([
        { id: 'e1', title: 'World Event', zoneId: null, zoneName: null },
        { id: 'e2', title: 'Zone Event', zoneId: 'z1', zoneName: 'Forest' },
        { id: 'e3', title: 'Zone Event 2', zoneId: 'z2', zoneName: 'Swamp' },
      ] as any);
      mockPrisma.worldEvent.findFirst.mockResolvedValue({ id: 'recent' });

      await checkAndSpawnEvents(null);

      // 1 world msg (e1) + 2 world msgs (e2, e3) + 2 zone msgs (e2, e3) = 5 total
      expect(emitSystemMessage).toHaveBeenCalledTimes(5);
    });

    it('50/50 coin flip: random exactly 0.5 takes zone path', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      mockGetCachedZones.mockResolvedValue([]); // no zones → early exit

      await checkAndSpawnEvents(null);

      // getCachedZones is only called in the zone path
      expect(mockGetCachedZones).toHaveBeenCalled();
      // Global cap check runs first (count < MAX → spawn roll proceeds), then zone path taken
      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
      // World-wide cap count is NOT called (zone path taken)
      expect(mockPrisma.worldEvent.count).not.toHaveBeenCalledWith({
        where: { zoneId: null, status: 'active' },
      });
    });

    it('50/50 coin flip: random 0.49 takes world-wide path', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      vi.spyOn(Math, 'random').mockReturnValue(0.49);

      // World path → world-wide cap count check (global cap check uses count with 'type: { not: boss }')
      mockPrisma.worldEvent.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_WORLD_EVENTS);

      await checkAndSpawnEvents(null);

      // Both the global ambient cap check and the world-wide cap check call count
      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { zoneId: null, status: 'active' },
      });
      expect(mockGetCachedZones).not.toHaveBeenCalled();
    });
  });
});
