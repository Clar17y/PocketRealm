# Landing Page — Design

## Overview

Single-page scroll landing page. Retro/nostalgic tone. Two goals equally weighted: convert new signups and sell Champion subscription. Uses existing zone art and monster sprites (full-res, not pixelated). Mobile-first, built with existing `--rpg-*` theme system.

**Route:** `/` (replaces current minimal placeholder)

## Sections

### 1. Hero

Full-width `zone_ancient_grove.png` background with dark gradient overlay.

- **Title:** "Adventure RPG" — large, bold, subtle gold glow (`--rpg-gold`)
- **Tagline:** "A turn-based RPG that respects your time."
- **Subtitle:** "Explore. Fight. Craft. Progress — at your own pace."
- **CTAs (side by side):**
  - "Play Free" — primary green button → `/register`
  - "Learn More" — secondary outline → smooth scroll to features
- Static background image. Dark bottom edge blends into `--rpg-background`.

### 2. Feature Cards

Four cards in a row (stack on mobile). Dark surface (`--rpg-surface`) with `--rpg-border`. Each card: full-res UI icon, heading, one sentence.

| Icon | Heading | Copy |
|------|---------|------|
| `ui_attack.png` | Fight | "Battle 80+ monsters across 11 zones. D&D-style combat with crits, spells, and boss raids." |
| `ui_explore.png` | Explore | "Discover hidden caches, encounter sites, and zone exits. Every turn spent is a roll of the dice." |
| `ui_inventory.png` | Craft | "Forge weapons, brew potions, salvage loot. 14 skills to master from weaponsmithing to alchemy." |
| `ui_turn.png` | Play Your Way | "Turns regenerate in real-time. Play in bursts or binge your bank — no energy walls, no waiting rooms." |

### 3. Zone Showcase

**Heading:** "11 Zones to Discover"

Horizontal scroll strip (desktop) or stacked cards (mobile). Each zone: art as background, name overlaid in gold on dark gradient.

**Zones:**
- `zone_ancient_grove.png` — Ancient Grove
- `zone_crystal_caverns.png` — Crystal Caverns
- `zone_haunted_marsh.png` — Haunted Marsh
- `zone_sunken_ruins.png` — Sunken Ruins
- `zone_deep_forest.png` — Deep Forest

### 4. Monster Parade

**Heading:** "80+ Monsters. 2 World Bosses. Good Luck."

Row of 6 full-res monster sprites on dark background, slightly varied sizes for depth.

**Monsters:**
- `monster_alpha_wolf.png`
- `monster_crystal_titan.png`
- `monster_goblin_king.png`
- `monster_ancient_spirit.png`
- `monster_fae_queen.png`
- `monster_death_knight.png`

### 5. Champion Subscription

Visually distinct — gold accent border or subtle gold gradient background.

- **Heading:** "Go Champion" — gold text
- **Price:** "£4.99/month" — large, clear
- **Tagline:** "Everything you do, 10% better."
- **Live preview:** Mock leaderboard row showing the rainbow animated "Champion" title and Champion badge on a sample player name. Uses the actual `ChampionBadge` component and `rainbow-title` CSS animation.
- **Perks (two columns desktop, single mobile):**
  - 10% more turns (24h bank cap)
  - 10% faster turn regen
  - 10% crafting crit bonus
  - 10% gathering yield & crit
  - 10% more chest & cache loot
  - 10% boss reward bonus
  - Rainbow Champion title
  - Leaderboard badge
- **CTA:** "Become Champion" — gold button → Stripe Checkout (or `/register` first if not logged in)
- **Subtext:** "No combat advantages. No pay-to-win. Just efficiency."

### 6. Footer CTA

- **Heading:** "Your Adventure Starts Now"
- **CTAs (same pair as hero):**
  - "Play Free" — green → `/register`
  - "Become Champion" — gold → Stripe Checkout / register
- **Below:** "Login" link for returning players
- **Background:** Solid `--rpg-background` or subtle zone art with heavy dark overlay

## Technical Notes

- Replace current `apps/web/src/app/page.tsx` and `page.module.css`
- Use Tailwind + `--rpg-*` CSS variables (fix current broken variable references)
- Lazy load zone and monster images (`loading="lazy"`)
- Smooth scroll for "Learn More" anchor link
- Mobile-first: cards stack, zone strip scrolls horizontally, monster row wraps
- Reuse `PixelButton` component for CTAs (green + gold variants)
- Reuse `ChampionBadge` component from premium implementation
- Rainbow title CSS from premium implementation (`rainbow-title` class)

## Assets Used

**Zone art (full-res):** `zone_ancient_grove.png`, `zone_crystal_caverns.png`, `zone_haunted_marsh.png`, `zone_sunken_ruins.png`, `zone_deep_forest.png`

**Monster art (full-res):** `monster_alpha_wolf.png`, `monster_crystal_titan.png`, `monster_goblin_king.png`, `monster_ancient_spirit.png`, `monster_fae_queen.png`, `monster_death_knight.png`

**UI icons (full-res):** `ui_attack.png`, `ui_explore.png`, `ui_inventory.png`, `ui_turn.png`

All assets at `apps/web/public/assets/`.
