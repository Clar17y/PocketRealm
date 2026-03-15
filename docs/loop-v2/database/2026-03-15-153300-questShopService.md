# Database Audit: questShopService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/questShopService.ts` (494 lines, 2 exported functions + many private effect handlers)

## Prisma Models Touched
Direct: `ShopItem`, `PlayerQuestState`, `PlayerShopPurchase`, `PlayerBuff`, `Player`, `PlayerAchievement`, `SkillPointAllocation`, `PlayerSkill`, `PlayerBestiary`, `PlayerBestiaryPrefix`, `CraftingRecipe`, `PlayerRecipe`, `GuildMember`, `GuildContract`, `Guild`, `GuildLog`, `GuildExpeditionMember`, `PlayerZoneDiscovery`, `Zone`, `MobTemplate`

## Findings

### N+1 Queries
**1. `applyBestiaryTome` — per-prefix findUnique + create/update loop (lines 371–386)**
Loops over ALL mob prefixes (~19) doing individual `findUnique` + conditional `create`/`update` per prefix. ~38 queries for a single bestiary tome use.

### Payload Bloat
**1. `applyRecipeScroll` — `craftingRecipe.findMany()` without filter or select (line 393)**
Fetches ALL crafting recipes (full rows) to filter in JS. Should use `select` and potentially filter by eligible skill types.

**2. `shopItem.findUnique` without select (line 83)** — full row, uses most fields. Acceptable.

### Cache Issues
None — player-initiated shop actions.

### Missing Indexes / Migration Risks
None new. Uses `(prisma as any)` for newer models — type safety issue but not a DB concern.

## Suggested Fixes
1. `applyBestiaryTome`: batch-create prefix entries with `createMany` + `skipDuplicates`, then batch-update low-kill entries
2. `applyRecipeScroll`: add `select` to recipe fetch — only needs `id`, `skillType`, `requiredLevel`, `name`
