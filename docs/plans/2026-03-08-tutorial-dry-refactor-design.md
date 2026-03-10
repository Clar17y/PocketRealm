# Tutorial System DRY Refactor & Expansion

## Problem

1. Six standalone tutorial components duplicate ~20 lines of identical boilerplate (useState, useEffect, localStorage check, dismiss handler, ModalOverlay, styled container, button)
2. The Template tutorial gets clipped on small screens (no max-height/overflow on the inner modal div)
3. Changelog popup appears on first login, overlapping the new-player tutorial
4. Many screens lack first-visit tutorials
5. Em dashes used inconsistently across tutorial and changelog text

## Solution

### FeatureTutorial Component

Generic wrapper at `components/common/FeatureTutorial.tsx`:

```tsx
interface FeatureTutorialProps {
  storageKey: string;
  title: string;
  children: ReactNode;
  condition?: boolean; // optional runtime gate (default true)
}
```

Handles: localStorage check, show/dismiss state, ModalOverlay, title, "Got it" button, `max-h-[80vh] overflow-y-auto` for scroll on tall content.

### Migration

Refactor all 6 standalone tutorials to use FeatureTutorial:
- ForgeTutorial
- TemplateTutorial
- SkillTreeTutorial
- StashTutorial
- LootOverflowTutorial
- XpRateTutorial

Make FirstVisitHowTo a thin wrapper over FeatureTutorial that maps its `sections` prop into JSX children.

### Clipping Fix

Inner modal div gets `max-h-[80vh] overflow-y-auto` via FeatureTutorial. All tutorials inherit the fix.

### Changelog on First Login

In `useGameController.ts`, after `loadAll()` resolves: if `tutorialStep === 0` (brand new account), auto-set `localStorage(CHANGELOG_STORAGE_KEY)` to the current version. Prevents changelog popup from appearing over the new-player tutorial.

### New Tutorials

| Screen | storageKey | Content |
|--------|-----------|---------|
| GuildScreen | howto_guild | Guild roles, tax, upgrades, contracts, projects |
| Equipment | howto_equipment | Slots, durability, stats, repair |
| Bestiary | howto_bestiary | Mob discovery, prefix unlocks |
| Achievements | howto_achievements | Claiming rewards, titles, chains |
| ZoneMap | howto_zones | Travel costs, discovery, breadcrumb return |
| WorldEvents | howto_world_events | Timed events, zone modifiers |
| Quests | howto_quests | Quest system overview |

### Em Dash Cleanup

Replace all em dashes with cleaner punctuation across tutorial text and changelog entries.
