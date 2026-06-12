import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordNotificationPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    discordNotificationEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
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
  listDiscordNotificationPreferences,
  listPendingDiscordNotificationEvents,
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

      expect(preferences).toEqual([{ type: 'turns_capped', enabled: false }]);
    });

    it('reflects stored enabled state', async () => {
      mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([
        { type: 'turns_capped', enabled: true },
      ]);

      const preferences = await listDiscordNotificationPreferences({ guildId: GUILD_ID, discordUserId: USER_ID });

      expect(preferences).toEqual([{ type: 'turns_capped', enabled: true }]);
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
        update: { enabled: true },
      });
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
    });

    it('skips empty id lists without queries', async () => {
      await ackDiscordNotificationEvents({ deliveredIds: [], failedIds: [] }, NOW);

      expect(mocks.prisma.discordNotificationEvent.updateMany).not.toHaveBeenCalled();
    });
  });
});
