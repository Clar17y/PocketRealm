# Shared Component Extraction — Design Spec

**Issue:** #148 — Extract shared components identified in frontend audit (Chunk 6)
**Date:** 2026-03-17
**Approach:** Single PR, one commit per extraction, accessibility/perf fixes as final commits

## Scope

6 component extractions, 1 dead code deletion, accessibility fixes, performance fixes.
**Excluded:**
- ThreatMeter — deferred to boss encounter rewrite issue.
- MonsterGrid card pattern (expedition tab vs main bestiary) — medium complexity, lower ROI than the modal extractions. Can be a follow-up.
- ARIA tab roles (`role="tablist"`/`role="tab"`/`aria-selected`) — multiple components affected, warrants its own focused pass.

## 1. Component Extractions

### 1.1 PerkBadges

**File:** `apps/web/src/components/common/PerkBadges.tsx`
**Replaces:** 6 inline instances across GuildProjectsTab (3) and GuildSpecializationTab (3)

```tsx
interface PerkBadgesProps {
  perks: { effectType: string; value: number }[];
  variant: 'gold' | 'surface' | 'custom';
  color?: string;       // required when variant is 'custom'
  bgColor?: string;     // required when variant is 'custom'
}
```

Renders `+{Math.round(perk.value * 100)}% {GUILD_MODIFIER_LABELS[perk.effectType] ?? perk.effectType}` badge pattern. `'gold'` and `'surface'` variants use preset colors. `'custom'` variant accepts `color` and `bgColor` props for dynamic per-path styling (used by GuildSpecializationTab where colors come from `PATH_COLORS`).

### 1.2 ContributionList

**File:** `apps/web/src/components/common/ContributionList.tsx`
**Replaces:** 3-4 inline copies within GuildExpeditionsTab

```tsx
interface ContributionListProps {
  participants: { playerId: string; username?: string | null; totalDamage: number; totalHealing: number }[];
  limit?: number;
}
```

Sorts participants by `totalDamage + totalHealing` descending (using `[...participants].sort()` to avoid mutating the prop array — fixes an existing state mutation bug), renders ranked list with name, damage, and healing values. Display name uses `username ?? playerId.slice(0, 8)` fallback, centralized in the component. Optional `limit` truncates the list.

### 1.3 SkillHeader

**File:** `apps/web/src/components/common/SkillHeader.tsx`
**Replaces:** Identical ~15-line blocks in Crafting.tsx and Gathering.tsx

```tsx
interface SkillHeaderProps {
  skillName: string;
  skillLevel: number;
  xpRate: number;
}
```

Renders skill name heading + gold "Lv. X" badge + right-aligned XP rate with `XpRateTooltip`.

### 1.4 CopyButton

**File:** `apps/web/src/components/common/CopyButton.tsx`
**Replaces:** Identical handlers in CombatHistory.tsx and CombatScreen.tsx

```tsx
interface CopyButtonProps {
  text: string;
  label?: string; // defaults to "Copy Log"
}
```

Encapsulates `copyState` state machine (`idle` → `copied` → `error`), `navigator.clipboard.writeText()`, and timeout reset. Renders a button with contextual label.

### 1.5 Bestiary Composition Components

**Directory:** `apps/web/src/components/common/bestiary/`
**Replaces:** 3 near-identical modal variants in Bestiary.tsx (60-200 lines each)

#### BestiaryModalShell

```tsx
interface BestiaryModalShellProps {
  name: string;
  imageSrc: string;
  onClose: () => void;
  children: ReactNode;
}
```

Wraps `ModalOverlay` + `PixelCard` + header (image, name, close X button) + children slot + footer close button. Each modal composes unique content inside the shell.

#### RotationDisplay

```tsx
interface RotationDisplayProps {
  rotation: { round: number; actionName: string; targetMode: string; isTelegraphed?: boolean }[];
}
```

Renders round-by-round rotation: `R{n} actionName (AoE/Single)`. Telegraphed actions render with bold red styling (used by world boss modals).

#### MonsterStatBlock

```tsx
interface MonsterStatBlockProps {
  stats: { icon: ReactNode; label: string; value: string | number; hidden?: boolean }[];
}
```

Renders icon + label + value rows for monster stats (HP, attack, defence, etc.). When `hidden` is true, displays "???" with dimmed opacity instead of the actual value — used by the main bestiary modal for kill-count-gated stat visibility.

### 1.6 Turn Presets in Exploration

**No new component.** Replace the hardcoded preset buttons in `Exploration.tsx` (lines 307-334) with the existing `TurnPresets` component from `components/common/TurnPresets.tsx`, already used in Gathering. Note: the fourth button is "Max" (using `EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS`), not a fixed number — ensure `TurnPresets` supports this.

## 2. Dead Code Removal

### CombatLog

**File:** `apps/web/src/components/screens/CombatLog.tsx` (214 lines)

No active imports found in the codebase. However, `components/screens/index.ts` re-exports it — that barrel export must also be removed. Props interface expects a round-based message format incompatible with the current combat system (which uses `CombatPlayback` + `CombatLogEntry` + `CombatRewardsSummary`). Delete the file and remove the barrel export.

## 3. Accessibility Fixes

### 3.1 ARIA `role="progressbar"`

Add `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax` to 6 progress bar elements across the codebase.

### 3.2 `aria-expanded`

Add `aria-expanded` to 4 collapsible section toggle buttons, reflecting open/closed state.

### 3.3 `htmlFor`/`id` linking

Add matching `htmlFor` on `<label>` elements and `id` on associated inputs across 7 files.

## 4. Performance Fixes

### useMemo on sort operations

Wrap 4 inline `.sort()` calls in `useMemo` with appropriate dependency arrays to prevent recomputation on every render.

## Commit Strategy

One commit per logical unit:
1. `PerkBadges` extraction
2. `ContributionList` extraction
3. `SkillHeader` extraction
4. `CopyButton` extraction
5. Bestiary composition components (`BestiaryModalShell`, `RotationDisplay`, `MonsterStatBlock`)
6. `TurnPresets` swap in Exploration
7. Delete `CombatLog` dead code
8. Accessibility fixes (progressbar, aria-expanded, htmlFor/id)
9. Performance fixes (useMemo on sorts)

## Design Decisions

- **Composition over configuration** for Bestiary modals — the three modals vary significantly in content (60 vs 200 lines), so composable building blocks are better than a single component with conditional props.
- **ThreatMeter excluded** — data shape differs between GuildExpeditionsTab and BossEncounterPanel, and boss encounters are being rewritten in a separate issue. Extraction deferred to that work.
- **New components go in `components/common/`** — follows the existing pattern (TurnPresets, ConfirmModal, SubNav, etc.). Bestiary-specific pieces get a subdirectory since there are 3 related components.
- **Props use generic shapes** — components accept simple typed props rather than importing feature-specific types, keeping them decoupled.
