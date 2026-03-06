# UI Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the flat dark theme into an immersive fantasy RPG UI with custom fonts, ornamental framing, textures, and polished animations.

**Architecture:** All changes are frontend-only in `apps/web/src/`. We add three Google Fonts via `next/font/google`, warm up CSS variables, add texture/depth to cards, create ornamental components, polish stat bars and animations, and restyle navigation. No API or game-engine changes.

**Tech Stack:** Next.js (App Router), Tailwind CSS v4, CSS animations, Google Fonts via `next/font/google`

---

### Task 1: Font System Setup

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/tailwind.config.ts`

**Step 1: Add Google Fonts to layout.tsx**

In `apps/web/src/app/layout.tsx`, import and configure three fonts:

```tsx
import { Almendra, Silkscreen, Nunito } from 'next/font/google';

const almendra = Almendra({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-display' });
const silkscreen = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-pixel' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-body' });
```

Apply font variables to `<body>`:

```tsx
<body className={`${almendra.variable} ${silkscreen.variable} ${nunito.variable} font-body`}>
```

**Step 2: Add font-family CSS variables to globals.css**

In `apps/web/src/app/globals.css`, inside the `@theme inline` block (around line 25), add:

```css
--font-display: var(--font-display);
--font-pixel: var(--font-pixel);
--font-body: var(--font-body);
```

**Step 3: Register font families in tailwind.config.ts**

In `apps/web/tailwind.config.ts`, add to the theme extend:

```ts
fontFamily: {
  display: ['var(--font-display)', 'serif'],
  pixel: ['var(--font-pixel)', 'monospace'],
  body: ['var(--font-body)', 'sans-serif'],
},
```

**Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/globals.css apps/web/tailwind.config.ts
git commit -m "feat(ui): add Almendra, Silkscreen, Nunito font system"
```

---

### Task 2: Color Palette Warmup

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Update CSS variables**

In `apps/web/src/app/globals.css`, update existing variables and add new ones in the `:root` / `@theme` block:

```css
/* Update existing */
--rpg-background: #0c0a08;    /* was #0a0a0c — warm torchlit */
--rpg-surface: #1e1c18;       /* was #2a2a3a — warm surface */
--rpg-border: #3a3830;        /* was #5a5a6a — warm border */
--rpg-text-secondary: #8a8878; /* was #9a9aaa — warm muted */

/* Add new */
--rpg-surface-light: #2a2820;
--rpg-gold-dim: rgba(212, 168, 75, 0.08);
--rpg-gold-glow: rgba(212, 168, 75, 0.3);
--rpg-hp-warning: #d4943a;
```

Also update the viewport `theme-color` in `apps/web/src/app/layout.tsx` from `#0a0a0c` to `#0c0a08`.

**Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "feat(ui): warm up color palette with torchlit tones"
```

---

### Task 3: Background Texture & Vignette

**Files:**
- Create: `apps/web/public/textures/noise.png` (generate programmatically)
- Modify: `apps/web/src/app/globals.css`

**Step 1: Generate noise texture**

Create a tiny 128x128 noise PNG. Use a Node script or download a generic one. The image should be grayscale random noise, ~2KB.

Quick generation via canvas (run once):
```bash
node -e "
const { createCanvas } = require('canvas');
const fs = require('fs');
const c = createCanvas(128, 128);
const ctx = c.getContext('2d');
const img = ctx.createImageData(128, 128);
for (let i = 0; i < img.data.length; i += 4) {
  const v = Math.random() * 255;
  img.data[i] = img.data[i+1] = img.data[i+2] = v;
  img.data[i+3] = 255;
}
ctx.putImageData(img, 0, 0);
fs.writeFileSync('apps/web/public/textures/noise.png', c.toBuffer('image/png'));
"
```

If `canvas` package isn't available, create a simple CSS-only noise alternative using a repeating SVG pattern, or download a stock noise PNG.

**Step 2: Add background texture and vignette to globals.css**

Add after the existing utility classes:

```css
/* Background texture overlay */
.rpg-noise {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.04;
  background-image: url('/textures/noise.png');
  background-repeat: repeat;
  background-size: 128px 128px;
  mix-blend-mode: overlay;
}

/* Vignette effect */
.rpg-vignette {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
}
```

**Step 3: Apply to layout or AppShell**

In `apps/web/src/components/AppShell.tsx`, add the noise and vignette divs inside the outermost wrapper, before other content:

```tsx
<div className="rpg-noise" />
<div className="rpg-vignette" />
```

**Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add apps/web/public/textures/ apps/web/src/app/globals.css apps/web/src/components/AppShell.tsx
git commit -m "feat(ui): add noise texture overlay and vignette effect"
```

---

### Task 4: PixelCard Depth, Texture & Ornaments

**Files:**
- Modify: `apps/web/src/components/PixelCard.tsx`
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add card texture and depth styles to globals.css**

```css
/* Card parchment texture */
.rpg-card-texture {
  position: relative;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 4px 8px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.rpg-card-texture::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0.05;
  background-image: url('/textures/noise.png');
  background-repeat: repeat;
  background-size: 64px 64px;
  mix-blend-mode: soft-light;
  pointer-events: none;
  z-index: 0;
}

/* Gold frame for important cards */
.rpg-gold-frame {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 4px 8px rgba(0, 0, 0, 0.15),
    inset 0 0 0 1px rgba(212, 168, 75, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

/* Corner ornaments */
.rpg-corners {
  position: relative;
}

.rpg-corners::before,
.rpg-corners::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  opacity: 0.2;
  pointer-events: none;
  z-index: 1;
}

.rpg-corners::before {
  top: 4px;
  left: 4px;
  border-top: 2px solid var(--rpg-gold);
  border-left: 2px solid var(--rpg-gold);
}

.rpg-corners::after {
  bottom: 4px;
  right: 4px;
  border-bottom: 2px solid var(--rpg-gold);
  border-right: 2px solid var(--rpg-gold);
}
```

**Step 2: Update PixelCard component**

In `apps/web/src/components/PixelCard.tsx`, add `variant` prop and apply texture:

```tsx
interface PixelCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'framed' | 'ornate';
  onClick?: () => void;
}
```

Apply classes based on variant:
- `default`: `rpg-card-texture` (all cards get depth + subtle texture)
- `framed`: `rpg-card-texture rpg-gold-frame` (gold inner border)
- `ornate`: `rpg-card-texture rpg-gold-frame rpg-corners` (gold frame + corner ornaments)

**Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/web/src/components/PixelCard.tsx apps/web/src/app/globals.css
git commit -m "feat(ui): add card depth, parchment texture, gold frames, corner ornaments"
```

---

### Task 5: Ornamental Divider Component

**Files:**
- Create: `apps/web/src/components/common/Divider.tsx`

**Step 1: Create Divider component**

```tsx
interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--rpg-gold)]/30 to-transparent" />
      <div className="w-1.5 h-1.5 rotate-45 bg-[var(--rpg-gold)]/40" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--rpg-gold)]/30 to-transparent" />
    </div>
  );
}
```

This renders: `──── ◆ ────` as a thin gold gradient line with center diamond.

**Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/components/common/Divider.tsx
git commit -m "feat(ui): add ornamental Divider component"
```

---

### Task 6: StatBar Polish — Shimmer, Glow, Milestones

**Files:**
- Modify: `apps/web/src/components/StatBar.tsx`
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add shimmer animation to globals.css**

```css
@keyframes bar-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

.rpg-bar-shimmer {
  position: relative;
  overflow: hidden;
}

.rpg-bar-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.12) 50%,
    transparent 100%
  );
  width: 50%;
  animation: bar-shimmer 3s ease-in-out infinite;
}
```

**Step 2: Update StatBar component**

In `apps/web/src/components/StatBar.tsx`:

- Add `rpg-bar-shimmer` class to the fill bar div
- Add glow `box-shadow` to HP bars that scales with fill percentage:
  ```
  style={{ boxShadow: color === 'health' ? `0 0 ${Math.round(percent * 8)}px ${barColor}33` : undefined }}
  ```
- Add XP milestone markers: three small tick marks at 25%, 50%, 75% via absolutely positioned divs inside the bar track when `color === 'xp'`:
  ```tsx
  {color === 'xp' && [25, 50, 75].map(pct => (
    <div key={pct} className="absolute top-0 bottom-0 w-px bg-[var(--rpg-text-secondary)]/30" style={{ left: `${pct}%` }} />
  ))}
  ```
- Use `--rpg-hp-warning` color when HP is between 40-60%

**Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/web/src/components/StatBar.tsx apps/web/src/app/globals.css
git commit -m "feat(ui): add stat bar shimmer, HP glow, XP milestones"
```

---

### Task 7: Screen Transitions & Staggered Lists

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/screens/Dashboard.tsx`
- Modify: `apps/web/src/components/screens/Skills.tsx`
- Modify: `apps/web/src/components/screens/Inventory.tsx`
- Modify: `apps/web/src/components/screens/Equipment.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/components/screens/Rest.tsx`

**Step 1: Add transition animations to globals.css**

```css
@keyframes screen-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.rpg-screen-enter {
  animation: screen-enter 0.25s ease-out both;
}

@keyframes stagger-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.rpg-stagger-item {
  animation: stagger-in 0.2s ease-out both;
}
```

**Step 2: Wrap each screen's root element with `rpg-screen-enter` class**

For each screen component (Dashboard, Skills, Inventory, Equipment, Crafting, Rest), add `rpg-screen-enter` to the outermost container div's className.

**Step 3: Add staggered animation to list items**

In components that render lists of cards (Skills skill cards, Inventory item grid, Equipment slots, Dashboard attribute cards), add to each mapped item:

```tsx
className="rpg-stagger-item"
style={{ animationDelay: `${index * 40}ms` }}
```

Cap the max delay at 400ms (i.e., `Math.min(index * 40, 400)`).

**Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/components/screens/
git commit -m "feat(ui): add screen transitions and staggered list reveals"
```

---

### Task 8: Header & Navigation Redesign

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add header border decoration to globals.css**

```css
.rpg-header-border {
  position: relative;
}

.rpg-header-border::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--rpg-gold) 20%,
    var(--rpg-gold) 80%,
    transparent 100%
  );
  opacity: 0.3;
}

/* Gold nav underline glow for active tab */
.rpg-nav-active {
  position: relative;
}

.rpg-nav-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 25%;
  right: 25%;
  height: 2px;
  background: var(--rpg-gold);
  box-shadow: 0 0 6px var(--rpg-gold-glow);
  border-radius: 1px;
}
```

**Step 2: Restyle AppShell header**

In `apps/web/src/components/AppShell.tsx`:

- Add `rpg-header-border` class to the header element
- Change "Adventure" title to use `font-display` (Almendra)
- Add subtle gold text shadow: `style={{ textShadow: '0 0 12px rgba(212,168,75,0.3)' }}`
- Change turn counter number to use `font-pixel` (Silkscreen)
- Add an hourglass icon (⏳ or Lucide `Timer` icon) next to turns

**Step 3: Restyle BottomNav**

In `apps/web/src/components/BottomNav.tsx`:

- Add text labels beneath each icon in `font-body text-[10px]`
- Replace active state color-only with `rpg-nav-active` class for gold underline glow
- Increase icon container size slightly (from current to w-7 h-7)
- Use `font-body` for labels

**Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/components/BottomNav.tsx apps/web/src/app/globals.css
git commit -m "feat(ui): redesign header with ornamental border and nav with gold glow"
```

---

### Task 9: Loot & Combat Polish

**Files:**
- Modify: `apps/web/src/components/ItemCard.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx` (or relevant combat results component)

**Step 1: Add loot reveal animations to globals.css**

```css
@keyframes loot-reveal {
  from {
    opacity: 0;
    transform: scale(0.8) rotateY(10deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotateY(0deg);
  }
}

.rpg-loot-reveal {
  animation: loot-reveal 0.3s ease-out both;
}

@keyframes legendary-flash {
  0% { box-shadow: 0 0 0 0 rgba(212, 168, 75, 0); }
  30% { box-shadow: 0 0 20px 4px rgba(212, 168, 75, 0.6); }
  100% { box-shadow: 0 0 12px 2px rgba(212, 168, 75, 0.4); }
}

.rpg-legendary-flash {
  animation: legendary-flash 0.6s ease-out both;
}

@keyframes victory-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(212, 168, 75, 0); }
  50% { box-shadow: 0 0 12px 2px rgba(212, 168, 75, 0.3); }
}

.rpg-victory-pulse {
  animation: victory-pulse 1.5s ease-in-out 2;
}

/* Boss kill particle burst */
@keyframes particle-burst {
  0% { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0); }
}
```

**Step 2: Apply loot animations to ItemCard**

In `apps/web/src/components/ItemCard.tsx`, when used in reward/loot contexts, add:
- `rpg-loot-reveal` class with staggered `animationDelay`
- For legendary rarity items, additionally apply `rpg-legendary-flash`

Add an optional `animationDelay` prop:

```tsx
interface ItemCardProps {
  // ... existing props
  animationDelay?: number;
}
```

Apply in the component:

```tsx
className={`rpg-loot-reveal ${rarity === 'legendary' ? 'rpg-legendary-flash' : ''}`}
style={{ animationDelay: animationDelay ? `${animationDelay}ms` : undefined }}
```

**Step 3: Style combat log entries**

In the combat playback component, apply font styling:
- Mob names: `font-display`
- Damage/heal numbers: `font-pixel`
- Color-code log text: green for heals, red for damage, gold for crits (`text-[var(--rpg-gold)]`), blue for spells
- Use `--rpg-surface-light` as background for the combat log container

**Step 4: Add victory styling**

On the combat results/rewards card, apply `rpg-victory-pulse` class when outcome is victory.

**Step 5: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add apps/web/src/components/ItemCard.tsx apps/web/src/app/globals.css apps/web/src/components/combat/
git commit -m "feat(ui): add loot reveal animations, combat log styling, victory effects"
```

---

### Task 10: Apply Fonts & Ornaments Across Screens

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx`
- Modify: `apps/web/src/components/screens/Equipment.tsx`
- Modify: `apps/web/src/components/screens/Inventory.tsx`
- Modify: `apps/web/src/components/screens/Skills.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/components/screens/Rest.tsx`
- Modify: `apps/web/src/components/PixelButton.tsx`
- Modify: `apps/web/src/components/SkillCard.tsx` (if exists)
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/register/page.tsx`

**Step 1: Apply display font to all headings**

Search all screen components for section headings (`text-xl`, `text-2xl`, `text-lg` used as titles) and add `font-display` class.

Examples:
- Dashboard: "Dashboard" header, attribute names
- Skills: "Skills" header
- Equipment: "Equipment" header, slot names
- Inventory: "Inventory" header
- Crafting: "Crafting" header, recipe names

**Step 2: Apply pixel font to all game numbers**

Search for `font-mono` usage and replace with `font-pixel` where it represents game values:
- Turn counts, gold amounts, XP values
- Damage numbers, HP values
- Stat numbers, level numbers
- Keep `font-mono` for non-game text (like code or IDs if any)

**Step 3: Apply body font to buttons**

In `apps/web/src/components/PixelButton.tsx`, add `font-body` to base classes.

**Step 4: Apply ornate PixelCard variants to key panels**

- Dashboard: Turn counter card → `variant="ornate"`, attribute cards → `variant="framed"`
- Equipment: Paperdoll panel → `variant="ornate"`, selected item detail → `variant="framed"`
- Inventory: Item detail modal → `variant="framed"`
- Combat: Encounter site detail → `variant="framed"`

**Step 5: Add Divider components**

Import `Divider` and use it to replace key `border-b` separators between major sections in:
- Dashboard (between turn info and attributes, between attributes and activity log)
- Equipment (between equipped and inventory sections)
- Skills (between header and skill list)

**Step 6: Style auth pages**

In `apps/web/src/app/login/page.tsx` and `register/page.tsx`:
- Title ("Welcome Back", "Create Your Character"): `font-display`
- Add gold text shadow to titles
- Add `rpg-card-texture` class to the form container
- Input labels: `font-body`

**Step 7: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

**Step 8: Visual smoke test**

Run: `npm run dev:web` and visually check:
- Dashboard renders with display font headers, pixel font numbers, ornate cards
- Bottom nav shows labels and gold active glow
- Screen transitions animate on tab switches
- Stat bars shimmer and glow
- Auth pages have textured cards with display font titles

**Step 9: Commit**

```bash
git add apps/web/src/
git commit -m "feat(ui): apply fonts, ornaments, and dividers across all screens"
```
