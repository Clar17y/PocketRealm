# Mob Family Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tracking option inside Exploration that biases exploration toward one previously discovered mob family in the current zone without bypassing tier unlocks.

**Architecture:** Keep tracking inside the existing exploration flow. Add one API service for discovery-gate lookup and tracked-family weight bias, expose trackable families on the zones payload so the Exploration screen can render them without extra fetches, then thread an optional `trackingFamilyId` through the exploration route so ambushes and encounter sites use the same moderate-strength bias while non-combat exploration outcomes remain available.

**Tech Stack:** Next.js 16, React 18, Express 4, Prisma 6, Zod, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-14-mob-family-tracking-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/constants/gameConstants.ts` | Tracking balance constants |
| `packages/shared/src/index.ts` | Export tracking constants |
| `apps/api/src/services/explorationTrackingService.ts` | Trackable-family lookup and generic tracked-family weight bias helper |
| `apps/api/src/services/explorationTrackingService.test.ts` | Unit tests for the service |
| `apps/api/src/routes/zones.ts` | Add `trackableMobFamilies` to discovered wild zones |
| `apps/api/src/routes/zones.tracking.test.ts` | Zones payload test |
| `apps/api/src/routes/exploration/helpers.ts` | Add `trackingFamilyId` to the request schema |
| `apps/api/src/routes/exploration/start.ts` | Validate tracking and apply result-rate penalty |
| `apps/api/src/routes/exploration/start.tracking.test.ts` | Route contract tests |
| `apps/api/src/services/explorationOutcomeService.ts` | Bias ambushes and encounter-site families toward tracked family |
| `apps/web/src/lib/api/combat.ts` | Extend `getZones()` and `startExploration()` payload types |
| `apps/web/src/app/game/useGameController.ts` | Keep `trackableMobFamilies` on zone state |
| `apps/web/src/app/game/GameScreenRenderer.tsx` | Pass trackable families into `Exploration` |
| `apps/web/src/app/game/hooks/useExplorationActions.ts` | Pass `trackingFamilyId` into API call |
| `apps/web/src/app/game/hooks/useExplorationActions.test.ts` | Hook test for request arguments |
| `apps/web/src/components/screens/Exploration.tsx` | Tracking toggle + family picker |
| `apps/web/src/components/screens/Exploration.test.tsx` | UI tests for tracking states |

---

### Task 1: Shared Constants And Tracking Service

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/services/explorationTrackingService.ts`
- Create: `apps/api/src/services/explorationTrackingService.test.ts`

- [ ] **Step 1: Write the failing service test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { applyTrackedFamilyWeightBias, buildTrackableMobFamiliesByZone } from './explorationTrackingService';

describe('applyTrackedFamilyWeightBias', () => {
  it('boosts tracked candidates and suppresses non-tracked ones', () => {
    const result = applyTrackedFamilyWeightBias(
      [
        { mobFamilyId: 'family-spider', encounterWeight: 100 },
        { mobFamilyId: 'family-rat', encounterWeight: 100 },
      ],
      'family-spider',
      'encounterWeight',
    );

    expect(result).toEqual([
      { mobFamilyId: 'family-spider', encounterWeight: 400 },
      { mobFamilyId: 'family-rat', encounterWeight: 35 },
    ]);
  });
});

describe('buildTrackableMobFamiliesByZone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unique discovered families per zone', async () => {
    mockPrisma.playerBestiary.findMany.mockResolvedValue([
      { mobTemplateId: 'mob-spider-a' },
      { mobTemplateId: 'mob-spider-b' },
      { mobTemplateId: 'mob-rat-a' },
    ]);
    mockPrisma.mobFamilyMember.findMany.mockResolvedValue([
      { mobFamilyId: 'family-spider', mobTemplate: { zoneId: 'zone-forest' }, mobFamily: { name: 'Spiders' } },
      { mobFamilyId: 'family-spider', mobTemplate: { zoneId: 'zone-forest' }, mobFamily: { name: 'Spiders' } },
      { mobFamilyId: 'family-rat', mobTemplate: { zoneId: 'zone-forest' }, mobFamily: { name: 'Rats' } },
    ]);

    const result = await buildTrackableMobFamiliesByZone('player-1', ['zone-forest']);

    expect(result.get('zone-forest')).toEqual([
      { mobFamilyId: 'family-rat', name: 'Rats' },
      { mobFamilyId: 'family-spider', name: 'Spiders' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```powershell
npm run test -w apps/api -- src/services/explorationTrackingService.test.ts
```

Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Add the balance constants**

```ts
export const EXPLORATION_TRACKING_CONSTANTS = {
  RESULT_RATE_MULTIPLIER: 0.75,
  TRACKED_FAMILY_WEIGHT_MULTIPLIER: 4,
  NON_TRACKED_WEIGHT_MULTIPLIER: 0.35,
} as const;
```

Export them from `packages/shared/src/index.ts`:

```ts
export { EXPLORATION_TRACKING_CONSTANTS } from './constants/gameConstants';
```

- [ ] **Step 4: Implement the service**

```ts
import { prisma } from '@pocketrealm/database';
import { EXPLORATION_TRACKING_CONSTANTS } from '@pocketrealm/shared';

export interface TrackableMobFamily {
  mobFamilyId: string;
  name: string;
}

type WeightedFamilyRecord = { mobFamilyId: string; [key: string]: string | number | null | undefined };

export function applyTrackedFamilyWeightBias<T extends WeightedFamilyRecord>(
  items: T[],
  trackedFamilyId: string | null | undefined,
  weightKey: keyof T & string,
): T[] {
  if (!trackedFamilyId) return items;
  if (!items.some((item) => item.mobFamilyId === trackedFamilyId)) return items;

  return items.map((item) => ({
    ...item,
    [weightKey]: Number(item[weightKey] ?? 0) * (
      item.mobFamilyId === trackedFamilyId
        ? EXPLORATION_TRACKING_CONSTANTS.TRACKED_FAMILY_WEIGHT_MULTIPLIER
        : EXPLORATION_TRACKING_CONSTANTS.NON_TRACKED_WEIGHT_MULTIPLIER
    ),
  }));
}

export async function buildTrackableMobFamiliesByZone(playerId: string, zoneIds: string[]) {
  if (zoneIds.length === 0) return new Map<string, TrackableMobFamily[]>();

  const kills = await prisma.playerBestiary.findMany({
    where: { playerId, kills: { gt: 0 } },
    select: { mobTemplateId: true },
  });
  if (kills.length === 0) return new Map<string, TrackableMobFamily[]>();

  const members = await prisma.mobFamilyMember.findMany({
    where: {
      mobTemplateId: { in: kills.map((entry) => entry.mobTemplateId) },
      mobTemplate: { zoneId: { in: zoneIds } },
    },
    select: {
      mobFamilyId: true,
      mobTemplate: { select: { zoneId: true } },
      mobFamily: { select: { name: true } },
    },
  });

  const byZone = new Map<string, Map<string, TrackableMobFamily>>();
  for (const member of members) {
    const zoneFamilies = byZone.get(member.mobTemplate.zoneId) ?? new Map<string, TrackableMobFamily>();
    zoneFamilies.set(member.mobFamilyId, { mobFamilyId: member.mobFamilyId, name: member.mobFamily.name });
    byZone.set(member.mobTemplate.zoneId, zoneFamilies);
  }

  return new Map(
    [...byZone.entries()].map(([zoneId, families]) => [
      zoneId,
      [...families.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ]),
  );
}
```

- [ ] **Step 5: Re-run the service test**

```powershell
npm run test -w apps/api -- src/services/explorationTrackingService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/shared/src/constants/gameConstants.ts packages/shared/src/index.ts apps/api/src/services/explorationTrackingService.ts apps/api/src/services/explorationTrackingService.test.ts
git commit -m "feat: add exploration tracking service and constants"
```

---

### Task 2: API Contract And Outcome Wiring

**Files:**
- Create: `apps/api/src/routes/zones.tracking.test.ts`
- Modify: `apps/api/src/routes/zones.ts`
- Modify: `apps/api/src/routes/exploration/helpers.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Create: `apps/api/src/routes/exploration/start.tracking.test.ts`
- Modify: `apps/api/src/services/explorationOutcomeService.ts`

- [ ] **Step 1: Write the failing API tests**

```ts
// apps/api/src/routes/zones.tracking.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/explorationTrackingService', () => ({
  buildTrackableMobFamiliesByZone: vi.fn().mockResolvedValue(new Map([
    ['zone-forest', [{ mobFamilyId: 'family-spider', name: 'Spiders' }]],
  ])),
}));

import { zonesRouter } from './zones';

function findHandler() {
  const layer = (zonesRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route?.methods.get);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

it('adds trackableMobFamilies to discovered wild zones', async () => {
  const req = { player: { playerId: 'player-1' } } as any;
  const json = vi.fn();
  const res = { set: vi.fn(), json } as any;

  await findHandler()(req, res);

  expect(json).toHaveBeenCalledWith(expect.objectContaining({
    zones: expect.arrayContaining([
      expect.objectContaining({ trackableMobFamilies: [{ mobFamilyId: 'family-spider', name: 'Spiders' }] }),
    ]),
  }));
});
```

```ts
// apps/api/src/routes/exploration/start.tracking.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/explorationTrackingService', () => ({
  buildTrackableMobFamiliesByZone: vi.fn(),
}));

import { buildTrackableMobFamiliesByZone } from '../../services/explorationTrackingService';
import { startRouter } from './start';

const mockBuildTrackableMobFamiliesByZone = buildTrackableMobFamiliesByZone as ReturnType<typeof vi.fn>;

function findHandler() {
  const layer = (startRouter as any).stack.find((l: any) => l.route?.path === '/start' && l.route?.methods.post);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('POST /exploration/start tracking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects undiscovered tracking families', async () => {
    mockBuildTrackableMobFamiliesByZone.mockResolvedValue(new Map([
      ['zone-forest', [{ mobFamilyId: 'family-rat', name: 'Rats' }]],
    ]));

    const req = { player: { playerId: 'player-1', username: 'Hero' }, body: { zoneId: 'zone-forest', turns: 100, trackingFamilyId: 'family-spider' } } as any;
    await expect(findHandler()(req, {} as any)).rejects.toMatchObject({ code: 'INVALID_TRACKING_FAMILY' });
  });
});
```

- [ ] **Step 2: Run the API tests and confirm failure**

```powershell
npm run test -w apps/api -- src/routes/zones.tracking.test.ts src/routes/exploration/start.tracking.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend the zones payload and request schema**

In `apps/api/src/routes/zones.ts`:

```ts
import { buildTrackableMobFamiliesByZone } from '../services/explorationTrackingService';

const discoveredWildZoneIds = zones
  .filter((zone) => discoveredZoneIds.has(zone.id) && zone.zoneType !== 'town')
  .map((zone) => zone.id);

const trackableFamiliesByZone = await buildTrackableMobFamiliesByZone(playerId, discoveredWildZoneIds);
```

```ts
trackableMobFamilies: discovered && z.zoneType !== 'town'
  ? (trackableFamiliesByZone.get(z.id) ?? [])
  : [],
```

In `apps/api/src/routes/exploration/helpers.ts`:

```ts
export const startSchema = z.object({
  zoneId: z.string().uuid(),
  turns: z.number().int(),
  tier: z.number().int().min(1).optional(),
  trackingFamilyId: z.string().uuid().optional(),
});
```

- [ ] **Step 4: Validate tracking and bias outcome selection**

In `apps/api/src/routes/exploration/start.ts`:

```ts
import { EXPLORATION_TRACKING_CONSTANTS } from '@pocketrealm/shared';
import { buildTrackableMobFamiliesByZone } from '../../services/explorationTrackingService';

let trackingFamilyId: string | null = null;
if (body.trackingFamilyId) {
  const trackableFamiliesByZone = await buildTrackableMobFamiliesByZone(playerId, [body.zoneId]);
  const trackableFamilies = trackableFamiliesByZone.get(body.zoneId) ?? [];
  if (!trackableFamilies.some((family) => family.mobFamilyId === body.trackingFamilyId)) {
    throw new AppError(400, 'That mob family is not unlocked for tracking in this zone.', 'INVALID_TRACKING_FAMILY');
  }
  trackingFamilyId = body.trackingFamilyId;
}
```

```ts
if (trackingFamilyId) {
  spawnRateMultiplier *= EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER;
}
```

Pass `trackingFamilyId` into `processExplorationOutcomes(...)`.

In `apps/api/src/services/explorationOutcomeService.ts`:

```ts
import { applyTrackedFamilyWeightBias } from './explorationTrackingService';
```

```ts
const trackedCandidates = applyTrackedFamilyWeightBias(
  weightedCandidates.map((candidate) => ({
    ...candidate,
    mobFamilyId: ctx.mobToFamilyMap.get((candidate as { id: string }).id) ?? '',
  })),
  ctx.trackingFamilyId,
  'encounterWeight',
);
```

```ts
const trackedFamilies = applyTrackedFamilyWeightBias(
  adjustedFamilies,
  ctx.trackingFamilyId,
  'discoveryWeight',
);
```

- [ ] **Step 5: Re-run the API tests**

```powershell
npm run test -w apps/api -- src/services/explorationTrackingService.test.ts src/routes/zones.tracking.test.ts src/routes/exploration/start.tracking.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/routes/zones.ts apps/api/src/routes/zones.tracking.test.ts apps/api/src/routes/exploration/helpers.ts apps/api/src/routes/exploration/start.ts apps/api/src/routes/exploration/start.tracking.test.ts apps/api/src/services/explorationOutcomeService.ts
git commit -m "feat: add tracking-aware exploration api flow"
```

---

### Task 3: Web Request Plumbing And Exploration UI

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/GameScreenRenderer.tsx`
- Modify: `apps/web/src/app/game/hooks/useExplorationActions.ts`
- Create: `apps/web/src/app/game/hooks/useExplorationActions.test.ts`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Create: `apps/web/src/components/screens/Exploration.test.tsx`

- [ ] **Step 1: Write the failing web tests**

```ts
// apps/web/src/app/game/hooks/useExplorationActions.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useExplorationActions } from './useExplorationActions';

const apiMock = vi.hoisted(() => ({ startExploration: vi.fn().mockResolvedValue({ data: null }) }));
vi.mock('@/lib/api', () => apiMock);

it('passes trackingFamilyId into the exploration api helper', async () => {
  const hook = renderHook(() => useExplorationActions({
    hpStateRef: { current: { currentHp: 100, maxHp: 100 } } as never,
    currentZone: { id: 'zone-forest', name: 'Forest Edge' },
    runAction: async (_name, fn) => { await fn(); },
    pushLog: vi.fn(),
    setTurns: vi.fn(),
    setActionError: vi.fn(),
    setPlaybackActive: vi.fn(),
    stateSetters: {} as never,
    advanceTutorial: vi.fn(),
    combatLogPrefetchClear: vi.fn(),
    refreshPendingEncounters: vi.fn().mockResolvedValue(undefined),
    loadGatheringNodes: vi.fn().mockResolvedValue(undefined),
    pendingLootQueueRef: { current: [] },
    activatePendingLoot: vi.fn().mockResolvedValue(undefined),
    updateZoneExploration: vi.fn(),
    updateQuestProgress: vi.fn(),
  }));

  await act(async () => {
    await hook.result.current.handleStartExploration(500, 2, 'family-spider');
  });

  expect(apiMock.startExploration).toHaveBeenCalledWith('zone-forest', 500, 2, 'family-spider');
});
```

```tsx
// apps/web/src/components/screens/Exploration.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Exploration } from './Exploration';

it('shows the unlock message when no families are trackable', () => {
  render(
    <Exploration
      currentZone={{ name: 'Forest Edge', description: 'Trees', minLevel: 1 }}
      explorationProgress={{ turnsExplored: 7500, turnsToExplore: 30000, percent: 25, tiers: { '1': 0, '2': 25, '3': 50, '4': 75 } }}
      trackableMobFamilies={[]}
      availableTurns={1000}
      onStartExploration={vi.fn()}
      activityLog={[]}
    />,
  );

  expect(screen.getByText('Discover a mob family in this zone before you can track it.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the web tests and confirm failure**

```powershell
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts src/components/screens/Exploration.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Extend the client contract**

In `apps/web/src/lib/api/combat.ts`:

```ts
export async function startExploration(
  zoneId: string,
  turns: number,
  tier?: number,
  trackingFamilyId?: string,
) {
  return fetchApi<{
    logId: string;
    zone: { id: string; name: string; difficulty: number };
    turns: TurnStateResponse;
    aborted: boolean;
    refundedTurns: number;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    encounterSites: Array<{ turnOccurred: number; encounterSiteId: string; mobFamilyId: string; siteName: string; size: 'small' | 'medium' | 'large'; totalMobs: number; discoveredAt: string }>;
    resourceDiscoveries: Array<{ turnOccurred: number; playerNodeId: string; resourceNodeId: string; resourceType: string; capacity: number; sizeName: string }>;
    hiddenCaches: Array<{ turnOccurred: number; loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>; soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null }>;
    zoneExitDiscovered: boolean;
    explorationProgress: { turnsExplored: number; percent: number; turnsToExplore: number | null };
    pendingLootSessionIds?: string[];
    tax: TaxInfo | null;
    questProgress?: QuestProgressUpdate[];
    stateUpdates?: StateUpdates;
  }>('/api/v1/exploration/start', {
    method: 'POST',
    body: JSON.stringify({ zoneId, turns, ...(tier !== undefined && { tier }), ...(trackingFamilyId && { trackingFamilyId }) }),
  });
}
```

Also extend `getZones()` and `useGameController.ts` zone state with:

```ts
trackableMobFamilies: Array<{ mobFamilyId: string; name: string }>;
```

- [ ] **Step 4: Thread tracking into the hook and UI**

In `apps/web/src/app/game/hooks/useExplorationActions.ts`:

```ts
const handleStartExploration = async (turnSpend: number, tier?: number, trackingFamilyId?: string) => {
  if (!currentZone) return;

  await runAction('exploration', async () => {
    const hpBefore = hpStateRef.current.currentHp;
    const maxHpBefore = hpStateRef.current.maxHp;
    const res = await startExploration(currentZone.id, turnSpend, tier, trackingFamilyId);
    if (!res.data) {
      setActionError(res.error?.message ?? 'Exploration failed');
      return;
    }
    setTurns(res.data.turns.currentTurns);
    updateQuestProgress(res.data.questProgress);
    recordTurnsSpent(currentZone.id, turnSpend);
    updateZoneExploration(currentZone.id, res.data.explorationProgress);
  });
};
```

In `apps/web/src/components/screens/Exploration.tsx`:

```tsx
const [trackingEnabled, setTrackingEnabled] = useState(false);
const [selectedTrackingFamilyId, setSelectedTrackingFamilyId] = useState<string | null>(null);
```

```tsx
{trackableMobFamilies.length === 0 ? (
  <p className="text-xs text-[var(--rpg-text-secondary)]">
    Discover a mob family in this zone before you can track it.
  </p>
) : (
  <>
    <div className="flex gap-2">
      <button type="button" onClick={() => setTrackingEnabled(false)}>Tracking Off</button>
      <button
        type="button"
        onClick={() => {
          setTrackingEnabled(true);
          setSelectedTrackingFamilyId((prev) => prev ?? trackableMobFamilies[0]!.mobFamilyId);
        }}
      >
        Tracking On
      </button>
    </div>
    {trackingEnabled && (
      <div className="flex flex-wrap gap-2">
        {trackableMobFamilies.map((family) => (
          <button key={family.mobFamilyId} type="button" onClick={() => setSelectedTrackingFamilyId(family.mobFamilyId)}>
            {family.name}
          </button>
        ))}
      </div>
    )}
  </>
)}
```

Update the start button call:

```tsx
onStartExploration(
  turnInvestment[0],
  effectiveSelectedTier ?? undefined,
  trackingEnabled ? selectedTrackingFamilyId ?? undefined : undefined,
);
```

- [ ] **Step 5: Re-run the web tests**

```powershell
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts src/components/screens/Exploration.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/api/combat.ts apps/web/src/app/game/useGameController.ts apps/web/src/app/game/GameScreenRenderer.tsx apps/web/src/app/game/hooks/useExplorationActions.ts apps/web/src/app/game/hooks/useExplorationActions.test.ts apps/web/src/components/screens/Exploration.tsx apps/web/src/components/screens/Exploration.test.tsx
git commit -m "feat(web): add exploration tracking controls"
```

---

### Task 4: Focused Verification

**Files:**
- Modify: none unless a test or typecheck failure requires a small fix

- [ ] **Step 1: Run focused feature tests**

```powershell
npm run test -w apps/api -- src/services/explorationTrackingService.test.ts src/routes/zones.tracking.test.ts src/routes/exploration/start.tracking.test.ts
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts src/components/screens/Exploration.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run regression checks on touched behavior**

```powershell
npm run test -w apps/api -- src/routes/exploration/start.tutorial.test.ts
npm run test -w packages/game-engine -- src/exploration/mobTierFilter.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Simplify touched code only**

Review:

```powershell
git diff -- packages/shared/src/constants/gameConstants.ts packages/shared/src/index.ts apps/api/src/services/explorationTrackingService.ts apps/api/src/routes/zones.ts apps/api/src/routes/exploration/helpers.ts apps/api/src/routes/exploration/start.ts apps/api/src/services/explorationOutcomeService.ts apps/web/src/lib/api/combat.ts apps/web/src/app/game/useGameController.ts apps/web/src/app/game/GameScreenRenderer.tsx apps/web/src/app/game/hooks/useExplorationActions.ts apps/web/src/components/screens/Exploration.tsx
```

Allowed simplifications:

- remove duplicate UI conditionals if readability improves
- keep discovery lookup and weight bias centralized in `explorationTrackingService.ts`
- avoid new abstractions unless the touched diff already duplicates logic

- [ ] **Step 4: Re-run focused verification after simplification**

```powershell
npm run test -w apps/api -- src/services/explorationTrackingService.test.ts src/routes/zones.tracking.test.ts src/routes/exploration/start.tracking.test.ts src/routes/exploration/start.tutorial.test.ts
npm run test -w apps/web -- src/app/game/hooks/useExplorationActions.test.ts src/components/screens/Exploration.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Final commit**

```powershell
git add packages/shared/src/constants/gameConstants.ts packages/shared/src/index.ts apps/api/src/services/explorationTrackingService.ts apps/api/src/services/explorationTrackingService.test.ts apps/api/src/routes/zones.ts apps/api/src/routes/zones.tracking.test.ts apps/api/src/routes/exploration/helpers.ts apps/api/src/routes/exploration/start.ts apps/api/src/routes/exploration/start.tracking.test.ts apps/api/src/services/explorationOutcomeService.ts apps/web/src/lib/api/combat.ts apps/web/src/app/game/useGameController.ts apps/web/src/app/game/GameScreenRenderer.tsx apps/web/src/app/game/hooks/useExplorationActions.ts apps/web/src/app/game/hooks/useExplorationActions.test.ts apps/web/src/components/screens/Exploration.tsx apps/web/src/components/screens/Exploration.test.tsx
git commit -m "feat: add mob family tracking to exploration"
```
