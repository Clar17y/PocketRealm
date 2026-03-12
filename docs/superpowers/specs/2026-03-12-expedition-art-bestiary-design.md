# Expedition Art & Bestiary Redesign

## Overview

Add visual identity to guild expeditions (themed backgrounds, monster icons) and restructure the Bestiary into 4 tabs separating overworld mobs, expedition mobs, and world bosses.

## Art Assets

### Expedition Backgrounds (8 images)

Two per expedition theme: a room background and a boss room background.

| Theme | Room Background | Boss Background |
|-------|----------------|-----------------|
| Spider Nest | `screen_expedition_spider_nest.webp` | `screen_expedition_spider_nest_boss.webp` |
| Wolf Pack | `screen_expedition_wolf_pack.webp` | `screen_expedition_wolf_pack_boss.webp` |
| Bandit Camp | `screen_expedition_bandit_camp.webp` | `screen_expedition_bandit_camp_boss.webp` |
| Corrupted Grove | `screen_expedition_corrupted_grove.webp` | `screen_expedition_corrupted_grove_boss.webp` |

Prompts use the zone/landscape format from `docs/assets/stable-diffusion-workflow.md`. Saved to `docs/assets/expedition_background_prompts.md`.

### Expedition Monster Icons (32 images)

One per unique expedition mob. Same format as existing monsters: `monster_{slugified_name}-pixelated-128.webp`. Wired via existing `monsterImageSrc()` utility.

**Spider Nest (8):** Cavern Spider, Webweaver, Broodguard, Silk Stalker, Venomous Spitter, Spider Matriarch, Spiderling, The Broodqueen

**Wolf Pack (8):** Timber Wolf, Snarler, Dire Wolf, Shadow Wolf, Howling Spirit, Pack Alpha, Frenzied Wolf, Fenris, the Ancient

**Bandit Camp (8):** Bandit Thug, Bandit Archer, Bandit Assassin, Bandit Shaman, Knife Thrower, War Chief, Bandit Grunt, The Bandit King

**Corrupted Grove (8):** Blighted Sapling, Fungal Spore, Corrupted Treant, Blighted Dryad, Blighted Spore, Grove Warden, Thorn Vine, The Rot Heart

Prompts appended to `docs/assets/monster_prompts.md` in a new "Guild Expeditions" section.

## Background Switching

Extend `screenBackgroundSrc()` in `apps/web/src/lib/assets.ts` to accept optional expedition context:

```typescript
expeditionContext?: { theme: string; isBossRoom: boolean }
```

**Logic:**
- No active expedition → `screen_guild.webp` (unchanged)
- Active expedition, rooms 1 to N-1 → `screen_expedition_{theme}.webp`
- Active expedition, final boss room → `screen_expedition_{theme}_boss.webp`
- Expedition history view → `screen_guild.webp` (no override)

`GuildExpeditionsTab` passes theme and current room type to derive the correct background.

## Bestiary Restructure

### Tab Layout: 2 → 4 Tabs

| Tab | Content | Status |
|-----|---------|--------|
| Monsters | Overworld encounter mobs | Existing, unchanged |
| Expeditions | Expedition mobs grouped by theme | New |
| World Bosses | World boss encounters | New |
| Prefixes | Prefix encyclopedia | Existing, unchanged |

### Expeditions Tab

Organized by theme. Each theme section shows its mob roster in a 3-column grid.

**Visibility:** Only themes the player has attempted are shown with mob entries. Unattempted themes appear dimmed at the bottom with "Not yet attempted".

**Role badges:** Each mob tile displays a role label — Trash, Elite, Caster, Add, Mini-Boss, Final Boss. Final bosses get a gold border. Add mobs (Spiderling, Frenzied Wolf, Bandit Grunt, Thorn Vine) use a distinct "Add" badge — they appear alongside mini-bosses and in event rooms.

**Progressive unlock thresholds** (lower than overworld due to less frequent encounters):

| Kills | Reveals |
|-------|---------|
| 1 | Name + image |
| 3 | Stats (HP, ATK, DEF) |
| 5 | Full skill rotation |

**Detail modal:** Reuses existing monster modal pattern. Replaces "Found In" zones with expedition theme name. Adds rotation viewer (same component as boss rotation in current bestiary).

### World Bosses Tab

Card-based layout (fewer entries, more detail per card).

**HP display:** Shown as "X HP / participant" to reflect scaling.

**Progressive unlock thresholds:**

| Defeats | Reveals |
|---------|---------|
| 1 | Name + image + HP per participant |
| 3 | ATK, DEF stats |
| 5 | Full phase rotation (P1/P2/P3) |

**Detail view:** Shows phase breakdown with action list per phase, telegraphed actions highlighted.

**Undiscovered bosses:** Shown as dashed-border cards with "???" and "Not yet encountered".

## Data Model

### New: `PlayerExpeditionBestiary`

Tracks expedition mob kills per player. Separate from `PlayerBestiary` to keep overworld and expedition data cleanly isolated.

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | String (FK → Player) | Player reference |
| `mobTemplateId` | String | Expedition definition ID (e.g. `"cavern_spider"`) |
| `theme` | String | Expedition theme (e.g. `"spider_nest"`) |
| `killCount` | Int | Total kills |
| `firstEncounteredAt` | DateTime | First encounter timestamp |

Composite primary key `@@id([playerId, mobTemplateId])` — matches existing `PlayerBestiary` pattern.

**When updated:** During expedition round resolution, when a mob dies. Follows the same pattern as overworld combat updating `PlayerBestiary`.

### World Bosses: No New Model

Derive from existing `BossParticipant` records. Query aggregates participation where the boss was defeated, grouped by boss template. Boss template definitions already contain HP scaling, ATK, DEF, and phase rotations.

## API Changes

### New: `GET /bestiary/expeditions`

Returns expedition mob entries grouped by theme with kill counts and unlock state.

```typescript
{
  themes: Array<{
    theme: string;
    attempted: boolean;
    mobs: Array<{
      mobTemplateId: string;
      name: string;
      role: 'trash' | 'elite' | 'caster' | 'add' | 'mini_boss' | 'final_boss';
      killCount: number;
      stats: { hp: number; attack: number; defence: number } | null; // null if < 3 kills
      rotation: Array<{ round: number; actionName: string; targetMode: string }> | null; // null if < 5 kills
    }>;
  }>;
}
```

### New: `GET /bestiary/bosses`

Returns world boss entries with defeat counts and progressive unlock state. Full boss roster sourced from `bossTemplateDefinitions.ts` so undiscovered bosses render as placeholder cards.

```typescript
{
  bosses: Array<{
    bossTemplateId: string;
    name: string;
    defeatCount: number;
    hpPerParticipant: number | null; // null if 0 defeats
    stats: { accuracy: number; defence: number } | null; // null if < 3 defeats
    phases: Array<{ phase: number; actions: Array<...> }> | null; // null if < 5 defeats
  }>;
}
```
