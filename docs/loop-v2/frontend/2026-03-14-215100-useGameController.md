# Frontend Audit: useGameController

**Component Audited:** `apps/web/src/app/game/useGameController.ts` (1,743 lines)
**Date:** 2026-03-14

---

## Accessibility

No issues found. This is a pure state/logic hook with no JSX rendering — accessibility concerns belong in the consuming components.

---

## Component Duplication

### 1. Travel playback complete/skip share duplicated log messages
**Severity:** medium
**Lines:** 1417-1444, 1471-1496

`handleTravelPlaybackComplete` and `handleTravelPlaybackSkip` both contain identical branching for abort/respawn/arrived log messages (3 branches each). Same pattern exists between `handleExplorationPlaybackComplete` and `handlePlaybackSkip` (lines 683-737).

**Suggested Fix:** Extract a helper like `logTravelOutcome(data: TravelPlaybackState)` and `logExplorationOutcome(data)` that both the complete and skip handlers call, then each handler only adds its extra logic (e.g., skip adds `mapPlaybackEventsToLogs`).

### 2. Skill name capitalization repeated
**Severity:** low
**Lines:** 861, 947, 1027

`data.xp.skillType.charAt(0).toUpperCase() + data.xp.skillType.slice(1)` appears 3 times. A `capitalize()` utility likely already exists or could be trivially added.

**Suggested Fix:** Use a shared `capitalize(str)` helper from `@/lib/format` or similar.

---

## State Issues

### 1. `loadAll` has empty dependency array despite using external functions
**Severity:** medium
**Lines:** 370-483

`loadAll` is wrapped in `useCallback(async () => {...}, [])` but references `initSettingsFromServer`, `setGuildTaxRate`, `pushLog`, and other functions from composed hooks. While these functions are likely stable refs, the empty `[]` violates exhaustive-deps and could cause stale closures if any of those hooks are refactored to return new function instances.

**Suggested Fix:** Add the referenced functions to the dependency array, or verify they are all guaranteed stable (e.g., backed by `useRef`). At minimum add an `// eslint-disable-next-line react-hooks/exhaustive-deps` with a comment explaining why stability is guaranteed.

### 2. `handleNavigate` calls async skip functions without awaiting
**Severity:** medium
**Lines:** 900-921

```tsx
if (explorationPlaybackData) {
  handlePlaybackSkip();  // async, not awaited
}
```

`handlePlaybackSkip`, `handleTravelPlaybackSkip`, and the combat skip logic all trigger async operations (including `loadAll()`). These fire-and-forget calls mean state updates from skip finalization may race with the navigation state update at line 928.

**Suggested Fix:** Make `handleNavigate` async and await the skip calls, or restructure the skip functions to not trigger `loadAll()` when called from navigation (since navigation will trigger its own state loads).

### 3. `handleSelectStrategy` dependency array incomplete
**Severity:** low
**Lines:** 883-896

`handleSelectStrategy` uses `pushLog` (line 892) but only lists `[refreshPendingEncounters]` as a dependency. `pushLog` should be included. It works in practice because `pushLog` is ref-stable, but this is fragile.

**Suggested Fix:** Add `pushLog` to the dependency array.

### 4. Uncancelled async chains in `loadAll`
**Severity:** low
**Lines:** 426-429, 478-482

`loadAll` fires detached `.then()` chains for zone events and guild tax rate. If `loadAll` is called rapidly (e.g., from polling + manual action), multiple of these chains run concurrently with last-resolve-wins semantics.

**Suggested Fix:** Acceptable as-is since the data is idempotent. If it ever causes flickering, add a generation counter or AbortController.

---

## UX Issues

### 1. No error surfacing for initial load failures
**Severity:** medium
**Lines:** 370-483, 537-549

If `loadAll()` fails on initial mount (network error, 401, etc.), there's no error state set — individual API calls silently skip their `if (res.data)` branches. The user sees an empty/stale UI with no indication of failure.

**Suggested Fix:** Wrap the `Promise.all` in a try/catch that sets a top-level `loadError` state, and expose it from the hook so `page.tsx` can show an error banner or retry button.

### 2. Playback silently abandoned on navigation
**Severity:** low
**Lines:** 898-921

When the user navigates away during an active playback (exploration, combat, travel), the playback is immediately skipped without any visual confirmation. For long exploration runs, this could surprise users who accidentally tap a nav button.

**Suggested Fix:** Consider a brief confirmation if the playback has been running less than a few seconds, or show a toast: "Playback skipped." This is a UX preference — current behavior may be intentional for a snappy feel.
