# Database Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 237 database findings (55 N+1, 35 missing indexes, 84 payload bloat, 37 cache gaps) identified by the overnight loop audit across 63 API services.

**Architecture:** Phased approach — indexes first (zero risk), then select-clause trimming (behavioral no-op), then Redis caching with event invalidation, then query deduplication/batching. Each phase is independently deployable and incrementally reduces query load.

**Tech Stack:** Prisma 6 (schema migrations), ioredis 5 (caching), Vitest (testing)

---

## File Structure

### Schema
- Modify: `packages/database/prisma/schema.prisma` — add 10 missing indexes

### New Files
- Create: `apps/api/src/services/cacheService.ts` — generic cache-aside helpers
- Create: `apps/api/src/services/__tests__/cacheService.test.ts`

### Modified Service Files (by task)

| File | Tasks | Changes |
|------|-------|---------|
| `apps/api/src/services/equipmentService.ts` | 2, 9 | Select clause + Redis cache + invalidation exports |
| `apps/api/src/services/combatStatsService.ts` | 3, 12 | Slim `getMainHandAttackSkill`, add batch `getSkillLevels` |
| `apps/api/src/services/pvpCombatantBuilder.ts` | 3, 12 | Slim `getAttackStyle`, use batch `getSkillLevels` |
| `apps/api/src/services/pvpService.ts` | 4 | Select clauses on `getHistory` / `getNotifications` |
| `apps/api/src/services/guildService.ts` | 5, 10 | Slim existence checks, cache `getPlayerGuildId` |
| `apps/api/src/services/guildMembershipService.ts` | 5, 10 | Slim existence checks, invalidate guild ID cache |
| `apps/api/src/services/inventoryService.ts` | 6 | Slim `getPlayerCapacity`, `addStackableItem` |
| `apps/api/src/services/leaderboardService.ts` | 7 | Select clauses on refresh queries |
| `apps/api/src/services/lootService.ts` | 11, 15 | Cache drop tables, batch stack checks |
| `apps/api/src/services/progressService.ts` | 13 | Accept optional `guildId` param |
| `apps/api/src/services/combatOrchestrationService.ts` | 13, 14 | Pass `guildId`, parallelize post-combat |
| `apps/api/src/services/durabilityService.ts` | 9 | Invalidate equipment cache on durability change |
| `apps/api/src/services/repairService.ts` | 9 | Invalidate equipment cache after repair |

---

## Chunk 1: Schema Indexes

### Task 1: Add All Missing Database Indexes

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

All additions are `CREATE INDEX` — non-destructive, no data changes, backward-compatible. This is the highest-impact, lowest-risk change. Also adds a missing FK relation on `PvpCooldown` (near-zero marginal cost to bundle with the migration).

- [ ] **Step 1: Add Item indexes**

The `Item` model has **no explicit indexes at all**. This is the most critical finding — every inventory, loot, combat, and sell operation queries Item by `ownerId`. Add a compound index that covers all query patterns via prefix matching:

```prisma
model Item {
  // ... existing fields ...

  @@index([ownerId, templateId, inStash])
  @@map("items")
}
```

Covers:
- `{ ownerId }` — all player inventory queries (prefix)
- `{ ownerId, templateId }` — quantity checks, consume operations (prefix)
- `{ ownerId, templateId, inStash }` — stack lookups in `addStackableItem` (exact)

- [ ] **Step 2: Add remaining 8 indexes**

Add to their respective models in the same schema file:

```prisma
model DropTable {
  @@index([mobTemplateId])
}

model PvpRating {
  @@index([rating])
}

model PvpMatch {
  // keep existing: @@index([attackerId, createdAt])
  // keep existing: @@index([defenderId, createdAt])
  @@index([defenderId, defenderRead])  // ADD — notification polling
}

model GuildUpgrade {
  // keep existing: @@index([guildId, upgradeType, expiresAt])
  @@index([guildId, expiresAt])  // ADD — active upgrade queries skip upgradeType
}

model MobTemplate {
  @@index([isExpeditionMob])
}

model BossParticipant {
  // keep existing: @@unique([encounterId, playerId, roundNumber])
  // keep existing: @@index([encounterId, roundNumber])
  @@index([playerId])  // ADD — boss history queries
}

model Guild {
  @@index([level])
}

model PvpCooldown {
  @@index([attackerId, expiresAt])  // ADD — ladder cooldown check
}
```

- [ ] **Step 2b: Add FK relations to PvpCooldown**

`PvpCooldown` has `attackerId` and `defenderId` columns with no `@relation` — orphan risk on player deletion. Add relations with cascade:

```prisma
model PvpCooldown {
  attacker Player @relation("pvpCooldownAttacker", fields: [attackerId], references: [id], onDelete: Cascade)
  defender Player @relation("pvpCooldownDefender", fields: [defenderId], references: [id], onDelete: Cascade)
}
```

Also add the corresponding relation fields on the `Player` model:
```prisma
model Player {
  pvpCooldownsAsAttacker PvpCooldown[] @relation("pvpCooldownAttacker")
  pvpCooldownsAsDefender PvpCooldown[] @relation("pvpCooldownDefender")
}
```

- [ ] **Step 3: Generate and apply migration**

Run: `npm run db:migrate -- --name add_missing_indexes_and_pvp_cooldown_fk`

Expected: Migration creates 10 `CREATE INDEX` statements + FK constraints. No data alterations.

- [ ] **Step 4: Run full test suite**

Run: `npm run test`

Expected: All tests pass — indexes don't change behavior.

- [ ] **Step 5: Commit**

```
perf: add 10 missing database indexes + PvpCooldown FK relations

- Item(ownerId, templateId, inStash) — all inventory queries
- DropTable(mobTemplateId) — loot table lookups per combat
- PvpRating(rating) — ladder range queries
- PvpMatch(defenderId, defenderRead) — notification polling
- PvpCooldown(attackerId, expiresAt) — ladder cooldown check
- GuildUpgrade(guildId, expiresAt) — active upgrade queries
- MobTemplate(isExpeditionMob) — expedition mob filtering
- BossParticipant(playerId) — boss history queries
- Guild(level) — guild search ordering
- PvpCooldown FK relations — cascade delete on player removal
```

---

## Chunk 2: Select Clause Optimizations

### Task 2: Slim getEquipmentStats Query

**Files:**
- Modify: `apps/api/src/services/equipmentService.ts` — `getEquipmentStats` function (~line 41)

`getEquipmentStats` is the most frequently called query in the codebase (2-5x per game action). It fetches ~30 columns across `PlayerEquipment`, `Item`, and `ItemTemplate` — but only uses 4 fields: `item.currentDurability`, `item.bonusStats`, `item.template.baseStats`, `item.template.maxDurability`.

- [ ] **Step 1: Run existing tests as baseline**

Run: `npm run test:api`

Expected: All pass.

- [ ] **Step 2: Replace `include` with `select`**

```ts
// OLD:
const equipped = await prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  include: { item: { include: { template: true } } },
});

// NEW:
const equipped = await prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  select: {
    slot: true,
    item: {
      select: {
        currentDurability: true,
        bonusStats: true,
        template: {
          select: {
            baseStats: true,
            maxDurability: true,
          },
        },
      },
    },
  },
});
```

Update any type annotations on `equipped` to match the narrower Prisma return type. The function's external return type (`EquipmentStats` — aggregated stats) is unchanged.

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

Expected: All pass — behavior unchanged.

- [ ] **Step 4: Commit**

`perf: slim getEquipmentStats query from ~30 to 4 columns`

---

### Task 3: Slim getMainHandAttackSkill and getAttackStyle

**Files:**
- Modify: `apps/api/src/services/combatStatsService.ts` — `getMainHandAttackSkill` (~line 8)
- Modify: `apps/api/src/services/pvpCombatantBuilder.ts` — `getAttackStyle` (~line 20)

Both fetch full `Item` + `ItemTemplate` rows (~20 unused columns) to read one field: `template.requiredSkill`.

- [ ] **Step 1: Slim getMainHandAttackSkill**

```ts
const mainHand = await prisma.playerEquipment.findUnique({
  where: { playerId_slot: { playerId, slot: 'main_hand' } },
  select: { item: { select: { template: { select: { requiredSkill: true } } } } },
});
```

- [ ] **Step 2: Slim getAttackStyle**

Same pattern in `pvpCombatantBuilder.ts`:

```ts
const mainHand = await prisma.playerEquipment.findUnique({
  where: { playerId_slot: { playerId, slot: 'main_hand' } },
  select: { item: { select: { template: { select: { requiredSkill: true } } } } },
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: slim getMainHandAttackSkill and getAttackStyle to select only requiredSkill`

---

### Task 4: Exclude combatLog from PvP History and Notifications

**Files:**
- Modify: `apps/api/src/services/pvpService.ts` — `getHistory` (~line 575), `getNotifications` (~line 665)

Both fetch full `PvpMatch` rows including the large `combatLog` JSON blob, then either discard it (getHistory's response mapping excludes it) or don't need it (notifications).

**Important:** Before applying these selects, verify what the route handler and frontend actually consume from the returned objects. If `getNotifications` returns match objects directly to the route, check the route's response shape to ensure no fields are silently dropped.

- [ ] **Step 1: Add `select` to getHistory**

Replace the `findMany` with explicit field selection, excluding `combatLog`:

```ts
const matches = await prisma.pvpMatch.findMany({
  where,
  select: {
    id: true,
    attackerId: true,
    defenderId: true,
    attackerRating: true,
    defenderRating: true,
    attackerRatingChange: true,
    defenderRatingChange: true,
    attackerStyle: true,
    defenderStyle: true,
    winnerId: true,
    isRevenge: true,
    turnsSpent: true,
    createdAt: true,
    attacker: { select: { username: true } },
    defender: { select: { username: true } },
  },
  orderBy: { createdAt: 'desc' },
  skip,
  take: pageSize,
});
```

- [ ] **Step 2: Add `select` to getNotifications**

```ts
const matches = await prisma.pvpMatch.findMany({
  where: { defenderId: playerId, defenderRead: false },
  select: {
    id: true,
    attackerId: true,
    attackerRating: true,
    defenderRating: true,
    attackerRatingChange: true,
    defenderRatingChange: true,
    attackerStyle: true,
    defenderStyle: true,
    winnerId: true,
    createdAt: true,
    attacker: { select: { username: true } },
  },
  orderBy: { createdAt: 'desc' },
  take: 20,
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: exclude combatLog JSON blob from PvP history and notification queries`

---

### Task 5: Slim Guild Existence Checks

**Files:**
- Modify: `apps/api/src/services/guildMembershipService.ts` — 3 existence checks (~lines 17, 92, 116)

Three `findUnique` calls fetch full rows just to check `!result`.

- [ ] **Step 1: Add select to all three checks**

```ts
// joinGuild (~line 17)
const existing = await prisma.guildMember.findUnique({
  where: { playerId },
  select: { guildId: true },
});

// requestJoinGuild (~line 92)
const existingMembership = await prisma.guildMember.findUnique({
  where: { playerId },
  select: { guildId: true },
});

// requestJoinGuild (~line 116)
const existing = await prisma.guildJoinRequest.findUnique({
  where: { guildId_playerId: { guildId, playerId } },
  select: { status: true },
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test:api`

- [ ] **Step 3: Commit**

`perf: add select to guild membership existence checks`

---

### Task 6: Slim Inventory Queries

**Files:**
- Modify: `apps/api/src/services/inventoryService.ts` — `getPlayerCapacity` (~line 201), `addStackableItemWithClient` (~line 30)

- [ ] **Step 1: Slim getPlayerCapacity — fetch only backpack and belt slots**

Only the `backpack` and `belt` equipment slots affect capacity. No need to fetch all 8+ equipped items:

```ts
// OLD:
const equipped = await prisma.playerEquipment.findMany({
  where: { playerId, itemId: { not: null } },
  include: { item: { include: { template: true } } },
});

// NEW:
const equipped = await prisma.playerEquipment.findMany({
  where: { playerId, slot: { in: ['backpack', 'belt'] }, itemId: { not: null } },
  select: {
    slot: true,
    item: {
      select: {
        rarity: true,
        bonusStats: true,
        template: { select: { tier: true } },
      },
    },
  },
});
```

Update the downstream logic to work with the narrower type (it already only processes backpack/belt slots).

- [ ] **Step 2: Slim addStackableItemWithClient template check**

```ts
// OLD:
const template = await client.itemTemplate.findUnique({ where: { id: itemTemplateId } });

// NEW:
const template = await client.itemTemplate.findUnique({
  where: { id: itemTemplateId },
  select: { stackable: true },
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: slim inventory queries — getPlayerCapacity and addStackableItem template check`

---

### Task 7: Slim Leaderboard Refresh Queries

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts` — `refreshPvp` (~line 229), `refreshSkills` (~line 289)

Refresh queries fetch full table rows including unused columns. At scale (10K players x 14 skills = 140K rows), removing the BigInt `xp` field alone is significant.

- [ ] **Step 1: Add select to refreshPvp**

```ts
const ratings = await prisma.pvpRating.findMany({
  select: {
    playerId: true,
    rating: true,
    wins: true,
    bestRating: true,
    winStreak: true,
    player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } },
  },
});
```

- [ ] **Step 2: Add select to refreshSkills**

```ts
const skills = await prisma.playerSkill.findMany({
  select: {
    playerId: true,
    skillType: true,
    level: true,
    player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } },
  },
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: slim leaderboard refresh queries — remove unused columns from bulk fetches`

---

## Chunk 3: Redis Caching

### Task 8: Create Cache Helper Utility

**Files:**
- Create: `apps/api/src/services/cacheService.ts`
- Create: `apps/api/src/services/__tests__/cacheService.test.ts`

Standardize the cache-aside pattern used by Tasks 9-11.

- [ ] **Step 1: Write tests**

```ts
// apps/api/src/services/__tests__/cacheService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import { cachedQuery, invalidateCache } from '../cacheService';
import { redis } from '../../redis';

describe('cacheService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('cachedQuery', () => {
    it('returns cached value on hit', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ hp: 100 }));
      const fetcher = vi.fn();
      const result = await cachedQuery('test:key', fetcher, 60);
      expect(result).toEqual({ hp: 100 });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('calls fetcher and caches on miss', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      const fetcher = vi.fn().mockResolvedValue({ hp: 200 });
      const result = await cachedQuery('test:key', fetcher, 60);
      expect(result).toEqual({ hp: 200 });
      expect(redis.set).toHaveBeenCalledWith('test:key', JSON.stringify({ hp: 200 }), 'EX', 60);
    });

    it('falls back to fetcher on Redis error', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis down'));
      const fetcher = vi.fn().mockResolvedValue({ hp: 300 });
      const result = await cachedQuery('test:key', fetcher, 60);
      expect(result).toEqual({ hp: 300 });
    });
  });

  describe('invalidateCache', () => {
    it('deletes one or more keys', async () => {
      vi.mocked(redis.del).mockResolvedValue(1);
      await invalidateCache('key1', 'key2');
      expect(redis.del).toHaveBeenCalledWith('key1', 'key2');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- cacheService`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cacheService**

```ts
// apps/api/src/services/cacheService.ts
import { redis } from '../redis';

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through to fetcher
  }

  const result = await fetcher();

  try {
    await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
  } catch {
    // Best-effort cache write
  }

  return result;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  try {
    await redis.del(...keys);
  } catch {
    // Best-effort invalidation
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- cacheService`

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

`feat: add cacheService — generic cache-aside helper with graceful degradation`

---

### Task 9: Cache getEquipmentStats

**Files:**
- Modify: `apps/api/src/services/equipmentService.ts`
- Modify: `apps/api/src/services/durabilityService.ts`
- Modify: `apps/api/src/services/repairService.ts`

**Prerequisite:** Task 2 (select clause) must be applied first — this task wraps the slimmed query.

This is the #1 cache candidate in the codebase. Called 2-5x per game action, changes only on equip/unequip/durability/repair.

- [ ] **Step 1: Wrap getEquipmentStats with cache**

Extract current logic into a private `computeEquipmentStats`, wrap the public function:

```ts
import { cachedQuery, invalidateCache } from './cacheService';

export const equipmentCacheKey = (playerId: string) => `equipment:stats:${playerId}`;

export async function getEquipmentStats(playerId: string): Promise<EquipmentStats> {
  return cachedQuery(equipmentCacheKey(playerId), () => computeEquipmentStats(playerId), 600);
}

async function computeEquipmentStats(playerId: string): Promise<EquipmentStats> {
  // ... existing logic (with select clause from Task 2) ...
}
```

- [ ] **Step 2: Add invalidation to equipItem and unequipSlot**

At the end of both functions, after the DB write succeeds:

```ts
await invalidateCache(equipmentCacheKey(playerId));
```

- [ ] **Step 3: Add invalidation to durabilityService**

In `durabilityService.ts`, after any durability update:

```ts
import { equipmentCacheKey } from './equipmentService';
import { invalidateCache } from './cacheService';

// After durability update in the combat durability function:
await invalidateCache(equipmentCacheKey(playerId));
```

Invalidating on every durability change (not just at 0) is simpler and safe — cache repopulates on next read.

- [ ] **Step 4: Add invalidation to repairService**

**CRITICAL** — `repairService.ts` modifies durability directly (not via `degradeEquippedDurability`), so it needs its own invalidation. After `repairItemDurability` and `repairAllEquipped` complete:

```ts
import { equipmentCacheKey } from './equipmentService';
import { invalidateCache } from './cacheService';

// After repair transaction completes:
await invalidateCache(equipmentCacheKey(playerId));
```

Without this, repaired gear would show zero stats until the 10-minute cache TTL expires.

- [ ] **Step 5: Run tests**

Run: `npm run test:api`

- [ ] **Step 6: Commit**

`perf: cache getEquipmentStats in Redis — invalidate on equip/unequip/durability/repair`

---

### Task 10: Cache getPlayerGuildId

**Files:**
- Modify: `apps/api/src/services/guildService.ts` — `getPlayerGuildId` (~line 219)
- Modify: `apps/api/src/services/guildMembershipService.ts` — invalidation points

Called 4+ times per combat (in `trackProgress`, `addGuildXp`, `getPlayerGuildModifiers`). Only changes on join/leave/kick.

- [ ] **Step 1: Wrap getPlayerGuildId with cache**

```ts
import { cachedQuery, invalidateCache } from './cacheService';

export const guildIdCacheKey = (playerId: string) => `guild:member:${playerId}`;

export async function getPlayerGuildId(playerId: string): Promise<string | null> {
  return cachedQuery(
    guildIdCacheKey(playerId),
    async () => {
      const membership = await prisma.guildMember.findUnique({
        where: { playerId },
        select: { guildId: true },
      });
      return membership?.guildId ?? null;
    },
    300,
  );
}
```

- [ ] **Step 2: Add invalidation to guildMembershipService**

Add `invalidateCache(guildIdCacheKey(playerId))` after these operations:
- `joinGuild` — after member creation
- `leaveGuild` — after member deletion
- `kickMember` — after target member deletion (use target's playerId)
- `respondToJoinRequest` (accept path) — after member creation for the accepted player
- `disbandGuild` — before guild deletion, fetch all member IDs and invalidate all:

```ts
const members = await prisma.guildMember.findMany({
  where: { guildId },
  select: { playerId: true },
});
await invalidateCache(...members.map(m => guildIdCacheKey(m.playerId)));
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: cache getPlayerGuildId in Redis — invalidate on join/leave/kick/disband`

---

### Task 11: Cache Drop Tables (Static Game Data)

**Files:**
- Modify: `apps/api/src/services/lootService.ts`

Drop tables are seed data that never change at runtime. Every PvE combat queries them.

- [ ] **Step 1: Add cached drop table fetcher**

```ts
import { cachedQuery } from './cacheService';

async function getDropTable(mobTemplateId: string) {
  return cachedQuery(
    `droptable:${mobTemplateId}`,
    () => prisma.dropTable.findMany({
      where: { mobTemplateId },
      include: { itemTemplate: true },
    }),
    86400, // 24h TTL — static data
  );
}
```

- [ ] **Step 2: Replace inline drop table query**

In `rollAndGrantLootWithCapacity` (and `rollAndGrantLoot` if it has its own query), replace the inline `prisma.dropTable.findMany(...)` with `getDropTable(mobTemplateId)`.

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: cache drop tables in Redis with 24h TTL — static game data`

---

## Chunk 4: Query Deduplication & Batching

### Task 12: Batch Skill Level Queries

**Files:**
- Modify: `apps/api/src/services/combatStatsService.ts`
- Modify: `apps/api/src/services/pvpCombatantBuilder.ts`

Both services make 3-4 individual `getSkillLevel(playerId, type)` calls (each a separate `findUnique`) that can be replaced with a single `findMany`.

- [ ] **Step 1: Add getSkillLevels batch function**

In `combatStatsService.ts`:

```ts
export async function getSkillLevels(
  playerId: string,
  skillTypes: SkillType[],
): Promise<Record<string, number>> {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId, skillType: { in: skillTypes } },
    select: { skillType: true, level: true },
  });
  const map: Record<string, number> = {};
  for (const st of skillTypes) map[st] = 1; // defaults
  for (const s of skills) map[s.skillType] = s.level;
  return map;
}
```

- [ ] **Step 2: Update buildPerActionScaling**

```ts
// OLD (3 parallel findUnique):
const [meleeLevel, rangedLevel, magicLevel] = await Promise.all([
  getSkillLevel(playerId, 'melee'),
  getSkillLevel(playerId, 'ranged'),
  getSkillLevel(playerId, 'magic'),
]);

// NEW (1 findMany):
const levels = await getSkillLevels(playerId, ['melee', 'ranged', 'magic']);
const meleeLevel = levels.melee;
const rangedLevel = levels.ranged;
const magicLevel = levels.magic;
```

- [ ] **Step 3: Update buildPvpCombatant**

In `pvpCombatantBuilder.ts`:

```ts
// OLD (4 parallel findUnique):
const [meleeLevel, rangedLevel, evasionLevel, magicLevel] = await Promise.all([
  getSkillLevel(playerId, 'melee'),
  getSkillLevel(playerId, 'ranged'),
  getSkillLevel(playerId, 'evasion'),
  getSkillLevel(playerId, 'magic'),
]);

// NEW (1 findMany):
const levels = await getSkillLevels(playerId, ['melee', 'ranged', 'evasion', 'magic']);
const meleeLevel = levels.melee;
const rangedLevel = levels.ranged;
const evasionLevel = levels.evasion;
const magicLevel = levels.magic;
```

- [ ] **Step 4: Run tests**

Run: `npm run test:api && npm run test:engine`

- [ ] **Step 5: Commit**

`perf: batch skill level queries — 1 findMany instead of 3-4 findUnique`

---

### Task 13: Pass guildId to trackProgress

**Files:**
- Modify: `apps/api/src/services/progressService.ts` — `trackProgress` (~line 7)
- Modify: `apps/api/src/services/combatOrchestrationService.ts` — `processCombatVictoryRewards` (~line 230)

Each of the 3 `trackProgress` calls in `processCombatVictoryRewards` independently fetches the player's guild ID. The guild ID is already fetched earlier in the same function. Pass it through to save 3 redundant queries per combat.

- [ ] **Step 1: Add optional guildId parameter to trackProgress**

```ts
export async function trackProgress(
  playerId: string,
  type: ProgressType,
  amount: number,
  metadata?: Record<string, string>,
  preloadedGuildId?: string | null,  // ADD
): Promise<QuestProgressUpdate[]> {
  const guildId = preloadedGuildId !== undefined
    ? preloadedGuildId
    : await getPlayerGuildId(playerId);
  // ... rest unchanged
}
```

- [ ] **Step 2: Pass guildId from combatOrchestrationService**

In `processCombatVictoryRewards`, the guildId is already fetched. Pass it to each `trackProgress` call:

```ts
const guildId = await getPlayerGuildId(playerId);
// ...
const killProgress = await trackProgress(playerId, 'kill_count', 1, undefined, guildId);
const familyProgress = await trackProgress(playerId, 'kill_family', 1, undefined, guildId);
const prefixProgress = await trackProgress(playerId, 'kill_prefix', 1, { prefix: mob.mobPrefix }, guildId);
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: pass guildId to trackProgress — saves 3 redundant guild lookups per combat`

---

### Task 14: Parallelize Post-Combat Calls

**Files:**
- Modify: `apps/api/src/services/combatOrchestrationService.ts` — `processCombatVictoryRewards` (~line 225)

`recordBestiaryKill`, `addGuildXp`, and the 3 `trackProgress` calls run sequentially but are independent.

- [ ] **Step 1: Group independent calls with Promise.allSettled**

Use `Promise.allSettled` (not `Promise.all`) so a single failure doesn't prevent the other post-combat operations from completing. Extract fulfilled values afterward.

```ts
// Fetch guildId first — needed by addGuildXp and trackProgress
const guildId = await getPlayerGuildId(playerId);

// Run all independent post-combat work in parallel
const results = await Promise.allSettled([
  recordBestiaryKill(playerId, mob.mobTemplateId, mob.mobPrefix),
  guildId ? addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_KILL) : Promise.resolve(),
  trackProgress(playerId, 'kill_count', 1, undefined, guildId),
  trackProgress(playerId, 'kill_family', 1, undefined, guildId),
  trackProgress(playerId, 'kill_prefix', 1, { prefix: mob.mobPrefix }, guildId),
]);

const bestiaryResult = results[0].status === 'fulfilled' ? results[0].value : undefined;
const killProgress = results[2].status === 'fulfilled' ? results[2].value : [];
const familyProgress = results[3].status === 'fulfilled' ? results[3].value : [];
const prefixProgress = results[4].status === 'fulfilled' ? results[4].value : [];
```

Note: `getPlayerGuildId` must resolve first since its result is used by `addGuildXp` and `trackProgress`. Everything after it is independent.

- [ ] **Step 2: Run tests**

Run: `npm run test:api`

- [ ] **Step 3: Commit**

`perf: parallelize post-combat calls — bestiary, guild XP, and progress tracking`

---

### Task 15: Batch Loot Stack Checks

**Files:**
- Modify: `apps/api/src/services/lootService.ts` — `rollAndGrantLootWithCapacity`

The loot loop individually queries for existing stacks per drop (`findFirst`), then `addStackableItem` re-queries both template (stackable check) and stack (findFirst). Pre-fetch all stacks upfront and inline the stackable logic.

- [ ] **Step 1: Add batch stack pre-fetch before the drop loop**

After the drop table fetch and roll, before the per-drop loop:

```ts
const stackableTemplateIds = successfulDrops
  .filter(d => d.itemTemplate.stackable)
  .map(d => d.itemTemplateId);

const existingStacks = stackableTemplateIds.length > 0
  ? await prisma.item.findMany({
      where: { ownerId: playerId, templateId: { in: stackableTemplateIds }, inStash: false },
      select: { id: true, templateId: true, quantity: true },
    })
  : [];
const stackMap = new Map(existingStacks.map(s => [s.templateId, s]));
```

- [ ] **Step 2: Replace per-drop stack checks with map lookups**

For stackable drops, use `stackMap` instead of `findFirst` + `addStackableItem`:

```ts
if (drop.itemTemplate.stackable) {
  const existingStack = stackMap.get(drop.itemTemplateId);
  if (existingStack) {
    await prisma.item.update({
      where: { id: existingStack.id },
      data: { quantity: { increment: drop.quantity } },
    });
    existingStack.quantity += drop.quantity; // update local state for subsequent same-template drops
  } else {
    const newItem = await prisma.item.create({
      data: { ownerId: playerId, templateId: drop.itemTemplateId, quantity: drop.quantity, rarity: 'common' },
      select: { id: true, templateId: true, quantity: true },
    });
    stackMap.set(drop.itemTemplateId, newItem);
  }
}
```

This eliminates per-drop: `findFirst` (stack check) + `itemTemplate.findUnique` (stackable check) + `item.findFirst` (inside addStackableItem). Saves N×3 queries for N stackable drops.

- [ ] **Step 3: Run tests**

Run: `npm run test:api`

- [ ] **Step 4: Commit**

`perf: batch loot stack checks — 1 findMany upfront instead of N findFirst per drop`

---

## Chunk 5: Deferred Items (Lower Priority)

These findings have lower impact or higher complexity. Tackle after the above foundation is in place.

| # | Finding | Category | Services | Impact | Notes |
|---|---------|----------|----------|--------|-------|
| 1 | Batch-build raid participants (`prepareMultiplePlayersForCombat`) | N+1 | expeditionService, bossEncounterService | High | Requires new multi-player function; bulk-fetch equipment/skills/templates for N players in shared queries |
| 2 | Guild `checkGuildAchievementsForAllMembers` N+1 loop | N+1 | guildService | Medium | Batch-fetch stats + achievements for all members |
| 3 | Parallelize leaderboard refresh categories | Perf | leaderboardService | Low | `Promise.allSettled([refreshPvp(), refreshSkills(), ...])` — trade-off: increases peak memory |
| 4 | Expedition `handleRoomCleared` triple member fetch | N+1 | expeditionService | Medium | Pass members data through function chain |
| 5 | Boss loot per-contributor loop parallelization | N+1 | bossLootService | Medium | `Promise.all(contributors.map(...))` — independent per contributor |
| 6 | Expedition loot per-contributor×mob nested loop | N+1 | expeditionLootService | High | Pre-fetch drop tables once, reuse across contributors |
| 7 | PvP `challenge` validation parallelization | N+1 | pvpService | Low | Parallelize cooldown + target + rating checks |
| 8 | PvP `scoutOpponent` duplicate equipment fetch | N+1 | pvpService | Low | Pass pre-fetched equipment to `calculatePowerRating` |
| 9 | Cache `getPlayerGuildModifiers` | Cache | combatOrchestrationService | Medium | 60s TTL, invalidate on guild upgrade/project/specialization |
| 10 | Cache `getActiveTemplate` | Cache | combatOrchestrationService | Low | Event-invalidated on template edit |
| 11 | Cache PvP `getNotificationCount` | Cache | pvpService | Low | Short TTL, polled every page load |
| 12 | Cache expedition mob templates (`buildSummonPool`) | Cache | expeditionService | Medium | Static data, same pattern as drop tables |
| 13 | `SkillPointAllocation` upsert-on-read pattern | Risk | skillPointService | Low | Move creation to player registration |
| 14 | `PvpCooldown` missing FK relations (orphan risk) | Risk | pvpService | Low | Add `@relation` with `onDelete: Cascade` |
| 15 | `PvpMatch.combatLog` unbounded JSON blob | Risk | pvpService | Low | Future: compression or archival strategy |
| 16 | Move `ensureEquipmentSlots` to player creation | Perf | equipmentService | Low | Saves 1 query per equip/unequip |
| 17 | Derive attack style from equipment stats (eliminate duplicate fetch) | N+1 | pvpCombatantBuilder, pvpService | Medium | `getEquipmentStats` and `getAttackStyle` both fetch main-hand; derive style from stats result |
| 18 | Share skill levels between `getResourceState` and `buildPerActionScaling` | N+1 | combatOrchestrationService | Medium | `getResourceState` fetches all skills via `findMany`; pass result to `buildPerActionScaling` to avoid re-fetch |

---

## Estimated Impact

| Phase | Tasks | Queries Saved / Combat | Queries Saved / PvP |
|-------|-------|------------------------|---------------------|
| Indexes | 1 | Faster scans → index seeks | Faster notification + ladder queries |
| Select clauses | 2-7 | ~80% less data transferred | ~80% less on history/notifications |
| Redis caching | 8-11 | ~10-15 queries eliminated | ~5-8 queries eliminated |
| Dedup & batching | 12-15 | ~8-10 queries eliminated | ~8 queries eliminated |
| **Total** | **15 tasks** | **~18-25 fewer queries + faster remaining** | **~13-16 fewer queries** |

Current per-combat query count: ~36-53 (combat prep + post-combat).
After all fixes: ~15-28 (estimated ~50% reduction).
