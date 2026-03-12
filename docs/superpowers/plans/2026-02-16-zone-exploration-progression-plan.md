# Zone Exploration Progression — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate mob encounters behind zone exploration % thresholds so new players fight progressively harder mobs as they explore each zone.

**Architecture:** New `PlayerZoneExploration` model tracks cumulative turns per zone. Each `MobTemplate` gets an `explorationTier` (1-4). Pure game-engine function filters/weights mobs by unlocked tiers. API exploration route accumulates only spent (non-refunded) turns. Zone exits gate behind per-connection thresholds. Frontend shows progress bar + milestone hints.

**Tech Stack:** Prisma (migration), TypeScript, Vitest (TDD), Express routes, Next.js React components

**Design doc:** `docs/superpowers/specs/2026-02-16-zone-exploration-progression-design.md`

---

### Task 1: Prisma Schema — Add Exploration Models and Fields

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add PlayerZoneExploration model and new fields**

Add to the ZONES section of schema.prisma (after the `PlayerZoneDiscovery` model, around line 225):

```prisma
model PlayerZoneExploration {
  id            String @id @default(cuid())
  playerId      String @map("player_id")
  zoneId        String @map("zone_id")
  turnsExplored Int    @default(0) @map("turns_explored")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  zone   Zone   @relation(fields: [zoneId], references: [id], onDelete: Cascade)

  @@unique([playerId, zoneId])
  @@index([playerId])
  @@map("player_zone_explorations")
}
```

Add to the `Zone` model (after `maxCraftingLevel`):

```prisma
  turnsToExplore   Int?  @map("turns_to_explore")
  explorationTiers Json? @map("exploration_tiers")
```

Add to the `Zone` model relations:

```prisma
  explorations       PlayerZoneExploration[]
```

Add to the `MobTemplate` model (after `encounterWeight`):

```prisma
  explorationTier Int @default(1) @map("exploration_tier")
```

Add to the `ZoneConnection` model (after `toId`):

```prisma
  explorationThreshold Float @default(0) @map("exploration_threshold")
```

Add to the `Player` model relations:

```prisma
  zoneExplorations   PlayerZoneExploration[]
```

**Step 2: Generate migration**

Run:
```bash
npm run db:generate
npx prisma migrate dev --name add_zone_exploration_progression --create-only
```

Review the generated SQL migration, then apply:
```bash
npx prisma migrate dev
```

**Step 3: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(db): add zone exploration progression schema"
```

---

### Task 2: Seed Data — Assign Exploration Tiers

**Files:**
- Modify: `packages/database/prisma/seed-data/mobs.ts` (add `explorationTier` to each mob)
- Modify: `packages/database/prisma/seed.ts` (add `turnsToExplore`, `explorationTiers` to zones; add `explorationThreshold` to connections)

**Step 1: Update mob helper type and assign tiers**

In `packages/database/prisma/seed-data/mobs.ts`, the `mob()` helper function creates mob objects. Add `explorationTier` to the helper's default and override it per mob.

Tier assignments by zone (based on mob level within zone):

**Forest Edge** (turnsToExplore: 30000):
- Tier 1: Field Mouse, Forest Rat, Forest Spider, Web Spinner (level 1)
- Tier 2: Wild Boar, Giant Rat, Venomous Spider (level 2)
- Tier 3: Tusked Boar, Rat King, Brood Mother (level 3)
- Tier 4: Great Boar (level 4)

**Deep Forest** (turnsToExplore: 45000):
- Tier 1: levels 4-5 mobs
- Tier 2: levels 6-7 mobs
- Tier 3: levels 8-9 mobs
- Tier 4: highest level mob(s)

**Cave Entrance** (turnsToExplore: 45000):
- Same pattern based on level tiers within the zone

**Ancient Grove** (turnsToExplore: 60000):
- Same pattern

**Deep Mines** (turnsToExplore: 60000):
- Same pattern

**Whispering Plains** (turnsToExplore: 60000):
- Same pattern

**Haunted Marsh** (turnsToExplore: 80000):
- Same pattern

**Crystal Caverns** (turnsToExplore: 80000):
- Same pattern

**Sunken Ruins** (turnsToExplore: 100000):
- Same pattern

For each zone: examine the mob levels, split them into 4 tiers (lowest-level mobs = tier 1, highest = tier 4). When a zone has fewer than 4 distinct levels, group appropriately.

**Step 2: Update zone seed data**

In `packages/database/prisma/seed.ts`, add `turnsToExplore` and `explorationTiers` to each wild zone's `upsert` data:

```typescript
// Forest Edge example
turnsToExplore: 30000,
explorationTiers: { "1": 0, "2": 25, "3": 50, "4": 75 },
```

Town zones get `turnsToExplore: null` (omit) and `explorationTiers: null` (omit).

**Step 3: Update zone connection seed data**

In `packages/database/prisma/seed.ts`, add `explorationThreshold` to the connection upserts. Only the "forward" direction needs a threshold; the return direction should be 0 (or default).

```typescript
// Forest Edge -> Deep Forest: 40% explored required
// Forest Edge -> Cave Entrance: 60% explored required
// Deep Forest -> Ancient Grove: 50%
// Deep Forest -> Whispering Plains: 70%
// Cave Entrance -> Deep Mines: 60%
// Whispering Plains -> Thornwall: 50%
// Thornwall -> Haunted Marsh: 40%
// Thornwall -> Crystal Caverns: 60%
// Haunted Marsh -> Sunken Ruins: 70%
// All reverse directions: 0 (already discovered, no gating)
```

**Step 4: Re-seed the database**

```bash
npm run db:seed
```

Verify the seed by checking a mob template and zone in Prisma Studio:
```bash
npm run db:studio
```

**Step 5: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(seed): assign exploration tiers to mobs and zones"
```

---

### Task 3: Shared Constants — Add Exploration Tier Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/index.ts` (export new constants)

**Step 1: Add constants**

In `packages/shared/src/constants/gameConstants.ts`, add after `ZONE_CONSTANTS`:

```typescript
export const ZONE_EXPLORATION_CONSTANTS = {
  DEFAULT_TIERS: { '1': 0, '2': 25, '3': 50, '4': 75 } as Record<string, number>,
  NEWEST_TIER_WEIGHT_MULTIPLIER: 2,
  MAX_TIER: 4,
} as const;
```

**Step 2: Export from shared index**

In `packages/shared/src/index.ts`, add `ZONE_EXPLORATION_CONSTANTS` to the exports from `gameConstants`.

**Step 3: Build shared package**

```bash
npm run build --workspace=packages/shared
```

**Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add zone exploration constants"
```

---

### Task 4: Game Engine — Mob Tier Filtering Function (TDD)

**Files:**
- Create: `packages/game-engine/src/exploration/mobTierFilter.ts`
- Create: `packages/game-engine/src/exploration/mobTierFilter.test.ts`
- Modify: `packages/game-engine/src/index.ts` (export new function)

**Step 1: Write the failing tests**

Create `packages/game-engine/src/exploration/mobTierFilter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { filterAndWeightMobsByTier } from './mobTierFilter';

const makeMob = (id: string, tier: number, weight = 100) => ({
  id,
  explorationTier: tier,
  encounterWeight: weight,
});

describe('filterAndWeightMobsByTier', () => {
  const defaultTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  it('returns only tier 1 mobs at 0% explored', () => {
    const mobs = [
      makeMob('a', 1),
      makeMob('b', 2),
      makeMob('c', 3),
    ];
    const result = filterAndWeightMobsByTier(mobs, 0, defaultTiers);
    expect(result.map(m => m.id)).toEqual(['a']);
  });

  it('returns tier 1+2 mobs at 25% explored', () => {
    const mobs = [
      makeMob('a', 1),
      makeMob('b', 2),
      makeMob('c', 3),
    ];
    const result = filterAndWeightMobsByTier(mobs, 25, defaultTiers);
    expect(result.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('returns all mobs at 100% explored', () => {
    const mobs = [
      makeMob('a', 1),
      makeMob('b', 2),
      makeMob('c', 3),
      makeMob('d', 4),
    ];
    const result = filterAndWeightMobsByTier(mobs, 100, defaultTiers);
    expect(result).toHaveLength(4);
  });

  it('applies 2x weight boost to highest unlocked tier', () => {
    const mobs = [
      makeMob('a', 1, 100),
      makeMob('b', 2, 100),
    ];
    const result = filterAndWeightMobsByTier(mobs, 30, defaultTiers);
    expect(result.find(m => m.id === 'a')!.encounterWeight).toBe(100);
    expect(result.find(m => m.id === 'b')!.encounterWeight).toBe(200);
  });

  it('does not boost when only tier 1 is unlocked', () => {
    const mobs = [makeMob('a', 1, 100)];
    const result = filterAndWeightMobsByTier(mobs, 10, defaultTiers);
    expect(result[0]!.encounterWeight).toBe(100);
  });

  it('returns empty array when no mobs match', () => {
    const mobs = [makeMob('a', 2)];
    const result = filterAndWeightMobsByTier(mobs, 0, defaultTiers);
    expect(result).toEqual([]);
  });

  it('handles null explorationTiers by using default thresholds', () => {
    const mobs = [makeMob('a', 1), makeMob('b', 2)];
    const result = filterAndWeightMobsByTier(mobs, 0, null);
    expect(result.map(m => m.id)).toEqual(['a']);
  });

  it('handles custom per-zone tier thresholds', () => {
    const customTiers = { '1': 0, '2': 10, '3': 30, '4': 60 };
    const mobs = [
      makeMob('a', 1),
      makeMob('b', 2),
      makeMob('c', 3),
    ];
    const result = filterAndWeightMobsByTier(mobs, 15, customTiers);
    expect(result.map(m => m.id)).toEqual(['a', 'b']);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:engine -- --run src/exploration/mobTierFilter.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `packages/game-engine/src/exploration/mobTierFilter.ts`:

```typescript
import { ZONE_EXPLORATION_CONSTANTS } from '@adventure/shared';

interface MobWithTier {
  id: string;
  explorationTier: number;
  encounterWeight: number;
  [key: string]: unknown;
}

export function filterAndWeightMobsByTier<T extends MobWithTier>(
  mobs: T[],
  explorationPercent: number,
  zoneTiers: Record<string, number> | null,
): (T & { encounterWeight: number })[] {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

  // Determine which tiers are unlocked
  let highestUnlockedTier = 0;
  for (const [tierStr, threshold] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    if (explorationPercent >= threshold && tier > highestUnlockedTier) {
      highestUnlockedTier = tier;
    }
  }

  if (highestUnlockedTier === 0) return [];

  // Filter mobs to only unlocked tiers
  const filtered = mobs.filter(m => {
    const tierThreshold = tiers[String(m.explorationTier)];
    return tierThreshold !== undefined && explorationPercent >= tierThreshold;
  });

  if (filtered.length === 0) return [];

  // Only boost if more than one tier is unlocked
  const hasMultipleTiers = new Set(filtered.map(m => m.explorationTier)).size > 1;
  const multiplier = ZONE_EXPLORATION_CONSTANTS.NEWEST_TIER_WEIGHT_MULTIPLIER;

  return filtered.map(m => ({
    ...m,
    encounterWeight: hasMultipleTiers && m.explorationTier === highestUnlockedTier
      ? m.encounterWeight * multiplier
      : m.encounterWeight,
  }));
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:engine -- --run src/exploration/mobTierFilter.test.ts
```

Expected: All PASS.

**Step 5: Export from game-engine index**

In `packages/game-engine/src/index.ts`, add:

```typescript
export { filterAndWeightMobsByTier } from './exploration/mobTierFilter';
```

**Step 6: Build game-engine**

```bash
npm run build --workspace=packages/game-engine
```

**Step 7: Commit**

```bash
git add packages/game-engine/
git commit -m "feat(engine): add mob tier filtering by exploration %"
```

---

### Task 5: API — Zone Exploration Service (TDD)

**Files:**
- Create: `apps/api/src/services/zoneExplorationService.ts`
- Create: `apps/api/src/services/zoneExplorationService.test.ts`

**Step 1: Write the failing tests**

Create `apps/api/src/services/zoneExplorationService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@adventure/database', () => ({
  prisma: {
    playerZoneExploration: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    zone: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@adventure/database';
import { getExplorationPercent, addExplorationTurns } from './zoneExplorationService';

const mockPrisma = prisma as unknown as {
  playerZoneExploration: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  zone: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe('zoneExplorationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getExplorationPercent', () => {
    it('returns 0 when no exploration record exists', async () => {
      mockPrisma.playerZoneExploration.findUnique.mockResolvedValue(null);
      mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });

      const result = await getExplorationPercent('player1', 'zone1');
      expect(result).toEqual({ turnsExplored: 0, percent: 0, turnsToExplore: 30000 });
    });

    it('calculates correct percent', async () => {
      mockPrisma.playerZoneExploration.findUnique.mockResolvedValue({ turnsExplored: 7500 });
      mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });

      const result = await getExplorationPercent('player1', 'zone1');
      expect(result.percent).toBe(25);
      expect(result.turnsExplored).toBe(7500);
    });

    it('caps at 100%', async () => {
      mockPrisma.playerZoneExploration.findUnique.mockResolvedValue({ turnsExplored: 50000 });
      mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });

      const result = await getExplorationPercent('player1', 'zone1');
      expect(result.percent).toBe(100);
    });

    it('returns 100% if zone has no turnsToExplore (town)', async () => {
      mockPrisma.playerZoneExploration.findUnique.mockResolvedValue(null);
      mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: null });

      const result = await getExplorationPercent('player1', 'zone1');
      expect(result.percent).toBe(100);
    });
  });

  describe('addExplorationTurns', () => {
    it('upserts with increment', async () => {
      mockPrisma.playerZoneExploration.upsert.mockResolvedValue({ turnsExplored: 500 });

      await addExplorationTurns('player1', 'zone1', 500);

      expect(mockPrisma.playerZoneExploration.upsert).toHaveBeenCalledWith({
        where: { playerId_zoneId: { playerId: 'player1', zoneId: 'zone1' } },
        create: { playerId: 'player1', zoneId: 'zone1', turnsExplored: 500 },
        update: { turnsExplored: { increment: 500 } },
      });
    });

    it('does nothing for zero turns', async () => {
      await addExplorationTurns('player1', 'zone1', 0);
      expect(mockPrisma.playerZoneExploration.upsert).not.toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:api -- --run src/services/zoneExplorationService.test.ts
```

**Step 3: Write the implementation**

Create `apps/api/src/services/zoneExplorationService.ts`:

```typescript
import { prisma } from '@adventure/database';

export async function getExplorationPercent(
  playerId: string,
  zoneId: string,
): Promise<{ turnsExplored: number; percent: number; turnsToExplore: number | null }> {
  const [record, zone] = await Promise.all([
    prisma.playerZoneExploration.findUnique({
      where: { playerId_zoneId: { playerId, zoneId } },
      select: { turnsExplored: true },
    }),
    prisma.zone.findUnique({
      where: { id: zoneId },
      select: { turnsToExplore: true },
    }),
  ]);

  const turnsExplored = record?.turnsExplored ?? 0;
  const turnsToExplore = zone?.turnsToExplore ?? null;

  if (!turnsToExplore || turnsToExplore <= 0) {
    return { turnsExplored, percent: 100, turnsToExplore };
  }

  const percent = Math.min(100, (turnsExplored / turnsToExplore) * 100);
  return { turnsExplored, percent, turnsToExplore };
}

export async function addExplorationTurns(
  playerId: string,
  zoneId: string,
  turns: number,
): Promise<void> {
  if (turns <= 0) return;

  await prisma.playerZoneExploration.upsert({
    where: { playerId_zoneId: { playerId, zoneId } },
    create: { playerId, zoneId, turnsExplored: turns },
    update: { turnsExplored: { increment: turns } },
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:api -- --run src/services/zoneExplorationService.test.ts
```

**Step 5: Commit**

```bash
git add apps/api/src/services/
git commit -m "feat(api): add zone exploration tracking service"
```

---

### Task 6: API — Exploration Route Integration

**Files:**
- Modify: `apps/api/src/routes/exploration.ts`

This is the most complex task. Three changes to the exploration route:

**Step 1: Import the new modules**

At the top of `apps/api/src/routes/exploration.ts`, add:

```typescript
import { filterAndWeightMobsByTier } from '@adventure/game-engine';
import { addExplorationTurns, getExplorationPercent } from '../services/zoneExplorationService';
```

**Step 2: Fetch exploration % and zone tiers before the exploration loop**

In the `POST /start` handler, after fetching `mobTemplates`, `resourceNodes`, `zoneFamilies`, etc. (around line 381), add:

```typescript
const explorationProgress = await getExplorationPercent(playerId, body.zoneId);
const zoneTiers = (zone as any).explorationTiers as Record<string, number> | null;
```

**Step 3: Filter mob pool for ambush encounters**

Replace the mob selection in the ambush handler (line 426):

```diff
- const mob = pickWeighted(mobTemplates, 'encounterWeight') as typeof mobTemplates[number] | null;
+ const tieredMobs = filterAndWeightMobsByTier(
+   mobTemplates.map(m => ({ ...m, explorationTier: (m as any).explorationTier ?? 1 })),
+   explorationProgress.percent,
+   zoneTiers,
+ );
+ const mob = pickWeighted(tieredMobs, 'encounterWeight') as typeof tieredMobs[number] | null;
```

**Step 4: Gate zone exit rolls behind exploration threshold**

In the zone exit handler (around line 723), before processing the zone_exit outcome, filter `undiscoveredNeighbors` to only include those whose connection threshold is met:

```typescript
if (outcome.type === 'zone_exit' && undiscoveredNeighbors.length > 0) {
  // Load zone connections with thresholds
  const connections = await prisma.zoneConnection.findMany({
    where: { fromId: body.zoneId },
    select: { toId: true, explorationThreshold: true },
  });
  const thresholdByToId = new Map(connections.map(c => [c.toId, c.explorationThreshold]));

  const eligibleNeighbors = undiscoveredNeighbors.filter(n => {
    const threshold = thresholdByToId.get(n.id) ?? 0;
    return explorationProgress.percent >= threshold;
  });

  if (eligibleNeighbors.length === 0) continue;

  const neighborIndex = randomIntInclusive(0, eligibleNeighbors.length - 1);
  const neighbor = eligibleNeighbors[neighborIndex]!;
  // ... rest of zone_exit handler (discover + event)
```

Note: Also remove the discovered neighbor from `undiscoveredNeighbors` so subsequent rolls don't pick it:

```typescript
  const mainIdx = undiscoveredNeighbors.findIndex(n => n.id === neighbor.id);
  if (mainIdx >= 0) undiscoveredNeighbors.splice(mainIdx, 1);
```

**Step 5: Accumulate spent turns after exploration completes**

After the refund calculation (around line 851), add exploration turn tracking:

```typescript
const spentTurns = aborted && abortedAtTurn ? abortedAtTurn : body.turns;
await addExplorationTurns(playerId, body.zoneId, spentTurns);
```

**Step 6: Include exploration progress in response**

Add to the `res.json()` response (around line 972):

```typescript
explorationProgress: {
  turnsExplored: explorationProgress.turnsExplored + spentTurns,
  percent: explorationProgress.turnsToExplore
    ? Math.min(100, ((explorationProgress.turnsExplored + spentTurns) / explorationProgress.turnsToExplore) * 100)
    : 100,
  turnsToExplore: explorationProgress.turnsToExplore,
},
```

**Step 7: Test manually**

Start the dev server, explore in Forest Edge, verify:
- Only tier 1 mobs appear in ambushes at 0% explored
- Exploration progress increments
- Zone exits are gated

**Step 8: Commit**

```bash
git add apps/api/src/routes/exploration.ts
git commit -m "feat(api): integrate exploration tier gating into exploration route"
```

---

### Task 7: API — Combat Route Integration

**Files:**
- Modify: `apps/api/src/routes/combat.ts`

**Step 1: Import new modules**

Add to imports in `apps/api/src/routes/combat.ts`:

```typescript
import { filterAndWeightMobsByTier } from '@adventure/game-engine';
import { getExplorationPercent } from '../services/zoneExplorationService';
```

**Step 2: Filter mobs for zone combat (no specific mob selected)**

In `POST /start`, when no `mobTemplateId` is provided (line 487), replace the mob selection:

```diff
    } else {
      const mobs = await prisma.mobTemplate.findMany({ where: { zoneId } });
-     const picked = pickWeighted(mobs);
+     const explorationProgress = await getExplorationPercent(playerId, zoneId);
+     const zone_ = await prisma.zone.findUnique({
+       where: { id: zoneId },
+       select: { explorationTiers: true },
+     });
+     const zoneTiers = (zone_ as any)?.explorationTiers as Record<string, number> | null;
+     const tieredMobs = filterAndWeightMobsByTier(
+       mobs.map(m => ({ ...m, explorationTier: (m as any).explorationTier ?? 1 })),
+       explorationProgress.percent,
+       zoneTiers,
+     );
+     const picked = pickWeighted(tieredMobs);
      if (!picked) {
        throw new AppError(400, 'No mobs available for this zone', 'NO_MOBS');
      }
```

Note: The `zone` variable is already fetched on line 473 and could be reused. Consider reading `explorationTiers` from the zone query already on line 473 by adding the select. The simplest approach: add `explorationTiers` to the zone query (line 473) and use `(zone as any).explorationTiers` instead of a separate query.

**Step 3: Include exploration progress in combat response**

After combat resolution, include the current exploration progress:

```typescript
const explorationProgress = await getExplorationPercent(playerId, zoneId);
```

Add to `res.json()`:

```typescript
explorationProgress: {
  turnsExplored: explorationProgress.turnsExplored,
  percent: explorationProgress.percent,
  turnsToExplore: explorationProgress.turnsToExplore,
},
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/combat.ts
git commit -m "feat(api): filter combat mobs by exploration tier"
```

---

### Task 8: API — Zones Route Integration

**Files:**
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Return exploration progress per zone**

In `GET /zones`, after fetching zones and discoveries, also fetch the player's exploration progress for all discovered zones:

```typescript
const explorations = await prisma.playerZoneExploration.findMany({
  where: { playerId },
  select: { zoneId: true, turnsExplored: true },
});
const explorationByZoneId = new Map(explorations.map(e => [e.zoneId, e.turnsExplored]));
```

In the zone mapping, include exploration data:

```typescript
{
  ...zone,
  exploration: zone.zoneType === 'town' ? null : {
    turnsExplored: explorationByZoneId.get(zone.id) ?? 0,
    turnsToExplore: (zone as any).turnsToExplore ?? null,
    percent: (zone as any).turnsToExplore
      ? Math.min(100, ((explorationByZoneId.get(zone.id) ?? 0) / (zone as any).turnsToExplore) * 100)
      : 100,
    tiers: (zone as any).explorationTiers ?? null,
  },
}
```

**Step 2: Return connection thresholds**

In the connections response, include `explorationThreshold`:

```typescript
connections: filteredConnections.map(c => ({
  fromId: c.fromId,
  toId: c.toId,
  explorationThreshold: c.explorationThreshold ?? 0,
})),
```

This requires updating the connection query to include `explorationThreshold` in the select.

**Step 3: Commit**

```bash
git add apps/api/src/routes/zones.ts
git commit -m "feat(api): return exploration progress and connection thresholds in zones"
```

---

### Task 9: API — Bestiary Route — Tier-Locked Mobs

**Files:**
- Modify: `apps/api/src/routes/bestiary.ts`

**Step 1: Add exploration progress lookup**

In `GET /bestiary`, after fetching mob templates and progress, also fetch the player's exploration progress and zone tiers:

```typescript
const explorations = await prisma.playerZoneExploration.findMany({
  where: { playerId },
  select: { zoneId: true, turnsExplored: true },
});
const explorationByZoneId = new Map(explorations.map(e => [e.zoneId, e.turnsExplored]));
```

**Step 2: Mark mobs with tier-locked status**

In the mob mapping, add `explorationTier` and `tierLocked` fields:

```typescript
const turnsToExplore = (mob.zone as any).turnsToExplore ?? null;
const turnsExplored = explorationByZoneId.get(mob.zoneId) ?? 0;
const zonePercent = turnsToExplore ? Math.min(100, (turnsExplored / turnsToExplore) * 100) : 100;
const zoneTiers = (mob.zone as any).explorationTiers as Record<string, number> | null;
const mobTier = (mob as any).explorationTier ?? 1;
const tierThreshold = zoneTiers ? (zoneTiers[String(mobTier)] ?? 0) : 0;
const tierLocked = zonePercent < tierThreshold;

return {
  ...existingFields,
  explorationTier: mobTier,
  tierLocked,
  // If tier locked AND not yet discovered via kills, hide the name
  name: tierLocked && kills === 0 ? '???' : mob.name,
};
```

Add `turnsToExplore` and `explorationTiers` to the zone select in the mob query.

**Step 3: Commit**

```bash
git add apps/api/src/routes/bestiary.ts
git commit -m "feat(api): add tier-locked status to bestiary mobs"
```

---

### Task 10: Frontend — API Types and Fetchers

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Update zone response type**

Update the `getZones()` response type to include exploration data:

```typescript
zones: Array<{
  // ... existing fields ...
  exploration: {
    turnsExplored: number;
    turnsToExplore: number | null;
    percent: number;
    tiers: Record<string, number> | null;
  } | null;
}>;
connections: Array<{
  fromId: string;
  toId: string;
  explorationThreshold: number;
}>;
```

**Step 2: Update exploration response type**

Add `explorationProgress` to the `startExploration()` response type:

```typescript
explorationProgress: {
  turnsExplored: number;
  percent: number;
  turnsToExplore: number | null;
};
```

**Step 3: Update bestiary response type**

Add `explorationTier` and `tierLocked` to the bestiary mob type:

```typescript
explorationTier: number;
tierLocked: boolean;
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): update API types for exploration progression"
```

---

### Task 11: Frontend — Zone Map Exploration Progress Bar

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`

**Step 1: Update ZoneMap props**

Add exploration data to the zone props:

```typescript
zones: Array<{
  // ... existing fields ...
  exploration: {
    turnsExplored: number;
    turnsToExplore: number | null;
    percent: number;
    tiers: Record<string, number> | null;
  } | null;
}>;
connections: Array<{
  fromId: string;
  toId: string;
  explorationThreshold: number;
}>;
```

**Step 2: Add exploration progress bar to selected zone details panel**

In the zone details panel (shown when a zone is selected), add a progress bar for wild zones:

```tsx
{selectedZone.exploration && selectedZone.exploration.turnsToExplore && (
  <div className="mt-3">
    <div className="flex justify-between text-xs text-muted-foreground mb-1">
      <span>{Math.floor(selectedZone.exploration.percent)}% Explored</span>
      <span>{selectedZone.exploration.turnsExplored.toLocaleString()} / {selectedZone.exploration.turnsToExplore.toLocaleString()}</span>
    </div>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(100, selectedZone.exploration.percent)}%` }}
      />
    </div>
    {getMilestoneHint(selectedZone.exploration.percent)}
  </div>
)}
```

**Step 3: Add milestone hint helper**

```typescript
function getMilestoneHint(percent: number): React.ReactNode {
  if (percent >= 75) return <p className="text-xs text-amber-400 mt-1 italic">The apex predator stirs...</p>;
  if (percent >= 50) return <p className="text-xs text-red-400 mt-1 italic">Dangerous creatures lurk ahead...</p>;
  if (percent >= 25) return <p className="text-xs text-yellow-400 mt-1 italic">Larger creatures roam deeper in...</p>;
  return <p className="text-xs text-muted-foreground mt-1 italic">Only small creatures roam the outskirts.</p>;
}
```

**Step 4: Show locked zone exits**

For connections from the current zone, check if their `explorationThreshold` is met:

```tsx
{lockedExits.map(exit => (
  <div key={exit.toId} className="text-xs text-muted-foreground opacity-50">
    {exit.toName} — requires {exit.explorationThreshold}% explored
    (currently {Math.floor(currentExploration?.percent ?? 0)}%)
  </div>
))}
```

**Step 5: Wire props from page.tsx/useGameController**

In `useGameController.ts`, ensure the zones state includes the exploration data (it should already come from the API). Pass the full zone objects (with exploration) to ZoneMap.

In `page.tsx`, update the ZoneMap prop mapping to include `exploration`:

```typescript
zones={controller.zones.map(z => ({
  ...z,
  exploration: z.exploration ?? null,
  imageSrc: z.name !== '???' ? zoneImageSrc(z.name) : undefined,
}))}
```

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx apps/web/src/app/game/
git commit -m "feat(web): add exploration progress bar and milestone hints to zone map"
```

---

### Task 12: Frontend — Exploration Screen Updates

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx`

**Step 1: Add exploration progress to props**

```typescript
explorationProgress?: {
  turnsExplored: number;
  turnsToExplore: number | null;
  percent: number;
} | null;
```

**Step 2: Show exploration % header**

Above the turn slider, show the current zone exploration progress:

```tsx
{explorationProgress && explorationProgress.turnsToExplore && (
  <div className="mb-4">
    <div className="flex justify-between text-sm text-muted-foreground mb-1">
      <span>Zone Exploration: {Math.floor(explorationProgress.percent)}%</span>
      <span>{explorationProgress.turnsExplored.toLocaleString()} / {explorationProgress.turnsToExplore.toLocaleString()} turns</span>
    </div>
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(100, explorationProgress.percent)}%` }}
      />
    </div>
  </div>
)}
```

**Step 3: Wire from controller**

In `useGameController.ts`, derive the current zone's exploration data:

```typescript
const currentZoneExploration = currentZone?.exploration ?? null;
```

Pass it through to the Exploration screen in `page.tsx`.

**Step 4: Update after exploration completes**

After `handleExplorationPlaybackComplete`, the `loadAll()` call will refresh zones (including updated exploration %). No extra work needed.

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/
git commit -m "feat(web): show exploration progress on exploration screen"
```

---

### Task 13: Frontend — Bestiary Tier Locking

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx`

**Step 1: Update Monster interface**

Add `tierLocked` to the `Monster` interface:

```typescript
tierLocked?: boolean;
```

**Step 2: Apply tier locking in the monster grid**

In the monster grid cell rendering, treat `tierLocked` mobs the same as undiscovered:

```typescript
const isHidden = !monster.isDiscovered && (monster.tierLocked ?? false);
```

Tier-locked + undiscovered mobs should show "???" with a lock icon or "Locked" indicator.

For tier-locked mobs that ARE discovered (player fought them before the tier system existed, or met them via encounter site), show them normally since the player already knows about them.

**Step 3: Wire from controller**

In `useGameController.ts`, pass `tierLocked` from the bestiary API response through to the Bestiary component props.

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Bestiary.tsx apps/web/src/app/game/
git commit -m "feat(web): show tier-locked mobs as hidden in bestiary"
```

---

### Task 14: Build & Typecheck

**Step 1: Build all packages**

```bash
npm run build
```

**Step 2: Typecheck**

```bash
npm run typecheck
```

Fix any TypeScript errors.

**Step 3: Run all tests**

```bash
npm run test
```

Fix any test failures.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve typecheck and test issues for exploration progression"
```

---

### Task 15: Manual Testing & Polish

**Step 1: Start dev environment**

```bash
docker-compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

**Step 2: Test the exploration flow**

1. Create a new account
2. Travel to Forest Edge
3. Verify only tier 1 mobs appear in combat (Field Mouse, Forest Rat, Forest Spider, Web Spinner)
4. Explore multiple times, verify exploration % increases
5. Verify zone exit discovery is blocked until threshold is met
6. After reaching 25%, verify tier 2 mobs start appearing
7. Check the zone map shows progress bar and milestone hints
8. Check the exploration screen shows zone exploration %
9. Check the bestiary shows locked mobs as "???"

**Step 3: Fix any issues found during testing**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: zone exploration progression system complete"
```
