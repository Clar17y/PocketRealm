import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
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
  EXPLORATION_CONSTANTS,
  GUILD_CONSTANTS,
  ZONE_EXPLORATION_CONSTANTS,
  getMobPrefixDefinition,
  type Combatant,
  type CombatOptions,
  type LootDrop,
  type MobTemplate,
  type PotionConsumed,
} from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { rollAndGrantLoot, enrichLootWithNames, type LootDropWithName } from '../services/lootService';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { grantSkillXp } from '../services/xpService';
import { degradeEquippedDurability } from '../services/durabilityService';
import { getHpState, setHp, enterRecoveringState } from '../services/hpService';
import { getEquipmentStats } from '../services/equipmentService';
import { getPlayerProgressionState } from '../services/attributesService';
import { respawnToHomeTown } from '../services/zoneDiscoveryService';
import { grantEncounterSiteChestRewardsTx } from '../services/chestService';
import { getActiveZoneModifiers, getActiveEventSummaries } from '../services/worldEventService';
import {
  persistMobHp,
  checkPersistedMobReencounter,
  removePersistedMob,
} from '../services/persistedMobService';
import { buildPotionPool, deductConsumedPotions } from '../services/potionService';
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from '../services/combatStatsService';
import { getExplorationPercent } from '../services/zoneExplorationService';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import { addGuildXp, getPlayerGuildId } from '../services/guildService';
import { applyGuildTaxTx } from '../services/guildTaxService';

export const combatRouter = Router();

combatRouter.use(authenticate);

const prismaAny = prisma as unknown as any;

const attackSkillSchema = z.enum(['melee', 'ranged', 'magic']);
type EncounterSiteSize = 'small' | 'medium' | 'large';

const lootDropWithNameSchema = z.object({
  itemTemplateId: z.string().min(1),
  quantity: z.number().int().min(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
  itemName: z.string().nullable().optional(),
});

const startSchema = z.object({
  encounterSiteId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  mobTemplateId: z.string().uuid().optional(),
  attackSkill: attackSkillSchema.optional(),
}).refine((v) => Boolean(v.encounterSiteId || v.zoneId), {
  message: 'encounterSiteId or zoneId is required',
});

const listEncounterSitesQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  mobFamilyId: z.string().uuid().optional(),
  sort: z.enum(['recent', 'danger']).default('danger'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

function pickWeighted<T extends { encounterWeight: number }>(items: T[]): T | null {
  const totalWeight = items.reduce((sum, item) => sum + item.encounterWeight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.encounterWeight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

function toEncounterSiteSize(value: string): EncounterSiteSize {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'small';
}

type EncounterMobRole = 'trash' | 'elite' | 'boss';
type EncounterMobStatus = 'alive' | 'defeated' | 'decayed';

interface EncounterMobState {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;
}

function parseEncounterSiteMobs(raw: unknown): EncounterMobState[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const value = (raw as { mobs?: unknown }).mobs;
  if (!Array.isArray(value)) return [];

  const parsed: EncounterMobState[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const slot = typeof row.slot === 'number' ? Math.floor(row.slot) : null;
    const mobTemplateId = typeof row.mobTemplateId === 'string' ? row.mobTemplateId : null;
    const role = row.role === 'trash' || row.role === 'elite' || row.role === 'boss' ? row.role : null;
    const status = row.status === 'alive' || row.status === 'defeated' || row.status === 'decayed' ? row.status : null;
    const prefix = typeof row.prefix === 'string' ? row.prefix : null;
    const room = typeof row.room === 'number' ? Math.floor(row.room) : 1;
    if (slot === null || !mobTemplateId || !role || !status) continue;

    parsed.push({
      slot,
      mobTemplateId,
      role,
      prefix,
      status,
      room,
    });
  }

  return parsed.sort((a, b) => a.slot - b.slot);
}

function serializeEncounterSiteMobs(mobs: EncounterMobState[]): Prisma.InputJsonObject {
  return { mobs } as unknown as Prisma.InputJsonObject;
}

function countEncounterSiteState(mobs: EncounterMobState[]): {
  total: number;
  alive: number;
  defeated: number;
  decayed: number;
} {
  let alive = 0;
  let defeated = 0;
  let decayed = 0;
  for (const mob of mobs) {
    if (mob.status === 'alive') alive++;
    if (mob.status === 'defeated') defeated++;
    if (mob.status === 'decayed') decayed++;
  }
  return { total: mobs.length, alive, defeated, decayed };
}

function roleOrder(role: EncounterMobRole): number {
  if (role === 'trash') return 0;
  if (role === 'elite') return 1;
  return 2;
}

function getNextEncounterMob(mobs: EncounterMobState[]): EncounterMobState | null {
  const alive = mobs.filter((mob) => mob.status === 'alive');
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}

function getNextEncounterMobInRoom(mobs: EncounterMobState[], roomNumber: number): EncounterMobState | null {
  const alive = mobs.filter((mob) => mob.status === 'alive' && mob.room === roomNumber);
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}

function getAllAliveMobsInRoom(mobs: EncounterMobState[], roomNumber: number): EncounterMobState[] {
  return mobs
    .filter((mob) => mob.status === 'alive' && mob.room === roomNumber)
    .sort((a, b) => {
      const roleDiff = roleOrder(a.role) - roleOrder(b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.slot - b.slot;
    });
}

function getRoomState(mobs: EncounterMobState[], roomNumber: number): {
  total: number;
  alive: number;
  defeated: number;
} {
  const roomMobs = mobs.filter(m => m.room === roomNumber);
  let alive = 0, defeated = 0;
  for (const m of roomMobs) {
    if (m.status === 'alive') alive++;
    if (m.status === 'defeated') defeated++;
  }
  return { total: roomMobs.length, alive, defeated };
}

function getMaxRoom(mobs: EncounterMobState[]): number {
  return Math.max(...mobs.map(m => m.room), 1);
}

function getNextUnfinishedRoom(mobs: EncounterMobState[], startRoom: number): number | null {
  const maxRoom = getMaxRoom(mobs);
  for (let r = startRoom; r <= maxRoom; r++) {
    const state = getRoomState(mobs, r);
    if (state.alive > 0) return r;
  }
  return null;
}

function applyEncounterSiteDecayInMemory(mobs: EncounterMobState[], discoveredAt: Date, now: Date): {
  mobs: EncounterMobState[];
  changed: boolean;
} {
  const elapsedMs = Math.max(0, now.getTime() - discoveredAt.getTime());
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const decayTarget = Math.max(0, Math.floor(elapsedHours * EXPLORATION_CONSTANTS.ENCOUNTER_SITE_DECAY_RATE_PER_HOUR));
  const currentDecayed = mobs.filter((mob) => mob.status === 'decayed').length;
  const toDecay = Math.max(0, decayTarget - currentDecayed);
  if (toDecay <= 0) return { mobs, changed: false };

  const next = mobs.map((mob) => ({ ...mob }));
  let decayed = 0;
  for (const mob of next) {
    if (mob.status !== 'alive') continue;
    mob.status = 'decayed';
    decayed++;
    if (decayed >= toDecay) break;
  }

  return { mobs: next, changed: decayed > 0 };
}

async function applyEncounterSiteDecayAndPersist(
  site: {
    id: string;
    playerId: string;
    discoveredAt: Date;
    mobs: unknown;
  },
  now: Date
): Promise<{
  mobs: EncounterMobState[];
  state: { total: number; alive: number; defeated: number; decayed: number };
  nextMob: EncounterMobState | null;
} | null> {
  const parsed = parseEncounterSiteMobs(site.mobs);
  if (parsed.length === 0) {
    await prismaAny.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
    return null;
  }

  const decayed = applyEncounterSiteDecayInMemory(parsed, site.discoveredAt, now);
  if (decayed.changed) {
    const postDecay = countEncounterSiteState(decayed.mobs);
    if (postDecay.alive <= 0) {
      await prismaAny.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
      return null;
    }

    await prismaAny.encounterSite.update({
      where: { id: site.id },
      data: { mobs: serializeEncounterSiteMobs(decayed.mobs) },
    });
  }

  const state = countEncounterSiteState(decayed.mobs);
  if (state.alive <= 0) {
    await prismaAny.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
    return null;
  }

  return {
    mobs: decayed.mobs,
    state,
    nextMob: getNextEncounterMob(decayed.mobs),
  };
}

/**
 * GET /api/v1/combat/sites?page=1&pageSize=10&zoneId=...&mobFamilyId=...&sort=danger
 * List encounter sites for the current player with pagination and filters.
 */
combatRouter.get('/sites', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const parsedQuery = listEncounterSitesQuerySchema.safeParse({
      zoneId: req.query.zoneId,
      mobFamilyId: req.query.mobFamilyId,
      sort: req.query.sort,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    if (!parsedQuery.success) {
      throw new AppError(400, 'Invalid encounter site query parameters', 'INVALID_QUERY');
    }
    const query = parsedQuery.data;
    const now = new Date();

    const sites = await prismaAny.encounterSite.findMany({
      where: {
        playerId,
        ...(query.zoneId ? { zoneId: query.zoneId } : {}),
        ...(query.mobFamilyId ? { mobFamilyId: query.mobFamilyId } : {}),
      },
      include: {
        zone: { select: { name: true } },
        mobFamily: { select: { id: true, name: true } },
      },
      orderBy: [{ discoveredAt: 'desc' }],
    });

    const activeSites: Array<{
      encounterSiteId: string;
      zoneId: string;
      zoneName: string;
      mobFamilyId: string;
      mobFamilyName: string;
      siteName: string;
      size: string;
      totalMobs: number;
      aliveMobs: number;
      defeatedMobs: number;
      decayedMobs: number;
      nextMobTemplateId: string | null;
      nextMobPrefix: string | null;
      discoveredAt: string;
      clearStrategy: string | null;
      currentRoom: number;
      totalRooms: number;
      roomMobCounts: Array<{ room: number; alive: number; total: number }>;
    }> = [];

    for (const site of sites) {
      const decayed = await applyEncounterSiteDecayAndPersist({
        id: site.id,
        playerId: site.playerId,
        discoveredAt: site.discoveredAt,
        mobs: site.mobs,
      }, now);
      if (!decayed) continue;

      const roomNumbers = [...new Set(decayed.mobs.map(m => m.room ?? 1))].sort((a, b) => a - b);
      const roomMobCounts = roomNumbers.map(room => {
        const roomMobs = decayed.mobs.filter(m => (m.room ?? 1) === room);
        return {
          room,
          alive: roomMobs.filter(m => m.status === 'alive').length,
          total: roomMobs.length,
        };
      });

      activeSites.push({
        encounterSiteId: site.id,
        zoneId: site.zoneId,
        zoneName: site.zone.name,
        mobFamilyId: site.mobFamilyId,
        mobFamilyName: site.mobFamily.name,
        siteName: site.name,
        size: site.size,
        totalMobs: decayed.state.total,
        aliveMobs: decayed.state.alive,
        defeatedMobs: decayed.state.defeated,
        decayedMobs: decayed.state.decayed,
        nextMobTemplateId: decayed.nextMob?.mobTemplateId ?? null,
        nextMobPrefix: decayed.nextMob?.prefix ?? null,
        discoveredAt: site.discoveredAt.toISOString(),
        clearStrategy: site.clearStrategy ?? null,
        currentRoom: site.currentRoom ?? 1,
        totalRooms: roomNumbers.length,
        roomMobCounts,
      });
    }

    const nextMobTemplateIds = Array.from(
      new Set(activeSites.map((site) => site.nextMobTemplateId).filter((id): id is string => Boolean(id)))
    );
    const nextMobRows = nextMobTemplateIds.length > 0
      ? await prisma.mobTemplate.findMany({
          where: { id: { in: nextMobTemplateIds } },
          select: { id: true, name: true },
        })
      : [];
    const nextMobNameById = new Map(nextMobRows.map((row) => [row.id, row.name]));

    activeSites.sort((a, b) => {
      if (query.sort === 'danger') {
        if (b.aliveMobs !== a.aliveMobs) return b.aliveMobs - a.aliveMobs;
      }
      return new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
    });

    const total = activeSites.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const offset = (query.page - 1) * query.pageSize;
    const pageItems = activeSites.slice(offset, offset + query.pageSize);
    const zones = Array.from(new Map(activeSites.map((site) => [site.zoneId, site.zoneName])).entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const mobFamilies = Array.from(new Map(activeSites.map((site) => [site.mobFamilyId, site.mobFamilyName])).entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      encounterSites: pageItems.map((site) => {
        const nextMobName = site.nextMobTemplateId ? nextMobNameById.get(site.nextMobTemplateId) ?? null : null;
        const prefixDefinition = getMobPrefixDefinition(site.nextMobPrefix);
        const nextMobDisplayName = nextMobName
          ? (prefixDefinition ? `${prefixDefinition.displayName} ${nextMobName}` : nextMobName)
          : null;

        return {
          encounterSiteId: site.encounterSiteId,
          zoneId: site.zoneId,
          zoneName: site.zoneName,
          mobFamilyId: site.mobFamilyId,
          mobFamilyName: site.mobFamilyName,
          siteName: site.siteName,
          size: site.size,
          totalMobs: site.totalMobs,
          aliveMobs: site.aliveMobs,
          defeatedMobs: site.defeatedMobs,
          decayedMobs: site.decayedMobs,
          nextMobTemplateId: site.nextMobTemplateId,
          nextMobName,
          nextMobPrefix: site.nextMobPrefix,
          nextMobDisplayName,
          discoveredAt: site.discoveredAt,
          clearStrategy: site.clearStrategy,
          currentRoom: site.currentRoom,
          totalRooms: site.totalRooms,
          roomMobCounts: site.roomMobCounts,
        };
      }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrevious: query.page > 1,
      },
      filters: {
        zones,
        mobFamilies,
      },
    });
  } catch (err) {
    next(err);
  }
});

const abandonSchema = z.object({
  zoneId: z.string().uuid().optional(),
});

/**
 * POST /api/v1/combat/sites/abandon
 * Abandon encounter sites (optionally by zone).
 */
combatRouter.post('/sites/abandon', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = abandonSchema.parse(req.body ?? {});

    const result = await prismaAny.encounterSite.deleteMany({
      where: {
        playerId,
        ...(body.zoneId ? { zoneId: body.zoneId } : {}),
      },
    });

    res.json({ success: true, abandoned: result.count ?? 0 });
  } catch (err) {
    next(err);
  }
});

const strategySchema = z.object({
  strategy: z.enum(['full_clear', 'room_by_room']),
});

/**
 * POST /api/v1/combat/sites/:id/strategy
 * Select clearing strategy for an encounter site.
 */
combatRouter.post('/sites/:id/strategy', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const siteId = z.string().uuid().parse(req.params.id);
    const body = strategySchema.parse(req.body);

    const site = await prismaAny.encounterSite.findFirst({
      where: { id: siteId, playerId },
    });

    if (!site) {
      throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');
    }

    if (site.clearStrategy) {
      throw new AppError(400, 'Strategy already selected for this site', 'STRATEGY_ALREADY_SET');
    }

    await prismaAny.encounterSite.update({
      where: { id: siteId },
      data: {
        clearStrategy: body.strategy,
        fullClearActive: body.strategy === 'full_clear',
      },
    });

    res.json({
      success: true,
      encounterSiteId: siteId,
      strategy: body.strategy,
    });
  } catch (err) {
    next(err);
  }
});

interface FightResult {
  mobName: string;
  mobDisplayName: string;
  mobTemplateId: string;
  mobPrefix: string | null;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  mobMaxHp: number;
  log: unknown[];
  playerHpRemaining: number;
  potionsConsumed: PotionConsumed[];
  xp: number;
  loot: LootDropWithName[];
  durabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>>;
  skillXp: Awaited<ReturnType<typeof grantSkillXp>> | null;
}

/**
 * Handle encounter site room combat: fight ALL alive mobs in the current room sequentially.
 */
async function handleEncounterSiteRoomCombat(req: Request, res: Response, playerId: string, encounterSiteId: string, body: { attackSkill?: 'melee' | 'ranged' | 'magic' }) {
  const hpState = await getHpState(playerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot fight while recovering. Spend recovery turns first.', 'IS_RECOVERING');
  }
  if (hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
  }

  const site = await prismaAny.encounterSite.findFirst({
    where: { id: encounterSiteId, playerId },
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

  // Get ALL alive mobs in the current room — advance if decay emptied it
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

  // Upfront turn cost for entire room
  const totalTurnCost = roomMobs.length * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST;

  // Load zone
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
  if (!zone) throw new AppError(404, 'Zone not found', 'NOT_FOUND');

  const explorationProgress = await getExplorationPercent(playerId, zoneId);

  // Batch-load mob templates
  const mobTemplateIds = [...new Set(roomMobs.map(m => m.mobTemplateId))];
  const mobTemplateRows = await prisma.mobTemplate.findMany({ where: { id: { in: mobTemplateIds } } });
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

  // Zone modifiers
  const zoneModifiers = await getActiveZoneModifiers(zoneId);
  const activeEventEffects = await getActiveEventSummaries(zoneId);

  // Fight loop
  const fightResults: FightResult[] = [];
  let lastCombatResult: ReturnType<typeof runCombat> | null = null;
  let lastPrefixedMob: (MobTemplate & { mobPrefix: string | null; mobDisplayName: string | null }) | null = null;
  let lastBaseMob: MobTemplate | null = null;

  for (const roomMob of roomMobs) {
    const template = mobTemplateById.get(roomMob.mobTemplateId);
    if (!template) continue;

    const baseMob: MobTemplate = {
      ...(template as unknown as MobTemplate),
      spellPattern: Array.isArray((template as { spellPattern: unknown }).spellPattern)
        ? ((template as { spellPattern: unknown }).spellPattern as MobTemplate['spellPattern'])
        : [],
    };
    const modifiedMob = applyMobEventModifiers(baseMob, zoneModifiers);
    const prefixedMob = applyMobPrefix(modifiedMob, roomMob.prefix ?? null);

    const playerStartHp = currentPlayerHp;
    const playerStats = buildPlayerCombatStats(
      currentPlayerHp,
      hpState.maxHp,
      { attackStyle: attackSkill, skillLevel: attackLevel, attributes: progression.attributes },
      equipmentStats
    );

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
      const rawLoot = await rollAndGrantLoot(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
      mobLoot = await enrichLootWithNames(rawLoot);
      mobXpGrant = await grantSkillXp(playerId, attackSkill, mobXpAwarded);

      // Bestiary
      await prisma.playerBestiary.upsert({
        where: { playerId_mobTemplateId: { playerId, mobTemplateId: prefixedMob.id } },
        create: { playerId, mobTemplateId: prefixedMob.id, kills: 1 },
        update: { kills: { increment: 1 } },
      });
      if (prefixedMob.mobPrefix) {
        await prismaAny.playerBestiaryPrefix.upsert({
          where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId: prefixedMob.id, prefix: prefixedMob.mobPrefix } },
          create: { playerId, mobTemplateId: prefixedMob.id, prefix: prefixedMob.mobPrefix, kills: 1 },
          update: { kills: { increment: 1 } },
        });
      }

      // Guild XP for mob kill
      const guildId = await getPlayerGuildId(playerId);
      if (guildId) await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
    }

    fightResults.push({
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
    if (combatResult.outcome !== 'victory') break;
  }

  // --- Transaction: spend turns, mark defeated mobs, room/site clearing ---
  const defeatedSlots = fightResults.filter(f => f.outcome === 'victory').map((_f, i) => roomMobs[i]!.slot);
  let encounterSiteCleared = false;
  let roomCleared = false;

  const txResult = await prisma.$transaction(async (tx) => {
    const txAny = tx as unknown as any;
    const spent = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);
    await applyGuildTaxTx(tx, playerId, totalTurnCost);

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
    const roomState = getRoomState(mobs, currentRoom);
    let newCurrentRoom = currentRoom;
    let newRoomCarryHp: number | null = currentPlayerHp;
    let siteCleared = false;

    if (roomState.alive <= 0) {
      roomCleared = true;
      if (siteStrategy === 'full_clear' && siteFullClearActive) {
        const nextRoom = getNextUnfinishedRoom(mobs, currentRoom + 1);
        if (nextRoom) { newCurrentRoom = nextRoom; }
        else { siteCleared = true; }
      } else {
        const overallCounts = countEncounterSiteState(mobs);
        if (overallCounts.alive <= 0) {
          siteCleared = true;
        } else {
          const nextRoom = getNextUnfinishedRoom(mobs, currentRoom + 1);
          if (nextRoom) newCurrentRoom = nextRoom;
          newRoomCarryHp = null;
        }
      }
    }

    let completionRewards: Awaited<ReturnType<typeof grantEncounterSiteChestRewardsTx>> | null = null;
    if (siteCleared) {
      completionRewards = await grantEncounterSiteChestRewardsTx(tx, {
        playerId,
        mobFamilyId: freshSite.mobFamilyId,
        size: toEncounterSiteSize(freshSite.size),
        fullClearBonus: siteStrategy === 'full_clear' && siteFullClearActive,
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

  // --- Defeat handling (last fight only) ---
  const lastFight = fightResults[fightResults.length - 1];
  let fleeResult: ReturnType<typeof calculateFleeResult> | null = null;
  let respawnedTo: { townId: string; townName: string } | null = null;

  if (lastFight && lastFight.outcome === 'defeat') {
    fleeResult = calculateFleeResult({
      evasionLevel: progression.attributes.evasion,
      mobLevel: lastPrefixedMob!.level,
      maxHp: hpState.maxHp,
      currentGold: 0,
    });

    if (fleeResult.outcome === 'knockout') {
      await enterRecoveringState(playerId, hpState.maxHp);
      respawnedTo = await respawnToHomeTown(playerId);
      await incrementStats(playerId, { totalDeaths: 1 });
      const deathAchievements = await checkAchievements(playerId, { statKeys: ['totalDeaths'] });
      await emitAchievementNotifications(playerId, deathAchievements);
    } else {
      await setHp(playerId, fleeResult.remainingHp);
    }

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
          m.room === currentRoom && m.status === 'defeated' ? { ...m, status: 'alive' as const } : m
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
    let mobFamilyIdForAchievement: string | undefined;
    if (firstMobTemplateId) {
      const familyMember = await prismaAny.mobFamilyMember.findFirst({
        where: { mobTemplateId: firstMobTemplateId },
        select: { mobFamilyId: true },
      });
      if (familyMember?.mobFamilyId) mobFamilyIdForAchievement = familyMember.mobFamilyId;
    }

    const newAchievements = await checkAchievements(playerId, { statKeys: achievementKeys, familyId: mobFamilyIdForAchievement });
    await emitAchievementNotifications(playerId, newAchievements);
  } else {
    const defeatAchievements = await checkAchievements(playerId, { statKeys: ['totalTurnsSpent'] });
    await emitAchievementNotifications(playerId, defeatAchievements);
  }

  // --- Build aggregated rewards ---
  const aggregatedLoot: LootDropWithName[] = [];
  const aggregatedDurabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>> = [];
  let aggregatedXp = 0;
  for (const fight of fightResults) {
    aggregatedXp += fight.xp;
    aggregatedLoot.push(...fight.loot);
    aggregatedDurabilityLost.push(...fight.durabilityLost);
  }
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

  // --- Activity log ---
  const combatLog = await prisma.activityLog.create({
    data: {
      playerId,
      activityType: 'combat',
      turnsSpent: totalTurnCost,
      result: {
        zoneId,
        zoneName: zone.name,
        mobTemplateId: lastPrefixedMob?.id ?? roomMobs[0]?.mobTemplateId,
        mobName: lastBaseMob?.name,
        mobPrefix: lastPrefixedMob?.mobPrefix,
        mobDisplayName: lastPrefixedMob?.mobDisplayName,
        source: 'encounter_site',
        encounterSiteId,
        encounterSiteCleared,
        attackSkill,
        outcome: lastCombatResult?.outcome ?? 'defeat',
        playerMaxHp: lastCombatResult?.combatantAMaxHp ?? hpState.maxHp,
        mobMaxHp: lastCombatResult?.combatantBMaxHp ?? 0,
        log: lastCombatResult?.log ?? [],
        potionsConsumed: allPotionsConsumed,
        fightCount: fightResults.length,
        rewards: {
          xp: aggregatedXp,
          baseXp: aggregatedXp,
          loot: aggregatedLoot,
          siteCompletion: siteCompletionWithNames,
          durabilityLost: aggregatedDurabilityLost,
          skillXp: lastVictoryXpGrant
            ? {
                skillType: lastVictoryXpGrant.skillType,
                ...lastVictoryXpGrant.xpResult,
                newTotalXp: lastVictoryXpGrant.newTotalXp,
                newDailyXpGained: lastVictoryXpGrant.newDailyXpGained,
                characterXpGain: lastVictoryXpGrant.characterXpGain,
                characterXpAfter: lastVictoryXpGrant.characterXpAfter,
                characterLevelBefore: lastVictoryXpGrant.characterLevelBefore,
                characterLevelAfter: lastVictoryXpGrant.characterLevelAfter,
                attributePointsAfter: lastVictoryXpGrant.attributePointsAfter,
                characterLeveledUp: lastVictoryXpGrant.characterLeveledUp,
              }
            : null,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

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
      log: lastFightResult.log,
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
      fights: fightResults.map(f => ({
        mobName: f.mobName,
        mobDisplayName: f.mobDisplayName,
        mobTemplateId: f.mobTemplateId,
        mobPrefix: f.mobPrefix,
        outcome: f.outcome,
        playerMaxHp: f.playerMaxHp,
        playerStartHp: f.playerStartHp,
        mobMaxHp: f.mobMaxHp,
        log: f.log,
        playerHpRemaining: f.playerHpRemaining,
        potionsConsumed: f.potionsConsumed,
        xp: f.xp,
        loot: f.loot,
        durabilityLost: f.durabilityLost,
        skillXp: f.skillXp
          ? {
              skillType: f.skillXp.skillType,
              ...f.skillXp.xpResult,
              newTotalXp: f.skillXp.newTotalXp,
              newDailyXpGained: f.skillXp.newDailyXpGained,
              characterXpGain: f.skillXp.characterXpGain,
              characterXpAfter: f.skillXp.characterXpAfter,
              characterLevelBefore: f.skillXp.characterLevelBefore,
              characterLevelAfter: f.skillXp.characterLevelAfter,
              attributePointsAfter: f.skillXp.attributePointsAfter,
              characterLeveledUp: f.skillXp.characterLeveledUp,
            }
          : null,
      })),
    },
    rewards: {
      xp: aggregatedXp,
      loot: aggregatedLoot,
      siteCompletion: siteCompletionWithNames,
      durabilityLost: aggregatedDurabilityLost,
      skillXp: lastVictoryXpGrant
        ? {
            skillType: lastVictoryXpGrant.skillType,
            ...lastVictoryXpGrant.xpResult,
            newTotalXp: lastVictoryXpGrant.newTotalXp,
            newDailyXpGained: lastVictoryXpGrant.newDailyXpGained,
            characterXpGain: lastVictoryXpGrant.characterXpGain,
            characterXpAfter: lastVictoryXpGrant.characterXpAfter,
            characterLevelBefore: lastVictoryXpGrant.characterLevelBefore,
            characterLevelAfter: lastVictoryXpGrant.characterLevelAfter,
            attributePointsAfter: lastVictoryXpGrant.attributePointsAfter,
            characterLeveledUp: lastVictoryXpGrant.characterLeveledUp,
          }
        : null,
    },
    explorationProgress: {
      turnsExplored: explorationProgress.turnsExplored,
      percent: explorationProgress.percent,
      turnsToExplore: explorationProgress.turnsToExplore,
    },
    activeEvents: activeEventEffects.length > 0 ? activeEventEffects : undefined,
  });
}

/**
 * POST /api/v1/combat/start
 * Spend turns and run combat. Encounter sites fight all mobs in the current room.
 */
combatRouter.post('/start', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = startSchema.parse(req.body);

    // Encounter site → room combat loop
    if (body.encounterSiteId) {
      await handleEncounterSiteRoomCombat(req, res, playerId, body.encounterSiteId, body);
      return;
    }

    // --- Zone combat (single mob, unchanged) ---
    const hpState = await getHpState(playerId);
    if (hpState.isRecovering) {
      throw new AppError(400, 'Cannot fight while recovering. Spend recovery turns first.', 'IS_RECOVERING');
    }
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
      const picked = pickWeighted(tieredMobs);
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

    const baseMob: MobTemplate = {
      ...mob,
      spellPattern: Array.isArray(mob.spellPattern) ? (mob.spellPattern as MobTemplate['spellPattern']) : [],
    };
    const zoneModifiers = await getActiveZoneModifiers(zoneId);
    const activeEventEffects = await getActiveEventSummaries(zoneId);
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
      await applyGuildTaxTx(tx, playerId, COMBAT_CONSTANTS.ENCOUNTER_TURN_COST);
      await deductConsumedPotions(playerId, combatResult.potionsConsumed, tx);
      return spent;
    });

    let loot: LootDrop[] = [];
    let xpGrant = null as null | Awaited<ReturnType<typeof grantSkillXp>>;
    const durabilityLost = await degradeEquippedDurability(playerId);
    let fleeResult = null as null | ReturnType<typeof calculateFleeResult>;
    let respawnedTo: { townId: string; townName: string } | null = null;

    const baseXp = combatResult.outcome === 'victory' ? prefixedMob.xpReward : 0;
    const xpAwarded = Math.max(0, baseXp);

    if (combatResult.outcome === 'victory') {
      await setHp(playerId, combatResult.combatantAHpRemaining);
      loot = await rollAndGrantLoot(playerId, prefixedMob.id, prefixedMob.level, prefixedMob.dropChanceMultiplier);
      xpGrant = await grantSkillXp(playerId, attackSkill, xpAwarded);

      // Guild XP for mob kill
      const guildId = await getPlayerGuildId(playerId);
      if (guildId) await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
    } else if (combatResult.outcome === 'defeat') {
      fleeResult = calculateFleeResult({
        evasionLevel: progression.attributes.evasion,
        mobLevel: prefixedMob.level,
        maxHp: hpState.maxHp,
        currentGold: 0,
      });

      if (fleeResult.outcome === 'knockout') {
        await enterRecoveringState(playerId, hpState.maxHp);
        respawnedTo = await respawnToHomeTown(playerId);
        await incrementStats(playerId, { totalDeaths: 1 });
        const deathAchievements = await checkAchievements(playerId, { statKeys: ['totalDeaths'] });
        await emitAchievementNotifications(playerId, deathAchievements);
      } else {
        await setHp(playerId, fleeResult.remainingHp);
      }
    }

    // Persisted mob HP
    if (combatResult.outcome === 'victory' && persistedMobId) {
      await removePersistedMob(persistedMobId);
    } else if (combatResult.outcome === 'defeat' && combatResult.combatantBHpRemaining > 0) {
      await persistMobHp(playerId, prefixedMob.id, zoneId, combatResult.combatantBHpRemaining, prefixedMob.hp);
    }

    const lootWithNames = await enrichLootWithNames(loot);

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
      let mobFamilyIdForAchievement: string | undefined;
      const familyMember = await prismaAny.mobFamilyMember.findFirst({
        where: { mobTemplateId: prefixedMob.id },
        select: { mobFamilyId: true },
      });
      if (familyMember?.mobFamilyId) mobFamilyIdForAchievement = familyMember.mobFamilyId;

      const achievementKeys = ['totalKills', 'totalUniqueMonsterKills', 'totalTurnsSpent', 'totalBestiaryCompleted'];
      if (xpGrant?.newLevel) achievementKeys.push('highestSkillLevel');
      if (xpGrant?.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) achievementKeys.push('highestCharacterLevel');

      const newAchievements = await checkAchievements(playerId, { statKeys: achievementKeys, familyId: mobFamilyIdForAchievement });
      await emitAchievementNotifications(playerId, newAchievements);
    } else {
      const defeatAchievements = await checkAchievements(playerId, { statKeys: ['totalTurnsSpent'] });
      await emitAchievementNotifications(playerId, defeatAchievements);
    }

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
              : null,
          },
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
          : null,
      },
      explorationProgress: {
        turnsExplored: explorationProgress.turnsExplored,
        percent: explorationProgress.percent,
        turnsToExplore: explorationProgress.turnsToExplore,
      },
      activeEvents: activeEventEffects.length > 0 ? activeEventEffects : undefined,
    });
  } catch (err) {
    next(err);
  }
});

const logParamsSchema = z.object({
  id: z.string().uuid(),
});

const listLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  outcome: z.enum(['victory', 'defeat', 'fled']).optional(),
  zoneId: z.string().uuid().optional(),
  mobTemplateId: z.string().uuid().optional(),
  sort: z.enum(['recent', 'xp']).default('recent'),
  search: z.string().trim().min(1).max(64).optional(),
});

interface CombatHistoryCountRow {
  total: bigint;
}

interface CombatHistoryListRow {
  id: string;
  createdAt: Date;
  zoneId: string | null;
  zoneName: string | null;
  mobTemplateId: string | null;
  mobName: string | null;
  mobDisplayName: string | null;
  outcome: string | null;
  source: string | null;
  xpGained: number;
  roundCount: number;
}

interface CombatHistoryFilterRow {
  id: string | null;
  name: string | null;
}

/**
 * GET /api/v1/combat/logs
 * Fetch paginated combat history with filters.
 */
combatRouter.get('/logs', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const query = listLogsQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
      outcome: req.query.outcome,
      zoneId: req.query.zoneId,
      mobTemplateId: req.query.mobTemplateId,
      sort: req.query.sort,
      search: req.query.search,
    });

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`"player_id" = ${playerId}`,
      Prisma.sql`"activity_type" = 'combat'`,
    ];

    if (query.outcome) {
      whereParts.push(Prisma.sql`("result"->>'outcome') = ${query.outcome}`);
    }
    if (query.zoneId) {
      whereParts.push(Prisma.sql`("result"->>'zoneId') = ${query.zoneId}`);
    }
    if (query.mobTemplateId) {
      whereParts.push(Prisma.sql`("result"->>'mobTemplateId') = ${query.mobTemplateId}`);
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      whereParts.push(
        Prisma.sql`(
          ("result"->>'zoneName') ILIKE ${pattern}
          OR ("result"->>'mobName') ILIKE ${pattern}
          OR ("result"->>'mobDisplayName') ILIKE ${pattern}
        )`
      );
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const listRowsQuery = query.sort === 'xp'
      ? Prisma.sql`
          SELECT
            "id",
            "created_at" AS "createdAt",
            ("result"->>'zoneId') AS "zoneId",
            ("result"->>'zoneName') AS "zoneName",
            ("result"->>'mobTemplateId') AS "mobTemplateId",
            ("result"->>'mobName') AS "mobName",
            COALESCE(("result"->>'mobDisplayName'), ("result"->>'mobName')) AS "mobDisplayName",
            ("result"->>'outcome') AS "outcome",
            COALESCE(
              NULLIF(("result"->>'source'), ''),
              CASE
                WHEN COALESCE(("result"->>'encounterSiteId'), '') <> '' THEN 'encounter_site'
                ELSE 'zone_combat'
              END
            ) AS "source",
            COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) AS "xpGained",
            COALESCE((
              SELECT MAX(
                CASE
                  WHEN jsonb_typeof(log_entry->'round') = 'number'
                    THEN (log_entry->>'round')::int
                  ELSE 0
                END
              )
              FROM jsonb_array_elements(COALESCE("result"->'log', '[]'::jsonb)) AS log_entry
            ), 0) AS "roundCount"
          FROM "activity_logs"
          ${whereClause}
          ORDER BY COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) DESC, "created_at" DESC
          LIMIT ${query.pageSize}
          OFFSET ${offset}
        `
      : Prisma.sql`
          SELECT
            "id",
            "created_at" AS "createdAt",
            ("result"->>'zoneId') AS "zoneId",
            ("result"->>'zoneName') AS "zoneName",
            ("result"->>'mobTemplateId') AS "mobTemplateId",
            ("result"->>'mobName') AS "mobName",
            COALESCE(("result"->>'mobDisplayName'), ("result"->>'mobName')) AS "mobDisplayName",
            ("result"->>'outcome') AS "outcome",
            COALESCE(
              NULLIF(("result"->>'source'), ''),
              CASE
                WHEN COALESCE(("result"->>'encounterSiteId'), '') <> '' THEN 'encounter_site'
                ELSE 'zone_combat'
              END
            ) AS "source",
            COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) AS "xpGained",
            COALESCE((
              SELECT MAX(
                CASE
                  WHEN jsonb_typeof(log_entry->'round') = 'number'
                    THEN (log_entry->>'round')::int
                  ELSE 0
                END
              )
              FROM jsonb_array_elements(COALESCE("result"->'log', '[]'::jsonb)) AS log_entry
            ), 0) AS "roundCount"
          FROM "activity_logs"
          ${whereClause}
          ORDER BY "created_at" DESC
          LIMIT ${query.pageSize}
          OFFSET ${offset}
        `;

    const [countRows, listRows, zoneRows, mobRows] = await Promise.all([
      prisma.$queryRaw<CombatHistoryCountRow[]>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS "total"
          FROM "activity_logs"
          ${whereClause}
        `
      ),
      prisma.$queryRaw<CombatHistoryListRow[]>(listRowsQuery),
      prisma.$queryRaw<CombatHistoryFilterRow[]>(
        Prisma.sql`
          SELECT DISTINCT
            ("result"->>'zoneId') AS "id",
            ("result"->>'zoneName') AS "name"
          FROM "activity_logs"
          WHERE "player_id" = ${playerId}
            AND "activity_type" = 'combat'
            AND ("result"->>'zoneId') IS NOT NULL
            AND ("result"->>'zoneName') IS NOT NULL
          ORDER BY "name" ASC
        `
      ),
      prisma.$queryRaw<CombatHistoryFilterRow[]>(
        Prisma.sql`
          SELECT DISTINCT
            ("result"->>'mobTemplateId') AS "id",
            ("result"->>'mobName') AS "name"
          FROM "activity_logs"
          WHERE "player_id" = ${playerId}
            AND "activity_type" = 'combat'
            AND ("result"->>'mobTemplateId') IS NOT NULL
            AND ("result"->>'mobName') IS NOT NULL
          ORDER BY "name" ASC
        `
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0n);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

    res.json({
      logs: listRows.map((row) => ({
        logId: row.id,
        createdAt: row.createdAt.toISOString(),
        zoneId: row.zoneId,
        zoneName: row.zoneName,
        mobTemplateId: row.mobTemplateId,
        mobName: row.mobName,
        mobDisplayName: row.mobDisplayName ?? row.mobName,
        outcome: row.outcome,
        source: row.source,
        roundCount: row.roundCount,
        xpGained: row.xpGained,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrevious: query.page > 1,
      },
      filters: {
        zones: zoneRows.filter((row) => row.id && row.name).map((row) => ({ id: row.id!, name: row.name! })),
        mobs: mobRows.filter((row) => row.id && row.name).map((row) => ({ id: row.id!, name: row.name! })),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/combat/logs/:id
 * Fetch combat playback data for a previous encounter.
 */
combatRouter.get('/logs/:id', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const params = logParamsSchema.parse(req.params);

    const log = await prisma.activityLog.findFirst({
      where: {
        id: params.id,
        playerId,
        activityType: 'combat',
      },
      select: {
        id: true,
        result: true,
        createdAt: true,
      },
    });

    if (!log) {
      throw new AppError(404, 'Combat log not found', 'NOT_FOUND');
    }

    let combat = log.result;
    if (combat && typeof combat === 'object' && !Array.isArray(combat)) {
      const combatRecord = combat as Record<string, unknown>;
      const rewards = combatRecord.rewards;

      if (rewards && typeof rewards === 'object' && !Array.isArray(rewards)) {
        const rewardsRecord = rewards as Record<string, unknown>;
        const lootUnknown = rewardsRecord.loot;
        const siteCompletionUnknown = rewardsRecord.siteCompletion;
        let nextRewards = rewardsRecord;
        if (Array.isArray(lootUnknown)) {
          const parsedLoot = lootUnknown
            .map((entry) => lootDropWithNameSchema.safeParse(entry))
            .filter((entry): entry is { success: true; data: z.infer<typeof lootDropWithNameSchema> } => entry.success)
            .map((entry) => entry.data);

          const lootWithNames = await enrichLootWithNames(parsedLoot);
          nextRewards = {
            ...nextRewards,
            loot: lootWithNames,
          };
        }

        if (siteCompletionUnknown && typeof siteCompletionUnknown === 'object' && !Array.isArray(siteCompletionUnknown)) {
          const siteCompletionRecord = siteCompletionUnknown as Record<string, unknown>;
          const chestLootUnknown = siteCompletionRecord.loot;
          if (Array.isArray(chestLootUnknown)) {
            const parsedChestLoot = chestLootUnknown
              .map((entry) => lootDropWithNameSchema.safeParse(entry))
              .filter((entry): entry is { success: true; data: z.infer<typeof lootDropWithNameSchema> } => entry.success)
              .map((entry) => entry.data);

            const chestLootWithNames = await enrichLootWithNames(parsedChestLoot);
            nextRewards = {
              ...nextRewards,
              siteCompletion: {
                ...siteCompletionRecord,
                loot: chestLootWithNames,
              },
            };
          }
        }

        combat = {
          ...combatRecord,
          rewards: nextRewards,
        } as unknown as Prisma.JsonValue;
      }
    }

    res.json({
      logId: log.id,
      createdAt: log.createdAt.toISOString(),
      combat,
    });
  } catch (err) {
    next(err);
  }
});
