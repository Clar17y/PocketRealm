import { z } from 'zod';
import { DISCORD_SNOWFLAKE_REGEX } from '@pocketrealm/shared/discord/discordIds';

export const discordSnowflakeSchema = z.string().regex(DISCORD_SNOWFLAKE_REGEX);

export const discordGuildLinkSchema = z.object({
  discordUserId: discordSnowflakeSchema,
  discordGuildId: discordSnowflakeSchema,
}).strict();

export const claimDiscordLinkCodeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/),
}).strict();

export const discordXpMessageGrantSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
  channelId: discordSnowflakeSchema,
  messageId: discordSnowflakeSchema,
  messageFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const discordXpAdjustmentSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  actorDiscordUserId: discordSnowflakeSchema,
  targetDiscordUserId: discordSnowflakeSchema,
  amount: z.number().int(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const discordXpRoleSyncSchema = z.object({
  profileId: z.string().uuid(),
  discordGuildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
  roleId: discordSnowflakeSchema,
  level: z.number().int().min(1),
  syncedAt: z.string().datetime().transform((value) => new Date(value)).optional(),
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
