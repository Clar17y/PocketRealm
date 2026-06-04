import { ChannelType, type GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BotConfig } from '../config.js';
import {
  evaluateXpMessage,
  grantXpForMessage,
  levelForDiscordXp,
  type MessageXpProfileDelegate,
  type MessageXpPrismaClient,
  type MessageXpRedisClient,
  type MessageXpTransactionClient,
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

  it('maps Discord XP totals to levels', () => {
    expect(levelForDiscordXp(0)).toBe(1);
    expect(levelForDiscordXp(99)).toBe(1);
    expect(levelForDiscordXp(100)).toBe(2);
    expect(levelForDiscordXp(400)).toBe(3);
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

  it('rejects cooldown hits using Redis NX semantics', async () => {
    const redis = createRedis({ setResult: null });
    const prisma = createPrisma();

    const result = await evaluateXpMessage(createMessage(), {
      prisma,
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

  it('rejects repeated near-identical fingerprints in the recent event window', async () => {
    const prisma = createPrisma({
      duplicateEvent: {
        id: 'event-1',
      },
    });

    const result = await evaluateXpMessage(createMessage(), {
      prisma,
      redis: createRedis(),
      config: createConfig(),
      now: () => now,
    });

    expect(prisma.discordXpEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        discordGuildId: guildId,
        discordUserId: userId,
        createdAt: { gte: new Date('2026-06-04T11:50:00.000Z') },
      }),
    }));
    expect(result).toMatchObject({
      eligible: false,
      reason: 'duplicate_fingerprint',
    });
  });

  it('rejects users excluded from XP', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        excludedFromXp: true,
      }),
    });

    const result = await grantXpForMessage(createMessage(), {
      prisma,
      redis: createRedis(),
      config: createConfig(),
      now: () => now,
      random: () => 0.375,
    });

    expect(result).toMatchObject({
      eligible: false,
      reason: 'excluded_from_xp',
    });
    expect(prisma.discordXpEvent.create).not.toHaveBeenCalled();
  });

  it('grants deterministic message XP, updates level, and stores no raw content', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        xp: 92,
        level: 1,
        dailyXp: 0,
        dailyXpDate: now,
      }),
    });
    const message = createMessage();

    const result = await grantXpForMessage(message, {
      prisma,
      redis: createRedis(),
      config: createConfig(),
      now: () => now,
      random: () => 0.375,
    });

    expect(result).toMatchObject({
      eligible: true,
      reason: 'granted',
      xpGranted: 8,
      previousLevel: 1,
      newLevel: 2,
    });
    expect(prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        xp: { increment: 8 },
        level: 2,
        dailyXp: 8,
        dailyXpDate: new Date('2026-06-04T00:00:00.000Z'),
        lastXpGrantedAt: now,
      }),
    }));
    expect(prisma.discordXpEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        discordGuildId: guildId,
        discordUserId: userId,
        channelId,
        messageId: message.id,
        xp: 8,
        reason: 'chat_message',
        createdAt: now,
      }),
    }));
    expect(prisma.discordXpEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ content: expect.any(String) }),
    }));
  });

  it('caps partial grants at the daily soft cap', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        xp: 92,
        level: 1,
        dailyXp: 497,
        dailyXpDate: now,
      }),
    });

    const result = await grantXpForMessage(createMessage(), {
      prisma,
      redis: createRedis(),
      config: createConfig(),
      now: () => now,
      random: () => 0.99,
    });

    expect(result).toMatchObject({
      eligible: true,
      reason: 'granted',
      xpGranted: 3,
      previousLevel: 1,
      newLevel: 1,
    });
    expect(prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        xp: { increment: 3 },
        dailyXp: 500,
      }),
    }));
    expect(prisma.discordXpEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ xp: 3 }),
    }));
  });

  it('does not grant XP after the daily soft cap is reached', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        xp: 500,
        level: 3,
        dailyXp: 500,
        dailyXpDate: now,
      }),
    });

    const result = await grantXpForMessage(createMessage(), {
      prisma,
      redis: createRedis(),
      config: createConfig(),
      now: () => now,
      random: () => 0.375,
    });

    expect(result).toMatchObject({
      eligible: false,
      reason: 'daily_cap',
    });
    expect(prisma.discordCommunityProfile.update).not.toHaveBeenCalled();
    expect(prisma.discordXpEvent.create).not.toHaveBeenCalled();
  });

  it('adds the highest configured level role when a member is available and level increases', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        xp: 398,
        level: 2,
        dailyXp: 0,
        dailyXpDate: now,
      }),
    });
    const add = vi.fn<GuildMember['roles']['add']>(async () => ({} as GuildMember));
    const member = {
      roles: { add },
    } as unknown as GuildMember;

    const result = await grantXpForMessage(
      createMessage({ member }),
      {
        prisma,
        redis: createRedis(),
        config: createConfig({
          levelRoleMap: new Map([
            [2, levelTwoRoleId],
            [5, levelFiveRoleId],
          ]),
        }),
        now: () => now,
        random: () => 0.99,
      },
    );

    expect(result).toMatchObject({
      eligible: true,
      xpGranted: 12,
      previousLevel: 2,
      newLevel: 3,
    });
    expect(add).toHaveBeenCalledWith(levelTwoRoleId);
    expect(prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastRoleSyncAt: now }),
    }));
  });
});

function createConfig(overrides: Partial<Pick<
  BotConfig,
  | 'guildId'
  | 'supportCategoryId'
  | 'supportTriageChannelId'
  | 'supportStaffRoleIds'
  | 'xpIgnoredChannelIds'
  | 'xpEligibleChannelIds'
  | 'levelRoleMap'
>> = {}): Pick<
  BotConfig,
  | 'guildId'
  | 'supportCategoryId'
  | 'supportTriageChannelId'
  | 'supportStaffRoleIds'
  | 'xpIgnoredChannelIds'
  | 'xpEligibleChannelIds'
  | 'levelRoleMap'
> {
  return {
    guildId,
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

interface MockProfile {
  id: string;
  discordUserId: string;
  discordGuildId: string;
  xp: number;
  level: number;
  dailyXp: number;
  dailyXpDate: Date | null;
  excludedFromXp: boolean;
}

function createProfile(overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    id: 'profile-1',
    discordUserId: userId,
    discordGuildId: guildId,
    xp: 0,
    level: 1,
    dailyXp: 0,
    dailyXpDate: null,
    excludedFromXp: false,
    ...overrides,
  };
}

function createPrisma(options: {
  profile?: MockProfile | null;
  duplicateEvent?: { id: string } | null;
} = {}): MessageXpPrismaClient {
  const profile = options.profile === undefined ? createProfile() : options.profile;
  const baseProfile = profile ?? createProfile({ id: 'profile-new' });
  const discordCommunityProfile: MessageXpProfileDelegate = {
    findUnique: vi.fn(async () => profile),
    update: vi.fn(async ({ data }: Parameters<MessageXpProfileDelegate['update']>[0]) => ({
      ...baseProfile,
      xp: baseProfile.xp + (data.xp?.increment ?? 0),
      level: data.level ?? baseProfile.level,
      dailyXp: data.dailyXp ?? baseProfile.dailyXp,
      dailyXpDate: data.dailyXpDate ?? baseProfile.dailyXpDate,
    })),
    create: vi.fn(async ({ data }: Parameters<MessageXpProfileDelegate['create']>[0]) => ({
      id: 'profile-new',
      excludedFromXp: false,
      ...data,
    })),
  };
  const tx: MessageXpTransactionClient = {
    discordCommunityProfile,
    discordXpEvent: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => options.duplicateEvent ?? null),
      create: vi.fn(async () => ({ id: 'event-new' })),
    },
  };
  const prisma: MessageXpPrismaClient = {
    ...tx,
    $transaction: async <T>(callback: (transaction: MessageXpTransactionClient) => Promise<T>): Promise<T> =>
      callback(tx),
  };

  return prisma;
}

function createRedis(options: { setResult?: 'OK' | null } = {}): MessageXpRedisClient {
  return {
    set: vi.fn(async () => options.setResult === undefined ? 'OK' : options.setResult),
    del: vi.fn(async () => 1),
  };
}
