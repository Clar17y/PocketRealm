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
import { resolveDiscordTarget } from './discordNotifier';

const PLAYER_ID = 'player-1';

describe('discordNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisTransaction.exec.mockResolvedValue([]);
  });

  describe('resolveDiscordTarget', () => {
    it('returns the linked target when an active link exists', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: 'acc-1' } as never);
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
        discordUserId: 'discord-99',
        discordGuildId: 'guild-1',
      } as never);

      const target = await resolveDiscordTarget(PLAYER_ID);

      expect(target).toEqual({ discordUserId: 'discord-99', guildId: 'guild-1' });
      expect(prisma.discordAccountLink.findFirst).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', unlinkedAt: null },
        orderBy: { linkedAt: 'desc' },
        select: { discordUserId: true, discordGuildId: true },
      });
    });

    it('returns null when the player has no account', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue(null);

      const target = await resolveDiscordTarget(PLAYER_ID);

      expect(target).toBeNull();
      expect(prisma.discordAccountLink.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when the account has no active link', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: 'acc-1' } as never);
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue(null);

      const target = await resolveDiscordTarget(PLAYER_ID);

      expect(target).toBeNull();
    });
  });
});
