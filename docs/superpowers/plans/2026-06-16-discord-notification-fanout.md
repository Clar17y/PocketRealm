# Discord Notification Fan-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the 7 existing web-push notifications to Discord DMs for players who have linked their Discord account and opted in, without adding new event triggers or a new opt-in surface.

**Architecture:** Hook the single existing chokepoint `sendPush()` in the API. After it confirms the player's `notify*` preference is on, it resolves the player's linked Discord user and queues a JSON message with Redis `MULTI`/`EXEC` (`LPUSH` + `LTRIM`) onto a durable list. The Discord bot runs a dedicated `BRPOP` loop that pops messages and sends DMs. The API is the only component that touches the database; the bot is the only component that holds the Discord token. They meet at the already-shared Redis (`REDIS_URL`).

**Tech Stack:** TypeScript, Express 4, Prisma 6, ioredis, discord.js, Vitest. Spec: `docs/superpowers/specs/2026-06-16-discord-notification-fanout-design.md`.

---

## File Structure

**API (`apps/api`)**
- Create: `src/services/discordNotifier.ts` — resolve `playerId → linked Discord target`, publish notifications to the Redis queue. Single responsibility: API-side Discord notification dispatch.
- Create: `src/services/discordNotifier.test.ts` — unit tests for the above.
- Modify: `src/services/pushNotificationService.ts` — call `notifyDiscord(...)` after the pref check passes.
- Modify: `src/services/pushNotificationService.test.ts` — assert the Discord fan-out is gated correctly.

**Bot (`apps/discord-bot`)**
- Create: `src/notifications/notificationContract.ts` — shared queue key + Zod schema + parser for the message shape (the trust boundary on the bot side).
- Create: `src/notifications/notificationContract.test.ts` — parser tests.
- Create: `src/notifications/notificationConsumer.ts` — `deliverNotification` (fetch user + DM) and `createNotificationConsumer` (BRPOP loop with throttle + graceful stop).
- Create: `src/notifications/notificationConsumer.test.ts` — delivery + loop tests.
- Modify: `src/index.ts` — start the consumer on `ClientReady`, stop it on shutdown.

**Queue contract (shared by both apps, defined independently in each — no `@pocketrealm/shared` export):**
- Redis key: `discord:notifications`
- Message JSON: `{ "discordUserId": string, "type": string, "title": string, "body": string }` (API writes `type` as `NotificationType`; bot validates it as a non-empty string so future `sendPush` types do not require a bot deploy just to parse.)
- Max queue length: `1000` (oldest trimmed via `LTRIM` after each push).

> **Decision:** The message contract is duplicated as a small constant + Zod schema in the bot and a plain interface in the API rather than shared via `@pocketrealm/shared`. This avoids the package-export + per-app vitest-alias friction for a 4-field message. The bot treats the queue as untrusted input and validates with Zod.

> **Current-code caveat:** On this branch, `turnBankFull` is defined in `NotificationType` and player preferences, but local grep does not show an active `sendPush(..., 'turnBankFull')` caller. This plan intentionally does **not** add a new trigger; it fans out every notification that reaches `sendPush`, so `turnBankFull` is covered automatically if an existing/future caller emits it.

---

## Task 1: API — `resolveDiscordTarget`

**Files:**
- Create: `apps/api/src/services/discordNotifier.ts`
- Test: `apps/api/src/services/discordNotifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/discordNotifier.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- discordNotifier`
Expected: FAIL — `resolveDiscordTarget` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/services/discordNotifier.ts`:

```typescript
import { prisma } from '@pocketrealm/database';

export interface DiscordTarget {
  discordUserId: string;
  guildId: string;
}

/**
 * Resolves a player to their active linked Discord user, or null when the
 * player is unlinked. Mirrors the lookup shape in discordLinkedPlayer.ts.
 */
export async function resolveDiscordTarget(playerId: string): Promise<DiscordTarget | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { accountId: true },
  });
  if (!player) return null;

  const link = await prisma.discordAccountLink.findFirst({
    where: { accountId: player.accountId, unlinkedAt: null },
    orderBy: { linkedAt: 'desc' },
    select: { discordUserId: true, discordGuildId: true },
  });
  if (!link) return null;

  return { discordUserId: link.discordUserId, guildId: link.discordGuildId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- discordNotifier`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/discordNotifier.ts apps/api/src/services/discordNotifier.test.ts
git commit -m "feat(api): resolve player to linked Discord target"
```

---

## Task 2: API — `publishDiscordNotification` + `notifyDiscord`

**Files:**
- Modify: `apps/api/src/services/discordNotifier.ts`
- Test: `apps/api/src/services/discordNotifier.test.ts`

- [ ] **Step 1: Write the failing test**

Append these `describe` blocks inside the top-level `describe('discordNotifier', ...)` in `apps/api/src/services/discordNotifier.test.ts` (after the `resolveDiscordTarget` block). Also add the import update at the top: change the import line to
`import { resolveDiscordTarget, publishDiscordNotification, notifyDiscord, DISCORD_NOTIFICATION_QUEUE } from './discordNotifier';`

```typescript
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
      vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: 'acc-1' } as never);
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
        discordUserId: 'discord-99',
        discordGuildId: 'guild-1',
      } as never);

      await notifyDiscord(PLAYER_ID, 'bossKilled', { title: 'Boss Defeated!', body: 'Slain' });

      expect(mocks.redisTransaction.lpush).toHaveBeenCalledTimes(1);
    });

    it('does not publish when the player is unlinked', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue(null);

      await notifyDiscord(PLAYER_ID, 'bossKilled', { title: 'Boss Defeated!', body: 'Slain' });

      expect(mocks.redisTransaction.lpush).not.toHaveBeenCalled();
    });

    it('never throws when Redis publish fails', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: 'acc-1' } as never);
      vi.mocked(prisma.discordAccountLink.findFirst).mockResolvedValue({
        discordUserId: 'discord-99',
        discordGuildId: 'guild-1',
      } as never);
      mocks.redisTransaction.exec.mockRejectedValueOnce(new Error('redis down'));

      await expect(
        notifyDiscord(PLAYER_ID, 'bossKilled', { title: 'Boss Defeated!', body: 'Slain' }),
      ).resolves.toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- discordNotifier`
Expected: FAIL — `publishDiscordNotification` / `notifyDiscord` / `DISCORD_NOTIFICATION_QUEUE` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to the top of `apps/api/src/services/discordNotifier.ts` (after the existing `prisma` import):

```typescript
import { redis } from '../redis';
import { logger } from '../logger';
import type { NotificationType } from './pushNotificationService';
```

Append to `apps/api/src/services/discordNotifier.ts`:

```typescript
export const DISCORD_NOTIFICATION_QUEUE = 'discord:notifications';
const MAX_QUEUE_LENGTH = 1000;

export interface DiscordNotificationContent {
  title: string;
  body: string;
}

export interface DiscordNotificationMessage extends DiscordNotificationContent {
  discordUserId: string;
  type: NotificationType;
}

/** Pushes a notification onto the durable Redis queue and caps its length. */
export async function publishDiscordNotification(message: DiscordNotificationMessage): Promise<void> {
  const transaction = redis.multi();
  transaction.lpush(DISCORD_NOTIFICATION_QUEUE, JSON.stringify(message));
  transaction.ltrim(DISCORD_NOTIFICATION_QUEUE, 0, MAX_QUEUE_LENGTH - 1);
  await transaction.exec();
}

/**
 * Fire-and-forget Discord fan-out: resolves the linked target and publishes.
 * Swallows all errors so callers can `void` it without affecting their flow.
 */
export async function notifyDiscord(
  playerId: string,
  type: NotificationType,
  content: DiscordNotificationContent,
): Promise<void> {
  try {
    const target = await resolveDiscordTarget(playerId);
    if (!target) return;
    await publishDiscordNotification({
      discordUserId: target.discordUserId,
      type,
      title: content.title,
      body: content.body,
    });
  } catch (err) {
    logger.error({ err, playerId, type }, 'Failed to publish Discord notification');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- discordNotifier`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/discordNotifier.ts apps/api/src/services/discordNotifier.test.ts
git commit -m "feat(api): publish Discord notifications to durable Redis queue"
```

---

## Task 3: API — hook `notifyDiscord` into `sendPush`

**Files:**
- Modify: `apps/api/src/services/pushNotificationService.ts:107` (after the pref check)
- Test: `apps/api/src/services/pushNotificationService.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/pushNotificationService.test.ts`, add this mock after the existing `vi.mock('web-push', ...)` block (around line 26):

```typescript
vi.mock('./discordNotifier', () => ({
  notifyDiscord: vi.fn().mockResolvedValue(undefined),
}));
```

Add this import after the existing `import webpush from 'web-push';` (line 29):

```typescript
import { notifyDiscord } from './discordNotifier';
```

Add these two tests inside `describe('sendPush', ...)` (after the existing `'skips sending when preference is disabled'` test):

```typescript
    it('fans out to Discord when preference is enabled', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({ notifyPvpAttack: true } as never);
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([] as never);

      await sendPush(PLAYER_ID, 'pvpAttack', { title: 'Test', body: 'Hello' });

      expect(notifyDiscord).toHaveBeenCalledWith(PLAYER_ID, 'pvpAttack', {
        title: 'Test',
        body: 'Hello',
      });
    });

    it('does not fan out to Discord when preference is disabled', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({ notifyPvpAttack: false } as never);

      await sendPush(PLAYER_ID, 'pvpAttack', { title: 'Test', body: 'Hello' });

      expect(notifyDiscord).not.toHaveBeenCalled();
    });
```

> Note: the first test sets `findMany` to return `[]` (no web subscriptions) to prove the Discord fan-out happens **independently of** web-push subscriptions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- pushNotificationService`
Expected: FAIL — `notifyDiscord` not called (not yet wired into `sendPush`).

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/services/pushNotificationService.ts`, add the import near the top (after line 3, the `logger` import):

```typescript
import { notifyDiscord } from './discordNotifier';
```

Then in `sendPush`, locate the existing pref-check line (currently line 107):

```typescript
  if (!player || !player[prefColumn]) return;
```

Immediately **after** that line, insert:

```typescript

  // Fan out to Discord DM (independent of web-push subscriptions). Fire-and-forget.
  void notifyDiscord(playerId, notificationType, { title: payload.title, body: payload.body });
```

Leave the rest of `sendPush` (the `findMany` / `subs.length === 0` early return / web-push loop) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- pushNotificationService`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pushNotificationService.ts apps/api/src/services/pushNotificationService.test.ts
git commit -m "feat(api): fan out push notifications to Discord DMs"
```

---

## Task 4: Bot — notification contract (queue key + Zod schema)

**Files:**
- Create: `apps/discord-bot/src/notifications/notificationContract.ts`
- Test: `apps/discord-bot/src/notifications/notificationContract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/discord-bot/src/notifications/notificationContract.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DISCORD_NOTIFICATION_QUEUE, parseNotification } from './notificationContract.js';

describe('notificationContract', () => {
  it('uses the agreed queue key', () => {
    expect(DISCORD_NOTIFICATION_QUEUE).toBe('discord:notifications');
  });

  it('parses a valid message', () => {
    const raw = JSON.stringify({
      discordUserId: 'discord-99',
      type: 'pvpAttack',
      title: 'PvP Attack!',
      body: 'You are under attack',
    });

    expect(parseNotification(raw)).toEqual({
      discordUserId: 'discord-99',
      type: 'pvpAttack',
      title: 'PvP Attack!',
      body: 'You are under attack',
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parseNotification('not json')).toBeNull();
  });

  it('returns null for a message missing required fields', () => {
    expect(parseNotification(JSON.stringify({ discordUserId: 'd', title: 't' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/discord-bot -- notificationContract`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/discord-bot/src/notifications/notificationContract.ts`:

```typescript
import { z } from 'zod';

/** Redis list key shared with the API (apps/api/src/services/discordNotifier.ts). */
export const DISCORD_NOTIFICATION_QUEUE = 'discord:notifications';

const notificationSchema = z.object({
  discordUserId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

export type DiscordNotification = z.infer<typeof notificationSchema>;

/** Parses an untrusted queue payload; returns null if it is not a valid message. */
export function parseNotification(raw: string): DiscordNotification | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = notificationSchema.safeParse(json);
  return result.success ? result.data : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/discord-bot -- notificationContract`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/notifications/notificationContract.ts apps/discord-bot/src/notifications/notificationContract.test.ts
git commit -m "feat(bot): add Discord notification queue contract + parser"
```

---

## Task 5: Bot — `deliverNotification` + `createNotificationConsumer`

**Files:**
- Create: `apps/discord-bot/src/notifications/notificationConsumer.ts`
- Test: `apps/discord-bot/src/notifications/notificationConsumer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/discord-bot/src/notifications/notificationConsumer.test.ts`:

```typescript
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

    it('swallows a DM-closed error without throwing', async () => {
      const send = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));
      const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } };
      const logger = makeLogger();

      await expect(deliverNotification(NOTIFICATION, { client, logger })).resolves.toBeUndefined();
      expect(logger.debug).toHaveBeenCalled();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/discord-bot -- notificationConsumer`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/discord-bot/src/notifications/notificationConsumer.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/discord-bot -- notificationConsumer`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/notifications/notificationConsumer.ts apps/discord-bot/src/notifications/notificationConsumer.test.ts
git commit -m "feat(bot): add Discord notification consumer loop"
```

---

## Task 6: Bot — wire the consumer into `index.ts`

**Files:**
- Modify: `apps/discord-bot/src/index.ts`

> No new unit test — `index.ts` is the composition root (it has no existing unit tests; the consumer logic is covered by Task 5). Verification is via typecheck/build in Task 7.

- [ ] **Step 1: Add the import**

In `apps/discord-bot/src/index.ts`, add after the existing import block (after line 13, the `createMessageXpService` import):

```typescript
import { createNotificationConsumer, type NotificationConsumer } from './notifications/notificationConsumer.js';
```

- [ ] **Step 2: Declare the consumer + a dedicated Redis connection**

A blocking `BRPOP` monopolizes its connection, so the consumer needs its **own** Redis client — it must not share the XP/triage `redis`. Inside `main()`, after the existing `let isSupportTriageRunning = false;` line (around line 43), add:

```typescript
  const notificationRedis = redis.duplicate();
  notificationRedis.on('error', (error: unknown) => {
    logger.warn({ error }, 'Discord notification Redis connection error');
  });
  let notificationConsumer: NotificationConsumer | undefined;
  let isShuttingDown = false;
```

- [ ] **Step 3: Start the consumer on ClientReady**

Inside the `client.once(Events.ClientReady, ...)` handler, after the `void runSupportTriagePoll();` / `supportTriageInterval = setInterval(...)` block (around line 196, just before the handler's closing `});`), add:

```typescript
    notificationConsumer = createNotificationConsumer({
      redis: notificationRedis,
      client: readyClient,
      logger,
    });
    void notificationConsumer.start();
    logger.info('Discord notification consumer started');
```

- [ ] **Step 4: Stop the consumer + disconnect on shutdown**

Replace the existing synchronous `shutdown` function with this guarded async wrapper. It calls `stop()` first (which flips the consumer's `running` flag), then disconnects the dedicated Redis connection to unblock any pending `BRPOP`, then awaits the consumer loop before destroying the bot:

```typescript
  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    void (async () => {
      logger.info({ signal }, 'Shutting down Discord bot');
      if (roleSyncInterval) {
        clearInterval(roleSyncInterval);
      }
      if (supportTriageInterval) {
        clearInterval(supportTriageInterval);
      }

      const notificationStop = notificationConsumer?.stop().catch((error: unknown) => {
        logger.warn({ error }, 'Discord notification consumer failed to stop cleanly');
      });
      notificationRedis.disconnect();
      if (notificationStop) {
        await notificationStop;
      }

      redis.disconnect();
      client.destroy();
      process.exit(0);
    })();
  };
```

- [ ] **Step 5: Typecheck the bot**

Run: `npm run build:discord-bot`
Expected: PASS — no type errors and the bot package builds.

> If `readyClient` does not structurally satisfy `ClientLike`, confirm `readyClient.users.fetch` exists (discord.js `Client#users` is a `UserManager` with `fetch(id)`); the structural interface should match without a cast.

- [ ] **Step 6: Commit**

```bash
git add apps/discord-bot/src/index.ts
git commit -m "feat(bot): start Discord notification consumer on ready"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Generate Prisma client (ensures `discordAccountLink` types are current)**

Run: `npm run db:generate`
Expected: succeeds.

- [ ] **Step 2: Build shared + game-engine + database + api (downstream packages need shared built first)**

Run: `npm run build:api`
Expected: PASS — no type errors. (Per project memory, `tsc -b` alone can miss issues; the build is the source of truth here.)

- [ ] **Step 3: Build the Discord bot**

Run: `npm run build:discord-bot`
Expected: PASS — no bot type errors.

- [ ] **Step 4: Run the API test suite**

Run: `npm run test:api`
Expected: PASS, including `discordNotifier` (7) and the updated `pushNotificationService` tests.

> Requires Redis running for the API suite (start the `pocketrealm-redis` container if tests time out — per project memory).

- [ ] **Step 5: Run the bot notification tests**

Run: `npm run test -w apps/discord-bot -- notification`
Expected: PASS — `notificationContract` (4) and `notificationConsumer` (4).

- [ ] **Step 6: Inspect final git status**

```powershell
git status --short
```

Expected: only intentional implementation files are changed. Do **not** use `git add -A`; if `db:generate` unexpectedly changed tracked source, inspect those paths and stage them explicitly.

---

## Self-Review Notes

**Spec coverage:**
- Mirror push notifications via the `sendPush` chokepoint → Tasks 1–3 (covers all emitted current/future `NotificationType` values; this branch currently has no `turnBankFull` caller to add without violating the no-new-trigger constraint). ✓
- API resolves `playerId → discordUserId` via `discordAccountLink` → Task 1. ✓
- Durable Redis list queue (`LPUSH` + cap; `BRPOP`) → Task 2 (`multi` with `lpush`/`ltrim`), Task 5 (`brpop`). ✓
- Discord fan-out independent of web-push subscriptions → Task 3 (test sets `findMany` → `[]`). ✓
- Reuse existing `notify*` pref (gated by `sendPush`'s pref check) → Task 3. ✓
- Bot consumer: fetch user + DM, swallow DM-closed errors, throttle, graceful stop → Task 5. ✓
- Untrusted-queue validation (Zod) → Task 4. ✓
- Dedicated blocking Redis connection → Task 6 (`redis.duplicate()`). ✓
- Bot down → durable queue + max-length cap → Task 2 (`ltrim`). ✓

**Type consistency:** `DISCORD_NOTIFICATION_QUEUE` (`'discord:notifications'`) defined in both apps and asserted equal in Task 4. Message shape `{ discordUserId, type, title, body }` matches between API (`DiscordNotificationMessage`, with `type: NotificationType`) and bot (`notificationSchema`, with non-empty string `type` for forward-compatible parsing). DM content format `"${title}\n${body}"` consistent between Task 5 impl and tests.

**Out of scope (deferred per spec):** per-channel opt-in controls, daily digest, new personal triggers, channel posts. The `docs/Discord.txt` secret rotation is an operational follow-up, not part of this code change.
