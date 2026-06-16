export const DISCORD_NOTIFICATION_TYPES = ['turns_capped'] as const;

export type DiscordNotificationType = (typeof DISCORD_NOTIFICATION_TYPES)[number];

export function isDiscordNotificationType(value: string): value is DiscordNotificationType {
  return (DISCORD_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Button labels and /notify display names, keyed by type. */
export const DISCORD_NOTIFICATION_TYPE_LABELS: Record<DiscordNotificationType, string> = {
  turns_capped: 'Turns capped',
};

export interface DiscordTurnsCappedPayload {
  currentTurns: number;
  bankCap: number;
  username: string;
}

/** Shape served by GET /api/v1/discord/notifications/pending. */
export interface DiscordNotificationEventView {
  id: string;
  discordGuildId: string;
  discordUserId: string | null;
  type: DiscordNotificationType;
  payload: DiscordTurnsCappedPayload;
  createdAt: string;
}

/** Shape served by GET/POST /api/v1/discord/notifications/preferences. */
export interface DiscordNotificationPreferenceView {
  type: DiscordNotificationType;
  enabled: boolean;
}
