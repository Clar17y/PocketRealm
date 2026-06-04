import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@pocketrealm/database';

const mocks = vi.hoisted(() => ({
  prisma: {
    supportTicket: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    supportTicketDiscordThread: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
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
  });

  it('lists bounded unposted support tickets with sanitized DTOs', async () => {
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([ticket()] as never);

    const result = await listUnpostedSupportTicketsForDiscord(25);

    expect(result).toEqual([{
      publicId: 'SUP-ABC12345',
      status: 'new',
      privacy: 'private',
      category: 'bug',
      area: 'crafting',
      title: 'Forge broke',
      description: 'The forge did not refresh after upgrade.',
      reporterDisplayName: 'Mira',
      reporterDiscordUserId: '1234567890123456',
      realmLabel: 'Spring Realm',
      createdAt: CREATED_AT,
    }]);
    expect(JSON.stringify(result)).not.toContain('ticket-1');
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { discordMessageId: null, status: { in: ['new', 'needs_info'] } },
      take: 25,
    }));
  });

  it('marks a triage Discord message and upserts the mapping', async () => {
    vi.mocked(prisma.supportTicket.update).mockResolvedValue(ticket({ discordMessageId: '3456789012345678' }) as never);
    vi.mocked(prisma.supportTicketDiscordThread.upsert).mockResolvedValue({} as never);

    await markSupportTriageMessage({
      publicId: 'SUP-ABC12345',
      guildId: '1234567890123456',
      triageChannelId: '2345678901234567',
      triageMessageId: '3456789012345678',
    });

    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { publicId: 'SUP-ABC12345' },
      data: { discordMessageId: '3456789012345678' },
      select: { id: true, publicId: true, discordMessageId: true },
    });
    expect(prisma.supportTicketDiscordThread.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: 'ticket-1' },
      create: expect.objectContaining({
        ticketId: 'ticket-1',
        guildId: '1234567890123456',
        triageChannelId: '2345678901234567',
        triageMessageId: '3456789012345678',
        status: 'triage_posted',
      }),
    }));
  });

  it('marks a Discord support thread as created', async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
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

  it('archives a Discord support thread', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(CREATED_AT);
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({ id: 'ticket-1' } as never);
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
});
