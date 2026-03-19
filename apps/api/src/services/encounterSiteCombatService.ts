import { Prisma, prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import {
  ENCOUNTER_SITE_CONSTANTS,
  COMBAT_CONSTANTS,
  BASE_ACTION_DEFINITIONS,
  ALWAYS_AVAILABLE_ACTION_IDS,
  makeEncounterMobId,
  parseEncounterMobSlot,
  type RaidRoundInput,
  type RaidParticipant,
  type RaidThreatEntry,
  type ExpeditionMobState,
  type ExpeditionRoundLog,
  type BossActiveEffect,
  type ActionDefinition,
  type CombatPotion,
  type PotionConsumed,
  type RoomStrategyEntry,
  type EncounterMobSlot,
} from '@pocketrealm/shared';
import {
  resolveRaidRound,
  buildEncounterRaidMob,
  applyCrowdedDebuff,
  buildPlayerCombatStats,
  initThreatTable,
} from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { preparePlayerForCombat, applyGuildCombatModifiers } from './combatOrchestrationService';
import { handleCombatDefeat, assertCanAct, assertInZone } from '../utils/routeHelpers';
import { spendPlayerTurnsTx } from './turnBankService';
import { getHpState } from './hpService';
import { setAllResources } from './resourceService';
import { grantEncounterSiteChestRewardsTx } from './chestService';
import { getInventoryState } from './inventoryService';
import { deductConsumedPotions } from './potionService';
import { templateHasPotionActions, buildPotionPool } from './potionService';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import {
  computeZoneModifiers,
  getActiveEventsForZone,
  getActiveWorldWideEvents,
} from './worldEventService';
import {
  parseEncounterSiteMobs,
  serializeEncounterSiteMobs,
  countEncounterSiteState,
  getAllAliveMobsInRoom,
  getNextUnfinishedRoom,
  applyEncounterSiteDecayAndPersist,
  applyEncounterSiteDecayInMemory,
} from '../routes/combat/helpers';

// Re-export for route handler convenience
export { parseEncounterMobSlot, makeEncounterMobId };

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

export interface EncounterRoomCombatResult {
  outcome: 'cleared' | 'defeated';
  roundsResolved: number;
  rounds: RoundSnapshot[];
  playerHpAfter: number;
  playerStaminaAfter: number;
  playerManaAfter: number;
  mobResults: { mobId: string; alive: boolean; hpRemaining: number }[];
  potionsConsumed: PotionConsumed[];
}

export interface AutoResolveEncounterResult {
  outcome: 'cleared' | 'defeated' | 'site_cleared';
  roundsResolved: number;
  rounds: RoundSnapshot[];
  initialMobs: Array<{ mobId: string; slot: number; name: string; prefix: string | null; hp: number; maxHp: number }>;
  playerHpAfter: number;
  playerStaminaAfter: number;
  playerManaAfter: number;
  potionsConsumed: PotionConsumed[];
  currentRoom: number;
  totalRooms: number;
  siteCleared: boolean;
  completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null;
  fleeResult: {
    outcome: string;
    remainingHp: number;
    goldLost: number;
    isRecovering: boolean;
    recoveryCost: number | null;
  } | null;
  respawnedTo: { townId: string; townName: string } | null;
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
  let roundsResolved = 0;

  for (let round = 1; round <= maxRounds; round++) {
    if (aliveMobList.length === 0) break; // cleared
    if (currentParticipant.hp <= 0) break; // defeated

    roundsResolved = round;

    // Apply crowded debuff to mob stats (copies, don't mutate originals)
    const aliveMobCount = aliveMobList.length;
    const debuffedMobs = aliveMobList.map(m => ({
      ...m,
      stats: applyCrowdedDebuff(m.stats, aliveMobCount),
    }));

    const input: RaidRoundInput = {
      mobs: debuffedMobs,
      participants: [currentParticipant],
      threatTable,
      roundNumber: round,
      splashCascade: true,
    };

    const result = resolveRaidRound(input, undefined, 'pve_open_world');

    // Carry forward participant state
    const pr = result.participantResults[0];
    if (pr) {
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

// ---------------------------------------------------------------------------
// Shared private helpers
// ---------------------------------------------------------------------------

/**
 * Advance to the first room with alive mobs after decay.
 * If the current room is already populated, returns it immediately.
 * Otherwise scans forward and persists the new currentRoom to the DB.
 */
async function advanceToFirstAliveRoom(
  site: { id: string; currentRoom: number },
  decayedMobs: EncounterMobSlot[],
  totalRooms: number,
): Promise<{ currentRoom: number; roomMobs: EncounterMobSlot[] }> {
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
  throw new AppError(410, 'No alive mobs in encounter site', 'SITE_DECAYED');
}

/**
 * Load mob templates for a set of encounter mob slots, apply zone event
 * modifiers, and convert them to ExpeditionMobState[] via buildEncounterRaidMob.
 */
async function loadRoomMobsAsRaidState(
  roomMobs: EncounterMobSlot[],
  zoneId: string,
  mobFamilyId: string,
): Promise<ExpeditionMobState[]> {
  const mobTemplateIds = [...new Set(roomMobs.map(m => m.mobTemplateId))];
  const mobTemplateRows = await prisma.mobTemplate.findMany({
    where: { id: { in: mobTemplateIds } },
    select: {
      id: true, name: true, hp: true, accuracy: true, defence: true,
      magicDefence: true, evasion: true, damageMin: true, damageMax: true,
      damageType: true,
    },
  });
  const mobTemplateById = new Map(mobTemplateRows.map(t => [t.id, t]));

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
  return expeditionMobs;
}

/**
 * Handle player defeat: fetch progression, call handleCombatDefeat, and
 * reshape the result into the flat fleeResult/respawnedTo structure used
 * by both auto-resolve and manual combat responses.
 */
async function handleEncounterDefeat(
  playerId: string,
  maxHp: number,
): Promise<{
  fleeResult: AutoResolveEncounterResult['fleeResult'];
  respawnedTo: { townId: string; townName: string } | null;
}> {
  const progression = await getPlayerProgressionState(playerId);
  const defeatResult = await handleCombatDefeat(playerId, {
    evasionLevel: progression.attributes.evasion,
    mobLevel: 1, // encounter site mobs don't have a single level; use 1 as fallback
    maxHp,
  });
  const fleeResult: AutoResolveEncounterResult['fleeResult'] = defeatResult.fleeResult
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

// ---------------------------------------------------------------------------
// Build RaidParticipant from player data (mirrors buildRaidParticipant in expeditionService)
// ---------------------------------------------------------------------------

async function buildParticipantForEncounterSite(
  playerId: string,
  username: string,
  currentHp: number,
  maxHp: number,
): Promise<RaidParticipant> {
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
      filteredActions[id] = def;
    }
  }
  for (const slot of prep.playerTemplate) {
    for (const actionId of [slot.actionId, slot.thenActionId]) {
      if (actionId && !filteredActions[actionId] && BASE_ACTION_DEFINITIONS[actionId]) {
        filteredActions[actionId] = BASE_ACTION_DEFINITIONS[actionId]!;
      }
    }
  }

  const availablePotions: CombatPotion[] = templateHasPotionActions(prep.playerTemplate)
    ? await buildPotionPool(playerId, maxHp)
    : [];

  return {
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
}

// ---------------------------------------------------------------------------
// Auto-resolve: full encounter room with DB persistence
// ---------------------------------------------------------------------------

/**
 * Auto-resolve the current room of an encounter site.
 * Loads site state, runs combat in memory, persists results in a DB transaction.
 */
export async function autoResolveEncounterRoom(
  playerId: string,
  siteId: string,
  username: string,
): Promise<AutoResolveEncounterResult> {
  // If a manual session exists, reject auto-resolve — player must continue manually or abandon
  if (await hasCombatSession(playerId, siteId)) {
    throw new AppError(409, 'Manual combat session in progress. Continue fighting or abandon the site.', 'MANUAL_SESSION_ACTIVE');
  }

  // Load site and verify ownership
  const site = await prisma.encounterSite.findFirst({
    where: { id: siteId, playerId },
    include: { mobFamily: { select: { name: true } } },
  });
  if (!site) throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');

  // Assert player can act and is in zone
  const hpState = await assertCanAct(playerId);
  if (hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
  }
  await assertInZone(playerId, site.zoneId);

  // Apply decay
  const decayed = await applyEncounterSiteDecayAndPersist({
    id: site.id,
    playerId: site.playerId,
    discoveredAt: site.discoveredAt,
    mobs: site.mobs,
  }, new Date());
  if (!decayed) throw new AppError(410, 'Encounter site has decayed', 'SITE_DECAYED');

  // Advance to first room with alive mobs (decay may have wiped the current room)
  const totalRoomsForAdvance = site.totalRooms || new Set(decayed.mobs.map(m => m.room)).size || 1;
  const { currentRoom, roomMobs } = await advanceToFirstAliveRoom(
    { id: site.id, currentRoom: site.currentRoom ?? 1 },
    decayed.mobs,
    totalRoomsForAdvance,
  );

  // Load mob templates, apply zone modifiers, build ExpeditionMobState[]
  const expeditionMobs = await loadRoomMobsAsRaidState(roomMobs, site.zoneId, site.mobFamilyId);
  if (expeditionMobs.length === 0) {
    throw new AppError(410, 'No valid mobs in encounter room', 'SITE_DECAYED');
  }

  // Charge turn cost BEFORE combat (N mobs * turn cost per mob)
  const totalTurnCost = roomMobs.length * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST;

  // Build player as RaidParticipant
  const participant = await buildParticipantForEncounterSite(
    playerId,
    username,
    hpState.currentHp,
    hpState.maxHp,
  );

  // Run combat loop in memory
  const combatResult = resolveEncounterRoomCombat(participant, expeditionMobs);

  // Determine which slots were cleared
  const clearedSlotsByMobId = new Map<string, number>(); // mobId -> slot
  for (const slot of roomMobs) {
    const mobId = makeEncounterMobId(slot.slot);
    clearedSlotsByMobId.set(mobId, slot.slot);
  }

  const defeatedMobIds = new Set(
    combatResult.mobResults
      .filter(mr => !mr.alive)
      .map(mr => mr.mobId),
  );

  // Inventory state for chest capacity
  const { availableSlots: chestAvailableSlots } = await getInventoryState(playerId);

  // Persist in a DB transaction
  const txResult = await prisma.$transaction(async (tx) => {
    // Re-fetch site and validate it still exists
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

    // Apply decay in-memory to get fresh mob state
    const freshDecayed = applyEncounterSiteDecayInMemory(
      parseEncounterSiteMobs(freshSite.mobs),
      freshSite.discoveredAt,
      new Date(),
    );
    const mobs = freshDecayed.mobs.map(m => ({ ...m }));

    // Spend turns
    const spent = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

    // Mark defeated mobs in the JSON state
    for (const [mobId] of defeatedMobIds.entries()) {
      const slot = clearedSlotsByMobId.get(mobId);
      if (slot !== undefined) {
        const target = mobs.find(m => m.slot === slot && (m.room ?? 1) === currentRoom);
        if (target && target.status === 'alive') target.status = 'defeated';
      }
    }

    // Room/site clearing logic
    const overallCounts = countEncounterSiteState(mobs);
    let siteCleared = false;
    let newCurrentRoom = currentRoom;
    let completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null = null;

    if (combatResult.outcome === 'cleared') {
      // Room cleared — check if site is done
      if (overallCounts.alive <= 0) {
        siteCleared = true;
      } else {
        const nextRoom = getNextUnfinishedRoom(mobs, currentRoom + 1);
        if (nextRoom) {
          newCurrentRoom = nextRoom;
        } else {
          siteCleared = true;
        }
      }
    }

    // Record this room in roomStrategy
    const existingStrategy = (Array.isArray(freshSite.roomStrategy) ? freshSite.roomStrategy : []) as unknown as RoomStrategyEntry[];
    const updatedStrategy: RoomStrategyEntry[] = [
      ...existingStrategy,
      { room: currentRoom, mode: 'auto', bonusEligible: true },
    ];

    if (siteCleared) {
      const totalRoomsCount = freshSite.totalRooms ?? 1;
      const autoResolvedCount = updatedStrategy.filter(e => e.mode === 'auto').length;
      completionRewards = await grantEncounterSiteChestRewardsTx(tx, {
        playerId,
        mobFamilyId: freshSite.mobFamilyId,
        totalRooms: totalRoomsCount,
        autoResolvedBonusRooms: autoResolvedCount,
        availableSlots: chestAvailableSlots,
      });
      await tx.encounterSite.deleteMany({ where: { id: siteId, playerId } });
    } else {
      await tx.encounterSite.update({
        where: { id: siteId },
        data: {
          mobs: serializeEncounterSiteMobs(mobs),
          currentRoom: newCurrentRoom,
          roomStrategy: updatedStrategy as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Deduct consumed potions
    const potionDeductResult = await deductConsumedPotions(playerId, combatResult.potionsConsumed, tx);

    return { turnSpend: spent, completionRewards, potionDeductResult, siteCleared, newCurrentRoom };
  });

  // Update player HP/resources after combat
  await setAllResources(
    playerId,
    combatResult.playerHpAfter,
    combatResult.playerStaminaAfter,
    combatResult.playerManaAfter,
  );

  // Handle defeat
  let fleeResult: AutoResolveEncounterResult['fleeResult'] = null;
  let respawnedTo: { townId: string; townName: string } | null = null;

  if (combatResult.outcome === 'defeated') {
    ({ fleeResult, respawnedTo } = await handleEncounterDefeat(playerId, hpState.maxHp));
  }

  const finalOutcome: AutoResolveEncounterResult['outcome'] = txResult.siteCleared
    ? 'site_cleared'
    : combatResult.outcome;

  return {
    outcome: finalOutcome,
    roundsResolved: combatResult.roundsResolved,
    rounds: combatResult.rounds,
    initialMobs: expeditionMobs.map(m => ({
      mobId: m.id, slot: parseEncounterMobSlot(m.id) ?? 0, name: m.name, prefix: m.prefix, hp: m.hp, maxHp: m.maxHp,
    })),
    playerHpAfter: combatResult.playerHpAfter,
    playerStaminaAfter: combatResult.playerStaminaAfter,
    playerManaAfter: combatResult.playerManaAfter,
    potionsConsumed: combatResult.potionsConsumed,
    currentRoom: txResult.newCurrentRoom,
    totalRooms: site.totalRooms ?? 1,
    siteCleared: txResult.siteCleared,
    completionRewards: txResult.completionRewards,
    fleeResult,
    respawnedTo,
  };
}

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
}

// Redis key prefix for manual combat sessions
const COMBAT_SESSION_PREFIX = 'encounter-combat:';
// TTL covers worst-case decay — 80h for 20 mobs at 0.25/hr, rounded to 3.5 days
const COMBAT_SESSION_TTL_SECONDS = 84 * 60 * 60;

function combatSessionKey(playerId: string, siteId: string): string {
  return `${COMBAT_SESSION_PREFIX}${playerId}:${siteId}`;
}

async function getCombatSession(playerId: string, siteId: string): Promise<ManualCombatState | null> {
  try {
    const data = await redis.get(combatSessionKey(playerId, siteId));
    if (!data) return null;
    return JSON.parse(data) as ManualCombatState;
  } catch {
    return null;
  }
}

async function setCombatSession(playerId: string, siteId: string, state: ManualCombatState): Promise<void> {
  try {
    await redis.set(combatSessionKey(playerId, siteId), JSON.stringify(state), 'EX', COMBAT_SESSION_TTL_SECONDS);
  } catch {
    // Best-effort — fall through, combat will fail on next round if Redis is down
  }
}

async function deleteCombatSession(playerId: string, siteId: string): Promise<void> {
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
      roundLogs: (existingState as { roundLogs?: ExpeditionRoundLog[] }).roundLogs ?? [],
    };
  }

  const site = await prisma.encounterSite.findFirst({
    where: { id: siteId, playerId },
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
  const { currentRoom, roomMobs } = await advanceToFirstAliveRoom(
    { id: site.id, currentRoom: site.currentRoom ?? 1 },
    decayed.mobs,
    totalRoomsForAdvance,
  );

  // Load mob templates, apply zone modifiers, build ExpeditionMobState[]
  const expeditionMobs = await loadRoomMobsAsRaidState(roomMobs, site.zoneId, site.mobFamilyId);
  if (expeditionMobs.length === 0) {
    throw new AppError(410, 'No valid mobs in encounter room', 'SITE_DECAYED');
  }

  const participant = await buildParticipantForEncounterSite(
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
  });

  return {
    currentRoom,
    totalRooms: site.totalRooms ?? 1,
    mobs: expeditionMobs.map(m => ({
      mobId: m.id,
      name: m.name,
      prefix: m.prefix,
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
  mobs: Array<{ mobId: string; alive: boolean; hpRemaining: number; maxHp: number; activeEffects: BossActiveEffect[] }>;
  outcome: 'ongoing' | 'cleared' | 'defeated' | 'site_cleared';
  siteCleared: boolean;
  completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null;
  fleeResult: AutoResolveEncounterResult['fleeResult'];
  respawnedTo: { townId: string; townName: string } | null;
}

/**
 * Resolve one round of manual encounter site combat.
 * Persists to DB when the room is cleared or player is defeated.
 */
export async function resolveManualEncounterRound(
  playerId: string,
  siteId: string,
  _body: { action?: string; targetMobSlot?: number },
): Promise<ManualRoundResult> {
  const state = await getCombatSession(playerId, siteId);
  if (!state) {
    // Session expired or server restarted — clear stale lockout
    await prisma.player.update({ where: { id: playerId }, data: { activeEncounterSiteId: null } }).catch(() => {});
    throw new AppError(400, 'No active manual combat session. Call start-room first.', 'NO_COMBAT_SESSION');
  }

  state.roundNumber++;
  const aliveMobs = state.mobs.filter(m => m.hp > 0);

  // Apply crowded debuff
  const aliveMobCount = aliveMobs.length;
  const debuffedMobs = aliveMobs.map(m => ({
    ...m,
    stats: applyCrowdedDebuff(m.stats, aliveMobCount),
  }));

  const input: RaidRoundInput = {
    mobs: debuffedMobs,
    participants: [state.participant],
    threatTable: state.threatTable,
    roundNumber: state.roundNumber,
    splashCascade: true,
  };

  const result = resolveRaidRound(input, undefined, 'pve_open_world');

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
      fleeResult: null,
      respawnedTo: null,
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

    // Mark defeated mobs
    if (roomCleared) {
      for (const mob of state.mobs) {
        const slot = parseEncounterMobSlot(mob.id);
        if (slot === null) continue;
        const target = mobs.find(m => m.slot === slot && (m.room ?? 1) === state.currentRoom);
        if (target && target.status === 'alive') target.status = 'defeated';
      }
    }

    const overallCounts = countEncounterSiteState(mobs);
    let siteCleared = false;
    let newCurrentRoom = state.currentRoom;
    let completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null = null;

    if (roomCleared) {
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
    const updatedStrategy: RoomStrategyEntry[] = roomCleared
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
        availableSlots: chestAvailableSlots,
      });
      await tx.encounterSite.deleteMany({ where: { id: siteId, playerId } });
    } else {
      await tx.encounterSite.update({
        where: { id: siteId },
        data: {
          mobs: serializeEncounterSiteMobs(mobs),
          currentRoom: newCurrentRoom,
          ...(roomCleared ? { roomStrategy: updatedStrategy as unknown as Prisma.InputJsonValue } : {}),
        },
      });
    }

    const potionDeductResult = await deductConsumedPotions(playerId, state.allPotionsConsumed, tx);
    return { turnSpend: spent, completionRewards, potionDeductResult, siteCleared, newCurrentRoom };
  });

  // Update player HP/resources
  await setAllResources(
    playerId,
    state.participant.hp,
    state.participant.stamina,
    state.participant.mana,
  );

  // Handle defeat
  let fleeResult: AutoResolveEncounterResult['fleeResult'] = null;
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
    fleeResult,
    respawnedTo,
  };
}
