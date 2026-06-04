import { prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';

const DISCORD_SUPPORT_TRIAGE_STATUSES = ['new', 'needs_info'] as const;

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

function boundedLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 50);
}

function firstActiveDiscordUserId(ticket: {
  reporterAccount: {
    discordAccountLinks: Array<{ discordUserId: string }>;
  };
}): string | null {
  return ticket.reporterAccount.discordAccountLinks[0]?.discordUserId ?? null;
}

async function findTicketId(publicId: string): Promise<string> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { publicId },
    select: { id: true },
  });

  if (!ticket) {
    throw new AppError(404, 'Support ticket not found', 'SUPPORT_TICKET_NOT_FOUND');
  }

  return ticket.id;
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
      title: true,
      description: true,
      reporterDisplayName: true,
      realmLabel: true,
      createdAt: true,
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

  return tickets.map((ticket) => ({
    publicId: ticket.publicId,
    status: ticket.status,
    privacy: ticket.privacy,
    category: ticket.category,
    area: ticket.area,
    title: ticket.title,
    description: ticket.description,
    reporterDisplayName: ticket.reporterDisplayName,
    reporterDiscordUserId: firstActiveDiscordUserId(ticket),
    realmLabel: ticket.realmLabel,
    createdAt: ticket.createdAt,
  }));
}

export async function markSupportTriageMessage(input: MarkSupportTriageMessageInput) {
  const ticket = await prisma.supportTicket.update({
    where: { publicId: input.publicId },
    data: { discordMessageId: input.triageMessageId },
    select: { id: true, publicId: true, discordMessageId: true },
  });

  await prisma.supportTicketDiscordThread.upsert({
    where: { ticketId: ticket.id },
    create: {
      ticketId: ticket.id,
      guildId: input.guildId,
      triageChannelId: input.triageChannelId,
      triageMessageId: input.triageMessageId,
      status: 'triage_posted',
    },
    update: {
      guildId: input.guildId,
      triageChannelId: input.triageChannelId,
      triageMessageId: input.triageMessageId,
      status: 'triage_posted',
      archivedAt: null,
    },
  });

  return {
    publicId: ticket.publicId,
    discordMessageId: ticket.discordMessageId,
  };
}

export async function markSupportThreadCreated(input: MarkSupportThreadCreatedInput) {
  const ticketId = await findTicketId(input.publicId);
  await prisma.supportTicketDiscordThread.update({
    where: { ticketId },
    data: {
      threadId: input.threadId,
      createdByDiscordUserId: input.createdByDiscordUserId,
      status: 'thread_created',
    },
  });

  return {
    publicId: input.publicId,
    threadId: input.threadId,
    status: 'thread_created',
  };
}

export async function archiveSupportThread(input: ArchiveSupportThreadInput) {
  const ticketId = await findTicketId(input.publicId);
  await prisma.supportTicketDiscordThread.update({
    where: { ticketId },
    data: {
      archivedAt: new Date(),
      status: 'archived',
    },
  });

  return {
    publicId: input.publicId,
    archivedByDiscordUserId: input.actorDiscordUserId,
    status: 'archived',
  };
}
