# Tutorial System DRY Refactor & Expansion - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all tutorial popups into a single reusable component, fix the clipping bug, prevent changelog from showing on first login, add tutorials to 7 new screens, and clean up em dashes across tutorials and changelog.

**Architecture:** Create a `FeatureTutorial` wrapper component that handles localStorage check, show/dismiss state, modal overlay with scroll support, title, and dismiss button. Migrate all 6 existing standalone tutorials and `FirstVisitHowTo` to use it. Add new tutorials to screens that lack them.

**Tech Stack:** React, TypeScript, localStorage, existing ModalOverlay/PixelButton components

---

### Task 1: Create FeatureTutorial Component

**Files:**
- Create: `apps/web/src/components/common/FeatureTutorial.tsx`

**Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { ModalOverlay } from './ModalOverlay';

interface FeatureTutorialProps {
  storageKey: string;
  title: string;
  children: ReactNode;
  condition?: boolean;
}

export function FeatureTutorial({ storageKey, title, children, condition = true }: FeatureTutorialProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (condition && !localStorage.getItem(storageKey)) {
      setShow(true);
    }
  }, [storageKey, condition]);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, '1');
    setShow(false);
  };

  return (
    <ModalOverlay opacity={60}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-xl p-6 max-w-sm mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">{title}</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          {children}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc apps/web/src/components/common/FeatureTutorial.tsx --noEmit`

**Step 3: Commit**

```
feat: add FeatureTutorial reusable component
```

---

### Task 2: Migrate ForgeTutorial to FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/ForgeTutorial.tsx`

**Step 1: Replace contents**

Replace the entire file with:

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function ForgeTutorial() {
  return (
    <FeatureTutorial storageKey="forgeTutorialSeen" title="The Forge">
      <p>
        The Forge lets you <strong>upgrade</strong> item rarity or <strong>reroll</strong> bonus stats.
        Both require a sacrificial item of the same rarity.
      </p>
      <p>
        <strong>Upgrade</strong> attempts to raise your item one rarity tier.
        Success adds a new bonus stat, but failure destroys the item.
      </p>
      <p>
        <strong>Reroll</strong> re-randomises all bonus stats on an Uncommon+ item.
        The item is never destroyed.
      </p>
      <p className="text-[var(--rpg-green-light)]">
        <strong>Skill discount:</strong> If you&apos;ve learned the crafting recipe for an item,
        forge upgrade and salvage costs are reduced by 20% for each crafting level above the recipe
        requirement. At 5+ levels above, it&apos;s free!
      </p>
    </FeatureTutorial>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc apps/web/src/components/common/ForgeTutorial.tsx --noEmit`

---

### Task 3: Migrate TemplateTutorial to FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/TemplateTutorial.tsx`

**Step 1: Replace contents**

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function TemplateTutorial() {
  return (
    <FeatureTutorial storageKey="templateTutorialSeen" title="Combat Templates">
      <p>
        Templates define your <strong>action rotation</strong>, the sequence of abilities
        your character uses each combat round, repeating when it reaches the end.
      </p>
      <p>
        <strong>Basic actions</strong> like Light Attack, Defend, and Counter are always
        available. Unlock more powerful abilities in the <strong>Skill Tree</strong>.
      </p>
      <p>
        Each action costs <strong>stamina</strong> or <strong>mana</strong>. If you
        can&apos;t afford your next action, you&apos;ll automatically Defend instead.
        The resource preview shows how sustainable your rotation is.
      </p>
      <p className="text-[var(--rpg-green-light)]">
        <strong>Tip:</strong> Mix offensive and defensive actions. A rotation of all heavy
        attacks will exhaust you fast!
      </p>
    </FeatureTutorial>
  );
}
```

---

### Task 4: Migrate SkillTreeTutorial to FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/SkillTreeTutorial.tsx`

**Step 1: Replace contents**

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function SkillTreeTutorial() {
  return (
    <FeatureTutorial storageKey="skillTreeTutorialSeen" title="Skill Tree">
      <p>
        You earn <strong>skill points</strong> every time one of your skills levels up.
        Spend them here to unlock powerful combat abilities.
      </p>
      <p>
        Each tree has 5 tiers of nodes: <strong>Melee</strong>, <strong>Ranged</strong>,
        <strong>Magic</strong>, and <strong>General</strong>. Higher tiers require investing
        points in earlier tiers first.
      </p>
      <p>
        Nodes that <strong>unlock an action</strong> let you add that ability to your combat
        template. Passive nodes boost your stats permanently.
      </p>
      <p className="text-[var(--rpg-green-light)]">
        <strong>Respec</strong> resets all allocations for 50,000 turns. Choose wisely!
      </p>
    </FeatureTutorial>
  );
}
```

---

### Task 5: Migrate StashTutorial to FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/StashTutorial.tsx`

**Step 1: Replace contents**

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function StashTutorial() {
  return (
    <FeatureTutorial storageKey="stashTutorialSeen" title="Town Stash">
      <p>
        The <strong>Stash</strong> lets you store items safely while you adventure.
        Stashed items don&apos;t count toward your backpack capacity.
      </p>
      <p>
        You can deposit and withdraw items from any town.
        Use it to keep valuable gear, materials, and potions safe.
      </p>
    </FeatureTutorial>
  );
}
```

---

### Task 6: Migrate LootOverflowTutorial to FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/LootOverflowTutorial.tsx`

**Step 1: Replace contents**

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function LootOverflowTutorial() {
  return (
    <FeatureTutorial storageKey="lootOverflowTutorialSeen" title="Loot Overflow">
      <p>
        Your backpack is full! You can only carry a limited number of items.
        Select which loot to keep. <strong>Unclaimed items will be lost</strong>.
      </p>
      <p>
        You have <strong>10 minutes</strong> to claim your loot before it
        expires. Minimize the picker to free up space, then reopen to claim.
      </p>
      <p>
        Equip a better <strong>backpack</strong> to increase your carrying capacity,
        or <strong>stash</strong> items in town to free up space.
      </p>
    </FeatureTutorial>
  );
}
```

---

### Task 7: Migrate XpRateTutorial to FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/XpRateTutorial.tsx`

**Step 1: Replace contents**

The `XpRateTutorial` uses a `condition` prop since it only shows when XP rate drops below 100%.

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

interface XpRateTutorialProps {
  skillName: string;
  rate: number;
}

export function XpRateTutorial({ skillName, rate }: XpRateTutorialProps) {
  return (
    <FeatureTutorial storageKey="xpRateTutorialSeen" title="XP Rate" condition={rate < 100}>
      <p>
        Your {skillName} XP Rate dropped to {rate}%. As you train a skill, you earn XP slightly slower.
      </p>
      <ul className="text-[var(--rpg-text-secondary)] space-y-1">
        <li>Resets every 6 hours</li>
        <li>Train other skills meanwhile</li>
        <li>You still earn XP, just less</li>
      </ul>
    </FeatureTutorial>
  );
}
```

---

### Task 8: Migrate FirstVisitHowTo to Use FeatureTutorial

**Files:**
- Modify: `apps/web/src/components/common/FirstVisitHowTo.tsx`

**Step 1: Replace contents**

`FirstVisitHowTo` becomes a thin wrapper that maps its `sections` prop into JSX children.

```tsx
'use client';

import { FeatureTutorial } from './FeatureTutorial';

interface FirstVisitHowToProps {
  storageKey: string;
  title: string;
  sections: { heading: string; text: string }[];
}

export function FirstVisitHowTo({ storageKey, title, sections }: FirstVisitHowToProps) {
  return (
    <FeatureTutorial storageKey={storageKey} title={title}>
      {sections.map((s) => (
        <div key={s.heading}>
          <h4 className="text-xs font-semibold text-[var(--rpg-text-primary)] mb-0.5">{s.heading}</h4>
          <p className="text-xs text-[var(--rpg-text-secondary)] leading-relaxed">{s.text}</p>
        </div>
      ))}
    </FeatureTutorial>
  );
}
```

**Step 2: Verify compilation**

Run: `npx tsc apps/web/src/components/common/FirstVisitHowTo.tsx --noEmit`

**Step 3: Commit all migrations**

```
refactor: migrate all tutorial popups to FeatureTutorial
```

---

### Task 9: Fix Changelog on First Login

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Find the changelog auto-show logic**

At line ~533 in `useGameController.ts`, inside the `useEffect` that runs when `isAuthenticated` changes:

```ts
const latestVer = getLatestVersion();
if (latestVer && localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestVer) {
  setShowChangelog(true);
}
```

**Step 2: Move the changelog check into the loadAll callback, after tutorialStep is known**

Remove the changelog check from the `isAuthenticated` useEffect (lines ~531-535).

Add it after line 396 where `tutorialStep` is set from the server response. If `tutorialStep === 0` (brand new player), auto-set `lastSeenChangelog` to the current version and skip showing the modal. Otherwise, check as before:

```ts
setTutorialStep(playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED);

// Don't show changelog to brand new players (step 0) — they haven't played before
const serverTutorialStep = playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED;
const latestVer = getLatestVersion();
if (latestVer && localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestVer) {
  if (serverTutorialStep === 0) {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, latestVer);
  } else {
    setShowChangelog(true);
  }
}
```

**Step 3: Commit**

```
fix: don't show changelog popup on first login for new players
```

---

### Task 10: Add New Tutorials to Screens

**Files:**
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`
- Modify: `apps/web/src/components/screens/Equipment.tsx`
- Modify: `apps/web/src/components/screens/Bestiary.tsx`
- Modify: `apps/web/src/components/screens/Achievements.tsx`
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`
- Modify: `apps/web/src/components/screens/WorldEvents.tsx`
- Modify: `apps/web/src/components/screens/Quests.tsx`

For each screen: import `FeatureTutorial`, add it as the first child inside the outermost container.

**Step 1: GuildScreen**

Add import at top:
```tsx
import { FeatureTutorial } from '@/components/common/FeatureTutorial';
```

Add as first child inside the `ScreenContainer` in the main guild view (after the loading/no-guild early returns):
```tsx
<FeatureTutorial storageKey="howto_guild" title="Guilds">
  <p>
    Guilds are player-run groups. Join one to access shared upgrades,
    weekly contracts, and collaborative projects.
  </p>
  <p>
    <strong>Roles:</strong> Leaders manage settings and promotions. Officers can
    accept join requests and kick members. Members contribute to projects and contracts.
  </p>
  <p>
    <strong>Tax:</strong> A percentage of your turn income goes to the guild treasury,
    funding upgrades and projects.
  </p>
  <p className="text-[var(--rpg-green-light)]">
    <strong>Tip:</strong> Check the Contracts tab for weekly bounties that reward
    the whole guild when completed.
  </p>
</FeatureTutorial>
```

**Step 2: Equipment**

Add import and tutorial:
```tsx
<FeatureTutorial storageKey="howto_equipment" title="Equipment">
  <p>
    Equip gear across <strong>11 slots</strong>: head, neck, chest, gloves, belt, legs,
    boots, main hand, off hand, ring, and charm.
  </p>
  <p>
    Equipment has <strong>durability</strong> that degrades per hit. Weapons lose durability
    when you attack; armour loses durability when you take hits. Broken gear has reduced stats.
  </p>
  <p className="text-[var(--rpg-green-light)]">
    <strong>Tip:</strong> Use Repair All after long sessions to keep your gear in shape.
    Craft or find a backpack to increase carrying capacity.
  </p>
</FeatureTutorial>
```

**Step 3: Bestiary**

```tsx
<FeatureTutorial storageKey="howto_bestiary" title="Bestiary">
  <p>
    The Bestiary tracks every monster you&apos;ve encountered. Discover new mobs by
    exploring different zones and tiers.
  </p>
  <p>
    Each entry shows the mob&apos;s stats, drops, and which zones it appears in.
    <strong> Prefixes</strong> are variant modifiers that make mobs stronger with
    unique abilities.
  </p>
  <p className="text-[var(--rpg-green-light)]">
    <strong>Tip:</strong> Fight boss encounters to progressively reveal their attack
    rotation in the Bestiary.
  </p>
</FeatureTutorial>
```

**Step 4: Achievements**

```tsx
<FeatureTutorial storageKey="howto_achievements" title="Achievements">
  <p>
    Earn achievements by reaching milestones in combat, crafting, gathering,
    exploration, and more. Each one grants rewards like turns, attribute points, or XP.
  </p>
  <p>
    Many achievements form <strong>chains</strong> with multiple tiers. Complete
    one tier to unlock the next.
  </p>
  <p className="text-[var(--rpg-green-light)]">
    <strong>Titles:</strong> Some achievements unlock titles you can equip.
    Set your active title from any completed achievement that offers one.
  </p>
</FeatureTutorial>
```

**Step 5: ZoneMap**

```tsx
<FeatureTutorial storageKey="howto_zones" title="Zone Map">
  <p>
    The world is made up of connected zones. <strong>Travel</strong> between them
    by spending turns. Click any discovered zone to auto-path through intermediate zones.
  </p>
  <p>
    <strong>Wild zones</strong> have monsters and resources. <strong>Town zones</strong>
    offer crafting, the forge, stash, and shops.
  </p>
  <p>
    Explore deeper into a zone to unlock higher-tier mobs and discover connections
    to new areas.
  </p>
  <p className="text-[var(--rpg-green-light)]">
    <strong>Tip:</strong> Returning to a previously visited zone via breadcrumb is free.
  </p>
</FeatureTutorial>
```

**Step 6: WorldEvents**

```tsx
<FeatureTutorial storageKey="howto_world_events" title="World Events">
  <p>
    World events are timed occurrences that modify zones with buffs and debuffs.
    Events can boost drop rates, increase mob spawns, or change resource yields.
  </p>
  <p>
    <strong>Global events</strong> affect all zones. <strong>Zone events</strong> only
    affect specific areas. Check the event badges on encounter sites and gathering nodes
    to see active modifiers.
  </p>
  <p className="text-[var(--rpg-green-light)]">
    <strong>Tip:</strong> Boss encounters spawn during certain events. Rally other
    players to take them down for unique loot.
  </p>
</FeatureTutorial>
```

**Step 7: Quests**

```tsx
<FeatureTutorial storageKey="howto_quests" title="Quests & Shop">
  <p>
    You receive <strong>three daily quests</strong> and <strong>one weekly quest</strong>,
    randomly assigned from categories like combat, exploration, crafting, and gathering.
  </p>
  <p>
    Complete quests to earn <strong>Quest Tokens</strong>. Finish all three dailies
    for a bonus payout. Don&apos;t like a quest? Use your free daily reroll.
  </p>
  <p>
    Spend tokens in the <strong>Shop</strong> tab on combat buffs, reset scrolls,
    teleport scrolls, and prestige titles.
  </p>
</FeatureTutorial>
```

**Step 8: Commit**

```
feat: add first-visit tutorials to 7 new screens
```

---

### Task 11: Clean Up Em Dashes in Tutorials and Changelog

**Files:**
- Modify: `apps/web/src/components/common/ForgeTutorial.tsx` (already clean)
- Modify: `apps/web/src/components/common/TemplateTutorial.tsx` (line 31: "rotation —" -> "rotation,")
- Modify: `apps/web/src/lib/changelog.ts` (multiple entries)

**Step 1: Fix TemplateTutorial**

The TemplateTutorial was already rewritten in Task 3 without the em dash. Verify.

**Step 2: Clean changelog entries**

In `apps/web/src/lib/changelog.ts`, replace all em dashes (`—`) with cleaner punctuation. Go through each entry:

- v0.31: `"…that stays pinned at the top of the screen — no more scrolling"` -> `"…that stays pinned at the top of the screen. No more scrolling"`
- v0.31: `"Map travel supports multi-hop routes: click any discovered zone and the game auto-paths through intermediate zones, showing hop-by-hop travel playback with ambush encounters along the way."` (no em dash, OK)
- v0.30: No em dashes, OK
- v0.29: No em dashes, OK
- v0.28: No em dashes, OK
- v0.27: No em dashes, OK
- v0.26: No em dashes, OK
- v0.25: `"if/then conditions — set slots"` -> `"if/then conditions. Set slots"`
- v0.25: `"it was broken by a stale field name"` (no em dash on this part, verify full text)
- v0.24: `"per hit instead of per fight"` -> OK
- v0.24: `"a quick skirmish with a field mouse barely scratches"` (no em dash, OK)
- v0.23: `"no longer auto-attack"` -> OK
- v0.22: All OK
- v0.21: OK
- v0.20: OK
- v0.19: OK
- v0.18: `"costs drop 20% per level above the recipe requirement, and at 5+ levels above it's free"` -> OK
- v0.17: OK
- v0.16: `"the old 'efficiency' system"` -> OK, `"the old all-or-nothing cutoff"` -> OK
- v0.15: `"much more visible — event badges"` -> `"much more visible. Event badges"`
- v0.14: OK
- v0.13: `"combat logs now load lazily — exploration"` -> `"combat logs now load lazily. Exploration"`
- v0.12: OK
- v0.11: OK
- v0.10: `"HP bars now appear directly on the Combat and Exploration screens so you always know where you stand"` -> OK
- v0.9: OK
- v0.8: `"achievements to earn across combat, gathering, crafting, and exploration"` -> OK, `"rooms for a full-clear bonus chest"` -> OK (hyphens, not em dashes)
- v0.7-v0.1: No em dashes

Search for all `—` in the file and replace each one. Expected matches: v0.31, v0.25, v0.15, v0.13. Replace with periods or commas as appropriate.

**Step 3: Commit**

```
fix: clean up em dashes in changelog entries
```

---

### Task 12: Final Verification

**Step 1: Type check**

Run: `npm run typecheck`
Expected: No new errors.

**Step 2: Build check**

Run: `npm run build:web`
Expected: Successful build.

**Step 3: Commit if any fixes needed, then final commit**

```
chore: tutorial DRY refactor complete
```
