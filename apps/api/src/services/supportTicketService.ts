import { randomUUID } from 'crypto';
import { prisma, type Prisma } from '@pocketrealm/database';
import { closeTimestampFor } from '@pocketrealm/shared/support/supportTickets';
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
import { DISCORD_LINK_REQUIRED_ERROR, findLinkedDiscordPlayer } from './discordLinkedPlayer';
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

export interface SupportTicketExportPage {
  tickets: SupportTicketExportSource[];
  hasMore: boolean;
}

interface PrismaKnownError {
  code: string;
}

const DEFAULT_EXPORT_STATUSES: SupportTicketStatus[] = ['new', 'needs_info'];
const MAX_EXPORT_LIMIT = 500;

function nextPublicId(): string {
  const slug = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SUP-${slug}`;
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
  discordReporterUserId: string | null;
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

/** Human-facing realm label for a player's season context. */
export function realmLabelFor(seasonId: string | null, seasonName?: string): string {
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
  const { accountId, player } = await findLinkedDiscordPlayer(
    { guildId: params.discordGuildId, discordUserId: params.discordUserId },
    { linkRequired: DISCORD_LINK_REQUIRED_ERROR },
  );

  return createSupportTicket({
    accountId,
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
      const existing = await tx.supportTicket.findUniqueOrThrow({
        where: { publicId },
        select: { id: true, status: true, closedAt: true },
      });

      // Only treat the patch as a status change when the status actually differs;
      // re-applying the current status must not touch status/closedAt or log status_changed.
      const nextStatus = input.status !== undefined && input.status !== existing.status
        ? input.status
        : undefined;

      const ticket = await tx.supportTicket.update({
        where: { publicId },
        data: {
          status: nextStatus,
          githubIssueUrl: input.githubIssueUrl,
          duplicateTicketIds: input.duplicateTicketIds,
          sensitivityFlags: input.sensitivityFlags,
          staffNotes: input.note,
          closedAt: nextStatus ? closeTimestampFor(nextStatus, existing.closedAt) : undefined,
        },
      });

      await tx.supportTicketEvent.create({
        data: {
          ticketId: existing.id,
          actorAccountId,
          eventType: nextStatus ? 'status_changed' : 'updated',
          fromStatus: nextStatus ? existing.status : undefined,
          toStatus: nextStatus,
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

export async function listSupportTicketsForExport(options: ExportOptions): Promise<SupportTicketExportPage> {
  const statuses = options.statuses?.length ? options.statuses : DEFAULT_EXPORT_STATUSES;
  const limit = Math.min(options.limit ?? 100, MAX_EXPORT_LIMIT);
  const tickets = await prisma.supportTicket.findMany({
    where: {
      status: { in: statuses },
      ...(options.createdAfter ? { createdAt: { gte: options.createdAfter } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
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
      discordReporterUserId: true,
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

  const hasMore = tickets.length > limit;

  return {
    tickets: (hasMore ? tickets.slice(0, limit) : tickets).map(toExportSource),
    hasMore,
  };
}

export function supportTicketToJsonl(ticket: SupportTicketExportSource): string {
  return `${JSON.stringify(toSupportTicketJsonlRecord(ticket))}\n`;
}

export function supportTicketToAdminRecord(ticket: SupportTicketExportSource) {
  return toSupportTicketAdminRecord(ticket);
}
