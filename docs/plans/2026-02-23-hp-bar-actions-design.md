# HP Bar Quick Rest & Knockout Banner Navigation

## Problem

Players on Exploration/Combat screens must navigate away to rest or recover from knockout. The HP bar is display-only and the knockout banner is non-interactive.

## Solution

### 1. Inline Quick Rest button on HpStatusBar

Add optional `onQuickRest`, `quickRestPercent`, and `busyAction` props to `HpStatusBar`. When provided and HP < max, render a compact "Rest" button inline on the right side of the bar — same row, no extra height.

**Layout:** HP text on left, StatBar in middle (shorter), regen rate + rest button on right:
```
┌──────────────────────────────────────────────────┐
│  73 / 100 HP                     +0.4/s   [Rest] │
│  [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░]        │
└──────────────────────────────────────────────────┘
```

Button shows `"Resting..."` when `busyAction === 'quick_rest'`. Hidden when HP is full or player is recovering.

### 2. Clickable KnockoutBanner

Add optional `onClick` prop to `KnockoutBanner`. When provided, the banner gets `cursor-pointer` and a hover effect. Add a small "Tap to recover" hint text. Exploration and Combat screens pass `() => onNavigate('rest')` as the handler.

## Changes

**No backend changes.** Reuses existing `handleQuickRest` and `onNavigate('rest')`.

**Frontend:**
- `HpStatusBar.tsx` — add optional `onQuickRest`, `quickRestPercent`, `busyAction` props. Render compact button when HP < max.
- `KnockoutBanner.tsx` — add optional `onClick` prop. Make banner clickable with hover effect and hint text.
- `Exploration.tsx` — pass quick rest + navigate props through to `HpStatusBar` and `KnockoutBanner`.
- `CombatScreen.tsx` — same wiring.
- `page.tsx` — pass `handleQuickRest`, `quickRestHealPercent`, `busyAction`, and `onNavigate` to both screens.
