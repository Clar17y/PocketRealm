import { Router } from 'express';
import { prisma } from '@adventure/database';
import { getAllMobPrefixes } from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { prismaAny } from '../utils/prismaAny.js';
import { calculateExplorationPercent } from '../services/zoneExplorationService';
import { asyncHandler } from '../utils/asyncHandler';

export const bestiaryRouter = Router();

bestiaryRouter.use(authenticate);

function rarityFromTier(tier: number): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' {
  if (tier >= 5) return 'legendary';
  if (tier === 4) return 'epic';
  if (tier === 3) return 'rare';
  if (tier === 2) return 'uncommon';
  return 'common';
}

/**
 * GET /api/v1/bestiary
 * List all mob templates, with the player's kill counts (discovery).
 */
bestiaryRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const [mobTemplates, progress, prefixProgress, explorations] = await Promise.all([
    prisma.mobTemplate.findMany({
      include: {
        zone: { select: { id: true, name: true, difficulty: true, turnsToExplore: true, explorationTiers: true } },
        dropTables: {
          include: {
            itemTemplate: { select: { id: true, name: true, itemType: true, tier: true } },
          },
        },
      },
      orderBy: [{ zoneId: 'asc' }, { name: 'asc' }],
    }),
    prisma.playerBestiary.findMany({
      where: { playerId },
      select: { mobTemplateId: true, kills: true },
    }),
    prismaAny.playerBestiaryPrefix.findMany({
      where: { playerId },
      select: { mobTemplateId: true, prefix: true, kills: true },
    }),
    prismaAny.playerZoneExploration.findMany({
      where: { playerId },
      select: { zoneId: true, turnsExplored: true },
    }),
  ]);
  const explorationByZoneId = new Map<string, number>(
    (explorations as Array<{ zoneId: string; turnsExplored: number }>).map(
      (e: { zoneId: string; turnsExplored: number }) => [e.zoneId, e.turnsExplored],
    ),
  );

  const killsByMobId = new Map<string, number>();
  for (const p of progress) killsByMobId.set(p.mobTemplateId, p.kills);
  const prefixKeysByMobId = new Map<string, string[]>();
  const prefixTotals = new Map<string, number>();
  for (const prefixEntry of prefixProgress as Array<{ mobTemplateId: string; prefix: string; kills: number }>) {
    const keys = prefixKeysByMobId.get(prefixEntry.mobTemplateId) ?? [];
    if (!keys.includes(prefixEntry.prefix)) keys.push(prefixEntry.prefix);
    prefixKeysByMobId.set(prefixEntry.mobTemplateId, keys);
    prefixTotals.set(prefixEntry.prefix, (prefixTotals.get(prefixEntry.prefix) ?? 0) + prefixEntry.kills);
  }

  const allPrefixes = getAllMobPrefixes();
  res.json({
    mobs: mobTemplates.map((mob: typeof mobTemplates[number]) => {
      const kills = killsByMobId.get(mob.id) ?? 0;
      const mobStats = mob as unknown as { accuracy?: number; attack?: number };
      const mobAccuracy = typeof mobStats.accuracy === 'number'
        ? mobStats.accuracy
        : Math.floor(mobStats.attack ?? 0);

      // Exploration tier-lock calculation
      const zoneExpl = mob.zone as unknown as { turnsToExplore: number | null; explorationTiers: Record<string, number> | null };
      const turnsToExplore = zoneExpl.turnsToExplore ?? null;
      const turnsExplored = explorationByZoneId.get(mob.zoneId) ?? 0;
      const zonePercent = calculateExplorationPercent(turnsExplored, turnsToExplore);
      const zoneTiers = zoneExpl.explorationTiers;
      const mobTier = (mob as unknown as { explorationTier: number | null }).explorationTier ?? 1;
      const tierThreshold = zoneTiers ? (zoneTiers[String(mobTier)] ?? 0) : 0;
      const tierLocked = zonePercent < tierThreshold;

      const isHidden = tierLocked && kills === 0;

      return {
        id: mob.id,
        name: isHidden ? '???' : mob.name,
        level: Math.max(1, mob.zone.difficulty * 5),
        isDiscovered: kills > 0,
        killCount: kills,
        explorationTier: mobTier,
        tierLocked,
        stats: isHidden ? null : {
          hp: mob.hp,
          accuracy: mobAccuracy,
          defence: mob.defence,
        },
        zones: [mob.zone.name],
        description: isHidden ? null : `A creature found in ${mob.zone.name}.`,
        drops: isHidden ? [] : mob.dropTables.map((dt: typeof mob.dropTables[number]) => ({
          item: dt.itemTemplate,
          rarity: rarityFromTier(dt.itemTemplate.tier),
          dropRate: Math.round(Number(dt.dropChance) * 10000) / 100,
          minQuantity: dt.minQuantity,
          maxQuantity: dt.maxQuantity,
        })),
        prefixesEncountered: isHidden ? [] : (prefixKeysByMobId.get(mob.id) ?? []),
      };
    }),
    prefixSummary: allPrefixes.map(p => ({
      prefix: p.key,
      displayName: p.displayName,
      totalKills: prefixTotals.get(p.key) ?? 0,
      discovered: (prefixTotals.get(p.key) ?? 0) > 0,
    })),
  });
}));
