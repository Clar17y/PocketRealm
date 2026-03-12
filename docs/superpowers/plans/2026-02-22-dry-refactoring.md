# DRY Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract 14 categories of duplicated code into shared utilities with zero behavior change.

**Architecture:** Create new utility files in Phase 1, then mechanically replace duplicates in Phases 2-5. Each phase is self-contained — tests must pass after every task.

**Tech Stack:** TypeScript, Express, Vitest, Prisma, React

---

## Phase 1: Create Utility Files

### Task 1: Create `asyncHandler` utility

**Files:**
- Create: `apps/api/src/utils/asyncHandler.ts`

**Step 1: Create the file**

```typescript
import { Request, Response, NextFunction } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const asyncHandler = (fn: AsyncRequestHandler) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
```

**Step 2: Verify** — `cd apps/api && npx tsc src/utils/asyncHandler.ts --noEmit`

**Step 3: Commit** — `git add apps/api/src/utils/asyncHandler.ts && git commit -m "refactor: extract asyncHandler utility"`

---

### Task 2: Create `pickWeighted` utility

**Files:**
- Create: `apps/api/src/utils/pickWeighted.ts`

**Step 1: Create the file**

```typescript
/**
 * Generic weighted random selection.
 * Returns a random item from the array, weighted by the callback value.
 */
export function pickWeighted<T>(items: T[], getWeight: (item: T) => number): T | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= Math.max(0, getWeight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
```

**Step 2: Commit** — `git add apps/api/src/utils/pickWeighted.ts && git commit -m "refactor: extract generic pickWeighted utility"`

---

### Task 3: Create `prismaAny` utility

**Files:**
- Create: `apps/api/src/utils/prismaAny.ts`

**Step 1: Create the file**

```typescript
import { prisma } from '@adventure/database';

/**
 * Untyped Prisma client for models not yet in the generated schema.
 * Import from here instead of casting per-file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prismaAny = prisma as unknown as any;
```

**Step 2: Commit** — `git add apps/api/src/utils/prismaAny.ts && git commit -m "refactor: centralize prismaAny cast"`

---

### Task 4: Create encounter types in shared package

**Files:**
- Create: `packages/shared/src/types/encounter.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create the types file**

```typescript
export type EncounterSiteSize = 'small' | 'medium' | 'large';
export type EncounterMobRole = 'trash' | 'elite' | 'boss';
export type EncounterMobStatus = 'alive' | 'defeated' | 'decayed';

export interface EncounterMobSlot {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;
}
```

**Step 2: Add export to `packages/shared/src/index.ts`**

Add this line alongside the other type re-exports:

```typescript
export type { EncounterSiteSize, EncounterMobRole, EncounterMobStatus, EncounterMobSlot } from './types/encounter.types';
```

**Step 3: Build shared** — `npm run build --workspace=packages/shared`

**Step 4: Commit** — `git add packages/shared/src/types/encounter.types.ts packages/shared/src/index.ts && git commit -m "refactor: add encounter types to shared package"`

---

### Task 5: Create `statFormat` frontend utility

**Files:**
- Create: `apps/web/src/lib/statFormat.ts`

**Step 1: Create the file**

This is the canonical superset of all stat formatting functions found across 5 frontend files.

```typescript
export const PERCENT_STATS = new Set(['critChance', 'critDamage']);

export const STAT_ORDER = [
  'attack', 'armor', 'magicDefence', 'health', 'dodge',
  'accuracy', 'magicPower', 'luck', 'evasion', 'critChance', 'critDamage',
];

export function prettyStatName(stat: string): string {
  if (stat === 'magicDefence') return 'Magic Defence';
  if (stat === 'magicPower') return 'Magic Power';
  if (stat === 'critChance') return 'Crit Chance';
  if (stat === 'critDamage') return 'Crit Damage';
  return stat
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function formatStatValue(stat: string, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${Math.round(value * 100)}%`;
  return String(value);
}

export function formatSignedStatValue(stat: string, value: number): string {
  const formatted = formatStatValue(stat, Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function signedClass(value: number, positiveClass: string): string {
  if (value < 0) return 'text-[var(--rpg-red)]';
  return positiveClass;
}

export function numStat(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function prettyWeightClass(weightClass?: 'heavy' | 'medium' | 'light' | null): string | null {
  if (!weightClass) return null;
  return `${weightClass[0].toUpperCase()}${weightClass.slice(1)} Armor`;
}
```

**Step 2: Commit** — `git add apps/web/src/lib/statFormat.ts && git commit -m "refactor: extract stat formatting utilities"`

---

### Task 6: Create test mock helper

**Files:**
- Create: `apps/api/src/__test__/setup.ts`

**Step 1: Create the file**

```typescript
import { vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';

/** Pre-cast mock Prisma client for use in tests. */
export const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
```

**Step 2: Commit** — `git add apps/api/src/__test__/setup.ts && git commit -m "refactor: create shared test mock helper"`

---

### Task 7: Expand routeHelpers with shared backend helpers

**Files:**
- Modify: `apps/api/src/utils/routeHelpers.ts`

**Step 1: Add these new exports to the existing file**

Add the following imports at the top of the file (merge with existing imports):

```typescript
import { prisma, Prisma } from '@adventure/database';
import { prismaAny } from './prismaAny';
import { calculateFleeResult, type MobTemplate } from '@adventure/game-engine';
import { AppError } from '../middleware/errorHandler';
import { getHpState, setHp, enterRecoveringState } from '../services/hpService';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import { respawnToHomeTown } from '../services/zoneDiscoveryService';
```

Then add these functions:

```typescript
// ── HP recovery guard ────────────────────────────────────────────────

export async function assertNotRecovering(playerId: string): Promise<Awaited<ReturnType<typeof getHpState>>> {
  const hpState = await getHpState(playerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot perform action while recovering', 'IS_RECOVERING');
  }
  return hpState;
}

// ── Bestiary tracking ────────────────────────────────────────────────

export async function recordBestiaryKill(
  playerId: string,
  mobTemplateId: string,
  mobPrefix: string | null,
): Promise<void> {
  await prisma.playerBestiary.upsert({
    where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
    create: { playerId, mobTemplateId, kills: 1 },
    update: { kills: { increment: 1 } },
  });
  if (mobPrefix) {
    await prismaAny.playerBestiaryPrefix.upsert({
      where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId, prefix: mobPrefix } },
      create: { playerId, mobTemplateId, prefix: mobPrefix, kills: 1 },
      update: { kills: { increment: 1 } },
    });
  }
}

// ── Achievement tracking ─────────────────────────────────────────────

export async function trackAchievements(
  playerId: string,
  counters: Record<string, number>,
  opts?: { statKeys?: string[]; familyIds?: string[] },
): Promise<void> {
  await incrementStats(playerId, counters);
  const statKeys = opts?.statKeys ?? Object.keys(counters);
  const achievements = await checkAchievements(playerId, {
    statKeys,
    ...(opts?.familyIds ? { familyIds: opts.familyIds } : {}),
  });
  if (achievements.length > 0) {
    await emitAchievementNotifications(playerId, achievements);
  }
}

// ── Item ownership validation ────────────────────────────────────────

export interface OwnedItemOptions {
  requireWeaponOrArmor?: boolean;
  requireNotStacked?: boolean;
  requireNotEquipped?: boolean;
}

export async function getOwnedItem(
  playerId: string,
  itemId: string,
  opts: OwnedItemOptions = {},
) {
  const item = await (prisma as any).item.findUnique({
    where: { id: itemId },
    include: { template: true },
  });

  if (!item || item.ownerId !== playerId) {
    throw new AppError(404, 'Item not found', 'NOT_FOUND');
  }

  if (opts.requireWeaponOrArmor) {
    if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
      throw new AppError(400, 'Only weapons/armor can be used for this action', 'INVALID_ITEM_TYPE');
    }
  }

  if (opts.requireNotStacked && item.quantity !== 1) {
    throw new AppError(400, 'Cannot perform this action on stacked items', 'INVALID_STACK');
  }

  if (opts.requireNotEquipped) {
    const equipped = await prisma.playerEquipment.findFirst({
      where: { playerId, itemId: item.id },
    });
    if (equipped) {
      throw new AppError(400, 'Cannot perform this action on an equipped item', 'ITEM_EQUIPPED');
    }
  }

  return item;
}

// ── Mob template coercion ────────────────────────────────────────────

export function toMobTemplate(raw: Record<string, unknown>): MobTemplate {
  return {
    ...raw,
    spellPattern: Array.isArray(raw.spellPattern)
      ? (raw.spellPattern as MobTemplate['spellPattern'])
      : [],
  } as MobTemplate;
}

// ── Combat defeat handling ───────────────────────────────────────────

export interface CombatDefeatParams {
  evasionLevel: number;
  mobLevel: number;
  maxHp: number;
}

export interface CombatDefeatResult {
  fleeResult: ReturnType<typeof calculateFleeResult>;
  respawnedTo: { townId: string; townName: string } | null;
}

export async function handleCombatDefeat(
  playerId: string,
  params: CombatDefeatParams,
): Promise<CombatDefeatResult> {
  const fleeResult = calculateFleeResult({
    evasionLevel: params.evasionLevel,
    mobLevel: params.mobLevel,
    maxHp: params.maxHp,
    currentGold: 0,
  });

  let respawnedTo: { townId: string; townName: string } | null = null;

  if (fleeResult.outcome === 'knockout') {
    await enterRecoveringState(playerId, params.maxHp);
    respawnedTo = await respawnToHomeTown(playerId);
    await trackAchievements(playerId, { totalDeaths: 1 });
  } else {
    await setHp(playerId, fleeResult.remainingHp);
  }

  return { fleeResult, respawnedTo };
}
```

**Step 2: Verify** — `cd apps/api && npx tsc --noEmit` (check for type errors)

**Step 3: Run tests** — `npm run test:api`

**Step 4: Commit** — `git add apps/api/src/utils/routeHelpers.ts && git commit -m "refactor: add shared route helpers for DRY extraction"`

---

## Phase 2: Mechanical Import Replacements

### Task 8: Replace `getSkillLevel` duplicates

**Files:**
- Modify: `apps/api/src/routes/gathering.ts` — delete local `getSkillLevel` (lines 209-216), add import from `../../services/combatStatsService`
- Modify: `apps/api/src/routes/crafting/helpers.ts` — delete local `getSkillLevel` (lines 37-44), add import from `../../services/combatStatsService`
- Modify: `apps/api/src/services/pvpService.ts` — delete local `getSkillLevel` (lines 202-208), add import from `./combatStatsService`

For each file:
1. Add `import { getSkillLevel } from '..../combatStatsService';` to existing imports
2. Delete the local `getSkillLevel` function
3. Update any callers that may use the local name differently (they don't — all identical)

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: deduplicate getSkillLevel — import from combatStatsService"`

---

### Task 9: Replace `prismaAny` casts with shared import

**Files to modify** (replace local `const prismaAny = prisma as unknown as any` or `const db = prisma as unknown as any` with `import { prismaAny } from '../utils/prismaAny'`):
- `apps/api/src/routes/bestiary.ts`
- `apps/api/src/routes/player.ts`
- `apps/api/src/routes/zones.ts`
- `apps/api/src/routes/combat/helpers.ts`
- `apps/api/src/routes/crafting/helpers.ts`
- `apps/api/src/routes/exploration/start.ts`
- `apps/api/src/services/bossLootService.ts`
- `apps/api/src/services/attributesService.ts`
- `apps/api/src/services/hpService.ts`
- `apps/api/src/services/zoneDiscoveryService.ts`
- `apps/api/src/services/zoneExplorationService.ts`

For each file:
1. Add `import { prismaAny } from '../utils/prismaAny';` (adjust relative path per file depth)
2. Delete the local `const prismaAny = ...` or `const db = ...` line
3. If the file used `db` instead of `prismaAny`, replace all `db.` references with `prismaAny.`

**Note:** `zones.ts` uses `const db = prisma as unknown as any` — rename all `db.` to `prismaAny.` in that file.

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: replace per-file prismaAny casts with shared import"`

---

### Task 10: Replace `pickWeighted` duplicates

**Files:**
- Modify: `apps/api/src/routes/combat/helpers.ts` — delete local `pickWeighted`, re-export from utils
- Modify: `apps/api/src/routes/exploration/helpers.ts` — delete local `pickWeighted`, re-export from utils
- Modify: `apps/api/src/services/chestService.ts` — replace `pickWeightedChestDrop` with imported `pickWeighted`
- Modify: `apps/api/src/services/eventSchedulerService.ts` — replace `pickWeightedTemplate` with imported `pickWeighted`
- Modify: `apps/api/src/routes/zones.ts` — replace inline weighted selection with imported `pickWeighted`

For combat/helpers.ts:
1. Add `import { pickWeighted } from '../../utils/pickWeighted';`
2. Delete the local `pickWeighted` function (lines 39-49)
3. Keep the re-export so existing callers work: `export { pickWeighted } from '../../utils/pickWeighted';`
4. Update call sites — callers use `pickWeighted(items)` with `encounterWeight` constraint. Change to `pickWeighted(items, m => m.encounterWeight)`

For exploration/helpers.ts:
1. Add `import { pickWeighted as pickWeightedGeneric } from '../../utils/pickWeighted';`
2. Replace the local `pickWeighted` body to delegate: keep the export signature for callers, but internally use the shared function
3. Or simpler: delete local, re-export, update callers to pass `(item) => item[weightKey]` callbacks

For chestService.ts:
1. Import `pickWeighted` from utils
2. Replace `pickWeightedChestDrop(entries)` with `pickWeighted(entries, e => Math.max(0, decimalLikeToNumber(e.dropChance)))`

For eventSchedulerService.ts:
1. Import `pickWeighted` from utils
2. Replace `pickWeightedTemplate(templates)` with `pickWeighted(templates, t => t.weight)`

For zones.ts (inline at ~lines 296-303):
1. Import `pickWeighted` from utils
2. Replace the inline loop with `const rawMob = pickWeighted(tieredMobs, m => m.encounterWeight) ?? tieredMobs[0]!;`

**Verify:** `npm run test:api` and `npm run test:engine`

**Commit:** `git commit -am "refactor: unify pickWeighted into single generic utility"`

---

### Task 11: Replace encounter type duplicates

**Files:**
- Modify: `apps/api/src/routes/combat/helpers.ts` — remove local type definitions, import from shared
- Modify: `apps/api/src/routes/exploration/helpers.ts` — remove local type definitions, import from shared

For combat/helpers.ts:
1. Add `import { type EncounterSiteSize, type EncounterMobRole, type EncounterMobStatus, type EncounterMobSlot } from '@adventure/shared';`
2. Delete local `EncounterMobRole`, `EncounterMobStatus` type aliases (lines 56-57)
3. Delete local `EncounterMobState` interface (lines 59-66) — replace with `EncounterMobSlot` from shared
4. Update `parseEncounterSiteMobs` return type from `EncounterMobState[]` to `EncounterMobSlot[]`
5. Keep `toEncounterSiteSize` function but change return type to use imported `EncounterSiteSize`

For exploration/helpers.ts:
1. Add `import { type EncounterSiteSize, type EncounterMobRole, type EncounterMobStatus } from '@adventure/shared';`
2. Delete local type aliases (lines 26-28)
3. Keep `NarrativeEventType` — it's specific to exploration, not shared

**Verify:** `npm run typecheck`

**Commit:** `git commit -am "refactor: use shared encounter types from @adventure/shared"`

---

### Task 12: Replace stat formatting duplicates in frontend

**Files:**
- Modify: `apps/web/src/components/screens/Inventory.tsx` — delete local stat utils, import from `@/lib/statFormat`
- Modify: `apps/web/src/components/screens/Equipment.tsx` — delete local stat utils, import from `@/lib/statFormat`
- Modify: `apps/web/src/components/screens/Crafting.tsx` — delete local stat utils, import from `@/lib/statFormat`
- Modify: `apps/web/src/components/screens/Forge.tsx` — delete local stat utils, import from `@/lib/statFormat`
- Modify: `apps/web/src/app/game/useGameController.ts` — delete local stat utils, import from `@/lib/statFormat`

For each file:
1. Add `import { PERCENT_STATS, prettyStatName, formatStatValue, formatSignedStatValue, signedClass, numStat, prettyWeightClass, STAT_ORDER } from '@/lib/statFormat';` (only the ones used in that file)
2. Delete the local copies of those functions/constants
3. In Forge.tsx, replace `prettifyStat` calls with `prettyStatName` (same logic, different name)
4. In useGameController.ts, replace `formatStatName` calls with `prettyStatName`
5. In Equipment.tsx, keep `statValue` and `totalStatValue` (they're component-specific, using `numStat` internally)

**Verify:** `npm run build:web` (type check + compile)

**Commit:** `git commit -am "refactor: extract stat formatting to shared statFormat utility"`

---

### Task 13: Replace `spellPattern` coercion with `toMobTemplate`

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` — import `toMobTemplate` from `routeHelpers`, use at mob selection sites
- Modify: `apps/api/src/routes/exploration/start.ts` — same
- Modify: `apps/api/src/routes/zones.ts` — same

For each file, find inline `spellPattern: Array.isArray(mob.spellPattern) ? ... : []` patterns and replace the surrounding mob construction with `toMobTemplate(mob)`.

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: use toMobTemplate for spellPattern coercion"`

---

## Phase 3: Route Handler Extractions

### Task 14: Replace `isRecovering` guards with `assertNotRecovering`

**Files to modify** (9 route files, 12 occurrences):
- `apps/api/src/routes/combat/start.ts`
- `apps/api/src/routes/exploration/start.ts`
- `apps/api/src/routes/equipment.ts`
- `apps/api/src/routes/gathering.ts`
- `apps/api/src/routes/zones.ts`
- `apps/api/src/routes/crafting/craft.ts`
- `apps/api/src/routes/crafting/forge.ts` (2 occurrences)
- `apps/api/src/routes/boss.ts`
- `apps/api/src/routes/hp.ts`

For each occurrence, replace:
```typescript
const hpState = await getHpState(playerId);
if (hpState.isRecovering) {
  throw new AppError(400, 'Cannot X while recovering', 'IS_RECOVERING');
}
```

With:
```typescript
const hpState = await assertNotRecovering(playerId);
```

1. Add `import { assertNotRecovering } from '../utils/routeHelpers.js';` (or `../../utils/routeHelpers.js` for nested routes)
2. Remove `getHpState` from imports if no longer used directly (check each file — some use `hpState` further down and some files still call `getHpState` for other purposes)
3. `assertNotRecovering` returns the `hpState`, so downstream code that uses `hpState.currentHp`, `hpState.maxHp`, etc. still works

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: replace isRecovering guards with assertNotRecovering"`

---

### Task 15: Replace bestiary upsert patterns with `recordBestiaryKill`

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (~2 locations)
- Modify: `apps/api/src/routes/exploration/start.ts` (~1 location)
- Modify: `apps/api/src/routes/zones.ts` (~1 location)

For each location, replace the bestiary upsert block:
```typescript
await prisma.playerBestiary.upsert({ ... });
if (prefixedMob.mobPrefix) {
  await prismaAny.playerBestiaryPrefix.upsert({ ... });
}
```

With:
```typescript
await recordBestiaryKill(playerId, prefixedMob.id, prefixedMob.mobPrefix);
```

1. Add `import { recordBestiaryKill } from '../../utils/routeHelpers.js';`
2. Delete the multi-line upsert blocks

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: extract bestiary upsert to recordBestiaryKill"`

---

### Task 16: Replace item ownership validation with `getOwnedItem`

**Files:**
- Modify: `apps/api/src/routes/crafting/forge.ts` (2 locations — upgrade and reroll)
- Modify: `apps/api/src/routes/crafting/salvage.ts`
- Modify: `apps/api/src/routes/inventory.ts` (repair endpoint)

For forge.ts upgrade handler, replace:
```typescript
const item = await (prisma as any).item.findUnique({ where: { id: body.itemId }, include: { template: true } });
if (!item || item.ownerId !== playerId) { throw ... }
if (item.template.itemType !== 'weapon' && ...) { throw ... }
if (item.quantity !== 1) { throw ... }
const equipped = await prisma.playerEquipment.findFirst({ ... });
if (equipped) { throw ... }
```

With:
```typescript
const item = await getOwnedItem(playerId, body.itemId, {
  requireWeaponOrArmor: true,
  requireNotStacked: true,
  requireNotEquipped: true,
});
```

Apply the same pattern with appropriate options for each location. Some locations only need a subset of validations (e.g., repair doesn't need `requireNotEquipped`).

1. Add `import { getOwnedItem } from '../../utils/routeHelpers.js';`
2. Check each call site for which validations apply

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: extract item ownership validation to getOwnedItem"`

---

### Task 17: Replace achievement tracking patterns with `trackAchievements`

**Files** (8 route files, 19 occurrences):
- `apps/api/src/routes/combat/start.ts`
- `apps/api/src/routes/zones.ts`
- `apps/api/src/routes/exploration/start.ts`
- `apps/api/src/routes/crafting/craft.ts`
- `apps/api/src/routes/crafting/forge.ts`
- `apps/api/src/routes/crafting/salvage.ts`
- `apps/api/src/routes/gathering.ts`
- `apps/api/src/routes/player.ts`

For each occurrence, replace:
```typescript
await incrementStats(playerId, { totalX: 1 });
const achievements = await checkAchievements(playerId, { statKeys: ['totalX'] });
await emitAchievementNotifications(playerId, achievements);
```

With:
```typescript
await trackAchievements(playerId, { totalX: 1 });
```

For cases with extra options (familyIds):
```typescript
await trackAchievements(playerId, { totalX: 1 }, { familyIds: [familyId] });
```

1. Add `import { trackAchievements } from '../utils/routeHelpers.js';`
2. Remove `incrementStats`, `checkAchievements`, `emitAchievementNotifications` from imports if no longer used directly
3. Be careful with cases where `checkAchievements` is called with specific `statKeys` that differ from the counter keys — pass explicit `statKeys` option

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: extract achievement tracking to trackAchievements"`

---

### Task 18: Replace combat defeat handling with `handleCombatDefeat`

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/zones.ts`

For each defeat-handling block, replace:
```typescript
fleeResult = calculateFleeResult({ evasionLevel: ..., mobLevel: ..., maxHp: ..., currentGold: 0 });
if (fleeResult.outcome === 'knockout') {
  await enterRecoveringState(playerId, hpState.maxHp);
  respawnedTo = await respawnToHomeTown(playerId);
  await incrementStats(playerId, { totalDeaths: 1 });
  ...achievements...
} else {
  await setHp(playerId, fleeResult.remainingHp);
}
```

With:
```typescript
const defeatResult = await handleCombatDefeat(playerId, {
  evasionLevel: progression.attributes.evasion,
  mobLevel: prefixedMob.level,
  maxHp: hpState.maxHp,
});
fleeResult = defeatResult.fleeResult;
respawnedTo = defeatResult.respawnedTo;
```

1. Add `import { handleCombatDefeat } from '../utils/routeHelpers.js';`
2. Remove unused imports (`calculateFleeResult`, `enterRecoveringState`, `respawnToHomeTown` etc.) if no longer used directly in that file

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: extract combat defeat handling to handleCombatDefeat"`

---

## Phase 4: asyncHandler Migration

### Task 19: Migrate all route files from try/catch to asyncHandler

**Files** (21 route files, ~61 handlers):
- `apps/api/src/routes/achievements.ts` (5 handlers)
- `apps/api/src/routes/auth.ts` (4)
- `apps/api/src/routes/bestiary.ts` (1)
- `apps/api/src/routes/boss.ts` (5)
- `apps/api/src/routes/chat.ts` (1)
- `apps/api/src/routes/equipment.ts` (3)
- `apps/api/src/routes/gathering.ts` (2)
- `apps/api/src/routes/hp.ts` (4)
- `apps/api/src/routes/inventory.ts` (4)
- `apps/api/src/routes/leaderboard.ts` (2)
- `apps/api/src/routes/player.ts` (7)
- `apps/api/src/routes/pvp.ts` (9)
- `apps/api/src/routes/turns.ts` (2)
- `apps/api/src/routes/worldEvents.ts` (3)
- `apps/api/src/routes/zones.ts` (2)
- `apps/api/src/routes/combat/logs.ts` (2)
- `apps/api/src/routes/combat/sites.ts` (2)
- `apps/api/src/routes/combat/start.ts` (1)
- `apps/api/src/routes/crafting/craft.ts` (1)
- `apps/api/src/routes/crafting/forge.ts` (2)
- `apps/api/src/routes/crafting/salvage.ts` (1)
- `apps/api/src/routes/crafting/recipes.ts` (1)
- `apps/api/src/routes/exploration/estimate.ts` (1)
- `apps/api/src/routes/exploration/start.ts` (1)

For each file:
1. Add `import { asyncHandler } from '../utils/asyncHandler';` (adjust path for nested)
2. Transform every handler from:
   ```typescript
   router.get('/path', async (req, res, next) => {
     try {
       // ... logic
     } catch (err) {
       next(err);
     }
   });
   ```
   To:
   ```typescript
   router.get('/path', asyncHandler(async (req, res) => {
     // ... logic (no try/catch, no next parameter)
   }));
   ```
3. Remove `next` parameter from handler signature (it's handled by asyncHandler)
4. Remove the try/catch wrapper
5. For `admin.ts`: delete the local `asyncHandler` definition (lines 26-27), import from utils instead

**Important:** Some handlers call `next(err)` explicitly in non-catch paths (e.g., validation middleware). Check each file — if `next` is only used in `catch(err) { next(err) }`, it can be removed. If `next` is used for other purposes (middleware chaining), keep it.

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: migrate all route handlers to asyncHandler"`

---

## Phase 5: Test Mock Cleanup

### Task 20: Migrate test files to shared mock setup

**Files** (27 test files in `apps/api/src/`):

All test files that contain this boilerplate:
```typescript
vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
import { prisma } from '@adventure/database';
const mockPrisma = prisma as unknown as Record<string, any>;
```

Replace with:
```typescript
import { mockPrisma } from '../__test__/setup';
```

For each test file:
1. Replace the 3-line boilerplate with the single import
2. Adjust relative path based on file depth (`../__test__/setup` for services, `../../__test__/setup` for routes/exploration, etc.)
3. The `vi.mock` call in `setup.ts` is hoisted by vitest, so it runs before test imports

**Important:** Some test files use `vi.mock('@adventure/database', ...)` with DIFFERENT mock implementations (not the standard `database.js` mock). Do NOT change those — only replace files using the standard mock.

**Verify:** `npm run test:api`

**Commit:** `git commit -am "refactor: use shared test mock setup across all API tests"`

---

## Phase 6: Verification

### Task 21: Full verification pass

**Step 1:** Run all tests — `npm run test`

**Step 2:** Run typecheck — `npm run typecheck`

**Step 3:** Run lint — `npm run lint`

**Step 4:** Fix any failures

**Step 5:** Final commit if fixes needed — `git commit -am "fix: resolve issues from DRY refactoring"`
