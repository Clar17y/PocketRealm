import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@pocketrealm/database';
import {
  createDiscordSupportTicket,
  createSupportTicket,
  listSupportTicketsForExport,
  supportTicketToAdminRecord,
  supportTicketToJsonl,
  updateSupportTicket,
} from './supportTicketService';

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => '42'),
}));

vi.mock('@pocketrealm/database', () => ({
  Prisma: {},
  prisma: {
    $transaction: vi.fn(),
    supportTicket: {
      findMany: vi.fn(),
    },
    discordAccountLink: {
      findFirst: vi.fn(),
    },
  },
}));

const tx = {
  supportTicket: {
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  supportTicketEvent: {
    create: vi.fn(),
  },
};

describe('supportTicketService', () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
    vi.mocked(prisma.supportTicket.findMany).mockReset();
    vi.mocked(prisma.discordAccountLink.findFirst).mockReset();
    tx.supportTicket.create.mockReset();
    tx.supportTicket.findUniqueOrThrow.mockReset();
    tx.supportTicket.update.mockReset();
    tx.supportTicketEvent.create.mockReset();
  });

  it('creates support tickets with a short public id and audit event', async () => {
    tx.supportTicket.create.mockResolvedValue({
      id: 'internal-id',
      publicId: 'SUP-42',
      title: 'Forge broke',
    });

    const ticket = await createSupportTicket({
      accountId: 'account-1',
      playerId: 'player-1',
      seasonId: 'season-1',
      reporterDisplayName: 'Mira',
      realmLabel: 'Season One',
      input: {
        privacy: 'private',
        category: 'bug',
        area: 'crafting',
        title: 'Forge broke',
        description: 'The forge did not refresh after upgrade.',
        screen: 'forge',
      },
    });

    expect(ticket.publicId).toBe('SUP-42');
    expect(tx.supportTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        publicId: 'SUP-42',
        source: 'in_game',
        status: 'new',
        reporterAccountId: 'account-1',
        reporterPlayerId: 'player-1',
        seasonId: 'season-1',
        title: 'Forge broke',
      }),
    }));
    expect(tx.supportTicketEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticketId: 'internal-id',
        actorAccountId: 'account-1',
        eventType: 'created',
        toStatus: 'new',
      }),
    }));
  });

  it('allows support tickets without an active player id', async () => {
    tx.supportTicket.create.mockResolvedValue({
      id: 'internal-id',
      publicId: 'SUP-42',
    });

    await createSupportTicket({
      accountId: 'account-1',
      playerId: null,
      seasonId: null,
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      input: {
        privacy: 'not_sure',
        category: 'account',
        area: 'auth',
        title: 'Login screen loop',
        description: 'The login screen keeps sending me back to the start.',
      },
    });

    expect(tx.supportTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reporterAccountId: 'account-1',
        reporterPlayerId: null,
      }),
    }));
  });

  it('creates Discord-sourced support tickets for a linked active player', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
      account: {
        id: 'account-1',
        activePlayer: {
          id: 'player-1',
          username: 'Mira',
          seasonId: 'season-1',
          season: { name: 'Spring Realm' },
        },
      },
    } as never);
    tx.supportTicket.create.mockResolvedValue({
      id: 'internal-id',
      publicId: 'SUP-42',
      source: 'discord',
    });

    const ticket = await createDiscordSupportTicket({
      discordGuildId: '2345678901234567',
      discordUserId: '1234567890123456',
      input: {
        privacy: 'private',
        category: 'bug',
        area: 'crafting',
        title: 'Forge broke',
        description: 'The forge did not refresh after upgrade.',
      },
    });

    expect(ticket.publicId).toBe('SUP-42');
    expect(tx.supportTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'discord',
        reporterAccountId: 'account-1',
        reporterPlayerId: 'player-1',
        seasonId: 'season-1',
        reporterDisplayName: 'Mira',
        realmLabel: 'Spring Realm',
        discordReporterGuildId: '2345678901234567',
        discordReporterUserId: '1234567890123456',
      }),
    }));
  });

  it('requires a Discord link before creating a Discord support ticket', async () => {
    vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(null);

    await expect(createDiscordSupportTicket({
      discordGuildId: '2345678901234567',
      discordUserId: '1234567890123456',
      input: {
        privacy: 'private',
        category: 'bug',
        area: 'crafting',
        title: 'Forge broke',
        description: 'The forge did not refresh after upgrade.',
      },
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DISCORD_LINK_REQUIRED',
    });

    expect(tx.supportTicket.create).not.toHaveBeenCalled();
  });

  it('updates status and writes an audit event with the previous status', async () => {
    tx.supportTicket.findUniqueOrThrow.mockResolvedValue({
      id: 'ticket-1',
      publicId: 'SUP-1',
      status: 'new',
    });
    tx.supportTicket.update.mockResolvedValue({
      id: 'ticket-1',
      publicId: 'SUP-1',
      status: 'accepted',
    });

    const result = await updateSupportTicket('SUP-1', 'admin-account', {
      status: 'accepted',
      note: 'Accepted after reproducing.',
    });

    expect(result.status).toBe('accepted');
    expect(tx.supportTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { publicId: 'SUP-1' },
      data: expect.objectContaining({
        status: 'accepted',
        closedAt: null,
      }),
    }));
    expect(tx.supportTicketEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticketId: 'ticket-1',
        actorAccountId: 'admin-account',
        eventType: 'status_changed',
        fromStatus: 'new',
        toStatus: 'accepted',
        note: 'Accepted after reproducing.',
      }),
    }));
  });

  it('serializes tickets as JSONL lines', () => {
    const line = supportTicketToJsonl({
      publicId: 'SUP-1',
      status: 'new',
      privacy: 'private',
      category: 'bug',
      area: 'inventory',
      title: 'Inventory bug',
      description: 'Email player@example.com saw overlap',
      expectedBehavior: null,
      actualBehavior: null,
      reproductionSteps: null,
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      seasonId: null,
      screen: 'inventory',
      appVersion: null,
      apiVersion: null,
      browser: null,
      device: null,
      requestId: null,
      sentryEventId: null,
      duplicateTicketIds: [],
      githubIssueUrl: null,
      sensitivityFlags: ['personal_data'],
      staffNotes: null,
      createdAt: new Date('2026-05-30T12:00:00.000Z'),
      updatedAt: new Date('2026-05-30T12:01:00.000Z'),
    });

    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toMatchObject({ id: 'SUP-1', area: 'inventory' });
    expect(line).not.toContain('player@example.com');
  });

  it('includes staff notes in admin records', () => {
    const record = supportTicketToAdminRecord({
      publicId: 'SUP-1',
      status: 'needs_info',
      privacy: 'private',
      category: 'bug',
      area: 'inventory',
      title: 'Inventory bug',
      description: 'Potions did not stack.',
      expectedBehavior: null,
      actualBehavior: null,
      reproductionSteps: null,
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      seasonId: null,
      screen: 'inventory',
      appVersion: null,
      apiVersion: null,
      browser: null,
      device: null,
      requestId: null,
      sentryEventId: null,
      duplicateTicketIds: [],
      githubIssueUrl: null,
      sensitivityFlags: [],
      staffNotes: 'Ask reporter which potion and acquisition path.',
      createdAt: new Date('2026-05-30T12:00:00.000Z'),
      updatedAt: new Date('2026-05-30T12:01:00.000Z'),
    });

    expect(record).toMatchObject({
      id: 'SUP-1',
      status: 'needs_info',
      staffNotes: 'Ask reporter which potion and acquisition path.',
      reporter: { displayName: 'Mira', realm: 'Preseason', seasonId: null },
    });
  });

  it('lists new and needs_info tickets for export by default', async () => {
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([]);

    await listSupportTicketsForExport({});

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ['new', 'needs_info'] } },
      orderBy: { createdAt: 'asc' },
    }));
  });
});
