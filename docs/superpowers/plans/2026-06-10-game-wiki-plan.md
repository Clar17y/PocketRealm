# Game Wiki Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, statically-generated game wiki at `/wiki/*` that imports formulas and constants directly from `@pocketrealm/shared` and `@pocketrealm/game-engine`, styled with the game's RPG dark fantasy theme.

**Architecture:** Next.js App Router pages under `apps/web/src/app/wiki/` using React Server Components. No auth, no API calls, no dynamic data. All content derived from direct package imports at build time. Shared wiki UI components in `apps/web/src/components/wiki/`.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, `@pocketrealm/shared`, `@pocketrealm/game-engine`, Lucide React icons.

**Spec:** `docs/superpowers/specs/2026-06-10-game-wiki-design.md`

---

## File Structure

### New files

```
apps/web/src/
├── app/wiki/
│   ├── layout.tsx                          # Wiki layout: sidebar + breadcrumb + content area
│   ├── page.tsx                            # /wiki index — hub with system cards
│   ├── wiki.css                            # Wiki-specific styles (formula colors, sidebar, tables)
│   ├── wikiNavigation.ts                   # Typed sidebar tree data structure
│   ├── combat/
│   │   ├── damage/page.tsx                 # Damage calculation formulas
│   │   ├── hit-chance/page.tsx             # Hit/miss sigmoid curves
│   │   ├── critical-hits/page.tsx          # Crit chance & crit damage
│   │   ├── actions/page.tsx                # All combat actions table
│   │   ├── buffs-debuffs/page.tsx          # Buff/debuff/DoT system
│   │   ├── defensive-mechanics/page.tsx    # Counter, ward, defend, channeling
│   │   └── mob-prefixes/page.tsx           # Mob prefix stat modifier tables
│   ├── bosses/
│   │   ├── encounters/page.tsx             # Boss tier scaling & round resolution
│   │   ├── threat/page.tsx                 # Threat system & contribution scoring
│   │   └── expeditions/page.tsx            # Expedition/raid mechanics
│   ├── pvp/
│   │   ├── combat/page.tsx                 # PvP combat & hit curve differences
│   │   └── elo/page.tsx                    # ELO rating & matchmaking
│   ├── progression/
│   │   ├── xp-leveling/page.tsx            # XP formula, level-from-XP inverse
│   │   ├── efficiency/page.tsx             # Efficiency decay, daily caps, XP windows
│   │   └── skill-points/page.tsx           # Talent point allocation
│   ├── resources/
│   │   ├── health/page.tsx                 # Max HP, passive regen, rest, knockout
│   │   ├── stamina/page.tsx                # Max stamina, regen, rest
│   │   ├── mana/page.tsx                   # Max mana, regen, rest
│   │   └── flee/page.tsx                   # Flee chance & outcome tiers
│   ├── items/
│   │   ├── rarity/page.tsx                 # Rarity tiers, bonus slots, stat ranges
│   │   ├── drops/page.tsx                  # Drop weight tables, mob level scaling
│   │   ├── forge/page.tsx                  # Upgrade success, reroll costs, luck
│   │   ├── durability/page.tsx             # Durability, repair, sell prices
│   │   └── inventory/page.tsx              # Backpack capacity formula, stash
│   ├── crafting/
│   │   ├── crits/page.tsx                  # Crafting crit, rare, epic formulas
│   │   ├── gathering/page.tsx              # Gathering yield, gem crit chance
│   │   └── salvage/page.tsx                # Salvage rates & material returns
│   └── exploration/
│       ├── probability/page.tsx            # Cumulative probability model
│       ├── rooms/page.tsx                  # Room generation & encounter sizes
│       ├── mob-tiers/page.tsx              # Mob tier filtering & bleedthrough
│       └── zones/page.tsx                  # Zone exit scaling, travel, exploration %
├── components/wiki/
│   ├── WikiSidebar.tsx                     # Collapsible tree navigation (client component)
│   ├── WikiMobileToggle.tsx                # Mobile sidebar toggle button + overlay (client component)
│   ├── WikiBreadcrumb.tsx                  # Breadcrumb from URL path
│   ├── WikiSection.tsx                     # Consistent page structure wrapper
│   ├── FormulaBlock.tsx                    # Color-coded formula rendering
│   ├── ConstantsTable.tsx                  # Standardized constants table
│   ├── RelatedPages.tsx                    # Cross-links to related wiki pages
│   └── WikiCard.tsx                        # Card component for index page
```

### Modified files

None. This is a new feature with no modifications to existing files.

---

## Chunk 1: Foundation — Layout, Navigation, Shared Components

### Task 1: Wiki CSS and navigation data

**Files:**
- Create: `apps/web/src/app/wiki/wiki.css`
- Create: `apps/web/src/app/wiki/wikiNavigation.ts`

- [ ] **Step 1: Create wiki.css with RPG-themed wiki styles**

The CSS uses existing CSS variables from `globals.css` (`--rpg-gold`, `--rpg-background`, `--rpg-surface`, `--rpg-text-primary`, `--rpg-text-secondary`, `--rpg-border`) wherever possible, with wiki-specific colors defined as new CSS variables at the top.

```css
/* Wiki-specific styles — imported by wiki layout.
   Uses existing RPG CSS variables from globals.css. */

.wiki-layout {
  --wiki-gold-dim: #806820;
  --wiki-gold-mid: #a08030;
  --wiki-bg-deep: #0d0a04;
  --wiki-text-body: #c8c0a0;
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1207 0%, #2a1f0e 50%, #1a1207 100%);
}

/* Sidebar */
.wiki-sidebar {
  width: 280px;
  min-height: 100vh;
  background: var(--wiki-bg-deep);
  border-right: 1px solid color-mix(in srgb, var(--rpg-gold) 20%, transparent);
  padding: 24px 0;
  overflow-y: auto;
  flex-shrink: 0;
}

.wiki-sidebar-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--rpg-gold);
  padding: 0 20px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--rpg-gold) 13%, transparent);
  margin-bottom: 8px;
}

.wiki-sidebar-section { padding: 8px 0; }

.wiki-sidebar-section-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--wiki-gold-dim);
  padding: 8px 20px 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
}

.wiki-sidebar-section-label:hover { color: var(--rpg-gold); }

.wiki-sidebar-link {
  display: block;
  font-size: 0.85rem;
  color: var(--wiki-gold-mid);
  padding: 5px 20px 5px 32px;
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}

.wiki-sidebar-link:hover {
  color: var(--rpg-text-primary);
  background: color-mix(in srgb, var(--rpg-gold) 4%, transparent);
}

.wiki-sidebar-link[data-active='true'] {
  color: var(--rpg-gold);
  background: color-mix(in srgb, var(--rpg-gold) 8%, transparent);
  border-right: 2px solid var(--rpg-gold);
}

/* Content area */
.wiki-content {
  flex: 1;
  max-width: 860px;
  padding: 32px 48px;
  margin: 0 auto;
}

/* Breadcrumb */
.wiki-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--wiki-gold-dim);
  margin-bottom: 24px;
}

.wiki-breadcrumb a {
  color: var(--wiki-gold-mid);
  text-decoration: none;
  transition: color 0.15s;
}

.wiki-breadcrumb a:hover { color: var(--rpg-gold); }

.wiki-breadcrumb-separator {
  color: color-mix(in srgb, var(--rpg-gold) 20%, transparent);
}

/* Page title */
.wiki-page-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--rpg-gold);
  margin-bottom: 8px;
  text-shadow: 0 0 20px color-mix(in srgb, var(--rpg-gold) 20%, transparent);
}

.wiki-page-summary {
  font-size: 0.95rem;
  color: var(--wiki-gold-mid);
  margin-bottom: 32px;
}

/* Formula blocks */
.wiki-formula {
  background: var(--wiki-bg-deep);
  border: 1px solid color-mix(in srgb, var(--rpg-gold) 13%, transparent);
  border-radius: 8px;
  padding: 16px 20px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  line-height: 1.7;
  overflow-x: auto;
  margin: 16px 0;
}

.wiki-formula .var-output { color: var(--rpg-green-light); }
.wiki-formula .var-player { color: var(--rpg-gold); }
.wiki-formula .var-enemy { color: var(--rpg-red); }
.wiki-formula .var-constant { color: #ffa657; }
.wiki-formula .var-operator { color: var(--wiki-gold-dim); }
.wiki-formula .var-comment { color: #5a4a20; font-style: italic; }

/* Constants table */
.wiki-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 0.85rem;
}

.wiki-table th {
  text-align: left;
  padding: 10px 14px;
  color: var(--rpg-gold);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid color-mix(in srgb, var(--rpg-gold) 20%, transparent);
  background: color-mix(in srgb, var(--wiki-bg-deep) 40%, transparent);
}

.wiki-table td {
  padding: 10px 14px;
  color: var(--rpg-text-primary);
  border-bottom: 1px solid color-mix(in srgb, var(--rpg-gold) 7%, transparent);
}

.wiki-table tr:hover td {
  background: color-mix(in srgb, var(--rpg-gold) 3%, transparent);
}

.wiki-table code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: #ffa657;
  background: var(--wiki-bg-deep);
  padding: 2px 6px;
  border-radius: 3px;
}

/* Section headings */
.wiki-section-heading {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--rpg-text-primary);
  margin: 40px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--rpg-gold) 13%, transparent);
}

/* Explanation text */
.wiki-explanation {
  font-size: 0.9rem;
  color: var(--wiki-text-body);
  line-height: 1.7;
  margin: 12px 0;
}

.wiki-explanation strong { color: var(--rpg-text-primary); }

/* Note/callout */
.wiki-note {
  border-left: 3px solid color-mix(in srgb, var(--rpg-gold) 27%, transparent);
  padding: 10px 16px;
  font-size: 0.85rem;
  color: var(--wiki-gold-mid);
  margin: 16px 0;
  background: color-mix(in srgb, var(--rpg-gold) 3%, transparent);
  border-radius: 0 6px 6px 0;
}

/* Related pages */
.wiki-related {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid color-mix(in srgb, var(--rpg-gold) 13%, transparent);
}

.wiki-related-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--wiki-gold-dim);
  margin-bottom: 12px;
}

.wiki-related-links { display: flex; flex-wrap: wrap; gap: 8px; }

.wiki-related-link {
  display: inline-block;
  padding: 6px 14px;
  font-size: 0.8rem;
  color: var(--rpg-gold);
  background: color-mix(in srgb, var(--rpg-gold) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--rpg-gold) 13%, transparent);
  border-radius: 6px;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}

.wiki-related-link:hover {
  background: color-mix(in srgb, var(--rpg-gold) 13%, transparent);
  border-color: color-mix(in srgb, var(--rpg-gold) 27%, transparent);
}

/* Index page cards */
.wiki-index-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.wiki-index-card {
  background: color-mix(in srgb, var(--wiki-bg-deep) 40%, transparent);
  border: 1px solid color-mix(in srgb, var(--rpg-gold) 13%, transparent);
  border-radius: 8px;
  padding: 20px;
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

.wiki-index-card:hover {
  border-color: color-mix(in srgb, var(--rpg-gold) 33%, transparent);
  background: color-mix(in srgb, var(--rpg-gold) 4%, transparent);
}

.wiki-index-card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--rpg-gold);
  margin-bottom: 8px;
}

.wiki-index-card-desc {
  font-size: 0.8rem;
  color: var(--wiki-gold-mid);
  line-height: 1.5;
}

.wiki-index-card-count {
  font-size: 0.7rem;
  color: var(--wiki-gold-dim);
  margin-top: 12px;
}

/* Mobile */
.wiki-mobile-toggle {
  display: none;
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 50;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--rpg-gold);
  color: var(--wiki-bg-deep);
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

@media (max-width: 768px) {
  .wiki-sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }

  .wiki-sidebar[data-open='true'] {
    transform: translateX(0);
  }

  .wiki-mobile-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .wiki-content { padding: 24px 16px; }

  .wiki-mobile-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.53);
    z-index: 35;
  }
}
```

- [ ] **Step 2: Create wikiNavigation.ts with typed sidebar tree**

```typescript
export interface WikiNavItem {
  label: string;
  href: string;
}

export interface WikiNavSection {
  label: string;
  slug: string;
  icon: string;
  items: WikiNavItem[];
}

export const wikiNavigation: WikiNavSection[] = [
  {
    label: 'Combat',
    slug: 'combat',
    icon: '⚔️',
    items: [
      { label: 'Damage Calculation', href: '/wiki/combat/damage' },
      { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
      { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
      { label: 'Actions & Abilities', href: '/wiki/combat/actions' },
      { label: 'Buffs, Debuffs & DoTs', href: '/wiki/combat/buffs-debuffs' },
      { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
      { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
    ],
  },
  {
    label: 'Bosses',
    slug: 'bosses',
    icon: '💀',
    items: [
      { label: 'Boss Encounters', href: '/wiki/bosses/encounters' },
      { label: 'Threat & Contribution', href: '/wiki/bosses/threat' },
      { label: 'Expeditions', href: '/wiki/bosses/expeditions' },
    ],
  },
  {
    label: 'PvP',
    slug: 'pvp',
    icon: '🏟️',
    items: [
      { label: 'PvP Combat', href: '/wiki/pvp/combat' },
      { label: 'ELO & Matchmaking', href: '/wiki/pvp/elo' },
    ],
  },
  {
    label: 'Progression',
    slug: 'progression',
    icon: '📈',
    items: [
      { label: 'XP & Leveling', href: '/wiki/progression/xp-leveling' },
      { label: 'Efficiency & Caps', href: '/wiki/progression/efficiency' },
      { label: 'Skill Points', href: '/wiki/progression/skill-points' },
    ],
  },
  {
    label: 'Resources',
    slug: 'resources',
    icon: '❤️',
    items: [
      { label: 'Health', href: '/wiki/resources/health' },
      { label: 'Stamina', href: '/wiki/resources/stamina' },
      { label: 'Mana', href: '/wiki/resources/mana' },
      { label: 'Flee Mechanics', href: '/wiki/resources/flee' },
    ],
  },
  {
    label: 'Items & Equipment',
    slug: 'items',
    icon: '🗡️',
    items: [
      { label: 'Rarity System', href: '/wiki/items/rarity' },
      { label: 'Drop Tables', href: '/wiki/items/drops' },
      { label: 'Forge & Upgrades', href: '/wiki/items/forge' },
      { label: 'Durability & Selling', href: '/wiki/items/durability' },
      { label: 'Inventory', href: '/wiki/items/inventory' },
    ],
  },
  {
    label: 'Crafting & Gathering',
    slug: 'crafting',
    icon: '🔨',
    items: [
      { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
      { label: 'Gathering & Gems', href: '/wiki/crafting/gathering' },
      { label: 'Salvage', href: '/wiki/crafting/salvage' },
    ],
  },
  {
    label: 'Exploration & Zones',
    slug: 'exploration',
    icon: '🗺️',
    items: [
      { label: 'Probability Model', href: '/wiki/exploration/probability' },
      { label: 'Room Generation', href: '/wiki/exploration/rooms' },
      { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
      { label: 'Zone Progression', href: '/wiki/exploration/zones' },
    ],
  },
];
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/wiki/wiki.css apps/web/src/app/wiki/wikiNavigation.ts
git commit -m "feat(wiki): add wiki styles and navigation data"
```

---

### Task 2: Shared wiki components

**Files:**
- Create: `apps/web/src/components/wiki/FormulaBlock.tsx`
- Create: `apps/web/src/components/wiki/ConstantsTable.tsx`
- Create: `apps/web/src/components/wiki/RelatedPages.tsx`
- Create: `apps/web/src/components/wiki/WikiCard.tsx`

- [ ] **Step 1: Create FormulaBlock component**

A server component that renders a formula with color-coded spans. Takes `children` as pre-formatted JSX so each page controls its own formula layout.

```tsx
interface FormulaBlockProps {
  children: React.ReactNode;
}

export function FormulaBlock({ children }: FormulaBlockProps) {
  return <div className="wiki-formula">{children}</div>;
}

// Helper spans for formula coloring — used inside FormulaBlock
export function Var({ children }: { children: React.ReactNode }) {
  return <span className="var-player">{children}</span>;
}

export function Out({ children }: { children: React.ReactNode }) {
  return <span className="var-output">{children}</span>;
}

export function Enemy({ children }: { children: React.ReactNode }) {
  return <span className="var-enemy">{children}</span>;
}

export function Const({ children }: { children: React.ReactNode }) {
  return <span className="var-constant">{children}</span>;
}

export function Op({ children }: { children: React.ReactNode }) {
  return <span className="var-operator">{children}</span>;
}

export function Comment({ children }: { children: React.ReactNode }) {
  return <span className="var-comment">{children}</span>;
}
```

- [ ] **Step 2: Create ConstantsTable component**

```tsx
interface ConstantRow {
  name: string;
  value: string | number;
  description: string;
}

interface ConstantsTableProps {
  rows: ConstantRow[];
}

export function ConstantsTable({ rows }: ConstantsTableProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Constant</th>
            <th>Value</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td><code>{row.name}</code></td>
              <td><code>{String(row.value)}</code></td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create RelatedPages component**

Uses `next/link` for client-side navigation between wiki pages.

```tsx
import Link from 'next/link';

interface RelatedPage {
  label: string;
  href: string;
}

interface RelatedPagesProps {
  pages: RelatedPage[];
}

export function RelatedPages({ pages }: RelatedPagesProps) {
  return (
    <div className="wiki-related">
      <div className="wiki-related-title">Related Pages</div>
      <div className="wiki-related-links">
        {pages.map((page) => (
          <Link key={page.href} href={page.href} className="wiki-related-link">
            {page.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create WikiCard component for index page**

```tsx
import Link from 'next/link';

interface WikiCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
  count: number;
}

export function WikiCard({ title, description, href, icon, count }: WikiCardProps) {
  return (
    <Link href={href} className="wiki-index-card">
      <div className="wiki-index-card-title">
        {icon} {title}
      </div>
      <div className="wiki-index-card-desc">{description}</div>
      <div className="wiki-index-card-count">{count} pages</div>
    </Link>
  );
}
```

- [ ] **Step 5: Create WikiSection component**

Enforces the consistent page structure from the design spec: title, summary, content sections, related pages. Used by every wiki page to avoid duplicating the layout boilerplate.

```tsx
import { RelatedPages } from './RelatedPages';

interface RelatedPage {
  label: string;
  href: string;
}

interface WikiSectionProps {
  title: string;
  summary: string;
  children: React.ReactNode;
  related?: RelatedPage[];
}

export function WikiSection({ title, summary, children, related }: WikiSectionProps) {
  return (
    <div>
      <h1 className="wiki-page-title">{title}</h1>
      <p className="wiki-page-summary">{summary}</p>
      {children}
      {related && related.length > 0 && <RelatedPages pages={related} />}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/wiki/FormulaBlock.tsx apps/web/src/components/wiki/ConstantsTable.tsx apps/web/src/components/wiki/RelatedPages.tsx apps/web/src/components/wiki/WikiCard.tsx apps/web/src/components/wiki/WikiSection.tsx
git commit -m "feat(wiki): add shared wiki components"
```

---

### Task 3: Wiki layout with sidebar and breadcrumb

**Files:**
- Create: `apps/web/src/components/wiki/WikiSidebar.tsx`
- Create: `apps/web/src/components/wiki/WikiBreadcrumb.tsx`
- Create: `apps/web/src/app/wiki/layout.tsx`

- [ ] **Step 1: Create WikiSidebar (client component — needs pathname + toggle state)**

Uses `next/link` for all internal navigation links.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { wikiNavigation } from '@/app/wiki/wikiNavigation';

export function WikiSidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const all = new Set<string>();
    for (const section of wikiNavigation) {
      if (pathname.startsWith(`/wiki/${section.slug}`)) {
        all.add(section.slug);
      }
    }
    return all;
  });

  function toggleSection(slug: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <nav className="wiki-sidebar" id="wiki-sidebar" data-open={open}>
      <Link href="/wiki" className="wiki-sidebar-title" style={{ display: 'block', textDecoration: 'none' }} onClick={onClose}>
        📜 Pocketrealm Wiki
      </Link>
      {wikiNavigation.map((section) => (
        <div key={section.slug} className="wiki-sidebar-section">
          <button
            className="wiki-sidebar-section-label"
            onClick={() => toggleSection(section.slug)}
            aria-expanded={openSections.has(section.slug)}
          >
            <span style={{ fontSize: '0.85rem' }}>{section.icon}</span>
            <span>{section.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.6rem' }}>
              {openSections.has(section.slug) ? '▼' : '▶'}
            </span>
          </button>
          {openSections.has(section.slug) && (
            <div>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="wiki-sidebar-link"
                  data-active={pathname === item.href}
                  onClick={onClose}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Create WikiMobileToggle (client component — manages sidebar open/close on mobile)**

```tsx
'use client';

import { useState } from 'react';
import { WikiSidebar } from './WikiSidebar';

export function WikiMobileToggle() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <div className="wiki-mobile-overlay" onClick={() => setOpen(false)} />}
      <WikiSidebar open={open} onClose={() => setOpen(false)} />
      <button className="wiki-mobile-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
        {open ? '✕' : '☰'}
      </button>
    </>
  );
}
```

**Note:** On desktop, the sidebar renders in its normal flow position (the `data-open` attribute and mobile overlay have no effect above 768px). On mobile, `WikiMobileToggle` controls the sidebar's `data-open` attribute and renders the overlay backdrop. The CSS handles the `position: fixed` / `transform` behavior via the `@media (max-width: 768px)` query.

- [ ] **Step 3: Create WikiBreadcrumb (client component — needs pathname)**

Uses `next/link` for navigation.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { wikiNavigation } from '@/app/wiki/wikiNavigation';

export function WikiBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs: { label: string; href: string }[] = [{ label: 'Wiki', href: '/wiki' }];

  const sectionSlug = segments[1];
  const section = wikiNavigation.find((s) => s.slug === sectionSlug);
  if (section) {
    crumbs.push({ label: section.label, href: `/wiki/${section.slug}` });

    const item = section.items.find((i) => i.href === pathname);
    if (item) {
      crumbs.push({ label: item.label, href: item.href });
    }
  }

  return (
    <div className="wiki-breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span className="wiki-breadcrumb-separator">›</span>}
          {i === crumbs.length - 1 ? (
            <span style={{ color: 'var(--rpg-text-primary)' }}>{crumb.label}</span>
          ) : (
            <Link href={crumb.href}>{crumb.label}</Link>
          )}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create wiki layout.tsx**

The layout renders `WikiSidebar` directly for desktop, plus `WikiMobileToggle` which controls the sidebar on mobile (hidden on desktop via CSS).

```tsx
import type { Metadata } from 'next';
import { WikiSidebar } from '@/components/wiki/WikiSidebar';
import { WikiMobileToggle } from '@/components/wiki/WikiMobileToggle';
import { WikiBreadcrumb } from '@/components/wiki/WikiBreadcrumb';
import './wiki.css';

export const metadata: Metadata = {
  title: {
    template: '%s | Pocketrealm Wiki',
    default: 'Pocketrealm Wiki',
  },
  description: 'Complete game mechanics reference for Pocketrealm — every formula, constant, and calculation explained.',
};

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wiki-layout">
      {/* Desktop: static sidebar. Mobile: controlled by WikiMobileToggle */}
      <div className="hidden md:block">
        <WikiSidebar />
      </div>
      <div className="md:hidden">
        <WikiMobileToggle />
      </div>
      <main className="wiki-content">
        <WikiBreadcrumb />
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Verify the layout builds**

Run: `cd apps/web && npx next build --no-lint 2>&1 | head -30`

Expected: Build starts without import errors. (It will fail on missing page.tsx — that's expected and fine, we'll add it next.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wiki/WikiSidebar.tsx apps/web/src/components/wiki/WikiMobileToggle.tsx apps/web/src/components/wiki/WikiBreadcrumb.tsx apps/web/src/app/wiki/layout.tsx
git commit -m "feat(wiki): add wiki layout with sidebar and breadcrumb"
```

---

### Task 4: Wiki index page

**Files:**
- Create: `apps/web/src/app/wiki/page.tsx`

- [ ] **Step 1: Create the wiki index page**

```tsx
import type { Metadata } from 'next';
import { WikiCard } from '@/components/wiki/WikiCard';
import { wikiNavigation } from './wikiNavigation';

export const metadata: Metadata = {
  title: 'Pocketrealm Wiki — Game Mechanics Reference',
  description: 'Complete transparent reference for all Pocketrealm game mechanics. Every formula, constant, and calculation — pulled directly from the source code.',
};

const sectionDescriptions: Record<string, string> = {
  combat: 'Damage formulas, hit curves, crit mechanics, actions, buffs, and mob modifiers.',
  bosses: 'Boss encounter scaling, threat system, contribution scoring, and expedition mechanics.',
  pvp: 'Player vs player combat differences, ELO rating, and matchmaking.',
  progression: 'XP formulas, leveling curves, efficiency decay, and skill point allocation.',
  resources: 'Health, stamina, and mana pools — max values, regen rates, rest, flee mechanics.',
  items: 'Item rarity, drop tables, forge upgrades, durability, sell prices, and inventory.',
  crafting: 'Crafting crit system, gathering yields, gem drops, and salvage rates.',
  exploration: 'Exploration probability model, room generation, mob tiers, and zone progression.',
};

export default function WikiIndexPage() {
  return (
    <div>
      <h1 className="wiki-page-title" style={{ fontSize: '2.5rem' }}>📜 Pocketrealm Wiki</h1>
      <p className="wiki-page-summary">
        Complete game mechanics reference — every formula, constant, and calculation pulled directly from the source code.
      </p>
      <div className="wiki-index-grid">
        {wikiNavigation.map((section) => (
          <WikiCard
            key={section.slug}
            title={section.label}
            description={sectionDescriptions[section.slug] ?? ''}
            href={section.items[0]?.href ?? `/wiki/${section.slug}`}
            icon={section.icon}
            count={section.items.length}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page builds and renders**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -20`

Expected: `/wiki` page compiles successfully as a static page.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/wiki/page.tsx
git commit -m "feat(wiki): add wiki index page with system cards"
```

---

## Chunk 2: Combat Wiki Pages

### Task 5: Combat — Damage Calculation page

**Files:**
- Create: `apps/web/src/app/wiki/combat/damage/page.tsx`

**Data sources:**
- `COMBAT_CONSTANTS` from `@pocketrealm/shared` — `CRIT_CHANCE`, `CRIT_MULTIPLIER`, `MIN_DAMAGE`
- `CHARACTER_CONSTANTS` from `@pocketrealm/shared` — `MELEE_DAMAGE_PER_STRENGTH`, `RANGED_DAMAGE_PER_DEXTERITY`, `MAGIC_DAMAGE_PER_INTELLIGENCE`

- [ ] **Step 1: Create the damage calculation wiki page**

This page documents:
1. Weapon damage range formula: `min = 1 + floor(totalAttack / 5)`, `max = 5 + floor(totalAttack / 2)`
2. Total attack composition: `skillLevel + weaponPower + attributeBonus`
3. Attribute bonus per scaling stat (melee/ranged/magic)
4. Action multiplier application
5. Defence reduction formula: `defence / (defence + 100)` diminishing returns
6. Final damage = `max(MIN_DAMAGE, floor(scaledDamage * (1 - defenceReduction)))`

The page imports `COMBAT_CONSTANTS` and `CHARACTER_CONSTANTS` directly and renders their values in the constants table. No hardcoded numbers — everything pulled from the source.

Each page follows the content pattern from the spec: title, summary, formula block, explanation, constants table, examples, related pages.

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx next build --no-lint 2>&1 | grep -E "(wiki|error|Error)"`

Expected: Page compiles. No import errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/wiki/combat/damage/page.tsx
git commit -m "feat(wiki): add damage calculation page"
```

---

### Task 6: Combat — Hit Chance page

**Files:**
- Create: `apps/web/src/app/wiki/combat/hit-chance/page.tsx`

**Data sources:**
- `COMBAT_CONSTANTS.HIT_CURVES` from `@pocketrealm/shared` — all 4 combat mode curves (pvp, pve_open_world, pve_expedition, pve_boss)
- `CHARACTER_CONSTANTS` for accuracy-per-attribute values

- [ ] **Step 1: Create the hit chance wiki page**

This page documents:
1. Sigmoid hit curve formula: `normalized = 1 / (1 + ((avoidScore + bias) / hitScore) ^ exponent)`
2. Hit chance clamping: `clamp(normalized, minHitChance, maxHitChance)`
3. Hit score composition: `skillLevel / 2 + equipmentAccuracy + attributeAccuracy + actionAccuracyModifier`
4. Avoid score composition: `dodge + evasion`
5. Table comparing all 4 combat mode hit curve parameters (imported from `COMBAT_CONSTANTS.HIT_CURVES`)

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/combat/hit-chance/page.tsx
git commit -m "feat(wiki): add hit chance page"
```

---

### Task 7: Combat — Critical Hits page

**Files:**
- Create: `apps/web/src/app/wiki/combat/critical-hits/page.tsx`

**Data sources:**
- `COMBAT_CONSTANTS` — `CRIT_CHANCE`, `CRIT_MULTIPLIER`
- `CRIT_STAT_CONSTANTS` from `@pocketrealm/shared` — crit chance/damage ranges per equipment slot

- [ ] **Step 1: Create the critical hits wiki page**

Documents:
1. Crit chance: `totalCritChance = CRIT_CHANCE + equipmentBonusCritChance`, clamped [0, 1]
2. Crit multiplier: `totalMultiplier = CRIT_MULTIPLIER + equipmentBonusCritDamage`
3. Equipment crit stat ranges table from `CRIT_STAT_CONSTANTS`

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/combat/critical-hits/page.tsx
git commit -m "feat(wiki): add critical hits page"
```

---

### Task 8: Combat — Actions & Abilities page

**Files:**
- Create: `apps/web/src/app/wiki/combat/actions/page.tsx`

**Data sources:**
- `BASE_ACTION_DEFINITIONS`, `getActionDefinition`, `ALWAYS_AVAILABLE_ACTION_IDS` from `@pocketrealm/shared` — the full action definitions array
- `COMBAT_ACTION_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the actions wiki page**

Documents all combat actions organized by category (Base, Melee Talents, Ranged Talents, Magic Talents, Cross-Type Talents, General). For each action, render a row in a table with: name, type, damage multiplier, accuracy modifier, cost (stamina/mana), scaling stat, special properties (channeling, always hits, defence reduction, life leech, etc.), and effect summary.

Import `BASE_ACTION_DEFINITIONS` directly and iterate over it — no hardcoded action data.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/combat/actions/page.tsx
git commit -m "feat(wiki): add combat actions page"
```

---

### Task 9: Combat — Buffs, Debuffs & DoTs page

**Files:**
- Create: `apps/web/src/app/wiki/combat/buffs-debuffs/page.tsx`

**Data sources:**
- `BASE_ACTION_DEFINITIONS`, `getActionDefinition`, `ALWAYS_AVAILABLE_ACTION_IDS` from `@pocketrealm/shared` — filter actions that have `effect` properties
- `COMBAT_CONSTANTS` — `POTION_SICKNESS_ROUNDS`

- [ ] **Step 1: Create the buffs/debuffs wiki page**

Documents:
1. Effect structure (stat, modifier, duration, isDebuff, damagePerRound, healPerRound, damagePerRoundPercent)
2. How DoTs work (snapshotted at application time, reduced by defence, tick each round)
3. How HoTs work
4. Stat modifier list (attack, defence, accuracy, dodge, magicDefence, speed, evasion)
5. Table of all actions with effects — auto-generated from filtering `BASE_ACTION_DEFINITIONS`
6. Potion sickness mechanic

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/combat/buffs-debuffs/page.tsx
git commit -m "feat(wiki): add buffs debuffs and DoTs page"
```

---

### Task 10: Combat — Defensive Mechanics page

**Files:**
- Create: `apps/web/src/app/wiki/combat/defensive-mechanics/page.tsx`

**Data sources:**
- `COMBAT_CONSTANTS` — `DEFEND_DAMAGE_REDUCTION`, `CHANNELING_BONUS_DAMAGE`

- [ ] **Step 1: Create the defensive mechanics wiki page**

Documents:
1. Counter vs physical — avoids physical offensive actions, costs 35 stamina, does NOT block magic
2. Ward vs magic — avoids magic attacks, costs 30 mana, does NOT block physical
3. Defend — flat damage reduction (from `DEFEND_DAMAGE_REDUCTION`), free, fallback when exhausted
4. Channeling vulnerability — `CHANNELING_BONUS_DAMAGE` multiplier vs channeling targets
5. Action exhaustion — what happens when a player can't afford any action (fallback to Defend)
6. Rock-paper-scissors interaction summary table

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/combat/defensive-mechanics/page.tsx
git commit -m "feat(wiki): add defensive mechanics page"
```

---

### Task 11: Combat — Mob Prefixes page

**Files:**
- Create: `apps/web/src/app/wiki/combat/mob-prefixes/page.tsx`

**Data sources:**
- `getAllMobPrefixes()` from `@pocketrealm/shared` — returns the full prefix definitions array with all stat multipliers. Also `NO_PREFIX_WEIGHT` for the base (no prefix) weight.

- [ ] **Step 1: Create the mob prefixes wiki page**

Documents:
1. What prefixes are and how they modify mob stats
2. Full table of all prefixes from `getAllMobPrefixes()`: weight, HP multiplier, accuracy, defence, magic defence, evasion, damage, XP multiplier, drop multiplier, description
3. Spell template properties for spell-casting prefixes (Shaman, Venomous, Spectral, Ancient)
4. Weighted random selection explanation (weight / totalWeight = probability)

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/combat/mob-prefixes/page.tsx
git commit -m "feat(wiki): add mob prefixes page"
```

---

### Task 12: Verify all combat pages build

- [ ] **Step 1: Build check**

Run: `cd apps/web && npx next build --no-lint 2>&1 | grep -E "(wiki|error|Error)"`

Expected: All 7 combat wiki pages compile successfully.

- [ ] **Step 2: Commit any fixes if needed**

---

## Chunk 3: Boss, PvP & Progression Pages

### Task 13: Bosses — Encounters page

**Files:**
- Create: `apps/web/src/app/wiki/bosses/encounters/page.tsx`

**Data sources:**
- `BOSS_ENCOUNTER_CONSTANTS` from `@pocketrealm/shared` — tier scaling table (HP per player, AoE damage, defence, base XP, single-target damage)

- [ ] **Step 1: Create the boss encounters wiki page**

Documents:
1. Boss round resolution flow (player actions → offensive resolution → supportive resolution → boss action)
2. Boss tier scaling table (tiers 1-5) from `BOSS_ENCOUNTER_CONSTANTS`
3. Multi-player signup mechanics
4. Round timing

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/bosses/encounters/page.tsx
git commit -m "feat(wiki): add boss encounters page"
```

---

### Task 14: Bosses — Threat & Contribution page

**Files:**
- Create: `apps/web/src/app/wiki/bosses/threat/page.tsx`

**Data sources:**
- `BOSS_ENCOUNTER_CONSTANTS` — `THREAT_PER_DAMAGE`, `THREAT_PER_HEAL`, `CONTRIBUTION_DAMAGE_WEIGHT`, `CONTRIBUTION_HEALING_WEIGHT`, `CONTRIBUTION_ABSORB_WEIGHT`, `CONTRIBUTION_SURVIVAL_FLAT_BONUS`

- [ ] **Step 1: Create the threat & contribution wiki page**

Documents:
1. Threat accumulation: damage × THREAT_PER_DAMAGE, healing × THREAT_PER_HEAL
2. Taunt mechanics: +500 threat + forced targeting for N rounds
3. Target selection: highest threat, taunted players prioritized, AoE hits all
4. Contribution scoring formula: `damage*1.0 + healing*1.0 + absorbed*0.9 + rounds*10`
5. How contribution determines loot share

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/bosses/threat/page.tsx
git commit -m "feat(wiki): add threat and contribution page"
```

---

### Task 15: Bosses — Expeditions page

**Files:**
- Create: `apps/web/src/app/wiki/bosses/expeditions/page.tsx`

**Data sources:**
- `EXPEDITION_THEMES`, `EXPEDITION_ROOM_COMPOSITIONS` from `@pocketrealm/shared`
- Relevant constants from `BOSS_ENCOUNTER_CONSTANTS`

- [ ] **Step 1: Create the expeditions wiki page**

Documents:
1. How expeditions differ from boss encounters (multiple mobs vs single boss)
2. Round resolution flow for raids (similar to boss but with mob targeting)
3. AoE action behavior (Cleave, Volley, Chain Lightning, Meteor Strike hit all mobs)
4. Mob threat-based aggression targeting
5. Expedition themes and room compositions from `EXPEDITION_THEMES` and `EXPEDITION_ROOM_COMPOSITIONS`

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/bosses/expeditions/page.tsx
git commit -m "feat(wiki): add expeditions page"
```

---

### Task 16: PvP — Combat page

**Files:**
- Create: `apps/web/src/app/wiki/pvp/combat/page.tsx`

**Data sources:**
- `COMBAT_CONSTANTS.HIT_CURVES` — specifically the `pvp` curve vs `pve_open_world`
- `PVP_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the PvP combat wiki page**

Documents:
1. How PvP combat differs from PvE (hit curves, ghost defender)
2. Hit curve comparison table: PvP vs all PvE modes
3. Attacker uses current HP/stamina/mana; defender uses max (simulated ghost)
4. Template combat engine — action templates drive 1v1 resolution
5. Scouting mechanics
6. Challenge turn cost from `PVP_CONSTANTS`

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/pvp/combat/page.tsx
git commit -m "feat(wiki): add PvP combat page"
```

---

### Task 17: PvP — ELO & Matchmaking page

**Files:**
- Create: `apps/web/src/app/wiki/pvp/elo/page.tsx`

**Data sources:**
- `PVP_CONSTANTS` from `@pocketrealm/shared` — `K_FACTOR`, `STARTING_RATING`, `COOLDOWN_HOURS`, `CHALLENGE_TURN_COST`

- [ ] **Step 1: Create the ELO wiki page**

Documents:
1. ELO formula: `expectedA = 1 / (1 + 10^((ratingB - ratingA) / 400))`
2. Rating change: `deltaA = round(K_FACTOR * (scoreA - expectedA))`
3. Rating floor at 0
4. K-factor, starting rating, cooldown hours from constants
5. Example ELO calculations at different rating gaps

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/pvp/elo/page.tsx
git commit -m "feat(wiki): add ELO and matchmaking page"
```

---

### Task 18: Progression — XP & Leveling page

**Files:**
- Create: `apps/web/src/app/wiki/progression/xp-leveling/page.tsx`

**Data sources:**
- `SKILL_CONSTANTS` from `@pocketrealm/shared` — `XP_BASE`, `XP_EXPONENT`, `MAX_LEVEL`
- `CHARACTER_CONSTANTS` — `XP_RATIO`
- `xpForLevel` from `@pocketrealm/game-engine` — call at build time to generate level table

- [ ] **Step 1: Create the XP & leveling wiki page**

Documents:
1. XP formula: `xpForLevel(level) = XP_BASE * level^XP_EXPONENT`
2. Level-from-XP: iterative inverse
3. Character XP: `floor(skillXp * CHARACTER_CONSTANTS.XP_RATIO)`
4. **Generated XP table:** Call `xpForLevel()` for levels 1-100 and render a table showing cumulative XP at each level

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/progression/xp-leveling/page.tsx
git commit -m "feat(wiki): add XP and leveling page"
```

---

### Task 19: Progression — Efficiency & Caps page

**Files:**
- Create: `apps/web/src/app/wiki/progression/efficiency/page.tsx`

**Data sources:**
- `SKILL_CONSTANTS` from `@pocketrealm/shared` — `XP_WINDOW_HOURS`, `EFFICIENCY_DECAY_POWER`, daily caps per skill category

- [ ] **Step 1: Create the efficiency wiki page**

Documents:
1. Efficiency formula: `max(0, 1 - (windowXpGained / cap)^EFFICIENCY_DECAY_POWER)`
2. Rolling window system: 4 windows per day (24 / XP_WINDOW_HOURS)
3. Per-window caps by skill category (combat: 3500, gathering/processing/crafting: 7500)
4. Quadratic decay curve explanation
5. Window reset mechanics (rolling, not calendar-based)

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/progression/efficiency/page.tsx
git commit -m "feat(wiki): add efficiency and caps page"
```

---

### Task 20: Progression — Skill Points page

**Files:**
- Create: `apps/web/src/app/wiki/progression/skill-points/page.tsx`

**Data sources:**
- `SKILL_POINT_CONSTANTS` from `@pocketrealm/shared`
- `TALENT_TREE_DEFINITIONS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the skill points wiki page**

Documents:
1. How skill points are earned
2. Talent tree structure from `TALENT_TREE_DEFINITIONS`
3. Allocation and respec mechanics from `SKILL_POINT_CONSTANTS`

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/progression/skill-points/page.tsx
git commit -m "feat(wiki): add skill points page"
```

---

### Task 21: Verify chunk 3 pages build

- [ ] **Step 1: Build check**

Run: `cd apps/web && npx next build --no-lint 2>&1 | grep -E "(wiki|error|Error)"`

Expected: All boss, PvP, and progression pages compile.

- [ ] **Step 2: Commit any fixes if needed**

---

## Chunk 4: Resources, Items, Crafting & Exploration Pages

### Task 22: Resources — Health page

**Files:**
- Create: `apps/web/src/app/wiki/resources/health/page.tsx`

**Data sources:**
- `HP_CONSTANTS` from `@pocketrealm/shared` — `BASE_HP`, `HP_PER_VITALITY`, `BASE_PASSIVE_REGEN`, `PASSIVE_REGEN_PER_VITALITY`, `BASE_REST_HEAL`, `REST_HEAL_PER_VITALITY`, `RECOVERY_TURNS_PER_MAX_HP`, `RECOVERY_EXIT_HP_PERCENT`, `LOW_HP_WARNING_THRESHOLD`

- [ ] **Step 1: Create the health wiki page**

Documents: max HP formula, passive regen, rest healing, knockout recovery cost, recovery exit HP.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/resources/health/page.tsx
git commit -m "feat(wiki): add health page"
```

---

### Task 23: Resources — Stamina page

**Files:**
- Create: `apps/web/src/app/wiki/resources/stamina/page.tsx`

**Data sources:**
- `STAMINA_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the stamina wiki page**

Documents: max stamina formula (`100 + avgLevel*3 + equipment`), regen per round, passive regen, rest healing.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/resources/stamina/page.tsx
git commit -m "feat(wiki): add stamina page"
```

---

### Task 24: Resources — Mana page

**Files:**
- Create: `apps/web/src/app/wiki/resources/mana/page.tsx`

**Data sources:**
- `MANA_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the mana wiki page**

Documents: max mana formula (`50 + magicLevel*3 + equipment`), regen per round, passive regen, rest healing.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/resources/mana/page.tsx
git commit -m "feat(wiki): add mana page"
```

---

### Task 25: Resources — Flee Mechanics page

**Files:**
- Create: `apps/web/src/app/wiki/resources/flee/page.tsx`

**Data sources:**
- `FLEE_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the flee mechanics wiki page**

Documents: flee chance formula, outcome tiers (clean escape, wounded escape, knockout), HP remaining and gold loss for each tier.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/resources/flee/page.tsx
git commit -m "feat(wiki): add flee mechanics page"
```

---

### Task 26: Items — Rarity System page

**Files:**
- Create: `apps/web/src/app/wiki/items/rarity/page.tsx`

**Data sources:**
- `ITEM_RARITY_CONSTANTS` from `@pocketrealm/shared` — bonus slots by rarity, base drop weights

- [ ] **Step 1: Create the rarity system wiki page**

Documents: 5 rarity tiers, bonus slots per rarity, crit stat ranges from `CRIT_STAT_CONSTANTS`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/items/rarity/page.tsx
git commit -m "feat(wiki): add rarity system page"
```

---

### Task 27: Items — Drop Tables page

**Files:**
- Create: `apps/web/src/app/wiki/items/drops/page.tsx`

**Data sources:**
- `ITEM_RARITY_CONSTANTS` from `@pocketrealm/shared` — base weights, `DROP_WEIGHT_SHIFT_PER_LEVEL_ABOVE_ONE`, shift distribution ratios

- [ ] **Step 1: Create the drop tables wiki page**

Documents: base rarity weights (common:650, uncommon:250, rare:80, epic:18, legendary:2), weight shifting per mob level, shift distribution formula, zone event dropChanceMultiplier.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/items/drops/page.tsx
git commit -m "feat(wiki): add drop tables page"
```

---

### Task 28: Items — Forge & Upgrades page

**Files:**
- Create: `apps/web/src/app/wiki/items/forge/page.tsx`

**Data sources:**
- `ITEM_RARITY_CONSTANTS` from `@pocketrealm/shared` — upgrade success rates, turn costs, luck bonus
- `CRAFTING_CONSTANTS` — forge discount per level

- [ ] **Step 1: Create the forge wiki page**

Documents: upgrade success chance by rarity, luck bonus formula, reroll costs, turn cost discount formula.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/items/forge/page.tsx
git commit -m "feat(wiki): add forge and upgrades page"
```

---

### Task 29: Items — Durability & Selling page

**Files:**
- Create: `apps/web/src/app/wiki/items/durability/page.tsx`

**Data sources:**
- `DURABILITY_CONSTANTS` from `@pocketrealm/shared`
- `SELL_CONSTANTS` from `@pocketrealm/shared` — rarity multipliers, durability penalty threshold

- [ ] **Step 1: Create the durability & selling wiki page**

Documents: durability degradation, repair costs, broken penalties, sell price formula with rarity multipliers and durability penalty.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/items/durability/page.tsx
git commit -m "feat(wiki): add durability and selling page"
```

---

### Task 30: Items — Inventory page

**Files:**
- Create: `apps/web/src/app/wiki/items/inventory/page.tsx`

**Data sources:**
- `INVENTORY_CONSTANTS` from `@pocketrealm/shared` — `BASE_CAPACITY`, `BACKPACK_SLOTS_PER_TIER`, `BACKPACK_SLOTS_PER_RARITY`

- [ ] **Step 1: Create the inventory wiki page**

Documents: total capacity formula (`24 + tier*8 + rarity_index*2 + belt + champion`), stash size.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/items/inventory/page.tsx
git commit -m "feat(wiki): add inventory page"
```

---

### Task 31: Crafting — Crafting Crits page

**Files:**
- Create: `apps/web/src/app/wiki/crafting/crits/page.tsx`

**Data sources:**
- `CRAFTING_CONSTANTS` from `@pocketrealm/shared` — `BASE_CRIT_CHANCE`, `CRIT_CHANCE_PER_LEVEL`, `LUCK_CRIT_BONUS_PER_POINT`, `RARE_CRAFT_BASE_CHANCE`, `EPIC_CRAFT_BASE_CHANCE`, and all related values

- [ ] **Step 1: Create the crafting crits wiki page**

Documents: crafting crit formula, rare craft chance formula, epic craft chance formula, crit rarity tier selection logic, bonus stat ranges.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/crafting/crits/page.tsx
git commit -m "feat(wiki): add crafting crits page"
```

---

### Task 32: Crafting — Gathering & Gems page

**Files:**
- Create: `apps/web/src/app/wiki/crafting/gathering/page.tsx`

**Data sources:**
- `GEM_CRIT_CONSTANTS` from `@pocketrealm/shared`
- `GATHERING_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the gathering wiki page**

Documents: gem crit chance formula (`0.03 + levels*0.005 + luck*0.003`, capped at 25%), gathering yield, turn costs.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/crafting/gathering/page.tsx
git commit -m "feat(wiki): add gathering and gems page"
```

---

### Task 33: Crafting — Salvage page

**Files:**
- Create: `apps/web/src/app/wiki/crafting/salvage/page.tsx`

**Data sources:**
- `CRAFTING_CONSTANTS` from `@pocketrealm/shared` — salvage rates, batch salvage

- [ ] **Step 1: Create the salvage wiki page**

Documents: salvage material return rates, batch salvage mechanics, turn costs.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/crafting/salvage/page.tsx
git commit -m "feat(wiki): add salvage page"
```

---

### Task 34: Exploration — Probability Model page

**Files:**
- Create: `apps/web/src/app/wiki/exploration/probability/page.tsx`

**Data sources:**
- `EXPLORATION_CONSTANTS` from `@pocketrealm/shared` — all per-turn chances
- `cumulativeProbability` from `@pocketrealm/game-engine` — call at build time to generate probability tables

- [ ] **Step 1: Create the probability model wiki page**

Documents: cumulative probability formula `1 - (1-p)^n`, per-turn rates (ambush 0.5%, encounter 0.08%, resource 0.05%, cache 0.01%), travel ambush (4%). Generate probability table for common turn investments (50, 100, 500, 1000 turns) by calling `cumulativeProbability()` at build time.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/exploration/probability/page.tsx
git commit -m "feat(wiki): add exploration probability page"
```

---

### Task 35: Exploration — Room Generation page

**Files:**
- Create: `apps/web/src/app/wiki/exploration/rooms/page.tsx`

**Data sources:**
- `ROOM_CONSTANTS` from `@pocketrealm/shared`
- `CHEST_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the room generation wiki page**

Documents: room counts by encounter size (small/medium/large), mobs per room ranges, chest drop mechanics (recipe chances, material roll counts).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/exploration/rooms/page.tsx
git commit -m "feat(wiki): add room generation page"
```

---

### Task 36: Exploration — Mob Tier Filtering page

**Files:**
- Create: `apps/web/src/app/wiki/exploration/mob-tiers/page.tsx`

**Data sources:**
- `TIER_BLEED_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the mob tier filtering wiki page**

Documents: tier filtering by zone exploration %, newest tier weight multiplier, tier bleedthrough probabilities (TWO_BELOW: 10%, ONE_BELOW: 15%, SELECTED: 50%, ONE_ABOVE: 15%, TWO_ABOVE: 10%).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/exploration/mob-tiers/page.tsx
git commit -m "feat(wiki): add mob tier filtering page"
```

---

### Task 37: Exploration — Zone Progression page

**Files:**
- Create: `apps/web/src/app/wiki/exploration/zones/page.tsx`

**Data sources:**
- `ZONE_CONSTANTS` from `@pocketrealm/shared`
- `ZONE_EXPLORATION_CONSTANTS` from `@pocketrealm/shared`

- [ ] **Step 1: Create the zone progression wiki page**

Documents: zone exit scaling formula (quadratic multiplier above 50% exploration), travel turn costs, terrain multipliers, zone exploration progress tracking.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wiki/exploration/zones/page.tsx
git commit -m "feat(wiki): add zone progression page"
```

---

### Task 38: Final build verification and cleanup

- [ ] **Step 1: Full build check**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -40`

Expected: All wiki pages compile. Static generation for all `/wiki/*` routes.

- [ ] **Step 2: Visual verification**

Run: `cd apps/web && npx next dev --port 3002`

Open `http://localhost:3002/wiki` and verify:
- Index page shows all 8 system cards
- Sidebar navigation works (sections collapse/expand, active state highlights)
- Breadcrumbs show correct path
- At least 3 content pages render with formulas, constants tables, and related links
- Mobile: sidebar collapses, toggle button appears

- [ ] **Step 3: Fix any issues found during verification**

- [ ] **Step 4: Final commit**

```bash
git add apps/web/src/app/wiki/ apps/web/src/components/wiki/
git commit -m "feat(wiki): complete game mechanics wiki with all pages"
```
