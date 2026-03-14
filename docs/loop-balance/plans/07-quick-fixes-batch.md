# Plan 07: Quick Fixes Batch

## Goal

Ship 14 independent small fixes in a single PR. Each is a constant change, dead code deletion, or small code tweak. They are numbered below for tracking but have no ordering dependency.

---

## Changes

### 1. Extract defence scaling constant (#15)

**File:** `packages/shared/src/constants/gameConstants.ts`

Add a new key to `COMBAT_CONSTANTS`:

```
DEFENCE_SCALING_FACTOR: 100,
```

**File:** `packages/game-engine/src/combat/damageCalculator.ts` (line 155)

Current code:

```ts
return safeDefence / (safeDefence + 100);
```

Replace with:

```ts
import { COMBAT_CONSTANTS } from '@pocketrealm/shared';
// ...
return safeDefence / (safeDefence + COMBAT_CONSTANTS.DEFENCE_SCALING_FACTOR);
```

Check the file's existing imports first -- `COMBAT_CONSTANTS` may already be imported. If so, just add the reference; don't duplicate the import.

---

### 2. Casino MAX_BETS_PER_ROUND (#26)

**File:** `packages/shared/src/constants/gameConstants.ts` (line ~1296)

Add to `CASINO_CONSTANTS`:

```
MAX_BETS_PER_ROUND: 12,
```

**File:** `apps/api/src/services/casinoService.ts` -- `placeBet` function (line ~302)

After the betting window check (line ~318) and before the `$transaction` block (line ~320), add a bet count check:

```ts
const existingBetCount = await prisma.rouletteBet.count({
  where: { roundId, playerId },
});
if (existingBetCount >= CASINO_CONSTANTS.MAX_BETS_PER_ROUND) {
  throw new AppError(400, 'Maximum bets per round reached', 'MAX_BETS_REACHED');
}
```

Make sure `CASINO_CONSTANTS` is already imported from `@pocketrealm/shared` (it is -- line 2).

---

### 3. Small chest recipe chance (#32)

**File:** `packages/shared/src/constants/gameConstants.ts` (line 158)

Change:

```
CHEST_RECIPE_CHANCE_SMALL: 0,
```

To:

```
CHEST_RECIPE_CHANCE_SMALL: 0.005,
```

---

### 4. Hidden cache chance doubled (#36)

**File:** `packages/shared/src/constants/gameConstants.ts` (line 144)

Change:

```
HIDDEN_CACHE_CHANCE: 0.0001,
```

To:

```
HIDDEN_CACHE_CHANCE: 0.0002,
```

---

### 5. Exploration turn bounds (#38)

**File:** `packages/shared/src/constants/gameConstants.ts` (lines 151-152)

Change:

```
MIN_EXPLORATION_TURNS: 10,
MAX_EXPLORATION_TURNS: 10_000,
```

To:

```
MIN_EXPLORATION_TURNS: 100,
MAX_EXPLORATION_TURNS: 2_500,
```

---

### 6. Boss free-rider floor (#59)

**File:** `apps/api/src/services/bossLootService.ts` (lines 116 and 143)

There are two occurrences of `Math.max(0.5, ...)` that clamp the contribution floor:

Line 116:
```ts
const dropMultiplier = Math.max(0.5, Math.min(2, ratio * contributors.length));
```

Line 143:
```ts
const scaledXp = Math.round(baseXp * Math.max(0.5, Math.min(2, ratio * contributors.length)));
```

Change `0.5` to `0.25` in both lines.

Also add a constant to `WORLD_EVENT_CONSTANTS` in `gameConstants.ts`:

```
BOSS_CONTRIBUTION_FLOOR: 0.25,
```

Then reference it in both lines instead of the hardcoded value:

```ts
const dropMultiplier = Math.max(WORLD_EVENT_CONSTANTS.BOSS_CONTRIBUTION_FLOOR, Math.min(2, ratio * contributors.length));
```

and

```ts
const scaledXp = Math.round(baseXp * Math.max(WORLD_EVENT_CONSTANTS.BOSS_CONTRIBUTION_FLOOR, Math.min(2, ratio * contributors.length)));
```

Make sure `WORLD_EVENT_CONSTANTS` is already imported in `bossLootService.ts` (it is -- line 3).

Update the test file `apps/api/src/services/bossLootService.test.ts` -- the test comments reference `max(0.5, ...)`. Update expected values:
- Line 76 comment: `max(0.5, ...)` becomes `max(0.25, ...)`
- Line 128-132: The p2 case `ratio = 100/400 = 0.25, multiplier = max(0.5, ...) = 0.5` now becomes `max(0.25, ...) = 0.5` (still 0.5 since `0.25*2 = 0.5`). This test still passes unchanged.
- Check `apps/api/src/services/expeditionLootService.test.ts` and `apps/api/src/services/expeditionLootService.ts` for the same `0.5` floor -- if expedition loot uses the same pattern, decide whether to apply there too or leave it (the plan scope is boss loot only).

---

### 7. Delete BOSS_SINGLE_TARGET_DAMAGE_BY_TIER (#60)

**File:** `packages/shared/src/constants/gameConstants.ts` (line 722)

Remove:

```
BOSS_SINGLE_TARGET_DAMAGE_BY_TIER: [30, 60, 100, 160, 250] as readonly number[],
```

Confirmed dead code -- only referenced in its own definition. No other file imports or uses it.

---

### 8. BIG_WIN_THRESHOLD (#68)

**File:** `packages/shared/src/constants/gameConstants.ts` (line 1295)

Change:

```
BIG_WIN_THRESHOLD: 500,
```

To:

```
BIG_WIN_THRESHOLD: 2001,
```

---

### 9. Delete dead potion constants (#70, #71)

**File:** `packages/shared/src/constants/gameConstants.ts` (lines 594-603)

Remove these four entries from `POTION_CONSTANTS`:

```
/** HP percentage restored by Minor Recovery Potion */
MINOR_RECOVERY_PERCENT: 0.25,

/** HP percentage restored by Recovery Potion */
RECOVERY_PERCENT: 0.5,

/** HP percentage restored by Greater Recovery Potion */
GREATER_RECOVERY_PERCENT: 1.0,

/** Rounds of Potion Sickness cooldown after auto-potion use */
AUTO_POTION_SICKNESS_DURATION: 5,
```

- `AUTO_POTION_SICKNESS_DURATION` (5) conflicts with the canonical `POTION_SICKNESS_ROUNDS: 4` in `COMBAT_ACTION_CONSTANTS` (line 507). Only the latter is used in code.
- `MINOR_RECOVERY_PERCENT`, `RECOVERY_PERCENT`, `GREATER_RECOVERY_PERCENT` are orphaned -- no items exist that use percentage-based healing. Only referenced in their own definition and a sanity test.

**File:** `packages/shared/src/constants/gameConstants.test.ts` (lines 179-184)

Delete the test that asserts these constants increase with tier:

```ts
it('recovery percents increase with tier', () => {
  expect(POTION_CONSTANTS.MINOR_RECOVERY_PERCENT)
    .toBeLessThan(POTION_CONSTANTS.RECOVERY_PERCENT);
  expect(POTION_CONSTANTS.RECOVERY_PERCENT)
    .toBeLessThan(POTION_CONSTANTS.GREATER_RECOVERY_PERCENT);
});
```

---

### 10. Delete dead world event constants (#80)

**File:** `packages/shared/src/constants/gameConstants.ts` (lines 690-691)

Remove from `WORLD_EVENT_CONSTANTS`:

```
HEALER_MAGIC_SCALING: 0.02,
ATTACKER_TURN_SCALING: 0.001,
```

Confirmed dead code -- only referenced in their own definition. No other file imports or uses them.

---

### 11. Persisted mob regen ceil (#81)

**File:** `packages/game-engine/src/combat/persistedMobRegen.ts` (line 16)

Change:

```ts
const regenAmount = Math.floor(maxHp * regenPercent / 100);
```

To:

```ts
const regenAmount = Math.ceil(maxHp * regenPercent / 100);
```

This ensures mobs with very low maxHP (e.g., 10 HP) still regenerate at least 1 HP per tick instead of rounding down to 0.

**File:** `packages/game-engine/src/combat/persistedMobRegen.test.ts`

Review existing tests. Any test that asserts `Math.floor` behavior for low-HP mobs may need updating. If there's a test with a small maxHP value, update the expected value to reflect `Math.ceil`.

---

### 12. Hidden cache fallback reward (#89)

**File:** `apps/api/src/services/cacheLootService.ts`

Currently in `grantCacheLootTx`, when `cutGemTemplateIds` is empty (no material pool) AND the soulbound roll at line 163 fails (random >= `SOULBOUND_DROP_CHANCE`), the player gets nothing.

Add a fallback after the soulbound item section (after line 222, before the return):

When `materials.length === 0 && soulboundItem === null`:
1. Query soulbound recipes from the same zone's mob families, expanding to lower-tier zones if none found
2. Pick one at random
3. Roll rarity with `rollRarityWithLuck(params.luck)`
4. Grant the item (respecting slot overflow like the existing soulbound logic)

Sketch:

```ts
if (materials.length === 0 && soulboundItem === null) {
  // Fallback: grant a soulbound item from this zone's mob families
  const fallbackRecipes = await (txAny as any).craftingRecipe.findMany({
    where: {
      soulbound: true,
      mobFamily: {
        familyMembers: {
          some: {
            mobTemplate: {
              zoneSpawns: { some: { zoneId: params.zoneId } },
            },
          },
        },
      },
    },
    select: {
      resultTemplateId: true,
      resultTemplate: { select: { name: true, itemType: true, stackable: true, maxDurability: true } },
    },
  });

  if (fallbackRecipes.length > 0) {
    const picked = fallbackRecipes[randomIntInclusive(0, fallbackRecipes.length - 1)]!;
    const rarity = rollRarityWithLuck(params.luck);
    // ... grant item using same logic as existing soulbound block (lines 182-220)
  }
}
```

The exact Prisma query depends on the schema relations. Check `docs/reference/database-schema.md` for the `MobTemplate -> ZoneSpawn -> Zone` chain. The intent is: find soulbound recipes tied to mob families whose mobs spawn in this zone.

If no recipes are found for the current zone, optionally fall back to any zone in the same or lower tier. This can be a follow-up if the query is too complex.

---

### 13. Hidden cache legendary rarity (#90)

**File:** `packages/shared/src/constants/gameConstants.ts` (lines 760-765)

Change the `RARITY_WEIGHTS` in `HIDDEN_CACHE_CONSTANTS` from:

```ts
RARITY_WEIGHTS: {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 5,
},
```

To:

```ts
RARITY_WEIGHTS: {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 5,
  legendary: 1,
},
```

**File:** `apps/api/src/services/cacheLootService.ts` -- `rollRarityWithLuck` function (line 20)

Update the function's return type to include `'legendary'` and add the legendary weight to the roll calculation:

```ts
export function rollRarityWithLuck(luck: number): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' {
  const { RARITY_WEIGHTS, LUCK_RARITY_SCALING } = HIDDEN_CACHE_CONSTANTS;
  const luckBonus = luck * LUCK_RARITY_SCALING;
  const commonWeight = Math.max(5, RARITY_WEIGHTS.common - luckBonus * 100);
  const uncommonWeight = RARITY_WEIGHTS.uncommon + luckBonus * 30;
  const rareWeight = RARITY_WEIGHTS.rare + luckBonus * 40;
  const epicWeight = RARITY_WEIGHTS.epic + luckBonus * 30;
  const legendaryWeight = RARITY_WEIGHTS.legendary;

  const total = commonWeight + uncommonWeight + rareWeight + epicWeight + legendaryWeight;
  const roll = Math.random() * total;

  if (roll < commonWeight) return 'common';
  if (roll < commonWeight + uncommonWeight) return 'uncommon';
  if (roll < commonWeight + uncommonWeight + rareWeight) return 'rare';
  if (roll < commonWeight + uncommonWeight + rareWeight + epicWeight) return 'epic';
  return 'legendary';
}
```

Note: The `HIDDEN_CACHE_CONSTANTS` is declared `as const`, so the type of `RARITY_WEIGHTS` will gain a `legendary` property. Check that no downstream code narrows on the exact keys.

---

### 14. Luck attribute tooltip (#10)

**File:** `apps/web/src/components/screens/Dashboard.tsx` (line 59)

Change:

```ts
luck: { label: 'Luck', description: 'Crits and drops', icon: Dice5, color: 'var(--rpg-gold)' },
```

To:

```ts
luck: { label: 'Luck', description: 'Crafting, gathering, and forging (no combat effect)', icon: Dice5, color: 'var(--rpg-gold)' },
```

This makes it clear that luck does NOT affect combat outcomes -- it only improves crafting crit chance, gathering yields, gem crit chance, and forge success rate.

---

## Files Modified (Summary)

| # | File | Type of change |
|---|------|----------------|
| 1, 2, 3, 4, 5, 7, 8, 9, 10, 13 | `packages/shared/src/constants/gameConstants.ts` | Constant add/change/delete |
| 9 | `packages/shared/src/constants/gameConstants.test.ts` | Delete dead test |
| 1 | `packages/game-engine/src/combat/damageCalculator.ts` | Use constant instead of magic number |
| 11 | `packages/game-engine/src/combat/persistedMobRegen.ts` | `Math.floor` -> `Math.ceil` |
| 11 | `packages/game-engine/src/combat/persistedMobRegen.test.ts` | Update expected values |
| 2 | `apps/api/src/services/casinoService.ts` | Bet count enforcement |
| 6 | `apps/api/src/services/bossLootService.ts` | Lower contribution floor |
| 6 | `apps/api/src/services/bossLootService.test.ts` | Update comments/expectations |
| 12 | `apps/api/src/services/cacheLootService.ts` | Fallback reward + legendary rarity |
| 14 | `apps/web/src/components/screens/Dashboard.tsx` | Tooltip text |

---

## Build and Test

1. Run `npm run build` -- ensures all constant changes propagate through `packages/shared` to downstream packages.
2. Run `npm run typecheck` -- catches any type errors from deleted constants or changed types (especially legendary rarity addition).
3. Run `npm run test:engine` -- validates defence extraction (#1), persisted mob regen (#11).
4. Run `npm run test:api` -- validates casino bet limit (#2), boss loot floor (#6), cache fallback (#12), deleted constant references.
5. Manual/functional testing for:
   - **Casino bet limit (#2):** Place 12 bets in one round, verify 13th is rejected with `MAX_BETS_REACHED`.
   - **Persisted mob regen (#11):** Find a mob with low maxHP (< 100), damage it, wait, confirm it heals at least 1 HP.
   - **Cache fallback (#12):** Test in a zone where the material pool is empty (no resource nodes) -- verify the player receives a soulbound item instead of nothing.
   - **Exploration bounds (#5):** Try to start explorations with < 100 turns and > 2500 turns, verify rejection.

---

## Risks and Notes

- **Exploration bounds (#5):** Changing `MIN_EXPLORATION_TURNS` from 10 to 100 is a 10x increase. Players who currently explore in short bursts (10-99 turns) will be blocked. This is intentional per the balance plan.
- **MAX_EXPLORATION_TURNS (#5):** Dropping from 10,000 to 2,500 will reject any exploration request above 2,500 turns. Verify the frontend exploration UI enforces these bounds client-side too, or players will see confusing errors.
- **Boss floor (#6):** Lowering from 0.5 to 0.25 means free-riders get half the previous minimum loot. The expedition loot service (`expeditionLootService.ts`) has the same `0.5` floor but is out of scope for this fix -- consider applying it there in a follow-up if desired.
- **Legendary rarity (#13):** Adding a new rarity tier to hidden caches means the granted item must have a valid `legendary` rarity in the database. Verify the `rarity` column on the `Item` model accepts `'legendary'` as a value.
- **Dead code deletion (#7, #9, #10):** These are confirmed unused beyond their own definitions (and one test for #9). Safe to remove.
