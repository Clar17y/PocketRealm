import { prisma } from '@pocketrealm/database';
import { prismaAny } from '../utils/prismaAny.js';
import { WORLD_EVENT_CONSTANTS, type BossPlayerReward, type SkillType } from '@pocketrealm/shared';
import { calculateContributionScore } from '@pocketrealm/game-engine';
import { randomIntInclusive } from '../utils/random';
import { rollAndGrantLoot, enrichLootWithNames } from './lootService';
import { addStackableItem } from './inventoryService';
import { grantSkillXp } from './xpService';
import { checkAchievements, emitAchievementNotifications } from './achievementService';

export interface BossContributor {
  playerId: string;
  totalDamage: number;
  totalHealing: number;
  damageAbsorbed: number;
  roundsSurvived: number;
  attackSkill?: string;
}

async function rollBossRecipeDrop(
  playerId: string,
  mobFamilyId: string,
): Promise<BossPlayerReward['recipeUnlocked'] | undefined> {

  const advancedRecipes = (await prismaAny.craftingRecipe.findMany({
    where: { isAdvanced: true, mobFamilyId },
    select: {
      id: true,
      resultTemplateId: true,
      soulbound: true,
      resultTemplate: { select: { name: true } },
    },
    orderBy: [{ requiredLevel: 'asc' }, { id: 'asc' }],
  })) as Array<{
    id: string;
    resultTemplateId: string;
    soulbound: boolean;
    resultTemplate: { name: string };
  }>;

  if (advancedRecipes.length === 0) return undefined;

  const known = (await prismaAny.playerRecipe.findMany({
    where: {
      playerId,
      recipeId: { in: advancedRecipes.map((r) => r.id) },
    },
    select: { recipeId: true },
  })) as Array<{ recipeId: string }>;

  const knownIds = new Set(known.map((k) => k.recipeId));
  const unknown = advancedRecipes.filter((r) => !knownIds.has(r.id));
  if (unknown.length === 0) return undefined;

  const picked = unknown[randomIntInclusive(0, unknown.length - 1)]!;
  await prismaAny.playerRecipe.create({
    data: { playerId, recipeId: picked.id },
  });

  return {
    recipeId: picked.id,
    recipeName: picked.resultTemplate.name,
    soulbound: Boolean(picked.soulbound),
  };
}

export async function distributeBossLoot(
  mobTemplateId: string,
  mobLevel: number,
  contributors: BossContributor[],
  zoneTier: number,
): Promise<Record<string, BossPlayerReward>> {
  const result: Record<string, BossPlayerReward> = {};
  if (contributors.length === 0) return result;

  const tierIndex = Math.max(0, Math.min(4, zoneTier - 1));
  const baseXp = WORLD_EVENT_CONSTANTS.BOSS_BASE_XP_REWARD_BY_TIER[tierIndex]!;
  const rarityBonus = WORLD_EVENT_CONSTANTS.BOSS_RARITY_BONUS;

  const scores = contributors.map(c => ({
    playerId: c.playerId,
    score: calculateContributionScore({
      totalDamage: c.totalDamage,
      totalHealing: c.totalHealing,
      damageAbsorbed: c.damageAbsorbed,
      roundsSurvived: c.roundsSurvived,
    }),
  }));
  const totalContribution = scores.reduce((sum, s) => sum + s.score, 0);

  // Look up mob name + family for recipe drops and trophy grants
  const mob = await prisma.mobTemplate.findUnique({
    where: { id: mobTemplateId },
    select: { name: true, familyMembers: { select: { mobFamily: { select: { id: true } } } } },
  });
  const mobFamilyId = mob?.familyMembers?.[0]?.mobFamily?.id ?? null;
  const mobName = mob?.name ?? '';

  // Resolve trophy item template IDs from boss name
  const trophyDefs = WORLD_EVENT_CONSTANTS.BOSS_TROPHY_DROPS[mobName] ?? [];
  const trophyTemplateMap = new Map<string, string>();
  if (trophyDefs.length > 0) {
    const trophyNames = trophyDefs.map((t) => t.itemName);
    const trophyTemplates = await prisma.itemTemplate.findMany({
      where: { name: { in: trophyNames } },
      select: { id: true, name: true },
    });
    for (const t of trophyTemplates) {
      trophyTemplateMap.set(t.name, t.id);
    }
  }

  for (const contributor of contributors) {
    const playerScore = scores.find(s => s.playerId === contributor.playerId)?.score ?? 0;
    const ratio = totalContribution > 0 ? playerScore / totalContribution : 1 / contributors.length;
    const dropMultiplier = Math.max(0.5, Math.min(2, ratio * contributors.length));

    // 1. Item loot with rarity bonus
    const loot = await rollAndGrantLoot(
      contributor.playerId,
      mobTemplateId,
      mobLevel + rarityBonus,
      dropMultiplier,
    );
    const enrichedLoot = await enrichLootWithNames(loot);
    const lootReward: BossPlayerReward['loot'] = enrichedLoot.map((drop) => ({
      itemTemplateId: drop.itemTemplateId,
      quantity: drop.quantity,
      rarity: drop.rarity,
      itemName: drop.itemName ?? undefined,
    }));

    // 1b. Guaranteed trophy material drops
    for (const tDef of trophyDefs) {
      const templateId = trophyTemplateMap.get(tDef.itemName);
      if (!templateId) continue;
      const qty = randomIntInclusive(tDef.minQty, tDef.maxQty);
      await addStackableItem(contributor.playerId, templateId, qty);
      lootReward.push({ itemTemplateId: templateId, quantity: qty, rarity: 'common', itemName: tDef.itemName });
    }

    // 2. XP scaled by contribution
    const scaledXp = Math.round(baseXp * Math.max(0.5, Math.min(2, ratio * contributors.length)));
    const skillType = (contributor.attackSkill ?? 'magic') as SkillType;
    const xpResult = await grantSkillXp(contributor.playerId, skillType, scaledXp);

    const xpReward: BossPlayerReward['xp'] = {
      skillType,
      rawXp: scaledXp,
      xpAfterEfficiency: xpResult.boostedXpAfterEfficiency,
      leveledUp: xpResult.xpResult.leveledUp,
      newLevel: xpResult.newLevel,
    };

    // 3. Recipe drop (15% chance)
    let recipeUnlocked: BossPlayerReward['recipeUnlocked'] | undefined;
    if (mobFamilyId && Math.random() < WORLD_EVENT_CONSTANTS.BOSS_RECIPE_DROP_CHANCE) {
      recipeUnlocked = await rollBossRecipeDrop(contributor.playerId, mobFamilyId);
    }

    // --- Achievement check (boss stats derived from source tables) ---
    const bossAchKeys = ['totalBossKills', 'totalBossDamage'];
    if (recipeUnlocked) bossAchKeys.push('totalRecipesLearned');
    const bossAchievements = await checkAchievements(contributor.playerId, {
      statKeys: bossAchKeys,
      familyId: mobFamilyId || undefined,
    });
    await emitAchievementNotifications(contributor.playerId, bossAchievements);

    result[contributor.playerId] = {
      loot: lootReward,
      xp: xpReward,
      recipeUnlocked,
    };
  }

  return result;
}
