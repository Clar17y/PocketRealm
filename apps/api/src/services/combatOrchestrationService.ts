import {
  buildPlayerCombatStats,
  type TemplateCombatant,
} from '@adventure/game-engine';
import {
  ALWAYS_AVAILABLE_ACTION_IDS,
  BASE_ACTION_DEFINITIONS,
  GUILD_CONSTANTS,
  type ActionDefinition,
  type CombatTemplateSlotData,
  type LootDrop,
  type PerActionScaling,
} from '@adventure/shared';
import { Prisma } from '@adventure/database';
import { rollAndGrantLootWithCapacity } from './lootService';
import type { PendingLootItem } from './pendingLootService';
import { grantSkillXp, type GrantXpResult } from './xpService';
import { recordBestiaryKill } from '../utils/routeHelpers.js';
import { addGuildXp, getPlayerGuildId } from './guildService';
import { incrementContractProgress } from './guildContractService';
import type { PlayerGuildModifiers } from './guildUpgradeService';
import { mapTemplateCombatLog } from './combatLogMapper';
import type { AttackSkill } from './combatStatsService';

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

export interface VictoryRewardParams {
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
  guildXpBoost?: number;
  includeGuildCredit?: boolean;
  includeBestiary?: boolean;
}

export interface VictoryRewardResult {
  loot: LootDrop[];
  overflow: PendingLootItem[];
  pendingLootSessionId: string | null;
  xpGrants: GrantXpResult[];
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
    playerId, totalXp, attackSkill, params.damageByScalingStat, params.guildXpBoost,
  );

  if (params.includeBestiary !== false) {
    await recordBestiaryKill(playerId, mob.id, mob.mobPrefix);
  }

  if (params.includeGuildCredit) {
    const guildId = await getPlayerGuildId(playerId);
    if (guildId) {
      await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
      void incrementContractProgress(guildId, 'kill_count', 1).catch(() => {});
      void incrementContractProgress(guildId, 'kill_family', 1).catch(() => {});
    }
  }

  return {
    loot: lootResult.drops,
    overflow: lootResult.overflow,
    pendingLootSessionId: lootResult.pendingLootSessionId,
    xpGrants,
  };
}

async function splitAndGrantXp(
  playerId: string,
  totalXp: number,
  fallbackSkill: AttackSkill,
  damageByScalingStat: { melee: number; ranged: number; magic: number } | undefined,
  guildXpBoost: number | undefined,
): Promise<GrantXpResult[]> {
  const boost = guildXpBoost || undefined;

  // No damage tracking or no damage dealt — grant all to fallback skill
  const totalDamage = damageByScalingStat
    ? damageByScalingStat.melee + damageByScalingStat.ranged + damageByScalingStat.magic
    : 0;
  if (!damageByScalingStat || totalDamage <= 0) {
    return [await grantSkillXp(playerId, fallbackSkill, totalXp, undefined, boost)];
  }

  // Split proportionally by damage dealt
  const skills = (['melee', 'ranged', 'magic'] as const).filter(s => damageByScalingStat[s] > 0);
  if (skills.length === 1) {
    return [await grantSkillXp(playerId, skills[0], totalXp, undefined, boost)];
  }

  // Distribute with floor, give remainder to highest-damage skill
  const xpBySkill: Record<string, number> = {};
  let allocated = 0;
  for (const skill of skills) {
    xpBySkill[skill] = Math.floor(totalXp * damageByScalingStat[skill] / totalDamage);
    allocated += xpBySkill[skill];
  }
  // Assign remainder to the skill with most damage
  const topSkill = skills.reduce((a, b) => damageByScalingStat[a] >= damageByScalingStat[b] ? a : b);
  xpBySkill[topSkill] += totalXp - allocated;

  const results: GrantXpResult[] = [];
  for (const skill of skills) {
    if (xpBySkill[skill] > 0) {
      results.push(await grantSkillXp(playerId, skill, xpBySkill[skill], undefined, boost));
    }
  }
  return results;
}

// ── Build combat activity log result ─────────────────────────────────

export interface CombatLogResultParams {
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
    log: unknown[];
    potionsConsumed?: unknown[];
  };
  rewards: {
    xp: number;
    baseXp: number;
    loot: unknown[];
    durabilityLost: unknown[];
    skillXpGrants: unknown[];
  };
  eventModifiers: unknown[];
  potionsConsumed?: unknown[];
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
    log: mapTemplateCombatLog(params.combatResult.log as Parameters<typeof mapTemplateCombatLog>[0]),
    rewards: params.rewards,
    eventModifiers: params.eventModifiers,
    ...(params.potionsConsumed ? { potionsConsumed: params.potionsConsumed } : {}),
  } as unknown as Prisma.InputJsonValue;
}
