import type { SupportSensitivityFlag, SupportTicketArea, SupportTicketCategory, SupportTicketPrivacy, SupportTicketStatus } from './supportTicketSchemas';

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/g;
const SESSION_HINT_REGEX = /\b(refreshToken|accessToken|sessionId|password)=\S+/gi;

export function redactSupportText(value: string | null | undefined): string | null {
  if (!value) return null;

  return value
    .replace(EMAIL_REGEX, '[redacted-email]')
    .replace(BEARER_REGEX, 'Bearer [redacted-token]')
    .replace(SESSION_HINT_REGEX, '$1=[redacted]')
    .replace(UUID_REGEX, '[redacted-id]');
}

export interface SupportTicketExportSource {
  publicId: string;
  status: SupportTicketStatus;
  privacy: SupportTicketPrivacy;
  category: SupportTicketCategory;
  area: SupportTicketArea;
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
  sensitivityFlags: SupportSensitivityFlag[];
  staffNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function compactContext(ticket: SupportTicketExportSource): Record<string, string> {
  const context: Record<string, string> = {};
  if (ticket.screen) context.screen = ticket.screen;
  if (ticket.appVersion) context.appVersion = ticket.appVersion;
  if (ticket.apiVersion) context.apiVersion = ticket.apiVersion;
  if (ticket.browser) context.browser = ticket.browser;
  if (ticket.device) context.device = ticket.device;
  if (ticket.requestId) context.requestId = ticket.requestId;
  if (ticket.sentryEventId) context.sentryEventId = ticket.sentryEventId;
  return context;
}

function buildBody(ticket: SupportTicketExportSource, transform: (value: string | null | undefined) => string | null) {
  const expected = transform(ticket.expectedBehavior);
  const actual = transform(ticket.actualBehavior);
  const repro = transform(ticket.reproductionSteps);
  const bodyParts = [
    transform(ticket.description),
    expected ? `Expected: ${expected}` : null,
    actual ? `Actual: ${actual}` : null,
    repro ? `Steps: ${repro}` : null,
  ].filter((part): part is string => Boolean(part));

  return bodyParts.join('\n\n');
}

export function toSupportTicketJsonlRecord(ticket: SupportTicketExportSource) {
  return {
    id: ticket.publicId,
    status: ticket.status,
    privacy: ticket.privacy,
    category: ticket.category,
    area: ticket.area,
    title: redactSupportText(ticket.title) ?? '',
    body: buildBody(ticket, redactSupportText),
    reporter: {
      displayName: `Reporter ${ticket.publicId}`,
      realm: ticket.realmLabel,
      seasonId: ticket.seasonId,
    },
    context: compactContext(ticket),
    sensitivityFlags: ticket.sensitivityFlags,
    duplicateTicketIds: ticket.duplicateTicketIds,
    githubIssueUrl: ticket.githubIssueUrl,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export function toSupportTicketAdminRecord(ticket: SupportTicketExportSource) {
  return {
    id: ticket.publicId,
    status: ticket.status,
    privacy: ticket.privacy,
    category: ticket.category,
    area: ticket.area,
    title: ticket.title,
    body: buildBody(ticket, (value) => value ?? null),
    reporter: {
      displayName: ticket.reporterDisplayName,
      realm: ticket.realmLabel,
      seasonId: ticket.seasonId,
    },
    context: compactContext(ticket),
    sensitivityFlags: ticket.sensitivityFlags,
    duplicateTicketIds: ticket.duplicateTicketIds,
    githubIssueUrl: ticket.githubIssueUrl,
    staffNotes: ticket.staffNotes,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
