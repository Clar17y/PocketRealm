import { z } from 'zod';

/** Redis list key shared with the API (apps/api/src/services/discordNotifier.ts). */
export const DISCORD_NOTIFICATION_QUEUE = 'discord:notifications';

const notificationSchema = z.object({
  discordUserId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

export type DiscordNotification = z.infer<typeof notificationSchema>;

/** Parses an untrusted queue payload; returns null if it is not a valid message. */
export function parseNotification(raw: string): DiscordNotification | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = notificationSchema.safeParse(json);
  return result.success ? result.data : null;
}
