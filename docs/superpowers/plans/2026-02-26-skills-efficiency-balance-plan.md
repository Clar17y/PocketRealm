# Skills & Efficiency Balance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Retune the XP efficiency system so it's meaningful at higher levels, consistent across all skills, clearly named, visible everywhere XP is earned, and explained to new players.

**Architecture:** Six changes across game-engine (pure logic), API (gathering XP formula), and frontend (rename, visibility, tutorial, error UX). Backend changes are minimal — one constant addition and one formula swap. Frontend changes touch SkillCard, Gathering, Exploration, CombatScreen, CombatRewardsSummary, and the global error display in page.tsx.

**Tech Stack:** TypeScript, Vitest (game-engine tests), React/Next.js (frontend components), Tailwind CSS

**Design doc:** `docs/superpowers/specs/2026-02-26-skills-efficiency-balance-design.md`

---

### Task 1: Add Gathering XP Scaling Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:176-185`

**Step 1: Add XP scaling constants to GATHERING_CONSTANTS**

In `packages/shared/src/constants/gameConstants.ts`, add two new fields to `GATHERING_CONSTANTS`:

```typescript
export const GATHERING_CONSTANTS = {
  BASE_TURN_COST: 30,
  BASE_YIELD: 1,
  YIELD_MULTIPLIER_PER_LEVEL: 0.1,
  XP_PER_ACTION_BASE: 5,
  XP_LEVEL_SCALING_DIVISOR: 4,
} as const;
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add gathering XP scaling constants"
```

---

### Task 2: Remove Binary Combat Efficiency (Game Engine + Tests)

**Files:**
- Modify: `packages/game-engine/src/skills/xpCalculator.ts:60-77`
- Modify: `packages/game-engine/src/skills/xpCalculator.test.ts:158-230`

**Step 1: Update tests to expect gradual decay for combat skills**

In `packages/game-engine/src/skills/xpCalculator.test.ts`, replace the `calculateEfficiency` describe block (lines 158-187):

```typescript
describe('calculateEfficiency', () => {
  it('returns 1 when no XP has been gained', () => {
    expect(calculateEfficiency(0, 'mining')).toBe(1);
    expect(calculateEfficiency(0, 'melee')).toBe(1);
  });

  it('returns 0 when at or above cap', () => {
    const combatCap = getWindowCap('melee');
    expect(calculateEfficiency(combatCap, 'melee')).toBe(0);
    expect(calculateEfficiency(combatCap + 100, 'melee')).toBe(0);

    const gatherCap = getWindowCap('mining');
    expect(calculateEfficiency(gatherCap, 'mining')).toBe(0);
    expect(calculateEfficiency(gatherCap + 100, 'mining')).toBe(0);
  });

  it('all skills have diminishing returns (quadratic decay)', () => {
    // Combat skill
    const combatCap = getWindowCap('melee');
    const combatHalf = Math.floor(combatCap / 2);
    const combatEff = calculateEfficiency(combatHalf, 'melee');
    expect(combatEff).toBeGreaterThan(0);
    expect(combatEff).toBeLessThan(1);
    // At 50% of cap, quadratic decay: 1 - 0.5^2 = 0.75
    expect(combatEff).toBeCloseTo(0.75, 1);

    // Gathering skill
    const gatherCap = getWindowCap('mining');
    const gatherHalf = Math.floor(gatherCap / 2);
    const gatherEff = calculateEfficiency(gatherHalf, 'mining');
    expect(gatherEff).toBeGreaterThan(0);
    expect(gatherEff).toBeLessThan(1);
    expect(gatherEff).toBeCloseTo(0.75, 1);
  });

  it('efficiency decreases as XP gained increases', () => {
    const cap = getWindowCap('melee');
    const eff25 = calculateEfficiency(Math.floor(cap * 0.25), 'melee');
    const eff50 = calculateEfficiency(Math.floor(cap * 0.50), 'melee');
    const eff75 = calculateEfficiency(Math.floor(cap * 0.75), 'melee');
    expect(eff25).toBeGreaterThan(eff50);
    expect(eff50).toBeGreaterThan(eff75);
    expect(eff75).toBeGreaterThan(0);
  });
});
```

Also update the `applyXpGain` tests — the test on line 217-221 (`reports atDailyCap when window becomes exhausted`) needs updating because with gradual decay, `cap - 50` raw XP won't necessarily exhaust the window. Replace:

```typescript
  it('reports atDailyCap when window becomes exhausted', () => {
    const cap = getWindowCap('mining'); // use non-combat for predictable behavior
    // When windowXpGained + xpAfterEfficiency >= cap, atDailyCap should be true
    const result = applyXpGain(0, 1, cap, 50, 'mining');
    expect(result.atDailyCap).toBe(true);
    expect(result.xpAfterEfficiency).toBe(0);
  });
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:engine -- --reporter=verbose 2>&1 | head -80`
Expected: `calculateEfficiency` tests fail (combat skills still return binary 0/1).

**Step 3: Remove binary branch from calculateEfficiency**

In `packages/game-engine/src/skills/xpCalculator.ts`, replace `calculateEfficiency` (lines 60-77):

```typescript
export function calculateEfficiency(
  windowXpGained: number,
  skillType: SkillType
): number {
  const cap = getWindowCap(skillType);

  if (windowXpGained >= cap) return 0;

  const ratio = windowXpGained / cap;
  const efficiency = Math.max(0, 1 - Math.pow(ratio, SKILL_CONSTANTS.EFFICIENCY_DECAY_POWER));
  return efficiency;
}
```

Note: The `COMBAT_SKILLS` import can stay (used elsewhere by `getWindowCap`). Just remove the binary branch.

**Step 4: Run tests to verify they pass**

Run: `npm run test:engine -- --reporter=verbose 2>&1 | head -80`
Expected: All tests PASS.

**Step 5: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build.

**Step 6: Commit**

```bash
git add packages/game-engine/src/skills/xpCalculator.ts packages/game-engine/src/skills/xpCalculator.test.ts
git commit -m "feat: switch combat skills from binary to gradual XP decay"
```

---

### Task 3: Update Gathering XP Formula in API Route

**Files:**
- Modify: `apps/api/src/routes/gathering.ts:352-353`

**Step 1: Update XP calculation to use node level scaling**

In `apps/api/src/routes/gathering.ts`, find line 353:

```typescript
  const rawXp = actions * 5;
```

Replace with:

```typescript
  const xpPerAction = GATHERING_CONSTANTS.XP_PER_ACTION_BASE
    + Math.floor(template.levelRequired / GATHERING_CONSTANTS.XP_LEVEL_SCALING_DIVISOR);
  const rawXp = actions * xpPerAction;
```

Also add `GATHERING_CONSTANTS` to the imports from `@adventure/shared` at the top of the file (check if it's already imported — if not, add it).

**Step 2: Verify the import exists**

Check the imports at the top of `apps/api/src/routes/gathering.ts`. If `GATHERING_CONSTANTS` is not already imported, add it to the existing `@adventure/shared` import.

**Step 3: Build API**

Run: `npm run build:api`
Expected: Clean build, no TypeScript errors.

**Step 4: Commit**

```bash
git add apps/api/src/routes/gathering.ts
git commit -m "feat: scale gathering XP by node level requirement"
```

---

### Task 4: Rename "Efficiency" to "XP Rate" with Color Coding

**Files:**
- Modify: `apps/web/src/components/SkillCard.tsx` (prop rename + display text + color)
- Modify: `apps/web/src/components/screens/Gathering.tsx` (prop rename + display text + color)
- Modify: `apps/web/src/components/combat/CombatRewardsSummary.tsx` (display text)
- Modify: `apps/web/src/app/game/page.tsx` (prop name changes in JSX)

**Step 1: Create XP Rate color utility**

In `apps/web/src/lib/format.ts` (or wherever small utility functions live), add:

```typescript
export function xpRateColor(rate: number): string {
  if (rate >= 70) return 'var(--rpg-green-light)';
  if (rate >= 40) return 'var(--rpg-gold)';
  return 'var(--rpg-red)';
}
```

Check if `apps/web/src/lib/format.ts` exists and contains other utilities. If so, add to it. If not, find the appropriate utility file.

**Step 2: Update SkillCard.tsx**

In `apps/web/src/components/SkillCard.tsx`:

1. Rename interface prop `efficiency: number` → `xpRate: number` (line 13)
2. Rename destructured prop `efficiency` → `xpRate` (line 24)
3. Replace the display (lines 59-61):

```typescript
          <span className="text-xs" style={{ color: xpRateColor(xpRate) }}>
            XP Rate: {xpRate}%
          </span>
```

4. Add import: `import { xpRateColor } from '@/lib/format';`

**Step 3: Update Gathering.tsx**

In `apps/web/src/components/screens/Gathering.tsx`:

1. Rename interface prop `efficiency: number` → `xpRate: number` (line 37)
2. Rename in destructured props
3. Replace the efficiency display (lines 190-193):

```typescript
        <div className="text-right">
          <div className="text-xs text-[var(--rpg-text-secondary)]">XP Rate</div>
          <div className="text-sm font-bold" style={{ color: xpRateColor(xpRate) }}>{xpRate}%</div>
        </div>
```

4. Add import: `import { xpRateColor } from '@/lib/format';`

**Step 4: Update CombatRewardsSummary.tsx**

In `apps/web/src/components/combat/CombatRewardsSummary.tsx`, update lines 35-39:

```typescript
          {skillXp.efficiency < 1 && (
            <span className="text-xs" style={{ color: xpRateColor(Math.round(skillXp.efficiency * 100)) }}>
              (XP Rate: {Math.round(skillXp.efficiency * 100)}%)
            </span>
          )}
```

Add import: `import { xpRateColor } from '@/lib/format';`

**Step 5: Update page.tsx prop names**

In `apps/web/src/app/game/page.tsx`:

1. Line 594: rename `efficiency:` → `xpRate:` in the skills mapping
2. Line 786: rename `efficiency={...}` → `xpRate={...}` on the Gathering component

**Step 6: Build web**

Run: `npm run build:web`
Expected: Clean build. If there are TypeScript errors, fix any remaining references to the old `efficiency` prop name.

**Step 7: Commit**

```bash
git add apps/web/src/lib/format.ts apps/web/src/components/SkillCard.tsx apps/web/src/components/screens/Gathering.tsx apps/web/src/components/combat/CombatRewardsSummary.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: rename efficiency to XP Rate with color coding"
```

---

### Task 5: Add XP Rate to Exploration & Combat Screens

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx:19-65` (add prop)
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx:18-65` (add prop)
- Modify: `apps/web/src/app/game/page.tsx` (compute and pass primary combat XP rate)

**Step 1: Add helper to compute primary combat skill XP rate**

In `apps/web/src/app/game/page.tsx`, add a helper near the other computed values (around line 347 where `activeGatheringSkillData` is computed):

```typescript
  const primaryCombatXpRate = useMemo(() => {
    const combatSkills = skills
      .filter((s) => ['melee', 'ranged', 'magic'].includes(s.skillType))
      .sort((a, b) => b.level - a.level || a.skillType.localeCompare(b.skillType));
    const primary = combatSkills[0];
    if (!primary) return { skillName: 'Melee', rate: 100 };
    return {
      skillName: primary.skillType.charAt(0).toUpperCase() + primary.skillType.slice(1),
      rate: Math.round(calculateEfficiency(primary.dailyXpGained, primary.skillType as SkillType) * 100),
    };
  }, [skills]);
```

Add `useMemo` to the React import if not already present.

**Step 2: Add XP Rate prop to Exploration component**

In `apps/web/src/components/screens/Exploration.tsx`, add to `ExplorationProps` interface (after `busyAction` on line 61):

```typescript
  combatXpRate?: { skillName: string; rate: number };
```

Add to the destructured props in the function signature.

Display the XP rate in the exploration screen — find the turn investment section (around line 250, near the turn slider) and add above it:

```typescript
            {combatXpRate && (
              <div className="flex items-center gap-2 text-sm mb-2">
                <span className="text-[var(--rpg-text-secondary)]">{combatXpRate.skillName} XP Rate:</span>
                <span className="font-bold" style={{ color: xpRateColor(combatXpRate.rate) }}>
                  {combatXpRate.rate}%
                </span>
              </div>
            )}
```

Add import: `import { xpRateColor } from '@/lib/format';`

**Step 3: Add XP Rate prop to CombatScreen component**

In `apps/web/src/app/game/screens/CombatScreen.tsx`, add to `CombatScreenProps` interface:

```typescript
  combatXpRate?: { skillName: string; rate: number };
```

Add to destructured props. Display near the encounter list header area (before the encounter cards):

```typescript
          {combatXpRate && (
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="text-[var(--rpg-text-secondary)]">{combatXpRate.skillName} XP Rate:</span>
              <span className="font-bold" style={{ color: xpRateColor(combatXpRate.rate) }}>
                {combatXpRate.rate}%
              </span>
            </div>
          )}
```

Add import: `import { xpRateColor } from '@/lib/format';`

**Step 4: Pass props from page.tsx**

In `apps/web/src/app/game/page.tsx`:

1. In the Exploration JSX (around line 412), add:
   ```
   combatXpRate={primaryCombatXpRate}
   ```

2. In the CombatScreen JSX (around line 825), add:
   ```
   combatXpRate={primaryCombatXpRate}
   ```

**Step 5: Build web**

Run: `npm run build:web`
Expected: Clean build.

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: show primary combat XP Rate on exploration and combat screens"
```

---

### Task 6: XP Rate Tooltip

**Files:**
- Create: `apps/web/src/components/common/XpRateTooltip.tsx`
- Modify: `apps/web/src/components/SkillCard.tsx`
- Modify: `apps/web/src/components/screens/Gathering.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

**Step 1: Create the XpRateTooltip component**

Create `apps/web/src/components/common/XpRateTooltip.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

const TOOLTIP_TEXT = 'Your XP rate decreases as you train a skill within each 6-hour window. Take a break or train other skills!';

export function XpRateTooltip() {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((s) => !s)}
        aria-label="XP Rate info"
      >
        <Info size={14} />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-[var(--rpg-text-primary)] bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg shadow-lg w-56 z-50">
          {TOOLTIP_TEXT}
        </div>
      )}
    </span>
  );
}
```

**Step 2: Add tooltip next to XP Rate displays**

In each component where XP Rate is shown, add `<XpRateTooltip />` next to the percentage:

- **SkillCard.tsx** — after the `{xpRate}%` text, add `<XpRateTooltip />`
- **Gathering.tsx** — after the XP Rate value, add `<XpRateTooltip />`
- **Exploration.tsx** — after the combat XP Rate value, add `<XpRateTooltip />`
- **CombatScreen.tsx** — after the combat XP Rate value, add `<XpRateTooltip />`

Import in each: `import { XpRateTooltip } from '@/components/common/XpRateTooltip';`

**Step 3: Build web**

Run: `npm run build:web`
Expected: Clean build.

**Step 4: Commit**

```bash
git add apps/web/src/components/common/XpRateTooltip.tsx apps/web/src/components/SkillCard.tsx apps/web/src/components/screens/Gathering.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/screens/CombatScreen.tsx
git commit -m "feat: add XP Rate tooltip to all displays"
```

---

### Task 7: One-Time XP Rate Tutorial Popup

**Files:**
- Create: `apps/web/src/components/common/XpRateTutorial.tsx`
- Modify: `apps/web/src/app/game/page.tsx` (integrate tutorial)

**Step 1: Create XpRateTutorial component**

Create `apps/web/src/components/common/XpRateTutorial.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'xpRateTutorialSeen';

interface XpRateTutorialProps {
  skillName: string;
  rate: number;
}

export function XpRateTutorial({ skillName, rate }: XpRateTutorialProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (rate < 100 && !localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, [rate]);

  if (!show) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">XP Rate</h3>
        <p className="text-sm text-[var(--rpg-text-primary)] mb-4">
          Your {skillName} XP Rate dropped to {rate}%. As you train a skill, you earn XP slightly slower.
        </p>
        <ul className="text-sm text-[var(--rpg-text-secondary)] space-y-1 mb-5">
          <li>• Resets every 6 hours</li>
          <li>• Train other skills meanwhile</li>
          <li>• You still earn XP, just less</li>
        </ul>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Integrate in page.tsx**

In `apps/web/src/app/game/page.tsx`, find the lowest XP rate across all skills and pass it to the tutorial:

```typescript
  const lowestXpRate = useMemo(() => {
    let lowest = { skillName: '', rate: 100 };
    for (const s of skills) {
      const rate = Math.round(calculateEfficiency(s.dailyXpGained, s.skillType as SkillType) * 100);
      if (rate < lowest.rate) {
        const meta = SKILL_META[s.skillType];
        lowest = { skillName: meta?.name ?? s.skillType, rate };
      }
    }
    return lowest;
  }, [skills]);
```

Then render the tutorial component inside the JSX (near the end, before closing `</AppShell>` or after `{renderScreen()}`):

```tsx
        <XpRateTutorial skillName={lowestXpRate.skillName} rate={lowestXpRate.rate} />
```

Import: `import { XpRateTutorial } from '@/components/common/XpRateTutorial';`

**Step 3: Build web**

Run: `npm run build:web`
Expected: Clean build.

**Step 4: Commit**

```bash
git add apps/web/src/components/common/XpRateTutorial.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: add one-time XP Rate tutorial popup"
```

---

### Task 8: Global Error Auto-Scroll + Flash

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:1215-1219` (error banner)

**Step 1: Add ref and scroll behavior to error banner**

In `apps/web/src/app/game/page.tsx`:

1. Add a ref for the error banner:
   ```typescript
   const errorRef = useRef<HTMLDivElement>(null);
   ```

2. Add an effect that scrolls to the error when `actionError` changes:
   ```typescript
   useEffect(() => {
     if (actionError && errorRef.current) {
       errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
     }
   }, [actionError]);
   ```

3. Update the error banner JSX (lines 1215-1219) to add the ref and a flash animation:
   ```tsx
           {actionError && (
             <div
               ref={errorRef}
               className="mb-4 p-3 rounded bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)] animate-error-flash"
             >
               {actionError}
             </div>
           )}
   ```

4. Add the `animate-error-flash` keyframe. Check if the project uses a global CSS file or Tailwind config for custom animations. Add to `tailwind.config.ts` under `theme.extend.keyframes` and `theme.extend.animation`:
   ```typescript
   keyframes: {
     'error-flash': {
       '0%, 100%': { opacity: '1' },
       '25%': { opacity: '0.4' },
       '50%': { opacity: '1' },
       '75%': { opacity: '0.4' },
     },
   },
   animation: {
     'error-flash': 'error-flash 1s ease-in-out',
   },
   ```

   If `tailwind.config.ts` already has `keyframes`/`animation` sections, merge into them rather than overwriting.

**Step 2: Disable gathering node clicks properly**

In `apps/web/src/components/screens/Gathering.tsx`, the node button (line 251-253) already has `disabled={!canSelect}` and `onClick={() => canSelect && setSelectedNode(node)}`. Add `pointer-events-none` to the className when not selectable:

Replace:
```typescript
className={`w-full text-left transition-all ${!canSelect ? 'opacity-50 cursor-not-allowed' : ''}`}
```

With:
```typescript
className={`w-full text-left transition-all ${!canSelect ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
```

**Step 3: Build web**

Run: `npm run build:web`
Expected: Clean build.

**Step 4: Commit**

```bash
git add apps/web/src/app/game/page.tsx apps/web/src/components/screens/Gathering.tsx apps/web/tailwind.config.ts
git commit -m "feat: auto-scroll to error banner with flash animation, disable invalid gathering nodes"
```

---

### Task 9: Final Verification

**Step 1: Build everything**

Run: `npm run build`
Expected: Clean build across all packages and apps.

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass. Pay special attention to `xpCalculator.test.ts` — the combat efficiency tests should now test gradual decay, not binary.

**Step 3: Type check**

Run: `npm run typecheck`
Expected: No TypeScript errors.

**Step 4: Manual smoke test checklist**

Start the dev server (`npm run dev`) and verify:

1. **Skills screen**: Each skill card shows "XP Rate: X%" with color coding and tooltip
2. **Gathering screen**: Header shows "XP Rate" (not "Efficiency"), color coded, with tooltip
3. **Exploration screen**: Shows primary combat skill XP Rate before committing turns
4. **Combat screen**: Shows primary combat skill XP Rate in encounter list area
5. **Combat rewards**: Shows "XP Rate: X%" instead of bare percentage when < 100%
6. **Gathering nodes**: Level-gated nodes are fully unclickable (not just dimmed)
7. **Error scroll**: Trigger an error while scrolled down — page should scroll to top and flash
8. **Tutorial**: Clear `xpRateTutorialSeen` from localStorage, earn some XP → popup appears once

**Step 5: Final commit (if any fixes needed)**

Address any issues found during smoke testing, then commit.
