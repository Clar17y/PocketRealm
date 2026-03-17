# Early Game Starting Grants Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grant 5 skill points and 5 attribute points at character creation, nerf Wayfinder Buckler accuracy from +12 to +7, and add two tutorial steps to teach spending them.

**Architecture:** Add two new constants to `CHARACTER_CONSTANTS`, extract a shared skill-point derivation helper to eliminate a duplicated calculation, update seed data for the buckler, move tutorial step constants to `packages/shared` so both web and API import them, and insert two new tutorial steps before exploration.

**Tech Stack:** TypeScript, Prisma, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-03-17-early-game-starting-grants-design.md`

---

## Chunk 1: Constants, Skill Points, Attribute Points & Buckler

### Task 1: Add starting grant constants to CHARACTER_CONSTANTS

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:125-140`

- [ ] **Step 1: Add the two new constants**

In `packages/shared/src/constants/gameConstants.ts`, add `STARTING_SKILL_POINTS` and `STARTING_ATTRIBUTE_POINTS` to `CHARACTER_CONSTANTS`:

```typescript
export const CHARACTER_CONSTANTS = {
  /** Character XP gained from skill XP after skill-side efficiency is applied. */
  XP_RATIO: 0.3,

  /** Maximum character level. */
  MAX_LEVEL: 100,

  /** Skill points granted at character creation (before any leveling). */
  STARTING_SKILL_POINTS: 5,

  /** Attribute points granted at character creation (before any leveling). */
  STARTING_ATTRIBUTE_POINTS: 5,

  /** Combat stat scaling from allocated attributes. */
  MELEE_DAMAGE_PER_STRENGTH: 1,
  RANGED_DAMAGE_PER_DEXTERITY: 1,
  MAGIC_DAMAGE_PER_INTELLIGENCE: 1,
  ACCURACY_PER_STRENGTH: 1,
  ACCURACY_PER_DEXTERITY: 1,
  ACCURACY_PER_INTELLIGENCE: 1,
  EVASION_TO_SPEED_DIVISOR: 10,
} as const;
```

- [ ] **Step 2: Build shared package to verify**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add STARTING_SKILL_POINTS and STARTING_ATTRIBUTE_POINTS constants"
```

### Task 2: Extract shared skill-point derivation helper and add starting bonus

**Files:**
- Modify: `apps/api/src/services/skillPointService.ts`

The skill point total is derived in two places: `getTotalPointsEarned()` (line 22) and inline inside `allocatePoints()` (line 74). Both must include the starting bonus. Extract a shared pure helper to avoid divergence.

- [ ] **Step 1: Write the failing test**

There is no existing `skillPointService.test.ts`. Create `apps/api/src/services/skillPointService.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CHARACTER_CONSTANTS } from '@pocketrealm/shared';

vi.mock('@pocketrealm/database', () => ({
  prisma: {
    playerSkill: { findMany: vi.fn() },
    skillPointAllocation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '@pocketrealm/database';
import { getSkillPoints } from './skillPointService';

const mockPrisma = prisma as any;

describe('getSkillPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns STARTING_SKILL_POINTS for a brand new player (all skills level 1)', async () => {
    mockPrisma.playerSkill.findMany.mockResolvedValue([
      { level: 1 }, { level: 1 }, { level: 1 }, { level: 1 },
      { level: 1 }, { level: 1 }, { level: 1 }, { level: 1 },
    ]);
    mockPrisma.skillPointAllocation.findUnique.mockResolvedValue({
      playerId: 'p1',
      allocations: {},
    });

    const result = await getSkillPoints('p1');

    expect(result.totalPointsEarned).toBe(CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.availablePoints).toBe(CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.totalPointsSpent).toBe(0);
  });

  it('includes level-derived points plus starting bonus', async () => {
    // 3 skills at level 2 = 3 points from leveling, plus 5 starting = 8 total
    mockPrisma.playerSkill.findMany.mockResolvedValue([
      { level: 2 }, { level: 2 }, { level: 2 }, { level: 1 },
      { level: 1 }, { level: 1 }, { level: 1 }, { level: 1 },
    ]);
    mockPrisma.skillPointAllocation.findUnique.mockResolvedValue({
      playerId: 'p1',
      allocations: {},
    });

    const result = await getSkillPoints('p1');

    expect(result.totalPointsEarned).toBe(3 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.availablePoints).toBe(3 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
  });

  it('subtracts spent points from available', async () => {
    mockPrisma.playerSkill.findMany.mockResolvedValue([
      { level: 1 }, { level: 1 }, { level: 1 }, { level: 1 },
      { level: 1 }, { level: 1 }, { level: 1 }, { level: 1 },
    ]);
    mockPrisma.skillPointAllocation.findUnique.mockResolvedValue({
      playerId: 'p1',
      allocations: { fireball_1: 5 },
    });

    const result = await getSkillPoints('p1');

    expect(result.totalPointsEarned).toBe(CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.totalPointsSpent).toBe(5);
    expect(result.availablePoints).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/skillPointService.test.ts`
Expected: FAIL — `totalPointsEarned` is `0` not `5` (no starting bonus yet).

- [ ] **Step 3: Extract helper and add starting bonus**

In `apps/api/src/services/skillPointService.ts`, make these changes:

1. Add `CHARACTER_CONSTANTS` to the import from `@pocketrealm/shared`:

```typescript
import {
  SKILL_POINT_CONSTANTS,
  CHARACTER_CONSTANTS,
  ALWAYS_AVAILABLE_ACTION_IDS,
  getAllTalentNodes,
  getTalentNode,
  type SkillPointAllocationData,
} from '@pocketrealm/shared';
```

2. Add a pure helper function after the imports (before `getTotalPointsEarned`):

```typescript
/**
 * Pure computation: total skill points from skill levels + starting bonus.
 * Used by both getTotalPointsEarned (outside tx) and allocatePoints (inside tx).
 */
function computeTotalSkillPoints(skills: { level: number }[]): number {
  const fromLevels = skills.reduce((sum, s) => sum + (s.level - 1), 0) * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL;
  return fromLevels + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS;
}
```

3. Update `getTotalPointsEarned` (line 17-23) to use the helper:

```typescript
async function getTotalPointsEarned(playerId: string): Promise<number> {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
    select: { level: true },
  });
  return computeTotalSkillPoints(skills);
}
```

4. Update the inline derivation in `allocatePoints` (line 74) to use the helper:

Replace:
```typescript
    const totalPointsEarned = skills.reduce((sum: number, s: { level: number }) => sum + (s.level - 1), 0) * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL;
```

With:
```typescript
    const totalPointsEarned = computeTotalSkillPoints(skills);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/services/skillPointService.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run existing tests to check for regressions**

Run: `npm run test:api`
Expected: All existing tests pass. (The exploration start tutorial test mocks `skillPointService` so it won't be affected.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/skillPointService.ts apps/api/src/services/skillPointService.test.ts
git commit -m "feat: add starting skill point bonus via shared computeTotalSkillPoints helper"
```

### Task 3: Grant starting attribute points in character creation

**Files:**
- Modify: `apps/api/src/routes/auth.ts:6,86`

- [ ] **Step 1: Add CHARACTER_CONSTANTS to the import**

In `apps/api/src/routes/auth.ts`, update line 6:

```typescript
import { TURN_CONSTANTS, CHARACTER_CONSTANTS, ALL_SKILLS, ALL_EQUIPMENT_SLOTS, STARTER_LOADOUT } from '@pocketrealm/shared';
```

- [ ] **Step 2: Add attributePoints to player creation**

In the `tx.player.create()` call (line 85-111), add `attributePoints` to the `data` object. After line 93 (`homeTownId: starterTown.id,`), add:

```typescript
        attributePoints: CHARACTER_CONSTANTS.STARTING_ATTRIBUTE_POINTS,
```

- [ ] **Step 3: Run existing tests to check for regressions**

Run: `npm run test:api`
Expected: All tests pass. (Registration tests should still pass — `attributePoints` is a simple field addition.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: grant starting attribute points at character creation"
```

### Task 4: Nerf Wayfinder Buckler accuracy

**Files:**
- Modify: `packages/database/prisma/seed-data/items.ts:447`

- [ ] **Step 1: Update seed data**

In `packages/database/prisma/seed-data/items.ts`, line 447, change the Wayfinder Buckler's `baseStats`:

Replace:
```typescript
  it({ id: STARTER_LOADOUT.tutorialOffHandTemplateId, name: 'Wayfinder Buckler', itemType: 'armor', slot: 'off_hand', tier: 1, weightClass: 'medium', requiredLevel: 1, baseStats: { accuracy: 12, health: 4 }, maxDurability: 40, sellPrice: 0 }),
```

With:
```typescript
  it({ id: STARTER_LOADOUT.tutorialOffHandTemplateId, name: 'Wayfinder Buckler', itemType: 'armor', slot: 'off_hand', tier: 1, weightClass: 'medium', requiredLevel: 1, baseStats: { accuracy: 7, health: 4 }, maxDurability: 40, sellPrice: 0 }),
```

- [ ] **Step 2: Build database package to verify**

Run: `npm run build --workspace=packages/database`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/seed-data/items.ts
git commit -m "balance: nerf Wayfinder Buckler accuracy from +12 to +7"
```

---

## Chunk 2: Tutorial Constants & Step Renumbering

### Task 5: Move tutorial step constants to packages/shared

**Files:**
- Create: `packages/shared/src/constants/tutorialConstants.ts`
- Modify: `packages/shared/src/index.ts:31`
- Modify: `apps/web/src/lib/tutorial.ts`

- [ ] **Step 1: Create tutorial constants file in shared**

Create `packages/shared/src/constants/tutorialConstants.ts`:

```typescript
// Tutorial step constants — shared between web and API.
// Step numbers define the tutorial progression order.

export const TUTORIAL_STEP_WELCOME = 0;
export const TUTORIAL_STEP_SKILL_POINTS = 1;
export const TUTORIAL_STEP_ATTRIBUTE_POINTS = 2;
export const TUTORIAL_STEP_EXPLORE = 3;
export const TUTORIAL_STEP_COMBAT = 4;
export const TUTORIAL_STEP_GATHER = 5;
export const TUTORIAL_STEP_TRAVEL = 6;
export const TUTORIAL_STEP_REFINE = 7;
export const TUTORIAL_STEP_CRAFT = 8;
export const TUTORIAL_STEP_EQUIP = 9;
export const TUTORIAL_STEP_DONE = 10;
export const TUTORIAL_COMPLETED = 11;
export const TUTORIAL_SKIPPED = -1;
```

- [ ] **Step 2: Export from shared index**

In `packages/shared/src/index.ts`, add after line 31 (`export * from './constants/expeditionDefinitions';`):

```typescript
export * from './constants/tutorialConstants';
```

- [ ] **Step 3: Update web tutorial.ts to import from shared**

Replace the first 11 lines of `apps/web/src/lib/tutorial.ts` (the constant definitions) with an import:

```typescript
export {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_SKILL_POINTS,
  TUTORIAL_STEP_ATTRIBUTE_POINTS,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_TRAVEL,
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_CRAFT,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
} from '@pocketrealm/shared';
```

Note: the re-export preserves the existing public API for other web files that import from `tutorial.ts`.

- [ ] **Step 4: Build shared and web to verify**

Run: `npm run build --workspace=packages/shared && npm run build:web`
Expected: Clean builds. Web can resolve the re-exports.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/tutorialConstants.ts packages/shared/src/index.ts apps/web/src/lib/tutorial.ts
git commit -m "refactor: move tutorial step constants to packages/shared for cross-package use"
```

### Task 6: Add new tutorial step definitions in web

**Files:**
- Modify: `apps/web/src/lib/tutorial.ts`

- [ ] **Step 1: Add the two new step definitions to TUTORIAL_STEPS**

In `apps/web/src/lib/tutorial.ts`, add the two new entries to the `TUTORIAL_STEPS` record. Insert them after the `TUTORIAL_STEP_WELCOME` entry and before the `TUTORIAL_STEP_EXPLORE` entry:

```typescript
  [TUTORIAL_STEP_SKILL_POINTS]: {
    banner: 'You have 5 skill points! Open your abilities and unlock a combat skill.',
    dialog: {
      title: 'Skill Points',
      body: 'You start with 5 skill points to spend on combat abilities. Open the Combat tab and visit Talents to unlock a powerful ability like Fireball, Aimed Shot, or Power Strike. This will transform your first fight!',
    },
    pulseTab: 'combat',
    navigateTo: 'combat',
  },
  [TUTORIAL_STEP_ATTRIBUTE_POINTS]: {
    banner: 'You have 5 attribute points! Allocate them to shape your build.',
    dialog: {
      title: 'Attribute Points',
      body: 'You start with 5 attribute points to allocate. Invest in Strength for melee power, Dexterity for ranged accuracy, Intelligence for magic damage, or spread them around. Your choices shape your character\u2019s strengths!',
    },
    pulseTab: 'profile',
    navigateTo: 'profile',
  },
```

- [ ] **Step 2: Build web to verify**

Run: `npm run build:web`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/tutorial.ts
git commit -m "feat: add skill points and attribute points tutorial step definitions"
```

### Task 7: Update API to use shared tutorial constants

**Files:**
- Modify: `apps/api/src/routes/player.ts:4,193-194,221,231`
- Modify: `apps/api/src/routes/exploration/start.ts:26,191`

- [ ] **Step 1: Update player.ts imports and magic numbers**

In `apps/api/src/routes/player.ts`:

1. Update the import on line 4 to add tutorial constants:

```typescript
import { ATTRIBUTE_TYPES, type AttributeType, ACHIEVEMENTS_BY_ID, EXPLORATION_CONSTANTS, TUTORIAL_COMPLETED, TUTORIAL_SKIPPED } from '@pocketrealm/shared';
```

2. Update the `tutorialSchema` Zod validation (line 193-195) to use the new max:

Replace:
```typescript
const tutorialSchema = z.object({
  step: z.number().int().min(-1).max(9),
});
```

With:
```typescript
const tutorialSchema = z.object({
  step: z.number().int().min(TUTORIAL_SKIPPED).max(TUTORIAL_COMPLETED),
});
```

3. Update the completion check (line 221):

Replace:
```typescript
  if (player.tutorialStep >= 9 || player.tutorialStep === -1) {
```

With:
```typescript
  if (player.tutorialStep >= TUTORIAL_COMPLETED || player.tutorialStep === TUTORIAL_SKIPPED) {
```

4. Update the achievement trigger (line 231):

Replace:
```typescript
  if (body.step === 9 && !isSkip) {
```

With:
```typescript
  if (body.step === TUTORIAL_COMPLETED && !isSkip) {
```

- [ ] **Step 2: Update exploration/start.ts import and magic number**

In `apps/api/src/routes/exploration/start.ts`:

1. Add `TUTORIAL_STEP_EXPLORE` to the import from `@pocketrealm/shared` (line 26).

2. Update line 191:

Replace:
```typescript
    const isTutorialExplore = playerRecord?.tutorialStep === 1;
```

With:
```typescript
    const isTutorialExplore = playerRecord?.tutorialStep === TUTORIAL_STEP_EXPLORE;
```

- [ ] **Step 3: Build API to verify**

Run: `npm run build:api`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/player.ts apps/api/src/routes/exploration/start.ts
git commit -m "refactor: replace tutorial magic numbers with shared constants in API"
```

### Task 8: Update tutorial test files

**Files:**
- Modify: `apps/api/src/routes/player.tutorial.test.ts`
- Modify: `apps/api/src/routes/exploration/start.tutorial.test.ts`

- [ ] **Step 1: Update player.tutorial.test.ts**

In `apps/api/src/routes/player.tutorial.test.ts`:

1. Add import at the top (after the existing imports, before the `mockPrisma` import on line 22):

```typescript
import {
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
  TUTORIAL_STEP_SKILL_POINTS,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
} from '@pocketrealm/shared';
```

2. Update the `isValidTutorialAdvance` helper (line 35) — change `9` to `TUTORIAL_COMPLETED`:

```typescript
function isValidTutorialAdvance(currentStep: number, requestedStep: number): boolean {
  const isSkip = requestedStep === TUTORIAL_SKIPPED;
  const isNextStep = requestedStep === currentStep + 1;
  if (!isSkip && !isNextStep) return false;
  if (currentStep >= TUTORIAL_COMPLETED || currentStep === TUTORIAL_SKIPPED) return false;
  return true;
}
```

3. Update the unit tests (use constants for readability — the step numbers that changed due to renumbering). The key changes:

- Test "accepts valid forward step" (line 41): `isValidTutorialAdvance(TUTORIAL_STEP_COMBAT, TUTORIAL_STEP_GATHER)` — values are now 4,5 instead of 2,3
- Test "accepts skip" (line 44): `isValidTutorialAdvance(TUTORIAL_STEP_COMBAT, TUTORIAL_SKIPPED)`
- Test "rejects skipping steps" (line 48): `isValidTutorialAdvance(TUTORIAL_STEP_COMBAT, TUTORIAL_STEP_REFINE)` — jump from 4 to 7
- Test "rejects going backwards" (line 52): `isValidTutorialAdvance(TUTORIAL_STEP_GATHER, TUTORIAL_STEP_EXPLORE)` — 5 to 3
- Test "rejects updating already completed" (line 57): `isValidTutorialAdvance(TUTORIAL_COMPLETED, TUTORIAL_COMPLETED + 1)`
- Test "rejects skipping already completed" (line 61): `isValidTutorialAdvance(TUTORIAL_COMPLETED, TUTORIAL_SKIPPED)`
- Test "rejects advancing already skipped" (line 64): `isValidTutorialAdvance(TUTORIAL_SKIPPED, 0)`

4. Update route handler tests:

- "advances tutorial step" (line 96-112): Use `TUTORIAL_STEP_COMBAT` (4) as current, `TUTORIAL_STEP_GATHER` (5) as next:
  ```typescript
  mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: TUTORIAL_STEP_COMBAT });
  // ...
  const req = { player: { playerId: 'p1' }, body: { step: TUTORIAL_STEP_GATHER } } as any;
  // ...
  expect(mockPrisma.player.update).toHaveBeenCalledWith({
    where: { id: 'p1' },
    data: { tutorialStep: TUTORIAL_STEP_GATHER },
  });
  expect(res.json).toHaveBeenCalledWith({ tutorialStep: TUTORIAL_STEP_GATHER });
  ```

- "grants achievement when completing tutorial" (line 114-129): Use `TUTORIAL_STEP_DONE` (10) as current, `TUTORIAL_COMPLETED` (11) as step:
  ```typescript
  mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: TUTORIAL_STEP_DONE });
  // ...
  const req = { player: { playerId: 'p1' }, body: { step: TUTORIAL_COMPLETED } } as any;
  ```

- "does not grant achievement when skipping" (line 131-144): Use `TUTORIAL_STEP_GATHER` (5):
  ```typescript
  mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: TUTORIAL_STEP_GATHER });
  // ...
  const req = { player: { playerId: 'p1' }, body: { step: TUTORIAL_SKIPPED } } as any;
  // ...
  expect(res.json).toHaveBeenCalledWith({ tutorialStep: TUTORIAL_SKIPPED });
  ```

- "calls next with error for invalid step jump" (line 159-170): Use `TUTORIAL_STEP_COMBAT` (4) jumping to `TUTORIAL_STEP_REFINE` (7):
  ```typescript
  mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: TUTORIAL_STEP_COMBAT });
  const req = { player: { playerId: 'p1' }, body: { step: TUTORIAL_STEP_REFINE } } as any;
  ```

- "calls next with error when player not found" (line 146-157): Use `TUTORIAL_STEP_SKILL_POINTS` (1):
  ```typescript
  const req = { player: { playerId: 'p1' }, body: { step: TUTORIAL_STEP_SKILL_POINTS } } as any;
  ```

- [ ] **Step 2: Update start.tutorial.test.ts**

In `apps/api/src/routes/exploration/start.tutorial.test.ts`:

1. Add import (after the existing imports, before `mockPrisma` on line 228):

```typescript
import { TUTORIAL_STEP_EXPLORE, TUTORIAL_STEP_WELCOME } from '@pocketrealm/shared';
```

2. Update the test cases:

- "forces 100 turns when tutorialStep is explore step" (line 286-296): Change `setupZoneAndMobs(1)` to `setupZoneAndMobs(TUTORIAL_STEP_EXPLORE)` and update the test description from `'tutorialStep is 1'` to `'tutorialStep is TUTORIAL_STEP_EXPLORE'`.

- "uses simulateExploration for non-tutorial players" (line 345-358): Change `setupZoneAndMobs(0)` to `setupZoneAndMobs(TUTORIAL_STEP_WELCOME)`.

- "produces exactly one ambush..." (line 298-310): Change `setupZoneAndMobs(1)` to `setupZoneAndMobs(TUTORIAL_STEP_EXPLORE)`.

- "selects Field Mouse..." (line 312-325): Change `setupZoneAndMobs(1)` to `setupZoneAndMobs(TUTORIAL_STEP_EXPLORE)`.

- "falls back to first mob..." (line 327-343): Change `setupZoneAndMobs(1)` to `setupZoneAndMobs(TUTORIAL_STEP_EXPLORE)`.

- "combat victory during tutorial..." (line 360-375): Change `setupZoneAndMobs(1)` to `setupZoneAndMobs(TUTORIAL_STEP_EXPLORE)`.

- [ ] **Step 3: Run all tests**

Run: `npm run test:api`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/player.tutorial.test.ts apps/api/src/routes/exploration/start.tutorial.test.ts
git commit -m "test: update tutorial tests to use shared step constants with new numbering"
```

### Task 9: Full build and final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build across all packages.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new errors. (Pre-existing `apps/web/src/app/game/page.tsx:333` error may appear — ignore it.)
