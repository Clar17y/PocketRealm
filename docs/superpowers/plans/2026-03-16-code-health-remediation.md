# Code Health Audit Remediation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all 200+ findings from the code health audit across 166 files (9 Critical, 21 High, 35 Medium, 140+ Low).

**Architecture:** Six phases ordered by severity and blast radius. Phase 1 fixes the Prisma generation root cause that accounts for ~70% of Critical/High findings. Each subsequent phase addresses progressively lower-severity issues. Each phase is an independent branch.

**Tech Stack:** Prisma 6, TypeScript strict mode, Zod, Vitest

**Key Discovery:** The generated Prisma client contains only 14 of 61 schema models (stale `node_modules/.prisma/client/schema.prisma` — 259 lines vs 1,272 in source). This single root cause drives ALL 9 Critical findings and most High findings.

---

## Chunk 1: Prisma Type Safety Foundation

This chunk addresses all Critical findings and most High findings. It is the highest-impact work — fixing the Prisma generation issue alone will restore type safety to 150+ operations across 25+ files.

### Task 1: Regenerate Prisma Client and Verify All Models

**Files:**
- Verify: `packages/database/prisma/schema.prisma` (61 models)
- Regenerate: `node_modules/.prisma/client/` (generated)
- Test: typecheck all packages after generation

- [ ] **Step 1: Regenerate the Prisma client from current schema**

```bash
npm run db:generate
```

Expected: Client regenerates with all 61 models. Verify with:
```bash
grep -c "model " node_modules/.prisma/client/schema.prisma
```
Expected output: `61` (or close — may differ by 1-2 for enums)

- [ ] **Step 2: Verify missing models now exist in generated types**

```bash
grep -E "export type (PlayerBuff|PlayerQuestState|EncounterSite|ShopItem|ChestDropTable|SkillPointAllocation) " node_modules/.prisma/client/index.d.ts
```
Expected: All 6 model types found.

- [ ] **Step 3: Run typecheck to establish baseline errors**

```bash
npm run typecheck 2>&1 | tail -30
```

Expected: Many new type errors will appear — the `as any` casts were hiding real mismatches. Record the count. These errors guide the remaining tasks.

- [ ] **Step 4: Verify `.prisma/client/` is in `.gitignore`**

The generated client lives in `node_modules/.prisma/client/` which is already gitignored. Only commit if `packages/database/` has relevant non-generated changes (e.g., updated generate script).

```bash
git status packages/database/
# Only commit if there are meaningful changes
```

---

### Task 2: Remove `prisma as any` and `tx as unknown as any` Casts (Critical)

All 9 Critical findings share the same root cause: casting the Prisma client or transaction to `any` to access models that weren't in the generated types. After Task 1, these models exist and the casts can be removed.

**Files to modify (9 files with Critical findings):**

| File | Lines | Pattern | Models accessed |
|------|-------|---------|-----------------|
| `apps/api/src/services/attributesService.ts` | 68 | `tx as unknown as any` | player |
| `apps/api/src/services/buffService.ts` | 11,28,36,81,101,153 | `(prisma as any)` x6 | playerBuff |
| `apps/api/src/services/cacheLootService.ts` | 101,105,122,130,164,222,236 | `tx as unknown as Record<...>` then `as any` x6 | craftingRecipe, item, playerRecipe |
| `apps/api/src/services/chestService.ts` | 40,51,76,98,111 | `tx as unknown as any` + 4 ops | chestDropTable, craftingRecipe, playerRecipe |
| `apps/api/src/services/guildService.ts` | 270 | `requireRole` returns `Promise<any>` | guildMember w/ include |
| `apps/api/src/services/xpService.ts` | 42 | `tx as unknown as any` | player |
| `apps/api/src/services/questShopService.ts` | 24,81 + 30 more | `prisma as any` (highest density) | shopItem, playerBuff, playerShopPurchase, skillPointAllocation, craftingRecipe, playerRecipe, playerBestiaryPrefix |
| `apps/api/src/routes/combat/start.ts` | 329 | `tx as unknown as any` | encounterSite |
| `apps/api/src/routes/exploration/start.ts` | 796 | `tx as unknown as any` | encounterSite |

- [ ] **Step 1: Fix `attributesService.ts` — remove double-cast on line 68**

Remove the `tx as unknown as any` cast. Use `tx` directly since the transaction client now includes all models.

Before:
```typescript
const txAny = tx as unknown as any;
```
After: Delete this line and replace all `txAny.` references with `tx.` in the transaction callback.

- [ ] **Step 2: Fix `buffService.ts` — remove all 6 `(prisma as any)` casts**

Replace each `(prisma as any).playerBuff` with `prisma.playerBuff`. The model now exists on the typed client.

Lines: 11, 28, 36, 81, 101, 153.

- [ ] **Step 3: Fix `cacheLootService.ts` — remove `txAny` pattern and result casts**

Remove `const txAny = tx as unknown as Record<string, unknown>` (line ~101). Replace all `txAny` with `tx`. Remove `as Array<{...}>` result casts on lines 108, 125, 137-141, 167, 225, 242 — let Prisma infer return types.

- [ ] **Step 4: Fix `chestService.ts` — same pattern as cacheLootService**

Remove `tx as unknown as any` (line 40). Replace `txAny.chestDropTable`, `txAny.craftingRecipe`, `txAny.playerRecipe` with `tx.chestDropTable`, etc. Remove `as DropTableEntry[]` and `as Array<{...}>` result casts.

- [ ] **Step 5: Fix `guildService.ts:270` — type `requireRole` return**

Add explicit return type using Prisma's inferred type:
```typescript
async function requireRole(
  playerId: string,
  requiredRoles: GuildRole[]
): Promise<GuildMember & { guild: Guild }> {
```
(Adjust the include shape to match the actual `findUnique` call's `include` clause.)

- [ ] **Step 6: Fix `xpService.ts:42` — remove double-cast**

Remove `const txAny = tx as unknown as any`. Replace `txAny.player` with `tx.player`.

- [ ] **Step 7: Fix `questShopService.ts` — remove all `prisma as any` casts (30+ locations)**

This is the highest-density file. Remove both top-level casts at lines 24 and 81. Use `prisma` directly (or `tx` inside transactions). All models (`shopItem`, `playerBuff`, `playerShopPurchase`, `skillPointAllocation`, `craftingRecipe`, `playerRecipe`, `playerBestiaryPrefix`) now exist on the typed client.

- [ ] **Step 8: Fix `combat/start.ts:329` — remove double-cast in encounter site transaction**

Remove `tx as unknown as any`. Use `tx.encounterSite` directly.

- [ ] **Step 9: Fix `exploration/start.ts:796` — remove double-cast**

Same pattern. Remove `tx as unknown as any`. Use `tx` directly.

- [ ] **Step 10: Run typecheck and fix any newly-surfaced type errors**

```bash
npm run typecheck
```

The removal of `any` casts will surface real type mismatches. Fix each one using Prisma's generated types.

- [ ] **Step 11: Run tests**

```bash
npm run test:api
npm run test:engine
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/services/attributesService.ts apps/api/src/services/buffService.ts apps/api/src/services/cacheLootService.ts apps/api/src/services/chestService.ts apps/api/src/services/guildService.ts apps/api/src/services/xpService.ts apps/api/src/services/questShopService.ts apps/api/src/routes/combat/start.ts apps/api/src/routes/exploration/start.ts
git commit -m "fix(critical): remove all prisma-as-any casts after client regeneration"
```

---

### Task 3: Type All `tx: any` Transaction Parameters (High)

After Task 2 removes the critical casts, these High-severity findings remain: transaction callback parameters typed as `any` instead of `Prisma.TransactionClient`.

**Files (8 services, 30+ occurrences):**

| File | Lines | Count |
|------|-------|-------|
| `apps/api/src/services/buffService.ts` | 47, 62, 117, 142, 153 | 5 |
| `apps/api/src/services/questShopService.ts` | 88, 156, 193, 203, 216, 242, 251, 269, 310, 343, 391, 417 | 12 |
| `apps/api/src/services/guildContractService.ts` | 53, 146 | 2 |
| `apps/api/src/services/guildMembershipService.ts` | 43, 67, 179, 216, 235, 257, 276 | 7 |
| `apps/api/src/services/guildUpgradeService.ts` | 74 | 1 |
| `apps/api/src/services/skillPointService.ts` | 63, 136 | 2 |
| `apps/api/src/services/guildService.ts` | 109, 145 | 2 |
| `apps/api/src/services/dropRollingService.ts` | 76, 86 | 2 |

- [ ] **Step 1: Add `Prisma.TransactionClient` import to each file**

Each file needs:
```typescript
import { Prisma } from '@pocketrealm/database';
```
(Or wherever the Prisma client is imported from — check existing import patterns.)

- [ ] **Step 2: Replace `tx: any` with `tx: Prisma.TransactionClient` in all 8 files**

Apply the same change at every location listed above. For functions that accept an optional transaction:
```typescript
// Before
function addGuildLog(guildId: string, ..., tx?: any)
// After
function addGuildLog(guildId: string, ..., tx?: Prisma.TransactionClient)
```

For `$transaction` callbacks:
```typescript
// Before
prisma.$transaction(async (tx: any) => { ... })
// After
prisma.$transaction(async (tx) => { ... })  // Prisma infers the type
```

- [ ] **Step 3: Fix `questShopService.ts` `item: any` parameters (lines 156, 203)**

Derive a typed interface from actual usage: read `applyEffect` and `applyBuff` to find all `item.*` property accesses, then define `ShopItemData` with those fields. Alternatively, use the Prisma-generated `ShopItem` type directly if it covers the accessed fields.

```typescript
// Read the file first — find all item.X accesses in applyEffect/applyBuff
// Then define the interface to cover exactly those fields:
type ShopItemData = Pick<ShopItem, 'key' | 'buffType' | 'buffValue' | 'buffUses' | /* ...all accessed fields */>;
```
Replace `item: any` with `item: ShopItemData` in `applyEffect` and `applyBuff`.

- [ ] **Step 4: Fix `buffService.ts` callback parameters (lines 17, 85)**

Replace `(b: any) =>` with the actual type from the Prisma query result:
```typescript
.map((b) => ({  // Let TypeScript infer from the findMany return type
```

- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck && npm run test:api
```

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(high): type all tx:any transaction parameters as Prisma.TransactionClient"
```

---

### Task 4: Fix `toMobTemplate` to Accept Prisma Types (High)

6 call sites double-cast Prisma results to pass into `toMobTemplate(raw: Record<string, unknown>)`.

**Files:**
- Modify: `apps/api/src/utils/routeHelpers.ts:182-189`
- Update callers: `routes/combat/start.ts` (2), `routes/exploration/start.ts` (2), `routes/zones.ts` (1), `services/trainingService.ts` (1)
- Also: `routes/bestiary.ts` (5 double-casts on mob template fields)

- [ ] **Step 1: Rewrite `toMobTemplate` to accept Prisma type and map to shared type**

In `apps/api/src/utils/routeHelpers.ts`, change the signature to accept `PrismaMobTemplate` and map every field from the shared `MobTemplate` interface. **Do not hardcode a field list** — read `packages/shared/src/types/combat.types.ts` to get the current `MobTemplate` fields and map each one. Key coercions needed:
- `spellPattern`: JSON → `SpellAction[]` (with `Array.isArray` guard)
- `damageType`: `string` → `DamageType`

```typescript
import type { MobTemplate as PrismaMobTemplate } from '@pocketrealm/database';
import type { MobTemplate, SpellAction, DamageType } from '@pocketrealm/shared';

// Map every field from the shared MobTemplate interface.
// Read combat.types.ts for the authoritative field list.
export function toMobTemplate(raw: PrismaMobTemplate): MobTemplate {
  return {
    id: raw.id,
    name: raw.name,
    // ... map ALL fields from the shared MobTemplate interface
    spellPattern: Array.isArray(raw.spellPattern)
      ? (raw.spellPattern as SpellAction[])
      : [],
    damageType: raw.damageType as DamageType,
  };
}
```

Note: callers in `bestiary.ts`, `combat/start.ts`, and `zones.ts` also access Prisma-only fields like `explorationTier`, `isBoss`, `accuracy` directly (not through `toMobTemplate`). Those accesses will work after Prisma regeneration without this function — Steps 3-5 handle them separately.

- [ ] **Step 2: Remove double-casts from all 6 callers**

Each caller changes from:
```typescript
toMobTemplate(mob as unknown as Record<string, unknown>)
```
To:
```typescript
toMobTemplate(mob)
```

Update files: `routes/combat/start.ts`, `routes/exploration/start.ts`, `routes/zones.ts`, `services/trainingService.ts`.

- [ ] **Step 3: Fix `bestiary.ts` double-casts on mob template/zone properties**

Lines 83, 89, 94, 124 — these access `explorationTier`, `accuracy`, `isBoss` etc. through double-casts. After Prisma regeneration, access these fields directly from the typed Prisma result.

- [ ] **Step 4: Fix `combat/start.ts` remaining double-casts (lines 730, 733, 747, 767)**

These access `spellPattern`, `explorationTiers`, `explorationTier` through double-casts. With proper Prisma types, access them directly and handle JSON parsing where needed.

- [ ] **Step 5: Fix `zones.ts` double-casts (lines 323, 327, 352)**

Same pattern — `explorationTiers` and mob template casts.

- [ ] **Step 6: Run typecheck and tests**

```bash
npm run typecheck && npm run test:api
```

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(high): rewrite toMobTemplate with Prisma types, remove double-casts"
```

---

### Task 5: Fix `as any` on Item Model Creates (High/Medium)

8+ services cast `item.create` data to `any`. After Prisma regeneration, the `Item` model exists on the client — but the `as any` may have been working around a field mismatch (e.g. `rarity` enum, `bonusStats` JSON). Fix each one.

**Files (8 services):**

| File | Line | Context |
|------|------|---------|
| `apps/api/src/services/inventoryService.ts` | 62 | `tx.item.create({ data: { ... } as any })` |
| `apps/api/src/services/lootService.ts` | 111 | Same pattern |
| `apps/api/src/services/pendingLootService.ts` | 93 | Same pattern |
| `apps/api/src/services/stashService.ts` | 59 | Same pattern |
| `apps/api/src/services/cacheLootService.ts` | 68 | Same pattern |
| `apps/api/src/services/dropRollingService.ts` | 86 | Same pattern |
| `apps/api/src/routes/crafting/craft.ts` | 217, 232 | `(tx as any).item.create({ data: { ... } as any })` |
| `apps/api/src/routes/crafting/salvage.ts` | 117, 304 | Same pattern |
| `apps/api/src/routes/crafting/forge.ts` | 141 | `data: { ... } as any` on update |

- [ ] **Step 1: Identify the actual type mismatch causing `as any` on item creates**

Read one of the affected files and try removing `as any`. The Prisma type error will reveal which fields don't match (likely `rarity` as string vs enum, `bonusStats` as object vs `Prisma.InputJsonValue`).

- [ ] **Step 2: Fix the type mismatch identified in Step 1**

Apply the specific fix revealed by the type error in Step 1 to the first file. Then verify it compiles.

- [ ] **Step 3: Apply the same fix pattern to all remaining files**

Use the fix from Step 2 across all files in the table above. Each file has the same `{ data: { ... } as any }` pattern — the fix is the same structural change (e.g., if the mismatch is `rarity`, cast it to the Prisma enum; if `bonusStats`, use `Prisma.InputJsonValue`).

- [ ] **Step 4: Fix `crafting/craft.ts` `resultTemplate: any` (line 69)**

This inline Prisma result cast propagates `any` to 10+ downstream accesses. Remove the cast and let Prisma infer the type from the query's `include` clause.

- [ ] **Step 5: Fix `crafting/recipes.ts` `resultTemplate: any` (line 56)**

Same pattern as craft.ts.

- [ ] **Step 6: Fix `crafting/helpers.ts` `(prisma as any).item.findUnique` (line 184)**

After regeneration, `prisma.item` exists. Remove `as any`.

- [ ] **Step 7: Fix `crafting/salvage.ts` — `item: any` in `SalvagePlan` + 4 explicit `any` annotations**

Type the `SalvagePlan` interface with the actual item shape. Remove `: any` from map/filter callbacks.

- [ ] **Step 8: Fix `crafting/salvage.ts` — `(item as any).isSoulbound` and `(item as any).inStash`**

If `getOwnedItem` doesn't include these fields, add them to the query's `select` clause.

- [ ] **Step 9: Run typecheck and tests**

```bash
npm run typecheck && npm run test:api
```

- [ ] **Step 10: Commit**

```bash
git commit -m "fix(high): remove as-any on item creates, type crafting results"
```

---

### Task 6: Fix `admin.ts` Prisma Cast (High)

**File:** `apps/api/src/routes/admin.ts:568`

- [ ] **Step 1: Remove `(prisma as any).playerQuestState.upsert`**

After Prisma regeneration, `prisma.playerQuestState` exists. Replace `(prisma as any)` with `prisma`.

- [ ] **Step 2: Run typecheck**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(high): remove prisma-as-any in admin route after client regeneration"
```

---

## Chunk 2: Business Logic Bugs

These are High-severity findings where incorrect behavior occurs at runtime — not just type safety issues.

### Task 7: Fix Silent Achievement Reward Loss

**File:** `apps/api/src/services/achievementService.ts:196-210`

**Bug:** When reward type is `'item'`, if `reward.itemTemplateId` is falsy or template doesn't exist, the reward is silently skipped. The `rewardClaimed` flag is already set to `true` (line 178), so the player permanently loses the reward.

- [ ] **Step 1: Write failing test**

```typescript
// Test: claimReward should throw when item template is missing
it('should throw AppError when reward item template does not exist', async () => {
  // Setup: achievement with item reward where itemTemplateId points to non-existent template
  await expect(
    achievementService.claimReward(playerId, achievementId)
  ).rejects.toThrow(AppError);
  // Verify: rewardClaimed should still be false
  const achievement = await prisma.playerAchievement.findFirst({ ... });
  expect(achievement?.rewardClaimed).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- --grep "reward item template"
```

- [ ] **Step 3: Fix — throw inside the transaction to trigger rollback**

The code sets `rewardClaimed = true` inside a `prisma.$transaction()` (line ~176). Throwing inside the transaction will automatically roll back the `rewardClaimed` update. Add validation that throws before attempting item creation:

```typescript
if (reward.type === 'item') {
  if (!reward.itemTemplateId) {
    throw new AppError('INVALID_REWARD', 'Achievement reward has no item template', 500);
  }
  const template = await tx.itemTemplate.findUnique({ where: { id: reward.itemTemplateId } });
  if (!template) {
    throw new AppError('INVALID_REWARD', `Item template ${reward.itemTemplateId} not found`, 500);
  }
  // ... create item using tx
}
```

The existing transaction wrapping means `rewardClaimed = true` is rolled back on throw — no need to reorder the update.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(high): prevent silent achievement reward loss when item template missing"
```

---

### Task 8: Fix Casino Lock Contention Returning Valid Result

**File:** `apps/api/src/services/casinoService.ts:105-113`

**Bug:** When another process holds the resolution lock, the polling fallback returns `0` — a valid roulette number. Players could see an incorrect result.

- [ ] **Step 1: Write failing test**

```typescript
it('should throw when resolution lock is contested', async () => {
  // Setup: simulate lock contention (mock Redis lock to return false)
  await expect(
    casinoService.resolveRound(roundId)
  ).rejects.toThrow(); // Should not return 0
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Fix — throw error instead of returning 0**

Replace the fallback that returns `0` with an error:
```typescript
throw new AppError('LOCK_CONTENTION', 'Round resolution in progress, retry later', 409);
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(high): casino lock contention no longer returns fake valid result"
```

---

### Task 9: Add Transaction Isolation to Boss Loot Distribution

**File:** `apps/api/src/services/bossLootService.ts:112-174`

**Bug:** If processing fails for contributor N, contributors 1..N-1 already received rewards while N+1..M get nothing. No transaction wraps the loop.

- [ ] **Step 1: Write failing test**

```typescript
it('should not distribute partial rewards if one contributor fails', async () => {
  // Setup: 3 contributors, mock item creation to fail on 2nd contributor
  // Verify: no contributor received rewards (all rolled back)
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Wrap contributor reward loop in a transaction**

Atomicity chosen over per-contributor error isolation because partial rewards with no UI feedback is worse than a retry. Set an explicit timeout since large contributor lists with multiple DB writes per contributor could exceed Prisma's default 5s timeout:

```typescript
await prisma.$transaction(async (tx) => {
  for (const contributor of contributors) {
    // ... distribute rewards using tx instead of prisma
  }
}, { timeout: 30000 }); // 30s — boss encounters can have many contributors
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(high): wrap boss loot distribution in transaction for atomicity"
```

---

### Task 10: Fix Guild Upgrade NaN Modifier Corruption

**File:** `apps/api/src/services/guildUpgradeService.ts:268,275,294`

**Bug:** The project perks path (line ~269) has an existing `if (key in mods)` guard, but the specialization bonuses path (line ~294) applies `effectType as keyof PlayerGuildModifiers` without validation. If a specialization effect type doesn't map to a valid modifier key (e.g., `'travel_cost_reduction'` vs `'travelCostReduction'`), `mods[key]` returns `undefined`, then `+= value` produces `NaN`.

- [ ] **Step 1: Write failing test**

```typescript
it('should not corrupt modifiers when specialization effectType has no matching modifier key', async () => {
  // Setup: guild specialization with an effectType that doesn't map to a PlayerGuildModifiers key
  // Verify: modifiers remain unchanged (no NaN values)
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add validated effectType-to-modifier mapping for specialization bonuses**

Create an explicit mapping from effect type strings to modifier keys, rather than relying on direct casting. Also audit `GUILD_SPECIALIZATION_DEFINITIONS` and `GUILD_PROJECT_DEFINITIONS` to verify all `effectType` values map to valid `PlayerGuildModifiers` keys.

```typescript
// Define valid mapping
const EFFECT_TO_MODIFIER: Record<string, keyof PlayerGuildModifiers> = {
  xp_bonus: 'xpBonus',
  loot_bonus: 'lootBonus',
  // ... map all valid effect types
};

const modKey = EFFECT_TO_MODIFIER[effectType];
if (!modKey) {
  logger.warn(`Unmapped guild specialization effect type: ${effectType}`);
  continue;
}
mods[modKey] += value;
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(high): validate guild upgrade effect type to prevent NaN modifier"
```

---

### Task 11: Fix Swallowed Errors

Two High-severity swallowed catches hide critical failures.

**Files:**
- `apps/api/src/services/bossEncounterService.ts:538-540` — empty catch in auto-signup
- `apps/api/src/routes/combat/start.ts:600-602` — empty catch in activity log creation

- [ ] **Step 1: Write test verifying error logging behavior**

```typescript
it('should log unexpected errors in boss auto-signup', async () => {
  // Setup: mock the signup to throw a non-INSUFFICIENT_TURNS error
  // Verify: logger.error was called (not silently swallowed)
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Fix bossEncounterService empty catch**

```typescript
// Before
catch { }
// After
catch (err) {
  if (err instanceof AppError && err.code === 'INSUFFICIENT_TURNS') {
    // Expected — player doesn't have enough turns, skip
  } else {
    logger.error('Boss auto-signup failed unexpectedly', { err, playerId });
  }
}
```

- [ ] **Step 4: Fix combat/start.ts empty catch**

```typescript
// Before
catch { fightLogIds = []; }
// After
catch (err) {
  logger.warn('Per-fight activity log creation failed', { err });
  fightLogIds = [];
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:api
```

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(high): log swallowed errors in boss auto-signup and combat logging"
```

---

## Chunk 3: Transaction Safety, Validation & Error Handling

### Task 12: Wrap Auth Registration in Transaction

**File:** `apps/api/src/routes/auth.ts:80-129`

**Bug:** Player created, then 5 sequential setup steps run outside transaction. If any fails, player exists but is incomplete. Retry fails with `USER_EXISTS` (409).

- [ ] **Step 1: Wrap the registration flow in `prisma.$transaction()`**

Move all 5 post-creation steps (`ensureEquipmentSlots`, `prisma.item.create`, `prisma.playerEquipment.upsert`, `ensureStarterDiscoveries`, `ensureStarterEncounterAndNodes`) inside the transaction that creates the player.

- [ ] **Step 2: Run registration E2E test**

```bash
npm run test:e2e -- --grep "register"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(medium): wrap auth registration in transaction for atomicity"
```

---

### Task 13: Wrap Admin Bot Creation in Transaction

**File:** `apps/api/src/routes/admin.ts:667-754`

**Bug:** 7+ sequential DB operations per bot. If any fails, orphaned partial records remain.

- [ ] **Step 1: Wrap bot creation in `prisma.$transaction()`**

- [ ] **Step 2: Test by verifying no partial records on failure**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(medium): wrap admin bot creation in transaction"
```

---

### Task 14: Fix blockService TOCTOU Race

**File:** `apps/api/src/services/blockService.ts`

**Bug:** Duplicate-block existence check runs outside transaction; concurrent calls can both pass.

- [ ] **Step 1: Use `upsert` or move check inside transaction**

```typescript
// Use upsert to atomically check + create
await prisma.playerBlock.upsert({
  where: { blockerId_blockedId: { blockerId, blockedId } },
  create: { blockerId, blockedId },
  update: {}, // no-op if exists
});
```

- [ ] **Step 2: Run tests**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(medium): eliminate TOCTOU race in block creation with upsert"
```

---

### Task 15: Add Zod Validation to Auth Endpoints

**File:** `apps/api/src/routes/auth.ts:211,272`

**Bug:** `/refresh` and `/logout` destructure `req.body` without Zod validation.

- [ ] **Step 1: Add schemas and parse**

```typescript
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

// In /refresh handler:
const { refreshToken } = refreshSchema.parse(req.body);

// In /logout handler:
const { refreshToken } = refreshSchema.parse(req.body);
```

- [ ] **Step 2: Run tests**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(medium): add Zod validation to auth /refresh and /logout"
```

---

### Task 16: Fix Boss Route String-Based Error Matching

**Files:**
- `apps/api/src/services/bossEncounterService.ts:191,193` — throws `new Error(...)` instead of `AppError`
- `apps/api/src/routes/boss.ts:186-191` — catches with `err.message.includes(...)` string matching

**Bug:** `err.message.includes('not found')` and `err.message.includes('already over')` — brittle if service changes wording. Root cause: the service throws generic `Error` instead of `AppError`.

- [ ] **Step 1: Update `bossEncounterService.ts` to throw `AppError` with status codes**

Replace `throw new Error('...')` at lines 191 and 193 with `throw new AppError('NOT_FOUND', '...', 404)` and `throw new AppError('ENCOUNTER_ENDED', '...', 410)`.

- [ ] **Step 2: Simplify the boss route catch block**

In `boss.ts`, replace string matching with:
```typescript
catch (err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  throw err;
}
```

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(medium): use AppError codes instead of string matching in boss route"
```

---

### Task 17: Add Error Isolation to Event Scheduler

**File:** `apps/api/src/services/eventSchedulerService.ts`

**Bug:** If any step in the scheduler tick throws, subsequent steps are skipped.

- [ ] **Step 1: Wrap each step in try/catch with logging**

```typescript
async function tick() {
  for (const step of [checkExpiredEvents, checkBossSpawns, ...]) {
    try {
      await step();
    } catch (err) {
      logger.error(`Scheduler step ${step.name} failed`, { err });
    }
  }
}
```

- [ ] **Step 2: Run tests**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(medium): add error isolation to event scheduler tick"
```

---

### Task 18: Add JSON Column Validation Schemas

Multiple services cast JSON columns without runtime validation. Add Zod schemas for the most critical ones.

**Files:**

| File | Column | Current cast |
|------|--------|-------------|
| `services/consumableService.ts` | `consumableEffect` | `as ConsumableEffect \| null` |
| `services/potionService.ts` | `consumableEffect` | `as ConsumableEffect \| null` |
| `services/guildProjectService.ts` | `materialsProgress` | `as Record<string, number>` (5x) |
| `services/skillPointService.ts` | `allocations` | `as Record<string, number>` (4x) |
| `services/bossEncounterService.ts` | `roundSummaries`, `activeEffects`, `rewards` | `as BossRoundSummary[]` (L60), `as Record<string, BossPlayerReward>` (L63), `as BossActiveEffect[]` (L72), double-casts (L390, L423) |
| `services/expeditionService.ts` | `roomDefinitions`, `roundSummaries`, `activeEffects` | `as unknown as T` at L87, L95, L125, L169, L475, L704, L730, L803, L960, L1019, L1151, L1480, L1534 |
| `routes/combat/logs.ts` | combat log JSON | 7+ casts |
| `services/casinoService.ts` | Redis JSON | 5x `JSON.parse` without validation (L73, L84, L193, L229, L257) |
| `services/pendingLootService.ts` | Redis JSON | 2x `JSON.parse` without validation (L56, L70) |

- [ ] **Step 1: Create shared Zod schemas for common JSON column shapes**

Add to `packages/shared/src/schemas/` (or wherever schemas live):
```typescript
export const consumableEffectSchema = z.object({
  type: z.string(),
  value: z.number(),
  duration: z.number().optional(),
}).nullable();

export const materialsProgressSchema = z.record(z.string(), z.number());
```

- [ ] **Step 2: Replace raw casts with `schema.parse()` in consumableService and potionService**

- [ ] **Step 3: Replace raw casts in guildProjectService and skillPointService**

- [ ] **Step 4: Replace raw casts in bossEncounterService**

5 cast locations: `BossRoundSummary[]` (L60), `Record<string, BossPlayerReward>` (L63), `BossActiveEffect[]` (L72), and double-casts at L390 and L423. Parse with Zod or at minimum add `Array.isArray` guards.

- [ ] **Step 5: Replace raw casts in expeditionService**

13 cast locations across `roomDefinitions`, `roundSummaries`, and `activeEffects`. Use `.safeParse()` to avoid throwing on malformed data — log a warning and use sensible defaults instead.

- [ ] **Step 6: Replace raw casts in combat/logs.ts**

Parse the combat log JSON once at the top of the transformation function.

- [ ] **Step 7: Wrap `JSON.parse` calls from Redis in try/catch in casinoService and pendingLootService**

Redis data can be corrupted or missing. Wrap each `JSON.parse` in try/catch with fallback behavior:
```typescript
let parsed: T;
try { parsed = schema.parse(JSON.parse(raw)); }
catch { parsed = defaultValue; }
```

- [ ] **Step 8: Run tests**

```bash
npm run test:api
```

- [ ] **Step 9: Commit**

```bash
git commit -m "fix(medium): add Zod validation for JSON column parsing and Redis JSON"
```

---

### Task 19: Fix Remaining Medium Findings

**Sweep task** — apply the following fixes:

| File | Finding | Fix |
|------|---------|-----|
| File | Finding | Fix |
|------|---------|-----|
| `activityLogService.ts` | Overly broad `string` for `activityType` | Use union type from constants |
| `activityLogService.ts` | `as Prisma.InputJsonValue` on unknown param | Type parameter directly |
| `combatOrchestrationService.ts` | `unknown[]` for 6 CombatLogResultParams fields | Type with actual interfaces |
| `friendMailService.ts` | 6x `as MailRow` casts | Use Prisma inferred type |
| `stashService.ts` | `as unknown as void` double-casts on tx returns | Fix return type |
| `expeditionLootService.ts` | Unused `totalRooms` parameter | Remove parameter |
| `admin.ts` | `Record<string, unknown>` for player update | Use `Prisma.PlayerUpdateInput` |
| `zones.ts` | `Record<string, unknown>` for player update | Use `Prisma.PlayerUpdateInput` |
| `crafting/forge.ts` | `data: { ... } as any` on item update | Remove `as any`, fix rarity type |
| `guildService.ts` | 3 `(m: any) =>` callbacks | Remove `: any` |
| `achievementService.ts` | Unvalidated `statKey` — fix type at source in `AchievementDef` | Change `statKey: string` to `statKey: StatKey \| undefined` |
| `achievementService.ts` | TOCTOU race in `checkAchievements` (L82-84) | Use `upsert` or `createMany` with `skipDuplicates: true` |
| `combatHelpers.ts` (game-engine) | `actionDefinitions` as `Record<string, unknown>` | Type as `Record<string, ActionDefinition>` |
| `expedition.types.ts` | `RaidParticipant.condition?: unknown` | Type as `SlotCondition` |
| `expedition.types.ts` | `RaidParticipant.actionDefinitions` | Type as `Record<string, ActionDefinition>` |
| `attributesService.ts` | `as Record<string, unknown>` cast (L21) | Use Prisma inferred type |
| `bossEncounterService.ts` | Status string casts without validation (L75, L120, L385) | Add runtime validation |
| `bossEncounterService.ts` | Non-null assertion on array access (L318) | Add fallback/guard |
| `bossLootService.ts` | `as SkillType` cast without validation (L143) | Add runtime validation |
| `bossLootService.ts` | Redundant `as` casts on Prisma results (L33-38, L48) | Remove casts |
| `guildContractService.ts` | `const created: any[] = []` explicit any array (L54) | Type as the `create` return type |
| `expeditionService.ts` | `io: unknown` parameter type (L713, L794) | Type as `Server \| null` |
| `expeditionService.ts` | `exp.status as ExpeditionStatus` cast (L101) | Add runtime validation |
| `zoneDiscoveryService.ts` | Untyped JSON for `mobs` in `encounterSite.create` (L118) | Define interface for mob JSON shape |
| `casinoService.ts` | `betType as RouletteBetType` casts (L124, L125, L162, L296) | Add runtime validation or derive from shared type |

- [ ] **Step 1: Fix `activityLogService.ts` — type activityType + InputJsonValue param**
- [ ] **Step 2: Fix `combatOrchestrationService.ts` — type CombatLogResultParams fields**
- [ ] **Step 3: Fix `friendMailService.ts` — remove MailRow casts**
- [ ] **Step 4: Fix `stashService.ts` — fix void return casts**
- [ ] **Step 5: Fix `expeditionLootService.ts` — remove unused `totalRooms` param**
- [ ] **Step 6: Fix `admin.ts` + `zones.ts` — use `Prisma.PlayerUpdateInput`**
- [ ] **Step 7: Fix `crafting/forge.ts` — remove `as any` on item update**
- [ ] **Step 8: Fix `guildService.ts` — remove `: any` from callbacks**
- [ ] **Step 9: Fix `achievementService.ts` — fix statKey type at source + TOCTOU race**
- [ ] **Step 10: Fix `combatHelpers.ts` + `expedition.types.ts` — type actionDefinitions/condition**
- [ ] **Step 11: Fix `attributesService.ts` — remove Record<string, unknown> cast**
- [ ] **Step 12: Fix `bossEncounterService.ts` — status casts + non-null assertion**
- [ ] **Step 13: Fix `bossLootService.ts` — SkillType cast + redundant casts**
- [ ] **Step 14: Fix `guildContractService.ts` — type `created` array**
- [ ] **Step 15: Fix `expeditionService.ts` — type `io` param + status cast**
- [ ] **Step 16: Fix `zoneDiscoveryService.ts` — define mob JSON interface**
- [ ] **Step 17: Fix `casinoService.ts` — validate betType casts at service level**
- [ ] **Step 18: Run typecheck and tests**

```bash
npm run typecheck && npm run test:api && npm run test:engine
```

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(medium): address remaining medium-severity type and validation findings"
```

---

## Chunk 4: Dead Code, Unused Exports & Low Severity

### Task 20: Remove Dead Code

| File | Dead code | Action |
|------|-----------|--------|
| `routes/combat.ts` | Entire file — unused barrel re-export | Delete file |
| `game-engine/events/applyEventModifiers.ts` | `computeResourceYieldMultiplier` | Remove function (completely unused) |
| `game-engine/events/applyEventModifiers.ts` | `applyResourceEventModifiers` only in tests | Remove function AND its tests (testing dead code) |
| `game-engine/combat/damageCalculator.ts` | `doesAttackHit` legacy wrapper | Remove function AND update tests to use replacement |
| `shared/constants/expeditionDefinitions.ts` | 6 unused generic mob templates | Remove constants |
| `shared/types/combatAction.types.ts` | `CombatTemplateAction` deprecated | Remove interface |
| `shared/types/combatAction.types.ts` | `CombatResourceState` duplicate | Remove (local version exists in resourceService) |
| `services/resourceService.ts` | `setStamina`, `setMana` dead code | Remove functions |
| `routes/exploration/helpers.ts` | `getEncounterRange` never used | Remove function |

- [ ] **Step 1: Delete `routes/combat.ts` barrel file**
- [ ] **Step 2: Remove dead functions from game-engine files**
- [ ] **Step 3: Remove dead types/constants from shared package**
- [ ] **Step 4: Remove dead service functions**
- [ ] **Step 5: Remove dead route helpers**
- [ ] **Step 6: Run typecheck and tests to verify nothing breaks**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 7: Commit**

```bash
git commit -m "chore(low): remove dead code identified by health audit"
```

---

### Task 21: Remove Unused Exports (Sweep)

50+ symbols are exported but never imported externally (only used internally or in tests).

**Strategy:** Remove `export` keyword from each. If only tests import them, either:
- Keep `export` (acceptable for test access)
- Use `@internal` JSDoc annotation

**Services (remove export):**

| File | Symbol |
|------|--------|
| `buffService.ts` | `CombatBuffRemainingUses` |
| `cacheLootService.ts` | `CacheMaterialDrop`, `CacheLootResult`, `rollRarityWithLuck` |
| `chestService.ts` | `RecipeUnlockReward`, `EncounterSiteChestRewards` |
| `combatLogMapper.ts` | `MappedCombatFields` |
| `combatStatsService.ts` | `attackSkillFromRequiredSkill` |
| `combatTemplateService.ts` | `CreateSlotInput`, `validateTemplateSlots` |
| `durabilityService.ts` | `countCombatHits` |
| `equipmentService.ts` | `isSkillType` |
| `expeditionBestiaryService.ts` | `ExpeditionBestiaryResponse` |
| `bossBestiaryService.ts` | `WorldBossBestiaryResponse` |
| `leaderboardService.ts` | `LeaderboardEntry`, `LeaderboardResponse` |
| `consumableService.ts` | `UseConsumableResult` |
| `expeditionLootService.ts` | `ExpeditionLootDrop` |
| `guildMembershipService.ts` | `JoinRequestData` |
| `guildService.ts` | `calculateXpForLevel` |
| `repairService.ts` | `RepairEquippedResult` |
| `combatOrchestrationService.ts` | 6 exported symbols |
| `pvpService.ts` | `computeBracketBounds` |
| `resourceService.ts` | `CombatResourceState`, `RestResourceResult` |
| `trainingService.ts` | `TrainingCombatResult` |

**Routes (remove export):**

| File | Symbol |
|------|--------|
| `combat/helpers.ts` | `attackSkillSchema`, `roleOrder`, `getNextEncounterMob`, `getNextEncounterMobInRoom`, `getMaxRoom` |
| `exploration/helpers.ts` | `pickFamilyMemberByRole`, `NarrativeEventType`, `EncounterMobRole`, `EncounterMobStatus` |
| `crafting/helpers.ts` | `isItemRarity`, `SacrificialItemMatch` |

**Shared types (keep exported — they're public API even if currently unused):**
- Most shared type exports are intentionally public. Skip these unless they're clearly internal.

**Game-engine (test-only exports — keep or annotate):**

| File | Symbols |
|------|---------|
| `craftingCrit.ts` | `calculateCritChance`, `calculateRareCraftChance`, `calculateEpicCraftChance`, `CraftingCritRolls`, `CalculateCraftingCritInput` |
| `probabilityModel.ts` | 5 type exports |
| `gatheringCrit.ts` | 4 exports |
| `itemRarity.ts` | 5 exports |
| `xpCalculator.ts` | `xpToNextLevel`, `getWindowIndex` |
| `turnCalculator.ts` | `calculateAccruedTurns`, `isValidTurnAmount` |

- [ ] **Step 1: Remove `export` from service internal-only symbols**
- [ ] **Step 2: Remove `export` from route internal-only symbols**
- [ ] **Step 3: Leave shared type exports as-is (public API)**
- [ ] **Step 4: Leave game-engine test-only exports as-is (test access)**
- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 6: Commit**

```bash
git commit -m "chore(low): remove unnecessary exports from services and routes"
```

---

### Task 22: Fix Fire-and-Forget Error Swallowing

10+ locations use `.catch(() => {})` on `trackProgress` and similar calls.

**Files:**

| File | Lines | Call |
|------|-------|------|
| `routes/boss.ts` | 182 | `trackProgress` |
| `routes/casino.ts` | 61-62 | `trackProgress` (2x) |
| `routes/pvp.ts` | 100, 113, 116 | `trackProgress` (3x) |
| `routes/zones.ts` | 257, 666 | `trackProgress` (2x) |
| `services/sparService.ts` | 126 | `sendSparResultMail` |
| `services/progressService.ts` | varies | contract promise (redundant with `allSettled`) |
| `services/eventSchedulerService.ts` | varies | expired event notification |

- [ ] **Step 1: Replace all `.catch(() => {})` with `.catch(err => logger.warn(...))`**

Pattern:
```typescript
// Before
void trackProgress(playerId, 'boss_kills', 1).catch(() => {});
// After
void trackProgress(playerId, 'boss_kills', 1).catch(err =>
  logger.warn('trackProgress failed', { err, playerId, metric: 'boss_kills' })
);
```

- [ ] **Step 2: Fix progressService — remove redundant `.catch` inside `Promise.allSettled`**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(low): log errors in fire-and-forget calls instead of swallowing"
```

---

### Task 23: Clean Up Redundant Type Casts

**Low severity sweep** — remove casts that are unnecessary or add proper runtime validation.

**Redundant Prisma field casts (remove):**

| File | Lines | Cast | Reason |
|------|-------|------|--------|
| `combat/start.ts` | 93,106,182,482,523 | `as string` on non-nullable fields | Fields are required, cast unnecessary |
| `expedition.ts` | 85 | `as string[]` on status filter | Prisma pattern, acceptable |
| `equipment.ts` | 43, 61 | `as EquipmentSlot` after Zod | Zod-validated, cast safe |
| `casino.ts` | 59 | `as RouletteBetType` after Zod | Zod-validated, cast safe |

**String-to-union casts (add runtime validation for high-traffic paths):**

| File | Lines | Cast |
|------|-------|------|
| `chatService.ts` | varies | `as ChatChannelType`, `as ChatMessageType` |
| `guildService.ts` | 74, 77, 91 | `as GuildRecruitmentMode`, `as GuildSpecialization`, `as GuildRole` |
| `sellService.ts` | varies | `as ItemRarity` |
| `inventoryService.ts` | varies | `as ItemRarity` |
| `progressService.ts` | varies | `as GuildContractType` |

- [ ] **Step 1: Remove redundant `as string` casts on non-nullable Prisma fields**
- [ ] **Step 2: Remove or document acceptable Zod-validated casts**
- [ ] **Step 3: Add runtime validation for string-to-union casts on high-traffic paths (optional)**
- [ ] **Step 4: Remove ~40 redundant `as BossTemplateAction[]` casts in `expeditionDefinitions.ts`**
- [ ] **Step 5: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 6: Commit**

```bash
git commit -m "chore(low): clean up redundant type casts across codebase"
```

---

### Task 24: Remaining Low-Severity Findings

**Sweep task** for miscellaneous low findings:

| File | Finding | Fix |
|------|---------|-----|
| `combatOrchestrationService.ts` | `guildXpBoost \|\| undefined` converts 0 to undefined | Change to `?? undefined` |
| `chatService.ts` | `channelType: string` parameter | Narrow to `ChatChannelType` |
| `combatLogMapper.ts` | Misleading `as T & MappedCombatFields` on early return | Fix cast |
| `turnBankService.ts` | `RefundTurnsResult` not exported (inconsistent) | Export it |
| `staminaCalculator.ts` | `StaminaCalculationInput` exported but unused | Remove export |
| `expedition/roomGenerator.ts` | `MobPoolEntry` deprecated/unused | Remove interface |
| `expedition/roomGenerator.ts` | 4 `as BossTemplateAction[]` casts | Fix with proper typing |
| `combat/logs.ts` | ~70-line duplicated SQL SELECT | Extract shared SQL |
| `blockService.ts` | Two `deleteMany` calls combinable | Combine with OR |

- [ ] **Step 1: Apply mechanical fixes**
- [ ] **Step 2: Extract shared SQL in combat/logs.ts**
- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(low): address remaining low-severity audit findings"
```

---

## Execution Strategy

### Branch Structure

Each phase should be its own branch, merged sequentially:

| Branch | Phase | Tasks | Est. findings fixed |
|--------|-------|-------|-------------------|
| `fix/code-health-prisma-types` | Chunk 1 | Tasks 1-6 | ~120 (9C, ~20H, ~10M) |
| `fix/code-health-logic-bugs` | Chunk 2 | Tasks 7-11 | ~8 (5H, 1M) |
| `fix/code-health-transactions` | Chunk 3 | Tasks 12-19 | ~50 (30M) |
| `fix/code-health-cleanup` | Chunk 4 | Tasks 20-24 | ~50 (140L) |

### Dependencies

- **Chunk 1 MUST go first** — it regenerates Prisma and removes the `as any` casts that block type checking everywhere.
- Chunks 2, 3, 4 are independent of each other and can be parallelized after Chunk 1 merges.

### Verification

After each branch merges:
```bash
npm run typecheck && npm run test && npm run lint
```
