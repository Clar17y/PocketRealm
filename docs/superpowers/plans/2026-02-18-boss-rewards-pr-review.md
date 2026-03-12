# PR Review: Boss Rewards System (`feature/boss-rewards`)

## Context

You are reviewing a PR that implements a complete boss rewards system for an async turn-based RPG. Previously, boss kills ran loot logic but **discarded the results** — players never saw what they earned, and bosses only dropped the same materials as regular mobs. This PR makes boss kills rewarding with unique loot, contribution-scaled XP, trophy materials, and recipe drops.

## Design Plan

The full design doc is at `docs/superpowers/plans/2026-02-18-boss-rewards-system.md` (included in this PR).

## What Changed (16 files, +606/-54)

**Schema & Migration:**
- `packages/database/prisma/schema.prisma` — Added `rewardsByPlayer Json?` to BossEncounter model
- New migration `20260218151747_boss_rewards`

**Shared Types & Constants:**
- `packages/shared/src/types/worldEvent.types.ts` — New `BossPlayerReward` interface, added `rewardsByPlayer` field to `BossEncounterData`
- `packages/shared/src/constants/gameConstants.ts` — Added `BOSS_BASE_XP_REWARD_BY_TIER` (per-tier XP), `BOSS_RECIPE_DROP_CHANCE` (15%), `BOSS_RARITY_BONUS` (+5 effective level), and `BOSS_TROPHY_DROPS` (boss name → guaranteed trophy material drops)

**Seed Data:**
- `ids.ts` — New ID groups: `trophy` (2 materials) and `bossGear` (4 equipment items)
- `items.ts` — 2 trophy resources (Alpha Wolf Fang, Spirit Essence) + 4 boss equipment items (Wolfsbane Blade, Alpha Pelt Chest, Spirit Staff, Ethereal Robes)
- `recipes.ts` — 4 boss-exclusive soulbound recipes (2 per boss, different craft skills)
- `drops.ts` — No trophy entries in global drop table (trophies are granted directly by bossLootService to prevent regular mobs from dropping them)

**Service Layer:**
- `lootService.ts` — Extracted `enrichLootWithNames()` and `LootDropWithName` type from combat.ts for reuse
- `bossLootService.ts` — Full rewrite. Per contributor: rolls loot with rarity bonus, grants guaranteed trophies via `addStackableItem`, grants contribution-scaled XP via `grantSkillXp`, 15% recipe drop via `rollBossRecipeDrop`. Returns `Record<string, BossPlayerReward>`
- `bossEncounterService.ts` — Updated `toBossEncounterData()` to parse `rewardsByPlayer`, updated boss-defeated section to build contributors with `attackSkill`, persist rewards

**Routes:**
- `boss.ts` — GET `/:id` and GET `/history` now extract requesting player's `myRewards` from full map, strip full `rewardsByPlayer` for privacy
- `combat.ts` — Import `enrichLootWithNames` from lootService instead of local copy

**Frontend:**
- `api.ts` — Added `BossPlayerReward` type, `myRewards` fields on encounter/history responses
- `BossEncounterPanel.tsx` — Rewards display in defeated view (rarity-colored loot, XP with level-up, recipe learned)
- `BossHistory.tsx` — Same rewards display in expanded history detail

## Key Design Decisions to Review

1. **Trophy drops are NOT in the drop table** — They're granted directly in `bossLootService` keyed by mob name via `BOSS_TROPHY_DROPS` constant. This prevents regular mobs from the same family (e.g. Forest Wolf, Dire Wolf) from dropping boss trophies.

2. **Privacy: `rewardsByPlayer` is stripped from API responses** — Only the requesting player's rewards are exposed as `myRewards`. The full map stays in the DB for admin/debug.

3. **Contribution scaling** — XP multiplier is `max(0.5, ratio * contributorCount)`, clamped so even minimal contributors get 50% of base XP. Drop multiplier uses the same formula clamped to [0.5, 2.0].

4. **Recipe drops follow the chest pattern** — `rollBossRecipeDrop` mirrors `chestService` logic: query advanced recipes for mob family → filter to unknown → random pick → create PlayerRecipe.

5. **`enrichLootWithNames` extraction** — Moved from a local function in combat.ts to a shared export in lootService.ts. Both combat route and bossLootService now import it.

## Verification Already Done

- `npm run typecheck` — clean
- `npm run test:engine` — 209/209 passed
- `npm run test:api` — 150/150 passed
- `npm run db:seed` — 221 items, 289 drops, 154 recipes seeded successfully

## Things to Look For

- Balance: Are XP values per tier reasonable? Is 15% recipe drop chance too high/low?
- Are the boss equipment stats appropriately stronger than same-tier normal gear?
- Is the contribution scaling formula fair for multi-player boss fights?
- Any edge cases in the loot distribution (0 contributors, 0 total contribution)?
- Privacy: confirm `rewardsByPlayer` is fully stripped from all API responses
- Trophy material quantities (2-4 per kill, recipes need 4-6) — requires 2-3 boss kills minimum
