import { Router } from 'express';
import { prisma } from '@adventure/database';
import type { CraftingMaterial } from '@adventure/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import { prismaAny, parseMaterials, buildRecipeDiscoveryHint } from './helpers';

export const recipesRouter = Router();

/**
 * GET /api/v1/crafting/recipes
 * List recipes visible to the player (based on skill level).
 */
recipesRouter.get('/', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;

    const [skills, learnedAdvancedRecipes] = await Promise.all([
      prisma.playerSkill.findMany({
        where: { playerId },
        select: { skillType: true, level: true },
      }),
      prismaAny.playerRecipe.findMany({
        where: { playerId },
        select: { recipeId: true },
      }) as Promise<Array<{ recipeId: string }>>,
    ]);

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    const currentZone = player?.currentZoneId
      ? await prisma.zone.findUnique({
          where: { id: player.currentZoneId },
          select: { name: true, maxCraftingLevel: true },
        })
      : null;

    const skillLevels = new Map<string, number>(skills.map((s: typeof skills[number]) => [s.skillType, s.level]));
    const learnedRecipeIds = new Set(learnedAdvancedRecipes.map((entry) => entry.recipeId));

    const recipes = await prismaAny.craftingRecipe.findMany({
      include: {
        resultTemplate: true,
        mobFamily: {
          select: {
            name: true,
            siteNounLarge: true,
          },
        },
      },
      orderBy: [{ requiredLevel: 'asc' }],
    }) as Array<{
      id: string;
      skillType: string;
      requiredLevel: number;
      resultTemplate: any;
      mobFamily?: {
        name: string;
        siteNounLarge: string;
      } | null;
      isAdvanced?: boolean;
      soulbound?: boolean;
      mobFamilyId?: string | null;
      turnCost: number;
      materials: unknown;
      xpReward: number;
    }>;

    const visible = recipes
      .map((r: typeof recipes[number]) => {
        const isAdvanced = Boolean(r.isAdvanced);
        const isDiscovered = !isAdvanced || learnedRecipeIds.has(r.id);

        return {
          id: r.id,
          skillType: r.skillType,
          requiredLevel: r.requiredLevel,
          resultTemplate: r.resultTemplate,
          isAdvanced,
          isDiscovered,
          discoveryHint: isDiscovered ? null : buildRecipeDiscoveryHint(r.mobFamily),
          soulbound: Boolean(r.soulbound),
          mobFamilyId: r.mobFamilyId ?? null,
          turnCost: r.turnCost,
          materials: parseMaterials(r.materials),
          materialTemplates: [] as Array<{ id: string; name: string; itemType: string; stackable: boolean }>,
          xpReward: r.xpReward,
        };
      });

    // Attach material template metadata for UI convenience
    const allMaterialIds = new Set<string>();
    for (const r of visible) {
      for (const m of r.materials) allMaterialIds.add(m.templateId);
    }

    const templates = await prisma.itemTemplate.findMany({
      where: { id: { in: Array.from(allMaterialIds) } },
      select: { id: true, name: true, itemType: true, stackable: true },
    });
    const byId = new Map(templates.map((t: typeof templates[number]) => [t.id, t]));

    for (const r of visible) {
      r.materialTemplates = r.materials
        .map((m: CraftingMaterial) => byId.get(m.templateId))
        .filter(Boolean) as Array<{ id: string; name: string; itemType: string; stackable: boolean }>;
    }

    res.json({
      recipes: visible,
      zoneCraftingLevel: currentZone ? currentZone.maxCraftingLevel : 0,
      zoneName: currentZone?.name ?? null,
    });
}));
