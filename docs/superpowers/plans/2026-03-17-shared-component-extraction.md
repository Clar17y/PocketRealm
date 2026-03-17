# Shared Component Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract 6 shared components, delete dead code, and fix accessibility/performance issues identified in the frontend audit (issue #148).

**Architecture:** Each extraction creates a new reusable component in `apps/web/src/components/common/`, then replaces all duplicate inline instances. Bestiary components get their own subdirectory. All new components follow the existing pattern (typed props, RPG CSS variables, no side effects).

**Tech Stack:** React, TypeScript, Tailwind CSS with RPG CSS variables

**Spec:** `docs/superpowers/specs/2026-03-17-shared-component-extraction-design.md`

---

## Chunk 1: Simple Extractions (PerkBadges, SkillHeader, CopyButton)

### Task 1: Extract PerkBadges component

**Files:**
- Create: `apps/web/src/components/common/PerkBadges.tsx`
- Modify: `apps/web/src/components/guild/GuildProjectsTab.tsx:210-214, 334-340, 481-485`
- Modify: `apps/web/src/components/guild/GuildSpecializationTab.tsx:175-183, 209-213, 294-298`

**Context:** `GUILD_MODIFIER_LABELS` is imported from `@/lib/api/guild` in both consumer files. The badge pattern is identical across all 6 instances: `+{Math.round(perk.value * 100)}% {GUILD_MODIFIER_LABELS[perk.effectType] ?? perk.effectType}`. Styling varies: gold bg, surface bg, or dynamic per-path colors from `PATH_COLORS`.

- [ ] **Step 1: Create PerkBadges component**

Create `apps/web/src/components/common/PerkBadges.tsx`:

```tsx
'use client';

import { GUILD_MODIFIER_LABELS } from '@/lib/api/guild';

interface Perk {
  effectType: string;
  value: number;
}

interface PerkBadgesProps {
  perks: Perk[];
  variant: 'gold' | 'surface' | 'custom';
  color?: string;
  bgColor?: string;
  size?: 'xs' | 'sm' | 'md';
  goldOpacity?: 10 | 20;
}

export function PerkBadges({ perks, variant, color, bgColor, size = 'xs', goldOpacity = 20 }: PerkBadgesProps) {
  const sizeClasses = {
    xs: 'text-[10px] px-1 py-0.5',
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }[size];

  const getStyle = (): { className: string; style?: React.CSSProperties } => {
    switch (variant) {
      case 'gold':
        return { className: `${sizeClasses} rounded bg-[var(--rpg-gold)]/${goldOpacity} text-[var(--rpg-gold)]` };
      case 'surface':
        return { className: `${sizeClasses} rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]` };
      case 'custom':
        return {
          className: `${sizeClasses} rounded`,
          style: { backgroundColor: `${bgColor}20`, color },
        };
    }
  };

  const { className, style } = getStyle();

  return (
    <>
      {perks.map((perk, i) => (
        <span key={i} className={className} style={style}>
          +{Math.round(perk.value * 100)}% {GUILD_MODIFIER_LABELS[perk.effectType] ?? perk.effectType}
        </span>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Replace instances in GuildProjectsTab.tsx**

In `apps/web/src/components/guild/GuildProjectsTab.tsx`:

Add import: `import { PerkBadges } from '@/components/common/PerkBadges';`

Replace **lines 210-214** (Completed Projects perks) with:
```tsx
<PerkBadges perks={proj.perks} variant="gold" size="md" />
```

Replace **lines 334-340** (Active Project perks) with:
```tsx
<div className="mt-3 flex flex-wrap gap-2">
  <PerkBadges perks={project.perks} variant="surface" size="md" />
</div>
```

Replace **lines 481-485** (Available Project perks — note: uses `/10` opacity, not `/20`) with:
```tsx
<PerkBadges perks={project.perks} variant="gold" size="sm" goldOpacity={10} />
```

Remove the `GUILD_MODIFIER_LABELS` import if no other usage remains in the file.

- [ ] **Step 3: Replace instances in GuildSpecializationTab.tsx**

In `apps/web/src/components/guild/GuildSpecializationTab.tsx`:

Add import: `import { PerkBadges } from '@/components/common/PerkBadges';`

Replace **lines 175-183** (Active Bonuses) with:
```tsx
<PerkBadges perks={status.bonuses} variant="custom" color={colors.primary} bgColor={colors.bg} size="md" />
```

Replace **lines 209-213** (Next Tier bonuses — uses `text-[10px] px-1.5`) with:
```tsx
<PerkBadges perks={status.nextTier.bonuses} variant="surface" size="sm" />
```

Replace **lines 294-298** (SpecTierList bonuses — uses `text-[10px] px-1`) with:
```tsx
<PerkBadges perks={tier.bonuses} variant="surface" />
```

Remove the `GUILD_MODIFIER_LABELS` import if no other usage remains.

- [ ] **Step 4: Verify build**

Run: `npm run typecheck`
Expected: No new errors (pre-existing error in `apps/web/src/app/game/page.tsx:333` is acceptable).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/PerkBadges.tsx apps/web/src/components/guild/GuildProjectsTab.tsx apps/web/src/components/guild/GuildSpecializationTab.tsx
git commit -m "refactor: extract PerkBadges shared component (#148)"
```

---

### Task 2: Extract SkillHeader component

**Files:**
- Create: `apps/web/src/components/common/SkillHeader.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx:122-136`
- Modify: `apps/web/src/components/screens/Gathering.tsx:219-233`

**Context:** Both files import `xpRateColor` from `@/lib/format` and render `XpRateTooltip` from `@/components/common/XpRateTooltip`. The blocks are identical.

- [ ] **Step 1: Create SkillHeader component**

Create `apps/web/src/components/common/SkillHeader.tsx`:

```tsx
'use client';

import { xpRateColor } from '@/lib/format';
import { XpRateTooltip } from '@/components/common/XpRateTooltip';

interface SkillHeaderProps {
  skillName: string;
  skillLevel: number;
  xpRate: number;
}

export function SkillHeader({ skillName, skillLevel, xpRate }: SkillHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">{skillName}</h2>
        <div className="px-2 py-1 bg-[var(--rpg-gold)] rounded text-[var(--rpg-background)] text-[12px] font-pixel">
          Lv. {skillLevel}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-[var(--rpg-text-secondary)] flex items-center justify-end gap-1">
          XP Rate
          <XpRateTooltip />
        </div>
        <div className="text-[12px] font-pixel" style={{ color: xpRateColor(xpRate) }}>{xpRate}%</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace in Crafting.tsx**

In `apps/web/src/components/screens/Crafting.tsx`:

Add import: `import { SkillHeader } from '@/components/common/SkillHeader';`

Replace **lines 122-136** with:
```tsx
<SkillHeader skillName={skillName} skillLevel={skillLevel} xpRate={xpRate} />
```

Remove unused imports: `xpRateColor` from `@/lib/format` and `XpRateTooltip` if no longer used directly.

- [ ] **Step 3: Replace in Gathering.tsx**

In `apps/web/src/components/screens/Gathering.tsx`:

Add import: `import { SkillHeader } from '@/components/common/SkillHeader';`

Replace **lines 219-233** with:
```tsx
<SkillHeader skillName={skillName} skillLevel={skillLevel} xpRate={xpRate} />
```

Remove `xpRateColor` from the existing `{ titleCaseFromSnake, xpRateColor }` import (keep `titleCaseFromSnake`). Remove `XpRateTooltip` import if no longer used directly.

- [ ] **Step 4: Verify build**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/SkillHeader.tsx apps/web/src/components/screens/Crafting.tsx apps/web/src/components/screens/Gathering.tsx
git commit -m "refactor: extract SkillHeader shared component (#148)"
```

---

### Task 3: Extract CopyButton component

**Files:**
- Create: `apps/web/src/components/common/CopyButton.tsx`
- Modify: `apps/web/src/components/screens/CombatHistory.tsx:286-297, 451-459`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx:199-211, 405-412`

**Context:** Both files have identical `handleCopyShare` + `copyState` state + button rendering. CombatScreen calls `buildShareText()` to get the text; CombatHistory uses `shareText` directly. The new component accepts pre-built text.

- [ ] **Step 1: Create CopyButton component**

Create `apps/web/src/components/common/CopyButton.tsx`:

```tsx
'use client';

import { useState, useCallback } from 'react';

interface CopyButtonProps {
  text: string | undefined;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function CopyButton({ text, label = 'Copy Log', disabled, className }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [text]);

  const buttonLabel = copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled || !text}
      className={className ?? 'px-2.5 py-1.5 rounded border border-[var(--rpg-border)] text-xs text-[var(--rpg-text-primary)] disabled:opacity-40'}
      title={`Copy formatted log for sharing`}
    >
      {buttonLabel}
    </button>
  );
}
```

- [ ] **Step 2: Replace in CombatHistory.tsx**

In `apps/web/src/components/screens/CombatHistory.tsx`:

Add import: `import { CopyButton } from '@/components/common/CopyButton';`

Remove the `handleCopyShare` callback (**lines 286-297**) and `copyState` state declaration.

Replace the button at **lines 451-459** with:
```tsx
<CopyButton text={shareText} disabled={!selectedDetail} />
```

- [ ] **Step 3: Replace in CombatScreen.tsx**

In `apps/web/src/app/game/screens/CombatScreen.tsx`:

Add import: `import { CopyButton } from '@/components/common/CopyButton';`

Remove the `handleCopyShare` callback (**lines 199-211**) and `copyState` state declaration.

Replace the button and its wrapper div at **lines 404-413** with:
```tsx
<div className="flex justify-end">
  <CopyButton text={buildShareText()} />
</div>
```

Note: `buildShareText()` is called at render time here. The existing code calls it only on click inside `handleCopyShare`. If this causes performance issues, the caller can memoize the text with `useMemo`. The function is already a `useCallback` so it is cheap to call.

- [ ] **Step 4: Verify build**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/CopyButton.tsx apps/web/src/components/screens/CombatHistory.tsx apps/web/src/app/game/screens/CombatScreen.tsx
git commit -m "refactor: extract CopyButton shared component (#148)"
```

---

## Chunk 2: ContributionList & TurnPresets Swap

### Task 4: Extract ContributionList component

**Files:**
- Create: `apps/web/src/components/common/ContributionList.tsx`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx:1581-1598, 1664-1680, 1695-1711`

**Context:** All 3 instances sort participants by `totalDamage + totalHealing` descending and render ranked rows with damage/healing values. Uses `formatNumber` from `@/lib/format`. All existing instances use `[...array].sort()` (spread-copy), so there is no mutation bug — but the new component centralizes the pattern and adds `useMemo` for performance. Each instance is wrapped in a `<div className="space-y-0.5">` container and a guard condition — the component should include the wrapper div.

- [ ] **Step 1: Create ContributionList component**

Create `apps/web/src/components/common/ContributionList.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { formatNumber } from '@/lib/format';

interface Participant {
  playerId: string;
  username?: string | null;
  totalDamage: number;
  totalHealing: number;
}

interface ContributionListProps {
  participants: Participant[];
  limit?: number;
}

export function ContributionList({ participants, limit }: ContributionListProps) {
  const sorted = useMemo(
    () =>
      [...participants]
        .sort((a, b) => (b.totalDamage + b.totalHealing) - (a.totalDamage + a.totalHealing))
        .slice(0, limit ?? participants.length),
    [participants, limit],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {sorted.map((m, i) => (
        <div key={m.playerId} className="flex justify-between text-xs">
          <span className="text-[var(--rpg-text-secondary)]">
            <span className="text-[var(--rpg-gold)] font-bold w-4 inline-block">{i + 1}.</span>
            {m.username ?? m.playerId.slice(0, 8)}
          </span>
          <div className="flex gap-2 text-[10px]">
            <span className="text-[var(--rpg-red)]">{formatNumber(m.totalDamage)} dmg</span>
            {m.totalHealing > 0 && (
              <span className="text-[var(--rpg-green-light)]">{formatNumber(m.totalHealing)} heal</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Replace all 3 instances in GuildExpeditionsTab.tsx**

In `apps/web/src/components/guild/GuildExpeditionsTab.tsx`:

Add import: `import { ContributionList } from '@/components/common/ContributionList';`

Replace the sort+map block at **lines 1581-1598** (Summary Panel) with `<ContributionList>`. Preserve the surrounding guard condition (`attempt.participants && attempt.participants.length > 0`) and any `<h4>` heading — only replace the `[...attempt.participants].sort(...).map(...)` block and its wrapping `<div className="space-y-0.5">`:
```tsx
<ContributionList participants={attempt.participants} />
```

Replace the sort+map block at **lines 1664-1680** (Detail Panel per-attempt) similarly:
```tsx
<ContributionList participants={attempt.participants} />
```

Replace the sort+map block at **lines 1695-1711** (Fallback for old expeditions) similarly:
```tsx
<ContributionList participants={members} />
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck`
Expected: No new errors. The `Participant` interface matches the existing data shape (`playerId`, `username`, `totalDamage`, `totalHealing` are all present on the expedition member objects).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/common/ContributionList.tsx apps/web/src/components/guild/GuildExpeditionsTab.tsx
git commit -m "refactor: extract ContributionList shared component (#148)"
```

---

### Task 5: Swap TurnPresets in Exploration

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx:307-334`
- Reference: `apps/web/src/components/common/TurnPresets.tsx` (existing, no changes needed)

**Context:** TurnPresets component already exists and is used in Gathering.tsx. Its interface accepts `presets: { label: string; turns: number; disabled?: boolean }[]`, `currentValue`, and `onChange`. Exploration has 4 hardcoded buttons (100, 500, 1K, Max) that should use this component instead. The "Max" button uses `EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS`.

- [ ] **Step 1: Replace hardcoded buttons in Exploration.tsx**

In `apps/web/src/components/screens/Exploration.tsx`:

Add import: `import { TurnPresets } from '@/components/common/TurnPresets';`

Replace **lines 307-334** (the hardcoded button group) with:
```tsx
{!tutorialLocked && (
  <TurnPresets
    presets={[
      { label: '100', turns: Math.min(100, availableTurns) },
      { label: '500', turns: Math.min(500, availableTurns) },
      { label: '1K', turns: Math.min(1000, availableTurns) },
      { label: 'Max', turns: Math.min(EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS, availableTurns) },
    ]}
    currentValue={turnInvestment[0]}
    onChange={(t) => setTurnInvestment([t])}
  />
)}
```

- [ ] **Step 2: Verify build**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx
git commit -m "refactor: use existing TurnPresets component in Exploration (#148)"
```

---

## Chunk 3: Bestiary Composition Components

### Task 6: Create Bestiary composition components and refactor modals

**Files:**
- Create: `apps/web/src/components/common/bestiary/BestiaryModalShell.tsx`
- Create: `apps/web/src/components/common/bestiary/RotationDisplay.tsx`
- Create: `apps/web/src/components/common/bestiary/MonsterStatBlock.tsx`
- Create: `apps/web/src/components/common/bestiary/index.ts`
- Modify: `apps/web/src/components/screens/Bestiary.tsx:271-336, 399-463, 608-812`

**Context:** Bestiary.tsx contains 3 modal variants that share a common shell (ModalOverlay → PixelCard → header → close), rotation display, and stat block patterns. The main modal (lines 608-812) is the most complex with kill-count-gated visibility via `getStatsVisibility()`. The expedition modal (271-336) and world boss modal (399-463) are simpler.

Read the following files before starting implementation:
- `apps/web/src/components/screens/Bestiary.tsx` — all 3 modals and helper functions
- `apps/web/src/components/common/bestiary/` — target directory (will be created)

- [ ] **Step 1: Read Bestiary.tsx thoroughly**

**CRITICAL:** Before creating any components, read `apps/web/src/components/screens/Bestiary.tsx` in full. Pay close attention to:
- The exact imports used (e.g., `Image` from `next/image`, `X` from `lucide-react`, `PixelButton`, `PixelCard`)
- The exact modal shell structure shared across all 3 modals (ModalOverlay → PixelCard → header → content → footer)
- The exact classes on each element (e.g., `max-w-sm` not `max-w-md`, image dimensions, gap sizes)
- The close icon (likely `<X size={20}>` from lucide-react, not a text "✕")
- The footer close button (likely `<PixelButton variant="secondary">`, not a plain `<button>`)

The code snippets below are **structural guides only** — you MUST match the actual code from Bestiary.tsx.

- [ ] **Step 2: Create BestiaryModalShell**

Create `apps/web/src/components/common/bestiary/BestiaryModalShell.tsx`. This wraps the common shell pattern: `ModalOverlay` → `PixelCard` → header (image, name, close button) → `children` → footer close button.

Structure (adapt exact classes/components from Bestiary.tsx):

```tsx
'use client';

import { ReactNode } from 'react';
// Use the exact imports from Bestiary.tsx — likely includes:
// import Image from 'next/image';
// import { X } from 'lucide-react';
// import { ModalOverlay } from '@/components/ModalOverlay';
// import { PixelCard } from '@/components/PixelCard';
// import { PixelButton } from '@/components/PixelButton';

interface BestiaryModalShellProps {
  name: string;
  imageSrc: string;
  onClose: () => void;
  children: ReactNode;
}

export function BestiaryModalShell({ name, imageSrc, onClose, children }: BestiaryModalShellProps) {
  // Match the exact ModalOverlay → PixelCard → header → children → footer
  // pattern from any of the 3 existing modals in Bestiary.tsx.
  // Use the actual classes, components, and element structure.
}
```

- [ ] **Step 3: Create RotationDisplay**

Create `apps/web/src/components/common/bestiary/RotationDisplay.tsx`. This renders the round-by-round attack rotation used by the expedition and world boss modals.

**Scope note:** The main bestiary modal (lines ~763-796) has a different rotation pattern that iterates `totalRounds` and shows "???" for unrevealed rounds based on kill count. This pattern is too different to share — only the expedition and world boss modals use `RotationDisplay`. The main modal keeps its rotation rendering inline.

Structure (adapt exact classes from Bestiary.tsx lines 315-330, 442-457):

```tsx
'use client';

interface RotationAction {
  round: number;
  actionName: string;
  targetMode: string;
  isTelegraphed?: boolean;
}

interface RotationDisplayProps {
  rotation: RotationAction[];
  title?: string;
}

export function RotationDisplay({ rotation, title = 'Attack Rotation' }: RotationDisplayProps) {
  // Match the exact layout from Bestiary.tsx expedition/boss rotation sections.
  // The actual code uses a flex layout with multiple spans per action row,
  // not a single div. Read lines 315-330 and 442-457 for the exact structure.
}
```

- [ ] **Step 4: Create MonsterStatBlock**

Create `apps/web/src/components/common/bestiary/MonsterStatBlock.tsx`. This renders icon + label + value rows for monster stats.

Structure (adapt exact classes from Bestiary.tsx lines 295-310, 422-440, 655-708):

```tsx
'use client';

import { ReactNode } from 'react';

interface StatRow {
  icon: ReactNode;
  label: string;
  value: string | number;
  hidden?: boolean;
}

interface MonsterStatBlockProps {
  stats: StatRow[];
}

export function MonsterStatBlock({ stats }: MonsterStatBlockProps) {
  // Match the exact layout from Bestiary.tsx stat rendering.
  // The actual code uses gap-3 (not gap-2), and may combine label+value
  // in a single span. Read the source for the exact structure.
  // When hidden is true, display "???" with dimmed opacity.
}
```

- [ ] **Step 5: Create barrel export**

Create `apps/web/src/components/common/bestiary/index.ts`:

```tsx
export { BestiaryModalShell } from './BestiaryModalShell';
export { RotationDisplay } from './RotationDisplay';
export { MonsterStatBlock } from './MonsterStatBlock';
```

- [ ] **Step 6: Refactor Expedition Bestiary Modal (lines 271-336)**

In `apps/web/src/components/screens/Bestiary.tsx`:

Add import: `import { BestiaryModalShell, RotationDisplay, MonsterStatBlock } from '@/components/common/bestiary';`

Refactor the expedition bestiary modal to compose the shared components. The modal's unique content (expedition-specific stats, kill count badge) stays inline as children of `BestiaryModalShell`.

Read the exact modal code at lines 271-336 and refactor it to use the three building blocks. Keep any unique content as `children`.

- [ ] **Step 7: Refactor World Boss Modal (lines 399-463)**

Same approach: wrap in `BestiaryModalShell`, extract rotation into `RotationDisplay`, extract stats into `MonsterStatBlock`. Keep boss-specific content (defeat count, participant count) as children.

- [ ] **Step 8: Refactor Main Bestiary Modal (lines 608-812)**

This is the most complex modal. Uses `getStatsVisibility()` to gate stat visibility. Refactor to:
- Wrap in `BestiaryModalShell`
- Use `MonsterStatBlock` with `hidden` prop driven by `getStatsVisibility()`
- Keep the rotation section **inline** — it has a different pattern (iterates `totalRounds`, shows "???" for unrevealed rounds) that is incompatible with `RotationDisplay`
- Keep the drops section and any other unique content inline

`getStatsVisibility()` helper function (around line 476) stays in Bestiary.tsx — it's only used by this modal.

- [ ] **Step 9: Verify build**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/common/bestiary/ apps/web/src/components/screens/Bestiary.tsx
git commit -m "refactor: extract Bestiary composition components (#148)

Extract BestiaryModalShell, RotationDisplay, MonsterStatBlock from 3
near-identical modal variants in Bestiary.tsx."
```

---

## Chunk 4: Dead Code Removal, Accessibility & Performance Fixes

### Task 7: Delete CombatLog dead code

**Files:**
- Delete: `apps/web/src/components/screens/CombatLog.tsx`
- Modify: `apps/web/src/components/screens/index.ts` (remove barrel export on line 3)

- [ ] **Step 1: Remove barrel export**

In `apps/web/src/components/screens/index.ts`, remove the line:
```tsx
export { CombatLog } from './CombatLog';
```

- [ ] **Step 2: Delete the file**

Delete `apps/web/src/components/screens/CombatLog.tsx`.

- [ ] **Step 3: Verify no imports break**

Run: `npm run typecheck`
Expected: No errors. If any file imports `CombatLog`, it was not truly dead code — investigate and fix.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/screens/CombatLog.tsx apps/web/src/components/screens/index.ts
git commit -m "refactor: remove dead CombatLog component (#148)"
```

---

### Task 8: Accessibility fixes

**Files:**
- Modify: `apps/web/src/components/guild/GuildProjectsTab.tsx` (lines 300, 320 — progress bars; lines 346-380 — aria-expanded; lines 363, 389, 404 — htmlFor/id)
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` (lines 147, 922 — progress bars; line 994 — htmlFor/id)
- Modify: `apps/web/src/components/screens/Gathering.tsx` (line 320 — progress bar)
- Modify: `apps/web/src/components/screens/Exploration.tsx` (line 227 — progress bar)
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx` (lines 397-402 — aria-expanded)

Read each file before modifying to verify exact locations. Line numbers may have shifted due to earlier tasks.

- [ ] **Step 1: Add `role="progressbar"` to 6 progress bar elements**

For each progress bar div, add:
```tsx
role="progressbar"
aria-valuenow={currentValue}
aria-valuemin={0}
aria-valuemax={maxValue}
```

Where `currentValue` and `maxValue` come from the existing percentage calculation already in the element's `style.width`.

Files: GuildProjectsTab.tsx (2), GuildExpeditionsTab.tsx (2), Gathering.tsx (1), Exploration.tsx (1).

- [ ] **Step 2: Add `aria-expanded` to 3 collapsible section toggles**

For each toggle button, add `aria-expanded={isExpanded}` where `isExpanded` is the existing state variable controlling the section.

Files: GuildProjectsTab.tsx (2), CombatScreen.tsx (1).

**Note:** Bestiary.tsx lines 509-523 are tab navigation buttons, not collapsible toggles — do NOT add `aria-expanded` there (that's an ARIA tab role fix, which is out of scope for this issue).

- [ ] **Step 3: Add `htmlFor`/`id` to labels and inputs**

Search for `<label` elements without `htmlFor` in the files modified by this PR. The highest-priority targets are in `GuildProjectsTab.tsx` (lines 363, 389, 404) and `GuildExpeditionsTab.tsx` (line 994). Also check: `GuildSettings.tsx`, `NoGuildView.tsx`, `Casino.tsx`, `MailScreen.tsx`, `Templates.tsx`, `TrainingGrounds.tsx`.

For each `<label>`/input pair, add matching `htmlFor` and `id`. Example:

```tsx
<label htmlFor="contribute-amount" className="...">Amount (max ...)</label>
<input id="contribute-amount" ... />
```

Focus on files already touched by this PR first. For files not otherwise modified, add `htmlFor`/`id` only if the fix is straightforward.

- [ ] **Step 4: Verify build**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/guild/GuildProjectsTab.tsx apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/components/screens/Gathering.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/screens/CombatScreen.tsx
# Also git add any other files where htmlFor/id was added
git commit -m "fix(a11y): add progressbar roles, aria-expanded, htmlFor/id (#148)"
```

---

### Task 9: Performance fixes — useMemo on sort operations

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` (line 1903 — remaining sort after ContributionList extraction)
- Modify: `apps/web/src/components/screens/Bestiary.tsx` (line ~471 — unmemoized `sortedMonsters` sort)

**Context:** 3 of the 4 original `.sort()` calls in GuildExpeditionsTab were in the ContributionList extraction sites — those are now handled by the `useMemo` inside `ContributionList`. The remaining sort at line 1903 is a different sort (damage-only ranking). Additionally, Bestiary.tsx has an unmemoized `[...monsters].sort()` at ~line 471 that runs on every render.

Read each file to identify any remaining inline `.sort()` calls in render context that aren't wrapped in `useMemo`.

- [ ] **Step 1: Wrap remaining sort(s) in useMemo**

For each remaining inline `.sort()` call in a render function, wrap in `useMemo`:

```tsx
const sortedMembers = useMemo(
  () => [...members].sort((a, b) => b.totalDamage - a.totalDamage),
  [members],
);
```

Then use `sortedMembers` in the JSX instead of the inline sort.

- [ ] **Step 2: Wrap Bestiary.tsx sort in useMemo**

In `apps/web/src/components/screens/Bestiary.tsx`, ~line 471:
```tsx
const sortedMonsters = useMemo(
  () => [...monsters].sort((a, b) => Number(b.isDiscovered) - Number(a.isDiscovered)),
  [monsters],
);
```

- [ ] **Step 3: Check other files for unmemoized sorts**

Search for `.sort(` in render contexts across all files modified by this PR. If any additional sorts are found that aren't wrapped in `useMemo`, wrap them too. Specifically check: GuildExpeditionsTab.tsx, GuildProjectsTab.tsx, GuildSpecializationTab.tsx, Bestiary.tsx.

- [ ] **Step 4: Verify build**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/components/screens/Bestiary.tsx
# Also git add any other files where sorts were memoized
git commit -m "perf: wrap inline sort operations in useMemo (#148)"
```
