import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@pocketrealm/database';

const mocks = vi.hoisted(() => ({
  prisma: {
    supportTicket: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    supportTicketDiscordThread: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@pocketrealm/database', () => ({
  prisma: mocks.prisma,
}));

import {
  archiveSupportThread,
  listUnpostedSupportTicketsForDiscord,
  markSupportThreadCreated,
  markSupportTriageMessage,
} from './discordSupportThreadService';

const CREATED_AT = new Date('2026-06-04T12:00:00.000Z');

function ticket(overrides: object = {}) {
  return {
    id: 'ticket-1',
    publicId: 'SUP-ABC12345',
    status: 'new',
    privacy: 'private',
    category: 'bug',
    area: 'crafting',
    title: 'Forge broke',
    description: 'The forge did not refresh after upgrade.',
    reporterDisplayName: 'Mira',
    realmLabel: 'Spring Realm',
    discordMessageId: null,
    createdAt: CREATED_AT,
    reporterAccount: {
      discordAccountLinks: [{ discordUserId: '1234567890123456' }],
    },
    ...overrides,
  };
}

describe('discordSupportThreadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma));
  });

  it('lists bounded unposted support tickets with redacted private DTOs', async () => {
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([ticket({
      title: 'Forge broke after player@example.com sent auth token',
      description: 'Raw private body with password=hunter2 and Bearer super.secret.token.',
      sensitivityFlags: ['personal_data', 'security'],
    })] as never);

    const result = await listUnpostedSupportTicketsForDiscord(25);

    expect(result).toEqual([{
      publicId: 'SUP-ABC12345',
      status: 'new',
      privacy: 'private',
      category: 'bug',
      area: 'crafting',
      sensitivityFlags: ['personal_data', 'security'],
      title: 'Forge broke after [redacted-email] sent auth token',
      summary: 'Private report body withheld. Review in staff support tools.',
      realmLabel: 'Spring Realm',
      createdAt: CREATED_AT,
    }]);
    expect(JSON.stringify(result)).not.toContain('ticket-1');
    expect(JSON.stringify(result)).not.toContain('Raw private body');
    expect(JSON.stringify(result)).not.toContain('hunter2');
    expect(JSON.stringify(result)).not.toContain('super.secret.token');
    expect(JSON.stringify(result)).not.toContain('Mira');
    expect(JSON.stringify(result)).not.toContain('1234567890123456');
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { discordMessageId: null, status: { in: ['new', 'needs_info'] } },
      take: 25,
    }));
  });

  it('summarizes public candidate tickets without exposing raw sensitive text', async () => {
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([ticket({
      privacy: 'public_candidate',
      title: 'Payment issue for player@example.com',
      description: 'Checkout failed with sessionId=abc123 and request id 11111111-1111-4111-8111-111111111111.',
      sensitivityFlags: ['payment'],
    })] as never);

    const result = await listUnpostedSupportTicketsForDiscord(5);

    expect(result[0]).toEqual(expect.objectContaining({
      title: 'Payment issue for [redacted-email]',
      summary: 'Checkout failed with sessionId=[redacted] and request id [redacted-id].',
      sensitivityFlags: ['payment'],
    }));
    expect(JSON.stringify(result)).not.toContain('player@example.com');
    expect(JSON.stringify(result)).not.toContain('abc123');
    expect(JSON.stringify(result)).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('marks a triage Discord message transactionally and persists the reporter Discord user id', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue(ticket() as never);
    vi.mocked(prisma.supportTicket.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.supportTicketDiscordThread.create).mockResolvedValue({} as never);

    await markSupportTriageMessage({
      publicId: 'SUP-ABC12345',
      guildId: '1234567890123456',
      triageChannelId: '2345678901234567',
      triageMessageId: '3456789012345678',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 'ticket-1', discordMessageId: null },
      data: { discordMessageId: '3456789012345678' },
    });
    expect(prisma.supportTicketDiscordThread.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-1',
        guildId: '1234567890123456',
        triageChannelId: '2345678901234567',
        triageMessageId: '3456789012345678',
        reporterDiscordUserId: '1234567890123456',
        status: 'triage_posted',
      }),
    });
  });

  it('allows retrying triage marking with the same Discord message id', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue(ticket({ discordMessageId: '3456789012345678' }) as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue({
      ticketId: 'ticket-1',
      triageMessageId: '3456789012345678',
    } as never);
    vi.mocked(prisma.supportTicketDiscordThread.update).mockResolvedValue({} as never);

    const result = await markSupportTriageMessage({
      publicId: 'SUP-ABC12345',
      guildId: '1234567890123456',
      triageChannelId: '2345678901234567',
      triageMessageId: '3456789012345678',
    });

    expect(result).toEqual({ publicId: 'SUP-ABC12345', discordMessageId: '3456789012345678' });
    expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled();
    expect(prisma.supportTicketDiscordThread.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: 'ticket-1' },
    }));
  });

  it('returns a conflict when a different triage message is already recorded', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue(ticket({ discordMessageId: '9999999999999999' }) as never);

    await expect(markSupportTriageMessage({
      publicId: 'SUP-ABC12345',
      guildId: '1234567890123456',
      triageChannelId: '2345678901234567',
      triageMessageId: '3456789012345678',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SUPPORT_TRIAGE_MESSAGE_CONFLICT',
    });

    expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled();
    expect(prisma.supportTicketDiscordThread.create).not.toHaveBeenCalled();
  });

  it('marks a Discord support thread as created', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue({ threadId: null } as never);
    vi.mocked(prisma.supportTicketDiscordThread.update).mockResolvedValue({} as never);

    await markSupportThreadCreated({
      publicId: 'SUP-ABC12345',
      threadId: '4567890123456789',
      createdByDiscordUserId: '5678901234567890',
    });

    expect(prisma.supportTicketDiscordThread.update).toHaveBeenCalledWith({
      where: { ticketId: 'ticket-1' },
      data: {
        threadId: '4567890123456789',
        createdByDiscordUserId: '5678901234567890',
        status: 'thread_created',
      },
    });
  });

  it('returns not found when creating a thread without a triage mapping', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue(null as never);

    await expect(markSupportThreadCreated({
      publicId: 'SUP-ABC12345',
      threadId: '4567890123456789',
      createdByDiscordUserId: '5678901234567890',
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'SUPPORT_DISCORD_THREAD_NOT_FOUND',
    });
  });

  it('returns a conflict when a different Discord support thread is already recorded', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue({ threadId: '9999999999999999' } as never);

    await expect(markSupportThreadCreated({
      publicId: 'SUP-ABC12345',
      threadId: '4567890123456789',
      createdByDiscordUserId: '5678901234567890',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SUPPORT_DISCORD_THREAD_CONFLICT',
    });

    expect(prisma.supportTicketDiscordThread.update).not.toHaveBeenCalled();
  });

  it('archives a Discord support thread', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(CREATED_AT);
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue({ archivedAt: null } as never);
    vi.mocked(prisma.supportTicketDiscordThread.update).mockResolvedValue({} as never);

    await archiveSupportThread({
      publicId: 'SUP-ABC12345',
      actorDiscordUserId: '5678901234567890',
    });

    expect(prisma.supportTicketDiscordThread.update).toHaveBeenCalledWith({
      where: { ticketId: 'ticket-1' },
      data: {
        archivedAt: CREATED_AT,
        status: 'archived',
      },
    });

    vi.useRealTimers();
  });

  it('returns not found when archiving without a triage mapping', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue(null as never);

    await expect(archiveSupportThread({
      publicId: 'SUP-ABC12345',
      actorDiscordUserId: '5678901234567890',
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'SUPPORT_DISCORD_THREAD_NOT_FOUND',
    });
  });

  it('treats repeated archive calls as idempotent', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
    vi.mocked(prisma.supportTicketDiscordThread.findUnique).mockResolvedValue({ archivedAt: CREATED_AT } as never);

    const result = await archiveSupportThread({
      publicId: 'SUP-ABC12345',
      actorDiscordUserId: '5678901234567890',
    });

    expect(result).toEqual({
      publicId: 'SUP-ABC12345',
      archivedByDiscordUserId: '5678901234567890',
      status: 'archived',
    });
    expect(prisma.supportTicketDiscordThread.update).not.toHaveBeenCalled();
  });
});
