import {
  WEB_TO_DISCORD_NOTIFICATION_TYPE,
  type DiscordNotificationPayload,
  type DiscordNotificationType,
} from '@pocketrealm/shared/discord/discordNotifications';
import { enqueueDiscordNotificationEvent } from './discordNotificationService';
import { sendPush, type NotificationType, type PushPayload } from './pushNotificationService';

type WebTypeWithDiscord = keyof typeof WEB_TO_DISCORD_NOTIFICATION_TYPE;

/**
 * Single fan-out point for a targeted player notification. Delivers web push
 * (gated on Player.notify*) and, for types mapped to Discord, enqueues a Discord
 * DM (gated on the player's /notify preference). Each channel gates itself; this
 * function does not. Fire-and-forget — both deliveries are voided.
 */
export function notifyPlayer(
  playerId: string,
  type: NotificationType,
  push: PushPayload,
  discordPayload?: DiscordNotificationPayload,
): void {
  void sendPush(playerId, type, push);

  const discordType = WEB_TO_DISCORD_NOTIFICATION_TYPE[type as WebTypeWithDiscord] as DiscordNotificationType | undefined;
  if (discordType && discordPayload) {
    void enqueueDiscordNotificationEvent(playerId, discordType, discordPayload);
  }
}
