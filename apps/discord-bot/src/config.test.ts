import { describe, expect, it } from 'vitest';

import { parseBotConfig } from './config.js';

const validEnv = {
  DISCORD_BOT_TOKEN: 'bot-token',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '234567890123456789',
  POCKETREALM_API_BASE_URL: 'https://api.pocketrealm.test',
  POCKETREALM_WEB_BASE_URL: 'https://pocketrealm.test',
  REDIS_URL: 'redis://localhost:6379',
  DISCORD_INTERNAL_API_KEY: 'a'.repeat(32),
  DISCORD_BOT_HEALTH_CHANNEL_ID: '345678901234567890',
  DISCORD_SUPPORT_TRIAGE_CHANNEL_ID: '456789012345678901',
  DISCORD_SUPPORT_CATEGORY_ID: '567890123456789012',
  DISCORD_DUELS_CHANNEL_ID: '678901234567890123',
  DISCORD_PLAYER_ROLE_ID: '678901234567890123',
  DISCORD_VERIFIED_ROLE_ID: '789012345678901234',
  DISCORD_SUPPORT_STAFF_ROLE_IDS: '890123456789012345,901234567890123456',
  DISCORD_XP_IGNORED_CHANNEL_IDS: '112233445566778899,223344556677889900',
  DISCORD_XP_ELIGIBLE_CHANNEL_IDS: '334455667788990011,445566778899001122',
  DISCORD_LEVEL_ROLE_MAP: '5:556677889900112233,10:667788990011223344',
};

describe('parseBotConfig', () => {
  it('requires Discord, API, web, and internal auth settings', () => {
    expect(() => parseBotConfig({})).toThrow();
    expect(parseBotConfig(validEnv)).toMatchObject({
      token: 'bot-token',
      clientId: '123456789012345678',
      guildId: '234567890123456789',
      apiBaseUrl: 'https://api.pocketrealm.test',
      webBaseUrl: 'https://pocketrealm.test',
      redisUrl: 'redis://localhost:6379',
      internalApiKey: 'a'.repeat(32),
      botHealthChannelId: '345678901234567890',
      welcomeChannelId: null,
      duelsChannelId: '678901234567890123',
    });
  });

  it('parses an optional welcome channel id', () => {
    expect(parseBotConfig({
      ...validEnv,
      DISCORD_WELCOME_CHANNEL_ID: '901234567890123456',
    }).welcomeChannelId).toBe('901234567890123456');
    expect(() => parseBotConfig({ ...validEnv, DISCORD_WELCOME_CHANNEL_ID: 'not-a-snowflake' })).toThrow();
  });

  it('parses configured level role mappings by numeric level', () => {
    const config = parseBotConfig(validEnv);

    expect([...config.levelRoleMap.entries()]).toEqual([
      [5, '556677889900112233'],
      [10, '667788990011223344'],
    ]);
  });

  it('rejects invalid snowflake ids and short internal API keys', () => {
    expect(() => parseBotConfig({ ...validEnv, DISCORD_CLIENT_ID: 'not-a-snowflake' })).toThrow();
    expect(() => parseBotConfig({ ...validEnv, DISCORD_INTERNAL_API_KEY: 'too-short' })).toThrow();
  });

  it('requires a valid REDIS_URL instead of silently falling back to localhost', () => {
    expect(() => parseBotConfig({ ...validEnv, REDIS_URL: undefined })).toThrow();
    expect(() => parseBotConfig({ ...validEnv, REDIS_URL: 'not-a-url' })).toThrow();
  });

  it('rejects malformed level role mappings', () => {
    expect(() => parseBotConfig({ ...validEnv, DISCORD_LEVEL_ROLE_MAP: '1abc:556677889900112233' })).toThrow();
    expect(() => parseBotConfig({ ...validEnv, DISCORD_LEVEL_ROLE_MAP: '1.5:556677889900112233' })).toThrow();
    expect(() => parseBotConfig({ ...validEnv, DISCORD_LEVEL_ROLE_MAP: '1:556677889900112233:extra' })).toThrow();
  });
});
