# Web UI Refactors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Reduce duplication and file size in the web UI (especially `apps/web/src/app/game/page.tsx`) while keeping behavior the same.

**Architecture:** Extract repeated UI into reusable components, centralize shared UI constants/helpers, then split `GamePage` into a small page component plus a controller hook and screen components. Keep changes incremental with frequent build/lint checkpoints.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS (CSS vars), npm workspaces.

---

### Task 0: Create an isolated branch/worktree

**Files:**
- None

**Step 1: Verify clean working tree**

Run: `git status --porcelain`
Expected: no output

**Step 2: Create new branch in a worktree**

Run:
- `git worktree add .worktrees/refactor-web-ui -b refactor/web-ui-refactors`
- `cd .worktrees/refactor-web-ui`

Expected: new folder created, branch checked out

**Step 3: Verify branch**

Run: `git branch --show-current`
Expected: `refactor/web-ui-refactors`

**Step 4: Commit nothing**

No commit in this task.

---

### Task 1: Deduplicate the “Knocked Out” banner into a component

**Files:**
- Create: `apps/web/src/components/KnockoutBanner.tsx`
- Modify: `apps/web/src/components/index.ts`
- Modify: `apps/web/src/components/screens/Dashboard.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/components/screens/Gathering.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Create the shared component**

Implement `KnockoutBanner` with props:
- `message: string`
- `recoveryCost?: number | null`
- (optional) `title?: string` defaulting to `"Knocked Out"`

Expected behavior: renders the existing red bordered banner UI with the alert icon; formats `recoveryCost` with `toLocaleString()` when provided.

**Step 2: Export from components barrel**

Update `apps/web/src/components/index.ts` to export `KnockoutBanner`.

**Step 3: Replace banner duplicates**

Replace the repeated JSX blocks in the listed screens/page with:
- conditional render (`isRecovering` / `playerData.isRecovering` / `hpState.isRecovering`)
- a single `<KnockoutBanner message="..." recoveryCost={...} />`

**Step 4: Verify build + lint**

Run:
- `npm run lint -w apps/web`
- `npm run build -w apps/web`

Expected: success

**Step 5: Commit**

Run:
- `git add apps/web/src/components/KnockoutBanner.tsx apps/web/src/components/index.ts apps/web/src/components/screens/Dashboard.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/components/screens/Gathering.tsx apps/web/src/components/screens/Crafting.tsx apps/web/src/app/game/page.tsx`
- `git commit -m "refactor(web): extract KnockoutBanner"`

---

### Task 2: Centralize rarity mapping + UI constants (colors/glow)

**Files:**
- Create: `apps/web/src/lib/rarity.ts`
- Modify: `apps/web/src/components/ItemCard.tsx`
- Modify: `apps/web/src/components/screens/Equipment.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/components/screens/Bestiary.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add `apps/web/src/lib/rarity.ts`**

Export:
- `export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';`
- `export function rarityFromTier(tier: number): Rarity`
- `export const RARITY_COLORS: Record<Rarity, string>`
- (optional) `export const RARITY_GLOW: Record<Rarity, string>` (class strings currently in `ItemCard`)

**Step 2: Replace per-file `rarityColors` / `rarityGlow` / `rarityFromTier`**

Update the files listed above to import from `@/lib/rarity` and remove local copies.

**Step 3: Verify build + lint**

Run:
- `npm run lint -w apps/web`
- `npm run build -w apps/web`

Expected: success

**Step 4: Commit**

Run:
- `git add apps/web/src/lib/rarity.ts apps/web/src/components/ItemCard.tsx apps/web/src/components/screens/Equipment.tsx apps/web/src/components/screens/Crafting.tsx apps/web/src/components/screens/Bestiary.tsx apps/web/src/app/game/page.tsx`
- `git commit -m "refactor(web): centralize rarity utils and constants"`

---

### Task 3: Centralize common formatting helpers (snake_case → Title Case)

**Files:**
- Create: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/components/screens/Inventory.tsx`
- Modify: `apps/web/src/components/screens/Equipment.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add `apps/web/src/lib/format.ts`**

Export:
- `export function titleCaseFromSnake(input: string): string`

Implementation: current repeated logic `replace(/_/g, ' ').replace(/\b\w/g, ...)`.

**Step 2: Replace duplicates**

Use `titleCaseFromSnake` wherever slot/resource labels are currently built inline.

**Step 3: Verify build + lint**

Run:
- `npm run lint -w apps/web`
- `npm run build -w apps/web`

Expected: success

**Step 4: Commit**

Run:
- `git add apps/web/src/lib/format.ts apps/web/src/components/screens/Inventory.tsx apps/web/src/components/screens/Equipment.tsx apps/web/src/app/game/page.tsx`
- `git commit -m "refactor(web): centralize titleCaseFromSnake"`

---

### Task 4: Remove duplicated XP helpers from `GamePage`

**Note:** This repo already has canonical `xpForLevel` and `calculateEfficiency` in `@adventure/game-engine` (`packages/game-engine/src/skills/xpCalculator.ts`).

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add dependency**

Update `apps/web/package.json` dependencies to include:
- `"@adventure/game-engine": "*"`

**Step 2: Use shared helpers**

In `apps/web/src/app/game/page.tsx`, remove local `xpForLevel` / `calculateEfficiency` and import:
- `import { calculateEfficiency, xpForLevel } from '@adventure/game-engine';`

Keep call sites identical.

**Step 3: Verify package build + web build**

Run:
- `npm run build -w packages/game-engine`
- `npm run build -w apps/web`

Expected: success

**Step 4: Commit**

Run:
- `git add apps/web/package.json apps/web/src/app/game/page.tsx`
- `git commit -m "refactor(web): use game-engine XP helpers"`

---

### Task 5: Split `GamePage` into a controller hook + small components

**Files:**
- Create: `apps/web/src/app/game/useGameController.ts`
- Create: `apps/web/src/app/game/screens/CombatScreen.tsx`
- (optional) Create: `apps/web/src/app/game/adapters.ts`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Extract controller hook**

Move into `useGameController`:
- `useState` declarations for turns/skills/zones/inventory/etc.
- `loadAll`, `loadTurnsAndHp`, `loadBestiary`, `loadGatheringNodes`
- action handlers: `handleStartExploration`, `handleStartCombat`, `handleMine`, `handleCraft`, `handleDestroyItem`, `handleRepairItem`, `handleEquipItem`, `handleUnequipSlot`
- derived values: `currentZone`, `ownedByTemplateId`, and navigation helpers (`handleNavigate`, `getActiveTab`)

Hook return shape should be explicit and typed.

**Step 2: Extract `CombatScreen`**

Move the `case 'combat'` JSX into `CombatScreen.tsx` and pass only the props it needs:
- `hpState`, `pendingEncounters`, `busyAction`, `lastCombat`
- callbacks: `onStartCombat`

Use `KnockoutBanner` inside the screen (still conditional).

**Step 3: Keep `page.tsx` as orchestrator**

`page.tsx` should:
- handle auth redirect
- call `useGameController()`
- render `<AppShell>` + sub-nav + `<BottomNav>` + a small `renderScreen` (or simple conditional) that composes existing `components/screens/*`

**Step 4: Verify build + lint**

Run:
- `npm run lint -w apps/web`
- `npm run build -w apps/web`

Expected: success

**Step 5: Commit**

Run:
- `git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/app/game/page.tsx`
- `git commit -m "refactor(web): split GamePage into controller + CombatScreen"`

---

### Task 6: Reduce action boilerplate with a `runAction` helper

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Add `runAction` helper**

Implement a helper that:
- sets `busyAction`
- clears `actionError`
- runs the async callback
- always clears `busyAction` in `finally`

**Step 2: Apply to handlers**

Refactor each handler to use `runAction('mining', async () => { ... })` etc.

**Step 3: Verify build + lint**

Run:
- `npm run lint -w apps/web`
- `npm run build -w apps/web`

Expected: success

**Step 4: Commit**

Run:
- `git add apps/web/src/app/game/useGameController.ts`
- `git commit -m "refactor(web): add runAction helper for handlers"`

---

### Task 7 (Optional/last): Unify `rarityFromTier` across API + web via `@adventure/shared`

**Rationale:** Avoid drift between API/UI; keep a single mapping function in a shared package.

**Files:**
- Create: `packages/shared/src/rarity.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/bestiary.ts`
- Modify: `apps/web/src/lib/rarity.ts` (either re-export or remove duplication)

**Step 1: Add shared rarity helper**

Implement `rarityFromTier` and `Rarity` type in `@adventure/shared` and export from `packages/shared/src/index.ts`.

**Step 2: Update API**

Replace `apps/api/src/routes/bestiary.ts` local helper with import from `@adventure/shared`.

**Step 3: Update web**

Either:
- make `apps/web/src/lib/rarity.ts` re-export `rarityFromTier` from `@adventure/shared`, or
- remove it and import directly where used.

**Step 4: Verify builds**

Run:
- `npm run build -w packages/shared`
- `npm run build -w apps/api`
- `npm run build -w apps/web`

Expected: success

**Step 5: Commit**

Run:
- `git add packages/shared/src/rarity.ts packages/shared/src/index.ts apps/api/src/routes/bestiary.ts apps/web/src/lib/rarity.ts`
- `git commit -m "refactor: centralize rarityFromTier in shared"`
