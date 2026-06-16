import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliverNotification, createNotificationConsumer } from './notificationConsumer.js';
import { DISCORD_NOTIFICATION_QUEUE } from './notificationContract.js';

const NOTIFICATION = {
  discordUserId: 'discord-99',
  type: 'pvpAttack',
  title: 'PvP Attack!',
  body: 'You are under attack',
};

function makeLogger() {
  return { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };
}

describe('notificationConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deliverNotification', () => {
    it('fetches the user and sends a DM', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } };
      const logger = makeLogger();

      await deliverNotification(NOTIFICATION, { client, logger });

      expect(client.users.fetch).toHaveBeenCalledWith('discord-99');
      expect(send).toHaveBeenCalledWith({ content: 'PvP Attack!\nYou are under attack' });
    });

    it('swallows a DM-closed error at debug level without throwing', async () => {
      const send = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));
      const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } };
      const logger = makeLogger();

      await expect(deliverNotification(NOTIFICATION, { client, logger })).resolves.toBeUndefined();
      expect(logger.debug).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('logs an unexpected delivery error at warn level without throwing', async () => {
      const send = vi.fn().mockRejectedValue(new Error('Service Unavailable'));
      const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } };
      const logger = makeLogger();

      await expect(deliverNotification(NOTIFICATION, { client, logger })).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('createNotificationConsumer', () => {
    it('drains queued messages in order then stops', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } };
      const logger = makeLogger();

      const second = { ...NOTIFICATION, title: 'Second' };
      const brpop = vi
        .fn()
        .mockResolvedValueOnce([DISCORD_NOTIFICATION_QUEUE, JSON.stringify(NOTIFICATION)])
        .mockResolvedValueOnce([DISCORD_NOTIFICATION_QUEUE, JSON.stringify(second)])
        .mockImplementation(async () => null);
      const redis = { brpop };

      const consumer = createNotificationConsumer({ redis, client, logger, throttleMs: 0 });
      await consumer.start();
      // allow the loop to process both queued items
      await new Promise((resolve) => setTimeout(resolve, 10));
      await consumer.stop();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(1, { content: 'PvP Attack!\nYou are under attack' });
      expect(send).toHaveBeenNthCalledWith(2, { content: 'Second\nYou are under attack' });
    });

    it('skips invalid payloads without crashing the loop', async () => {
      const send = vi.fn().mockResolvedValue(undefined);
      const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } };
      const logger = makeLogger();

      const brpop = vi
        .fn()
        .mockResolvedValueOnce([DISCORD_NOTIFICATION_QUEUE, 'garbage'])
        .mockImplementation(async () => null);
      const redis = { brpop };

      const consumer = createNotificationConsumer({ redis, client, logger, throttleMs: 0 });
      await consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await consumer.stop();

      expect(send).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
