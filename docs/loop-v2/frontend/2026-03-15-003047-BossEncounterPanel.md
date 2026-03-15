# Frontend Audit: BossEncounterPanel

**Component Audited:** `apps/web/src/components/BossEncounterPanel.tsx` (487 lines)
**Date:** 2026-03-15

---

## Accessibility

### 1. Boss HP bar and threat bars lack ARIA progressbar
**Severity:** low
**Lines:** 210-218, 277-285

The boss HP progress bar and individual threat bars are pure visual divs with no `role="progressbar"` or `aria-valuenow`. The HP percentage text and threat numbers nearby provide some context.

**Suggested Fix:** Add `role="progressbar"` + `aria-valuenow` + `aria-valuemax` to the outer bar containers.

---

## Component Duplication

### 1. Threat meter duplicated from GuildExpeditionsTab
**Severity:** high
**Lines:** 254-296 (BossEncounterPanel) vs GuildExpeditionsTab:1651-1713 (ThreatMeter component)

Both render the identical pattern: Shield icon + "Threat" header + aggro holder name + a bar list showing name/threat percentage/value. The GuildExpeditionsTab already has this extracted into a `ThreatMeter` component, but BossEncounterPanel reimplements it inline.

**Suggested Fix:** Import and reuse `ThreatMeter` from `GuildExpeditionsTab`, or move it to `components/common/ThreatMeter.tsx`. The data shape would need a light adapter since the boss panel uses `threatStandings` while the expedition tab uses `ExpeditionMemberData[]`.

### 2. Boss effect badges similar to EffectPill in GuildExpeditionsTab
**Severity:** medium
**Lines:** 234-252 (BossEncounterPanel) vs GuildExpeditionsTab:177-204 (EffectPill)

Both render buff/debuff badges with conditional red/blue coloring based on modifier sign. The expedition version adds click-to-expand detail; the boss version is simpler but visually identical.

**Suggested Fix:** Extract a shared `<EffectBadge effect={...} />` component to `components/common/`. The expedition version can extend it with interactivity.

---

## State Issues

### 1. `refresh` sets `loading=true` causing visual flash after actions
**Severity:** medium
**Lines:** 41-50, 92

`refresh()` always sets `setLoading(true)`, which at line 174 replaces the entire panel with "Loading boss encounter..." text. After signup (line 92), this causes a jarring flash.

**Suggested Fix:** Only show full loading on initial mount (when `encounter` is null):
```tsx
const refresh = useCallback(async () => {
  if (!encounter) setLoading(true);  // only flash on initial load
  const res = await getBossEncounter(encounterId);
  // ...
  setLoading(false);
}, [encounterId, encounter]);
```
Or use a separate `initialLoading` flag.

### 2. `handleSignup` has no try/catch — unhandled exceptions
**Severity:** medium
**Lines:** 85-95

If `signUpForBoss` or `refresh()` throws (network error), `setSigning(false)` at line 94 never runs. The button stays permanently disabled.

**Suggested Fix:** Wrap in try/finally:
```tsx
async function handleSignup() {
  setSigning(true);
  setSignupError('');
  try {
    const res = await signUpForBoss(encounterId, autoSignUp);
    if (res.error) {
      setSignupError(res.error.message);
    } else {
      await refresh();
    }
  } catch (err: unknown) {
    setSignupError(err instanceof Error ? err.message : 'Signup failed');
  } finally {
    setSigning(false);
  }
}
```

### 3. Hardcoded stamina/mana max values in participant bars
**Severity:** medium
**Lines:** 447, 454

```tsx
<StatBar current={p.currentStamina} max={100} ... />
<StatBar current={p.currentMana} max={50} ... />
```

All participants are shown with hardcoded `max={100}` stamina and `max={50}` mana regardless of their actual maximum values. Players with different max values (from attributes, gear, or talent nodes) see incorrect bar proportions.

**Suggested Fix:** If the API provides `maxStamina`/`maxMana` per participant, use those. If not, the API response should be extended to include them. As a fallback, hide the bars entirely rather than show misleading data.

---

## UX Issues

### 1. Signup cost hardcoded in button text
**Severity:** low
**Lines:** 334

```tsx
{signing ? 'Signing up...' : 'Sign Up (200 turns)'}
```

The "200 turns" cost is hardcoded. If `BOSS_CONSTANTS.SIGNUP_TURN_COST` changes, this UI string becomes wrong.

**Suggested Fix:** Import the constant and use it:
```tsx
import { BOSS_CONSTANTS } from '@pocketrealm/shared';
// ...
`Sign Up (${BOSS_CONSTANTS.SIGNUP_TURN_COST} turns)`
```
