# Event-Driven Scheduling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every fixed-cadence DB query from the API process so Neon's compute endpoint can suspend during genuinely idle periods, while preserving gameplay semantics for active bosses, expeditions, and connected players.

**Architecture:** Replace the 5s/60s polling scheduler with an in-process `setTimeout` registry that holds at most one timer per pending `BossEncounter.nextRoundAt` / `GuildExpedition.nextRoundAt`. Rehydrate the registry from DB on server boot. Convert the remaining three fixed-cadence timers (mob cleanup, leaderboards, auth tokens) to activity-triggered or lazy-on-touch patterns. Extend world event triggers to cover login + events-list endpoints.

**Tech Stack:** TypeScript, Node.js, Prisma 6, Redis (ioredis), Vitest, Express 4

**Spec:** `docs/superpowers/specs/2026-04-11-event-driven-scheduling-design.md`

**Branch:** create a new worktree before starting, e.g. `./scripts/setup-worktree.sh feat/scale-to-zero`

---

## Prerequisites

**Read before starting any service-test task:** The lifecycle-hook tests in Tasks 4–7, 9, 11 modify *existing* test files that already have established mock patterns (arrange/beforeEach fixtures, Prisma mock shapes, supertest vs direct service-call style). Before writing new tests in those files, read the target test file end-to-end and match its pattern. The test code blocks in this plan show the **core assertions** you must include; wrap them in whatever arrange/setup convention the target file already uses. Do not invent a parallel mocking style — mirror what is there.

Check the project memory note: `bossEncounterService.test.ts` has 46 pre-existing failing tests from a missing guildMembership mock (PR #257). Treat those as pre-existing; confirm your new tests are not among them before claiming a regression.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `docs/superpowers/plans/2026-04-11-event-driven-scheduling-audit.md` | Cancellation audit findings (Task 1) |
| Create | `apps/api/src/services/roundTimerRegistry.ts` | In-process setTimeout registry singleton |
| Create | `apps/api/src/services/roundTimerRegistry.test.ts` | Registry unit tests with fake timers |
| Modify | `apps/api/src/services/bossEncounterService.ts` | Add `resolveDueBossEncounter` single-entity resolver; schedule/cancel at lifecycle sites |
| Modify | `apps/api/src/services/bossEncounterService.test.ts` | Tests for scheduling hooks + single-entity resolver |
| Modify | `apps/api/src/services/expeditionService.ts` | Schedule/cancel at launch/force-start/abandon/completion |
| Modify | `apps/api/src/services/expeditionService.test.ts` | Tests for scheduling hooks |
| Modify | `apps/api/src/services/expeditionRoundService.ts` | Add `resolveDueExpeditionStep` single-entity resolver; schedule/cancel after each resolution |
| Modify | `apps/api/src/services/expeditionTransitionService.ts` | Schedule/cancel after room clear/wipe/retry |
| Modify | `apps/api/src/services/guildMembershipService.ts` | Cancel timers for all active expeditions on `disbandGuild` before cascade delete |
| Modify | `apps/api/src/services/eventSchedulerService.ts` | Keep activity-triggered; ensure no fixed timer calls it |
| Modify | `apps/api/src/routes/boss.ts` | Retain activity-triggered due catch-up |
| Modify | `apps/api/src/routes/expedition.ts` | Retain activity-triggered due catch-up |
| Modify | `apps/api/src/routes/worldEvents.ts` | Call `checkAndSpawnEvents(getIo())` before listing events |
| Modify | `apps/api/src/routes/auth.ts` | Call `checkAndSpawnEvents(getIo())` on login/session-resume; add refresh-token cleanup on write |
| Modify | `apps/api/src/services/authTokenService.ts` | Opportunistic expired-verification/reset-token cleanup inside existing transactions |
| Modify | `apps/api/src/routes/auth.test.ts` | Route-level tests for login/register/refresh token cleanup and login event catch-up |
| Modify | `apps/api/src/services/authTokenService.test.ts` | Tests for verification/reset token cleanup |
| Create/Modify | `apps/api/src/routes/worldEvents.test.ts` | Events-list catch-up route tests |
| Modify | `apps/api/src/services/persistedMobService.ts` | Lazy-on-touch full-heal deletion in `checkPersistedMobReencounter` and `persistMobHp` |
| Modify | `apps/api/src/services/leaderboardService.ts` | `ensureLeaderboardsFresh` with Redis lock before `getLeaderboard` reads |
| Modify | `apps/api/src/routes/admin.ts` | `GET /api/v1/admin/scheduler-status` manual debug endpoint |
| Modify | `apps/api/src/index.ts` | Remove 3 fixed-cadence `setInterval` blocks, remove `startRoundResolutionScheduler`, add `roundTimerRegistry.rehydrate()` |
| Modify | `docs/reference/deployment.md` | Update "Background timers" line |
| Delete | `apps/api/src/services/roundResolutionScheduler.ts` | Obsoleted by registry |

---

## Task 1: Cancellation Audit & Discovery

**Purpose:** Produce a findings document classifying every write path that touches scheduled game state. Subsequent wiring tasks depend on this.

**Files:**
- Create: `docs/superpowers/plans/2026-04-11-event-driven-scheduling-audit.md`

- [ ] **Step 1: Run the boss/world-event audit search**

```bash
rg -n "bossEncounter\.(update|updateMany|delete|deleteMany|create)|createBossEncounter|worldEvent\.(update|updateMany|delete|deleteMany)" apps/api/src
```

Record every match with `file:line:code snippet`.

- [ ] **Step 2: Run the expedition/guild audit search**

```bash
rg -n "guildExpedition\.(update|updateMany|delete|deleteMany|create)|guild\.delete|disbandGuild|abandonExpedition|completeExpedition|handleWipe|forceStartExpedition" apps/api/src
```

Record every match with `file:line:code snippet`.

- [ ] **Step 3: Locate mob HP write paths**

```bash
rg -n "persistedMob\.(upsert|create|update|delete)|persistMobHp|checkPersistedMobReencounter" apps/api/src
```

- [ ] **Step 4: Locate auth token write paths**

```bash
rg -n "refreshToken\.create|emailVerificationToken\.create|passwordResetToken\.create|createEmailVerificationToken|createPasswordResetToken" apps/api/src
```

- [ ] **Step 5: Locate login / session-resume / world-events route handlers**

```bash
rg -n "router\.(post|get).*['\"]/login['\"]|router\.(post|get).*['\"]/refresh['\"]|router\.(post|get).*['\"]/register['\"]" apps/api/src/routes
rg -n "worldEvent|events" apps/api/src/routes -g "*.ts"
```

- [ ] **Step 6: Write findings to the audit file**

Create `docs/superpowers/plans/2026-04-11-event-driven-scheduling-audit.md` with this structure:

```markdown
# Cancellation Audit — Event-Driven Scheduling

Generated during Task 1. Classifies every write path that affects `BossEncounter.nextRoundAt`, `GuildExpedition.nextRoundAt`, or related scheduled status transitions.

## Legend
- **S** — schedules a new timer (writes active scheduled status + non-null `nextRoundAt`)
- **C** — cancels a timer (writes terminal/unscheduled status, sets `nextRoundAt: null`, or deletes the row)
- **N** — intentionally no timer action (does not touch `nextRoundAt` or scheduled status)

## Boss write paths

| File:Line | Code snippet (short) | Classification | Notes |
|---|---|---|---|
| `services/bossEncounterService.ts:NN` | `prisma.bossEncounter.create({...})` | N | Creates as `waiting` — no schedule |
| ... | ... | ... | ... |

## Expedition write paths

(same table format)

## Guild disband cascade

| File:Line | Code snippet | Classification | Notes |
|---|---|---|---|
| `services/guildMembershipService.ts:NN` | `disbandGuild` body | C | Must cancel timers for all `in_progress`/`recruiting` expeditions owned by guild BEFORE cascade delete |

## Mob HP write paths

(file:line list for Task 9)

## Auth token write paths

(file:line list for Task 11)

## Route handler locations

| Endpoint | File:Line |
|---|---|
| `POST /api/v1/auth/login` | `routes/auth.ts:NN` |
| `POST /api/v1/auth/refresh` | `routes/auth.ts:NN` |
| `POST /api/v1/auth/register` | `routes/auth.ts:NN` |
| `GET /api/v1/events` (or `/worldEvents`) | `routes/worldEvents.ts:NN` |

## Known hot-spot callouts from spec review

- `resolveBossRoundInner` — boss defeat (**C**) and boss wipe back to `waiting` (**C**)
- `routes/admin.ts` — boss event admin cancellation (**C** for related encounter)
- `checkAndResolveExpeditionRounds` — recruiting failure (**C**)
- `handleWipe` — max-attempt failure (**C**), wipe-with-retry (**S** at new `nextRoundAt`)
- `completeExpedition` (**C**)
- `abandonExpedition` (**C**)
- `disbandGuild` in `guildMembershipService.ts` (**C** for every owned active/recruiting expedition)
- `forceStartExpedition` (**S** at new combat `nextRoundAt`)
```

- [ ] **Step 7: Verify the audit is complete**

Every match from Steps 1-2 must appear in the boss or expedition tables with a classification. Any match without a classification is an error — re-read the function to determine whether it touches scheduled state.

- [ ] **Step 8: Commit the audit**

```bash
git add docs/superpowers/plans/2026-04-11-event-driven-scheduling-audit.md
git commit -m "docs: cancellation audit for event-driven scheduling refactor"
```

---

## Task 2: Round Timer Registry — Core

**Files:**
- Create: `apps/api/src/services/roundTimerRegistry.ts`
- Create: `apps/api/src/services/roundTimerRegistry.test.ts`

- [ ] **Step 1: Write failing tests for schedule + cancel + reschedule**

Create `apps/api/src/services/roundTimerRegistry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { roundTimerRegistry } from './roundTimerRegistry';

vi.mock('@pocketrealm/database', () => ({
  prisma: {
    bossEncounter: { findMany: vi.fn().mockResolvedValue([]) },
    guildExpedition: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('./bossEncounterService', () => ({
  resolveDueBossEncounter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./expeditionRoundService', () => ({
  resolveDueExpeditionStep: vi.fn().mockResolvedValue(undefined),
}));

describe('roundTimerRegistry', () => {
  const noIo = () => null;

  beforeEach(() => {
    vi.useFakeTimers();
    roundTimerRegistry.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('schedule fires resolver at the given time', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    const at = new Date(Date.now() + 1000);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', at, noIo);
    expect(roundTimerRegistry.size()).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolveDueBossEncounter).toHaveBeenCalledWith('boss-1', null);
    expect(roundTimerRegistry.size()).toBe(0);
  });

  it('cancel prevents resolver from firing', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    const at = new Date(Date.now() + 1000);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', at, noIo);
    roundTimerRegistry.cancel('bossEncounter', 'boss-1');

    await vi.advanceTimersByTimeAsync(2000);
    expect(resolveDueBossEncounter).not.toHaveBeenCalled();
    expect(roundTimerRegistry.size()).toBe(0);
  });

  it('rescheduling the same key clears the first timer', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', new Date(Date.now() + 500), noIo);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', new Date(Date.now() + 2000), noIo);

    await vi.advanceTimersByTimeAsync(600);
    expect(resolveDueBossEncounter).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(1);
  });

  it('past-due delay fires immediately', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    const at = new Date(Date.now() - 10_000);
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', at, noIo);

    await vi.advanceTimersByTimeAsync(0);
    expect(resolveDueBossEncounter).toHaveBeenCalledWith('boss-1', null);
  });

  it('expedition kind routes to expedition resolver', async () => {
    const { resolveDueExpeditionStep } = (await import('./expeditionRoundService')) as any;
    roundTimerRegistry.schedule('guildExpedition', 'exp-1', new Date(Date.now() + 100), noIo);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolveDueExpeditionStep).toHaveBeenCalledWith('exp-1', null);
  });

  it('size() and keys() reflect current state', () => {
    roundTimerRegistry.schedule('bossEncounter', 'boss-1', new Date(Date.now() + 1000), noIo);
    roundTimerRegistry.schedule('guildExpedition', 'exp-1', new Date(Date.now() + 1000), noIo);
    expect(roundTimerRegistry.size()).toBe(2);
    expect(roundTimerRegistry.keys().sort()).toEqual(['bossEncounter:boss-1', 'guildExpedition:exp-1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/roundTimerRegistry.test.ts
```

Expected: FAIL — `Cannot find module './roundTimerRegistry'`

- [ ] **Step 3: Implement the registry core**

Create `apps/api/src/services/roundTimerRegistry.ts`:

```typescript
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { logger } from '../logger';

export type ScheduledRoundKind = 'bossEncounter' | 'guildExpedition';
export type GetIo = () => SocketServer | null;
type DueResolver = (id: string, io: SocketServer | null) => Promise<void>;
type BossResolverModule = { resolveDueBossEncounter: DueResolver };
type ExpeditionResolverModule = { resolveDueExpeditionStep: DueResolver };

type Entry = {
  timer: NodeJS.Timeout;
  attempts: number;
};

const timers = new Map<string, Entry>();

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

function key(kind: ScheduledRoundKind, id: string): string {
  return `${kind}:${id}`;
}

async function resolveFor(kind: ScheduledRoundKind, id: string, io: SocketServer | null): Promise<void> {
  // Dynamic imports avoid a top-level cycle:
  // registry -> boss/expedition service -> registry.
  if (kind === 'bossEncounter') {
    const mod = (await import('./bossEncounterService')) as unknown as BossResolverModule;
    return mod.resolveDueBossEncounter(id, io);
  }
  const mod = (await import('./expeditionRoundService')) as unknown as ExpeditionResolverModule;
  return mod.resolveDueExpeditionStep(id, io);
}

function scheduleInternal(
  kind: ScheduledRoundKind,
  id: string,
  runAt: Date,
  getIo: GetIo,
  attempts: number,
): void {
  const mapKey = key(kind, id);
  const existing = timers.get(mapKey);
  if (existing) clearTimeout(existing.timer);

  const delay = Math.max(0, runAt.getTime() - Date.now());

  const timer = setTimeout(async () => {
    timers.delete(mapKey);
    try {
      await resolveFor(kind, id, getIo());
    } catch (err) {
      const nextAttempts = attempts + 1;
      const backoffMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, attempts));
      logger.error(
        { err, kind, id, attempts: nextAttempts, backoffMs },
        'Round timer resolver failed; retrying',
      );
      scheduleInternal(kind, id, new Date(Date.now() + backoffMs), getIo, nextAttempts);
    }
  }, delay);

  timers.set(mapKey, { timer, attempts });
}

export const roundTimerRegistry = {
  schedule(kind: ScheduledRoundKind, id: string, runAt: Date, getIo: GetIo): void {
    scheduleInternal(kind, id, runAt, getIo, 0);
  },

  cancel(kind: ScheduledRoundKind, id: string): void {
    const mapKey = key(kind, id);
    const existing = timers.get(mapKey);
    if (!existing) return;
    clearTimeout(existing.timer);
    timers.delete(mapKey);
  },

  async rehydrate(getIo: GetIo): Promise<void> {
    const bossRows = await prisma.bossEncounter.findMany({
      where: { status: 'in_progress', nextRoundAt: { not: null } },
      select: { id: true, nextRoundAt: true },
    });
    for (const row of bossRows) {
      if (row.nextRoundAt) {
        this.schedule('bossEncounter', row.id, row.nextRoundAt, getIo);
      }
    }

    const expRows = await prisma.guildExpedition.findMany({
      where: {
        status: { in: ['recruiting', 'in_progress'] },
        nextRoundAt: { not: null },
      },
      select: { id: true, nextRoundAt: true },
    });
    for (const row of expRows) {
      if (row.nextRoundAt) {
        this.schedule('guildExpedition', row.id, row.nextRoundAt, getIo);
      }
    }

    logger.info(
      { bossTimers: bossRows.length, expeditionTimers: expRows.length },
      'Round timer registry rehydrated',
    );
  },

  size(): number {
    return timers.size;
  },

  keys(): string[] {
    return Array.from(timers.keys());
  },

  clearAll(): void {
    for (const entry of timers.values()) clearTimeout(entry.timer);
    timers.clear();
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/roundTimerRegistry.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. Do **not** add temporary resolver stubs. The registry uses dynamic imports with local resolver module types specifically to avoid both top-level circular imports and stub exports. Tasks 4 and 5 add the real exported resolver functions before this branch is deployable.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/roundTimerRegistry.ts apps/api/src/services/roundTimerRegistry.test.ts
git commit -m "feat(scheduling): add round timer registry core"
```

---

## Task 3: Round Timer Registry — Rehydrate & Bounded Backoff Tests

**Files:**
- Modify: `apps/api/src/services/roundTimerRegistry.test.ts`

- [ ] **Step 1: Add rehydrate + error handling tests**

Append to `apps/api/src/services/roundTimerRegistry.test.ts`:

```typescript
describe('roundTimerRegistry.rehydrate', () => {
  const noIo = () => null;

  beforeEach(() => {
    vi.useFakeTimers();
    roundTimerRegistry.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('rehydrates pending boss and expedition rows from DB', async () => {
    const { prisma } = await import('@pocketrealm/database');
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    const { resolveDueExpeditionStep } = (await import('./expeditionRoundService')) as any;

    const futureBoss = new Date(Date.now() + 5_000);
    const pastExp = new Date(Date.now() - 1_000);
    (prisma.bossEncounter.findMany as any).mockResolvedValueOnce([
      { id: 'boss-future', nextRoundAt: futureBoss },
    ]);
    (prisma.guildExpedition.findMany as any).mockResolvedValueOnce([
      { id: 'exp-past', nextRoundAt: pastExp },
    ]);

    await roundTimerRegistry.rehydrate(noIo);
    expect(roundTimerRegistry.size()).toBe(2);

    // Past-due expedition fires on the next tick
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveDueExpeditionStep).toHaveBeenCalledWith('exp-past', null);

    // Future boss has not fired yet
    expect(resolveDueBossEncounter).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(resolveDueBossEncounter).toHaveBeenCalledWith('boss-future', null);
  });

  it('resolver error triggers bounded backoff retry', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    (resolveDueBossEncounter as any)
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);

    roundTimerRegistry.schedule('bossEncounter', 'boss-retry', new Date(Date.now() + 100), noIo);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(1);
    // First retry scheduled at +5s after failure
    await vi.advanceTimersByTimeAsync(5_000);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(2);
    expect(roundTimerRegistry.size()).toBe(0);
  });

  it('resolver error keeps retrying with capped backoff instead of dropping the timer', async () => {
    const { resolveDueBossEncounter } = (await import('./bossEncounterService')) as any;
    (resolveDueBossEncounter as any).mockRejectedValue(new Error('permanent'));

    roundTimerRegistry.schedule('bossEncounter', 'boss-active', new Date(Date.now() + 100), noIo);

    await vi.advanceTimersByTimeAsync(100);
    expect(resolveDueBossEncounter).toHaveBeenCalledTimes(1);

    for (const [index, delayMs] of [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000].entries()) {
      await vi.advanceTimersByTimeAsync(delayMs);
      expect(resolveDueBossEncounter).toHaveBeenCalledTimes(index + 2);
      expect(roundTimerRegistry.size()).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npx vitest run src/services/roundTimerRegistry.test.ts
```

Expected: PASS (all 9 tests: 6 from Task 2 + 3 new).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/roundTimerRegistry.test.ts
git commit -m "test(scheduling): rehydrate and bounded backoff for round timer registry"
```

---

## Task 4: Single-Entity Boss Resolver

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts`
- Modify: `apps/api/src/services/bossEncounterService.test.ts`

- [ ] **Step 1: Locate the existing round resolution path**

```bash
rg -n "export async function resolveBossRound|function resolveBossRoundInner|checkAndResolveDueBossRounds" apps/api/src/services/bossEncounterService.ts
```

Note the line ranges for the exported `resolveBossRound` wrapper, `resolveBossRoundInner`, and `checkAndResolveDueBossRounds` (the broad scanner). The due resolver must call the exported wrapper so the Redis lock remains in force.

- [ ] **Step 2: Write failing test for the single-entity resolver**

Add to `apps/api/src/services/bossEncounterService.test.ts`:

```typescript
describe('resolveDueBossEncounter', () => {
  it('is a no-op when encounter is not in_progress', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.bossEncounter.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'b1',
      status: 'waiting',
      nextRoundAt: new Date(),
    });
    const { resolveDueBossEncounter } = await import('./bossEncounterService');
    await resolveDueBossEncounter('b1', null);
    // Should NOT call update/resolve logic
    expect(prisma.bossEncounter.update).not.toHaveBeenCalled();
  });

  it('is a no-op when nextRoundAt is null', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.bossEncounter.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'b1',
      status: 'in_progress',
      nextRoundAt: null,
    });
    const { resolveDueBossEncounter } = await import('./bossEncounterService');
    await resolveDueBossEncounter('b1', null);
    expect(prisma.bossEncounter.update).not.toHaveBeenCalled();
  });

  it('is a no-op when nextRoundAt is in the future', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.bossEncounter.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'b1',
      status: 'in_progress',
      nextRoundAt: new Date(Date.now() + 60_000),
    });
    const { resolveDueBossEncounter } = await import('./bossEncounterService');
    await resolveDueBossEncounter('b1', null);
    expect(prisma.bossEncounter.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts -t "resolveDueBossEncounter"
```

Expected: FAIL — `resolveDueBossEncounter is not a function` (or similar).

- [ ] **Step 4: Implement `resolveDueBossEncounter`**

In `apps/api/src/services/bossEncounterService.ts`, add this near `checkAndResolveDueBossRounds`:

```typescript
import type { Server as SocketServer } from 'socket.io';

export async function resolveDueBossEncounter(
  encounterId: string,
  io: SocketServer | null,
): Promise<void> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
    select: { id: true, status: true, nextRoundAt: true },
  });
  if (!encounter) return;
  if (encounter.status !== 'in_progress') return;
  if (!encounter.nextRoundAt) return;
  if (encounter.nextRoundAt.getTime() > Date.now()) return;

  // Delegate to the existing public resolver so the Redis lock and existing
  // single-encounter idempotency behavior stay in force.
  await resolveBossRound(encounter.id, io);
}
```

Use the existing exported `resolveBossRound`, not `resolveBossRoundInner`. `resolveBossRound` owns the Redis lock; calling the inner function directly would bypass duplicate-resolution protection. Do NOT call the broad scanner.

- [ ] **Step 5: Run the three new tests**

```bash
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts -t "resolveDueBossEncounter"
```

Expected: PASS (3 tests).

- [ ] **Step 6: Run the full boss encounter service test file**

```bash
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts
```

Expected: PASS (note: the 46 pre-existing failures from the guild XP wiring issue per project memory are unrelated — confirm they are the same test names as before and not regressions caused by this task).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/bossEncounterService.ts apps/api/src/services/bossEncounterService.test.ts
git commit -m "feat(scheduling): single-entity boss encounter resolver"
```

---

## Task 5: Single-Entity Expedition Resolver

**Files:**
- Modify: `apps/api/src/services/expeditionRoundService.ts`
- Modify: `apps/api/src/services/expeditionService.test.ts` (or expeditionRoundService.test.ts if that exists)

- [ ] **Step 1: Locate current round resolution logic**

```bash
rg -n "checkAndResolveExpeditionRounds|resolveExpeditionRound|resolveRecruiting" apps/api/src/services/expedition*.ts
```

- [ ] **Step 2: Write failing test for the single-entity resolver**

Add to `apps/api/src/services/expeditionService.test.ts` (or create `expeditionRoundService.test.ts` if the former mocks expeditionRoundService):

```typescript
describe('resolveDueExpeditionStep', () => {
  it('no-ops when expedition status is neither recruiting nor in_progress', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.guildExpedition.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'e1',
      status: 'completed',
      nextRoundAt: new Date(),
    });
    const { resolveDueExpeditionStep } = await import('./expeditionRoundService');
    await resolveDueExpeditionStep('e1', null);
    expect(prisma.guildExpedition.update).not.toHaveBeenCalled();
  });

  it('no-ops when nextRoundAt is null', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.guildExpedition.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'e1',
      status: 'in_progress',
      nextRoundAt: null,
    });
    const { resolveDueExpeditionStep } = await import('./expeditionRoundService');
    await resolveDueExpeditionStep('e1', null);
    expect(prisma.guildExpedition.update).not.toHaveBeenCalled();
  });

  it('no-ops when nextRoundAt is in the future', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.guildExpedition.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'e1',
      status: 'in_progress',
      nextRoundAt: new Date(Date.now() + 30_000),
    });
    const { resolveDueExpeditionStep } = await import('./expeditionRoundService');
    await resolveDueExpeditionStep('e1', null);
    expect(prisma.guildExpedition.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/expeditionService.test.ts -t "resolveDueExpeditionStep"
```

Expected: FAIL — `resolveDueExpeditionStep is not a function`.

- [ ] **Step 4: Implement `resolveDueExpeditionStep`**

Add to `apps/api/src/services/expeditionRoundService.ts`:

```typescript
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';

export async function resolveDueExpeditionStep(
  expeditionId: string,
  io: SocketServer | null,
): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    select: { id: true, status: true, nextRoundAt: true },
  });
  if (!expedition) return;
  if (!expedition.nextRoundAt) return;
  if (expedition.nextRoundAt.getTime() > Date.now()) return;

  if (expedition.status === 'recruiting') {
    // Delegate to the existing recruiting-window resolver, single-entity form.
    // If that path currently only exists inside checkAndResolveExpeditionRounds
    // as a row-scoped branch, extract it into a named helper first.
    await resolveRecruitingWindowForExpedition(expedition.id, io);
    return;
  }

  if (expedition.status === 'in_progress') {
    // Delegate to the existing combat-round resolver for this single expedition.
    await resolveCombatRoundForExpedition(expedition.id, io);
    return;
  }

  // Any other status is unscheduled — no-op.
}
```

If `resolveRecruitingWindowForExpedition` / `resolveCombatRoundForExpedition` do not yet exist as extracted helpers, extract them from the bodies of `checkAndResolveExpeditionRounds` in this same step. The broad scanner then becomes:

```typescript
export async function checkAndResolveExpeditionRounds(io: SocketServer | null): Promise<void> {
  const dueRecruiting = await prisma.guildExpedition.findMany({
    where: { status: 'recruiting', nextRoundAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const exp of dueRecruiting) await resolveRecruitingWindowForExpedition(exp.id, io);

  const dueCombat = await prisma.guildExpedition.findMany({
    where: { status: 'in_progress', nextRoundAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const exp of dueCombat) await resolveCombatRoundForExpedition(exp.id, io);
}
```

The extracted helpers must preserve the existing optimistic-update guards (`WHERE status = 'recruiting'` / `WHERE status = 'in_progress'`) that prevent races.

- [ ] **Step 5: Run the three new tests**

```bash
cd apps/api && npx vitest run src/services/expeditionService.test.ts -t "resolveDueExpeditionStep"
```

Expected: PASS (3 tests).

- [ ] **Step 6: Run full expedition test suite**

```bash
cd apps/api && npx vitest run src/services/expedition
```

Expected: PASS — no regressions from the helper extraction.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/expeditionRoundService.ts apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionService.test.ts
git commit -m "feat(scheduling): single-entity expedition step resolver"
```

---

## Task 6: Wire Boss Lifecycle to Registry

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts`
- Modify: `apps/api/src/services/bossEncounterService.test.ts`
- Modify: `apps/api/src/routes/admin.ts` (if the audit classified an admin boss-cancel path here)

**Reference:** Every site from the **Boss write paths** section of the audit file (Task 1) must be addressed. Do not skip any row classified as **S** or **C**.

- [ ] **Step 1: Write failing tests for each lifecycle hook**

Add to `apps/api/src/services/bossEncounterService.test.ts`:

```typescript
import { roundTimerRegistry } from './roundTimerRegistry';

describe('boss lifecycle scheduling hooks', () => {
  beforeEach(() => {
    vi.spyOn(roundTimerRegistry, 'schedule').mockImplementation(() => {});
    vi.spyOn(roundTimerRegistry, 'cancel').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('createBossEncounter does NOT schedule (status is waiting)', async () => {
    // Arrange existing mocks so createBossEncounter completes...
    await createBossEncounter(/* existing args */);
    expect(roundTimerRegistry.schedule).not.toHaveBeenCalled();
  });

  it('signUpForBossRound schedules when status transitions waiting -> in_progress', async () => {
    // Arrange: boss in waiting with a nextRoundAt already set (per current code),
    // signup triggers the status change.
    await signUpForBossRound(/* existing args */);
    expect(roundTimerRegistry.schedule).toHaveBeenCalledWith(
      'bossEncounter',
      expect.any(String),
      expect.any(Date),
      expect.any(Function),
    );
  });

  it('successful non-defeating round resolution schedules the next round', async () => {
    // Arrange: mock prisma.bossEncounter.update to return a row with new nextRoundAt + in_progress
    await resolveBossRound(/* existing args */);
    expect(roundTimerRegistry.schedule).toHaveBeenCalled();
  });

  it('boss defeated cancels the timer', async () => {
    // Arrange: mock resolution with hp <= 0 outcome
    await resolveBossRound(/* existing args */);
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('bossEncounter', expect.any(String));
  });

  it('boss wipe cancels the timer (status back to waiting)', async () => {
    // Arrange: mock wipe outcome that sets status back to waiting
    await resolveBossRound(/* existing args */);
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('bossEncounter', expect.any(String));
  });
});
```

> **Note:** The exact call-site fixtures depend on existing test patterns. Match what the file already does for `createBossEncounter` / `signUpForBossRound` / `resolveBossRound`. The audit file lists the exact call sites; if any are not covered here, add a test row for each.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts -t "boss lifecycle scheduling hooks"
```

Expected: FAIL — `schedule not called` / `cancel not called`.

- [ ] **Step 3: Wire schedule/cancel calls into every classified site**

For each **S** row in the audit's Boss section, insert a call after the Prisma write that produces the new `nextRoundAt`:

```typescript
// After: await prisma.bossEncounter.update({ ..., data: { status: 'in_progress', nextRoundAt } });
roundTimerRegistry.schedule('bossEncounter', encounterId, nextRoundAt, getIo);
```

For each **C** row, insert a cancel immediately after the Prisma write that sets the terminal/unscheduled state:

```typescript
// After: await prisma.bossEncounter.update({ ..., data: { status: 'defeated' | 'waiting' | ..., nextRoundAt: null } });
roundTimerRegistry.cancel('bossEncounter', encounterId);
```

**Import requirement** at the top of each touched file:

```typescript
import { roundTimerRegistry } from './roundTimerRegistry';
```

Use the correct relative path for the file being edited (`./roundTimerRegistry` from service files in the same directory, `../services/roundTimerRegistry` from routes). This import is safe because the registry does **not** top-level import boss/expedition services; its due resolvers are loaded dynamically when a timer fires.

**`getIo` parameter:** the registry's `schedule` needs a `() => SocketServer | null` function, not a `SocketServer` instance. If the existing function receives `io: SocketServer | null`, pass `() => io`. If it receives `getIo: () => SocketServer | null`, pass `getIo` directly.

- [ ] **Step 4: Run the hook tests and verify they pass**

```bash
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts -t "boss lifecycle scheduling hooks"
```

Expected: PASS.

- [ ] **Step 5: Run the full boss test suite**

```bash
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts
```

Expected: PASS for the new tests. Pre-existing 46 guild-XP-related failures remain unchanged (per project memory).

- [ ] **Step 6: Typecheck**

```bash
npm run build:api
```

Expected: PASS. (A full build catches both tsc and package resolution issues.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/bossEncounterService.ts apps/api/src/services/bossEncounterService.test.ts apps/api/src/routes/admin.ts
git commit -m "feat(scheduling): wire boss lifecycle to round timer registry"
```

---

## Task 7: Wire Expedition Lifecycle to Registry (Incl. Guild Disband)

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`
- Modify: `apps/api/src/services/expeditionRoundService.ts`
- Modify: `apps/api/src/services/expeditionTransitionService.ts`
- Modify: `apps/api/src/services/guildMembershipService.ts`
- Modify: `apps/api/src/services/expeditionService.test.ts`
- Modify: `apps/api/src/services/guildMembershipService.test.ts` (if exists)

**Reference:** Every site from the **Expedition write paths** and **Guild disband cascade** sections of the audit file.

- [ ] **Step 1: Write failing tests for each expedition lifecycle hook**

Add to `apps/api/src/services/expeditionService.test.ts`:

```typescript
import { roundTimerRegistry } from './roundTimerRegistry';

describe('expedition lifecycle scheduling hooks', () => {
  beforeEach(() => {
    vi.spyOn(roundTimerRegistry, 'schedule').mockImplementation(() => {});
    vi.spyOn(roundTimerRegistry, 'cancel').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('launchExpedition schedules the signup window', async () => {
    await launchExpedition(/* existing args */);
    expect(roundTimerRegistry.schedule).toHaveBeenCalledWith(
      'guildExpedition',
      expect.any(String),
      expect.any(Date),
      expect.any(Function),
    );
  });

  it('forceStartExpedition reschedules at new combat nextRoundAt', async () => {
    await forceStartExpedition(/* existing args */);
    expect(roundTimerRegistry.schedule).toHaveBeenCalled();
  });

  it('recruiting failure cancels', async () => {
    // Arrange recruiting resolve with insufficient participants
    await resolveRecruitingWindowForExpedition(/* existing args */);
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('guildExpedition', expect.any(String));
  });

  it('combat round continuation reschedules', async () => {
    await resolveCombatRoundForExpedition(/* existing args */);
    expect(roundTimerRegistry.schedule).toHaveBeenCalled();
  });

  it('wipe with retry reschedules recruiting window', async () => {
    await handleWipe(/* existing args, with attemptsRemaining > 0 */);
    expect(roundTimerRegistry.schedule).toHaveBeenCalled();
  });

  it('max-attempt wipe cancels', async () => {
    await handleWipe(/* existing args, with attemptsRemaining === 0 */);
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('guildExpedition', expect.any(String));
  });

  it('completeExpedition cancels', async () => {
    await completeExpedition(/* existing args */);
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('guildExpedition', expect.any(String));
  });

  it('abandonExpedition cancels', async () => {
    await abandonExpedition(/* existing args */);
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('guildExpedition', expect.any(String));
  });
});

describe('guild disband cascade', () => {
  beforeEach(() => {
    vi.spyOn(roundTimerRegistry, 'cancel').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('cancels timers for every active/recruiting expedition owned by the guild', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.guildExpedition.findMany as any) = vi.fn().mockResolvedValue([
      { id: 'exp-a' },
      { id: 'exp-b' },
    ]);
    await disbandGuild('guild-1');
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('guildExpedition', 'exp-a');
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('guildExpedition', 'exp-b');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/expeditionService.test.ts -t "expedition lifecycle scheduling hooks"
cd apps/api && npx vitest run src/services/guildMembershipService.test.ts -t "guild disband cascade"
```

Expected: FAIL for each.

- [ ] **Step 3: Wire schedule/cancel calls at every classified site**

For each audit row, insert `roundTimerRegistry.schedule('guildExpedition', id, nextRoundAt, getIo)` or `roundTimerRegistry.cancel('guildExpedition', id)` per classification, immediately after the Prisma write that produced the state transition.

For `disbandGuild` in `apps/api/src/services/guildMembershipService.ts`, add:

```typescript
import { roundTimerRegistry } from './roundTimerRegistry';

export async function disbandGuild(guildId: string): Promise<void> {
  // Fetch affected expeditions BEFORE cascade delete so we know which timers to clear.
  const affected = await prisma.guildExpedition.findMany({
    where: {
      guildId,
      status: { in: ['recruiting', 'in_progress'] },
    },
    select: { id: true },
  });

  for (const exp of affected) {
    roundTimerRegistry.cancel('guildExpedition', exp.id);
  }

  // Existing disband/cascade delete logic follows...
}
```

- [ ] **Step 4: Run the hook tests and verify they pass**

```bash
cd apps/api && npx vitest run src/services/expeditionService.test.ts -t "expedition lifecycle scheduling hooks"
cd apps/api && npx vitest run src/services/guildMembershipService.test.ts -t "guild disband cascade"
```

Expected: PASS for all.

- [ ] **Step 5: Full expedition and guild suites**

```bash
cd apps/api && npx vitest run src/services/expedition
cd apps/api && npx vitest run src/services/guildMembershipService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
npm run build:api
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionRoundService.ts apps/api/src/services/expeditionTransitionService.ts apps/api/src/services/guildMembershipService.ts apps/api/src/services/expeditionService.test.ts apps/api/src/services/guildMembershipService.test.ts
git commit -m "feat(scheduling): wire expedition lifecycle and guild disband to registry"
```

---

## Task 8: Replace Old Scheduler in `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`
- Delete: `apps/api/src/services/roundResolutionScheduler.ts`

- [ ] **Step 1: Read current `index.ts` startup block**

```bash
rg -n "startRoundResolutionScheduler|cleanupFullyHealedMobs|refreshAllLeaderboards|cleanupExpiredTokens" apps/api/src/index.ts
```

Confirm the three `setInterval` blocks (mob cleanup, leaderboards, auth tokens) and the `startRoundResolutionScheduler` call are at the expected locations.

- [ ] **Step 2: Remove `startRoundResolutionScheduler` and add registry rehydration**

In `apps/api/src/index.ts`:

Remove this line:
```typescript
startRoundResolutionScheduler(getIo);
```

And the unused import:
```typescript
import { startRoundResolutionScheduler } from './services/roundResolutionScheduler';
```

Add (before `stopMetricsLogger = startMetricsLogger(getIo);`):
```typescript
import { roundTimerRegistry } from './services/roundTimerRegistry';

// ...inside server.listen callback...
void roundTimerRegistry.rehydrate(getIo).catch((err) => {
  logger.error({ err }, 'Round timer registry rehydrate failed');
});
```

Keep the `server.listen` callback synchronous. Node does not await an async listen callback, so awaiting rehydrate there can become an unhandled rejection and can skip later startup work.

```typescript
server.listen(PORT, () => {
  logger.info({ port: PORT }, 'PocketRealm API running');
  void roundTimerRegistry.rehydrate(getIo).catch((err) => {
    logger.error({ err }, 'Round timer registry rehydrate failed');
  });
  stopMetricsLogger = startMetricsLogger(getIo);
  // ... rest unchanged until Tasks 9-12 remove the setIntervals
});
```

- [ ] **Step 3: Delete the obsolete scheduler file**

```bash
rm apps/api/src/services/roundResolutionScheduler.ts
```

- [ ] **Step 4: Typecheck and run affected tests**

```bash
npm run build:api
cd apps/api && npx vitest run src/services/bossEncounterService.test.ts src/services/expedition
```

Expected: PASS. Typecheck should catch any orphaned references to the deleted module.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts
git rm apps/api/src/services/roundResolutionScheduler.ts
git commit -m "refactor(scheduling): replace fixed-cadence scheduler with timer registry"
```

---

## Task 9: Lazy-on-Touch Persisted Mob Cleanup

**Files:**
- Modify: `apps/api/src/services/persistedMobService.ts`
- Modify: `apps/api/src/services/persistedMobService.test.ts` (create if absent)
- Modify: `apps/api/src/index.ts`

**Reference:** Audit file **Mob HP write paths** section.

- [ ] **Step 1: Read current `checkPersistedMobReencounter` and `persistMobHp`**

```bash
rg -n "checkPersistedMobReencounter|persistMobHp|cleanupFullyHealedMobs" apps/api/src/services/persistedMobService.ts
```

- [ ] **Step 2: Write failing tests**

Add to `apps/api/src/services/persistedMobService.test.ts`:

```typescript
describe('checkPersistedMobReencounter lazy cleanup', () => {
  it('deletes a fully regenerated mob before rolling reencounter', async () => {
    const { prisma } = await import('@pocketrealm/database');
    const mob = {
      id: 'm1',
      hp: 5,
      maxHp: 50,
      damagedAt: new Date(Date.now() - 10 * 60 * 1000), // long enough to fully regen
    };
    (prisma.persistedMob.findFirst as any) = vi.fn().mockResolvedValue(mob);
    (prisma.persistedMob.delete as any) = vi.fn().mockResolvedValue(mob);

    const result = await checkPersistedMobReencounter(/* args */);
    expect(prisma.persistedMob.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(result).toBeNull();
  });
});

describe('persistMobHp', () => {
  it('deletes the row when currentHp >= maxHp', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.persistedMob.deleteMany as any) = vi.fn().mockResolvedValue({ count: 1 });

    await persistMobHp({ /* identifying fields */, currentHp: 100, maxHp: 100 });
    expect(prisma.persistedMob.deleteMany).toHaveBeenCalled();
    expect(prisma.persistedMob.upsert).not.toHaveBeenCalled();
  });

  it('upserts when currentHp < maxHp', async () => {
    const { prisma } = await import('@pocketrealm/database');
    (prisma.persistedMob.upsert as any) = vi.fn().mockResolvedValue({});

    await persistMobHp({ /* identifying fields */, currentHp: 40, maxHp: 100 });
    expect(prisma.persistedMob.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/persistedMobService.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Add lazy deletion in `checkPersistedMobReencounter`**

Before the reencounter roll, compute regenerated HP. If full, delete and return null:

```typescript
const regenHp = computeRegenHp(mob);  // existing helper, or inline formula
if (regenHp >= mob.maxHp) {
  await prisma.persistedMob.delete({ where: { id: mob.id } });
  return null;
}
```

- [ ] **Step 5: Add delete branch in `persistMobHp`**

```typescript
export async function persistMobHp(params: PersistMobHpArgs): Promise<void> {
  if (params.currentHp >= params.maxHp) {
    await prisma.persistedMob.deleteMany({
      where: { /* existing identifying fields */ },
    });
    return;
  }
  await prisma.persistedMob.upsert({ /* existing upsert */ });
}
```

- [ ] **Step 6: Remove the 5-minute interval from `index.ts`**

Delete the block at `apps/api/src/index.ts`:

```typescript
// Persisted mob cleanup timer (every 5 minutes)
setInterval(() => {
  cleanupFullyHealedMobs().catch((err) => {
    logger.error({ err }, 'Persisted mob cleanup error');
  });
}, 300_000);
```

Also remove the `cleanupFullyHealedMobs` import if nothing else references it.

- [ ] **Step 7: Run tests**

```bash
cd apps/api && npx vitest run src/services/persistedMobService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/persistedMobService.ts apps/api/src/services/persistedMobService.test.ts apps/api/src/index.ts
git commit -m "refactor(scheduling): lazy-on-touch persisted mob cleanup"
```

---

## Task 10: Lazy Leaderboard Refresh

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts`
- Modify: `apps/api/src/services/leaderboardService.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Read current leaderboard service**

```bash
rg -n "refreshAllLeaderboards|getLeaderboard|leaderboard:last_refresh|leaderboard:refresh_lock" apps/api/src/services/leaderboardService.ts
```

- [ ] **Step 2: Write failing tests**

Add `eval: vi.fn()` to the existing `../redis` mock in `apps/api/src/services/leaderboardService.test.ts`, add `ensureLeaderboardsFresh` to the import from `./leaderboardService`, and append:

```typescript
describe('ensureLeaderboardsFresh', () => {
  it('skips refresh when last_refresh is within TTL', async () => {
    mockRedis.get.mockResolvedValue(new Date().toISOString());

    await ensureLeaderboardsFresh();

    expect(mockRedis.set).not.toHaveBeenCalledWith(
      'leaderboard:refresh_lock',
      expect.any(String),
      'PX',
      60_000,
      'NX',
    );
  });

  it('refreshes when last_refresh is stale and lock is acquired', async () => {
    stubEmptyRefresh();
    mockRedis.get.mockResolvedValue(new Date(Date.now() - 999_999_999).toISOString());
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);

    await ensureLeaderboardsFresh();

    expect(mockRedis.set).toHaveBeenCalledWith(
      'leaderboard:refresh_lock',
      expect.any(String),
      'PX',
      60_000,
      'NX',
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'leaderboard:last_refresh',
      expect.any(String),
    );
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      1,
      'leaderboard:refresh_lock',
      expect.any(String),
    );
  });

  it('skips refresh when lock cannot be acquired', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(null);

    await ensureLeaderboardsFresh();

    expect(mockRedis.set).toHaveBeenCalledWith(
      'leaderboard:refresh_lock',
      expect.any(String),
      'PX',
      60_000,
      'NX',
    );
    expect(mockRedis.set).not.toHaveBeenCalledWith(
      'leaderboard:last_refresh',
      expect.any(String),
    );
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });
});
```

Do not use `vi.spyOn(await import('./leaderboardService'), 'refreshAllLeaderboards')` for this; `ensureLeaderboardsFresh` calls the local function binding, so a same-module spy can miss the call. Assert Redis/DB side effects instead, matching this file's existing `mockRedis` and `stubEmptyRefresh()` pattern.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/leaderboardService.test.ts -t "ensureLeaderboardsFresh"
```

Expected: FAIL — `ensureLeaderboardsFresh is not a function`.

- [ ] **Step 4: Implement `ensureLeaderboardsFresh` and wire into `getLeaderboard`**

Add to `apps/api/src/services/leaderboardService.ts`:

```typescript
import { randomUUID } from 'crypto';
import { LEADERBOARD_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';
import { logger } from '../logger';

const LAST_REFRESH_KEY = 'leaderboard:last_refresh';
const LOCK_KEY = 'leaderboard:refresh_lock';
const LOCK_TTL_MS = 60_000;
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

export async function ensureLeaderboardsFresh(): Promise<void> {
  try {
    const last = await redis.get(LAST_REFRESH_KEY);
    if (last) {
      const ageMs = Date.now() - Date.parse(last);
      if (Number.isFinite(ageMs) && ageMs < LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS) {
        return;
      }
    }

    const lockToken = randomUUID();
    const acquired = await redis.set(LOCK_KEY, lockToken, 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
      return; // Another process is refreshing; serve existing data
    }

    try {
      await refreshAllLeaderboards();
    } finally {
      // Atomic compare-and-delete: only delete if we still hold the lock.
      await redis.eval(RELEASE_LOCK_SCRIPT, 1, LOCK_KEY, lockToken);
    }
  } catch (err) {
    logger.warn({ err }, 'ensureLeaderboardsFresh failed; serving existing data');
  }
}
```

Modify every exported `getLeaderboard`-style function to call `ensureLeaderboardsFresh()` before reading:

```typescript
export async function getLeaderboard(
  category: string,
  playerId?: string,
  aroundMe = false,
): Promise<LeaderboardResponse> {
  await ensureLeaderboardsFresh();
  // ... existing zset/hash read logic unchanged
}
```

Ensure `refreshAllLeaderboards` writes `LAST_REFRESH_KEY` with the current timestamp on success (this is likely already the case — verify and keep/add a single line like `await redis.set(LAST_REFRESH_KEY, new Date().toISOString())` at the end of the refresh).

- [ ] **Step 5: Remove boot refresh + 15-minute interval from `index.ts`**

Delete the block at `apps/api/src/index.ts`:

```typescript
// Leaderboard refresh (every 15 minutes)
refreshAllLeaderboards().catch((err) => {
  logger.error({ err }, 'Initial leaderboard refresh error');
});
setInterval(() => {
  refreshAllLeaderboards().catch((err) => {
    logger.error({ err }, 'Leaderboard refresh error');
  });
}, LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS);
```

Remove the `refreshAllLeaderboards` and `LEADERBOARD_CONSTANTS` imports if nothing else uses them in this file.

- [ ] **Step 6: Run tests**

```bash
cd apps/api && npx vitest run src/services/leaderboardService.test.ts
```

Expected: PASS (all new tests plus existing ones).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts apps/api/src/services/leaderboardService.test.ts apps/api/src/index.ts
git commit -m "refactor(scheduling): lazy leaderboard refresh with redis lock"
```

---

## Task 11: Opportunistic Auth Token Cleanup

**Files:**
- Modify: `apps/api/src/services/authTokenService.ts` (email/password tokens)
- Modify: `apps/api/src/services/authTokenService.test.ts`
- Modify: `apps/api/src/routes/auth.ts` (refresh token paths)
- Modify: `apps/api/src/routes/auth.test.ts`
- Modify: `apps/api/src/index.ts`

**Reference:** Audit file **Auth token write paths**.

- [ ] **Step 1: Read current token creation paths**

```bash
rg -n "createEmailVerificationToken|createPasswordResetToken|cleanupExpiredTokens" apps/api/src/services/authTokenService.ts apps/api/src/services/authTokenService.test.ts
rg -n "refreshToken\.create|refreshToken\.deleteMany|router\.(post|get).*['\"]/(register|login|refresh)['\"]" apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
```

Confirm:
- `createEmailVerificationToken` and `createPasswordResetToken` already use array-form `prisma.$transaction([...])` and return `{ rawToken }`.
- `register` and `login` in `apps/api/src/routes/auth.ts` still use bare `prisma.refreshToken.create(...)`.
- `/refresh` already has a `prisma.$transaction([...])` for new refresh token + `lastActiveAt`.

- [ ] **Step 2: Write failing tests**

Add focused assertions to the existing tests instead of creating new helper flows.

In `apps/api/src/services/authTokenService.test.ts`, extend the existing `createEmailVerificationToken` test block and add a matching password-reset test:

```typescript
describe('opportunistic auth token cleanup', () => {
  it('createEmailVerificationToken deletes expired verification tokens', async () => {
    await createEmailVerificationToken('player-1');

    expect(mockPrisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { playerId: 'player-1' },
    });
    expect(mockPrisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('createPasswordResetToken deletes expired and used reset tokens', async () => {
    mockPrisma.passwordResetToken = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'tok-1' }),
    };

    await createPasswordResetToken('player-1');

    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { playerId: 'player-1' },
    });
    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lt: expect.any(Date) } }, { usedAt: { not: null } }] },
    });
  });
});
```

In `apps/api/src/routes/auth.test.ts`, use the existing `findHandler()` and `mockRes()` helpers. Add route-level assertions for register, login, and refresh:

```typescript
describe('opportunistic refresh token cleanup', () => {
  it('register deletes expired refresh tokens before storing the new one', async () => {
    // Arrange by matching the existing POST /register tests so the handler succeeds.
    const handler = findHandler('post', '/register');
    const req = { body: { /* valid register body from existing tests */ } } as any;
    const res = mockRes();

    await handler(req, res, vi.fn());

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { playerId: expect.any(String), expiresAt: { lt: expect.any(Date) } },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
  });

  it('login deletes expired refresh tokens before storing the new one', async () => {
    // Arrange by matching the existing successful login tests.
    const handler = findHandler('post', '/login');
    const req = { body: { /* valid login body from existing tests */ } } as any;
    const res = mockRes();

    await handler(req, res, vi.fn());

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { playerId: expect.any(String), expiresAt: { lt: expect.any(Date) } },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
  });

  it('refresh extends its existing transaction to delete expired refresh tokens', async () => {
    // Arrange by matching the existing successful refresh tests.
    const handler = findHandler('post', '/refresh');
    const req = { body: { refreshToken: 'valid-refresh-token' } } as any;
    const res = mockRes();

    await handler(req, res, vi.fn());

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { playerId: expect.any(String), expiresAt: { lt: expect.any(Date) } },
    });
  });
});
```

The route snippets above intentionally omit the full arrange boilerplate; copy it from adjacent successful register/login/refresh tests in `auth.test.ts`. Do not introduce new helper flows just for this task.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/authTokenService.test.ts src/routes/auth.test.ts -t "opportunistic"
```

Expected: FAIL.

- [ ] **Step 4: Extend email/password token transactions**

In `apps/api/src/services/authTokenService.ts`, extend the existing `prisma.$transaction` for `createEmailVerificationToken`:

```typescript
export async function createEmailVerificationToken(playerId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({
      where: { playerId }, // existing "delete old tokens for this player"
    }),
    prisma.emailVerificationToken.deleteMany({
      where: { expiresAt: { lt: new Date() } }, // NEW: opportunistic expired cleanup
    }),
    prisma.emailVerificationToken.create({
      data: { playerId, tokenHash, expiresAt },
    }),
  ]);

  return { rawToken };
}
```

Repeat the same pattern for `createPasswordResetToken`:

```typescript
await prisma.$transaction([
  prisma.passwordResetToken.deleteMany({ where: { playerId } }),
  prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
  }),
  prisma.passwordResetToken.create({ data: { playerId, token, expiresAt } }),
]);
```

- [ ] **Step 5: Wrap login/register refresh-token creation in a transaction with cleanup**

In `apps/api/src/routes/auth.ts`, locate the login and register paths that currently call bare `prisma.refreshToken.create(...)`. Replace each with:

```typescript
await prisma.$transaction([
  prisma.refreshToken.deleteMany({
    where: { playerId: player.id, expiresAt: { lt: now } },
  }),
  prisma.refreshToken.create({
    data: {
      playerId: player.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(now.getTime()),
    },
  }),
]);
```

- [ ] **Step 6: Extend refresh endpoint's existing transaction**

Find the existing `prisma.$transaction` in the refresh path and add a `deleteMany` for expired refresh tokens belonging to this player:

```typescript
await prisma.$transaction([
  prisma.refreshToken.deleteMany({
    where: { playerId: payload.playerId, expiresAt: { lt: now } },
  }),
  prisma.refreshToken.create({
    data: {
      playerId: payload.playerId,
      token: newRefreshToken,
      expiresAt: refreshTokenExpiresAt(now.getTime()),
    },
  }),
  prisma.player.update({ where: { id: payload.playerId }, data: { lastActiveAt: now } }),
]);
```

- [ ] **Step 7: Remove the 6-hour interval from `index.ts`**

Delete the block at `apps/api/src/index.ts`:

```typescript
// Auth token cleanup (every 6 hours)
setInterval(() => {
  cleanupExpiredTokens().catch((err) => {
    logger.error({ err }, 'Auth token cleanup error');
  });
}, AUTH_CONSTANTS.TOKEN_CLEANUP_INTERVAL_MS);
```

Remove the `cleanupExpiredTokens` import if nothing else references it in `index.ts`. Keep the function itself in `authTokenService.ts` if other tooling imports it; otherwise delete it (search to confirm).

- [ ] **Step 8: Run tests**

```bash
cd apps/api && npx vitest run src/services/authTokenService.test.ts src/routes/auth.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/authTokenService.ts apps/api/src/services/authTokenService.test.ts apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts apps/api/src/index.ts
git commit -m "refactor(scheduling): opportunistic auth token cleanup on write"
```

---

## Task 12: World Event Trigger Coverage

**Files:**
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/routes/worldEvents.ts` (actual path per audit Step 5 — may be different)
- Modify: `apps/api/src/routes/auth.test.ts`
- Create or Modify: `apps/api/src/routes/worldEvents.test.ts`

**Reference:** Audit file **Route handler locations**.

- [ ] **Step 1: Write failing tests**

Add to `apps/api/src/routes/auth.test.ts`:

```typescript
// Put these mocks with the other vi.mock(...) calls before importing authRouter.
vi.mock('../socket', () => ({ getIo: vi.fn(() => null) }));
vi.mock('../services/eventSchedulerService', () => ({
  checkAndSpawnEvents: vi.fn().mockResolvedValue(undefined),
}));

// Put this with the other imports.
import { checkAndSpawnEvents } from '../services/eventSchedulerService';

describe('auth activity triggers world event catch-up', () => {
  it('successful login calls checkAndSpawnEvents once', async () => {
    // Arrange by matching the existing successful login test.
    const handler = findHandler('post', '/login');
    const req = { body: { /* valid login body from existing tests */ } } as any;
    const res = mockRes();

    await handler(req, res, vi.fn());

    expect(checkAndSpawnEvents).toHaveBeenCalledTimes(1);
  });

  it('failed login does NOT call checkAndSpawnEvents', async () => {
    // Arrange by matching the existing failed-login test.
    const handler = findHandler('post', '/login');
    const req = { body: { /* invalid login body from existing tests */ } } as any;
    const res = mockRes();

    await expect(handler(req, res, vi.fn())).rejects.toThrow();
    expect(checkAndSpawnEvents).not.toHaveBeenCalled();
  });

  it('successful refresh calls checkAndSpawnEvents once', async () => {
    // Treat refresh as session-resume activity.
    const handler = findHandler('post', '/refresh');
    const req = { body: { refreshToken: 'valid-refresh-token' } } as any;
    const res = mockRes();

    await handler(req, res, vi.fn());

    expect(checkAndSpawnEvents).toHaveBeenCalledTimes(1);
  });
});
```

Use the existing `auth.test.ts` route-handler style (`findHandler` / `mockRes`), not a new `supertest(app)` harness.

Add to `apps/api/src/routes/worldEvents.test.ts`:

```typescript
// If this file does not exist yet, mirror the route-test setup used by auth/admin tests.
vi.mock('../socket', () => ({ getIo: vi.fn(() => null) }));
vi.mock('../services/eventSchedulerService', () => ({
  checkAndSpawnEvents: vi.fn().mockResolvedValue(undefined),
}));

import { checkAndSpawnEvents } from '../services/eventSchedulerService';

describe('GET world events triggers catch-up', () => {
  it('calls checkAndSpawnEvents before returning events', async () => {
    // Build the route under test using the existing route-test style in this repo.
    await supertest(app).get('/api/v1/events').set('Authorization', `Bearer ${validToken}`);
    expect(checkAndSpawnEvents).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts src/routes/worldEvents.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add trigger in login and refresh handlers**

In `apps/api/src/routes/auth.ts`, import the scheduler and socket helper:

```typescript
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { getIo } from '../socket';
```

Add a small local helper near the top of the file:

```typescript
function triggerWorldEventCatchUp(reason: string): void {
  void checkAndSpawnEvents(getIo()).catch((err) => {
    logger.warn({ err, reason }, 'World event catch-up failed after auth activity');
  });
}
```

Call it after the successful login response is sent, and after the successful refresh response is sent:

```typescript
res.json({ /* existing login response */ });
triggerWorldEventCatchUp('login');

// ...in /refresh after res.json(...)
res.json({ /* existing refresh response */ });
triggerWorldEventCatchUp('refresh');
```

Keep this fire-and-forget. World event catch-up must never fail or add scheduler latency to login/refresh.

- [ ] **Step 4: Add trigger in world events GET handler**

In `apps/api/src/routes/worldEvents.ts` (adjust path per audit):

```typescript
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { getIo } from '../socket';

worldEventsRouter.get('/', asyncHandler(async (_req, res) => {
  await checkAndSpawnEvents(getIo()).catch((err) => {
    logger.warn({ err }, 'World events list catch-up failed');
  });
  // ... existing response logic
}));
```

> If the current handler only calls `expireStaleEvents()`, replace that with the `checkAndSpawnEvents(getIo())` call (it already includes expiration).

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts src/routes/worldEvents.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/worldEvents.ts apps/api/src/routes/auth.test.ts apps/api/src/routes/worldEvents.test.ts
git commit -m "feat(scheduling): trigger world event catch-up on login and events list"
```

---

## Task 13: Scheduler Status Admin Endpoint

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/admin.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `apps/api/src/routes/admin.test.ts`:

```typescript
describe('GET /api/v1/admin/scheduler-status', () => {
  it('rejects non-admin requests', async () => {
    const res = await supertest(app)
      .get('/api/v1/admin/scheduler-status')
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('returns registry size and DB counts for admin', async () => {
    const res = await supertest(app)
      .get('/api/v1/admin/scheduler-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pendingTimers: expect.any(Number),
      timerKeys: expect.any(Array),
      pendingBossEncounters: expect.any(Number),
      pendingGuildExpeditions: expect.any(Number),
      pendingEnumeratedFromDb: expect.any(Number),
      hasDrift: expect.any(Boolean),
    });
  });

  it('reports drift when registry disagrees with DB', async () => {
    roundTimerRegistry.clearAll();
    // Mock DB to return 2 pending rows
    const { prisma } = await import('@pocketrealm/database');
    (prisma.bossEncounter.count as any) = vi.fn().mockResolvedValue(2);
    (prisma.guildExpedition.count as any) = vi.fn().mockResolvedValue(0);

    const res = await supertest(app)
      .get('/api/v1/admin/scheduler-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.hasDrift).toBe(true);
    expect(res.body.pendingEnumeratedFromDb).toBe(2);
    expect(res.body.pendingTimers).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/routes/admin.test.ts -t "scheduler-status"
```

Expected: FAIL — `404` or equivalent.

- [ ] **Step 3: Add the endpoint**

In `apps/api/src/routes/admin.ts`, next to the existing admin routes:

```typescript
import { roundTimerRegistry } from '../services/roundTimerRegistry';
import { prisma } from '@pocketrealm/database';

router.get('/scheduler-status', async (_req, res) => {
  const [pendingBossEncounters, pendingGuildExpeditions] = await Promise.all([
    prisma.bossEncounter.count({
      where: { status: 'in_progress', nextRoundAt: { not: null } },
    }),
    prisma.guildExpedition.count({
      where: {
        status: { in: ['recruiting', 'in_progress'] },
        nextRoundAt: { not: null },
      },
    }),
  ]);

  const pendingTimers = roundTimerRegistry.size();
  const pendingEnumeratedFromDb = pendingBossEncounters + pendingGuildExpeditions;

  res.json({
    pendingTimers,
    timerKeys: roundTimerRegistry.keys(),
    pendingBossEncounters,
    pendingGuildExpeditions,
    pendingEnumeratedFromDb,
    hasDrift: pendingTimers !== pendingEnumeratedFromDb,
  });
});
```

`admin.ts` already applies `router.use(authenticate, requireAdmin)` for the whole router; do not repeat that middleware on this route unless the file has changed.

> Use whatever middleware names are actually in use (`authenticate`, `requireAdmin`, or `requireRole('admin')`) — match sibling routes in the same file.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/routes/admin.test.ts -t "scheduler-status"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts
git commit -m "feat(scheduling): admin scheduler-status debug endpoint"
```

---

## Task 14: Docs + Final Verification

**Files:**
- Modify: `docs/reference/deployment.md`

- [ ] **Step 1: Update the deployment doc**

In `docs/reference/deployment.md`, replace the "Background timers" line:

```markdown
- Background timers: none fixed-cadence. Boss/expedition rounds resolve via an in-process `setTimeout` registry keyed by `nextRoundAt`, rehydrated from DB on boot. See `docs/superpowers/specs/2026-04-11-event-driven-scheduling-design.md`.
```

- [ ] **Step 2: Run the full API test suite**

```bash
npm run test:api
```

Expected: PASS. Pre-existing 46 boss test failures (per project memory) remain; no new failures attributable to this refactor.

- [ ] **Step 3: Typecheck the whole workspace**

```bash
npm run typecheck
```

Expected: PASS across all packages.

- [ ] **Step 4: Full build**

```bash
npm run build:api
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test locally**

```bash
npm run dev:api
```

Observe startup logs. Confirm:
- No `Round resolution error` recurring every 60s.
- Registry rehydrate log fires exactly once: `Round timer registry rehydrated`.
- Hitting `GET /api/v1/admin/scheduler-status` (with a local admin token) returns the expected JSON with `hasDrift: false`.

- [ ] **Step 6: Commit docs**

```bash
git add docs/reference/deployment.md
git commit -m "docs: update deployment doc for event-driven scheduling"
```

- [ ] **Step 7: Run the post-deploy verification checklist from the spec**

After merging and deploying to UAT, run section 9 of `docs/superpowers/specs/2026-04-11-event-driven-scheduling-design.md`:

1. Confirm no active boss or expedition has a pending `nextRoundAt`.
2. Confirm no user traffic for 10 minutes.
3. Check Neon dashboard: compute endpoint shows `suspended`.
4. Hit a UAT endpoint; confirm cold resume latency once, then normal.
5. Start an expedition; `/api/v1/admin/scheduler-status` shows one pending guild expedition timer.
6. Let signup window resolve; timer reschedules or cancels per outcome.
7. Start a boss, sign up, confirm timer appears only after signup transitions to `in_progress`.
8. Confirm boss round resolves at expected wall-clock time.
9. After all activity, confirm Neon re-suspends.
10. Monitor logs for `Round timer resolver failed` or `Round timer max retries exhausted` over 24h.

---

## Post-Plan Notes

**If any task fails typecheck:**
- Build the shared package first: `npm run build` (root). Per project memory: shared + game-engine must be built before API can see changes.

**If existing tests regress unexpectedly:**
- Run `git diff` against the task's target files and double-check no unrelated lines were touched.
- Per project memory, 46 `bossEncounterService.test.ts` failures are pre-existing (missing mock for guild XP wiring from PR #257). Do not attempt to fix them in this plan.

**If Neon still shows constant activity after deploy:**
- Check `GET /api/v1/admin/scheduler-status` for `hasDrift: true` — a drift indicates the registry and DB disagree, pointing to a missed schedule or cancel site.
- Re-audit with the Task 1 `rg` commands against the current branch and compare against the audit file.
- Check Render logs for `Round timer` entries; absence of rehydrate log on boot means the startup hook never ran.
