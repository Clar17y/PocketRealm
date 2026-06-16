import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const redisTransaction = {
    lpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };

  return {
    prisma: {
      player: { findUnique: vi.fn() },
      discordAccountLink: { findFirst: vi.fn() },
    },
    redis: {
      multi: vi.fn(() => redisTransaction),
    },
    redisTransaction,
  };
});

vi.mock('@pocketrealm/database', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../redis', () => ({
  redis: mocks.redis,
}));

import { prisma } from '@pocketrealm/database';
import { resolveDiscordTarget, publishDiscordNotification, notifyDiscord, DISCORD_NOTIFICATION_QUEUE } from './discordNotifier';

const PLAYER_ID = 'player-1';

describe('discordNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisTransaction.exec.mockResolvedValue([]);
  });

  describe('resolveDiscordTarget', () => {
    it('returns the linked target when an active link exists', async () => {
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
        discordUserId: 'discord-99',
      } as never);

      const target = await resolveDiscordTarget(PLAYER_ID);

      expect(target).toEqual({ discordUserId: 'discord-99' });
      expect(prisma.discordAccountLink.findFirst).toHaveBeenCalledWith({
        where: {
          account: { players: { some: { id: PLAYER_ID } } },
          unlinkedAt: null,
        },
        orderBy: { linkedAt: 'desc' },
        select: { discordUserId: true },
      });
    });

    it('returns null when the player has no active link', async () => {
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(null);

      const target = await resolveDiscordTarget(PLAYER_ID);

      expect(target).toBeNull();
    });
  });

  describe('publishDiscordNotification', () => {
    it('LPUSHes the JSON message and trims the queue in one transaction', async () => {
      await publishDiscordNotification({
        discordUserId: 'discord-99',
        type: 'pvpAttack',
        title: 'PvP Attack!',
        body: 'You are under attack',
      });

      expect(mocks.redis.multi).toHaveBeenCalledTimes(1);
      expect(mocks.redisTransaction.lpush).toHaveBeenCalledWith(
        DISCORD_NOTIFICATION_QUEUE,
        JSON.stringify({
          discordUserId: 'discord-99',
          type: 'pvpAttack',
          title: 'PvP Attack!',
          body: 'You are under attack',
        }),
      );
      expect(mocks.redisTransaction.ltrim).toHaveBeenCalledWith(DISCORD_NOTIFICATION_QUEUE, 0, 999);
      expect(mocks.redisTransaction.exec).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyDiscord', () => {
    it('publishes when the player is linked', async () => {
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
        discordUserId: 'discord-99',
      } as never);

      await notifyDiscord(PLAYER_ID, 'bossKilled', { title: 'Boss Defeated!', body: 'Slain' });

      expect(mocks.redisTransaction.lpush).toHaveBeenCalledTimes(1);
    });

    it('does not publish when the player is unlinked', async () => {
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(null);

      await notifyDiscord(PLAYER_ID, 'bossKilled', { title: 'Boss Defeated!', body: 'Slain' });

      expect(mocks.redisTransaction.lpush).not.toHaveBeenCalled();
    });

    it('never throws when Redis publish fails', async () => {
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
        discordUserId: 'discord-99',
      } as never);
      mocks.redisTransaction.exec.mockRejectedValueOnce(new Error('redis down'));

      await expect(
        notifyDiscord(PLAYER_ID, 'bossKilled', { title: 'Boss Defeated!', body: 'Slain' }),
      ).resolves.toBeUndefined();
    });
  });
});
