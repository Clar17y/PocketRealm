import {
  ChannelType,
  type ButtonInteraction,
  type PrivateThreadChannel,
  type Snowflake,
  type TextChannel,
} from 'discord.js';

import { PocketRealmApiError, type PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { parseSupportButtonId } from '../discord/components.js';

const STATUS_ACTIONS = new Map<string, string>([
  ['needs_info', 'needs_info'],
  ['accepted', 'accepted'],
  ['rejected', 'rejected'],
  ['security', 'security'],
  ['closed', 'closed'],
]);

interface SupportThreadActionOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  config: Pick<BotConfig, 'supportStaffRoleIds'>;
}

interface SupportActionContextResponse {
  ticket: {
    publicId: string;
    title: string;
    reporterDiscordUserId: string | null;
    threadId: string | null;
    triageChannelId: string;
    triageMessageId: string;
  };
}

interface ArchivableDiscordThread {
  id: string;
  setArchived(archived: boolean, reason?: string): Promise<unknown>;
  delete?(reason?: string): Promise<unknown>;
}

export function isStaffMember(member: unknown, staffRoleIds: Set<string>): boolean {
  if (!isRecord(member) || !isRecord(member.roles)) {
    return false;
  }

  if (Array.isArray(member.roles)) {
    return member.roles.some((roleId) => typeof roleId === 'string' && staffRoleIds.has(roleId));
  }

  const cache = member.roles.cache;
  if (!isRecord(cache) || typeof cache.some !== 'function') {
    return false;
  }

  return cache.some((role: unknown) => isRecord(role) && typeof role.id === 'string' && staffRoleIds.has(role.id));
}

export async function handleSupportThreadAction(
  interaction: ButtonInteraction,
  options: SupportThreadActionOptions,
): Promise<void> {
  const parsed = parseSupportButtonId(interaction.customId);
  if (!parsed) return;

  const staffRoleIds = new Set(options.config.supportStaffRoleIds);
  if (staffRoleIds.size === 0) {
    await interaction.reply({
      ephemeral: true,
      content: 'Support actions are not configured. Ask an administrator to set support staff roles.',
    });
    return;
  }

  if (!isStaffMember(interaction.member, staffRoleIds)) {
    await interaction.reply({
      ephemeral: true,
      content: 'Only support staff can use these ticket actions.',
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (parsed.action === 'ask_reporter') {
      await handleAskReporter(interaction, options.api, parsed.publicId);
      return;
    }

    if (parsed.action === 'archive_thread') {
      await handleArchiveThread(interaction, options.api, parsed.publicId);
      return;
    }

    const status = STATUS_ACTIONS.get(parsed.action);
    if (status) {
      await options.api.post(`/api/v1/discord/support/tickets/${parsed.publicId}/status`, {
        status,
        actorDiscordUserId: interaction.user.id,
      });
      await interaction.editReply({
        content: `Updated \`${parsed.publicId}\` status to \`${status}\`.`,
      });
      return;
    }

    await interaction.editReply({
      content: `Unsupported support action for \`${parsed.publicId}\`.`,
    });
  } catch {
    await interaction.editReply({
      content: `Could not complete the support action for \`${parsed.publicId}\`. Try again or use staff tools.`,
    });
  }
}

async function handleAskReporter(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get' | 'post'>,
  publicId: string,
): Promise<void> {
  const { ticket } = await fetchActionContext(api, publicId);

  if (ticket.threadId) {
    await interaction.editReply({
      content: `Follow-up thread already exists: <#${ticket.threadId}>.`,
    });
    return;
  }

  const triageChannel = interaction.channel;
  if (!isThreadCreatableTextChannel(triageChannel)) {
    await interaction.editReply({
      content: `Cannot create a follow-up thread for \`${ticket.publicId}\` from this channel.`,
    });
    return;
  }

  const thread = await triageChannel.threads.create({
    name: `${ticket.publicId} follow-up`,
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Support follow-up for ${ticket.publicId}`,
  });

  let reporterAddFailed = false;
  if (ticket.reporterDiscordUserId) {
    try {
      await thread.members.add(ticket.reporterDiscordUserId);
    } catch {
      reporterAddFailed = true;
    }
  }

  await thread.send({
    content: [
      `Support follow-up for \`${ticket.publicId}\`: ${ticket.title}`,
      ticket.reporterDiscordUserId
        ? 'Use this thread for staff questions and reporter follow-up. Keep raw private report details in staff tools.'
        : 'Reporter Discord account is not linked or available. Use this thread for staff coordination only.',
    ].join('\n'),
  });

  try {
    await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/thread`, {
      threadId: thread.id,
      createdByDiscordUserId: interaction.user.id,
    });
  } catch (error) {
    if (isDiscordThreadConflict(error)) {
      const duplicateCleanedUp = await cleanupDuplicateThread(thread, ticket.publicId);
      const existingThreadId = await refetchThreadId(api, ticket.publicId);
      const cleanupMessage = duplicateCleanedUp
        ? 'Removed the duplicate thread.'
        : 'A duplicate thread was created but could not be removed automatically.';
      await interaction.editReply({
        content: existingThreadId
          ? `Follow-up thread already exists: <#${existingThreadId}>. ${cleanupMessage}`
          : `Follow-up thread already exists for \`${ticket.publicId}\`. ${cleanupMessage}`,
      });
      return;
    }

    throw error;
  }

  await interaction.editReply({
    content: reporterAddFailed
      ? `Created follow-up thread <#${thread.id}>, but the reporter could not be added.`
      : `Created follow-up thread <#${thread.id}>.`,
  });
}

async function handleArchiveThread(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get' | 'post'>,
  publicId: string,
): Promise<void> {
  const { ticket } = await fetchActionContext(api, publicId);

  if (!ticket.threadId) {
    await interaction.editReply({
      content: `No follow-up thread exists for \`${ticket.publicId}\`.`,
    });
    return;
  }

  try {
    const thread = await resolveArchiveTargetThread(interaction.channel, ticket.threadId);
    if (!thread) {
      throw new Error('Mapped support thread could not be resolved.');
    }

    await thread.setArchived(true, `Support thread archived for ${ticket.publicId}`);
  } catch {
    await interaction.editReply({
      content: `Could not archive the Discord thread for \`${ticket.publicId}\`. Try again or archive it manually.`,
    });
    return;
  }

  await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/archive-thread`, {
    actorDiscordUserId: interaction.user.id,
  });
  await interaction.editReply({
    content: `Archived support thread for \`${ticket.publicId}\`.`,
  });
}

async function fetchActionContext(
  api: Pick<PocketRealmApiClient, 'get'>,
  publicId: string,
): Promise<SupportActionContextResponse> {
  return api.get<SupportActionContextResponse>(`/api/v1/discord/support/tickets/${publicId}/action-context`);
}

function isThreadCreatableTextChannel(channel: ButtonInteraction['channel']): channel is TextChannel {
  return Boolean(channel && 'threads' in channel && typeof channel.threads.create === 'function');
}

function currentPrivateThread(
  channel: ButtonInteraction['channel'],
  expectedThreadId: Snowflake | null,
): PrivateThreadChannel | null {
  if (!isPrivateThreadChannel(channel)) {
    return null;
  }

  if (expectedThreadId && channel.id !== expectedThreadId) {
    return null;
  }

  return channel as PrivateThreadChannel;
}

async function resolveArchiveTargetThread(
  channel: ButtonInteraction['channel'],
  threadId: Snowflake | null,
): Promise<PrivateThreadChannel | null> {
  const currentThread = currentPrivateThread(channel, threadId);
  if (currentThread) {
    return currentThread;
  }

  if (!threadId) {
    return null;
  }

  if (!isThreadFetchableTextChannel(channel)) {
    throw new Error('Mapped support thread is not fetchable from this interaction channel.');
  }

  const thread = await channel.threads.fetch(threadId);
  if (!isPrivateThreadChannel(thread)) {
    throw new Error('Mapped support thread could not be fetched.');
  }

  return thread;
}

function isThreadFetchableTextChannel(
  channel: ButtonInteraction['channel'],
): channel is TextChannel & { threads: { fetch(threadId: Snowflake): Promise<unknown> } } {
  return Boolean(channel && 'threads' in channel && typeof channel.threads.fetch === 'function');
}

function isPrivateThreadChannel(channel: unknown): channel is PrivateThreadChannel {
  return Boolean(
    channel &&
      typeof channel === 'object' &&
      'id' in channel &&
      typeof channel.id === 'string' &&
      'setArchived' in channel &&
      typeof channel.setArchived === 'function',
  );
}

async function cleanupDuplicateThread(thread: ArchivableDiscordThread, publicId: string): Promise<boolean> {
  try {
    await thread.setArchived(true, `Duplicate support follow-up for ${publicId}`);
    return true;
  } catch {
    // Fall through to delete when available.
  }

  if ('delete' in thread && typeof thread.delete === 'function') {
    try {
      await thread.delete(`Duplicate support follow-up for ${publicId}`);
      return true;
    } catch {
      // Staff still get a response; cleanup failure is not actionable in the button flow.
    }
  }

  return false;
}

async function refetchThreadId(
  api: Pick<PocketRealmApiClient, 'get'>,
  publicId: string,
): Promise<string | null> {
  try {
    const { ticket } = await fetchActionContext(api, publicId);
    return ticket.threadId;
  } catch {
    return null;
  }
}

function isDiscordThreadConflict(error: unknown): boolean {
  if (error instanceof PocketRealmApiError) {
    return error.status === 409 && error.code === 'SUPPORT_DISCORD_THREAD_CONFLICT';
  }

  return isRecord(error) &&
    error.statusCode === 409 &&
    error.code === 'SUPPORT_DISCORD_THREAD_CONFLICT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
