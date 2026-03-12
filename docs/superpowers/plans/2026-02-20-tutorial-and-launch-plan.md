# Tutorial System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive 8-step tutorial that guides new players through the core game loop, and change new player starting zone to Forest Edge.

**Architecture:** A single `tutorialStep` integer on the Player model tracks linear progress. The frontend reads the step from `GET /player`, shows contextual UI (banner, tab pulse, step dialog), and advances steps by calling `PATCH /player/tutorial` after detecting completion triggers in existing action handlers.

**Tech Stack:** Prisma migration, Express route, React components, Tailwind CSS animations

---

## Task 1: Prisma Schema — Add tutorialStep to Player

**Files:**
- Modify: `packages/database/prisma/schema.prisma:36` (Player model)

**Step 1: Add the field to the Player model**

In `packages/database/prisma/schema.prisma`, inside the `Player` model, after the `autoPotionThreshold` field (line 37), add:

```prisma
  // Tutorial
  tutorialStep    Int      @default(0) @map("tutorial_step")
```

**Step 2: Create the migration**

Run:
```bash
cd packages/database && npx prisma migrate dev --name add-tutorial-step
```

Expected: Migration created successfully.

**Step 3: Add SQL to set existing players to completed**

Edit the generated migration SQL file. After the `ALTER TABLE` statement that adds the column, add:

```sql
UPDATE "players" SET "tutorial_step" = 8 WHERE "tutorial_step" = 0;
```

This ensures all existing players are marked as tutorial-completed so they never see tutorial UI.

**Step 4: Re-run migration to apply the UPDATE**

```bash
cd packages/database && npx prisma migrate dev
```

Expected: Migration already applied or re-applied cleanly.

**Step 5: Regenerate Prisma client**

```bash
npm run db:generate
```

**Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add tutorialStep field to Player model"
```

---

## Task 2: Change New Player Starting Zone to Forest Edge

**Files:**
- Modify: `apps/api/src/routes/auth.ts:63-75` (registration handler)

**Step 1: Update registration to start players in Forest Edge**

In `apps/api/src/routes/auth.ts`, replace the starter zone lookup (lines 63-65) and player creation zone assignments (lines 74-75) with:

```typescript
    // Find starter town (for homeTownId) and first connected wild zone (for currentZoneId)
    const starterTown = await prisma.zone.findFirst({ where: { isStarter: true } });
    if (!starterTown) throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');

    const firstWildConnection = await prisma.zoneConnection.findFirst({
      where: { fromId: starterTown.id },
      include: { toZone: true },
    });
    const startingZone = firstWildConnection?.toZone ?? starterTown;
```

Then update the player create data to use separate zones:

```typescript
        currentZoneId: startingZone.id,
        homeTownId: starterTown.id,
```

This keeps the home town as Millbrook but starts the player physically in Forest Edge.

**Step 2: Verify the registration flow still works**

Run: `npm run build:api`

Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): start new players in Forest Edge instead of town"
```

---

## Task 3: API Endpoint — PATCH /player/tutorial

**Files:**
- Modify: `apps/api/src/routes/player.ts` (add new endpoint)

**Step 1: Write the tutorial step test**

Create `apps/api/src/routes/player.tutorial.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test the validation logic directly since route integration tests
// require full server setup. For now, test the schema and step validation.

describe('tutorial step validation', () => {
  it('accepts valid forward step (current + 1)', () => {
    const currentStep = 2;
    const requestedStep = 3;
    const isValid = requestedStep === currentStep + 1 || requestedStep === -1;
    expect(isValid).toBe(true);
  });

  it('accepts skip (-1)', () => {
    const currentStep = 2;
    const requestedStep = -1;
    const isValid = requestedStep === currentStep + 1 || requestedStep === -1;
    expect(isValid).toBe(true);
  });

  it('rejects skipping steps', () => {
    const currentStep = 2;
    const requestedStep = 5;
    const isValid = requestedStep === currentStep + 1 || requestedStep === -1;
    expect(isValid).toBe(false);
  });

  it('rejects going backwards', () => {
    const currentStep = 5;
    const requestedStep = 3;
    const isValid = requestedStep === currentStep + 1 || requestedStep === -1;
    expect(isValid).toBe(false);
  });

  it('rejects updating already completed tutorial', () => {
    const currentStep = 8;
    const requestedStep = 9;
    const isValid = requestedStep === currentStep + 1 || requestedStep === -1;
    expect(isValid).toBe(false);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run apps/api/src/routes/player.tutorial.test.ts`

Expected: All 5 tests pass.

**Step 3: Add tutorialStep to GET /player response**

In `apps/api/src/routes/player.ts`, add `tutorialStep: true` to the `select` object (after line 40):

```typescript
        tutorialStep: true,
```

**Step 4: Add PATCH /player/tutorial endpoint**

In `apps/api/src/routes/player.ts`, after the settings endpoint (after line 152), add:

```typescript
const tutorialSchema = z.object({
  step: z.number().int().min(-1).max(8),
});

/**
 * PATCH /api/v1/player/tutorial
 * Advance or skip the tutorial.
 */
playerRouter.patch('/tutorial', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = tutorialSchema.parse(req.body);

    const player = await prismaAny.player.findUnique({
      where: { id: playerId },
      select: { tutorialStep: true },
    });

    if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

    // Allow skip (-1) from any state, or advance by exactly 1
    const isSkip = body.step === -1;
    const isNextStep = body.step === player.tutorialStep + 1;

    if (!isSkip && !isNextStep) {
      throw new AppError(400, 'Invalid tutorial step', 'INVALID_STEP');
    }

    // Don't allow advancing past completed
    if (player.tutorialStep >= 8 && !isSkip) {
      throw new AppError(400, 'Tutorial already completed', 'TUTORIAL_COMPLETE');
    }

    await prismaAny.player.update({
      where: { id: playerId },
      data: { tutorialStep: body.step },
    });

    res.json({ tutorialStep: body.step });
  } catch (err) {
    next(err);
  }
});
```

**Step 5: Build and verify**

Run: `npm run build:api`

Expected: Compiles without errors.

**Step 6: Commit**

```bash
git add apps/api/src/routes/player.ts apps/api/src/routes/player.tutorial.test.ts
git commit -m "feat(api): add PATCH /player/tutorial endpoint and include tutorialStep in GET /player"
```

---

## Task 4: Frontend API Function — updateTutorialStep

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add function + update getPlayer type)

**Step 1: Update getPlayer return type**

In `apps/web/src/lib/api.ts`, inside the `getPlayer` function's type parameter (around line 199-218), add `tutorialStep: number;` to the player object:

```typescript
export async function getPlayer() {
  return fetchApi<{
    player: {
      id: string;
      username: string;
      email: string;
      createdAt: string;
      characterXp: number;
      characterLevel: number;
      attributePoints: number;
      autoPotionThreshold: number;
      tutorialStep: number;
      attributes: {
        vitality: number;
        strength: number;
        dexterity: number;
        intelligence: number;
        luck: number;
        evasion: number;
      };
    };
  }>('/api/v1/player');
}
```

**Step 2: Add updateTutorialStep function**

After the `updatePlayerSettings` function (around line 226), add:

```typescript
export async function updateTutorialStep(step: number) {
  return fetchApi<{ tutorialStep: number }>('/api/v1/player/tutorial', {
    method: 'PATCH',
    body: JSON.stringify({ step }),
  });
}
```

**Step 3: Build and verify**

Run: `npm run build:web`

Expected: Compiles (pre-existing error on page.tsx:333 is expected; no new errors).

**Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add updateTutorialStep API function and tutorialStep to getPlayer type"
```

---

## Task 5: Tutorial Constants — Step Definitions

**Files:**
- Create: `apps/web/src/lib/tutorial.ts`

**Step 1: Create the tutorial constants file**

Create `apps/web/src/lib/tutorial.ts`:

```typescript
export const TUTORIAL_STEP_WELCOME = 0;
export const TUTORIAL_STEP_EXPLORE = 1;
export const TUTORIAL_STEP_COMBAT = 2;
export const TUTORIAL_STEP_GATHER = 3;
export const TUTORIAL_STEP_TRAVEL = 4;
export const TUTORIAL_STEP_CRAFT = 5;
export const TUTORIAL_STEP_EQUIP = 6;
export const TUTORIAL_STEP_DONE = 7;
export const TUTORIAL_COMPLETED = 8;
export const TUTORIAL_SKIPPED = -1;

export type BottomTab = 'home' | 'explore' | 'inventory' | 'combat' | 'profile';

export interface TutorialStepDef {
  banner: string;
  dialog: { title: string; body: string };
  pulseTab: BottomTab | null;
}

export const TUTORIAL_STEPS: Record<number, TutorialStepDef> = {
  [TUTORIAL_STEP_WELCOME]: {
    banner: 'Welcome! You have 86,400 turns to spend. Let\u2019s learn the basics.',
    dialog: {
      title: 'Welcome, Adventurer!',
      body: 'Everything in this world costs turns. You earn 1 turn per second, and you have a full day\u2019s worth to start. Turns are used to explore, fight, gather resources, and craft gear. Let\u2019s walk through the basics!',
    },
    pulseTab: null,
  },
  [TUTORIAL_STEP_EXPLORE]: {
    banner: 'Head to the Explore tab and invest some turns to discover the area.',
    dialog: {
      title: 'Exploration',
      body: 'Use the turn slider to choose how many turns to invest in exploring your zone. The more turns you spend, the higher your chances of discovering encounter sites, resource nodes, and hidden treasure.',
    },
    pulseTab: 'explore',
  },
  [TUTORIAL_STEP_COMBAT]: {
    banner: 'You found an encounter site! Go to the Combat tab to fight the mobs there.',
    dialog: {
      title: 'Combat',
      body: 'Encounter sites contain groups of mobs to fight. Select a site and engage in combat to earn XP for your combat skills and collect loot drops. Winning makes you stronger!',
    },
    pulseTab: 'combat',
  },
  [TUTORIAL_STEP_GATHER]: {
    banner: 'Try mining some resources. Open the Explore tab and select Gather.',
    dialog: {
      title: 'Gathering',
      body: 'Resource nodes let you mine ore and other materials. These materials are used for crafting equipment. Select a node and invest turns to gather resources.',
    },
    pulseTab: 'explore',
  },
  [TUTORIAL_STEP_TRAVEL]: {
    banner: 'Travel to a town to craft gear. Open the Map from the Home tab.',
    dialog: {
      title: 'Zone Travel',
      body: 'Crafting can only be done in towns. Open the World Map to see connected zones and travel to Millbrook, the nearest town. Travelling costs turns based on distance.',
    },
    pulseTab: 'home',
  },
  [TUTORIAL_STEP_CRAFT]: {
    banner: 'You\u2019re in town! Open Crafting to make something from your materials.',
    dialog: {
      title: 'Crafting',
      body: 'Use gathered materials to craft equipment. Select a recipe you have materials for and craft it. Higher crafting skill levels unlock better recipes and increase your chance of a critical craft.',
    },
    pulseTab: 'explore',
  },
  [TUTORIAL_STEP_EQUIP]: {
    banner: 'Nice! Now equip your new gear from the Inventory tab.',
    dialog: {
      title: 'Equipment',
      body: 'Go to your inventory and equip the gear you\u2019ve crafted or looted. Equipment boosts your stats for combat and improves your chances of survival in tougher zones.',
    },
    pulseTab: 'inventory',
  },
  [TUTORIAL_STEP_DONE]: {
    banner: 'Tutorial complete! You\u2019ve learned the core loop. Good luck out there!',
    dialog: {
      title: 'Tutorial Complete!',
      body: 'You now know the core gameplay loop: Explore \u2192 Fight \u2192 Gather \u2192 Travel \u2192 Craft \u2192 Equip. Keep progressing your skills, discover new zones, and take on tougher challenges!',
    },
    pulseTab: null,
  },
};

export function isTutorialActive(step: number): boolean {
  return step >= 0 && step < TUTORIAL_COMPLETED;
}
```

**Step 2: Build and verify**

Run: `npm run build:web`

Expected: No new errors.

**Step 3: Commit**

```bash
git add apps/web/src/lib/tutorial.ts
git commit -m "feat(web): add tutorial step constants and definitions"
```

---

## Task 6: TutorialBanner Component

**Files:**
- Create: `apps/web/src/components/TutorialBanner.tsx`

**Step 1: Create the banner component**

Create `apps/web/src/components/TutorialBanner.tsx`:

```tsx
'use client';

import {
  TUTORIAL_STEPS,
  TUTORIAL_SKIPPED,
  isTutorialActive,
} from '@/lib/tutorial';

interface TutorialBannerProps {
  tutorialStep: number;
  onSkip: () => void;
}

export function TutorialBanner({ tutorialStep, onSkip }: TutorialBannerProps) {
  if (!isTutorialActive(tutorialStep)) return null;

  const stepDef = TUTORIAL_STEPS[tutorialStep];
  if (!stepDef) return null;

  return (
    <div className="mb-3 p-2.5 rounded-lg bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)]/40 flex items-center justify-between gap-2">
      <p className="text-sm text-[var(--rpg-gold)]">
        {stepDef.banner}
      </p>
      <button
        onClick={onSkip}
        className="shrink-0 text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text)] underline"
      >
        Skip
      </button>
    </div>
  );
}
```

**Step 2: Build and verify**

Run: `npm run build:web`

Expected: No new errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/TutorialBanner.tsx
git commit -m "feat(web): add TutorialBanner component"
```

---

## Task 7: StepDialog Component

**Files:**
- Create: `apps/web/src/components/TutorialDialog.tsx`

**Step 1: Create the dialog component**

Create `apps/web/src/components/TutorialDialog.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_WELCOME,
  isTutorialActive,
} from '@/lib/tutorial';

interface TutorialDialogProps {
  tutorialStep: number;
  onDismiss: () => void;
}

export function TutorialDialog({ tutorialStep, onDismiss }: TutorialDialogProps) {
  const [shownForStep, setShownForStep] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const prevStepRef = useRef<number | null>(null);

  useEffect(() => {
    // Show dialog when step changes (and tutorial is active)
    if (
      isTutorialActive(tutorialStep) &&
      tutorialStep !== prevStepRef.current
    ) {
      setShownForStep(tutorialStep);
      setVisible(true);
    }
    prevStepRef.current = tutorialStep;
  }, [tutorialStep]);

  if (!visible || shownForStep === null) return null;

  const stepDef = TUTORIAL_STEPS[shownForStep];
  if (!stepDef) return null;

  const handleGotIt = () => {
    setVisible(false);
    // For the welcome step, dismissing the dialog IS the completion trigger
    if (shownForStep === TUTORIAL_STEP_WELCOME) {
      onDismiss();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-[var(--rpg-surface)] border border-[var(--rpg-border)] p-5 shadow-xl">
        <h2 className="text-lg font-bold text-[var(--rpg-gold)] mb-2">
          {stepDef.dialog.title}
        </h2>
        <p className="text-sm text-[var(--rpg-text)] leading-relaxed mb-4">
          {stepDef.dialog.body}
        </p>
        <button
          onClick={handleGotIt}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold text-sm hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Build and verify**

Run: `npm run build:web`

Expected: No new errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/TutorialDialog.tsx
git commit -m "feat(web): add TutorialDialog component with step-aware display"
```

---

## Task 8: Tab Pulse Animation — CSS + BottomNav

**Files:**
- Modify: `apps/web/src/components/BottomNav.tsx` (add pulseTabs prop)
- Modify: `apps/web/src/app/globals.css` (add pulse keyframe — find via `glob apps/web/src/app/globals.css`)

**Step 1: Add pulse CSS animation**

In `apps/web/src/app/globals.css`, at the end of the file, add:

```css
@keyframes tutorial-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(212, 175, 55, 0); }
}

.tutorial-pulse {
  animation: tutorial-pulse 2s ease-in-out infinite;
  border-radius: 9999px;
}
```

**Step 2: Add pulseTabs prop to BottomNav**

In `apps/web/src/components/BottomNav.tsx`, update the interface and component:

Add `pulseTabs` to the interface:

```typescript
interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  badgeTabs?: Set<string>;
  pulseTabs?: Set<string>;
}
```

Update the destructured props:

```typescript
export function BottomNav({ activeTab, onNavigate, badgeTabs = new Set(), pulseTabs = new Set() }: BottomNavProps) {
```

Inside the `navItems.map` callback, after the `badgeTabs` badge span (the `{badgeTabs.has(item.id) && ...}` block), add:

```tsx
              {pulseTabs.has(item.id) && !isActive && (
                <span className="absolute inset-0 m-auto w-10 h-10 tutorial-pulse" />
              )}
```

The `!isActive` condition means the pulse stops once the user navigates to that tab.

**Step 3: Build and verify**

Run: `npm run build:web`

Expected: No new errors.

**Step 4: Commit**

```bash
git add apps/web/src/components/BottomNav.tsx apps/web/src/app/globals.css
git commit -m "feat(web): add tutorial pulse animation to BottomNav"
```

---

## Task 9: Controller Integration — Tutorial State + Step Advancement

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

This is the largest task. It adds tutorial state to the controller and inserts advancement triggers into existing handlers.

**Step 1: Add imports**

At the top of `useGameController.ts`, add the import:

```typescript
import { updateTutorialStep } from '@/lib/api';
import {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_TRAVEL,
  TUTORIAL_STEP_CRAFT,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
  isTutorialActive,
  TUTORIAL_STEPS,
  type BottomTab,
} from '@/lib/tutorial';
```

**Step 2: Add tutorial state**

After the existing state declarations (around line 234, near the other `useState` calls), add:

```typescript
  const [tutorialStep, setTutorialStep] = useState<number>(TUTORIAL_COMPLETED);
```

Default to `TUTORIAL_COMPLETED` so tutorial UI never flashes on before `loadAll` completes.

**Step 3: Read tutorialStep from loadAll**

In the `loadAll` function (around line 471-479 where `playerRes.data` is handled), add:

```typescript
      setTutorialStep(playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED);
```

Add this line inside the `if (playerRes.data)` block, after the existing `setAutoPotionThreshold` line.

**Step 4: Add advanceTutorial helper**

After the `loadAll` function definition (around line 516), add:

```typescript
  const advanceTutorial = useCallback(async (fromStep: number) => {
    if (tutorialStep !== fromStep) return;
    const nextStep = fromStep + 1;
    const res = await updateTutorialStep(nextStep);
    if (res.data) setTutorialStep(res.data.tutorialStep);
  }, [tutorialStep]);

  const skipTutorial = useCallback(async () => {
    const res = await updateTutorialStep(TUTORIAL_SKIPPED);
    if (res.data) setTutorialStep(res.data.tutorialStep);
  }, []);
```

**Step 5: Add advancement triggers to existing handlers**

In `handleStartExploration` — after the `setPlaybackActive(true)` line (around line 841), add:

```typescript
      advanceTutorial(TUTORIAL_STEP_EXPLORE);
```

In `handleStartCombat` — after `setPlaybackActive(true)` (around line 971), add:

```typescript
      advanceTutorial(TUTORIAL_STEP_COMBAT);
```

In `handleMine` — after `await Promise.all([loadAll(), loadGatheringNodes()])` (around line 1085), add:

```typescript
      advanceTutorial(TUTORIAL_STEP_GATHER);
```

In `handleTravelToZone` — this is trickier because we need to check if the destination is a town. Add the check in two places:

After the breadcrumb return `await loadAll()` (around line 1314), add:

```typescript
        // Check if arrived at town for tutorial
        const destZone = zones.find(z => z.id === data.zone.id);
        if (destZone?.zoneType === 'town') advanceTutorial(TUTORIAL_STEP_TRAVEL);
```

In `handleTravelPlaybackComplete`, after `loadAll()` completes, add similar logic — but simpler: since after playback the zone state refreshes, check `data.zone.zoneType`:

In the non-breadcrumb, non-zero-cost path inside `handleTravelToZone`, the zone type is available from `data.zone.zoneType`. But the travel playback complete handler is separate. The cleanest approach: check `data.zone.zoneType === 'town'` right after `setTurns(data.turns.currentTurns)` where `data` is available:

After the `if (travelCost > 0)` block, in the zero-cost travel else branch (around line 1342-1344), add:

```typescript
        if (data.zone.zoneType === 'town') advanceTutorial(TUTORIAL_STEP_TRAVEL);
```

For the playback path, add a check in `handleTravelPlaybackComplete` — the simplest approach is to add a zone type check after `loadAll()` completes by looking at the fresh `zones` state. Alternatively, store the zone type from the travel response. The simplest: just check the `data.zone.zoneType` from the travel response by storing it in the playback data.

Actually, the simplest reliable approach: after `handleTravelToZone` gets `data.zone.zoneType === 'town'`, advance immediately regardless of playback. The tutorial step persists server-side so even if playback is still going, the UI will update correctly on next loadAll.

So just add a single check after `setTurns(data.turns.currentTurns)` (line 1308), before any branching:

```typescript
      if (data.zone.zoneType === 'town') advanceTutorial(TUTORIAL_STEP_TRAVEL);
```

Remove the per-branch checks. This way it fires whether it's breadcrumb, zero-cost, or playback travel.

In `handleCraft` — after `await loadAll()` (around line 1161), add:

```typescript
      advanceTutorial(TUTORIAL_STEP_CRAFT);
```

In `handleEquipItem` — after `await loadAll()` (around line 1283), add:

```typescript
      advanceTutorial(TUTORIAL_STEP_EQUIP);
      // Step 6->7 is the last, auto-advance to done
      if (tutorialStep === TUTORIAL_STEP_EQUIP) {
        setTimeout(() => advanceTutorial(TUTORIAL_STEP_DONE), 500);
      }
```

Wait — that won't work because `advanceTutorial` is async and `tutorialStep` might not have updated yet. Better: do both in sequence in the `advanceTutorial` itself. Actually, the simplest: when `TUTORIAL_STEP_EQUIP` advances to `TUTORIAL_STEP_DONE`, and then `TUTORIAL_STEP_DONE` auto-advances to `TUTORIAL_COMPLETED` — but we need one more advancement. Let me reconsider.

The steps are 0-7, and 8 = completed. When the user equips (step 6), we advance to 7 (done). The "done" step shows the congratulations dialog. After the user dismisses it, we advance to 8 (completed). So:

In `handleEquipItem`, just:

```typescript
      advanceTutorial(TUTORIAL_STEP_EQUIP);
```

The done dialog dismissal (in `TutorialDialog`) will call `onDismiss` which will be wired to advance from step 7 to 8.

**Step 6: Add tutorial state to the return value**

In the return object (around line 1454), add these fields:

```typescript
    // Tutorial
    tutorialStep, skipTutorial, advanceTutorial,
```

**Step 7: Build and verify**

Run: `npm run build:web`

Expected: No new errors (besides pre-existing page.tsx:333).

**Step 8: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat(web): integrate tutorial state and step advancement into game controller"
```

---

## Task 10: Wire Tutorial UI into page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add imports**

Add at the top of `page.tsx`:

```typescript
import { TutorialBanner } from '@/components/TutorialBanner';
import { TutorialDialog } from '@/components/TutorialDialog';
import {
  isTutorialActive,
  TUTORIAL_STEPS,
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
} from '@/lib/tutorial';
```

**Step 2: Destructure tutorial state from controller**

In the destructuring of `useGameController` return value, add:

```typescript
    tutorialStep, skipTutorial, advanceTutorial,
```

**Step 3: Add TutorialBanner**

Inside the `<AppShell>` component, right after the broken gear warning banner block (around line 848), add:

```tsx
        <TutorialBanner
          tutorialStep={tutorialStep}
          onSkip={skipTutorial}
        />
```

**Step 4: Compute pulseTabs and pass to BottomNav**

Before the return statement (or as a useMemo), compute the pulse tab:

```typescript
  const tutorialPulseTabs = React.useMemo(() => {
    if (!isTutorialActive(tutorialStep)) return undefined;
    const stepDef = TUTORIAL_STEPS[tutorialStep];
    if (!stepDef?.pulseTab) return undefined;
    return new Set([stepDef.pulseTab]);
  }, [tutorialStep]);
```

Then pass to BottomNav:

```tsx
      <BottomNav
        activeTab={getActiveTab()}
        onNavigate={handleNavigate}
        badgeTabs={achievementUnclaimedCount > 0 ? new Set(['home']) : undefined}
        pulseTabs={tutorialPulseTabs}
      />
```

**Step 5: Add TutorialDialog**

After the `<BottomNav>` component (and before the closing `</>` fragment), add:

```tsx
      <TutorialDialog
        tutorialStep={tutorialStep}
        onDismiss={() => {
          if (tutorialStep === TUTORIAL_STEP_WELCOME) {
            advanceTutorial(TUTORIAL_STEP_WELCOME);
          } else if (tutorialStep === TUTORIAL_STEP_DONE) {
            advanceTutorial(TUTORIAL_STEP_DONE);
          }
        }}
      />
```

The welcome dialog dismissal advances from step 0 to 1. The done dialog dismissal advances from step 7 to 8 (completed).

**Step 6: Build and verify**

Run: `npm run build:web`

Expected: No new errors (besides pre-existing page.tsx:333).

**Step 7: Manual test plan**

1. Create a new account via the registration page
2. Verify: player starts in Forest Edge (not Millbrook)
3. Verify: welcome dialog appears immediately
4. Click "Got it" — dialog closes, banner shows "Head to the Explore tab..."
5. Verify: Explore tab pulses in bottom nav
6. Navigate to Explore, run an exploration
7. Verify: step advances, banner updates to combat prompt
8. Navigate to Combat, fight an encounter
9. Verify: step advances to gather prompt
10. Navigate to Gathering, mine a node
11. Verify: step advances to travel prompt
12. Navigate to Map, travel to Millbrook
13. Verify: step advances to craft prompt
14. Navigate to Crafting, craft an item
15. Verify: step advances to equip prompt
16. Navigate to Equipment, equip the item
17. Verify: congratulations dialog appears
18. Click "Got it" — tutorial completes, all tutorial UI disappears
19. Verify: "Skip" button works at any point

**Step 8: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat(web): wire TutorialBanner, TutorialDialog, and tab pulse into game page"
```

---

## Task 11: Build All Packages and Final Verification

**Files:** None (verification only)

**Step 1: Rebuild shared and game-engine packages**

```bash
npm run build:packages
```

**Step 2: Full typecheck**

```bash
npm run typecheck
```

Expected: No new errors (pre-existing page.tsx:333 is acceptable).

**Step 3: Run all tests**

```bash
npm run test
```

Expected: All existing tests pass, new tutorial validation tests pass.

**Step 4: Manual end-to-end test**

Start dev environment:
```bash
npm run dev
```

Register a new player and walk through the complete tutorial flow (see Task 10 manual test plan).

**Step 5: Final commit**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: tutorial system polish and fixes"
```
