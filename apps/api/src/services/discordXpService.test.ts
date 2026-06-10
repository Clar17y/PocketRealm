import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordCommunityProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    discordXpEvent: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    discordBotAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@pocketrealm/database', () => ({
  prisma: mocks.prisma,
}));

import {
  adjustDiscordXp,
  grantDiscordMessageXp,
  markDiscordXpRoleSynced,
} from './discordXpService';

const NOW = new Date('2026-06-04T12:00:00.000Z');
const TODAY = new Date('2026-06-04T00:00:00.000Z');
const GUILD_ID = '23456789012345678';
const USER_ID = '34567890123456789';
const ACTOR_ID = '45678901234567890';
const CHANNEL_ID = '56789012345678901';
const MESSAGE_ID = '67890123456789012';
const FINGERPRINT = 'a'.repeat(64);

function createProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    discordGuildId: GUILD_ID,
    discordUserId: USER_ID,
    xp: 0,
    level: 1,
    dailyXp: 0,
    dailyXpDate: null,
    lastXpGrantedAt: null,
    lastRoleSyncAt: null,
    excludedFromXp: false,
    ...overrides,
  };
}

function messageInput(overrides: Record<string, unknown> = {}) {
  return {
    discordGuildId: GUILD_ID,
    discordUserId: USER_ID,
    channelId: CHANNEL_ID,
    messageId: MESSAGE_ID,
    messageFingerprint: FINGERPRINT,
    ...overrides,
  };
}

describe('discordXpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma));
    mocks.prisma.discordXpEvent.findUnique.mockResolvedValue(null);
    mocks.prisma.discordXpEvent.findFirst.mockResolvedValue(null);
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(createProfile());
    mocks.prisma.discordCommunityProfile.update.mockImplementation(async ({ data }: { data: { xp?: { increment?: number; decrement?: number } | number; level?: number; dailyXp?: number; dailyXpDate?: Date; lastXpGrantedAt?: Date; lastRoleSyncAt?: Date } }) => ({
      ...createProfile({ xp: 92, level: 1 }),
      xp: data.xp && typeof data.xp === 'object' && data.xp.increment ? 92 + data.xp.increment : 92,
      level: data.level ?? 1,
      dailyXp: data.dailyXp ?? 0,
      dailyXpDate: data.dailyXpDate ?? null,
      lastXpGrantedAt: data.lastXpGrantedAt ?? null,
      lastRoleSyncAt: data.lastRoleSyncAt ?? null,
    }));
    mocks.prisma.discordCommunityProfile.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.discordCommunityProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'profile-new',
      excludedFromXp: false,
      ...data,
    }));
    mocks.prisma.discordXpEvent.create.mockResolvedValue({ id: 'event-1' });
    mocks.prisma.discordBotAuditEvent.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('creates a profile and XP event for a new message XP user', async () => {
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(null);

    const result = await grantDiscordMessageXp(messageInput(), {
      now: NOW,
      random: () => 0.375,
    });

    expect(result).toMatchObject({
      eligible: true,
      reason: 'granted',
      xpGranted: 8,
      previousLevel: 1,
      newLevel: 1,
      profileId: 'profile-new',
    });
    expect(mocks.prisma.discordCommunityProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        xp: 8,
        level: 1,
        dailyXp: 8,
        dailyXpDate: TODAY,
        lastXpGrantedAt: NOW,
      }),
    });
    expect(mocks.prisma.discordXpEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        messageFingerprint: FINGERPRINT,
        xp: 8,
        reason: 'chat_message',
        createdAt: NOW,
      }),
    });
  });

  it('returns already_processed when the message id was already recorded', async () => {
    mocks.prisma.discordXpEvent.findUnique.mockResolvedValue({ id: 'event-existing' });

    await expect(grantDiscordMessageXp(messageInput(), { now: NOW, random: () => 0.375 }))
      .resolves.toMatchObject({ eligible: false, reason: 'already_processed' });
    expect(mocks.prisma.discordCommunityProfile.update).not.toHaveBeenCalled();
    expect(mocks.prisma.discordXpEvent.create).not.toHaveBeenCalled();
  });

  it('returns duplicate_fingerprint for recent near-identical messages', async () => {
    mocks.prisma.discordXpEvent.findFirst.mockResolvedValue({ id: 'event-duplicate' });

    await expect(grantDiscordMessageXp(messageInput(), { now: NOW, random: () => 0.375 }))
      .resolves.toMatchObject({ eligible: false, reason: 'duplicate_fingerprint' });
    expect(mocks.prisma.discordXpEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        messageFingerprint: FINGERPRINT,
        createdAt: { gte: new Date('2026-06-04T11:50:00.000Z') },
      }),
    }));
  });

  it('returns excluded_from_xp for excluded community profiles', async () => {
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(createProfile({ excludedFromXp: true }));

    await expect(grantDiscordMessageXp(messageInput(), { now: NOW, random: () => 0.375 }))
      .resolves.toMatchObject({ eligible: false, reason: 'excluded_from_xp' });
  });

  it('caps partial grants at the daily soft cap', async () => {
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(createProfile({
      xp: 92,
      level: 1,
      dailyXp: 497,
      dailyXpDate: TODAY,
    }));

    const result = await grantDiscordMessageXp(messageInput(), {
      now: NOW,
      random: () => 0.99,
    });

    expect(result).toMatchObject({ eligible: true, reason: 'granted', xpGranted: 3 });
    expect(mocks.prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ xp: { increment: 3 }, dailyXp: 500 }),
    }));
  });

  it('updates an existing profile level when message XP crosses the next level threshold', async () => {
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(createProfile({
      xp: 92,
      level: 1,
      dailyXp: 0,
      dailyXpDate: TODAY,
    }));

    const result = await grantDiscordMessageXp(messageInput(), {
      now: NOW,
      random: () => 0.375,
    });

    expect(result).toMatchObject({
      eligible: true,
      reason: 'granted',
      xpGranted: 8,
      previousLevel: 1,
      newLevel: 2,
      profileId: 'profile-1',
    });
    expect(mocks.prisma.discordCommunityProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        xp: { increment: 8 },
        level: 2,
        dailyXp: 8,
        dailyXpDate: TODAY,
        lastXpGrantedAt: NOW,
      }),
    });
  });

  it('returns daily_cap when the daily soft cap is exhausted', async () => {
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(createProfile({
      xp: 500,
      level: 3,
      dailyXp: 500,
      dailyXpDate: TODAY,
    }));

    await expect(grantDiscordMessageXp(messageInput(), { now: NOW, random: () => 0.375 }))
      .resolves.toMatchObject({ eligible: false, reason: 'daily_cap' });
    expect(mocks.prisma.discordCommunityProfile.update).not.toHaveBeenCalled();
  });

  it('applies a positive staff XP adjustment and writes a success audit event', async () => {
    mocks.prisma.discordCommunityProfile.findUnique.mockResolvedValue(createProfile({ xp: 90, level: 1 }));
    mocks.prisma.discordCommunityProfile.update.mockResolvedValueOnce(createProfile({ xp: 110, level: 1 }));
    mocks.prisma.discordCommunityProfile.update.mockResolvedValueOnce(createProfile({ xp: 110, level: 2 }));

    const result = await adjustDiscordXp({
      discordGuildId: GUILD_ID,
      actorDiscordUserId: ACTOR_ID,
      targetDiscordUserId: USER_ID,
      amount: 20,
      reason: 'manual event credit',
    });

    expect(result).toMatchObject({
      profileId: 'profile-1',
      targetDiscordUserId: USER_ID,
      amount: 20,
      previousXp: 90,
      newXp: 110,
      previousLevel: 1,
      newLevel: 2,
      reason: 'manual event credit',
    });
    expect(mocks.prisma.discordBotAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guildId: GUILD_ID,
        actorDiscordUserId: ACTOR_ID,
        targetDiscordUserId: USER_ID,
        command: '/staff xp-adjust',
        status: 'success',
      }),
    });
  });

  it('clamps a negative staff XP adjustment at zero', async () => {
    mocks.prisma.discordCommunityProfile.findUnique
      .mockResolvedValueOnce(createProfile({ xp: 90, level: 1 }))
      .mockResolvedValueOnce(createProfile({ xp: 0, level: 1 }));

    const result = await adjustDiscordXp({
      discordGuildId: GUILD_ID,
      actorDiscordUserId: ACTOR_ID,
      targetDiscordUserId: USER_ID,
      amount: -200,
      reason: 'remove mistaken credit',
    });

    expect(mocks.prisma.discordCommunityProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', xp: 90 },
      data: { xp: { decrement: 90 } },
    });
    expect(result).toMatchObject({ previousXp: 90, newXp: 0, amount: -200 });
  });

  it('records a failed audit row when a staff adjustment transaction fails', async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(adjustDiscordXp({
      discordGuildId: GUILD_ID,
      actorDiscordUserId: ACTOR_ID,
      targetDiscordUserId: USER_ID,
      amount: 20,
      reason: 'manual event credit',
    })).rejects.toThrow('database unavailable');

    expect(mocks.prisma.discordBotAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        errorCode: 'DISCORD_STAFF_XP_ADJUST_FAILED',
      }),
    });
  });

  it('marks XP role sync for the matching profile only', async () => {
    mocks.prisma.discordCommunityProfile.updateMany.mockResolvedValue({ count: 1 });

    await expect(markDiscordXpRoleSynced({
      profileId: 'profile-1',
      discordGuildId: GUILD_ID,
      discordUserId: USER_ID,
      roleId: '78901234567890123',
      level: 2,
      syncedAt: NOW,
    })).resolves.toEqual({
      profileId: 'profile-1',
      lastRoleSyncAt: NOW,
    });
    expect(mocks.prisma.discordCommunityProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', discordGuildId: GUILD_ID, discordUserId: USER_ID },
      data: { lastRoleSyncAt: NOW },
    });
  });
});
