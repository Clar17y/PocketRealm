import { Prisma, prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import {
  COMBAT_CONSTANTS,
  makeEncounterMobId,
  type EncounterMobRole,
  type RaidRoundInput,
  type RaidParticipant,
  type RaidThreatEntry,
  type ExpeditionMobState,
  type ExpeditionRoundLog,
  type BossActiveEffect,
  type PotionConsumed,
  type QuestProgressUpdate,
  type RoomStrategyEntry,
  type EncounterMobSlot,
} from '@pocketrealm/shared';
import {
  resolveRaidRound,
  initThreatTable,
} from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { fetchFreshTemplateData, splitAndGrantXp } from './combatOrchestrationService';
import type { AttackSkill } from './combatStatsService';
import { assertCanAct, assertInZone } from '../utils/routeHelpers';
import { spendPlayerTurnsTx } from './turnBankService';
import { getHpState } from './hpService';
import { setAllResources } from './resourceService';
import { grantEncounterSiteChestRewardsTx } from './chestService';
import { getInventoryState } from './inventoryService';
import { deductConsumedPotions } from './potionService';
import {
  parseEncounterSiteMobs,
  serializeEncounterSiteMobs,
  countEncounterSiteState,
  getNextUnfinishedRoom,
  applyEncounterSiteDecayAndPersist,
  applyEncounterSiteDecayInMemory,
} from './combat/helpers';
import {
  toInitialMobSnapshot,
  advanceToFirstAliveRoom,
  handleDecayedSiteClearance,
  loadRoomMobsAsRaidState,
  handleEncounterDefeat,
  computeDefeatedMobXp,
  countDefeatedPromotedEncounterRoles,
  markEncounterRoomMobsDefeated,
  buildParticipantForEncounterSite,
  countEncounterSiteHits,
  storeEncounterChestOverflow,
  accumulateEncounterSiteXpContribution,
  accumulateEncounterSiteEffectTickXpContributions,
  createEncounterSiteXpContributions,
  rebuildEncounterSiteXpContributionsFromRoundLogs,
  type CombatSkillContribution,
  type EncounterSiteXpContributions,
  type FleeResult,
} from './encounterSiteCombatCore';
import { degradeEquippedDurabilityByHits } from './durabilityService';
import type { GrantXpResult } from './xpService';
import { trackEncounterSiteKillProgress } from './encounterSiteProgressService';

// ---------------------------------------------------------------------------
// Manual combat (Redis-backed state between start-room and round calls)
// ---------------------------------------------------------------------------

interface ManualCombatState {
  playerId: string;
  siteId: string;
  currentRoom: number;
  participant: RaidParticipant;
  mobs: ExpeditionMobState[];
  threatTable: RaidThreatEntry[];
  roundNumber: number;
  roundLogs: ExpeditionRoundLog[];
  allPotionsConsumed: PotionConsumed[];
  maxHp: number;
  turnCostCharged: number;
  totalRooms: number;
  mobFamilyId: string;
  createdAt: number;
  siteName: string;
  zoneId: string;
  zoneName: string;
  mobFamilyName: string;
  initialMobs: Array<{ mobId: string; slot: number; name: string; prefix: string | null; role: EncounterMobRole; hp: number; maxHp: number }>;
  mobXpByEncounterMobId: Record<string, number>;
  roomMobSlots: EncounterMobSlot[];
  attackSkill: AttackSkill;
  guildXpBoost: number;
  damageByScalingStat?: CombatSkillContribution;
  resourceCostByScalingStat?: CombatSkillContribution;
}

// Redis key prefix for manual combat sessions
const COMBAT_SESSION_PREFIX = 'encounter-combat:';
// TTL covers worst-case decay — 80h for 20 mobs at 0.25/hr, rounded to 3.5 days
const COMBAT_SESSION_TTL_SECONDS = 84 * 60 * 60;
const COMBAT_SESSION_UNAVAILABLE_MESSAGE = 'Combat session storage is unavailable. Try again shortly.';
const COMBAT_SESSION_UNAVAILABLE_CODE = 'COMBAT_SESSION_UNAVAILABLE';
const COMBAT_SESSION_OPERATION = Symbol('manualCombatSessionOperation');
type CombatSessionOperation = 'read' | 'write';

function combatSessionKey(playerId: string, siteId: string): string {
  return `${COMBAT_SESSION_PREFIX}${playerId}:${siteId}`;
}

type ManualCombatSessionStorageError = AppError & {
  [COMBAT_SESSION_OPERATION]: CombatSessionOperation;
};

function combatSessionUnavailableError(operation: CombatSessionOperation): AppError {
  const error = new AppError(503, COMBAT_SESSION_UNAVAILABLE_MESSAGE, COMBAT_SESSION_UNAVAILABLE_CODE);
  (error as ManualCombatSessionStorageError)[COMBAT_SESSION_OPERATION] = operation;
  return error;
}

export function isManualCombatSessionPersistenceError(err: unknown): boolean {
  return err instanceof AppError
    && err.code === COMBAT_SESSION_UNAVAILABLE_CODE
    && (err as Partial<ManualCombatSessionStorageError>)[COMBAT_SESSION_OPERATION] === 'write';
}

async function getCombatSession(playerId: string, siteId: string): Promise<ManualCombatState | null> {
  let data: string | null;
  try {
    data = await redis.get(combatSessionKey(playerId, siteId));
  } catch {
    throw combatSessionUnavailableError('read');
  }

  if (!data) return null;

  try {
    return JSON.parse(data) as ManualCombatState;
  } catch {
    return null;
  }
}

async function setCombatSession(playerId: string, siteId: string, state: ManualCombatState): Promise<void> {
  let data: string;
  try {
    data = JSON.stringify(state);
  } catch {
    throw new AppError(500, 'Manual combat session could not be serialized.', 'COMBAT_SESSION_SERIALIZATION_FAILED');
  }

  try {
    await redis.set(combatSessionKey(playerId, siteId), data, 'EX', COMBAT_SESSION_TTL_SECONDS);
  } catch {
    throw combatSessionUnavailableError('write');
  }
}

function ensureManualXpContributions(state: ManualCombatState): EncounterSiteXpContributions {
  if (!state.damageByScalingStat || !state.resourceCostByScalingStat) {
    const rebuilt = rebuildEncounterSiteXpContributionsFromRoundLogs(
      state.roundLogs,
      state.participant.actionDefinitions,
      state.attackSkill,
    );
    state.damageByScalingStat = rebuilt.damageByScalingStat;
    state.resourceCostByScalingStat = rebuilt.resourceCostByScalingStat;
  }

  return {
    damageByScalingStat: state.damageByScalingStat,
    resourceCostByScalingStat: state.resourceCostByScalingStat,
  };
}

export async function deleteCombatSession(playerId: string, siteId: string): Promise<void> {
  try {
    await redis.del(combatSessionKey(playerId, siteId));
  } catch {
    // Best-effort
  }
}

async function hasCombatSession(playerId: string, siteId: string): Promise<boolean> {
  try {
    return (await redis.exists(combatSessionKey(playerId, siteId))) === 1;
  } catch {
    return false;
  }
}

/** Clear any combat session for this player+site (used by abandon). */
export async function clearManualCombatSession(playerId: string, siteId: string): Promise<void> {
  await deleteCombatSession(playerId, siteId);
}

export interface StartManualRoomResult {
  currentRoom: number;
  totalRooms: number;
  mobs: Array<{
    mobId: string;
    name: string;
    prefix: string | null;
    role: EncounterMobRole;
    hp: number;
    maxHp: number;
  }>;
  playerHp: number;
  playerMaxHp: number;
  playerStamina: number;
  playerMaxStamina: number;
  playerMana: number;
  playerMaxMana: number;
  /** Number of rounds already resolved (0 = fresh start, >0 = resuming) */
  roundNumber: number;
  roundLogs: ExpeditionRoundLog[];
  /** True when all remaining rooms had decayed mobs — site was auto-cleared. */
  siteAutoCleared?: boolean;
  /** Chest rewards granted on auto-clear. */
  completionRewards?: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null;
  pendingLootSessionId?: string | null;
}

/**
 * Start manual combat for the current room of an encounter site.
 * Loads site state, builds player + mobs, stores in-memory state.
 */
export async function startManualEncounterRoom(
  playerId: string,
  siteId: string,
  username: string,
): Promise<StartManualRoomResult> {
  // If an active session exists for this player+site, resume it instead of creating a new one
  const existingState = await getCombatSession(playerId, siteId);
  if (existingState) {
    return {
      currentRoom: existingState.currentRoom,
      totalRooms: existingState.totalRooms,
      mobs: existingState.mobs.map(m => ({
        mobId: m.id,
        name: m.name,
        prefix: m.prefix,
        role: m.role ?? 'trash',
        hp: m.hp,
        maxHp: m.maxHp,
      })),
      playerHp: existingState.participant.hp,
      playerMaxHp: existingState.participant.maxHp,
      playerStamina: existingState.participant.stamina,
      playerMaxStamina: existingState.participant.maxStamina,
      playerMana: existingState.participant.mana,
      playerMaxMana: existingState.participant.maxMana,
      roundNumber: existingState.roundNumber,
      roundLogs: existingState.roundLogs ?? [],
    };
  }

  const site = await prisma.encounterSite.findFirst({
    where: { id: siteId, playerId },
    include: {
      zone: { select: { name: true } },
      mobFamily: { select: { name: true } },
    },
  });
  if (!site) throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');

  const hpState = await assertCanAct(playerId);
  if (hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
  }
  await assertInZone(playerId, site.zoneId);

  const decayed = await applyEncounterSiteDecayAndPersist({
    id: site.id,
    playerId: site.playerId,
    discoveredAt: site.discoveredAt,
    mobs: site.mobs,
  }, new Date());
  if (!decayed) throw new AppError(410, 'Encounter site has decayed', 'SITE_DECAYED');

  // Advance to first room with alive mobs (decay may have wiped the current room)
  const totalRoomsForAdvance = site.totalRooms || new Set(decayed.mobs.map(m => m.room)).size || 1;
  const advanceResult = await advanceToFirstAliveRoom(
    { id: site.id, currentRoom: site.currentRoom ?? 1 },
    decayed.mobs,
    totalRoomsForAdvance,
  );

  // All remaining rooms decayed — auto-clear site with chest reward
  if (!advanceResult) {
    const { completionRewards, pendingLootSessionId } = await handleDecayedSiteClearance(playerId, siteId, site);
    return {
      currentRoom: site.currentRoom ?? 1,
      totalRooms: site.totalRooms ?? 1,
      mobs: [],
      playerHp: hpState.currentHp,
      playerMaxHp: hpState.maxHp,
      playerStamina: 0,
      playerMaxStamina: 0,
      playerMana: 0,
      playerMaxMana: 0,
      roundNumber: 0,
      roundLogs: [],
      siteAutoCleared: true,
      completionRewards,
      pendingLootSessionId,
    };
  }

  const { currentRoom, roomMobs } = advanceResult;

  // Load mob templates, apply zone modifiers, build ExpeditionMobState[]
  const { mobs: expeditionMobs, mobXpByEncounterMobId } = await loadRoomMobsAsRaidState(
    roomMobs,
    site.zoneId,
    site.mobFamilyId,
    site.mobFamily.name,
  );
  if (expeditionMobs.length === 0) {
    throw new AppError(410, 'No valid mobs in encounter room', 'SITE_DECAYED');
  }

  const { participant, attackSkill, guildXpBoost } = await buildParticipantForEncounterSite(
    playerId,
    username,
    hpState.currentHp,
    hpState.maxHp,
  );

  const turnCostCharged = roomMobs.length * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST;

  await setCombatSession(playerId, siteId, {
    playerId,
    siteId,
    currentRoom,
    participant,
    mobs: expeditionMobs,
    threatTable: initThreatTable([playerId]),
    roundNumber: 0,
    roundLogs: [],
    allPotionsConsumed: [],
    maxHp: hpState.maxHp,
    turnCostCharged,
    totalRooms: site.totalRooms ?? 1,
    mobFamilyId: site.mobFamilyId,
    createdAt: Date.now(),
    siteName: site.name,
    zoneId: site.zoneId,
    zoneName: site.zone.name,
    mobFamilyName: site.mobFamily.name,
    initialMobs: toInitialMobSnapshot(expeditionMobs),
    mobXpByEncounterMobId,
    roomMobSlots: roomMobs,
    attackSkill,
    guildXpBoost,
    ...createEncounterSiteXpContributions(),
  });

  return {
    currentRoom,
    totalRooms: site.totalRooms ?? 1,
    mobs: expeditionMobs.map(m => ({
      mobId: m.id,
      name: m.name,
      prefix: m.prefix,
      role: m.role ?? 'trash',
      hp: m.hp,
      maxHp: m.maxHp,
    })),
    playerHp: participant.hp,
    playerMaxHp: participant.maxHp,
    playerStamina: participant.stamina,
    playerMaxStamina: participant.maxStamina,
    playerMana: participant.mana,
    playerMaxMana: participant.maxMana,
    roundNumber: 0,
    roundLogs: [],
  };
}

export interface ManualRoundResult {
  roundNumber: number;
  roundLog: ExpeditionRoundLog;
  playerHpAfter: number;
  playerMaxHp: number;
  playerStaminaAfter: number;
  playerMaxStamina: number;
  playerManaAfter: number;
  playerMaxMana: number;
  mobs: Array<{ mobId: string; alive: boolean; hpRemaining: number; maxHp: number; role: EncounterMobRole; activeEffects: BossActiveEffect[] }>;
  outcome: 'ongoing' | 'cleared' | 'defeated' | 'site_cleared';
  siteCleared: boolean;
  completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null;
  pendingLootSessionId: string | null;
  fleeResult: FleeResult | null;
  respawnedTo: { townId: string; townName: string } | null;
  xpGrants: GrantXpResult[];
  questProgress: QuestProgressUpdate[];
  durabilityDamagedItemIds: string[];
}

/**
 * Resolve one round of manual encounter site combat.
 * Persists to DB when the room is cleared or player is defeated.
 */
export async function resolveManualEncounterRound(
  playerId: string,
  siteId: string,
  body: { action?: string; targetMobSlot?: number },
): Promise<ManualRoundResult> {
  const state = await getCombatSession(playerId, siteId);
  if (!state) {
    // Session expired or server restarted — clear stale lockout
    await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: null } }).catch(() => {});
    throw new AppError(400, 'No active manual combat session. Call start-room first.', 'NO_COMBAT_SESSION');
  }

  // Refresh template from DB so mid-combat template switches take effect
  const fresh = await fetchFreshTemplateData(playerId, state.participant.maxHp);
  state.participant.template = fresh.playerTemplate.map(s => ({
    actionId: s.actionId,
    condition: s.condition,
    thenActionId: s.thenActionId ?? undefined,
    sortOrder: s.sortOrder,
  }));
  state.participant.actionDefinitions = fresh.actionDefinitions;

  // Apply player's target selection
  state.participant.targetMobId = body.targetMobSlot !== undefined
    ? makeEncounterMobId(body.targetMobSlot)
    : null;

  state.roundNumber++;
  const aliveMobs = state.mobs.filter(m => m.hp > 0);

  const input: RaidRoundInput = {
    mobs: aliveMobs,
    participants: [state.participant],
    threatTable: state.threatTable,
    roundNumber: state.roundNumber,
    splashCascade: true,
  };

  const result = resolveRaidRound(input, undefined, 'pve_open_world');
  const xpContributions = ensureManualXpContributions(state);
  accumulateEncounterSiteXpContribution(
    xpContributions,
    result.participantResults[0],
    state.participant.actionDefinitions,
    state.attackSkill,
  );
  accumulateEncounterSiteEffectTickXpContributions(
    xpContributions,
    result.roundLog.phases.effectTicks,
  );

  // Carry forward participant state
  const pr = result.participantResults[0];
  if (pr) {
    state.participant = {
      ...state.participant,
      hp: pr.hpAfter,
      stamina: pr.staminaAfter,
      mana: pr.manaAfter,
      templateRound: pr.templateRoundAfter,
      activeEffects: pr.activeEffectsAfter as typeof state.participant.activeEffects,
    };
    for (const consumed of pr.potionsConsumed) {
      const idx = state.participant.availablePotions.findIndex(p => p.templateId === consumed.templateId);
      if (idx >= 0) state.participant.availablePotions.splice(idx, 1);
      state.allPotionsConsumed.push(consumed);
    }
  }

  state.mobs = result.mobsAfter;
  state.threatTable = result.threatTableAfter;
  state.roundLogs.push(result.roundLog);

  const finalAliveMobs = state.mobs.filter(m => m.hp > 0);
  const roomCleared = finalAliveMobs.length === 0;
  const playerDefeated = state.participant.hp <= 0;

  const mobsSnapshot = state.mobs.map(m => ({
    mobId: m.id,
    alive: m.hp > 0,
    hpRemaining: m.hp,
    maxHp: m.maxHp,
    role: m.role ?? 'trash',
    activeEffects: m.activeEffects,
  }));

  // If combat is still ongoing, save state back to Redis and return
  if (!roomCleared && !playerDefeated) {
    await setCombatSession(playerId, siteId, state);
    return {
      roundNumber: state.roundNumber,
      roundLog: result.roundLog,
      playerHpAfter: state.participant.hp,
      playerMaxHp: state.maxHp,
      playerStaminaAfter: state.participant.stamina,
      playerMaxStamina: state.participant.maxStamina,
      playerManaAfter: state.participant.mana,
      playerMaxMana: state.participant.maxMana,
      mobs: mobsSnapshot,
      outcome: 'ongoing',
      siteCleared: false,
      completionRewards: null,
      pendingLootSessionId: null,
      fleeResult: null,
      respawnedTo: null,
      xpGrants: [],
      questProgress: [],
      durabilityDamagedItemIds: [],
    };
  }

  // Room resolved — remove session from Redis and persist to DB
  await deleteCombatSession(playerId, siteId);

  const { availableSlots: chestAvailableSlots } = await getInventoryState(playerId);

  const txResult = await prisma.$transaction(async (tx) => {
    const freshSite = await tx.encounterSite.findFirst({
      where: { id: siteId, playerId },
      select: {
        id: true, playerId: true, mobFamilyId: true, size: true,
        discoveredAt: true, mobs: true, currentRoom: true, totalRooms: true,
        roomStrategy: true,
      },
    });
    if (!freshSite) {
      throw new AppError(409, 'Encounter site is no longer available', 'ENCOUNTER_SITE_UNAVAILABLE');
    }

    const freshDecayed = applyEncounterSiteDecayInMemory(
      parseEncounterSiteMobs(freshSite.mobs),
      freshSite.discoveredAt,
      new Date(),
    );
    const mobs = freshDecayed.mobs.map(m => ({ ...m }));

    // Spend turns
    const spent = await spendPlayerTurnsTx(tx, playerId, state.turnCostCharged);

    const newlyDefeatedMobs = roomCleared
      ? markEncounterRoomMobsDefeated(
          mobs,
          state.currentRoom,
          state.roomMobSlots.map(slot => slot.slot),
        )
      : [];

    const roomResolvedWithNewKills = roomCleared && newlyDefeatedMobs.length > 0;
    const xpAwarded = roomResolvedWithNewKills
      ? computeDefeatedMobXp(
          new Set(newlyDefeatedMobs.map(s => makeEncounterMobId(s.slot))),
          newlyDefeatedMobs,
          state.mobXpByEncounterMobId,
        )
      : 0;

    const overallCounts = countEncounterSiteState(mobs);
    let siteCleared = false;
    let newCurrentRoom = freshSite.currentRoom ?? state.currentRoom;
    let completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null = null;

    if (roomResolvedWithNewKills) {
      if (overallCounts.alive <= 0) {
        siteCleared = true;
      } else {
        const nextRoom = getNextUnfinishedRoom(mobs, state.currentRoom + 1);
        if (nextRoom) newCurrentRoom = nextRoom;
        else siteCleared = true;
      }
    }

    // Record this room in roomStrategy as manual
    const existingStrategy = (Array.isArray(freshSite.roomStrategy) ? freshSite.roomStrategy : []) as unknown as RoomStrategyEntry[];
    const updatedStrategy: RoomStrategyEntry[] = roomResolvedWithNewKills
      ? [...existingStrategy, { room: state.currentRoom, mode: 'manual', bonusEligible: false }]
      : existingStrategy;

    if (siteCleared) {
      const totalRoomsCount = freshSite.totalRooms ?? 1;
      const autoResolvedCount = updatedStrategy.filter(e => e.mode === 'auto').length;
      completionRewards = await grantEncounterSiteChestRewardsTx(tx, {
        playerId,
        mobFamilyId: freshSite.mobFamilyId,
        totalRooms: totalRoomsCount,
        autoResolvedBonusRooms: autoResolvedCount,
        defeatedPromotedRoleCounts: countDefeatedPromotedEncounterRoles(mobs),
        availableSlots: chestAvailableSlots,
      });
      await tx.encounterSite.deleteMany({ where: { id: siteId, playerId } });
    } else {
      await tx.encounterSite.update({
        where: { id: siteId },
        data: {
          mobs: serializeEncounterSiteMobs(mobs),
          currentRoom: newCurrentRoom,
          ...(roomResolvedWithNewKills ? { roomStrategy: updatedStrategy as unknown as Prisma.InputJsonValue } : {}),
        },
      });
    }

    const potionDeductResult = await deductConsumedPotions(playerId, state.allPotionsConsumed, tx);

    // state.roundLogs already includes this round (pushed above)
    const allRounds = state.roundLogs;

    // Log room combat to activity history
    await tx.activityLog.create({
      data: {
        playerId,
        activityType: 'combat',
        turnsSpent: state.turnCostCharged,
        result: {
          source: 'encounter_site_room',
          siteId: state.siteId,
          siteName: state.siteName ?? 'Unknown Site',
          mobFamilyName: state.mobFamilyName ?? 'Unknown',
          mobFamilyId: state.mobFamilyId,
          zoneId: state.zoneId ?? '',
          zoneName: state.zoneName ?? 'Unknown Zone',
          room: state.currentRoom,
          totalRooms: state.totalRooms,
          outcome: roomCleared ? 'cleared' : 'defeated',
          mode: 'manual',
          roundsResolved: state.roundNumber,
          rounds: allRounds,
          initialMobs: state.initialMobs ?? [],
          siteCleared,
          chestReward: completionRewards,
          rewards: { xp: xpAwarded },
        } as unknown as Prisma.InputJsonObject,
      },
    });

    return {
      turnSpend: spent,
      completionRewards,
      potionDeductResult,
      siteCleared,
      newCurrentRoom,
      xpAwarded,
      newlyDefeatedMobs,
    };
  });

  // Update player HP/resources
  await setAllResources(
    playerId,
    state.participant.hp,
    state.participant.stamina,
    state.participant.mana,
  );

  // Degrade equipment durability from all rounds of manual encounter combat
  const { playerHitsLanded, mobHitsLanded } = countEncounterSiteHits(state.roundLogs);
  const durabilityLost = await degradeEquippedDurabilityByHits(playerId, playerHitsLanded, mobHitsLanded);
  const durabilityDamagedItemIds = durabilityLost.map(d => d.itemId);
  const pendingLootSessionId = await storeEncounterChestOverflow(playerId, txResult.completionRewards);

  // Grant XP for defeated mobs (only on room clear, not on defeat)
  let xpGrants: GrantXpResult[] = [];
  let questProgress: QuestProgressUpdate[] = [];
  if (roomCleared) {
    const totalXp = txResult.xpAwarded;
    if (totalXp > 0) {
      xpGrants = await splitAndGrantXp(
        playerId,
        totalXp,
        state.attackSkill,
        xpContributions.damageByScalingStat,
        xpContributions.resourceCostByScalingStat,
        state.guildXpBoost,
      );
    }
    questProgress = await trackEncounterSiteKillProgress(playerId, txResult.newlyDefeatedMobs);
  }

  // Handle defeat
  let fleeResult: FleeResult | null = null;
  let respawnedTo: { townId: string; townName: string } | null = null;

  if (playerDefeated) {
    const hpState = await getHpState(playerId);
    ({ fleeResult, respawnedTo } = await handleEncounterDefeat(playerId, hpState.maxHp));
  }

  const outcome: ManualRoundResult['outcome'] = txResult.siteCleared
    ? 'site_cleared'
    : playerDefeated
    ? 'defeated'
    : 'cleared';

  return {
    roundNumber: state.roundNumber,
    roundLog: result.roundLog,
    playerHpAfter: state.participant.hp,
    playerMaxHp: state.maxHp,
    playerStaminaAfter: state.participant.stamina,
    playerMaxStamina: state.participant.maxStamina,
    playerManaAfter: state.participant.mana,
    playerMaxMana: state.participant.maxMana,
    mobs: mobsSnapshot,
    outcome,
    siteCleared: txResult.siteCleared,
    completionRewards: txResult.completionRewards,
    pendingLootSessionId,
    fleeResult,
    respawnedTo,
    xpGrants,
    questProgress,
    durabilityDamagedItemIds,
  };
}
