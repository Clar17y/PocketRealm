# Discord `/notify` Event-Driven Notification Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Discord notification pipeline (`/notify` + DB outbox + bot poll) to cover six event-driven game notifications, each off by default, delivered as rich DMs with a deep link into the game.

**Architecture:** A new `notifyPlayer()` API chokepoint fans targeted events out to both web push (`sendPush`, gated on `Player.notify*`) and the Discord outbox (`enqueueDiscordNotificationEvent`, gated on `discord_notification_preferences`). The broadcast event (`boss_appeared`) keeps its web-push subscriber loop and adds `broadcastDiscordNotification`, which iterates opted-in users. The bot's poll formats each type's DM (emoji, bold names, `/game` deep link) from a structured payload — the same pattern `turns_capped` already uses. No new DB migration; the `type` columns already accept any string.

**Tech Stack:** TypeScript, Express, Prisma 6 (PostgreSQL), discord.js, Vitest. Monorepo packages: `@pocketrealm/shared` (types/constants), `apps/api` (services), `apps/discord-bot` (delivery).

**Reference spec:** `docs/superpowers/specs/2026-06-17-discord-notify-event-types-design.md`

**Design decisions baked in:**
- Discord type slugs are snake_case (match existing `turns_capped`).
- `dedupKey` is **omitted** (left null) for the six event types — they fire once per discrete event, so the sweep's dedup machinery isn't needed. (Deviation from the spec's "best-effort dedupKey", chosen for KISS; can be added later if duplicate DMs ever appear.)
- All message copy lives in the bot (`notificationPoll.ts`), formatted from structured payloads.

**Conventions for every task:** run commands from the worktree root `D:\Code\Adventure\.worktrees\pocketrealm-discord_notify_event_types`. After changing anything in `packages/shared`, rebuild it before typechecking/testing consumers: `npm run build -w packages/shared`.

---

### Task 1: Extend the shared Discord notification registry, labels, web→discord map, and payload types

**Files:**
- Modify: `packages/shared/src/discord/discordNotifications.ts`
- Test: `packages/shared/src/discord/discordNotifications.test.ts`

- [ ] **Step 1: Write the failing test**

Append these tests to `packages/shared/src/discord/discordNotifications.test.ts`:

```ts
import {
  DISCORD_NOTIFICATION_TYPES,
  DISCORD_NOTIFICATION_TYPE_LABELS,
  WEB_TO_DISCORD_NOTIFICATION_TYPE,
  isDiscordNotificationType,
} from './discordNotifications';

describe('extended discord notification registry', () => {
  it('includes the six event-driven types plus turns_capped', () => {
    expect(DISCORD_NOTIFICATION_TYPES).toEqual([
      'turns_capped',
      'pvp_attack',
      'pvp_scout',
      'boss_appeared',
      'boss_defeated',
      'expedition_recruiting',
      'expedition_finished',
    ]);
  });

  it('has a label for every type', () => {
    for (const type of DISCORD_NOTIFICATION_TYPES) {
      expect(DISCORD_NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it('maps every web event type to a distinct discord slug and excludes turnBankFull', () => {
    expect(WEB_TO_DISCORD_NOTIFICATION_TYPE).toEqual({
      pvpAttack: 'pvp_attack',
      pvpScout: 'pvp_scout',
      bossAppeared: 'boss_appeared',
      bossKilled: 'boss_defeated',
      expeditionStarted: 'expedition_recruiting',
      expeditionFinished: 'expedition_finished',
    });
    expect(Object.values(WEB_TO_DISCORD_NOTIFICATION_TYPE)).not.toContain('turns_capped');
  });

  it('recognises a new slug as a valid type', () => {
    expect(isDiscordNotificationType('boss_defeated')).toBe(true);
    expect(isDiscordNotificationType('not_a_type')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build -w packages/shared && npx vitest run packages/shared/src/discord/discordNotifications.test.ts`
Expected: FAIL — `DISCORD_NOTIFICATION_TYPES` only contains `turns_capped`; `WEB_TO_DISCORD_NOTIFICATION_TYPE` is undefined.

- [ ] **Step 3: Implement the registry changes**

Replace the contents of `packages/shared/src/discord/discordNotifications.ts` with:

```ts
export const DISCORD_NOTIFICATION_TYPES = [
  'turns_capped',
  'pvp_attack',
  'pvp_scout',
  'boss_appeared',
  'boss_defeated',
  'expedition_recruiting',
  'expedition_finished',
] as const;

export type DiscordNotificationType = (typeof DISCORD_NOTIFICATION_TYPES)[number];

export function isDiscordNotificationType(value: string): value is DiscordNotificationType {
  return (DISCORD_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Button labels and /notify display names, keyed by type. */
export const DISCORD_NOTIFICATION_TYPE_LABELS: Record<DiscordNotificationType, string> = {
  turns_capped: 'Turns capped',
  pvp_attack: 'PvP attack',
  pvp_scout: 'PvP scout',
  boss_appeared: 'Boss appeared',
  boss_defeated: 'Boss defeated',
  expedition_recruiting: 'Expedition recruiting',
  expedition_finished: 'Expedition finished',
};

/**
 * Maps an API-side push NotificationType (camelCase) to its Discord slug.
 * `turnBankFull` is intentionally absent — turns-capped DMs are produced by the
 * API sweep, not by the per-event chokepoint.
 */
export const WEB_TO_DISCORD_NOTIFICATION_TYPE = {
  pvpAttack: 'pvp_attack',
  pvpScout: 'pvp_scout',
  bossAppeared: 'boss_appeared',
  bossKilled: 'boss_defeated',
  expeditionStarted: 'expedition_recruiting',
  expeditionFinished: 'expedition_finished',
} as const satisfies Record<string, DiscordNotificationType>;

export interface DiscordTurnsCappedPayload {
  currentTurns: number;
  bankCap: number;
  username: string;
}

export interface DiscordPvpAttackPayload {
  attackerName: string;
}

export interface DiscordPvpScoutPayload {
  scouterName: string;
}

export interface DiscordBossAppearedPayload {
  bossName: string;
  zoneName: string;
}

export interface DiscordBossDefeatedPayload {
  bossName: string;
}

export interface DiscordExpeditionRecruitingPayload {
  tier: number;
}

export interface DiscordExpeditionFinishedPayload {
  tier: number;
  outcome: 'victory' | 'failed';
  attempts?: number;
}

export type DiscordNotificationPayload =
  | DiscordTurnsCappedPayload
  | DiscordPvpAttackPayload
  | DiscordPvpScoutPayload
  | DiscordBossAppearedPayload
  | DiscordBossDefeatedPayload
  | DiscordExpeditionRecruitingPayload
  | DiscordExpeditionFinishedPayload;

/** Shape served by GET /api/v1/discord/notifications/pending. */
export interface DiscordNotificationEventView {
  id: string;
  discordGuildId: string;
  discordUserId: string | null;
  type: DiscordNotificationType;
  payload: DiscordNotificationPayload;
  createdAt: string;
}

/** Shape served by GET/POST /api/v1/discord/notifications/preferences. */
export interface DiscordNotificationPreferenceView {
  type: DiscordNotificationType;
  enabled: boolean;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build -w packages/shared && npx vitest run packages/shared/src/discord/discordNotifications.test.ts`
Expected: PASS (all registry tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/discord/discordNotifications.ts packages/shared/src/discord/discordNotifications.test.ts
git commit -m "feat(shared): extend Discord notification registry with six event types"
```

---

### Task 2: Update `listDiscordNotificationPreferences` test expectation (now returns all 7 types)

The function already maps over `DISCORD_NOTIFICATION_TYPES`, so widening the registry makes it return seven rows. Only its test needs updating.

**Files:**
- Modify: `apps/api/src/services/discordNotificationService.test.ts:43-58`

- [ ] **Step 1: Update the two assertions to expect all seven default-off rows**

Replace the `listDiscordNotificationPreferences` `it('returns every known type...')` and `it('reflects stored enabled state')` bodies so the expected arrays include every type:

```ts
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
  expect(preferences).toHaveLength(7);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run apps/api/src/services/discordNotificationService.test.ts -t listDiscordNotificationPreferences`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/discordNotificationService.test.ts
git commit -m "test(api): expect all seven types from listDiscordNotificationPreferences"
```

---

### Task 3: Add `resolveDiscordTarget`, `enqueueDiscordNotificationEvent`, and `broadcastDiscordNotification`

**Files:**
- Modify: `apps/api/src/services/discordNotificationService.ts`
- Test: `apps/api/src/services/discordNotificationService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `mocks.prisma` hoisted object in `discordNotificationService.test.ts` these members (extend the existing object — keep what's there):

```ts
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
```

Add to the imports from `./discordNotificationService`:

```ts
  broadcastDiscordNotification,
  enqueueDiscordNotificationEvent,
  resolveDiscordTarget,
```

Add this describe block:

```ts
describe('resolveDiscordTarget', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/discordNotificationService.test.ts -t "resolveDiscordTarget|enqueueDiscordNotificationEvent|broadcastDiscordNotification"`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement the three functions**

In `apps/api/src/services/discordNotificationService.ts`, change the `@pocketrealm/database` import to also pull `Prisma`, add the `logger` import, the `DiscordNotificationPayload` type import, and append the functions:

Change line 1 from:
```ts
import { prisma } from '@pocketrealm/database';
```
to:
```ts
import { Prisma, prisma } from '@pocketrealm/database';
import { logger } from '../logger';
```

Add `DiscordNotificationPayload` to the shared import block (the `@pocketrealm/shared/discord/discordNotifications` import):
```ts
  type DiscordNotificationPayload,
```

Append at the end of the file:

```ts
export interface DiscordTarget {
  discordUserId: string;
  discordGuildId: string;
}

/**
 * Resolves a player to their active linked Discord user + guild, or null when
 * the player has no active link. Newest active link wins.
 */
export async function resolveDiscordTarget(playerId: string): Promise<DiscordTarget | null> {
  const link = await prisma.discordAccountLink.findFirst({
    where: { account: { players: { some: { id: playerId } } }, unlinkedAt: null },
    orderBy: { linkedAt: 'desc' },
    select: { discordUserId: true, discordGuildId: true },
  });
  if (!link) return null;
  return { discordUserId: link.discordUserId, discordGuildId: link.discordGuildId };
}

/**
 * Targeted Discord DM: enqueue an outbox event for one player, gated on their
 * per-type `/notify` preference. Fire-and-forget — never throws to the caller.
 */
export async function enqueueDiscordNotificationEvent(
  playerId: string,
  type: DiscordNotificationType,
  payload: DiscordNotificationPayload,
): Promise<void> {
  try {
    const target = await resolveDiscordTarget(playerId);
    if (!target) return;

    const preference = await prisma.discordNotificationPreference.findUnique({
      where: {
        discordGuildId_discordUserId_type: {
          discordGuildId: target.discordGuildId,
          discordUserId: target.discordUserId,
          type,
        },
      },
      select: { enabled: true },
    });
    if (!preference?.enabled) return;

    await prisma.discordNotificationEvent.create({
      data: {
        discordGuildId: target.discordGuildId,
        discordUserId: target.discordUserId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({ err, playerId, type }, 'Failed to enqueue Discord notification event');
  }
}

/**
 * Broadcast Discord DM: enqueue one outbox event per user opted into `type`.
 * Used for global events (boss appeared). Fire-and-forget.
 */
export async function broadcastDiscordNotification(
  type: DiscordNotificationType,
  payload: DiscordNotificationPayload,
): Promise<void> {
  try {
    const recipients = await prisma.discordNotificationPreference.findMany({
      where: { type, enabled: true },
      select: { discordGuildId: true, discordUserId: true },
    });
    if (recipients.length === 0) return;

    await prisma.discordNotificationEvent.createMany({
      data: recipients.map((recipient) => ({
        discordGuildId: recipient.discordGuildId,
        discordUserId: recipient.discordUserId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.error({ err, type }, 'Failed to broadcast Discord notification');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/discordNotificationService.test.ts`
Expected: PASS (all describe blocks, including the existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/discordNotificationService.ts apps/api/src/services/discordNotificationService.test.ts
git commit -m "feat(api): add Discord target resolution + targeted/broadcast outbox enqueue"
```

---

### Task 4: Add the `notifyPlayer` chokepoint

**Files:**
- Create: `apps/api/src/services/playerNotifier.ts`
- Test: `apps/api/src/services/playerNotifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/playerNotifier.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendPush: vi.fn(),
  enqueueDiscordNotificationEvent: vi.fn(),
}));

vi.mock('./pushNotificationService', () => ({ sendPush: mocks.sendPush }));
vi.mock('./discordNotificationService', () => ({
  enqueueDiscordNotificationEvent: mocks.enqueueDiscordNotificationEvent,
}));

import { notifyPlayer } from './playerNotifier';

const PUSH = { title: 'PvP Attack!', body: 'Rook challenged you!', tag: 'pvp-attack' };

describe('notifyPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendPush.mockResolvedValue(undefined);
    mocks.enqueueDiscordNotificationEvent.mockResolvedValue(undefined);
  });

  it('sends web push and enqueues a Discord event for a mapped type', () => {
    notifyPlayer('player-1', 'pvpAttack', PUSH, { attackerName: 'Rook' });

    expect(mocks.sendPush).toHaveBeenCalledWith('player-1', 'pvpAttack', PUSH);
    expect(mocks.enqueueDiscordNotificationEvent).toHaveBeenCalledWith('player-1', 'pvp_attack', { attackerName: 'Rook' });
  });

  it('only sends web push for an unmapped type (turnBankFull)', () => {
    notifyPlayer('player-1', 'turnBankFull', PUSH);

    expect(mocks.sendPush).toHaveBeenCalledWith('player-1', 'turnBankFull', PUSH);
    expect(mocks.enqueueDiscordNotificationEvent).not.toHaveBeenCalled();
  });

  it('does not enqueue a mapped type when no Discord payload is supplied', () => {
    notifyPlayer('player-1', 'pvpAttack', PUSH);

    expect(mocks.enqueueDiscordNotificationEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/playerNotifier.test.ts`
Expected: FAIL — `./playerNotifier` does not exist.

- [ ] **Step 3: Implement `notifyPlayer`**

Create `apps/api/src/services/playerNotifier.ts`:

```ts
import { WEB_TO_DISCORD_NOTIFICATION_TYPE } from '@pocketrealm/shared/discord/discordNotifications';
import type { DiscordNotificationPayload } from '@pocketrealm/shared/discord/discordNotifications';
import { enqueueDiscordNotificationEvent } from './discordNotificationService';
import { sendPush, type NotificationType } from './pushNotificationService';

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

type WebTypeWithDiscord = keyof typeof WEB_TO_DISCORD_NOTIFICATION_TYPE;

/**
 * Single fan-out point for a targeted player notification. Delivers web push
 * (gated on Player.notify*) and, for types mapped to Discord, enqueues a Discord
 * DM (gated on the player's /notify preference). Each channel gates itself; this
 * function does not. Fire-and-forget — both deliveries are voided.
 */
export function notifyPlayer(
  playerId: string,
  type: NotificationType,
  push: PushPayload,
  discordPayload?: DiscordNotificationPayload,
): void {
  void sendPush(playerId, type, push);

  const discordType = WEB_TO_DISCORD_NOTIFICATION_TYPE[type as WebTypeWithDiscord] as
    | (typeof WEB_TO_DISCORD_NOTIFICATION_TYPE)[WebTypeWithDiscord]
    | undefined;
  if (discordType && discordPayload) {
    void enqueueDiscordNotificationEvent(playerId, discordType, discordPayload);
  }
}
```

> Note: `sendPush`'s `PushPayload` is not exported, so this file re-declares the
> identical structural type. If a later refactor exports it from
> `pushNotificationService`, import it instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/services/playerNotifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/playerNotifier.ts apps/api/src/services/playerNotifier.test.ts
git commit -m "feat(api): add notifyPlayer chokepoint fanning to web push + Discord"
```

---

### Task 5: Migrate the targeted call sites from `sendPush` to `notifyPlayer`

Each edit adds the structured Discord payload. These are wiring changes verified by typecheck + existing tests (the unit behavior is covered by Task 4).

**Files:**
- Modify: `apps/api/src/routes/pvp.ts` (pvpScout ~L91, pvpAttack ~L139)
- Modify: `apps/api/src/services/bossEncounter/resolution.ts` (~L546)
- Modify: `apps/api/src/services/expeditionService.ts` (~L183)
- Modify: `apps/api/src/services/expeditionTransitionService.ts` (~L163, ~L280)

- [ ] **Step 1: `pvp.ts` — import and replace both calls**

Add the import (near the existing service imports):
```ts
import { notifyPlayer } from '../services/playerNotifier';
```
Replace the `pvpScout` call:
```ts
  notifyPlayer(body.targetId, 'pvpScout', {
    title: 'PvP Scout',
    body: `${req.player!.username} is sizing you up in the arena!`,
    tag: 'pvp-scout',
    data: { type: 'pvp' },
  }, { scouterName: req.player!.username });
```
Replace the `pvpAttack` call:
```ts
  notifyPlayer(result.defenderId, 'pvpAttack', {
    title: 'PvP Attack!',
    body: `${result.attackerName} challenged you in the arena!`,
    tag: 'pvp-attack',
    data: { type: 'pvp', matchId: result.matchId },
  }, { attackerName: result.attackerName });
```
If `sendPush` is no longer referenced in `pvp.ts`, remove its now-unused import.

- [ ] **Step 2: `resolution.ts` — boss defeated, per contributor**

Add the import (relative to `services/bossEncounter/`):
```ts
import { notifyPlayer } from '../playerNotifier';
```
Replace the loop body call:
```ts
    for (const playerId of contributorMap.keys()) {
      notifyPlayer(playerId, 'bossKilled', {
        title: 'Boss Defeated!',
        body: `${encounter.mobTemplate.name} has been slain!`,
        tag: 'boss-killed',
        data: { type: 'boss', encounterId },
      }, { bossName: encounter.mobTemplate.name });
    }
```
Remove the now-unused `sendPush` import if present.

- [ ] **Step 3: `expeditionService.ts` — expedition recruiting**

Add the import (relative to `services/`):
```ts
import { notifyPlayer } from './playerNotifier';
```
Replace the call:
```ts
    notifyPlayer(memberId, 'expeditionStarted', {
      title: 'Expedition Launched!',
      body: `A Tier ${tier} guild expedition is recruiting — sign up now!`,
      tag: 'expedition-recruiting',
      data: { type: 'expedition', expeditionId: expedition.id },
    }, { tier });
```
Remove the now-unused `sendPush` import if present.

- [ ] **Step 4: `expeditionTransitionService.ts` — both finished calls**

Add the import (relative to `services/`):
```ts
import { notifyPlayer } from './playerNotifier';
```
Replace the failure call (~L163):
```ts
      notifyPlayer(member.playerId, 'expeditionFinished', {
        title: 'Expedition Failed',
        body: `Your Tier ${expedition.tier} expedition failed after ${newWipeCount} attempts.`,
        tag: 'expedition-finished',
        data: { type: 'expedition', expeditionId },
      }, { tier: expedition.tier, outcome: 'failed', attempts: newWipeCount });
```
Replace the success call (~L280):
```ts
    notifyPlayer(member.playerId, 'expeditionFinished', {
      title: 'Expedition Complete!',
      body: `Your Tier ${expedition.tier} expedition was victorious!`,
      tag: 'expedition-finished',
      data: { type: 'expedition', expeditionId },
    }, { tier: expedition.tier, outcome: 'victory' });
```
Remove the now-unused `sendPush` import if present.

- [ ] **Step 5: Typecheck and run the affected test suites**

Run: `npm run build -w packages/shared && npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: `No errors found`.
Run: `npx vitest run apps/api/src/routes/pvp.test.ts apps/api/src/services/expeditionService.test.ts apps/api/src/services/expeditionTransitionService.test.ts apps/api/src/services/bossEncounter`
Expected: PASS (or "no test files" for any path without a colocated test — that is acceptable; the wiring is covered by typecheck + Task 4).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/pvp.ts apps/api/src/services/bossEncounter/resolution.ts apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionTransitionService.ts
git commit -m "feat(api): route targeted notifications through notifyPlayer"
```

---

### Task 6: Wire `boss_appeared` broadcast (keep web-push subscriber loops)

The web-push loops stay unchanged; we add one `broadcastDiscordNotification` per boss spawn.

**Files:**
- Modify: `apps/api/src/services/admin/eventAdminService.ts` (~L212)
- Modify: `apps/api/src/services/eventSchedulerService.ts` (~L252)

- [ ] **Step 1: `eventAdminService.ts` — add the broadcast after the subscriber loop**

Add the import (relative to `services/admin/`):
```ts
import { broadcastDiscordNotification } from '../discordNotificationService';
```
Immediately after the `for (const { playerId } of subscribedPlayers) { void sendPush(...) }` loop, add:
```ts
  void broadcastDiscordNotification('boss_appeared', { bossName: mob.name, zoneName });
```

- [ ] **Step 2: `eventSchedulerService.ts` — add the broadcast after the subscriber loop**

Add the import (relative to `services/`):
```ts
import { broadcastDiscordNotification } from './discordNotificationService';
```
Immediately after the `for (const { playerId } of subscribedPlayers) { void sendPush(...) }` loop, add:
```ts
  void broadcastDiscordNotification('boss_appeared', { bossName: bossMob.name, zoneName });
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: `No errors found`.
Run: `npx vitest run apps/api/src/services/eventSchedulerService.test.ts apps/api/src/services/admin`
Expected: PASS (or "no test files" — acceptable).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/admin/eventAdminService.ts apps/api/src/services/eventSchedulerService.ts
git commit -m "feat(api): broadcast boss-appeared DMs to opted-in Discord users"
```

---

### Task 7: Per-type bot formatter with deep links + thread `webBaseUrl` through the poll

**Files:**
- Modify: `apps/discord-bot/src/notifications/notificationPoll.ts`
- Modify: `apps/discord-bot/src/notifications/notificationPoll.test.ts`
- Modify: `apps/discord-bot/src/index.ts` (poll options)

- [ ] **Step 1: Update the existing poll test + add formatter tests**

In `notificationPoll.test.ts`, the formatter now takes `webBaseUrl`. Add a constant and a typed event helper, and pass `webBaseUrl` through:

Add the type import at the top:
```ts
import type {
  DiscordNotificationEventView,
  DiscordNotificationPayload,
} from '@pocketrealm/shared/discord/discordNotifications';
```
Add near the top (after `EVENT`):
```ts
const WEB_BASE_URL = 'https://play.pocketrealm.test';

// Typed builder so overriding `type`/`payload` stays assignable to the view.
function evt(type: DiscordNotificationEventView['type'], payload: DiscordNotificationPayload): DiscordNotificationEventView {
  return { ...EVENT, type, payload };
}
```
In `createOptions`, add `webBaseUrl: WEB_BASE_URL,` to the `options` object.
Update the success assertion in `'DMs pending events and acks them as delivered'`:
```ts
    expect(send).toHaveBeenCalledWith({ content: formatNotificationMessage(EVENT, WEB_BASE_URL) });
```
Replace the `formatNotificationMessage` describe block with:
```ts
describe('formatNotificationMessage', () => {
  it('formats turns-capped events', () => {
    const content = formatNotificationMessage(EVENT, WEB_BASE_URL);
    expect(content).toContain('64,800');
    expect(content.toLowerCase()).toContain('turns are full');
  });

  it('formats a pvp_attack DM with a bold name and arena deep link', () => {
    const content = formatNotificationMessage(evt('pvp_attack', { attackerName: 'Rook' }), WEB_BASE_URL);
    expect(content).toContain('**Rook**');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=arena`);
  });

  it('formats a boss_appeared DM with the boss, zone, and worldEvents deep link', () => {
    const content = formatNotificationMessage(evt('boss_appeared', { bossName: 'Ymir', zoneName: 'Tundra' }), WEB_BASE_URL);
    expect(content).toContain('**Ymir**');
    expect(content).toContain('**Tundra**');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=worldEvents`);
  });

  it('formats a victorious expedition_finished DM with the guild expeditions deep link', () => {
    const content = formatNotificationMessage(evt('expedition_finished', { tier: 3, outcome: 'victory' }), WEB_BASE_URL);
    expect(content).toContain('Tier 3');
    expect(content.toLowerCase()).toContain('victorious');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=guild&tab=expeditions`);
  });

  it('formats a failed expedition_finished DM with the attempt count', () => {
    const content = formatNotificationMessage(evt('expedition_finished', { tier: 2, outcome: 'failed', attempts: 4 }), WEB_BASE_URL);
    expect(content).toContain('Tier 2');
    expect(content).toContain('4 attempts');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/discord-bot/src/notifications/notificationPoll.test.ts`
Expected: FAIL — `formatNotificationMessage` takes one argument / does not branch on type.

- [ ] **Step 3: Implement the per-type formatter and thread `webBaseUrl`**

In `notificationPoll.ts`, replace the imports + `formatNotificationMessage` and add `webBaseUrl` to options:

Replace the type-only shared import with the payload types:
```ts
import type {
  DiscordBossAppearedPayload,
  DiscordBossDefeatedPayload,
  DiscordExpeditionFinishedPayload,
  DiscordExpeditionRecruitingPayload,
  DiscordNotificationEventView,
  DiscordPvpAttackPayload,
  DiscordPvpScoutPayload,
  DiscordTurnsCappedPayload,
} from '@pocketrealm/shared/discord/discordNotifications';
```
Add `webBaseUrl` to `DiscordNotificationPollOptions`:
```ts
export interface DiscordNotificationPollOptions {
  api: NotificationApi;
  logger: LoggerLike;
  readyClient: ReadyClientLike;
  webBaseUrl: string;
  redis?: DeliverySuppressionStore;
}
```
Replace `formatNotificationMessage` with:
```ts
function gameLink(webBaseUrl: string, path: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}${path}`;
}

export function formatNotificationMessage(event: DiscordNotificationEventView, webBaseUrl: string): string {
  const arena = gameLink(webBaseUrl, '/game?screen=arena');
  const worldEvents = gameLink(webBaseUrl, '/game?screen=worldEvents');
  const expeditions = gameLink(webBaseUrl, '/game?screen=guild&tab=expeditions');

  switch (event.type) {
    case 'pvp_attack': {
      const p = event.payload as DiscordPvpAttackPayload;
      return `⚔️ **${p.attackerName}** challenged you in the arena! [Fight back →](${arena})`;
    }
    case 'pvp_scout': {
      const p = event.payload as DiscordPvpScoutPayload;
      return `🔍 **${p.scouterName}** is sizing you up in the arena. [Check the arena →](${arena})`;
    }
    case 'boss_appeared': {
      const p = event.payload as DiscordBossAppearedPayload;
      return `🐉 **${p.bossName}** has appeared in **${p.zoneName}**! [Join the fight →](${worldEvents})`;
    }
    case 'boss_defeated': {
      const p = event.payload as DiscordBossDefeatedPayload;
      return `🏆 **${p.bossName}** has been slain! [Claim your spoils →](${worldEvents})`;
    }
    case 'expedition_recruiting': {
      const p = event.payload as DiscordExpeditionRecruitingPayload;
      return `🧭 A Tier ${p.tier} guild expedition is recruiting — [sign up →](${expeditions})`;
    }
    case 'expedition_finished': {
      const p = event.payload as DiscordExpeditionFinishedPayload;
      return p.outcome === 'victory'
        ? `🎉 Your Tier ${p.tier} expedition was victorious! [Collect rewards →](${expeditions})`
        : `💀 Your Tier ${p.tier} expedition failed after ${p.attempts ?? 0} attempts. [View expeditions →](${expeditions})`;
    }
    case 'turns_capped':
    default: {
      const p = event.payload as DiscordTurnsCappedPayload;
      const turns = p.currentTurns.toLocaleString('en-US');
      const cap = p.bankCap.toLocaleString('en-US');
      return `⚡ ${p.username}, your turns are full (${turns}/${cap})! Regen is going to waste — time for an adventure.`;
    }
  }
}
```
Update the delivery call inside `pollDiscordNotifications` to pass `webBaseUrl`:
```ts
      await user.send({ content: formatNotificationMessage(event, options.webBaseUrl) });
```

- [ ] **Step 4: Thread `webBaseUrl` from `index.ts`**

In `apps/discord-bot/src/index.ts`, the `runNotificationPoll` helper calls `pollDiscordNotifications({ api, logger, readyClient, redis })`. Add `webBaseUrl`:
```ts
        await pollDiscordNotifications({
          api,
          logger,
          readyClient,
          redis,
          webBaseUrl: config.webBaseUrl,
        });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run apps/discord-bot/src/notifications/notificationPoll.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/discord-bot/tsconfig.json`
Expected: `No errors found`.

- [ ] **Step 6: Commit**

```bash
git add apps/discord-bot/src/notifications/notificationPoll.ts apps/discord-bot/src/notifications/notificationPoll.test.ts apps/discord-bot/src/index.ts
git commit -m "feat(bot): rich per-type notification DMs with in-game deep links"
```

---

### Task 8: Chunk `/notify` toggle buttons into rows of ≤5

Discord allows at most five buttons per action row. With seven types the current single-row build would be rejected.

**Files:**
- Modify: `apps/discord-bot/src/interactions/notifyCommand.ts` (`buildPreferenceComponents`)
- Test: `apps/discord-bot/src/interactions/notifyCommand.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `notifyCommand.test.ts` (import `buildPreferenceComponents` — if it is not currently exported, export it in Step 3 and import it here):

```ts
import { buildPreferenceComponents } from './notifyCommand';
import { DISCORD_NOTIFICATION_TYPES } from '@pocketrealm/shared/discord/discordNotifications';

describe('buildPreferenceComponents', () => {
  it('splits all toggles into rows of at most five buttons', () => {
    const prefs = DISCORD_NOTIFICATION_TYPES.map((type) => ({ type, enabled: false }));
    const rows = buildPreferenceComponents(prefs);

    const total = rows.reduce((sum, row) => sum + row.components.length, 0);
    expect(total).toBe(DISCORD_NOTIFICATION_TYPES.length);
    for (const row of rows) {
      expect(row.components.length).toBeLessThanOrEqual(5);
    }
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/discord-bot/src/interactions/notifyCommand.test.ts -t buildPreferenceComponents`
Expected: FAIL — either `buildPreferenceComponents` is not exported, or it returns a single row of 7 buttons.

- [ ] **Step 3: Implement chunking and export the helper**

In `notifyCommand.ts`, change `function buildPreferenceComponents(` to `export function buildPreferenceComponents(` and replace its `return` with chunked rows:

```ts
export function buildPreferenceComponents(
  preferences: DiscordNotificationPreferenceView[],
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = preferences.map((preference) =>
    new ButtonBuilder()
      .setCustomId(notifyToggleButtonId(preference.type, !preference.enabled))
      .setLabel(`${DISCORD_NOTIFICATION_TYPE_LABELS[preference.type]}: ${preference.enabled ? 'ON' : 'OFF'}`)
      .setStyle(preference.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/discord-bot/src/interactions/notifyCommand.test.ts`
Expected: PASS (the new test and all existing notify-command tests).

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/interactions/notifyCommand.ts apps/discord-bot/src/interactions/notifyCommand.test.ts
git commit -m "fix(bot): chunk /notify toggles into rows of five"
```

---

### Task 9: Changelog entry

**Files:**
- Modify: `apps/web/src/lib/changelog.ts`

- [ ] **Step 1: Add the new entry at the top of the array**

Insert as the first element of `changelog` (before the `0.65` entry):

```ts
  {
    version: '0.66',
    date: '2026-06-17',
    title: 'More Discord Alerts',
    summary:
      'You can now opt into Discord DMs for far more than turn alerts. Run /notify in the Pocketrealm Discord to toggle DMs for PvP attacks, PvP scouts, bosses appearing, bosses being defeated, expeditions recruiting, and expeditions finishing — each one off until you switch it on. Every alert links straight to the right screen in-game. Link your account with /link first if you have not already.',
  },
```

- [ ] **Step 2: Run the changelog test**

Run: `npx vitest run apps/web/src/lib/changelog.test.ts`
Expected: PASS (newest-first by date, unique version, required fields).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/changelog.ts
git commit -m "docs(web): changelog entry for expanded Discord notifications"
```

---

### Task 10: Full verification

- [ ] **Step 1: Build packages and typecheck the whole project**

Run: `npm run build:packages && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/discord-bot/tsconfig.json`
Expected: `No errors found` for both.

- [ ] **Step 2: Run the affected test suites**

Run: `npx vitest run apps/discord-bot/src apps/api/src/services/discordNotificationService.test.ts apps/api/src/services/playerNotifier.test.ts packages/shared/src/discord apps/web/src/lib/changelog.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full bot + shared suites for regressions**

Run: `npm test -w apps/discord-bot && npm test -w packages/shared`
Expected: PASS (existing `notifyCommand`, `notificationPoll`, `components` suites still green).

- [ ] **Step 4: Final commit (if any incidental fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for Discord notification types" || echo "nothing to commit"
```

---

## Notes for the implementer

- **API unit tests run without Redis/DB** (they mock Prisma). The bot suites are pure unit tests. Only run a full `npm run test:api` if you want integration coverage — it requires the `pocketrealm-redis` container.
- **Do not** add new `notify*` columns or a Prisma migration — this feature reuses the existing `discord_notification_preferences` / `discord_notification_events` tables.
- **Web push is untouched.** `sendPush`, the Settings toggles, and the `boss_appeared` subscriber loops stay exactly as they are; we only add the Discord path alongside them.
