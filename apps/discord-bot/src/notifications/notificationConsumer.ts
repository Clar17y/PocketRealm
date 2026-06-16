import { DISCORD_NOTIFICATION_QUEUE, parseNotification, type DiscordNotification } from './notificationContract.js';

const BRPOP_TIMEOUT_SECONDS = 5;
const DEFAULT_THROTTLE_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface LoggerLike {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

interface DmUserLike {
  send(payload: { content: string }): Promise<unknown>;
}

interface ClientLike {
  users: { fetch(userId: string): Promise<DmUserLike> };
}

interface BlockingRedisLike {
  brpop(key: string, timeoutSeconds: number): Promise<[string, string] | null>;
}

export interface DeliverContext {
  client: ClientLike;
  logger: LoggerLike;
}

/** Fetches the target user and sends the DM. Never throws. */
export async function deliverNotification(
  notification: DiscordNotification,
  ctx: DeliverContext,
): Promise<void> {
  try {
    const user = await ctx.client.users.fetch(notification.discordUserId);
    await user.send({ content: `${notification.title}\n${notification.body}` });
  } catch (err) {
    ctx.logger.debug(
      { err, discordUserId: notification.discordUserId, type: notification.type },
      'Failed to deliver Discord notification DM',
    );
  }
}

export interface NotificationConsumerOptions {
  redis: BlockingRedisLike;
  client: ClientLike;
  logger: LoggerLike;
  throttleMs?: number;
}

export interface NotificationConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Creates a BRPOP loop that drains the notification queue and DMs users.
 * Uses a finite BRPOP timeout so stop() can break the loop gracefully.
 */
export function createNotificationConsumer(options: NotificationConsumerOptions): NotificationConsumer {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  let running = false;
  let loopPromise: Promise<void> | null = null;

  const loop = async (): Promise<void> => {
    while (running) {
      let result: [string, string] | null;
      try {
        result = await options.redis.brpop(DISCORD_NOTIFICATION_QUEUE, BRPOP_TIMEOUT_SECONDS);
      } catch (err) {
        if (running) {
          options.logger.warn({ err }, 'Discord notification BRPOP failed');
          await sleep(throttleMs);
        }
        continue;
      }
      if (!result) {
        await sleep(throttleMs);
        continue;
      }

      const notification = parseNotification(result[1]);
      if (!notification) {
        options.logger.warn({ raw: result[1] }, 'Discarded invalid Discord notification payload');
        await sleep(throttleMs);
        continue;
      }

      await deliverNotification(notification, { client: options.client, logger: options.logger });
      await sleep(throttleMs);
    }
  };

  return {
    async start(): Promise<void> {
      if (running) return;
      running = true;
      loopPromise = loop();
    },
    async stop(): Promise<void> {
      running = false;
      if (loopPromise) {
        await loopPromise;
        loopPromise = null;
      }
    },
  };
}
