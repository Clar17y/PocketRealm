# Discord XP API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all durable Discord XP writes from `apps/discord-bot` to authenticated internal API endpoints while preserving current chat XP, staff XP adjustment, and level-role behavior.

**Architecture:** Add a shared pure Discord XP helper package export, then add an API-side `discordXpService` plus `/api/v1/discord/xp/*` routes for message grants, staff adjustments, and role-sync timestamp updates. The bot keeps Discord Gateway, local message eligibility, Redis cooldowns, and Discord role assignment, but calls the API for every database mutation and no longer depends on Prisma.

**Tech Stack:** TypeScript, Express 4, Prisma 6/PostgreSQL, Zod, Vitest, discord.js, ioredis, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-06-10-discord-xp-api-migration-design.md`

---

## Scope

This plan handles both Discord XP write paths found in PR 315:

- automatic chat XP in `apps/discord-bot/src/xp/messageXp.ts`
- staff `/staff xp-adjust` in `apps/discord-bot/src/interactions/staffCommands.ts`

It does not implement the separate unresolved support triage buttons or the unhandled `/staff repair-ticket`, `/staff sync-ticket`, and `/staff known-issue` commands.

Deployment note from the spec: deploy the API before (or together with) the bot so the new endpoints exist before the bot calls them. This plan only changes code; no database migration is involved.

## File Structure

### Shared

| File | Responsibility |
|---|---|
| `packages/shared/src/discord/discordXp.ts` | Pure Discord XP helpers shared by API and bot. |
| `packages/shared/src/discord/discordXp.test.ts` | Unit tests for Discord XP level and level-role selection. |
| `packages/shared/package.json` | Add `./discord/discordXp` subpath export. |
| `packages/shared/src/packageExports.test.ts` | Guard the new package export. |

### API

| File | Responsibility |
|---|---|
| `apps/api/src/services/discordXpService.ts` | Own all `DiscordCommunityProfile`, `DiscordXpEvent`, `DiscordBotAuditEvent`, and Discord XP `lastRoleSyncAt` writes. |
| `apps/api/src/services/discordXpService.test.ts` | Service tests for message grants, staff adjustments, audit rows, role sync, and denial reasons. |
| `apps/api/src/services/discordSchemas.ts` | Add strict Zod schemas for Discord XP internal endpoints. |
| `apps/api/src/routes/discord.ts` | Mount internal bot-authenticated XP routes. |
| `apps/api/src/routes/discord.test.ts` | Route tests for XP endpoints and validation behavior. |
| `apps/api/vitest.config.ts` | Explicit vitest alias for the new shared subpath. |

### Discord Bot

| File | Responsibility |
|---|---|
| `apps/discord-bot/src/xp/messageXp.ts` | Keep local message eligibility and Redis cooldowns; call API for durable message XP grant and role-sync recording. |
| `apps/discord-bot/src/xp/messageXp.test.ts` | Replace Prisma fakes with API-client fakes. |
| `apps/discord-bot/src/interactions/staffCommands.ts` | Keep staff command orchestration; call API for XP adjustments and role-sync recording. |
| `apps/discord-bot/src/interactions/staffCommands.test.ts` | Replace Prisma fakes with API-client fakes. |
| `apps/discord-bot/src/index.ts` | Inject `PocketRealmApiClient` into message XP service instead of Prisma. |
| `apps/discord-bot/src/architectureBoundaries.test.ts` | Guard against future bot imports from `@pocketrealm/database` or `prismaTypes`. |
| `apps/discord-bot/src/prismaTypes.ts` | Delete after no bot code imports it. |
| `apps/discord-bot/package.json` | Remove direct `@pocketrealm/database` dependency. |
| `package-lock.json` | Update after dependency removal if npm modifies it. |

---

## Task 1: Shared Discord XP Helpers

**Files:**
- Create: `packages/shared/src/discord/discordXp.ts`
- Create: `packages/shared/src/discord/discordXp.test.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/packageExports.test.ts`
- Modify: `apps/api/vitest.config.ts`

- [ ] **Step 1: Write helper tests**

Create `packages/shared/src/discord/discordXp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { highestRoleIdForLevel, levelForDiscordXp } from './discordXp';

describe('discord XP helpers', () => {
  it('maps Discord XP totals to community levels', () => {
    expect(levelForDiscordXp(0)).toBe(1);
    expect(levelForDiscordXp(99)).toBe(1);
    expect(levelForDiscordXp(100)).toBe(2);
    expect(levelForDiscordXp(400)).toBe(3);
  });

  it('selects the highest configured role at or below the current level', () => {
    const roles = new Map<number, string>([
      [2, 'role-level-2'],
      [5, 'role-level-5'],
      [10, 'role-level-10'],
    ]);

    expect(highestRoleIdForLevel(1, roles)).toBeNull();
    expect(highestRoleIdForLevel(2, roles)).toBe('role-level-2');
    expect(highestRoleIdForLevel(7, roles)).toBe('role-level-5');
    expect(highestRoleIdForLevel(50, roles)).toBe('role-level-10');
  });
});
```

- [ ] **Step 2: Add package export test expectation**

In `packages/shared/src/packageExports.test.ts`, add this assertion to the first test:

```ts
expect(packageJson.exports?.['./discord/discordXp']).toBeDefined();
```

- [ ] **Step 3: Run shared tests to verify failure**

Run:

```powershell
npm test -w packages/shared -- --run src/discord/discordXp.test.ts src/packageExports.test.ts
```

Expected: FAIL because `packages/shared/src/discord/discordXp.ts` and the package export do not exist.

- [ ] **Step 4: Implement helper**

Create `packages/shared/src/discord/discordXp.ts`:

```ts
import { DISCORD_XP_CONSTANTS } from '../constants/gameConstants';

const { LEVEL_CURVE_XP_DIVISOR } = DISCORD_XP_CONSTANTS;

export function levelForDiscordXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return Math.floor(Math.sqrt(safeXp / LEVEL_CURVE_XP_DIVISOR)) + 1;
}

export function highestRoleIdForLevel(level: number, levelRoleMap: Map<number, string>): string | null {
  let selectedLevel = 0;
  let selectedRoleId: string | null = null;

  for (const [roleLevel, roleId] of levelRoleMap.entries()) {
    if (level >= roleLevel && roleLevel > selectedLevel) {
      selectedLevel = roleLevel;
      selectedRoleId = roleId;
    }
  }

  return selectedRoleId;
}
```

- [ ] **Step 5: Add package subpath export**

In `packages/shared/package.json`, add this export next to `./discord/discordIds`:

```json
"./discord/discordXp": {
  "types": "./dist/discord/discordXp.d.ts",
  "default": "./dist/discord/discordXp.js"
}
```

- [ ] **Step 6: Add API vitest alias for the new subpath**

In `apps/api/vitest.config.ts`, add this alias next to the `'@pocketrealm/shared/discord/discordIds'` entry, ABOVE the generic `'@pocketrealm/shared'` entry. Order matters: vite alias keys are prefix-matched, so without an explicit subpath alias the generic entry rewrites `@pocketrealm/shared/discord/discordXp` to a broken `.../src/index.ts/discord/discordXp` path and every API test that touches the service fails at import time.

```ts
'@pocketrealm/shared/discord/discordXp': resolve(__dirname, '../../packages/shared/src/discord/discordXp.ts'),
```

- [ ] **Step 7: Run shared tests**

Run:

```powershell
npm test -w packages/shared -- --run src/discord/discordXp.test.ts src/packageExports.test.ts
```

Expected: PASS.

- [ ] **Step 8: Build the shared package**

`apps/discord-bot/vitest.config.ts` has no aliases — bot tests resolve `@pocketrealm/shared/*` subpaths through the workspace symlink and package `exports` against `packages/shared/dist`. Build shared now so `dist/discord/discordXp.js` exists before the bot tests in Tasks 5 and 6:

```powershell
npm run build -w packages/shared
```

Expected: build succeeds and `packages/shared/dist/discord/discordXp.js` exists. If you later edit `discordXp.ts`, rebuild shared before re-running bot tests.

- [ ] **Step 9: Commit shared helper**

```powershell
git add packages/shared/src/discord/discordXp.ts packages/shared/src/discord/discordXp.test.ts packages/shared/package.json packages/shared/src/packageExports.test.ts apps/api/vitest.config.ts
git commit -m "feat(discord): share community xp helpers"
```

---

## Task 2: API Discord XP Service Tests

**Files:**
- Create: `apps/api/src/services/discordXpService.test.ts`

- [ ] **Step 1: Create service test file**

Create `apps/api/src/services/discordXpService.test.ts` with deterministic Prisma and clock fakes:

```ts
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
```

- [ ] **Step 2: Run service test to verify failure**

Run:

```powershell
npm test -w apps/api -- --run src/services/discordXpService.test.ts
```

Expected: FAIL because `apps/api/src/services/discordXpService.ts` does not exist.

- [ ] **Step 3: Commit is not required yet**

Do not commit this failing test by itself unless you are using tiny TDD commits. The next task implements the service and then commits the passing slice.

---

## Task 3: API Discord XP Service Implementation

**Files:**
- Create: `apps/api/src/services/discordXpService.ts`
- Test: `apps/api/src/services/discordXpService.test.ts`

- [ ] **Step 1: Implement service types and helpers**

Create `apps/api/src/services/discordXpService.ts` with these imports, constants, and public types:

```ts
import { prisma, type Prisma } from '@pocketrealm/database';
import { DISCORD_XP_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { levelForDiscordXp } from '@pocketrealm/shared/discord/discordXp';
import { AppError } from '../middleware/errorHandler';

const {
  XP_PER_MESSAGE_MIN,
  XP_PER_MESSAGE_MAX,
  DAILY_SOFT_CAP,
  RECENT_FINGERPRINT_WINDOW_SECONDS,
} = DISCORD_XP_CONSTANTS;

const MESSAGE_XP_REASON = 'chat_message';
const MAX_XP_DECREMENT_ATTEMPTS = 5;

export type DiscordMessageXpGrantReason =
  | 'already_processed'
  | 'duplicate_fingerprint'
  | 'excluded_from_xp'
  | 'daily_cap'
  | 'granted';

export interface GrantDiscordMessageXpInput {
  discordGuildId: string;
  discordUserId: string;
  channelId: string;
  messageId: string;
  messageFingerprint: string;
}

export interface GrantDiscordMessageXpOptions {
  now?: Date;
  random?: () => number;
}

export interface GrantDiscordMessageXpResult {
  eligible: boolean;
  reason: DiscordMessageXpGrantReason;
  xpGranted?: number;
  previousLevel?: number;
  newLevel?: number;
  profileId?: string;
}

export interface AdjustDiscordXpInput {
  discordGuildId: string;
  actorDiscordUserId: string;
  targetDiscordUserId: string;
  amount: number;
  reason: string;
}

export interface AdjustDiscordXpResult {
  profileId: string | null;
  targetDiscordUserId: string;
  amount: number;
  previousXp: number;
  newXp: number;
  previousLevel: number;
  newLevel: number;
  reason: string;
}

export interface MarkDiscordXpRoleSyncedInput {
  profileId: string;
  discordGuildId: string;
  discordUserId: string;
  roleId: string;
  level: number;
  syncedAt?: Date;
}
```

Add these local helpers below the types:

```ts
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isSameUtcDay(left: Date | null, right: Date): boolean {
  return Boolean(
    left &&
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate(),
  );
}

function randomXp(randomValue: number): number {
  const bounded = Math.min(Math.max(randomValue, 0), 0.999999999);
  return XP_PER_MESSAGE_MIN + Math.floor(bounded * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1));
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  return (trimmed || 'staff adjustment').slice(0, 500);
}
```

- [ ] **Step 2: Implement `grantDiscordMessageXp`**

Add this function:

```ts
export async function grantDiscordMessageXp(
  input: GrantDiscordMessageXpInput,
  options: GrantDiscordMessageXpOptions = {},
): Promise<GrantDiscordMessageXpResult> {
  const now = options.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const existingEvent = await tx.discordXpEvent.findUnique({
      where: {
        discordGuildId_messageId: {
          discordGuildId: input.discordGuildId,
          messageId: input.messageId,
        },
      },
    });
    if (existingEvent) {
      return { eligible: false, reason: 'already_processed' };
    }

    const profile = await tx.discordCommunityProfile.findUnique({
      where: {
        discordGuildId_discordUserId: {
          discordGuildId: input.discordGuildId,
          discordUserId: input.discordUserId,
        },
      },
    });
    if (profile?.excludedFromXp) {
      return { eligible: false, reason: 'excluded_from_xp' };
    }

    const duplicate = await tx.discordXpEvent.findFirst({
      where: {
        discordGuildId: input.discordGuildId,
        discordUserId: input.discordUserId,
        messageFingerprint: input.messageFingerprint,
        createdAt: {
          gte: new Date(now.getTime() - RECENT_FINGERPRINT_WINDOW_SECONDS * 1000),
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      return { eligible: false, reason: 'duplicate_fingerprint' };
    }

    const today = startOfUtcDay(now);
    const previousXp = profile?.xp ?? 0;
    const previousLevel = profile?.level ?? levelForDiscordXp(previousXp);
    const currentDailyXp = profile && isSameUtcDay(profile.dailyXpDate, today) ? profile.dailyXp : 0;
    const remainingDailyXp = Math.max(0, DAILY_SOFT_CAP - currentDailyXp);
    if (remainingDailyXp <= 0) {
      return { eligible: false, reason: 'daily_cap' };
    }

    const rolledXp = randomXp(options.random?.() ?? Math.random());
    const xpGranted = Math.min(rolledXp, remainingDailyXp);
    const newXp = previousXp + xpGranted;
    const newLevel = levelForDiscordXp(newXp);

    const updatedProfile = profile
      ? await tx.discordCommunityProfile.update({
          where: { id: profile.id },
          data: {
            xp: { increment: xpGranted },
            level: newLevel,
            dailyXp: currentDailyXp + xpGranted,
            dailyXpDate: today,
            lastXpGrantedAt: now,
          },
        })
      : await tx.discordCommunityProfile.create({
          data: {
            discordGuildId: input.discordGuildId,
            discordUserId: input.discordUserId,
            xp: xpGranted,
            level: newLevel,
            dailyXp: xpGranted,
            dailyXpDate: today,
            lastXpGrantedAt: now,
          },
        });

    await tx.discordXpEvent.create({
      data: {
        discordGuildId: input.discordGuildId,
        discordUserId: input.discordUserId,
        channelId: input.channelId,
        messageId: input.messageId,
        messageFingerprint: input.messageFingerprint,
        xp: xpGranted,
        reason: MESSAGE_XP_REASON,
        createdAt: now,
      },
    });

    return {
      eligible: true,
      reason: 'granted',
      xpGranted,
      previousLevel,
      newLevel,
      profileId: updatedProfile.id,
    };
  });
}
```

- [ ] **Step 3: Implement staff adjustment helpers**

Add these helpers after `grantDiscordMessageXp`:

```ts
async function applyXpAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    profile: Awaited<ReturnType<Prisma.TransactionClient['discordCommunityProfile']['findUnique']>>;
    guildId: string;
    targetDiscordUserId: string;
    amount: number;
  },
) {
  if (!input.profile) {
    if (input.amount <= 0) {
      return { updatedProfile: null, appliedAmount: 0 };
    }

    return {
      updatedProfile: await tx.discordCommunityProfile.create({
        data: {
          discordGuildId: input.guildId,
          discordUserId: input.targetDiscordUserId,
          xp: input.amount,
          level: levelForDiscordXp(input.amount),
          dailyXp: 0,
        },
      }),
      appliedAmount: input.amount,
    };
  }

  if (input.amount >= 0) {
    return {
      updatedProfile: await tx.discordCommunityProfile.update({
        where: { id: input.profile.id },
        data: { xp: { increment: input.amount } },
      }),
      appliedAmount: input.amount,
    };
  }

  return applyGuardedXpDecrement(tx, input.profile, Math.abs(input.amount));
}

async function applyGuardedXpDecrement(
  tx: Prisma.TransactionClient,
  profile: NonNullable<Awaited<ReturnType<Prisma.TransactionClient['discordCommunityProfile']['findUnique']>>>,
  requestedDecrement: number,
) {
  let currentProfile: typeof profile | null = profile;

  for (let attempt = 0; attempt < MAX_XP_DECREMENT_ATTEMPTS; attempt += 1) {
    if (!currentProfile || currentProfile.xp <= 0) {
      return { updatedProfile: currentProfile, appliedAmount: 0 };
    }

    const decrement = Math.min(requestedDecrement, currentProfile.xp);
    const update = await tx.discordCommunityProfile.updateMany({
      where: { id: currentProfile.id, xp: currentProfile.xp },
      data: { xp: { decrement } },
    });

    if (update.count === 1) {
      const updatedProfile = await tx.discordCommunityProfile.findUnique({
        where: { id: currentProfile.id },
      });
      if (!updatedProfile) {
        throw new Error('Discord community profile disappeared after XP decrement');
      }

      return { updatedProfile, appliedAmount: -decrement };
    }

    currentProfile = await tx.discordCommunityProfile.findUnique({
      where: { id: currentProfile.id },
    });
  }

  throw new Error('Could not apply Discord staff XP decrement safely');
}
```

- [ ] **Step 4: Implement `adjustDiscordXp` and failure audit**

Add:

```ts
export async function adjustDiscordXp(input: AdjustDiscordXpInput): Promise<AdjustDiscordXpResult> {
  const reason = normalizeReason(input.reason);

  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.discordCommunityProfile.findUnique({
        where: {
          discordGuildId_discordUserId: {
            discordGuildId: input.discordGuildId,
            discordUserId: input.targetDiscordUserId,
          },
        },
      });
      const previousXp = profile?.xp ?? 0;
      const { updatedProfile, appliedAmount } = await applyXpAdjustment(tx, {
        profile,
        guildId: input.discordGuildId,
        targetDiscordUserId: input.targetDiscordUserId,
        amount: input.amount,
      });
      const newXp = updatedProfile?.xp ?? 0;
      const effectivePreviousXp = Math.max(0, newXp - appliedAmount);
      const previousLevel = levelForDiscordXp(effectivePreviousXp);
      const newLevel = levelForDiscordXp(newXp);
      const normalizedProfile = updatedProfile && updatedProfile.level !== newLevel
        ? await tx.discordCommunityProfile.update({
            where: { id: updatedProfile.id },
            data: { level: newLevel },
          })
        : updatedProfile;

      await tx.discordBotAuditEvent.create({
        data: {
          guildId: input.discordGuildId,
          actorDiscordUserId: input.actorDiscordUserId,
          targetDiscordUserId: input.targetDiscordUserId,
          command: '/staff xp-adjust',
          status: 'success',
          metadata: {
            amount: input.amount,
            appliedAmount,
            previousXp: effectivePreviousXp,
            newXp,
            previousLevel,
            newLevel,
            reason,
          },
        },
      });

      return {
        profileId: normalizedProfile?.id ?? null,
        targetDiscordUserId: input.targetDiscordUserId,
        amount: input.amount,
        previousXp: effectivePreviousXp,
        newXp,
        previousLevel,
        newLevel,
        reason,
      };
    });
  } catch (error) {
    await recordDiscordXpAdjustmentFailure(input, reason).catch(() => undefined);
    throw error;
  }
}

async function recordDiscordXpAdjustmentFailure(input: AdjustDiscordXpInput, reason: string): Promise<void> {
  await prisma.discordBotAuditEvent.create({
    data: {
      guildId: input.discordGuildId,
      actorDiscordUserId: input.actorDiscordUserId,
      targetDiscordUserId: input.targetDiscordUserId,
      command: '/staff xp-adjust',
      status: 'failed',
      errorCode: 'DISCORD_STAFF_XP_ADJUST_FAILED',
      metadata: {
        amount: input.amount,
        reason,
      },
    },
  });
}
```

- [ ] **Step 5: Implement role-sync recording**

Add:

```ts
export async function markDiscordXpRoleSynced(input: MarkDiscordXpRoleSyncedInput) {
  const syncedAt = input.syncedAt ?? new Date();
  const result = await prisma.discordCommunityProfile.updateMany({
    where: {
      id: input.profileId,
      discordGuildId: input.discordGuildId,
      discordUserId: input.discordUserId,
    },
    data: {
      lastRoleSyncAt: syncedAt,
    },
  });

  if (result.count === 0) {
    throw new AppError(404, 'Discord community profile not found', 'DISCORD_XP_PROFILE_NOT_FOUND');
  }

  return {
    profileId: input.profileId,
    lastRoleSyncAt: syncedAt,
  };
}
```

- [ ] **Step 6: Run service tests**

Run:

```powershell
npm test -w apps/api -- --run src/services/discordXpService.test.ts
```

Expected: PASS. If TypeScript rejects the `Prisma.TransactionClient` return-type helper, replace it with a local structural profile type:

```ts
type DiscordCommunityProfileForXp = {
  id: string;
  discordGuildId: string;
  discordUserId: string;
  xp: number;
  level: number;
  dailyXp: number;
  dailyXpDate: Date | null;
  excludedFromXp: boolean;
};
```

Then type `profile` and `currentProfile` as `DiscordCommunityProfileForXp | null`.

- [ ] **Step 7: Commit API service**

```powershell
git add apps/api/src/services/discordXpService.ts apps/api/src/services/discordXpService.test.ts
git commit -m "feat(discord): add xp api service"
```

---

## Task 4: API Schemas And Routes

**Files:**
- Modify: `apps/api/src/services/discordSchemas.ts`
- Modify: `apps/api/src/routes/discord.ts`
- Test: `apps/api/src/routes/discord.test.ts`

- [ ] **Step 1: Add route mocks to `discord.test.ts`**

In the `mocks` hoisted object in `apps/api/src/routes/discord.test.ts`, add:

```ts
grantDiscordMessageXp: vi.fn(),
adjustDiscordXp: vi.fn(),
markDiscordXpRoleSynced: vi.fn(),
```

Add this mock block after the existing service mocks:

```ts
vi.mock('../services/discordXpService', () => ({
  grantDiscordMessageXp: mocks.grantDiscordMessageXp,
  adjustDiscordXp: mocks.adjustDiscordXp,
  markDiscordXpRoleSynced: mocks.markDiscordXpRoleSynced,
}));
```

- [ ] **Step 2: Add route tests**

Add these tests near the other internal Discord route tests in `apps/api/src/routes/discord.test.ts`:

```ts
it('grants Discord message XP through the internal API', async () => {
  mocks.grantDiscordMessageXp.mockResolvedValue({
    eligible: true,
    reason: 'granted',
    xpGranted: 8,
    previousLevel: 1,
    newLevel: 2,
    profileId: 'profile-1',
  });

  const res = await request(app())
    .post('/api/v1/discord/xp/messages')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .send({
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      channelId: DISCORD_CHANNEL_ID,
      messageId: DISCORD_MESSAGE_ID,
      messageFingerprint: 'a'.repeat(64),
    })
    .expect(200);

  expect(res.body.result).toEqual({
    eligible: true,
    reason: 'granted',
    xpGranted: 8,
    previousLevel: 1,
    newLevel: 2,
    profileId: 'profile-1',
  });
  expect(mocks.grantDiscordMessageXp).toHaveBeenCalledWith({
    discordGuildId: DISCORD_GUILD_ID,
    discordUserId: DISCORD_USER_ID,
    channelId: DISCORD_CHANNEL_ID,
    messageId: DISCORD_MESSAGE_ID,
    messageFingerprint: 'a'.repeat(64),
  });
});

it('rejects raw message content on Discord message XP route', async () => {
  await request(app())
    .post('/api/v1/discord/xp/messages')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .send({
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      channelId: DISCORD_CHANNEL_ID,
      messageId: DISCORD_MESSAGE_ID,
      messageFingerprint: 'a'.repeat(64),
      content: 'this must never cross the API boundary',
    })
    .expect(400);

  expect(mocks.grantDiscordMessageXp).not.toHaveBeenCalled();
});

it('applies staff Discord XP adjustments through the internal API', async () => {
  mocks.adjustDiscordXp.mockResolvedValue({
    profileId: 'profile-1',
    targetDiscordUserId: DISCORD_TARGET_USER_ID,
    amount: 20,
    previousXp: 90,
    newXp: 110,
    previousLevel: 1,
    newLevel: 2,
    reason: 'manual event credit',
  });

  const res = await request(app())
    .post('/api/v1/discord/xp/adjustments')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .send({
      discordGuildId: DISCORD_GUILD_ID,
      actorDiscordUserId: DISCORD_USER_ID,
      targetDiscordUserId: DISCORD_TARGET_USER_ID,
      amount: 20,
      reason: ' manual event credit ',
    })
    .expect(200);

  expect(res.body.adjustment).toMatchObject({
    newXp: 110,
    newLevel: 2,
    reason: 'manual event credit',
  });
  expect(mocks.adjustDiscordXp).toHaveBeenCalledWith({
    discordGuildId: DISCORD_GUILD_ID,
    actorDiscordUserId: DISCORD_USER_ID,
    targetDiscordUserId: DISCORD_TARGET_USER_ID,
    amount: 20,
    reason: 'manual event credit',
  });
});

it('records Discord XP role sync through the internal API', async () => {
  mocks.markDiscordXpRoleSynced.mockResolvedValue({
    profileId: 'profile-1',
    lastRoleSyncAt: new Date(LINKED_AT),
  });

  const res = await request(app())
    .post('/api/v1/discord/xp/role-sync')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .send({
      profileId: '11111111-1111-4111-8111-111111111111',
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      roleId: '78901234567890123',
      level: 2,
      syncedAt: LINKED_AT,
    })
    .expect(200);

  expect(res.body.roleSync).toEqual({
    profileId: 'profile-1',
    lastRoleSyncAt: LINKED_AT,
  });
  expect(mocks.markDiscordXpRoleSynced).toHaveBeenCalledWith({
    profileId: '11111111-1111-4111-8111-111111111111',
    discordGuildId: DISCORD_GUILD_ID,
    discordUserId: DISCORD_USER_ID,
    roleId: '78901234567890123',
    level: 2,
    syncedAt: new Date(LINKED_AT),
  });
});
```

- [ ] **Step 3: Run route tests to verify failure**

Run:

```powershell
npm test -w apps/api -- --run src/routes/discord.test.ts
```

Expected: FAIL because schemas and routes do not exist.

- [ ] **Step 4: Add schemas**

In `apps/api/src/services/discordSchemas.ts`, add:

```ts
export const discordXpMessageGrantSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
  channelId: discordSnowflakeSchema,
  messageId: discordSnowflakeSchema,
  messageFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const discordXpAdjustmentSchema = z.object({
  discordGuildId: discordSnowflakeSchema,
  actorDiscordUserId: discordSnowflakeSchema,
  targetDiscordUserId: discordSnowflakeSchema,
  amount: z.number().int(),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const discordXpRoleSyncSchema = z.object({
  profileId: z.string().uuid(),
  discordGuildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
  roleId: discordSnowflakeSchema,
  level: z.number().int().min(1),
  syncedAt: z.coerce.date().optional(),
}).strict();
```

- [ ] **Step 5: Add route imports**

In `apps/api/src/routes/discord.ts`, add imports:

```ts
import {
  adjustDiscordXp,
  grantDiscordMessageXp,
  markDiscordXpRoleSynced,
} from '../services/discordXpService';
```

Extend the `discordSchemas` import list with:

```ts
discordXpAdjustmentSchema,
discordXpMessageGrantSchema,
discordXpRoleSyncSchema,
```

- [ ] **Step 6: Add routes**

In `apps/api/src/routes/discord.ts`, add these routes after the wiki route and before support report routes:

```ts
discordRouter.post('/xp/messages', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordXpMessageGrantSchema.parse(req.body);
  const result = await grantDiscordMessageXp(input);

  res.json({ result });
}));

discordRouter.post('/xp/adjustments', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordXpAdjustmentSchema.parse(req.body);
  const adjustment = await adjustDiscordXp(input);

  res.json({ adjustment });
}));

discordRouter.post('/xp/role-sync', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordXpRoleSyncSchema.parse(req.body);
  const roleSync = await markDiscordXpRoleSynced(input);

  res.json({ roleSync });
}));
```

- [ ] **Step 7: Run API tests**

Run:

```powershell
npm test -w apps/api -- --run src/routes/discord.test.ts src/services/discordXpService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit API routes**

```powershell
git add apps/api/src/services/discordSchemas.ts apps/api/src/routes/discord.ts apps/api/src/routes/discord.test.ts
git commit -m "feat(discord): expose internal xp endpoints"
```

---

## Task 5: Migrate Bot Message XP To The API

**Files:**
- Modify: `apps/discord-bot/src/xp/messageXp.ts`
- Modify: `apps/discord-bot/src/xp/messageXp.test.ts`
- Modify: `apps/discord-bot/src/index.ts`

- [ ] **Step 1: Update message XP test setup**

In `apps/discord-bot/src/xp/messageXp.test.ts`, remove imports from `../prismaTypes.js`. Also remove the `maps Discord XP totals to levels` test from this file because `packages/shared/src/discord/discordXp.test.ts` now owns that pure helper coverage.

Define a fake API client type and helper in the test file:

```ts
interface MockApi {
  post: ReturnType<typeof vi.fn>;
}

function createApi(result: unknown = {
  result: {
    eligible: true,
    reason: 'granted',
    xpGranted: 8,
    previousLevel: 1,
    newLevel: 2,
    profileId: 'profile-1',
  },
}): MockApi {
  return {
    post: vi.fn(async () => result),
  };
}
```

- [ ] **Step 2: Replace DB-backed tests with API-backed assertions**

The API now owns the database-backed checks, so each existing test gets one of three dispositions:

Keep unchanged (pure local eligibility, no Prisma):
- `rejects messages shorter than the minimum length`
- `rejects configured ignored channels such as duels`
- `rejects the configured duels channel by id even if the channel is renamed`
- `rejects cooldown hits using Redis NX semantics`

Delete (the behavior moved to `discordXpService.test.ts` in Task 2, and these call `evaluateXpMessage`/`grantXpForMessage` with the `prisma` option that no longer exists):
- `maps Discord XP totals to levels` (already removed in Step 1)
- `rejects repeated near-identical fingerprints in the recent event window`
- `rejects users excluded from XP`
- `caps partial grants at the daily soft cap`
- `releases the cooldown when the message was already processed` (the API-denial cooldown-release test below covers this path — `already_processed` and `daily_cap` denials behave identically in the bot)

Replace per the snippets below:
- `grants deterministic message XP, updates level, and stores no raw content`
- `does not grant XP after the daily soft cap is reached`
- `releases the cooldown when the XP transaction fails`
- `adds the highest configured level role when a member is available and level increases`

Replace `grants deterministic message XP, updates level, and stores no raw content` with:

```ts
it('sends fingerprint-only message XP grants to the PocketRealm API', async () => {
  const api = createApi();
  const message = createMessage();
  const redis = createRedis();

  const result = await grantXpForMessage(message, {
    api,
    redis,
    config: createConfig(),
    now: () => now,
    logger: {},
  });

  expect(result).toMatchObject({
    eligible: true,
    reason: 'granted',
    xpGranted: 8,
    previousLevel: 1,
    newLevel: 2,
  });
  expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/messages', {
    discordGuildId: guildId,
    discordUserId: userId,
    channelId,
    messageId: message.id,
    messageFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(JSON.stringify(api.post.mock.calls)).not.toContain(message.content);
  expect(redis.del).not.toHaveBeenCalled();
});
```

Replace `does not grant XP after the daily soft cap is reached` with:

```ts
it('releases the cooldown when the API denies a message XP grant', async () => {
  const api = createApi({
    result: {
      eligible: false,
      reason: 'daily_cap',
    },
  });
  const redis = createRedis();

  const result = await grantXpForMessage(createMessage(), {
    api,
    redis,
    config: createConfig(),
    now: () => now,
    logger: {},
  });

  expect(result).toMatchObject({ eligible: false, reason: 'daily_cap' });
  expect(redis.del).toHaveBeenCalledWith(`discord:xp:cooldown:${guildId}:${userId}`);
});
```

Replace `releases the cooldown when the XP transaction fails` with:

```ts
it('releases the cooldown when the API grant fails', async () => {
  const api = {
    post: vi.fn(async (): Promise<never> => {
      throw new Error('api unavailable');
    }),
  };
  const redis = createRedis();

  await expect(grantXpForMessage(createMessage(), {
    api,
    redis,
    config: createConfig(),
    now: () => now,
    logger: {},
  })).rejects.toThrow('api unavailable');

  expect(redis.del).toHaveBeenCalledWith(`discord:xp:cooldown:${guildId}:${userId}`);
});
```

Replace `adds the highest configured level role when a member is available and level increases` with:

```ts
it('adds the highest configured level role and records role sync through the API', async () => {
  const api = createApi({
    result: {
      eligible: true,
      reason: 'granted',
      xpGranted: 12,
      previousLevel: 2,
      newLevel: 3,
      profileId: 'profile-1',
    },
  });
  const add = vi.fn<GuildMember['roles']['add']>(async () => ({} as GuildMember));
  const member = { roles: { add } } as unknown as GuildMember;

  const result = await grantXpForMessage(createMessage({ member }), {
    api,
    redis: createRedis(),
    config: createConfig({
      levelRoleMap: new Map([
        [2, levelTwoRoleId],
        [5, levelFiveRoleId],
      ]),
    }),
    now: () => now,
    logger: {},
  });

  expect(result).toMatchObject({ eligible: true, newLevel: 3 });
  expect(add).toHaveBeenCalledWith(levelTwoRoleId);
  expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/role-sync', {
    profileId: 'profile-1',
    discordGuildId: guildId,
    discordUserId: userId,
    roleId: levelTwoRoleId,
    level: 3,
    syncedAt: now.toISOString(),
  });
});
```

Remove the `createPrisma` and `createProfile` helpers and the fake Prisma delegate types from the bottom of the file once no remaining test uses them.

- [ ] **Step 3: Run bot message XP test to verify failure**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/xp/messageXp.test.ts
```

Expected: FAIL because `messageXp.ts` still expects Prisma dependencies.

- [ ] **Step 4: Update `messageXp.ts` dependency types**

In `apps/discord-bot/src/xp/messageXp.ts`, delete the local `levelForDiscordXp` and `highestRoleIdForLevel` function definitions (the shared package now owns them) and replace the Prisma imports with the shared helper:

```ts
import { highestRoleIdForLevel } from '@pocketrealm/shared/discord/discordXp';

// Temporary re-export: staffCommands.ts still imports these from this file
// until Task 6 switches it to the shared import. Task 6 removes this line.
export { highestRoleIdForLevel, levelForDiscordXp } from '@pocketrealm/shared/discord/discordXp';
```

Without the deletion of the local definitions, the new import collides with the existing `highestRoleIdForLevel` declaration and the file does not compile. Without the temporary re-export, `staffCommands.ts` (migrated in Task 6) breaks the typecheck at this task's commit.

Remove:

```ts
import type {
  DiscordCommunityProfileRecord,
  MessageXpPrismaClient,
  MessageXpTransactionClient,
} from '../prismaTypes.js';
```

Add API response interfaces near the logger type:

```ts
interface DiscordMessageXpApiResponse {
  result: GrantXpMessageResult & {
    profileId?: string;
  };
}

interface MessageXpApiClient {
  post<T>(path: string, body: unknown): Promise<T>;
}
```

Change `EvaluateXpMessageOptions`:

```ts
export interface EvaluateXpMessageOptions {
  redis?: MessageXpRedisClient;
  config?: Partial<MessageXpConfig>;
  now?: () => Date;
}
```

Change `GrantXpMessageDeps`:

```ts
export interface GrantXpMessageDeps {
  api: MessageXpApiClient;
  redis?: MessageXpRedisClient;
  config: MessageXpConfig;
  now?: () => Date;
  logger?: MessageXpLogger;
}
```

- [ ] **Step 5: Remove DB-backed evaluation from `evaluateXpMessage`**

Delete the `options.prisma` block that calls `findProfile` and `discordXpEvent.findFirst`. The API now owns `excluded_from_xp` and `duplicate_fingerprint`.

Keep Redis cooldown logic unchanged.

- [ ] **Step 6: Replace transaction logic with API call**

In `grantXpForMessage`, replace the Prisma transaction block with:

```ts
let apiResult: DiscordMessageXpApiResponse['result'];

try {
  const response = await deps.api.post<DiscordMessageXpApiResponse>('/api/v1/discord/xp/messages', {
    discordGuildId: guildId,
    discordUserId: userId,
    channelId: message.channelId,
    messageId: message.id,
    messageFingerprint: fingerprint,
  });
  apiResult = response.result;
} catch (error) {
  await releaseCooldown(deps.redis, cooldownReleaseKey);
  throw error;
}

if (!apiResult.eligible) {
  await releaseCooldown(deps.redis, cooldownReleaseKey);
}

if (
  apiResult.eligible &&
  apiResult.profileId &&
  apiResult.previousLevel !== undefined &&
  apiResult.newLevel !== undefined &&
  apiResult.newLevel > apiResult.previousLevel
) {
  await syncHighestLevelRole(message, deps, apiResult.profileId, apiResult.newLevel, now);
}

return {
  eligible: apiResult.eligible,
  reason: apiResult.reason,
  xpGranted: apiResult.xpGranted,
  previousLevel: apiResult.previousLevel,
  newLevel: apiResult.newLevel,
};
```

Delete `GrantTransactionResult`, `findProfile`, `randomXp`, `startOfUtcDay`, and `isSameUtcDay` from the bot file. In the `DISCORD_XP_CONSTANTS` destructure at the top, keep only the constants still used by local eligibility (`XP_COOLDOWN_SECONDS`, `MIN_MESSAGE_LENGTH`, `RECENT_FINGERPRINT_WINDOW_SECONDS` if still referenced) and remove the rest (`XP_PER_MESSAGE_MIN`, `XP_PER_MESSAGE_MAX`, `DAILY_SOFT_CAP`, `LEVEL_CURVE_XP_DIVISOR`) — unused destructured values fail the strict TypeScript build.

- [ ] **Step 7: Update role-sync timestamp reporting**

In `syncHighestLevelRole`, replace the Prisma update with an API call:

```ts
    await deps.api.post('/api/v1/discord/xp/role-sync', {
      profileId,
      discordGuildId: message.guildId,
      discordUserId: message.author.id,
      roleId,
      level: newLevel,
      syncedAt: now.toISOString(),
    });
```

Keep the existing `try/catch` around role assignment and sync. The catch should continue logging `Discord XP level role sync failed`.

- [ ] **Step 8: Update bot startup injection**

In `apps/discord-bot/src/index.ts`, remove:

```ts
import { getDefaultDiscordPrisma } from './prismaTypes.js';
```

Change message XP construction to:

```ts
const messageXp = createMessageXpService({
  api,
  redis,
  config,
  logger,
});
```

- [ ] **Step 9: Run bot message XP tests**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/xp/messageXp.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit message XP migration**

```powershell
git add apps/discord-bot/src/xp/messageXp.ts apps/discord-bot/src/xp/messageXp.test.ts apps/discord-bot/src/index.ts
git commit -m "feat(discord): route message xp through api"
```

---

## Task 6: Migrate Staff XP Adjustment To The API

**Files:**
- Modify: `apps/discord-bot/src/interactions/staffCommands.ts`
- Modify: `apps/discord-bot/src/interactions/staffCommands.test.ts`
- Modify: `apps/discord-bot/src/xp/messageXp.ts` (remove the temporary re-export added in Task 5)

- [ ] **Step 1: Update staff command tests to use API fakes**

In `apps/discord-bot/src/interactions/staffCommands.test.ts`, remove:

```ts
import type { StaffPrismaClient } from '../prismaTypes.js';
```

Remove the `createPrisma`, `MockProfile`, and `MockProfileUpdateData` helpers at the bottom of the file.

Change the first XP adjustment test to:

```ts
it('calls the API for XP adjustments', async () => {
  const api = createApi({
    adjustment: {
      profileId: 'profile-1',
      targetDiscordUserId: targetUserId,
      amount: 20,
      previousXp: 90,
      newXp: 110,
      previousLevel: 1,
      newLevel: 2,
      reason: 'manual event credit',
    },
  });
  const interaction = createStaffInteraction({
    member: memberWithRoles([staffRoleId]),
    subcommand: 'xp-adjust',
    targetUserId,
    amount: 20,
    reason: 'manual event credit',
  });

  await handleStaffCommand(interaction, {
    api,
    config,
  });

  expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/adjustments', {
    discordGuildId: guildId,
    actorDiscordUserId: actorUserId,
    targetDiscordUserId: targetUserId,
    amount: 20,
    reason: 'manual event credit',
  });
  expect(interaction.editReply).toHaveBeenCalledWith({
    content: 'Adjusted <@789012345678901234> by 20 XP. New total: 110 XP (level 2).',
  });
});
```

Change `createApi` to accept optional path results:

```ts
function createApi(postResult: unknown = {}): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(),
    post: vi.fn(async () => postResult),
  } as unknown as Pick<PocketRealmApiClient, 'get' | 'post'>;
}
```

- [ ] **Step 2: Update staff level-role test**

Replace the level-role test body with:

```ts
const add = vi.fn<GuildMember['roles']['add']>(async () => ({} as GuildMember));
const targetMember = { roles: { add } } as unknown as GuildMember;
const guild = createGuild(targetMember);
const api = createApi({
  adjustment: {
    profileId: 'profile-1',
    targetDiscordUserId: targetUserId,
    amount: 20,
    previousXp: 90,
    newXp: 110,
    previousLevel: 1,
    newLevel: 2,
    reason: 'manual event credit',
  },
});
const interaction = createStaffInteraction({
  member: memberWithRoles([staffRoleId]),
  subcommand: 'xp-adjust',
  targetUserId,
  amount: 20,
  reason: 'manual event credit',
  guild,
});

await handleStaffCommand(interaction, {
  api,
  config: {
    ...config,
    levelRoleMap: new Map([[2, levelTwoRoleId]]),
  },
});

expect(guild.members.fetch).toHaveBeenCalledWith(targetUserId);
expect(add).toHaveBeenCalledWith(levelTwoRoleId);
expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/role-sync', {
  profileId: 'profile-1',
  discordGuildId: guildId,
  discordUserId: targetUserId,
  roleId: levelTwoRoleId,
  level: 2,
  syncedAt: expect.any(String),
});
```

Replace the guarded decrement test with an API assertion:

```ts
it('passes negative XP adjustments through the API', async () => {
  const api = createApi({
    adjustment: {
      profileId: 'profile-1',
      targetDiscordUserId: targetUserId,
      amount: -200,
      previousXp: 90,
      newXp: 0,
      previousLevel: 1,
      newLevel: 1,
      reason: 'remove mistaken credit',
    },
  });
  const interaction = createStaffInteraction({
    member: memberWithRoles([staffRoleId]),
    subcommand: 'xp-adjust',
    targetUserId,
    amount: -200,
    reason: 'remove mistaken credit',
  });

  await handleStaffCommand(interaction, { api, config });

  expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/adjustments', expect.objectContaining({
    targetDiscordUserId: targetUserId,
    amount: -200,
    reason: 'remove mistaken credit',
  }));
  expect(interaction.editReply).toHaveBeenCalledWith({
    content: 'Adjusted <@789012345678901234> by -200 XP. New total: 0 XP (level 1).',
  });
});
```

Keep the non-staff, sync-roles, cleanup-triage, and failure-response tests.

- [ ] **Step 3: Run staff tests to verify failure**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/interactions/staffCommands.test.ts
```

Expected: FAIL because `staffCommands.ts` still imports Prisma and does local adjustment.

- [ ] **Step 4: Update staff command imports and option types**

In `apps/discord-bot/src/interactions/staffCommands.ts`, remove:

```ts
import { getDefaultDiscordPrisma } from '../prismaTypes.js';
import type {
  DiscordCommunityProfileRecord,
  StaffPrismaClient,
  StaffTransactionClient,
} from '../prismaTypes.js';
import { highestRoleIdForLevel, levelForDiscordXp } from '../xp/messageXp.js';
```

Add:

```ts
import { highestRoleIdForLevel } from '@pocketrealm/shared/discord/discordXp';
```

Remove `MAX_XP_DECREMENT_ATTEMPTS`.

Now that nothing imports the XP helpers from `messageXp.js`, remove the temporary re-export line from `apps/discord-bot/src/xp/messageXp.ts`:

```ts
export { highestRoleIdForLevel, levelForDiscordXp } from '@pocketrealm/shared/discord/discordXp';
```

Verify no importers remain:

```powershell
rg -n "from '\.\./xp/messageXp|levelForDiscordXp|highestRoleIdForLevel" apps/discord-bot/src --glob "!*.test.ts"
```

Expected: only the shared-package imports inside `messageXp.ts` and `staffCommands.ts` remain.

Change `StaffCommandOptions` to remove `prisma?: StaffPrismaClient`.

Change `XpAdjustmentResult` so the target field matches the API response:

```ts
interface XpAdjustmentResult {
  profileId: string | null;
  targetDiscordUserId: string;
  amount: number;
  previousXp: number;
  newXp: number;
  previousLevel: number;
  newLevel: number;
  reason: string;
}
```

Add API response interfaces:

```ts
interface XpAdjustmentApiResponse {
  adjustment: XpAdjustmentResult;
}

interface XpRoleSyncApiClient {
  post<T>(path: string, body: unknown): Promise<T>;
}
```

- [ ] **Step 5: Replace `handleXpAdjust` implementation**

Replace `handleXpAdjust` with:

```ts
async function handleXpAdjust(
  interaction: ChatInputCommandInteraction,
  options: StaffCommandOptions,
): Promise<void> {
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = normalizeReason(interaction.options.getString('reason', true));

  try {
    const response = await options.api.post<XpAdjustmentApiResponse>('/api/v1/discord/xp/adjustments', {
      discordGuildId: interaction.guildId!,
      actorDiscordUserId: interaction.user.id,
      targetDiscordUserId: target.id,
      amount,
      reason,
    });
    const adjustment = response.adjustment;

    await syncAdjustedLevelRole(interaction.guild, options.api, options.config, adjustment, options.now?.() ?? new Date());

    await interaction.editReply({
      content: `Adjusted <@${target.id}> by ${amount} XP. New total: ${adjustment.newXp} XP (level ${adjustment.newLevel}).`,
    });
  } catch {
    await interaction.editReply({
      content: 'Could not adjust Discord XP right now. Try again or check bot logs.',
    });
  }
}
```

Delete `adjustDiscordXp`, `applyXpAdjustment`, `applyGuardedXpDecrement`, and `recordStaffFailure` from the bot file.

- [ ] **Step 6: Update staff role-sync reporting**

Change `syncAdjustedLevelRole` signature:

```ts
async function syncAdjustedLevelRole(
  guild: Guild | null,
  api: XpRoleSyncApiClient,
  config: StaffConfig,
  adjustment: XpAdjustmentResult,
  now: Date,
): Promise<void> {
```

Replace the Prisma timestamp update with:

```ts
  if (adjustment.profileId) {
    await api.post('/api/v1/discord/xp/role-sync', {
      profileId: adjustment.profileId,
      discordGuildId: guild.id,
      discordUserId: adjustment.targetDiscordUserId,
      roleId,
      level: adjustment.newLevel,
      syncedAt: now.toISOString(),
    }).catch(() => undefined);
  }
```

Keep the existing Discord role fetch/add behavior.

- [ ] **Step 7: Run staff command tests**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/interactions/staffCommands.test.ts src/xp/messageXp.test.ts
```

Expected: PASS (message XP tests included because this task touches `messageXp.ts`).

- [ ] **Step 8: Commit staff migration**

```powershell
git add apps/discord-bot/src/interactions/staffCommands.ts apps/discord-bot/src/interactions/staffCommands.test.ts apps/discord-bot/src/xp/messageXp.ts
git commit -m "feat(discord): route staff xp through api"
```

---

## Task 7: Remove Bot Prisma Dependency And Add Boundary Guard

**Files:**
- Create: `apps/discord-bot/src/architectureBoundaries.test.ts`
- Delete: `apps/discord-bot/src/prismaTypes.ts`
- Modify: `apps/discord-bot/package.json`
- Modify: `package-lock.json` if npm updates it

- [ ] **Step 1: Create bot boundary test**

Create `apps/discord-bot/src/architectureBoundaries.test.ts`:

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('discord bot architecture boundaries', () => {
  it('does not import the database package from bot source', () => {
    const packageJson = JSON.parse(readRepoFile('apps/discord-bot/package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.['@pocketrealm/database']).toBeUndefined();
  });

  it('keeps production bot source free of Prisma imports', () => {
    const productionFiles = [
      'apps/discord-bot/src/index.ts',
      'apps/discord-bot/src/xp/messageXp.ts',
      'apps/discord-bot/src/interactions/staffCommands.ts',
    ];

    for (const file of productionFiles) {
      const source = readRepoFile(file);
      expect(source, file).not.toContain('@pocketrealm/database');
      expect(source, file).not.toContain('prismaTypes');
    }
  });
});
```

- [ ] **Step 2: Run boundary test to verify failure**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/architectureBoundaries.test.ts
```

Expected: FAIL because `apps/discord-bot/package.json` still depends on `@pocketrealm/database`.

- [ ] **Step 3: Remove dependency**

In `apps/discord-bot/package.json`, remove this dependency:

```json
"@pocketrealm/database": "*",
```

Run:

```powershell
npm install --package-lock-only
```

Expected: npm updates `package-lock.json` if the workspace dependency graph changed.

- [ ] **Step 4: Delete Prisma types file**

Delete:

```powershell
Remove-Item -LiteralPath apps/discord-bot/src/prismaTypes.ts
```

Before deleting, verify no imports remain:

```powershell
rg -n "prismaTypes|@pocketrealm/database|getDefaultDiscordPrisma|StaffPrismaClient|MessageXpPrismaClient" apps/discord-bot
```

Expected: no matches in production source. If tests still match because old fake types remain, remove those fakes before deleting the file.

- [ ] **Step 5: Run bot tests**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/architectureBoundaries.test.ts src/xp/messageXp.test.ts src/interactions/staffCommands.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit boundary cleanup**

```powershell
git add apps/discord-bot/src/architectureBoundaries.test.ts apps/discord-bot/package.json package-lock.json
git add -u apps/discord-bot/src/prismaTypes.ts
git commit -m "chore(discord): remove bot prisma dependency"
```

---

## Task 8: Focused Verification

**Files:** none.

Note: `rtk` is an optional output-compressing wrapper. If it is not available in your shell, run the same commands without the `rtk` prefix.

- [ ] **Step 1: Run API focused tests**

Run:

```powershell
npm test -w apps/api -- --run src/routes/discord.test.ts src/services/discordXpService.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run bot focused tests**

Run:

```powershell
npm test -w apps/discord-bot -- --run src/architectureBoundaries.test.ts src/xp/messageXp.test.ts src/interactions/staffCommands.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run shared focused tests**

Run:

```powershell
npm test -w packages/shared -- --run src/discord/discordXp.test.ts src/packageExports.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full typecheck**

Run:

```powershell
rtk npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Run targeted builds**

Run:

```powershell
npm run build:api
npm run build:discord-bot
```

Expected: both builds pass.

- [ ] **Step 6: Commit verification fixes if needed**

If any verification command required fixes, stage only the touched files:

```powershell
rtk git status
git add packages/shared apps/api/src apps/discord-bot/src apps/discord-bot/package.json package-lock.json
git commit -m "fix(discord): address xp api migration verification"
```

---

## Task 9: Final Cleanup With Simplify

**Files:** touched files only.

- [ ] **Step 1: Invoke simplify skill**

Use `superpowers:simplify` and review only the diff touched by this implementation.

- [ ] **Step 2: Apply worthwhile simplifications**

Keep cleanup scoped to:

- `packages/shared/src/discord/discordXp.ts`
- `apps/api/src/services/discordXpService.ts`
- `apps/api/src/routes/discord.ts`
- `apps/api/src/services/discordSchemas.ts`
- `apps/discord-bot/src/xp/messageXp.ts`
- `apps/discord-bot/src/interactions/staffCommands.ts`
- tests touched by this plan

Do not refactor unrelated Discord support, duel, link, or triage code.

- [ ] **Step 3: Re-run focused verification**

Run:

```powershell
npm test -w apps/api -- --run src/routes/discord.test.ts src/services/discordXpService.test.ts
npm test -w apps/discord-bot -- --run src/architectureBoundaries.test.ts src/xp/messageXp.test.ts src/interactions/staffCommands.test.ts
npm test -w packages/shared -- --run src/discord/discordXp.test.ts src/packageExports.test.ts
rtk npm run typecheck
npm run build:api
npm run build:discord-bot
```

Expected: all commands pass.

- [ ] **Step 4: Commit final cleanup if needed**

If simplify produced changes:

```powershell
git add packages/shared apps/api/src apps/discord-bot/src apps/discord-bot/package.json package-lock.json
git commit -m "refactor(discord): simplify xp api migration"
```

- [ ] **Step 5: Final status**

Run:

```powershell
rtk git status
```

Expected: clean working tree.
