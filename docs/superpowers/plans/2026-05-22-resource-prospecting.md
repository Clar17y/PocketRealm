# Resource Prospecting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add resource prospecting to Exploration so a player can choose a concrete resource node in the current zone, trade encounter-site discovery for more resource-node discovery, and receive skill-scaled targeting bias for the chosen node.

**Architecture:** Keep prospecting in the existing exploration start flow. Add shared balance constants, extend the game-engine probability model with explicit per-outcome rate options, add an API service for prospectable node payloads and request-local node weight bias, thread `prospectingResourceNodeId` through the route and outcome context, then expose a mutually exclusive focus selector in the Exploration UI alongside mob family tracking.

**Tech Stack:** Next.js 16, React 18, Express 4, Prisma 6, Zod, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-22-resource-prospecting-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/constants/gameConstants.ts` | Prospecting balance constants |
| `packages/shared/src/index.ts` | Export prospecting constants |
| `packages/game-engine/src/exploration/probabilityModel.ts` | Per-outcome exploration rate options |
| `packages/game-engine/src/exploration/probabilityModel.test.ts` | Probability-model coverage for prospecting rates |
| `apps/api/src/services/resourceProspectingService.ts` | Prospectable node payloads and target-share weighting |
| `apps/api/src/services/resourceProspectingService.test.ts` | Unit tests for target-share math and zone payload grouping |
| `apps/api/src/services/zoneRoutesService.ts` | Include `prospectableResourceNodes` on discovered wild zones |
| `apps/api/src/routes/zones.tracking.test.ts` | Zones payload tests for prospectable resource nodes |
| `apps/api/src/services/exploration/helpers.ts` | Start request schema validation |
| `apps/api/src/services/exploration/startRouteService.ts` | Prospecting validation, skill lookup, and simulation options |
| `apps/api/src/routes/exploration/start.tracking.test.ts` | Route tests for request validation and simulation threading |
| `apps/api/src/services/explorationOutcome/types.ts` | Outcome context fields for prospecting |
| `apps/api/src/services/explorationOutcomeService.ts` | Resource-node outcome bias |
| `apps/web/src/lib/api/combat.ts` | API response/request typing for prospecting |
| `apps/web/src/app/game/useGameController.ts` | Zone state typing |
| `apps/web/src/app/game/hooks/useGameBootstrap.ts` | Bootstrap zone state typing |
| `apps/web/src/app/game/hooks/useExplorationActions.ts` | Pass prospecting target into the API call |
| `apps/web/src/app/game/hooks/useExplorationActions.test.ts` | Hook request argument coverage |
| `apps/web/src/app/game/renderers/coreScreenRenderers.tsx` | Pass prospecting nodes and skill state to Exploration |
| `apps/web/src/components/screens/Exploration.tsx` | Focus selector, prospecting picker, and expectation preview |
| `apps/web/src/components/screens/Exploration.test.ts` | UI tests for mutually exclusive focus modes and prospecting requests |

---

### Task 1: Shared Constants And Probability Rates

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/game-engine/src/exploration/probabilityModel.ts`
- Modify: `packages/game-engine/src/exploration/probabilityModel.test.ts`

- [ ] **Step 1: Add failing probability-model tests**

Add tests that prove prospecting can flip encounter-site and resource-node rates without changing ambushes. Keep the existing scalar multiplier test because world events and mob tracking still use that call shape.

```ts
it('supports separate rate multipliers for prospecting', () => {
  const estimate = estimateExploration(1000, null, {
    spawnRateMultiplier: 1,
    encounterSiteRateMultiplier: 1 / 3,
    resourceNodeRateMultiplier: 3,
  });

  expect(estimate.expectedAmbushes).toBeCloseTo(5);
  expect(estimate.expectedEncounterSites).toBeCloseTo(0.5);
  expect(estimate.resourceNodeChance).toBeCloseTo(cumulativeProbability(0.0015, 1000));
});

it('keeps the legacy scalar multiplier behavior for ambushes and sites only', () => {
  const estimate = estimateExploration(1000, null, 0.75);

  expect(estimate.expectedAmbushes).toBeCloseTo(3.75);
  expect(estimate.expectedEncounterSites).toBeCloseTo(1.125);
  expect(estimate.resourceNodeChance).toBeCloseTo(cumulativeProbability(0.0005, 1000));
});
```

- [ ] **Step 2: Run the focused package test and confirm it fails**

```powershell
npm run test -w packages/game-engine -- src/exploration/probabilityModel.test.ts
```

Expected output: FAIL because `estimateExploration` does not accept an options object yet.

- [ ] **Step 3: Add prospecting constants**

Add this block immediately after `EXPLORATION_TRACKING_CONSTANTS` in `packages/shared/src/constants/gameConstants.ts`.

```ts
export const RESOURCE_PROSPECTING_CONSTANTS = {
  ENCOUNTER_SITE_RATE_MULTIPLIER: 1 / 3,
  RESOURCE_NODE_RATE_MULTIPLIER: 3,
  TARGET_BIAS_LEVELS_TO_CAP: 10,
  THREE_NODE_TARGET_SHARE_AT_LEVEL: 0.5,
  THREE_NODE_TARGET_SHARE_CAP: 0.8,
  TWO_NODE_TARGET_SHARE_AT_LEVEL: 0.65,
  TWO_NODE_TARGET_SHARE_CAP: 0.85,
} as const;
```

Export it from `packages/shared/src/index.ts`.

```ts
export { RESOURCE_PROSPECTING_CONSTANTS } from './constants/gameConstants';
```

- [ ] **Step 4: Extend the probability model with explicit rate options**

Add these types and helper near the top of `packages/game-engine/src/exploration/probabilityModel.ts`.

```ts
export interface ExplorationRateOptions {
  spawnRateMultiplier?: number;
  encounterSiteRateMultiplier?: number;
  resourceNodeRateMultiplier?: number;
  hiddenCacheChanceOverride?: number | null;
}

interface NormalizedExplorationRateOptions {
  spawnRateMultiplier: number;
  encounterSiteRateMultiplier: number;
  resourceNodeRateMultiplier: number;
  hiddenCacheChanceOverride: number | null;
}

function normalizeExplorationRateOptions(
  rateOptionsOrSpawnMultiplier: number | ExplorationRateOptions = 1,
  legacyHiddenCacheChanceOverride: number | null = null,
): NormalizedExplorationRateOptions {
  if (typeof rateOptionsOrSpawnMultiplier === 'number') {
    return {
      spawnRateMultiplier: rateOptionsOrSpawnMultiplier,
      encounterSiteRateMultiplier: 1,
      resourceNodeRateMultiplier: 1,
      hiddenCacheChanceOverride: legacyHiddenCacheChanceOverride,
    };
  }

  return {
    spawnRateMultiplier: rateOptionsOrSpawnMultiplier.spawnRateMultiplier ?? 1,
    encounterSiteRateMultiplier: rateOptionsOrSpawnMultiplier.encounterSiteRateMultiplier ?? 1,
    resourceNodeRateMultiplier: rateOptionsOrSpawnMultiplier.resourceNodeRateMultiplier ?? 1,
    hiddenCacheChanceOverride: rateOptionsOrSpawnMultiplier.hiddenCacheChanceOverride ?? null,
  };
}
```

Change `estimateExploration` and `simulateExploration` signatures so the third parameter is `number | ExplorationRateOptions` and the fourth parameter remains the legacy hidden-cache override. Both functions should compute rates with this shape:

```ts
const rateOptions = normalizeExplorationRateOptions(
  rateOptionsOrSpawnMultiplier,
  hiddenCacheChanceOverride,
);
const ambushRate = EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * rateOptions.spawnRateMultiplier;
const siteRate = EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN
  * rateOptions.spawnRateMultiplier
  * rateOptions.encounterSiteRateMultiplier;
const resourceNodeRate = EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE
  * rateOptions.resourceNodeRateMultiplier;
const hiddenCacheChance = rateOptions.hiddenCacheChanceOverride != null
  ? rateOptions.hiddenCacheChanceOverride
  : EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE;
```

Use `resourceNodeRate` in both the estimate and simulation resource-node checks. Leave zone exits, hidden caches, and event discovery on their existing checks.

- [ ] **Step 5: Re-run the focused test**

```powershell
npm run test -w packages/game-engine -- src/exploration/probabilityModel.test.ts
```

Expected output: PASS for `probabilityModel.test.ts`.

- [ ] **Step 6: Commit Task 1**

```powershell
git status --short
git add packages/shared/src/constants/gameConstants.ts packages/shared/src/index.ts packages/game-engine/src/exploration/probabilityModel.ts packages/game-engine/src/exploration/probabilityModel.test.ts
git commit -m "feat: add exploration rate options for prospecting"
```

Expected output: a commit hash and a clean status for staged files.

---

### Task 2: API Prospecting Service And Zone Payload

**Files:**
- Create: `apps/api/src/services/resourceProspectingService.ts`
- Create: `apps/api/src/services/resourceProspectingService.test.ts`
- Modify: `apps/api/src/services/zoneRoutesService.ts`
- Modify: `apps/api/src/routes/zones.tracking.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/services/resourceProspectingService.test.ts` with coverage for target-share math, request-local discovery weights, and zone grouping.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from './__test__/setup';
import {
  applyProspectingResourceWeightBias,
  buildProspectableResourceNodesByZone,
  calculateProspectingTargetShare,
} from './resourceProspectingService';

describe('calculateProspectingTargetShare', () => {
  it('uses the three-node split at level and caps at ten levels above', () => {
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 5, levelRequired: 5 })).toBeCloseTo(0.5);
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 10, levelRequired: 5 })).toBeCloseTo(0.65);
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 15, levelRequired: 5 })).toBeCloseTo(0.8);
    expect(calculateProspectingTargetShare({ nodeCount: 3, skillLevel: 3, levelRequired: 5 })).toBeCloseTo(0.5);
  });

  it('uses the two-node split for zones with two resource templates', () => {
    expect(calculateProspectingTargetShare({ nodeCount: 2, skillLevel: 5, levelRequired: 5 })).toBeCloseTo(0.65);
    expect(calculateProspectingTargetShare({ nodeCount: 2, skillLevel: 15, levelRequired: 5 })).toBeCloseTo(0.85);
  });

  it('selects the only node when a zone has one resource template', () => {
    expect(calculateProspectingTargetShare({ nodeCount: 1, skillLevel: 1, levelRequired: 10 })).toBe(1);
  });
});

describe('applyProspectingResourceWeightBias', () => {
  it('converts the selected target into request-local discovery weights', () => {
    const result = applyProspectingResourceWeightBias(
      [
        { id: 'node-copper', discoveryWeight: 100, resourceType: 'copper_ore', levelRequired: 1 },
        { id: 'node-oak', discoveryWeight: 100, resourceType: 'oak_log', levelRequired: 1 },
        { id: 'node-sage', discoveryWeight: 100, resourceType: 'forest_sage', levelRequired: 1 },
      ],
      'node-copper',
      1,
    );

    expect(result.map((node) => node.discoveryWeight)).toEqual([0.5, 0.25, 0.25]);
  });

  it('returns the original weights when the target is not in the zone', () => {
    const nodes = [
      { id: 'node-oak', discoveryWeight: 80, resourceType: 'oak_log', levelRequired: 1 },
    ];

    expect(applyProspectingResourceWeightBias(nodes, 'node-copper', 10)).toEqual(nodes);
  });
});

describe('buildProspectableResourceNodesByZone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups resource node templates by zone', async () => {
    mockPrisma.resourceNode.findMany.mockResolvedValue([
      { id: 'node-copper', zoneId: 'zone-forest', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
      { id: 'node-oak', zoneId: 'zone-forest', resourceType: 'oak_log', skillRequired: 'woodcutting', levelRequired: 1 },
    ]);

    const result = await buildProspectableResourceNodesByZone(['zone-forest']);

    expect(result.get('zone-forest')).toEqual([
      { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
      { resourceNodeId: 'node-oak', resourceType: 'oak_log', skillRequired: 'woodcutting', levelRequired: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run the service test and confirm it fails**

```powershell
npm run test -w apps/api -- src/services/resourceProspectingService.test.ts
```

Expected output: FAIL because `resourceProspectingService.ts` does not exist.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/resourceProspectingService.ts`.

```ts
import { prisma } from '@pocketrealm/database';
import { GATHERING_SKILLS, RESOURCE_PROSPECTING_CONSTANTS, type SkillType } from '@pocketrealm/shared';

export interface ProspectableResourceNode {
  resourceNodeId: string;
  resourceType: string;
  skillRequired: SkillType;
  levelRequired: number;
}

type WeightedResourceNode = {
  id: string;
  discoveryWeight: number;
  levelRequired: number;
};

function toSkillType(value: string): SkillType {
  return GATHERING_SKILLS.includes(value as SkillType) ? value as SkillType : 'mining';
}

export function calculateProspectingTargetShare({
  nodeCount,
  skillLevel,
  levelRequired,
}: {
  nodeCount: number;
  skillLevel: number;
  levelRequired: number;
}): number {
  if (nodeCount <= 1) return 1;

  const atLevel = nodeCount === 2
    ? RESOURCE_PROSPECTING_CONSTANTS.TWO_NODE_TARGET_SHARE_AT_LEVEL
    : RESOURCE_PROSPECTING_CONSTANTS.THREE_NODE_TARGET_SHARE_AT_LEVEL;
  const cap = nodeCount === 2
    ? RESOURCE_PROSPECTING_CONSTANTS.TWO_NODE_TARGET_SHARE_CAP
    : RESOURCE_PROSPECTING_CONSTANTS.THREE_NODE_TARGET_SHARE_CAP;
  const levelsAbove = Math.max(0, skillLevel - levelRequired);
  const progress = Math.min(
    levelsAbove / RESOURCE_PROSPECTING_CONSTANTS.TARGET_BIAS_LEVELS_TO_CAP,
    1,
  );

  return atLevel + (cap - atLevel) * progress;
}

export function applyProspectingResourceWeightBias<T extends WeightedResourceNode>(
  nodes: T[],
  prospectingResourceNodeId: string | null | undefined,
  skillLevel: number,
): T[] {
  if (!prospectingResourceNodeId) return nodes;
  const target = nodes.find((node) => node.id === prospectingResourceNodeId);
  if (!target) return nodes;

  const targetShare = calculateProspectingTargetShare({
    nodeCount: nodes.length,
    skillLevel,
    levelRequired: target.levelRequired,
  });
  const nonTargetShare = nodes.length > 1 ? (1 - targetShare) / (nodes.length - 1) : 0;

  return nodes.map((node) => ({
    ...node,
    discoveryWeight: node.id === prospectingResourceNodeId ? targetShare : nonTargetShare,
  }));
}

export async function buildProspectableResourceNodesByZone(
  zoneIds: string[],
): Promise<Map<string, ProspectableResourceNode[]>> {
  if (zoneIds.length === 0) return new Map<string, ProspectableResourceNode[]>();

  const nodes = await prisma.resourceNode.findMany({
    where: { zoneId: { in: zoneIds } },
    select: {
      id: true,
      zoneId: true,
      resourceType: true,
      skillRequired: true,
      levelRequired: true,
    },
    orderBy: [
      { levelRequired: 'asc' },
      { resourceType: 'asc' },
    ],
  });

  const byZone = new Map<string, ProspectableResourceNode[]>();
  for (const node of nodes) {
    const zoneNodes = byZone.get(node.zoneId) ?? [];
    zoneNodes.push({
      resourceNodeId: node.id,
      resourceType: node.resourceType,
      skillRequired: toSkillType(node.skillRequired),
      levelRequired: node.levelRequired,
    });
    byZone.set(node.zoneId, zoneNodes);
  }

  return byZone;
}
```

- [ ] **Step 4: Add prospectable nodes to the zones payload**

In `apps/api/src/services/zoneRoutesService.ts`, import `buildProspectableResourceNodesByZone`.

```ts
import { buildProspectableResourceNodesByZone } from '../services/resourceProspectingService';
```

Replace the current single call to `buildTrackableMobFamiliesByZone` with a parallel lookup.

```ts
const [trackableFamiliesByZone, prospectableResourcesByZone] = await Promise.all([
  buildTrackableMobFamiliesByZone(playerId, trackableWildZoneIds),
  buildProspectableResourceNodesByZone(trackableWildZoneIds),
]);
```

Extend the discovered wild-zone response object.

```ts
...(discovered && z.zoneType === 'wild'
  ? {
      trackableMobFamilies: trackableFamiliesByZone.get(z.id) ?? [],
      prospectableResourceNodes: prospectableResourcesByZone.get(z.id) ?? [],
    }
  : {}),
```

- [ ] **Step 5: Add zones payload coverage**

Extend `apps/api/src/routes/zones.tracking.test.ts` so the zone response includes `prospectableResourceNodes` for discovered wild zones and omits it for towns or undiscovered zones. Mock `buildProspectableResourceNodesByZone` to return:

```ts
new Map([
  [
    'zone-forest',
    [
      { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
    ],
  ],
])
```

Assert the response fragment:

```ts
expect(forestZone).toMatchObject({
  trackableMobFamilies: expect.any(Array),
  prospectableResourceNodes: [
    { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
  ],
});
```

- [ ] **Step 6: Run focused API tests**

```powershell
npm run test -w apps/api -- src/services/resourceProspectingService.test.ts src/routes/zones.tracking.test.ts
```

Expected output: PASS for both files.

- [ ] **Step 7: Commit Task 2**

```powershell
git status --short
git add apps/api/src/services/resourceProspectingService.ts apps/api/src/services/resourceProspectingService.test.ts apps/api/src/services/zoneRoutesService.ts apps/api/src/routes/zones.tracking.test.ts
git commit -m "feat: expose prospectable resource nodes"
```

Expected output: a commit hash and a clean status for staged files.

---

### Task 3: Exploration Start Validation And Simulation Threading

**Files:**
- Modify: `apps/api/src/services/exploration/helpers.ts`
- Modify: `apps/api/src/services/exploration/startRouteService.ts`
- Modify: `apps/api/src/routes/exploration/start.tracking.test.ts`

- [ ] **Step 1: Add failing route tests**

Extend `apps/api/src/routes/exploration/start.tracking.test.ts` with these cases:

- Reject a request containing both `trackingFamilyId` and `prospectingResourceNodeId`.
- Reject a `prospectingResourceNodeId` that is not in `getCachedResourceNodesByZone(body.zoneId)`.
- Pass an options object to `simulateExploration` when prospecting is active.
- Ignore prospecting during tutorial exploration.

The prospecting simulation assertion must check the exact multipliers:

```ts
expect(mockSimulateExploration).toHaveBeenCalledWith(
  500,
  expect.anything(),
  expect.objectContaining({
    spawnRateMultiplier: 1,
    encounterSiteRateMultiplier: 1 / 3,
    resourceNodeRateMultiplier: 3,
    hiddenCacheChanceOverride: null,
  }),
);
```

The invalid-resource assertion must expect:

```ts
expect(res.status).toBe(400);
expect(res.body.error.code).toBe('INVALID_PROSPECTING_RESOURCE');
```

- [ ] **Step 2: Run the focused route test and confirm it fails**

```powershell
npm run test -w apps/api -- src/routes/exploration/start.tracking.test.ts
```

Expected output: FAIL because the request schema and route do not know `prospectingResourceNodeId`.

- [ ] **Step 3: Extend the start schema**

In `apps/api/src/services/exploration/helpers.ts`, replace the existing `startSchema` with:

```ts
export const startSchema = z.object({
  zoneId: z.string().uuid(),
  turns: z.number().int(),
  tier: z.number().int().min(1).optional(),
  trackingFamilyId: z.string().uuid().optional(),
  prospectingResourceNodeId: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.trackingFamilyId && value.prospectingResourceNodeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prospectingResourceNodeId'],
      message: 'Choose either mob tracking or resource prospecting.',
    });
  }
});
```

- [ ] **Step 4: Thread prospecting through `startRouteService`**

Update imports in `apps/api/src/services/exploration/startRouteService.ts`.

```ts
import {
  EXPLORATION_CONSTANTS,
  PREMIUM_CONSTANTS,
  getUnlockedTiers,
  getHighestUnlockedTier,
  type PotionConsumed,
  type QuestProgressUpdate,
  EXPLORATION_TRACKING_CONSTANTS,
  RESOURCE_PROSPECTING_CONSTANTS,
  TUTORIAL_STEP_EXPLORE,
  type SkillType,
} from '@pocketrealm/shared';
import { getMainHandAttackSkill, getSkillLevel } from '../../services/combatStatsService';
```

After tutorial detection, add:

```ts
const trackingFamilyId = isTutorialExplore ? null : body.trackingFamilyId ?? null;
const prospectingResourceNodeId = isTutorialExplore ? null : body.prospectingResourceNodeId ?? null;
let effectiveTrackingFamilyId = trackingFamilyId;
let prospectingSkillLevel: number | null = null;
```

After `resourceNodes` has loaded and before turn spending, validate the prospecting target:

```ts
const prospectingNode = prospectingResourceNodeId
  ? resourceNodes.find((node) => node.id === prospectingResourceNodeId)
  : null;

if (prospectingResourceNodeId && !prospectingNode) {
  throw new AppError(
    400,
    'That resource cannot be prospected in this zone.',
    'INVALID_PROSPECTING_RESOURCE',
  );
}

if (prospectingNode) {
  prospectingSkillLevel = await getSkillLevel(playerId, prospectingNode.skillRequired as SkillType);
}
```

Keep selected tier behavior tied only to mob tracking:

```ts
const selectedTier = trackingFamilyId ? maxUnlockedTier : (body.tier ?? maxUnlockedTier);
```

Replace the simulation call with explicit rate options:

```ts
const explorationRateOptions = {
  spawnRateMultiplier,
  encounterSiteRateMultiplier: prospectingResourceNodeId
    ? RESOURCE_PROSPECTING_CONSTANTS.ENCOUNTER_SITE_RATE_MULTIPLIER
    : 1,
  resourceNodeRateMultiplier: prospectingResourceNodeId
    ? RESOURCE_PROSPECTING_CONSTANTS.RESOURCE_NODE_RATE_MULTIPLIER
    : 1,
  hiddenCacheChanceOverride: hiddenCacheChance,
};

const outcomes = isTutorialExplore
  ? [{ turnOccurred: 50, type: 'ambush' as const }]
  : simulateExploration(effectiveTurns, effectiveExitChance, explorationRateOptions);
```

Add these fields to the `processExplorationOutcomes` context:

```ts
prospectingResourceNodeId,
prospectingSkillLevel,
```

- [ ] **Step 5: Re-run focused route tests**

```powershell
npm run test -w apps/api -- src/routes/exploration/start.tracking.test.ts
```

Expected output: PASS for `start.tracking.test.ts`.

- [ ] **Step 6: Commit Task 3**

```powershell
git status --short
git add apps/api/src/services/exploration/helpers.ts apps/api/src/services/exploration/startRouteService.ts apps/api/src/routes/exploration/start.tracking.test.ts
git commit -m "feat: accept resource prospecting exploration requests"
```

Expected output: a commit hash and a clean status for staged files.

---

### Task 4: Resource Outcome Bias

**Files:**
- Modify: `apps/api/src/services/explorationOutcome/types.ts`
- Modify: `apps/api/src/services/explorationOutcomeService.ts`
- Modify: `apps/api/src/routes/exploration/start.tracking.test.ts`

- [ ] **Step 1: Add failing outcome coverage**

Add route or service-level coverage that forces resource-node outcomes and proves the selected target is favored:

- Three resource nodes at-level produce request-local weights `0.5 / 0.25 / 0.25`.
- Three resource nodes at +10 levels produce `0.8 / 0.1 / 0.1`.
- Two resource nodes at-level produce `0.65 / 0.35`.
- One resource node always produces that node.

For route-level coverage, mock `simulateExploration` to return only:

```ts
[{ turnOccurred: 10, type: 'resource_node' }]
```

Mock `Math.random` so the selected share is exercised deterministically. Restore `Math.random` in `afterEach`.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npm run test -w apps/api -- src/routes/exploration/start.tracking.test.ts src/services/resourceProspectingService.test.ts
```

Expected output: FAIL because outcome processing does not use prospecting fields yet.

- [ ] **Step 3: Extend outcome context types**

In `apps/api/src/services/explorationOutcome/types.ts`, add these fields to `ExplorationOutcomeContext`:

```ts
prospectingResourceNodeId: string | null;
prospectingSkillLevel: number | null;
```

Extend `resourceNodes` with resource requirements:

```ts
resourceNodes: Array<{
  id: string;
  discoveryWeight: number;
  resourceType: string;
  skillRequired: string;
  levelRequired: number;
  minCapacity: number;
  maxCapacity: number;
}>;
```

- [ ] **Step 4: Apply prospecting bias in outcome processing**

Import the helper in `apps/api/src/services/explorationOutcomeService.ts`.

```ts
import { applyProspectingResourceWeightBias } from './resourceProspectingService';
```

Include `prospectingResourceNodeId` and `prospectingSkillLevel` in the context destructuring.

```ts
const {
  playerId,
  username,
  zoneId,
  zone,
  hpState,
  combatPrep,
  mobTemplates,
  zoneFamilies,
  zoneTiers,
  selectedTier,
  explorationProgress,
  spawnMods,
  trackingFamilyId,
  prospectingResourceNodeId,
  prospectingSkillLevel,
  cachedZoneEvents,
  cachedWorldEvents,
  resourceNodes,
  thresholdByToId,
} = ctx;
```

Replace the resource-node selection with request-local weighted nodes.

```ts
const weightedResourceNodes = prospectingResourceNodeId
  ? applyProspectingResourceWeightBias(
      resourceNodes,
      prospectingResourceNodeId,
      prospectingSkillLevel ?? 1,
    )
  : resourceNodes;
const nodeTemplate = pickWeighted(weightedResourceNodes, 'discoveryWeight') as typeof resourceNodes[number] | null;
```

Do not mutate `resourceNodes` before passing it to the helper. The helper returns new node objects with request-local weights.

- [ ] **Step 5: Re-run focused API tests**

```powershell
npm run test -w apps/api -- src/routes/exploration/start.tracking.test.ts src/services/resourceProspectingService.test.ts
```

Expected output: PASS for prospecting route and service coverage.

- [ ] **Step 6: Commit Task 4**

```powershell
git status --short
git add apps/api/src/services/explorationOutcome/types.ts apps/api/src/services/explorationOutcomeService.ts apps/api/src/routes/exploration/start.tracking.test.ts apps/api/src/services/resourceProspectingService.test.ts
git commit -m "feat: bias resource node outcomes while prospecting"
```

Expected output: a commit hash and a clean status for staged files.

---

### Task 5: Web API And Controller Threading

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/hooks/useGameBootstrap.ts`
- Modify: `apps/web/src/app/game/hooks/useExplorationActions.ts`
- Modify: `apps/web/src/app/game/hooks/useExplorationActions.test.ts`

- [ ] **Step 1: Add failing hook coverage**

In `apps/web/src/app/game/hooks/useExplorationActions.test.ts`, add a case that calls:

```ts
await result.current.handleStartExploration(500, 2, undefined, 'node-copper');
```

Assert the API call:

```ts
expect(mockStartExploration).toHaveBeenCalledWith(
  'zone-forest',
  500,
  2,
  undefined,
  'node-copper',
);
```

- [ ] **Step 2: Run the hook test and confirm it fails**

```powershell
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts
```

Expected output: FAIL because the hook signature has no prospecting argument.

- [ ] **Step 3: Extend API types and request body**

In `apps/web/src/lib/api/combat.ts`, add:

```ts
export interface ProspectableResourceNodeResponse {
  resourceNodeId: string;
  resourceType: string;
  skillRequired: string;
  levelRequired: number;
}
```

Add the field to the zone response type:

```ts
prospectableResourceNodes?: ProspectableResourceNodeResponse[];
```

Change `startExploration` to accept and send the prospecting target:

```ts
export async function startExploration(
  zoneId: string,
  turns: number,
  tier?: number,
  trackingFamilyId?: string,
  prospectingResourceNodeId?: string,
) {
```

```ts
body: JSON.stringify({
  zoneId,
  turns,
  ...(tier !== undefined && { tier }),
  ...(trackingFamilyId && { trackingFamilyId }),
  ...(prospectingResourceNodeId && { prospectingResourceNodeId }),
}),
```

- [ ] **Step 4: Extend zone state typing**

Add this field beside `trackableMobFamilies` in `apps/web/src/app/game/useGameController.ts` and `apps/web/src/app/game/hooks/useGameBootstrap.ts`.

```ts
prospectableResourceNodes?: Array<{
  resourceNodeId: string;
  resourceType: string;
  skillRequired: string;
  levelRequired: number;
}>;
```

- [ ] **Step 5: Thread the argument through the hook**

In `apps/web/src/app/game/hooks/useExplorationActions.ts`, change the handler signature:

```ts
const handleStartExploration = async (
  turnSpend: number,
  tier?: number,
  trackingFamilyId?: string,
  prospectingResourceNodeId?: string,
) => {
```

Change the API call:

```ts
const res = await startExploration(
  currentZone.id,
  turnSpend,
  tier,
  trackingFamilyId,
  prospectingResourceNodeId,
);
```

- [ ] **Step 6: Re-run the hook test**

```powershell
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts
```

Expected output: PASS for `useExplorationActions.test.ts`.

- [ ] **Step 7: Commit Task 5**

```powershell
git status --short
git add apps/web/src/lib/api/combat.ts apps/web/src/app/game/useGameController.ts apps/web/src/app/game/hooks/useGameBootstrap.ts apps/web/src/app/game/hooks/useExplorationActions.ts apps/web/src/app/game/hooks/useExplorationActions.test.ts
git commit -m "feat: thread resource prospecting through web state"
```

Expected output: a commit hash and a clean status for staged files.

---

### Task 6: Exploration UI Focus Mode

**Files:**
- Modify: `apps/web/src/app/game/renderers/coreScreenRenderers.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/components/screens/Exploration.test.ts`

- [ ] **Step 1: Add failing UI tests**

In `apps/web/src/components/screens/Exploration.test.ts`, add coverage for:

- Rendering the focus selector with `None`, `Track`, and `Prospect`.
- Selecting prospecting renders current-zone resource nodes.
- Starting while prospecting calls `onStartExploration(turns, tier, undefined, resourceNodeId)`.
- Selecting tracking clears active prospecting and calls `onStartExploration(turns, tier, trackingFamilyId, undefined)`.
- The expected preview keeps ambushes unchanged and changes sites/resources when prospecting is selected.
- Above-level resources remain selectable and render a gathering-locked warning.

Use `prospectableResourceNodes` test data:

```ts
[
  { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
  { resourceNodeId: 'node-iron', resourceType: 'iron_ore', skillRequired: 'mining', levelRequired: 5 },
]
```

Use `skills` test data:

```ts
[
  { skillType: 'mining', level: 1 },
  { skillType: 'woodcutting', level: 1 },
  { skillType: 'foraging', level: 1 },
]
```

- [ ] **Step 2: Run the UI test and confirm it fails**

```powershell
npm run test -w apps/web -- src/components/screens/Exploration.test.ts
```

Expected output: FAIL because `Exploration` has only the tracking toggle.

- [ ] **Step 3: Pass prospecting props from the game renderer**

In `apps/web/src/app/game/renderers/coreScreenRenderers.tsx`, pass the new props:

```tsx
prospectableResourceNodes={gc.currentZone?.prospectableResourceNodes ?? []}
skills={gc.skills}
```

- [ ] **Step 4: Extend `ExplorationProps`**

In `apps/web/src/components/screens/Exploration.tsx`, add a focus-mode type and props:

```ts
type ExplorationFocusMode = 'none' | 'tracking' | 'prospecting';

interface ProspectableResourceNodeOption {
  resourceNodeId: string;
  resourceType: string;
  skillRequired: string;
  levelRequired: number;
}
```

Add props:

```ts
prospectableResourceNodes?: ProspectableResourceNodeOption[];
skills?: Array<{ skillType: string; level: number }>;
onStartExploration: (
  turns: number,
  tier?: number,
  trackingFamilyId?: string,
  prospectingResourceNodeId?: string,
) => void;
```

Default the new props in the component parameters:

```ts
prospectableResourceNodes = [],
skills = [],
```

- [ ] **Step 5: Replace tracking toggle state with focus-mode state**

Replace:

```ts
const [trackingEnabled, setTrackingEnabled] = useState(false);
```

with:

```ts
const [focusMode, setFocusMode] = useState<ExplorationFocusMode>('none');
const [selectedProspectingResourceNodeId, setSelectedProspectingResourceNodeId] = useState<string | null>(null);
const trackingEnabled = focusMode === 'tracking';
const prospectingEnabled = focusMode === 'prospecting';
```

Add derived state:

```ts
const activeProspectingResourceNodeId = prospectingEnabled && selectedProspectingResourceNodeId
  && prospectableResourceNodes.some((node) => node.resourceNodeId === selectedProspectingResourceNodeId)
    ? selectedProspectingResourceNodeId
    : null;
```

Change the tier selector condition to hide only while tracking:

```tsx
{unlockedTiers.length > 1 && !tutorialLocked && focusMode !== 'tracking' && (
```

- [ ] **Step 6: Add prospecting auto-selection and cleanup effects**

Add an effect for resource target selection:

```ts
useEffect(() => {
  if (tutorialLocked || prospectableResourceNodes.length === 0) {
    if (focusMode === 'prospecting') setFocusMode('none');
    setSelectedProspectingResourceNodeId(null);
    return;
  }

  setSelectedProspectingResourceNodeId((prev) =>
    prev && prospectableResourceNodes.some((node) => node.resourceNodeId === prev)
      ? prev
      : prospectableResourceNodes[0]!.resourceNodeId,
  );
}, [focusMode, prospectableResourceNodes, tutorialLocked]);
```

Update the existing tracking effect so it uses `focusMode === 'tracking'` and clears tracking when tracking becomes unavailable:

```ts
if (tutorialLocked || trackableMobFamilies.length === 0 || availableTrackingFamilies.length === 0) {
  if (focusMode === 'tracking') setFocusMode('none');
  setSelectedTrackingFamilyId(null);
  return;
}
```

- [ ] **Step 7: Update expected-results math**

Import `RESOURCE_PROSPECTING_CONSTANTS`.

```ts
import {
  EXPLORATION_CONSTANTS,
  EXPLORATION_TRACKING_CONSTANTS,
  HP_CONSTANTS,
  RESOURCE_PROSPECTING_CONSTANTS,
  getUnlockedTiers,
  getTierName,
} from '@pocketrealm/shared';
```

Change probability math:

```ts
const trackedResultRateMultiplier = activeTrackingFamilyId
  ? EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER
  : 1;
const prospectingSiteMultiplier = activeProspectingResourceNodeId
  ? RESOURCE_PROSPECTING_CONSTANTS.ENCOUNTER_SITE_RATE_MULTIPLIER
  : 1;
const prospectingResourceMultiplier = activeProspectingResourceNodeId
  ? RESOURCE_PROSPECTING_CONSTANTS.RESOURCE_NODE_RATE_MULTIPLIER
  : 1;
const expectedAmbushes = turns * EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * trackedResultRateMultiplier;
const expectedSites = turns
  * EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN
  * trackedResultRateMultiplier
  * prospectingSiteMultiplier;
const expectedResources = turns
  * EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE
  * prospectingResourceMultiplier;
```

- [ ] **Step 8: Add the focus selector UI**

Replace the tracking card with one `PixelCard` titled `Exploration Focus`. Use three buttons with `aria-pressed`:

```tsx
<div className="grid grid-cols-3 gap-2" role="group" aria-label="Exploration focus">
  <button type="button" aria-pressed={focusMode === 'none'} onClick={() => setFocusMode('none')}>
    None
  </button>
  <button
    type="button"
    aria-pressed={focusMode === 'tracking'}
    disabled={availableTrackingFamilies.length === 0}
    onClick={() => setFocusMode('tracking')}
  >
    Track
  </button>
  <button
    type="button"
    aria-pressed={focusMode === 'prospecting'}
    disabled={prospectableResourceNodes.length === 0}
    onClick={() => setFocusMode('prospecting')}
  >
    Prospect
  </button>
</div>
```

Apply the same selected/unselected button classes currently used by tier and family buttons. Keep the existing tracking info tooltip text under tracking mode. Under prospecting mode, render resource buttons with resource type, skill, and level requirement. Compute skill level from `skills`:

```ts
const skillLevelByType = new Map(skills.map((skill) => [skill.skillType, skill.level]));
```

For each resource:

```tsx
const skillLevel = skillLevelByType.get(node.skillRequired) ?? 1;
const isGatheringLocked = skillLevel < node.levelRequired;
```

Render a warning line only when locked:

```tsx
{isGatheringLocked ? (
  <span className="text-[10px] text-[var(--rpg-red)]">
    Gathering locked until {node.skillRequired} {node.levelRequired}
  </span>
) : null}
```

- [ ] **Step 9: Send the selected focus target**

Update `startExplorationRun`:

```ts
onStartExploration(
  turnInvestment[0],
  activeTrackingFamilyId ? trackingSelectedTier ?? undefined : effectiveSelectedTier ?? undefined,
  activeTrackingFamilyId ?? undefined,
  activeProspectingResourceNodeId ?? undefined,
);
```

- [ ] **Step 10: Run focused UI tests**

```powershell
npm run test -w apps/web -- src/components/screens/Exploration.test.ts
```

Expected output: PASS for `Exploration.test.ts`.

- [ ] **Step 11: Commit Task 6**

```powershell
git status --short
git add apps/web/src/app/game/renderers/coreScreenRenderers.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/components/screens/Exploration.test.ts
git commit -m "feat: add resource prospecting focus UI"
```

Expected output: a commit hash and a clean status for staged files.

---

### Task 7: Integration Verification And Cleanup

**Files:**
- Review only files changed by Tasks 1 through 6.
- Modify touched files only when verification finds an issue or simplification removes real complexity.

- [ ] **Step 1: Run focused verification**

```powershell
npm run test -w packages/game-engine -- src/exploration/probabilityModel.test.ts
npm run test -w apps/api -- src/services/resourceProspectingService.test.ts src/routes/zones.tracking.test.ts src/routes/exploration/start.tracking.test.ts
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts src/components/screens/Exploration.test.ts
```

Expected output: PASS for every listed test file.

- [ ] **Step 2: Run typecheck**

```powershell
npm run typecheck
```

Expected output: PASS with no TypeScript errors.

- [ ] **Step 3: Run lint**

```powershell
npm run lint
```

Expected output: PASS with no lint errors.

- [ ] **Step 4: Use the required simplification pass**

Read and follow `C:\Users\ZuKii\.codex\skills\simplify\SKILL.md` because the project requires the global `$simplify` skill before final handoff after code changes. Limit the pass to touched files and preserve behavior. If edits are made, rerun the focused verification commands from Step 1 and rerun `npm run typecheck`.

- [ ] **Step 5: Inspect the final diff**

```powershell
git diff --stat
git diff --check
git status --short
```

Expected output:
- `git diff --check` prints no whitespace errors.
- `git status --short` shows only intentional modified files, or prints nothing after the final commit.

- [ ] **Step 6: Commit cleanup when needed**

If Step 4 or Step 5 changed files, commit the cleanup.

```powershell
git add packages/shared/src/constants/gameConstants.ts packages/shared/src/index.ts
git add packages/game-engine/src/exploration/probabilityModel.ts packages/game-engine/src/exploration/probabilityModel.test.ts
git add apps/api/src/services/resourceProspectingService.ts apps/api/src/services/resourceProspectingService.test.ts
git add apps/api/src/services/zoneRoutesService.ts apps/api/src/routes/zones.tracking.test.ts
git add apps/api/src/services/exploration/helpers.ts apps/api/src/services/exploration/startRouteService.ts apps/api/src/routes/exploration/start.tracking.test.ts
git add apps/api/src/services/explorationOutcome/types.ts apps/api/src/services/explorationOutcomeService.ts
git add apps/web/src/lib/api/combat.ts apps/web/src/app/game/useGameController.ts apps/web/src/app/game/hooks/useGameBootstrap.ts
git add apps/web/src/app/game/hooks/useExplorationActions.ts apps/web/src/app/game/hooks/useExplorationActions.test.ts
git add apps/web/src/app/game/renderers/coreScreenRenderers.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/components/screens/Exploration.test.ts
git commit -m "chore: clean up resource prospecting implementation"
```

Expected output: a commit hash.

- [ ] **Step 7: Final status**

```powershell
git status --short --branch
git log --oneline -5
```

Expected output: branch `codex/resource-prospecting-design` with a clean working tree and recent prospecting commits.

---

## Acceptance Criteria

- Exploration start accepts `prospectingResourceNodeId` and rejects requests that also include `trackingFamilyId`.
- Tutorial exploration ignores prospecting and keeps the scripted ambush result.
- Prospecting leaves ambush rate unchanged, reduces encounter-site rate from `0.0015` to `0.0005`, and increases resource-node rate from `0.0005` to `0.0015`.
- World-event spawn multipliers still affect ambushes and encounter sites.
- Resource-node prospecting target bias uses:
  - Three or more nodes: at-level `50 / rest`, capped at `80 / rest`.
  - Two nodes: at-level `65 / 35`, capped at `85 / 15`.
  - One node: `100`.
- Above-level resource nodes can be prospected but still depend on existing gathering level gates when gathered.
- Discovered wild zones include `prospectableResourceNodes`.
- Exploration UI has one focus mode active at a time: none, mob tracking, or resource prospecting.
- Starting a prospecting run sends only `prospectingResourceNodeId`; starting a tracking run sends only `trackingFamilyId`.

## Notes For Implementers

- Do not start `npm run dev`, `npm run dev:web`, or `npm run dev:api` for this plan unless the user explicitly asks for a running server or browser verification.
- Keep all gameplay tuning in `packages/shared/src/constants/gameConstants.ts`.
- Do not mutate database `discoveryWeight` values. Prospecting weights are request-local.
- Keep API business logic in services. Route handlers should remain request/response orchestration.
- Use `apply_patch` for manual edits.
