export const DISCORD_NOTIFICATION_TYPES = [
  'turns_capped',
  'pvp_attack',
  'pvp_scout',
  'boss_appeared',
  'boss_defeated',
  'expedition_recruiting',
  'expedition_finished',
] as const;

export type DiscordNotificationType = (typeof DISCORD_NOTIFICATION_TYPES)[number];

export function isDiscordNotificationType(value: string): value is DiscordNotificationType {
  return (DISCORD_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Button labels and /notify display names, keyed by type. */
export const DISCORD_NOTIFICATION_TYPE_LABELS: Record<DiscordNotificationType, string> = {
  turns_capped: 'Turns capped',
  pvp_attack: 'PvP attack',
  pvp_scout: 'PvP scout',
  boss_appeared: 'Boss appeared',
  boss_defeated: 'Boss defeated',
  expedition_recruiting: 'Expedition recruiting',
  expedition_finished: 'Expedition finished',
};

/**
 * Maps an API-side targeted push NotificationType (camelCase) to its Discord
 * slug, for the `notifyPlayer` chokepoint. `turnBankFull` is absent (turns-capped
 * DMs come from the API sweep) and `bossAppeared` is absent (boss-appeared DMs are
 * a broadcast via broadcastDiscordNotification, not a targeted notifyPlayer event).
 */
export const WEB_TO_DISCORD_NOTIFICATION_TYPE = {
  pvpAttack: 'pvp_attack',
  pvpScout: 'pvp_scout',
  bossKilled: 'boss_defeated',
  expeditionStarted: 'expedition_recruiting',
  expeditionFinished: 'expedition_finished',
} as const satisfies Record<string, DiscordNotificationType>;

export interface DiscordTurnsCappedPayload {
  currentTurns: number;
  bankCap: number;
  username: string;
}

export interface DiscordPvpAttackPayload {
  attackerName: string;
}

export interface DiscordPvpScoutPayload {
  scouterName: string;
}

export interface DiscordBossAppearedPayload {
  bossName: string;
  zoneName: string;
}

export interface DiscordBossDefeatedPayload {
  bossName: string;
}

export interface DiscordExpeditionRecruitingPayload {
  tier: number;
}

export type DiscordExpeditionFinishedPayload =
  | { tier: number; outcome: 'victory' }
  | { tier: number; outcome: 'failed'; attempts: number };

export type DiscordNotificationPayload =
  | DiscordTurnsCappedPayload
  | DiscordPvpAttackPayload
  | DiscordPvpScoutPayload
  | DiscordBossAppearedPayload
  | DiscordBossDefeatedPayload
  | DiscordExpeditionRecruitingPayload
  | DiscordExpeditionFinishedPayload;

/** Shape served by GET /api/v1/discord/notifications/pending. */
export interface DiscordNotificationEventView {
  id: string;
  discordGuildId: string;
  discordUserId: string | null;
  type: DiscordNotificationType;
  payload: DiscordNotificationPayload;
  createdAt: string;
}

/** Shape served by GET/POST /api/v1/discord/notifications/preferences. */
export interface DiscordNotificationPreferenceView {
  type: DiscordNotificationType;
  enabled: boolean;
}
