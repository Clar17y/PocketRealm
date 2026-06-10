import { highestRoleIdForLevel } from '@pocketrealm/shared/discord/discordXp';
import type { ChatInputCommandInteraction, Guild, GuildMember } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { syncLinkedRoles as defaultSyncLinkedRoles } from '../discord/roleSync.js';
import type { RoleSyncSummary, SyncLinkedRolesOptions } from '../discord/roleSync.js';
import {
  cleanupSupportTriageMessages as defaultCleanupSupportTriageMessages,
  isTriageCleanupChannel,
  type CleanupSupportTriageMessagesFn,
  type TriageCleanupSummary,
} from '../support/triageCleanup.js';
import { isStaffMember } from '../support/threadActions.js';

type StaffConfig = Pick<
  BotConfig,
  'guildId' | 'playerRoleId' | 'verifiedRoleId' | 'supportTriageChannelId' | 'supportStaffRoleIds' | 'levelRoleMap'
>;

interface XpAdjustmentResult {
  profileId: string | null;
  targetDiscordUserId: string;
  amount: number;
  previousXp: number;
  newXp: number;
  previousLevel: number;
  newLevel: number;
  reason: string;
}

interface XpAdjustmentApiResponse {
  adjustment: XpAdjustmentResult;
}

interface XpRoleSyncApiClient {
  post<T>(path: string, body: unknown): Promise<T>;
}

type SyncLinkedRolesFn = (options: SyncLinkedRolesOptions) => Promise<RoleSyncSummary>;

export interface StaffCommandOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  config: StaffConfig;
  syncLinkedRoles?: SyncLinkedRolesFn;
  cleanupSupportTriageMessages?: CleanupSupportTriageMessagesFn;
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

  if (subcommand === 'cleanup-triage') {
    await handleCleanupTriage(interaction, options);
    return;
  }

  await interaction.editReply({
    content: `The /staff ${subcommand} command is not available yet.`,
  });
}

async function handleCleanupTriage(
  interaction: ChatInputCommandInteraction,
  options: StaffCommandOptions,
): Promise<void> {
  const channel = await interaction.client.channels.fetch(options.config.supportTriageChannelId).catch(() => null);
  if (!isTriageCleanupChannel(channel)) {
    await interaction.editReply({ content: 'Could not clean up support triage because the channel is unavailable.' });
    return;
  }

  const cleanupSupportTriageMessages = options.cleanupSupportTriageMessages ?? defaultCleanupSupportTriageMessages;
  const publicId = interaction.options.getString('public_id')?.trim() || null;
  const scanLimit = interaction.options.getInteger('scan_limit') ?? 100;
  const confirm = interaction.options.getBoolean('confirm') ?? false;

  try {
    const summary = await cleanupSupportTriageMessages({
      channel,
      botUserId: interaction.client.user?.id ?? null,
      publicId,
      scanLimit,
      confirm,
    });
    await interaction.editReply({ content: formatTriageCleanupSummary(summary) });
  } catch {
    await interaction.editReply({ content: 'Could not clean up support triage right now. Try again or check bot logs.' });
  }
}

function formatTriageCleanupSummary(summary: TriageCleanupSummary): string {
  const scope = summary.targetPublicId ? ` for \`${summary.targetPublicId}\`` : '';
  const cardLabel = pluralize(summary.duplicateCandidates, 'card');
  const ticketLabel = pluralize(summary.duplicateTicketCount, 'ticket');

  if (summary.duplicateCandidates === 0) {
    return `Triage cleanup found no duplicate support triage cards${scope} in the last ${summary.scanned} scanned messages.`;
  }

  if (!summary.confirmed) {
    return `Triage cleanup preview${scope}: ${summary.duplicateCandidates} duplicate ${cardLabel} would be deleted across ${summary.duplicateTicketCount} ${ticketLabel}. Re-run with \`confirm:true\` to delete.`;
  }

  return `Triage cleanup complete${scope}: deleted ${summary.deleted} duplicate ${pluralize(summary.deleted, 'card')} across ${summary.duplicateTicketCount} ${ticketLabel}. ${summary.skipped} skipped, ${summary.failed} failed.`;
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
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
  let summary: RoleSyncSummary;
  try {
    summary = await syncLinkedRoles({
      api: options.api,
      guild: interaction.guild,
      config: options.config,
    });
  } catch {
    await interaction.editReply({ content: 'Could not sync roles right now. Try again or check bot logs.' });
    return;
  }

  await interaction.editReply({
    content: `Role sync complete: ${summary.roleSynced} synced, ${summary.missingMembers} missing, ${summary.failed} failed out of ${summary.fetched} linked players.`,
  });
}

async function handleXpAdjust(
  interaction: ChatInputCommandInteraction,
  options: StaffCommandOptions,
): Promise<void> {
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = normalizeReason(interaction.options.getString('reason', true));

  try {
    const response = await options.api.post<XpAdjustmentApiResponse>('/api/v1/discord/xp/adjustments', {
      discordGuildId: interaction.guildId!,
      actorDiscordUserId: interaction.user.id,
      targetDiscordUserId: target.id,
      amount,
      reason,
    });
    const adjustment = response.adjustment;

    await syncAdjustedLevelRole(interaction.guild, options.api, options.config, adjustment, options.now?.() ?? new Date());

    await interaction.editReply({
      content: `Adjusted <@${target.id}> by ${amount} XP. New total: ${adjustment.newXp} XP (level ${adjustment.newLevel}).`,
    });
  } catch {
    await interaction.editReply({
      content: 'Could not adjust Discord XP right now. Try again or check bot logs.',
    });
  }
}

async function syncAdjustedLevelRole(
  guild: Guild | null,
  api: XpRoleSyncApiClient,
  config: StaffConfig,
  adjustment: XpAdjustmentResult,
  now: Date,
): Promise<void> {
  const roleId = highestRoleIdForLevel(adjustment.newLevel, config.levelRoleMap);
  if (!guild || !roleId) return;

  const member = await guild.members.fetch(adjustment.targetDiscordUserId).catch(() => null);
  if (!member) return;

  try {
    await member.roles.add(roleId);
  } catch {
    return;
  }

  if (adjustment.profileId) {
    await api.post('/api/v1/discord/xp/role-sync', {
      profileId: adjustment.profileId,
      discordGuildId: guild.id,
      discordUserId: adjustment.targetDiscordUserId,
      roleId,
      level: adjustment.newLevel,
      syncedAt: now.toISOString(),
    }).catch(() => undefined);
  }
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  return (trimmed || 'staff adjustment').slice(0, 500);
}
