# Frontend Audit: GuildSpecializationTab

**Component Audited:** `apps/web/src/components/guild/GuildSpecializationTab.tsx` (305 lines)
**Date:** 2026-03-15

---

## Accessibility

No issues found. Buttons have clear text labels, the tier list uses semantic structure, and the color coding is supplemented with text ("Tier N", "Unlocked", "Active").

---

## Component Duplication

### 1. Bonus badge rendering pattern duplicated from GuildProjectsTab
**Severity:** low
**Lines:** 156-164, 190-194, 274-278

The `+{Math.round(bonus.value * 100)}% {GUILD_MODIFIER_LABELS[bonus.effectType]}` pattern appears three times within this file, and also appears in GuildProjectsTab (identified in its audit as a candidate for a shared `<PerkBadges>` component). The pattern is identical.

**Suggested Fix:** Use the `<PerkBadges>` component proposed in the GuildProjectsTab audit.

---

## State Issues

### 1. `loadSpec` silently swallows errors
**Severity:** medium
**Lines:** 35-43

```tsx
} catch { /* */ } finally {
```

If `getGuildSpecialization` throws a network error, the catch block is empty. The user sees no feedback, and `status` stays as `undefined` or its last value.

**Suggested Fix:** Surface the error:
```tsx
} catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Failed to load specialization');
} finally {
```

### 2. `handleSelect` and `handleRespec` use native `confirm()` instead of `ConfirmModal`
**Severity:** low
**Lines:** 49, 65

Uses `window.confirm()` for destructive/costly guild actions. Inconsistent with the themed `ConfirmModal` used by TalentTree and other components.

**Suggested Fix:** Replace with `ConfirmModal` for visual consistency. These are significant guild decisions with treasury cost implications.

---

## UX Issues

No issues found. Clean layout with proper level-gating, tier progression display, active bonus highlighting, and leader-only action controls. The `SpecTierList` and `SpecPathPreview` sub-components are well-extracted.
