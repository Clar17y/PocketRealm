import { prisma as defaultPrisma } from '@pocketrealm/database';
import type { ChatInputCommandInteraction, Guild, GuildMember, User } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { syncLinkedRoles as defaultSyncLinkedRoles } from '../discord/roleSync.js';
import type { RoleSyncSummary, SyncLinkedRolesOptions } from '../discord/roleSync.js';
import { isStaffMember } from '../support/threadActions.js';
import { levelForDiscordXp } from '../xp/messageXp.js';

const MAX_XP_DECREMENT_ATTEMPTS = 5;

type StaffConfig = Pick<
  BotConfig,
  'guildId' | 'verifiedRoleId' | 'supportStaffRoleIds' | 'levelRoleMap'
>;

interface DiscordCommunityProfileRecord {
  id: string;
  discordGuildId: string;
  discordUserId: string;
  xp: number;
  level: number;
}

type StaffCommunityProfileWhere =
  | {
      discordGuildId_discordUserId: {
        discordGuildId: string;
        discordUserId: string;
      };
    }
  | { id: string };

interface StaffCommunityProfileDelegate {
  findUnique(args: {
    where: StaffCommunityProfileWhere;
  }): Promise<DiscordCommunityProfileRecord | null>;
  update(args: {
    where: { id: string };
    data: {
      xp?: number | { increment: number } | { decrement: number };
      level?: number;
      lastRoleSyncAt?: Date;
    };
  }): Promise<DiscordCommunityProfileRecord>;
  updateMany(args: {
    where: {
      id: string;
      xp?: number;
    };
    data: {
      xp: { decrement: number };
    };
  }): Promise<{ count: number }>;
  create(args: {
    data: {
      discordGuildId: string;
      discordUserId: string;
      xp: number;
      level: number;
      dailyXp?: number;
    };
  }): Promise<DiscordCommunityProfileRecord>;
}

interface StaffAuditDelegate {
  create(args: {
    data: {
      guildId: string;
      actorDiscordUserId: string;
      targetDiscordUserId?: string;
      command: string;
      status: string;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    };
  }): Promise<unknown>;
}

interface StaffTransactionClient {
  discordCommunityProfile: StaffCommunityProfileDelegate;
  discordBotAuditEvent: StaffAuditDelegate;
}

export interface StaffPrismaClient extends StaffTransactionClient {
  $transaction<T>(callback: (tx: StaffTransactionClient) => Promise<T>): Promise<T>;
}

interface XpAdjustmentResult {
  profileId: string | null;
  targetUserId: string;
  amount: number;
  previousXp: number;
  newXp: number;
  previousLevel: number;
  newLevel: number;
  reason: string;
}

type SyncLinkedRolesFn = (options: SyncLinkedRolesOptions) => Promise<RoleSyncSummary>;

export interface StaffCommandOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  config: StaffConfig;
  prisma?: StaffPrismaClient;
  syncLinkedRoles?: SyncLinkedRolesFn;
  now?: () => Date;
}

export async function handleStaffCommand(
  interaction: ChatInputCommandInteraction,
  options: StaffCommandOptions,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: 'Staff commands only work in the PocketRealm Discord server.',
    });
    return;
  }

  const staffRoleIds = new Set(options.config.supportStaffRoleIds);
  if (staffRoleIds.size === 0) {
    await interaction.reply({
      ephemeral: true,
      content: 'Staff commands are not configured. Ask an administrator to set support staff roles.',
    });
    return;
  }

  if (!isStaffMember(interaction.member, staffRoleIds)) {
    await interaction.reply({
      ephemeral: true,
      content: 'Only support staff can use staff commands.',
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'sync-roles') {
    await handleSyncRoles(interaction, options);
    return;
  }

  if (subcommand === 'xp-adjust') {
    await handleXpAdjust(interaction, options);
    return;
  }

  await interaction.editReply({
    content: `The /staff ${subcommand} command is not available yet.`,
  });
}

async function handleSyncRoles(
  interaction: ChatInputCommandInteraction,
  options: StaffCommandOptions,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.editReply({ content: 'Could not sync roles because the guild is unavailable.' });
    return;
  }

  const syncLinkedRoles = options.syncLinkedRoles ?? defaultSyncLinkedRoles;
  const summary = await syncLinkedRoles({
    api: options.api,
    guild: interaction.guild,
    config: options.config,
  });

  await interaction.editReply({
    content: `Role sync complete: ${summary.roleSynced} synced, ${summary.missingMembers} missing, ${summary.failed} failed out of ${summary.fetched} linked players.`,
  });
}

async function handleXpAdjust(
  interaction: ChatInputCommandInteraction,
  options: StaffCommandOptions,
): Promise<void> {
  const prisma = (options.prisma ?? defaultPrisma) as unknown as StaffPrismaClient;
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = normalizeReason(interaction.options.getString('reason', true));

  try {
    const adjustment = await adjustDiscordXp({
      prisma,
      guildId: interaction.guildId!,
      actorDiscordUserId: interaction.user.id,
      target,
      amount,
      reason,
    });

    await syncAdjustedLevelRole(interaction.guild, prisma, options.config, adjustment, options.now?.() ?? new Date());

    await interaction.editReply({
      content: `Adjusted <@${target.id}> by ${amount} XP. New total: ${adjustment.newXp} XP (level ${adjustment.newLevel}).`,
    });
  } catch (error) {
    await recordStaffFailure(prisma, {
      guildId: interaction.guildId!,
      actorDiscordUserId: interaction.user.id,
      targetDiscordUserId: target.id,
      command: '/staff xp-adjust',
      errorCode: 'DISCORD_STAFF_XP_ADJUST_FAILED',
      reason,
      amount,
    });

    await interaction.editReply({
      content: 'Could not adjust Discord XP right now. Try again or check bot logs.',
    });
  }
}

async function adjustDiscordXp(input: {
  prisma: StaffPrismaClient;
  guildId: string;
  actorDiscordUserId: string;
  target: User;
  amount: number;
  reason: string;
}): Promise<XpAdjustmentResult> {
  return input.prisma.$transaction(async (tx) => {
    const profile = await tx.discordCommunityProfile.findUnique({
      where: {
        discordGuildId_discordUserId: {
          discordGuildId: input.guildId,
          discordUserId: input.target.id,
        },
      },
    });
    const previousXp = profile?.xp ?? 0;
    const { updatedProfile, appliedAmount } = await applyXpAdjustment(tx, {
      profile,
      guildId: input.guildId,
      targetDiscordUserId: input.target.id,
      amount: input.amount,
      previousXp,
    });
    const newXp = updatedProfile?.xp ?? 0;
    const effectivePreviousXp = Math.max(0, newXp - appliedAmount);
    const previousLevel = levelForDiscordXp(effectivePreviousXp);
    const newLevel = levelForDiscordXp(newXp);
    const normalizedProfile = updatedProfile && updatedProfile.level !== newLevel
      ? await tx.discordCommunityProfile.update({
          where: { id: updatedProfile.id },
          data: { level: newLevel },
        })
      : updatedProfile;

    await tx.discordBotAuditEvent.create({
      data: {
        guildId: input.guildId,
        actorDiscordUserId: input.actorDiscordUserId,
        targetDiscordUserId: input.target.id,
        command: '/staff xp-adjust',
        status: 'success',
        metadata: {
          amount: input.amount,
          appliedAmount,
          previousXp: effectivePreviousXp,
          newXp,
          previousLevel,
          newLevel,
          reason: input.reason,
        },
      },
    });

    return {
      profileId: normalizedProfile?.id ?? null,
      targetUserId: input.target.id,
      amount: input.amount,
      previousXp: effectivePreviousXp,
      newXp,
      previousLevel,
      newLevel,
      reason: input.reason,
    };
  });
}

async function applyXpAdjustment(
  tx: StaffTransactionClient,
  input: {
    profile: DiscordCommunityProfileRecord | null;
    guildId: string;
    targetDiscordUserId: string;
    amount: number;
    previousXp: number;
  },
): Promise<{ updatedProfile: DiscordCommunityProfileRecord | null; appliedAmount: number }> {
  if (!input.profile) {
    if (input.amount <= 0) {
      return { updatedProfile: null, appliedAmount: 0 };
    }

    return {
      updatedProfile: await tx.discordCommunityProfile.create({
        data: {
          discordGuildId: input.guildId,
          discordUserId: input.targetDiscordUserId,
          xp: input.amount,
          level: levelForDiscordXp(input.amount),
          dailyXp: 0,
        },
      }),
      appliedAmount: input.amount,
    };
  }

  if (input.amount >= 0) {
    return {
      updatedProfile: await tx.discordCommunityProfile.update({
        where: { id: input.profile.id },
        data: {
          xp: { increment: input.amount },
        },
      }),
      appliedAmount: input.amount,
    };
  }

  return applyGuardedXpDecrement(tx, input.profile, Math.abs(input.amount));
}

async function applyGuardedXpDecrement(
  tx: StaffTransactionClient,
  profile: DiscordCommunityProfileRecord,
  requestedDecrement: number,
): Promise<{ updatedProfile: DiscordCommunityProfileRecord | null; appliedAmount: number }> {
  let currentProfile: DiscordCommunityProfileRecord | null = profile;

  for (let attempt = 0; attempt < MAX_XP_DECREMENT_ATTEMPTS; attempt += 1) {
    if (!currentProfile || currentProfile.xp <= 0) {
      return { updatedProfile: currentProfile, appliedAmount: 0 };
    }

    const decrement = Math.min(requestedDecrement, currentProfile.xp);
    const update = await tx.discordCommunityProfile.updateMany({
      where: {
        id: currentProfile.id,
        xp: currentProfile.xp,
      },
      data: {
        xp: { decrement },
      },
    });

    if (update.count === 1) {
      const updatedProfile = await tx.discordCommunityProfile.findUnique({
        where: { id: currentProfile.id },
      });
      if (!updatedProfile) {
        throw new Error('Discord community profile disappeared after XP decrement');
      }

      return {
        updatedProfile,
        appliedAmount: -decrement,
      };
    }

    currentProfile = await tx.discordCommunityProfile.findUnique({
      where: { id: currentProfile.id },
    });
  }

  throw new Error('Could not apply Discord staff XP decrement safely');
}

async function syncAdjustedLevelRole(
  guild: Guild | null,
  prisma: StaffPrismaClient,
  config: StaffConfig,
  adjustment: XpAdjustmentResult,
  now: Date,
): Promise<void> {
  const roleId = highestRoleIdForLevel(adjustment.newLevel, config.levelRoleMap);
  if (!guild || !roleId) return;

  const member = await guild.members.fetch(adjustment.targetUserId).catch(() => null);
  if (!member) return;

  try {
    await member.roles.add(roleId);
  } catch {
    return;
  }

  if (adjustment.profileId) {
    await prisma.discordCommunityProfile.update({
      where: { id: adjustment.profileId },
      data: { lastRoleSyncAt: now },
    }).catch(() => undefined);
  }
}

function highestRoleIdForLevel(level: number, levelRoleMap: Map<number, string>): string | null {
  let selectedLevel = 0;
  let selectedRoleId: string | null = null;

  for (const [roleLevel, roleId] of levelRoleMap.entries()) {
    if (level >= roleLevel && roleLevel > selectedLevel) {
      selectedLevel = roleLevel;
      selectedRoleId = roleId;
    }
  }

  return selectedRoleId;
}

async function recordStaffFailure(
  prisma: StaffPrismaClient,
  data: {
    guildId: string;
    actorDiscordUserId: string;
    targetDiscordUserId: string;
    command: string;
    errorCode: string;
    reason: string;
    amount: number;
  },
): Promise<void> {
  await prisma.discordBotAuditEvent.create({
    data: {
      guildId: data.guildId,
      actorDiscordUserId: data.actorDiscordUserId,
      targetDiscordUserId: data.targetDiscordUserId,
      command: data.command,
      status: 'failed',
      errorCode: data.errorCode,
      metadata: {
        amount: data.amount,
        reason: data.reason,
      },
    },
  }).catch(() => undefined);
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  return (trimmed || 'staff adjustment').slice(0, 500);
}
