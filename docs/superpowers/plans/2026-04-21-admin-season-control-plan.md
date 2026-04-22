# Admin Season Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game Admin `Seasons` tab that lets admins create, bootstrap, activate, end, evaluate, and merge seasons, with backend bootstrap support that clones permanent content into a playable seasonal realm.

**Architecture:** Keep the UI thin and place all season setup logic on the API side. Add one season bootstrap service plus one new admin endpoint, extend the existing season list response with a computed `isBootstrapped` flag, and wire a new `Seasons` tab into the existing `AdminScreen` using the current admin helper/action pattern.

**Tech Stack:** React/Next.js 16, Express 4, Prisma 6, PostgreSQL, Vitest, Supertest

---

## File Map

**Backend**

- Modify: `apps/api/src/routes/admin.ts`
  Add bootstrap route, include computed `isBootstrapped` in season list, and enforce activation preconditions through the lifecycle service.
- Create: `apps/api/src/services/seasonBootstrapService.ts`
  Clone permanent realm content into season-scoped content with relation remapping and transaction safety.
- Modify: `apps/api/src/services/seasonLifecycleService.ts`
  Reject activation of unbootstrapped seasons.
- Modify: `apps/api/src/routes/admin.seasons.test.ts`
  Cover list/create/bootstrap/activate lifecycle behavior from the route layer.
- Create: `apps/api/src/services/seasonBootstrapService.test.ts`
  Cover clone/remap/refusal behavior at the service layer.

**Web**

- Modify: `apps/web/src/lib/api/admin.ts`
  Add season admin helper types and calls.
- Modify: `apps/web/src/lib/api/index.ts`
  Re-export season admin helpers and types.
- Modify: `apps/web/src/components/screens/AdminScreen.tsx`
  Add `seasons` tab and a new `SeasonsTab` implementation.
- Create: `apps/web/src/components/screens/AdminScreen.test.tsx`
  Add focused tests for season tab rendering and actions.

## Task 1: Backend Season Bootstrap Service

**Files:**
- Create: `apps/api/src/services/seasonBootstrapService.ts`
- Create: `apps/api/src/services/seasonBootstrapService.test.ts`

- [ ] **Step 1: Write the failing bootstrap service tests**

Add tests for:
- cloning permanent records into a target season
- remapping zone/item/mob foreign keys
- rejecting already bootstrapped seasons
- rejecting non-`upcoming` seasons

Use permanent-source fixtures with `seasonId: null` and target-season fixtures with `seasonId: 'season-1'`.

Core test skeleton:

```ts
it('clones permanent realm content into season-scoped records', async () => {
  mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
    id: 'season-1',
    status: 'upcoming',
  });

  mockPrisma.zone.findMany.mockResolvedValue([
    { id: 'zone-perm-1', name: 'Millbrook', seasonId: null, isStarter: true, zoneType: 'town' },
    { id: 'zone-perm-2', name: 'Forest Edge', seasonId: null, isStarter: false, zoneType: 'wild' },
  ]);

  await bootstrapSeason('season-1');

  expect(mockPrisma.zone.createMany).toHaveBeenCalled();
  expect(mockPrisma.itemTemplate.createMany).toHaveBeenCalled();
  expect(mockPrisma.mobTemplate.createMany).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the service tests to verify they fail**

Run:

```powershell
npm test -- -w apps/api src/services/seasonBootstrapService.test.ts
```

Expected:
- test file is missing or the bootstrap symbol is missing

- [ ] **Step 3: Implement the minimal bootstrap service**

Implement `bootstrapSeason(seasonId: string)` in `seasonBootstrapService.ts`.

The service should:
- load the season and ensure `status === 'upcoming'`
- detect existing season-scoped content and throw `AppError` if bootstrapped already
- query permanent content where `seasonId: null`
- build `zoneIdMap`, `itemTemplateIdMap`, and `mobTemplateIdMap`
- clone:
  - `zones`
  - `zoneConnections`
  - `itemTemplates`
  - `mobTemplates`
  - `dropTables`
  - `chestDropTables`
  - `resourceNodes`
  - `craftingRecipes`
  - `zoneMobFamilies`
- run everything inside one Prisma transaction

Implementation shape:

```ts
export async function bootstrapSeason(seasonId: string): Promise<{ seasonId: string }> {
  return prisma.$transaction(async (tx) => {
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
      select: { id: true, status: true },
    });

    if (season.status !== SEASON_STATUSES.UPCOMING) {
      throw new AppError(400, 'Only upcoming seasons can be bootstrapped', 'SEASON_NOT_UPCOMING');
    }

    const existingStarter = await tx.zone.findFirst({
      where: { seasonId, isStarter: true },
      select: { id: true },
    });

    if (existingStarter) {
      throw new AppError(409, 'Season is already bootstrapped', 'SEASON_ALREADY_BOOTSTRAPPED');
    }

    // clone + remap here

    return { seasonId };
  });
}
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run:

```powershell
npm test -- -w apps/api src/services/seasonBootstrapService.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/services/seasonBootstrapService.ts apps/api/src/services/seasonBootstrapService.test.ts
git commit -m "feat(api): add season bootstrap service"
```

## Task 2: Admin Season Routes And Activation Guard

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/services/seasonLifecycleService.ts`
- Modify: `apps/api/src/routes/admin.seasons.test.ts`

- [ ] **Step 1: Write failing route and lifecycle tests**

Add coverage for:
- `GET /api/v1/admin/seasons` returning `isBootstrapped`
- `POST /api/v1/admin/seasons/:id/bootstrap` calling the new service
- activation refusing unbootstrapped seasons

Route test skeleton:

```ts
it('returns seasons with computed isBootstrapped', async () => {
  mockPrisma.season.findMany.mockResolvedValue([
    { id: 'season-1', name: 'Season 1', status: 'upcoming', startsAt: new Date(), endsAt: new Date(), createdAt: new Date() },
  ]);
  mockPrisma.zone.findMany.mockResolvedValue([{ id: 'starter-1', seasonId: 'season-1', isStarter: true }]);

  const res = await request(buildApp())
    .get('/api/v1/admin/seasons')
    .set('Authorization', `Bearer ${adminToken()}`);

  expect(res.status).toBe(200);
  expect(res.body.seasons[0].isBootstrapped).toBe(true);
});
```

Lifecycle test skeleton:

```ts
it('rejects activation when the season is not bootstrapped', async () => {
  mockPrisma.zone.findFirst.mockResolvedValue(null);

  await expect(activateSeason('season-1')).rejects.toMatchObject({
    code: 'SEASON_NOT_BOOTSTRAPPED',
  });
});
```

- [ ] **Step 2: Run the targeted API tests to verify they fail**

Run:

```powershell
npm test -- -w apps/api src/routes/admin.seasons.test.ts
```

Expected:
- FAIL because bootstrap route and `isBootstrapped` response do not exist yet

- [ ] **Step 3: Implement the route and lifecycle changes**

In `admin.ts`:
- import `bootstrapSeason`
- add `POST /seasons/:id/bootstrap`
- extend `GET /seasons` to compute `isBootstrapped`

In `seasonLifecycleService.ts`:
- check bootstrapped readiness before activation
- refuse activation with `AppError(400, ..., 'SEASON_NOT_BOOTSTRAPPED')`

Minimal route shape:

```ts
router.post('/seasons/:id/bootstrap', asyncHandler(async (req, res) => {
  const result = await bootstrapSeason(req.params.id);
  await adminAudit(req.player!.playerId, 'bootstrap_season', result);
  res.json({ message: 'Season bootstrapped', ...result });
}));
```

- [ ] **Step 4: Run the targeted API tests to verify they pass**

Run:

```powershell
npm test -- -w apps/api src/routes/admin.seasons.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/routes/admin.ts apps/api/src/services/seasonLifecycleService.ts apps/api/src/routes/admin.seasons.test.ts
git commit -m "feat(api): add admin season bootstrap controls"
```

## Task 3: Web Admin API Helpers

**Files:**
- Modify: `apps/web/src/lib/api/admin.ts`
- Modify: `apps/web/src/lib/api/index.ts`

- [ ] **Step 1: Write the failing web API helper test or compile-time usage**

If there is no existing helper test file, drive this through the component test in Task 4 by importing:
- `adminGetSeasons`
- `adminCreateSeason`
- `adminBootstrapSeason`
- `adminActivateSeason`
- `adminEndSeason`
- `adminEvaluateSeasonRewards`
- `adminMergeSeason`

Expected initial failure:
- symbols do not exist in `@/lib/api`

- [ ] **Step 2: Implement season helper types and calls**

Add types:

```ts
export interface AdminSeason {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  isBootstrapped: boolean;
}
```

Add helpers:

```ts
export async function adminGetSeasons() {
  return fetchApi<{ seasons: AdminSeason[] }>('/api/v1/admin/seasons');
}

export async function adminBootstrapSeason(id: string) {
  return fetchApi<{ message: string; seasonId: string }>(`/api/v1/admin/seasons/${id}/bootstrap`, { method: 'POST' });
}
```

Add the remaining lifecycle helpers in the same style.

- [ ] **Step 3: Re-export the helpers from `index.ts`**

Add the new helper names and `AdminSeason` type to the existing admin export block.

- [ ] **Step 4: Run TypeScript verification for the web API layer**

Run:

```powershell
npm run typecheck
```

Expected:
- the new helper exports are recognized by the web app

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/api/admin.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): add admin season api helpers"
```

## Task 4: AdminScreen Seasons Tab

**Files:**
- Modify: `apps/web/src/components/screens/AdminScreen.tsx`
- Create: `apps/web/src/components/screens/AdminScreen.test.tsx`

- [ ] **Step 1: Write the failing AdminScreen season tab tests**

Add tests for:
- rendering the new `Seasons` tab
- loading season rows from `adminGetSeasons`
- creating a season
- bootstrapping an existing season
- invoking activate/end/evaluate/merge actions

Test skeleton:

```tsx
it('loads seasons and shows bootstrap state', async () => {
  vi.mocked(adminGetSeasons).mockResolvedValue({
    data: {
      seasons: [
        {
          id: 'season-1',
          name: 'Season 1',
          status: 'upcoming',
          startsAt: '2026-05-01T00:00:00.000Z',
          endsAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-04-21T00:00:00.000Z',
          isBootstrapped: false,
        },
      ],
    },
  } as any);

  render(<AdminScreen turns={0} setTurns={vi.fn()} onStateUpdates={vi.fn()} reloadZones={vi.fn()} />);

  expect(await screen.findByText('Season 1')).toBeTruthy();
  expect(screen.getByText('Not bootstrapped')).toBeTruthy();
});
```

- [ ] **Step 2: Run the AdminScreen tests to verify they fail**

Run:

```powershell
npm test -- -w apps/web src/components/screens/AdminScreen.test.tsx
```

Expected:
- FAIL because the seasons tab and helper calls do not exist yet

- [ ] **Step 3: Implement the new Seasons tab**

In `AdminScreen.tsx`:
- extend `AdminTab` with `'seasons'`
- add a `SeasonsTab` component using the existing `useAdminAction` pattern
- render:
  - create form
  - season list
  - row actions with `window.confirm` for destructive operations
- refresh the list after each successful action

Recommended tab type update:

```ts
type AdminTab = 'player' | 'items' | 'world' | 'zones' | 'resources' | 'guild' | 'analytics' | 'seasons';
```

Core local state:

```ts
const [seasons, setSeasons] = useState<AdminSeason[]>([]);
const [name, setName] = useState('');
const [startsAt, setStartsAt] = useState('');
const [endsAt, setEndsAt] = useState('');
const [features, setFeatures] = useState('');
```

- [ ] **Step 4: Run the AdminScreen tests to verify they pass**

Run:

```powershell
npm test -- -w apps/web src/components/screens/AdminScreen.test.tsx
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/components/screens/AdminScreen.tsx apps/web/src/components/screens/AdminScreen.test.tsx
git commit -m "feat(web): add admin seasons tab"
```

## Task 5: Focused Verification And Final Cleanup

**Files:**
- Review only touched files from Tasks 1-4

- [ ] **Step 1: Run focused backend verification**

Run:

```powershell
npm test -- -w apps/api src/services/seasonBootstrapService.test.ts
npm test -- -w apps/api src/routes/admin.seasons.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Run focused frontend verification**

Run:

```powershell
npm test -- -w apps/web src/components/screens/AdminScreen.test.tsx
```

Expected:
- PASS

- [ ] **Step 3: Run broad verification**

Run:

```powershell
npm run typecheck
npm run test:api
npm run test -w apps/web
```

Expected:
- PASS

- [ ] **Step 4: Simplify only the touched code**

Review:
- `apps/api/src/services/seasonBootstrapService.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/services/seasonLifecycleService.ts`
- `apps/web/src/components/screens/AdminScreen.tsx`
- `apps/web/src/lib/api/admin.ts`

Apply only worthwhile simplifications:
- reduce duplication in clone helpers
- keep UI action wiring explicit rather than abstracting prematurely
- do not widen scope beyond season admin control

- [ ] **Step 5: Commit final cleanup**

```powershell
git add apps/api/src/services/seasonBootstrapService.ts apps/api/src/routes/admin.ts apps/api/src/services/seasonLifecycleService.ts apps/web/src/components/screens/AdminScreen.tsx apps/web/src/lib/api/admin.ts
git commit -m "refactor: simplify admin season control flow"
```

## Self-Review

### Spec Coverage

- Admin `Seasons` tab: covered by Task 4
- Season bootstrap endpoint/service: covered by Tasks 1-2
- Computed `isBootstrapped`: covered by Task 2
- Activation guard: covered by Task 2
- Admin API helpers: covered by Task 3
- Backend/frontend tests: covered by Tasks 1, 2, 4, and 5

### Placeholder Scan

- No `TODO`/`TBD` placeholders remain
- Every task points to exact files and commands
- Bootstrap scope explicitly lists cloned datasets and remapped relations

### Type Consistency

- `AdminSeason` is the canonical web type used by the admin UI
- `bootstrapSeason(seasonId: string)` is the canonical backend service entrypoint
- `isBootstrapped` is the canonical readiness flag name used across route, helper, and UI
