import { Prisma, prisma } from '@pocketrealm/database';
import {
  COMBAT_CONSTANTS,
  makeEncounterMobId,
  parseEncounterMobSlot,
  type EncounterMobRole,
  type QuestProgressUpdate,
  type RoomStrategyEntry,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { splitAndGrantXp } from './combatOrchestrationService';
import type { GrantXpResult } from './xpService';
import { assertCanAct, assertInZone } from '../utils/routeHelpers';
import { spendPlayerTurnsTx } from './turnBankService';
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
  resolveEncounterRoomCombat,
  countEncounterSiteHits,
  storeEncounterChestOverflow,
  type FleeResult,
} from './encounterSiteCombatCore';
import { degradeEquippedDurabilityByHits } from './durabilityService';
import { deleteCombatSession } from './encounterSiteManualCombat';
import { trackEncounterSiteKillProgress } from './encounterSiteProgressService';

// Re-export for route handler convenience
export { parseEncounterMobSlot, makeEncounterMobId };

// Re-exports from encounterSiteCombatCore so existing importers don't break
export {
  resolveEncounterRoomCombat,
  computeDefeatedMobXp,
  accumulateEncounterSiteXpContribution,
  rebuildEncounterSiteXpContributionsFromRoundLogs,
  createEncounterSiteXpContributions,
} from './encounterSiteCombatCore';
export type {
  RoundSnapshot,
  EncounterRoomCombatResult,
  EncounterSiteXpContributions,
  FleeResult,
} from './encounterSiteCombatCore';

// Re-exports from encounterSiteManualCombat so existing importers don't break
export {
  clearManualCombatSession,
  isManualCombatSessionPersistenceError,
  startManualEncounterRoom,
  resolveManualEncounterRound,
} from './encounterSiteManualCombat';
export type { StartManualRoomResult, ManualRoundResult } from './encounterSiteManualCombat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoResolveEncounterResult {
  outcome: 'cleared' | 'defeated' | 'site_cleared';
  roundsResolved: number;
  rounds: import('./encounterSiteCombatCore').RoundSnapshot[];
  initialMobs: Array<{ mobId: string; slot: number; name: string; prefix: string | null; role: EncounterMobRole; hp: number; maxHp: number }>;
  playerHpAfter: number;
  playerStaminaAfter: number;
  playerManaAfter: number;
  potionsConsumed: import('@pocketrealm/shared').PotionConsumed[];
  currentRoom: number;
  totalRooms: number;
  siteCleared: boolean;
  completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null;
  pendingLootSessionId: string | null;
  xpGrants: GrantXpResult[];
  questProgress: QuestProgressUpdate[];
  fleeResult: FleeResult | null;
  respawnedTo: { townId: string; townName: string } | null;
  durabilityDamagedItemIds: string[];
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
  // Clear any stale manual session — player chose to auto-resolve instead of continuing manually
  await deleteCombatSession(playerId, siteId);

  // Load site and verify ownership
  const site = await prisma.encounterSite.findFirst({
    where: { id: siteId, playerId },
    include: {
      mobFamily: { select: { name: true } },
      zone: { select: { name: true } },
    },
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
  const advanceResult = await advanceToFirstAliveRoom(
    { id: site.id, currentRoom: site.currentRoom ?? 1 },
    decayed.mobs,
    totalRoomsForAdvance,
  );

  // All remaining rooms decayed — auto-clear site with chest reward
  if (!advanceResult) {
    const { completionRewards, pendingLootSessionId } = await handleDecayedSiteClearance(playerId, siteId, site);
    return {
      outcome: 'site_cleared' as const,
      roundsResolved: 0,
      rounds: [],
      initialMobs: [],
      playerHpAfter: 0,
      playerStaminaAfter: 0,
      playerManaAfter: 0,
      potionsConsumed: [],
      currentRoom: site.currentRoom ?? 1,
      totalRooms: site.totalRooms ?? 1,
      siteCleared: true,
      completionRewards,
      pendingLootSessionId,
      xpGrants: [],
      questProgress: [],
      fleeResult: null,
      respawnedTo: null,
      durabilityDamagedItemIds: [],
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

  // Charge turn cost BEFORE combat (N mobs * turn cost per mob)
  const totalTurnCost = roomMobs.length * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST;

  // Build player as RaidParticipant
  const { participant, attackSkill, guildXpBoost } = await buildParticipantForEncounterSite(
    playerId,
    username,
    hpState.currentHp,
    hpState.maxHp,
  );

  // Run combat loop in memory
  const combatResult = resolveEncounterRoomCombat(participant, expeditionMobs, undefined, attackSkill);

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

    const newlyDefeatedMobs = markEncounterRoomMobsDefeated(
      mobs,
      currentRoom,
      [...defeatedMobIds].flatMap(mobId => {
        const slot = clearedSlotsByMobId.get(mobId);
        return slot === undefined ? [] : [slot];
      }),
    );

    const roomResolvedWithNewKills = combatResult.outcome === 'cleared' && newlyDefeatedMobs.length > 0;
    const xpAwarded = roomResolvedWithNewKills
      ? computeDefeatedMobXp(
          new Set(newlyDefeatedMobs.map(s => makeEncounterMobId(s.slot))),
          newlyDefeatedMobs,
          mobXpByEncounterMobId,
        )
      : 0;

    // Room/site clearing logic
    const overallCounts = countEncounterSiteState(mobs);
    let siteCleared = false;
    let newCurrentRoom = freshSite.currentRoom ?? currentRoom;
    let completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null = null;

    if (roomResolvedWithNewKills) {
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
    const updatedStrategy: RoomStrategyEntry[] = roomResolvedWithNewKills
      ? [...existingStrategy, { room: currentRoom, mode: 'auto', bonusEligible: true }]
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

    // Deduct consumed potions
    const potionDeductResult = await deductConsumedPotions(playerId, combatResult.potionsConsumed, tx);

    // Log room combat to activity history
    await tx.activityLog.create({
      data: {
        playerId,
        activityType: 'combat',
        turnsSpent: totalTurnCost,
        result: {
          source: 'encounter_site_room',
          siteId,
          siteName: site.name,
          mobFamilyName: site.mobFamily.name,
          mobFamilyId: site.mobFamilyId,
          zoneId: site.zoneId,
          zoneName: site.zone.name,
          room: currentRoom,
          totalRooms: site.totalRooms ?? 1,
          outcome: combatResult.outcome,
          mode: 'auto',
          roundsResolved: combatResult.roundsResolved,
          rounds: combatResult.rounds,
          initialMobs: toInitialMobSnapshot(expeditionMobs),
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

  // Update player HP/resources after combat
  await setAllResources(
    playerId,
    combatResult.playerHpAfter,
    combatResult.playerStaminaAfter,
    combatResult.playerManaAfter,
  );

  // Degrade equipment durability from encounter site combat
  const { playerHitsLanded, mobHitsLanded } = countEncounterSiteHits(combatResult.rounds.map(r => r.log));
  const durabilityLost = await degradeEquippedDurabilityByHits(playerId, playerHitsLanded, mobHitsLanded);
  const durabilityDamagedItemIds = durabilityLost.map(d => d.itemId);
  const pendingLootSessionId = await storeEncounterChestOverflow(playerId, txResult.completionRewards);

  // Grant XP for defeated mobs (only on room clear, not on defeat)
  let xpGrants: GrantXpResult[] = [];
  let questProgress: QuestProgressUpdate[] = [];
  if (combatResult.outcome === 'cleared') {
    const totalXp = txResult.xpAwarded;
    if (totalXp > 0) {
      xpGrants = await splitAndGrantXp(
        playerId,
        totalXp,
        attackSkill,
        combatResult.damageByScalingStat,
        combatResult.resourceCostByScalingStat,
        guildXpBoost,
      );
    }
    questProgress = await trackEncounterSiteKillProgress(
      playerId,
      txResult.newlyDefeatedMobs,
    );
  }

  // Handle defeat
  let fleeResult: FleeResult | null = null;
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
    initialMobs: toInitialMobSnapshot(expeditionMobs),
    playerHpAfter: combatResult.playerHpAfter,
    playerStaminaAfter: combatResult.playerStaminaAfter,
    playerManaAfter: combatResult.playerManaAfter,
    potionsConsumed: combatResult.potionsConsumed,
    currentRoom: txResult.newCurrentRoom,
    totalRooms: site.totalRooms ?? 1,
    siteCleared: txResult.siteCleared,
    completionRewards: txResult.completionRewards,
    pendingLootSessionId,
    xpGrants,
    questProgress,
    fleeResult,
    respawnedTo,
    durabilityDamagedItemIds,
  };
}
