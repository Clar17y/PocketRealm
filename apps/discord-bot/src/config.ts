import { z } from 'zod';

const snowflakeSchema = z.string().trim().regex(/^\d{17,20}$/, 'Expected a Discord snowflake id');
const requiredStringSchema = z.string().trim().min(1);
const requiredUrlSchema = z.string().trim().url();

const envSchema = z.object({
  DISCORD_BOT_TOKEN: requiredStringSchema,
  DISCORD_CLIENT_ID: snowflakeSchema,
  DISCORD_GUILD_ID: snowflakeSchema,
  POCKETREALM_API_BASE_URL: requiredUrlSchema,
  POCKETREALM_WEB_BASE_URL: requiredUrlSchema,
  DISCORD_INTERNAL_API_KEY: z.string().trim().min(32),
  DISCORD_BOT_HEALTH_CHANNEL_ID: snowflakeSchema,
  DISCORD_SUPPORT_TRIAGE_CHANNEL_ID: snowflakeSchema,
  DISCORD_SUPPORT_CATEGORY_ID: snowflakeSchema,
  DISCORD_PLAYER_ROLE_ID: snowflakeSchema,
  DISCORD_VERIFIED_ROLE_ID: snowflakeSchema,
  DISCORD_SUPPORT_STAFF_ROLE_IDS: z.string().optional(),
  DISCORD_XP_IGNORED_CHANNEL_IDS: z.string().optional(),
  DISCORD_XP_ELIGIBLE_CHANNEL_IDS: z.string().optional(),
  DISCORD_LEVEL_ROLE_MAP: z.string().optional(),
});

export interface BotConfig {
  token: string;
  clientId: string;
  guildId: string;
  apiBaseUrl: string;
  webBaseUrl: string;
  internalApiKey: string;
  botHealthChannelId: string;
  supportTriageChannelId: string;
  supportCategoryId: string;
  playerRoleId: string;
  verifiedRoleId: string;
  supportStaffRoleIds: string[];
  xpIgnoredChannelIds: string[];
  xpEligibleChannelIds: string[];
  levelRoleMap: Map<number, string>;
}

export function parseSnowflakeList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];

  return raw
    .split(',')
    .map((value) => snowflakeSchema.parse(value));
}

export function parseLevelRoleMap(raw: string | undefined): Map<number, string> {
  const levelRoleMap = new Map<number, string>();
  if (!raw?.trim()) return levelRoleMap;

  for (const entry of raw.split(',')) {
    const [rawLevel, rawRoleId] = entry.split(':');
    const level = Number.parseInt(rawLevel?.trim() ?? '', 10);

    if (!Number.isInteger(level) || level < 1) {
      throw new Error(`Invalid Discord level role level: ${rawLevel ?? ''}`);
    }

    levelRoleMap.set(level, snowflakeSchema.parse(rawRoleId));
  }

  return levelRoleMap;
}

export function parseBotConfig(env: Record<string, string | undefined>): BotConfig {
  const parsed = envSchema.parse(env);

  return {
    token: parsed.DISCORD_BOT_TOKEN,
    clientId: parsed.DISCORD_CLIENT_ID,
    guildId: parsed.DISCORD_GUILD_ID,
    apiBaseUrl: parsed.POCKETREALM_API_BASE_URL,
    webBaseUrl: parsed.POCKETREALM_WEB_BASE_URL,
    internalApiKey: parsed.DISCORD_INTERNAL_API_KEY,
    botHealthChannelId: parsed.DISCORD_BOT_HEALTH_CHANNEL_ID,
    supportTriageChannelId: parsed.DISCORD_SUPPORT_TRIAGE_CHANNEL_ID,
    supportCategoryId: parsed.DISCORD_SUPPORT_CATEGORY_ID,
    playerRoleId: parsed.DISCORD_PLAYER_ROLE_ID,
    verifiedRoleId: parsed.DISCORD_VERIFIED_ROLE_ID,
    supportStaffRoleIds: parseSnowflakeList(parsed.DISCORD_SUPPORT_STAFF_ROLE_IDS),
    xpIgnoredChannelIds: parseSnowflakeList(parsed.DISCORD_XP_IGNORED_CHANNEL_IDS),
    xpEligibleChannelIds: parseSnowflakeList(parsed.DISCORD_XP_ELIGIBLE_CHANNEL_IDS),
    levelRoleMap: parseLevelRoleMap(parsed.DISCORD_LEVEL_ROLE_MAP),
  };
}

export function loadBotConfig(): BotConfig {
  return parseBotConfig(process.env);
}
