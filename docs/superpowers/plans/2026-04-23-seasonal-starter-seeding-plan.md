# Seasonal Starter Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make starter discovery and starter encounter/resource seeding realm-aware so new seasonal characters always receive the correct starter content for their season, while keeping achievements and tutorial progression character-scoped.

**Architecture:** Fix the bug at the starter seeding layer, not in achievements or stats. `ensureStarterDiscoveries()` and `ensureStarterEncounterAndNodes()` should derive starter context from the player being seeded, so a seasonal player only receives seasonal starter zones, seasonal starter nodes, and a seasonal tutorial encounter site. `Pathfinder` should then correct itself automatically because `totalZonesDiscovered` already counts only the current `playerId`.

**Tech Stack:** Express, Prisma, Vitest, shared achievement definitions, seasonal auth flow

---

## File Map

**Modify:**
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.ts`
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.test.ts`

**Optional verification-only reads during execution:**
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/routes/auth.ts`
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/statsService.ts`
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/packages/shared/src/constants/achievementDefinitions.ts`

**Do not change for this task unless a failing test proves it necessary:**
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/achievementService.ts`
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/routes/player.ts`
- `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/statsService.ts`

Rationale:
- Achievements are already character-scoped via `playerId`.
- `Pathfinder` progress is already computed from `player_zone_discoveries` for the active `playerId`.
- The observed `4 / 5` symptom is caused by starter seeding discovering too many zones for one character, not by cross-player aggregation.

### Task 1: Lock Down The Broken Seasonal Seeding Behavior With Tests

**Files:**
- Modify: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.test.ts`
- Test: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.test.ts`

- [ ] **Step 1: Write the failing discovery regression test**

Add a test under `describe('ensureStarterDiscoveries', ...)` that proves a seasonal player only gets the seasonal starter town plus its directly connected starter wild zone, not all global starter zones.

```ts
it('discovers only the current player realm starter town and its connected zones', async () => {
  mockPrisma.player.findUnique.mockResolvedValue({
    id: 'season-player',
    seasonId: 'season-1',
    homeTownId: 'season-town',
    currentZoneId: 'season-forest',
  });
  mockPrisma.zoneConnection.findMany.mockResolvedValue([
    { toId: 'season-forest' },
  ]);
  mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 2 });

  await ensureStarterDiscoveries('season-player');

  expect(mockPrisma.playerZoneDiscovery.createMany).toHaveBeenCalledWith({
    data: [
      { playerId: 'season-player', zoneId: 'season-town' },
      { playerId: 'season-player', zoneId: 'season-forest' },
    ],
    skipDuplicates: true,
  });
});
```

- [ ] **Step 2: Write the failing encounter/node regression test**

Add a test under `describe('ensureStarterEncounterAndNodes', ...)` that proves the helper uses the player’s seasonal starter town and seasonal wild zone instead of the first global starter town.

```ts
it('seeds starter nodes and encounter sites from the player realm starter context', async () => {
  mockPrisma.player.findUnique.mockResolvedValue({
    id: 'season-player',
    seasonId: 'season-1',
    homeTownId: 'season-town',
    currentZoneId: 'season-forest',
  });
  mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'season-forest' }]);
  mockPrisma.zone.findUnique.mockResolvedValue({ id: 'season-forest', zoneType: 'wild' });
  mockPrisma.resourceNode.findFirst
    .mockResolvedValueOnce({ id: 'season-copper-node' })
    .mockResolvedValueOnce({ id: 'season-oak-node' });
  mockPrisma.playerResourceNode.findMany.mockResolvedValue([]);
  mockPrisma.playerResourceNode.createMany.mockResolvedValue({ count: 2 });
  mockPrisma.encounterSite.findFirst.mockResolvedValue(null);
  mockPrisma.zoneMobFamily.findFirst.mockResolvedValue({
    mobFamilyId: 'family-1',
    mobFamily: { name: 'Vermin', siteNounSmall: 'Nest' },
  });
  mockPrisma.mobTemplate.findFirst.mockResolvedValue({ id: 'season-field-mouse' });
  mockPrisma.encounterSite.create.mockResolvedValue({ id: 'site-1' });

  await ensureStarterEncounterAndNodes('season-player');

  expect(mockPrisma.resourceNode.findFirst).toHaveBeenNthCalledWith(1, {
    where: { zoneId: 'season-forest', resourceType: 'Copper Ore' },
    select: { id: true },
  });
  expect(mockPrisma.encounterSite.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        playerId: 'season-player',
        zoneId: 'season-forest',
      }),
    }),
  );
});
```

- [ ] **Step 3: Write the fallback regression test for older players**

Add a test that covers players missing `homeTownId`, so the refactor does not break legacy accounts. The helper should fall back to a realm starter lookup filtered by the player’s `seasonId`.

```ts
it('falls back to the realm starter town when homeTownId is missing', async () => {
  mockPrisma.player.findUnique.mockResolvedValue({
    id: 'season-player',
    seasonId: 'season-1',
    homeTownId: null,
    currentZoneId: 'season-forest',
  });
  mockPrisma.zone.findFirst.mockResolvedValue({ id: 'season-town' });
  mockPrisma.zoneConnection.findMany.mockResolvedValue([{ toId: 'season-forest' }]);
  mockPrisma.playerZoneDiscovery.createMany.mockResolvedValue({ count: 2 });

  await ensureStarterDiscoveries('season-player');

  expect(mockPrisma.zone.findFirst).toHaveBeenCalledWith({
    where: { isStarter: true, seasonId: 'season-1' },
    select: { id: true },
  });
});
```

- [ ] **Step 4: Run the focused service test file and verify it fails for the new cases**

Run:

```powershell
npm test -- -w apps/api src/services/zoneDiscoveryService.test.ts
```

Expected:

```text
FAIL
new seasonal starter seeding assertions fail because the service still uses global starter lookups
```

- [ ] **Step 5: Commit the red test snapshot**

```powershell
git add apps/api/src/services/zoneDiscoveryService.test.ts
git commit -m "test: cover seasonal starter seeding regressions"
```

### Task 2: Refactor Starter Seeding To Use The Player Realm

**Files:**
- Modify: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.ts`
- Test: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.test.ts`

- [ ] **Step 1: Add a small helper that resolves starter context for one player**

Inside `zoneDiscoveryService.ts`, add an internal helper that reads the player and resolves a single starter town for that player’s realm. Keep the API local to this file.

```ts
async function getPlayerStarterTownId(
  db: Prisma.TransactionClient | typeof prisma,
  playerId: string,
): Promise<string | null> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    select: {
      homeTownId: true,
      seasonId: true,
    },
  });

  if (!player) return null;
  if (player.homeTownId) return player.homeTownId;

  const starterTown = await db.zone.findFirst({
    where: {
      isStarter: true,
      seasonId: player.seasonId,
    },
    select: { id: true },
  });

  return starterTown?.id ?? null;
}
```

- [ ] **Step 2: Update `ensureStarterDiscoveries()` to use only that starter town**

Replace the global starter-zone lookup with the per-player helper and preserve the current “starter town plus directly connected zones” behavior.

```ts
export async function ensureStarterDiscoveries(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  const starterTownId = await getPlayerStarterTownId(db, playerId);
  if (!starterTownId) return;

  const connections = await db.zoneConnection.findMany({
    where: { fromId: starterTownId },
    select: { toId: true },
  });

  const allZoneIds = [...new Set([starterTownId, ...connections.map((c) => c.toId)])];

  await db.playerZoneDiscovery.createMany({
    data: allZoneIds.map((zoneId) => ({ playerId, zoneId })),
    skipDuplicates: true,
  });
}
```

- [ ] **Step 3: Update `ensureStarterEncounterAndNodes()` to use the same starter town**

Refactor the encounter/node helper to reuse the same starter town resolution, then locate the first connected wild zone from that starter town only.

```ts
const starterTownId = await getPlayerStarterTownId(db, playerId);
if (!starterTownId) return;

const connections = await db.zoneConnection.findMany({
  where: { fromId: starterTownId },
  select: { toId: true },
});
if (connections.length === 0) return;

const wildZone = await db.zone.findFirst({
  where: {
    id: { in: connections.map((c) => c.toId) },
    zoneType: 'wild',
  },
  select: { id: true },
});
if (!wildZone) return;
```

Do not add tutorial-state branching here. Always seed the starter encounter site and gathering nodes for a newly created player, regardless of whether the tutorial will later be skipped or completed.

- [ ] **Step 4: Keep the resource-node and encounter-site writes otherwise minimal**

Do not redesign the seeded content. Preserve:
- `Copper Ore`
- `Oak Log`
- a single `Field Mouse` encounter site

Only change realm selection, not the starter content recipe.

- [ ] **Step 5: Run the focused service test file and verify it passes**

Run:

```powershell
npm test -- -w apps/api src/services/zoneDiscoveryService.test.ts
```

Expected:

```text
PASS
seasonal starter discovery and seeding regressions now green
```

- [ ] **Step 6: Commit the realm-aware seeding fix**

```powershell
git add apps/api/src/services/zoneDiscoveryService.ts apps/api/src/services/zoneDiscoveryService.test.ts
git commit -m "fix: scope starter seeding to the player realm"
```

### Task 3: Verify The Pathfinder Symptom And Preserve Character-Scoped Achievements

**Files:**
- Modify: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.test.ts`
- Optional read-only verification: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/statsService.ts`
- Optional read-only verification: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/achievementService.ts`

- [ ] **Step 1: Add an explicit regression test comment/assertion for the Pathfinder symptom**

Extend the seasonal discovery test to assert the seeded discovery count is exactly `2` for a fresh seasonal player, which is the real guard against the reported `4 / 5` regression.

```ts
const seededZoneIds = mockPrisma.playerZoneDiscovery.createMany.mock.calls[0][0].data
  .map((entry: { zoneId: string }) => entry.zoneId);

expect(seededZoneIds).toHaveLength(2);
expect(seededZoneIds).toEqual(['season-town', 'season-forest']);
```

- [ ] **Step 2: Verify no stats or achievement code change is needed**

Read the current implementations and confirm in the task notes while executing:
- `resolveAllStats()` counts discoveries from `player_zone_discoveries WHERE player_id = ${playerId}`
- `PlayerAchievement` is keyed by `playerId`
- no account-scoped achievement carry-over exists today

No code change should be made in these files unless the focused tests uncover a contradiction.

- [ ] **Step 3: Run the targeted service tests again after the explicit regression assertion**

Run:

```powershell
npm test -- -w apps/api src/services/zoneDiscoveryService.test.ts
```

Expected:

```text
PASS
Pathfinder regression covered by exact starter discovery count
```

- [ ] **Step 4: Run the seasonal auth regression suite as a safety check**

Run:

```powershell
npm test -- -w apps/api src/routes/auth.seasons.test.ts
```

Expected:

```text
PASS
seasonal character creation flow still green after helper refactor
```

- [ ] **Step 5: Commit the regression safety net**

```powershell
git add apps/api/src/services/zoneDiscoveryService.test.ts
git commit -m "test: pin starter discovery count for seasonal characters"
```

### Task 4: Final Cleanup And Focused Verification

**Files:**
- Modify if needed: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.ts`
- Modify if needed: `D:/Code/Adventure/.worktrees/pocketrealm-feature_issue_152_seasonal_architecture/apps/api/src/services/zoneDiscoveryService.test.ts`

- [ ] **Step 1: Run the simplify pass on only the touched starter-seeding code**

Review only:
- `apps/api/src/services/zoneDiscoveryService.ts`
- `apps/api/src/services/zoneDiscoveryService.test.ts`

Look for:
- duplicated starter-town lookup logic
- unnecessary branching
- unclear helper naming
- repeated mock setup in the new tests that can be made clearer without broad refactoring

- [ ] **Step 2: Re-run the focused verification after any simplify edits**

Run:

```powershell
npm test -- -w apps/api src/services/zoneDiscoveryService.test.ts src/routes/auth.seasons.test.ts
```

Expected:

```text
PASS
all starter-seeding and seasonal auth regressions green
```

- [ ] **Step 3: Inspect the diff before handoff**

Run:

```powershell
git diff -- apps/api/src/services/zoneDiscoveryService.ts apps/api/src/services/zoneDiscoveryService.test.ts
```

Expected:

```text
Diff shows only realm-aware starter-context refactor and regression tests
```

- [ ] **Step 4: Commit the final cleaned implementation**

```powershell
git add apps/api/src/services/zoneDiscoveryService.ts apps/api/src/services/zoneDiscoveryService.test.ts
git commit -m "fix: seed seasonal starters from the correct realm"
```

## Self-Review

- Spec coverage:
  - realm-aware starter discoveries: covered in Task 1 and Task 2
  - realm-aware starter encounter site and gathering nodes: covered in Task 1 and Task 2
  - Pathfinder `4 / 5` symptom: covered in Task 3
  - preserve per-character achievements and tutorial rewards: covered by Task 3 verification and explicit no-change scope
- Placeholder scan:
  - no `TODO`, `TBD`, or “similar to previous task” placeholders remain
- Type consistency:
  - all plan steps refer to the existing service names `ensureStarterDiscoveries` and `ensureStarterEncounterAndNodes`
  - the proposed local helper is consistently named `getPlayerStarterTownId`

