import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { prisma, type MobTemplate as PrismaMobTemplate } from '@pocketrealm/database';
import { createActivityLog } from '../../services/activityLogService';
import {
  applyMobEventModifiers,
  applyMobPrefix,
  buildPlayerCombatStats,
  runTemplateCombat,
  mobToTemplateCombatant,
  calculateFleeResult,
  rollMobPrefix,
  filterAndWeightMobsByTier,
  selectTierWithBleedthrough,
} from '@pocketrealm/game-engine';
import {
  COMBAT_CONSTANTS,
  DURABILITY_CONSTANTS,
  ZONE_EXPLORATION_CONSTANTS,
  type LootDrop,
  type MobTemplate,
  type QuestProgressUpdate,
} from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { enrichLootWithNames } from '../../services/lootService';
import type { LootDropWithName } from '../../services/lootService';
import { spendPlayerTurnsTx } from '../../services/turnBankService';
import type { GrantXpResult } from '../../services/xpService';
import { degradeEquippedDurability } from '../../services/durabilityService';
import { setAllResources } from '../../services/resourceService';
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
import { deductConsumedPotions } from '../../services/potionService';
import type { AttackSkill } from '../../services/combatStatsService';
import { getExplorationPercent } from '../../services/zoneExplorationService';
import { incrementStats } from '../../services/statsService';
import { mapTemplateCombatLog } from '../../services/combatLogMapper';
import { serializeXpGrant, toMobTemplate, assertCanAct, assertInZone, trackAchievements, handleCombatDefeat, buildPveCombatOptions } from '../../utils/routeHelpers.js';
import { getCombatBuffs, applyCombatBuffs, consumeCombatBuffs, buildCombatBuffBadges } from '../../services/buffService';
import { preparePlayerForCombat, buildPlayerTemplateCombatant, applyGuildCombatModifiers, processCombatVictoryRewards } from '../../services/combatOrchestrationService';
import { checkActivityLockout } from '../../services/expeditionLockoutService';
import { buildStateUpdates, fetchItemDTOs, fetchMaterialTotals } from '../../services/stateUpdateHelpers.js';
import {
  startSchema,
  pickWeighted,
} from './helpers';
import { getCachedMobTemplatesByZone } from '../../services/staticDataCacheService';



export function registerStartRoutes(router: Router): void {
  /**
   * POST /api/v1/combat/start
   * Spend turns and run zone combat (single mob).
   * Encounter site combat uses dedicated routes in sites.ts.
   */
  router.post('/start', asyncHandler(async (req, res) => {
      const playerId = req.player!.playerId;
      await checkActivityLockout(playerId);
      const body = startSchema.parse(req.body);

      const hpState = await assertCanAct(playerId);
      if (hpState.currentHp <= 0) {
        throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
      }

      const zoneId = body.zoneId;
      if (!zoneId) {
        throw new AppError(400, 'zoneId is required', 'INVALID_REQUEST');
      }

      await assertInZone(playerId, zoneId);

      const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new AppError(404, 'Zone not found', 'NOT_FOUND');
      }

      const explorationProgress = await getExplorationPercent(playerId, zoneId);

      let mob: PrismaMobTemplate | null = null;

      if (body.mobTemplateId) {
        const found = await prisma.mobTemplate.findUnique({ where: { id: body.mobTemplateId } });
        if (!found || found.zoneId !== zoneId) {
          throw new AppError(400, 'Invalid mobTemplateId for this zone', 'INVALID_MOB');
        }
        mob = found;
      } else {
        const mobs = await getCachedMobTemplatesByZone(zoneId);
        const zoneTiers = zone.explorationTiers as Record<string, number> | null;
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
          explorationTier: m.explorationTier ?? 1,
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
        mob = picked;
      }

      let mobPrefix = rollMobPrefix();

      const requestedAttackSkill: AttackSkill | null = body.attackSkill ?? null;

      // Prepare player combat data + zone events + mob family lookup in parallel
      const baseMob = toMobTemplate(mob!);
      const [combatPrep, zoneCombatZoneEvents, zoneCombatWorldEvents, zoneMobFamilyRow] = await Promise.all([
        preparePlayerForCombat(playerId, { requestedAttackSkill, maxHp: hpState.maxHp }),
        getActiveEventsForZone(zoneId),
        getActiveWorldWideEvents(),
        prisma.mobFamilyMember.findFirst({
          where: { mobTemplateId: baseMob.id },
          select: { mobFamilyId: true },
        }),
      ]);
      const { attackSkill, attackLevel, progression, equipmentStats, guildMods, perActionScaling, playerTemplate, potionPool, resources, unlockedActions } = combatPrep;

      const zoneMobFamilyId: string | undefined = zoneMobFamilyRow?.mobFamilyId ?? undefined;
      const zoneModifiers = computeZoneModifiers(zoneCombatZoneEvents, zoneCombatWorldEvents, zoneMobFamilyId ? { mobFamilyId: zoneMobFamilyId } : undefined);
      const activeEventEffects = computeEventSummaries(zoneCombatZoneEvents, zoneCombatWorldEvents);
      const modifiedMob = applyMobEventModifiers(baseMob, zoneModifiers);
      const prefixedMob = applyMobPrefix(modifiedMob, mobPrefix);
      mobPrefix = prefixedMob.mobPrefix;

      // Quest shop combat buffs
      const zoneCombatBuffs = await getCombatBuffs(playerId);

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

      applyGuildCombatModifiers(playerStats, guildMods);

      // Apply quest shop combat buffs
      applyCombatBuffs(playerStats, zoneCombatBuffs);

      // Persisted mob reencounter
      let persistedMobId: string | null = null;
      let mobHpOverride: { currentHp: number; maxHp: number } | null = null;
      const persisted = await checkPersistedMobReencounter(playerId, zoneId, prefixedMob.id);
      if (persisted) {
        persistedMobId = persisted.id;
        mobHpOverride = { currentHp: persisted.currentHp, maxHp: persisted.maxHp };
      }

      const finalMob = mobHpOverride ? { ...prefixedMob, ...mobHpOverride } : prefixedMob;

      // Build potion pool into combat options
      const combatOptions = buildPveCombatOptions(potionPool);

      const playerCombatant = buildPlayerTemplateCombatant({
        playerId, username: req.player!.username, playerStats, template: playerTemplate,
        stamina: resources.stamina, maxStamina: resources.maxStamina, staminaRegenPerRound: resources.staminaRegenPerRound,
        mana: resources.mana, maxMana: resources.maxMana, manaRegenPerRound: resources.manaRegenPerRound,
        unlockedActions,
        perActionScaling,
      });
      const mobCombatant = mobToTemplateCombatant(finalMob);

      const combatResult = runTemplateCombat(playerCombatant, mobCombatant, combatOptions);

      const zoneTxResult = await prisma.$transaction(async (tx) => {
        const spent = await spendPlayerTurnsTx(tx, playerId, COMBAT_CONSTANTS.ENCOUNTER_TURN_COST);
        const potionDeductResult = await deductConsumedPotions(playerId, combatResult.potionsConsumed, tx);
        return { turnSpend: spent, potionDeductResult };
      });
      const turnSpend = zoneTxResult.turnSpend;
      const zonePotionDeductResult = zoneTxResult.potionDeductResult;

      let loot: LootDrop[] = [];
      let pendingLootSessionId: string | null = null;
      let xpGrants: GrantXpResult[] = [];
      let zoneQuestProgress: QuestProgressUpdate[] = [];
      const zoneDurabilityMult = prefixedMob.mobPrefix
        ? DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.elite
        : DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER.default;
      const durabilityLost = zoneCombatBuffs.durabilityShield > 0
        ? []
        : await degradeEquippedDurability(playerId, combatResult.log, 'combatantA', zoneDurabilityMult);
      let fleeResult = null as null | ReturnType<typeof calculateFleeResult>;
      let respawnedTo: { townId: string; townName: string } | null = null;

      const baseXp = combatResult.outcome === 'victory' ? prefixedMob.xpReward : 0;
      const xpAwarded = Math.max(0, baseXp);

      if (combatResult.outcome === 'victory') {
        await setAllResources(
          playerId,
          combatResult.combatantAHpRemaining,
          combatResult.combatantAStaminaRemaining,
          combatResult.combatantAManaRemaining,
        );
        const rewards = await processCombatVictoryRewards({
          playerId,
          mob: prefixedMob,
          attackSkill,
          damageByScalingStat: combatResult.damageByScalingStat,
          resourceCostByScalingStat: combatResult.resourceCostByScalingStat,
          guildXpBoost: guildMods.xpBoost,

          includeBestiary: false, // zone combat has its own bestiary logic (upserts on all outcomes)
        });
        loot = rewards.loot;
        pendingLootSessionId = rewards.pendingLootSessionId;
        xpGrants = rewards.xpGrants;
        zoneQuestProgress = rewards.questProgress;
      } else if (combatResult.outcome === 'defeat') {
        await setAllResources(
          playerId,
          combatResult.combatantAHpRemaining,
          combatResult.combatantAStaminaRemaining,
          combatResult.combatantAManaRemaining,
        );
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

      // Consume quest shop combat buffs (regardless of outcome)
      if (zoneCombatBuffs.damageBoost > 0 || zoneCombatBuffs.defenceBoost > 0 || zoneCombatBuffs.durabilityShield > 0) {
        await prisma.$transaction(async (tx) => {
          await consumeCombatBuffs(tx, playerId, zoneCombatBuffs);
        });
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
        await prisma.playerBestiaryPrefix.upsert({
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
        if (xpGrants.some(g => g.newLevel > (g.characterLevelBefore ?? 0))) achievementKeys.push('highestSkillLevel');
        if (xpGrants.some(g => g.characterLeveledUp)) achievementKeys.push('highestCharacterLevel');

        await trackAchievements(playerId, {}, { statKeys: achievementKeys, familyIds });
      } else {
        await trackAchievements(playerId, {}, { statKeys: ['totalTurnsSpent'] });
      }

      // Mob-specific event modifiers for appliedToThisMob flag (reuse cached events + family lookup)
      const zoneMobBadges = zoneMobFamilyId
        ? filterEventModifiers(zoneCombatZoneEvents, zoneCombatWorldEvents, { mobFamilyId: zoneMobFamilyId })
        : [];

      const combatLog = await createActivityLog({
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
          log: mapTemplateCombatLog(combatResult.log),
          potionsConsumed: combatResult.potionsConsumed,
          rewards: {
            xp: xpAwarded,
            baseXp,
            loot: lootWithNames,
            siteCompletion: null,
            durabilityLost,
            skillXpGrants: xpGrants.map(serializeXpGrant),
          },
          eventModifiers: zoneMobBadges,
        },
      });

      // --- Build stateUpdates ---
      const zoneDamagedItemIds = [...new Set(durabilityLost.map(d => d.itemId))];
      const zoneUpdatedItemIds = [...new Set([...zoneDamagedItemIds, ...zonePotionDeductResult.partiallyConsumedIds])];
      const [zoneStateUpdates, zoneInventoryUpdated, zoneMaterialTotals] = await Promise.all([
        buildStateUpdates(playerId, ['hp', 'skills', 'resources', 'characterProgression', 'buffs']),
        fetchItemDTOs(zoneUpdatedItemIds),
        fetchMaterialTotals(playerId),
      ]);

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
          playerStartStamina: resources.stamina,
          playerStartMana: resources.mana,
          mobMaxHp: combatResult.combatantBMaxHp,
          log: mapTemplateCombatLog(combatResult.log),
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
          skillXpGrants: xpGrants.map(serializeXpGrant),
        },
        pendingLootSessionId,
        explorationProgress: {
          turnsExplored: explorationProgress.turnsExplored,
          percent: explorationProgress.percent,
          turnsToExplore: explorationProgress.turnsToExplore,
        },
        activeEvents: (() => {
          const combatBuffBadges = buildCombatBuffBadges(zoneCombatBuffs);
          const all = [
            ...tagEventsWithApplicability(activeEventEffects, zoneMobBadges),
            ...combatBuffBadges,
          ];
          return all.length > 0 ? all : undefined;
        })(),
        ...(zoneQuestProgress.length > 0 ? { questProgress: zoneQuestProgress } : {}),
        stateUpdates: {
          ...zoneStateUpdates,
          ...(zonePotionDeductResult.fullyConsumedIds.length > 0 ? { inventoryRemoved: zonePotionDeductResult.fullyConsumedIds } : {}),
          ...(zoneInventoryUpdated.length > 0 ? { inventoryUpdated: zoneInventoryUpdated } : {}),
          materialTotals: zoneMaterialTotals,
        },
      });
  }));
}
