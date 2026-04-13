import { Prisma, prisma } from '@pocketrealm/database';
import { logger } from '../logger';
import {
  EXPEDITION_CONSTANTS,
  EXPEDITION_THEMES_BY_ID,
  type ExpeditionRoomDefinition,
} from '@pocketrealm/shared';
import { generateExpeditionRooms } from '@pocketrealm/game-engine';
import { awardRoomTokens, awardCompletionBonus, distributeRoomLoot } from './expeditionLootService';
import type { ExpeditionContributor } from './expeditionLootService';
import { AppError } from '../middleware/errorHandler';
import { addGuildLog } from './guildService';
import { sendPush } from './pushNotificationService';
import { clearRoomSnapshots } from './expeditionCombatCache';
import { parseJsonArray } from '../utils/jsonColumnSchemas';
import { getIo } from '../socket';
import {
  getRoundInterval,
  getMembers,
  cleanupExpeditionBots,
  buildTemplateIdMap,
  buildUpdatedAttemptLogs,
  setExpeditionCooldowns,
} from './expeditionHelpers';
import { roundTimerRegistry } from './roundTimerRegistry';

// ---------------------------------------------------------------------------
// Handle Room Cleared
// ---------------------------------------------------------------------------

export async function handleRoomCleared(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: true },
  });
  if (!expedition) return;

  // Clear combat snapshots for the completed room
  await clearRoomSnapshots(expeditionId, expedition.currentRoom);

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[expedition.currentRoom];
  const roomType = currentRoomDef?.roomType ?? 'trash';

  // Award per-room tokens to all members (flat, not contribution-weighted)
  await awardRoomTokens(expedition.members, roomType, expedition.tier, expeditionId);

  // Distribute item loot weighted by contribution
  const contributors: ExpeditionContributor[] = expedition.members.map(m => ({
    playerId: m.playerId,
    roomDamage: Number(m.roomDamage),
    roomHealing: Number(m.roomHealing),
  }));
  const mobTemplateIds = currentRoomDef
    ? currentRoomDef.mobs.map(m => m.mobTemplateId)
    : [];
  await distributeRoomLoot(contributors, roomType, expedition.tier, mobTemplateIds);

  // Award guild XP
  await prisma.guild.update({
    where: { id: expedition.guildId },
    data: { xp: { increment: EXPEDITION_CONSTANTS.GUILD_XP_PER_ROOM } },
  });

  // Check if last room
  if (expedition.currentRoom >= expedition.totalRooms - 1) {
    await completeExpedition(expeditionId);
    return;
  }

  // Enter rest phase: advance room, reset room-level tracking + KO flags + threat
  const nextRoom = expedition.currentRoom + 1;
  const nextRoomDef = rooms[nextRoom];

  await prisma.guildExpeditionMember.updateMany({
    where: { expeditionId },
    data: { roomDamage: 0, roomHealing: 0, isKnockedOut: false, threatValue: 0, targetMobId: null, activeEffects: [] },
  });

  // Apply rest regen to all members using stored max stats (no N+1 queries)
  const members = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
  });

  await Promise.all(
    members.map(m => {
      const regenHp = Math.floor(m.maxHp * EXPEDITION_CONSTANTS.REST_HP_REGEN);
      const regenStamina = Math.floor(m.maxStamina * EXPEDITION_CONSTANTS.REST_STAMINA_REGEN);
      const regenMana = Math.floor(m.maxMana * EXPEDITION_CONSTANTS.REST_MANA_REGEN);

      const newHp = Math.min(m.currentHp + regenHp, m.maxHp);
      const newStamina = Math.min(m.currentStamina + regenStamina, m.maxStamina);
      const newMana = Math.min(m.currentMana + regenMana, m.maxMana);

      return prisma.guildExpeditionMember.update({
        where: { id: m.id },
        data: { currentHp: newHp, currentStamina: newStamina, currentMana: newMana },
      });
    }),
  );

  // Snapshot player state for wipe recovery in the next room
  const updatedMembers = await getMembers(expeditionId);
  const snapshot = {
    mobs: nextRoomDef?.mobs ?? [],
    members: updatedMembers,
  };
  const nextRoundAt = new Date(Date.now() + EXPEDITION_CONSTANTS.REST_DURATION_MS);

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      currentRoom: nextRoom,
      roundNumber: 0,
      roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
      nextRoundAt,
    },
  });
  roundTimerRegistry.schedule('guildExpedition', expeditionId, nextRoundAt, getIo);
}

// ---------------------------------------------------------------------------
// Handle Wipe
// ---------------------------------------------------------------------------

export async function handleWipe(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { include: { player: { select: { username: true } } } } },
  });
  if (!expedition) return;

  // Clear combat snapshots for the current room
  await clearRoomSnapshots(expeditionId, expedition.currentRoom);

  const newWipeCount = (expedition.wipeCount ?? 0) + 1;
  const newAttemptLogs = buildUpdatedAttemptLogs(expedition);

  if (newWipeCount >= EXPEDITION_CONSTANTS.MAX_ATTEMPTS) {
    // Auto-abandon: max attempts reached
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        wipeCount: newWipeCount,
        expeditionAttemptLogs: JSON.parse(JSON.stringify(newAttemptLogs)),
        status: 'failed',
        completedAt: new Date(),
        nextRoundAt: null,
      },
    });
    roundTimerRegistry.cancel('guildExpedition', expeditionId);

    await addGuildLog(
      expedition.guildId,
      'expedition_failed',
      `Expedition failed after ${newWipeCount} attempts`,
      { expeditionId, wipeCount: newWipeCount },
    );

    // Set per-player-per-tier cooldowns on max-attempt failure
    await setExpeditionCooldowns(expeditionId, expedition.tier);

    // Notify expedition members of failure
    for (const member of expedition.members) {
      void sendPush(member.playerId, 'expeditionFinished', {
        title: 'Expedition Failed',
        body: `Your Tier ${expedition.tier} expedition failed after ${newWipeCount} attempts.`,
        tag: 'expedition-finished',
        data: { type: 'expedition', expeditionId },
      });
    }

    await cleanupExpeditionBots(expeditionId);
    return;
  }

  // Reset to recruiting: delete all members, regenerate rooms using same theme
  const wipeTheme = EXPEDITION_THEMES_BY_ID.get(expedition.themeId ?? '');
  if (!wipeTheme) {
    throw new AppError(500, 'Theme not found for expedition', 'NO_THEMES');
  }
  const wipeTemplateIdMap = await buildTemplateIdMap(wipeTheme);
  const rooms = generateExpeditionRooms(expedition.tier - 1, wipeTheme, Math.random, wipeTemplateIdMap);

  // Collect bot player IDs before the transaction deletes GuildExpeditionMember rows
  const botMembers = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId, player: { isBot: true } },
    select: { playerId: true },
  });
  const nextRoundAt = new Date(Date.now() + EXPEDITION_CONSTANTS.SIGNUP_WINDOW_MS);

  await prisma.$transaction(async (tx) => {
    await tx.guildExpeditionMember.deleteMany({ where: { expeditionId } });

    await tx.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        wipeCount: newWipeCount,
        expeditionAttemptLogs: JSON.parse(JSON.stringify(newAttemptLogs)),
        status: 'recruiting',
        currentRoom: 0,
        totalRooms: rooms.length,
        roomDefinitions: JSON.parse(JSON.stringify(rooms)),
        roomStartSnapshot: Prisma.DbNull,
        roundNumber: 0,
        roundSummaries: Prisma.DbNull,
        nextRoundAt,
      },
    });
  });
  roundTimerRegistry.schedule('guildExpedition', expeditionId, nextRoundAt, getIo);

  // Delete bot Player records after members are removed
  if (botMembers.length > 0) {
    await prisma.player.deleteMany({
      where: { id: { in: botMembers.map((m) => m.playerId) } },
    });
  }

  await addGuildLog(
    expedition.guildId,
    'expedition_wipe',
    `Expedition wipe in room ${expedition.currentRoom + 1} (attempt ${newWipeCount}/${EXPEDITION_CONSTANTS.MAX_ATTEMPTS})`,
    { expeditionId, roomIndex: expedition.currentRoom, attempt: newWipeCount },
  );
}

// ---------------------------------------------------------------------------
// Complete Expedition
// ---------------------------------------------------------------------------

export async function completeExpedition(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { include: { player: { select: { username: true } } } } },
  });
  if (!expedition) return;

  // Archive final successful attempt's logs alongside previous wipe attempts
  const finalAttemptLogs = buildUpdatedAttemptLogs(expedition, { outcome: 'completed' });

  // Set status completed
  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      nextRoundAt: null,
      expeditionAttemptLogs: JSON.parse(JSON.stringify(finalAttemptLogs)),
    },
  });
  roundTimerRegistry.cancel('guildExpedition', expeditionId);

  logger.info({
    expeditionId,
    guildId: expedition.guildId,
  }, 'Expedition completed');

  // Award completion bonus tokens
  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const roomTypes = rooms.map(r => r.roomType);
  await awardCompletionBonus(expedition.members, expedition.tier, roomTypes, expeditionId);

  // Award guild XP completion bonus
  await prisma.guild.update({
    where: { id: expedition.guildId },
    data: { xp: { increment: EXPEDITION_CONSTANTS.GUILD_XP_COMPLETION_BONUS } },
  });

  await addGuildLog(
    expedition.guildId,
    'expedition_completed',
    `Tier ${expedition.tier} expedition completed!`,
    { expeditionId },
  );

  // Set per-player-per-tier cooldowns
  await setExpeditionCooldowns(expeditionId, expedition.tier);

  // Notify expedition members
  for (const member of expedition.members) {
    void sendPush(member.playerId, 'expeditionFinished', {
      title: 'Expedition Complete!',
      body: `Your Tier ${expedition.tier} expedition was victorious!`,
      tag: 'expedition-finished',
      data: { type: 'expedition', expeditionId },
    });
  }

  await cleanupExpeditionBots(expeditionId);
}
