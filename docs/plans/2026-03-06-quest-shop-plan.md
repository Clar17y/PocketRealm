# Quest Shop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the stub quest shop with a database-driven shop system featuring 19 exclusive items: reset scrolls, forge upgrade scrolls, action-count buff scrolls, utility items, and prestige titles.

**Architecture:** New Prisma models (`ShopItem`, `PlayerShopPurchase`, `PlayerBuff`) seeded with the 19-item roster. A new `shopService.ts` handles purchases with limit enforcement and effect application. Buff consumption is integrated into existing services (xpService, forge route, gathering, crafting, combat). The existing quest routes are extended with a dedicated `/api/v1/shop` router.

**Tech Stack:** Prisma (schema + migration + seed), Express routes, Zod validation, Vitest unit tests

---

## Task 1: Prisma Schema — New Models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add ShopItem model**

Add after the `PlayerQuestState` model (around line 1066):

```prisma
// =============================================================================
// QUEST SHOP
// =============================================================================

model ShopItem {
  id            String  @id @default(uuid())
  key           String  @unique @db.VarChar(64)
  name          String  @db.VarChar(128)
  description   String  @db.VarChar(512)
  cost          Int
  category      String  @db.VarChar(16) // reset, upgrade, buff, utility, prestige
  weeklyLimit   Int?    @map("weekly_limit")
  lifetimeLimit Int?    @map("lifetime_limit")
  buffType      String? @map("buff_type") @db.VarChar(32)
  buffValue     Float?  @map("buff_value")
  buffUses      Int?    @map("buff_uses")
  enabled       Boolean @default(true)
  sortOrder     Int     @default(0) @map("sort_order")

  purchases PlayerShopPurchase[]

  @@map("shop_items")
}

model PlayerShopPurchase {
  id          String   @id @default(uuid())
  playerId    String   @map("player_id")
  shopItemId  String   @map("shop_item_id")
  purchasedAt DateTime @default(now()) @map("purchased_at")

  player   Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  shopItem ShopItem @relation(fields: [shopItemId], references: [id], onDelete: Cascade)

  @@index([playerId, shopItemId, purchasedAt])
  @@map("player_shop_purchases")
}

model PlayerBuff {
  id            String   @id @default(uuid())
  playerId      String   @map("player_id")
  buffType      String   @map("buff_type") @db.VarChar(32)
  remainingUses Int      @map("remaining_uses")
  bonusValue    Float    @map("bonus_value")
  shopItemId    String   @map("shop_item_id")
  createdAt     DateTime @default(now()) @map("created_at")

  player   Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  shopItem ShopItem @relation(fields: [shopItemId], references: [id], onDelete: Cascade)

  @@unique([playerId, buffType])
  @@map("player_buffs")
}
```

**Step 2: Add relations to Player model**

Add to the Player model relations (around line 91, near existing `quests`/`questState`):

```prisma
  shopPurchases    PlayerShopPurchase[]
  buffs            PlayerBuff[]
```

**Step 3: Add `homeTownId` to Player model**

The Player model already has `homeTownId` and `homeTown` relation (confirmed in schema). Skip this step.

**Step 4: Run migration**

```bash
cd /d/Code/Adventure && npx prisma migrate dev --name add-quest-shop-models --schema packages/database/prisma/schema.prisma
```

**Step 5: Generate Prisma client**

```bash
npm run db:generate
```

**Step 6: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(db): add ShopItem, PlayerShopPurchase, PlayerBuff models"
```

---

## Task 2: Seed Shop Items

**Files:**
- Modify: `packages/database/prisma/seed.ts`

**Step 1: Add shop item seed data**

Add a `seedShopItems()` function that upserts all 19 items. Use `prisma.shopItem.upsert()` with `key` as the unique match so it's idempotent:

```typescript
async function seedShopItems() {
  const items = [
    // Reset Scrolls
    { key: 'attribute_reset_scroll', name: 'Attribute Reset Scroll', description: 'Reset all attribute points for reallocation', cost: 40, category: 'reset', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 10 },
    { key: 'talent_reset_scroll', name: 'Talent Reset Scroll', description: 'Reset all skill point allocations without turn cost', cost: 40, category: 'reset', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 11 },
    { key: 'efficiency_reset_scroll', name: 'Efficiency Reset Scroll', description: 'Reset all skill XP efficiencies to 100%', cost: 35, category: 'reset', weeklyLimit: 2, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 12 },
    // Upgrade Scrolls
    { key: 'forge_luck_scroll', name: 'Forge Luck Scroll', description: 'Double forge upgrade chance for next 3 upgrades', cost: 35, category: 'upgrade', weeklyLimit: 2, lifetimeLimit: null, buffType: 'forge_luck', buffValue: 2.0, buffUses: 3, sortOrder: 20 },
    { key: 'forge_protection_scroll', name: 'Forge Protection Scroll', description: 'Guaranteed success on next forge upgrade', cost: 150, category: 'upgrade', weeklyLimit: 1, lifetimeLimit: null, buffType: 'forge_protection', buffValue: 1.0, buffUses: 1, sortOrder: 21 },
    // Buff Scrolls
    { key: 'xp_boost_scroll', name: 'XP Boost Scroll', description: '+10% XP for next 100 kills', cost: 25, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'xp_boost', buffValue: 0.10, buffUses: 100, sortOrder: 30 },
    { key: 'gathering_yield_scroll', name: 'Gathering Yield Scroll', description: '+15% gathering yield for next 50 gathers', cost: 25, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'gathering_yield', buffValue: 0.15, buffUses: 50, sortOrder: 31 },
    { key: 'crafting_fortune_scroll', name: 'Crafting Fortune Scroll', description: '+10% crafting crit for next 30 crafts', cost: 30, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'crafting_crit', buffValue: 0.10, buffUses: 30, sortOrder: 32 },
    { key: 'combat_power_scroll', name: 'Combat Power Scroll', description: '+10% damage for next 50 combats', cost: 30, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'combat_damage', buffValue: 0.10, buffUses: 50, sortOrder: 33 },
    { key: 'iron_skin_scroll', name: 'Iron Skin Scroll', description: '+10% defence for next 50 combats', cost: 30, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'combat_defence', buffValue: 0.10, buffUses: 50, sortOrder: 34 },
    { key: 'durability_shield_scroll', name: 'Durability Shield Scroll', description: 'No durability loss for next 50 combats', cost: 20, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'durability_shield', buffValue: 1.0, buffUses: 50, sortOrder: 35 },
    // Utility
    { key: 'teleport_scroll', name: 'Teleport Scroll', description: 'Instantly travel to any discovered zone', cost: 15, category: 'utility', weeklyLimit: 3, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 40 },
    { key: 'hearthstone', name: 'Hearthstone', description: 'Instantly teleport to your home town', cost: 10, category: 'utility', weeklyLimit: 5, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 41 },
    { key: 'bestiary_tome', name: 'Bestiary Tome', description: 'Fully unlock bestiary entry for one chosen mob', cost: 35, category: 'utility', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 42 },
    { key: 'recipe_scroll', name: 'Recipe Scroll', description: 'Unlock a random unlearned recipe you can craft', cost: 30, category: 'utility', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 43 },
    { key: 'guild_contract_reroll', name: 'Guild Contract Reroll', description: 'Reroll one guild contract (leader/officer only)', cost: 20, category: 'utility', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 44 },
    // Prestige
    { key: 'title_questmaster', name: 'Title: Questmaster', description: 'Exclusive cosmetic title for dedicated questers', cost: 500, category: 'prestige', weeklyLimit: null, lifetimeLimit: 1, buffType: null, buffValue: null, buffUses: null, sortOrder: 50 },
    { key: 'title_token_hoarder', name: 'Title: Token Hoarder', description: 'Exclusive cosmetic title for the most dedicated', cost: 1000, category: 'prestige', weeklyLimit: null, lifetimeLimit: 1, buffType: null, buffValue: null, buffUses: null, sortOrder: 51 },
  ];

  for (const item of items) {
    await prisma.shopItem.upsert({
      where: { key: item.key },
      create: item,
      update: { name: item.name, description: item.description, cost: item.cost, category: item.category, weeklyLimit: item.weeklyLimit, lifetimeLimit: item.lifetimeLimit, buffType: item.buffType, buffValue: item.buffValue, buffUses: item.buffUses, sortOrder: item.sortOrder },
    });
  }

  console.log(`  Seeded ${items.length} shop items`);
}
```

Call `seedShopItems()` from the main seed function.

**Step 2: Run seed**

```bash
npm run db:seed
```

**Step 3: Commit**

```bash
git add packages/database/prisma/seed.ts
git commit -m "feat(db): seed 19 quest shop items"
```

---

## Task 3: Shared Types & Remove Old Constants

**Files:**
- Modify: `packages/shared/src/types/` (add shop types if needed, or add to existing)
- Modify: `packages/shared/src/constants/gameConstants.ts` (remove `QUEST_SHOP_ITEMS`)

**Step 1: Add shared shop types**

Add to an appropriate shared types file (or create `packages/shared/src/types/shop.types.ts`):

```typescript
export interface ShopItemData {
  id: string;
  key: string;
  name: string;
  description: string;
  cost: number;
  category: 'reset' | 'upgrade' | 'buff' | 'utility' | 'prestige';
  weeklyLimit: number | null;
  lifetimeLimit: number | null;
  buffType: string | null;
  buffValue: number | null;
  buffUses: number | null;
  enabled: boolean;
  sortOrder: number;
  // Populated by API for the requesting player
  purchasesThisWeek?: number;
  purchasesLifetime?: number;
  canPurchase?: boolean;
}

export interface PlayerBuffData {
  id: string;
  buffType: string;
  remainingUses: number;
  bonusValue: number;
  shopItemName: string;
  createdAt: string;
}

export interface ShopPurchaseResult {
  success: boolean;
  newBalance: number;
  itemKey: string;
  effect?: Record<string, unknown>;
}
```

**Step 2: Remove old `QUEST_SHOP_ITEMS` and `QuestShopItem` type from `gameConstants.ts`**

Delete the `QuestShopItem` interface and `QUEST_SHOP_ITEMS` array (lines ~1315-1330). These are now in the database.

**Step 3: Export new types from shared index**

Update `packages/shared/src/index.ts` to export the new types.

**Step 4: Build shared package**

```bash
npm run build --workspace=packages/shared
```

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add shop types, remove old QUEST_SHOP_ITEMS constant"
```

---

## Task 4: Buff Service — Core Buff Operations

**Files:**
- Create: `apps/api/src/services/buffService.ts`
- Create: `apps/api/src/services/buffService.test.ts`

**Step 1: Write failing tests for buffService**

```typescript
// buffService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import { getActiveBuffs, getBuffValue, consumeBuff, hasActiveBuff } from './buffService';

const PLAYER_ID = 'player-1';

beforeEach(() => vi.clearAllMocks());

describe('getActiveBuffs', () => {
  it('returns all active buffs for a player', async () => {
    db.playerBuff.findMany.mockResolvedValue([
      { id: 'b1', playerId: PLAYER_ID, buffType: 'xp_boost', remainingUses: 50, bonusValue: 0.10, shopItemId: 'si-1', createdAt: new Date(), shopItem: { name: 'XP Boost Scroll' } },
    ]);
    const result = await getActiveBuffs(PLAYER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].buffType).toBe('xp_boost');
  });
});

describe('getBuffValue', () => {
  it('returns bonus value when buff exists', async () => {
    db.playerBuff.findUnique.mockResolvedValue({ bonusValue: 0.10, remainingUses: 50 });
    const value = await getBuffValue(PLAYER_ID, 'xp_boost');
    expect(value).toBe(0.10);
  });

  it('returns 0 when no buff exists', async () => {
    db.playerBuff.findUnique.mockResolvedValue(null);
    const value = await getBuffValue(PLAYER_ID, 'xp_boost');
    expect(value).toBe(0);
  });
});

describe('hasActiveBuff', () => {
  it('returns true when buff exists', async () => {
    db.playerBuff.findUnique.mockResolvedValue({ id: 'b1' });
    expect(await hasActiveBuff(PLAYER_ID, 'xp_boost')).toBe(true);
  });

  it('returns false when no buff', async () => {
    db.playerBuff.findUnique.mockResolvedValue(null);
    expect(await hasActiveBuff(PLAYER_ID, 'xp_boost')).toBe(false);
  });
});

describe('consumeBuff', () => {
  it('decrements remaining uses', async () => {
    const mockTx = { playerBuff: { update: vi.fn().mockResolvedValue({ remainingUses: 49 }), delete: vi.fn() } };
    await consumeBuff(mockTx, PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId_buffType: { playerId: PLAYER_ID, buffType: 'xp_boost' } },
      data: { remainingUses: { decrement: 1 } },
    }));
  });

  it('deletes buff when remaining uses reaches 0', async () => {
    const mockTx = {
      playerBuff: {
        update: vi.fn().mockResolvedValue({ remainingUses: 0, id: 'b1' }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    await consumeBuff(mockTx, PLAYER_ID, 'xp_boost');
    expect(mockTx.playerBuff.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /d/Code/Adventure && npx vitest run apps/api/src/services/buffService.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement buffService**

```typescript
// buffService.ts
import { prisma } from '@pocketrealm/database';
import type { PlayerBuffData } from '@pocketrealm/shared';

export async function getActiveBuffs(playerId: string): Promise<PlayerBuffData[]> {
  const buffs = await prisma.playerBuff.findMany({
    where: { playerId },
    include: { shopItem: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return buffs.map((b: any) => ({
    id: b.id,
    buffType: b.buffType,
    remainingUses: b.remainingUses,
    bonusValue: b.bonusValue,
    shopItemName: b.shopItem.name,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function getBuffValue(playerId: string, buffType: string): Promise<number> {
  const buff = await prisma.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { bonusValue: true },
  });
  return buff?.bonusValue ?? 0;
}

export async function hasActiveBuff(playerId: string, buffType: string): Promise<boolean> {
  const buff = await prisma.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { id: true },
  });
  return buff !== null;
}

// tx is a Prisma transaction client
export async function consumeBuff(tx: any, playerId: string, buffType: string): Promise<void> {
  const updated = await tx.playerBuff.update({
    where: { playerId_buffType: { playerId, buffType } },
    data: { remainingUses: { decrement: 1 } },
  });
  if (updated.remainingUses <= 0) {
    await tx.playerBuff.delete({ where: { id: updated.id } });
  }
}

export async function consumeBuffIfActive(tx: any, playerId: string, buffType: string): Promise<number> {
  const buff = await tx.playerBuff.findUnique({
    where: { playerId_buffType: { playerId, buffType } },
    select: { bonusValue: true, remainingUses: true, id: true },
  });
  if (!buff) return 0;

  const newUses = buff.remainingUses - 1;
  if (newUses <= 0) {
    await tx.playerBuff.delete({ where: { id: buff.id } });
  } else {
    await tx.playerBuff.update({
      where: { id: buff.id },
      data: { remainingUses: newUses },
    });
  }
  return buff.bonusValue;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run apps/api/src/services/buffService.test.ts
```

**Step 5: Commit**

```bash
git add apps/api/src/services/buffService.ts apps/api/src/services/buffService.test.ts
git commit -m "feat(api): add buffService for action-count buff management"
```

---

## Task 5: Shop Service — Purchase Logic

**Files:**
- Rewrite: `apps/api/src/services/questShopService.ts`
- Create: `apps/api/src/services/questShopService.test.ts`

This is the largest task. The service handles:
1. Listing shop items with player purchase counts
2. Purchase validation (tokens, weekly/lifetime limits, buff stacking)
3. Effect application branched by category

**Step 1: Write failing tests**

Test the following scenarios:
- `getShopItems(playerId)` — returns items with purchase counts and `canPurchase` flag
- `purchaseItem(playerId, shopItemId)` — happy path deducts tokens, records purchase
- `purchaseItem` — rejects when insufficient tokens
- `purchaseItem` — rejects when weekly limit reached
- `purchaseItem` — rejects when lifetime limit reached
- `purchaseItem` — rejects when buff already active (for buff items)
- `purchaseItem` — buff item creates PlayerBuff row
- `purchaseItem` — reset item (attribute) resets attributes and refunds points
- `purchaseItem` — reset item (talent) deletes allocations
- `purchaseItem` — reset item (efficiency) resets dailyXpGained on all skills
- `purchaseItem` — utility (teleport) requires targetZoneId, updates player zone
- `purchaseItem` — utility (hearthstone) teleports to homeTownId
- `purchaseItem` — utility (bestiary) requires targetMobTemplateId, upserts bestiary
- `purchaseItem` — utility (recipe) rolls random unlearned recipe, creates PlayerRecipe
- `purchaseItem` — utility (guild contract reroll) validates role, deletes + recreates contract
- `purchaseItem` — prestige grants title

Use the existing mock pattern from `questService.test.ts`. Key mock setup:
- `db.shopItem.findUnique` for item lookup
- `db.playerQuestState.findUnique` for token balance
- `db.playerShopPurchase.count` for limit checks
- `db.playerBuff.findUnique` for stacking check
- `db.$transaction` for transactional operations

**Step 2: Run tests to verify they fail**

```bash
npx vitest run apps/api/src/services/questShopService.test.ts
```

**Step 3: Implement questShopService**

Key implementation notes:
- `getShopItems(playerId)`: Query all enabled ShopItems. For each, count `PlayerShopPurchase` rows this week (since Monday UTC) and lifetime. Compute `canPurchase` based on limits, token balance, and active buff check.
- `purchaseItem(playerId, shopItemId, params?)`: All validation + effect in a single `prisma.$transaction`. Use `getWeekStart()` from `apps/api/src/utils/dateHelpers.ts` for weekly limit window.
- Effect handlers as private functions: `applyResetEffect`, `applyBuffEffect`, `applyUtilityEffect`, `applyPrestigeEffect`.

For the attribute reset effect:
```typescript
// Reset all attributes to 0 and refund points
const player = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { attributes: true, characterLevel: true } });
const attrs = player.attributes as Record<string, number>;
const totalSpent = Object.values(attrs).reduce((sum, v) => sum + v, 0);
const defaultAttrs = { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 };
await tx.player.update({
  where: { id: playerId },
  data: { attributes: defaultAttrs, attributePoints: { increment: totalSpent } },
});
```

For the talent reset effect:
```typescript
// Same as skillPointService.respecPoints but without turn cost
await tx.skillPointAllocation.update({
  where: { playerId },
  data: { allocations: {} },
});
```

For efficiency reset:
```typescript
// Reset dailyXpGained to 0 on all skills
await tx.playerSkill.updateMany({
  where: { playerId },
  data: { dailyXpGained: 0 },
});
```

For teleport scroll:
```typescript
// Validate zone is discovered
const discovery = await tx.playerZoneDiscovery.findUnique({
  where: { playerId_zoneId: { playerId, zoneId: params.targetZoneId } },
});
if (!discovery) throw new AppError(400, 'Zone not discovered', 'ZONE_NOT_DISCOVERED');
// Check not recovering/KO'd (use getHpState pattern)
await tx.player.update({
  where: { id: playerId },
  data: { currentZoneId: params.targetZoneId, lastTravelledFromZoneId: player.currentZoneId },
});
```

For hearthstone:
```typescript
const player = await tx.player.findUniqueOrThrow({ where: { id: playerId }, select: { homeTownId: true, currentZoneId: true } });
if (!player.homeTownId) throw new AppError(400, 'No home town set', 'NO_HOME_TOWN');
await tx.player.update({
  where: { id: playerId },
  data: { currentZoneId: player.homeTownId, lastTravelledFromZoneId: player.currentZoneId },
});
```

For bestiary tome:
```typescript
// Upsert bestiary entry with high kill count to reveal all info
// Bestiary reveals prefix effects at 3 kills (hardcoded in UI)
// Set kills to a high number to ensure full reveal
await tx.playerBestiary.upsert({
  where: { playerId_mobTemplateId: { playerId, mobTemplateId: params.targetMobTemplateId } },
  create: { playerId, mobTemplateId: params.targetMobTemplateId, kills: 999 },
  update: { kills: 999 },
});
// Also upsert all prefixes for this mob
const prefixDefs = getMobPrefixes(); // from shared constants
for (const prefix of prefixDefs) {
  await tx.playerBestiaryPrefix.upsert({
    where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId: params.targetMobTemplateId, prefix: prefix.key } },
    create: { playerId, mobTemplateId: params.targetMobTemplateId, prefix: prefix.key, kills: 999 },
    update: { kills: 999 },
  });
}
```

For recipe scroll:
```typescript
// Find all recipes the player hasn't learned and can craft (level check)
const [allRecipes, knownRecipes, playerSkills] = await Promise.all([
  tx.craftingRecipe.findMany({ select: { id: true, skillType: true, requiredLevel: true } }),
  tx.playerRecipe.findMany({ where: { playerId }, select: { recipeId: true } }),
  tx.playerSkill.findMany({ where: { playerId }, select: { skillType: true, level: true } }),
]);
const knownIds = new Set(knownRecipes.map(r => r.recipeId));
const skillLevels = Object.fromEntries(playerSkills.map(s => [s.skillType, s.level]));
const eligible = allRecipes.filter(r => !knownIds.has(r.id) && (skillLevels[r.skillType] ?? 0) >= r.requiredLevel);
if (eligible.length === 0) throw new AppError(400, 'No eligible recipes to unlock', 'NO_ELIGIBLE_RECIPES');
const chosen = eligible[Math.floor(Math.random() * eligible.length)];
await tx.playerRecipe.create({ data: { playerId, recipeId: chosen.id } });
```

For guild contract reroll:
```typescript
// Validate player is leader/officer
const membership = await tx.guildMember.findUnique({ where: { playerId }, select: { guildId: true, role: true } });
if (!membership) throw new AppError(400, 'Not in a guild', 'NOT_IN_GUILD');
if (!['leader', 'officer'].includes(membership.role)) throw new AppError(403, 'Must be leader or officer', 'INSUFFICIENT_ROLE');
// Find the target contract
const contract = await tx.guildContract.findFirst({ where: { id: params.targetContractId, guildId: membership.guildId, status: 'active' } });
if (!contract) throw new AppError(400, 'Contract not found or not active', 'CONTRACT_NOT_FOUND');
// Delete and regenerate one contract (exclude current contract keys)
const activeContracts = await tx.guildContract.findMany({ where: { guildId: membership.guildId, status: 'active' } });
const excludeKeys = activeContracts.filter(c => c.id !== contract.id).map(c => c.contractKey);
const availableDefs = GUILD_CONTRACT_DEFINITIONS.filter(d => !excludeKeys.includes(d.key) && d.key !== contract.contractKey);
if (availableDefs.length === 0) throw new AppError(400, 'No alternative contracts available', 'NO_ALTERNATIVES');
const newDef = availableDefs[Math.floor(Math.random() * availableDefs.length)];
// Delete old, create new
await tx.guildContract.delete({ where: { id: contract.id } });
const guild = await tx.guild.findUniqueOrThrow({ where: { id: membership.guildId }, select: { level: true } });
const bracket = getLevelBracket(guild.level);
const newContract = await tx.guildContract.create({
  data: {
    guildId: membership.guildId,
    contractKey: newDef.key,
    targetValue: newDef.targets[bracket],
    currentValue: 0,
    status: 'active',
    rewardGuildXp: randomIntInclusive(GUILD_CONTRACT_CONSTANTS.REWARD_GUILD_XP_MIN, GUILD_CONTRACT_CONSTANTS.REWARD_GUILD_XP_MAX),
    rewardTreasuryTurns: randomIntInclusive(GUILD_CONTRACT_CONSTANTS.REWARD_TREASURY_MIN, GUILD_CONTRACT_CONSTANTS.REWARD_TREASURY_MAX),
    weekStartedAt: contract.weekStartedAt,
    expiresAt: contract.expiresAt,
  },
});
await tx.guildLog.create({
  data: {
    guildId: membership.guildId,
    eventType: 'contract_rerolled',
    message: `Contract rerolled by ${membership.role}`,
    metadata: { oldKey: contract.contractKey, newKey: newDef.key, playerId },
  },
});
```

For prestige (title):
```typescript
// Grant title — use existing title system via Player.title field or achievementService
// Titles are stored as strings on the player model
// The title value is the shop item name without "Title: " prefix
const titleName = shopItem.name.replace('Title: ', '');
// Store as available title (the achievement system already manages titles)
// For now, just record the purchase — frontend can check purchases for available titles
```

**Step 4: Run tests**

```bash
npx vitest run apps/api/src/services/questShopService.test.ts
```

**Step 5: Commit**

```bash
git add apps/api/src/services/questShopService.ts apps/api/src/services/questShopService.test.ts
git commit -m "feat(api): rewrite questShopService with DB-driven items and effect application"
```

---

## Task 6: Shop Routes

**Files:**
- Create: `apps/api/src/routes/shop.ts`
- Modify: `apps/api/src/index.ts` (register new router)
- Modify: `apps/api/src/routes/quests.ts` (remove old shop routes)

**Step 1: Create shop router**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getShopItems, purchaseItem } from '../services/questShopService';

export const shopRouter = Router();
shopRouter.use(authenticate);

// GET /api/v1/shop — list all shop items with purchase counts
shopRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await getShopItems(playerId);
  res.json(result);
}));

// POST /api/v1/shop/purchase/:itemId — purchase a shop item
const purchaseSchema = z.object({
  targetZoneId: z.string().uuid().optional(),
  targetMobTemplateId: z.string().uuid().optional(),
  targetContractId: z.string().uuid().optional(),
});

shopRouter.post('/purchase/:itemId', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const itemId = z.string().uuid().parse(req.params.itemId);
  const params = purchaseSchema.parse(req.body);
  const result = await purchaseItem(playerId, itemId, params);
  res.json(result);
}));
```

**Step 2: Register route in index.ts**

Add import and registration:
```typescript
import { shopRouter } from './routes/shop';
// ...
app.use('/api/v1/shop', shopRouter);
```

**Step 3: Remove old shop routes from quests.ts**

Delete the `GET /shop` and `POST /shop/buy` routes from `apps/api/src/routes/quests.ts`. Remove the `questShopService` import if it's only used for those routes (but it's being rewritten, so the import stays for the new service).

Actually — the old routes import from the old `questShopService`. Since we're rewriting that service, remove the old route handlers (`GET /shop`, `POST /shop/buy`) and their imports from `quests.ts`. The new routes live in `shop.ts`.

**Step 4: Commit**

```bash
git add apps/api/src/routes/shop.ts apps/api/src/routes/quests.ts apps/api/src/index.ts
git commit -m "feat(api): add /shop routes, remove old shop routes from /quests"
```

---

## Task 7: Player Buffs Route

**Files:**
- Modify: `apps/api/src/routes/player.ts`

**Step 1: Add GET /player/buffs endpoint**

```typescript
import { getActiveBuffs } from '../services/buffService';

// GET /api/v1/player/buffs — list active buffs
playerRouter.get('/buffs', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const buffs = await getActiveBuffs(playerId);
  res.json({ buffs });
}));
```

Place this BEFORE any parameterized routes in the player router.

**Step 2: Commit**

```bash
git add apps/api/src/routes/player.ts
git commit -m "feat(api): add GET /player/buffs endpoint"
```

---

## Task 8: Home Town Setting

**Files:**
- Modify: `apps/api/src/routes/player.ts`

**Step 1: Add homeTownId to settings schema and handler**

Update the `settingsSchema` to include `homeTownId`:
```typescript
homeTownId: z.string().uuid().optional(),
```

Add to `SETTINGS_FIELDS`:
```typescript
'homeTownId',
```

**Step 2: Add validation in the PATCH handler**

Before the `prisma.player.update`, add validation that the player is in the specified town zone:
```typescript
if (body.homeTownId) {
  const player = await prismaAny.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (player.currentZoneId !== body.homeTownId) {
    throw new AppError(400, 'Must be in the town to set it as home', 'NOT_IN_ZONE');
  }
  const zone = await prismaAny.zone.findUniqueOrThrow({
    where: { id: body.homeTownId },
    select: { type: true },
  });
  if (zone.type !== 'town') {
    throw new AppError(400, 'Can only set a town as home', 'NOT_A_TOWN');
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/player.ts
git commit -m "feat(api): add homeTownId to player settings"
```

---

## Task 9: Buff Consumption — XP Boost Integration

**Files:**
- Modify: `apps/api/src/services/xpService.ts`

**Step 1: Write test for XP buff integration**

Add a test case to `xpService.test.ts` (or create if none exists) that verifies:
- When a player has an active `xp_boost` buff, XP is multiplied
- The buff's `remainingUses` is decremented

**Step 2: Integrate buff into `grantSkillXp`**

In `xpService.ts`, after resolving guild XP boost, also resolve the shop buff:

```typescript
import { consumeBuffIfActive } from './buffService';

// Inside grantSkillXp, before the transaction:
const shopXpBoost = await getBuffValue(playerId, 'xp_boost');
const totalXpBoost = xpBoost + shopXpBoost;
const boostedXpGain = totalXpBoost > 0
  ? Math.floor(rawXpGain * (1 + totalXpBoost))
  : rawXpGain;

// Inside the transaction, after XP is applied:
if (shopXpBoost > 0) {
  await consumeBuff(tx, playerId, 'xp_boost');
}
```

Note: The buff check (getBuffValue) happens outside the transaction, and consumption happens inside. This is fine because the `@@unique([playerId, buffType])` constraint prevents double-creation, and consuming inside the transaction ensures atomicity.

**Step 3: Run tests**

```bash
npx vitest run apps/api/src/services/xpService.test.ts
```

**Step 4: Commit**

```bash
git add apps/api/src/services/xpService.ts apps/api/src/services/xpService.test.ts
git commit -m "feat(api): integrate xp_boost buff into xpService"
```

---

## Task 10: Buff Consumption — Forge Integration

**Files:**
- Modify: `apps/api/src/routes/crafting/forge.ts`

**Step 1: Integrate forge_luck and forge_protection buffs**

In the forge upgrade route, after calculating `successChance`:

```typescript
import { consumeBuffIfActive } from '../../services/buffService';

// After: const successChance = calculateForgeUpgradeSuccessChance(currentRarity, equipmentStats.luck);
// Check for forge_luck buff (doubles the chance)
const forgeLuckBuff = await getBuffValue(playerId, 'forge_luck');
const forgeProtectionBuff = await hasActiveBuff(playerId, 'forge_protection');

let adjustedChance = successChance!;
if (forgeLuckBuff > 0) {
  adjustedChance = Math.min(1, adjustedChance * forgeLuckBuff); // forgeLuckBuff is 2.0 (double)
}

const roll = Math.random();
const success = forgeProtectionBuff || roll < adjustedChance;

// After the success/failure branch, consume the buff:
// Wrap in a transaction or use existing transaction
if (forgeLuckBuff > 0) {
  // consumeBuff needs a transaction — use prisma.$transaction or add to existing flow
  await prisma.$transaction(async (tx: any) => {
    await consumeBuff(tx, playerId, 'forge_luck');
  });
}
if (forgeProtectionBuff) {
  await prisma.$transaction(async (tx: any) => {
    await consumeBuff(tx, playerId, 'forge_protection');
  });
}
```

On forge_protection success: do NOT destroy the item on failure — skip the delete and return a response indicating the item was protected. Still consume the sacrificial item.

**Step 2: Update response to indicate buff effects**

Add `buffUsed: 'forge_luck' | 'forge_protection' | null` to the forge response JSON.

**Step 3: Run existing forge tests**

```bash
npx vitest run apps/api/src/routes/crafting/
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/crafting/forge.ts
git commit -m "feat(api): integrate forge_luck and forge_protection buffs"
```

---

## Task 11: Buff Consumption — Combat Integration

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts`

**Step 1: Integrate combat_damage, combat_defence, and durability_shield buffs**

In the combat start route, before calling `runCombat()`:

```typescript
import { getBuffValue, consumeBuffIfActive } from '../../services/buffService';

// Before combat resolution:
const [combatDamageBuff, combatDefenceBuff, durabilityShieldBuff] = await Promise.all([
  getBuffValue(playerId, 'combat_damage'),
  getBuffValue(playerId, 'combat_defence'),
  getBuffValue(playerId, 'durability_shield'),
]);

// Apply damage/defence buffs to combatant stats before passing to runCombat
// Modify the player's effective stats:
if (combatDamageBuff > 0) {
  playerStats.damageMin = Math.floor(playerStats.damageMin * (1 + combatDamageBuff));
  playerStats.damageMax = Math.floor(playerStats.damageMax * (1 + combatDamageBuff));
}
if (combatDefenceBuff > 0) {
  playerStats.defence = Math.floor(playerStats.defence * (1 + combatDefenceBuff));
}
```

After combat resolution, consume buffs and skip durability if shielded:

```typescript
// After combat, in the post-combat transaction:
await prisma.$transaction(async (tx: any) => {
  if (combatDamageBuff > 0) await consumeBuff(tx, playerId, 'combat_damage');
  if (combatDefenceBuff > 0) await consumeBuff(tx, playerId, 'combat_defence');
  if (durabilityShieldBuff > 0) {
    await consumeBuff(tx, playerId, 'durability_shield');
    // Skip durability degradation (don't call degradeDurability)
  }
});
```

For durability shield: conditionally skip the `degradeDurability` call that normally runs after combat.

**Step 2: Run combat tests**

```bash
npx vitest run apps/api/src/routes/combat/
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat(api): integrate combat_damage, combat_defence, durability_shield buffs"
```

---

## Task 12: Buff Consumption — Gathering & Crafting Integration

**Files:**
- Modify: Gathering route/service (wherever yield is calculated)
- Modify: Crafting route/service (wherever crit chance is calculated)

**Step 1: Find gathering yield calculation**

Look for where gathering yield is calculated (likely in `apps/api/src/routes/gathering.ts` or a gathering service). The guild `gathering_yield` modifier is already applied there — add the shop buff on top.

```typescript
const shopGatheringYield = await getBuffValue(playerId, 'gathering_yield');
const totalYieldBoost = guildMods.gatheringYield + shopGatheringYield;
// Apply totalYieldBoost to yield calculation
// After gathering, consume buff:
if (shopGatheringYield > 0) {
  await prisma.$transaction(async (tx: any) => {
    await consumeBuff(tx, playerId, 'gathering_yield');
  });
}
```

**Step 2: Find crafting crit calculation**

Look for where crafting crit is calculated (likely in `apps/api/src/routes/crafting/craft.ts`). The guild `crafting_crit` modifier is already applied — add the shop buff on top.

```typescript
const shopCraftingCrit = await getBuffValue(playerId, 'crafting_crit');
const totalCritBoost = guildMods.craftingCrit + shopCraftingCrit;
// After crafting, consume buff:
if (shopCraftingCrit > 0) {
  await prisma.$transaction(async (tx: any) => {
    await consumeBuff(tx, playerId, 'crafting_crit');
  });
}
```

**Step 3: Run gathering and crafting tests**

```bash
npx vitest run apps/api/src/routes/gathering.ts apps/api/src/routes/crafting/
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/gathering.ts apps/api/src/routes/crafting/
git commit -m "feat(api): integrate gathering_yield and crafting_crit buffs"
```

---

## Task 13: Frontend — Shop Screen

**Files:**
- Create: `apps/web/src/components/screens/ShopScreen.tsx`
- Modify: `apps/web/src/lib/api/` (add shop API functions)

**Step 1: Add shop API client functions**

Create `apps/web/src/lib/api/shop.ts` or add to existing API module:

```typescript
export async function fetchShopItems(): Promise<{ items: ShopItemData[]; questTokens: number }> {
  return fetchApi('/shop');
}

export async function purchaseShopItem(itemId: string, params?: {
  targetZoneId?: string;
  targetMobTemplateId?: string;
  targetContractId?: string;
}): Promise<ShopPurchaseResult> {
  return fetchApi(`/shop/purchase/${itemId}`, { method: 'POST', body: params });
}

export async function fetchPlayerBuffs(): Promise<{ buffs: PlayerBuffData[] }> {
  return fetchApi('/player/buffs');
}
```

**Step 2: Create ShopScreen component**

Build the shop screen UI displaying:
- Token balance at top
- Items grouped by category (reset, upgrade, buff, utility, prestige)
- Each item shows: name, description, cost, weekly/lifetime limit, purchase count
- Purchase button (disabled when can't afford or limit reached)
- For utility items needing targets: show selection UI (zone picker, mob picker, contract picker)
- Active buffs section showing remaining uses

Follow existing screen patterns (e.g., look at `Bestiary.tsx` or `CraftingScreen.tsx` for layout conventions).

**Step 3: Wire into game controller**

Add the shop screen to the game navigation. Check `apps/web/src/app/game/useGameController.ts` for how screens are managed and add the shop as a navigable screen.

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/ShopScreen.tsx apps/web/src/lib/api/shop.ts
git commit -m "feat(web): add ShopScreen component and shop API client"
```

---

## Task 14: Frontend — Active Buffs Display

**Files:**
- Modify: `apps/web/src/components/` (add buff indicators to relevant screens)

**Step 1: Add buff indicator component**

Create a small `ActiveBuffs.tsx` component that shows active buffs as icons/badges with remaining uses. This should be visible on the main game HUD or player stats area so players always know what buffs are active.

**Step 2: Integrate into game layout**

Add the buff indicator to the main game screen layout, likely near the HP/turn display area.

**Step 3: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add active buff indicators to game HUD"
```

---

## Task 15: Frontend — Home Town Setting

**Files:**
- Modify: Relevant settings or zone UI component

**Step 1: Add "Set as Home Town" button**

When in a town zone, show a button to set it as home town. This calls `PATCH /player/settings` with `{ homeTownId: currentZoneId }`.

**Step 2: Show current home town in settings/zone UI**

Display which town is currently set as home.

**Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add home town setting UI"
```

---

## Task 16: Cleanup & Final Verification

**Step 1: Remove old QUEST_SHOP_ITEMS references**

Search for any remaining references to `QUEST_SHOP_ITEMS` or `QuestShopItem` and remove/update them:
```bash
grep -r "QUEST_SHOP_ITEMS\|QuestShopItem" --include="*.ts" --include="*.tsx"
```

**Step 2: Run full type check**

```bash
npm run typecheck
```

**Step 3: Run all tests**

```bash
npm run test
```

**Step 4: Run dev server and manually verify**

```bash
npm run dev
```

Test:
- Shop screen loads with all 19 items
- Can purchase a buff scroll, see it in active buffs
- Buff depletes after the specified number of actions
- Purchase limits enforced (weekly/lifetime)
- Teleport scroll works
- Hearthstone works after setting home town
- Attribute/talent/efficiency resets work
- Recipe scroll grants a new recipe
- Bestiary tome reveals full mob info
- Guild contract reroll works for leader/officer
- Prestige titles purchasable and displayed

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: cleanup old shop references and final verification"
```

---

## Dependency Graph

```
Task 1 (Schema) → Task 2 (Seed)
Task 1 (Schema) → Task 3 (Types)
Task 3 (Types) → Task 4 (Buff Service)
Task 3 (Types) → Task 5 (Shop Service)
Task 4 (Buff Service) → Task 5 (Shop Service)
Task 5 (Shop Service) → Task 6 (Shop Routes)
Task 4 (Buff Service) → Task 7 (Player Buffs Route)
Task 5 (Shop Service) → Task 8 (Home Town Setting)
Task 4 (Buff Service) → Task 9 (XP Buff Integration)
Task 4 (Buff Service) → Task 10 (Forge Integration)
Task 4 (Buff Service) → Task 11 (Combat Integration)
Task 4 (Buff Service) → Task 12 (Gathering/Crafting Integration)
Task 6 (Shop Routes) → Task 13 (Frontend Shop Screen)
Task 7 (Player Buffs Route) → Task 14 (Frontend Buffs Display)
Task 8 (Home Town Setting) → Task 15 (Frontend Home Town)
All → Task 16 (Cleanup)
```

**Parallelizable groups:**
- Tasks 9, 10, 11, 12 (buff integrations) can run in parallel after Task 4
- Tasks 13, 14, 15 (frontend) can run in parallel after their backend dependencies
- Task 2 (Seed) can run in parallel with Task 3 (Types)
