# World Event Global Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap concurrent non-boss world events at 4 globally so most zones are quiet most of the time and an active event becomes a reason to travel to a zone.

**Architecture:** Add a `MAX_ACTIVE_EVENTS` constant and enforce it authoritatively inside `spawnWorldEvent` (the single function every spawn path funnels through), inside the existing serializable transaction. Bosses are excluded from the gate. A lightweight early-out in the scheduler avoids wasted template-resolution work when already at the cap.

**Tech Stack:** TypeScript, Prisma 6 (PostgreSQL), Vitest. Monorepo workspaces: `packages/shared`, `apps/api`.

## Global Constraints

- Strict TypeScript, no `any` in production code (test mocks may cast via the existing `mockPrisma` pattern).
- All tunable values live in `packages/shared/src/constants/gameConstants.ts`.
- Per-zone cap (`MAX_ZONE_EVENTS: 2`), world-wide cap (`MAX_WORLD_EVENTS: 1`), and boss cap (`MAX_BOSS_ENCOUNTERS: 1`) are unchanged.
- World-wide events (`zoneId = null`) count toward the global cap. Bosses do not.
- Admin-spawned events are subject to the cap (no bypass) — they already surface `409 SLOT_CONFLICT` when `spawnWorldEvent` returns `null`.
- Work happens in the `world-event-global-cap` worktree. All commands below run from the worktree root.

---

### Task 1: Global ambient cap in `spawnWorldEvent`

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (add constant)
- Modify: `apps/api/src/services/worldEventService.ts:259-297` (enforcement in transaction)
- Test: `apps/api/src/services/worldEventService.test.ts` (add import + 3 new tests, update 1 existing test)

**Interfaces:**
- Consumes: `WORLD_EVENT_CONSTANTS` from `@pocketrealm/shared`; existing `spawnWorldEvent(params)` signature (unchanged).
- Produces: `WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS: number` (= 4). `spawnWorldEvent` now returns `null` for non-boss events when `>= MAX_ACTIVE_EVENTS` active non-boss events exist; boss spawns ignore this cap.

**Check ordering inside `spawnWorldEvent`'s transaction (after this task):**
1. Per-zone cap (only if `zoneId`)
2. Global ambient cap (only if `type !== 'boss'`)
3. Per-zone duplicate-effectType dedup (only if `zoneId`)
4. `create`

- [ ] **Step 1: Add the `WORLD_EVENT_CONSTANTS` import to the test file**

In `apps/api/src/services/worldEventService.test.ts`, add this import directly below the existing `import { roundTimerRegistry } ...` / before the `worldEventService` import block (around line 14):

```ts
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 2: Update the existing world-wide test and add the failing tests**

In `worldEventService.test.ts`, **replace** the existing test that begins
`it('skips both checks for world-wide events (no zoneId)', ...)` (currently around lines 203–219) with the following test, then add the three new tests immediately after it (all inside `describe('spawnWorldEvent', ...)`):

```ts
    it('enforces the global cap but skips per-zone checks for world-wide events', async () => {
      mockPrisma.worldEvent.count.mockResolvedValue(0); // global ambient count under cap
      mockPrisma.worldEvent.create.mockResolvedValue(
        makeEventRow({ zoneId: null, zone: null }),
      );

      const result = await spawnWorldEvent({
        ...baseParams,
        zoneId: null,
        type: 'resource',
        effectType: 'yield_up',
        effectValue: 0.3,
      });

      expect(result).not.toBeNull();
      // No per-zone dedup for world-wide events
      expect(mockPrisma.worldEvent.findFirst).not.toHaveBeenCalled();
      // But the global ambient cap IS checked
      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
    });

    it('returns null when the global MAX_ACTIVE_EVENTS cap is reached', async () => {
      // Per-zone count under its cap, but global ambient count at the cap
      mockPrisma.worldEvent.count.mockImplementation((args: any) =>
        Promise.resolve(
          'zoneId' in (args?.where ?? {}) ? 0 : WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS,
        ),
      );

      const result = await spawnWorldEvent(baseParams);

      expect(result).toBeNull();
      // Global cap short-circuits before dedup / create
      expect(mockPrisma.worldEvent.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.worldEvent.create).not.toHaveBeenCalled();
    });

    it('allows spawn when below the global MAX_ACTIVE_EVENTS cap', async () => {
      // Per-zone under cap (1), global one below cap
      mockPrisma.worldEvent.count.mockImplementation((args: any) =>
        Promise.resolve(
          'zoneId' in (args?.where ?? {})
            ? 1
            : WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS - 1,
        ),
      );
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow());

      const result = await spawnWorldEvent(baseParams);

      expect(result).not.toBeNull();
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });

    it('allows boss spawn even when the global ambient cap is reached', async () => {
      // Global ambient at cap, but bosses skip the global gate; per-zone count is 0
      mockPrisma.worldEvent.count.mockImplementation((args: any) =>
        Promise.resolve(
          'zoneId' in (args?.where ?? {}) ? 0 : WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS,
        ),
      );
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null);
      mockPrisma.worldEvent.create.mockResolvedValue(makeEventRow({ type: 'boss' }));

      const result = await spawnWorldEvent({
        ...baseParams,
        type: 'boss',
        effectType: 'damage_up',
        effectValue: 0,
      });

      expect(result).not.toBeNull();
      // The global ambient cap query must NOT run for boss spawns
      expect(mockPrisma.worldEvent.count).not.toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
      expect(mockPrisma.worldEvent.create).toHaveBeenCalled();
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -w apps/api -- run src/services/worldEventService.test.ts`
Expected: FAIL. The updated world-wide test fails (global `count` not yet called); the cap/boss tests fail (no global gate yet — e.g. the "returns null" test reaches `create`/throws instead of returning `null`).

- [ ] **Step 4: Add the `MAX_ACTIVE_EVENTS` constant**

In `packages/shared/src/constants/gameConstants.ts`, inside `WORLD_EVENT_CONSTANTS`, add the line shown below directly after `MAX_WORLD_EVENTS: 1,`:

```ts
  MAX_ZONE_EVENTS: 2,
  MAX_WORLD_EVENTS: 1,
  MAX_ACTIVE_EVENTS: 4, // global cap on concurrent non-boss events (zone + world-wide)
  EVENT_RESPAWN_DELAY_MINUTES: 30,
```

- [ ] **Step 5: Enforce the global cap in `spawnWorldEvent`**

In `apps/api/src/services/worldEventService.ts`, inside the `prisma.$transaction` callback, insert the global cap block **between** the existing per-zone cap block and the duplicate-effectType block. The result should read:

```ts
    // Per-zone total cap (applies to all spawn paths)
    if (params.zoneId) {
      const activeInZone = await tx.worldEvent.count({
        where: { zoneId: params.zoneId, status: 'active' },
      });
      if (activeInZone >= WORLD_EVENT_CONSTANTS.MAX_ZONE_EVENTS) return null;
    }

    // Global cap on concurrent non-boss events (zone + world-wide). Bosses are
    // governed solely by MAX_BOSS_ENCOUNTERS and are excluded from this gate.
    if (params.type !== 'boss') {
      const activeAmbient = await tx.worldEvent.count({
        where: { status: 'active', type: { not: 'boss' } },
      });
      if (activeAmbient >= WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS) return null;
    }

    // Slot check: zone events — no duplicate effectType in the same zone
    if (params.zoneId) {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -w apps/api -- run src/services/worldEventService.test.ts`
Expected: PASS (all `spawnWorldEvent` tests, including the 3 new ones and the updated world-wide test, plus the pre-existing per-zone and dedup tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors. (`tsc -b` rebuilds `packages/shared` first via project references, so the new constant is visible to `apps/api`.)

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts apps/api/src/services/worldEventService.ts apps/api/src/services/worldEventService.test.ts
git commit -m "World events: global cap of 4 concurrent non-boss events

Enforced in spawnWorldEvent (covers scheduler, exploration discovery,
and admin). World-wide events count toward the cap; bosses excluded.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Scheduler early-out at the global cap

**Files:**
- Modify: `apps/api/src/services/eventSchedulerService.ts:399-417` (Step 4 of `checkAndSpawnEvents`)
- Test: `apps/api/src/services/eventSchedulerService.test.ts` (add `count` default to `beforeEach`; add 1 new test)

**Interfaces:**
- Consumes: `WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS` (from Task 1); `prisma.worldEvent.count`.
- Produces: no new exports. `checkAndSpawnEvents` skips the world-wide/zone spawn roll entirely when `>= MAX_ACTIVE_EVENTS` non-boss events are active. This is an optimization only; `spawnWorldEvent` (Task 1) remains the authoritative gate.

**Why the `beforeEach` change is required:** Task 2 adds a `prisma.worldEvent.count` call to Step 4. The existing zone-spawn tests (`setupZonePath`) set `worldEvent.findFirst → null` (so Step 4 runs) but never mock `worldEvent.count`, which would then return `undefined`. Since `undefined < 4` is `false`, spawning would be incorrectly skipped and those tests would break. Defaulting `count` to `0` in `beforeEach` keeps them passing; world-wide tests override `count` with their own values (all `< 4`), and boss tests set `findFirst → recent` so Step 4 is skipped before the count call.

- [ ] **Step 1: Add the new failing test and the `beforeEach` default**

In `apps/api/src/services/eventSchedulerService.test.ts`:

(a) In the top-level `beforeEach` (the one that already sets `mockPrisma.bossEncounter.count...`), add this line directly after that `bossEncounter.count` default:

```ts
    // Default: global ambient cap not reached (zone-spawn tests rely on this)
    mockPrisma.worldEvent.count.mockResolvedValue(0);
```

(b) Add this test at the end of the `describe('checkAndSpawnEvents', ...)` block (after the `'queries worldEvent.findFirst with correct cooldown cutoff'` test, before that `describe` closes):

```ts
    it('does not attempt to spawn an event when the global ambient cap is reached', async () => {
      mockPrisma.worldEvent.findFirst.mockResolvedValue(null); // respawn cooldown clear
      // Global ambient count at the cap
      mockPrisma.worldEvent.count.mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS);
      // bossEncounter.count defaults to MAX in beforeEach → boss path skipped
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // would otherwise pick the zone path

      await checkAndSpawnEvents(null);

      expect(mockPrisma.worldEvent.count).toHaveBeenCalledWith({
        where: { status: 'active', type: { not: 'boss' } },
      });
      expect(spawnWorldEvent).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the scheduler tests to verify the new test fails**

Run: `npm run test -w apps/api -- run src/services/eventSchedulerService.test.ts`
Expected: FAIL on the new test — without the early-out, Step 4 still enters the zone path (no global `count` query yet, so the `toHaveBeenCalledWith` assertion fails).

- [ ] **Step 3: Add the early-out to the scheduler**

In `apps/api/src/services/eventSchedulerService.ts`, in `checkAndSpawnEvents` Step 4, wrap the spawn roll with a global-cap check. Replace the existing block:

```ts
    if (!recentEvent) {
      // Roll for world-wide or zone event (50/50 chance, but caps enforce limits)
      if (Math.random() < 0.5) {
        await trySpawnWorldWideEvent(io);
      } else {
        await trySpawnZoneEvent(io);
      }
    }
```

with:

```ts
    if (!recentEvent) {
      // Skip the roll entirely if the global ambient cap is already reached —
      // avoids wasted template/target resolution. spawnWorldEvent re-checks
      // this authoritatively inside its transaction.
      const activeAmbient = await prisma.worldEvent.count({
        where: { status: 'active', type: { not: 'boss' } },
      });
      if (activeAmbient < WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS) {
        // Roll for world-wide or zone event (50/50 chance, but caps enforce limits)
        if (Math.random() < 0.5) {
          await trySpawnWorldWideEvent(io);
        } else {
          await trySpawnZoneEvent(io);
        }
      }
    }
```

- [ ] **Step 4: Run the scheduler tests to verify they pass**

Run: `npm run test -w apps/api -- run src/services/eventSchedulerService.test.ts`
Expected: PASS — the new early-out test passes, and all pre-existing scheduler tests still pass (zone tests rely on the `count` default of `0`; world-wide tests override `count` with values `< 4`; boss tests skip Step 4 via the recent-event short-circuit).

- [ ] **Step 5: Run the full API test suite and typecheck**

Run: `npm run test:api`
Expected: PASS. (If the suite hangs or errors on connection, ensure the `pocketrealm-redis` container is running — some API tests require Redis.)

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/eventSchedulerService.ts apps/api/src/services/eventSchedulerService.test.ts
git commit -m "World events: skip spawn roll when global cap reached

Scheduler early-out avoids wasted template/target resolution when
already at MAX_ACTIVE_EVENTS. spawnWorldEvent remains authoritative.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes / Out of Scope

- **No production cleanup.** Existing events expire naturally (zone 6h / world-wide 4h); nothing new spawns until under the cap, so production self-heals within ~6 hours of deploy.
- No changes to event durations, weights, spawn cooldown, per-zone cap, or the World Events UI.
- The free-zone-priority logic in `trySpawnZoneEvent` is intentionally retained — with a global cap of 4 it spreads the few active events across distinct zones rather than stacking them.
