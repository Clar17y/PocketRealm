# User Preferences System Design

## Overview

Expand the existing Profile screen into a Settings screen with configurable game preferences. All preferences are server-side (stored on the Player model), extending the existing `autoPotionThreshold` pattern.

## Preferences

| Preference | Column | Type | Default | Range |
|---|---|---|---|---|
| Combat log speed | `combat_log_speed_ms` | Int | 800 | 100–1000, step 100 |
| Exploration speed | `exploration_speed_ms` | Int | 800 | 100–1000, step 100 |
| Auto-skip known combat | `auto_skip_known_combat` | Boolean | false | on/off |
| Default explore turns | `default_explore_turns` | Int | 100 | 10–10000, step 10 |
| Quick-rest heal target | `quick_rest_heal_percent` | Int | 100 | 25–100, step 25 |
| Auto-potion threshold | `auto_potion_threshold` | Int | 0 | 0–100, step 5 *(exists)* |
| Default refining to max | `default_refining_max` | Boolean | false | on/off |

## Backend

### Prisma Schema

Add 6 columns to `Player` model:

```prisma
combatLogSpeedMs       Int     @default(800)  @map("combat_log_speed_ms")
explorationSpeedMs     Int     @default(800)  @map("exploration_speed_ms")
autoSkipKnownCombat    Boolean @default(false) @map("auto_skip_known_combat")
defaultExploreTurns    Int     @default(100)  @map("default_explore_turns")
quickRestHealPercent   Int     @default(100)  @map("quick_rest_heal_percent")
defaultRefiningMax     Boolean @default(false) @map("default_refining_max")
```

### API

Extend `PATCH /api/v1/player/settings` Zod schema with all 6 new fields (all optional). Validate ranges. `GET /player` automatically includes new columns.

## Frontend

### Settings Screen

Rename `'profile'` screen ID to `'settings'` everywhere. Rename BottomNav label from "Profile" to "Settings" (icon already `settings`).

**Sections (using PixelCard):**
1. **Profile** — Username
2. **Combat** — Log speed slider, auto-skip toggle, auto-potion slider
3. **Exploration** — Playback speed slider, default turns input
4. **Recovery** — Quick-rest heal % selector
5. **Crafting** — Default refining to max toggle
6. **Account** — Logout button

Save behavior: optimistic update on change, PATCH on commit, rollback on error.

### Feature Integration

**Combat log speed** — `CombatPlayback.tsx` uses `combatLogSpeedMs` prop instead of hardcoded 800ms.

**Exploration speed** — `ExplorationPlayback.tsx` uses `explorationSpeedMs` prop. Scales advance time and event pause proportionally (ratio preserved from 800ms:2500ms baseline).

**Auto-skip known combat** — Frontend-only. `CombatPlayback` checks bestiary for mob+prefix combo with kills > 0. If found and pref enabled, skips to `finished-auto` phase immediately. Combat still resolves server-side normally. For unprefixed mobs, checks base mob only.

**Default explore turns** — `Exploration.tsx` uses `defaultExploreTurns` as initial slider value instead of hardcoded 100. Capped by available turns.

**Quick-rest button** — Dashboard shows "Quick Rest" button near HP bar when HP < max. Executes `POST /hp/rest` using turns calculated from `quickRestHealPercent`. No screen navigation. Shows brief feedback.

**Default refining to max** — `Crafting.tsx` auto-sets quantity to max when selecting a refining recipe and `defaultRefiningMax` is true.
