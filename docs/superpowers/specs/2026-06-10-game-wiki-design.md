# Game Wiki — Design Spec

## Purpose

Fully transparent game mechanics reference that pulls formulas and constants directly from source code. Every damage formula, hit curve, drop table, and balance constant exposed to players with zero maintenance burden.

## Architecture

### Approach: Direct imports at build time

Wiki pages are Next.js React Server Components under `apps/web/src/app/wiki/`. They import directly from `packages/shared` and `packages/game-engine` — no codegen scripts, no API endpoints, no generated JSON files.

This means:
- Content is always in sync because it **is** the code
- If a constant changes in `gameConstants.ts`, the next deploy updates the wiki automatically
- No maintenance burden, no separate build step

Wiki pages may call pure game-engine functions at build time to generate example output tables (e.g., calling `xpForLevel()` across levels 1–100 to produce an XP table, or `calculateHitChance()` for a range of inputs). This is safe because all game-engine functions are pure (no I/O, no side effects). This closes the sync gap entirely — the wiki doesn't just reference the formulas, it runs them.

**Import constraint:** Wiki pages may only import from `@pocketrealm/shared` and `@pocketrealm/game-engine`. Never from `apps/api`, `@pocketrealm/database`, or any server-side code.

### Static generation

All wiki pages are statically generated at build time. No dynamic route segments, no `cookies()`, no `headers()`, no `fetch()` with `cache: 'no-store'`. This ensures instant page loads and zero server cost. The wiki is pure static HTML after build.

### SEO

Each wiki page exports a `metadata` object with a descriptive title and description. The wiki layout sets a base title template: `%s | Pocketrealm Wiki`.

### Public, no auth

Wiki routes at `/wiki/*` are public — no login required. They do not use the game's auth middleware or any player-specific data. Purely static reference content.

### Routing structure

```
/wiki                              → Index page (hub with system cards)
/wiki/combat/damage                → Damage calculation formulas
/wiki/combat/hit-chance            → Hit/miss sigmoid curves
/wiki/combat/critical-hits         → Crit chance & crit damage
/wiki/combat/actions               → All combat actions & abilities
/wiki/combat/buffs-debuffs         → Buff/debuff/DoT/HoT system
/wiki/combat/defensive-mechanics   → Counter, ward, defend, channeling
/wiki/combat/mob-prefixes          → Mob prefix stat modifier tables
/wiki/bosses/encounters            → Boss tier scaling & round resolution
/wiki/bosses/threat                → Threat system & contribution scoring
/wiki/bosses/expeditions           → Expedition/raid mechanics
/wiki/pvp/combat                   → PvP combat & hit curve differences
/wiki/pvp/elo                      → ELO rating & matchmaking
/wiki/progression/xp-leveling      → XP formula, level-from-XP inverse
/wiki/progression/efficiency       → Efficiency decay, daily caps, XP windows
/wiki/progression/skill-points     → Talent point allocation
/wiki/resources/health             → Max HP, passive regen, rest, knockout recovery
/wiki/resources/stamina            → Max stamina, regen per round, rest
/wiki/resources/mana               → Max mana, regen per round, rest
/wiki/resources/flee               → Flee chance formula & outcome tiers
/wiki/items/rarity                 → Rarity tiers, bonus slots, stat ranges
/wiki/items/drops                  → Drop weight tables, mob level scaling
/wiki/items/forge                  → Upgrade success rates, reroll costs, luck bonus
/wiki/items/durability             → Durability degradation, repair, sell prices
/wiki/items/inventory              → Backpack capacity formula, stash
/wiki/crafting/crits               → Crafting crit, rare craft, epic craft formulas
/wiki/crafting/gathering           → Gathering yield, gem crit chance
/wiki/crafting/salvage             → Salvage rates & material returns
/wiki/exploration/probability      → Cumulative probability model
/wiki/exploration/rooms            → Room generation & encounter sizes
/wiki/exploration/mob-tiers        → Mob tier filtering & bleedthrough
/wiki/exploration/zones            → Zone exit scaling, travel costs, exploration %
```

### Layout

Next.js layout at `apps/web/src/app/wiki/layout.tsx`:
- Persistent collapsible sidebar on the left with tree navigation
- Breadcrumb trail at top of content area
- No bottom nav (that's the game UI — wiki is standalone)
- Mobile: sidebar collapses into a hamburger menu

Sidebar navigation is defined as a typed constant array in `apps/web/src/app/wiki/wikiNavigation.ts` — not hardcoded in the layout component. This keeps the tree structure data-driven and easy to extend.

### Shared components

Shared wiki components live in `apps/web/src/components/wiki/`:
- `WikiSidebar.tsx` — collapsible tree navigation
- `WikiBreadcrumb.tsx` — breadcrumb trail
- `FormulaBlock.tsx` — color-coded formula rendering
- `ConstantsTable.tsx` — standardized constants table
- `WikiSection.tsx` — consistent page structure (title, summary, formula, explanation, constants, examples, related links)

### Sidebar tree structure

```
Wiki Home
├── Combat
│   ├── Damage Calculation
│   ├── Hit Chance
│   ├── Critical Hits
│   ├── Actions & Abilities
│   ├── Buffs, Debuffs & DoTs
│   ├── Defensive Mechanics
│   └── Mob Prefixes
├── Bosses
│   ├── Boss Encounters
│   ├── Threat & Contribution
│   └── Expeditions
├── PvP
│   ├── PvP Combat
│   └── ELO & Matchmaking
├── Progression
│   ├── XP & Leveling
│   ├── Efficiency & Caps
│   └── Skill Points
├── Resources
│   ├── Health
│   ├── Stamina
│   ├── Mana
│   └── Flee Mechanics
├── Items & Equipment
│   ├── Rarity System
│   ├── Drop Tables
│   ├── Forge & Upgrades
│   ├── Durability & Selling
│   └── Inventory
├── Crafting & Gathering
│   ├── Crafting Crits
│   ├── Gathering & Gems
│   └── Salvage
└── Exploration & Zones
    ├── Probability Model
    ├── Room Generation
    ├── Mob Tier Filtering
    └── Zone Progression
```

## Visual Design

### Theme: RPG-flavored dark fantasy

Matches the game's existing aesthetic. The wiki should feel like an in-world codex or tome of knowledge.

- **Background:** Dark warm tones (`#1a1207` → `#2a1f0e` gradients)
- **Primary accent:** RPG gold (`#c8a84e`, game's `--rpg-gold`)
- **Text:** Light gold/cream for body text, brighter gold for headings
- **Code blocks:** Dark inset panels with syntax-highlighted formulas — green for result variables, gold for input stats, red/orange for defence/reduction values
- **Borders:** Subtle gold borders (`#c8a84e33`) on cards and sections
- **Sidebar:** Darker panel, gold text for active item, muted for inactive

### Content patterns

Each wiki page follows a consistent structure:

1. **Title** — what this page covers
2. **Summary** — one-line plain-English explanation
3. **Formula block** — the actual calculation, syntax-highlighted
4. **Explanation** — step-by-step breakdown of what each variable means
5. **Constants table** — all relevant constants with values and source location
6. **Examples** — concrete numbers (e.g., "At level 50 melee with 30 strength...")
7. **Related pages** — cross-links to related mechanics

### Formula rendering

Formulas displayed in styled code blocks with color-coded variables:
- **Green** (`#6eb86e`) — output/result values
- **Gold** (`#c8a84e`) — player stats and input values
- **Red/orange** (`#e06060` / `#ffa657`) — enemy/reduction values
- **Muted** (`#806820`) — operators and constants

No LaTeX/MathJax — just styled `<code>` blocks. Keeps it simple, loads fast, and matches the RPG aesthetic better than rendered math.

### Constants tables

Standard table format for each page's relevant constants:

| Constant | Value | Description |
|----------|-------|-------------|
| `CRIT_CHANCE` | `0.05` | Base 5% critical hit chance |
| `CRIT_MULTIPLIER` | `1.5` | 1.5× damage on critical hit |

## Data sources

### Direct imports from packages/shared

- `gameConstants.ts` — all 43 constant groups
- `combatActionDefinitions.ts` — all action definitions with stats
- `mobPrefixes.ts` — prefix modifier tables

### Direct imports from packages/game-engine

- `combat/damageCalculator.ts` — damage range calculation, hit chance sigmoid curves
- `combat/actionResolver.ts` — action interaction rules
- `combat/bossRoundResolver.ts` — boss mechanics
- `combat/threatSystem.ts` — threat formulas
- `combat/bossContribution.ts` — contribution weights
- `skills/xpCalculator.ts` — XP formula constants
- `hp/hpCalculator.ts` — HP formulas
- `hp/fleeMechanics.ts` — flee constants
- `resources/staminaCalculator.ts` — stamina formulas
- `resources/manaCalculator.ts` — mana formulas
- `items/itemRarity.ts` — rarity weights and forge chances
- `crafting/craftingCrit.ts` — crafting crit formulas
- `gathering/gatheringCrit.ts` — gem crit formulas
- `exploration/probabilityModel.ts` — exploration probability
- `exploration/roomGenerator.ts` — room generation params
- `exploration/mobTierFilter.ts` — tier bleedthrough weights
- `exploration/encounterChest.ts` — chest drop mechanics by encounter size
- `exploration/zoneExitScaling.ts` — zone exit probability scaling
- `inventory/sellPrice.ts` — sell price calculation with durability penalty
- `inventory/inventoryCapacity.ts` — backpack capacity formula

Wiki pages import constants directly and may also call pure game-engine functions at build time to generate example tables (see Architecture section).

## What's excluded

- **Interactive calculators** — players can build their own tools from the documented formulas
- **Economy & casino** — roulette, token exchange, guild tax not covered
- **In-game integration** — no wiki button in game UI; it's a separate public site
- **User-generated content** — no comments, no community editing
- **Lore/flavor text** — pure mechanics, no worldbuilding

## Mobile considerations

- Sidebar collapses to hamburger menu on mobile
- Formula blocks scroll horizontally if needed
- Tables are responsive (horizontal scroll on narrow screens)
- Standard responsive breakpoints from the existing web app
