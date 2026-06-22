import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { getMobPrefixDefinition, COMBAT_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPagination, serializeXpGrant } from '../../utils/routeHelpers.js';
import { getEventModifiersForEntity, type EventModifierBadge } from '../../services/worldEventService';
import {
  listEncounterSitesQuerySchema,
  applyEncounterSiteDecayAndPersist,
} from '../../services/combat/helpers';
import {
  autoResolveEncounterRoom,
  startManualEncounterRoom,
  resolveManualEncounterRound,
  clearManualCombatSession,
  parseEncounterMobSlot,
} from '../../services/encounterSiteCombatService';
import { buildStateUpdates, mergeLootIntoStateUpdates } from '../../services/stateUpdateHelpers.js';
import { requireActiveSeason } from '../../middleware/seasonGuard';

const abandonSchema = z.object({
  zoneId: z.string().uuid().optional(),
});

const roundSchema = z.object({
  action: z.enum(['template']).optional(),
  targetMobSlot: z.number().int().optional(),
});

async function mapChestRewardDTO(completionRewards: Awaited<ReturnType<typeof autoResolveEncounterRoom>>['completionRewards']) {
  if (!completionRewards) return undefined;

  // Look up item template names for the loot
  const templateIds = [...new Set(completionRewards.loot.map(l => l.itemTemplateId))];
  const templates = templateIds.length > 0
    ? await prisma.itemTemplate.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameMap = new Map(templates.map(t => [t.id, t.name]));

  return {
    rarity: completionRewards.chestRarity,
    materials: completionRewards.loot.map(l => ({
      itemTemplateId: l.itemTemplateId,
      name: nameMap.get(l.itemTemplateId) ?? l.itemTemplateId,
      quantity: l.quantity,
    })),
    recipe: completionRewards.recipeUnlocked
      ? { recipeId: completionRewards.recipeUnlocked.recipeId, name: completionRewards.recipeUnlocked.recipeName }
      : null,
  };
}

export function registerSiteRoutes(router: Router): void {
  /**
   * GET /api/v1/combat/sites?page=1&pageSize=10&zoneId=...&mobFamilyId=...&sort=danger
   * List encounter sites for the current player with pagination and filters.
   */
  router.get('/sites', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      const parsedQuery = listEncounterSitesQuerySchema.safeParse({
        zoneId: req.query.zoneId,
        mobFamilyId: req.query.mobFamilyId,
        sort: req.query.sort,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      if (!parsedQuery.success) {
        throw new AppError(400, 'Invalid encounter site query parameters', 'INVALID_QUERY');
      }
      const query = parsedQuery.data;
      const now = new Date();

      const sites = await prisma.encounterSite.findMany({
        where: {
          playerId,
          ...(query.zoneId ? { zoneId: query.zoneId } : {}),
          ...(query.mobFamilyId ? { mobFamilyId: query.mobFamilyId } : {}),
        },
        include: {
          zone: { select: { name: true } },
          mobFamily: { select: { id: true, name: true } },
        },
        orderBy: [{ discoveredAt: 'desc' }],
      });

      const activeSites: Array<{
        encounterSiteId: string;
        zoneId: string;
        zoneName: string;
        mobFamilyId: string;
        mobFamilyName: string;
        siteName: string;
        size: string;
        totalMobs: number;
        aliveMobs: number;
        defeatedMobs: number;
        decayedMobs: number;
        nextMobTemplateId: string | null;
        nextMobPrefix: string | null;
        discoveredAt: string;
        currentRoom: number;
        totalRooms: number;
        roomMobCounts: Array<{ room: number; alive: number; total: number }>;
        currentRoomMobs: Array<{ slot: number; mobTemplateId: string; prefix: string | null; status: string }>;
      }> = [];

      for (const site of sites) {
        const decayed = await applyEncounterSiteDecayAndPersist({
          id: site.id,
          playerId: site.playerId,
          discoveredAt: site.discoveredAt,
          mobs: site.mobs,
        }, now);
        if (!decayed) continue;

        const roomNumbers = [...new Set(decayed.mobs.map(m => m.room ?? 1))].sort((a, b) => a - b);
        const roomMobCounts = roomNumbers.map(room => {
          const roomMobs = decayed.mobs.filter(m => (m.room ?? 1) === room);
          return {
            room,
            alive: roomMobs.filter(m => m.status === 'alive').length,
            total: roomMobs.length,
          };
        });

        const currentRoomNumber = site.currentRoom ?? 1;
        const currentRoomMobs = decayed.mobs
          .filter(m => (m.room ?? 1) === currentRoomNumber && m.status === 'alive')
          .map(m => ({ slot: m.slot, mobTemplateId: m.mobTemplateId, prefix: m.prefix ?? null, status: m.status }));

        activeSites.push({
          encounterSiteId: site.id,
          zoneId: site.zoneId,
          zoneName: site.zone.name,
          mobFamilyId: site.mobFamilyId,
          mobFamilyName: site.mobFamily.name,
          siteName: site.name,
          size: site.size,
          totalMobs: decayed.state.total,
          aliveMobs: decayed.state.alive,
          defeatedMobs: decayed.state.defeated,
          decayedMobs: decayed.state.decayed,
          nextMobTemplateId: decayed.nextMob?.mobTemplateId ?? null,
          nextMobPrefix: decayed.nextMob?.prefix ?? null,
          discoveredAt: site.discoveredAt.toISOString(),
          currentRoom: currentRoomNumber,
          totalRooms: site.totalRooms ?? roomNumbers.length,
          roomMobCounts,
          currentRoomMobs,
        });
      }

      // Collect all mob template IDs (next mob + current room mobs) for name/HP lookup
      const allMobTemplateIds = new Set<string>();
      for (const site of activeSites) {
        if (site.nextMobTemplateId) allMobTemplateIds.add(site.nextMobTemplateId);
        for (const mob of site.currentRoomMobs) allMobTemplateIds.add(mob.mobTemplateId);
      }
      const mobTemplateRows = allMobTemplateIds.size > 0
        ? await prisma.mobTemplate.findMany({
            where: { id: { in: [...allMobTemplateIds] } },
            select: { id: true, name: true, hp: true },
          })
        : [];
      const mobTemplateById = new Map(mobTemplateRows.map((row) => [row.id, row]));
      const nextMobNameById = new Map(mobTemplateRows.map((row) => [row.id, row.name]));

      activeSites.sort((a, b) => {
        if (query.sort === 'danger') {
          if (b.aliveMobs !== a.aliveMobs) return b.aliveMobs - a.aliveMobs;
        }
        return new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
      });

      const total = activeSites.length;
      const offset = (query.page - 1) * query.pageSize;
      const pageItems = activeSites.slice(offset, offset + query.pageSize);
      const zones = Array.from(new Map(activeSites.map((site) => [site.zoneId, site.zoneName])).entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const mobFamilies = Array.from(new Map(activeSites.map((site) => [site.mobFamilyId, site.mobFamilyName])).entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const badgeCache = new Map<string, EventModifierBadge[]>();
      for (const site of pageItems) {
        const key = `${site.zoneId}:${site.mobFamilyId}`;
        if (!badgeCache.has(key)) {
          badgeCache.set(key, await getEventModifiersForEntity(site.zoneId, { mobFamilyId: site.mobFamilyId }));
        }
      }

      res.json({
        encounterSites: pageItems.map((site) => {
          const nextMobName = site.nextMobTemplateId ? nextMobNameById.get(site.nextMobTemplateId) ?? null : null;
          const prefixDefinition = getMobPrefixDefinition(site.nextMobPrefix);
          const nextMobDisplayName = nextMobName
            ? (prefixDefinition ? `${prefixDefinition.displayName} ${nextMobName}` : nextMobName)
            : null;

          return {
            encounterSiteId: site.encounterSiteId,
            zoneId: site.zoneId,
            zoneName: site.zoneName,
            mobFamilyId: site.mobFamilyId,
            mobFamilyName: site.mobFamilyName,
            siteName: site.siteName,
            size: site.size,
            totalMobs: site.totalMobs,
            aliveMobs: site.aliveMobs,
            defeatedMobs: site.defeatedMobs,
            decayedMobs: site.decayedMobs,
            nextMobTemplateId: site.nextMobTemplateId,
            nextMobName,
            nextMobPrefix: site.nextMobPrefix,
            nextMobDisplayName,
            discoveredAt: site.discoveredAt,
            totalRooms: site.totalRooms,
            currentRoom: site.currentRoom,
            roomMobCounts: site.roomMobCounts,
            currentRoomMobs: site.currentRoomMobs.map(m => {
              const template = mobTemplateById.get(m.mobTemplateId);
              return {
                slot: m.slot,
                name: template?.name ?? 'Unknown',
                prefix: m.prefix,
                hp: template?.hp ?? 0,
                maxHp: template?.hp ?? 0,
              };
            }),
            eventModifiers: badgeCache.get(`${site.zoneId}:${site.mobFamilyId}`) ?? [],
            totalTurnCost: site.aliveMobs * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST,
          };
        }),
        pagination: buildPagination(query.page, query.pageSize, total),
        filters: {
          zones,
          mobFamilies,
        },
      });
  }));

  router.use(requireActiveSeason);

  /**
   * POST /api/v1/combat/sites/abandon
   * Abandon encounter sites (optionally by zone).
   */
  router.post('/sites/abandon', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      const body = abandonSchema.parse(req.body ?? {});

      const result = await prisma.encounterSite.deleteMany({
        where: {
          playerId,
          ...(body.zoneId ? { zoneId: body.zoneId } : {}),
        },
      });

      res.json({ success: true, abandoned: result.count ?? 0 });
  }));

  /**
   * POST /api/v1/combat/sites/:id/abandon
   * Abandon a single encounter site.
   */
  router.post('/sites/:id/abandon', asyncHandler(async (req, res) => {
      const siteId = z.string().uuid().parse(req.params.id);
      const playerId = req.player!.playerId;

      // Clear any in-memory manual combat session
      await clearManualCombatSession(playerId, siteId);

      const result = await prisma.encounterSite.deleteMany({
        where: { id: siteId, playerId },
      });

      // Clear lockout if this was the active site
      await prisma.player.update({
        where: { id: playerId },
        data: { activeEncounterSiteId: null },
      });

      res.json({ success: true, abandoned: result.count ?? 0 });
  }));

  /**
   * POST /api/v1/combat/sites/:id/auto-resolve
   * Auto-resolve the current room of an encounter site using the raid resolver.
   */
  router.post('/sites/:id/auto-resolve', asyncHandler(async (req, res) => {
      const siteId = z.string().uuid().parse(req.params.id);
      const playerId = req.player!.playerId;
      const username = req.player!.username;

      // Set lockout
      await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: siteId } });

      try {
        const result = await autoResolveEncounterRoom(playerId, siteId, username);
        const stateUpdates = await buildStateUpdates(playerId, ['hp', 'resources', 'buffs', 'skills', 'characterProgression']);
        stateUpdates.activeEncounterSiteId = null;

        // Merge chest reward + durability-damaged items into stateUpdates so frontend stays in sync
        const rewardNewIds = result.completionRewards?.newItemIds ?? [];
        const rewardUpdatedIds = [...(result.completionRewards?.updatedItemIds ?? []), ...result.durabilityDamagedItemIds];
        if (rewardNewIds.length > 0 || rewardUpdatedIds.length > 0) {
          await mergeLootIntoStateUpdates(playerId, rewardNewIds, rewardUpdatedIds, stateUpdates);
        }

        // On defeat the player is respawned to a town — sync the zone in the UI
        if (result.respawnedTo) {
          const player = await prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } });
          if (player?.currentZoneId) stateUpdates.currentZoneId = player.currentZoneId;
        }

        res.json({
          outcome: result.outcome,
          rounds: result.rounds,
          initialMobs: result.initialMobs,
          chestReward: await mapChestRewardDTO(result.completionRewards),
          ...(result.pendingLootSessionId ? { pendingLootSessionId: result.pendingLootSessionId } : {}),
          ...(result.xpGrants.length ? { skillXpGrants: result.xpGrants.map(serializeXpGrant) } : {}),
          ...(result.questProgress.length ? { questProgress: result.questProgress } : {}),
          fleeResult: result.fleeResult,
          respawnedTo: result.respawnedTo,
          stateUpdates,
        });
      } finally {
        // Clear lockout when combat resolves (or throws)
        await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: null } });
      }
  }));

  /**
   * POST /api/v1/combat/sites/:id/start-room
   * Initialize manual combat for the current room of an encounter site.
   */
  router.post('/sites/:id/start-room', asyncHandler(async (req, res) => {
      const siteId = z.string().uuid().parse(req.params.id);
      const playerId = req.player!.playerId;
      const username = req.player!.username;

      // Set lockout
      await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: siteId } });

      const result = await startManualEncounterRoom(playerId, siteId, username);

      // Site was auto-cleared (all remaining rooms decayed) — clear lockout and return
      if (result.siteAutoCleared) {
        await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: null } });
        const stateUpdates: Record<string, unknown> = { activeEncounterSiteId: null };
        if (result.completionRewards) {
          await mergeLootIntoStateUpdates(playerId, result.completionRewards.newItemIds, result.completionRewards.updatedItemIds, stateUpdates);
        }
        res.json({
          siteAutoCleared: true,
          chestReward: await mapChestRewardDTO(result.completionRewards ?? null),
          ...(result.pendingLootSessionId ? { pendingLootSessionId: result.pendingLootSessionId } : {}),
          stateUpdates,
        });
        return;
      }

      // Transform to frontend DTO
      res.json({
        currentRoom: result.currentRoom,
        totalRooms: result.totalRooms,
        mobs: result.mobs,
        playerState: {
          hp: result.playerHp,
          maxHp: result.playerMaxHp,
          stamina: result.playerStamina,
          maxStamina: result.playerMaxStamina,
          mana: result.playerMana,
          maxMana: result.playerMaxMana,
          activeEffects: [],
        },
        roundNumber: result.roundNumber,
        roundLogs: result.roundLogs,
      });
  }));

  /**
   * POST /api/v1/combat/sites/:id/round
   * Resolve one round of manual encounter site combat.
   */
  router.post('/sites/:id/round', asyncHandler(async (req, res) => {
      const siteId = z.string().uuid().parse(req.params.id);
      const body = roundSchema.parse(req.body ?? {});
      const playerId = req.player!.playerId;
      const result = await resolveManualEncounterRound(playerId, siteId, body);

      const combatEnded = result.outcome !== 'ongoing';

      // Clear lockout when combat ends
      if (combatEnded) {
        await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: null } });
      }

      // Transform mobs to mobStates with slot info
      const mobStates = result.mobs.map(m => ({
        slot: parseEncounterMobSlot(m.mobId) ?? 0,
        hp: m.hpRemaining,
        maxHp: m.maxHp,
        alive: m.alive,
        activeEffects: m.activeEffects ?? [],
      }));

      // Include stateUpdates when combat ends so global HP/resource bars refresh
      const stateUpdates = combatEnded
        ? await buildStateUpdates(playerId, ['hp', 'resources', 'buffs', 'skills', 'characterProgression'])
        : undefined;
      if (stateUpdates) stateUpdates.activeEncounterSiteId = null;

      // Merge chest reward + durability-damaged items into stateUpdates so frontend stays in sync
      if (stateUpdates) {
        const rewardNewIds = result.completionRewards?.newItemIds ?? [];
        const rewardUpdatedIds = [...(result.completionRewards?.updatedItemIds ?? []), ...result.durabilityDamagedItemIds];
        if (rewardNewIds.length > 0 || rewardUpdatedIds.length > 0) {
          await mergeLootIntoStateUpdates(playerId, rewardNewIds, rewardUpdatedIds, stateUpdates);
        }
      }

      // On defeat the player is respawned to a town — sync the zone in the UI
      if (stateUpdates && result.respawnedTo) {
        const player = await prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } });
        if (player?.currentZoneId) stateUpdates.currentZoneId = player.currentZoneId;
      }

      res.json({
        roundNumber: result.roundNumber,
        roundLog: result.roundLog,
        mobStates,
        playerState: {
          hp: result.playerHpAfter,
          maxHp: result.playerMaxHp,
          stamina: result.playerStaminaAfter,
          maxStamina: result.playerMaxStamina,
          mana: result.playerManaAfter,
          maxMana: result.playerMaxMana,
          activeEffects: [],
        },
        outcome: result.outcome === 'site_cleared' ? 'cleared' : result.outcome,
        defeated: result.outcome === 'defeated',
        roomCleared: result.outcome === 'cleared' || result.outcome === 'site_cleared',
        siteCleared: result.siteCleared,
        chestReward: await mapChestRewardDTO(result.completionRewards),
        ...(result.pendingLootSessionId ? { pendingLootSessionId: result.pendingLootSessionId } : {}),
        ...(combatEnded && result.xpGrants?.length ? { skillXpGrants: result.xpGrants.map(serializeXpGrant) } : {}),
        ...(combatEnded && result.questProgress?.length ? { questProgress: result.questProgress } : {}),
        fleeResult: result.fleeResult,
        respawnedTo: result.respawnedTo,
        ...(stateUpdates ? { stateUpdates } : {}),
      });
  }));
}
