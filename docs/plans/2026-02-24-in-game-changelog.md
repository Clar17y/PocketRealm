# In-Game Changelog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show players what's new when they log in and let them re-read patch notes anytime.

**Architecture:** A TypeScript data file holds changelog entries (version, date, title, narrative summary). A modal component renders them. localStorage tracks what the player has seen. The header dropdown gets a "What's New" button with a notification dot.

**Tech Stack:** React, Tailwind CSS, localStorage

**Design doc:** `docs/plans/2026-02-24-in-game-changelog-design.md`

---

### Task 1: Create the changelog data file

**Files:**
- Create: `apps/web/src/lib/changelog.ts`

**Step 1: Create the data file**

```ts
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.12',
    date: '2026-02-24',
    title: 'Game Assets & Visual Polish',
    summary:
      'Added a full pixel art asset pack with icons, monsters, and zone backgrounds. Login and register pages redesigned with zone art. Pixelated 128px assets now used across all UI.',
  },
  {
    version: '0.11',
    date: '2026-02-23',
    title: 'Guilds, Jewellery & Landing Page',
    summary:
      'Guilds are here! Create or join a guild, take on weekly bounty contracts, and collaborate on guild projects. Plus a new Jewelcrafting skill — find gems while gathering and craft rings, necklaces, and charms. The landing page got a full redesign with zone showcases and a monster parade.',
  },
  {
    version: '0.10',
    date: '2026-02-22',
    title: 'HP Visibility & Equipment UX',
    summary:
      'HP bars now appear directly on the Combat and Exploration screens so you always know where you stand. Low-HP warnings protect you from risky actions. Equipment got repair buttons, a Repair All option, and durability bars on every item card.',
  },
  {
    version: '0.9',
    date: '2026-02-21',
    title: 'Tutorial, Admin & Preferences',
    summary:
      'New players get an 8-step interactive tutorial walking them through their first explore, fight, and craft. User preferences let you adjust combat speed, auto-skip known encounters, set default explore turns, and more.',
  },
  {
    version: '0.8',
    date: '2026-02-20',
    title: 'Achievements & Early Game Rooms',
    summary:
      'Nearly 100 achievements to earn across combat, gathering, crafting, and exploration. Encounter sites now have room-based progression — fight through multiple rooms for a full-clear bonus chest. Mob icons appear everywhere.',
  },
  {
    version: '0.7',
    date: '2026-02-19',
    title: 'Leaderboards & Zone Progression',
    summary:
      'Compete on leaderboards across multiple categories. Zones now track your exploration progress — unlock tougher mobs as you explore deeper into each area.',
  },
  {
    version: '0.6',
    date: '2026-02-17',
    title: 'PvP Arena & World Bosses',
    summary:
      'Challenge other players in the PvP arena with Elo-based matchmaking. World bosses spawn during events — rally together to take them down for trophies, loot, and unique recipes.',
  },
  {
    version: '0.5',
    date: '2026-02-15',
    title: 'World Events & Auto-Potions',
    summary:
      'Dynamic world events buff and debuff gathering, combat, and crafting across zones. Boss encounters appear during events. Auto-potion keeps you alive by using potions automatically in combat.',
  },
  {
    version: '0.4',
    date: '2026-02-13',
    title: 'Chat, Spells & Rare Crafting',
    summary:
      'Real-time zone chat with badges and pinned messages. Mobs now cast spells with damage, heals, buffs, and debuffs. Crafting can now crit into rare and epic quality. Town zones restrict crafting by level.',
  },
  {
    version: '0.3',
    date: '2026-02-12',
    title: 'Zone Travel & Combat Playback',
    summary:
      'Explore a connected world map and travel between zones — but watch out for ambushes. Combat and exploration play out with animated HP bars and progress tracking. Magic defence and durability systems added.',
  },
  {
    version: '0.2',
    date: '2026-02-09',
    title: 'Items, Crits & Attributes',
    summary:
      'Item rarity system with a Forge for upgrading and re-rolling gear. Crit chance and crit damage stats. Full attribute system with vitality, strength, dexterity, intelligence, luck, and evasion.',
  },
  {
    version: '0.1',
    date: '2026-02-05',
    title: 'HP System & Core Polish',
    summary:
      'Persistent HP with rest, knockout, and recovery. Flee mechanics let you escape tough fights. Enhanced combat log with damage calculations. New skills: foraging, woodcutting, and alchemy.',
  },
];

export function getLatestVersion(): string {
  return changelog[0]?.version ?? '';
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/changelog.ts
git commit -m "feat: add changelog data file with game update history"
```

---

### Task 2: Create the ChangelogModal component

**Files:**
- Create: `apps/web/src/components/common/ChangelogModal.tsx`
- Reference: `apps/web/src/components/common/LowHpWarningDialog.tsx` (modal pattern)

**Step 1: Create the component**

The modal follows the existing pattern from `LowHpWarningDialog.tsx`: `fixed inset-0 z-50` overlay, gold-bordered card, RPG theme variables.

```tsx
import { changelog } from '@/lib/changelog';

interface ChangelogModalProps {
  onDismiss: () => void;
}

export function ChangelogModal({ onDismiss }: ChangelogModalProps) {
  const [latest, ...older] = changelog;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[var(--rpg-bg-dark,#1a1a2e)] border border-[var(--rpg-gold,#c8a84e)] rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        <h2 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-4">
          What&apos;s New
        </h2>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Latest entry — prominent */}
          {latest && (
            <div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[var(--rpg-gold)] font-semibold">{latest.title}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)]">v{latest.version}</span>
              </div>
              <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">{latest.date}</p>
              <p className="text-sm text-[var(--rpg-text-primary)] leading-relaxed">{latest.summary}</p>
            </div>
          )}

          {/* Older entries — dimmed */}
          {older.length > 0 && (
            <>
              <hr className="border-[var(--rpg-border)]" />
              {older.map((entry) => (
                <div key={entry.version} className="opacity-60">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[var(--rpg-gold)] font-semibold text-sm">{entry.title}</span>
                    <span className="text-xs text-[var(--rpg-text-secondary)]">v{entry.version}</span>
                  </div>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">{entry.date}</p>
                  <p className="text-sm text-[var(--rpg-text-primary)] leading-relaxed">{entry.summary}</p>
                </div>
              ))}
            </>
          )}
        </div>

        <button
          className="mt-4 w-full bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all"
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/common/ChangelogModal.tsx
git commit -m "feat: add ChangelogModal component"
```

---

### Task 3: Add changelog seen tracking and auto-show logic

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
  - State declarations area (~line 440)
  - Initialization useEffect (~line 607)
  - Return object (end of hook)

**Step 1: Add state and localStorage logic**

Near the other state declarations (around line 440, after the existing state block), add:

```ts
const [showChangelog, setShowChangelog] = useState(false);
```

In the initialization useEffect (around line 609, after the `loadAll()` call), add the auto-show check:

```ts
// Auto-show changelog if player hasn't seen the latest version
const { getLatestVersion } = await import('@/lib/changelog');
const latest = getLatestVersion();
const seen = localStorage.getItem('lastSeenChangelog');
if (latest && seen !== latest) {
  setShowChangelog(true);
}
```

Add a dismiss handler alongside the other handler functions:

```ts
const dismissChangelog = () => {
  const { getLatestVersion } = require('@/lib/changelog');
  localStorage.setItem('lastSeenChangelog', getLatestVersion());
  setShowChangelog(false);
};

const openChangelog = () => setShowChangelog(true);
```

Add to the return object:

```ts
showChangelog,
dismissChangelog,
openChangelog,
```

**Step 2: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: add changelog seen tracking and auto-show logic to game controller"
```

---

### Task 4: Wire ChangelogModal into the game page

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`
  - Import section (top)
  - Destructuring from useGameController (~line 183)
  - JSX render area (~line 1068, inside the return)

**Step 1: Add import**

Add at the top with other component imports:

```ts
import { ChangelogModal } from '@/components/common/ChangelogModal';
```

**Step 2: Destructure new values from controller**

In the useGameController destructuring block (around line 183), add:

```ts
showChangelog,
dismissChangelog,
openChangelog,
```

**Step 3: Render the modal**

Inside the return JSX, right after the opening `<>` and before `<AppShell>` (around line 1068), add:

```tsx
{showChangelog && <ChangelogModal onDismiss={dismissChangelog} />}
```

**Step 4: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: wire ChangelogModal into game page with auto-show on login"
```

---

### Task 5: Add "What's New" to header dropdown

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
  - Props interface (~line 8)
  - Component params (~line 16)
  - Dropdown menu items (~line 67)

**Step 1: Extend AppShell props**

Add to the `AppShellProps` interface:

```ts
onWhatsNew?: () => void;
hasUnseenChangelog?: boolean;
```

Add to the destructured params:

```ts
export function AppShell({ children, turns = 0, username, onSettings, onLogout, onWhatsNew, hasUnseenChangelog }: AppShellProps) {
```

Update `hasMenu` to include the new callback:

```ts
const hasMenu = Boolean(onSettings || onLogout || onWhatsNew);
```

**Step 2: Add menu item**

Insert before the Settings button (around line 67):

```tsx
{onWhatsNew && (
  <button
    role="menuitem"
    onClick={() => { setDropdownOpen(false); onWhatsNew(); }}
    className="w-full text-left px-4 py-2 text-sm text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-background)] transition-colors flex items-center justify-between"
  >
    What&apos;s New
    {hasUnseenChangelog && (
      <span className="w-2 h-2 rounded-full bg-[var(--rpg-gold)]" />
    )}
  </button>
)}
```

**Step 3: Wire props in page.tsx**

In `apps/web/src/app/game/page.tsx`, update the `<AppShell>` usage (around line 1069):

```tsx
<AppShell
  turns={turns}
  username={player?.username}
  onSettings={() => handleNavigate('settings')}
  onLogout={() => { logout(); router.push('/'); }}
  onWhatsNew={openChangelog}
  hasUnseenChangelog={showChangelog}
>
```

Note: `hasUnseenChangelog` uses the same `showChangelog` state — it's true when there are unseen updates. When the user dismisses the modal, both the modal and the dot disappear. If they later open it via the dropdown, there's no dot (they've already seen it).

**Step 4: Commit**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: add What's New button to header dropdown with notification dot"
```

---

### Task 6: Verify and type-check

**Step 1: Run type checker**

```bash
npm run typecheck
```

Fix any TypeScript errors.

**Step 2: Run dev server and manually verify**

```bash
npm run dev
```

Verify:
- On login, changelog modal auto-appears
- "Got it" dismisses it and sets localStorage
- Refreshing page does NOT re-show the modal
- Header dropdown shows "What's New" without dot (already seen)
- Clearing `lastSeenChangelog` from localStorage and refreshing re-triggers auto-show
- Dropdown shows gold dot when unseen

**Step 3: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: resolve changelog integration issues"
```
