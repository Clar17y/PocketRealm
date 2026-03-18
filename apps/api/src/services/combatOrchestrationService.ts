import {
  buildPlayerCombatStats,
  type TemplateCombatant,
} from '@pocketrealm/game-engine';
import {
  ALWAYS_AVAILABLE_ACTION_IDS,
  BASE_ACTION_DEFINITIONS,
  COMBAT_CONSTANTS,
  GUILD_CONSTANTS,
  type ActionDefinition,
  type CombatPotion,
  type CombatTemplateSlotData,
  type LootDrop,
  type QuestProgressUpdate,
  type PerActionScaling,
} from '@pocketrealm/shared';
import { Prisma } from '@pocketrealm/database';
import { rollAndGrantLootWithCapacity } from './lootService';
import type { PendingLootItem } from './pendingLootService';
import { grantSkillXp, type GrantXpResult } from './xpService';
import { recordBestiaryKill } from '../utils/routeHelpers.js';
import { addGuildXp, getPlayerGuildId } from './guildService';
import { trackProgress } from './progressService';
import { getPlayerGuildModifiers, type PlayerGuildModifiers } from './guildUpgradeService';
import { mapTemplateCombatLog } from './combatLogMapper';
import { getMainHandAttackSkill, getSkillLevel, buildPerActionScaling, type AttackSkill } from './combatStatsService';
import { getEquipmentStats, type EquipmentStats } from './equipmentService';
import { getPlayerProgressionState, type PlayerProgressionState } from './attributesService';
import { getActiveTemplate } from './combatTemplateService';
import { getResourceState } from './resourceService';
import { getSkillPoints } from './skillPointService';
import { buildPotionPool, templateHasPotionActions } from './potionService';

// ── Prepare player for combat ────────────────────────────────────────

interface PlayerCombatPrep {
  attackSkill: AttackSkill;
  attackLevel: number;
  progression: PlayerProgressionState;
  equipmentStats: EquipmentStats;
  guildMods: PlayerGuildModifiers;
  perActionScaling: PerActionScaling;
  playerTemplate: CombatTemplateSlotData[];
  potionPool: CombatPotion[];
  resources: {
    stamina: number; maxStamina: number; staminaRegenPerRound: number;
    mana: number; maxMana: number; manaRegenPerRound: number;
  };
  unlockedActions: string[];
}

interface PreparePlayerCombatOptions {
  requestedAttackSkill?: AttackSkill | null;
  maxHp: number;
  /** Pre-fetched data to avoid redundant queries */
  preloaded?: {
    mainHandAttackSkill?: AttackSkill | null;
    equipmentStats?: EquipmentStats;
    progression?: PlayerProgressionState;
    guildMods?: PlayerGuildModifiers;
  };
}

/**
 * Fetches all data needed for a player to engage in template combat.
 * Parallelizes DB queries for optimal performance.
 */
export async function preparePlayerForCombat(
  playerId: string,
  opts: PreparePlayerCombatOptions,
): Promise<PlayerCombatPrep> {
  // Step 1: determine attack skill from weapon (or use preloaded/fallback)
  const mainHandAttackSkill = opts.preloaded?.mainHandAttackSkill !== undefined
    ? opts.preloaded.mainHandAttackSkill
    : await getMainHandAttackSkill(playerId);
  const attackSkill: AttackSkill = mainHandAttackSkill ?? opts.requestedAttackSkill ?? 'melee';

  // Step 2: fetch everything we can in parallel
  const [attackLevel, progression, equipmentStats, guildMods, playerTemplate, resourceState, skillPointState] = await Promise.all([
    getSkillLevel(playerId, attackSkill),
    opts.preloaded?.progression ?? getPlayerProgressionState(playerId),
    opts.preloaded?.equipmentStats ?? getEquipmentStats(playerId),
    opts.preloaded?.guildMods ?? getPlayerGuildModifiers(playerId),
    getActiveTemplate(playerId),
    getResourceState(playerId),
    getSkillPoints(playerId),
  ]);

  // Step 3: build per-action scaling (needs equipmentStats + progression)
  const perActionScaling = await buildPerActionScaling(playerId, {
    equipmentStats,
    attributes: progression.attributes,
    weaponRequiredSkill: mainHandAttackSkill,
    guildDamageMultiplier: guildMods.combatDamage,
  });

  // Step 4: build potion pool if template uses potions
  const potionPool = templateHasPotionActions(playerTemplate)
    ? await buildPotionPool(playerId, opts.maxHp)
    : [];

  return {
    attackSkill,
    attackLevel,
    progression,
    equipmentStats,
    guildMods,
    perActionScaling,
    playerTemplate,
    potionPool,
    resources: {
      stamina: resourceState.stamina.current,
      maxStamina: resourceState.stamina.max,
      staminaRegenPerRound: resourceState.stamina.regenPerRound,
      mana: resourceState.mana.current,
      maxMana: resourceState.mana.max,
      manaRegenPerRound: resourceState.mana.regenPerRound,
    },
    unlockedActions: skillPointState.unlockedActions,
  };
}

// ── Build player template combatant ──────────────────────────────────

export function buildPlayerTemplateCombatant(params: {
  playerId: string;
  username: string;
  playerStats: ReturnType<typeof buildPlayerCombatStats>;
  template: CombatTemplateSlotData[];
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  unlockedActions: string[];
  perActionScaling?: PerActionScaling;
}): TemplateCombatant {
  const unlockedSet = new Set(params.unlockedActions);
  const filteredActions: Record<string, ActionDefinition> = {};
  for (const [id, def] of Object.entries(BASE_ACTION_DEFINITIONS)) {
    if (ALWAYS_AVAILABLE_ACTION_IDS.has(id) || unlockedSet.has(id)) {
      filteredActions[id] = def;
    }
  }
  return {
    id: params.playerId,
    name: params.username,
    stats: params.playerStats,
    template: params.template,
    stamina: params.stamina,
    maxStamina: params.maxStamina,
    staminaRegenPerRound: params.staminaRegenPerRound,
    mana: params.mana,
    maxMana: params.maxMana,
    manaRegenPerRound: params.manaRegenPerRound,
    actionDefinitions: filteredActions,
    perActionScaling: params.perActionScaling,
  };
}

// ── Apply guild combat modifiers ─────────────────────────────────────

export function applyGuildCombatModifiers(
  playerStats: ReturnType<typeof buildPlayerCombatStats>,
  guildMods: Pick<PlayerGuildModifiers, 'combatDamage' | 'defenseBoost'>,
): void {
  // Note: combatDamage is now applied via PerActionScaling.guildDamageMultiplier
  // in the per-action path. The fallback stats still get the boost for mobs/legacy.
  if (guildMods.combatDamage > 0) {
    playerStats.damageMin = Math.round(playerStats.damageMin * (1 + guildMods.combatDamage));
    playerStats.damageMax = Math.round(playerStats.damageMax * (1 + guildMods.combatDamage));
  }
  if (guildMods.defenseBoost > 0) {
    playerStats.defence = Math.round(playerStats.defence * (1 + guildMods.defenseBoost));
    playerStats.magicDefence = Math.round(playerStats.magicDefence * (1 + guildMods.defenseBoost));
  }
}

// ── Process combat victory rewards ───────────────────────────────────

interface VictoryRewardParams {
  playerId: string;
  mob: {
    id: string;
    level: number;
    dropChanceMultiplier: number;
    xpReward: number;
    mobPrefix: string | null;
  };
  attackSkill: AttackSkill;
  damageByScalingStat?: { melee: number; ranged: number; magic: number };
  resourceCostByScalingStat?: { melee: number; ranged: number; magic: number };
  guildXpBoost?: number;
  includeBestiary?: boolean;
}

interface VictoryRewardResult {
  loot: LootDrop[];
  overflow: PendingLootItem[];
  pendingLootSessionId: string | null;
  newItemIds: string[];
  updatedItemIds: string[];
  xpGrants: GrantXpResult[];
  questProgress: QuestProgressUpdate[];
}

export async function processCombatVictoryRewards(
  params: VictoryRewardParams,
): Promise<VictoryRewardResult> {
  const { playerId, mob, attackSkill } = params;

  const lootResult = await rollAndGrantLootWithCapacity(
    playerId, mob.id, mob.level, mob.dropChanceMultiplier,
  );

  const totalXp = Math.max(0, mob.xpReward);
  const xpGrants = await splitAndGrantXp(
    playerId, totalXp, attackSkill, params.damageByScalingStat, params.resourceCostByScalingStat, params.guildXpBoost,
  );

  // Guild XP + quest/contract progress for all combat victories
  const guildId = await getPlayerGuildId(playerId);

  // Run all independent post-combat work in parallel
  const results = await Promise.allSettled([
    params.includeBestiary !== false
      ? recordBestiaryKill(playerId, mob.id, mob.mobPrefix)
      : Promise.resolve(undefined),
    guildId ? addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL) : Promise.resolve(),
    trackProgress(playerId, 'kill_count', 1, undefined, guildId),
    trackProgress(playerId, 'kill_family', 1, undefined, guildId),
    mob.mobPrefix
      ? trackProgress(playerId, 'kill_prefix', 1, { prefix: mob.mobPrefix }, guildId)
      : Promise.resolve([]),
  ]);

  const killProgress = results[2].status === 'fulfilled' ? results[2].value : [];
  const familyProgress = results[3].status === 'fulfilled' ? results[3].value : [];
  const prefixProgress = results[4].status === 'fulfilled' ? results[4].value : [];

  const questProgress: QuestProgressUpdate[] = [
    ...killProgress,
    ...familyProgress,
    ...prefixProgress,
  ];

  return {
    loot: lootResult.drops,
    overflow: lootResult.overflow,
    pendingLootSessionId: lootResult.pendingLootSessionId,
    newItemIds: lootResult.newItemIds,
    updatedItemIds: lootResult.updatedItemIds,
    xpGrants,
    questProgress,
  };
}

export async function splitAndGrantXp(
  playerId: string,
  totalXp: number,
  fallbackSkill: AttackSkill,
  damageByScalingStat: { melee: number; ranged: number; magic: number } | undefined,
  resourceCostByScalingStat: { melee: number; ranged: number; magic: number } | undefined,
  guildXpBoost: number | undefined,
): Promise<GrantXpResult[]> {
  // Compute contribution per skill: damage + weighted resource cost
  const contribution = { melee: 0, ranged: 0, magic: 0 };
  if (damageByScalingStat) {
    contribution.melee += damageByScalingStat.melee;
    contribution.ranged += damageByScalingStat.ranged;
    contribution.magic += damageByScalingStat.magic;
  }
  if (resourceCostByScalingStat) {
    const w = COMBAT_CONSTANTS.RESOURCE_XP_WEIGHT;
    contribution.melee += resourceCostByScalingStat.melee * w;
    contribution.ranged += resourceCostByScalingStat.ranged * w;
    contribution.magic += resourceCostByScalingStat.magic * w;
  }

  const totalContribution = contribution.melee + contribution.ranged + contribution.magic;
  if (totalContribution <= 0) {
    return [await grantSkillXp(playerId, fallbackSkill, totalXp, undefined, guildXpBoost)];
  }

  // Find skills that contributed
  const skills = (['melee', 'ranged', 'magic'] as const).filter(s => contribution[s] > 0);
  if (skills.length === 1) {
    return [await grantSkillXp(playerId, skills[0], totalXp, undefined, guildXpBoost)];
  }

  // Distribute with floor, give remainder to highest-contribution skill
  const xpBySkill: Record<string, number> = {};
  let allocated = 0;
  for (const skill of skills) {
    xpBySkill[skill] = Math.floor(totalXp * contribution[skill] / totalContribution);
    allocated += xpBySkill[skill];
  }
  const topSkill = skills.reduce((a, b) => contribution[a] >= contribution[b] ? a : b);
  xpBySkill[topSkill] += totalXp - allocated;

  const results: GrantXpResult[] = [];
  for (const skill of skills) {
    if (xpBySkill[skill] > 0) {
      results.push(await grantSkillXp(playerId, skill, xpBySkill[skill], undefined, guildXpBoost));
    }
  }
  return results;
}

// ── Build combat activity log result ─────────────────────────────────

interface CombatLogResultParams {
  zoneId: string;
  zoneName: string;
  mob: { id: string; name: string; mobPrefix: string | null; mobDisplayName: string | null };
  source: string;
  encounterSiteId: string | null;
  attackSkill: string;
  combatResult: {
    outcome: string;
    combatantAMaxHp: number;
    combatantBMaxHp: number;
    log: Parameters<typeof mapTemplateCombatLog>[0];
    potionsConsumed?: readonly { templateId: string; name: string }[];
  };
  rewards: {
    xp: number;
    baseXp: number;
    loot: readonly { itemTemplateId: string; quantity: number; rarity?: string }[];
    durabilityLost: readonly { itemId: string; amount: number }[];
    skillXpGrants: readonly Record<string, unknown>[];
  };
  eventModifiers: readonly { effectType: string; effectValue: number; title: string }[];
  potionsConsumed?: readonly { templateId: string; name: string }[];
}

export function buildCombatLogResult(params: CombatLogResultParams): Prisma.InputJsonValue {
  return {
    zoneId: params.zoneId,
    zoneName: params.zoneName,
    mobTemplateId: params.mob.id,
    mobName: params.mob.name,
    mobPrefix: params.mob.mobPrefix,
    mobDisplayName: params.mob.mobDisplayName,
    source: params.source,
    encounterSiteId: params.encounterSiteId,
    attackSkill: params.attackSkill,
    outcome: params.combatResult.outcome,
    playerMaxHp: params.combatResult.combatantAMaxHp,
    mobMaxHp: params.combatResult.combatantBMaxHp,
    log: mapTemplateCombatLog(params.combatResult.log),
    rewards: params.rewards,
    eventModifiers: params.eventModifiers,
    ...(params.potionsConsumed ? { potionsConsumed: params.potionsConsumed } : {}),
  } as unknown as Prisma.InputJsonValue;
}
