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

interface ThreadMemberAddable {
  members: {
    add(discordUserId: string): Promise<unknown>;
  };
}

interface EditableTriageMessage {
  embeds: unknown[];
  edit(payload: { embeds: unknown[] }): Promise<unknown>;
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
      await handleStatusUpdate(interaction, options.api, parsed.publicId, status);
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

  const actorAddFailed = await addThreadMember(thread, interaction.user.id);
  let reporterAddFailed = false;
  if (ticket.reporterDiscordUserId && ticket.reporterDiscordUserId !== interaction.user.id) {
    reporterAddFailed = await addThreadMember(thread, ticket.reporterDiscordUserId);
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
    content: actorAddFailed || reporterAddFailed
      ? `Created follow-up thread <#${thread.id}>, but ${threadAddFailureLabel(actorAddFailed, reporterAddFailed)} could not be added.`
      : `Created follow-up thread <#${thread.id}>.`,
  });
}

async function handleStatusUpdate(
  interaction: ButtonInteraction,
  api: Pick<PocketRealmApiClient, 'get' | 'post'>,
  publicId: string,
  status: string,
): Promise<void> {
  await api.post(`/api/v1/discord/support/tickets/${publicId}/status`, {
    status,
    actorDiscordUserId: interaction.user.id,
  });

  let context: SupportActionContextResponse | null = null;
  try {
    context = await fetchActionContext(api, publicId);
  } catch {
    // Status already changed canonically; Discord surface updates are best effort.
  }

  await Promise.all([
    updateTriageMessageStatus(interaction, publicId, status),
    context?.ticket.threadId
      ? postStatusUpdateToThread(interaction, context.ticket.threadId, publicId, status)
      : Promise.resolve(),
  ]);

  await interaction.editReply({
    content: `Updated \`${publicId}\` status to \`${status}\`.`,
  });
}

async function addThreadMember(thread: ThreadMemberAddable, discordUserId: string): Promise<boolean> {
  try {
    await thread.members.add(discordUserId);
    return false;
  } catch {
    return true;
  }
}

function threadAddFailureLabel(actorAddFailed: boolean, reporterAddFailed: boolean): string {
  if (actorAddFailed && reporterAddFailed) return 'the staff member and reporter';
  if (actorAddFailed) return 'the staff member';
  return 'the reporter';
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

async function updateTriageMessageStatus(
  interaction: ButtonInteraction,
  publicId: string,
  status: string,
): Promise<void> {
  const message = editableTriageMessage(interaction.message);
  if (!message || message.embeds.length === 0) return;

  try {
    await message.edit({
      embeds: message.embeds.map((embed, index) => (
        index === 0 ? updateStatusEmbed(embed, publicId, status, interaction.user.id) : embed
      )),
    });
  } catch {
    // Status is canonical in the API; Discord embed edits are best effort.
  }
}

async function postStatusUpdateToThread(
  interaction: ButtonInteraction,
  threadId: Snowflake,
  publicId: string,
  status: string,
): Promise<void> {
  try {
    const thread = await resolveArchiveTargetThread(interaction.channel, threadId);
    if (!thread) return;

    await thread.send({
      content: `Ticket \`${publicId}\` marked \`${status}\` by <@${interaction.user.id}>.`,
    });
  } catch {
    // Staff can still see the canonical status on the triage card/API.
  }
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

function editableTriageMessage(message: unknown): EditableTriageMessage | null {
  if (!isRecord(message) || !Array.isArray(message.embeds) || typeof message.edit !== 'function') {
    return null;
  }

  return message as unknown as EditableTriageMessage;
}

function updateStatusEmbed(embed: unknown, publicId: string, status: string, actorDiscordUserId: string): unknown {
  const data = embedData(embed);
  const fields = embedFields(data.fields);
  const statusIndex = fields.findIndex((field) => field.name.toLowerCase() === 'status');

  if (statusIndex >= 0) {
    fields[statusIndex] = { ...fields[statusIndex], value: status };
  } else {
    fields.unshift({ name: 'Status', value: status, inline: true });
  }

  const updateField = {
    name: 'Last Update',
    value: `\`${publicId}\` marked \`${status}\` by <@${actorDiscordUserId}>.`,
    inline: false,
  };
  const updateIndex = fields.findIndex((field) => field.name.toLowerCase() === 'last update');
  if (updateIndex >= 0) {
    fields[updateIndex] = updateField;
  } else {
    fields.push(updateField);
  }

  return {
    ...data,
    fields,
  };
}

function embedData(embed: unknown): Record<string, unknown> {
  if (isRecord(embed) && typeof embed.toJSON === 'function') {
    return asRecord(embed.toJSON());
  }

  if (isRecord(embed) && isRecord(embed.data)) {
    return embed.data;
  }

  return asRecord(embed);
}

function embedFields(value: unknown): Array<{ name: string; value: string; inline?: boolean }> {
  if (!Array.isArray(value)) return [];

  return value
    .filter((field): field is { name: string; value: string; inline?: boolean } => (
      isRecord(field) && typeof field.name === 'string' && typeof field.value === 'string'
    ))
    .map((field) => ({
      name: field.name,
      value: field.value,
      ...(typeof field.inline === 'boolean' && { inline: field.inline }),
    }));
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

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
