import { resolveAchievementTitleDisplay } from '@pocketrealm/shared/utils/titleDisplay';
import { TALENT_TREE_DEFINITIONS } from '@pocketrealm/shared/constants/talentTreeDefinitions';
import { shouldResetWindowCap } from '@pocketrealm/game-engine';
import { prisma } from '@pocketrealm/database';
import { QUERY_LIMITS, type CraftingMaterial } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import type { AuthPayload } from '../middleware/auth';
import { getTurnState } from './turnBankService';
import { normalizePlayerAttributes } from './attributesService';
import { clearStaleEncounterSiteLockout } from './expeditionLockoutService';
import { listZones } from './zoneRoutesService';
import { getInventoryState } from './inventoryService';
import { ensureEquipmentSlots } from './equipmentService';
import { getHpState } from './hpService';
import { getResourceState } from './resourceService';
import { getSkillPoints } from './skillPointService';
import { getActiveBuffs } from './buffService';
import { getExpeditionCooldowns } from './expeditionService';
import { getActiveEventsForZone } from './worldEventService';
import { getCachedCraftingRecipes } from './staticDataCacheService';
import { buildRecipeDiscoveryHint, parseMaterials } from './crafting/helpers';
import { getPlayerGuild } from './guildService';

interface BootstrapZonesPayload {
  currentZoneId: string | null;
  zones: unknown[];
  connections: unknown[];
  undiscoveredZones?: unknown[];
}

interface MaterialTemplateSummary {
  id: string;
  name: string;
  itemType: string;
  stackable: boolean;
}

function getBootstrapZonesPayload(response: Awaited<ReturnType<typeof listZones>>): BootstrapZonesPayload {
  return response.body as BootstrapZonesPayload;
}

async function getPlayerPayload(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      username: true,
      accountId: true,
      seasonId: true,
      createdAt: true,
      lastActiveAt: true,
      characterXp: true,
      characterLevel: true,
      attributePoints: true,
      attributes: true,
      tutorialStep: true,
      combatLogSpeedMs: true,
      explorationSpeedMs: true,
      autoSkipKnownCombat: true,
      defaultExploreTurns: true,
      quickRestHealPercent: true,
      defaultRefiningMax: true,
      lowHpWarning: true,
      confirmRarity: true,
      lootRevealRarity: true,
      forgeConfirmRarity: true,
      showNpcDialogue: true,
      showItemFlavourText: true,
      showBestiaryLore: true,
      activeTitle: true,
      gold: true,
      homeTownId: true,
      activeEncounterSiteId: true,
      notifyPvpAttack: true,
      notifyPvpScout: true,
      notifyBossAppeared: true,
      notifyBossKilled: true,
      notifyTurnBankFull: true,
      notifyExpeditionStarted: true,
      notifyExpeditionFinished: true,
      account: {
        select: {
          email: true,
          role: true,
          emailVerified: true,
          isPremium: true,
          premiumExpiresAt: true,
        },
      },
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const staleEncounterLockCleared = await clearStaleEncounterSiteLockout(playerId, {
    activeEncounterSiteId: player.activeEncounterSiteId,
  });
  const titleDisplay = resolveAchievementTitleDisplay(player.activeTitle);

  return {
    player: {
      ...player,
      activeEncounterSiteId: staleEncounterLockCleared ? null : player.activeEncounterSiteId,
      email: player.account.email,
      role: player.account.role,
      emailVerified: player.account.emailVerified,
      isPremium: player.account.isPremium,
      premiumExpiresAt: player.account.premiumExpiresAt,
      characterXp: Number(player.characterXp),
      attributes: normalizePlayerAttributes(player.attributes),
      activeTitle: titleDisplay.title ?? null,
      activeTitleStyle: titleDisplay.titleStyle ?? null,
    },
  };
}

async function getSkillsPayload(playerId: string) {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
    select: {
      id: true,
      skillType: true,
      level: true,
      xp: true,
      dailyXpGained: true,
      lastXpResetAt: true,
    },
  });
  const now = new Date();

  return {
    skills: skills.map((skill) => {
      const windowExpired = shouldResetWindowCap(skill.lastXpResetAt, now);
      return {
        ...skill,
        xp: Number(skill.xp),
        dailyXpGained: windowExpired ? 0 : skill.dailyXpGained,
      };
    }),
  };
}

async function getInventoryPayload(playerId: string) {
  const [items, equipped, inventoryState, materialRows] = await Promise.all([
    prisma.item.findMany({
      where: { ownerId: playerId, inStash: false },
      include: { template: true },
      orderBy: [{ createdAt: 'desc' }],
      take: QUERY_LIMITS.MAX_INVENTORY_RESULTS,
    }),
    prisma.playerEquipment.findMany({
      where: { playerId, itemId: { not: null } },
      select: { slot: true, itemId: true },
    }),
    getInventoryState(playerId),
    prisma.item.groupBy({
      by: ['templateId'],
      where: { ownerId: playerId },
      _sum: { quantity: true },
    }),
  ]);

  const equippedByItemId = new Map<string, string>();
  for (const entry of equipped) {
    if (entry.itemId) equippedByItemId.set(entry.itemId, entry.slot);
  }

  const materialTotals: Record<string, number> = {};
  for (const row of materialRows) {
    materialTotals[row.templateId] = row._sum.quantity ?? 0;
  }

  return {
    items: items.map((item) => ({
      ...item,
      equippedSlot: equippedByItemId.get(item.id) ?? null,
    })),
    capacity: inventoryState.capacity,
    usedSlots: inventoryState.usedSlots,
    materialTotals,
  };
}

async function getEquipmentPayload(playerId: string) {
  await ensureEquipmentSlots(playerId);
  const equipment = await prisma.playerEquipment.findMany({
    where: { playerId },
    include: {
      item: {
        include: {
          template: true,
        },
      },
    },
  });

  return { equipment };
}

async function getExpeditionCooldownPayload(playerId: string) {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true },
  });
  if (!membership) {
    return { weeklyCooldowns: {}, betweenCooldown: null, hasActiveExpedition: false };
  }

  return getExpeditionCooldowns(membership.guildId, playerId);
}

async function getCraftingPayload(playerId: string, currentZoneId: string | null) {
  const [learnedAdvancedRecipes, currentZone, recipes] = await Promise.all([
    prisma.playerRecipe.findMany({
      where: { playerId },
      select: { recipeId: true },
    }) as Promise<Array<{ recipeId: string }>>,
    currentZoneId
      ? prisma.zone.findUnique({
          where: { id: currentZoneId },
          select: { name: true, maxCraftingLevel: true },
        })
      : Promise.resolve(null),
    getCachedCraftingRecipes(),
  ]);
  const learnedRecipeIds = new Set(learnedAdvancedRecipes.map((entry) => entry.recipeId));

  const visible = recipes.map((recipe) => {
    const isAdvanced = Boolean(recipe.isAdvanced);
    const isDiscovered = !isAdvanced || learnedRecipeIds.has(recipe.id);

    return {
      id: recipe.id,
      skillType: recipe.skillType,
      requiredLevel: recipe.requiredLevel,
      resultTemplate: recipe.resultTemplate,
      isAdvanced,
      isDiscovered,
      discoveryHint: isDiscovered ? null : buildRecipeDiscoveryHint(recipe.mobFamily),
      soulbound: Boolean(recipe.soulbound),
      mobFamilyId: recipe.mobFamilyId ?? null,
      turnCost: recipe.turnCost,
      materials: parseMaterials(recipe.materials),
      materialTemplates: [] as MaterialTemplateSummary[],
      xpReward: recipe.xpReward,
    };
  });

  const allMaterialIds = new Set<string>();
  for (const recipe of visible) {
    for (const material of recipe.materials) allMaterialIds.add(material.templateId);
  }

  const materialIds = Array.from(allMaterialIds);
  const templates = materialIds.length > 0
    ? await prisma.itemTemplate.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, name: true, itemType: true, stackable: true },
      })
    : [];
  const byId = new Map(templates.map((template) => [template.id, template]));

  for (const recipe of visible) {
    recipe.materialTemplates = recipe.materials
      .map((material: CraftingMaterial) => byId.get(material.templateId))
      .filter((template): template is MaterialTemplateSummary => Boolean(template));
  }

  return {
    recipes: visible,
    zoneCraftingLevel: currentZone ? currentZone.maxCraftingLevel : 0,
    zoneName: currentZone?.name ?? null,
  };
}

export async function getGameBootstrap(playerId: string) {
  const player = await getPlayerPayload(playerId);
  const authPlayer: AuthPayload = {
    playerId,
    accountId: player.player.accountId,
    username: player.player.username,
    seasonId: player.player.seasonId,
    role: player.player.role,
  };

  const zonesResponsePromise = listZones({ player: authPlayer });
  const craftingPromise = zonesResponsePromise.then((response) =>
    getCraftingPayload(playerId, getBootstrapZonesPayload(response).currentZoneId)
  );

  const [
    turns,
    skills,
    zonesResponse,
    inventory,
    equipment,
    hp,
    resources,
    skillPointState,
    buffs,
    expeditionCooldowns,
    crafting,
    guild,
  ] = await Promise.all([
    getTurnState(playerId),
    getSkillsPayload(playerId),
    zonesResponsePromise,
    getInventoryPayload(playerId),
    getEquipmentPayload(playerId),
    getHpState(playerId),
    getResourceState(playerId),
    getSkillPoints(playerId),
    getActiveBuffs(playerId),
    getExpeditionCooldownPayload(playerId),
    craftingPromise,
    getPlayerGuild(playerId),
  ]);

  const zones = getBootstrapZonesPayload(zonesResponse);
  const zoneEvents = zones.currentZoneId
    ? { events: await getActiveEventsForZone(zones.currentZoneId) }
    : { events: [] };

  return {
    turns,
    player,
    skills,
    zones,
    inventory,
    equipment,
    hp,
    resources,
    skillPoints: {
      ...skillPointState,
      trees: TALENT_TREE_DEFINITIONS,
    },
    buffs: { buffs },
    expeditionCooldowns,
    zoneEvents,
    crafting,
    guild,
  };
}
