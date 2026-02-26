# Skills & Efficiency Balance Design

## Problem

Player feedback from 20 hours of gameplay (level 1 onwards):

1. Efficiency stays above 90% constantly — curve isn't meaningful during normal play
2. Magic efficiency stuck at 100% — binary combat efficiency is confusing, not a bug
3. Gathering level requirement lets you click the button, only rejected by API — broken feedback loop when error toast is off-screen

## Changes

### 1. Gathering XP Scaling

**Current:** Flat 5 XP per gathering action regardless of node level.

**New formula:** `XP_PER_ACTION_BASE + Math.floor(levelRequired / XP_LEVEL_SCALING_DIVISOR)`

New constants in `GATHERING_CONSTANTS`:
```
XP_PER_ACTION_BASE: 5
XP_LEVEL_SCALING_DIVISOR: 4
```

| Node Level | XP/Action | Actions to Cap (7,500) | Max-Capacity Nodes to Cap |
|-----------|-----------|----------------------|--------------------------|
| 1 | 5 | 1,500 | ~18 (cap 80) |
| 5 | 6 | 1,250 | ~12 (cap 100) |
| 12 | 8 | 937 | ~8 (cap 120) |
| 20 | 10 | 750 | ~5 (cap 150) |
| 30 | 12 | 625 | ~3 (cap 200) |

Beginners never notice. High-level players plan after 2-3 full nodes.

**Files:** `gameConstants.ts` (constants), `apps/api/src/routes/gathering.ts` (XP calculation).

### 2. Combat Gradual Decay

**Current:** Combat skills (melee, ranged, magic) use binary efficiency — 100% until 5,000 XP window cap, then instantly 0%.

**New:** Remove the binary branch. All skills use the same quadratic decay: `efficiency = 1 - (windowXpGained / windowCap)^2`

| % of Cap | XP Earned | Efficiency |
|----------|-----------|------------|
| 25% | 1,250 | 94% |
| 50% | 2,500 | 75% |
| 75% | 3,750 | 44% |
| 100% | 5,000 | 0% |

**Files:** `packages/game-engine/src/skills/xpCalculator.ts` — remove `if (COMBAT_SKILLS.includes(skillType))` early return in `calculateEfficiency()`.

### 3. Rename "Efficiency" to "XP Rate"

Replace "efficiency" with "XP Rate" in all user-facing text.

Color coding by value:
- 70–100%: green (`--rpg-green-light`)
- 40–69%: yellow (`--rpg-gold`)
- 0–39%: red (`--rpg-red`)

Rename component props/variables from `efficiency` to `xpRate` for consistency.

**Files:** `SkillCard.tsx`, `Gathering.tsx`, `CombatRewardsSummary.tsx`, `page.tsx` (calculations), any other components referencing efficiency.

### 4. XP Rate on Exploration & Encounter Screens

Show primary combat skill XP Rate before committing turns or starting combat.

- **Primary skill** = highest-level combat skill (melee, ranged, magic), alphabetical tiebreak
- **Format:** `Melee XP Rate: 72% ℹ`
- Displayed on both the exploration screen (before spending turns) and encounter site screen (before starting combat)

**Files:** `Exploration.tsx` (or equivalent exploration screen), encounter site screen component, `page.tsx` (pass XP rate data).

### 5. Tutorial & Tooltip

**One-time popup:** Triggered client-side the first time any skill's XP Rate drops below 100%. Stored in `localStorage`, shown once.

Content:
> **XP Rate**
>
> Your {skill} XP Rate dropped to {rate}%. As you train a skill, you earn XP slightly slower.
>
> - Resets every 6 hours
> - Train other skills meanwhile
> - You still earn XP, just less

**Persistent tooltip:** Info icon (ℹ) next to every XP Rate display. On hover/tap: *"Your XP rate decreases as you train a skill within each 6-hour window. Take a break or train other skills!"*

**Files:** New `XpRateTutorial` component (or inline in existing components), tooltip added to all XP Rate displays.

### 6. Global Error Auto-Scroll

**Current problem:** API error toast appears at top of screen. When user is scrolled down (e.g. to the mine button), they never see it.

**Fix:**
- When any API error toast appears, auto-scroll the page to the top
- Add a flash/pulse animation to the error toast after scroll for attention
- Additionally: disable gathering nodes that fail the level check with `pointer-events: none` to prevent the API call entirely

**Files:** Global error handler / toast component, `Gathering.tsx` (node interaction gating).
