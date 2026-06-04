import { randomUUID } from 'crypto';
import { prisma, type Prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';
import type {
  CreateSupportTicketInput,
  SupportSensitivityFlag,
  SupportTicketArea,
  SupportTicketCategory,
  SupportTicketPrivacy,
  SupportTicketStatus,
  UpdateSupportTicketInput,
} from './supportTicketSchemas';
import {
  toSupportTicketAdminRecord,
  toSupportTicketJsonlRecord,
  type SupportTicketExportSource,
} from './supportTicketRedaction';

interface CreateSupportTicketParams {
  accountId: string;
  playerId: string | null;
  seasonId: string | null;
  reporterDisplayName: string;
  realmLabel: string;
  input: CreateSupportTicketInput;
  source?: 'in_game' | 'discord';
  discordReporterGuildId?: string;
  discordReporterUserId?: string;
}

interface ExportOptions {
  statuses?: SupportTicketStatus[];
  limit?: number;
  createdAfter?: Date;
}

interface SupportTicketUpdateSeed {
  id: string;
  status: string;
}

interface PrismaKnownError {
  code: string;
}

const DEFAULT_EXPORT_STATUSES: SupportTicketStatus[] = ['new', 'needs_info'];
const CLOSED_STATUSES: SupportTicketStatus[] = ['closed', 'rejected', 'duplicate'];

function nextPublicId(): string {
  const slug = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SUP-${slug}`;
}

function closeTimestampFor(status: SupportTicketStatus | undefined): Date | null | undefined {
  if (!status) return undefined;
  return CLOSED_STATUSES.includes(status) ? new Date() : null;
}

function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}

function buildUpdateMetadata(input: UpdateSupportTicketInput): Prisma.InputJsonObject | undefined {
  const metadata = {
    ...(input.githubIssueUrl !== undefined ? { githubIssueUrl: input.githubIssueUrl } : {}),
    ...(input.duplicateTicketIds !== undefined ? { duplicateTicketIds: input.duplicateTicketIds } : {}),
    ...(input.sensitivityFlags !== undefined ? { sensitivityFlags: input.sensitivityFlags } : {}),
  } satisfies Prisma.InputJsonObject;

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function toExportSource(ticket: {
  publicId: string;
  status: string;
  privacy: string;
  category: string;
  area: string;
  title: string;
  description: string;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  reproductionSteps: string | null;
  reporterDisplayName: string;
  realmLabel: string;
  seasonId: string | null;
  screen: string | null;
  appVersion: string | null;
  apiVersion: string | null;
  browser: string | null;
  device: string | null;
  requestId: string | null;
  sentryEventId: string | null;
  duplicateTicketIds: string[];
  githubIssueUrl: string | null;
  sensitivityFlags: string[];
  staffNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SupportTicketExportSource {
  return {
    ...ticket,
    status: ticket.status as SupportTicketStatus,
    privacy: ticket.privacy as SupportTicketPrivacy,
    category: ticket.category as SupportTicketCategory,
    area: ticket.area as SupportTicketArea,
    sensitivityFlags: ticket.sensitivityFlags as SupportSensitivityFlag[],
  };
}

function realmLabelFor(seasonId: string | null, seasonName?: string): string {
  if (!seasonId) return 'Preseason';
  return seasonName ?? 'Seasonal Realm';
}

export async function createSupportTicket(params: CreateSupportTicketParams) {
  const publicId = nextPublicId();
  const { input } = params;

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        publicId,
        source: params.source ?? 'in_game',
        status: 'new',
        privacy: input.privacy,
        category: input.category,
        area: input.area,
        sensitivityFlags: [],
        title: input.title,
        description: input.description,
        expectedBehavior: input.expectedBehavior,
        actualBehavior: input.actualBehavior,
        reproductionSteps: input.reproductionSteps,
        reporterAccountId: params.accountId,
        reporterPlayerId: params.playerId,
        seasonId: params.seasonId,
        reporterDisplayName: params.reporterDisplayName,
        realmLabel: params.realmLabel,
        screen: input.screen,
        appVersion: input.appVersion,
        apiVersion: input.apiVersion,
        browser: input.browser,
        device: input.device,
        requestId: input.requestId,
        sentryEventId: input.sentryEventId,
        attachmentMetadata: input.attachments as Prisma.InputJsonValue | undefined,
        discordReporterGuildId: params.discordReporterGuildId,
        discordReporterUserId: params.discordReporterUserId,
      },
    });

    await tx.supportTicketEvent.create({
      data: {
        ticketId: ticket.id,
        actorAccountId: params.accountId,
        eventType: 'created',
        toStatus: 'new',
      },
    });

    return ticket;
  });
}

export async function createDiscordSupportTicket(params: {
  discordGuildId: string;
  discordUserId: string;
  input: CreateSupportTicketInput;
}) {
  const link = await prisma.discordAccountLink.findFirst({
    where: {
      discordGuildId: params.discordGuildId,
      discordUserId: params.discordUserId,
      unlinkedAt: null,
    },
    orderBy: { linkedAt: 'desc' },
    select: {
      account: {
        select: {
          id: true,
          activePlayer: {
            select: {
              id: true,
              username: true,
              seasonId: true,
              season: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!link) {
    throw new AppError(404, 'Discord account is not linked to a PocketRealm account', 'DISCORD_LINK_REQUIRED');
  }

  const player = link.account.activePlayer;
  return createSupportTicket({
    accountId: link.account.id,
    playerId: player?.id ?? null,
    seasonId: player?.seasonId ?? null,
    reporterDisplayName: player?.username ?? 'Discord Adventurer',
    realmLabel: realmLabelFor(player?.seasonId ?? null, player?.season?.name),
    input: params.input,
    source: 'discord',
    discordReporterGuildId: params.discordGuildId,
    discordReporterUserId: params.discordUserId,
  });
}

export async function updateSupportTicket(
  publicId: string,
  actorAccountId: string,
  input: UpdateSupportTicketInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing: SupportTicketUpdateSeed = await tx.supportTicket.findUniqueOrThrow({
        where: { publicId },
        select: { id: true, status: true },
      });

      const ticket = await tx.supportTicket.update({
        where: { publicId },
        data: {
          status: input.status,
          githubIssueUrl: input.githubIssueUrl,
          duplicateTicketIds: input.duplicateTicketIds,
          sensitivityFlags: input.sensitivityFlags,
          staffNotes: input.note,
          closedAt: closeTimestampFor(input.status),
        },
      });

      await tx.supportTicketEvent.create({
        data: {
          ticketId: existing.id,
          actorAccountId,
          eventType: input.status ? 'status_changed' : 'updated',
          fromStatus: input.status ? existing.status : undefined,
          toStatus: input.status,
          note: input.note,
          metadata: buildUpdateMetadata(input),
        },
      });

      return ticket;
    });
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === 'P2025') {
      throw new AppError(404, 'Support ticket not found', 'SUPPORT_TICKET_NOT_FOUND');
    }
    throw error;
  }
}

export async function listSupportTicketsForExport(options: ExportOptions): Promise<SupportTicketExportSource[]> {
  const statuses = options.statuses?.length ? options.statuses : DEFAULT_EXPORT_STATUSES;
  const tickets = await prisma.supportTicket.findMany({
    where: {
      status: { in: statuses },
      ...(options.createdAfter ? { createdAt: { gte: options.createdAfter } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(options.limit ?? 100, 500),
    select: {
      publicId: true,
      status: true,
      privacy: true,
      category: true,
      area: true,
      title: true,
      description: true,
      expectedBehavior: true,
      actualBehavior: true,
      reproductionSteps: true,
      reporterDisplayName: true,
      realmLabel: true,
      seasonId: true,
      screen: true,
      appVersion: true,
      apiVersion: true,
      browser: true,
      device: true,
      requestId: true,
      sentryEventId: true,
      duplicateTicketIds: true,
      githubIssueUrl: true,
      sensitivityFlags: true,
      staffNotes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return tickets.map(toExportSource);
}

export function supportTicketToJsonl(ticket: SupportTicketExportSource): string {
  return `${JSON.stringify(toSupportTicketJsonlRecord(ticket))}\n`;
}

export function supportTicketToAdminRecord(ticket: SupportTicketExportSource) {
  return toSupportTicketAdminRecord(ticket);
}
