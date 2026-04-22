import { prisma } from '@pocketrealm/database';
import { addStackableItemTx } from '../inventoryService';
import { AppError } from '../../middleware/errorHandler';
import {
  ALL_SKILLS,
  EXPEDITION_CONSTANTS,
  HP_CONSTANTS,
} from '@pocketrealm/shared';
import { calculateMaxMana, calculateMaxStamina } from '@pocketrealm/game-engine';
import { adminAudit } from './adminAuditService';

export async function grantAdminGuildTreasury(playerId: string, amount: number) {
  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership) {
    throw new AppError(400, 'You must be in a guild', 'NOT_IN_GUILD');
  }

  const guild = await prisma.guild.update({
    where: { id: membership.guildId },
    data: { treasuryTurns: { increment: amount } },
    select: { treasuryTurns: true },
  });

  await adminAudit(playerId, 'grant_treasury', {
    guildId: membership.guildId,
    amount,
    treasuryTurns: guild.treasuryTurns,
  });

  return { treasuryTurns: guild.treasuryTurns };
}

export async function resetAdminExpeditionCooldowns(playerId: string) {
  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership) {
    throw new AppError(400, 'You must be in a guild', 'NOT_IN_GUILD');
  }

  const farPast = new Date('2000-01-01');
  const { count } = await prisma.guildExpedition.updateMany({
    where: { guildId: membership.guildId, status: { in: ['completed', 'failed'] } },
    data: { completedAt: farPast },
  });

  await adminAudit(playerId, 'reset_expedition_cooldowns', {
    guildId: membership.guildId,
    expeditionsReset: count,
  });

  return { expeditionsReset: count };
}

export async function fillAdminExpedition(playerId: string) {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: true },
  });
  if (!membership) {
    throw new AppError(400, 'You must be in a guild', 'NOT_IN_GUILD');
  }

  const expedition = await prisma.guildExpedition.findFirst({
    where: { guildId: membership.guildId, status: 'recruiting' },
    include: { members: true },
  });
  if (!expedition) {
    throw new AppError(404, 'No recruiting expedition found', 'NO_EXPEDITION');
  }

  const minParticipants = EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[expedition.tier - 1];
  const currentCount = expedition.members.length;
  const botsNeeded = Math.max(0, minParticipants - currentCount);

  if (botsNeeded === 0) {
    return {
      message: 'Expedition already has enough participants',
      botsCreated: 0,
    };
  }

  const botLevel = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[expedition.tier - 1] + 5;
  const botVitality = 20;
  const botAttributes = {
    vitality: botVitality,
    strength: 20,
    dexterity: 20,
    intelligence: 20,
    luck: 10,
    evasion: 10,
  };
  const maxHp = HP_CONSTANTS.BASE_HP + botVitality * HP_CONSTANTS.HP_PER_VITALITY;
  const maxStamina = calculateMaxStamina({
    meleeLevel: 10,
    rangedLevel: 10,
    evasionLevel: 10,
    equipmentStaminaBonus: 0,
  });
  const maxMana = calculateMaxMana({
    magicLevel: 10,
    equipmentManaBonus: 0,
  });

  const botIds: string[] = [];
  const timestamp = Date.now();

  for (let index = 0; index < botsNeeded; index += 1) {
    const botName = `ExpBot_${timestamp}_${index}`;
    const botId = await prisma.$transaction(async (tx) => {
      const bot = await tx.player.create({
        data: {
          username: botName,
          email: `${botName}@bot.local`,
          passwordHash: 'bot-no-login',
          isBot: true,
          characterLevel: botLevel,
          attributes: botAttributes,
        },
      });

      await Promise.all([
        tx.guildMember.create({
          data: { guildId: membership.guildId, playerId: bot.id, role: 'member' },
        }),
        tx.turnBank.create({
          data: { playerId: bot.id, currentTurns: 100_000, lastRegenAt: new Date() },
        }),
        tx.playerStats.create({
          data: { playerId: bot.id },
        }),
        tx.playerSkill.createMany({
          data: ALL_SKILLS.map((skillType: string) => ({
            playerId: bot.id,
            skillType,
            level: 10,
            xp: BigInt(0),
          })),
        }),
      ]);

      const template = await tx.combatTemplate.create({
        data: { playerId: bot.id, name: 'Bot Expedition', isActive: true },
      });
      await tx.combatTemplateSlot.createMany({
        data: [
          { templateId: template.id, sortOrder: 0, actionId: 'light_attack', conditionType: 'no_buff', effectName: 'Battle Cry', thenActionId: 'battle_cry' },
          { templateId: template.id, sortOrder: 1, actionId: 'venomous_strike', conditionType: 'resource_below', resource: 'hp', threshold: 50, thenActionId: 'use_hp_potion' },
          { templateId: template.id, sortOrder: 2, actionId: 'rending_slash', conditionType: 'resource_below', resource: 'hp', threshold: 50, thenActionId: 'use_hp_potion' },
          { templateId: template.id, sortOrder: 3, actionId: 'light_attack', conditionType: 'resource_below', resource: 'hp', threshold: 50, thenActionId: 'use_hp_potion' },
          { templateId: template.id, sortOrder: 4, actionId: 'light_attack', conditionType: 'resource_below', resource: 'hp', threshold: 50, thenActionId: 'use_hp_potion' },
        ],
      });

      const potionTemplate = await tx.itemTemplate.findFirst({
        where: { itemType: 'consumable', name: { contains: 'Health Potion', mode: 'insensitive' } },
        orderBy: { tier: 'asc' },
      });
      if (potionTemplate) {
        await addStackableItemTx(tx, bot.id, potionTemplate.id, 100);
      }

      await tx.guildExpeditionMember.create({
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

      return bot.id;
    });

    botIds.push(botId);
  }

  await adminAudit(playerId, 'fill_expedition', {
    expeditionId: expedition.id,
    botsCreated: botsNeeded,
    botIds,
  });

  return {
    message: `Created ${botsNeeded} bot participants`,
    botsCreated: botsNeeded,
    botIds,
    totalParticipants: currentCount + botsNeeded,
    minRequired: minParticipants,
  };
}
