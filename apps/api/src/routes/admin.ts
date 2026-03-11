import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@pocketrealm/database';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { asyncHandler } from '../utils/asyncHandler';
import { refundPlayerTurns } from '../services/turnBankService';
import { addStackableItem } from '../services/inventoryService';
import { spawnWorldEvent, getEventById } from '../services/worldEventService';
import { createBossEncounter } from '../services/bossEncounterService';
import { normalizePlayerAttributes } from '../services/attributesService';
import { xpForLevel, characterLevelFromXp, rollMobPrefix, rollBonusStatsForRarity } from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import {
  CHARACTER_CONSTANTS,
  SKILL_CONSTANTS,
  EXPLORATION_CONSTANTS,
  EXPEDITION_CONSTANTS,
  WORLD_EVENT_TEMPLATES,
  ALL_SKILLS,
  HP_CONSTANTS,
  type PlayerAttributes,
  type ItemRarity,
  type EquipmentSlot,
  type ItemType,
  type ItemStats,
} from '@pocketrealm/shared';
import {
  calculateMaxStamina,
  calculateMaxMana,
} from '@pocketrealm/game-engine';

const router = Router();
router.use(authenticate, requireAdmin);

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const grantTurnsSchema = z.object({ amount: z.number().int().min(1).max(1_000_000) });

router.post('/turns/grant', asyncHandler(async (req, res) => {
  const { amount } = grantTurnsSchema.parse(req.body);
  const result = await refundPlayerTurns(req.player!.playerId, amount);
  res.json({ success: true, ...result });
}));

const setLevelSchema = z.object({ level: z.number().int().min(1).max(CHARACTER_CONSTANTS.MAX_LEVEL) });

router.post('/player/level', asyncHandler(async (req, res) => {
  const { level } = setLevelSchema.parse(req.body);
  const xp = xpForLevel(level);
  const player = await prisma.player.findUniqueOrThrow({ where: { id: req.player!.playerId } });
  const levelDiff = Math.max(0, level - player.characterLevel);

  await prisma.player.update({
    where: { id: req.player!.playerId },
    data: {
      characterLevel: level,
      characterXp: BigInt(xp),
      attributePoints: { increment: levelDiff },
    },
  });
  res.json({ success: true, level, characterXp: xp });
}));

const setSkillLevelSchema = z.object({
  skillType: z.enum(ALL_SKILLS as [string, ...string[]]),
  level: z.number().int().min(1).max(SKILL_CONSTANTS.MAX_LEVEL),
});

router.post('/set-skill-level', asyncHandler(async (req, res) => {
  const { skillType, level } = setSkillLevelSchema.parse(req.body);
  const xp = xpForLevel(level);

  await prisma.playerSkill.upsert({
    where: { playerId_skillType: { playerId: req.player!.playerId, skillType } },
    update: { level, xp: BigInt(xp) },
    create: { playerId: req.player!.playerId, skillType, level, xp: BigInt(xp) },
  });

  res.json({ success: true, skillType, level });
}));

const grantXpSchema = z.object({ amount: z.number().int().min(1) });

router.post('/player/xp', asyncHandler(async (req, res) => {
  const { amount } = grantXpSchema.parse(req.body);
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: req.player!.playerId },
    select: { characterXp: true, characterLevel: true },
  });
  const newXp = Number(player.characterXp) + amount;
  const newLevel = characterLevelFromXp(newXp);
  const levelUps = Math.max(0, newLevel - player.characterLevel);

  await prisma.player.update({
    where: { id: req.player!.playerId },
    data: {
      characterXp: BigInt(newXp),
      characterLevel: newLevel,
      attributePoints: { increment: levelUps },
    },
  });
  res.json({ success: true, characterXp: newXp, characterLevel: newLevel, levelUps });
}));

const setAttributesSchema = z.object({
  attributePoints: z.number().int().min(0).optional(),
  attributes: z.record(
    z.enum(['vitality', 'strength', 'dexterity', 'intelligence', 'luck', 'evasion']),
    z.number().int().min(0),
  ).optional(),
});

router.post('/player/attributes', asyncHandler(async (req, res) => {
  const body = setAttributesSchema.parse(req.body);
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: req.player!.playerId },
    select: { attributes: true, attributePoints: true },
  });
  const current = normalizePlayerAttributes(player.attributes);
  const merged: PlayerAttributes = { ...current, ...(body.attributes ?? {}) };
  const data: Record<string, unknown> = {};
  if (body.attributes) data.attributes = merged;
  if (body.attributePoints !== undefined) data.attributePoints = body.attributePoints;

  await prisma.player.update({ where: { id: req.player!.playerId }, data });
  res.json({ success: true, attributes: merged, attributePoints: body.attributePoints ?? player.attributePoints });
}));

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

router.get('/items/templates', asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const where: Prisma.ItemTemplateWhereInput = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (type) where.itemType = type;

  const templates = await prisma.itemTemplate.findMany({
    where,
    orderBy: [{ itemType: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
    take: 100,
  });
  res.json({ templates });
}));

const grantItemSchema = z.object({
  templateId: z.string().min(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
  quantity: z.number().int().min(1).max(1000).default(1),
});

router.post('/items/grant', asyncHandler(async (req, res) => {
  const { templateId, rarity, quantity } = grantItemSchema.parse(req.body);
  const template = await prisma.itemTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const playerId = req.player!.playerId;

  if (template.stackable) {
    const result = await addStackableItem(playerId, templateId, quantity);
    res.json({ success: true, item: result });
    return;
  }

  const items = [];
  for (let i = 0; i < quantity; i++) {
    const bonusStats = rollBonusStatsForRarity({
      itemType: template.itemType as ItemType,
      rarity: rarity as ItemRarity,
      baseStats: template.baseStats as ItemStats | null,
      slot: template.slot as EquipmentSlot | null,
    });
    const item = await prisma.item.create({
      data: {
        ownerId: playerId,
        templateId,
        rarity,
        quantity: 1,
        maxDurability: template.maxDurability,
        currentDurability: template.maxDurability,
        bonusStats: bonusStats ? (bonusStats as unknown as Prisma.InputJsonObject) : undefined,
      },
    });
    items.push(item);
  }
  res.json({ success: true, items });
}));

// ---------------------------------------------------------------------------
// World Events & Bosses
// ---------------------------------------------------------------------------

router.get('/events/templates', (_req, res) => {
  res.json({ templates: WORLD_EVENT_TEMPLATES.map((t, i) => ({ id: i, ...t })) });
});

router.get('/events/active', asyncHandler(async (_req, res) => {
  const events = await prisma.worldEvent.findMany({
    where: { status: 'active' },
    include: { zone: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
  });
  res.json({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      effectType: e.effectType,
      effectValue: e.effectValue,
      zoneName: e.zone?.name ?? 'World',
      status: e.status,
      expiresAt: e.expiresAt?.toISOString() ?? null,
    })),
  });
}));

const spawnEventSchema = z.object({
  templateIndex: z.number().int().min(0),
  zoneId: z.string().uuid(),
  durationHours: z.number().min(0.1).max(168).default(2),
  target: z.string().min(1).optional(),
});

router.post('/events/spawn', asyncHandler(async (req, res) => {
  const { templateIndex, zoneId, durationHours, target } = spawnEventSchema.parse(req.body);
  const template = WORLD_EVENT_TEMPLATES[templateIndex];
  if (!template) {
    res.status(400).json({ error: { message: 'Invalid template index', code: 'INVALID_TEMPLATE' } });
    return;
  }

  // Resolve target: family targeting stores the mob family ID, not the name
  let targetFamily: string | undefined;
  let targetFamilyName: string | undefined;
  let targetResource: string | undefined;

  if (template.targeting === 'family') {
    const families = await prisma.zoneMobFamily.findMany({
      where: { zoneId },
      include: { mobFamily: { select: { id: true, name: true } } },
    });

    const familyName = target ?? template.fixedTarget;
    let picked;
    if (familyName) {
      const lower = familyName.toLowerCase();
      picked = families.find((f) => f.mobFamily.name.toLowerCase() === lower);
    } else if (families.length > 0) {
      picked = families[Math.floor(Math.random() * families.length)];
    }
    if (picked) {
      targetFamily = picked.mobFamily.id;
      targetFamilyName = picked.mobFamily.name;
    }
  } else if (template.targeting === 'resource') {
    const nodes = await prisma.resourceNode.findMany({
      where: { zoneId },
      select: { resourceType: true },
    });
    const types = [...new Set(nodes.map((n) => n.resourceType))];
    const resourceName = target ?? template.fixedTarget;
    if (resourceName) {
      const lower = resourceName.toLowerCase();
      targetResource = types.find((t) => t.toLowerCase() === lower);
    } else if (types.length > 0) {
      targetResource = types[Math.floor(Math.random() * types.length)];
    }
  }

  const displayTarget = targetFamilyName ?? targetResource ?? 'Unknown';
  const title = template.title.replace('{target}', displayTarget);
  const description = template.description.replace('{target}', displayTarget);

  const event = await spawnWorldEvent({
    type: template.type,
    zoneId,
    title,
    description,
    effectType: template.effectType,
    effectValue: template.effectValue,
    targetFamily,
    targetResource,
    durationHours,
    createdBy: 'system',
  });

  if (!event) {
    res.status(409).json({ error: { message: 'Could not spawn event (slot conflict)', code: 'SLOT_CONFLICT' } });
    return;
  }

  res.json({ success: true, event });
}));

router.post('/events/:id/cancel', asyncHandler(async (req, res) => {
  const event = await getEventById(req.params.id);
  if (!event) {
    res.status(404).json({ error: { message: 'Event not found', code: 'NOT_FOUND' } });
    return;
  }
  await prisma.worldEvent.update({
    where: { id: req.params.id },
    data: { status: 'expired', expiresAt: new Date() },
  });
  res.json({ success: true });
}));

router.get('/mobs', asyncHandler(async (_req, res) => {
  const mobs = await prisma.mobTemplate.findMany({
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, level: true, hp: true, bossBaseHp: true },
  });
  res.json({ mobs });
}));

const spawnBossSchema = z.object({
  mobTemplateId: z.string().uuid(),
  zoneId: z.string().uuid(),
});

router.post('/boss/spawn', asyncHandler(async (req, res) => {
  const { mobTemplateId, zoneId } = spawnBossSchema.parse(req.body);
  const mob = await prisma.mobTemplate.findUniqueOrThrow({ where: { id: mobTemplateId } });

  const event = await spawnWorldEvent({
    type: 'boss',
    zoneId,
    title: `${mob.name} Sighted`,
    description: `A fearsome ${mob.name} has appeared!`,
    effectType: 'damage_up',
    effectValue: 0,
    targetMobId: mobTemplateId,
    durationHours: 0,
    createdBy: 'system',
  });

  if (!event) {
    res.status(409).json({ error: { message: 'Could not spawn boss event (slot conflict)', code: 'SLOT_CONFLICT' } });
    return;
  }

  // Bosses don't time-expire — managed by encounter lifecycle
  await prisma.worldEvent.update({ where: { id: event.id }, data: { expiresAt: null } });

  const encounter = await createBossEncounter(event.id, mobTemplateId, mob.bossBaseHp ?? mob.hp);
  res.json({ success: true, event, encounter });
}));

// ---------------------------------------------------------------------------
// Zones & Encounter Sites
// ---------------------------------------------------------------------------

router.get('/zones', asyncHandler(async (_req, res) => {
  const zones = await prisma.zone.findMany({
    include: { connectionsFrom: { select: { toId: true, explorationThreshold: true } } },
    orderBy: { difficulty: 'asc' },
  });
  res.json({ zones });
}));

router.post('/zones/discover-all', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const zones = await prisma.zone.findMany({ select: { id: true } });

  await prisma.$transaction(
    zones.map((z) =>
      prisma.playerZoneDiscovery.upsert({
        where: { playerId_zoneId: { playerId, zoneId: z.id } },
        create: { playerId, zoneId: z.id },
        update: {},
      }),
    ),
  );
  res.json({ success: true, discoveredCount: zones.length });
}));

const teleportSchema = z.object({ zoneId: z.string().uuid() });

router.post('/zones/teleport', asyncHandler(async (req, res) => {
  const { zoneId } = teleportSchema.parse(req.body);
  await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } });
  await prisma.player.update({
    where: { id: req.player!.playerId },
    data: { currentZoneId: zoneId },
  });
  res.json({ success: true, zoneId });
}));

router.get('/mob-families', asyncHandler(async (req, res) => {
  const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;

  if (zoneId) {
    const zoneFamilies = await prisma.zoneMobFamily.findMany({
      where: { zoneId },
      include: { mobFamily: { select: { id: true, name: true } } },
    });
    res.json({ families: zoneFamilies.map((zf) => zf.mobFamily) });
    return;
  }

  const families = await prisma.mobFamily.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json({ families });
}));

const spawnEncounterSchema = z.object({
  mobFamilyId: z.string().uuid(),
  zoneId: z.string().uuid(),
  size: z.enum(['small', 'medium', 'large']),
});

router.post('/encounter/spawn', asyncHandler(async (req, res) => {
  const { mobFamilyId, zoneId, size } = spawnEncounterSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const family = await prisma.mobFamily.findUniqueOrThrow({
    where: { id: mobFamilyId },
    include: { members: { include: { mobTemplate: true } } },
  });

  const sizeConfig = {
    small: EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL,
    medium: EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM,
    large: EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE,
  }[size];
  const mobCount = Math.floor(Math.random() * (sizeConfig.max - sizeConfig.min + 1)) + sizeConfig.min;

  const members = family.members;
  if (members.length === 0) {
    res.status(400).json({ error: { message: 'Mob family has no members', code: 'NO_MEMBERS' } });
    return;
  }

  const pickMember = () => members[Math.floor(Math.random() * members.length)];

  const mobs: Array<{ slot: number; mobTemplateId: string; role: string; prefix: string | null; status: string }> = [];
  let slot = 0;

  if (size === 'large') {
    const boss = pickMember();
    mobs.push({ slot: slot++, mobTemplateId: boss.mobTemplate.id, role: 'boss', prefix: rollMobPrefix(), status: 'alive' });
    for (let i = 0; i < 2 && slot < mobCount; i++) {
      const elite = pickMember();
      mobs.push({ slot: slot++, mobTemplateId: elite.mobTemplate.id, role: 'elite', prefix: rollMobPrefix(), status: 'alive' });
    }
  } else if (size === 'medium') {
    const elite = pickMember();
    mobs.push({ slot: slot++, mobTemplateId: elite.mobTemplate.id, role: 'elite', prefix: rollMobPrefix(), status: 'alive' });
  }

  while (slot < mobCount) {
    const trash = pickMember();
    mobs.push({ slot: slot++, mobTemplateId: trash.mobTemplate.id, role: 'trash', prefix: rollMobPrefix(), status: 'alive' });
  }

  const sizeNounField = size === 'small' ? 'siteNounSmall' : size === 'medium' ? 'siteNounMedium' : 'siteNounLarge';
  const noun = family[sizeNounField];
  const namePrefix = size === 'small' ? 'Small ' : size === 'large' ? 'Large ' : '';
  const siteName = `${namePrefix}${family.name} ${noun}`;

  const site = await prisma.encounterSite.create({
    data: { playerId, zoneId, mobFamilyId, name: siteName, size, mobs: { mobs } },
  });

  res.json({ success: true, site });
}));

// ---------------------------------------------------------------------------
// Resource Nodes
// ---------------------------------------------------------------------------

router.get('/resource-nodes', asyncHandler(async (req, res) => {
  const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
  const where: Prisma.ResourceNodeWhereInput = {};
  if (zoneId) where.zoneId = zoneId;

  const nodes = await prisma.resourceNode.findMany({
    where,
    include: { zone: { select: { name: true } } },
    orderBy: [{ zone: { name: 'asc' } }, { resourceType: 'asc' }],
  });
  res.json({ nodes });
}));

const spawnResourceNodeSchema = z.object({
  resourceNodeId: z.string().uuid(),
  capacity: z.number().int().min(1).max(10000).optional(),
});

router.post('/resource-nodes/spawn', asyncHandler(async (req, res) => {
  const { resourceNodeId, capacity } = spawnResourceNodeSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const template = await prisma.resourceNode.findUniqueOrThrow({ where: { id: resourceNodeId } });
  const finalCapacity = capacity
    ?? Math.floor(Math.random() * (template.maxCapacity - template.minCapacity + 1)) + template.minCapacity;

  const node = await prisma.playerResourceNode.create({
    data: {
      playerId,
      resourceNodeId,
      remainingCapacity: finalCapacity,
      decayedCapacity: 0,
    },
  });
  res.json({ success: true, node, resourceType: template.resourceType, capacity: finalCapacity });
}));

// ---------------------------------------------------------------------------
// Quest Tokens
// ---------------------------------------------------------------------------

const grantTokensSchema = z.object({ amount: z.number().int().min(1).max(100000) });

router.post('/tokens/grant', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { amount } = grantTokensSchema.parse(req.body);

  const state = await (prisma as any).playerQuestState.upsert({
    where: { playerId },
    create: { playerId, questTokens: amount, dailyBonusClaimed: false, lastDailyReset: new Date('2000-01-01'), lastWeeklyReset: new Date('2000-01-01') },
    update: { questTokens: { increment: amount } },
  });

  res.json({ success: true, questTokens: state.questTokens });
}));

// ---------------------------------------------------------------------------
// Guild
// ---------------------------------------------------------------------------

const grantTreasurySchema = z.object({ amount: z.number().int().min(1).max(10_000_000) });

router.post('/guild/treasury', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { amount } = grantTreasurySchema.parse(req.body);

  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership) {
    throw new AppError(400, 'You must be in a guild', 'NOT_IN_GUILD');
  }

  const guild = await prisma.guild.update({
    where: { id: membership.guildId },
    data: { treasuryTurns: { increment: amount } },
    select: { treasuryTurns: true },
  });

  res.json({ success: true, treasuryTurns: guild.treasuryTurns });
}));

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------

router.post('/expedition/reset-cooldowns', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership) throw new AppError(400, 'You must be in a guild', 'NOT_IN_GUILD');

  // Set completedAt to far in the past so both weekly and between-expedition cooldowns clear
  const farPast = new Date('2000-01-01');
  const { count } = await prisma.guildExpedition.updateMany({
    where: { guildId: membership.guildId, status: { in: ['completed', 'failed'] } },
    data: { completedAt: farPast },
  });

  res.json({ success: true, expeditionsReset: count });
}));

router.post('/expedition/fill', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  // Get admin's guild
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: true },
  });
  if (!membership) {
    throw new AppError(400, 'You must be in a guild', 'NOT_IN_GUILD');
  }

  // Get active recruiting expedition
  const expedition = await prisma.guildExpedition.findFirst({
    where: { guildId: membership.guildId, status: 'recruiting' },
    include: { members: true },
  });
  if (!expedition) {
    throw new AppError(404, 'No recruiting expedition found', 'NO_EXPEDITION');
  }

  // Calculate how many bots are needed
  const tier = expedition.tier;
  const minParticipants = EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[tier - 1];
  const currentCount = expedition.members.length;
  const botsNeeded = Math.max(0, minParticipants - currentCount);

  if (botsNeeded === 0) {
    res.json({ message: 'Expedition already has enough participants', botsCreated: 0 });
    return;
  }

  const botLevel = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[tier - 1] + 5;
  const botVitality = 20;
  const botAttributes = { vitality: botVitality, strength: 20, dexterity: 20, intelligence: 20, luck: 10, evasion: 10 };

  // Pre-compute max HP/stamina/mana for all bots (identical stats)
  const maxHp = HP_CONSTANTS.BASE_HP + botVitality * HP_CONSTANTS.HP_PER_VITALITY;
  const maxStamina = calculateMaxStamina({ meleeLevel: 10, rangedLevel: 10, evasionLevel: 10, equipmentStaminaBonus: 0 });
  const maxMana = calculateMaxMana({ magicLevel: 10, equipmentManaBonus: 0 });

  const botIds: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < botsNeeded; i++) {
    const botName = `ExpBot_${timestamp}_${i}`;

    // Create bot player with attributes matching the tier
    const bot = await prisma.player.create({
      data: {
        username: botName,
        email: `${botName}@bot.local`,
        passwordHash: 'bot-no-login',
        isBot: true,
        characterLevel: botLevel,
        attributes: botAttributes,
      },
    });

    // Create all supporting records in parallel
    await Promise.all([
      // Guild membership
      prisma.guildMember.create({
        data: { guildId: membership.guildId, playerId: bot.id, role: 'member' },
      }),
      // Turn bank
      prisma.turnBank.create({
        data: { playerId: bot.id, currentTurns: 100_000, lastRegenAt: new Date() },
      }),
      // Player stats
      prisma.playerStats.create({
        data: { playerId: bot.id },
      }),
      // Combat skills (needed for stat calculations)
      prisma.playerSkill.createMany({
        data: ALL_SKILLS.map(skillType => ({
          playerId: bot.id,
          skillType,
          level: 10,
          xp: BigInt(0),
        })),
      }),
    ]);

    // Create combat template: conditional potion usage + buff opener + sustained DPS
    const template = await prisma.combatTemplate.create({
      data: { playerId: bot.id, name: 'Bot Expedition', isActive: true },
    });
    await prisma.combatTemplateSlot.createMany({
      data: [
        // Slot 0: Open with battle_cry buff, else light_attack
        { templateId: template.id, sortOrder: 0, actionId: 'light_attack',
          condition: { type: 'no_buff', effectName: 'Battle Cry' }, thenActionId: 'battle_cry' },
        // Slot 1: Venomous strike for DoT, potion if low HP
        { templateId: template.id, sortOrder: 1, actionId: 'venomous_strike',
          condition: { type: 'resource_below', resource: 'hp', threshold: 50 }, thenActionId: 'use_hp_potion' },
        // Slot 2: Rending slash for bleed DoT, potion if low HP
        { templateId: template.id, sortOrder: 2, actionId: 'rending_slash',
          condition: { type: 'resource_below', resource: 'hp', threshold: 50 }, thenActionId: 'use_hp_potion' },
        // Slot 3: Light attack, potion if low HP
        { templateId: template.id, sortOrder: 3, actionId: 'light_attack',
          condition: { type: 'resource_below', resource: 'hp', threshold: 50 }, thenActionId: 'use_hp_potion' },
        // Slot 4: Light attack, potion if low HP
        { templateId: template.id, sortOrder: 4, actionId: 'light_attack',
          condition: { type: 'resource_below', resource: 'hp', threshold: 50 }, thenActionId: 'use_hp_potion' },
      ],
    });

    // Grant 100 HP potions (find the tier-appropriate potion template)
    const potionTemplate = await prisma.itemTemplate.findFirst({
      where: { itemType: 'consumable', name: { contains: 'Health Potion', mode: 'insensitive' } },
      orderBy: { tier: 'asc' },
    });
    if (potionTemplate) {
      await addStackableItem(bot.id, potionTemplate.id, 100);
    }

    // Sign up bot for expedition
    await prisma.guildExpeditionMember.create({
      data: {
        expeditionId: expedition.id,
        playerId: bot.id,
        currentHp: maxHp,
        currentStamina: maxStamina,
        currentMana: maxMana,
        maxHp,
        maxStamina,
        maxMana,
      },
    });

    botIds.push(bot.id);
  }

  res.json({
    message: `Created ${botsNeeded} bot participants`,
    botsCreated: botsNeeded,
    botIds,
    totalParticipants: currentCount + botsNeeded,
    minRequired: minParticipants,
  });
}));

export const adminRouter = router;
