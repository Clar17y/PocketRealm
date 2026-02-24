# World Events Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix per-zone event cap bypass bug, wire spawn rate events to exploration mechanics, and add event modifier badges across all activity screens.

**Architecture:** Three independent workstreams: (1) centralize event cap in `spawnWorldEvent()`, (2) add `getSpawnRateModifiers()` and pass multipliers to `simulateExploration()` and family selection, (3) enhance API responses with event modifier data and render `EventBadge` components.

**Tech Stack:** TypeScript, Prisma, Express, Next.js (React), Vitest, Zod

**Design doc:** `docs/plans/2026-02-23-world-events-improvements.md`

---

## Task 1: Per-Zone Event Cap — Test

**Files:**
- Create: `apps/api/src/services/worldEventService.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing service
vi.mock('@adventure/database', () => ({
  prisma: {
    worldEvent: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@adventure/database';
import { spawnWorldEvent } from './worldEventService';
import { WORLD_EVENT_CONSTANTS } from '@adventure/shared';

describe('spawnWorldEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when zone already has MAX_ZONE_EVENTS active', async () => {
    (prisma.worldEvent.count as ReturnType<typeof vi.fn>).mockResolvedValue(WORLD_EVENT_CONSTANTS.MAX_ZONE_EVENTS);

    const result = await spawnWorldEvent({
      type: 'mob',
      zoneId: 'zone-1',
      title: 'Test',
      description: 'Test',
      effectType: 'damage_up',
      effectValue: 0.5,
      durationHours: 6,
    });

    expect(result).toBeNull();
    expect(prisma.worldEvent.create).not.toHaveBeenCalled();
  });

  it('allows spawn when zone has fewer than MAX_ZONE_EVENTS', async () => {
    (prisma.worldEvent.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.worldEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.worldEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ev-1', type: 'mob', zoneId: 'zone-1', title: 'Test', description: 'Test',
      effectType: 'damage_up', effectValue: 0.5, targetMobId: null, targetFamily: null,
      targetResource: null, startedAt: new Date(), expiresAt: new Date(), status: 'active',
      createdBy: 'system', zone: { name: 'Forest Edge' },
    });

    const result = await spawnWorldEvent({
      type: 'mob',
      zoneId: 'zone-1',
      title: 'Test',
      description: 'Test',
      effectType: 'damage_up',
      effectValue: 0.5,
      durationHours: 6,
    });

    expect(result).not.toBeNull();
  });

  it('skips per-zone cap check for world-wide events (zoneId null)', async () => {
    (prisma.worldEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.worldEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ev-2', type: 'mob', zoneId: null, title: 'World Test', description: 'World Test',
      effectType: 'damage_up', effectValue: 0.5, targetMobId: null, targetFamily: null,
      targetResource: null, startedAt: new Date(), expiresAt: new Date(), status: 'active',
      createdBy: 'system',
    });

    const result = await spawnWorldEvent({
      type: 'mob',
      zoneId: null,
      title: 'World Test',
      description: 'World Test',
      effectType: 'damage_up',
      effectValue: 0.5,
      durationHours: 6,
    });

    // Should NOT call count since zoneId is null
    expect(prisma.worldEvent.count).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/worldEventService.test.ts`
Expected: FAIL — first test should fail because `spawnWorldEvent` doesn't check per-zone count yet.

---

## Task 2: Per-Zone Event Cap — Implementation

**Files:**
- Modify: `apps/api/src/services/worldEventService.ts:147-170`

**Step 1: Add per-zone count check at the top of `spawnWorldEvent()`**

At `worldEventService.ts:160`, before the existing effectType dedup check, add:

```typescript
export async function spawnWorldEvent(params: {
  type: WorldEventType;
  zoneId: string | null;
  // ... existing params
}): Promise<WorldEventData | null> {
  // NEW: Per-zone total cap (applies to all spawn paths)
  if (params.zoneId) {
    const activeInZone = await prisma.worldEvent.count({
      where: { zoneId: params.zoneId, status: 'active' },
    });
    if (activeInZone >= WORLD_EVENT_CONSTANTS.MAX_ZONE_EVENTS) return null;
  }

  // EXISTING: Slot check — no duplicate effectType in the same zone
  if (params.zoneId) {
    const existing = await prisma.worldEvent.findFirst({
      // ... existing code unchanged
```

Add import for `WORLD_EVENT_CONSTANTS`:

```typescript
import { WORLD_EVENT_CONSTANTS } from '@adventure/shared';
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/worldEventService.test.ts`
Expected: PASS (all 3 tests)

**Step 3: Update scheduler for consistency**

Modify `apps/api/src/services/eventSchedulerService.ts:248-252`. The current global zone count check is misleading now. Remove it or keep it as a fast-path optimization (the centralized check in `spawnWorldEvent` is the real enforcement):

```typescript
// OLD (global cap — misleading):
const activeZoneCount = await prisma.worldEvent.count({
  where: { zoneId: { not: null }, status: 'active' },
});
if (activeZoneCount >= WORLD_EVENT_CONSTANTS.MAX_ZONE_EVENTS) return;

// NEW (remove this check — spawnWorldEvent enforces per-zone):
// (just delete these 4 lines — spawnWorldEvent() now handles the cap)
```

**Step 4: Commit**

```bash
git add apps/api/src/services/worldEventService.ts apps/api/src/services/worldEventService.test.ts apps/api/src/services/eventSchedulerService.ts
git commit -m "fix: enforce per-zone event cap in spawnWorldEvent

Player-discovered events via exploration bypassed MAX_ZONE_EVENTS.
Moved count check into spawnWorldEvent() so all spawn paths respect it."
```

---

## Task 3: Spawn Rate Modifiers — Service + Test

**Files:**
- Modify: `apps/api/src/services/worldEventService.ts`
- Modify: `apps/api/src/services/worldEventService.test.ts`

**Step 1: Write the failing test for `getSpawnRateModifiers`**

Add to `worldEventService.test.ts`:

```typescript
import { getSpawnRateModifiers } from './worldEventService';

describe('getSpawnRateModifiers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns global=1 and empty byFamily when no active events', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await getSpawnRateModifiers('zone-1');
    expect(result.global).toBe(1);
    expect(result.byFamily.size).toBe(0);
  });

  it('returns family-specific multiplier for targeted spawn_rate_up', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ev-1', type: 'mob', zoneId: 'zone-1', title: 'Vermin Swarm',
        description: 'test', effectType: 'spawn_rate_up', effectValue: 0.75,
        targetMobId: null, targetFamily: 'family-vermin', targetResource: null,
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
      },
    ]);
    const result = await getSpawnRateModifiers('zone-1');
    expect(result.byFamily.get('family-vermin')).toBe(1.75);
    expect(result.global).toBe(1);
  });

  it('returns global multiplier for untargeted spawn_rate_up', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ev-2', type: 'mob', zoneId: 'zone-1', title: 'Monster Surge',
        description: 'test', effectType: 'spawn_rate_up', effectValue: 0.5,
        targetMobId: null, targetFamily: null, targetResource: null,
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
      },
    ]);
    const result = await getSpawnRateModifiers('zone-1');
    expect(result.global).toBe(1.5);
    expect(result.byFamily.size).toBe(0);
  });

  it('handles spawn_rate_down correctly', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ev-3', type: 'mob', zoneId: 'zone-1', title: 'Vermin Cull',
        description: 'test', effectType: 'spawn_rate_down', effectValue: 0.5,
        targetMobId: null, targetFamily: 'family-vermin', targetResource: null,
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
      },
    ]);
    const result = await getSpawnRateModifiers('zone-1');
    expect(result.byFamily.get('family-vermin')).toBe(0.5);
    expect(result.global).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/worldEventService.test.ts`
Expected: FAIL — `getSpawnRateModifiers` doesn't exist yet.

**Step 3: Implement `getSpawnRateModifiers`**

Add to `worldEventService.ts` after the existing `getActiveZoneModifiers`:

```typescript
export interface SpawnRateModifiers {
  byFamily: Map<string, number>;
  global: number;
}

export async function getSpawnRateModifiers(zoneId: string): Promise<SpawnRateModifiers> {
  const [zoneEvents, worldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);

  const byFamily = new Map<string, number>();
  let global = 1;

  for (const event of [...zoneEvents, ...worldEvents]) {
    if (event.effectType !== 'spawn_rate_up' && event.effectType !== 'spawn_rate_down') continue;

    const multiplier = event.effectType === 'spawn_rate_up'
      ? 1 + event.effectValue
      : Math.max(0.1, 1 - event.effectValue);

    if (event.targetFamily) {
      const current = byFamily.get(event.targetFamily) ?? 1;
      byFamily.set(event.targetFamily, current * multiplier);
    } else {
      global *= multiplier;
    }
  }

  return { byFamily, global };
}
```

Export `SpawnRateModifiers` type from the file.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/worldEventService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/worldEventService.ts apps/api/src/services/worldEventService.test.ts
git commit -m "feat: add getSpawnRateModifiers for per-family spawn rate lookup"
```

---

## Task 4: Spawn Rate — Probability Model + Tests

**Files:**
- Modify: `packages/game-engine/src/exploration/probabilityModel.ts`
- Modify: `packages/game-engine/src/exploration/probabilityModel.test.ts`

**Step 1: Write failing tests**

Add to `probabilityModel.test.ts`:

```typescript
describe('simulateExploration with spawnRateMultiplier', () => {
  afterEach(() => vi.restoreAllMocks());

  it('increases ambush frequency with spawnRateMultiplier > 1', () => {
    // With multiplier 2.0 and Math.random returning 0.008:
    // base ambush chance ~0.005 → miss, but 0.005 * 2 = 0.01 → hit
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.008) // ambush: 0.008 < 0.01 (0.005 * 2) → hit
      .mockReturnValue(0.999);
    const outcomes = simulateExploration(1, null, 2.0);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(true);
  });

  it('does not change ambush frequency with multiplier 1.0', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.008) // ambush: 0.008 > 0.005 → miss
      .mockReturnValue(0.999);
    const outcomes = simulateExploration(1, null, 1.0);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(false);
  });

  it('defaults to multiplier 1 when not provided', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.008) // ambush: 0.008 > 0.005 → miss (no multiplier)
      .mockReturnValue(0.999);
    const outcomes = simulateExploration(1);
    expect(outcomes.some(o => o.type === 'ambush')).toBe(false);
  });
});

describe('estimateExploration with spawnRateMultiplier', () => {
  it('scales ambush and encounter site chances with multiplier', () => {
    const base = estimateExploration(100);
    const boosted = estimateExploration(100, null, 1.5);
    expect(boosted.expectedAmbushes).toBeCloseTo(base.expectedAmbushes * 1.5);
    expect(boosted.expectedEncounterSites).toBeCloseTo(base.expectedEncounterSites * 1.5);
  });

  it('does not scale resource, cache, or zone exit chances', () => {
    const base = estimateExploration(100, 0.01);
    const boosted = estimateExploration(100, 0.01, 2.0);
    expect(boosted.resourceNodeChance).toBeCloseTo(base.resourceNodeChance);
    expect(boosted.hiddenCacheChance).toBeCloseTo(base.hiddenCacheChance);
    expect(boosted.zoneExitChance).toBeCloseTo(base.zoneExitChance);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/exploration/probabilityModel.test.ts`
Expected: FAIL — signatures don't accept the third parameter and behavior unchanged.

**Step 3: Update `simulateExploration` and `estimateExploration`**

In `probabilityModel.ts`:

```typescript
export function estimateExploration(
  turns: number,
  zoneExitChance: number | null = null,
  spawnRateMultiplier: number = 1,
): ExplorationEstimate {
  const ambushRate = EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * spawnRateMultiplier;
  const siteRate = EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * spawnRateMultiplier;
  return {
    turns,
    ambushChance: cumulativeProbability(ambushRate, turns),
    encounterSiteChance: cumulativeProbability(siteRate, turns),
    resourceNodeChance: cumulativeProbability(EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE, turns),
    hiddenCacheChance: cumulativeProbability(EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE, turns),
    zoneExitChance: zoneExitChance != null && zoneExitChance > 0
      ? cumulativeProbability(zoneExitChance, turns)
      : 0,
    expectedAmbushes: turns * ambushRate,
    expectedEncounterSites: turns * siteRate,
  };
}

export function simulateExploration(
  turns: number,
  zoneExitChance: number | null = null,
  spawnRateMultiplier: number = 1,
): ExplorationOutcome[] {
  const outcomes: ExplorationOutcome[] = [];
  let canDiscoverZoneExit = zoneExitChance != null && zoneExitChance > 0;
  let canDiscoverEvent = true;
  const ambushChance = EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * spawnRateMultiplier;
  const siteChance = EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * spawnRateMultiplier;

  for (let t = 1; t <= turns; t++) {
    if (Math.random() < ambushChance) {
      outcomes.push({ type: 'ambush', turnOccurred: t });
    }
    if (Math.random() < siteChance) {
      outcomes.push({ type: 'encounter_site', turnOccurred: t });
    }
    if (Math.random() < EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE) {
      outcomes.push({ type: 'resource_node', turnOccurred: t });
    }
    if (Math.random() < EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE) {
      outcomes.push({ type: 'hidden_cache', turnOccurred: t });
    }
    if (canDiscoverZoneExit && Math.random() < zoneExitChance!) {
      outcomes.push({ type: 'zone_exit', turnOccurred: t });
      canDiscoverZoneExit = false;
    }
    if (canDiscoverEvent && Math.random() < WORLD_EVENT_CONSTANTS.EVENT_DISCOVERY_CHANCE_PER_TURN) {
      outcomes.push({ type: 'event_discovery', turnOccurred: t });
      canDiscoverEvent = false;
    }
  }

  return outcomes.sort((a, b) => a.turnOccurred - b.turnOccurred);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/exploration/probabilityModel.test.ts`
Expected: PASS (all tests including existing ones)

**Step 5: Commit**

```bash
git add packages/game-engine/src/exploration/probabilityModel.ts packages/game-engine/src/exploration/probabilityModel.test.ts
git commit -m "feat: add spawnRateMultiplier to simulateExploration and estimateExploration"
```

---

## Task 5: Spawn Rate — Wire to Exploration Route

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts` (~lines 130-145, 198-218, 409-411)
- Modify: `apps/api/src/routes/exploration/estimate.ts`

**Step 1: Compute spawn rate multiplier and pass to `simulateExploration`**

In `apps/api/src/routes/exploration/start.ts`, add import:

```typescript
import { getSpawnRateModifiers, type SpawnRateModifiers } from '../../services/worldEventService';
```

Around line 139 (where `zoneModifiers` is fetched), add:

```typescript
const zoneModifiers = await getActiveZoneModifiers(body.zoneId);
const spawnMods = await getSpawnRateModifiers(body.zoneId);
```

Compute the overall rate multiplier from zone families + spawn mods (after `zoneFamilies` is loaded, around line 157):

```typescript
// Calculate overall spawn rate multiplier from weighted family pool
let spawnRateMultiplier = 1;
if (zoneFamilies.length > 0) {
  const baseTotal = zoneFamilies.reduce((sum, f) => sum + f.discoveryWeight, 0);
  const adjustedTotal = zoneFamilies.reduce((sum, f) => {
    const familyMod = spawnMods.byFamily.get(f.mobFamilyId) ?? 1;
    return sum + f.discoveryWeight * familyMod * spawnMods.global;
  }, 0);
  spawnRateMultiplier = baseTotal > 0 ? adjustedTotal / baseTotal : 1;
}
```

Then pass it to `simulateExploration` (around line 168):

```typescript
// OLD:
const outcomes = isTutorialExplore
  ? [{ turnOccurred: 50, type: 'ambush' as const }]
  : simulateExploration(effectiveTurns, effectiveExitChance);

// NEW:
const outcomes = isTutorialExplore
  ? [{ turnOccurred: 50, type: 'ambush' as const }]
  : simulateExploration(effectiveTurns, effectiveExitChance, spawnRateMultiplier);
```

**Step 2: Adjust encounter site family weights**

Around line 409-411, replace the family selection:

```typescript
// OLD:
const pickedFamily = pickWeighted(zoneFamilies, 'discoveryWeight') as ZoneFamilyRow | null;

// NEW — apply spawn rate modifiers to family weights:
const adjustedFamilies = zoneFamilies.map(f => ({
  ...f,
  discoveryWeight: f.discoveryWeight * (spawnMods.byFamily.get(f.mobFamilyId) ?? 1) * spawnMods.global,
}));
const pickedFamily = pickWeighted(adjustedFamilies, 'discoveryWeight') as ZoneFamilyRow | null;
```

**Step 3: Adjust ambush mob family weighting**

Around line 198-217 (ambush mob selection), after `candidates` is built from tiered mobs, apply spawn rate weighting. This requires knowing each mob's family. The `mobTemplates` query (loaded earlier in the route) should include family membership. Check what's available and add family-based weight adjustment:

```typescript
// After candidates are selected by tier, boost encounterWeight for affected families.
// mobTemplates includes familyMembers from the query — check the data shape.
// If mob.familyMembers exists, match against spawnMods.byFamily.
const weightedCandidates = candidates.map(mob => {
  const familyMemberIds = (mob as any).familyMembers?.map((fm: any) => fm.mobFamilyId) ?? [];
  let weightMod = spawnMods.global;
  for (const fId of familyMemberIds) {
    const familyMod = spawnMods.byFamily.get(fId);
    if (familyMod) { weightMod *= familyMod; break; }
  }
  return { ...mob, encounterWeight: mob.encounterWeight * weightMod };
});
const mob = pickWeighted(weightedCandidates, 'encounterWeight') as typeof candidates[number] | null;
```

Note: Check what data `mobTemplates` actually includes — if it doesn't include `familyMembers`, add the join to the Prisma query where mob templates are loaded (near the top of the route). Adjust accordingly.

**Step 4: Update exploration estimate route**

In `apps/api/src/routes/exploration/estimate.ts`, add spawn rate multiplier:

```typescript
import { getSpawnRateModifiers } from '../../services/worldEventService';

// Inside the handler, after zoneExitChance is resolved:
let spawnRateMultiplier = 1;
if (query.zoneId) {
  const spawnMods = await getSpawnRateModifiers(query.zoneId);
  // Simplified: use global + average family boost (we don't have family weights here)
  // Use the aggregate mobSpawnRateMultiplier from zone modifiers instead
  const { getActiveZoneModifiers } = await import('../../services/worldEventService');
  const zoneMods = await getActiveZoneModifiers(query.zoneId);
  spawnRateMultiplier = zoneMods.mobSpawnRateMultiplier;
}

res.json({
  estimate: estimateExploration(effectiveTurns, zoneExitChance, spawnRateMultiplier),
  taxRate,
  effectiveTurns,
});
```

**Step 5: Build and verify**

Run: `npm run build:api`
Run: `npx vitest run apps/api/src/routes/exploration/` (if integration tests exist)

**Step 6: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts apps/api/src/routes/exploration/estimate.ts
git commit -m "feat: wire spawn rate events to exploration ambush and encounter site rates

Spawn rate modifiers now scale ambush/encounter frequency proportionally
to the affected family's weight in the zone."
```

---

## Task 6: Event Badge Helpers — Backend

**Files:**
- Modify: `apps/api/src/services/worldEventService.ts`

**Step 1: Write test for `getEventModifiersForEntity`**

Add to `worldEventService.test.ts`:

```typescript
import { getEventModifiersForEntity } from './worldEventService';

describe('getEventModifiersForEntity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mob-relevant events for a mob family', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ev-1', type: 'mob', zoneId: 'zone-1', title: 'Ferocious Boars',
        description: 'test', effectType: 'damage_up', effectValue: 0.5,
        targetMobId: null, targetFamily: 'family-boar', targetResource: null,
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
        zone: { name: 'Forest Edge' },
      },
      {
        id: 'ev-2', type: 'resource', zoneId: 'zone-1', title: 'Rich Veins',
        description: 'test', effectType: 'yield_up', effectValue: 0.25,
        targetMobId: null, targetFamily: null, targetResource: 'copper_ore',
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
        zone: { name: 'Forest Edge' },
      },
    ]);

    const mods = await getEventModifiersForEntity('zone-1', { mobFamilyId: 'family-boar' });
    expect(mods).toHaveLength(1);
    expect(mods[0].title).toBe('Ferocious Boars');
    expect(mods[0].effectType).toBe('damage_up');
  });

  it('returns resource-relevant events for a resource type', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ev-2', type: 'resource', zoneId: 'zone-1', title: 'Rich Veins',
        description: 'test', effectType: 'yield_up', effectValue: 0.25,
        targetMobId: null, targetFamily: null, targetResource: 'copper_ore',
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
        zone: { name: 'Forest Edge' },
      },
    ]);

    const mods = await getEventModifiersForEntity('zone-1', { resourceType: 'copper_ore' });
    expect(mods).toHaveLength(1);
    expect(mods[0].title).toBe('Rich Veins');
  });

  it('includes untargeted zone-wide events', async () => {
    (prisma.worldEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'ev-3', type: 'mob', zoneId: 'zone-1', title: 'Monster Surge',
        description: 'test', effectType: 'damage_up', effectValue: 0.3,
        targetMobId: null, targetFamily: null, targetResource: null,
        startedAt: new Date(), expiresAt: new Date(), status: 'active', createdBy: 'system',
        zone: { name: 'Forest Edge' },
      },
    ]);

    const mods = await getEventModifiersForEntity('zone-1', { mobFamilyId: 'family-boar' });
    expect(mods).toHaveLength(1); // untargeted mob event applies to all mob families
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/worldEventService.test.ts`

**Step 3: Implement `getEventModifiersForEntity`**

Add to `worldEventService.ts`:

```typescript
export interface EventModifierBadge {
  title: string;
  effectType: string;
  effectValue: number;
  isGlobal: boolean;
}

export async function getEventModifiersForEntity(
  zoneId: string,
  context: { mobFamilyId?: string; resourceType?: string },
): Promise<EventModifierBadge[]> {
  const [zoneEvents, worldEvents] = await Promise.all([
    getActiveEventsForZone(zoneId),
    getActiveWorldWideEvents(),
  ]);

  const badges: EventModifierBadge[] = [];

  for (const event of zoneEvents) {
    if (!eventAppliesToTarget(event, context)) continue;
    // Filter: mob events only for mob context, resource events only for resource context
    if (context.mobFamilyId && event.type === 'resource') continue;
    if (context.resourceType && event.type === 'mob') continue;
    badges.push({
      title: event.title,
      effectType: event.effectType,
      effectValue: event.effectValue,
      isGlobal: false,
    });
  }

  for (const event of worldEvents) {
    if (!eventAppliesToTarget(event, context)) continue;
    if (context.mobFamilyId && event.type === 'resource') continue;
    if (context.resourceType && event.type === 'mob') continue;
    badges.push({
      title: event.title,
      effectType: event.effectType,
      effectValue: event.effectValue,
      isGlobal: true,
    });
  }

  return badges;
}
```

**Step 4: Run tests**

Run: `npx vitest run apps/api/src/services/worldEventService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/worldEventService.ts apps/api/src/services/worldEventService.test.ts
git commit -m "feat: add getEventModifiersForEntity for badge data lookup"
```

---

## Task 7: Encounter Site Badges — Backend

**Files:**
- Modify: `apps/api/src/routes/combat/sites.ts:55-175`

**Step 1: Add event modifier data to encounter site listing response**

Import helper:

```typescript
import { getEventModifiersForEntity, type EventModifierBadge } from '../../services/worldEventService';
```

After the sites are built and paginated (around line 137, after `pageItems` is set), batch-fetch event modifiers per unique zone+family combo:

```typescript
// Batch fetch event modifiers for badge display
const badgeCache = new Map<string, EventModifierBadge[]>();
for (const site of pageItems) {
  const key = `${site.zoneId}:${site.mobFamilyId}`;
  if (!badgeCache.has(key)) {
    badgeCache.set(key, await getEventModifiersForEntity(site.zoneId, { mobFamilyId: site.mobFamilyId }));
  }
}
```

In the response mapping (around line 153), add `eventModifiers`:

```typescript
return {
  encounterSiteId: site.encounterSiteId,
  // ... existing fields ...
  roomMobCounts: site.roomMobCounts,
  eventModifiers: badgeCache.get(`${site.zoneId}:${site.mobFamilyId}`) ?? [],
};
```

**Step 2: Update frontend API type**

In `apps/web/src/lib/api/combat.ts`, add to `EncounterSitesResponse` interface (inside the array type, around line 393):

```typescript
eventModifiers?: Array<{ title: string; effectType: string; effectValue: number; isGlobal: boolean }>;
```

**Step 3: Update `PendingEncounter` type**

In `apps/web/src/app/game/useGameController.ts:86-107`, add:

```typescript
export interface PendingEncounter {
  // ... existing fields ...
  roomMobCounts: Array<{ room: number; alive: number; total: number }>;
  eventModifiers?: Array<{ title: string; effectType: string; effectValue: number; isGlobal: boolean }>;
}
```

And in the mapping (around line 678-700), add:

```typescript
eventModifiers: site.eventModifiers,
```

**Step 4: Build and verify**

Run: `npm run build:api && npm run typecheck`

**Step 5: Commit**

```bash
git add apps/api/src/routes/combat/sites.ts apps/web/src/lib/api/combat.ts apps/web/src/app/game/useGameController.ts
git commit -m "feat: add event modifier badges to encounter site API response"
```

---

## Task 8: Gathering Badges — Backend

**Files:**
- Modify: `apps/api/src/routes/gathering.ts` (nodes listing + mine response)

**Step 1: Add event modifiers to nodes listing**

In `apps/api/src/routes/gathering.ts`, import:

```typescript
import { getEventModifiersForEntity, type EventModifierBadge } from '../services/worldEventService';
```

In the `GET /nodes` handler (around line 157-176), batch-fetch modifiers per unique zone+resourceType:

```typescript
// Before building pageNodes response
const nodeBadgeCache = new Map<string, EventModifierBadge[]>();
for (const pn of pageNodes) {
  const key = `${pn.resourceNode.zoneId}:${pn.resourceNode.resourceType}`;
  if (!nodeBadgeCache.has(key)) {
    nodeBadgeCache.set(key, await getEventModifiersForEntity(
      pn.resourceNode.zoneId, { resourceType: pn.resourceNode.resourceType }
    ));
  }
}
```

Add to the node response mapping:

```typescript
return {
  id: pn.id,
  // ... existing fields ...
  weathered: pn.decayedCapacity > 0,
  eventModifiers: nodeBadgeCache.get(`${template.zoneId}:${template.resourceType}`) ?? [],
};
```

**Step 2: Add yield breakdown to mine response**

In the mine handler (around line 296-299), capture the base yield values already available:

The variables `baseYieldPerAction` and `eventYield` (line 290 and 296) already have the pre/post event values. Pass them through to the response.

Around line 459 (mine response), add:

```typescript
yieldBreakdown: zoneModifiers.resourceYieldMultiplier !== 1
  ? {
      baseYieldPerAction,
      eventYieldPerAction: eventYield,
      eventModifier: zoneModifiers.resourceYieldMultiplier,
      eventTitle: activeEventEffects.find(e => e.effectType === 'yield_up' || e.effectType === 'yield_down')?.title ?? null,
    }
  : undefined,
```

**Step 3: Update frontend gathering types**

In `apps/web/src/lib/api/items.ts`, update `GatheringNodesResponse`:

```typescript
export interface GatheringNodesResponse {
  nodes: Array<{
    // ... existing fields ...
    weathered: boolean;
    eventModifiers?: Array<{ title: string; effectType: string; effectValue: number; isGlobal: boolean }>;
  }>;
  // ...
}
```

Update mine response type (around line 190):

```typescript
activeEvents?: Array<{ title: string; effectType: string; effectValue: number }>;
yieldBreakdown?: {
  baseYieldPerAction: number;
  eventYieldPerAction: number;
  eventModifier: number;
  eventTitle: string | null;
};
```

**Step 4: Build and verify**

Run: `npm run build:api && npm run typecheck`

**Step 5: Commit**

```bash
git add apps/api/src/routes/gathering.ts apps/web/src/lib/api/items.ts
git commit -m "feat: add event modifier badges to gathering nodes and yield breakdown to mine response"
```

---

## Task 9: Combat Badges — Backend

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (lines 575, 892)

**Step 1: Enhance `activeEvents` with `appliedToThisMob` flag**

The combat route already fetches `activeEventEffects` via `getActiveEventSummaries(zoneId)`. Enhance this to include whether each event applies to the specific mob being fought.

Import:

```typescript
import { getEventModifiersForEntity } from '../../services/worldEventService';
```

For encounter site combat (around line 175-177), after `zoneModifiers` and `activeEventEffects` are fetched, also get mob-specific modifiers. The site's `mobFamilyId` tells us which family is being fought:

```typescript
const siteModifiers = site ? await getEventModifiersForEntity(zoneId, { mobFamilyId: site.mobFamilyId }) : [];
```

In the response (around line 575 and 892), replace the generic `activeEvents` with the enhanced version:

```typescript
activeEvents: activeEventEffects.length > 0
  ? activeEventEffects.map(e => ({
      ...e,
      appliedToThisMob: siteModifiers.some(m => m.effectType === e.effectType && m.effectValue === e.effectValue),
    }))
  : undefined,
```

For zone/direct combat (the other combat path), use the mob's family to determine applicability. The mob template's family is available from the template query.

**Step 2: Update frontend type**

In `apps/web/src/lib/api/combat.ts`, update the `activeEvents` field on `CombatResponse` (line 292):

```typescript
activeEvents?: Array<{ title: string; effectType: string; effectValue: number; appliedToThisMob?: boolean }>;
```

**Step 3: Build and verify**

Run: `npm run build:api && npm run typecheck`

**Step 4: Commit**

```bash
git add apps/api/src/routes/combat/start.ts apps/web/src/lib/api/combat.ts
git commit -m "feat: add appliedToThisMob flag to combat active events"
```

---

## Task 10: Exploration Badges — Backend

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts` (narrative event details)

**Step 1: Add event modifiers to encounter site and ambush narrative events**

In the exploration route, where encounter site events are built (around line 427-438), add `eventModifiers` to the details:

```typescript
events.push({
  turn: outcome.turnOccurred,
  type: 'encounter_site',
  description: `You stumbled into a ${siteName} (${mobs.length} mobs inside).`,
  details: {
    mobFamilyId: pickedFamily.mobFamilyId,
    mobFamilyName: pickedFamily.mobFamily.name,
    siteName,
    size,
    totalMobs: mobs.length,
    eventModifiers: await getEventModifiersForEntity(body.zoneId, { mobFamilyId: pickedFamily.mobFamilyId }),
  },
});
```

For ambush events (around line 306-340), add event modifiers to the details. Determine the mob's family from the template data:

```typescript
// In the ambush narrative event details, add:
eventModifiers: await getEventModifiersForEntity(body.zoneId, { mobFamilyId: /* mob's family ID */ }),
```

Note: The mob's family ID may need to be looked up from `zoneFamilies` based on which mob was picked. Check what data is available and adjust accordingly.

**Step 2: Build and verify**

Run: `npm run build:api && npm run typecheck`

**Step 3: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat: add event modifier badges to exploration narrative events"
```

---

## Task 11: EventBadge Component — Frontend

**Files:**
- Create: `apps/web/src/components/common/EventBadge.tsx`

**Step 1: Create the component**

```tsx
'use client';

interface EventModifier {
  title: string;
  effectType: string;
  effectValue: number;
  isGlobal?: boolean;
}

// Is this event good or bad for the player?
function isPlayerBuff(effectType: string): boolean {
  // Mob debuffs are good for the player, mob buffs are bad
  // Resource buffs are good, resource debuffs are bad
  return ['damage_down', 'hp_down', 'spawn_rate_down', 'yield_up', 'drop_rate_up'].includes(effectType);
}

function effectLabel(effectType: string): string {
  const labels: Record<string, string> = {
    damage_up: 'DMG', damage_down: 'DMG',
    hp_up: 'HP', hp_down: 'HP',
    spawn_rate_up: 'Spawns', spawn_rate_down: 'Spawns',
    drop_rate_up: 'Drops', drop_rate_down: 'Drops',
    yield_up: 'Yield', yield_down: 'Yield',
  };
  return labels[effectType] ?? effectType;
}

export function EventBadge({ modifier }: { modifier: EventModifier }) {
  const isBuff = isPlayerBuff(modifier.effectType);
  const sign = modifier.effectType.endsWith('_down') ? '-' : '+';
  const percent = Math.round(modifier.effectValue * 100);

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold"
      style={{
        background: isBuff ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
        color: isBuff ? 'var(--rpg-green-light)' : 'var(--rpg-red)',
        border: `1px solid ${isBuff ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
      }}
    >
      {modifier.isGlobal && (
        <span className="opacity-60">GLOBAL</span>
      )}
      <span>{sign}{percent}% {effectLabel(modifier.effectType)}</span>
    </span>
  );
}

export function EventBadges({ modifiers }: { modifiers?: EventModifier[] }) {
  if (!modifiers || modifiers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {modifiers.map((mod, i) => (
        <EventBadge key={`${mod.effectType}-${i}`} modifier={mod} />
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/common/EventBadge.tsx
git commit -m "feat: add EventBadge and EventBadges reusable components"
```

---

## Task 12: Render Badges — Encounter Sites

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx` (~line 371-393)

**Step 1: Import and render badges on encounter site cards**

Import:

```typescript
import { EventBadges } from '@/components/common/EventBadge';
```

In the encounter site card rendering (around line 371-393), after the site name and mob count text, add:

```tsx
<div className="text-[var(--rpg-text-primary)] font-semibold">
  {e.siteName}
</div>
<span className="text-xs text-[var(--rpg-text-secondary)]">
  {e.totalRooms > 1
    ? `Room ${e.currentRoom}/${e.totalRooms} · ${e.aliveMobs}/${e.totalMobs} mobs`
    : `${e.aliveMobs}/${e.totalMobs} mobs`
  }
</span>
{/* NEW: Event badges */}
<EventBadges modifiers={e.eventModifiers} />
```

**Step 2: Build and verify**

Run: `npm run build:web`

**Step 3: Commit**

```bash
git add apps/web/src/app/game/screens/CombatScreen.tsx
git commit -m "feat: render event badges on encounter site cards"
```

---

## Task 13: Render Badges — Gathering Nodes

**Files:**
- Modify: `apps/web/src/components/screens/Gathering.tsx`

**Step 1: Update ResourceNode interface**

Add to the `ResourceNode` interface (around line 17-31):

```typescript
eventModifiers?: Array<{ title: string; effectType: string; effectValue: number; isGlobal: boolean }>;
```

**Step 2: Import and render badges on node cards**

Import:

```typescript
import { EventBadges } from '@/components/common/EventBadge';
```

Find where node cards are rendered in the component and add `<EventBadges modifiers={node.eventModifiers} />` below the node info.

**Step 3: Show yield breakdown in mining results**

When the mining result comes back, if `yieldBreakdown` is present, show the bonus. Find the result display area and add:

```tsx
{result.yieldBreakdown && (
  <span className="text-xs" style={{ color: 'var(--rpg-green-light)' }}>
    {` (+${result.yieldBreakdown.eventYieldPerAction - result.yieldBreakdown.baseYieldPerAction}/action from ${result.yieldBreakdown.eventTitle})`}
  </span>
)}
```

**Step 4: Build and verify**

Run: `npm run build:web`

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Gathering.tsx
git commit -m "feat: render event badges on gathering nodes and yield breakdown in results"
```

---

## Task 14: Render Badges — Combat Playback

**Files:**
- Modify: `apps/web/src/components/combat/` (find the component that renders mob name/info during combat playback)

**Step 1: Find combat playback component**

Check `apps/web/src/components/combat/` and `apps/web/src/components/screens/CombatLog.tsx` for where the mob name is rendered during combat. Add event badges next to the mob name when `activeEvents` has entries with `appliedToThisMob: true`.

**Step 2: Import and render**

```typescript
import { EventBadges } from '@/components/common/EventBadge';
```

Filter to only events that applied to the mob:

```tsx
const mobEvents = activeEvents?.filter(e => e.appliedToThisMob).map(e => ({
  title: e.title,
  effectType: e.effectType,
  effectValue: e.effectValue,
  isGlobal: false,
}));
// Render: <EventBadges modifiers={mobEvents} />
```

**Step 3: Build and verify**

Run: `npm run build:web`

**Step 4: Commit**

```bash
git add apps/web/src/components/combat/ apps/web/src/components/screens/CombatLog.tsx
git commit -m "feat: render event badges on mobs in combat playback"
```

---

## Task 15: Render Badges — Exploration Playback

**Files:**
- Modify: `apps/web/src/components/exploration/ExplorationPlayback.tsx`

**Step 1: Add badges to encounter site and ambush narrative cards**

In the `ExplorationPlayback` component, find where narrative events are rendered. For `encounter_site` and `ambush_victory`/`ambush_defeat` event types, check if `details.eventModifiers` exists and render badges.

```typescript
import { EventBadges } from '@/components/common/EventBadge';
```

In the event rendering:

```tsx
{event.details?.eventModifiers && (
  <EventBadges modifiers={event.details.eventModifiers} />
)}
```

**Step 2: Build and verify**

Run: `npm run build:web`

**Step 3: Commit**

```bash
git add apps/web/src/components/exploration/ExplorationPlayback.tsx
git commit -m "feat: render event badges in exploration playback for sites and ambushes"
```

---

## Task 16: Final Verification

**Step 1: Run all tests**

```bash
npm run test
```

Expected: All tests pass.

**Step 2: Type check everything**

```bash
npm run typecheck
```

Expected: Clean compile.

**Step 3: Build everything**

```bash
npm run build
```

Expected: Clean build.

**Step 4: Manual testing checklist**

- [ ] Create 3+ zone events in one zone via admin — verify cap at MAX_ZONE_EVENTS
- [ ] Explore with a spawn_rate_up event active — verify more ambushes/sites
- [ ] Check encounter site cards show event badges
- [ ] Fight mobs at an encounter site — verify badges in combat
- [ ] Mine a node with yield_up active — verify badge on node + breakdown in results
- [ ] Explore and check discovered sites/ambushes show badges
- [ ] Verify exploration estimate reflects spawn rate modifier

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass for world events improvements"
```
