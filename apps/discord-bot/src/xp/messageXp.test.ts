import { ChannelType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BotConfig } from '../config.js';
import {
  evaluateXpMessage,
  grantXpForMessage,
  type MessageXpRedisClient,
  type XpMessage,
} from './messageXp.js';

const guildId = '234567890123456789';
const userId = '345678901234567890';
const channelId = '456789012345678901';
const duelsChannelId = '567890123456789012';
const levelTwoRoleId = '678901234567890123';
const levelFiveRoleId = '789012345678901234';
const now = new Date('2026-06-04T12:00:00.000Z');

describe('message XP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects messages shorter than the minimum length', async () => {
    expect(await evaluateXpMessage({ content: 'short' })).toMatchObject({
      eligible: false,
      reason: 'too_short',
    });
  });

  it('rejects configured ignored channels such as duels', async () => {
    expect(
      await evaluateXpMessage(
        createMessage({ channelId: duelsChannelId, channelName: 'duels' }),
        { config: createConfig({ xpIgnoredChannelIds: [duelsChannelId] }) },
      ),
    ).toMatchObject({
      eligible: false,
      reason: 'ignored_channel',
    });
  });

  it('rejects the configured duels channel by id even if the channel is renamed', async () => {
    expect(
      await evaluateXpMessage(
        createMessage({ channelId: duelsChannelId, channelName: 'friendly-arena' }),
        { config: createConfig({ duelsChannelId }) },
      ),
    ).toMatchObject({
      eligible: false,
      reason: 'ignored_channel',
    });
  });

  it('rejects cooldown hits using Redis NX semantics', async () => {
    const redis = createRedis({ setResult: null });

    const result = await evaluateXpMessage(createMessage(), {
      redis,
      config: createConfig(),
      now: () => now,
    });

    expect(redis.set).toHaveBeenCalledWith(
      `discord:xp:cooldown:${guildId}:${userId}`,
      '1',
      'EX',
      90,
      'NX',
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'cooldown',
    });
  });

  it('sends fingerprint-only message XP grants to the PocketRealm API', async () => {
    const api = createApi();
    const message = createMessage();
    const redis = createRedis();

    const result = await grantXpForMessage(message, {
      api: asMessageXpApiClient(api),
      redis,
      config: createConfig(),
      now: () => now,
    });

    expect(result).toMatchObject({
      eligible: true,
      reason: 'granted',
      xpGranted: 8,
      previousLevel: 1,
      newLevel: 2,
    });
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/messages', {
      discordGuildId: guildId,
      discordUserId: userId,
      channelId,
      messageId: message.id,
      messageFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(api.post.mock.calls)).not.toContain(message.content);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('releases the cooldown when the API denies a message XP grant', async () => {
    const api = createApi({
      result: {
        eligible: false,
        reason: 'daily_cap',
      },
    });
    const redis = createRedis();

    const result = await grantXpForMessage(createMessage(), {
      api: asMessageXpApiClient(api),
      redis,
      config: createConfig(),
      now: () => now,
    });

    expect(result).toMatchObject({
      eligible: false,
      reason: 'daily_cap',
    });
    expect(redis.del).toHaveBeenCalledWith(`discord:xp:cooldown:${guildId}:${userId}`);
  });

  it('releases the cooldown when the API grant fails', async () => {
    const apiError = new Error('api unavailable');
    const api: MockApi = {
      post: vi.fn(async () => {
        throw apiError;
      }),
    };
    const redis = createRedis();

    await expect(grantXpForMessage(createMessage(), {
      api: asMessageXpApiClient(api),
      redis,
      config: createConfig(),
      now: () => now,
    })).rejects.toThrow('api unavailable');

    expect(redis.del).toHaveBeenCalledWith(`discord:xp:cooldown:${guildId}:${userId}`);
  });

  it('adds highest configured level role and records role sync through API', async () => {
    const api = createApi({
      result: {
        eligible: true,
        reason: 'granted',
        xpGranted: 12,
        previousLevel: 2,
        newLevel: 3,
        profileId: 'profile-1',
      },
    });
    const add = vi.fn(async () => ({}));
    const member = {
      roles: { add },
    };

    const result = await grantXpForMessage(
      createMessage({ member }),
      {
        api: asMessageXpApiClient(api),
        redis: createRedis(),
        config: createConfig({
          levelRoleMap: new Map([
            [2, levelTwoRoleId],
            [5, levelFiveRoleId],
          ]),
        }),
        now: () => now,
      },
    );

    expect(result).toMatchObject({
      eligible: true,
      xpGranted: 12,
      previousLevel: 2,
      newLevel: 3,
    });
    expect(add).toHaveBeenCalledWith(levelTwoRoleId);
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/v1/discord/xp/role-sync', {
      profileId: 'profile-1',
      discordGuildId: guildId,
      discordUserId: userId,
      roleId: levelTwoRoleId,
      level: 3,
      syncedAt: now.toISOString(),
    });
  });
});

function createConfig(overrides: Partial<Pick<
  BotConfig,
  | 'guildId'
  | 'duelsChannelId'
  | 'supportCategoryId'
  | 'supportTriageChannelId'
  | 'supportStaffRoleIds'
  | 'xpIgnoredChannelIds'
  | 'xpEligibleChannelIds'
  | 'levelRoleMap'
>> = {}): Pick<
  BotConfig,
  | 'guildId'
  | 'duelsChannelId'
  | 'supportCategoryId'
  | 'supportTriageChannelId'
  | 'supportStaffRoleIds'
  | 'xpIgnoredChannelIds'
  | 'xpEligibleChannelIds'
  | 'levelRoleMap'
> {
  return {
    guildId,
    duelsChannelId,
    supportCategoryId: '999999999999999999',
    supportTriageChannelId: '888888888888888888',
    supportStaffRoleIds: [],
    xpIgnoredChannelIds: [],
    xpEligibleChannelIds: [],
    levelRoleMap: new Map(),
    ...overrides,
  };
}

function createMessage(overrides: Partial<XpMessage> & {
  channelName?: string;
} = {}): XpMessage {
  const channelName = overrides.channelName ?? 'general';

  return {
    id: '777777777777777777',
    content: 'This message is long enough to earn community activity XP.',
    channelId,
    guildId,
    author: {
      id: userId,
      bot: false,
    },
    channel: {
      id: overrides.channelId ?? channelId,
      name: channelName,
      parentId: null,
      type: ChannelType.GuildText,
    },
    ...overrides,
  };
}

interface MockApi {
  post: ReturnType<typeof vi.fn>;
}

interface TypedMockApiClient {
  post<T>(path: string, body: unknown): Promise<T>;
}

function asMessageXpApiClient(api: MockApi): TypedMockApiClient {
  const post = api.post as unknown as (path: string, body: unknown) => Promise<unknown>;

  return {
    post: async <T>(path: string, body: unknown) => await post(path, body) as T,
  };
}

function createApi(result: unknown = {
  result: {
    eligible: true,
    reason: 'granted',
    xpGranted: 8,
    previousLevel: 1,
    newLevel: 2,
    profileId: 'profile-1',
  },
}): MockApi {
  return {
    post: vi.fn(async () => result),
  };
}

function createRedis(options: { setResult?: 'OK' | null } = {}): MessageXpRedisClient {
  return {
    set: vi.fn(async () => options.setResult === undefined ? 'OK' : options.setResult),
    del: vi.fn(async () => 1),
  };
}
