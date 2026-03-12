# Achievement UX Improvements

## Problem

Achievements are buried as the 6th sub-tab under Home. The unclaimed badge is invisible unless you're already on the Home tab. Toasts auto-dismiss after 4s and can be missed. Chains of related achievements (e.g. Combat Kills at 100/500/1000/5000/10000) show as separate cards, creating a long overwhelming list.

## Design

### 1. Achievement Chains

Group achievements sharing a `statKey` or `familyKey` into chains. Only show the **current active tier** per chain — the lowest incomplete tier, or the highest completed if all are done.

**Shared utility** (`packages/shared`): `groupAchievementChains()` derives chain grouping from existing fields. No schema changes.

**Per-card rendering**:
- Keep flavor names and descriptions (e.g. "The Warrior", "Kill 500 monsters")
- Add tier indicator: filled/unfilled stars matching `totalTiers` (e.g. 2/5 filled for tier 2)
- Progress bar shows progress toward current tier's threshold
- On completion + claim, card refreshes to next tier

**Completion counter**: "10 / 105 Achievements" with progress bar at the top of the screen. Shows total across all tiers (not just visible cards). Stays visible regardless of category filter.

Reduces visible cards from ~97 to ~40.

### 2. Tab Reorder

Home sub-tabs change from:
`Dashboard, Skills, Map, Bestiary, Events, Achievements, Rankings`

To:
`Dashboard, Map, Events, Achievements, Rankings, Bestiary, Skills`

Achievements moves from 6th to 4th position.

### 3. Bottom Nav Red Dot

Small red dot on the Home bottom nav icon when `achievementUnclaimedCount > 0`. No number — just a presence indicator. Disappears when all rewards claimed.

### 4. Persistent Clickable Toasts

Current: auto-dismiss after 4s, one at a time.

New:
- Toast stays until manually dismissed (X) or clicked
- Clicking navigates to Home > Achievements tab and dismisses the toast
- Multiple toasts stack vertically
- Cap at 5 visible — overflow shows "and X more achievements unlocked"
- X button dismisses individual toast without navigating

## What Doesn't Change

- Achievement definitions, IDs, thresholds
- Database schema
- Backend achievement checking/granting logic
- Claim/reward flow
- Category filter buttons on Achievements screen
