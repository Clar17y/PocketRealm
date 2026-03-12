# Encounter Site UX Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix encounter site loot aggregation bug, defer premature encounter list refresh, reorder layout so combat playback appears above the site list, and add grouped encounter site navigation (1/N) to both Combat History and the post-combat panel.

**Architecture:** Four independent changes: (1) server-side loot dedup, (2) defer `refreshPendingEncounters()` to after playback, (3) reorder CombatScreen JSX, (4) add `summaryLogId` to per-fight logs + new API endpoint + grouped history UI + post-combat 1/N navigation.

**Tech Stack:** TypeScript, Express, Prisma raw SQL, React, Next.js

---

### Task 1: Fix loot aggregation bug (server-side)

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts:461-468`

**Step 1: Write a loot deduplication helper**

After line 468, replace the raw push with a dedup reduce. Change:

```typescript
// --- Build aggregated rewards ---
const aggregatedLoot: LootDropWithName[] = [];
const aggregatedDurabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>> = [];
let aggregatedXp = 0;
for (const fight of fightResults) {
  aggregatedXp += fight.xp;
  aggregatedLoot.push(...fight.loot);
  aggregatedDurabilityLost.push(...fight.durabilityLost);
}
```

To:

```typescript
// --- Build aggregated rewards ---
const rawLoot: LootDropWithName[] = [];
const aggregatedDurabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>> = [];
let aggregatedXp = 0;
for (const fight of fightResults) {
  aggregatedXp += fight.xp;
  rawLoot.push(...fight.loot);
  aggregatedDurabilityLost.push(...fight.durabilityLost);
}

// Combine loot by itemTemplateId so "Rat Pelt x1" + "Rat Pelt x2" becomes "Rat Pelt x3"
const lootMap = new Map<string, LootDropWithName>();
for (const drop of rawLoot) {
  const existing = lootMap.get(drop.itemTemplateId);
  if (existing) {
    existing.quantity += drop.quantity;
  } else {
    lootMap.set(drop.itemTemplateId, { ...drop });
  }
}
const aggregatedLoot = [...lootMap.values()];
```

**Step 2: Verify build**

Run: `npm run build:api`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```
fix: aggregate encounter site loot by item type

Loot from multi-fight encounter sites was concatenated per-fight
instead of combined by itemTemplateId, showing duplicate entries
like "Rat Pelt x1, Rat Pelt x2" instead of "Rat Pelt x3".
```

---

### Task 2: Defer encounter site refresh until after playback

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:1193` (handleStartCombat)
- Modify: `apps/web/src/app/game/useGameController.ts:1212-1259` (handleCombatPlaybackComplete)

**Step 1: Remove refreshPendingEncounters from handleStartCombat**

At line 1193, change:

```typescript
await Promise.all([loadAll(), loadTurnsAndHp(), refreshPendingEncounters(), loadBestiary()]);
```

To:

```typescript
await Promise.all([loadAll(), loadTurnsAndHp(), loadBestiary()]);
```

**Step 2: Add refreshPendingEncounters to handleCombatPlaybackComplete**

After line 1253 (`setPlaybackActive(false);`), add:

```typescript
// Refresh encounter site list now that playback is done
void refreshPendingEncounters();
```

Also add it after room_by_room room completion. Find the `handleCombatPlaybackComplete` return path where `roomCleared` is relevant. The room_by_room path returns to the encounter list between rooms, so refreshing there is correct.

Actually, looking more carefully: `handleCombatPlaybackComplete` handles the playback queue exhaustion. For room_by_room, each room triggers a separate `handleStartCombat` call (the player presses "Fight" again). So the refresh only needs to happen once, after all playback finishes. The line after `setPlaybackActive(false)` covers both strategies.

**Step 3: Also handle the navigate-away skip path**

Find `handleNavigate` (line 1261+) where playback is skipped on navigation. Ensure `refreshPendingEncounters` is called there too. Read the existing skip logic to see if it already calls it.

Read `useGameController.ts` lines 1261-1300 to verify. The skip path should also refresh since the combat is done.

**Step 4: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 5: Commit**

```
fix: defer encounter site refresh until combat playback finishes

refreshPendingEncounters() was firing immediately after the combat
API returned, before playback started. This sometimes caused the
list to get stuck on "loading encounter sites" and was a wasted
call since the player hadn't seen the outcome yet.
```

---

### Task 3: Reorder CombatScreen layout — playback above site list

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx:300-540`

**Step 1: Move combat playback, room transition, and lastCombat sections above the site list**

The current order in the JSX (within the encounters tab `activeView === 'encounters'` branch) is:

1. Filter controls (lines ~310-348) — keep at top
2. Encounter site list (lines ~350-443) — move down
3. Room transition (lines ~446-456) — move up
4. Combat playback (lines ~458-493) — move up
5. Last combat panel (lines ~497-540) — move up

Reorder to:

1. Filter controls
2. Room transition interstitial
3. Combat playback (animated)
4. Last combat panel (post-playback)
5. Encounter site list + pagination

Cut the three blocks (room transition, combat playback, last combat) and paste them between the filter controls and the encounter site list.

**Step 2: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 3: Manual test**

Start dev, navigate to Encounters tab:
- Site list should appear as normal
- Hit Fight — playback should appear at top, site list below
- After playback — last combat panel at top, site list below

**Step 4: Commit**

```
feat: move combat playback above encounter site list

When the site list was long, players had to scroll down to see
the combat playback animation. Now playback, room transitions,
and the last combat panel render above the site list.
```

---

### Task 4: Add summaryLogId to per-fight activity logs

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts:522-563`

**Step 1: Include summaryLogId in per-fight log result JSON**

After the summary log is created (line 520, `combatLog` variable), the per-fight logs are created in the loop starting at line 527. Add `summaryLogId: combatLog.id` to each per-fight log's `result` object.

Change line 533-555 (inside the per-fight log creation):

```typescript
result: {
  zoneId,
  zoneName: zone.name,
  mobTemplateId: fight.mobTemplateId,
  // ... existing fields ...
  summaryLogId: combatLog.id,  // <-- add this line
  eventModifiers: siteMobBadges,
} as unknown as Prisma.InputJsonValue,
```

**Step 2: Also store mobFamilyName in the summary log**

The summary log at line 491-519 doesn't store `mobFamilyName`. Add it for display in the history list. The mob family name is available from the encounter site query. Find where the mob family is loaded (should be from the encounter site's `mobFamily` relation) and add `mobFamilyName` to the summary log result.

Read the encounter site query at the top of `handleEncounterSiteRoomCombat` to find the mob family name field. Then add `mobFamilyName: site.mobFamily.name` (or however it's accessed) to the summary log result JSON.

**Step 3: Verify build**

Run: `npm run build:api`
Expected: Build succeeds.

**Step 4: Commit**

```
feat: link per-fight logs to summary log via summaryLogId

Per-fight activity logs now store summaryLogId in their result
JSON, enabling the grouped combat history view to fetch all
fights for a given encounter site combat session.
```

---

### Task 5: New API endpoint — get fights for a summary log

**Files:**
- Modify: `apps/api/src/routes/combat/logs.ts`

**Step 1: Add GET /combat/logs/:id/fights endpoint**

Add a new route after the existing `GET /logs/:id` route:

```typescript
/**
 * GET /api/v1/combat/logs/:id/fights
 * Returns per-fight log summaries for an encounter site summary log.
 */
router.get('/logs/:id/fights', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const params = logParamsSchema.parse(req.params);

  // Verify the summary log exists and belongs to this player
  const summaryLog = await prisma.activityLog.findFirst({
    where: { id: params.id, playerId, activityType: 'combat' },
    select: { id: true, result: true },
  });

  if (!summaryLog) {
    throw new AppError(404, 'Combat log not found', 'NOT_FOUND');
  }

  const result = summaryLog.result as Record<string, unknown>;
  if (result.source !== 'encounter_site') {
    throw new AppError(400, 'Not an encounter site summary log', 'INVALID_SOURCE');
  }

  // Query per-fight logs linked to this summary
  const fights = await prisma.$queryRaw<Array<{
    id: string;
    createdAt: Date;
    mobTemplateId: string | null;
    mobName: string | null;
    mobDisplayName: string | null;
    mobPrefix: string | null;
    outcome: string | null;
    room: number | null;
    xpGained: number;
  }>>(Prisma.sql`
    SELECT
      "id",
      "created_at" AS "createdAt",
      ("result"->>'mobTemplateId') AS "mobTemplateId",
      ("result"->>'mobName') AS "mobName",
      COALESCE(("result"->>'mobDisplayName'), ("result"->>'mobName')) AS "mobDisplayName",
      ("result"->>'mobPrefix') AS "mobPrefix",
      ("result"->>'outcome') AS "outcome",
      ("result"->>'room')::int AS "room",
      COALESCE(NULLIF("result"->'rewards'->>'xp', '')::int, 0) AS "xpGained"
    FROM "activity_logs"
    WHERE "player_id" = ${playerId}
      AND "activity_type" = 'combat'
      AND ("result"->>'source') = 'encounter_site_fight'
      AND ("result"->>'summaryLogId') = ${params.id}
    ORDER BY "created_at" ASC
  `);

  res.json({
    summaryLogId: params.id,
    fights: fights.map((f) => ({
      logId: f.id,
      createdAt: f.createdAt.toISOString(),
      mobTemplateId: f.mobTemplateId,
      mobName: f.mobName,
      mobDisplayName: f.mobDisplayName ?? f.mobName,
      mobPrefix: f.mobPrefix,
      outcome: f.outcome,
      room: f.room,
      xpGained: f.xpGained,
    })),
  });
}));
```

**Step 2: Verify build**

Run: `npm run build:api`
Expected: Build succeeds.

**Step 3: Commit**

```
feat: add GET /combat/logs/:id/fights endpoint

Returns per-fight log summaries for an encounter site summary
log, enabling the grouped 1/N combat history navigation.
```

---

### Task 6: Modify combat history list to exclude per-fight logs

**Files:**
- Modify: `apps/api/src/routes/combat/logs.ts:63-88` (where clause building)
- Modify: `apps/api/src/routes/combat/logs.ts:199-218` (response format)

**Step 1: Add filter to exclude encounter_site_fight entries**

In the `whereParts` array (line 63-66), add:

```typescript
whereParts.push(
  Prisma.sql`COALESCE(("result"->>'source'), '') <> 'encounter_site_fight'`
);
```

**Step 2: Add fightCount and encounterSiteId to list response**

Modify the SELECT query (both sort variants) to include:

```sql
COALESCE(("result"->>'fightCount')::int, 1) AS "fightCount",
("result"->>'encounterSiteId') AS "encounterSiteId",
("result"->>'mobFamilyName') AS "mobFamilyName"
```

Update the `CombatHistoryListRow` interface to include these new fields.

Update the response mapping to include them:

```typescript
logs: listRows.map((row) => ({
  // ... existing fields ...
  fightCount: row.fightCount,
  encounterSiteId: row.encounterSiteId,
  mobFamilyName: row.mobFamilyName,
})),
```

**Step 3: Verify build**

Run: `npm run build:api`
Expected: Build succeeds.

**Step 4: Commit**

```
feat: exclude per-fight logs from history list, add encounter metadata

Combat history list now filters out encounter_site_fight entries
and includes fightCount/encounterSiteId/mobFamilyName for grouped display.
```

---

### Task 7: Frontend API types + fetch function for fights endpoint

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`

**Step 1: Add types**

```typescript
export interface EncounterSiteFightSummary {
  logId: string;
  createdAt: string;
  mobTemplateId: string | null;
  mobName: string | null;
  mobDisplayName: string | null;
  mobPrefix: string | null;
  outcome: string | null;
  room: number | null;
  xpGained: number;
}

export interface EncounterSiteFightsResponse {
  summaryLogId: string;
  fights: EncounterSiteFightSummary[];
}
```

**Step 2: Update CombatHistoryListItemResponse**

Add the new fields:

```typescript
export interface CombatHistoryListItemResponse {
  // ... existing fields ...
  fightCount: number;
  encounterSiteId: string | null;
  mobFamilyName: string | null;
}
```

**Step 3: Add fetch function**

```typescript
export async function getEncounterSiteFights(summaryLogId: string): Promise<EncounterSiteFightsResponse> {
  const res = await fetchApi<EncounterSiteFightsResponse>(`/combat/logs/${summaryLogId}/fights`);
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to fetch encounter site fights');
  return res.data;
}
```

**Step 4: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 5: Commit**

```
feat: add frontend types and fetch for encounter site fights
```

---

### Task 8: Grouped encounter site rows in CombatHistory

**Files:**
- Modify: `apps/web/src/components/screens/CombatHistory.tsx`

**Step 1: Update the list rendering**

In the history list, encounter site entries (`source === 'encounter_site'`) should render differently from zone/ambush entries:

- Show mob family name (or site mob display name) instead of individual mob name
- Show fight count badge: `"7 fights"` next to the mob name
- Show `source` as "Encounter Site" (existing `formatCombatSource` should handle this)
- Clicking still opens the detail view

The existing list item rendering (find the `.map()` over `history.logs`) needs a conditional branch. For encounter site entries with `fightCount > 1`, display the fight count.

**Step 2: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 3: Commit**

```
feat: show encounter site entries as grouped rows in history

Encounter site entries display fight count badge and mob family
name instead of individual mob info.
```

---

### Task 9: 1/N fight navigation in CombatHistory detail view

**Files:**
- Modify: `apps/web/src/components/screens/CombatHistory.tsx`

**Step 1: Add state for encounter site fight navigation**

```typescript
const [siteFights, setSiteFights] = useState<EncounterSiteFightSummary[] | null>(null);
const [siteFightIndex, setSiteFightIndex] = useState(0);
const [siteFightsLoading, setSiteFightsLoading] = useState(false);
```

**Step 2: Fetch fights when selecting an encounter site log**

When a log is selected and its `source === 'encounter_site'` and `fightCount > 1`, also fetch the fights list:

```typescript
// Inside the log selection handler, after fetching the detail:
if (entry.source === 'encounter_site' && entry.fightCount > 1) {
  setSiteFightsLoading(true);
  try {
    const fightsData = await getEncounterSiteFights(entry.logId);
    setSiteFights(fightsData.fights);
    setSiteFightIndex(0);
  } catch {
    setSiteFights(null);
  } finally {
    setSiteFightsLoading(false);
  }
} else {
  setSiteFights(null);
}
```

**Step 3: Add navigation UI in the detail view**

When `siteFights` is populated, show navigation above the combat log:

```tsx
{siteFights && siteFights.length > 1 && (
  <div className="flex items-center justify-between border-b border-[var(--rpg-border)] pb-2 mb-2">
    <button
      type="button"
      disabled={siteFightIndex === 0}
      onClick={() => handleSiteFightNavigate(siteFightIndex - 1)}
      className="px-2 py-1 rounded text-sm border border-[var(--rpg-border)] disabled:opacity-30"
    >
      Prev
    </button>
    <div className="text-sm text-[var(--rpg-text-secondary)]">
      <span className="text-[var(--rpg-gold)] font-semibold">
        Fight {siteFightIndex + 1}/{siteFights.length}
      </span>
      {siteFights[siteFightIndex] && (
        <span className="ml-2">
          — {siteFights[siteFightIndex].mobDisplayName}
        </span>
      )}
    </div>
    <button
      type="button"
      disabled={siteFightIndex === siteFights.length - 1}
      onClick={() => handleSiteFightNavigate(siteFightIndex + 1)}
      className="px-2 py-1 rounded text-sm border border-[var(--rpg-border)] disabled:opacity-30"
    >
      Next
    </button>
  </div>
)}
```

**Step 4: Implement handleSiteFightNavigate**

When navigating, fetch the specific fight's full log via `getCombatLog(siteFights[newIndex].logId)` and update `selectedDetail`:

```typescript
const handleSiteFightNavigate = async (newIndex: number) => {
  if (!siteFights || !siteFights[newIndex]) return;
  setSiteFightIndex(newIndex);
  setSelectedLoading(true);
  setSelectedError(null);
  try {
    const detail = await getCombatLog(siteFights[newIndex].logId);
    setSelectedDetail(detail.combat);
  } catch (err) {
    setSelectedError((err as Error).message);
  } finally {
    setSelectedLoading(false);
  }
};
```

The first fight shown is the summary log's own detail (fight 1 = the summary view). Wait — the summary log (`source: 'encounter_site'`) doesn't have a combat `log` array (it's aggregated). So fight navigation should start by showing the summary/aggregated rewards, then individual fights show their own logs.

Actually, re-reading the code: the summary log DOES store combat data — it has the last fight's data as its `mobName`/`outcome`/etc but aggregated rewards. For the 1/N view, we should:
- Default to showing the summary view (aggregated rewards, no per-round log)
- Navigation buttons load individual per-fight logs with their own combat rounds

Alternative: default to fight 1 and show all fights via navigation. The "summary" aggregated rewards are shown below the navigation regardless of which fight is selected.

Use this approach:
1. When detail view opens for an encounter site, show the aggregated rewards from the summary log
2. 1/N navigation switches between per-fight logs for the combat round details
3. Default to fight 1's combat log (first fight)
4. Aggregated rewards section always visible below

**Step 5: Clear site fights state when deselecting**

When going back to the list view (`setSelectedLogId(null)`), also clear:

```typescript
setSiteFights(null);
setSiteFightIndex(0);
```

**Step 6: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 7: Commit**

```
feat: add 1/N fight navigation in combat history detail view

When viewing an encounter site log, prev/next buttons navigate
between individual fight logs. Aggregated rewards shown below.
```

---

### Task 10: Post-combat panel 1/N navigation for encounter sites

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:118-157` (LastCombat type)
- Modify: `apps/web/src/app/game/useGameController.ts:1232-1259` (handleCombatPlaybackComplete)
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx:497-540` (last combat panel)

**Step 1: Extend LastCombat type to store fight queue**

Add an optional `fights` field to `LastCombat`:

```typescript
export interface LastCombat {
  // ... existing fields ...
  fights?: Array<{
    mobName: string;
    mobDisplayName: string;
    mobTemplateId: string;
    mobPrefix: string | null;
    outcome: string;
    combatantAMaxHp: number;
    combatantBMaxHp: number;
    log: LastCombatLogEntry[];
    combatLogId?: string;
  }> | null;
}
```

**Step 2: Store fight queue in lastCombat when playback completes**

In `handleCombatPlaybackComplete`, when building the `lastCombat` object (line 1236-1246), if the queue had multiple fights, store them:

```typescript
const aggregatedRewards = pendingCombatRewardsRef.current ?? lastFight.rewards;
const allFights = combatPlaybackQueue && combatPlaybackQueue.length > 1
  ? combatPlaybackQueue.map(f => ({
      mobName: f.mobName,
      mobDisplayName: f.mobDisplayName,
      mobTemplateId: f.mobTemplateId,
      mobPrefix: f.mobPrefix,
      outcome: f.outcome,
      combatantAMaxHp: f.combatantAMaxHp,
      combatantBMaxHp: f.combatantBMaxHp,
      log: f.log ?? [],
      combatLogId: f.combatLogId,
    }))
  : null;

setLastCombat({
  // ... existing fields ...
  fights: allFights,
});
```

**Step 3: Add 1/N navigation to the post-combat panel in CombatScreen**

Add state for the selected fight index:

```typescript
const [lastCombatFightIndex, setLastCombatFightIndex] = useState(0);
```

Reset to 0 when `lastCombat` changes.

In the last combat panel section (lines 497-540), when `lastCombat.fights` exists:

```tsx
{lastCombat.fights && lastCombat.fights.length > 1 && (
  <div className="flex items-center justify-between border-b border-[var(--rpg-border)] pb-2 mb-2">
    <button
      type="button"
      disabled={lastCombatFightIndex === 0}
      onClick={() => setLastCombatFightIndex(prev => prev - 1)}
      className="px-2 py-1 rounded text-sm border border-[var(--rpg-border)] disabled:opacity-30"
    >
      Prev
    </button>
    <span className="text-sm text-[var(--rpg-gold)] font-semibold">
      Fight {lastCombatFightIndex + 1}/{lastCombat.fights.length}
    </span>
    <button
      type="button"
      disabled={lastCombatFightIndex === lastCombat.fights.length - 1}
      onClick={() => setLastCombatFightIndex(prev => prev + 1)}
      className="px-2 py-1 rounded text-sm border border-[var(--rpg-border)] disabled:opacity-30"
    >
      Next
    </button>
  </div>
)}
```

The combat log entries should show the selected fight's log instead of just the last fight's log. Derive the displayed fight:

```typescript
const displayedFight = lastCombat.fights?.[lastCombatFightIndex] ?? lastCombat;
```

Use `displayedFight.log`, `displayedFight.combatantAMaxHp`, etc for the log entries. The aggregated rewards (`lastCombat.rewards`) always show below regardless of fight index.

Also update the header to show the current fight's mob name when navigating, and the mob image.

**Step 4: Handle lazy-loaded logs for earlier fights**

The `combatPlaybackQueue` should have logs already loaded for all fights (they were loaded during playback). If a fight's log is still null (edge case), show "Log not available" message.

**Step 5: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 6: Commit**

```
feat: add 1/N fight navigation to post-combat panel

After encounter site playback, the last combat panel shows
prev/next navigation to review all fight logs. Aggregated
rewards remain visible throughout.
```

---

### Task 11: Also handle navigate-away skip path for encounter refresh

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:1261+` (handleNavigate)

**Step 1: Read handleNavigate skip logic**

Read the `handleNavigate` function to see the existing combat skip path. Ensure `refreshPendingEncounters()` is called when combat playback is skipped via navigation.

**Step 2: Add refresh call**

In the combat skip path within `handleNavigate`, after the playback queue is cleared and `setPlaybackActive(false)` is called, add:

```typescript
void refreshPendingEncounters();
```

**Step 3: Verify build**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 4: Commit**

```
fix: refresh encounter sites when combat playback is skipped via navigation
```

---

### Task 12: Final integration test

**Step 1: Start dev environment**

```bash
npm run dev
```

**Step 2: Test loot aggregation**

Fight an encounter site with multiple mobs. Verify the rewards show combined loot (e.g., "Rat Pelt x4" instead of "Rat Pelt x1, Rat Pelt x1, Rat Pelt x2").

**Step 3: Test deferred refresh**

Hit Fight on an encounter site. Verify the encounter site list does NOT reload until after playback finishes. The list should not show a loading spinner during playback.

**Step 4: Test layout order**

Verify combat playback appears above the encounter site list. After playback, the last combat panel should be at the top.

**Step 5: Test combat history grouping**

Open the History tab. Encounter site entries should show as single rows with fight count. Click one — should open detail view with 1/N navigation. Navigate between fights.

**Step 6: Test post-combat navigation**

After an encounter site fight, the last combat panel should show 1/N navigation for multi-fight encounters. Navigate between fights.

**Step 7: Commit any final fixes**

If any issues found, fix and commit individually.
