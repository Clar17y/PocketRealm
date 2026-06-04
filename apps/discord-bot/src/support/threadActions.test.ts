import {
  ChannelType,
  type ButtonInteraction,
  type GuildMember,
  type PrivateThreadChannel,
  type TextChannel,
} from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleSupportThreadAction, isStaffMember } from './threadActions.js';

const STAFF_ROLE_ID = '1111111111111111';
const USER_ROLE_ID = '2222222222222222';
const REPORTER_ID = '3333333333333333';
const THREAD_ID = '4444444444444444';
const TRIAGE_CHANNEL_ID = '5555555555555555';
const ACTOR_ID = '7777777777777777';

const config = {
  supportStaffRoleIds: [STAFF_ROLE_ID],
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

describe('isStaffMember', () => {
  it('checks guild member roles against configured staff role ids', () => {
    const member = memberWithRoles([USER_ROLE_ID, STAFF_ROLE_ID]);

    expect(isStaffMember(member, new Set([STAFF_ROLE_ID]))).toBe(true);
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
    expect(thread.send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('SUP-ABC12345'),
    }));
    expect(JSON.stringify(vi.mocked(thread.send).mock.calls)).not.toContain('Raw private body');
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/thread', {
      threadId: THREAD_ID,
      createdByDiscordUserId: ACTOR_ID,
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: expect.stringContaining(THREAD_ID),
    });
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
    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: expect.stringContaining(THREAD_ID),
    });
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
    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Archived support thread for `SUP-ABC12345`.',
    });
  });

  it('updates canonical ticket status for status buttons', async () => {
    const api = createApi(ticketContext);
    const interaction = createButtonInteraction({
      customId: 'support:accepted:SUP-ABC12345',
      channel: createTriageChannel(createThread()),
      member: memberWithRoles([STAFF_ROLE_ID]),
    });

    await handleSupportThreadAction(interaction, { api, config });

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/support/tickets/SUP-ABC12345/status', {
      status: 'accepted',
      actorDiscordUserId: ACTOR_ID,
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Updated `SUP-ABC12345` status to `accepted`.',
    });
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
    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Only support staff can use these ticket actions.',
    });
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
    },
  } as unknown as TextChannel;
}

function createButtonInteraction(input: {
  customId: string;
  channel: ButtonInteraction['channel'];
  member: GuildMember;
}): ButtonInteraction {
  return {
    customId: input.customId,
    channel: input.channel,
    member: input.member,
    user: { id: ACTOR_ID },
    reply: vi.fn(),
  } as unknown as ButtonInteraction;
}
