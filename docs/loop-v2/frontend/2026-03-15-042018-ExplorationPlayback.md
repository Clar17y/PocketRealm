# Frontend Audit: ExplorationPlayback

**Component Audited:** `apps/web/src/components/exploration/ExplorationPlayback.tsx` (219 lines)
**Date:** 2026-03-15

---

## Accessibility

### 1. Event markers use emoji with `title` instead of `aria-label`
**Severity:** low
**Lines:** 163-172

Event markers on the progress bar are emoji `<span>` elements with `title` for tooltip but no `aria-label`. Screen readers announce raw emoji text.

**Suggested Fix:** Add `aria-label={event.description}` and `role="img"` to each marker span.

---

## Component Duplication

No issues found. The component is unique — no other code implements turn-by-turn exploration progress with event markers.

---

## State Issues

No issues found. Well-implemented timer-based state machine:
- Phase tracking (`running` → `paused-event` / `paused-combat` → `running` → `complete`) is clean
- `addTimer`/`clearAllTimers` pattern prevents timer leaks on unmount
- `resumeFromCombat` effect correctly resumes after inline combat completes
- `sortedEvents` properly memoized

---

## UX Issues

No issues found. Good visual design with animated progress bar, event markers along the timeline, event popup with reserved min-height (prevents layout shift), combat pause indicator, and skip button. The speed-scaled delays ensure consistent pacing across speed settings.
