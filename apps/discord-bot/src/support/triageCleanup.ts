import { isRecord } from '../utils.js';

const DEFAULT_SCAN_LIMIT = 100;
const MAX_SCAN_LIMIT = 100;
const MIN_SCAN_LIMIT = 1;

export interface TriageCleanupMessage {
  id: string;
  content: string | null;
  createdTimestamp: number;
  author?: {
    id?: string;
    bot?: boolean;
  } | null;
  deletable?: boolean;
  delete?: (reason?: string) => Promise<unknown>;
}

export interface TriageCleanupChannel {
  messages: {
    fetch(options: { limit: number }): Promise<{
      values(): Iterable<TriageCleanupMessage>;
    }>;
  };
}

export interface TriageCleanupSummary {
  scanned: number;
  matchedTickets: number;
  duplicateTicketCount: number;
  duplicateCandidates: number;
  deleted: number;
  skipped: number;
  failed: number;
  confirmed: boolean;
  scanLimit: number;
  targetPublicId: string | null;
}

export interface CleanupSupportTriageMessagesOptions {
  channel: TriageCleanupChannel;
  botUserId?: string | null;
  publicId?: string | null;
  scanLimit?: number | null;
  confirm: boolean;
}

export type CleanupSupportTriageMessagesFn = (
  options: CleanupSupportTriageMessagesOptions
) => Promise<TriageCleanupSummary>;

export function isTriageCleanupChannel(channel: unknown): channel is TriageCleanupChannel {
  return isRecord(channel)
    && isRecord(channel.messages)
    && typeof channel.messages.fetch === 'function';
}

export async function cleanupSupportTriageMessages(
  options: CleanupSupportTriageMessagesOptions,
): Promise<TriageCleanupSummary> {
  const scanLimit = normalizeScanLimit(options.scanLimit);
  const targetPublicId = normalizePublicId(options.publicId);
  const fetched = await options.channel.messages.fetch({ limit: scanLimit });
  const messages = [...fetched.values()];
  const groups = groupSupportTriageCards(messages, options.botUserId ?? null, targetPublicId);
  const duplicateGroups = [...groups.entries()]
    .map(([publicId, groupMessages]) => ({
      publicId,
      duplicates: groupMessages.sort(compareNewestFirst).slice(1),
    }))
    .filter((group) => group.duplicates.length > 0);
  const summary: TriageCleanupSummary = {
    scanned: messages.length,
    matchedTickets: groups.size,
    duplicateTicketCount: duplicateGroups.length,
    duplicateCandidates: duplicateGroups.reduce((total, group) => total + group.duplicates.length, 0),
    deleted: 0,
    skipped: 0,
    failed: 0,
    confirmed: options.confirm,
    scanLimit,
    targetPublicId,
  };

  if (!options.confirm) {
    return summary;
  }

  for (const group of duplicateGroups) {
    for (const message of group.duplicates) {
      if (message.deletable === false || typeof message.delete !== 'function') {
        summary.skipped += 1;
        continue;
      }

      try {
        await message.delete(`Duplicate support triage card for ${group.publicId}`);
        summary.deleted += 1;
      } catch {
        summary.failed += 1;
      }
    }
  }

  return summary;
}

function groupSupportTriageCards(
  messages: TriageCleanupMessage[],
  botUserId: string | null,
  targetPublicId: string | null,
): Map<string, TriageCleanupMessage[]> {
  const groups = new Map<string, TriageCleanupMessage[]>();

  for (const message of messages) {
    if (!isBotAuthored(message, botUserId)) {
      continue;
    }

    const publicId = extractSupportTicketId(message);
    if (!publicId || (targetPublicId && publicId !== targetPublicId)) {
      continue;
    }

    const group = groups.get(publicId) ?? [];
    group.push(message);
    groups.set(publicId, group);
  }

  return groups;
}

function isBotAuthored(message: TriageCleanupMessage, botUserId: string | null): boolean {
  if (botUserId) {
    return message.author?.id === botUserId;
  }

  return message.author?.bot === true;
}

function extractSupportTicketId(message: TriageCleanupMessage): string | null {
  const contentMatch = message.content?.match(/^\s*New support ticket\s+`?(SUP-[A-Z0-9-]+)`?/i);
  if (contentMatch?.[1]) {
    return normalizePublicId(contentMatch[1]);
  }

  return null;
}

function normalizeScanLimit(scanLimit: number | null | undefined): number {
  if (typeof scanLimit !== 'number' || !Number.isFinite(scanLimit)) {
    return DEFAULT_SCAN_LIMIT;
  }

  return Math.min(MAX_SCAN_LIMIT, Math.max(MIN_SCAN_LIMIT, Math.trunc(scanLimit)));
}

function normalizePublicId(publicId: string | null | undefined): string | null {
  const normalized = publicId?.trim().toUpperCase();
  return normalized || null;
}

function compareNewestFirst(a: TriageCleanupMessage, b: TriageCleanupMessage): number {
  const timestampDiff = b.createdTimestamp - a.createdTimestamp;
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return b.id.localeCompare(a.id);
}
