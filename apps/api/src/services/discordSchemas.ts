import { z } from 'zod';

export const discordSnowflakeSchema = z.string().regex(/^\d{16,22}$/);

export const discordGuildLinkSchema = z.object({
  discordUserId: discordSnowflakeSchema,
  discordGuildId: discordSnowflakeSchema,
}).strict();

export const claimDiscordLinkCodeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/),
}).strict();

export const discordDuelCreateSchema = z.object({
  guildId: discordSnowflakeSchema,
  channelId: discordSnowflakeSchema,
  challengerDiscordUserId: discordSnowflakeSchema,
  targetDiscordUserId: discordSnowflakeSchema,
}).strict();

export const discordUnsyncedLinksQuerySchema = z.object({
  guildId: discordSnowflakeSchema,
}).strict();

export const discordLinkIdParamsSchema = z.object({
  id: z.string().uuid(),
}).strict();
