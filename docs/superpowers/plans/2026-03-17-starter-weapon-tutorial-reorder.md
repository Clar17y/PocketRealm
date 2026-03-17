# Starter Weapon Choice & Tutorial Reorder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a starter weapon choice (sword/bow/staff from Kessa Ironweld) at the beginning of the tutorial, reorder tutorial steps so players have a weapon + ability + stats before their first fight, and add automatic advancement triggers for skill/attribute point steps.

**Architecture:** Add 3 starter weapon templates to seed data, expand `STARTER_LOADOUT` with weapon IDs, create a `POST /player/starter-weapon` endpoint for claiming, build a gold-outline popup component for the weapon choice, renumber all tutorial constants, and wire tutorial advancement triggers into the game controller.

**Tech Stack:** TypeScript, Prisma, Vitest, Zod, React, Next.js, CSS variables (`--rpg-gold`, etc.)

**Spec:** `docs/superpowers/specs/2026-03-17-early-game-starting-grants-design.md` (sections 4-5)

**Depends on:** PR #215 (starting grants + tutorial constants in shared — already merged into this branch)

---

## Chunk 1: Backend — Seed Data, Constants, API Endpoint

### Task 1: Add starter weapon templates to seed data

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:63-65`
- Modify: `packages/database/prisma/seed-data/items.ts:296-299`

- [ ] **Step 1: Expand STARTER_LOADOUT in gameConstants.ts**

In `packages/shared/src/constants/gameConstants.ts`, replace the `STARTER_LOADOUT` block (lines 63-65):

```typescript
export const STARTER_LOADOUT = {
  tutorialOffHandTemplateId: 'starter_wayfinder_buckler',
  starterWeaponIds: {
    melee: 'starter_training_sword',
    ranged: 'starter_training_bow',
    magic: 'starter_training_staff',
  },
} as const;
```

- [ ] **Step 2: Add 3 starter weapon templates to items.ts**

In `packages/database/prisma/seed-data/items.ts`, after the existing tier 1 weapons (line ~299, after `weapon(IDS.wep.oakStaff, ...)`), add the 3 starter weapons. The `weapon()` helper hardcodes `sellPrice: tier * 10` which gives 10, but these must be soulbound (`sellPrice: 0`) like the Wayfinder Buckler. Use the `it()` helper directly:

```typescript
  // Starter weapons (granted by Kessa Ironweld during tutorial, soulbound)
  it({ id: STARTER_LOADOUT.starterWeaponIds.melee, name: "Kessa's Training Sword", itemType: 'weapon', slot: 'main_hand', tier: 1, requiredSkill: 'melee', requiredLevel: 1, baseStats: { attack: 4 }, maxDurability: 70, sellPrice: 0 }),
  it({ id: STARTER_LOADOUT.starterWeaponIds.ranged, name: "Kessa's Training Bow", itemType: 'weapon', slot: 'main_hand', tier: 1, requiredSkill: 'ranged', requiredLevel: 1, baseStats: { rangedPower: 3 }, maxDurability: 70, sellPrice: 0 }),
  it({ id: STARTER_LOADOUT.starterWeaponIds.magic, name: "Kessa's Training Staff", itemType: 'weapon', slot: 'main_hand', tier: 1, requiredSkill: 'magic', requiredLevel: 1, baseStats: { magicPower: 5 }, maxDurability: 70, sellPrice: 0 }),
```

`STARTER_LOADOUT` is already imported in this file (used for the buckler on line 447).

- [ ] **Step 3: Build shared and database packages, re-seed**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/database && npm run db:seed`
Expected: Clean builds. Seed adds the 3 new weapon templates to the local database. Without re-seeding, the `POST /starter-weapon` endpoint would hit `MISSING_TEMPLATE` errors during testing.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts packages/database/prisma/seed-data/items.ts
git commit -m "feat: add 3 starter weapon templates and expand STARTER_LOADOUT"
```

### Task 2: Create starter weapon claim endpoint

**Files:**
- Modify: `apps/api/src/routes/player.ts`
- Create: `apps/api/src/routes/player.starterWeapon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/player.starterWeapon.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/statsService', () => ({ incrementStats: vi.fn() }));
vi.mock('../services/achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
  emitAchievementNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/equipmentService', () => ({ ensureEquipmentSlots: vi.fn() }));
vi.mock('../services/attributesService', () => ({
  allocateAttributePoints: vi.fn(),
  getPlayerProgressionState: vi.fn(),
  normalizePlayerAttributes: vi.fn((a: any) => a),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { mockPrisma } from '../__test__/setup';
import { STARTER_LOADOUT } from '@pocketrealm/shared';
import { playerRouter } from './player';

function findHandler(method: string, path: string) {
  const layer = (playerRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('POST /starter-weapon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and equips a melee starter weapon', async () => {
    const templateId = STARTER_LOADOUT.starterWeaponIds.melee;
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: templateId, maxDurability: 70,
    });
    mockPrisma.item.findFirst.mockResolvedValue(null); // no existing claim
    mockPrisma.item.create.mockResolvedValue({ id: 'item-1' });
    mockPrisma.playerEquipment.upsert.mockResolvedValue({});

    const req = { player: { playerId: 'p1' }, body: { weaponType: 'melee' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/starter-weapon');
    await handler(req, res, next);

    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'p1',
        templateId,
        rarity: 'common',
      }),
      select: { id: true },
    });
    expect(mockPrisma.playerEquipment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId_slot: { playerId: 'p1', slot: 'main_hand' } },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, itemId: 'item-1' }),
    );
  });

  it('rejects if player already claimed a starter weapon', async () => {
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'existing-item' });

    const req = { player: { playerId: 'p1' }, body: { weaponType: 'melee' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/starter-weapon');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'ALREADY_CLAIMED' }),
    );
  });

  it('rejects invalid weapon type', async () => {
    const req = { player: { playerId: 'p1' }, body: { weaponType: 'axe' } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/starter-weapon');
    await handler(req, res, next);

    // Zod validation error
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/routes/player.starterWeapon.test.ts`
Expected: FAIL — no `POST /starter-weapon` handler exists.

- [ ] **Step 3: Implement the endpoint**

In `apps/api/src/routes/player.ts`, add the import for `STARTER_LOADOUT` to the existing shared import line:

```typescript
import { ATTRIBUTE_TYPES, type AttributeType, ACHIEVEMENTS_BY_ID, EXPLORATION_CONSTANTS, TUTORIAL_COMPLETED, TUTORIAL_SKIPPED, STARTER_LOADOUT } from '@pocketrealm/shared';
```

Add a new Zod schema and route handler after the tutorial handler (after line ~236):

```typescript
const starterWeaponSchema = z.object({
  weaponType: z.enum(['melee', 'ranged', 'magic']),
});

/**
 * POST /api/v1/player/starter-weapon
 * Claim a starter weapon from Kessa Ironweld. One-time only.
 */
playerRouter.post('/starter-weapon', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { weaponType } = starterWeaponSchema.parse(req.body);

  const templateId = STARTER_LOADOUT.starterWeaponIds[weaponType];

  // Check if player already claimed a starter weapon (any of the 3 types)
  const allStarterIds = Object.values(STARTER_LOADOUT.starterWeaponIds);
  const existingClaim = await prisma.item.findFirst({
    where: { ownerId: playerId, templateId: { in: allStarterIds } },
    select: { id: true },
  });

  if (existingClaim) {
    throw new AppError(400, 'Starter weapon already claimed', 'ALREADY_CLAIMED');
  }

  const template = await prisma.itemTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, maxDurability: true },
  });

  if (!template) {
    throw new AppError(500, 'Starter weapon template missing', 'MISSING_TEMPLATE');
  }

  const item = await prisma.item.create({
    data: {
      ownerId: playerId,
      templateId,
      rarity: 'common',
      quantity: 1,
      maxDurability: template.maxDurability,
      currentDurability: template.maxDurability,
    },
    select: { id: true },
  });

  await prisma.playerEquipment.upsert({
    where: { playerId_slot: { playerId, slot: 'main_hand' } },
    create: { playerId, slot: 'main_hand', itemId: item.id },
    update: { itemId: item.id },
  });

  res.json({ success: true, itemId: item.id, weaponType });
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/routes/player.starterWeapon.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run full API tests**

Run: `npm run test:api`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/player.ts apps/api/src/routes/player.starterWeapon.test.ts
git commit -m "feat: add POST /player/starter-weapon endpoint for Kessa weapon claim"
```

## Chunk 2: Tutorial Constants Renumbering

### Task 3: Renumber tutorial constants and update all references

**Files:**
- Modify: `packages/shared/src/constants/tutorialConstants.ts`
- Modify: `apps/web/src/lib/tutorial.ts`
- Modify: `apps/api/src/routes/player.ts` (Zod schema max value auto-updates via constant)
- Modify: `apps/api/src/routes/exploration/start.ts` (TUTORIAL_STEP_EXPLORE value auto-updates)
- Modify: `apps/api/src/routes/player.tutorial.test.ts`
- Modify: `apps/api/src/routes/exploration/start.tutorial.test.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Update tutorialConstants.ts with new numbering**

Replace the entire contents of `packages/shared/src/constants/tutorialConstants.ts`:

```typescript
// Tutorial step constants — shared between web and API.
// Step numbers define the tutorial progression order.

export const TUTORIAL_STEP_WELCOME = 0;
export const TUTORIAL_STEP_STARTER_WEAPON = 1;
export const TUTORIAL_STEP_EQUIP = 2;
export const TUTORIAL_STEP_SKILL_POINTS = 3;
export const TUTORIAL_STEP_ATTRIBUTE_POINTS = 4;
export const TUTORIAL_STEP_EXPLORE = 5;
export const TUTORIAL_STEP_COMBAT = 6;
export const TUTORIAL_STEP_GATHER = 7;
export const TUTORIAL_STEP_TRAVEL = 8;
export const TUTORIAL_STEP_REFINE = 9;
export const TUTORIAL_STEP_CRAFT = 10;
export const TUTORIAL_STEP_DONE = 11;
export const TUTORIAL_COMPLETED = 12;
export const TUTORIAL_SKIPPED = -1;
```

- [ ] **Step 2: Update web tutorial.ts imports and step definitions**

In `apps/web/src/lib/tutorial.ts`:

1. Add `TUTORIAL_STEP_STARTER_WEAPON` to the import and re-export blocks (it's a new constant).

2. Add the starter weapon step definition to `TUTORIAL_STEPS` (after `TUTORIAL_STEP_WELCOME` entry):

```typescript
  [TUTORIAL_STEP_STARTER_WEAPON]: {
    banner: 'Kessa Ironweld has a weapon for you. Choose wisely!',
    dialog: {
      title: 'A Gift from the Forge',
      body: "Kessa Ironweld, Millbrook\u2019s blacksmith, won\u2019t let you leave town bare-handed. Pick a weapon \u2014 sword, bow, or staff \u2014 and she\u2019ll see you off.",
    },
    pulseTab: null,
    navigateTo: null,
  },
```

3. Update the equip step text (already exists as `TUTORIAL_STEP_EQUIP`, but the banner/dialog text needs updating):

```typescript
  [TUTORIAL_STEP_EQUIP]: {
    banner: 'Equip the weapon Kessa gave you!',
    dialog: {
      title: 'Equipment',
      body: 'Open your inventory and equip the weapon Kessa gave you. Equipment boosts your stats for combat and improves your chances of survival.',
    },
    pulseTab: 'inventory',
    navigateTo: 'inventory',
  },
```

4. Update the Done step dialog body to reflect the new flow:

```typescript
  [TUTORIAL_STEP_DONE]: {
    banner: 'Tutorial complete! You\u2019ve learned the core loop. Good luck out there!',
    dialog: {
      title: 'Tutorial Complete!',
      body: 'You now know the core gameplay loop: Equip \u2192 Build \u2192 Explore \u2192 Fight \u2192 Gather \u2192 Travel \u2192 Refine \u2192 Craft. Keep progressing your skills, discover new zones, and take on tougher challenges!',
    },
    pulseTab: null,
    navigateTo: null,
  },
```

- [ ] **Step 3: Update useGameController.ts tutorial imports**

In `apps/web/src/app/game/useGameController.ts`, update the import from `@/lib/tutorial` (lines 8-21) to add the new constants:

Add `TUTORIAL_STEP_STARTER_WEAPON` and `TUTORIAL_STEP_ATTRIBUTE_POINTS` to the import list. Also add `TUTORIAL_STEP_SKILL_POINTS` and `TUTORIAL_STEP_COMBAT` if not already imported.

The existing `advanceTutorial` calls use the named constants, so they'll automatically pick up the new numeric values. No logic changes needed for existing triggers — only new triggers need adding (Task 4).

- [ ] **Step 4: Update test files with new step numbering**

In `apps/api/src/routes/player.tutorial.test.ts`:

1. Add `TUTORIAL_STEP_STARTER_WEAPON` to the import from `@pocketrealm/shared`.

2. The existing tests use named constants (`TUTORIAL_STEP_COMBAT`, `TUTORIAL_STEP_GATHER`, etc.) so they'll automatically pick up the new numeric values. **No test value changes needed** — the constants handle the renumbering.

In `apps/api/src/routes/exploration/start.tutorial.test.ts`:

1. Same — the tests use `TUTORIAL_STEP_EXPLORE` and `TUTORIAL_STEP_WELCOME` which auto-update. **No changes needed**.

- [ ] **Step 5: Build all packages and run tests**

Run: `npm run build && npm run test`
Expected: Clean build, all tests pass. The Zod schema in `player.ts` uses `TUTORIAL_COMPLETED` which auto-updates to 12. The exploration `start.ts` uses `TUTORIAL_STEP_EXPLORE` which auto-updates to 5.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/tutorialConstants.ts apps/web/src/lib/tutorial.ts apps/web/src/app/game/useGameController.ts apps/api/src/routes/player.tutorial.test.ts apps/api/src/routes/exploration/start.tutorial.test.ts
git commit -m "feat: renumber tutorial steps for starter weapon + equip + skill/attribute order"
```

## Chunk 3: Frontend — Weapon Popup & Tutorial Advancement

### Task 4: Add starter weapon API call to frontend

**Files:**
- Modify: `apps/web/src/lib/api/player.ts`
- Modify: `apps/web/src/lib/api/index.ts`

- [ ] **Step 1: Add API function**

In `apps/web/src/lib/api/player.ts`, add:

```typescript
export async function claimStarterWeapon(weaponType: 'melee' | 'ranged' | 'magic') {
  return fetchApi<{ success: true; itemId: string; weaponType: string }>(
    '/api/v1/player/starter-weapon',
    {
      method: 'POST',
      body: JSON.stringify({ weaponType }),
    },
  );
}
```

- [ ] **Step 2: Export from index**

In `apps/web/src/lib/api/index.ts`, add `claimStarterWeapon` to the re-export from `./player`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api/player.ts apps/web/src/lib/api/index.ts
git commit -m "feat: add claimStarterWeapon API function"
```

### Task 5: Build starter weapon choice popup component

**Files:**
- Create: `apps/web/src/components/StarterWeaponPopup.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/StarterWeaponPopup.tsx`. This uses the existing `ModalOverlay` component and RPG theme variables (`--rpg-gold`, `--rpg-surface`, `--rpg-border`), matching the pattern in `TutorialDialog.tsx`.

```tsx
'use client';

import { useState } from 'react';
import { ModalOverlay } from './common/ModalOverlay';

interface StarterWeaponOption {
  type: 'melee' | 'ranged' | 'magic';
  name: string;
  description: string;
  stat: string;
}

const WEAPONS: StarterWeaponOption[] = [
  {
    type: 'melee',
    name: "Kessa's Training Sword",
    description: 'A sturdy blade for close combat. Scales with Strength.',
    stat: '+4 Attack',
  },
  {
    type: 'ranged',
    name: "Kessa's Training Bow",
    description: 'A reliable shortbow for ranged strikes. Scales with Dexterity.',
    stat: '+3 Ranged Power',
  },
  {
    type: 'magic',
    name: "Kessa's Training Staff",
    description: 'A channeling staff for arcane arts. Scales with Intelligence.',
    stat: '+5 Magic Power',
  },
];

interface Props {
  onSelect: (weaponType: 'melee' | 'ranged' | 'magic') => void;
}

export function StarterWeaponPopup({ onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirming(true);
    onSelect(selected as 'melee' | 'ranged' | 'magic');
  };

  return (
    <ModalOverlay opacity={70}>
      <div className="w-full max-w-md rounded-xl border-2 border-[var(--rpg-gold)] bg-[var(--rpg-surface)] p-6 shadow-xl">
        <h2 className="mb-1 text-center text-xl font-bold text-[var(--rpg-gold)]">
          A Gift from the Forge
        </h2>
        <p className="mb-4 text-center text-sm text-[var(--rpg-text-secondary)]">
          &ldquo;Heading past the gate bare-handed? Not on my watch. Pick one &mdash; and try
          not to break it before you&rsquo;re out of earshot.&rdquo;
        </p>
        <p className="mb-4 text-center text-xs italic text-[var(--rpg-text-secondary)]">
          &mdash; Kessa Ironweld, Blacksmith
        </p>

        <div className="flex flex-col gap-3">
          {WEAPONS.map((w) => (
            <button
              key={w.type}
              onClick={() => setSelected(w.type)}
              className={`flex flex-col rounded-lg border p-3 text-left transition-all ${
                selected === w.type
                  ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10'
                  : 'border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]/50'
              }`}
            >
              <span className="font-semibold text-[var(--rpg-text)]">{w.name}</span>
              <span className="text-sm text-[var(--rpg-text-secondary)]">{w.description}</span>
              <span className="mt-1 text-sm font-medium text-[var(--rpg-green-light)]">
                {w.stat}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selected || confirming}
          className="mt-4 w-full rounded-lg bg-[var(--rpg-gold)] px-4 py-2 font-semibold text-black transition-all hover:brightness-110 disabled:opacity-50"
        >
          {confirming ? 'Claiming...' : 'Take Weapon'}
        </button>
      </div>
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Build web to verify**

Run: `npm run build:web`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/StarterWeaponPopup.tsx
git commit -m "feat: add StarterWeaponPopup component with Kessa lore"
```

### Task 6: Wire starter weapon popup and tutorial triggers into game controller

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx` (or wherever the tutorial UI renders)

This is the integration task. The game controller needs to:

1. Show the `StarterWeaponPopup` when `tutorialStep === TUTORIAL_STEP_STARTER_WEAPON`
2. On weapon selection: call `claimStarterWeapon()`, refresh equipment/inventory state, advance tutorial
3. Auto-advance the Skill Points step when `totalPointsSpent > 0` after skill point allocation
4. Auto-advance the Attribute Points step when any attribute > 0 after attribute allocation

- [ ] **Step 1: Add imports to useGameController.ts**

Add to the imports:
```typescript
import { claimStarterWeapon } from '@/lib/api';
import { TUTORIAL_STEP_STARTER_WEAPON, TUTORIAL_STEP_SKILL_POINTS, TUTORIAL_STEP_ATTRIBUTE_POINTS } from '@/lib/tutorial';
```

- [ ] **Step 2: Add starter weapon handler**

Add a handler function in `useGameController.ts` (near the other tutorial-related logic). The game controller uses `loadAll()` (line ~463) to refresh all player state (equipment, inventory, skills, etc.):

```typescript
const handleClaimStarterWeapon = useCallback(async (weaponType: 'melee' | 'ranged' | 'magic') => {
  const res = await claimStarterWeapon(weaponType);
  if (res.data?.success) {
    await loadAll(); // refresh all player state (equipment, inventory, etc.)
    await advanceTutorial(TUTORIAL_STEP_STARTER_WEAPON);
  }
}, [advanceTutorial, loadAll]);

- [ ] **Step 3: Add skill point advancement trigger**

After the existing `handleAllocateSkillPoint` function (find it by searching for `allocateSkillPoint`), add advancement logic:

```typescript
// After successful skill point allocation, check if tutorial should advance
if (tutorialStep === TUTORIAL_STEP_SKILL_POINTS) {
  advanceTutorial(TUTORIAL_STEP_SKILL_POINTS);
}
```

- [ ] **Step 4: Add attribute point advancement trigger**

After the existing `handleAllocateAttribute` function (find it by searching for `allocateAttributePoints`), add:

```typescript
// After successful attribute allocation, check if tutorial should advance
if (tutorialStep === TUTORIAL_STEP_ATTRIBUTE_POINTS) {
  advanceTutorial(TUTORIAL_STEP_ATTRIBUTE_POINTS);
}
```

- [ ] **Step 5: Expose handleClaimStarterWeapon and render popup**

Add `handleClaimStarterWeapon` to the returned object from `useGameController`.

In the game page component (likely `apps/web/src/app/game/page.tsx` or wherever tutorial UI renders), render the popup conditionally:

```tsx
{tutorialStep === TUTORIAL_STEP_STARTER_WEAPON && (
  <StarterWeaponPopup onSelect={handleClaimStarterWeapon} />
)}
```

- [ ] **Step 6: Build and verify**

Run: `npm run build:web`
Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat: wire starter weapon popup and tutorial advancement triggers"
```

### Task 7: Full build and test verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build across all packages.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 4: Push and update PR**

```bash
git push
```
