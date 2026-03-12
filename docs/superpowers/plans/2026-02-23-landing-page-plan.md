# Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the placeholder home page with a single-page scroll landing page that sells the game and the Champion subscription using existing pixel art assets.

**Architecture:** Server component at `apps/web/src/app/page.tsx` using Tailwind + `--rpg-*` CSS variables. Reuses `PixelButton` and `PixelCard` components. Six sections: Hero, Features, Zones, Monsters, Champion, Footer. Mobile-first responsive layout.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS, existing `--rpg-*` theme system.

**Design doc:** `docs/superpowers/specs/2026-02-23-landing-page-design.md`

---

### Task 1: Clean Up — Delete Old CSS Module

The current `page.module.css` uses broken CSS variables (`--color-gold`, `--color-light-gray`, etc.) that don't exist. We're replacing the entire page with Tailwind, so this file is no longer needed.

**Files:**
- Delete: `apps/web/src/app/page.module.css`

**Step 1: Delete the file**

```bash
rm apps/web/src/app/page.module.css
```

**Step 2: Commit**

```bash
git add apps/web/src/app/page.module.css
git commit -m "chore: remove broken page.module.css from old landing page"
```

---

### Task 2: Add Rainbow Title CSS Animation

Add the rainbow animation to `globals.css`. This will be used by the Champion preview on the landing page and later by the full Champion subscription system.

**Files:**
- Modify: `apps/web/src/app/globals.css` (add after the slideIn animation, ~line 100)

**Step 1: Add the animation**

Add at end of `apps/web/src/app/globals.css`:

```css
/* Champion rainbow title */
@keyframes rainbow-title {
  0% { color: #ff0000; }
  16% { color: #ff8800; }
  33% { color: #ffff00; }
  50% { color: #00ff00; }
  66% { color: #0088ff; }
  83% { color: #8800ff; }
  100% { color: #ff0000; }
}

.rainbow-title {
  animation: rainbow-title 3s linear infinite;
  font-weight: bold;
}
```

**Step 2: Verify the app still builds**

Run: `npm run build:web`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: add rainbow title CSS animation for Champion"
```

---

### Task 3: Create ChampionBadge Component

A reusable badge component for the landing page's Champion preview and later for leaderboards.

**Files:**
- Create: `apps/web/src/components/common/ChampionBadge.tsx`

**Step 1: Create the component**

Create `apps/web/src/components/common/ChampionBadge.tsx`:

```tsx
import { cn } from '@/lib/utils';

interface ChampionBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function ChampionBadge({ size = 'sm', className }: ChampionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-bold',
        'bg-gradient-to-r from-yellow-600 via-amber-400 to-yellow-600',
        'text-[var(--rpg-background)]',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        className
      )}
    >
      Champion
    </span>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/common/ChampionBadge.tsx
git commit -m "feat: add ChampionBadge component"
```

---

### Task 4: Build the Hero Section

Replace the entire `page.tsx` with the new landing page, starting with the Hero section. We'll build section by section, each task adding one.

**Files:**
- Modify: `apps/web/src/app/page.tsx` (full rewrite)

**Step 1: Rewrite page.tsx with Hero section**

Replace `apps/web/src/app/page.tsx` with:

```tsx
import Image from 'next/image';
import { PixelButton } from '@/components/PixelButton';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="/assets/zones/zone_ancient_grove.png"
          alt="Ancient Grove"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />
        <div className="relative z-10 text-center px-4 max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 text-[var(--rpg-gold)] drop-shadow-lg">
            Adventure RPG
          </h1>
          <p className="text-xl md:text-2xl text-[var(--rpg-text-primary)] mb-2">
            A turn-based RPG that respects your time.
          </p>
          <p className="text-base md:text-lg text-[var(--rpg-text-secondary)] mb-8">
            Explore. Fight. Craft. Progress — at your own pace.
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/register">
              <PixelButton variant="primary" size="lg">Play Free</PixelButton>
            </a>
            <a href="#features">
              <PixelButton variant="secondary" size="lg">Learn More</PixelButton>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Visual check**

Run: `npm run dev:web`
Open: `http://localhost:3002`
Expected: Full-screen hero with zone art background, gold title, tagline, two buttons.

**Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: add hero section to landing page"
```

---

### Task 5: Add Feature Cards Section

**Files:**
- Modify: `apps/web/src/app/page.tsx` (add after Hero section, before closing `</main>`)

**Step 1: Add the feature cards section**

Add after the Hero `</section>` closing tag:

```tsx
      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: '/assets/ui/ui_attack.png',
                title: 'Fight',
                desc: 'Battle 80+ monsters across 11 zones. D&D-style combat with crits, spells, and boss raids.',
              },
              {
                icon: '/assets/ui/ui_explore.png',
                title: 'Explore',
                desc: 'Discover hidden caches, encounter sites, and zone exits. Every turn spent is a roll of the dice.',
              },
              {
                icon: '/assets/ui/ui_inventory.png',
                title: 'Craft',
                desc: 'Forge weapons, brew potions, salvage loot. 14 skills to master from weaponsmithing to alchemy.',
              },
              {
                icon: '/assets/ui/ui_turn.png',
                title: 'Play Your Way',
                desc: 'Turns regenerate in real-time. Play in bursts or binge your bank — no energy walls, no waiting rooms.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-6 text-center"
              >
                <Image
                  src={feature.icon}
                  alt={feature.title}
                  width={64}
                  height={64}
                  className="mx-auto mb-4"
                />
                <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--rpg-text-secondary)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Visual check**

Refresh `http://localhost:3002`, scroll down past hero.
Expected: 4 cards with UI icons, headings, descriptions. Stacks on mobile, 4-column on desktop.

**Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: add feature cards section to landing page"
```

---

### Task 6: Add Zone Showcase Section

**Files:**
- Modify: `apps/web/src/app/page.tsx` (add after Features section)

**Step 1: Add the zone showcase**

Add after the Features `</section>`:

```tsx
      {/* Zone Showcase */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-[var(--rpg-gold)] mb-12">
            11 Zones to Discover
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {[
              { src: '/assets/zones/zone_ancient_grove.png', name: 'Ancient Grove' },
              { src: '/assets/zones/zone_crystal_caverns.png', name: 'Crystal Caverns' },
              { src: '/assets/zones/zone_haunted_marsh.png', name: 'Haunted Marsh' },
              { src: '/assets/zones/zone_sunken_ruins.png', name: 'Sunken Ruins' },
              { src: '/assets/zones/zone_deep_forest.png', name: 'Deep Forest' },
            ].map((zone) => (
              <div
                key={zone.name}
                className="relative flex-shrink-0 w-72 h-44 rounded-lg overflow-hidden snap-center"
              >
                <Image
                  src={zone.src}
                  alt={zone.name}
                  fill
                  className="object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-3 text-[var(--rpg-gold)] font-bold text-sm">
                  {zone.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
```

**Step 2: Add scrollbar-hide utility to globals.css**

Add to `apps/web/src/app/globals.css`:

```css
/* Hide scrollbar for horizontal scroll strips */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 4: Visual check**

Refresh and scroll to zones.
Expected: Horizontally scrollable strip of zone art cards with names in gold.

**Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/globals.css
git commit -m "feat: add zone showcase section to landing page"
```

---

### Task 7: Add Monster Parade Section

**Files:**
- Modify: `apps/web/src/app/page.tsx` (add after Zone Showcase section)

**Step 1: Add the monster parade**

Add after the Zone Showcase `</section>`:

```tsx
      {/* Monster Parade */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-[var(--rpg-gold)] mb-12">
            80+ Monsters. 2 World Bosses. Good Luck.
          </h2>
          <div className="flex justify-center items-end gap-6 md:gap-10 flex-wrap">
            {[
              { src: '/assets/monsters/monster_goblin_king.png', name: 'Goblin King', size: 96 },
              { src: '/assets/monsters/monster_crystal_titan.png', name: 'Crystal Titan', size: 120 },
              { src: '/assets/monsters/monster_alpha_wolf.png', name: 'Alpha Wolf', size: 112 },
              { src: '/assets/monsters/monster_ancient_spirit.png', name: 'Ancient Spirit', size: 128 },
              { src: '/assets/monsters/monster_fae_queen.png', name: 'Fae Queen', size: 104 },
              { src: '/assets/monsters/monster_death_knight.png', name: 'Death Knight', size: 116 },
            ].map((monster) => (
              <div key={monster.name} className="flex flex-col items-center gap-2">
                <Image
                  src={monster.src}
                  alt={monster.name}
                  width={monster.size}
                  height={monster.size}
                  className="drop-shadow-[0_0_12px_rgba(212,168,75,0.3)]"
                  loading="lazy"
                />
                <span className="text-xs text-[var(--rpg-text-secondary)]">{monster.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Visual check**

Refresh and scroll to monsters.
Expected: Row of 6 monsters at varied sizes, names below each, subtle gold glow. Wraps on mobile.

**Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: add monster parade section to landing page"
```

---

### Task 8: Add Champion Subscription Section

**Files:**
- Modify: `apps/web/src/app/page.tsx` (add after Monster Parade section)

**Step 1: Add the Champion section**

This section includes the mock leaderboard row with the actual `ChampionBadge` component and `rainbow-title` CSS class.

Add after the Monster Parade `</section>`:

```tsx
      {/* Champion Subscription */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="border border-[var(--rpg-gold)]/40 rounded-xl p-8 md:p-12 bg-gradient-to-b from-[var(--rpg-gold)]/5 to-transparent">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-[var(--rpg-gold)] mb-2">
              Go Champion
            </h2>
            <p className="text-center text-2xl font-bold text-[var(--rpg-text-primary)] mb-2">
              £4.99/month
            </p>
            <p className="text-center text-[var(--rpg-text-secondary)] mb-8">
              Everything you do, 10% better.
            </p>

            {/* Mock leaderboard preview */}
            <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-4 mb-8 flex items-center justify-center gap-3 text-sm">
              <span className="text-[var(--rpg-text-secondary)]">#1</span>
              <ChampionBadge size="sm" />
              <span className="text-[var(--rpg-text-primary)] font-semibold">YourName</span>
              <span className="rainbow-title">Champion</span>
              <span className="text-[var(--rpg-text-secondary)]">Lv. 42</span>
            </div>

            {/* Perks grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-sm">
              {[
                '10% more turns (24h bank cap)',
                '10% faster turn regen',
                '10% crafting crit bonus',
                '10% gathering yield & crit',
                '10% more chest & cache loot',
                '10% boss reward bonus',
                'Rainbow Champion title',
                'Leaderboard badge',
              ].map((perk) => (
                <div key={perk} className="flex items-center gap-2 text-[var(--rpg-text-primary)]">
                  <span className="text-[var(--rpg-gold)]">+</span>
                  {perk}
                </div>
              ))}
            </div>

            <div className="text-center">
              <a href="/register">
                <PixelButton variant="gold" size="lg">Become Champion</PixelButton>
              </a>
              <p className="text-xs text-[var(--rpg-text-secondary)] mt-3">
                No combat advantages. No pay-to-win. Just efficiency.
              </p>
            </div>
          </div>
        </div>
      </section>
```

**Step 2: Add the ChampionBadge import at the top of page.tsx**

```tsx
import { ChampionBadge } from '@/components/common/ChampionBadge';
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 4: Visual check**

Refresh and scroll to Champion section.
Expected: Gold-bordered card with price, animated rainbow title in the mock leaderboard row, perk list in 2 columns, gold CTA button.

**Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: add Champion subscription section to landing page"
```

---

### Task 9: Add Footer CTA Section

**Files:**
- Modify: `apps/web/src/app/page.tsx` (add after Champion section, before closing `</main>`)

**Step 1: Add the footer CTA**

Add after the Champion `</section>`:

```tsx
      {/* Footer CTA */}
      <section className="py-20 px-4 border-t border-[var(--rpg-border)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--rpg-text-primary)] mb-8">
            Your Adventure Starts Now
          </h2>
          <div className="flex gap-4 justify-center mb-6">
            <a href="/register">
              <PixelButton variant="primary" size="lg">Play Free</PixelButton>
            </a>
            <a href="/register">
              <PixelButton variant="gold" size="lg">Become Champion</PixelButton>
            </a>
          </div>
          <a href="/login" className="text-sm text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors">
            Already playing? Log in
          </a>
        </div>
      </section>
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Visual check**

Refresh and scroll to bottom.
Expected: "Your Adventure Starts Now" heading, two buttons, login link.

**Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: add footer CTA section to landing page"
```

---

### Task 10: Smooth Scroll Behavior

The "Learn More" button in the Hero links to `#features`. Add smooth scroll behavior.

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add smooth scroll**

Add to the `html, body` rule in `apps/web/src/app/globals.css`:

```css
html {
  scroll-behavior: smooth;
}
```

Note: Check if the existing `html, body` rule can be split or if `scroll-behavior` should be added separately to just `html`.

**Step 2: Visual check**

Click "Learn More" button on hero.
Expected: Page smoothly scrolls to the Features section.

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: add smooth scroll for landing page anchor links"
```

---

### Task 11: Responsive Polish and Final Checks

Review the full page on mobile and desktop widths. Fix any layout issues.

**Files:**
- Modify: `apps/web/src/app/page.tsx` (if adjustments needed)

**Step 1: Test at mobile width (375px)**

Open browser dev tools, set viewport to 375px wide.
Check each section:
- Hero: title should wrap nicely, buttons should stack or stay side by side
- Features: cards should stack in single column
- Zones: horizontal scroll should work with snap
- Monsters: should wrap into 2-3 per row
- Champion: perk list should be single column
- Footer: buttons should stay side by side

**Step 2: Test at tablet width (768px)**

- Features: 2 columns
- Zones: scroll strip still works
- Champion: perks in 2 columns

**Step 3: Test at desktop width (1280px)**

- Features: 4 columns
- Everything should be well-centered with max-width constraints

**Step 4: Fix any issues found**

Apply responsive fixes as needed. Common fixes:
- Add `flex-wrap` if buttons overflow on small screens
- Adjust text sizes with responsive prefixes (`text-3xl md:text-5xl`)
- Ensure images don't overflow containers

**Step 5: Full build check**

Run: `npm run build:web`
Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "fix: responsive polish for landing page"
```

---

### Task 12: Update Page Metadata

Update the root layout metadata to be more descriptive for SEO and social sharing.

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Update metadata**

Update the `metadata` export in `apps/web/src/app/layout.tsx`:

```typescript
export const metadata: Metadata = {
  title: 'Adventure RPG — Turn-Based Async RPG',
  description: 'A turn-based RPG that respects your time. Explore 11 zones, battle 80+ monsters, master 14 crafting skills, and raid world bosses. Play free or go Champion.',
  manifest: '/manifest.json',
};
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: update page metadata for SEO"
```

---

## Implementation Notes

### Dependencies Between Tasks
- Task 1 (delete CSS) must be before Task 4 (rewrite page.tsx)
- Task 2 (rainbow CSS) and Task 3 (ChampionBadge) must be before Task 8 (Champion section)
- Tasks 4-9 are sequential (each adds a section to page.tsx)
- Tasks 10-12 are independent of each other but should come after Tasks 4-9

### What's Deferred for Champion Subscription Implementation
- The "Become Champion" button currently links to `/register`. When Stripe integration is built (see `docs/superpowers/plans/2026-02-23-champion-subscription-plan.md`), it should link to the Stripe Checkout flow (or `/register` first if not logged in, then redirect to checkout).
- The `ChampionBadge` component created here will be reused by the leaderboard and other game screens.
- The `rainbow-title` CSS class created here will be reused for actual player titles in-game.

### Image Optimization
- Next.js `<Image>` component handles responsive sizing and WebP conversion automatically.
- Hero image uses `priority` prop (above the fold).
- All other images use `loading="lazy"`.
- Monster images use explicit `width`/`height` to prevent layout shift.
- Zone images use `fill` with `object-cover` inside sized containers.
