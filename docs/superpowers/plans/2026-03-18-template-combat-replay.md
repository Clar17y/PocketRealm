# Template Combat Replay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players replay lost fights with edited templates using the same RNG seed, turning combat losses into learning opportunities.

**Architecture:** Add seeded PRNG to the combat engine (temp `Math.random` swap), cache combatant state on loss in Redis, new replay route under `/training/replay`. Frontend shows "Replay Fight" on defeat/fled/draw.

**Tech Stack:** Game engine (pure TS), Redis (cache), Express routes, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-template-combat-replay-design.md`

---

### Task 1: Add Replay Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

- [ ] **Step 1: Add REPLAY_CONSTANTS**

```typescript
export const REPLAY_CONSTANTS = {
  /** Time window for replay availability after a combat loss (seconds) */
  CACHE_TTL_SECONDS: 600,
} as const;
```

- [ ] **Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(replay): add REPLAY_CONSTANTS"
```

---

### Task 2: Implement Seeded PRNG in Combat Engine

**Files:**
- Create: `packages/game-engine/src/combat/seededRng.ts`
- Test: `packages/game-engine/src/combat/seededRng.test.ts`
- Modify: `packages/shared/src/types/combat.types.ts` (add `seed` to `CombatOptions`)
- Modify: `packages/game-engine/src/combat/templateCombatEngine.ts`
- Test: `packages/game-engine/src/combat/templateCombatEngine.test.ts` (or colocated test)

- [ ] **Step 1: Write seeded RNG test**

```typescript
import { describe, expect, it } from 'vitest';
import { createSeededRng } from './seededRng';

describe('createSeededRng', () => {
  it('produces deterministic sequence for same seed', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    expect(seq1).not.toEqual(seq2);
  });

  it('produces values in [0, 1) range', () => {
    const rng = createSeededRng(12345);
    const values = Array.from({ length: 1000 }, () => rng());

    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:engine -- --run seededRng`
Expected: FAIL — module not found

- [ ] **Step 3: Implement seeded RNG (mulberry32)**

Create `packages/game-engine/src/combat/seededRng.ts`:

```typescript
/**
 * Mulberry32 — fast, simple seeded PRNG.
 * Returns a function that produces deterministic values in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:engine -- --run seededRng`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/combat/seededRng.ts packages/game-engine/src/combat/seededRng.test.ts
git commit -m "feat(replay): add mulberry32 seeded PRNG"
```

- [ ] **Step 6: Write test for seeded combat determinism**

Add to the existing engine tests or create a new file:

```typescript
import { describe, expect, it, afterEach } from 'vitest';
import { runTemplateCombat } from './templateCombatEngine';
// Import or build minimal test combatants — check existing test patterns

describe('runTemplateCombat with seed', () => {
  it('produces identical results with same seed', () => {
    // Build two identical combatant pairs
    const [playerA, mobA] = buildTestCombatants();
    const [playerB, mobB] = buildTestCombatants();

    const result1 = runTemplateCombat(playerA, mobA, { seed: 42 });
    const result2 = runTemplateCombat(playerB, mobB, { seed: 42 });

    expect(result1.outcome).toBe(result2.outcome);
    expect(result1.totalRounds).toBe(result2.totalRounds);
    expect(result1.combatantAHpRemaining).toBe(result2.combatantAHpRemaining);
    expect(result1.combatantBHpRemaining).toBe(result2.combatantBHpRemaining);
    expect(result1.log.length).toBe(result2.log.length);
  });

  it('produces different results with different seeds', () => {
    const [playerA, mobA] = buildTestCombatants();
    const [playerB, mobB] = buildTestCombatants();

    const result1 = runTemplateCombat(playerA, mobA, { seed: 42 });
    const result2 = runTemplateCombat(playerB, mobB, { seed: 99999 });

    // At least one of these should differ (probabilistically certain with different seeds)
    const sameOutcome = result1.outcome === result2.outcome;
    const sameRounds = result1.totalRounds === result2.totalRounds;
    const sameHp = result1.combatantAHpRemaining === result2.combatantAHpRemaining;
    expect(sameOutcome && sameRounds && sameHp).toBe(false);
  });

  it('does not affect subsequent unseeded combats', () => {
    const [player1, mob1] = buildTestCombatants();
    runTemplateCombat(player1, mob1, { seed: 42 });

    // Math.random should be restored
    const val = Math.random();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });
});
```

Note: `buildTestCombatants()` is a helper — check existing test files for how combatants are built in tests. If none exist, create a minimal helper using `buildPlayerTemplateCombatant` and `mobToTemplateCombatant` patterns.

- [ ] **Step 7: Add `seed` to `CombatOptions` in shared types**

The `CombatOptions` type is defined in `packages/shared/src/types/combat.types.ts`, NOT in the engine. Modify `CombatOptions` in the shared package to add `seed?: number`:

```typescript
// In packages/shared/src/types/combat.types.ts:
export interface CombatOptions {
  combatMode?: CombatMode;
  seed?: number;
}
```

After modifying, rebuild the shared package:

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

- [ ] **Step 8: Modify `runTemplateCombat` to use seed from options**

In `packages/game-engine/src/combat/templateCombatEngine.ts`:

1. At the top of `runTemplateCombat`, wrap the combat loop:

```typescript
import { createSeededRng } from './seededRng';

// Inside runTemplateCombat, before the combat loop:
const originalRandom = Math.random;
if (options?.seed !== undefined) {
  Math.random = createSeededRng(options.seed);
}
try {
  // ... existing combat loop (unchanged)
} finally {
  Math.random = originalRandom;
}
```

Do NOT add a local `CombatOptions` interface in `templateCombatEngine.ts` — it already imports `CombatOptions` from `@pocketrealm/shared`.

- [ ] **Step 9: Export seededRng from game-engine package**

Update `packages/game-engine/src/index.ts` if needed to export `createSeededRng`.

- [ ] **Step 10: Run tests**

Run: `npm run test:engine`
Expected: All existing + new tests PASS

- [ ] **Step 11: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build

- [ ] **Step 12: Commit**

```bash
git add packages/shared/src/types/combat.types.ts packages/game-engine/src/combat/templateCombatEngine.ts packages/game-engine/src/combat/seededRng.ts packages/game-engine/src/combat/seededRng.test.ts <test-file>
git commit -m "feat(replay): add seeded PRNG support to runTemplateCombat"
```

---

### Task 3: Create Replay Routes

**Files:**
- Modify: `apps/api/src/routes/training.ts` (add replay routes)
- Create: `apps/api/src/services/replayService.ts`
- Test: `apps/api/src/services/replayService.test.ts`

- [ ] **Step 1: Write replay service test**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  ttl: vi.fn(),
};
vi.mock('../redis', () => ({ redis: mockRedis }));

import { getReplayState, cacheReplayData, runReplay } from './replayService';

describe('replayService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getReplayState', () => {
    it('returns unavailable when no cache exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const state = await getReplayState('player-1');
      expect(state.available).toBe(false);
    });

    it('returns available with TTL when cache exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({
        mobDisplayName: 'Enraged Wolf',
        originalOutcome: 'defeat',
      }));
      mockRedis.ttl.mockResolvedValue(300);

      const state = await getReplayState('player-1');
      expect(state.available).toBe(true);
      expect(state.secondsRemaining).toBe(300);
      expect(state.mobDisplayName).toBe('Enraged Wolf');
    });
  });

  describe('cacheReplayData', () => {
    it('stores combatant data with correct TTL', async () => {
      await cacheReplayData('player-1', {
        playerCombatant: {} as any,
        mobCombatant: {} as any,
        combatOptions: { combatMode: 'pve_open_world' },
        seed: 42,
        originalOutcome: 'defeat',
        zoneId: 'zone-1',
        mobDisplayName: 'Wolf',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'replay:player-1',
        expect.any(String),
        'EX',
        600,
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- --run replayService`
Expected: FAIL — module not found

- [ ] **Step 3: Implement replay service**

Create `apps/api/src/services/replayService.ts`:

```typescript
import { REPLAY_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';
import { runTemplateCombat, type TemplateCombatant } from '@pocketrealm/game-engine';
import type { CombatOptions, CombatOutcome } from '@pocketrealm/shared';
import { mapTemplateCombatLog } from './combatLogMapper';
import type { CombatTemplateSlotData } from '@pocketrealm/shared';

interface ReplayCacheData {
  playerCombatant: Omit<TemplateCombatant, 'template'>;
  mobCombatant: TemplateCombatant;
  combatOptions: CombatOptions;
  seed: number;
  originalOutcome: CombatOutcome;
  zoneId: string;
  mobDisplayName: string;
}

const CACHE_KEY = (playerId: string) => `replay:${playerId}`;

export async function cacheReplayData(playerId: string, data: ReplayCacheData): Promise<void> {
  await redis.set(
    CACHE_KEY(playerId),
    JSON.stringify(data),
    'EX',
    REPLAY_CONSTANTS.CACHE_TTL_SECONDS,
  );
}

export async function getReplayState(playerId: string) {
  const raw = await redis.get(CACHE_KEY(playerId));
  if (!raw) return { available: false as const, secondsRemaining: 0 };

  const ttl = await redis.ttl(CACHE_KEY(playerId));
  const data = JSON.parse(raw) as ReplayCacheData;

  return {
    available: true as const,
    secondsRemaining: Math.max(ttl, 0),
    mobDisplayName: data.mobDisplayName,
    originalOutcome: data.originalOutcome,
  };
}

export async function runReplay(playerId: string, slots: CombatTemplateSlotData[]) {
  const raw = await redis.get(CACHE_KEY(playerId));
  if (!raw) return null;

  const data = JSON.parse(raw) as ReplayCacheData;

  // Reconstruct player combatant with new template
  const playerCombatant: TemplateCombatant = {
    ...data.playerCombatant,
    template: slots.map((s) => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId,
    })),
  } as TemplateCombatant;

  const result = runTemplateCombat(playerCombatant, data.mobCombatant, {
    ...data.combatOptions,
    seed: data.seed,
  });

  return {
    ...result,
    log: mapTemplateCombatLog(result.log),
  };
}
```

Note: Adjust the `template` reconstruction to match the exact `TemplateCombatant.template` type from the engine. Check the type definition.

- [ ] **Step 4: Run tests**

Run: `npm run test:api -- --run replayService`
Expected: All PASS

- [ ] **Step 5: Add routes to training router**

In `apps/api/src/routes/training.ts`, add:

Note: The training router already applies `authenticate` middleware at the top level (e.g., `router.use(authenticate)`), so individual routes do NOT need to repeat `authenticate`.

```typescript
import { getReplayState, runReplay } from '../services/replayService';
import { asyncHandler } from '../utils/asyncHandler';

// GET /training/replay — check replay availability
router.get('/replay', asyncHandler(async (req, res) => {
  const state = await getReplayState(req.player!.playerId);
  res.json(state);
}));

// POST /training/replay — run a replay simulation
router.post('/replay', asyncHandler(async (req, res) => {
  const { slots } = req.body;
  // Validate slots using same Zod schema as template save
  // ... (reuse existing template slot validation)

  const result = await runReplay(req.player!.playerId, slots);
  if (!result) {
    return res.status(410).json({ error: 'Replay expired' });
  }

  res.json({ combat: result, isReplay: true });
}));
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/replayService.ts apps/api/src/services/replayService.test.ts apps/api/src/routes/training.ts
git commit -m "feat(replay): add replay service and routes"
```

---

### Task 4: Cache Combatant Data on Combat Loss (combat/start.ts)

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (both zone combat and encounter site combat paths)

- [ ] **Step 1: Add imports**

```typescript
import { cacheReplayData } from '../../services/replayService';
```

- [ ] **Step 2: Cache on zone combat loss**

After `runTemplateCombat` returns in the zone combat path, if the outcome is not `victory`:

```typescript
if (combatResult.outcome !== 'victory') {
  const { template: _t, ...playerCombatantNoTemplate } = playerCombatant;
  cacheReplayData(playerId, {
    playerCombatant: playerCombatantNoTemplate,
    mobCombatant,
    combatOptions: { combatMode: 'pve_open_world' },
    seed: combatSeed, // Generated before runTemplateCombat
    originalOutcome: combatResult.outcome,
    zoneId,
    mobDisplayName: prefixedMob.mobDisplayName,
  }).catch(() => {}); // Fire and forget
}
```

Note: Check if `buildPveCombatOptions` includes potions. If so, cache the full options object returned by `buildPveCombatOptions` rather than constructing a minimal `{ combatMode: 'pve_open_world' }`, so that potion effects are replayed correctly.

Also add seed generation before combat:

```typescript
const combatSeed = Math.floor(Math.random() * 2 ** 32);
const combatResult = runTemplateCombat(playerCombatant, mobCombatant, {
  combatMode: 'pve_open_world',
  seed: combatSeed,
});
```

- [ ] **Step 3: Cache on encounter site combat loss**

Same pattern in the encounter site fight loop — cache on the final losing fight.

- [ ] **Step 4: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat(replay): cache combatant state on combat loss"
```

---

### Task 5: Cache Combatant Data on Exploration Ambush Loss

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts` (ambush combat loss path)

The plan currently only covers `combat/start.ts`, but exploration ambush combat losses (in `exploration/start.ts`) also need replay caching.

- [ ] **Step 1: Add imports**

```typescript
import { cacheReplayData } from '../../services/replayService';
```

- [ ] **Step 2: Cache on ambush combat loss**

After the ambush `runTemplateCombat` returns in the exploration route, if the outcome is not `victory`:

```typescript
if (combatResult.outcome !== 'victory') {
  const { template: _t, ...playerCombatantNoTemplate } = playerCombatant;
  cacheReplayData(playerId, {
    playerCombatant: playerCombatantNoTemplate,
    mobCombatant,
    combatOptions: { combatMode: 'pve_open_world' },
    seed: combatSeed,
    originalOutcome: combatResult.outcome,
    zoneId,
    mobDisplayName: mob.displayName ?? mob.name,
  }).catch(() => {}); // Fire and forget
}
```

Note: Check variable names in scope — `mob.displayName` or similar may differ. Also add seed generation before the ambush combat call, same pattern as Task 4 Step 2.

- [ ] **Step 3: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat(replay): cache combatant state on exploration ambush loss"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run all engine tests**

Run: `npm run test:engine`
Expected: All PASS

- [ ] **Step 2: Run all API tests**

Run: `npm run test:api`
Expected: All PASS

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 4: Build everything**

Run: `npm run build`
Expected: Clean build

**Note:** This plan covers backend only. Frontend implementation (UI components, screens) will be a separate follow-up plan.
