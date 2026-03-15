# Frontend Audit: TrainingGrounds

**Component Audited:** `apps/web/src/components/screens/TrainingGrounds.tsx` (410 lines)
**Date:** 2026-03-15

---

## Accessibility

### 1. Variant label not linked to select
**Severity:** low
**Lines:** 325-327, 328-342

The `<label>` for "Variant" isn't linked via `htmlFor`/`id` to the prefix `<select>`.

**Suggested Fix:** Add `htmlFor="training-prefix"` to the label and `id="training-prefix"` to the select.

---

## Component Duplication

No issues found. The `CooldownDisplay` sub-component is well-extracted. While outcome label/color logic appears in multiple screens, each has slightly different values (this one includes 'draw' but not 'fled').

---

## State Issues

### 1. `handleFight` has no try/catch — network errors permanently stuck in "Fighting..." state
**Severity:** medium
**Lines:** 105-131

If `startTrainingFight` at line 117 throws (network error, timeout), the function exits without resetting `trainingState` from `'fighting'`. The button stays permanently disabled showing "Fighting...".

**Suggested Fix:** Wrap the API call in try/catch:
```tsx
const handleFight = useCallback(async () => {
  if (!selectedMob || cooldown > 0 || trainingState === 'fighting') return;
  setTrainingState('fighting');
  setError(null);
  setCombatResult(null);
  // ...
  try {
    const result = await startTrainingFight(selectedMob.id, prefix);
    if (result.error) {
      setError(result.error.message);
      setTrainingState('idle');
      return;
    }
    if (result.data) {
      setCombatResult(result.data.combat);
      setCooldown(result.data.cooldownSeconds);
      onCooldownUpdateRef.current(result.data.cooldownSeconds);
      setTrainingState('playback');
    }
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Training fight failed');
    setTrainingState('idle');
  }
}, [selectedMob, cooldown, trainingState, selectedPrefix]);
```

---

## UX Issues

No issues found. The component has clean phase management (idle → fighting → playback → complete), proper cooldown handling with real-time countdown and parent sync via `queueMicrotask`, good empty state messaging, and the "no rewards" reminder is prominent and clear.
