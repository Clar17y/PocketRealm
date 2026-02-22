import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import {
  applyMobEventModifiers,
  applyMobPrefix,
  buildPlayerCombatStats,
  calculateFleeResult,
  estimateExploration,
  filterAndWeightMobsByTier,
  mobToCombatantStats,
  rollMobPrefix,
  runCombat,
  generateRoomAssignments,
  selectTierWithBleedthrough,
  simulateExploration,
  validateExplorationTurns,
} from '@adventure/game-engine';
import {
  EXPLORATION_CONSTANTS,
  WORLD_EVENT_TEMPLATES,
  WORLD_EVENT_CONSTANTS,
  ZONE_EXPLORATION_CONSTANTS,
  type Combatant,
  type CombatOptions,
  type MobTemplate,
  type PotionConsumed,
} from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { refundPlayerTurns, spendPlayerTurns, spendPlayerTurnsTx } from '../services/turnBankService';
import { applyGuildTaxTx } from '../services/guildTaxService';
import { getPlayerGuildId } from '../services/guildService';
import { incrementContractProgress } from '../services/guildContractService';
import { enterRecoveringState, getHpState, setHp } from '../services/hpService';
import { rollAndGrantLoot } from '../services/lootService';
import { grantSkillXp } from '../services/xpService';
import { degradeEquippedDurability } from '../services/durabilityService';
import { getEquipmentStats } from '../services/equipmentService';
import { getPlayerProgressionState } from '../services/attributesService';
import { discoverZone, getUndiscoveredNeighborZones, respawnToHomeTown } from '../services/zoneDiscoveryService';
import { addExplorationTurns, calculateExplorationPercent, getExplorationPercent } from '../services/zoneExplorationService';
import { getActiveZoneModifiers, spawnWorldEvent } from '../services/worldEventService';
import { createBossEncounter } from '../services/bossEncounterService';
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { getIo } from '../socket';
import { emitAchievementNotifications } from '../services/achievementService';
import { emitSystemMessage } from '../services/systemMessageService';
import { persistMobHp } from '../services/persistedMobService';
import { buildPotionPool, deductConsumedPotions } from '../services/potionService';
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from '../services/combatStatsService';
import { incrementStats } from '../services/statsService';
import { checkAchievements } from '../services/achievementService';

export const explorationRouter = Router();

explorationRouter.use(authenticate);

const prismaAny = prisma as unknown as any;

const estimateQuerySchema = z.object({
  turns: z.coerce.number().int(),
  zoneId: z.string().uuid().optional(),
});

const startSchema = z.object({
  zoneId: z.string().uuid(),
  turns: z.number().int(),
});

type EncounterSiteSize = 'small' | 'medium' | 'large';
type EncounterMobRole = 'trash' | 'elite' | 'boss';
type EncounterMobStatus = 'alive' | 'defeated' | 'decayed';
type NarrativeEventType =
  | 'ambush_victory'
  | 'ambush_defeat'
  | 'encounter_site'
  | 'resource_node'
  | 'hidden_cache'
  | 'zone_exit'
  | 'event_discovery';

interface EncounterMobSlot {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;
}

interface NarrativeEvent {
  turn: number;
  type: NarrativeEventType;
  description: string;
  details?: Record<string, unknown>;
}

interface ZoneFamilyMember {
  role: string;
  mobTemplate: {
    id: string;
    name: string;
    zoneId: string;
    explorationTier: number;
  };
}

interface ZoneFamilyRow {
  zoneId: string;
  mobFamilyId: string;
  discoveryWeight: number;
  minSize: string;
  maxSize: string;
  mobFamily: {
    id: string;
    name: string;
    siteNounSmall: string;
    siteNounMedium: string;
    siteNounLarge: string;
    members: ZoneFamilyMember[];
  };
}

interface PendingResourceDiscovery {
  turnOccurred: number;
  resourceNodeId: string;
  resourceType: string;
  capacity: number;
  sizeName: string;
}

interface PendingEncounterSiteDiscovery {
  turnOccurred: number;
  mobFamilyId: string;
  siteName: string;
  size: EncounterSiteSize;
  mobs: EncounterMobSlot[];
}

interface PendingAmbushCombatLog {
  turnsSpent: number;
  result: Prisma.InputJsonValue;
}

function pickWeighted<T>(
  items: T[],
  weightKey: string,
  defaultWeight = 100
): T | null {
  const getWeight = (item: T): number => {
    const value = (item as Record<string, unknown>)[weightKey];
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultWeight;
  };

  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= Math.max(0, getWeight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getNodeSizeName(capacity: number, maxCapacity: number): string {
  const ratio = capacity / maxCapacity;
  if (ratio <= 0.25) return 'Tiny';
  if (ratio <= 0.5) return 'Small';
  if (ratio <= 0.75) return 'Medium';
  if (ratio <= 0.9) return 'Large';
  return 'Huge';
}

const ENCOUNTER_SIZE_ORDER: EncounterSiteSize[] = ['small', 'medium', 'large'];

function toEncounterSize(value: string): EncounterSiteSize | null {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return null;
}

function pickEncounterSize(minRaw: string, maxRaw: string): EncounterSiteSize {
  const minSize = toEncounterSize(minRaw) ?? 'small';
  const maxSize = toEncounterSize(maxRaw) ?? 'large';
  const minIndex = ENCOUNTER_SIZE_ORDER.indexOf(minSize);
  const maxIndex = ENCOUNTER_SIZE_ORDER.indexOf(maxSize);
  const start = Math.max(0, Math.min(minIndex, maxIndex));
  const end = Math.max(0, Math.max(minIndex, maxIndex));
  const allowed = ENCOUNTER_SIZE_ORDER.slice(start, end + 1);
  return allowed[randomIntInclusive(0, allowed.length - 1)] ?? 'small';
}

function getEncounterRange(size: EncounterSiteSize): { min: number; max: number } {
  if (size === 'small') return EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL;
  if (size === 'medium') return EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM;
  return EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE;
}

function getSiteName(
  familyName: string,
  size: EncounterSiteSize,
  nouns: { siteNounSmall: string; siteNounMedium: string; siteNounLarge: string }
): string {
  if (size === 'small') return `Small ${familyName} ${nouns.siteNounSmall}`;
  if (size === 'medium') return `${familyName} ${nouns.siteNounMedium}`;
  return `Large ${familyName} ${nouns.siteNounLarge}`;
}

function pickFamilyMemberByRole(
  members: ZoneFamilyMember[],
  role: EncounterMobRole,
  fallback: EncounterMobRole[] = []
): ZoneFamilyMember | null {
  const byRole = members.filter((member) => member.role === role);
  if (byRole.length > 0) {
    return byRole[randomIntInclusive(0, byRole.length - 1)] ?? null;
  }

  for (const fbRole of fallback) {
    const fallbackMembers = members.filter((member) => member.role === fbRole);
    if (fallbackMembers.length > 0) {
      return fallbackMembers[randomIntInclusive(0, fallbackMembers.length - 1)] ?? null;
    }
  }

  if (members.length === 0) return null;
  return members[randomIntInclusive(0, members.length - 1)] ?? null;
}

function buildEncounterSiteMobs(
  family: ZoneFamilyRow['mobFamily'],
  size: EncounterSiteSize,
  zoneId: string,
  explorationPercent: number = 100,
  zoneTiers: Record<string, number> | null = null,
): EncounterMobSlot[] {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

  // Determine current unlocked tier
  let currentTier = 0;
  for (const [tierStr, threshold] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    if (explorationPercent >= threshold && tier > currentTier) {
      currentTier = tier;
    }
  }
  if (currentTier === 0) return [];

  // Get ALL zone members (not filtered by tier)
  const zoneMembers = family.members
    .filter((member) => member.mobTemplate.zoneId === zoneId);
  if (zoneMembers.length === 0) return [];

  // Group members by tier
  const membersByTier = new Map<number, ZoneFamilyMember[]>();
  for (const member of zoneMembers) {
    const tier = member.mobTemplate.explorationTier ?? 1;
    if (!membersByTier.has(tier)) membersByTier.set(tier, []);
    membersByTier.get(tier)!.push(member);
  }

  // Pick a member at a bleedthrough-selected tier, falling back to lower tiers
  function pickMemberWithBleedthrough(
    role: EncounterMobRole,
    fallbackRoles: EncounterMobRole[],
  ): ZoneFamilyMember | null {
    const selectedTier = selectTierWithBleedthrough(currentTier, tiers);
    for (let t = selectedTier; t >= 1; t--) {
      const tierMembers = membersByTier.get(t) ?? [];
      if (tierMembers.length === 0) continue;
      const picked = pickFamilyMemberByRole(tierMembers, role, fallbackRoles);
      if (picked) return picked;
    }
    return pickFamilyMemberByRole(zoneMembers, role, fallbackRoles);
  }

  const { rooms, totalMobs } = generateRoomAssignments(size);

  // Role composition based on total mobs and site size
  let bossCount = 0;
  let eliteCount = 0;
  if (size === 'medium') eliteCount = 1;
  else if (size === 'large') { bossCount = 1; eliteCount = 2; }

  const trashCount = Math.max(0, totalMobs - eliteCount - bossCount);

  // Build role queue — trash first, elites/bosses last so they land in final rooms
  const roleQueue: EncounterMobRole[] = [
    ...Array(trashCount).fill('trash' as const),
    ...Array(eliteCount).fill('elite' as const),
    ...Array(bossCount).fill('boss' as const),
  ];

  // Assign mobs to rooms sequentially
  const mobs: EncounterMobSlot[] = [];
  let slot = 0;
  let roleIndex = 0;

  for (const room of rooms) {
    for (let i = 0; i < room.mobCount && roleIndex < roleQueue.length; i++) {
      const role = roleQueue[roleIndex]!;
      const fallbacks: EncounterMobRole[] = role === 'trash'
        ? ['elite', 'boss'] : role === 'elite'
        ? ['trash', 'boss'] : ['elite', 'trash'];

      const member = pickMemberWithBleedthrough(role, fallbacks);
      if (!member) { roleIndex++; continue; }

      mobs.push({
        slot: slot++,
        mobTemplateId: member.mobTemplate.id,
        role,
        prefix: rollMobPrefix(),
        status: 'alive',
        room: room.roomNumber,
      });
      roleIndex++;
    }
  }

  // Fallback: if no mobs were generated
  if (mobs.length === 0 && zoneMembers.length > 0) {
    const member = zoneMembers[0]!;
    mobs.push({
      slot: 0,
      mobTemplateId: member.mobTemplate.id,
      role: 'trash',
      prefix: rollMobPrefix(),
      status: 'alive',
      room: 1,
    });
  }

  return mobs;
}

/**
 * GET /api/v1/exploration/estimate?turns=123
 * Returns probability preview for exploration outcomes.
 */
explorationRouter.get('/estimate', async (req, res, next) => {
  try {
    const query = estimateQuerySchema.parse(req.query);

    const validation = validateExplorationTurns(query.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    let zoneExitChance: number | null = null;
    if (query.zoneId) {
      const zone = await prisma.zone.findUnique({
        where: { id: query.zoneId },
        select: { zoneExitChance: true },
      });
      if (zone) {
        zoneExitChance = zone.zoneExitChance;
      }
    }

    res.json({ estimate: estimateExploration(query.turns, zoneExitChance) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/exploration/start
 * Spend turns to explore a zone and return discovered outcomes.
 */
explorationRouter.post('/start', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = startSchema.parse(req.body);

    const hpState = await getHpState(playerId);
    if (hpState.isRecovering) {
      throw new AppError(400, 'Cannot explore while recovering', 'IS_RECOVERING');
    }
    if (hpState.currentHp <= 0) {
      throw new AppError(400, 'Cannot explore with 0 HP. Rest before exploring.', 'NO_HP');
    }

    const validation = validateExplorationTurns(body.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    const zone = await prisma.zone.findUnique({ where: { id: body.zoneId } });
    if (!zone) {
      throw new AppError(404, 'Zone not found', 'NOT_FOUND');
    }
    if (zone.zoneType === 'town') {
      throw new AppError(400, 'Cannot explore in towns. Travel to a wild zone first.', 'TOWN_ZONE');
    }

    const [mobTemplates, resourceNodes, zoneFamilies, progression, equipmentStats, mainHandAttackSkill] = await Promise.all([
      prisma.mobTemplate.findMany({ where: { zoneId: body.zoneId } }),
      prisma.resourceNode.findMany({ where: { zoneId: body.zoneId } }),
      prismaAny.zoneMobFamily.findMany({
        where: { zoneId: body.zoneId },
        include: {
          mobFamily: {
            include: {
              members: {
                include: {
                  mobTemplate: {
                    select: { id: true, name: true, zoneId: true, explorationTier: true },
                  },
                },
              },
            },
          },
        },
      }) as Promise<ZoneFamilyRow[]>,
      getPlayerProgressionState(playerId),
      getEquipmentStats(playerId),
      getMainHandAttackSkill(playerId),
    ]);

    const attackSkill: AttackSkill = mainHandAttackSkill ?? 'melee';
    const attackLevel = await getSkillLevel(playerId, attackSkill);

    const explorationProgress = await getExplorationPercent(playerId, body.zoneId);
    const zoneTiers = zone.explorationTiers as Record<string, number> | null;

    const undiscoveredNeighbors = await getUndiscoveredNeighborZones(playerId, body.zoneId);
    const effectiveExitChance = undiscoveredNeighbors.length > 0 ? zone.zoneExitChance : null;

    // Pre-fetch connection thresholds for zone exit gating (used inside the loop)
    const connectionThresholds = undiscoveredNeighbors.length > 0
      ? await prisma.zoneConnection.findMany({
          where: { fromId: body.zoneId },
          select: { toId: true, explorationThreshold: true },
        })
      : [];
    const thresholdByToId = new Map(connectionThresholds.map(c => [c.toId, c.explorationThreshold]));

    // Trigger lazy event scheduler
    await checkAndSpawnEvents(getIo());

    // Fetch zone modifiers from active world events
    const zoneModifiers = await getActiveZoneModifiers(body.zoneId);

    // Spend turns + guild tax atomically; effective exploration uses post-tax turns
    const { turnSpend, postTaxAmount } = await prisma.$transaction(async (tx) => {
      const spent = await spendPlayerTurnsTx(tx, playerId, body.turns);
      const tax = await applyGuildTaxTx(tx, playerId, body.turns);
      return { turnSpend: spent, postTaxAmount: tax.postTaxAmount };
    });

    const outcomes = simulateExploration(postTaxAmount, effectiveExitChance);

    const pendingResources: PendingResourceDiscovery[] = [];
    const pendingSites: PendingEncounterSiteDiscovery[] = [];
    const pendingCombatLogs: PendingAmbushCombatLog[] = [];
    const events: NarrativeEvent[] = [];

    const hiddenCaches: Array<{ turnOccurred: number }> = [];
    let zoneExitDiscovered = false;
    let wasKnockedOut = false;

    // Auto-potion setup for exploration ambushes
    const playerRecord = await prismaAny.player.findUnique({
      where: { id: playerId },
      select: { autoPotionThreshold: true },
    });
    const autoPotionThreshold = playerRecord?.autoPotionThreshold ?? 0;
    const potionPool = autoPotionThreshold > 0
      ? await buildPotionPool(playerId, hpState.maxHp)
      : [];
    const allPotionsConsumed: PotionConsumed[] = [];

    let currentHp = hpState.currentHp;
    let aborted = false;
    let abortedAtTurn: number | null = null;
    let respawnedTo: { townId: string; townName: string } | null = null;

    for (const outcome of outcomes) {
      if (aborted) break;

      if (outcome.type === 'ambush' && mobTemplates.length > 0) {
        const tieredMobs = filterAndWeightMobsByTier(
          mobTemplates.map(m => ({ ...m, explorationTier: m.explorationTier ?? 1 })),
          explorationProgress.percent,
          zoneTiers,
        );
        if (tieredMobs.length === 0) continue;

        // Apply tier bleedthrough: select a target tier, filter to it, fall back to lower tiers
        const highestUnlockedTier = Math.max(...tieredMobs.map(m => m.explorationTier));
        const targetTier = selectTierWithBleedthrough(highestUnlockedTier, zoneTiers);
        let candidates = tieredMobs.filter(m => m.explorationTier === targetTier);
        if (candidates.length === 0) {
          for (let t = targetTier - 1; t >= 1; t--) {
            candidates = tieredMobs.filter(m => m.explorationTier === t);
            if (candidates.length > 0) break;
          }
        }
        if (candidates.length === 0) candidates = tieredMobs;

        const mob = pickWeighted(candidates, 'encounterWeight') as typeof candidates[number] | null;
        if (!mob) continue;

        const baseMob: MobTemplate = {
          ...(mob as unknown as MobTemplate),
          spellPattern: Array.isArray((mob as { spellPattern: unknown }).spellPattern)
            ? ((mob as { spellPattern: unknown }).spellPattern as MobTemplate['spellPattern'])
            : [],
        };

        const modifiedMob = applyMobEventModifiers(baseMob, zoneModifiers);
        const prefixedMob = applyMobPrefix(modifiedMob, rollMobPrefix());
        const playerStats = buildPlayerCombatStats(
          currentHp,
          hpState.maxHp,
          {
            attackStyle: attackSkill,
            skillLevel: attackLevel,
            attributes: progression.attributes,
          },
          equipmentStats
        );

        let combatOptions: CombatOptions | undefined;
        if (autoPotionThreshold > 0 && potionPool.length > 0) {
          combatOptions = { autoPotionThreshold, potions: [...potionPool] };
        }

        const combatantA: Combatant = {
          id: playerId,
          name: req.player!.username,
          stats: playerStats,
        };
        const combatantB: Combatant = {
          id: prefixedMob.id,
          name: prefixedMob.mobDisplayName ?? prefixedMob.name,
          stats: mobToCombatantStats(prefixedMob),
          spells: prefixedMob.spellPattern,
        };
        const combatResult = runCombat(combatantA, combatantB, combatOptions);

        // Remove consumed potions from the shared pool
        for (const consumed of combatResult.potionsConsumed) {
          const idx = potionPool.findIndex(p => p.templateId === consumed.templateId);
          if (idx !== -1) potionPool.splice(idx, 1);
          allPotionsConsumed.push(consumed);
        }

        const durabilityLost = await degradeEquippedDurability(playerId);
        let loot: Array<{ itemTemplateId: string; quantity: number; rarity?: string }> = [];
        let xpGain = 0;
        let xpGrant: Awaited<ReturnType<typeof grantSkillXp>> | null = null;

        if (combatResult.outcome === 'victory') {
          currentHp = combatResult.combatantAHpRemaining;
          await setHp(playerId, currentHp);

          loot = await rollAndGrantLoot(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
          xpGrant = await grantSkillXp(playerId, attackSkill, prefixedMob.xpReward);
          xpGain = xpGrant.xpResult.xpAfterEfficiency;

          await prisma.playerBestiary.upsert({
            where: { playerId_mobTemplateId: { playerId, mobTemplateId: prefixedMob.id } },
            create: {
              playerId,
              mobTemplateId: prefixedMob.id,
              kills: 1,
            },
            update: { kills: { increment: 1 } },
          });

          if (prefixedMob.mobPrefix) {
            await prismaAny.playerBestiaryPrefix.upsert({
              where: {
                playerId_mobTemplateId_prefix: {
                  playerId,
                  mobTemplateId: prefixedMob.id,
                  prefix: prefixedMob.mobPrefix,
                },
              },
              create: {
                playerId,
                mobTemplateId: prefixedMob.id,
                prefix: prefixedMob.mobPrefix,
                kills: 1,
              },
              update: { kills: { increment: 1 } },
            });
          }

          const skillXpReward = xpGrant
            ? {
                skillType: xpGrant.skillType,
                ...xpGrant.xpResult,
                newTotalXp: xpGrant.newTotalXp,
                newDailyXpGained: xpGrant.newDailyXpGained,
                characterXpGain: xpGrant.characterXpGain,
                characterXpAfter: xpGrant.characterXpAfter,
                characterLevelBefore: xpGrant.characterLevelBefore,
                characterLevelAfter: xpGrant.characterLevelAfter,
                attributePointsAfter: xpGrant.attributePointsAfter,
                characterLeveledUp: xpGrant.characterLeveledUp,
              }
            : null;

          pendingCombatLogs.push({
            turnsSpent: 0,
            result: {
              zoneId: body.zoneId,
              zoneName: zone.name,
              mobTemplateId: prefixedMob.id,
              mobName: baseMob.name,
              mobPrefix: prefixedMob.mobPrefix,
              mobDisplayName: prefixedMob.mobDisplayName,
              source: 'exploration_ambush',
              encounterSiteId: null,
              attackSkill,
              outcome: combatResult.outcome,
              playerMaxHp: combatResult.combatantAMaxHp,
              mobMaxHp: combatResult.combatantBMaxHp,
              log: combatResult.log,
              rewards: {
                xp: prefixedMob.xpReward,
                baseXp: prefixedMob.xpReward,
                loot,
                durabilityLost,
                skillXp: skillXpReward,
              },
            } as unknown as Prisma.InputJsonValue,
          });

          events.push({
            turn: outcome.turnOccurred,
            type: 'ambush_victory',
            description: `A ${prefixedMob.mobDisplayName} ambushed you - you defeated it! (+${xpGain} XP)`,
            details: {
              mobTemplateId: prefixedMob.id,
              mobName: baseMob.name,
              mobPrefix: prefixedMob.mobPrefix,
              mobDisplayName: prefixedMob.mobDisplayName,
              outcome: combatResult.outcome,
              playerMaxHp: combatResult.combatantAMaxHp,
              mobMaxHp: combatResult.combatantBMaxHp,
              log: combatResult.log,
              playerHpRemaining: currentHp,
              xp: xpGain,
              loot,
              durabilityLost,
            },
          });
        } else {
          const fleeResult = calculateFleeResult({
            evasionLevel: progression.attributes.evasion,
            mobLevel: prefixedMob.level,
            maxHp: hpState.maxHp,
            currentGold: 0, // TODO: wire gold when economy is implemented
          });

          if (fleeResult.outcome === 'knockout') {
            currentHp = 0;
            wasKnockedOut = true;
            await enterRecoveringState(playerId, hpState.maxHp);
            respawnedTo = await respawnToHomeTown(playerId);
          } else {
            currentHp = fleeResult.remainingHp;
            await setHp(playerId, currentHp);
          }

          // Persist the mob's remaining HP for potential reencounter
          if (combatResult.combatantBHpRemaining > 0) {
            await persistMobHp(playerId, prefixedMob.id, body.zoneId, combatResult.combatantBHpRemaining, prefixedMob.hp);
          }

          const defeatDescription = fleeResult.outcome === 'knockout'
            ? `A ${prefixedMob.mobDisplayName} ambushed you - you were defeated and knocked out!`
            : `A ${prefixedMob.mobDisplayName} ambushed you - you were defeated but escaped with ${fleeResult.remainingHp} HP.`;

          pendingCombatLogs.push({
            turnsSpent: 0,
            result: {
              zoneId: body.zoneId,
              zoneName: zone.name,
              mobTemplateId: prefixedMob.id,
              mobName: baseMob.name,
              mobPrefix: prefixedMob.mobPrefix,
              mobDisplayName: prefixedMob.mobDisplayName,
              source: 'exploration_ambush',
              encounterSiteId: null,
              attackSkill,
              outcome: combatResult.outcome,
              playerMaxHp: combatResult.combatantAMaxHp,
              mobMaxHp: combatResult.combatantBMaxHp,
              log: combatResult.log,
              rewards: {
                xp: 0,
                baseXp: 0,
                loot: [],
                durabilityLost,
                skillXp: null,
              },
            } as unknown as Prisma.InputJsonValue,
          });

          events.push({
            turn: outcome.turnOccurred,
            type: 'ambush_defeat',
            description: defeatDescription,
            details: {
              mobTemplateId: prefixedMob.id,
              mobName: baseMob.name,
              mobPrefix: prefixedMob.mobPrefix,
              mobDisplayName: prefixedMob.mobDisplayName,
              outcome: combatResult.outcome,
              playerMaxHp: combatResult.combatantAMaxHp,
              mobMaxHp: combatResult.combatantBMaxHp,
              log: combatResult.log,
              playerHpRemaining: currentHp,
              fleeResult: {
                outcome: fleeResult.outcome,
                remainingHp: fleeResult.remainingHp,
                goldLost: fleeResult.goldLost,
                recoveryCost: fleeResult.recoveryCost,
              },
              durabilityLost,
            },
          });

          aborted = true;
          abortedAtTurn = outcome.turnOccurred;
        }

        continue;
      }

      if (outcome.type === 'encounter_site' && zoneFamilies.length > 0) {
        const pickedFamily = pickWeighted(zoneFamilies, 'discoveryWeight') as ZoneFamilyRow | null;
        if (!pickedFamily) continue;

        const size = pickEncounterSize(pickedFamily.minSize, pickedFamily.maxSize);
        const mobs = buildEncounterSiteMobs(pickedFamily.mobFamily, size, body.zoneId, explorationProgress.percent, zoneTiers);
        if (mobs.length === 0) continue;

        const siteName = getSiteName(pickedFamily.mobFamily.name, size, pickedFamily.mobFamily);

        pendingSites.push({
          turnOccurred: outcome.turnOccurred,
          mobFamilyId: pickedFamily.mobFamilyId,
          siteName,
          size,
          mobs,
        });

        events.push({
          turn: outcome.turnOccurred,
          type: 'encounter_site',
          description: `You stumbled into a ${siteName} (${mobs.length} mobs inside).`,
          details: {
            mobFamilyId: pickedFamily.mobFamilyId,
            mobFamilyName: pickedFamily.mobFamily.name,
            siteName,
            size,
            totalMobs: mobs.length,
          },
        });

        continue;
      }

      if (outcome.type === 'resource_node' && resourceNodes.length > 0) {
        const nodeTemplate = pickWeighted(resourceNodes, 'discoveryWeight') as typeof resourceNodes[number] | null;
        if (!nodeTemplate) continue;

        const capacity = randomIntInclusive(nodeTemplate.minCapacity, nodeTemplate.maxCapacity);
        const sizeName = getNodeSizeName(capacity, nodeTemplate.maxCapacity);

        pendingResources.push({
          turnOccurred: outcome.turnOccurred,
          resourceNodeId: nodeTemplate.id,
          resourceType: nodeTemplate.resourceType,
          capacity,
          sizeName,
        });

        events.push({
          turn: outcome.turnOccurred,
          type: 'resource_node',
          description: `You discovered a ${sizeName} ${nodeTemplate.resourceType.replace(/_/g, ' ')} node (${capacity} capacity).`,
          details: {
            resourceNodeId: nodeTemplate.id,
            resourceType: nodeTemplate.resourceType,
            sizeName,
            capacity,
          },
        });

        continue;
      }

      if (outcome.type === 'hidden_cache') {
        hiddenCaches.push({ turnOccurred: outcome.turnOccurred });
        events.push({
          turn: outcome.turnOccurred,
          type: 'hidden_cache',
          description: 'You found a hidden cache.',
          details: {},
        });
        continue;
      }

      if (outcome.type === 'zone_exit' && undiscoveredNeighbors.length > 0) {
        const eligibleNeighbors = undiscoveredNeighbors.filter(n => {
          const threshold = thresholdByToId.get(n.id) ?? 0;
          return explorationProgress.percent >= threshold;
        });

        if (eligibleNeighbors.length === 0) continue;

        const neighborIndex = randomIntInclusive(0, eligibleNeighbors.length - 1);
        const neighbor = eligibleNeighbors[neighborIndex]!;
        await discoverZone(playerId, neighbor.id);
        // Remove discovered neighbor so subsequent zone_exit rolls don't pick it again
        const origIndex = undiscoveredNeighbors.findIndex(n => n.id === neighbor.id);
        if (origIndex !== -1) undiscoveredNeighbors.splice(origIndex, 1);

        zoneExitDiscovered = true;
        events.push({
          turn: outcome.turnOccurred,
          type: 'zone_exit',
          description: `You discovered a path leading to **${neighbor.name}**.`,
          details: {
            discoveredZoneId: neighbor.id,
            discoveredZoneName: neighbor.name,
          },
        });
      }

      if (outcome.type === 'event_discovery') {
        // Roll for boss discovery first
        if (Math.random() < WORLD_EVENT_CONSTANTS.BOSS_DISCOVERY_CHANCE) {
          const activeBosses = await prisma.bossEncounter.count({
            where: { status: { in: ['waiting', 'in_progress'] } },
          });

          if (activeBosses < WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS) {
            const familyIds = zoneFamilies.map((f: ZoneFamilyRow) => f.mobFamilyId);
            const bossMobs = await prisma.mobTemplate.findMany({
              where: {
                isBoss: true,
                familyMembers: { some: { mobFamilyId: { in: familyIds } } },
              },
            });

            if (bossMobs.length > 0) {
              const bossMob = bossMobs[Math.floor(Math.random() * bossMobs.length)]!;
              const bossHp = bossMob.bossBaseHp ?? bossMob.hp;

              // Create a boss world event with no expiry (lasts until defeated)
              const bossEvent = await prisma.worldEvent.create({
                data: {
                  type: 'boss',
                  zoneId: body.zoneId,
                  title: `${bossMob.name} Awakens`,
                  description: `A powerful ${bossMob.name} has appeared in ${zone.name}!`,
                  effectType: 'damage_up',
                  effectValue: 0,
                  expiresAt: null,
                  status: 'active',
                  createdBy: 'player_discovery',
                },
                include: { zone: { select: { name: true } } },
              });

              const bossEncounter = await createBossEncounter(bossEvent.id, bossMob.id, bossHp);

              await emitSystemMessage(
                getIo(),
                'world',
                'world',
                `A boss has appeared in ${zone.name}: ${bossMob.name} Awakens!`,
              );
              await emitSystemMessage(
                getIo(),
                'zone',
                `zone:${body.zoneId}`,
                `${bossMob.name} has awakened! Rally adventurers to defeat it.`,
              );

              events.push({
                turn: outcome.turnOccurred,
                type: 'event_discovery',
                description: `You discovered a boss: **${bossMob.name} Awakens** — a powerful ${bossMob.name} has appeared in ${zone.name}!`,
                details: {
                  eventId: bossEvent.id,
                  eventTitle: `${bossMob.name} Awakens`,
                  bossEncounterId: bossEncounter.id,
                  bossMobName: bossMob.name,
                },
              });

              continue;
            }
          }
        }

        // Pick a random zone-scoped, zone-wide template (no world-wide or targeted)
        const eligible = WORLD_EVENT_TEMPLATES.filter(
          (t) => t.scope === 'zone' && t.targeting === 'zone',
        );
        if (eligible.length > 0) {
          const template = eligible[randomIntInclusive(0, eligible.length - 1)]!;
          const durationHours = template.type === 'resource'
            ? WORLD_EVENT_CONSTANTS.RESOURCE_EVENT_DURATION_HOURS
            : WORLD_EVENT_CONSTANTS.MOB_EVENT_DURATION_HOURS;
          const spawned = await spawnWorldEvent({
            type: template.type,
            zoneId: body.zoneId,
            title: template.title,
            description: template.description,
            effectType: template.effectType,
            effectValue: template.effectValue,
            durationHours,
            createdBy: 'player_discovery',
          });

          if (spawned) {
            await emitSystemMessage(
              getIo(),
              'world',
              'world',
              `New event in ${zone.name}: ${spawned.title} — ${spawned.description}`,
            );
            events.push({
              turn: outcome.turnOccurred,
              type: 'event_discovery',
              description: `You triggered a world event: **${spawned.title}** — ${spawned.description}`,
              details: { eventId: spawned.id, eventTitle: spawned.title },
            });
          }
        }
      }
    }

    // Deduct all potions consumed across ambushes
    await deductConsumedPotions(playerId, allPotionsConsumed);

    const spentTurns = aborted && abortedAtTurn ? abortedAtTurn : body.turns;
    const explorationBefore = await getExplorationPercent(playerId, body.zoneId);
    await addExplorationTurns(playerId, body.zoneId, spentTurns);
    const explorationAfter = await getExplorationPercent(playerId, body.zoneId);
    const zoneJustFullyExplored = explorationBefore.percent < 100 && explorationAfter.percent >= 100;

    const refundAmount = aborted && abortedAtTurn ? Math.max(0, body.turns - abortedAtTurn) : 0;
    const refundedTurns = refundAmount > 0 ? await refundPlayerTurns(playerId, refundAmount) : null;

    const persisted = await prisma.$transaction(async (tx) => {
      const txAny = tx as unknown as any;
      const createdResourceDiscoveries: Array<{
        turnOccurred: number;
        playerNodeId: string;
        resourceNodeId: string;
        resourceType: string;
        capacity: number;
        sizeName: string;
      }> = [];

      for (const discovery of pendingResources) {
        const playerNode = await tx.playerResourceNode.create({
          data: {
            playerId,
            resourceNodeId: discovery.resourceNodeId,
            remainingCapacity: discovery.capacity,
            decayedCapacity: 0,
          },
          select: { id: true },
        });

        createdResourceDiscoveries.push({
          turnOccurred: discovery.turnOccurred,
          playerNodeId: playerNode.id,
          resourceNodeId: discovery.resourceNodeId,
          resourceType: discovery.resourceType,
          capacity: discovery.capacity,
          sizeName: discovery.sizeName,
        });
      }

      const createdEncounterSites: Array<{
        turnOccurred: number;
        encounterSiteId: string;
        mobFamilyId: string;
        siteName: string;
        size: EncounterSiteSize;
        totalMobs: number;
        discoveredAt: string;
      }> = [];

      for (const discovery of pendingSites) {
        const distinctRooms = new Set(discovery.mobs.map(m => m.room)).size;
        const site = await txAny.encounterSite.create({
          data: {
            playerId,
            zoneId: body.zoneId,
            mobFamilyId: discovery.mobFamilyId,
            name: discovery.siteName,
            size: discovery.size,
            mobs: { mobs: discovery.mobs },
            ...(distinctRooms <= 1 ? { clearStrategy: 'full_clear', fullClearActive: true } : {}),
          },
          select: {
            id: true,
            discoveredAt: true,
          },
        });

        createdEncounterSites.push({
          turnOccurred: discovery.turnOccurred,
          encounterSiteId: site.id,
          mobFamilyId: discovery.mobFamilyId,
          siteName: discovery.siteName,
          size: discovery.size,
          totalMobs: discovery.mobs.length,
          discoveredAt: site.discoveredAt.toISOString(),
        });
      }

      for (const combatLog of pendingCombatLogs) {
        await tx.activityLog.create({
          data: {
            playerId,
            activityType: 'combat',
            turnsSpent: combatLog.turnsSpent,
            result: combatLog.result,
          },
        });
      }

      const explorationLog = await tx.activityLog.create({
        data: {
          playerId,
          activityType: 'exploration',
          turnsSpent: body.turns,
          result: {
            zoneId: body.zoneId,
            zoneName: zone.name,
            aborted,
            abortedAtTurn,
            refundedTurns: refundAmount,
            events,
            resourceDiscoveries: createdResourceDiscoveries,
            encounterSites: createdEncounterSites,
            hiddenCaches,
            zoneExitDiscovered,
            finalHp: currentHp,
          } as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      return {
        logId: explorationLog.id,
        resourceDiscoveries: createdResourceDiscoveries,
        encounterSites: createdEncounterSites,
      };
    });

    // Guild contract progress for exploration turns
    if (spentTurns > 0) {
      const guildId = await getPlayerGuildId(playerId);
      if (guildId) void incrementContractProgress(guildId, 'exploration_turns', spentTurns).catch(() => {});
    }

    // --- Achievement tracking (counter-only + derived checks) ---
    if (spentTurns > 0) {
      await incrementStats(playerId, { totalTurnsSpent: spentTurns });
    }
    if (wasKnockedOut) {
      await incrementStats(playerId, { totalDeaths: 1 });
    }

    // Build family IDs from ambush victories for family achievement checks
    const mobTemplateToFamilyId = new Map<string, string>();
    for (const zf of zoneFamilies) {
      for (const member of zf.mobFamily.members) {
        mobTemplateToFamilyId.set(member.mobTemplate.id, zf.mobFamilyId);
      }
    }
    const familyIds = new Set<string>();
    let ambushKillCount = 0;
    for (const ev of events) {
      if (ev.type === 'ambush_victory') {
        ambushKillCount++;
        const mobTemplateId = (ev.details as Record<string, unknown>)?.mobTemplateId as string | undefined;
        if (mobTemplateId) {
          const familyId = mobTemplateToFamilyId.get(mobTemplateId);
          if (familyId) familyIds.add(familyId);
        }
      }
    }

    const explorationAchievementKeys: string[] = ['totalTurnsSpent'];
    if (ambushKillCount > 0) explorationAchievementKeys.push('totalKills', 'totalUniqueMonsterKills', 'totalBestiaryCompleted');
    if (zoneExitDiscovered) explorationAchievementKeys.push('totalZonesDiscovered');
    if (zoneJustFullyExplored) explorationAchievementKeys.push('totalZonesFullyExplored');
    if (wasKnockedOut) explorationAchievementKeys.push('totalDeaths');

    const newAchievements: Awaited<ReturnType<typeof checkAchievements>> = [];
    if (explorationAchievementKeys.length > 0) {
      const statAchievements = await checkAchievements(playerId, { statKeys: explorationAchievementKeys });
      newAchievements.push(...statAchievements);
    }
    for (const familyId of familyIds) {
      const familyAchievements = await checkAchievements(playerId, { familyId });
      newAchievements.push(...familyAchievements);
    }
    await emitAchievementNotifications(playerId, newAchievements);

    if (events.length === 0) {
      events.push({
        turn: body.turns,
        type: 'hidden_cache',
        description: `You explored the ${zone.name} for ${body.turns} turns but found nothing of interest.`,
        details: {},
      });
    }

    res.json({
      logId: persisted.logId,
      zone: {
        id: zone.id,
        name: zone.name,
        difficulty: zone.difficulty,
      },
      turns: refundAmount > 0 && refundedTurns ? refundedTurns : turnSpend,
      aborted,
      refundedTurns: refundAmount,
      events,
      encounterSites: persisted.encounterSites,
      resourceDiscoveries: persisted.resourceDiscoveries,
      hiddenCaches,
      zoneExitDiscovered,
      ...(respawnedTo ? { respawnedTo } : {}),
      explorationProgress: {
        turnsExplored: explorationProgress.turnsExplored + spentTurns,
        percent: calculateExplorationPercent(explorationProgress.turnsExplored + spentTurns, explorationProgress.turnsToExplore),
        turnsToExplore: explorationProgress.turnsToExplore,
      },
    });
  } catch (err) {
    next(err);
  }
});
