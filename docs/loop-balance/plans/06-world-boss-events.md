# Plan 06: World Boss & Events

## Goal

Make boss encounters reliably beatable and reliably available. Currently boss HP values can produce fights lasting 200+ rounds (16+ real-time hours at tier 5), and boss spawns depend on a 10% chance roll inside the zone event scheduler -- meaning bosses may not appear for days. This plan:

1. Reduces `BOSS_HP_PER_PLAYER_BY_TIER` so fights resolve within the 100-round auto-loss limit.
2. Decouples boss spawning from the zone event scheduler into a dedicated timer (guaranteed twice per day).
3. Shortens world-wide event duration from 6 hours to 4 hours to differentiate them from zone events.

---

## Changes

### Step 1 -- Reduce BOSS_HP_PER_PLAYER_BY_TIER

**File:** `packages/shared/src/constants/gameConstants.ts` (line ~685)

Change:

```typescript
BOSS_HP_PER_PLAYER_BY_TIER: [200, 500, 1000, 2000, 4000] as readonly number[],
```

To:

```typescript
BOSS_HP_PER_PLAYER_BY_TIER: [150, 300, 600, 1000, 1500] as readonly number[],
```

**Rationale (work backwards from the 100-round limit):**

- A mid-level DPS player deals ~20-30 net damage per round after boss defence.
- In a typical 5-player group, 3 are DPS = ~70 damage per round.
- 100 rounds x 70 damage = 7,000 total damage.
- HP per player should be well under 1,400 for a beatable fight.
- Boss defence by tier is `[5, 12, 20, 35, 50]` -- higher tiers eat more damage, so HP must drop proportionally.
- The new values give these approximate total boss HP for a 5-player fight: 750 / 1,500 / 3,000 / 5,000 / 7,500.
- At ~70 damage/round, that is 11 / 21 / 43 / 71 / 107 rounds -- tier 5 is tight, which is intentional (it should feel like a challenge). These values need playtesting.

### Step 2 -- Add BOSS_SPAWN_INTERVAL_HOURS constant

**File:** `packages/shared/src/constants/gameConstants.ts`

Add to `WORLD_EVENT_CONSTANTS`, in the "Boss spawning" section (after `MAX_BOSS_ENCOUNTERS`):

```typescript
BOSS_SPAWN_INTERVAL_HOURS: 12,
```

This constant drives the new dedicated boss timer (step 3).

### Step 3 -- Create dedicated boss spawn timer in the event scheduler

**File:** `apps/api/src/services/eventSchedulerService.ts`

Currently `trySpawnBoss` is called from inside `trySpawnZoneEvent` after a `BOSS_SPAWN_CHANCE` roll (line ~276). Boss spawns share the 30-minute `EVENT_RESPAWN_DELAY_MINUTES` cooldown because they go through `checkAndSpawnEvents`.

**Changes:**

1. **Add a module-level variable** to track the last boss spawn attempt, similar to the existing `lastRunAt`:

   ```typescript
   let lastBossSpawnAt = 0;
   ```

2. **Extract a new exported function** `checkAndSpawnBoss(io)`:
   - Calculate the boss timer interval: `BOSS_SPAWN_INTERVAL_HOURS * 60 * 60 * 1000`.
   - If `now - lastBossSpawnAt < interval`, return early.
   - Set `lastBossSpawnAt = now`.
   - Check if a boss is already active (`MAX_BOSS_ENCOUNTERS` cap) -- if so, return early.
   - Query for the last boss encounter's `createdAt` from the database. If one was created less than `BOSS_SPAWN_INTERVAL_HOURS` ago, return early. This makes the timer DB-backed and survive server restarts (same pattern as the event cooldown on lines 340-346).
   - Pick a random wild zone.
   - Call the existing `trySpawnBoss(io, zone.id, zone.name)`.

3. **Remove the boss roll from `trySpawnZoneEvent`** (lines 275-279). Delete or comment out:

   ```typescript
   // Roll for boss spawn (before regular event)
   if (Math.random() < WORLD_EVENT_CONSTANTS.BOSS_SPAWN_CHANCE) {
     const spawned = await trySpawnBoss(io, zone.id, zone.name);
     if (spawned) return;
   }
   ```

   **Alternative:** Keep the `BOSS_SPAWN_CHANCE` roll as a rare bonus spawn path (a lucky zone event tick can still spawn a boss). If keeping it, consider reducing `BOSS_SPAWN_CHANCE` from `0.10` to `0.05` so the dedicated timer is the primary path. Document the decision either way.

4. **Call `checkAndSpawnBoss(io)` from `checkAndSpawnEvents`** (line ~337), right after `checkAndResolveDueBossRounds`:

   ```typescript
   await checkAndResolveDueBossRounds(io);
   await checkAndSpawnBoss(io);
   ```

   This keeps boss spawning on the same tick loop (1-minute `MIN_INTERVAL_MS`) but with its own independent 12-hour cooldown, decoupled from the event respawn delay.

### Step 4 -- Shorten world-wide event duration

**File:** `packages/shared/src/constants/gameConstants.ts` (line ~670)

Change:

```typescript
WORLD_WIDE_EVENT_DURATION_HOURS: 6,
```

To:

```typescript
WORLD_WIDE_EVENT_DURATION_HOURS: 4,
```

Zone event durations (`RESOURCE_EVENT_DURATION_HOURS`, `MOB_EVENT_DURATION_HOURS`) stay at 6. No code changes needed beyond the constant -- `getDuration()` in `eventSchedulerService.ts` already reads this constant for world-scope templates.

### Step 5 -- Fix tests

Run `npm run test:engine` and `npm run test:api`. Expect failures in:

1. **`packages/shared/src/constants/gameConstants.test.ts`** -- The "boss tier arrays increase monotonically" test (line ~305) should still pass with the new values since they are still monotonically increasing. No changes needed here.

2. **`apps/api/src/services/bossEncounterService.test.ts`** -- Tests that assert specific HP values based on the old array:
   - Line ~371: Comment says `BOSS_HP_PER_PLAYER_BY_TIER[2]=1000` -- update to `600` and fix the expected `scaledMaxHp`.
   - Line ~442: Comment says `BOSS_HP_PER_PLAYER_BY_TIER[4] = 4000`, expected `maxHp: 4000` -- update to `1500`.
   - Line ~456: Comment says `BOSS_HP_PER_PLAYER_BY_TIER[0] = 200`, expected `maxHp: 200` -- update to `150`.

3. **`apps/api/src/services/eventSchedulerService.test.ts`** -- Tests that mock `Math.random()` for the boss spawn chance roll (lines ~509, ~589) will need updating if the boss roll is removed from `trySpawnZoneEvent`. If the roll is kept but reduced, update the threshold comments. Add new tests for:
   - `checkAndSpawnBoss` respects the 12-hour interval.
   - `checkAndSpawnBoss` respects the `MAX_BOSS_ENCOUNTERS` cap.
   - `checkAndSpawnBoss` picks a random wild zone.
   - `checkAndSpawnBoss` skips when a recent boss encounter exists in the DB.

4. **`apps/api/src/services/eventSchedulerService.test.ts`** -- The test "passes WORLD_WIDE_EVENT_DURATION_HOURS for world-scope templates" (line ~307) asserts the constant value. It reads the constant at runtime, so if the assertion is `toBe(WORLD_EVENT_CONSTANTS.WORLD_WIDE_EVENT_DURATION_HOURS)` it will pass automatically. If it hardcodes `6`, change to `4`.

---

## Files to Modify

| # | File | What to change |
|---|------|----------------|
| 1 | `packages/shared/src/constants/gameConstants.ts` | `BOSS_HP_PER_PLAYER_BY_TIER` values, add `BOSS_SPAWN_INTERVAL_HOURS: 12`, change `WORLD_WIDE_EVENT_DURATION_HOURS` from 6 to 4 |
| 2 | `apps/api/src/services/eventSchedulerService.ts` | Add `checkAndSpawnBoss()` with dedicated 12-hour timer; remove or reduce boss roll from `trySpawnZoneEvent`; call new function from `checkAndSpawnEvents` |
| 3 | `apps/api/src/services/bossEncounterService.test.ts` | Update hardcoded HP expectations to match new tier values |
| 4 | `apps/api/src/services/eventSchedulerService.test.ts` | Update/remove boss spawn chance mock sequences; add tests for new `checkAndSpawnBoss` function; verify world event duration assertion |

No changes needed to server startup -- the new boss timer runs inside the existing `checkAndSpawnEvents` tick loop.

---

## Testing

1. Run `npm run test:engine` and `npm run test:api` -- fix all failures from the constant changes.
2. Verify boss HP values are updated in all 5 tiers and still pass the monotonic-increase test.
3. Test that the new boss timer spawns independently of zone events (not blocked by `EVENT_RESPAWN_DELAY_MINUTES`).
4. Test that `checkAndSpawnBoss` respects the `MAX_BOSS_ENCOUNTERS` cap (no second boss while one is active).
5. Test that `checkAndSpawnBoss` uses DB-based cooldown (survives server restart).
6. Test that world-wide events expire after 4 hours (zone events still at 6).
7. Verify boss fights are completable within 100 rounds at the new HP values -- at minimum, a 5-player tier-3 fight should finish in ~40-50 rounds, not 100+.

---

## Build Steps

After all changes:

```bash
npm run build
npm run typecheck
npm run test:engine
npm run test:api
```
