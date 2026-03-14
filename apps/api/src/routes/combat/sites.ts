import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { getMobPrefixDefinition, COMBAT_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { buildPagination } from '../../utils/routeHelpers.js';
import { getEventModifiersForEntity, type EventModifierBadge } from '../../services/worldEventService';
import {
  listEncounterSitesQuerySchema,
  applyEncounterSiteDecayAndPersist,
} from './helpers';

const abandonSchema = z.object({
  zoneId: z.string().uuid().optional(),
});

const strategySchema = z.object({
  strategy: z.enum(['full_clear', 'room_by_room']),
});

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
        clearStrategy: string | null;
        currentRoom: number;
        totalRooms: number;
        roomMobCounts: Array<{ room: number; alive: number; total: number }>;
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
          clearStrategy: site.clearStrategy ?? null,
          currentRoom: site.currentRoom ?? 1,
          totalRooms: roomNumbers.length,
          roomMobCounts,
        });
      }

      const nextMobTemplateIds = Array.from(
        new Set(activeSites.map((site) => site.nextMobTemplateId).filter((id): id is string => Boolean(id)))
      );
      const nextMobRows = nextMobTemplateIds.length > 0
        ? await prisma.mobTemplate.findMany({
            where: { id: { in: nextMobTemplateIds } },
            select: { id: true, name: true },
          })
        : [];
      const nextMobNameById = new Map(nextMobRows.map((row) => [row.id, row.name]));

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
            clearStrategy: site.clearStrategy,
            currentRoom: site.currentRoom,
            totalRooms: site.totalRooms,
            roomMobCounts: site.roomMobCounts,
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
   * POST /api/v1/combat/sites/:id/strategy
   * Select clearing strategy for an encounter site.
   */
  router.post('/sites/:id/strategy', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      const siteId = z.string().uuid().parse(req.params.id);
      const body = strategySchema.parse(req.body);

      const site = await prisma.encounterSite.findFirst({
        where: { id: siteId, playerId },
      });

      if (!site) {
        throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');
      }

      if (site.clearStrategy) {
        throw new AppError(400, 'Strategy already selected for this site', 'STRATEGY_ALREADY_SET');
      }

      await prisma.encounterSite.update({
        where: { id: siteId },
        data: {
          clearStrategy: body.strategy,
          fullClearActive: body.strategy === 'full_clear',
        },
      });

      res.json({
        success: true,
        encounterSiteId: siteId,
        strategy: body.strategy,
      });
  }));
}
