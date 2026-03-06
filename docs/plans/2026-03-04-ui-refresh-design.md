# UI Refresh Design

## Goal
Transform the flat, utilitarian dark theme into an immersive fantasy RPG experience with custom typography, ornamental framing, rich textures, and polished animations.

## Font System

| Role | Font | Usage |
|------|------|-------|
| Display/Headers | Almendra | Page titles, section headers, card titles, mob names |
| Numbers | Silkscreen | Turns, gold, XP, damage numbers, stat values |
| Body | Nunito | Body text, descriptions, labels, buttons |

Load via Google Fonts (`next/font/google`). Define CSS variables `--font-display`, `--font-pixel`, `--font-body`.

## Color Palette Changes

```
--rpg-background:    #0c0a08    (warm dark, torchlit feel — was #0a0a0c)
--rpg-surface:       #1e1c18    (warm surface — was #2a2a3a)
--rpg-surface-light: #2a2820    (new: elevated cards, hover states)
--rpg-gold-dim:      rgba(212,168,75,0.08)  (new: subtle gold highlights)
--rpg-gold-glow:     rgba(212,168,75,0.3)   (new: ornament/border glow)
--rpg-hp-warning:    #d4943a    (new: amber for 40-60% HP)
```

Keep all existing colors. Only warm up the base tones and add new accent variables.

## Texture & Depth

### Background
- Subtle noise overlay on `--rpg-background` via a small repeating noise PNG at 3-5% opacity
- Vignette effect: radial gradient darkening edges of the game area

### Cards (PixelCard)
- Replace flat border with layered `box-shadow`: `0 1px 2px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.15)`
- Subtle parchment/leather texture overlay at 5-8% opacity via CSS `background-image`
- Slight inner shadow for depth: `inset 0 1px 0 rgba(255,255,255,0.03)`

## Ornamental Elements

### Corner Ornaments
CSS pseudo-elements (`::before`, `::after`) on key cards (Dashboard stats, Equipment paperdoll, Combat encounter details). Small gold decorative corners at 20% opacity using CSS borders/triangles or inline SVG.

### Section Dividers
Replace plain `border-b` with ornamental divider component: thin gold line with center diamond motif. Implemented as a small reusable `<Divider />` component using CSS borders + pseudo-element.

### Header Decoration
Gold ornamental underline beneath the AppShell header. Thin decorative border with subtle glow.

### Card Frames
Key cards (turn counter, equipped item detail, loot rewards) get a thin gold inner border at low opacity, creating a "framed" feel.

## Stat Bar Polish

### Shimmer Effect
CSS animation: a semi-transparent white gradient sweeps left-to-right across filled bars every 3-4 seconds. Applied to HP, XP, and durability bars.

### Glow
HP bar gets a subtle `box-shadow` glow matching its color — brighter when full, dimmer when low.

### Milestone Markers
Small tick marks at 25%, 50%, 75% on XP bars via pseudo-elements.

## Screen Transitions

### Page Transitions
Wrap screen content in a fade+slide-up animation on mount:
- `opacity: 0 → 1`, `translateY: 8px → 0`, `duration: 250ms`, `ease-out`

### Staggered Lists
Card lists (inventory items, skill cards, encounter sites) get staggered `animation-delay`:
- Each item: `delay = index * 40ms`, max 400ms total
- Same fade+slide animation as page transitions

## Loot & Combat Polish

### Loot Reveal
Items animate in with a flip/scale effect: `scale: 0.8 → 1`, `opacity: 0 → 1`, staggered per item. Legendary items get a brief golden flash (radial gradient burst, 300ms).

### Combat Log Styling
- Warmer background (`--rpg-surface-light`)
- Display font for mob names
- Pixel font for damage numbers
- Color-coded: green for heals, red for damage, gold for crits, blue for spells

### Victory Moment
- Gold border pulse animation on the results card
- XP bar fill animation (smooth 1s ease-out)
- Brief particle burst for boss kills (CSS-only, using multiple animated pseudo-elements)

## Header & Navigation

### Header
- "Adventure" title in Almendra display font
- Turn counter in Silkscreen pixel font with small hourglass icon
- Gold ornamental border along bottom edge
- Subtle gold glow on the title text

### Bottom Nav
- Slightly larger icons
- Labels beneath icons in body font
- Active tab: gold underline glow (box-shadow) instead of just color change
- Smooth transition between active states

## Implementation Scope

All changes are **frontend-only** (`apps/web/`). No API or game-engine changes.

### Files to modify
- `apps/web/src/app/globals.css` — variables, animations, textures
- `apps/web/src/app/layout.tsx` — font loading
- `apps/web/src/components/PixelCard.tsx` — depth, texture, ornaments
- `apps/web/src/components/PixelButton.tsx` — font updates
- `apps/web/src/components/StatBar.tsx` — shimmer, glow, milestones
- `apps/web/src/components/AppShell.tsx` — header redesign
- `apps/web/src/components/BottomNav.tsx` — nav redesign
- `apps/web/src/components/ItemCard.tsx` — loot animations
- `apps/web/src/components/screens/*` — screen transitions, staggered lists
- `apps/web/tailwind.config.ts` — font family extensions

### New files
- `apps/web/src/components/common/Divider.tsx` — ornamental divider
- `apps/web/src/components/common/CornerOrnament.tsx` — decorative corners (or CSS-only in PixelCard)
- `apps/web/public/textures/noise.png` — noise texture (tiny, ~2KB)
