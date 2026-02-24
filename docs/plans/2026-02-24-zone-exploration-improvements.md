# Zone & Exploration Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix exploration counter overflow, add zone exit scaling with auto-unlock, show undiscovered zone hints, rework mob tier selection with bidirectional bleedthrough, add hidden cache rewards, and display encounter site turn costs.

**Architecture:** Six independent changes touching game-engine pure functions, API services/routes, shared constants, and frontend components. All changes are additive — no schema migrations needed. The mob tier rework replaces the existing upward-only bleedthrough with a symmetric 10/15/50/15/10 distribution plus a player-selectable tier.

**Tech Stack:** TypeScript, Vitest, Prisma, Express, Next.js/React

**Design doc:** `docs/plans/2026-02-24-zone-exploration-improvements-design.md`

---

### Task 1: Fix Exploration Counter Overflow

**Files:**
- Modify: `apps/api/src/services/zoneExplorationService.ts:32-44`
- Test: `apps/api/src/services/zoneExplorationService.test.ts`

**Step 1: Write failing tests**

Add to `zoneExplorationService.test.ts` in the `addExplorationTurns` describe block:

```typescript
it('should clamp turnsExplored to turnsToExplore cap', async () => {
  // Zone has turnsToExplore = 30000, player already at 29900
  mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });
  mockPrisma.playerZoneExploration.findUnique.mockResolvedValue({
    playerId: 'p1', zoneId: 'z1', turnsExplored: 29900,
  });
  mockPrisma.playerZoneExploration.upsert.mockResolvedValue({} as any);

  await addExplorationTurns('p1', 'z1', 500);

  expect(mockPrisma.playerZoneExploration.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: { turnsExplored: { increment: 100 } }, // clamped from 500 to 100
    }),
  );
});

it('should not increment when already at cap', async () => {
  mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });
  mockPrisma.playerZoneExploration.findUnique.mockResolvedValue({
    playerId: 'p1', zoneId: 'z1', turnsExplored: 30000,
  });

  await addExplorationTurns('p1', 'z1', 500);

  expect(mockPrisma.playerZoneExploration.upsert).not.toHaveBeenCalled();
});

it('should skip clamping when turnsToExplore is null', async () => {
  mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: null });
  mockPrisma.playerZoneExploration.upsert.mockResolvedValue({} as any);

  await addExplorationTurns('p1', 'z1', 500);

  expect(mockPrisma.playerZoneExploration.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: { turnsExplored: { increment: 500 } },
    }),
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --grep "addExplorationTurns"`
Expected: FAIL — current implementation doesn't fetch zone or clamp

**Step 3: Implement clamped addExplorationTurns**

Replace `addExplorationTurns` in `apps/api/src/services/zoneExplorationService.ts:32-44`:

```typescript
export async function addExplorationTurns(
  playerId: string,
  zoneId: string,
  turns: number,
): Promise<void> {
  if (turns <= 0) return;

  const zone = await prismaAny.zone.findUnique({
    where: { id: zoneId },
    select: { turnsToExplore: true },
  });

  let increment = turns;

  if (zone?.turnsToExplore && zone.turnsToExplore > 0) {
    const current = await prismaAny.playerZoneExploration.findUnique({
      where: { playerId_zoneId: { playerId, zoneId } },
      select: { turnsExplored: true },
    });
    const currentTurns = current?.turnsExplored ?? 0;
    increment = Math.min(turns, Math.max(0, zone.turnsToExplore - currentTurns));
    if (increment <= 0) return;
  }

  await prismaAny.playerZoneExploration.upsert({
    where: { playerId_zoneId: { playerId, zoneId } },
    create: { playerId, zoneId, turnsExplored: increment },
    update: { turnsExplored: { increment } },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --grep "addExplorationTurns"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/zoneExplorationService.ts apps/api/src/services/zoneExplorationService.test.ts
git commit -m "fix: clamp exploration counter to zone turnsToExplore cap"
```

---

### Task 2: Rework Mob Tier Bleedthrough (Symmetric 10/15/50/15/10)

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:502-506` (replace TIER_BLEED_CONSTANTS)
- Modify: `packages/game-engine/src/exploration/mobTierFilter.ts:45-66` (rewrite selectTierWithBleedthrough)
- Test: `packages/game-engine/src/exploration/mobTierFilter.test.ts`

**Step 1: Update constants**

Replace `TIER_BLEED_CONSTANTS` in `packages/shared/src/constants/gameConstants.ts:502-506`:

```typescript
export const TIER_BLEED_CONSTANTS = {
  TWO_BELOW: 0.10,
  ONE_BELOW: 0.15,
  SELECTED: 0.50,
  ONE_ABOVE: 0.15,
  TWO_ABOVE: 0.10,
} as const;
```

**Step 2: Write failing tests**

Replace the `selectTierWithBleedthrough` test block in `mobTierFilter.test.ts` with comprehensive tests for the new symmetric distribution:

```typescript
describe('selectTierWithBleedthrough', () => {
  // Tier 3 selected, all 5 slots available (tiers 1-4, but tier 5 doesn't exist)
  // Base: [t1=10%, t2=15%, t3=50%, t4=15%, t5(missing)=10%→t4]
  // Expected: [t1=10, t2=15, t3=50, t4=25]

  it('should return tier-2 (10%) when roll < 0.10 and tier exists', () => {
    const result = selectTierWithBleedthrough(3, null, () => 0.05);
    expect(result).toBe(1); // tier 3-2 = tier 1
  });

  it('should return tier-1 (15%) when roll in [0.10, 0.25)', () => {
    const result = selectTierWithBleedthrough(3, null, () => 0.15);
    expect(result).toBe(2); // tier 3-1 = tier 2
  });

  it('should return selected tier (50%) when roll in [0.25, 0.75)', () => {
    const result = selectTierWithBleedthrough(3, null, () => 0.50);
    expect(result).toBe(3);
  });

  it('should return tier+1 (15%) when roll in [0.75, 0.90)', () => {
    const result = selectTierWithBleedthrough(3, null, () => 0.80);
    expect(result).toBe(4);
  });

  // tier+2 would be tier 5, doesn't exist → goes to highest available (tier 4)
  it('should redirect above-overflow to highest available tier', () => {
    const result = selectTierWithBleedthrough(3, null, () => 0.95);
    expect(result).toBe(4); // tier 5 → highest = tier 4
  });

  // Tier 1 selected: below-overflow goes to selected
  // Base: [t-1(missing)→selected, t0(missing)→selected, t1=50+25=75%, t2=15%, t3=10%]
  it('tier 1: below-overflow collapses to selected (75/15/10/0)', () => {
    // roll < 0.75 → selected (tier 1)
    expect(selectTierWithBleedthrough(1, null, () => 0.00)).toBe(1);
    expect(selectTierWithBleedthrough(1, null, () => 0.74)).toBe(1);
    // roll [0.75, 0.90) → tier 2
    expect(selectTierWithBleedthrough(1, null, () => 0.80)).toBe(2);
    // roll [0.90, 1.0) → tier 3
    expect(selectTierWithBleedthrough(1, null, () => 0.95)).toBe(3);
  });

  // Tier 2 selected: tier-2 (tier 0) doesn't exist → selected
  // [t1=15%, t2=50+10=60%, t3=15%, t4=10%]
  it('tier 2: one below-overflow to selected (15/60/15/10)', () => {
    // roll < 0.10 → below-overflow → selected (tier 2)
    expect(selectTierWithBleedthrough(2, null, () => 0.05)).toBe(2);
    // roll [0.10, 0.25) → tier-1 = tier 1
    expect(selectTierWithBleedthrough(2, null, () => 0.15)).toBe(1);
    // roll [0.25, 0.75) → selected = tier 2
    expect(selectTierWithBleedthrough(2, null, () => 0.50)).toBe(2);
    // roll [0.75, 0.90) → tier+1 = tier 3
    expect(selectTierWithBleedthrough(2, null, () => 0.80)).toBe(3);
    // roll [0.90, 1.0) → tier+2 = tier 4
    expect(selectTierWithBleedthrough(2, null, () => 0.95)).toBe(4);
  });

  // Tier 4 selected: tier+1, tier+2 don't exist → selected
  // [t1=0%, t2=10%, t3=15%, t4=50+25=75%]
  it('tier 4: above-overflow collapses to selected (0/10/15/75)', () => {
    // roll < 0.10 → tier-2 = tier 2
    expect(selectTierWithBleedthrough(4, null, () => 0.05)).toBe(2);
    // roll [0.10, 0.25) → tier-1 = tier 3
    expect(selectTierWithBleedthrough(4, null, () => 0.15)).toBe(3);
    // roll [0.25, 1.0) → selected or overflow → all tier 4
    expect(selectTierWithBleedthrough(4, null, () => 0.50)).toBe(4);
    expect(selectTierWithBleedthrough(4, null, () => 0.80)).toBe(4);
    expect(selectTierWithBleedthrough(4, null, () => 0.95)).toBe(4);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npm run test:engine -- --grep "selectTierWithBleedthrough"`
Expected: FAIL — old implementation uses upward-only bleedthrough

**Step 4: Rewrite selectTierWithBleedthrough**

Replace in `packages/game-engine/src/exploration/mobTierFilter.ts:45-66`:

```typescript
export function selectTierWithBleedthrough(
  selectedTier: number,
  zoneTiers: Record<string, number> | null,
  rng: () => number = Math.random,
): number {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;
  const maxTier = Math.max(...Object.keys(tiers).map(Number).filter(n => !isNaN(n)), 0);
  const minTier = Math.min(...Object.keys(tiers).map(Number).filter(n => !isNaN(n)), maxTier);
  if (maxTier <= 0) return selectedTier;

  const { TWO_BELOW, ONE_BELOW, SELECTED, ONE_ABOVE } = TIER_BLEED_CONSTANTS;
  const roll = rng();

  // Determine raw tier offset from the base distribution
  let targetTier: number;
  if (roll < TWO_BELOW) {
    targetTier = selectedTier - 2;
  } else if (roll < TWO_BELOW + ONE_BELOW) {
    targetTier = selectedTier - 1;
  } else if (roll < TWO_BELOW + ONE_BELOW + SELECTED) {
    targetTier = selectedTier;
  } else if (roll < TWO_BELOW + ONE_BELOW + SELECTED + ONE_ABOVE) {
    targetTier = selectedTier + 1;
  } else {
    targetTier = selectedTier + 2;
  }

  // Redistribute unavailable tiers:
  // Below-range overflow → selected tier
  // Above-range overflow → highest available tier
  if (targetTier < minTier) return selectedTier;
  if (targetTier > maxTier) return maxTier;
  return targetTier;
}
```

**Step 5: Run tests to verify they pass**

Run: `npm run test:engine -- --grep "selectTierWithBleedthrough"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts packages/game-engine/src/exploration/mobTierFilter.ts packages/game-engine/src/exploration/mobTierFilter.test.ts
git commit -m "feat: symmetric 10/15/50/15/10 tier bleedthrough distribution"
```

---

### Task 3: Add Tier Selection to Exploration

**Files:**
- Modify: `packages/shared/src/types/exploration.types.ts` (or wherever exploration request types live — check first)
- Modify: `apps/api/src/routes/exploration/start.ts:71-91` (validation), `:157-168` (tier filtering), `:198-215` (ambush mob selection), `:622` (conditional exploration % increment)
- Modify: `apps/web/src/components/screens/Exploration.tsx` (add tier selector UI)
- Modify: `apps/web/src/app/game/useGameController.ts` (pass tier to API call)

**Step 1: Add tier parameter to exploration start route**

In `apps/api/src/routes/exploration/start.ts`, extend the Zod validation schema (around line 71) to accept an optional `tier` field:

```typescript
const schema = z.object({
  zoneId: z.string().uuid(),
  turns: z.number().int().min(EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS).max(EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS),
  tier: z.number().int().min(1).optional(),
});
```

**Step 2: Validate tier against unlocked tiers**

After fetching `explorationProgress` (around line 120), add tier validation:

```typescript
const tiers = zone.explorationTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;
const unlockedTiers = Object.entries(tiers)
  .filter(([, threshold]) => explorationProgress.percent >= threshold)
  .map(([tier]) => Number(tier));
const maxUnlockedTier = Math.max(...unlockedTiers, 0);
const selectedTier = body.tier ?? maxUnlockedTier;

if (!unlockedTiers.includes(selectedTier)) {
  return res.status(400).json({ error: `Tier ${selectedTier} is not unlocked. Max unlocked: ${maxUnlockedTier}` });
}
```

**Step 3: Pass selectedTier to mob filtering**

In the ambush handling (around line 198), replace `highestUnlockedTier` usage:

```typescript
const targetTier = selectTierWithBleedthrough(selectedTier, zoneTiers);
```

Instead of:
```typescript
const highestUnlockedTier = Math.max(...tieredMobs.map(m => m.explorationTier));
const targetTier = selectTierWithBleedthrough(highestUnlockedTier, zoneTiers);
```

Do the same for encounter site mob generation in `helpers.ts` — pass `selectedTier` instead of deriving it from the filtered mob pool.

**Step 4: Conditional exploration % increment**

At line 622, only increment exploration turns when exploring at max tier:

```typescript
const spentTurns = aborted && abortedAtTurn ? abortedAtTurn : effectiveTurns;
const explorationTurnsToAdd = selectedTier === maxUnlockedTier ? spentTurns : 0;
const explorationBefore = await getExplorationPercent(playerId, body.zoneId);
if (explorationTurnsToAdd > 0) {
  await addExplorationTurns(playerId, body.zoneId, explorationTurnsToAdd);
}
const explorationAfter = await getExplorationPercent(playerId, body.zoneId);
```

**Step 5: Add tier selector to frontend**

In `apps/web/src/components/screens/Exploration.tsx`, add a tier selector above the turn slider. The zone data already includes `tiers` in the exploration object. Show only unlocked tiers. Default to max. Label tiers with the existing flavor text pattern.

```tsx
{explorationProgress?.tiers && (
  <div className="mb-4">
    <label className="text-sm text-[var(--rpg-text-secondary)] mb-2 block">
      Exploration Tier
    </label>
    <div className="flex gap-2">
      {Object.entries(explorationProgress.tiers)
        .filter(([, threshold]) => explorationProgress.percent >= threshold)
        .map(([tier]) => (
          <button
            key={tier}
            onClick={() => setSelectedTier(Number(tier))}
            className={`px-3 py-1 rounded text-sm ${
              selectedTier === Number(tier)
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            Tier {tier}
          </button>
        ))}
    </div>
    {selectedTier !== maxUnlockedTier && (
      <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
        Exploration progress only increases at Tier {maxUnlockedTier}
      </p>
    )}
  </div>
)}
```

**Step 6: Pass tier in API call**

In `useGameController.ts`, update the exploration start call to include the selected tier in the request body.

**Step 7: Run full test suite**

Run: `npm run test`
Expected: All tests pass. Fix any regressions from the bleedthrough changes.

**Step 8: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/useGameController.ts packages/shared/
git commit -m "feat: add tier selection to exploration with conditional progress"
```

---

### Task 4: Zone Exit Scaling + Auto-unlock at 100%

**Files:**
- Create: `packages/game-engine/src/exploration/zoneExitScaling.ts`
- Create: `packages/game-engine/src/exploration/zoneExitScaling.test.ts`
- Modify: `packages/game-engine/src/index.ts` (export new function)
- Modify: `packages/shared/src/constants/gameConstants.ts` (add constants)
- Modify: `apps/api/src/routes/exploration/start.ts` (use scaled chance, add auto-unlock)

**Step 1: Add constants**

In `packages/shared/src/constants/gameConstants.ts`, add to `EXPLORATION_CONSTANTS`:

```typescript
ZONE_EXIT_SCALING_START: 50,
ZONE_EXIT_SCALING_MAX_MULTIPLIER: 20,
```

**Step 2: Write failing tests**

Create `packages/game-engine/src/exploration/zoneExitScaling.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getScaledZoneExitChance } from './zoneExitScaling';

describe('getScaledZoneExitChance', () => {
  const base = 0.0001; // 0.01%

  it('returns base chance at 0% explored', () => {
    expect(getScaledZoneExitChance(base, 0)).toBe(base);
  });

  it('returns base chance at 50% explored (scaling start)', () => {
    expect(getScaledZoneExitChance(base, 50)).toBeCloseTo(base, 8);
  });

  it('returns ~4.75x at 75% explored', () => {
    const result = getScaledZoneExitChance(base, 75);
    expect(result).toBeCloseTo(base * 4.75, 8);
  });

  it('returns ~13.16x at 90% explored', () => {
    const result = getScaledZoneExitChance(base, 90);
    expect(result).toBeCloseTo(base * 13.16, 6);
  });

  it('returns ~19.2x at 99% explored', () => {
    const result = getScaledZoneExitChance(base, 99);
    expect(result / base).toBeGreaterThan(18);
    expect(result / base).toBeLessThan(20);
  });

  it('returns base * MAX_MULTIPLIER at 100%', () => {
    const result = getScaledZoneExitChance(base, 100);
    expect(result).toBeCloseTo(base * 20, 8);
  });

  it('returns 0 when base is 0', () => {
    expect(getScaledZoneExitChance(0, 75)).toBe(0);
  });

  it('returns base when base is null-ish (no zone exit for this zone)', () => {
    expect(getScaledZoneExitChance(0, 50)).toBe(0);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npm run test:engine -- --grep "getScaledZoneExitChance"`
Expected: FAIL — module doesn't exist

**Step 4: Implement getScaledZoneExitChance**

Create `packages/game-engine/src/exploration/zoneExitScaling.ts`:

```typescript
import { EXPLORATION_CONSTANTS } from '@adventure/shared';

export function getScaledZoneExitChance(baseChance: number, explorationPercent: number): number {
  if (baseChance <= 0) return 0;

  const { ZONE_EXIT_SCALING_START, ZONE_EXIT_SCALING_MAX_MULTIPLIER } = EXPLORATION_CONSTANTS;

  if (explorationPercent <= ZONE_EXIT_SCALING_START) return baseChance;

  const progress = Math.min(
    (explorationPercent - ZONE_EXIT_SCALING_START) / (100 - ZONE_EXIT_SCALING_START),
    1,
  );
  const multiplier = 1 + (ZONE_EXIT_SCALING_MAX_MULTIPLIER - 1) * progress * progress;

  return baseChance * multiplier;
}
```

**Step 5: Run tests to verify they pass**

Run: `npm run test:engine -- --grep "getScaledZoneExitChance"`
Expected: PASS

**Step 6: Export from game-engine index**

Add to `packages/game-engine/src/index.ts`:
```typescript
export { getScaledZoneExitChance } from './exploration/zoneExitScaling';
```

**Step 7: Integrate into exploration route**

In `apps/api/src/routes/exploration/start.ts`, where `simulateExploration` is called (around line 168):

Before:
```typescript
const outcomes = simulateExploration(effectiveTurns, zone.zoneExitChance);
```

After:
```typescript
import { getScaledZoneExitChance } from '@adventure/game-engine';

const scaledExitChance = zone.zoneExitChance
  ? getScaledZoneExitChance(zone.zoneExitChance, explorationProgress.percent)
  : null;
const outcomes = simulateExploration(effectiveTurns, scaledExitChance);
```

**Step 8: Add auto-unlock at 100%**

After the `addExplorationTurns` call (around line 622), where `zoneJustFullyExplored` is already computed:

```typescript
if (zoneJustFullyExplored && undiscoveredNeighbors.length > 0) {
  const autoDiscoverNeighbors = undiscoveredNeighbors.filter(n => {
    const threshold = thresholdByToId.get(n.id) ?? 0;
    return explorationAfter.percent >= threshold;
  });
  for (const neighbor of autoDiscoverNeighbors) {
    await discoverZone(playerId, neighbor.id);
    zoneExits.push({
      turnOccurred: effectiveTurns,
      zone: { id: neighbor.id, name: neighbor.name },
    });
    events.push({
      turn: effectiveTurns,
      type: 'zone_exit',
      description: `Zone fully explored! You discovered ${neighbor.name}.`,
      details: { zoneId: neighbor.id, zoneName: neighbor.name },
    });
  }
}
```

**Step 9: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 10: Commit**

```bash
git add packages/game-engine/src/exploration/zoneExitScaling.ts packages/game-engine/src/exploration/zoneExitScaling.test.ts packages/game-engine/src/index.ts packages/shared/src/constants/gameConstants.ts apps/api/src/routes/exploration/start.ts
git commit -m "feat: scale zone exit chance with exploration % and auto-unlock at 100%"
```

---

### Task 5: Zone Connection Hints ('???')

**Files:**
- Modify: `apps/api/src/routes/zones.ts:48-125` (include undiscovered connections)
- Modify: zone UI component on frontend (render '???' entries)

**Step 1: Extend zones API response**

In `apps/api/src/routes/zones.ts`, the connections array (around line 118) currently returns all connections between discovered zones. Extend to also include connections from discovered zones to undiscovered zones:

```typescript
// After building the discovered zone set
const discoveredZoneIds = new Set(discoveries.map(d => d.zoneId));

// Get all connections FROM discovered zones
const allConnectionsFromDiscovered = allConnections.filter(c => discoveredZoneIds.has(c.fromId));

// Split into discovered and undiscovered targets
const discoveredConnections = allConnectionsFromDiscovered.filter(c => discoveredZoneIds.has(c.toId));
const undiscoveredConnections = allConnectionsFromDiscovered.filter(c => !discoveredZoneIds.has(c.toId));

// Build undiscovered hints (deduplicate by toId)
const seenUndiscovered = new Set<string>();
const undiscoveredHints = undiscoveredConnections
  .filter(c => {
    if (seenUndiscovered.has(c.toId)) return false;
    seenUndiscovered.add(c.toId);
    return true;
  })
  .map(c => ({
    id: c.toId,
    name: '???',
    explorationThreshold: c.explorationThreshold ?? 0,
    fromZoneId: c.fromId,
    discovered: false,
  }));
```

Add `undiscoveredZones` to the response alongside existing `zones` and `connections`.

**Step 2: Render '???' entries on frontend**

In the zone list/navigation UI, render undiscovered zone hints:

```tsx
{undiscoveredZones.map(uz => (
  <div key={uz.id} className="opacity-50 border border-dashed border-[var(--rpg-text-secondary)] rounded p-2">
    <span className="text-[var(--rpg-text-secondary)]">??? — {uz.explorationThreshold}% explored to discover</span>
  </div>
))}
```

**Step 3: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/routes/zones.ts apps/web/src/components/
git commit -m "feat: show undiscovered zone connections as '???' hints"
```

---

### Task 6: Hidden Cache Rewards

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (add HIDDEN_CACHE constants)
- Modify: `apps/api/src/routes/exploration/start.ts:473-482` (replace no-op with loot)
- Modify: `apps/api/src/services/chestService.ts` (add or reuse cache loot logic)

**Step 1: Add constants**

In `packages/shared/src/constants/gameConstants.ts`, add:

```typescript
export const HIDDEN_CACHE_CONSTANTS = {
  MATERIAL_ROLLS_MIN: 2,
  MATERIAL_ROLLS_MAX: 4,
  SOULBOUND_DROP_CHANCE: 0.15,
  LUCK_RARITY_SCALING: 0.005,
  RARITY_WEIGHTS: {
    common: 50,
    uncommon: 30,
    rare: 15,
    epic: 5,
  },
} as const;
```

**Step 2: Implement cache loot generation**

Study `apps/api/src/services/chestService.ts` to understand how encounter site chest rewards are generated. Create a similar function `generateCacheLoot` that:

1. Picks a mob family from the zone's `ZoneMobFamily` entries (weighted by `discoveryWeight`)
2. Queries `ChestDropTable` for that mob family (use 'common' chest rarity as baseline)
3. Rolls 2-4 material drops
4. Rolls for soulbound item (15% base, luck-scaled)
5. If soulbound roll succeeds, pick from existing soulbound recipe items for that mob family, roll rarity with luck bonus

The exact implementation depends on the chest service internals — follow the existing pattern for encounter site chest rewards.

**Step 3: Replace hidden_cache no-op**

In `apps/api/src/routes/exploration/start.ts:473-482`, replace:

```typescript
if (outcome.type === 'hidden_cache') {
  hiddenCaches.push({ turnOccurred: outcome.turnOccurred });
  events.push({
    turn: outcome.turnOccurred,
    type: 'hidden_cache',
    description: 'You found a hidden cache.',
    details: {},
  });
  continue;
}
```

With:

```typescript
if (outcome.type === 'hidden_cache') {
  const cacheLoot = await generateCacheLoot(body.zoneId, playerAttributes.luck ?? 0);
  // Add materials to player inventory
  for (const material of cacheLoot.materials) {
    itemRewards.push(material);
  }
  // Add soulbound item if rolled
  if (cacheLoot.soulboundItem) {
    itemRewards.push(cacheLoot.soulboundItem);
  }
  hiddenCaches.push({ turnOccurred: outcome.turnOccurred });
  events.push({
    turn: outcome.turnOccurred,
    type: 'hidden_cache',
    description: 'You found a hidden cache!',
    details: {
      materials: cacheLoot.materials.map(m => ({ name: m.name, quantity: m.quantity })),
      soulboundItem: cacheLoot.soulboundItem ? { name: cacheLoot.soulboundItem.name, rarity: cacheLoot.soulboundItem.rarity } : null,
    },
  });
  continue;
}
```

**Step 4: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts apps/api/src/routes/exploration/start.ts apps/api/src/services/chestService.ts
git commit -m "feat: add material and soulbound item rewards to hidden caches"
```

---

### Task 7: Display Encounter Site Turn Cost

**Files:**
- Modify: `apps/api/src/routes/combat/sites.ts:146-175` (add turnCost fields)
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx:349-416` (display cost)

**Step 1: Add turnCost to API response**

In `apps/api/src/routes/combat/sites.ts`, where each site is mapped to the response (around line 146), add computed fields:

```typescript
{
  // ...existing fields...
  totalTurnCost: aliveMobs * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST,
  roomTurnCosts: roomMobCounts.map((count: number) => count * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST),
}
```

Import `COMBAT_CONSTANTS` from `@adventure/shared`.

**Step 2: Display on encounter site card**

In `apps/web/src/app/game/screens/CombatScreen.tsx`, in the encounter site card (around line 376), add cost display after the mob count:

```tsx
<span className={`text-sm ${e.totalTurnCost > (turns?.current ?? 0) ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-secondary)]'}`}>
  Cost: {e.totalTurnCost.toLocaleString()} turns ({e.aliveMobs} mobs)
</span>
```

**Step 3: Update frontend types**

Add `totalTurnCost: number` and `roomTurnCosts: number[]` to the encounter site type in the frontend API types (check `apps/web/src/lib/api.ts`).

**Step 4: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/combat/sites.ts apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/lib/api.ts
git commit -m "feat: display encounter site turn cost on combat site cards"
```

---

### Task 8: Fix Mob Tier Filtering Bug

**Files:**
- Modify: `packages/game-engine/src/exploration/mobTierFilter.ts:10-43`
- Test: `packages/game-engine/src/exploration/mobTierFilter.test.ts`
- Investigate: `apps/api/src/routes/exploration/start.ts:198-215`

This task requires investigation. The `filterAndWeightMobsByTier` function (lines 10-43) appears to keep all unlocked tiers, but in practice 20,000+ turns of tier 4 exploration produced zero non-tier-4 mobs. Possible causes:

1. **The filter + bleedthrough combination**: `filterAndWeightMobsByTier` keeps all unlocked tiers, but then `selectTierWithBleedthrough` was called with `highestUnlockedTier` (not a player-chosen tier), and the old bleedthrough was upward-only (75/20/5). Combined with the 2x weight on the highest tier, the effective chance of seeing a lower tier was near zero.

2. **Candidate fallback logic** (start.ts lines 208-215): After selecting a target tier via bleedthrough, if no mobs exist at that tier, it falls back DOWN to the nearest tier. Since bleedthrough only went UP, this fallback would always land on the highest tier.

**Step 1: Verify the bug is fixed by Task 2 and Task 3**

After implementing the symmetric bleedthrough (Task 2) and tier selection (Task 3), test manually:
- Select tier 2 in a zone where all 4 tiers are unlocked
- Run 100+ explorations
- Verify tier 1 and tier 3 mobs appear in ambushes

If the bug persists, investigate `filterAndWeightMobsByTier` more deeply — the issue may be in how `encounterWeight` values are set in seed data, or how the filter interacts with the tier selection.

**Step 2: Add integration test**

Add to `mobTierFilter.test.ts`:

```typescript
it('should produce mobs from multiple tiers over many rolls', () => {
  const mobs = [
    { id: '1', name: 'Rat', explorationTier: 1, encounterWeight: 100 },
    { id: '2', name: 'Wolf', explorationTier: 2, encounterWeight: 100 },
    { id: '3', name: 'Bear', explorationTier: 3, encounterWeight: 100 },
    { id: '4', name: 'Dragon', explorationTier: 4, encounterWeight: 100 },
  ];
  const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (let i = 0; i < 1000; i++) {
    const tier = selectTierWithBleedthrough(3, null); // selected tier 3
    tierCounts[tier]!++;
  }

  // With 10/15/50/15/10 split, all tiers except tier 1 (outside ±2 at tier 3) should appear
  // Actually tier 1 IS within ±2 of tier 3 (tier 3-2=1)
  expect(tierCounts[1]).toBeGreaterThan(0);
  expect(tierCounts[2]).toBeGreaterThan(0);
  expect(tierCounts[3]).toBeGreaterThan(0);
  expect(tierCounts[4]).toBeGreaterThan(0);
});
```

**Step 3: Commit**

```bash
git add packages/game-engine/src/exploration/mobTierFilter.test.ts
git commit -m "test: verify multi-tier distribution in bleedthrough"
```

---

### Task 9: Build Packages and Typecheck

**Step 1: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 2: Build game-engine package**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build

**Step 3: Typecheck everything**

Run: `npm run typecheck`
Expected: No TypeScript errors (except pre-existing `page.tsx:333` issue)

**Step 4: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: fix any remaining type errors from zone exploration improvements"
```

---

## Task Dependency Graph

```
Task 1 (counter fix)     ─── independent
Task 2 (bleedthrough)    ─── independent (constants + game-engine)
Task 3 (tier selection)  ─── depends on Task 2 (uses new bleedthrough)
Task 4 (exit scaling)    ─── independent
Task 5 (zone hints)      ─── independent
Task 6 (cache rewards)   ─── independent
Task 7 (turn cost)       ─── independent
Task 8 (tier bug verify) ─── depends on Task 2 + Task 3
Task 9 (build + verify)  ─── depends on all above
```

Tasks 1, 2, 4, 5, 6, 7 can be parallelized. Task 3 follows Task 2. Task 8 follows Task 3. Task 9 is the final verification.
