import {
  ChannelType,
  type ButtonInteraction,
  type GuildMember,
  type PrivateThreadChannel,
  type Snowflake,
  type TextChannel,
} from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
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

export function isStaffMember(member: GuildMember, staffRoleIds: Set<string>): boolean {
  return member.roles.cache.some((role) => staffRoleIds.has(role.id));
}

export async function handleSupportThreadAction(
  interaction: ButtonInteraction,
  options: SupportThreadActionOptions,
): Promise<void> {
  const parsed = parseSupportButtonId(interaction.customId);
  if (!parsed) return;

  const staffRoleIds = new Set(options.config.supportStaffRoleIds);
  if (!isStaffMember(interaction.member as GuildMember, staffRoleIds)) {
    await interaction.reply({
      ephemeral: true,
      content: 'Only support staff can use these ticket actions.',
    });
    return;
  }

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
    await interaction.reply({
      ephemeral: true,
      content: `Updated \`${parsed.publicId}\` status to \`${status}\`.`,
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
    await interaction.reply({
      ephemeral: true,
      content: `Follow-up thread already exists: <#${ticket.threadId}>.`,
    });
    return;
  }

  const triageChannel = interaction.channel;
  if (!isThreadCreatableTextChannel(triageChannel)) {
    await interaction.reply({
      ephemeral: true,
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

  if (ticket.reporterDiscordUserId) {
    await thread.members.add(ticket.reporterDiscordUserId);
  }

  await thread.send({
    content: [
      `Support follow-up for \`${ticket.publicId}\`: ${ticket.title}`,
      ticket.reporterDiscordUserId
        ? 'Use this thread for staff questions and reporter follow-up. Keep raw private report details in staff tools.'
        : 'Reporter Discord account is not linked or available. Use this thread for staff coordination only.',
    ].join('\n'),
  });

  await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/thread`, {
    threadId: thread.id,
    createdByDiscordUserId: interaction.user.id,
  });

  await interaction.reply({
    ephemeral: true,
    content: `Created follow-up thread <#${thread.id}>.`,
  });
}

async function handleArchiveThread(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get' | 'post'>,
  publicId: string,
): Promise<void> {
  const { ticket } = await fetchActionContext(api, publicId);

  try {
    const thread = await resolveArchiveTargetThread(interaction.channel, ticket.threadId);
    if (thread) {
      await thread.setArchived(true, `Support thread archived for ${ticket.publicId}`);
    }
  } catch {
    await interaction.reply({
      ephemeral: true,
      content: `Could not archive the Discord thread for \`${ticket.publicId}\`. Try again or archive it manually.`,
    });
    return;
  }

  await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/archive-thread`, {
    actorDiscordUserId: interaction.user.id,
  });
  await interaction.reply({
    ephemeral: true,
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
