export const SUPPORT_TICKET_STATUSES = [
  'new',
  'needs_info',
  'duplicate',
  'accepted',
  'rejected',
  'security',
  'known_issue',
  'closed',
] as const;

export const SUPPORT_TICKET_PRIVACY = ['public_candidate', 'private', 'not_sure'] as const;
export const SUPPORT_TICKET_CATEGORIES = ['bug', 'suggestion', 'balance', 'account', 'security', 'abuse', 'other'] as const;
export const SUPPORT_TICKET_AREAS = [
  'combat',
  'exploration',
  'crafting',
  'inventory',
  'social',
  'guild',
  'casino',
  'payments',
  'auth',
  'mobile',
  'performance',
  'other',
] as const;
export const SUPPORT_SENSITIVITY_FLAGS = [
  'personal_data',
  'payment',
  'account',
  'security',
  'exploit',
  'harassment',
] as const;

export type SupportTicketStatus = typeof SUPPORT_TICKET_STATUSES[number];
export type SupportTicketPrivacy = typeof SUPPORT_TICKET_PRIVACY[number];
export type SupportTicketCategory = typeof SUPPORT_TICKET_CATEGORIES[number];
export type SupportTicketArea = typeof SUPPORT_TICKET_AREAS[number];
export type SupportSensitivityFlag = typeof SUPPORT_SENSITIVITY_FLAGS[number];

/** Statuses that mark a ticket as closed for lifecycle purposes (closedAt, thread cleanup). */
export const CLOSED_SUPPORT_TICKET_STATUSES = ['closed', 'rejected', 'duplicate'] as const satisfies readonly SupportTicketStatus[];

/** Statuses reachable from the Discord triage card status buttons. */
export const DISCORD_SUPPORT_BUTTON_STATUSES = ['needs_info', 'accepted', 'rejected', 'security', 'closed'] as const satisfies readonly SupportTicketStatus[];

export function isClosedSupportTicketStatus(status: SupportTicketStatus): boolean {
  return (CLOSED_SUPPORT_TICKET_STATUSES as readonly SupportTicketStatus[]).includes(status);
}

/**
 * closedAt timestamp for a ticket transitioning to `status`. Preserves an
 * existing closedAt so re-applying a closed status never rewrites when the
 * ticket was originally closed.
 */
export function closeTimestampFor(status: SupportTicketStatus, existingClosedAt?: Date | null): Date | null {
  if (!isClosedSupportTicketStatus(status)) return null;
  return existingClosedAt ?? new Date();
}

/** Privacy levels whose report bodies must be withheld from external surfaces (Discord, JSONL export). */
export const RESTRICTED_SUPPORT_PRIVACY = ['private', 'not_sure'] as const satisfies readonly SupportTicketPrivacy[];

export function isRestrictedSupportPrivacy(privacy: SupportTicketPrivacy): boolean {
  return (RESTRICTED_SUPPORT_PRIVACY as readonly SupportTicketPrivacy[]).includes(privacy);
}
