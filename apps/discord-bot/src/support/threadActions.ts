import {
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  type ButtonInteraction,
  type PrivateThreadChannel,
  type Snowflake,
  type TextChannel,
} from 'discord.js';

import { DISCORD_SUPPORT_BUTTON_STATUSES } from '@pocketrealm/shared/support/supportTickets';

import { PocketRealmApiError, type PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { parseSupportButtonId } from '../discord/components.js';
import { statusCard, textCard, type V2CardPayload } from '../discord/v2Card.js';
import { isRecord } from '../utils.js';

const STATUS_ACTIONS = new Set<string>(DISCORD_SUPPORT_BUTTON_STATUSES);

interface SupportThreadActionOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  config: Pick<BotConfig, 'supportStaffRoleIds' | 'emojiMap'>;
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
  components?: unknown[] | null;
  edit(payload: V2CardPayload): Promise<unknown>;
}

export function isStaffMember(member: unknown, staffRoleIds: Set<string>): boolean {
  if (!isRecord(member)) {
    return false;
  }

  if (Array.isArray(member.roles)) {
    return member.roles.some((roleId) => typeof roleId === 'string' && staffRoleIds.has(roleId));
  }

  if (!isRecord(member.roles)) {
    return false;
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
      ...supportActionCard(
        'warning',
        'Support actions unavailable',
        'Support actions are not configured. Ask an administrator to set support staff roles.',
        options,
        { ephemeral: true },
      ),
    });
    return;
  }

  if (!isStaffMember(interaction.member, staffRoleIds)) {
    await interaction.reply({
      ...supportActionCard(
        'warning',
        'Staff only',
        'Only support staff can use these ticket actions.',
        options,
        { ephemeral: true },
      ),
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (parsed.action === 'ask_reporter') {
      await handleAskReporter(interaction, options, parsed.publicId);
      return;
    }

    if (parsed.action === 'archive_thread') {
      await handleArchiveThread(interaction, options, parsed.publicId);
      return;
    }

    if (STATUS_ACTIONS.has(parsed.action)) {
      await handleStatusUpdate(interaction, options, parsed.publicId, parsed.action);
      return;
    }

    await interaction.editReply({
      ...supportActionCard(
        'warning',
        'Unsupported action',
        `Unsupported support action for \`${parsed.publicId}\`.`,
        options,
      ),
    });
  } catch {
    await interaction.editReply({
      ...supportActionCard(
        'error',
        'Action failed',
        `Could not complete the support action for \`${parsed.publicId}\`. Try again or use staff tools.`,
        options,
      ),
    });
  }
}

async function handleAskReporter(
  interaction: ButtonInteraction,
  options: SupportThreadActionOptions,
  publicId: string,
): Promise<void> {
  const { ticket } = await fetchActionContext(options.api, publicId);

  if (ticket.threadId) {
    await interaction.editReply({
      ...supportActionCard(
        'info',
        'Thread exists',
        `Follow-up thread already exists: <#${ticket.threadId}>.`,
        options,
      ),
    });
    return;
  }

  const triageChannel = interaction.channel;
  if (!isThreadCreatableTextChannel(triageChannel)) {
    await interaction.editReply({
      ...statusCard(
        'error',
        'Thread unavailable',
        `Cannot create a follow-up thread for \`${ticket.publicId}\` from this channel.`,
        options.config.emojiMap,
      ),
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

  // Register the thread before posting into it so a registration conflict only
  // ever has to clean up an empty thread.
  try {
    await options.api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/thread`, {
      threadId: thread.id,
      createdByDiscordUserId: interaction.user.id,
    });
  } catch (error) {
    if (isDiscordThreadConflict(error)) {
      const duplicateCleanedUp = await cleanupDuplicateThread(thread, ticket.publicId);
      const existingThreadId = await refetchThreadId(options.api, ticket.publicId);
      const cleanupMessage = duplicateCleanedUp
        ? 'Removed the duplicate thread.'
        : `A duplicate thread (<#${thread.id}>) was created but could not be removed automatically. Remove it manually.`;
      await interaction.editReply({
        ...statusCard(
          'warning',
          'Thread exists',
          existingThreadId
          ? `Follow-up thread already exists: <#${existingThreadId}>. ${cleanupMessage}`
          : `Follow-up thread already exists for \`${ticket.publicId}\`. ${cleanupMessage}`,
          options.config.emojiMap,
        ),
      });
      return;
    }

    throw error;
  }

  const introSendFailed = await sendFollowUpIntro(thread, ticket, options.config.emojiMap);

  await interaction.editReply({
    ...statusCard(
      'success',
      'Follow-up thread',
      askReporterSuccessCopy(thread.id, actorAddFailed, reporterAddFailed, introSendFailed),
      options.config.emojiMap,
    ),
  });
}

async function sendFollowUpIntro(
  thread: { send(payload: V2CardPayload): Promise<unknown> },
  ticket: SupportActionContextResponse['ticket'],
  emojiMap: BotConfig['emojiMap'],
): Promise<boolean> {
  try {
    await thread.send(textCard({
      emojiKey: 'support',
      title: `Support follow-up for ${ticket.publicId}`,
      lines: [
        ticket.title,
        ticket.reporterDiscordUserId
          ? 'Use this thread for staff questions and reporter follow-up. Keep raw private report details in staff tools.'
          : 'Reporter Discord account is not linked or available. Use this thread for staff coordination only.',
      ],
      emojiMap,
    }));
    return false;
  } catch {
    // The thread is registered canonically; the intro message is repairable by hand.
    return true;
  }
}

function askReporterSuccessCopy(
  threadId: string,
  actorAddFailed: boolean,
  reporterAddFailed: boolean,
  introSendFailed: boolean,
): string {
  const caveats: string[] = [];
  if (actorAddFailed || reporterAddFailed) {
    caveats.push(`${threadAddFailureLabel(actorAddFailed, reporterAddFailed)} could not be added`);
  }
  if (introSendFailed) {
    caveats.push('the introduction message could not be posted; post follow-up questions in the thread manually');
  }

  if (caveats.length === 0) {
    return `Created follow-up thread <#${threadId}>.`;
  }

  return `Created follow-up thread <#${threadId}>, but ${caveats.join(' and ')}.`;
}

async function handleStatusUpdate(
  interaction: ButtonInteraction,
  options: SupportThreadActionOptions,
  publicId: string,
  status: string,
): Promise<void> {
  await options.api.post(`/api/v1/discord/support/tickets/${publicId}/status`, {
    status,
    actorDiscordUserId: interaction.user.id,
  });

  let context: SupportActionContextResponse | null = null;
  try {
    context = await fetchActionContext(options.api, publicId);
  } catch {
    // Status already changed canonically; Discord surface updates are best effort.
  }

  await Promise.all([
    updateTriageMessageStatus(interaction, publicId, status, options.config.emojiMap),
    context?.ticket.threadId
      ? postStatusUpdateToThread(interaction, context.ticket.threadId, publicId, status, options.config.emojiMap)
      : Promise.resolve(),
  ]);

  await interaction.editReply({
    ...statusCard(
      'success',
      'Status updated',
      `Updated \`${publicId}\` status to \`${status}\`.`,
      options.config.emojiMap,
    ),
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
  options: SupportThreadActionOptions,
  publicId: string,
): Promise<void> {
  const { ticket } = await fetchActionContext(options.api, publicId);

  if (!ticket.threadId) {
    await interaction.editReply({
      ...statusCard(
        'warning',
        'No thread',
        `No follow-up thread exists for \`${ticket.publicId}\`.`,
        options.config.emojiMap,
      ),
    });
    return;
  }

  let thread: PrivateThreadChannel;
  try {
    const resolvedThread = await resolveArchiveTargetThread(interaction.channel, ticket.threadId);
    if (!resolvedThread) {
      throw new Error('Mapped support thread could not be resolved.');
    }

    thread = resolvedThread;
    await thread.setArchived(true, `Support thread archived for ${ticket.publicId}`);
  } catch {
    await interaction.editReply({
      ...statusCard(
        'error',
        'Archive failed',
        `Could not archive the Discord thread for \`${ticket.publicId}\`. Try again or archive it manually.`,
        options.config.emojiMap,
      ),
    });
    return;
  }

  try {
    await options.api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/archive-thread`, {
      actorDiscordUserId: interaction.user.id,
    });
  } catch {
    const reverted = await revertThreadArchive(thread, ticket.publicId);
    await interaction.editReply({
      ...statusCard(
        'error',
        'Archive sync failed',
        reverted
        ? `Could not mark \`${ticket.publicId}\` archived in PocketRealm. The Discord thread was unarchived; try again.`
        : `Archived the Discord thread for \`${ticket.publicId}\`, but PocketRealm still shows it open and the thread could not be unarchived. Repair it with staff tools.`,
        options.config.emojiMap,
      ),
    });
    return;
  }

  await interaction.editReply({
    ...statusCard(
      'success',
      'Thread archived',
      `Archived support thread for \`${ticket.publicId}\`.`,
      options.config.emojiMap,
    ),
  });
}

async function revertThreadArchive(thread: PrivateThreadChannel, publicId: string): Promise<boolean> {
  try {
    await thread.setArchived(false, `Reverting archive for ${publicId} after the PocketRealm update failed`);
    return true;
  } catch {
    return false;
  }
}

async function updateTriageMessageStatus(
  interaction: ButtonInteraction,
  publicId: string,
  status: string,
  emojiMap: BotConfig['emojiMap'],
): Promise<void> {
  const message = editableTriageMessage(interaction.message);
  if (!message) return;

  const updatedComponents = updateTriageStatusComponents(message.components, publicId, status, interaction.user.id);

  // A triage card created before Components V2 shipped cannot be edited into a
  // V2 payload (the flag is fixed at creation), and the statusCard fallback
  // carries no action buttons — editing one in would both fail and strip the
  // staff buttons. When we have no V2 components to patch and the existing
  // message is not itself V2, skip the surface edit. The status is canonical in
  // the API and is also echoed into the thread, so nothing is lost.
  if (!updatedComponents && !interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    return;
  }

  try {
    await message.edit(updatedComponents
      ? {
        flags: MessageFlags.IsComponentsV2,
        components: updatedComponents,
        allowedMentions: { parse: [] },
      }
      : statusCard(
        'support',
        `${publicId} status`,
        `Status: \`${status}\`\nLast Update: \`${publicId}\` marked \`${status}\` by <@${interaction.user.id}>.`,
        emojiMap,
      ));
  } catch {
    // Status is canonical in the API; Discord surface edits are best effort.
  }
}

async function postStatusUpdateToThread(
  interaction: ButtonInteraction,
  threadId: Snowflake,
  publicId: string,
  status: string,
  emojiMap: BotConfig['emojiMap'],
): Promise<void> {
  try {
    const thread = await resolveArchiveTargetThread(interaction.channel, threadId);
    if (!thread) return;

    await thread.send(textCard({
      emojiKey: 'support',
      title: 'Ticket status update',
      lines: [`Ticket \`${publicId}\` marked \`${status}\` by <@${interaction.user.id}>.`],
      emojiMap,
      allowedMentions: { users: [interaction.user.id], parse: [] },
    }));
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
  if (!isRecord(message) || typeof message.edit !== 'function') {
    return null;
  }

  return message as unknown as EditableTriageMessage;
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

function supportActionCard(
  emojiKey: 'warning' | 'error' | 'info' | 'success',
  title: string,
  detail: string,
  options: Pick<SupportThreadActionOptions, 'config'>,
  cardOptions: { ephemeral?: boolean } = {},
): V2CardPayload {
  return statusCard(emojiKey, title, detail, options.config.emojiMap, cardOptions);
}

function updateTriageStatusComponents(
  components: unknown[] | null | undefined,
  publicId: string,
  status: string,
  actorDiscordUserId: string,
): ContainerBuilder[] | null {
  if (!components) return null;

  const updated: ContainerBuilder[] = [];
  let didUpdate = false;

  for (const component of components) {
    const json = cloneComponentJson(component);
    if (!isRecord(json) || json.type !== 17) {
      continue;
    }

    if (updateStatusText(json, publicId, status, actorDiscordUserId)) {
      didUpdate = true;
    }

    updated.push(new ContainerBuilder(json as ConstructorParameters<typeof ContainerBuilder>[0]));
  }

  return didUpdate ? updated : null;
}

function updateStatusText(
  component: Record<string, unknown>,
  publicId: string,
  status: string,
  actorDiscordUserId: string,
): boolean {
  if (component.type === 10 && typeof component.content === 'string') {
    const replaced = component.content.replace(/Status: `[^`]*`/, `Status: \`${status}\``);
    if (replaced === component.content) {
      return false;
    }

    const updateLine = `Last Update: \`${publicId}\` marked \`${status}\` by <@${actorDiscordUserId}>.`;
    component.content = replaced.includes('Last Update:')
      ? replaced.replace(/Last Update: .*/s, updateLine)
      : `${replaced}\n${updateLine}`;
    return true;
  }

  const children = component.components;
  if (!Array.isArray(children)) {
    return false;
  }

  let didUpdate = false;
  for (const child of children) {
    if (isRecord(child) && updateStatusText(child, publicId, status, actorDiscordUserId)) {
      didUpdate = true;
    }
  }

  return didUpdate;
}

function cloneComponentJson(component: unknown): unknown {
  const json = isRecord(component) && typeof component.toJSON === 'function'
    ? component.toJSON()
    : component;

  return JSON.parse(JSON.stringify(json)) as unknown;
}
