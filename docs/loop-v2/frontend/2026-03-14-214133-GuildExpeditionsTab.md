# Frontend Audit: GuildExpeditionsTab

**Component Audited:** `apps/web/src/components/guild/GuildExpeditionsTab.tsx` (1,846 lines)
**Date:** 2026-03-14

---

## Accessibility

### 1. Tab bar lacks ARIA tab roles
**Severity:** high
**Lines:** 463-478

The Active/History sub-tab buttons have no `role="tablist"`, `role="tab"`, `aria-selected`, or `role="tabpanel"`. Screen readers cannot identify these as tab controls.

**Suggested Fix:** Wrap in a `<div role="tablist">`, add `role="tab"` and `aria-selected={subTab === 'active'}` to each button, and wrap content in `<div role="tabpanel">`.

### 2. Clickable member rows missing keyboard support
**Severity:** high
**Lines:** 1794-1818

When `canHealTarget` is true, `<div>` elements become clickable via `onClick` but have no `role="button"`, `tabIndex={0}`, or `onKeyDown` handler. Keyboard users cannot select heal targets.

**Suggested Fix:** Add `role="button"`, `tabIndex={0}`, and `onKeyDown` for Enter/Space when `canHealTarget` is true. Or switch to a `<button>` element.

### 3. HpBar and room progress bar missing ARIA progressbar
**Severity:** medium
**Lines:** 141-156, 839-852

Both custom progress bars lack `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. Screen readers have no way to convey the current value.

**Suggested Fix:** Add `role="progressbar"` to the outer container, with `aria-valuenow={current}`, `aria-valuemin={0}`, `aria-valuemax={max}`, and `aria-label={label}`.

### 4. Collapsible sections missing aria-expanded
**Severity:** medium
**Lines:** 1193, 1241, 1257, 1319, 1402, 1472

Six collapsible toggle buttons use `▲`/`▼` glyphs but no `aria-expanded` attribute. Screen readers can't indicate collapsed/expanded state.

**Suggested Fix:** Add `aria-expanded={expanded}` to each toggle `<button>`.

### 5. Template select not associated with label
**Severity:** medium
**Lines:** 921-931

The `<label>` and `<select>` are siblings but not linked via `htmlFor`/`id`. Clicking the label doesn't focus the select; screen readers may not associate them.

**Suggested Fix:** Add `id="expedition-template-select"` to the `<select>` and `htmlFor="expedition-template-select"` to the `<label>`.

### 6. Countdown has no aria-live region
**Severity:** low
**Lines:** 107-139

The countdown timer updates every second but the `<span>` has no `aria-live="polite"` or `role="timer"`, so dynamic updates are silent to screen readers.

**Suggested Fix:** Add `role="timer"` and `aria-live="polite"` to the countdown `<span>`.

---

## Component Duplication

### 1. Contribution list rendered 4 times
**Severity:** high
**Lines:** 1506-1522, 1588-1604, 1619-1635, 1826-1840

The same "sort members by damage, render name + dmg + heal" pattern is copy-pasted in `PreviousAttemptsSection`, `HistoryDetailPanel` (attempt path), `HistoryDetailPanel` (fallback path), and `MemberList`. All four share identical structure.

**Suggested Fix:** Extract a `<ContributionList participants={...} />` component that accepts an array of `{ playerId, username, totalDamage, totalHealing }` and handles the sort + render. Use it in all four locations.

### 2. RoundLogList and PreviousRoundsLog are near-duplicates
**Severity:** high
**Lines:** 1229-1292, 1298-1353

Both render an accordion of round logs with the same expand/collapse per round, same outcome badges (killed, KO, CLEARED, WIPE), same `RoundLogContent` rendering. The only difference: `PreviousRoundsLog` wraps everything in a collapsible outer container.

**Suggested Fix:** Consolidate into a single `RoundLogAccordion` component with an optional `collapsible` prop for the outer wrapper.

### 3. HpBar duplicates ResourceStatusBar pattern
**Severity:** medium
**Lines:** 141-156

`HpBar` is a custom progress bar used for mob HP. `ResourceStatusBar` (already imported at line 42) provides the same visual pattern for player HP/stamina/mana. These could share a base bar component.

**Suggested Fix:** Extract a shared `ProgressBar` component to `components/common/` or reuse `ResourceStatusBar` in a single-bar mode for mob HP.

### 4. Expand/collapse toggle pattern repeated
**Severity:** low
**Lines:** 1193-1215, 1240-1248, 1471-1479

The collapsible header with `▲`/`▼` toggle is repeated across 3+ sub-components. Minor duplication — could extract a `CollapsibleSection` component but the gain is small.

---

## State Issues

### 1. `members.sort()` mutates prop during render
**Severity:** high
**Lines:** 1826-1827

```tsx
{members
  .sort((a, b) => b.totalDamage - a.totalDamage)
```

`Array.sort()` mutates the original array in place. This sorts the `members` prop directly during the render pass, which mutates data owned by the parent component. This can cause unpredictable re-render behavior and stale references.

**Suggested Fix:** Change to `[...members].sort(...)` or `members.toSorted(...)` to create a new sorted copy.

### 2. HistoryView page change race condition
**Severity:** medium
**Lines:** 1367-1375

When `page` changes, a new `getExpeditionHistory()` fires. If the user clicks pages quickly, multiple requests are in flight and the last one to resolve wins — which may not correspond to the current page.

**Suggested Fix:** Use an `AbortController` in the effect or an `ignore` flag pattern:
```tsx
useEffect(() => {
  let ignore = false;
  setLoading(true);
  getExpeditionHistory(page).then(res => {
    if (ignore) return;
    // ...set state
  }).finally(() => { if (!ignore) setLoading(false); });
  return () => { ignore = true; };
}, [page]);
```

### 3. HistoryView detail expand race condition
**Severity:** medium
**Lines:** 1377-1386

`handleExpand` is async. If the user clicks expedition A, then clicks expedition B before A's fetch completes, `expandedId` updates to B but A's fetch may resolve and set `expandedDetail` to A's data — showing wrong content.

**Suggested Fix:** Track the expected ID and ignore stale responses:
```tsx
const handleExpand = async (id: string) => {
  if (expandedId === id) { setExpandedId(null); setExpandedDetail(null); return; }
  setExpandedId(id);
  setExpandedDetail(null); // clear stale
  const detail = await getExpeditionStatus(id);
  if (detail.data) {
    setExpandedId(prev => prev === id ? prev : prev); // only set if still viewing same
    setExpandedDetail(detail.data);
  }
};
```

### 4. Unused `guildId` prop in HistoryView
**Severity:** low
**Lines:** 484, 1359

`guildId` is passed to `HistoryView` but never used — `getExpeditionHistory(page)` doesn't take it.

**Suggested Fix:** Remove the `guildId` prop from `HistoryView` and the call site.

---

## UX Issues

### 1. Native `confirm()` dialogs break theme immersion
**Severity:** medium
**Lines:** 301, 334, 366, 447

Four actions use `window.confirm()` — Launch, Force Start, Auto-Resolve, Abandon. These produce unstyled browser dialogs that clash with the RPG pixel theme. The app already has `ConfirmModal` at `components/common/ConfirmModal.tsx`.

**Suggested Fix:** Replace `confirm()` calls with `ConfirmModal` instances, using contextual messaging (e.g. "Abandon this expedition?" with a danger-styled confirm button).

### 2. No loading indicator when expanding history detail
**Severity:** medium
**Lines:** 1377-1386, 1430-1432

Clicking a history expedition fires an async fetch but shows nothing until data arrives. Users have no feedback that anything is happening.

**Suggested Fix:** Show a `<LoadingCard />` inside the expanded section while `expandedId === exp.id && !expandedDetail`:
```tsx
{expandedId === exp.id && (expandedDetail
  ? <HistoryDetailPanel ... />
  : <LoadingCard />
)}
```

### 3. No loading indicator on template switch
**Severity:** low
**Lines:** 922-931

Switching templates via the dropdown triggers an async API call with no visual feedback. The user doesn't know if the switch worked until the next refresh.

**Suggested Fix:** Briefly disable the select or show a spinner/checkmark after `onActivateTemplate` completes.
