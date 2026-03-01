import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { Prisma, prisma } from '@adventure/database';
import {
  applyMobEventModifiers,
  applyMobPrefix,
  buildPlayerCombatStats,
  runCombat,
  calculateFleeResult,
  rollMobPrefix,
  mobToCombatantStats,
  filterAndWeightMobsByTier,
  selectTierWithBleedthrough,
} from '@adventure/game-engine';
import {
  COMBAT_CONSTANTS,
  GUILD_CONSTANTS,
  ZONE_EXPLORATION_CONSTANTS,
  type Combatant,
  type CombatOptions,
  type LootDrop,
  type MobTemplate,
  type PotionConsumed,
} from '@adventure/shared';
import { AppError } from '../../middleware/errorHandler';
import { rollAndGrantLoot, rollAndGrantLootWithCapacity, enrichLootWithNames } from '../../services/lootService';
import type { LootDropWithName } from '../../services/lootService';
import { spendPlayerTurnsTx } from '../../services/turnBankService';
import { grantSkillXp } from '../../services/xpService';
import { degradeEquippedDurability } from '../../services/durabilityService';
import { setHp } from '../../services/hpService';
import { getEquipmentStats } from '../../services/equipmentService';
import { getUsedSlots, getPlayerCapacity } from '../../services/inventoryService';
import { storePendingLoot } from '../../services/pendingLootService';
import { getPlayerProgressionState } from '../../services/attributesService';
import { grantEncounterSiteChestRewardsTx } from '../../services/chestService';
import { computeZoneModifiers, computeEventSummaries, getActiveEventsForZone, getActiveWorldWideEvents, filterEventModifiers, type EventModifierBadge } from '../../services/worldEventService';

function tagEventsWithApplicability(
  events: Array<{ title: string; effectType: string; effectValue: number }>,
  entityBadges: EventModifierBadge[],
) {
  return events.map(e => ({
    ...e,
    appliedToThisMob: entityBadges.some(m => m.effectType === e.effectType && m.title === e.title),
  }));
}
import {
  persistMobHp,
  checkPersistedMobReencounter,
  removePersistedMob,
} from '../../services/persistedMobService';
import { buildPotionPool, deductConsumedPotions } from '../../services/potionService';
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from '../../services/combatStatsService';
import { getExplorationPercent } from '../../services/zoneExplorationService';
import { incrementStats } from '../../services/statsService';
import { serializeXpGrant, toMobTemplate, assertCanAct, recordBestiaryKill, trackAchievements, handleCombatDefeat } from '../../utils/routeHelpers.js';
import { addGuildXp, getPlayerGuildId } from '../../services/guildService';
import { getPlayerGuildModifiers } from '../../services/guildUpgradeService';
import { incrementContractProgress } from '../../services/guildContractService';
import {
  prismaAny,
  startSchema,
  pickWeighted,
  toEncounterSiteSize,
  parseEncounterSiteMobs,
  serializeEncounterSiteMobs,
  countEncounterSiteState,
  getAllAliveMobsInRoom,
  getRoomState,
  getNextUnfinishedRoom,
  applyEncounterSiteDecayAndPersist,
  applyEncounterSiteDecayInMemory,
  type FightResult,
} from './helpers';

/**
 * Handle encounter site room combat: fight ALL alive mobs in the current room sequentially.
 */
async function handleEncounterSiteRoomCombat(req: Request, res: Response, playerId: string, encounterSiteId: string, body: { attackSkill?: 'melee' | 'ranged' | 'magic' }) {
  const hpState = await assertCanAct(playerId);
  if (hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
  }

  const site = await prismaAny.encounterSite.findFirst({
    where: { id: encounterSiteId, playerId },
    include: { mobFamily: { select: { name: true } } },
  });
  if (!site) throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');
  if (!site.clearStrategy) throw new AppError(400, 'Select a clearing strategy before fighting', 'STRATEGY_NOT_SET');

  const decayed = await applyEncounterSiteDecayAndPersist({
    id: site.id,
    playerId: site.playerId,
    discoveredAt: site.discoveredAt,
    mobs: site.mobs,
  }, new Date());
  if (!decayed) throw new AppError(410, 'Encounter site has decayed', 'SITE_DECAYED');

  const siteStrategy = site.clearStrategy as 'full_clear' | 'room_by_room';
  const siteFullClearActive = site.fullClearActive ?? true;
  let currentRoom = site.currentRoom ?? 1;
  const zoneId = site.zoneId as string;

  // Get ALL alive mobs in the current room -- advance if decay emptied it
  let roomMobs = getAllAliveMobsInRoom(decayed.mobs, currentRoom);
  if (roomMobs.length === 0) {
    const totalRooms = new Set(decayed.mobs.map(m => m.room)).size || 1;
    let advanced = false;
    for (let r = currentRoom + 1; r <= totalRooms; r++) {
      const candidate = getAllAliveMobsInRoom(decayed.mobs, r);
      if (candidate.length > 0) {
        currentRoom = r;
        roomMobs = candidate;
        advanced = true;
        await prismaAny.encounterSite.update({
          where: { id: site.id },
          data: { currentRoom: r },
        });
        break;
      }
    }
    if (!advanced) throw new AppError(410, 'Encounter site has decayed', 'SITE_DECAYED');
  }

  // Collect mobs for this combat session
  let allSessionMobs: Array<{ roomNumber: number; mobs: typeof roomMobs }> = [];

  if (siteStrategy === 'full_clear' && siteFullClearActive) {
    // Full clear: gather all remaining rooms
    const allRooms = [...new Set(decayed.mobs.map(m => m.room))].sort((a, b) => a - b);
    for (const r of allRooms) {
      if (r < currentRoom) continue;
      const alive = getAllAliveMobsInRoom(decayed.mobs, r);
      if (alive.length > 0) allSessionMobs.push({ roomNumber: r, mobs: alive });
    }
  } else {
    // Room-by-room: just current room
    allSessionMobs = [{ roomNumber: currentRoom, mobs: roomMobs }];
  }

  // Full clear charges turns for all remaining rooms upfront. No refund on mid-clear defeat.
  // This is intentional: the risk/reward tradeoff is core to the full_clear strategy.
  const totalMobCount = allSessionMobs.reduce((sum, r) => sum + r.mobs.length, 0);
  const totalTurnCost = totalMobCount * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST;

  // Load zone
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone) throw new AppError(404, 'Zone not found', 'NOT_FOUND');

  const explorationProgress = await getExplorationPercent(playerId, zoneId);

  // Batch-load mob templates for all session rooms
  const allMobTemplateIds = [...new Set(allSessionMobs.flatMap(s => s.mobs.map(m => m.mobTemplateId)))];
  const mobTemplateRows = await prisma.mobTemplate.findMany({ where: { id: { in: allMobTemplateIds } } });
  const mobTemplateById = new Map(mobTemplateRows.map(t => [t.id, t]));

  // Build player stats once
  const requestedAttackSkill: AttackSkill | null = body.attackSkill ?? null;
  const mainHandAttackSkill = await getMainHandAttackSkill(playerId);
  const attackSkill: AttackSkill = mainHandAttackSkill ?? requestedAttackSkill ?? 'melee';
  const [attackLevel, progression] = await Promise.all([
    getSkillLevel(playerId, attackSkill),
    getPlayerProgressionState(playerId),
  ]);
  const equipmentStats = await getEquipmentStats(playerId);

  // Guild combat modifiers
  const guildMods = await getPlayerGuildModifiers(playerId);

  // Apply room carry HP
  let currentPlayerHp = hpState.currentHp;
  if (site.roomCarryHp !== null && site.roomCarryHp !== undefined) {
    currentPlayerHp = site.roomCarryHp;
    await setHp(playerId, currentPlayerHp);
  }

  // Build shared potion pool
  const playerRecord = await prismaAny.player.findUnique({
    where: { id: playerId },
    select: { autoPotionThreshold: true },
  });
  const autoPotionThreshold = playerRecord?.autoPotionThreshold ?? 0;
  const potionPool = autoPotionThreshold > 0 ? await buildPotionPool(playerId, hpState.maxHp) : [];
  const allPotionsConsumed: PotionConsumed[] = [];

  // Zone modifiers — fetch events once, derive modifiers synchronously
  const [cachedZoneEvents, cachedWorldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);
  const zoneModifiers = computeZoneModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: site.mobFamilyId as string });
  const activeEventEffects = computeEventSummaries(cachedZoneEvents, cachedWorldEvents);

  // Fight loop — iterate rooms (full clear) or single room (room-by-room)
  let sitePendingLootSessionId: string | null = null;
  const fightResults: FightResult[] = [];
  let lastCombatResult: ReturnType<typeof runCombat> | null = null;
  let lastPrefixedMob: (MobTemplate & { mobPrefix: string | null; mobDisplayName: string | null }) | null = null;
  let lastBaseMob: MobTemplate | null = null;
  let defeatedInRoom = currentRoom;
  let playerDefeated = false;

  for (const session of allSessionMobs) {
    currentRoom = session.roomNumber;

    for (const roomMob of session.mobs) {
      const template = mobTemplateById.get(roomMob.mobTemplateId);
      if (!template) continue;

      const baseMob = toMobTemplate(template as unknown as Record<string, unknown>);
      const modifiedMob = applyMobEventModifiers(baseMob, zoneModifiers);
      const prefixedMob = applyMobPrefix(modifiedMob, roomMob.prefix ?? null);

      const playerStartHp = currentPlayerHp;
      const playerStats = buildPlayerCombatStats(
        currentPlayerHp,
        hpState.maxHp,
        { attackStyle: attackSkill, skillLevel: attackLevel, attributes: progression.attributes },
        equipmentStats
      );

      // Apply guild combat modifiers
      if (guildMods.combatDamage > 0) {
        playerStats.damageMin = Math.round(playerStats.damageMin * (1 + guildMods.combatDamage));
        playerStats.damageMax = Math.round(playerStats.damageMax * (1 + guildMods.combatDamage));
      }
      if (guildMods.defenseBoost > 0) {
        playerStats.defence = Math.round(playerStats.defence * (1 + guildMods.defenseBoost));
        playerStats.magicDefence = Math.round(playerStats.magicDefence * (1 + guildMods.defenseBoost));
      }

      let combatOptions: CombatOptions | undefined;
      if (autoPotionThreshold > 0 && potionPool.length > 0) {
        combatOptions = { autoPotionThreshold, potions: [...potionPool] };
      }

      const combatantA: Combatant = { id: playerId, name: req.player!.username, stats: playerStats };
      const combatantB: Combatant = {
        id: prefixedMob.id,
        name: prefixedMob.mobDisplayName ?? prefixedMob.name,
        stats: mobToCombatantStats(prefixedMob),
        spells: prefixedMob.spellPattern,
      };

      const combatResult = runCombat(combatantA, combatantB, combatOptions);
      lastCombatResult = combatResult;
      lastPrefixedMob = prefixedMob;
      lastBaseMob = baseMob;

      // Remove consumed potions from shared pool
      for (const consumed of combatResult.potionsConsumed) {
        const idx = potionPool.findIndex(p => p.templateId === consumed.templateId);
        if (idx !== -1) potionPool.splice(idx, 1);
        allPotionsConsumed.push(consumed);
      }

      // Per-mob post-combat rewards (only on victory)
      let mobLoot: LootDropWithName[] = [];
      let mobXpGrant: Awaited<ReturnType<typeof grantSkillXp>> | null = null;
      const mobXpAwarded = combatResult.outcome === 'victory' ? Math.max(0, prefixedMob.xpReward) : 0;
      const mobDurabilityLost = await degradeEquippedDurability(playerId);

      if (combatResult.outcome === 'victory') {
        await setHp(playerId, combatResult.combatantAHpRemaining);
        const lootResult = await rollAndGrantLootWithCapacity(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
        mobLoot = await enrichLootWithNames(lootResult.drops);
        if (lootResult.pendingLootSessionId && !sitePendingLootSessionId) {
          sitePendingLootSessionId = lootResult.pendingLootSessionId;
        }
        mobXpGrant = await grantSkillXp(playerId, attackSkill, mobXpAwarded, undefined, guildMods.xpBoost || undefined);

        // Bestiary
        await recordBestiaryKill(playerId, prefixedMob.id, prefixedMob.mobPrefix);

        // Guild XP and contract progress
        const guildId = await getPlayerGuildId(playerId);
        if (guildId) {
          await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
          void incrementContractProgress(guildId, 'kill_count', 1).catch(() => {});
          void incrementContractProgress(guildId, 'kill_family', 1).catch(() => {});
        }
      }

      fightResults.push({
        room: session.roomNumber,
        slot: roomMob.slot,
        mobName: template.name as string,
        mobDisplayName: prefixedMob.mobDisplayName ?? prefixedMob.name,
        mobTemplateId: prefixedMob.id,
        mobPrefix: prefixedMob.mobPrefix,
        outcome: combatResult.outcome,
        playerMaxHp: combatResult.combatantAMaxHp,
        playerStartHp,
        mobMaxHp: combatResult.combatantBMaxHp,
        log: combatResult.log,
        playerHpRemaining: combatResult.combatantAHpRemaining,
        potionsConsumed: combatResult.potionsConsumed,
        xp: mobXpAwarded,
        loot: mobLoot,
        durabilityLost: mobDurabilityLost,
        skillXp: mobXpGrant,
      });

      // Carry HP
      currentPlayerHp = combatResult.combatantAHpRemaining;

      // Stop on defeat
      if (combatResult.outcome !== 'victory') {
        defeatedInRoom = session.roomNumber;
        playerDefeated = true;
        break;
      }
    }

    if (playerDefeated) break;
  }

  // --- Transaction: spend turns, mark defeated mobs, room/site clearing ---
  const defeatedSlots = fightResults.filter(f => f.outcome === 'victory').map(f => f.slot);
  let encounterSiteCleared = false;
  let roomCleared = false;

  // Compute available slots for capacity-aware chest rewards
  const [usedSlotsNow, capacityNow] = await Promise.all([
    getUsedSlots(playerId),
    getPlayerCapacity(playerId),
  ]);
  let chestAvailableSlots = Math.max(0, capacityNow - usedSlotsNow);

  const txResult = await prisma.$transaction(async (tx) => {
    const txAny = tx as unknown as any;
    const spent = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);

    const freshSite = await txAny.encounterSite.findFirst({
      where: { id: encounterSiteId, playerId },
      select: { id: true, playerId: true, mobFamilyId: true, size: true, discoveredAt: true, mobs: true },
    });
    if (!freshSite) throw new AppError(409, 'Encounter site is no longer available', 'ENCOUNTER_SITE_UNAVAILABLE');

    const freshDecayed = applyEncounterSiteDecayInMemory(parseEncounterSiteMobs(freshSite.mobs), freshSite.discoveredAt, new Date());
    const mobs = freshDecayed.mobs.map(m => ({ ...m }));

    // Mark defeated mobs
    for (const slot of defeatedSlots) {
      const target = mobs.find(m => m.slot === slot);
      if (target && target.status === 'alive') target.status = 'defeated';
    }

    // Room-aware post-combat logic
    let newCurrentRoom = currentRoom;
    let newRoomCarryHp: number | null = currentPlayerHp;
    let siteCleared = false;

    if (!playerDefeated) {
      // All fights won
      roomCleared = true;
      const overallCounts = countEncounterSiteState(mobs);
      if (overallCounts.alive <= 0) {
        siteCleared = true;
      } else {
        const nextRoom = getNextUnfinishedRoom(mobs, currentRoom + 1);
        if (nextRoom) newCurrentRoom = nextRoom;
        else siteCleared = true;
      }
    } else {
      // Player was defeated mid-clear
      const roomState = getRoomState(mobs, defeatedInRoom);
      if (roomState.alive <= 0) {
        roomCleared = true;
        const nextRoom = getNextUnfinishedRoom(mobs, defeatedInRoom + 1);
        if (nextRoom) newCurrentRoom = nextRoom;
        else siteCleared = true;
      }
      newRoomCarryHp = null;
    }

    let completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null = null;
    if (siteCleared) {
      completionRewards = await grantEncounterSiteChestRewardsTx(tx, {
        playerId,
        mobFamilyId: freshSite.mobFamilyId,
        size: toEncounterSiteSize(freshSite.size),
        fullClearBonus: siteStrategy === 'full_clear' && siteFullClearActive,
        availableSlots: chestAvailableSlots,
      });
      await txAny.encounterSite.deleteMany({ where: { id: encounterSiteId, playerId } });
      encounterSiteCleared = true;
    } else {
      await txAny.encounterSite.update({
        where: { id: encounterSiteId },
        data: {
          mobs: serializeEncounterSiteMobs(mobs),
          currentRoom: newCurrentRoom,
          roomCarryHp: newRoomCarryHp,
        },
      });
    }

    await deductConsumedPotions(playerId, allPotionsConsumed, tx);
    return { turnSpend: spent, siteCompletionRewards: completionRewards };
  });

  const turnSpend = txResult.turnSpend;
  const siteCompletionRewards = txResult.siteCompletionRewards;

  // Store chest overflow as pending loot
  if (siteCompletionRewards?.overflow?.length) {
    const chestPendingId = await storePendingLoot(playerId, siteCompletionRewards.overflow);
    // Use chest overflow session if no mob overflow session exists
    if (!sitePendingLootSessionId) sitePendingLootSessionId = chestPendingId;
  }

  // --- Defeat handling (last fight only) ---
  const lastFight = fightResults[fightResults.length - 1];
  let fleeResult: ReturnType<typeof calculateFleeResult> | null = null;
  let respawnedTo: { townId: string; townName: string } | null = null;

  if (lastFight && lastFight.outcome === 'defeat') {
    const defeatResult = await handleCombatDefeat(playerId, {
      evasionLevel: progression.attributes.evasion,
      mobLevel: lastPrefixedMob!.level,
      maxHp: hpState.maxHp,
    });
    fleeResult = defeatResult.fleeResult;
    respawnedTo = defeatResult.respawnedTo;

    // Defeat in room: downgrade full_clear or reset room
    const siteForReset = await prismaAny.encounterSite.findFirst({ where: { id: encounterSiteId, playerId } });
    if (siteForReset) {
      if (siteStrategy === 'full_clear' && siteFullClearActive) {
        await prismaAny.encounterSite.update({
          where: { id: encounterSiteId },
          data: { clearStrategy: 'room_by_room', fullClearActive: false, roomCarryHp: null },
        });
      } else {
        const siteMobs = parseEncounterSiteMobs(siteForReset.mobs);
        const resetMobs = siteMobs.map(m =>
          m.room === defeatedInRoom && m.status === 'defeated' ? { ...m, status: 'alive' as const } : m
        );
        await prismaAny.encounterSite.update({
          where: { id: encounterSiteId },
          data: { mobs: serializeEncounterSiteMobs(resetMobs), roomCarryHp: null },
        });
      }
    }
  }

  // --- Achievement tracking ---
  if (totalTurnCost > 0) {
    await incrementStats(playerId, { totalTurnsSpent: totalTurnCost });
  }

  const victoriesCount = fightResults.filter(f => f.outcome === 'victory').length;
  if (victoriesCount > 0) {
    const achievementKeys = ['totalKills', 'totalUniqueMonsterKills', 'totalTurnsSpent', 'totalBestiaryCompleted'];
    if (siteCompletionRewards?.recipeUnlocked) achievementKeys.push('totalRecipesLearned');

    // Check skill level achievements from last XP grant
    const lastXpGrant = [...fightResults].reverse().find(f => f.skillXp)?.skillXp;
    if (lastXpGrant?.newLevel) achievementKeys.push('highestSkillLevel');
    if (lastXpGrant?.characterLevelAfter && lastXpGrant.characterLevelAfter > (lastXpGrant.characterLevelBefore ?? 0)) {
      achievementKeys.push('highestCharacterLevel');
    }

    // Resolve mob family
    const firstMobTemplateId = fightResults[0]?.mobTemplateId;
    const familyIds: string[] = [];
    if (firstMobTemplateId) {
      const familyMember = await prismaAny.mobFamilyMember.findFirst({
        where: { mobTemplateId: firstMobTemplateId },
        select: { mobFamilyId: true },
      });
      if (familyMember?.mobFamilyId) familyIds.push(familyMember.mobFamilyId);
    }

    await trackAchievements(playerId, {}, { statKeys: achievementKeys, familyIds });
  } else {
    await trackAchievements(playerId, {}, { statKeys: ['totalTurnsSpent'] });
  }

  // --- Build aggregated rewards ---
  const rawLoot: LootDropWithName[] = [];
  const aggregatedDurabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>> = [];
  let aggregatedXp = 0;
  for (const fight of fightResults) {
    aggregatedXp += fight.xp;
    rawLoot.push(...fight.loot);
    aggregatedDurabilityLost.push(...fight.durabilityLost);
  }

  // Combine loot by itemTemplateId so "Rat Pelt x1" + "Rat Pelt x2" becomes "Rat Pelt x3"
  const lootMap = new Map<string, LootDropWithName>();
  for (const drop of rawLoot) {
    const existing = lootMap.get(drop.itemTemplateId);
    if (existing) {
      existing.quantity += drop.quantity;
    } else {
      lootMap.set(drop.itemTemplateId, { ...drop });
    }
  }
  const aggregatedLoot = [...lootMap.values()];
  const lastVictoryXpGrant = [...fightResults].reverse().find(f => f.skillXp)?.skillXp ?? null;

  const siteCompletionWithNames = siteCompletionRewards
    ? {
        chestRarity: siteCompletionRewards.chestRarity,
        materialRolls: siteCompletionRewards.materialRolls,
        loot: await enrichLootWithNames(siteCompletionRewards.loot),
        recipeUnlocked: siteCompletionRewards.recipeUnlocked,
        fullClearBonus: siteStrategy === 'full_clear' && siteFullClearActive,
      }
    : null;

  // Mob-specific event modifiers for appliedToThisMob flag (reuse cached events)
  const siteMobBadges = filterEventModifiers(cachedZoneEvents, cachedWorldEvents, { mobFamilyId: site.mobFamilyId as string });

  // Mob family name from the initial encounter site query (includes mobFamily relation)
  const mobFamilyName: string | null = site.mobFamily?.name ?? null;

  // --- Activity log ---
  const combatLog = await prisma.activityLog.create({
    data: {
      playerId,
      activityType: 'combat',
      turnsSpent: totalTurnCost,
      result: {
        zoneId,
        zoneName: zone.name,
        mobTemplateId: lastPrefixedMob?.id ?? fightResults[0]?.mobTemplateId,
        mobName: lastBaseMob?.name,
        mobPrefix: lastPrefixedMob?.mobPrefix,
        mobDisplayName: lastPrefixedMob?.mobDisplayName,
        source: 'encounter_site',
        encounterSiteId,
        encounterSiteCleared,
        mobFamilyName,
        attackSkill,
        outcome: lastCombatResult?.outcome ?? 'defeat',
        playerMaxHp: lastCombatResult?.combatantAMaxHp ?? hpState.maxHp,
        mobMaxHp: lastCombatResult?.combatantBMaxHp ?? 0,
        potionsConsumed: allPotionsConsumed,
        fightCount: fightResults.length,
        rewards: {
          xp: aggregatedXp,
          baseXp: aggregatedXp,
          loot: aggregatedLoot,
          siteCompletion: siteCompletionWithNames,
          durabilityLost: aggregatedDurabilityLost,
          skillXp: lastVictoryXpGrant
            ? serializeXpGrant(lastVictoryXpGrant)
            : null,
        },
        eventModifiers: siteMobBadges,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // --- Per-fight activity logs (combat log stored individually) ---
  // Wrapped in try-catch: if log creation fails, response degrades gracefully
  // (frontend handles missing combatLogId via backwards-compat inline log path)
  let fightLogIds: string[] = [];
  try {
    for (const fight of fightResults) {
      const fightLog = await prisma.activityLog.create({
        data: {
          playerId,
          activityType: 'combat',
          turnsSpent: 0,
          result: {
            zoneId,
            zoneName: zone.name,
            mobTemplateId: fight.mobTemplateId,
            mobName: fight.mobName,
            mobPrefix: fight.mobPrefix,
            mobDisplayName: fight.mobDisplayName,
            source: 'encounter_site_fight',
            encounterSiteId,
            summaryLogId: combatLog.id,
            room: fight.room,
            attackSkill,
            outcome: fight.outcome,
            playerMaxHp: fight.playerMaxHp,
            mobMaxHp: fight.mobMaxHp,
            log: fight.log,
            rewards: {
              xp: fight.xp,
              baseXp: fight.xp,
              loot: fight.loot,
              durabilityLost: fight.durabilityLost,
              skillXp: fight.skillXp ? serializeXpGrant(fight.skillXp) : null,
            },
            eventModifiers: siteMobBadges,
          } as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      fightLogIds.push(fightLog.id);
    }
  } catch {
    fightLogIds = [];
  }

  // --- Response with fights[] array ---
  const lastFightResult = fightResults[fightResults.length - 1]!;
  res.json({
    logId: combatLog.id,
    turns: turnSpend,
    combat: {
      zoneId,
      mobTemplateId: lastFightResult.mobTemplateId,
      mobPrefix: lastFightResult.mobPrefix,
      mobDisplayName: lastFightResult.mobDisplayName,
      encounterSiteId,
      encounterSiteCleared,
      attackSkill,
      outcome: lastFightResult.outcome,
      playerMaxHp: lastFightResult.playerMaxHp,
      mobMaxHp: lastFightResult.mobMaxHp,
      ...(fightLogIds.length > 0
        ? { combatLogId: fightLogIds[fightLogIds.length - 1] }
        : { log: lastFightResult.log }),
      playerHpRemaining: lastFightResult.playerHpRemaining,
      potionsConsumed: allPotionsConsumed,
      fleeResult: fleeResult
        ? {
            outcome: fleeResult.outcome,
            remainingHp: fleeResult.remainingHp,
            goldLost: fleeResult.goldLost,
            isRecovering: fleeResult.outcome === 'knockout',
            recoveryCost: fleeResult.recoveryCost,
          }
        : null,
      ...(respawnedTo ? { respawnedTo } : {}),
      room: {
        currentRoom,
        roomCleared,
        siteStrategy,
        fullClearActive: siteFullClearActive,
      },
      fights: fightResults.map((f, i) => ({
        room: f.room,
        mobName: f.mobName,
        mobDisplayName: f.mobDisplayName,
        mobTemplateId: f.mobTemplateId,
        mobPrefix: f.mobPrefix,
        outcome: f.outcome,
        playerMaxHp: f.playerMaxHp,
        playerStartHp: f.playerStartHp,
        mobMaxHp: f.mobMaxHp,
        ...(fightLogIds[i] ? { combatLogId: fightLogIds[i] } : { log: f.log }),
        playerHpRemaining: f.playerHpRemaining,
        potionsConsumed: f.potionsConsumed,
        xp: f.xp,
        loot: f.loot,
        durabilityLost: f.durabilityLost,
        skillXp: f.skillXp
          ? serializeXpGrant(f.skillXp)
          : null,
      })),
    },
    rewards: {
      xp: aggregatedXp,
      loot: aggregatedLoot,
      siteCompletion: siteCompletionWithNames,
      durabilityLost: aggregatedDurabilityLost,
      skillXp: lastVictoryXpGrant
        ? serializeXpGrant(lastVictoryXpGrant)
        : null,
    },
    pendingLootSessionId: sitePendingLootSessionId,
    explorationProgress: {
      turnsExplored: explorationProgress.turnsExplored,
      percent: explorationProgress.percent,
      turnsToExplore: explorationProgress.turnsToExplore,
    },
    activeEvents: activeEventEffects.length > 0
      ? tagEventsWithApplicability(activeEventEffects, siteMobBadges)
      : undefined,
  });
}

export function registerStartRoutes(router: Router): void {
  /**
   * POST /api/v1/combat/start
   * Spend turns and run combat. Encounter sites fight all mobs in the current room.
   */
  router.post('/start', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      const body = startSchema.parse(req.body);

      // Encounter site -> room combat loop
      if (body.encounterSiteId) {
        await handleEncounterSiteRoomCombat(req, res, playerId, body.encounterSiteId, body);
        return;
      }

      // --- Zone combat (single mob, unchanged) ---
      const hpState = await assertCanAct(playerId);
      if (hpState.currentHp <= 0) {
        throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
      }

      const zoneId = body.zoneId;
      if (!zoneId) {
        throw new AppError(400, 'zoneId is required', 'INVALID_REQUEST');
      }

      const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new AppError(404, 'Zone not found', 'NOT_FOUND');
      }

      const explorationProgress = await getExplorationPercent(playerId, zoneId);

      let mob = null as null | (MobTemplate & { spellPattern: unknown });

      if (body.mobTemplateId) {
        const found = await prisma.mobTemplate.findUnique({ where: { id: body.mobTemplateId } });
        if (!found || found.zoneId !== zoneId) {
          throw new AppError(400, 'Invalid mobTemplateId for this zone', 'INVALID_MOB');
        }
        mob = found as unknown as MobTemplate & { spellPattern: unknown };
      } else {
        const mobs = await prisma.mobTemplate.findMany({ where: { zoneId } });
        const zoneTiers = (zone as unknown as { explorationTiers: Record<string, number> | null }).explorationTiers;
        const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

        let currentTier = 0;
        for (const [tierStr, threshold] of Object.entries(tiers)) {
          const tier = Number(tierStr);
          if (explorationProgress.percent >= threshold && tier > currentTier) {
            currentTier = tier;
          }
        }

        const selectedTier = selectTierWithBleedthrough(currentTier, zoneTiers);
        const mobsWithTier = mobs.map(m => ({
          ...m,
          explorationTier: (m as unknown as { explorationTier: number | null }).explorationTier ?? 1,
        }));

        let candidates = mobsWithTier.filter(m => m.explorationTier === selectedTier);
        if (candidates.length === 0) {
          candidates = mobsWithTier.filter(m => m.explorationTier === currentTier);
        }
        if (candidates.length === 0) {
          candidates = mobsWithTier;
        }

        const allTiersUnlocked: Record<string, number> = {};
        for (const c of candidates) {
          allTiersUnlocked[String(c.explorationTier)] = 0;
        }
        const tieredMobs = filterAndWeightMobsByTier(candidates, 100, allTiersUnlocked);
        const picked = pickWeighted(tieredMobs, m => m.encounterWeight);
        if (!picked) {
          throw new AppError(400, 'No mobs available for this zone', 'NO_MOBS');
        }
        mob = picked as unknown as MobTemplate & { spellPattern: unknown };
      }

      let mobPrefix = rollMobPrefix();

      const requestedAttackSkill: AttackSkill | null = body.attackSkill ?? null;
      const mainHandAttackSkill = await getMainHandAttackSkill(playerId);
      const attackSkill: AttackSkill = mainHandAttackSkill ?? requestedAttackSkill ?? 'melee';
      const [attackLevel, progression] = await Promise.all([
        getSkillLevel(playerId, attackSkill),
        getPlayerProgressionState(playerId),
      ]);

      const equipmentStats = await getEquipmentStats(playerId);
      const playerStats = buildPlayerCombatStats(
        hpState.currentHp,
        hpState.maxHp,
        {
          attackStyle: attackSkill,
          skillLevel: attackLevel,
          attributes: progression.attributes,
        },
        equipmentStats
      );

      // Guild combat modifiers
      const guildMods = await getPlayerGuildModifiers(playerId);
      if (guildMods.combatDamage > 0) {
        playerStats.damageMin = Math.round(playerStats.damageMin * (1 + guildMods.combatDamage));
        playerStats.damageMax = Math.round(playerStats.damageMax * (1 + guildMods.combatDamage));
      }
      if (guildMods.defenseBoost > 0) {
        playerStats.defence = Math.round(playerStats.defence * (1 + guildMods.defenseBoost));
        playerStats.magicDefence = Math.round(playerStats.magicDefence * (1 + guildMods.defenseBoost));
      }

      const baseMob = toMobTemplate(mob as unknown as Record<string, unknown>);
      const [zoneCombatZoneEvents, zoneCombatWorldEvents, zoneMobFamilyRow] = await Promise.all([
        getActiveEventsForZone(zoneId),
        getActiveWorldWideEvents(),
        prismaAny.mobFamilyMember.findFirst({
          where: { mobTemplateId: baseMob.id },
          select: { mobFamilyId: true },
        }),
      ]);
      const zoneMobFamilyId: string | undefined = zoneMobFamilyRow?.mobFamilyId ?? undefined;
      const zoneModifiers = computeZoneModifiers(zoneCombatZoneEvents, zoneCombatWorldEvents, zoneMobFamilyId ? { mobFamilyId: zoneMobFamilyId } : undefined);
      const activeEventEffects = computeEventSummaries(zoneCombatZoneEvents, zoneCombatWorldEvents);
      const modifiedMob = applyMobEventModifiers(baseMob, zoneModifiers);
      const prefixedMob = applyMobPrefix(modifiedMob, mobPrefix);
      mobPrefix = prefixedMob.mobPrefix;

      // Persisted mob reencounter
      let persistedMobId: string | null = null;
      let mobHpOverride: { currentHp: number; maxHp: number } | null = null;
      const persisted = await checkPersistedMobReencounter(playerId, zoneId, prefixedMob.id);
      if (persisted) {
        persistedMobId = persisted.id;
        mobHpOverride = { currentHp: persisted.currentHp, maxHp: persisted.maxHp };
      }

      // Auto-potion
      const playerRecord = await prismaAny.player.findUnique({
        where: { id: playerId },
        select: { autoPotionThreshold: true },
      });
      const autoPotionThreshold = playerRecord?.autoPotionThreshold ?? 0;
      let combatOptions: CombatOptions | undefined;
      if (autoPotionThreshold > 0) {
        const potions = await buildPotionPool(playerId, hpState.maxHp);
        combatOptions = { autoPotionThreshold, potions };
      }

      const finalMob = mobHpOverride ? { ...prefixedMob, ...mobHpOverride } : prefixedMob;
      const combatantA: Combatant = { id: playerId, name: req.player!.username, stats: playerStats };
      const combatantB: Combatant = {
        id: finalMob.id,
        name: finalMob.mobDisplayName ?? finalMob.name,
        stats: mobToCombatantStats(finalMob),
        spells: finalMob.spellPattern,
      };
      const combatResult = runCombat(combatantA, combatantB, combatOptions);

      const turnSpend = await prisma.$transaction(async (tx) => {
        const spent = await spendPlayerTurnsTx(tx, playerId, COMBAT_CONSTANTS.ENCOUNTER_TURN_COST);
        await deductConsumedPotions(playerId, combatResult.potionsConsumed, tx);
        return spent;
      });

      let loot: LootDrop[] = [];
      let pendingLootSessionId: string | null = null;
      let xpGrant = null as null | Awaited<ReturnType<typeof grantSkillXp>>;
      const durabilityLost = await degradeEquippedDurability(playerId);
      let fleeResult = null as null | ReturnType<typeof calculateFleeResult>;
      let respawnedTo: { townId: string; townName: string } | null = null;

      const baseXp = combatResult.outcome === 'victory' ? prefixedMob.xpReward : 0;
      const xpAwarded = Math.max(0, baseXp);

      if (combatResult.outcome === 'victory') {
        await setHp(playerId, combatResult.combatantAHpRemaining);
        const lootResult = await rollAndGrantLootWithCapacity(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
        loot = lootResult.drops;
        pendingLootSessionId = lootResult.pendingLootSessionId;
        xpGrant = await grantSkillXp(playerId, attackSkill, xpAwarded, undefined, guildMods.xpBoost || undefined);

        // Guild XP and contract progress
        const guildId = await getPlayerGuildId(playerId);
        if (guildId) {
          await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
          void incrementContractProgress(guildId, 'kill_count', 1).catch(() => {});
          void incrementContractProgress(guildId, 'kill_family', 1).catch(() => {});
        }
      } else if (combatResult.outcome === 'defeat') {
        const defeatResult = await handleCombatDefeat(playerId, {
          evasionLevel: progression.attributes.evasion,
          mobLevel: prefixedMob.level,
          maxHp: hpState.maxHp,
        });
        fleeResult = defeatResult.fleeResult;
        respawnedTo = defeatResult.respawnedTo;
      }

      // Persisted mob HP
      if (combatResult.outcome === 'victory' && persistedMobId) {
        await removePersistedMob(persistedMobId);
      } else if (combatResult.outcome === 'defeat' && combatResult.combatantBHpRemaining > 0) {
        await persistMobHp(playerId, prefixedMob.id, zoneId, combatResult.combatantBHpRemaining, prefixedMob.hp);
      }

      const lootWithNames = await enrichLootWithNames(loot);

      // Zone combat: upsert bestiary on ALL outcomes (kills:0 on defeat, increment on victory).
      // Differs from recordBestiaryKill which always increments — intentionally not consolidated.
      const bestiaryEntry = await prisma.playerBestiary.upsert({
        where: { playerId_mobTemplateId: { playerId, mobTemplateId: prefixedMob.id } },
        create: { playerId, mobTemplateId: prefixedMob.id, kills: combatResult.outcome === 'victory' ? 1 : 0 },
        update: combatResult.outcome === 'victory' ? { kills: { increment: 1 } } : {},
      });

      if (mobPrefix) {
        await prismaAny.playerBestiaryPrefix.upsert({
          where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId: prefixedMob.id, prefix: mobPrefix } },
          create: { playerId, mobTemplateId: prefixedMob.id, prefix: mobPrefix, kills: combatResult.outcome === 'victory' ? 1 : 0 },
          update: combatResult.outcome === 'victory' ? { kills: { increment: 1 } } : {},
        });
      }

      // Achievement tracking
      if (COMBAT_CONSTANTS.ENCOUNTER_TURN_COST > 0) {
        await incrementStats(playerId, { totalTurnsSpent: COMBAT_CONSTANTS.ENCOUNTER_TURN_COST });
      }

      if (combatResult.outcome === 'victory') {
        const familyIds: string[] = [];
        if (zoneMobFamilyId) familyIds.push(zoneMobFamilyId);

        const achievementKeys = ['totalKills', 'totalUniqueMonsterKills', 'totalTurnsSpent', 'totalBestiaryCompleted'];
        if (xpGrant?.newLevel) achievementKeys.push('highestSkillLevel');
        if (xpGrant?.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) achievementKeys.push('highestCharacterLevel');

        await trackAchievements(playerId, {}, { statKeys: achievementKeys, familyIds });
      } else {
        await trackAchievements(playerId, {}, { statKeys: ['totalTurnsSpent'] });
      }

      // Mob-specific event modifiers for appliedToThisMob flag (reuse cached events + family lookup)
      const zoneMobBadges = zoneMobFamilyId
        ? filterEventModifiers(zoneCombatZoneEvents, zoneCombatWorldEvents, { mobFamilyId: zoneMobFamilyId })
        : [];

      const combatLog = await prisma.activityLog.create({
        data: {
          playerId,
          activityType: 'combat',
          turnsSpent: COMBAT_CONSTANTS.ENCOUNTER_TURN_COST,
          result: {
            zoneId,
            zoneName: zone.name,
            mobTemplateId: prefixedMob.id,
            mobName: baseMob.name,
            mobPrefix,
            mobDisplayName: prefixedMob.mobDisplayName,
            source: 'zone_combat',
            encounterSiteId: null,
            encounterSiteCleared: false,
            attackSkill,
            outcome: combatResult.outcome,
            playerMaxHp: combatResult.combatantAMaxHp,
            mobMaxHp: combatResult.combatantBMaxHp,
            log: combatResult.log,
            potionsConsumed: combatResult.potionsConsumed,
            rewards: {
              xp: xpAwarded,
              baseXp,
              loot: lootWithNames,
              siteCompletion: null,
              durabilityLost,
              skillXp: xpGrant
                ? serializeXpGrant(xpGrant)
                : null,
            },
            eventModifiers: zoneMobBadges,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      res.json({
        logId: combatLog.id,
        turns: turnSpend,
        combat: {
          zoneId,
          mobTemplateId: prefixedMob.id,
          mobPrefix,
          mobName: baseMob.name,
          mobDisplayName: prefixedMob.mobDisplayName,
          encounterSiteId: null,
          encounterSiteCleared: false,
          attackSkill,
          outcome: combatResult.outcome,
          playerMaxHp: combatResult.combatantAMaxHp,
          mobMaxHp: combatResult.combatantBMaxHp,
          log: combatResult.log,
          playerHpRemaining: combatResult.combatantAHpRemaining,
          potionsConsumed: combatResult.potionsConsumed,
          fleeResult: fleeResult
            ? {
                outcome: fleeResult.outcome,
                remainingHp: fleeResult.remainingHp,
                goldLost: fleeResult.goldLost,
                isRecovering: fleeResult.outcome === 'knockout',
                recoveryCost: fleeResult.recoveryCost,
              }
            : null,
          ...(respawnedTo ? { respawnedTo } : {}),
        },
        rewards: {
          xp: xpAwarded,
          loot: lootWithNames,
          siteCompletion: null,
          durabilityLost,
          skillXp: xpGrant
            ? serializeXpGrant(xpGrant)
            : null,
        },
        pendingLootSessionId,
        explorationProgress: {
          turnsExplored: explorationProgress.turnsExplored,
          percent: explorationProgress.percent,
          turnsToExplore: explorationProgress.turnsToExplore,
        },
        activeEvents: activeEventEffects.length > 0
          ? tagEventsWithApplicability(activeEventEffects, zoneMobBadges)
          : undefined,
      });
  }));
}
