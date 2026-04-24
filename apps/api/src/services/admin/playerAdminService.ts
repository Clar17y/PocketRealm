import { Prisma, prisma } from '@pocketrealm/database';
import {
  ALL_SKILLS,
  type PlayerAttributes,
} from '@pocketrealm/shared';
import { characterLevelFromXp, xpForLevel } from '@pocketrealm/game-engine';
import { normalizePlayerAttributes } from '../attributesService';
import { grantPremiumDays, listPremiumPurchases } from '../premiumService';
import { buildStateUpdates } from '../stateUpdateHelpers';
import { refundPlayerTurns } from '../turnBankService';
import { adminAudit, adminAuditTx } from './adminAuditService';

type AdminSkillType = typeof ALL_SKILLS[number];

type PlayerAttributeKey =
  | 'vitality'
  | 'strength'
  | 'dexterity'
  | 'intelligence'
  | 'luck'
  | 'evasion';

export interface SetAdminPlayerAttributesInput {
  attributePoints?: number;
  attributes?: Partial<Record<PlayerAttributeKey, number>>;
}

export interface GrantAdminPremiumInput {
  adminId: string;
  playerId: string;
  days: number;
  reason?: string;
}

export async function grantAdminTurns(adminId: string, amount: number) {
  const result = await refundPlayerTurns(adminId, amount);
  await adminAudit(adminId, 'grant_turns', { amount });
  return result;
}

export async function listPlayerPremiumPurchases(playerId: string) {
  return listPremiumPurchases(playerId);
}

export async function grantAdminPremium({
  adminId,
  playerId,
  days,
  reason,
}: GrantAdminPremiumInput) {
  return prisma.$transaction(async (tx) => {
    const purchase = await grantPremiumDays({
      playerId,
      provider: 'admin',
      productType: 'admin_grant',
      amount: 0,
      currency: 'usd',
      days,
      metadata: {
        grantedByAdminId: adminId,
        ...(reason ? { reason } : {}),
      },
    }, tx);

    await adminAuditTx(tx, adminId, 'grant_premium', {
      targetPlayerId: playerId,
      days,
      purchaseId: purchase.id,
      ...(reason ? { reason } : {}),
    });

    return purchase;
  });
}

export async function setAdminPlayerLevel(playerId: string, level: number) {
  const xp = xpForLevel(level);
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
  });
  const levelDiff = Math.max(0, level - player.characterLevel);

  await prisma.player.update({
    where: { id: playerId },
    data: {
      characterLevel: level,
      characterXp: BigInt(xp),
      attributePoints: { increment: levelDiff },
    },
  });
  await adminAudit(playerId, 'set_level', { level });
  const stateUpdates = await buildStateUpdates(playerId, ['characterProgression']);
  return { level, characterXp: xp, stateUpdates };
}

export async function setAdminSkillLevel(playerId: string, skillType: AdminSkillType, level: number) {
  const xp = xpForLevel(level);

  await prisma.playerSkill.upsert({
    where: { playerId_skillType: { playerId, skillType } },
    update: { level, xp: BigInt(xp) },
    create: { playerId, skillType, level, xp: BigInt(xp) },
  });

  await adminAudit(playerId, 'set_skill_level', { skillType, level });
  const stateUpdates = await buildStateUpdates(playerId, ['skills', 'resources']);
  return { skillType, level, stateUpdates };
}

export async function setAdminSkillLevels(playerId: string, skillTypes: AdminSkillType[], level: number) {
  const xp = xpForLevel(level);

  await prisma.$transaction(
    skillTypes.map((skillType) =>
      prisma.playerSkill.upsert({
        where: { playerId_skillType: { playerId, skillType } },
        update: { level, xp: BigInt(xp) },
        create: { playerId, skillType, level, xp: BigInt(xp) },
      }),
    ),
  );

  await adminAudit(playerId, 'set_skill_levels', { skillTypes, level });
  const stateUpdates = await buildStateUpdates(playerId, ['skills', 'resources']);
  return { skillTypes, level, stateUpdates };
}

export async function grantAdminXp(playerId: string, amount: number) {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { characterXp: true, characterLevel: true },
  });
  const newXp = Number(player.characterXp) + amount;
  const newLevel = characterLevelFromXp(newXp);
  const levelUps = Math.max(0, newLevel - player.characterLevel);

  await prisma.player.update({
    where: { id: playerId },
    data: {
      characterXp: BigInt(newXp),
      characterLevel: newLevel,
      attributePoints: { increment: levelUps },
    },
  });
  await adminAudit(playerId, 'grant_xp', { amount, newLevel, levelUps });
  const stateUpdates = await buildStateUpdates(playerId, ['characterProgression']);
  return { characterXp: newXp, characterLevel: newLevel, levelUps, stateUpdates };
}

export async function setAdminPlayerAttributes(
  playerId: string,
  { attributePoints, attributes }: SetAdminPlayerAttributesInput,
) {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { attributes: true, attributePoints: true },
  });
  const current = normalizePlayerAttributes(player.attributes);
  const merged: PlayerAttributes = { ...current, ...(attributes ?? {}) };
  const data: Prisma.PlayerUncheckedUpdateInput = {};

  if (attributes) {
    data.attributes = merged as unknown as Prisma.InputJsonValue;
  }
  if (attributePoints !== undefined) {
    data.attributePoints = attributePoints;
  }

  await prisma.player.update({ where: { id: playerId }, data });
  await adminAudit(playerId, 'set_attributes', { attributes: merged, attributePoints });
  const stateUpdates = await buildStateUpdates(playerId, ['hp', 'resources', 'characterProgression']);

  return {
    attributes: merged,
    attributePoints: attributePoints ?? player.attributePoints,
    stateUpdates,
  };
}

export async function grantAdminQuestTokens(playerId: string, amount: number) {
  const state = await prisma.playerQuestState.upsert({
    where: { playerId },
    create: {
      playerId,
      questTokens: amount,
      dailyBonusClaimed: false,
      lastDailyReset: new Date('2000-01-01'),
      lastWeeklyReset: new Date('2000-01-01'),
    },
    update: { questTokens: { increment: amount } },
  });

  await adminAudit(playerId, 'grant_tokens', { amount, questTokens: state.questTokens });
  return { questTokens: state.questTokens };
}
