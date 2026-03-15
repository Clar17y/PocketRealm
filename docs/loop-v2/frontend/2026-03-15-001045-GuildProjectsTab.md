# Frontend Audit: GuildProjectsTab

**Component Audited:** `apps/web/src/components/guild/GuildProjectsTab.tsx` (535 lines)
**Date:** 2026-03-15

---

## Accessibility

### 1. Form labels not linked to inputs
**Severity:** low
**Lines:** 347-357, 373-384, 388-395

The `<label>` elements for turn amount, material select, and quantity input aren't linked via `htmlFor`/`id`. Clicking the label doesn't focus the corresponding input.

**Suggested Fix:** Add matching `htmlFor`/`id` pairs to each label/input set.

---

## Component Duplication

### 1. Perk badge rendering repeated 3 times
**Severity:** medium
**Lines:** 206-208 (completed), 319-322 (active), 465-468 (available)

The perk badge pattern `+{Math.round(perk.value * 100)}% {GUILD_MODIFIER_LABELS[perk.effectType]}` is rendered with slight styling variations across three cards.

**Suggested Fix:** Extract a `<PerkBadges perks={...} variant="gold"|"surface" />` component:
```tsx
function PerkBadges({ perks, variant = 'gold' }: { perks: Array<{ value: number; effectType: string }>; variant?: 'gold' | 'surface' }) {
  const cls = variant === 'gold'
    ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]'
    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]';
  return (
    <div className="flex flex-wrap gap-2">
      {perks.map((perk, i) => (
        <span key={i} className={`text-xs px-2 py-0.5 rounded ${cls}`}>
          +{Math.round(perk.value * 100)}% {GUILD_MODIFIER_LABELS[perk.effectType] ?? perk.effectType}
        </span>
      ))}
    </div>
  );
}
```

---

## State Issues

### 1. `loadProjects` and `loadResourceItems` silently swallow errors
**Severity:** medium
**Lines:** 47, 76

Both functions have `catch { /* */ }` blocks that discard errors. If the API fails, the user sees no feedback — just an empty or stale UI.

**Suggested Fix:** Surface the error via the existing `setError` prop:
```tsx
// loadProjects
} catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Failed to load projects');
} finally {
```

```tsx
// loadResourceItems
} catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Failed to load materials');
}
```

---

## UX Issues

### 1. No error feedback for data load failures
**Severity:** medium
**Lines:** 42-50, 55-77

This is the UX consequence of State Issue #1. If `getGuildProjects` or `getInventory` fails, the user sees either an empty project list or "No matching materials" with no indication that something went wrong.

**Suggested Fix:** After fixing the silent catches, the parent's `ErrorBanner` (rendered by the GuildScreen wrapper) will display the error message.

### 2. Native `confirm()` for project start
**Severity:** low
**Lines:** 80

Uses `window.confirm()` instead of the themed `ConfirmModal` component. The treasury deduction is immediate and non-reversible.

**Suggested Fix:** Use `ConfirmModal` for consistency with the rest of the app, with a warning variant and messaging about the treasury cost.
