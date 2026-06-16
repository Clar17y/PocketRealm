# Discord Notification Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API→bot notification outbox, `/notify` opt-in preferences, and a turns-capped DM sweep (issue #322, spec: `docs/superpowers/specs/2026-06-11-discord-notification-pipeline-design.md`).

**Architecture:** The API owns two new Postgres tables (preferences + outbox) and a 5-minute sweep that detects opted-in players whose turn bank hit cap (lazy regen — computed, not evented). The bot polls a pending-events endpoint every 30s, DMs users, and acks delivery — mirroring the existing support triage poll. The bot keeps zero Postgres connections (enforced by `architectureBoundaries.test.ts`).

**Tech Stack:** Express 4 + Prisma 6 + Zod (API), discord.js + ioredis (bot), Vitest with `vi.hoisted` prisma mocks (tests).

**Working directory:** `D:\Code\Adventure\.worktrees\pocketrealm-discord_notification_pipeline` — all paths below are relative to this worktree root. All commits go on the `discord-notification-pipeline` branch.

**Environment notes:**
- `npm run db:migrate` is interactive; use `npx prisma migrate dev --name <name>` from `packages/database` instead (its `.env` points at `pocketrealm_discord_notification_pipeline`).
- Shared-package changes must be rebuilt (`npm run build:packages` from repo root) before API/bot tests or typecheck can see them.
- Bot tests resolve `@pocketrealm/shared/*` subpaths from the **built** package (no vitest aliases in `apps/discord-bot/vitest.config.ts`); API tests resolve them via aliases in `apps/api/vitest.config.ts`.
- No new env vars are needed — intervals/limits are constants.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/database/prisma/migrations/<ts>_rename_support_ticket_discord_reporter_index/` | Create | Pre-existing drift fix so `migrate dev` works non-interactively |
| `packages/shared/src/discord/discordNotifications.ts` (+ test) | Create | Notification type names, payload shapes, labels shared by API + bot |
| `packages/shared/src/constants/gameConstants.ts` | Modify | `DISCORD_NOTIFICATION_CONSTANTS` tunables |
| `packages/shared/package.json`, `packages/shared/src/packageExports.test.ts`, `apps/api/vitest.config.ts` | Modify | Wire the new subpath export |
| `packages/database/prisma/schema.prisma` | Modify | `DiscordNotificationPreference` + `DiscordNotificationEvent` models |
| `apps/api/src/services/discordSchemas.ts` | Modify | Zod schemas for the four routes |
| `apps/api/src/services/discordNotificationService.ts` (+ test) | Create | Preference list/upsert, pending list, ack |
| `apps/api/src/services/discordTurnsCappedSweep.ts` (+ test) | Create | The 5-minute cap-detection sweep |
| `apps/api/src/services/turnBankService.ts` | Modify | Export the private `getTurnConfig` |
| `apps/api/src/routes/discord.ts` (+ test) | Modify | Four `/notifications/*` routes |
| `apps/api/src/index.ts` | Modify | Sweep interval timer + shutdown |
| `apps/discord-bot/src/notifications/notificationPoll.ts` (+ test) | Create | Delivery poll loop body (DM + ack) |
| `apps/discord-bot/src/interactions/notifyCommand.ts` (+ test) | Create | `/notify` command + toggle button handler |
| `apps/discord-bot/src/discord/components.ts` (+ test) | Modify | Notify toggle button id builder/parser |
| `apps/discord-bot/src/commands/definitions.ts` (+ test) | Modify | `/notify` slash command definition |
| `apps/discord-bot/src/interactions/interactionRouter.ts` (+ test) | Modify | Route `/notify` command + notify buttons |
| `apps/discord-bot/src/index.ts` | Modify | Third poll loop (30s) + shutdown |

---

### Task 1: Fix migration drift so `prisma migrate dev` works

**Why:** main has schema drift — the `support_tickets` migration created an index whose name exceeds Postgres's 63-char limit; Postgres truncated it to `support_tickets_discord_reporter_guild_id_discord_reporter_user` while Prisma expects `..._idx`. Any `prisma migrate dev` prompts interactively about it, which blocks Task 3.

**Files:**
- Create: `packages/database/prisma/migrations/<timestamp>_rename_support_ticket_discord_reporter_index/migration.sql` (generated)

- [ ] **Step 1: Generate the drift-only migration**

Run from `packages/database`:
```powershell
npx prisma migrate dev --create-only --name rename_support_ticket_discord_reporter_index
```
Expected: a new migration folder containing exactly:
```sql
-- RenameIndex
ALTER INDEX "support_tickets_discord_reporter_guild_id_discord_reporter_user" RENAME TO "support_tickets_discord_reporter_guild_id_discord_reporter__idx";
```
If the generated SQL contains anything else, STOP and investigate — the diff should only be this rename.

- [ ] **Step 2: Apply it and verify migrate dev is clean**

Run from `packages/database`:
```powershell
npx prisma migrate dev
```
Expected: applies the rename migration, then reports the database is already in sync (no interactive prompt).

- [ ] **Step 3: Commit**

```powershell
git add prisma/migrations
git commit -m "fix: rename support_tickets discord reporter index truncated by Postgres"
```

---

### Task 2: Shared notification types + constants

**Files:**
- Create: `packages/shared/src/discord/discordNotifications.ts`
- Create: `packages/shared/src/discord/discordNotifications.test.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts` (append after `DISCORD_DUEL_CONSTANTS`, ~line 1765)
- Modify: `packages/shared/package.json` (exports map)
- Modify: `packages/shared/src/packageExports.test.ts`
- Modify: `apps/api/vitest.config.ts` (alias list)

- [ ] **Step 1: Write the failing test**

`packages/shared/src/discord/discordNotifications.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import {
  DISCORD_NOTIFICATION_TYPES,
  DISCORD_NOTIFICATION_TYPE_LABELS,
  isDiscordNotificationType,
} from './discordNotifications';

describe('discordNotifications', () => {
  it('exposes turns_capped as a known type', () => {
    expect(DISCORD_NOTIFICATION_TYPES).toContain('turns_capped');
  });

  it('has a label for every type', () => {
    for (const type of DISCORD_NOTIFICATION_TYPES) {
      expect(DISCORD_NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it('narrows arbitrary strings to notification types', () => {
    expect(isDiscordNotificationType('turns_capped')).toBe(true);
    expect(isDiscordNotificationType('boss_spawned')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/shared`: `npx vitest run src/discord/discordNotifications.test.ts`
Expected: FAIL — cannot resolve `./discordNotifications`.

- [ ] **Step 3: Write the module**

`packages/shared/src/discord/discordNotifications.ts`:
```typescript
export const DISCORD_NOTIFICATION_TYPES = ['turns_capped'] as const;

export type DiscordNotificationType = (typeof DISCORD_NOTIFICATION_TYPES)[number];

export function isDiscordNotificationType(value: string): value is DiscordNotificationType {
  return (DISCORD_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Button labels and /notify display names, keyed by type. */
export const DISCORD_NOTIFICATION_TYPE_LABELS: Record<DiscordNotificationType, string> = {
  turns_capped: 'Turns capped',
};

export interface DiscordTurnsCappedPayload {
  currentTurns: number;
  bankCap: number;
  username: string;
}

/** Shape served by GET /api/v1/discord/notifications/pending. */
export interface DiscordNotificationEventView {
  id: string;
  discordGuildId: string;
  discordUserId: string | null;
  type: DiscordNotificationType;
  payload: DiscordTurnsCappedPayload;
  createdAt: string;
}

/** Shape served by GET/POST /api/v1/discord/notifications/preferences. */
export interface DiscordNotificationPreferenceView {
  type: DiscordNotificationType;
  enabled: boolean;
}
```

- [ ] **Step 4: Add constants to gameConstants.ts**

Append to `packages/shared/src/constants/gameConstants.ts` directly after the `DISCORD_DUEL_CONSTANTS` block:
```typescript
export const DISCORD_NOTIFICATION_CONSTANTS = {
  /** ms between API-side turns-capped sweep runs */
  SWEEP_INTERVAL_MS: 5 * 60 * 1000,
  /** ms between bot delivery poll runs */
  POLL_INTERVAL_MS: 30_000,
  /** Delivery attempts before an outbox event is marked failed */
  MAX_DELIVERY_ATTEMPTS: 5,
  /** Max events served per pending poll */
  PENDING_BATCH_LIMIT: 50,
  /** Seconds a bot-side delivery suppression key persists */
  SUPPRESSION_TTL_SECONDS: 60 * 60,
  /** Days delivered outbox events are retained before the sweep prunes them */
  DELIVERED_RETENTION_DAYS: 30,
} as const;
```

- [ ] **Step 5: Wire the subpath export**

In `packages/shared/package.json` `exports`, add alongside the existing `./discord/discordXp` entry:
```json
"./discord/discordNotifications": {
  "types": "./dist/discord/discordNotifications.d.ts",
  "default": "./dist/discord/discordNotifications.js"
},
```

In `packages/shared/src/packageExports.test.ts`, find how existing subpaths (e.g. `discord/discordXp`) are asserted and add `discord/discordNotifications` to the same list/loop.

In `apps/api/vitest.config.ts`, add alongside the existing discord aliases:
```typescript
'@pocketrealm/shared/discord/discordNotifications': resolve(__dirname, '../../packages/shared/src/discord/discordNotifications.ts'),
```

- [ ] **Step 6: Run tests and build**

Run from `packages/shared`: `npx vitest run src/discord/discordNotifications.test.ts src/packageExports.test.ts`
Expected: PASS.
Run from repo root: `npm run build:packages`
Expected: clean build (downstream apps can now resolve the new subpath).

- [ ] **Step 7: Commit**

```powershell
git add packages/shared apps/api/vitest.config.ts
git commit -m "feat: add shared Discord notification types and constants"
```

---

### Task 3: Prisma models + migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (insert after the `DiscordBotAuditEvent` model, ~line 1570)
- Create: `packages/database/prisma/migrations/<timestamp>_add_discord_notifications/migration.sql` (generated)

- [ ] **Step 1: Add the models**

Insert into `packages/database/prisma/schema.prisma` after `DiscordBotAuditEvent`:
```prisma
model DiscordNotificationPreference {
  id             String    @id @default(uuid())
  discordUserId  String    @map("discord_user_id") @db.VarChar(32)
  discordGuildId String    @map("discord_guild_id") @db.VarChar(32)
  type           String    @db.VarChar(32)
  enabled        Boolean   @default(false)
  armed          Boolean   @default(true)
  lastFiredAt    DateTime? @map("last_fired_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@unique([discordGuildId, discordUserId, type])
  @@index([type, enabled])
  @@map("discord_notification_preferences")
}

model DiscordNotificationEvent {
  id             String    @id @default(uuid())
  discordGuildId String    @map("discord_guild_id") @db.VarChar(32)
  discordUserId  String?   @map("discord_user_id") @db.VarChar(32)
  type           String    @db.VarChar(32)
  payload        Json
  dedupKey       String?   @unique @map("dedup_key") @db.VarChar(128)
  attempts       Int       @default(0)
  createdAt      DateTime  @default(now()) @map("created_at")
  deliveredAt    DateTime? @map("delivered_at")
  failedAt       DateTime? @map("failed_at")

  @@index([deliveredAt, createdAt])
  @@map("discord_notification_events")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run from `packages/database`:
```powershell
npx prisma migrate dev --name add_discord_notifications
```
Expected: creates the two tables; no drift prompts (Task 1 fixed that). Prisma client regenerates automatically.

- [ ] **Step 3: Rebuild packages so the new client types are visible**

Run from repo root: `npm run build:packages`
Expected: clean build.

- [ ] **Step 4: Commit**

```powershell
git add packages/database/prisma
git commit -m "feat: add Discord notification preference and outbox event tables"
```

---

### Task 4: Notification service — preferences, pending, ack

**Files:**
- Modify: `apps/api/src/services/discordSchemas.ts`
- Create: `apps/api/src/services/discordNotificationService.ts`
- Create: `apps/api/src/services/discordNotificationService.test.ts`

- [ ] **Step 1: Add Zod schemas**

Append to `apps/api/src/services/discordSchemas.ts`:
```typescript
import { DISCORD_NOTIFICATION_TYPES } from '@pocketrealm/shared/discord/discordNotifications';
```
(merge with the existing imports at the top of the file), then at the bottom:
```typescript
export const discordNotificationPreferencesQuerySchema = z.object({
  guildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
}).strict();

export const discordNotificationPreferenceUpsertSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
  type: z.enum(DISCORD_NOTIFICATION_TYPES),
  enabled: z.boolean(),
}).strict();

export const discordNotificationPendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

export const discordNotificationAckSchema = z.object({
  deliveredIds: z.array(z.string().uuid()).max(100),
  failedIds: z.array(z.string().uuid()).max(100),
}).strict();
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/services/discordNotificationService.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run from `apps/api`: `npx vitest run src/services/discordNotificationService.test.ts`
Expected: FAIL — module `./discordNotificationService` not found.

- [ ] **Step 4: Write the service**

`apps/api/src/services/discordNotificationService.ts`:
```typescript
import { prisma } from '@pocketrealm/database';
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import {
  DISCORD_NOTIFICATION_TYPES,
  type DiscordNotificationEventView,
  type DiscordNotificationPreferenceView,
  type DiscordNotificationType,
  type DiscordTurnsCappedPayload,
} from '@pocketrealm/shared/discord/discordNotifications';
import {
  DISCORD_LINK_REQUIRED_ERROR,
  findLinkedDiscordPlayer,
} from './discordLinkedPlayer';

export interface DiscordNotificationPreferenceLookup {
  guildId: string;
  discordUserId: string;
}

export interface DiscordNotificationPreferenceUpsert {
  discordGuildId: string;
  discordUserId: string;
  type: DiscordNotificationType;
  enabled: boolean;
}

export interface DiscordNotificationAck {
  deliveredIds: string[];
  failedIds: string[];
}

export async function listDiscordNotificationPreferences(
  input: DiscordNotificationPreferenceLookup,
): Promise<DiscordNotificationPreferenceView[]> {
  await findLinkedDiscordPlayer(input, { linkRequired: DISCORD_LINK_REQUIRED_ERROR });

  const stored = await prisma.discordNotificationPreference.findMany({
    where: {
      discordGuildId: input.guildId,
      discordUserId: input.discordUserId,
    },
    select: { type: true, enabled: true },
  });

  return DISCORD_NOTIFICATION_TYPES.map((type) => ({
    type,
    enabled: stored.find((preference) => preference.type === type)?.enabled ?? false,
  }));
}

export async function upsertDiscordNotificationPreference(
  input: DiscordNotificationPreferenceUpsert,
): Promise<DiscordNotificationPreferenceView> {
  await findLinkedDiscordPlayer(
    { guildId: input.discordGuildId, discordUserId: input.discordUserId },
    { linkRequired: DISCORD_LINK_REQUIRED_ERROR },
  );

  const preference = await prisma.discordNotificationPreference.upsert({
    where: {
      discordGuildId_discordUserId_type: {
        discordGuildId: input.discordGuildId,
        discordUserId: input.discordUserId,
        type: input.type,
      },
    },
    create: {
      discordGuildId: input.discordGuildId,
      discordUserId: input.discordUserId,
      type: input.type,
      enabled: input.enabled,
    },
    update: { enabled: input.enabled },
  });

  return {
    type: preference.type as DiscordNotificationType,
    enabled: preference.enabled,
  };
}

export async function listPendingDiscordNotificationEvents(
  limit: number = DISCORD_NOTIFICATION_CONSTANTS.PENDING_BATCH_LIMIT,
): Promise<DiscordNotificationEventView[]> {
  const events = await prisma.discordNotificationEvent.findMany({
    where: { deliveredAt: null, failedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      discordGuildId: true,
      discordUserId: true,
      type: true,
      payload: true,
      createdAt: true,
    },
  });

  return events.map((event) => ({
    id: event.id,
    discordGuildId: event.discordGuildId,
    discordUserId: event.discordUserId,
    type: event.type as DiscordNotificationType,
    payload: event.payload as unknown as DiscordTurnsCappedPayload,
    createdAt: event.createdAt.toISOString(),
  }));
}

export async function ackDiscordNotificationEvents(
  input: DiscordNotificationAck,
  now: Date = new Date(),
): Promise<{ delivered: number; failed: number }> {
  let delivered = 0;
  let failed = 0;

  if (input.deliveredIds.length > 0) {
    const result = await prisma.discordNotificationEvent.updateMany({
      where: { id: { in: input.deliveredIds }, deliveredAt: null },
      data: { deliveredAt: now },
    });
    delivered = result.count;
  }

  if (input.failedIds.length > 0) {
    const result = await prisma.discordNotificationEvent.updateMany({
      where: { id: { in: input.failedIds }, deliveredAt: null, failedAt: null },
      data: { attempts: { increment: 1 } },
    });
    failed = result.count;

    await prisma.discordNotificationEvent.updateMany({
      where: {
        id: { in: input.failedIds },
        attempts: { gte: DISCORD_NOTIFICATION_CONSTANTS.MAX_DELIVERY_ATTEMPTS },
        failedAt: null,
      },
      data: { failedAt: now },
    });
  }

  return { delivered, failed };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run from `apps/api`: `npx vitest run src/services/discordNotificationService.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/services/discordNotificationService.ts apps/api/src/services/discordNotificationService.test.ts apps/api/src/services/discordSchemas.ts
git commit -m "feat: add Discord notification preference and outbox service"
```

---

### Task 5: Turns-capped sweep

**Files:**
- Modify: `apps/api/src/services/turnBankService.ts:74` (export `getTurnConfig`)
- Create: `apps/api/src/services/discordTurnsCappedSweep.ts`
- Create: `apps/api/src/services/discordTurnsCappedSweep.test.ts`

- [ ] **Step 1: Export getTurnConfig**

In `apps/api/src/services/turnBankService.ts`, change line 74 from:
```typescript
async function getTurnConfig(
```
to:
```typescript
export async function getTurnConfig(
```
Also export its `TurnConfig` interface (line 69): `export interface TurnConfig {`.

- [ ] **Step 2: Write the failing sweep test**

`apps/api/src/services/discordTurnsCappedSweep.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TURN_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordNotificationPreference: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    discordNotificationEvent: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    discordAccountLink: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getTurnConfig: vi.fn(),
}));

vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('./turnBankService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./turnBankService')>()),
  getTurnConfig: mocks.getTurnConfig,
}));

import { runDiscordTurnsCappedSweep } from './discordTurnsCappedSweep';

const NOW = new Date('2026-06-12T12:00:00.000Z');
const GUILD_ID = '23456789012345678';
const USER_ID = '34567890123456789';
const CAP = TURN_CONSTANTS.BANK_CAP;

function preference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pref-1',
    discordGuildId: GUILD_ID,
    discordUserId: USER_ID,
    type: 'turns_capped',
    enabled: true,
    armed: true,
    lastFiredAt: null,
    ...overrides,
  };
}

function linkWithTurnBank(overrides: Record<string, unknown> = {}) {
  return {
    account: {
      activePlayer: {
        id: 'player-1',
        username: 'Mira',
        turnBank: {
          currentTurns: CAP,
          lastRegenAt: new Date('2026-06-12T00:00:00.000Z'),
          regenProgress: 0,
          ...overrides,
        },
      },
    },
  };
}

describe('runDiscordTurnsCappedSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
    mocks.getTurnConfig.mockResolvedValue({ regenRate: TURN_CONSTANTS.REGEN_RATE, bankCap: CAP });
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(linkWithTurnBank());
    mocks.prisma.discordNotificationEvent.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.discordNotificationEvent.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.discordNotificationPreference.update.mockResolvedValue(preference());
  });

  it('fires and disarms when an armed player is at cap', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 1, rearmed: 0, skipped: 0 });
    expect(mocks.prisma.discordNotificationEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        discordGuildId: GUILD_ID,
        discordUserId: USER_ID,
        type: 'turns_capped',
        dedupKey: `turns_capped:player-1:${new Date('2026-06-12T00:00:00.000Z').getTime()}`,
        payload: { currentTurns: CAP, bankCap: CAP, username: 'Mira' },
      })],
      skipDuplicates: true,
    });
    expect(mocks.prisma.discordNotificationPreference.update).toHaveBeenCalledWith({
      where: { id: 'pref-1' },
      data: { armed: false, lastFiredAt: NOW },
    });
  });

  it('does not refire while disarmed at cap', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference({ armed: false })]);

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 0, skipped: 0 });
    expect(mocks.prisma.discordNotificationEvent.createMany).not.toHaveBeenCalled();
  });

  it('re-arms when a disarmed player drops below cap', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference({ armed: false })]);
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(
      linkWithTurnBank({ currentTurns: 10, lastRegenAt: NOW }),
    );

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 1, skipped: 0 });
    expect(mocks.prisma.discordNotificationPreference.update).toHaveBeenCalledWith({
      where: { id: 'pref-1' },
      data: { armed: true },
    });
  });

  it('does not fire below cap when armed', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(
      linkWithTurnBank({ currentTurns: 10, lastRegenAt: NOW }),
    );

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 0, skipped: 0 });
    expect(mocks.prisma.discordNotificationEvent.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.discordNotificationPreference.update).not.toHaveBeenCalled();
  });

  it('uses the premium cap from getTurnConfig', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);
    mocks.getTurnConfig.mockResolvedValue({ regenRate: TURN_CONSTANTS.REGEN_RATE, bankCap: CAP * 2 });
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(
      linkWithTurnBank({ currentTurns: CAP, lastRegenAt: NOW }),
    );

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary.fired).toBe(0);
  });

  it('skips unlinked users and accounts without an active player or turn bank', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([preference()]);
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(null);

    const summary = await runDiscordTurnsCappedSweep(NOW);

    expect(summary).toEqual({ checked: 1, fired: 0, rearmed: 0, skipped: 1 });
  });

  it('prunes delivered events older than the retention window', async () => {
    mocks.prisma.discordNotificationPreference.findMany.mockResolvedValue([]);

    await runDiscordTurnsCappedSweep(NOW);

    expect(mocks.prisma.discordNotificationEvent.deleteMany).toHaveBeenCalledWith({
      where: { deliveredAt: { lt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run from `apps/api`: `npx vitest run src/services/discordTurnsCappedSweep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the sweep**

`apps/api/src/services/discordTurnsCappedSweep.ts`:
```typescript
import { prisma } from '@pocketrealm/database';
import { calculateCurrentTurns } from '@pocketrealm/game-engine';
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type { DiscordTurnsCappedPayload } from '@pocketrealm/shared/discord/discordNotifications';
import { getTurnConfig } from './turnBankService';

export interface DiscordTurnsCappedSweepSummary {
  checked: number;
  fired: number;
  rearmed: number;
  skipped: number;
}

/**
 * Detects opted-in linked players whose turn bank reached cap and writes
 * one outbox event per cap episode. Turn regen is lazy, so cap state is
 * computed here rather than evented from spend paths.
 *
 * State machine per preference row:
 *   at cap AND armed      -> insert outbox event, disarm
 *   below cap AND !armed  -> re-arm
 */
export async function runDiscordTurnsCappedSweep(
  now: Date = new Date(),
): Promise<DiscordTurnsCappedSweepSummary> {
  await prisma.discordNotificationEvent.deleteMany({
    where: {
      deliveredAt: {
        lt: new Date(now.getTime() - DISCORD_NOTIFICATION_CONSTANTS.DELIVERED_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      },
    },
  });

  const preferences = await prisma.discordNotificationPreference.findMany({
    where: { type: 'turns_capped', enabled: true },
  });

  const summary: DiscordTurnsCappedSweepSummary = {
    checked: preferences.length,
    fired: 0,
    rearmed: 0,
    skipped: 0,
  };

  for (const preference of preferences) {
    const link = await prisma.discordAccountLink.findFirst({
      where: {
        discordGuildId: preference.discordGuildId,
        discordUserId: preference.discordUserId,
        unlinkedAt: null,
      },
      orderBy: { linkedAt: 'desc' },
      select: {
        account: {
          select: {
            activePlayer: {
              select: {
                id: true,
                username: true,
                turnBank: {
                  select: {
                    currentTurns: true,
                    lastRegenAt: true,
                    regenProgress: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const player = link?.account.activePlayer;
    if (!player?.turnBank) {
      summary.skipped += 1;
      continue;
    }

    const turnConfig = await getTurnConfig(prisma, player.id, now);
    const currentTurns = calculateCurrentTurns(
      player.turnBank.currentTurns,
      player.turnBank.lastRegenAt,
      now,
      turnConfig.regenRate,
      turnConfig.bankCap,
      player.turnBank.regenProgress,
    );
    const atCap = currentTurns >= turnConfig.bankCap;

    if (atCap && preference.armed) {
      const payload: DiscordTurnsCappedPayload = {
        currentTurns,
        bankCap: turnConfig.bankCap,
        username: player.username,
      };

      // skipDuplicates keeps the disarm committing even when another API
      // instance already inserted this cap episode's event.
      await prisma.$transaction([
        prisma.discordNotificationEvent.createMany({
          data: [{
            discordGuildId: preference.discordGuildId,
            discordUserId: preference.discordUserId,
            type: 'turns_capped',
            payload,
            dedupKey: `turns_capped:${player.id}:${player.turnBank.lastRegenAt.getTime()}`,
          }],
          skipDuplicates: true,
        }),
        prisma.discordNotificationPreference.update({
          where: { id: preference.id },
          data: { armed: false, lastFiredAt: now },
        }),
      ]);
      summary.fired += 1;
    } else if (!atCap && !preference.armed) {
      await prisma.discordNotificationPreference.update({
        where: { id: preference.id },
        data: { armed: true },
      });
      summary.rearmed += 1;
    }
  }

  return summary;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/services/discordTurnsCappedSweep.test.ts src/services/turnBankService.test.ts`
Expected: PASS (turnBankService tests still pass after the export change).

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/services/discordTurnsCappedSweep.ts apps/api/src/services/discordTurnsCappedSweep.test.ts apps/api/src/services/turnBankService.ts
git commit -m "feat: add Discord turns-capped notification sweep"
```

---

### Task 6: API routes

**Files:**
- Modify: `apps/api/src/routes/discord.ts`
- Modify: `apps/api/src/routes/discord.test.ts`

- [ ] **Step 1: Write the failing route tests**

In `apps/api/src/routes/discord.test.ts`:

Add to the `mocks` object in `vi.hoisted`:
```typescript
  listDiscordNotificationPreferences: vi.fn(),
  upsertDiscordNotificationPreference: vi.fn(),
  listPendingDiscordNotificationEvents: vi.fn(),
  ackDiscordNotificationEvents: vi.fn(),
```

Add the module mock alongside the other service mocks:
```typescript
vi.mock('../services/discordNotificationService', () => ({
  listDiscordNotificationPreferences: mocks.listDiscordNotificationPreferences,
  upsertDiscordNotificationPreference: mocks.upsertDiscordNotificationPreference,
  listPendingDiscordNotificationEvents: mocks.listPendingDiscordNotificationEvents,
  ackDiscordNotificationEvents: mocks.ackDiscordNotificationEvents,
}));
```

Add a describe block following the file's existing supertest style (same app setup and `x-pocketrealm-bot-key: bot-key` header the other internal-route tests use):
```typescript
describe('notification routes', () => {
  it('GET /notifications/preferences returns toggles', async () => {
    mocks.listDiscordNotificationPreferences.mockResolvedValue([{ type: 'turns_capped', enabled: true }]);

    const response = await request(app)
      .get('/api/v1/discord/notifications/preferences')
      .query({ guildId: '23456789012345678', discordUserId: '34567890123456789' })
      .set('x-pocketrealm-bot-key', 'bot-key');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preferences: [{ type: 'turns_capped', enabled: true }] });
  });

  it('POST /notifications/preferences upserts a toggle', async () => {
    mocks.upsertDiscordNotificationPreference.mockResolvedValue({ type: 'turns_capped', enabled: true });

    const response = await request(app)
      .post('/api/v1/discord/notifications/preferences')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: '23456789012345678',
        discordUserId: '34567890123456789',
        type: 'turns_capped',
        enabled: true,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ preference: { type: 'turns_capped', enabled: true } });
  });

  it('POST /notifications/preferences rejects unknown types', async () => {
    const response = await request(app)
      .post('/api/v1/discord/notifications/preferences')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: '23456789012345678',
        discordUserId: '34567890123456789',
        type: 'boss_spawned',
        enabled: true,
      });

    expect(response.status).toBe(400);
  });

  it('GET /notifications/pending returns events', async () => {
    mocks.listPendingDiscordNotificationEvents.mockResolvedValue([{ id: 'event-1' }]);

    const response = await request(app)
      .get('/api/v1/discord/notifications/pending')
      .query({ limit: 10 })
      .set('x-pocketrealm-bot-key', 'bot-key');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ events: [{ id: 'event-1' }] });
    expect(mocks.listPendingDiscordNotificationEvents).toHaveBeenCalledWith(10);
  });

  it('POST /notifications/ack acknowledges batches', async () => {
    mocks.ackDiscordNotificationEvents.mockResolvedValue({ delivered: 1, failed: 0 });

    const response = await request(app)
      .post('/api/v1/discord/notifications/ack')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ deliveredIds: ['1f8e9b3c-0000-4000-8000-000000000001'], failedIds: [] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: { delivered: 1, failed: 0 } });
  });

  it('rejects requests without the bot key', async () => {
    const response = await request(app).get('/api/v1/discord/notifications/pending');

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `apps/api`: `npx vitest run src/routes/discord.test.ts`
Expected: new tests FAIL (404s); existing tests still pass.

- [ ] **Step 3: Add the routes**

In `apps/api/src/routes/discord.ts`, add imports:
```typescript
import {
  ackDiscordNotificationEvents,
  listDiscordNotificationPreferences,
  listPendingDiscordNotificationEvents,
  upsertDiscordNotificationPreference,
} from '../services/discordNotificationService';
```
and extend the `discordSchemas` import with:
```typescript
  discordNotificationAckSchema,
  discordNotificationPendingQuerySchema,
  discordNotificationPreferencesQuerySchema,
  discordNotificationPreferenceUpsertSchema,
```

Append the routes at the end of the file:
```typescript
discordRouter.get('/notifications/preferences', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordNotificationPreferencesQuerySchema.parse(req.query);
  const preferences = await listDiscordNotificationPreferences(query);

  res.json({ preferences });
}));

discordRouter.post('/notifications/preferences', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordNotificationPreferenceUpsertSchema.parse(req.body);
  const preference = await upsertDiscordNotificationPreference(input);

  res.json({ preference });
}));

discordRouter.get('/notifications/pending', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordNotificationPendingQuerySchema.parse(req.query);
  const events = await listPendingDiscordNotificationEvents(query.limit);

  res.json({ events });
}));

discordRouter.post('/notifications/ack', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordNotificationAckSchema.parse(req.body);
  const result = await ackDiscordNotificationEvents(input);

  res.json({ result });
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx vitest run src/routes/discord.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/routes/discord.ts apps/api/src/routes/discord.test.ts
git commit -m "feat: add Discord notification API routes"
```

---

### Task 7: Wire the sweep into API startup

**Files:**
- Modify: `apps/api/src/index.ts`

No unit test — this file has none (startup wiring); verified by typecheck and the manual launch check in Task 11.

- [ ] **Step 1: Add the interval**

In `apps/api/src/index.ts`:

Imports (after the `weeklyLeaderboardSchedule` import):
```typescript
import { runDiscordTurnsCappedSweep } from './services/discordTurnsCappedSweep';
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
```

Timer declaration (after `weeklyLeaderboardTimer`, line 33):
```typescript
let discordTurnsCappedSweepTimer: ReturnType<typeof setInterval> | null = null;
```

Runner (after `runPremiumReconciliation`, line 43):
```typescript
async function runDiscordNotificationSweep(): Promise<void> {
  try {
    const summary = await runDiscordTurnsCappedSweep();
    if (summary.fired > 0 || summary.rearmed > 0) {
      logger.info({ summary }, 'Discord turns-capped sweep completed');
    }
  } catch (err) {
    logger.error({ err }, 'Discord turns-capped sweep failed');
  }
}
```

Start it inside `server.listen` (after `scheduleWeeklyLeaderboardJob();`, line 74):
```typescript
    void runDiscordNotificationSweep();
    discordTurnsCappedSweepTimer = setInterval(() => {
      void runDiscordNotificationSweep();
    }, DISCORD_NOTIFICATION_CONSTANTS.SWEEP_INTERVAL_MS);
```

Clear it in the SIGTERM handler (next to the other clearInterval calls, line 91):
```typescript
  if (discordTurnsCappedSweepTimer) clearInterval(discordTurnsCappedSweepTimer);
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```powershell
git add apps/api/src/index.ts
git commit -m "feat: run Discord turns-capped sweep on an interval"
```

---

### Task 8: Bot delivery poll

**Files:**
- Create: `apps/discord-bot/src/notifications/notificationPoll.ts`
- Create: `apps/discord-bot/src/notifications/notificationPoll.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/discord-bot/src/notifications/notificationPoll.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatNotificationMessage, pollDiscordNotifications } from './notificationPoll.js';

const EVENT = {
  id: 'event-1',
  discordGuildId: '23456789012345678',
  discordUserId: '34567890123456789',
  type: 'turns_capped' as const,
  payload: { currentTurns: 64800, bankCap: 64800, username: 'Mira' },
  createdAt: '2026-06-12T12:00:00.000Z',
};

function createOptions(overrides: Record<string, unknown> = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  const options = {
    api: {
      get: vi.fn().mockResolvedValue({ events: [EVENT] }),
      post: vi.fn().mockResolvedValue({ result: { delivered: 1, failed: 0 } }),
    },
    logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    readyClient: {
      users: {
        fetch: vi.fn().mockResolvedValue({ send }),
      },
    },
    redis: {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    },
    ...overrides,
  };
  return { options, send };
}

describe('pollDiscordNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DMs pending events and acks them as delivered', async () => {
    const { options, send } = createOptions();

    await pollDiscordNotifications(options);

    expect(options.api.get).toHaveBeenCalledWith('/api/v1/discord/notifications/pending?limit=50');
    expect(options.readyClient.users.fetch).toHaveBeenCalledWith(EVENT.discordUserId);
    expect(send).toHaveBeenCalledWith({ content: formatNotificationMessage(EVENT) });
    expect(options.api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/ack', {
      deliveredIds: [EVENT.id],
      failedIds: [],
    });
  });

  it('acks failed DMs and releases the suppression key for retry', async () => {
    const { options } = createOptions();
    options.readyClient.users.fetch = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));

    await pollDiscordNotifications(options);

    expect(options.api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/ack', {
      deliveredIds: [],
      failedIds: [EVENT.id],
    });
    expect(options.redis.del).toHaveBeenCalledWith('discord:notifications:delivery:event-1');
  });

  it('skips events whose suppression key is already claimed', async () => {
    const { options, send } = createOptions();
    options.redis.set = vi.fn().mockResolvedValue(null);

    await pollDiscordNotifications(options);

    expect(send).not.toHaveBeenCalled();
    expect(options.api.post).not.toHaveBeenCalled();
  });

  it('skips events without a DM target', async () => {
    const { options, send } = createOptions();
    options.api.get = vi.fn().mockResolvedValue({ events: [{ ...EVENT, discordUserId: null }] });

    await pollDiscordNotifications(options);

    expect(send).not.toHaveBeenCalled();
    expect(options.api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/ack', {
      deliveredIds: [],
      failedIds: [EVENT.id],
    });
  });

  it('does not ack when nothing was processed', async () => {
    const { options } = createOptions();
    options.api.get = vi.fn().mockResolvedValue({ events: [] });

    await pollDiscordNotifications(options);

    expect(options.api.post).not.toHaveBeenCalled();
  });
});

describe('formatNotificationMessage', () => {
  it('formats turns-capped events', () => {
    const content = formatNotificationMessage(EVENT);

    expect(content).toContain('64,800');
    expect(content.toLowerCase()).toContain('turns are full');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/discord-bot`: `npx vitest run src/notifications/notificationPoll.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the poll module**

`apps/discord-bot/src/notifications/notificationPoll.ts` (DI-interface style mirroring `triagePoll.ts`):
```typescript
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type { DiscordNotificationEventView } from '@pocketrealm/shared/discord/discordNotifications';

interface NotificationApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

interface DmCapableUser {
  send(payload: unknown): Promise<unknown>;
}

interface ReadyClientLike {
  users: {
    fetch(userId: string): Promise<DmCapableUser>;
  };
}

interface LoggerLike {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

interface DeliverySuppressionStore {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
    setMode: 'NX',
  ): Promise<'OK' | string | null>;
  del(key: string): Promise<unknown>;
}

export interface DiscordNotificationPollOptions {
  api: NotificationApi;
  logger: LoggerLike;
  readyClient: ReadyClientLike;
  redis?: DeliverySuppressionStore;
}

interface PendingNotificationsResponse {
  events: DiscordNotificationEventView[];
}

export function formatNotificationMessage(event: DiscordNotificationEventView): string {
  const turns = event.payload.currentTurns.toLocaleString('en-US');
  const cap = event.payload.bankCap.toLocaleString('en-US');

  return `⚡ ${event.payload.username}, your turns are full (${turns}/${cap})! Regen is going to waste — time for an adventure.`;
}

export async function pollDiscordNotifications(options: DiscordNotificationPollOptions): Promise<void> {
  const { events } = await options.api.get<PendingNotificationsResponse>(
    `/api/v1/discord/notifications/pending?limit=${DISCORD_NOTIFICATION_CONSTANTS.PENDING_BATCH_LIMIT}`,
  );

  const deliveredIds: string[] = [];
  const failedIds: string[] = [];

  for (const event of events) {
    if (!event.discordUserId) {
      // Channel-targeted events arrive with later notification types; until
      // then a DM-less event can never deliver, so fail it toward the
      // attempts cap instead of serving it forever.
      failedIds.push(event.id);
      continue;
    }

    const suppressionKey = deliverySuppressionKey(event.id);
    if (!await claimDelivery(options, suppressionKey, event.id)) {
      continue;
    }

    try {
      const user = await options.readyClient.users.fetch(event.discordUserId);
      await user.send({ content: formatNotificationMessage(event) });
      deliveredIds.push(event.id);
    } catch (error) {
      failedIds.push(event.id);
      await releaseDelivery(options, suppressionKey, event.id);
      options.logger.warn(
        { error, eventId: event.id, discordUserId: event.discordUserId },
        'Failed to deliver Discord notification DM',
      );
    }
  }

  if (deliveredIds.length === 0 && failedIds.length === 0) {
    return;
  }

  await options.api.post('/api/v1/discord/notifications/ack', { deliveredIds, failedIds });
}

function deliverySuppressionKey(eventId: string): string {
  return `discord:notifications:delivery:${eventId}`;
}

async function claimDelivery(
  options: DiscordNotificationPollOptions,
  key: string,
  eventId: string,
): Promise<boolean> {
  if (!options.redis) return true;

  try {
    const claimed = await options.redis.set(
      key,
      '1',
      'EX',
      DISCORD_NOTIFICATION_CONSTANTS.SUPPRESSION_TTL_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return true;

    options.logger.debug(
      { eventId },
      'Discord notification delivery skipped because a previous attempt is still suppressed',
    );
    return false;
  } catch (error) {
    options.logger.warn({ error, eventId }, 'Discord notification suppression check failed');
    return true;
  }
}

async function releaseDelivery(
  options: DiscordNotificationPollOptions,
  key: string,
  eventId: string,
): Promise<void> {
  if (!options.redis) return;

  try {
    await options.redis.del(key);
  } catch (error) {
    options.logger.warn({ error, eventId }, 'Discord notification suppression release failed');
  }
}
```

Note: if the final `ack` POST throws, the loop's caller (bot index) logs and retries next tick. Delivered events keep their suppression keys, so the worst case after the key's 1-hour TTL is one duplicate DM — the documented trade-off.

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/discord-bot`: `npx vitest run src/notifications/notificationPoll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/discord-bot/src/notifications
git commit -m "feat: add Discord notification delivery poll"
```

---

### Task 9: `/notify` command, buttons, and registration

**Files:**
- Modify: `apps/discord-bot/src/discord/components.ts` (+ `components.test.ts`)
- Modify: `apps/discord-bot/src/commands/definitions.ts` (+ `definitions.test.ts`)
- Create: `apps/discord-bot/src/interactions/notifyCommand.ts`
- Create: `apps/discord-bot/src/interactions/notifyCommand.test.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts` (+ `interactionRouter.test.ts`)

- [ ] **Step 1: Write the failing button-id tests**

Append to `apps/discord-bot/src/discord/components.test.ts` (match the file's existing describe style):
```typescript
describe('notify buttons', () => {
  it('round-trips a toggle button id', () => {
    const id = notifyToggleButtonId('turns_capped', true);

    expect(parseNotifyButtonId(id)).toEqual({ type: 'turns_capped', nextEnabled: true });
  });

  it('round-trips a disable toggle', () => {
    expect(parseNotifyButtonId(notifyToggleButtonId('turns_capped', false)))
      .toEqual({ type: 'turns_capped', nextEnabled: false });
  });

  it('rejects foreign ids and unknown types', () => {
    expect(parseNotifyButtonId('duel:accept:abc:123')).toBeNull();
    expect(parseNotifyButtonId('notify:toggle:boss_spawned:1')).toBeNull();
    expect(parseNotifyButtonId('notify:toggle:turns_capped')).toBeNull();
  });
});
```
Add the import at the top of the test file: `notifyToggleButtonId, parseNotifyButtonId` from `'./components.js'`.

- [ ] **Step 2: Run to verify failure, then implement**

Run from `apps/discord-bot`: `npx vitest run src/discord/components.test.ts` — expected FAIL.

Append to `apps/discord-bot/src/discord/components.ts`:
```typescript
import {
  isDiscordNotificationType,
  type DiscordNotificationType,
} from '@pocketrealm/shared/discord/discordNotifications';

export interface ParsedNotifyButtonId {
  type: DiscordNotificationType;
  nextEnabled: boolean;
}

export function notifyToggleButtonId(type: DiscordNotificationType, nextEnabled: boolean): string {
  return `notify:toggle:${type}:${nextEnabled ? '1' : '0'}`;
}

export function parseNotifyButtonId(customId: string): ParsedNotifyButtonId | null {
  const parts = customId.split(':');
  if (parts.length !== 4) {
    return null;
  }

  const [scope, action, type, nextEnabled] = parts;
  if (scope !== 'notify' || action !== 'toggle' || !isDiscordNotificationType(type)) {
    return null;
  }

  if (nextEnabled !== '0' && nextEnabled !== '1') {
    return null;
  }

  return { type, nextEnabled: nextEnabled === '1' };
}
```
(The `import` lines go at the top of the file with the other imports — `components.ts` currently has none, so this becomes the first import block.)

Re-run: `npx vitest run src/discord/components.test.ts` — expected PASS.

- [ ] **Step 3: Add the `/notify` slash command definition**

In `apps/discord-bot/src/commands/definitions.ts`, add after the `report` command builder:
```typescript
    new SlashCommandBuilder()
      .setName('notify')
      .setDescription('Manage your Pocketrealm notification DMs.'),
```
In `apps/discord-bot/src/commands/definitions.test.ts`, find the assertion listing expected command names and add `'notify'` to it.
Run from `apps/discord-bot`: `npx vitest run src/commands/definitions.test.ts` — expected PASS after the edit.

- [ ] **Step 4: Write the failing notify-command tests**

`apps/discord-bot/src/interactions/notifyCommand.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import { notifyToggleButtonId } from '../discord/components.js';
import { handleNotifyCommand, handleNotifyToggleButton } from './notifyCommand.js';

const GUILD_ID = '23456789012345678';
const USER_ID = '34567890123456789';

function createApi(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockResolvedValue({ preferences: [{ type: 'turns_capped', enabled: false }] }),
    post: vi.fn().mockResolvedValue({ preference: { type: 'turns_capped', enabled: true } }),
    ...overrides,
  };
}

function createCommandInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: GUILD_ID,
    user: { id: USER_ID, send: vi.fn().mockResolvedValue(undefined) },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createButtonInteraction(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    customId,
    guildId: GUILD_ID,
    user: { id: USER_ID, send: vi.fn().mockResolvedValue(undefined) },
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('handleNotifyCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows toggle buttons for linked users', async () => {
    const api = createApi();
    const interaction = createCommandInteraction();

    await handleNotifyCommand(interaction as never, api as never);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(api.get).toHaveBeenCalledWith(
      `/api/v1/discord/notifications/preferences?guildId=${GUILD_ID}&discordUserId=${USER_ID}`,
    );
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.components).toHaveLength(1);
    expect(JSON.stringify(payload.components)).toContain(notifyToggleButtonId('turns_capped', true));
  });

  it('prompts unlinked users to /link', async () => {
    const api = createApi({
      get: vi.fn().mockRejectedValue(new PocketRealmApiError('not linked', 404, 'DISCORD_LINK_REQUIRED', {})),
    });
    const interaction = createCommandInteraction();

    await handleNotifyCommand(interaction as never, api as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.content).toContain('/link');
  });

  it('rejects use outside the guild', async () => {
    const interaction = createCommandInteraction({ guildId: null });

    await handleNotifyCommand(interaction as never, createApi() as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe('handleNotifyToggleButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enables a preference and sends a confirmation DM', async () => {
    const api = createApi();
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', true));

    await handleNotifyToggleButton(interaction as never, api as never);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/preferences', {
      discordGuildId: GUILD_ID,
      discordUserId: USER_ID,
      type: 'turns_capped',
      enabled: true,
    });
    expect(interaction.user.send).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('reverts the toggle when the confirmation DM fails', async () => {
    const api = createApi();
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', true));
    interaction.user.send = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));

    await handleNotifyToggleButton(interaction as never, api as never);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/preferences', {
      discordGuildId: GUILD_ID,
      discordUserId: USER_ID,
      type: 'turns_capped',
      enabled: false,
    });
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
      ephemeral: true,
      content: expect.stringContaining('DM'),
    }));
  });

  it('disables without sending a DM', async () => {
    const api = createApi({
      post: vi.fn().mockResolvedValue({ preference: { type: 'turns_capped', enabled: false } }),
    });
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', false));

    await handleNotifyToggleButton(interaction as never, api as never);

    expect(interaction.user.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run from `apps/discord-bot`: `npx vitest run src/interactions/notifyCommand.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Write the handler**

`apps/discord-bot/src/interactions/notifyCommand.ts`:
```typescript
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  DISCORD_NOTIFICATION_TYPE_LABELS,
  type DiscordNotificationPreferenceView,
} from '@pocketrealm/shared/discord/discordNotifications';

import { PocketRealmApiError, type PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { notifyToggleButtonId, parseNotifyButtonId } from '../discord/components.js';

type NotifyApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;

interface PreferencesResponse {
  preferences: DiscordNotificationPreferenceView[];
}

const NOTIFY_INTRO = 'Choose which Pocketrealm events DM you. Everything is off until you turn it on.';

function buildPreferenceComponents(
  preferences: DiscordNotificationPreferenceView[],
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = preferences.map((preference) =>
    new ButtonBuilder()
      .setCustomId(notifyToggleButtonId(preference.type, !preference.enabled))
      .setLabel(`${DISCORD_NOTIFICATION_TYPE_LABELS[preference.type]}: ${preference.enabled ? 'ON' : 'OFF'}`)
      .setStyle(preference.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];
}

function isLinkRequiredError(error: unknown): boolean {
  return error instanceof PocketRealmApiError && error.code === 'DISCORD_LINK_REQUIRED';
}

export async function handleNotifyCommand(
  interaction: ChatInputCommandInteraction,
  api: NotifyApiClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: '/notify only works in the PocketRealm Discord server.',
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let response: PreferencesResponse;
  try {
    response = await api.get<PreferencesResponse>(
      `/api/v1/discord/notifications/preferences?guildId=${interaction.guildId}&discordUserId=${interaction.user.id}`,
    );
  } catch (error) {
    if (isLinkRequiredError(error)) {
      await interaction.editReply({
        content: 'Link your PocketRealm account first with /link, then run /notify again.',
      });
      return;
    }

    await interaction.editReply({
      content: 'Unable to load your notification settings right now. Please try again later.',
    });
    return;
  }

  await interaction.editReply({
    content: NOTIFY_INTRO,
    components: buildPreferenceComponents(response.preferences),
  });
}

export async function handleNotifyToggleButton(
  interaction: ButtonInteraction,
  api: NotifyApiClient,
): Promise<void> {
  const parsed = parseNotifyButtonId(interaction.customId);
  if (!parsed || !interaction.guildId) {
    return;
  }

  await interaction.deferUpdate();

  const upsert = (enabled: boolean) =>
    api.post<{ preference: DiscordNotificationPreferenceView }>(
      '/api/v1/discord/notifications/preferences',
      {
        discordGuildId: interaction.guildId,
        discordUserId: interaction.user.id,
        type: parsed.type,
        enabled,
      },
    );

  try {
    await upsert(parsed.nextEnabled);
  } catch (error) {
    const content = isLinkRequiredError(error)
      ? 'Link your PocketRealm account first with /link, then run /notify again.'
      : 'Unable to update that notification setting right now. Please try again later.';
    await interaction.followUp({ ephemeral: true, content });
    return;
  }

  let enabled = parsed.nextEnabled;

  if (parsed.nextEnabled) {
    try {
      await interaction.user.send({
        content: `✅ You're set! I'll DM you here when "${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]}" fires.`,
      });
    } catch {
      // DMs from this server are blocked; revert so the user is not opted
      // into notifications that can never arrive.
      enabled = false;
      await upsert(false);
      await interaction.followUp({
        ephemeral: true,
        content: 'I could not DM you, so that notification stays off. Enable "Allow direct messages from server members" in your Discord privacy settings for this server, then try again.',
      });
    }
  }

  const preferences: DiscordNotificationPreferenceView[] = [{ type: parsed.type, enabled }];
  await interaction.editReply({
    content: NOTIFY_INTRO,
    components: buildPreferenceComponents(preferences),
  });
}
```

- [ ] **Step 7: Run to verify the handler tests pass**

Run from `apps/discord-bot`: `npx vitest run src/interactions/notifyCommand.test.ts`
Expected: PASS.

- [ ] **Step 8: Route the command and buttons**

In `apps/discord-bot/src/interactions/interactionRouter.ts`:

Imports:
```typescript
import { parseDuelButtonId, parseNotifyButtonId, parseSupportButtonId } from '../discord/components.js';
import { handleNotifyCommand, handleNotifyToggleButton } from './notifyCommand.js';
```
(replacing the existing `parseDuelButtonId, parseSupportButtonId` import line.)

In the button branch (before the `parseSupportButtonId` check):
```typescript
    if (parseNotifyButtonId(interaction.customId)) {
      await handleNotifyToggleButton(interaction, options.api);
      return;
    }
```

In the chat-command section (after the `link` branch):
```typescript
  if (interaction.commandName === 'notify') {
    await handleNotifyCommand(interaction, options.api);
    return;
  }
```

In `apps/discord-bot/src/interactions/interactionRouter.test.ts`, register mocks for the new module next to the file's existing handler mocks (it mocks every handler module the router imports — follow the same `vi.hoisted` + `vi.mock` shape):
```typescript
// add to the hoisted mocks object:
  handleNotifyCommand: vi.fn(),
  handleNotifyToggleButton: vi.fn(),

// add with the other module mocks:
vi.mock('./notifyCommand.js', () => ({
  handleNotifyCommand: mocks.handleNotifyCommand,
  handleNotifyToggleButton: mocks.handleNotifyToggleButton,
}));
```
Then add two tests using the file's existing fake-interaction builders (reuse whatever helper the `link`/`duel` routing tests use — do not invent a new one):
```typescript
it('routes /notify to the notify command handler', async () => {
  // build a chat-input interaction with commandName 'notify' via the existing helper
  await routeInteraction(interaction, options);

  expect(mocks.handleNotifyCommand).toHaveBeenCalledWith(interaction, options.api);
});

it('routes notify toggle buttons to the toggle handler', async () => {
  // build a button interaction with customId 'notify:toggle:turns_capped:1' via the existing helper
  await routeInteraction(interaction, options);

  expect(mocks.handleNotifyToggleButton).toHaveBeenCalledWith(interaction, options.api);
});
```

- [ ] **Step 9: Run the bot suite**

Run from `apps/discord-bot`: `npx vitest run`
Expected: PASS (including `architectureBoundaries.test.ts` — no prisma imports were added).

- [ ] **Step 10: Commit**

```powershell
git add apps/discord-bot/src
git commit -m "feat: add /notify command with DM-confirmed toggles"
```

---

### Task 10: Wire the delivery loop into the bot

**Files:**
- Modify: `apps/discord-bot/src/index.ts`

- [ ] **Step 1: Add the third poll loop**

In `apps/discord-bot/src/index.ts`:

Imports:
```typescript
import { DISCORD_NOTIFICATION_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { pollDiscordNotifications } from './notifications/notificationPoll.js';
```

State (next to `supportTriageInterval`, line 41):
```typescript
  let notificationInterval: NodeJS.Timeout | undefined;
  let isNotificationPollRunning = false;
```

Inside the `ClientReady` handler (after the support triage loop is started, line 196):
```typescript
    const runNotificationPoll = async (): Promise<void> => {
      if (isNotificationPollRunning) {
        logger.debug('Discord notification poll skipped because a previous run is still active');
        return;
      }

      isNotificationPollRunning = true;
      try {
        await pollDiscordNotifications({
          api,
          logger,
          readyClient,
          redis,
        });
      } catch (error) {
        logger.warn({ error }, 'Discord notification poll failed');
      } finally {
        isNotificationPollRunning = false;
      }
    };

    void runNotificationPoll();
    notificationInterval = setInterval(() => {
      void runNotificationPoll();
    }, DISCORD_NOTIFICATION_CONSTANTS.POLL_INTERVAL_MS);
```

In `shutdown` (next to the other clearInterval calls):
```typescript
    if (notificationInterval) {
      clearInterval(notificationInterval);
    }
```

- [ ] **Step 2: Typecheck and full bot suite**

Run from repo root: `npm run typecheck`
Run from `apps/discord-bot`: `npx vitest run`
Expected: both clean.

- [ ] **Step 3: Commit**

```powershell
git add apps/discord-bot/src/index.ts
git commit -m "feat: poll and deliver Discord notification DMs"
```

---

### Task 11: Full verification

- [ ] **Step 1: Build + typecheck + full test suite**

Run from repo root (Redis container `pocketrealm-redis` must be running for API tests):
```powershell
npm run build
npm run typecheck
npm run test
```
Expected: all clean. Do NOT dismiss any failure as pre-existing without verifying it fails identically on the base commit (`git stash` / check out `b040c112`).

- [ ] **Step 2: Manual end-to-end check**

1. Start services from the worktree: `npm run dev:api` (the bot worker needs real Discord credentials — if unavailable locally, verify via the API half only).
2. Insert a linked, opted-in, capped state directly (replace the IDs with seeded values; `psql` on port 5433, DB `pocketrealm_discord_notification_pipeline`):
```sql
-- assumes a seeded account+player and an active discord_account_links row
INSERT INTO discord_notification_preferences (id, discord_guild_id, discord_user_id, type, enabled, armed, created_at, updated_at)
VALUES (gen_random_uuid(), '<guild>', '<user>', 'turns_capped', true, true, now(), now());
UPDATE turn_banks SET current_turns = 64800, regen_progress = 0, last_regen_at = now() WHERE player_id = '<player>';
```
3. Wait for (or trigger) one sweep run; confirm a `discord_notification_events` row appears with the right `dedup_key`, and that a second sweep run does not insert another row or refire.
4. `UPDATE turn_banks SET current_turns = 100 ...`, run the sweep again, confirm the preference re-arms (`armed = true`).

- [ ] **Step 3: Commit any fixes, then push the branch**

```powershell
git push -u origin discord-notification-pipeline
```

---

## Self-Review Notes (already applied)

- Spec amended: preference upsert is `POST` (bot client has no `put`; all internal discord mutations are POST).
- `ackDiscordNotificationEvents` takes `now` as an optional parameter so tests stay deterministic; the route uses the default.
- DM-less events (null `discordUserId`) are acked as failed rather than skipped, so they age out via the attempts cap instead of clogging the pending queue until #323 adds channel delivery.
- The sweep intentionally resolves links per preference row (N+1): the opted-in set is small, and correctness (always the *current* active link/player) beats a complex join. Revisit only if the sweep ever logs slow runs.
- The spec's "integration test" is realized as the Task 11 manual end-to-end check plus the mock-based chain tests (sweep → outbox shape → poll → ack). This codebase has no DB-backed test harness; inventing one is out of scope for this issue.
- Delivered-event pruning (spec: "prunable after ~30 days") rides the sweep via `DELIVERED_RETENTION_DAYS`. Failed events are kept — they are rare and useful for debugging.
