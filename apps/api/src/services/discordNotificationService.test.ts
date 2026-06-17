import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCORD_NOTIFICATION_TYPES } from '@pocketrealm/shared/discord/discordNotifications';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordAccountLink: {
      findFirst: vi.fn(),
    },
    discordNotificationPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    discordNotificationEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  findLinkedDiscordPlayer: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('./discordLinkedPlayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./discordLinkedPlayer')>()),
  findLinkedDiscordPlayer: mocks.findLinkedDiscordPlayer,
}));

import {
  ackDiscordNotificationEvents,
  broadcastDiscordNotification,
  enqueueDiscordNotificationEvent,
  listDiscordNotificationPreferences,
  listPendingDiscordNotificationEvents,
  resolveDiscordTarget,
  upsertDiscordNotificationPreference,
} from './discordNotificationService';

const GUILD_ID = '23456789012345678';
const USER_ID = '34567890123456789';
const NOW = new Date('2026-06-12T12:00:00.000Z');

describe('discordNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLinkedDiscordPlayer.mockResolvedValue({ accountId: 'account-1', player: null });
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  });

  describe('listDiscordNotificationPreferences', () => {
    it('returns every known type, defaulting to disabled', async () => {
      const preferences = await listDiscordNotificationPreferences({ guildId: GUILD_ID, discordUserId: USER_ID });

      expect(preferences).toEqual([
        { type: 'turns_capped', enabled: false },
        { type: 'pvp_attack', enabled: false },
        { type: 'pvp_scout', enabled: false },
        { type: 'boss_appeared', enabled: false },
        { type: 'boss_defeated', enabled: false },
        { type: 'expedition_recruiting', enabled: false },
        { type: 'expedition_finished', enabled: false },
      ]);
    });

    it('reflects stored enabled state', async () => {
      mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([
        { type: 'pvp_attack', enabled: true },
      ]);

      const preferences = await listDiscordNotificationPreferences({ guildId: GUILD_ID, discordUserId: USER_ID });

      expect(preferences).toContainEqual({ type: 'pvp_attack', enabled: true });
      expect(preferences).toContainEqual({ type: 'turns_capped', enabled: false });
      expect(preferences).toHaveLength(DISCORD_NOTIFICATION_TYPES.length);
    });

    it('requires an active account link', async () => {
      mocks.findLinkedDiscordPlayer.mockRejectedValue(new Error('not linked'));

      await expect(listDiscordNotificationPreferences({ guildId: GUILD_ID, discordUserId: USER_ID }))
        .rejects.toThrow('not linked');
    });
  });

  describe('upsertDiscordNotificationPreference', () => {
    it('upserts by the (guild, user, type) unique key and returns the view', async () => {
      mocks.prisma.discordNotificationPreference.upsert.mockResolvedValue({ type: 'turns_capped', enabled: true });

      const preference = await upsertDiscordNotificationPreference({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        type: 'turns_capped',
        enabled: true,
      });

      expect(preference).toEqual({ type: 'turns_capped', enabled: true });
      expect(mocks.prisma.discordNotificationPreference.upsert).toHaveBeenCalledWith({
        where: {
          discordGuildId_discordUserId_type: {
            discordGuildId: GUILD_ID,
            discordUserId: USER_ID,
            type: 'turns_capped',
          },
        },
        create: {
          discordGuildId: GUILD_ID,
          discordUserId: USER_ID,
          type: 'turns_capped',
          enabled: true,
        },
        update: { enabled: true, armed: true },
      });
    });

    it('re-arms on re-enable but does not touch armed when disabling', async () => {
      mocks.prisma.discordNotificationPreference.upsert.mockResolvedValue({ type: 'turns_capped', enabled: false });

      await upsertDiscordNotificationPreference({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        type: 'turns_capped',
        enabled: false,
      });

      expect(mocks.prisma.discordNotificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { enabled: false } }),
      );
    });

    it('requires an active account link', async () => {
      mocks.findLinkedDiscordPlayer.mockRejectedValue(new Error('not linked'));

      await expect(upsertDiscordNotificationPreference({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        type: 'turns_capped',
        enabled: true,
      })).rejects.toThrow('not linked');
    });
  });

  describe('listPendingDiscordNotificationEvents', () => {
    it('serves undelivered, unfailed events oldest first', async () => {
      mocks.prisma.discordNotificationEvent.findMany.mockResolvedValue([
        {
          id: 'event-1',
          discordGuildId: GUILD_ID,
          discordUserId: USER_ID,
          type: 'turns_capped',
          payload: { currentTurns: 64800, bankCap: 64800, username: 'Mira' },
          createdAt: NOW,
        },
      ]);

      const events = await listPendingDiscordNotificationEvents(10);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ id: 'event-1', type: 'turns_capped' });
      expect(events[0].createdAt).toBe(NOW.toISOString());
      expect(mocks.prisma.discordNotificationEvent.findMany).toHaveBeenCalledWith({
        where: { deliveredAt: null, failedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: {
          id: true,
          discordGuildId: true,
          discordUserId: true,
          type: true,
          payload: true,
          createdAt: true,
        },
      });
    });

    it('uses the PENDING_BATCH_LIMIT default when called with no argument', async () => {
      mocks.prisma.discordNotificationEvent.findMany.mockResolvedValue([]);

      await listPendingDiscordNotificationEvents();

      expect(mocks.prisma.discordNotificationEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  describe('ackDiscordNotificationEvents', () => {
    it('marks delivered events and increments failed attempts', async () => {
      mocks.prisma.discordNotificationEvent.updateMany.mockResolvedValue({ count: 1 });

      await ackDiscordNotificationEvents({ deliveredIds: ['event-1'], failedIds: ['event-2'] }, NOW);

      expect(mocks.prisma.discordNotificationEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-1'] }, deliveredAt: null },
        data: { deliveredAt: NOW },
      });
      expect(mocks.prisma.discordNotificationEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-2'] }, deliveredAt: null, failedAt: null },
        data: { attempts: { increment: 1 } },
      });
      expect(mocks.prisma.discordNotificationEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-2'] }, attempts: { gte: 5 }, failedAt: null },
        data: { failedAt: NOW },
      });
      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('routes failed-path updates through a single $transaction', async () => {
      mocks.prisma.discordNotificationEvent.updateMany.mockResolvedValue({ count: 2 });

      const result = await ackDiscordNotificationEvents(
        { deliveredIds: [], failedIds: ['event-3', 'event-4'] },
        NOW,
      );

      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.failed).toBe(2);
    });

    it('skips empty id lists without queries', async () => {
      await ackDiscordNotificationEvents({ deliveredIds: [], failedIds: [] }, NOW);

      expect(mocks.prisma.discordNotificationEvent.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('resolveDiscordTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the active link target for a player', async () => {
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue({
      discordUserId: USER_ID,
      discordGuildId: GUILD_ID,
    });

    const target = await resolveDiscordTarget('player-1');

    expect(target).toEqual({ discordUserId: USER_ID, discordGuildId: GUILD_ID });
    expect(mocks.prisma.discordAccountLink.findFirst).toHaveBeenCalledWith({
      where: { account: { players: { some: { id: 'player-1' } } }, unlinkedAt: null },
      orderBy: { linkedAt: 'desc' },
      select: { discordUserId: true, discordGuildId: true },
    });
  });

  it('returns null when the player has no active link', async () => {
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(null);
    expect(await resolveDiscordTarget('player-1')).toBeNull();
  });
});

describe('enqueueDiscordNotificationEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue({
      discordUserId: USER_ID,
      discordGuildId: GUILD_ID,
    });
  });

  it('inserts an outbox row when linked and the pref is enabled', async () => {
    mocks.prisma.discordNotificationPreference.findUnique.mockResolvedValue({ enabled: true });

    await enqueueDiscordNotificationEvent('player-1', 'pvp_attack', { attackerName: 'Rook' });

    expect(mocks.prisma.discordNotificationEvent.create).toHaveBeenCalledWith({
      data: {
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        type: 'pvp_attack',
        payload: { attackerName: 'Rook' },
      },
    });
  });

  it('does nothing when the pref is missing or disabled', async () => {
    mocks.prisma.discordNotificationPreference.findUnique.mockResolvedValue(null);

    await enqueueDiscordNotificationEvent('player-1', 'pvp_attack', { attackerName: 'Rook' });

    expect(mocks.prisma.discordNotificationEvent.create).not.toHaveBeenCalled();
  });

  it('does nothing when the player is unlinked', async () => {
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(null);

    await enqueueDiscordNotificationEvent('player-1', 'pvp_attack', { attackerName: 'Rook' });

    expect(mocks.prisma.discordNotificationPreference.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.discordNotificationEvent.create).not.toHaveBeenCalled();
  });

  it('swallows errors so callers are never affected', async () => {
    mocks.prisma.discordNotificationPreference.findUnique.mockRejectedValue(new Error('db down'));

    await expect(
      enqueueDiscordNotificationEvent('player-1', 'pvp_attack', { attackerName: 'Rook' }),
    ).resolves.toBeUndefined();
  });
});

describe('broadcastDiscordNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts one row per opted-in user', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([
      { discordGuildId: GUILD_ID, discordUserId: 'u1' },
      { discordGuildId: GUILD_ID, discordUserId: 'u2' },
    ]);

    await broadcastDiscordNotification('boss_appeared', { bossName: 'Ymir', zoneName: 'Tundra' });

    expect(mocks.prisma.discordNotificationPreference.findMany).toHaveBeenCalledWith({
      where: { type: 'boss_appeared', enabled: true },
      select: { discordGuildId: true, discordUserId: true },
    });
    expect(mocks.prisma.discordNotificationEvent.createMany).toHaveBeenCalledWith({
      data: [
        { discordGuildId: GUILD_ID, discordUserId: 'u1', type: 'boss_appeared', payload: { bossName: 'Ymir', zoneName: 'Tundra' } },
        { discordGuildId: GUILD_ID, discordUserId: 'u2', type: 'boss_appeared', payload: { bossName: 'Ymir', zoneName: 'Tundra' } },
      ],
    });
  });

  it('does not query inserts when nobody opted in', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([]);

    await broadcastDiscordNotification('boss_appeared', { bossName: 'Ymir', zoneName: 'Tundra' });

    expect(mocks.prisma.discordNotificationEvent.createMany).not.toHaveBeenCalled();
  });
});
