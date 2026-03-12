# Boss Rewards System

## Context

Boss fights currently grant loot silently via `distributeBossLoot()`, but the result is discarded — players never see what they got. Bosses also only drop the same items as regular mobs (wolf pelts, sprite dust) with no unique rewards. This plan makes bosses worth dropping everything for: boss trophy materials, boss-exclusive crafting recipes, contribution-scaled XP, and per-player rewards display.

**Branch:** `feature/boss-rewards`

---

## 1. Schema Change

Add to `BossEncounter` model (after `roundSummaries`):

```prisma
rewardsByPlayer Json? @map("rewards_by_player")
```

Stores `Record<playerId, BossPlayerReward>` — one JSON column, no new table. Mirrors the existing `roundSummaries Json?` pattern.

**Migration:** `boss_rewards`

---

## 2. Shared Types + Constants

### Types (`packages/shared/src/types/worldEvent.types.ts`)

```ts
export interface BossPlayerReward {
  loot: Array<{
    itemTemplateId: string;
    quantity: number;
    rarity?: string;
    itemName?: string;
  }>;
  xp?: {
    skillType: string;
    rawXp: number;
    xpAfterEfficiency: number;
    leveledUp: boolean;
    newLevel: number;
  };
  recipeUnlocked?: {
    recipeId: string;
    recipeName: string;
    soulbound: boolean;
  };
}
```

Add `rewardsByPlayer: Record<string, BossPlayerReward> | null` to `BossEncounterData`.

### Constants (`packages/shared/src/constants/gameConstants.ts`)

Add to `WORLD_EVENT_CONSTANTS`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `BOSS_BASE_XP_REWARD_BY_TIER` | `[100, 250, 500, 1000, 2000]` | Base XP per zone tier, scaled by contribution |
| `BOSS_RECIPE_DROP_CHANCE` | `0.15` | 15% chance per participant per kill |
| `BOSS_RARITY_BONUS` | `5` | Added to mob level for `rollDropRarity()`, shifting equipment rarity upward |

---

## 3. Seed Data — Trophy Materials + Boss Recipes

### New Item Templates

**Trophy materials** (stackable resources, guaranteed drop from boss kills):

| Item | Tier | Boss Source |
|------|------|-------------|
| Alpha Wolf Fang | 2 | Alpha Wolf (Deep Forest) |
| Spirit Essence | 4 | Ancient Spirit (Ancient Grove) |

**Boss-exclusive equipment** (intentionally stronger than same-tier normal gear):

| Item | Slot | Type | Tier | Base Stats |
|------|------|------|------|------------|
| Wolfsbane Blade | main_hand | weapon (melee) | 2 | attack: 8, critChance: 0.02 |
| Alpha Pelt Chest | chest | armor (medium) | 2 | armor: 6, health: 5, dodge: 2 |
| Spirit Staff | main_hand | weapon (magic) | 4 | magicPower: 10, critChance: 0.03 |
| Ethereal Robes | chest | armor (light) | 4 | magicDefence: 8, health: 6, dodge: 3 |

### Drop Tables

Guaranteed trophy drops (100% chance, 2-4 qty per participant):
- Alpha Wolf → Alpha Wolf Fang
- Ancient Spirit → Spirit Essence

### Boss-Exclusive Recipes

All `isAdvanced: true, soulbound: true`, linked to boss mob family. Discovered via boss kill recipe drop (15% chance).

**Alpha Wolf** (`fam.wolves`):
- **Wolfsbane Blade** — weaponsmithing Lv.8: 6 Alpha Wolf Fang + 4 Tin Ingot + 3 Wolf Leather
- **Alpha Pelt Chest** — leatherworking Lv.8: 4 Alpha Wolf Fang + 6 Wolf Pelt + 4 Wolf Leather

**Ancient Spirit** (`fam.spirits`):
- **Spirit Staff** — weaponsmithing Lv.16: 6 Spirit Essence + 4 Elderwood Plank + 5 Sprite Dust
- **Ethereal Robes** — tailoring Lv.16: 4 Spirit Essence + 6 Dryad Thread + 4 Fae Fabric

Material quantities tuned so crafting requires multiple boss kills (6 trophies at 2-4 per kill = minimum 2 kills at max contribution).

---

## 4. Service Layer

### 4a: Extract `enrichLootWithNames`

Move from `apps/api/src/routes/combat.ts:802-835` to `apps/api/src/services/lootService.ts` as an export. Update combat.ts import.

### 4b: Rewrite `bossLootService.ts`

Current: `distributeBossLoot()` calls `rollAndGrantLoot()` per contributor, discards result.

New signature:
```ts
interface BossContributor {
  playerId: string;
  totalDamage: number;
  totalHealing: number;
  attackSkill?: string;  // melee/ranged/magic for attackers
}

export async function distributeBossLoot(
  mobTemplateId: string,
  mobLevel: number,
  contributors: BossContributor[],
  zoneTier: number,
): Promise<Record<string, BossPlayerReward>>
```

Per contributor:

1. **Item loot**: `rollAndGrantLoot(playerId, mobTemplateId, mobLevel + BOSS_RARITY_BONUS, dropMultiplier)` — rarity bonus shifts equipment drops to higher rarities
2. **Enrich**: `enrichLootWithNames(loot)` — add item names for frontend display
3. **XP**: `grantSkillXp(playerId, attackSkill ?? 'magic', scaledXp)` where `scaledXp = round(BOSS_BASE_XP_REWARD_BY_TIER[tierIndex] * max(0.5, ratio * count))`
4. **Recipe**: if `random() < BOSS_RECIPE_DROP_CHANCE`, call `rollBossRecipeDrop(playerId, mobFamilyId)`

### `rollBossRecipeDrop(playerId, mobFamilyId)` helper

Same pattern as `chestService.ts:144-194`:
1. Query advanced recipes for mob family
2. Filter to unknown (not in PlayerRecipe)
3. Random pick → create PlayerRecipe
4. Return `{ recipeId, recipeName, soulbound }` or undefined

### 4c: Update `bossEncounterService.ts`

- **`toBossEncounterData()`**: Add `rewardsByPlayer` to input+return, parse JSON
- **`resolveBossRound()` boss defeated section** (~line 500-526):
  1. Build contributors with `attackSkill` from `participantData` (already available — attackers have `pd.attackSkill`, healers default to `'magic'`)
  2. Pass `zoneTier` (already computed at line 233) to `distributeBossLoot()`
  3. Capture returned rewards, persist via `prisma.bossEncounter.update()`

---

## 5. Route Layer (`apps/api/src/routes/boss.ts`)

**GET `/:id`**: Extract requesting player's rewards from full map:
```ts
const myRewards = encounter.rewardsByPlayer?.[playerId] ?? null;
// Include myRewards in response, strip full rewardsByPlayer map for privacy
```

**GET `/boss/history`**: Same — each entry includes `myRewards` for the requesting player only.

---

## 6. Frontend Types (`apps/web/src/lib/api.ts`)

- Add `BossPlayerReward` interface (matching shared type)
- Add `myRewards?: BossPlayerReward | null` to `BossEncounterResponse`
- Add `myRewards?: BossPlayerReward | null` to `BossHistoryEntry`

---

## 7. UI — Rewards Display

### BossEncounterPanel (`apps/web/src/components/BossEncounterPanel.tsx`)

Add rewards section inside "Boss Defeated" block when `encounter.myRewards` exists:

- **Loot table**: item name + quantity, rarity-colored text (use `RARITY_COLORS` from `apps/web/src/lib/rarity.ts`)
- **XP display**: `+{xpAfterEfficiency} {skillType} XP` with optional `(Level up! Lv.{newLevel})`
- **Recipe**: `Recipe learned: {recipeName} (soulbound)` in green

### BossHistory (`apps/web/src/components/screens/BossHistory.tsx`)

Add rewards section in expanded encounter detail, same display pattern.

---

## Files Changed

| File | Changes |
|------|---------|
| `packages/database/prisma/schema.prisma` | Add `rewardsByPlayer Json?` to BossEncounter |
| `packages/shared/src/types/worldEvent.types.ts` | Add `BossPlayerReward` interface, add field to `BossEncounterData` |
| `packages/shared/src/constants/gameConstants.ts` | Add `BOSS_BASE_XP_REWARD_BY_TIER`, `BOSS_RECIPE_DROP_CHANCE`, `BOSS_RARITY_BONUS` |
| `packages/database/prisma/seed-data/ids.ts` | New IDs for trophy materials + boss gear |
| `packages/database/prisma/seed-data/items.ts` | 2 trophy resources + 4 boss equipment items |
| `packages/database/prisma/seed-data/drops.ts` | Guaranteed trophy drops for both bosses |
| `packages/database/prisma/seed-data/recipes.ts` | 4 boss-exclusive advanced recipes |
| `apps/api/src/services/lootService.ts` | Extract `enrichLootWithNames` from combat route |
| `apps/api/src/services/bossLootService.ts` | Full rewrite: XP + recipe + enriched loot + return rewards |
| `apps/api/src/services/bossEncounterService.ts` | Persist rewards, pass attackSkill to distributeBossLoot |
| `apps/api/src/routes/boss.ts` | Expose `myRewards` per player in GET endpoints |
| `apps/api/src/routes/combat.ts` | Import `enrichLootWithNames` from lootService |
| `apps/web/src/lib/api.ts` | Add `BossPlayerReward`, update response types |
| `apps/web/src/components/BossEncounterPanel.tsx` | Rewards section in defeated view |
| `apps/web/src/components/screens/BossHistory.tsx` | Rewards in expanded history detail |

---

## Verification

1. `npm run db:migrate` — new migration
2. `npm run db:seed` — reseed for new items/recipes/drops
3. `npm run build:packages` — build shared + game-engine + database
4. `npm run typecheck` — no TS errors
5. `npm run test:engine && npm run test:api` — existing tests pass
6. Manual testing:
   - Spawn boss (`BOSS_SPAWN_CHANCE=1`), participate, defeat
   - Verify trophy materials in inventory
   - Verify XP granted (check player skills endpoint)
   - Verify rewards visible in BossEncounterPanel
   - Verify rewards visible in BossHistory
   - Verify recipe drop works (temporarily set `BOSS_RECIPE_DROP_CHANCE=1`)
   - Verify non-participants see no rewards
   - Verify contribution scales XP and drop multiplier correctly
