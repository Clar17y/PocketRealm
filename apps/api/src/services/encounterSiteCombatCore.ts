import { BASE_ACTION_DEFINITIONS, ALWAYS_AVAILABLE_ACTION_IDS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { prisma } from '@pocketrealm/database';
import {
  ENCOUNTER_SITE_CONSTANTS,
  makeEncounterMobId,
  parseEncounterMobSlot,
  getMobPrefixDefinition,
  type RaidRoundInput,
  type RaidParticipant,
  type RaidParticipantResult,
  type RaidThreatEntry,
  type ExpeditionMobState,
  type ExpeditionRoundLog,
  type PlayerAttackEntry,
  type BossActiveEffect,
  type ActionDefinition,
  type CombatPotion,
  type PotionConsumed,
  type RoomStrategyEntry,
  type EncounterMobSlot,
} from '@pocketrealm/shared';
import {
  applyEquipmentActionModifiers,
  resolveRaidRound,
  buildEncounterRaidMob,
  buildPlayerCombatStats,
  initThreatTable,
} from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { preparePlayerForCombat, applyGuildCombatModifiers } from './combatOrchestrationService';
import type { AttackSkill } from './combatStatsService';
import { handleCombatDefeat } from '../utils/routeHelpers';
import { getInventoryState } from './inventoryService';
import { templateHasPotionActions, buildPotionPool } from './potionService';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import {
  computeZoneModifiers,
  getActiveEventsForZone,
  getActiveWorldWideEvents,
} from './worldEventService';
import {
  getAllAliveMobsInRoom,
} from './combat/helpers';
import { grantEncounterSiteChestRewardsTx } from './chestService';

/** Shared flee result shape used by both auto-resolve and manual combat. */
export interface FleeResult {
  outcome: string;
  remainingHp: number;
  goldLost: number;
  isRecovering: boolean;
  recoveryCost: number | null;
}

/** Snapshot of initial mob state for activity logs and return values. */
export function toInitialMobSnapshot(mobs: ExpeditionMobState[]) {
  return mobs.map(m => ({
    mobId: m.id,
    slot: parseEncounterMobSlot(m.id) ?? 0,
    name: m.name,
    prefix: m.prefix,
    hp: m.hp,
    maxHp: m.maxHp,
  }));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoundSnapshot {
  roundNumber: number;
  log: ExpeditionRoundLog;
  mobStates: Array<{
    slot: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    activeEffects: BossActiveEffect[];
  }>;
  playerState: {
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    mana: number;
    maxMana: number;
    activeEffects: BossActiveEffect[];
  };
}

export type CombatSkillContribution = Record<AttackSkill, number>;

export interface EncounterRoomCombatResult {
  outcome: 'cleared' | 'defeated';
  roundsResolved: number;
  rounds: RoundSnapshot[];
  damageByScalingStat: CombatSkillContribution;
  resourceCostByScalingStat: CombatSkillContribution;
  playerHpAfter: number;
  playerStaminaAfter: number;
  playerManaAfter: number;
  mobResults: { mobId: string; alive: boolean; hpRemaining: number }[];
  potionsConsumed: PotionConsumed[];
}

export interface EncounterSiteXpContributions {
  damageByScalingStat: CombatSkillContribution;
  resourceCostByScalingStat: CombatSkillContribution;
}

export function createEncounterSiteXpContributions(): EncounterSiteXpContributions {
  return {
    damageByScalingStat: { melee: 0, ranged: 0, magic: 0 },
    resourceCostByScalingStat: { melee: 0, ranged: 0, magic: 0 },
  };
}

function resolveActionXpSkill(action: ActionDefinition, fallbackSkill: AttackSkill): AttackSkill {
  const scalingStat = action.scalingStat ?? 'weapon';
  return scalingStat === 'weapon' ? fallbackSkill : scalingStat;
}

function resolveEncounterSiteAction(
  actionId: string,
  actionDefinitions: Record<string, ActionDefinition>,
): ActionDefinition | undefined {
  return actionDefinitions[actionId] ?? BASE_ACTION_DEFINITIONS[actionId];
}

export function accumulateEncounterSiteXpContribution(
  contributions: EncounterSiteXpContributions,
  participantResult: RaidParticipantResult | undefined,
  actionDefinitions: Record<string, ActionDefinition>,
  fallbackSkill: AttackSkill,
): void {
  if (!participantResult) return;

  const action = resolveEncounterSiteAction(participantResult.actionId, actionDefinitions);
  if (!action) return;

  const xpSkill = resolveActionXpSkill(action, fallbackSkill);
  if (participantResult.damageDealt > 0) {
    contributions.damageByScalingStat[xpSkill] += participantResult.damageDealt;
  }

  if (!participantResult.wasExhausted) {
    const resourceCost = action.cost.stamina + action.cost.mana;
    if (resourceCost > 0) {
      contributions.resourceCostByScalingStat[xpSkill] += resourceCost;
    }
  }
}

export function accumulateEncounterSiteEffectTickXpContributions(
  contributions: EncounterSiteXpContributions,
  effectTicks: ExpeditionRoundLog['phases']['effectTicks'],
): void {
  for (const tick of effectTicks) {
    if (tick.targetType !== 'mob' || tick.damage <= 0 || !tick.sourceScalingStat) {
      continue;
    }

    contributions.damageByScalingStat[tick.sourceScalingStat] += tick.damage;
  }
}

function isPlayerAttackEntry(
  entry: ExpeditionRoundLog['phases']['playerAttacks'][number],
): entry is PlayerAttackEntry {
  return 'hit' in entry;
}

export function rebuildEncounterSiteXpContributionsFromRoundLogs(
  roundLogs: ExpeditionRoundLog[],
  actionDefinitions: Record<string, ActionDefinition>,
  fallbackSkill: AttackSkill,
): EncounterSiteXpContributions {
  const contributions = createEncounterSiteXpContributions();
  const countedResourceCosts = new Set<string>();

  for (const log of roundLogs) {
    for (const entry of log.phases.playerAttacks) {
      if (!isPlayerAttackEntry(entry)) {
        continue;
      }

      const action = resolveEncounterSiteAction(entry.actionId, actionDefinitions);
      if (!action) {
        continue;
      }

      const xpSkill = resolveActionXpSkill(action, fallbackSkill);
      contributions.damageByScalingStat[xpSkill] += entry.totalDamage ?? 0;

      const resourceCostKey = `${log.round}:${entry.playerId}:${entry.actionId}`;
      if (!countedResourceCosts.has(resourceCostKey)) {
        countedResourceCosts.add(resourceCostKey);
        contributions.resourceCostByScalingStat[xpSkill] += entry.staminaCost + entry.manaCost;
      }
    }

    accumulateEncounterSiteEffectTickXpContributions(contributions, log.phases.effectTicks);
  }

  return contributions;
}

// ---------------------------------------------------------------------------
// Pure combat loop (testable without DB)
// ---------------------------------------------------------------------------

/**
 * Run the encounter site combat loop in memory.
 * Takes a pre-built RaidParticipant and mobs, returns the full combat result.
 */
export function resolveEncounterRoomCombat(
  participant: RaidParticipant,
  mobs: ExpeditionMobState[],
  maxRounds: number = ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_MAX_ROUNDS,
  fallbackAttackSkill: AttackSkill = 'melee',
): EncounterRoomCombatResult {
  // Track HP separately so we can report all mobs (alive and dead) at the end.
  // resolveRaidRound filters out dead mobs in its mobsAfter result, so we
  // maintain a parallel HP map keyed by mob ID.
  const mobHpById = new Map<string, number>(mobs.map(m => [m.id, m.hp]));

  // The live list fed into each round (only alive mobs)
  let aliveMobList = [...mobs];
  let currentParticipant = { ...participant };
  let threatTable: RaidThreatEntry[] = initThreatTable([participant.playerId]);
  const roundSnapshots: RoundSnapshot[] = [];
  const allPotionsConsumed: PotionConsumed[] = [];
  const xpContributions = createEncounterSiteXpContributions();
  let roundsResolved = 0;

  for (let round = 1; round <= maxRounds; round++) {
    if (aliveMobList.length === 0) break; // cleared
    if (currentParticipant.hp <= 0) break; // defeated

    roundsResolved = round;

    const input: RaidRoundInput = {
      mobs: aliveMobList,
      participants: [currentParticipant],
      threatTable,
      roundNumber: round,
      splashCascade: true,
    };

    const result = resolveRaidRound(input, undefined, 'pve_open_world');

    // Carry forward participant state
    const pr = result.participantResults[0];
    if (pr) {
      accumulateEncounterSiteXpContribution(
        xpContributions,
        pr,
        currentParticipant.actionDefinitions,
        fallbackAttackSkill,
      );
      accumulateEncounterSiteEffectTickXpContributions(
        xpContributions,
        result.roundLog.phases.effectTicks,
      );
      currentParticipant = {
        ...currentParticipant,
        hp: pr.hpAfter,
        stamina: pr.staminaAfter,
        mana: pr.manaAfter,
        templateRound: pr.templateRoundAfter,
        activeEffects: pr.activeEffectsAfter as typeof currentParticipant.activeEffects,
      };
      // Remove consumed potions from available pool
      for (const consumed of pr.potionsConsumed) {
        const idx = currentParticipant.availablePotions.findIndex(
          pot => pot.templateId === consumed.templateId,
        );
        if (idx >= 0) currentParticipant.availablePotions.splice(idx, 1);
        allPotionsConsumed.push(consumed);
      }
    }

    // result.mobsAfter only contains LIVING mobs (dead ones are filtered out).
    // Update our HP map from survivors, then rebuild aliveMobList from the survivors.
    for (const mob of result.mobsAfter) {
      mobHpById.set(mob.id, mob.hp);
    }
    // Any mob not in mobsAfter is dead (hp = 0)
    // Build surviving map (used for both dead-mob zeroing and snapshot active effects)
    const survivingMap = new Map(result.mobsAfter.map(s => [s.id, s]));
    for (const [id] of mobHpById) {
      if (!survivingMap.has(id)) mobHpById.set(id, 0);
    }

    // Next round uses the surviving mobs from the result
    aliveMobList = result.mobsAfter;
    threatTable = result.threatTableAfter;

    // Capture per-round snapshot for frontend playback
    roundSnapshots.push({
      roundNumber: round,
      log: result.roundLog,
      mobStates: mobs.map(m => {
        const hp = mobHpById.get(m.id) ?? 0;
        const surviving = survivingMap.get(m.id);
        return {
          slot: parseEncounterMobSlot(m.id) ?? 0,
          hp,
          maxHp: m.maxHp,
          alive: hp > 0,
          activeEffects: surviving?.activeEffects ?? [],
        };
      }),
      playerState: {
        hp: currentParticipant.hp,
        maxHp: currentParticipant.maxHp,
        stamina: currentParticipant.stamina,
        maxStamina: currentParticipant.maxStamina,
        mana: currentParticipant.mana,
        maxMana: currentParticipant.maxMana,
        activeEffects: currentParticipant.activeEffects,
      },
    });
  }

  const allMobsCleared = [...mobHpById.values()].every(hp => hp <= 0);
  return {
    outcome: allMobsCleared ? 'cleared' : 'defeated',
    roundsResolved,
    rounds: roundSnapshots,
    damageByScalingStat: { ...xpContributions.damageByScalingStat },
    resourceCostByScalingStat: { ...xpContributions.resourceCostByScalingStat },
    playerHpAfter: currentParticipant.hp,
    playerStaminaAfter: currentParticipant.stamina,
    playerManaAfter: currentParticipant.mana,
    mobResults: mobs.map(m => ({
      mobId: m.id,
      alive: (mobHpById.get(m.id) ?? 0) > 0,
      hpRemaining: mobHpById.get(m.id) ?? 0,
    })),
    potionsConsumed: allPotionsConsumed,
  };
}

/** Count player and mob hits from encounter site round logs for durability degradation. */
export function countEncounterSiteHits(roundLogs: ExpeditionRoundLog[]): {
  playerHitsLanded: number;
  mobHitsLanded: number;
  playerWeaponActionIds: string[];
} {
  let playerHitsLanded = 0;
  let mobHitsLanded = 0;
  const playerWeaponActionIds: string[] = [];
  for (const log of roundLogs) {
    for (const action of log.phases.playerAttacks) {
      if ('hit' in action && action.hit) {
        playerHitsLanded++;
        playerWeaponActionIds.push(action.actionId);
        if ('splashCascade' in action && action.splashCascade) {
          for (const splash of action.splashCascade) {
            if (splash.hit) {
              playerHitsLanded++;
              playerWeaponActionIds.push(action.actionId);
            }
          }
        }
      }
    }
    for (const mobAction of log.phases.mobActions) {
      for (const target of mobAction.targets) {
        if (!target.dodged && target.damageTaken > 0) mobHitsLanded++;
      }
    }
  }
  return { playerHitsLanded, mobHitsLanded, playerWeaponActionIds };
}

// ---------------------------------------------------------------------------
// Shared private helpers
// ---------------------------------------------------------------------------

/**
 * Advance to the first room with alive mobs after decay.
 * If the current room is already populated, returns it immediately.
 * Otherwise scans forward and persists the new currentRoom to the DB.
 */
export async function advanceToFirstAliveRoom(
  site: { id: string; currentRoom: number },
  decayedMobs: EncounterMobSlot[],
  totalRooms: number,
): Promise<{ currentRoom: number; roomMobs: EncounterMobSlot[] } | null> {
  let currentRoom = site.currentRoom;
  let roomMobs = getAllAliveMobsInRoom(decayedMobs, currentRoom);
  if (roomMobs.length > 0) return { currentRoom, roomMobs };

  for (let r = currentRoom + 1; r <= totalRooms; r++) {
    const candidate = getAllAliveMobsInRoom(decayedMobs, r);
    if (candidate.length > 0) {
      currentRoom = r;
      roomMobs = candidate;
      await prisma.encounterSite.update({ where: { id: site.id }, data: { currentRoom: r } });
      return { currentRoom, roomMobs };
    }
  }
  // All remaining rooms have decayed — callers should auto-clear
  return null;
}

/**
 * Handle the case where all remaining rooms have decayed: grant chest
 * rewards, delete the encounter site, and clear the player lockout.
 */
export async function handleDecayedSiteClearance(
  playerId: string,
  siteId: string,
  site: { mobFamilyId: string; totalRooms: number | null; roomStrategy: unknown },
): Promise<Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>>> {
  const { availableSlots } = await getInventoryState(playerId);
  const totalRoomsCount = site.totalRooms ?? 1;
  const existingStrategy = (Array.isArray(site.roomStrategy) ? site.roomStrategy : []) as unknown as RoomStrategyEntry[];
  const autoResolvedCount = existingStrategy.filter((e: RoomStrategyEntry) => e.mode === 'auto').length;
  return prisma.$transaction(async (tx) => {
    const rewards = await grantEncounterSiteChestRewardsTx(tx, {
      playerId,
      mobFamilyId: site.mobFamilyId,
      totalRooms: totalRoomsCount,
      autoResolvedBonusRooms: autoResolvedCount,
      availableSlots,
    });
    await tx.encounterSite.deleteMany({ where: { id: siteId, playerId } });
    await tx.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: null } });
    return rewards;
  });
}

/**
 * Load mob templates for a set of encounter mob slots, apply zone event
 * modifiers, and convert them to ExpeditionMobState[] via buildEncounterRaidMob.
 */
export async function loadRoomMobsAsRaidState(
  roomMobs: EncounterMobSlot[],
  zoneId: string,
  mobFamilyId: string,
): Promise<{ mobs: ExpeditionMobState[]; mobXpByTemplateId: Record<string, number> }> {
  const mobTemplateIds = [...new Set(roomMobs.map(m => m.mobTemplateId))];
  const mobTemplateRows = await prisma.mobTemplate.findMany({
    where: { id: { in: mobTemplateIds } },
    select: {
      id: true, name: true, hp: true, accuracy: true, defence: true,
      magicDefence: true, evasion: true, damageMin: true, damageMax: true,
      damageType: true, xpReward: true,
    },
  });
  const mobTemplateById = new Map(mobTemplateRows.map(t => [t.id, t]));

  const mobXpByTemplateId: Record<string, number> = {};
  for (const t of mobTemplateRows) mobXpByTemplateId[t.id] = t.xpReward;

  const [cachedZoneEvents, cachedWorldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);
  const zoneModifiers = computeZoneModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId });

  const defaultActionTemplate = [{ actionId: 'boss_physical_attack', targetMode: 'single_target' as const }];

  const expeditionMobs: ExpeditionMobState[] = [];
  for (const slot of roomMobs) {
    const template = mobTemplateById.get(slot.mobTemplateId);
    if (!template) continue;
    const modifiedTemplate = {
      ...template,
      damageType: template.damageType as import('@pocketrealm/shared').DamageType,
      hp: Math.max(1, Math.round(template.hp * Math.max(0.1, zoneModifiers.mobHpMultiplier))),
      damageMin: Math.max(1, Math.round(template.damageMin * Math.max(0.1, zoneModifiers.mobDamageMultiplier))),
      damageMax: Math.max(1, Math.round(template.damageMax * Math.max(0.1, zoneModifiers.mobDamageMultiplier))),
      actionTemplate: defaultActionTemplate,
    };
    expeditionMobs.push(buildEncounterRaidMob(slot, modifiedTemplate));
  }
  return { mobs: expeditionMobs, mobXpByTemplateId };
}

/**
 * Handle player defeat: fetch progression, call handleCombatDefeat, and
 * reshape the result into the flat fleeResult/respawnedTo structure used
 * by both auto-resolve and manual combat responses.
 */
export async function handleEncounterDefeat(
  playerId: string,
  maxHp: number,
): Promise<{
  fleeResult: FleeResult | null;
  respawnedTo: { townId: string; townName: string } | null;
}> {
  const progression = await getPlayerProgressionState(playerId);
  const defeatResult = await handleCombatDefeat(playerId, {
    evasionLevel: progression.attributes.evasion,
    mobLevel: 1, // encounter site mobs don't have a single level; use 1 as fallback
    maxHp,
  });
  const fleeResult: FleeResult | null = defeatResult.fleeResult
    ? {
        outcome: defeatResult.fleeResult.outcome,
        remainingHp: defeatResult.fleeResult.remainingHp,
        goldLost: defeatResult.fleeResult.goldLost,
        isRecovering: defeatResult.fleeResult.outcome === 'knockout',
        recoveryCost: defeatResult.fleeResult.recoveryCost,
      }
    : null;
  return { fleeResult, respawnedTo: defeatResult.respawnedTo };
}

export function computeDefeatedMobXp(
  defeatedMobIds: Set<string>,
  roomMobs: EncounterMobSlot[],
  mobXpByTemplateId: Record<string, number>,
): number {
  let totalXp = 0;
  for (const slot of roomMobs) {
    const mobId = makeEncounterMobId(slot.slot);
    if (!defeatedMobIds.has(mobId)) continue;
    const baseXp = mobXpByTemplateId[slot.mobTemplateId];
    if (baseXp === undefined) continue;
    let xp = baseXp;
    const prefix = getMobPrefixDefinition(slot.prefix);
    if (prefix) {
      xp = Math.max(1, Math.floor(xp * (prefix.xpMultiplier ?? 1)));
    }
    totalXp += xp;
  }
  return totalXp;
}

// ---------------------------------------------------------------------------
// Build RaidParticipant from player data (mirrors buildRaidParticipant in expeditionService)
// ---------------------------------------------------------------------------

export async function buildParticipantForEncounterSite(
  playerId: string,
  username: string,
  currentHp: number,
  maxHp: number,
): Promise<{ participant: RaidParticipant; attackSkill: AttackSkill; guildXpBoost: number }> {
  const [equipStats, progression] = await Promise.all([
    getEquipmentStats(playerId),
    getPlayerProgressionState(playerId),
  ]);

  const prep = await preparePlayerForCombat(playerId, {
    maxHp,
    preloaded: { equipmentStats: equipStats, progression },
  });

  const stats = buildPlayerCombatStats(
    currentHp,
    maxHp,
    { attackStyle: prep.attackSkill, skillLevel: prep.attackLevel, attributes: prep.progression.attributes },
    prep.equipmentStats,
  );
  applyGuildCombatModifiers(stats, prep.guildMods);

  // Include unlocked actions + template-referenced actions
  const unlockedSet = new Set(prep.unlockedActions);
  const filteredActions: Record<string, ActionDefinition> = {};
  for (const [id, def] of Object.entries(BASE_ACTION_DEFINITIONS)) {
    if (ALWAYS_AVAILABLE_ACTION_IDS.has(id) || unlockedSet.has(id)) {
      filteredActions[id] = applyEquipmentActionModifiers({
        action: def,
        modifiers: prep.equipmentStats.actionModifiers ?? [],
      });
    }
  }
  for (const slot of prep.playerTemplate) {
    for (const actionId of [slot.actionId, slot.thenActionId]) {
      if (actionId && !filteredActions[actionId] && BASE_ACTION_DEFINITIONS[actionId]) {
        filteredActions[actionId] = applyEquipmentActionModifiers({
          action: BASE_ACTION_DEFINITIONS[actionId]!,
          modifiers: prep.equipmentStats.actionModifiers ?? [],
        });
      }
    }
  }

  const availablePotions: CombatPotion[] = templateHasPotionActions(prep.playerTemplate)
    ? await buildPotionPool(playerId, maxHp)
    : [];

  const participant: RaidParticipant = {
    playerId,
    username,
    targetMobId: null,
    healTargetPlayerId: null,
    stats,
    template: prep.playerTemplate.map(s => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId ?? undefined,
      sortOrder: s.sortOrder,
    })),
    actionDefinitions: filteredActions,
    equipmentActionModifiers: prep.equipmentStats.actionModifiers ?? [],
    hp: currentHp,
    maxHp,
    stamina: prep.resources.stamina,
    maxStamina: prep.resources.maxStamina,
    staminaRegenPerRound: prep.resources.staminaRegenPerRound,
    mana: prep.resources.mana,
    maxMana: prep.resources.maxMana,
    manaRegenPerRound: prep.resources.manaRegenPerRound,
    templateRound: 1,
    activeEffects: [],
    availablePotions,
  };
  return { participant, attackSkill: prep.attackSkill, guildXpBoost: prep.guildMods.xpBoost };
}
