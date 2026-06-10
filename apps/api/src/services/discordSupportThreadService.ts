import { prisma, type Prisma } from '@pocketrealm/database';
import { closeTimestampFor, isRestrictedSupportPrivacy } from '@pocketrealm/shared/support/supportTickets';
import { AppError } from '../middleware/errorHandler';
import { PRIVATE_SUPPORT_SUMMARY, redactSupportText } from './supportTicketRedaction';
import type { SupportSensitivityFlag, SupportTicketArea, SupportTicketCategory, SupportTicketPrivacy, SupportTicketStatus } from './supportTicketSchemas';

const DISCORD_SUPPORT_TRIAGE_STATUSES = ['new', 'needs_info'] as const;
const MAX_DISCORD_TITLE_LENGTH = 80;
const MAX_DISCORD_SUMMARY_LENGTH = 240;

export interface MarkSupportTriageMessageInput {
  publicId: string;
  guildId: string;
  triageChannelId: string;
  triageMessageId: string;
}

export interface MarkSupportThreadCreatedInput {
  publicId: string;
  threadId: string;
  createdByDiscordUserId: string;
}

export interface ArchiveSupportThreadInput {
  publicId: string;
  actorDiscordUserId: string;
}

export interface UpdateSupportTicketStatusFromDiscordInput {
  publicId: string;
  status: SupportTicketStatus;
  actorDiscordUserId: string;
}

function boundedLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 50);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function safeText(value: string, maxLength: number): string {
  return truncateText(redactSupportText(value) ?? '', maxLength);
}

function supportTicketSummary(ticket: {
  privacy: SupportTicketPrivacy;
  description: string;
}): string {
  if (isRestrictedSupportPrivacy(ticket.privacy)) {
    return PRIVATE_SUPPORT_SUMMARY;
  }

  return safeText(ticket.description, MAX_DISCORD_SUMMARY_LENGTH);
}

function firstActiveDiscordUserId(ticket: {
  discordReporterUserId?: string | null;
  reporterAccount: {
    discordAccountLinks: Array<{ discordUserId: string }>;
  };
}): string | null {
  if (ticket.discordReporterUserId) {
    return ticket.discordReporterUserId;
  }

  return ticket.reporterAccount.discordAccountLinks[0]?.discordUserId ?? null;
}

async function findTicketId(client: Prisma.TransactionClient, publicId: string): Promise<string> {
  const ticket = await client.supportTicket.findUnique({
    where: { publicId },
    select: { id: true },
  });

  if (!ticket) {
    throw new AppError(404, 'Support ticket not found', 'SUPPORT_TICKET_NOT_FOUND');
  }

  return ticket.id;
}

function throwTriageMessageConflict(): never {
  throw new AppError(
    409,
    'Support ticket already has a different Discord triage message',
    'SUPPORT_TRIAGE_MESSAGE_CONFLICT'
  );
}

function throwDiscordThreadNotFound(): never {
  throw new AppError(404, 'Discord support thread mapping not found', 'SUPPORT_DISCORD_THREAD_NOT_FOUND');
}

function throwDiscordThreadConflict(): never {
  throw new AppError(
    409,
    'Support ticket already has a different Discord support thread',
    'SUPPORT_DISCORD_THREAD_CONFLICT'
  );
}

export async function listUnpostedSupportTicketsForDiscord(limit = 10) {
  const tickets = await prisma.supportTicket.findMany({
    where: {
      discordMessageId: null,
      status: { in: [...DISCORD_SUPPORT_TRIAGE_STATUSES] },
    },
    orderBy: { createdAt: 'asc' },
    take: boundedLimit(limit),
    select: {
      publicId: true,
      status: true,
      privacy: true,
      category: true,
      area: true,
      sensitivityFlags: true,
      title: true,
      description: true,
      realmLabel: true,
      createdAt: true,
    },
  });

  return tickets.map((ticket) => ({
    publicId: ticket.publicId,
    status: ticket.status as SupportTicketStatus,
    privacy: ticket.privacy as SupportTicketPrivacy,
    category: ticket.category as SupportTicketCategory,
    area: ticket.area as SupportTicketArea,
    sensitivityFlags: ticket.sensitivityFlags as SupportSensitivityFlag[],
    title: safeText(ticket.title, MAX_DISCORD_TITLE_LENGTH),
    summary: supportTicketSummary({
      privacy: ticket.privacy as SupportTicketPrivacy,
      description: ticket.description,
    }),
    realmLabel: ticket.realmLabel,
    createdAt: ticket.createdAt,
  }));
}

export async function markSupportTriageMessage(input: MarkSupportTriageMessageInput) {
  const ticket = await prisma.$transaction(async (tx) => {
    const existing = await tx.supportTicket.findUnique({
      where: { publicId: input.publicId },
      select: {
        id: true,
        publicId: true,
        discordMessageId: true,
        discordReporterUserId: true,
        reporterAccount: {
          select: {
            discordAccountLinks: {
              where: { unlinkedAt: null },
              orderBy: { linkedAt: 'desc' },
              take: 1,
              select: { discordUserId: true },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new AppError(404, 'Support ticket not found', 'SUPPORT_TICKET_NOT_FOUND');
    }

    if (existing.discordMessageId && existing.discordMessageId !== input.triageMessageId) {
      throwTriageMessageConflict();
    }

    if (!existing.discordMessageId) {
      const claim = await tx.supportTicket.updateMany({
        where: { id: existing.id, discordMessageId: null },
        data: { discordMessageId: input.triageMessageId },
      });

      if (claim.count === 0) {
        const current = await tx.supportTicket.findUnique({
          where: { id: existing.id },
          select: { discordMessageId: true },
        });

        if (current?.discordMessageId !== input.triageMessageId) {
          throwTriageMessageConflict();
        }
      }
    }

    const mapping = await tx.supportTicketDiscordThread.findUnique({
      where: { ticketId: existing.id },
      select: { triageMessageId: true },
    });

    if (mapping?.triageMessageId && mapping.triageMessageId !== input.triageMessageId) {
      throwTriageMessageConflict();
    }

    const triageMessageData = {
      guildId: input.guildId,
      triageChannelId: input.triageChannelId,
      triageMessageId: input.triageMessageId,
    };

    if (mapping) {
      await tx.supportTicketDiscordThread.update({
        where: { ticketId: existing.id },
        data: triageMessageData,
      });
    } else {
      await tx.supportTicketDiscordThread.upsert({
        where: { ticketId: existing.id },
        create: {
          ticketId: existing.id,
          ...triageMessageData,
          reporterDiscordUserId: firstActiveDiscordUserId(existing),
          status: 'triage_posted',
          archivedAt: null,
        },
        update: triageMessageData,
      });
    }

    return existing;
  });

  return {
    publicId: ticket.publicId,
    discordMessageId: input.triageMessageId,
  };
}

export async function markSupportThreadCreated(input: MarkSupportThreadCreatedInput) {
  return prisma.$transaction(async (tx) => {
    const ticketId = await findTicketId(tx, input.publicId);
    const mapping = await tx.supportTicketDiscordThread.findUnique({
      where: { ticketId },
      select: { threadId: true },
    });

    if (!mapping) {
      throwDiscordThreadNotFound();
    }

    if (mapping.threadId && mapping.threadId !== input.threadId) {
      throwDiscordThreadConflict();
    }

    const updated = await tx.supportTicketDiscordThread.updateMany({
      where: {
        ticketId,
        OR: [{ threadId: null }, { threadId: input.threadId }],
      },
      data: {
        threadId: input.threadId,
        createdByDiscordUserId: input.createdByDiscordUserId,
        status: 'thread_created',
      },
    });

    if (updated.count === 0) {
      const current = await tx.supportTicketDiscordThread.findUnique({
        where: { ticketId },
        select: { threadId: true },
      });

      if (!current) {
        throwDiscordThreadNotFound();
      }

      if (current.threadId !== input.threadId) {
        throwDiscordThreadConflict();
      }
    }

    return {
      publicId: input.publicId,
      threadId: input.threadId,
      status: 'thread_created',
    };
  });
}

export async function getSupportTicketActionContextForDiscord(publicId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { publicId },
    select: {
      publicId: true,
      title: true,
      discordThread: {
        select: {
          reporterDiscordUserId: true,
          threadId: true,
          triageChannelId: true,
          triageMessageId: true,
        },
      },
    },
  });

  if (!ticket) {
    throw new AppError(404, 'Support ticket not found', 'SUPPORT_TICKET_NOT_FOUND');
  }

  if (!ticket.discordThread) {
    throwDiscordThreadNotFound();
  }

  return {
    publicId: ticket.publicId,
    title: safeText(ticket.title, MAX_DISCORD_TITLE_LENGTH),
    reporterDiscordUserId: ticket.discordThread.reporterDiscordUserId,
    threadId: ticket.discordThread.threadId,
    triageChannelId: ticket.discordThread.triageChannelId,
    triageMessageId: ticket.discordThread.triageMessageId,
  };
}

export async function updateSupportTicketStatusFromDiscord(input: UpdateSupportTicketStatusFromDiscordInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.supportTicket.findUnique({
      where: { publicId: input.publicId },
      select: { id: true, publicId: true, status: true, closedAt: true },
    });

    if (!existing) {
      throw new AppError(404, 'Support ticket not found', 'SUPPORT_TICKET_NOT_FOUND');
    }

    if (existing.status === input.status) {
      return {
        publicId: existing.publicId,
        status: existing.status,
      };
    }

    const ticket = await tx.supportTicket.update({
      where: { publicId: input.publicId },
      data: {
        status: input.status,
        closedAt: closeTimestampFor(input.status, existing.closedAt),
      },
      select: {
        publicId: true,
        status: true,
      },
    });

    await tx.supportTicketEvent.create({
      data: {
        ticketId: existing.id,
        eventType: 'status_changed',
        fromStatus: existing.status,
        toStatus: input.status,
        metadata: {
          actorDiscordUserId: input.actorDiscordUserId,
          source: 'discord_support_button',
        },
      },
    });

    return {
      publicId: ticket.publicId,
      status: ticket.status,
    };
  });
}

export async function archiveSupportThread(input: ArchiveSupportThreadInput) {
  return prisma.$transaction(async (tx) => {
    const ticketId = await findTicketId(tx, input.publicId);
    const mapping = await tx.supportTicketDiscordThread.findUnique({
      where: { ticketId },
      select: { archivedAt: true },
    });

    if (!mapping) {
      throwDiscordThreadNotFound();
    }

    if (mapping.archivedAt) {
      return {
        publicId: input.publicId,
        archivedByDiscordUserId: input.actorDiscordUserId,
        status: 'archived',
      };
    }

    const archived = await tx.supportTicketDiscordThread.updateMany({
      where: { ticketId, archivedAt: null },
      data: {
        archivedAt: new Date(),
        status: 'archived',
      },
    });

    if (archived.count === 0) {
      const current = await tx.supportTicketDiscordThread.findUnique({
        where: { ticketId },
        select: { archivedAt: true },
      });

      if (!current) {
        throwDiscordThreadNotFound();
      }
    }

    return {
      publicId: input.publicId,
      archivedByDiscordUserId: input.actorDiscordUserId,
      status: 'archived',
    };
  });
}
