import {
  ChannelType,
  type ButtonInteraction,
  type GuildMember,
  type PrivateThreadChannel,
  type TextChannel,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { cardJson, cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { buildTriageCard, type SupportTriageTicketDto } from './triageCards.js';
import { handleSupportThreadAction, isStaffMember } from './threadActions.js';

const STAFF_ROLE_ID = '1111111111111111';
const USER_ROLE_ID = '2222222222222222';
const REPORTER_ID = '3333333333333333';
const THREAD_ID = '4444444444444444';
const TRIAGE_CHANNEL_ID = '5555555555555555';
const ACTOR_ID = '7777777777777777';

const config = {
  supportStaffRoleIds: [STAFF_ROLE_ID],
  emojiMap: {},
};

const ticketContext = {
  ticket: {
    publicId: 'SUP-ABC12345',
    title: 'Forge broke after upgrade',
    reporterDiscordUserId: REPORTER_ID,
    threadId: null,
    triageChannelId: TRIAGE_CHANNEL_ID,
    triageMessageId: '6666666666666666',
  },
};

const triageTicket: SupportTriageTicketDto = {
  publicId: 'SUP-ABC12345',
  status: 'new',
  privacy: 'private',
  category: 'bug',
  area: 'crafting',
  sensitivityFlags: ['security'],
  title: 'Forge broke after upgrade',
  summary: 'Private report body withheld. Review in staff support tools.',
  realmLabel: 'Spring Realm',
  createdAt: '2026-06-04T12:00:00.000Z',
};

describe('isStaffMember', () => {
  it('checks guild member roles against configured staff role ids', () => {
    const member = memberWithRoles([USER_ROLE_ID, STAFF_ROLE_ID]);

    expect(isStaffMember(member, new Set([STAFF_ROLE_ID]))).toBe(true);
  });

  it('checks raw guild member role arrays against configured staff role ids', () => {
    expect(isStaffMember({ roles: [USER_ROLE_ID, STAFF_ROLE_ID] }, new Set([STAFF_ROLE_ID]))).toBe(true);
  });

  it('denies malformed member shapes safely', () => {
    expect(isStaffMember({ roles: { cache: null } }, new Set([STAFF_ROLE_ID]))).toBe(false);
  });
});

describe('handleSupportThreadAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one private follow-up thread for Ask Reporter and records it', async () => {
    const api = createApi(ticketContext);
    const thread = createThread();
    const channel = createTriageChannel(thread);
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel,
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/action-context');
    expect(channel.threads.create).toHaveBeenCalledWith({
      name: 'SUP-ABC12345 follow-up',
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: 'Support follow-up for SUP-ABC12345',
    });
    expect(thread.members.add).toHaveBeenCalledWith(REPORTER_ID);
    expect(thread.members.add).toHaveBeenCalledWith(ACTOR_ID);
    expectMockCard(thread.send, 'SUP-ABC12345');
    expect(JSON.stringify(vi.mocked(thread.send).mock.calls)).not.toContain('Raw private body');
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/thread', {
      threadId: THREAD_ID,
      createdByDiscordUserId: ACTOR_ID,
    });
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expectMockCard(interaction.editReply, THREAD_ID);
  });

  it('records a follow-up thread when adding the reporter fails', async () => {
    const api = createApi(ticketContext);
    const thread = createThread();
    vi.mocked(thread.members.add)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('Missing Access') as never);
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expectMockCard(thread.send, 'SUP-ABC12345');
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/thread', {
      threadId: THREAD_ID,
      createdByDiscordUserId: ACTOR_ID,
    });
    expectMockCard(interaction.editReply, 'could not be added');
  });

  it('registers the follow-up thread with the API before posting the intro message into it', async () => {
    const api = createApi(ticketContext);
    const thread = createThread();
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(thread.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(thread.send).mock.invocationCallOrder[0],
    );
  });

  it('still reports thread creation with a note when the intro message cannot be posted after registration', async () => {
    const api = createApi(ticketContext);
    const thread = createThread();
    vi.mocked(thread.send).mockRejectedValue(new Error('Missing Access') as never);
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/thread', {
      threadId: THREAD_ID,
      createdByDiscordUserId: ACTOR_ID,
    });
    expectMockCard(interaction.editReply, `<#${THREAD_ID}>`, 'introduction message could not be posted');
  });

  it('cleans up a duplicate follow-up thread when recording hits a mapping conflict', async () => {
    const conflict = Object.assign(new Error('Conflict'), { statusCode: 409, code: 'SUPPORT_DISCORD_THREAD_CONFLICT' });
    const api = createApi(ticketContext);
    vi.mocked(api.post).mockRejectedValue(conflict as never);
    const thread = createThread();
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(thread.send).not.toHaveBeenCalled();
    expect(thread.setArchived).toHaveBeenCalledWith(true, 'Duplicate support follow-up for SUP-ABC12345');
    expectMockCard(interaction.editReply, 'already exists');
  });

  it('includes the orphan thread id when duplicate cleanup fails after a mapping conflict', async () => {
    const conflict = Object.assign(new Error('Conflict'), { statusCode: 409, code: 'SUPPORT_DISCORD_THREAD_CONFLICT' });
    const api = createApi(ticketContext);
    vi.mocked(api.post).mockRejectedValue(conflict as never);
    const thread = createThread();
    vi.mocked(thread.setArchived).mockRejectedValue(new Error('Missing Permissions') as never);
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(thread.send).not.toHaveBeenCalled();
    expectMockCard(interaction.editReply, `<#${THREAD_ID}>`, 'could not be removed automatically');
  });

  it('reuses an existing Ask Reporter thread instead of creating another one', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    const thread = createThread();
    const channel = createTriageChannel(thread);
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel,
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(channel.threads.create).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalledWith(
      '/api/v1/discord/support/tickets/SUP-ABC12345/thread',
      expect.anything(),
    );
    expectMockCard(interaction.editReply, THREAD_ID);
  });

  it('archives the Discord thread and marks the mapping archived', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    const thread = createThread();
    const interaction = createButtonInteraction({
      customId: 'support:archive_thread:SUP-ABC12345',
      channel: thread,
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(thread.setArchived).toHaveBeenCalledWith(true, 'Support thread archived for SUP-ABC12345');
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/archive-thread', {
      actorDiscordUserId: ACTOR_ID,
    });
    expectMockCard(interaction.editReply, 'Archived support thread for `SUP-ABC12345`.');
  });

  it('archives the mapped Discord thread from a triage card click before marking the mapping archived', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    const thread = createThread();
    const channel = createTriageChannel(thread);
    const interaction = createButtonInteraction({
      customId: 'support:archive_thread:SUP-ABC12345',
      channel,
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(channel.threads.fetch).toHaveBeenCalledWith(THREAD_ID);
    expect(thread.setArchived).toHaveBeenCalledWith(true, 'Support thread archived for SUP-ABC12345');
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/archive-thread', {
      actorDiscordUserId: ACTOR_ID,
    });
    expect(vi.mocked(thread.setArchived).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.post).mock.invocationCallOrder[0],
    );
    expectMockCard(interaction.editReply, 'Archived support thread for `SUP-ABC12345`.');
  });

  it('reverts the Discord archive and reports partial failure when the archive API call fails', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    vi.mocked(api.post).mockRejectedValue(new Error('API down') as never);
    const thread = createThread();
    const interaction = createButtonInteraction({
      customId: 'support:archive_thread:SUP-ABC12345',
      channel: thread,
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(thread.setArchived).toHaveBeenNthCalledWith(1, true, 'Support thread archived for SUP-ABC12345');
    expect(thread.setArchived).toHaveBeenNthCalledWith(2, false, expect.stringContaining('Reverting archive'));
    expectMockCard(
      interaction.editReply,
      'Could not mark `SUP-ABC12345` archived in PocketRealm. The Discord thread was unarchived; try again.',
    );
  });

  it('points staff at manual repair when the archive API call fails and the revert also fails', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    vi.mocked(api.post).mockRejectedValue(new Error('API down') as never);
    const thread = createThread();
    vi.mocked(thread.setArchived)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('Missing Permissions') as never);
    const interaction = createButtonInteraction({
      customId: 'support:archive_thread:SUP-ABC12345',
      channel: thread,
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(thread.setArchived).toHaveBeenCalledTimes(2);
    expectMockCard(interaction.editReply, 'Repair it with staff tools');
  });

  it('does not call the archive API when no follow-up thread exists', async () => {
    const api = createApi(ticketContext);
    const interaction = createButtonInteraction({
      customId: 'support:archive_thread:SUP-ABC12345',
      channel: createTriageChannel(createThread()),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.post).not.toHaveBeenCalledWith(
      '/api/v1/discord/support/tickets/SUP-ABC12345/archive-thread',
      expect.anything(),
    );
    expectMockCard(interaction.editReply, 'No follow-up thread exists for `SUP-ABC12345`.');
  });

  it('updates canonical ticket status and reflects it in Discord surfaces for status buttons', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    const thread = createThread();
    const message = createTriageMessage();
    const interaction = createButtonInteraction({
      customId: 'support:accepted:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
      message,
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.get).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/action-context');
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/status', {
      status: 'accepted',
      actorDiscordUserId: ACTOR_ID,
    });
    expectMockCard(message.edit, 'Status: `accepted`', '`SUP-ABC12345` marked `accepted` by <@7777777777777777>.');
    expect(cardJson(lastMockPayload(message.edit))).toContain('support:archive_thread:SUP-ABC12345');
    expectMockCard(thread.send, 'Ticket `SUP-ABC12345` marked `accepted` by <@7777777777777777>.');
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expectMockCard(interaction.editReply, 'Updated `SUP-ABC12345` status to `accepted`.');
  });

  it('does not let summary text containing "Last Update:"/"Status:" corrupt the card on status update', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    const thread = createThread();
    const card = buildTriageCard({
      ...triageTicket,
      summary: 'Repro steps attached. Last Update: it still happens. Status: `mine`',
    });
    const message = { components: card.components, edit: vi.fn() };
    const interaction = createButtonInteraction({
      customId: 'support:accepted:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
      message,
    });

    await handleSupportThreadAction(interaction, { api, config });

    const text = cardText(lastMockPayload(message.edit));
    // The real status line is updated and the metadata below the summary survives
    // (a greedy match would have deleted everything after the user's "Last Update:").
    expect(text).toContain('Status: `accepted`');
    expect(text).toContain('Privacy:');
    expect(text).toContain('Category:');
    expect(text).toContain('Created:');
    // The user's own text is left intact, and exactly one staff line is appended.
    expect(text).toContain('Last Update: it still happens.');
    expect(text).toContain('`SUP-ABC12345` marked `accepted` by <@7777777777777777>.');
  });

  it('skips the surface edit for legacy non-V2 triage cards instead of stripping their buttons', async () => {
    const api = createApi({
      ticket: {
        ...ticketContext.ticket,
        threadId: THREAD_ID,
      },
    });
    const thread = createThread();
    const message = createLegacyTriageMessage();
    const interaction = createButtonInteraction({
      customId: 'support:accepted:SUP-ABC12345',
      channel: createTriageChannel(thread),
      member: memberWithRoles([STAFF_ROLE_ID]),
      message,
    });

    await handleSupportThreadAction(interaction, { api, config });

    // Status still propagates canonically and to the thread...
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/status', {
      status: 'accepted',
      actorDiscordUserId: ACTOR_ID,
    });
    expectMockCard(thread.send, 'Ticket `SUP-ABC12345` marked `accepted` by <@7777777777777777>.');
    // ...but the legacy card is left untouched (editing it into a V2 payload would
    // fail and drop its action buttons).
    expect(message.edit).not.toHaveBeenCalled();
  });

  it('answers unsupported support actions after deferring', async () => {
    const api = createApi(ticketContext);
    const interaction = createButtonInteraction({
      customId: 'support:unknown_action:SUP-ABC12345',
      channel: createTriageChannel(createThread()),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expectMockCard(interaction.editReply, 'Unsupported support action for `SUP-ABC12345`.');
  });

  it('returns a clear configuration response when staff roles are empty', async () => {
    const api = createApi(ticketContext);
    const interaction = createButtonInteraction({
      customId: 'support:accepted:SUP-ABC12345',
      channel: createTriageChannel(createThread()),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, {
      api,
      config: { supportStaffRoleIds: [], emojiMap: {} },
    });

    expect(api.post).not.toHaveBeenCalled();
    expectMockCard(
      interaction.reply,
      'Support actions are not configured. Ask an administrator to set support staff roles.',
    );
    expect(lastMockPayload(interaction.reply)).toEqual(expect.objectContaining({ ephemeral: true }));
  });

  it('returns an ephemeral forbidden response for non-staff users', async () => {
    const api = createApi(ticketContext);
    const interaction = createButtonInteraction({
      customId: 'support:ask_reporter:SUP-ABC12345',
      channel: createTriageChannel(createThread()),
      member: memberWithRoles([USER_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.get).not.toHaveBeenCalled();
    expectMockCard(interaction.reply, 'Only support staff can use these ticket actions.');
    expect(lastMockPayload(interaction.reply)).toEqual(expect.objectContaining({ ephemeral: true }));
  });
});

function createApi(response: unknown): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'get'>['get'],
    post: vi.fn(async <T>(): Promise<T> => response as T) as Pick<PocketRealmApiClient, 'post'>['post'],
  };
}

function memberWithRoles(roleIds: string[]): GuildMember {
  return {
    roles: {
      cache: {
        some: (predicate: (role: { id: string }) => boolean) => roleIds.some((id) => predicate({ id })),
      },
    },
  } as unknown as GuildMember;
}

function createThread(): PrivateThreadChannel {
  return {
    id: THREAD_ID,
    members: {
      add: vi.fn(),
    },
    send: vi.fn(),
    setArchived: vi.fn(),
  } as unknown as PrivateThreadChannel;
}

function createTriageChannel(thread: PrivateThreadChannel): TextChannel {
  return {
    id: TRIAGE_CHANNEL_ID,
    threads: {
      create: vi.fn(async () => thread),
      fetch: vi.fn(async () => thread),
    },
  } as unknown as TextChannel;
}

function createTriageMessage() {
  const card = buildTriageCard(triageTicket);

  return {
    components: card.components,
    edit: vi.fn(),
  };
}

function createLegacyTriageMessage() {
  // A triage card posted before Components V2 shipped: rendered as an embed with
  // no V2 container components and without the IsComponentsV2 message flag.
  return {
    components: [],
    flags: { has: () => false },
    edit: vi.fn(),
  };
}

function createButtonInteraction(input: {
  customId: string;
  channel: ButtonInteraction['channel'];
  member: unknown;
  message?: unknown;
}): ButtonInteraction {
  return {
    customId: input.customId,
    channel: input.channel,
    member: input.member,
    message: input.message ?? createTriageMessage(),
    user: { id: ACTOR_ID },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ButtonInteraction;
}

function expectMockCard(fn: unknown, ...expectedText: string[]): void {
  const payload = lastMockPayload(fn);
  expectV2Card(payload);
  const text = cardText(payload);

  for (const expected of expectedText) {
    expect(text).toContain(expected);
  }
}

function lastMockPayload(fn: unknown): unknown {
  const calls = (fn as { mock: { calls: unknown[][] } }).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls.at(-1)?.[0];
}
