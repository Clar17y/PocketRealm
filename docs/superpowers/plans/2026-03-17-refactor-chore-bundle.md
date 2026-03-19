# Refactor/Chore Bundle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle five independent refactor/chore issues (#185, #187, #188, #193, #194) into a single branch to reduce code duplication, improve type safety, and add forge result feedback.

**Architecture:** Five independent changes — three backend refactors (validateEnum helper, safeUpsert helper + ActivityType narrowing, tx-aware registration), one frontend refactor (shared stat display metadata), one frontend feature (forge toast). No changes depend on each other.

**Tech Stack:** TypeScript, Prisma, React, Lucide icons, existing useToastQueue hook

**Closes:** #185, #187, #188, #193, #194

---

## Chunk 1: Backend Refactors

### Task 1: Extract generic `validateEnum` helper (#187)

**Files:**
- Create: `apps/api/src/utils/validateEnum.ts`
- Modify: `apps/api/src/services/bossEncounterService.ts:43-54`
- Modify: `apps/api/src/services/casinoService.ts:24-29`
- Modify: `apps/api/src/services/expeditionService.ts:64-69`
- Create: `apps/api/src/utils/validateEnum.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/api/src/utils/validateEnum.test.ts
import { describe, it, expect } from 'vitest';
import { validateEnum } from './validateEnum';

describe('validateEnum', () => {
  const VALID = new Set(['a', 'b', 'c'] as const);
  type Letter = 'a' | 'b' | 'c';

  it('returns value when it is in the valid set', () => {
    expect(validateEnum<Letter>('a', VALID, 'c')).toBe('a');
    expect(validateEnum<Letter>('b', VALID, 'c')).toBe('b');
  });

  it('returns fallback for invalid value', () => {
    expect(validateEnum<Letter>('x', VALID, 'c')).toBe('c');
  });

  it('returns fallback for empty string', () => {
    expect(validateEnum<Letter>('', VALID, 'c')).toBe('c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/utils/validateEnum.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/utils/validateEnum.ts
/**
 * Validate a DB string column against a known set of values,
 * returning the fallback if the value is unrecognised.
 */
export function validateEnum<T extends string>(
  value: string,
  valid: ReadonlySet<T>,
  fallback: T,
): T {
  return valid.has(value as T) ? (value as T) : fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/utils/validateEnum.test.ts`
Expected: PASS

- [ ] **Step 5: Replace usages in bossEncounterService.ts**

Remove `validateEncounterStatus` (lines 46-49) and `validateParticipantStatus` (lines 51-54). Import and call `validateEnum` instead. Keep the `VALID_ENCOUNTER_STATUSES` and `VALID_PARTICIPANT_STATUSES` sets.

```typescript
import { validateEnum } from '../utils/validateEnum';

// Remove the two local functions. At each call site, replace:
//   validateEncounterStatus(status)  → validateEnum(status, VALID_ENCOUNTER_STATUSES, 'waiting')
//   validateParticipantStatus(status) → validateEnum(status, VALID_PARTICIPANT_STATUSES, 'alive')
```

- [ ] **Step 6: Replace usage in casinoService.ts**

Remove `validateBetType` (lines 26-29). Import `validateEnum`. Replace call sites:

```typescript
import { validateEnum } from '../utils/validateEnum';
// validateBetType(value) → validateEnum(value, VALID_BET_TYPES, 'straight')
```

- [ ] **Step 7: Replace usage in expeditionService.ts**

Remove `validateExpeditionStatus` (lines 66-69). Import `validateEnum`. Replace call sites:

```typescript
import { validateEnum } from '../utils/validateEnum';
// validateExpeditionStatus(status) → validateEnum(status, VALID_EXPEDITION_STATUSES, 'failed')
```

- [ ] **Step 8: Run full API tests**

Run: `npm run test:api`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/utils/validateEnum.ts apps/api/src/utils/validateEnum.test.ts \
  apps/api/src/services/bossEncounterService.ts apps/api/src/services/casinoService.ts \
  apps/api/src/services/expeditionService.ts
git commit -m "refactor: extract generic validateEnum helper (#187)"
```

---

### Task 2: Wire ActivityType + extract safeUpsert helper (#188)

**Files:**
- Modify: `apps/api/src/services/activityLogService.ts:17-22`
- Create: `apps/api/src/utils/safeUpsert.ts`
- Create: `apps/api/src/utils/safeUpsert.test.ts`
- Modify: `apps/api/src/services/pvpService.ts:41-60`
- Modify: `apps/api/src/services/questService.ts:103-124`

#### Part A: Wire ActivityType

- [ ] **Step 1: Narrow the `activityType` parameter**

In `apps/api/src/services/activityLogService.ts`, change `activityType: string` to `activityType: ActivityType` in the `createActivityLog` params (line 19).

```typescript
// Before:
activityType: string;
// After:
activityType: ActivityType;
```

- [ ] **Step 2: Verify callers typecheck**

Run: `npx tsc -b --noEmit`

Check the output. Most callers pass string literals ('combat', 'crafting', etc.) that match the union, so they should typecheck cleanly. If any caller passes a computed `string` variable, either fix the upstream type to be `ActivityType` or add an `as ActivityType` assertion with a comment explaining why it is safe.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/activityLogService.ts
git commit -m "chore: narrow createActivityLog activityType param to ActivityType union (#188)"
```

#### Part B: Extract safeUpsert

- [ ] **Step 4: Write the test file**

```typescript
// apps/api/src/utils/safeUpsert.test.ts
import { describe, it, expect, vi } from 'vitest';
import { safeUpsert } from './safeUpsert';

describe('safeUpsert', () => {
  it('returns upsert result on success', async () => {
    const result = await safeUpsert(
      () => Promise.resolve({ id: '1' }),
      () => Promise.resolve({ id: '1' }),
    );
    expect(result).toEqual({ id: '1' });
  });

  it('falls back to findFn on P2002 error', async () => {
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const result = await safeUpsert(
      () => Promise.reject(p2002),
      () => Promise.resolve({ id: '2' }),
    );
    expect(result).toEqual({ id: '2' });
  });

  it('rethrows non-P2002 errors', async () => {
    const other = new Error('Connection lost');
    await expect(
      safeUpsert(
        () => Promise.reject(other),
        () => Promise.resolve({ id: '3' }),
      ),
    ).rejects.toThrow('Connection lost');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run apps/api/src/utils/safeUpsert.test.ts`
Expected: FAIL — module not found

- [ ] **Step 6: Write the implementation**

```typescript
// apps/api/src/utils/safeUpsert.ts

/**
 * Run a Prisma upsert with P2002 race-condition handling.
 *
 * Two concurrent requests can both attempt to INSERT when the row doesn't
 * exist yet. One wins; the other gets a unique constraint violation (P2002).
 * On P2002 we know the row now exists, so we simply read it back.
 */
export async function safeUpsert<T>(
  upsertFn: () => Promise<T>,
  findFn: () => Promise<T>,
): Promise<T> {
  try {
    return await upsertFn();
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return findFn();
    }
    throw err;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run apps/api/src/utils/safeUpsert.test.ts`
Expected: PASS

- [ ] **Step 8: Replace pattern in pvpService.ts**

Replace `getOrCreateRating` (lines 41-60) try/catch with `safeUpsert`:

```typescript
import { safeUpsert } from '../utils/safeUpsert';

export async function getOrCreateRating(playerId: string) {
  return safeUpsert(
    () => prisma.pvpRating.upsert({
      where: { playerId },
      update: {},
      create: {
        playerId,
        rating: PVP_CONSTANTS.STARTING_RATING,
        bestRating: PVP_CONSTANTS.STARTING_RATING,
      },
    }),
    () => prisma.pvpRating.findUniqueOrThrow({ where: { playerId } }),
  );
}
```

- [ ] **Step 9: Replace pattern in questService.ts**

Replace `getOrCreateQuestState` (lines 103-124) try/catch with `safeUpsert`:

```typescript
import { safeUpsert } from '../utils/safeUpsert';

export async function getOrCreateQuestState(playerId: string) {
  return safeUpsert(
    () => prisma.playerQuestState.upsert({
      where: { playerId },
      create: {
        playerId,
        questTokens: 0,
        dailyBonusClaimed: false,
        lastDailyReset: new Date('2000-01-01T00:00:00Z'),
        lastWeeklyReset: new Date('2000-01-01T00:00:00Z'),
      },
      update: {},
    }),
    () => prisma.playerQuestState.findUniqueOrThrow({ where: { playerId } }),
  );
}
```

- [ ] **Step 10: Run API tests**

Run: `npm run test:api`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/utils/safeUpsert.ts apps/api/src/utils/safeUpsert.test.ts \
  apps/api/src/services/pvpService.ts apps/api/src/services/questService.ts
git commit -m "chore: extract safeUpsert helper for P2002 race handling (#188)"
```

---

### Task 3: Make registration setup functions tx-aware (#185)

**Files:**
- Modify: `apps/api/src/services/equipmentService.ts:33-46` — add `tx?` param to `ensureEquipmentSlots`
- Modify: `apps/api/src/services/zoneDiscoveryService.ts:14-131` — add `tx?` param to `ensureStarterDiscoveries` and `ensureStarterEncounterAndNodes`
- Modify: `apps/api/src/routes/auth.ts:84-220` — remove inlined logic, call service functions with `tx`

**Pattern to follow** (from `potionService.ts`):
```typescript
export async function someFunction(playerId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  // use db instead of prisma for all queries
}
```

- [ ] **Step 1: Add `tx?` param to `ensureEquipmentSlots`**

In `apps/api/src/services/equipmentService.ts`, update `ensureEquipmentSlots` (lines 33-46):

```typescript
export async function ensureEquipmentSlots(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  // Replace all prisma.playerEquipment.* calls with db.playerEquipment.*
}
```

Ensure `Prisma` is imported from `@pocketrealm/database`.

- [ ] **Step 2: Add `tx?` param to `ensureStarterDiscoveries`**

In `apps/api/src/services/zoneDiscoveryService.ts`, update `ensureStarterDiscoveries` (lines 14-39):

```typescript
export async function ensureStarterDiscoveries(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  // Replace all prisma.* calls with db.*
}
```

- [ ] **Step 3: Add `tx?` param to `ensureStarterEncounterAndNodes`**

In `apps/api/src/services/zoneDiscoveryService.ts`, update `ensureStarterEncounterAndNodes` (lines 42-131):

```typescript
export async function ensureStarterEncounterAndNodes(
  playerId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  // Replace all prisma.* calls with db.*
}
```

- [ ] **Step 4: Verify existing callers still work**

Run: `npx tsc -b --noEmit`

The `tx` param is optional, so existing callers that pass only `playerId` remain valid.

- [ ] **Step 5: Replace inlined logic in auth.ts registration handler**

In `apps/api/src/routes/auth.ts`, inside the `$transaction` block (lines ~113-217), replace the inlined logic with service calls:

```typescript
// Inside the prisma.$transaction(async (tx) => { ... }) block:

// Replace inlined equipment logic (lines ~113-124) with:
await ensureEquipmentSlots(player.id, tx);

// KEEP the starter off-hand item creation + equip logic (lines ~126-142) inline.
// This block creates the starter shield and equips it — it is NOT part of any
// existing service function and must remain in the transaction.

// Replace inlined zone discovery logic (lines ~144-158) with:
await ensureStarterDiscoveries(player.id, tx);

// Replace inlined encounter/node logic (lines ~160-217) with:
await ensureStarterEncounterAndNodes(player.id, tx);
```

Add imports at the top of auth.ts:
```typescript
import { ensureEquipmentSlots } from '../services/equipmentService';
import { ensureStarterDiscoveries, ensureStarterEncounterAndNodes } from '../services/zoneDiscoveryService';
```

Remove the comment about inlining (lines 14-15).

- [ ] **Step 6: Run API tests**

Run: `npm run test:api`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/equipmentService.ts \
  apps/api/src/services/zoneDiscoveryService.ts \
  apps/api/src/routes/auth.ts
git commit -m "refactor: make registration setup functions tx-aware (#185)"
```

---

## Chunk 2: Frontend Refactors

### Task 4: Extract shared stat display metadata (#193)

**Files:**
- Modify: `apps/web/src/lib/statFormat.ts` — add `statDisplayMeta()` function
- Modify: `apps/web/src/components/screens/Inventory.tsx:87-101` — replace `statDisplay()`
- Modify: `apps/web/src/components/screens/Equipment.tsx:331-349,588-602` — replace inline mappings

- [ ] **Step 1: Add `statDisplayMeta` to statFormat.ts**

```typescript
// Add to apps/web/src/lib/statFormat.ts
import type { LucideIcon } from 'lucide-react';
import { Backpack, Crosshair, Heart, Shield, Sparkles, Sword, Target, Zap } from 'lucide-react';

interface StatDisplayMeta {
  icon: LucideIcon;
  /** Tailwind class form: text-[var(--rpg-red)] */
  cssClass: string;
  /** Raw CSS var form: var(--rpg-red) */
  cssVar: string;
  label: string;
}

const META: Record<string, StatDisplayMeta> = {
  attack:      { icon: Sword,     cssClass: 'text-[var(--rpg-red)]',         cssVar: 'var(--rpg-red)',         label: 'Attack' },
  armor:       { icon: Shield,    cssClass: 'text-[var(--rpg-blue-light)]',  cssVar: 'var(--rpg-blue-light)',  label: 'Armor' },
  magicDefence:{ icon: Sparkles,  cssClass: 'text-[var(--rpg-purple)]',      cssVar: 'var(--rpg-purple)',      label: 'Magic Def' },
  health:      { icon: Heart,     cssClass: 'text-[var(--rpg-green-light)]', cssVar: 'var(--rpg-green-light)', label: 'HP' },
  dodge:       { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Dodge' },
  accuracy:    { icon: Crosshair, cssClass: 'text-[var(--rpg-blue-light)]',  cssVar: 'var(--rpg-blue-light)',  label: 'Accuracy' },
  magicPower:  { icon: Sparkles,  cssClass: 'text-[var(--rpg-purple)]',      cssVar: 'var(--rpg-purple)',      label: 'Magic Power' },
  rangedPower: { icon: Target,    cssClass: 'text-[var(--rpg-green-light)]', cssVar: 'var(--rpg-green-light)', label: 'Ranged Power' },
  luck:        { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Luck' },
  critChance:  { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Crit Chance' },
  critDamage:  { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Crit Damage' },
  evasion:     { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Evasion' },
  inventorySlots: { icon: Backpack, cssClass: 'text-[var(--rpg-gold)]',      cssVar: 'var(--rpg-gold)',        label: 'Inventory Slots' },
  // Aliases for Equipment.tsx total stats panel which uses different property names:
  defence:     { icon: Shield,    cssClass: 'text-[var(--rpg-blue-light)]',  cssVar: 'var(--rpg-blue-light)',  label: 'Armor' },
  hp:          { icon: Heart,     cssClass: 'text-[var(--rpg-green-light)]', cssVar: 'var(--rpg-green-light)', label: 'HP' },
};

const FALLBACK_META: Omit<StatDisplayMeta, 'label'> = {
  icon: Zap,
  cssClass: 'text-[var(--rpg-text-secondary)]',
  cssVar: 'var(--rpg-text-secondary)',
};

export function statDisplayMeta(stat: string): StatDisplayMeta {
  return META[stat] ?? { ...FALLBACK_META, label: prettyStatName(stat) };
}
```

- [ ] **Step 2: Replace `statDisplay` in Inventory.tsx**

Remove the local `statDisplay()` function (lines 87-101). Import `statDisplayMeta` from `@/lib/statFormat`. Update callers to use the new function — map `Icon` → `icon`, `color` → `cssClass`.

Remove icon imports that are no longer needed directly (Backpack, Crosshair, Heart, Shield, Sparkles, Sword, Target, Zap) if they have no other usage in the file. Keep `X`, `Coins` etc. that are used elsewhere.

- [ ] **Step 3: Replace inline stat metadata in Equipment.tsx StatLine section**

At lines 331-341, replace inline `icon={Sword} label="Attack" color="text-[var(--rpg-red)]"` props with lookups:

```tsx
import { statDisplayMeta } from '@/lib/statFormat';

// For each stat line, instead of inline props:
{(['attack', 'armor', 'magicDefence', 'health', 'dodge', 'accuracy', 'magicPower', 'rangedPower', 'luck', 'critChance', 'critDamage'] as const).map((statKey) => {
  const meta = statDisplayMeta(statKey);
  return (
    <StatLine
      key={statKey}
      icon={meta.icon}
      label={meta.label}
      statKey={statKey}
      value={/* existing value logic */}
      color={meta.cssClass}
    />
  );
})}
```

Keep the `inventorySlots` bonus row separate since it has special conditional logic.

- [ ] **Step 4: Replace inline stat metadata in Equipment.tsx StatBlock section**

At lines 588-602, replace the inline array with lookups using `cssVar` format.

**Important:** This section uses different property names than the item stat keys — `stats.defence` (not `armor`), `stats.hp` (not `health`). The META record includes `defence` and `hp` as aliases so `statDisplayMeta('defence')` works. However, the value computation varies per stat (conditionally included magicPower/rangedPower/luck, base value addition for critChance/critDamage), so this cannot be a simple loop. Use `statDisplayMeta` for icon/label/color but keep per-stat value formatting inline:

```tsx
const statsArray = [
  { ...pick(statDisplayMeta('attack')),      value: String(stats.attack) },
  { ...pick(statDisplayMeta('defence')),     value: String(stats.defence) },
  { ...pick(statDisplayMeta('magicDefence')),value: String(stats.magicDefence) },
  { ...pick(statDisplayMeta('hp')),          value: String(stats.hp) },
  { ...pick(statDisplayMeta('dodge')),       value: String(stats.dodge) },
  { ...pick(statDisplayMeta('accuracy')),    value: String(stats.accuracy) },
  // ... conditionally spread magicPower, rangedPower, luck as before
  { ...pick(statDisplayMeta('critChance')),  value: `${Math.round((0.05 + stats.critChance) * 100)}%` },
  { ...pick(statDisplayMeta('critDamage')),  value: `${Math.round((1.5 + stats.critDamage) * 100)}%` },
];

// Helper to extract only the fields StatBlock expects:
function pick(meta: StatDisplayMeta) {
  return { icon: meta.icon, label: meta.label, color: meta.cssVar };
}
```

Preserve all conditional inclusion logic (magicPower > 0, rangedPower > 0, etc.).

Remove icon imports from Equipment.tsx that are no longer needed directly.

- [ ] **Step 5: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/statFormat.ts \
  apps/web/src/components/screens/Inventory.tsx \
  apps/web/src/components/screens/Equipment.tsx
git commit -m "refactor: extract shared stat display metadata (#193)"
```

---

### Task 5: Add forge result toast (#194)

**Files:**
- Create: `apps/web/src/components/ForgeResultToast.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts:1202-1239` — call toast after forge actions
- Modify: `apps/web/src/app/game/page.tsx` — mount `<ForgeResultToast />`

**Pattern:** Follow `QuestToast.tsx` — uses `useToastQueue` hook with global window function registration.

- [ ] **Step 1: Create ForgeResultToast component**

```tsx
// apps/web/src/components/ForgeResultToast.tsx
'use client';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

export interface ForgeResultData {
  type: 'upgrade_success' | 'upgrade_protected' | 'upgrade_fail' | 'reroll';
  message: string;
}

let _seq = 0;

export function ForgeResultToast() {
  const queue = useToastQueue<ForgeResultData>({
    globalKey: '__showForgeToast',
    maxVisible: 1,
    autoDismissMs: 3000,
    makeItem: (raw) => ({ id: `forge-${++_seq}`, data: raw }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-right"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      renderToast={(item) => {
        const isSuccess = item.data.type === 'upgrade_success' || item.data.type === 'reroll';
        const isProtected = item.data.type === 'upgrade_protected';
        return (
          <div className="flex items-center gap-2">
            <span>{isSuccess ? '✨' : isProtected ? '🛡️' : '💥'}</span>
            <span className={
              isSuccess ? 'text-[var(--rpg-green-light)]'
                : isProtected ? 'text-[var(--rpg-blue-light)]'
                : 'text-[var(--rpg-red)]'
            }>
              {item.data.message}
            </span>
          </div>
        );
      }}
      cardClassName={(item) => {
        const isSuccess = item.data.type === 'upgrade_success' || item.data.type === 'reroll';
        const isProtected = item.data.type === 'upgrade_protected';
        return isSuccess
          ? 'border-[var(--rpg-green-light)]'
          : isProtected
            ? 'border-[var(--rpg-blue-light)]'
            : 'border-[var(--rpg-red)]';
      }}
    />
  );
}
```

- [ ] **Step 2: Add toast trigger helper to useGameController.ts**

Near the existing `showQuestToasts` helper (line ~116), add:

```typescript
function showForgeToast(data: { type: string; message: string }) {
  const show = (window as unknown as Record<string, unknown>).__showForgeToast as
    | ((data: { type: string; message: string }) => void)
    | undefined;
  if (show) show(data);
}
```

- [ ] **Step 3: Wire toast into handleForgeUpgrade**

In the `handleForgeUpgrade` callback (lines 1202-1232), add `showForgeToast()` calls after each `pushLog()`:

```typescript
if (data.forge.success) {
  pushLog({ /* existing */ });
  showForgeToast({ type: 'upgrade_success', message: `Upgraded to ${toLabel}!` });
} else if (data.forge.protected) {
  pushLog({ /* existing */ });
  showForgeToast({ type: 'upgrade_protected', message: `Failed but protected!` });
} else {
  pushLog({ /* existing */ });
  showForgeToast({ type: 'upgrade_fail', message: `Upgrade failed — target and sacrifice consumed` });
}
```

- [ ] **Step 4: Wire toast into handleForgeReroll**

In the `handleForgeReroll` callback (lines 1234-1239), add after the `pushLog()`:

```typescript
pushLog({ /* existing */ });
showForgeToast({ type: 'reroll', message: `Stats rerolled!` });
```

- [ ] **Step 5: Mount ForgeResultToast in page.tsx**

In `apps/web/src/app/game/page.tsx`, import and mount alongside the other toasts (near QuestToast at line ~1381):

```tsx
import { ForgeResultToast } from '@/components/ForgeResultToast';
// ...
<ForgeResultToast />
```

- [ ] **Step 6: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ForgeResultToast.tsx \
  apps/web/src/app/game/useGameController.ts \
  apps/web/src/app/game/page.tsx
git commit -m "feat: add forge result toast notifications (#194)"
```

---

## Final Steps

- [ ] **Run full typecheck:** `npm run typecheck`
- [ ] **Run full test suite:** `npm run test`
- [ ] **Create PR closing #185, #187, #188, #193, #194**
