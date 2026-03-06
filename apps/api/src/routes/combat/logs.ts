import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@pocketrealm/database';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { enrichLootWithNames } from '../../services/lootService';
import { mapTemplateCombatLog } from '../../services/combatLogMapper';
import { lootDropWithNameSchema } from './helpers';
import { paginationSchema, buildPagination } from '../../utils/routeHelpers.js';

const logParamsSchema = z.object({
  id: z.string().uuid(),
});

const listLogsQuerySchema = z.object({
  ...paginationSchema,
  outcome: z.enum(['victory', 'defeat', 'fled']).optional(),
  zoneId: z.string().uuid().optional(),
  mobTemplateId: z.string().uuid().optional(),
  sort: z.enum(['recent', 'xp']).default('recent'),
  search: z.string().trim().min(1).max(64).optional(),
});

interface CombatHistoryCountRow {
  total: bigint;
}

interface CombatHistoryListRow {
  id: string;
  createdAt: Date;
  zoneId: string | null;
  zoneName: string | null;
  mobTemplateId: string | null;
  mobName: string | null;
  mobDisplayName: string | null;
  outcome: string | null;
  source: string | null;
  xpGained: number;
  roundCount: number;
  fightCount: number;
  encounterSiteId: string | null;
  mobFamilyName: string | null;
}

interface CombatHistoryFilterRow {
  id: string | null;
  name: string | null;
}

export function registerLogRoutes(router: Router): void {
  /**
   * GET /api/v1/combat/logs
   * Fetch paginated combat history with filters.
   */
  router.get('/logs', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      const query = listLogsQuerySchema.parse({
        page: req.query.page,
        pageSize: req.query.pageSize,
        outcome: req.query.outcome,
        zoneId: req.query.zoneId,
        mobTemplateId: req.query.mobTemplateId,
        sort: req.query.sort,
        search: req.query.search,
      });

      const whereParts: Prisma.Sql[] = [
        Prisma.sql`"player_id" = ${playerId}`,
        Prisma.sql`"activity_type" = 'combat'`,
        Prisma.sql`COALESCE(("result"->>'source'), '') <> 'encounter_site_fight'`,
      ];

      if (query.outcome) {
        whereParts.push(Prisma.sql`("result"->>'outcome') = ${query.outcome}`);
      }
      if (query.zoneId) {
        whereParts.push(Prisma.sql`("result"->>'zoneId') = ${query.zoneId}`);
      }
      if (query.mobTemplateId) {
        whereParts.push(Prisma.sql`("result"->>'mobTemplateId') = ${query.mobTemplateId}`);
      }
      if (query.search) {
        const pattern = `%${query.search}%`;
        whereParts.push(
          Prisma.sql`(
            ("result"->>'zoneName') ILIKE ${pattern}
            OR ("result"->>'mobName') ILIKE ${pattern}
            OR ("result"->>'mobDisplayName') ILIKE ${pattern}
          )`
        );
      }

      const whereClause = Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`;
      const offset = (query.page - 1) * query.pageSize;
      const listRowsQuery = query.sort === 'xp'
        ? Prisma.sql`
            SELECT
              "id",
              "created_at" AS "createdAt",
              ("result"->>'zoneId') AS "zoneId",
              ("result"->>'zoneName') AS "zoneName",
              ("result"->>'mobTemplateId') AS "mobTemplateId",
              ("result"->>'mobName') AS "mobName",
              COALESCE(("result"->>'mobDisplayName'), ("result"->>'mobName')) AS "mobDisplayName",
              ("result"->>'outcome') AS "outcome",
              COALESCE(
                NULLIF(("result"->>'source'), ''),
                CASE
                  WHEN COALESCE(("result"->>'encounterSiteId'), '') <> '' THEN 'encounter_site'
                  ELSE 'zone_combat'
                END
              ) AS "source",
              COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) AS "xpGained",
              COALESCE((
                SELECT MAX(
                  CASE
                    WHEN jsonb_typeof(log_entry->'round') = 'number'
                      THEN (log_entry->>'round')::int
                    ELSE 0
                  END
                )
                FROM jsonb_array_elements(COALESCE("result"->'log', '[]'::jsonb)) AS log_entry
              ), 0) AS "roundCount",
              COALESCE(("result"->>'fightCount')::int, 1) AS "fightCount",
              ("result"->>'encounterSiteId') AS "encounterSiteId",
              ("result"->>'mobFamilyName') AS "mobFamilyName"
            FROM "activity_logs"
            ${whereClause}
            ORDER BY COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) DESC, "created_at" DESC
            LIMIT ${query.pageSize}
            OFFSET ${offset}
          `
        : Prisma.sql`
            SELECT
              "id",
              "created_at" AS "createdAt",
              ("result"->>'zoneId') AS "zoneId",
              ("result"->>'zoneName') AS "zoneName",
              ("result"->>'mobTemplateId') AS "mobTemplateId",
              ("result"->>'mobName') AS "mobName",
              COALESCE(("result"->>'mobDisplayName'), ("result"->>'mobName')) AS "mobDisplayName",
              ("result"->>'outcome') AS "outcome",
              COALESCE(
                NULLIF(("result"->>'source'), ''),
                CASE
                  WHEN COALESCE(("result"->>'encounterSiteId'), '') <> '' THEN 'encounter_site'
                  ELSE 'zone_combat'
                END
              ) AS "source",
              COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) AS "xpGained",
              COALESCE((
                SELECT MAX(
                  CASE
                    WHEN jsonb_typeof(log_entry->'round') = 'number'
                      THEN (log_entry->>'round')::int
                    ELSE 0
                  END
                )
                FROM jsonb_array_elements(COALESCE("result"->'log', '[]'::jsonb)) AS log_entry
              ), 0) AS "roundCount",
              COALESCE(("result"->>'fightCount')::int, 1) AS "fightCount",
              ("result"->>'encounterSiteId') AS "encounterSiteId",
              ("result"->>'mobFamilyName') AS "mobFamilyName"
            FROM "activity_logs"
            ${whereClause}
            ORDER BY "created_at" DESC
            LIMIT ${query.pageSize}
            OFFSET ${offset}
          `;

      const [countRows, listRows, zoneRows, mobRows] = await Promise.all([
        prisma.$queryRaw<CombatHistoryCountRow[]>(
          Prisma.sql`
            SELECT COUNT(*)::bigint AS "total"
            FROM "activity_logs"
            ${whereClause}
          `
        ),
        prisma.$queryRaw<CombatHistoryListRow[]>(listRowsQuery),
        prisma.$queryRaw<CombatHistoryFilterRow[]>(
          Prisma.sql`
            SELECT DISTINCT
              ("result"->>'zoneId') AS "id",
              ("result"->>'zoneName') AS "name"
            FROM "activity_logs"
            WHERE "player_id" = ${playerId}
              AND "activity_type" = 'combat'
              AND ("result"->>'zoneId') IS NOT NULL
              AND ("result"->>'zoneName') IS NOT NULL
              AND COALESCE(("result"->>'source'), '') <> 'encounter_site_fight'
            ORDER BY "name" ASC
          `
        ),
        prisma.$queryRaw<CombatHistoryFilterRow[]>(
          Prisma.sql`
            SELECT DISTINCT
              ("result"->>'mobTemplateId') AS "id",
              ("result"->>'mobName') AS "name"
            FROM "activity_logs"
            WHERE "player_id" = ${playerId}
              AND "activity_type" = 'combat'
              AND ("result"->>'mobTemplateId') IS NOT NULL
              AND ("result"->>'mobName') IS NOT NULL
              AND COALESCE(("result"->>'source'), '') <> 'encounter_site_fight'
            ORDER BY "name" ASC
          `
        ),
      ]);

      const total = Number(countRows[0]?.total ?? 0n);

      res.json({
        logs: listRows.map((row) => ({
          logId: row.id,
          createdAt: row.createdAt.toISOString(),
          zoneId: row.zoneId,
          zoneName: row.zoneName,
          mobTemplateId: row.mobTemplateId,
          mobName: row.mobName,
          mobDisplayName: row.mobDisplayName ?? row.mobName,
          outcome: row.outcome,
          source: row.source,
          roundCount: row.roundCount,
          xpGained: row.xpGained,
          fightCount: row.fightCount,
          encounterSiteId: row.encounterSiteId ?? null,
          mobFamilyName: row.mobFamilyName ?? null,
        })),
        pagination: buildPagination(query.page, query.pageSize, total),
        filters: {
          zones: zoneRows.filter((row) => row.id && row.name).map((row) => ({ id: row.id!, name: row.name! })),
          mobs: mobRows.filter((row) => row.id && row.name).map((row) => ({ id: row.id!, name: row.name! })),
        },
      });
  }));

  /**
   * GET /api/v1/combat/logs/:id/fights
   * Returns per-fight log summaries for an encounter site summary log.
   */
  router.get('/logs/:id/fights', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const params = logParamsSchema.parse(req.params);

    const summaryLog = await prisma.activityLog.findFirst({
      where: { id: params.id, playerId, activityType: 'combat' },
      select: { id: true, result: true },
    });

    if (!summaryLog) {
      throw new AppError(404, 'Combat log not found', 'NOT_FOUND');
    }

    const result = summaryLog.result as Record<string, unknown>;
    if (result.source !== 'encounter_site') {
      throw new AppError(400, 'Not an encounter site summary log', 'INVALID_SOURCE');
    }

    const fights = await prisma.$queryRaw<Array<{
      id: string;
      createdAt: Date;
      mobTemplateId: string | null;
      mobName: string | null;
      mobDisplayName: string | null;
      mobPrefix: string | null;
      outcome: string | null;
      room: number | null;
      xpGained: number;
    }>>(Prisma.sql`
      SELECT
        "id",
        "created_at" AS "createdAt",
        ("result"->>'mobTemplateId') AS "mobTemplateId",
        ("result"->>'mobName') AS "mobName",
        COALESCE(("result"->>'mobDisplayName'), ("result"->>'mobName')) AS "mobDisplayName",
        ("result"->>'mobPrefix') AS "mobPrefix",
        ("result"->>'outcome') AS "outcome",
        ("result"->>'room')::int AS "room",
        COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) AS "xpGained"
      FROM "activity_logs"
      WHERE "player_id" = ${playerId}
        AND "activity_type" = 'combat'
        AND ("result"->>'source') = 'encounter_site_fight'
        AND ("result"->>'summaryLogId') = ${params.id}
      ORDER BY "created_at" ASC
    `);

    res.json({
      summaryLogId: params.id,
      fights: fights.map((f) => ({
        logId: f.id,
        createdAt: f.createdAt.toISOString(),
        mobTemplateId: f.mobTemplateId,
        mobName: f.mobName,
        mobDisplayName: f.mobDisplayName ?? f.mobName,
        mobPrefix: f.mobPrefix,
        outcome: f.outcome,
        room: f.room,
        xpGained: f.xpGained,
      })),
    });
  }));

  /**
   * GET /api/v1/combat/logs/:id
   * Fetch combat playback data for a previous encounter.
   */
  router.get('/logs/:id', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      const params = logParamsSchema.parse(req.params);

      const log = await prisma.activityLog.findFirst({
        where: {
          id: params.id,
          playerId,
          activityType: 'combat',
        },
        select: {
          id: true,
          result: true,
          createdAt: true,
        },
      });

      if (!log) {
        throw new AppError(404, 'Combat log not found', 'NOT_FOUND');
      }

      let combat = log.result;
      if (combat && typeof combat === 'object' && !Array.isArray(combat)) {
        const combatRecord = combat as Record<string, unknown>;
        const rewards = combatRecord.rewards;

        if (rewards && typeof rewards === 'object' && !Array.isArray(rewards)) {
          const rewardsRecord = rewards as Record<string, unknown>;
          const lootUnknown = rewardsRecord.loot;
          const siteCompletionUnknown = rewardsRecord.siteCompletion;
          let nextRewards = rewardsRecord;
          if (Array.isArray(lootUnknown)) {
            const parsedLoot = lootUnknown
              .map((entry) => lootDropWithNameSchema.safeParse(entry))
              .filter((entry): entry is { success: true; data: z.infer<typeof lootDropWithNameSchema> } => entry.success)
              .map((entry) => entry.data);

            const lootWithNames = await enrichLootWithNames(parsedLoot);
            nextRewards = {
              ...nextRewards,
              loot: lootWithNames,
            };
          }

          if (siteCompletionUnknown && typeof siteCompletionUnknown === 'object' && !Array.isArray(siteCompletionUnknown)) {
            const siteCompletionRecord = siteCompletionUnknown as Record<string, unknown>;
            const chestLootUnknown = siteCompletionRecord.loot;
            if (Array.isArray(chestLootUnknown)) {
              const parsedChestLoot = chestLootUnknown
                .map((entry) => lootDropWithNameSchema.safeParse(entry))
                .filter((entry): entry is { success: true; data: z.infer<typeof lootDropWithNameSchema> } => entry.success)
                .map((entry) => entry.data);

              const chestLootWithNames = await enrichLootWithNames(parsedChestLoot);
              nextRewards = {
                ...nextRewards,
                siteCompletion: {
                  ...siteCompletionRecord,
                  loot: chestLootWithNames,
                },
              };
            }
          }

          combat = {
            ...combatRecord,
            rewards: nextRewards,
          } as unknown as Prisma.JsonValue;
        }

        // Map template combat log fields to frontend response shape
        if (Array.isArray(combatRecord.log)) {
          combat = {
            ...(combat as Record<string, unknown>),
            log: mapTemplateCombatLog(combatRecord.log),
          } as unknown as Prisma.JsonValue;
        }
      }

      res.json({
        logId: log.id,
        createdAt: log.createdAt.toISOString(),
        combat,
      });
  }));
}
