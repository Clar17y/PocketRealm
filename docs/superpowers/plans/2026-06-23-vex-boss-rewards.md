# Vex Boss Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Vex boss-reward exchanges: stronger boss-crafted gear, Aegis off-hand progression, one-time max durability reinforcement, and boss-only stat stones.

**Architecture:** Add a small permanent augment model on items, keep Vex exchange definitions typed and server-owned, and implement transactions in a focused API service. The first implementation exposes API and DTOs for Vex exchanges without implementing the full timed wandering-merchant spawn from issue #232; general item imbuements are tracked separately in GitHub issue #357.

**Tech Stack:** Next.js 16, Express 4, Prisma 6, PostgreSQL 16, Zod, Vitest, TypeScript.

---

## File Structure

- Modify: `packages/database/prisma/schema.prisma`
  Add `ItemAugment` and the `Item.itemAugments` relation.
- Create: `packages/database/prisma/migrations/<timestamp>_add_item_augments/migration.sql`
  Create the `item_augments` table, unique constraint, and indexes.
- Modify: `packages/database/prisma/seed-data/items.ts`
  Buff existing boss-crafted items and add `Wayfarer Aegis` and `Spiritbound Aegis` templates.
- Modify: `packages/database/prisma/seed-data/items.test.ts`
  Lock boss item stats and Aegis templates.
- Create: `packages/shared/src/types/vex.types.ts`
  Shared DTOs for list and purchase responses.
- Modify: `packages/shared/src/index.ts`
  Export Vex DTOs.
- Create: `apps/api/src/services/vexExchangeDefinitions.ts`
  Server-owned exchange catalogue, stat targets, costs, target rules, and effect definitions.
- Create: `apps/api/src/services/vexExchangeService.ts`
  List exchanges and purchase exchanges in Prisma transactions.
- Create: `apps/api/src/services/vexExchangeService.test.ts`
  Unit tests for listing, validation, transactions, augment uniqueness, and item mutations.
- Create: `apps/api/src/routes/vex.ts`
  Authenticated Vex list and purchase routes.
- Modify: `apps/api/src/app.ts`
  Mount `/api/v1/vex`.
- Modify: `apps/api/src/routes/seasonFreeze.test.ts`
  Confirm Vex purchase route is blocked when the season is ended.
- Create: `apps/web/src/lib/api/vex.ts`
  Web API client helpers and response types.
- Modify: `apps/web/src/lib/api/index.ts`
  Export Vex client helpers and types.

---

### Task 1: Add ItemAugment Persistence

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_item_augments/migration.sql`

- [ ] **Step 1: Update the Prisma schema**

In `packages/database/prisma/schema.prisma`, add the relation to `Item`:

```prisma
model Item {
  id                String   @id @default(uuid())
  templateId        String   @map("template_id")
  ownerId           String   @map("owner_id")
  rarity            String   @default("common") @db.VarChar(16)
  currentDurability Float?   @map("current_durability")
  maxDurability     Int?     @map("max_durability")
  quantity          Int      @default(1)
  bonusStats        Json?    @map("bonus_stats")
  createdAt         DateTime @default(now()) @map("created_at")
  inStash           Boolean  @default(false) @map("in_stash")
  isSoulbound       Boolean  @default(false) @map("is_soulbound")

  template     ItemTemplate      @relation(fields: [templateId], references: [id])
  owner        Player            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  equipment    PlayerEquipment[]
  itemAugments ItemAugment[]

  @@index([ownerId, inStash])
  @@index([ownerId, templateId, inStash])
  @@map("items")
}
```

Add this model below `Item`:

```prisma
model ItemAugment {
  id          String   @id @default(uuid())
  itemId      String   @map("item_id")
  augmentType String   @map("augment_type") @db.VarChar(64)
  sourceKey   String   @map("source_key") @db.VarChar(64)
  metadata    Json?
  appliedAt   DateTime @default(now()) @map("applied_at")

  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([itemId, augmentType])
  @@index([sourceKey])
  @@map("item_augments")
}
```

- [ ] **Step 2: Create the migration**

Run:

```powershell
npm run db:migrate -- --name add_item_augments
```

Expected: Prisma creates a new directory under `packages/database/prisma/migrations/` and applies it to the worktree database.

The generated SQL must contain this shape:

```sql
CREATE TABLE "item_augments" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "augment_type" VARCHAR(64) NOT NULL,
    "source_key" VARCHAR(64) NOT NULL,
    "metadata" JSONB,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_augments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_augments_item_id_augment_type_key" ON "item_augments"("item_id", "augment_type");
CREATE INDEX "item_augments_source_key_idx" ON "item_augments"("source_key");

ALTER TABLE "item_augments"
ADD CONSTRAINT "item_augments_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate Prisma client**

Run:

```powershell
npm run db:generate
```

Expected: command exits 0 and Prisma client exposes `prisma.itemAugment`.

- [ ] **Step 4: Verify schema compiles**

Run:

```powershell
npm run typecheck
```

Expected: if this is the only change so far, typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat: add item augment persistence"
```

---

### Task 2: Buff Boss Gear And Add Aegis Templates

**Files:**
- Modify: `packages/database/prisma/seed-data/items.ts`
- Modify: `packages/database/prisma/seed-data/items.test.ts`

- [ ] **Step 1: Write failing seed tests**

Add these tests to `packages/database/prisma/seed-data/items.test.ts` inside `describe('item seed combat data', () => { ... })`:

```ts
  it('boss-crafted item templates have target combat stats', () => {
    const templates = new Map(getAllItemTemplates().map((item) => [item.name, item]));

    expect(templates.get('Wolfsbane Blade')).toMatchObject({
      itemType: 'weapon',
      slot: 'main_hand',
      tier: 2,
      requiredLevel: 8,
      maxDurability: 110,
      baseStats: { attack: 13, accuracy: 4, critChance: 0.03 },
    });
    expect(templates.get('Alpha Pelt Chest')).toMatchObject({
      itemType: 'armor',
      slot: 'chest',
      tier: 2,
      requiredLevel: 8,
      maxDurability: 120,
      baseStats: { armor: 7, health: 8, dodge: 3 },
    });
    expect(templates.get('Spirit Staff')).toMatchObject({
      itemType: 'weapon',
      slot: 'main_hand',
      tier: 4,
      requiredLevel: 16,
      maxDurability: 130,
      baseStats: { magicPower: 24, accuracy: 4, critChance: 0.04 },
    });
    expect(templates.get('Ethereal Robes')).toMatchObject({
      itemType: 'armor',
      slot: 'chest',
      tier: 4,
      requiredLevel: 16,
      maxDurability: 140,
      baseStats: { magicDefence: 12, health: 12, dodge: 4, magicPower: 3 },
    });
  });

  it('defines Vex Aegis off-hand templates', () => {
    const templates = new Map(getAllItemTemplates().map((item) => [item.name, item]));

    expect(templates.get('Wayfarer Aegis')).toMatchObject({
      itemType: 'armor',
      weightClass: 'medium',
      slot: 'off_hand',
      tier: 2,
      requiredSkill: null,
      requiredLevel: 8,
      maxDurability: 100,
      stackable: false,
      sellPrice: 0,
      baseStats: { accuracy: 10, armor: 4, health: 8 },
    });
    expect(templates.get('Spiritbound Aegis')).toMatchObject({
      itemType: 'armor',
      weightClass: 'medium',
      slot: 'off_hand',
      tier: 4,
      requiredSkill: null,
      requiredLevel: 16,
      maxDurability: 140,
      stackable: false,
      sellPrice: 0,
      baseStats: { accuracy: 14, magicDefence: 8, armor: 5, health: 12 },
    });
  });
```

- [ ] **Step 2: Run seed tests to verify failure**

Run:

```powershell
npm run test -- packages/database/prisma/seed-data/items.test.ts
```

Expected: FAIL because the boss stats and Aegis templates have not been updated yet.

- [ ] **Step 3: Update existing boss item templates**

In `packages/database/prisma/seed-data/items.ts`, update these existing template entries:

```ts
{
  name: 'Wolfsbane Blade',
  itemType: 'weapon',
  weightClass: null,
  slot: 'main_hand',
  tier: 2,
  baseStats: { attack: 13, accuracy: 4, critChance: 0.03 },
  requiredSkill: 'melee',
  requiredLevel: 8,
  maxDurability: 110,
  stackable: false,
  consumableEffect: null,
  sellPrice: 0,
  flavorText: 'A blade set with Alpha Wolf fangs. It bites with the certainty of the pack leader that died for it.',
},
{
  name: 'Alpha Pelt Chest',
  itemType: 'armor',
  weightClass: 'medium',
  slot: 'chest',
  tier: 2,
  baseStats: { armor: 7, health: 8, dodge: 3 },
  requiredSkill: null,
  requiredLevel: 8,
  maxDurability: 120,
  stackable: false,
  consumableEffect: null,
  sellPrice: 0,
  flavorText: 'Layered pelt from an Alpha Wolf, warm enough to feel alive when danger is close.',
},
{
  name: 'Spirit Staff',
  itemType: 'weapon',
  weightClass: null,
  slot: 'main_hand',
  tier: 4,
  baseStats: { magicPower: 24, accuracy: 4, critChance: 0.04 },
  requiredSkill: 'magic',
  requiredLevel: 16,
  maxDurability: 130,
  stackable: false,
  consumableEffect: null,
  sellPrice: 0,
  flavorText: 'A staff threaded with Spirit Essence. It hums when no wind is blowing.',
},
{
  name: 'Ethereal Robes',
  itemType: 'armor',
  weightClass: 'light',
  slot: 'chest',
  tier: 4,
  baseStats: { magicDefence: 12, health: 12, dodge: 4, magicPower: 3 },
  requiredSkill: null,
  requiredLevel: 16,
  maxDurability: 140,
  stackable: false,
  consumableEffect: null,
  sellPrice: 0,
  flavorText: 'Robes stitched with thread that refuses to cast a shadow.',
},
```

- [ ] **Step 4: Add Aegis item templates**

Add these entries near the other off-hand armor templates in `packages/database/prisma/seed-data/items.ts`:

```ts
{
  name: 'Wayfarer Aegis',
  itemType: 'armor',
  weightClass: 'medium',
  slot: 'off_hand',
  tier: 2,
  baseStats: { accuracy: 10, armor: 4, health: 8 },
  requiredSkill: null,
  requiredLevel: 8,
  maxDurability: 100,
  stackable: false,
  consumableEffect: null,
  sellPrice: 0,
  flavorText: 'A travelling buckler remade for people who learned that the road eventually bites back.',
},
{
  name: 'Spiritbound Aegis',
  itemType: 'armor',
  weightClass: 'medium',
  slot: 'off_hand',
  tier: 4,
  baseStats: { accuracy: 14, magicDefence: 8, armor: 5, health: 12 },
  requiredSkill: null,
  requiredLevel: 16,
  maxDurability: 140,
  stackable: false,
  consumableEffect: null,
  sellPrice: 0,
  flavorText: 'The Wayfarer shape remains, but something unseen now watches from behind it.',
},
```

- [ ] **Step 5: Run seed tests**

Run:

```powershell
npm run test -- packages/database/prisma/seed-data/items.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/database/prisma/seed-data/items.ts packages/database/prisma/seed-data/items.test.ts
git commit -m "feat: strengthen boss reward item templates"
```

---

### Task 3: Add Shared Vex DTOs

**Files:**
- Create: `packages/shared/src/types/vex.types.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create shared Vex response types**

Create `packages/shared/src/types/vex.types.ts`:

```ts
import type { ItemStats } from './item.types';
import type { StateUpdates } from './stateUpdates.types';

export type VexExchangeCategory = 'item' | 'upgrade' | 'service' | 'boss_stone';

export interface VexRequiredItem {
  itemTemplateName: string;
  quantity: number;
  ownedQuantity: number;
}

export interface VexTargetOption {
  itemId: string;
  itemName: string;
  slot: string | null;
  rarity: string;
  currentDurability: number | null;
  maxDurability: number | null;
  alreadyApplied: boolean;
  baseStats: ItemStats;
  bonusStats: ItemStats | null;
}

export interface VexExchangeView {
  key: string;
  name: string;
  description: string;
  category: VexExchangeCategory;
  goldCost: number;
  playerGold: number;
  requiredItems: VexRequiredItem[];
  targetOptions: VexTargetOption[];
  canPurchase: boolean;
  blockedReason: string | null;
  sortOrder: number;
}

export interface VexExchangeListResponse {
  exchanges: VexExchangeView[];
  gold: number;
}

export interface VexPurchaseResponse {
  exchangeKey: string;
  message: string;
  stateUpdates?: StateUpdates;
}
```

- [ ] **Step 2: Export the types**

In `packages/shared/src/index.ts`, add:

```ts
export type {
  VexExchangeCategory,
  VexExchangeListResponse,
  VexExchangeView,
  VexPurchaseResponse,
  VexRequiredItem,
  VexTargetOption,
} from './types/vex.types';
```

- [ ] **Step 3: Run shared package checks**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add packages/shared/src/types/vex.types.ts packages/shared/src/index.ts
git commit -m "feat: add Vex exchange DTOs"
```

---

### Task 4: Define The Vex Exchange Catalogue

**Files:**
- Create: `apps/api/src/services/vexExchangeDefinitions.ts`

- [ ] **Step 1: Create Vex exchange definitions**

Create `apps/api/src/services/vexExchangeDefinitions.ts`:

```ts
import type { ItemStats } from '@pocketrealm/shared';

export type VexAugmentType = 'durability_reinforcement' | 'boss_stone';

export type VexExchangeEffect =
  | { type: 'create_item'; itemTemplateName: string; soulbound: boolean }
  | { type: 'transform_item'; fromTemplateName: string; toTemplateName: string; soulbound: boolean }
  | { type: 'reinforce_durability'; augmentType: 'durability_reinforcement'; bonusPercent: number }
  | { type: 'apply_bonus_stats'; augmentType: 'boss_stone'; eligibleTemplateNames: string[]; bonusStats: ItemStats };

export type VexTargetRule =
  | { type: 'none' }
  | { type: 'equipment'; itemTypes: Array<'weapon' | 'armor'>; augmentType: VexAugmentType }
  | { type: 'template'; templateNames: string[]; augmentType?: VexAugmentType };

export interface VexExchangeDefinition {
  key: string;
  name: string;
  description: string;
  category: 'item' | 'upgrade' | 'service' | 'boss_stone';
  goldCost: number;
  requiredItems: Array<{ itemTemplateName: string; quantity: number }>;
  targetRule: VexTargetRule;
  effect: VexExchangeEffect;
  sortOrder: number;
}

export const VEX_EXCHANGES: VexExchangeDefinition[] = [
  {
    key: 'wayfarer_aegis',
    name: 'Wayfarer Aegis',
    description: 'Trade Alpha Wolf trophies for an accuracy off-hand inspired by the old Wayfinder Buckler.',
    category: 'item',
    goldCost: 750,
    requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 4 }],
    targetRule: { type: 'none' },
    effect: { type: 'create_item', itemTemplateName: 'Wayfarer Aegis', soulbound: true },
    sortOrder: 10,
  },
  {
    key: 'spiritbound_aegis',
    name: 'Spiritbound Aegis',
    description: 'Upgrade a Wayfarer Aegis with Spirit Essence. The old shield becomes the new one.',
    category: 'upgrade',
    goldCost: 2500,
    requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 6 }],
    targetRule: { type: 'template', templateNames: ['Wayfarer Aegis'] },
    effect: { type: 'transform_item', fromTemplateName: 'Wayfarer Aegis', toTemplateName: 'Spiritbound Aegis', soulbound: true },
    sortOrder: 20,
  },
  {
    key: 'vex_temper_tier_1_3',
    name: 'Vex Temper',
    description: 'Restore and reinforce a tier 1-3 weapon or armor item. Each item can be tempered once.',
    category: 'service',
    goldCost: 1000,
    requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 2 }],
    targetRule: { type: 'equipment', itemTypes: ['weapon', 'armor'], augmentType: 'durability_reinforcement' },
    effect: { type: 'reinforce_durability', augmentType: 'durability_reinforcement', bonusPercent: 0.2 },
    sortOrder: 30,
  },
  {
    key: 'vex_temper_tier_4_5',
    name: 'Vex Temper',
    description: 'Restore and reinforce a tier 4-5 weapon or armor item. Each item can be tempered once.',
    category: 'service',
    goldCost: 3000,
    requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 2 }],
    targetRule: { type: 'equipment', itemTypes: ['weapon', 'armor'], augmentType: 'durability_reinforcement' },
    effect: { type: 'reinforce_durability', augmentType: 'durability_reinforcement', bonusPercent: 0.2 },
    sortOrder: 40,
  },
  {
    key: 'fangstone',
    name: 'Fangstone',
    description: 'Set Alpha Wolf pressure into a boss-crafted item. Each item can hold one boss stone.',
    category: 'boss_stone',
    goldCost: 1500,
    requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 3 }],
    targetRule: { type: 'template', templateNames: ['Wolfsbane Blade', 'Alpha Pelt Chest'], augmentType: 'boss_stone' },
    effect: {
      type: 'apply_bonus_stats',
      augmentType: 'boss_stone',
      eligibleTemplateNames: ['Wolfsbane Blade', 'Alpha Pelt Chest'],
      bonusStats: { attack: 2, accuracy: 2, armor: 1, health: 3 },
    },
    sortOrder: 50,
  },
  {
    key: 'spiritstone',
    name: 'Spiritstone',
    description: 'Bind Spirit Essence into a boss-crafted item. Each item can hold one boss stone.',
    category: 'boss_stone',
    goldCost: 3500,
    requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 3 }],
    targetRule: { type: 'template', templateNames: ['Spirit Staff', 'Ethereal Robes'], augmentType: 'boss_stone' },
    effect: {
      type: 'apply_bonus_stats',
      augmentType: 'boss_stone',
      eligibleTemplateNames: ['Spirit Staff', 'Ethereal Robes'],
      bonusStats: { magicPower: 3, accuracy: 2, magicDefence: 2, health: 4 },
    },
    sortOrder: 60,
  },
];
```

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add apps/api/src/services/vexExchangeDefinitions.ts
git commit -m "feat: define Vex boss reward exchanges"
```

---

### Task 5: Implement Vex Exchange Service

**Files:**
- Create: `apps/api/src/services/vexExchangeService.ts`
- Create: `apps/api/src/services/vexExchangeService.test.ts`

- [ ] **Step 1: Write service tests for listing and invalid purchases**

Create `apps/api/src/services/vexExchangeService.test.ts` with these first tests:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => ({
  prisma: {
    player: { findUnique: vi.fn(), updateMany: vi.fn() },
    itemTemplate: { findMany: vi.fn(), findUnique: vi.fn() },
    item: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    itemAugment: { create: vi.fn() },
    playerEquipment: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn) => fn({
      player: { findUnique: vi.fn(), updateMany: vi.fn() },
      itemTemplate: { findMany: vi.fn(), findUnique: vi.fn() },
      item: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      itemAugment: { create: vi.fn() },
    })),
  },
}));

vi.mock('./inventoryService', () => ({
  consumeItemsByTemplateTx: vi.fn(),
  getTotalQuantityByTemplate: vi.fn(),
}));

vi.mock('./equipmentService', () => ({
  invalidateEquipmentCache: vi.fn(),
}));

import { prisma } from '@pocketrealm/database';
import { getTotalQuantityByTemplate } from './inventoryService';
import { listVexExchanges, purchaseVexExchange } from './vexExchangeService';

const db = vi.mocked(prisma);
const mockedGetTotalQuantityByTemplate = vi.mocked(getTotalQuantityByTemplate);

describe('vexExchangeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists Vex exchanges with owned material quantities and player gold', async () => {
    db.player.findUnique.mockResolvedValue({ id: 'p1', gold: 900 } as never);
    mockedGetTotalQuantityByTemplate.mockResolvedValue(5);
    db.item.findMany.mockResolvedValue([] as never);

    const result = await listVexExchanges('p1');

    expect(result.gold).toBe(900);
    expect(result.exchanges.some((exchange) => exchange.key === 'wayfarer_aegis')).toBe(true);
    expect(result.exchanges[0]!.playerGold).toBe(900);
    expect(result.exchanges[0]!.requiredItems[0]!.ownedQuantity).toBe(5);
  });

  it('rejects an unknown exchange key', async () => {
    await expect(purchaseVexExchange('p1', 'missing_exchange', {}))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_EXCHANGE' });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm run test -- apps/api/src/services/vexExchangeService.test.ts
```

Expected: FAIL because `vexExchangeService.ts` does not exist.

- [ ] **Step 3: Implement service helpers and list function**

Create `apps/api/src/services/vexExchangeService.ts`:

```ts
import { Prisma, prisma } from '@pocketrealm/database';
import type { ItemStats, VexExchangeListResponse, VexExchangeView, VexTargetOption } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { consumeItemsByTemplateTx, getTotalQuantityByTemplate } from './inventoryService';
import { invalidateEquipmentCache } from './equipmentService';
import { VEX_EXCHANGES, type VexExchangeDefinition, type VexExchangeEffect, type VexTargetRule } from './vexExchangeDefinitions';

interface PurchaseParams {
  targetItemId?: string;
}

export interface VexPurchaseServiceResult {
  exchangeKey: string;
  message: string;
  invalidatesEquipment: boolean;
}

type Tx = Prisma.TransactionClient;

function mergeStats(current: ItemStats | null | undefined, added: ItemStats): ItemStats {
  const next: ItemStats = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(added) as Array<[keyof ItemStats, number]>) {
    next[key] = ((next[key] ?? 0) as number) + value;
  }
  return next;
}

function getExchange(key: string): VexExchangeDefinition {
  const exchange = VEX_EXCHANGES.find((candidate) => candidate.key === key);
  if (!exchange) {
    throw new AppError(400, 'Invalid Vex exchange', 'INVALID_EXCHANGE');
  }
  return exchange;
}

async function resolveTemplateIdsByName(
  client: Pick<Tx, 'itemTemplate'>,
  names: string[],
): Promise<Map<string, string>> {
  const templates = await client.itemTemplate.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const map = new Map(templates.map((template) => [template.name, template.id]));
  for (const name of names) {
    if (!map.has(name)) {
      throw new AppError(500, `Missing item template: ${name}`, 'TEMPLATE_NOT_FOUND');
    }
  }
  return map;
}

async function findTargetOptions(playerId: string, rule: VexTargetRule): Promise<VexTargetOption[]> {
  if (rule.type === 'none') return [];

  const where = rule.type === 'equipment'
    ? { ownerId: playerId, template: { itemType: { in: rule.itemTypes } } }
    : { ownerId: playerId, template: { name: { in: rule.templateNames } } };

  const items = await prisma.item.findMany({
    where,
    include: {
      template: true,
      itemAugments: true,
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  return items.map((item) => ({
    itemId: item.id,
    itemName: item.template.name,
    slot: item.template.slot,
    rarity: item.rarity,
    currentDurability: item.currentDurability,
    maxDurability: item.maxDurability,
    alreadyApplied: rule.augmentType
      ? item.itemAugments.some((augment) => augment.augmentType === rule.augmentType)
      : false,
    baseStats: item.template.baseStats as ItemStats,
    bonusStats: item.bonusStats as ItemStats | null,
  }));
}

function getBlockedReason(exchange: VexExchangeDefinition, gold: number, requiredItems: VexExchangeView['requiredItems'], targetOptions: VexTargetOption[]): string | null {
  if (gold < exchange.goldCost) return 'Not enough gold';
  const missing = requiredItems.find((item) => item.ownedQuantity < item.quantity);
  if (missing) return `Missing ${missing.itemTemplateName}`;
  if (exchange.targetRule.type !== 'none' && targetOptions.filter((item) => !item.alreadyApplied).length === 0) {
    return 'No eligible target item';
  }
  return null;
}

export async function listVexExchanges(playerId: string): Promise<VexExchangeListResponse> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { gold: true },
  });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  const exchanges: VexExchangeView[] = [];
  for (const exchange of VEX_EXCHANGES) {
    const requiredItems = await Promise.all(exchange.requiredItems.map(async (required) => ({
      ...required,
      ownedQuantity: await getTotalQuantityByTemplate(playerId, (await resolveTemplateIdsByName(prisma, [required.itemTemplateName])).get(required.itemTemplateName)!),
    })));
    const targetOptions = await findTargetOptions(playerId, exchange.targetRule);
    const blockedReason = getBlockedReason(exchange, player.gold, requiredItems, targetOptions);
    exchanges.push({
      key: exchange.key,
      name: exchange.name,
      description: exchange.description,
      category: exchange.category,
      goldCost: exchange.goldCost,
      playerGold: player.gold,
      requiredItems,
      targetOptions,
      canPurchase: blockedReason === null,
      blockedReason,
      sortOrder: exchange.sortOrder,
    });
  }

  return { exchanges: exchanges.sort((a, b) => a.sortOrder - b.sortOrder), gold: player.gold };
}
```

- [ ] **Step 4: Add purchase tests for create, transform, temper, and boss stone**

Append tests covering these exact outcomes:

```ts
  it('creates a soulbound Wayfarer Aegis after spending gold and fangs', async () => {
    const tx = {
      player: {
        findUnique: vi.fn().mockResolvedValue({ id: 'p1', gold: 1000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      itemTemplate: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'fang-template', name: 'Alpha Wolf Fang' },
          { id: 'aegis-template', name: 'Wayfarer Aegis', maxDurability: 100 },
        ]),
        findUnique: vi.fn(),
      },
      item: {
        create: vi.fn().mockResolvedValue({ id: 'new-aegis' }),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      itemAugment: { create: vi.fn() },
    };
    db.$transaction.mockImplementationOnce(async (fn) => fn(tx as never));

    const result = await purchaseVexExchange('p1', 'wayfarer_aegis', {});

    expect(tx.player.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', gold: { gte: 750 } },
      data: { gold: { decrement: 750 } },
    });
    expect(tx.item.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'p1',
        templateId: 'aegis-template',
        rarity: 'common',
        quantity: 1,
        maxDurability: 100,
        currentDurability: 100,
        bonusStats: undefined,
        isSoulbound: true,
      },
      select: { id: true },
    });
    expect(result.message).toContain('Wayfarer Aegis');
  });
```

Add similar tests with these assertions:

```ts
expect(tx.item.update).toHaveBeenCalledWith({
  where: { id: 'wayfarer-item' },
  data: {
    templateId: 'spiritbound-template',
    maxDurability: 140,
    currentDurability: 140,
    bonusStats: undefined,
    isSoulbound: true,
  },
});
```

```ts
expect(tx.item.update).toHaveBeenCalledWith({
  where: { id: 'target-item' },
  data: {
    maxDurability: 120,
    currentDurability: 120,
  },
});
expect(tx.itemAugment.create).toHaveBeenCalledWith({
  data: {
    itemId: 'target-item',
    augmentType: 'durability_reinforcement',
    sourceKey: 'vex_temper_tier_1_3',
    metadata: { previousMaxDurability: 80, newMaxDurability: 120 },
  },
});
```

```ts
expect(tx.item.update).toHaveBeenCalledWith({
  where: { id: 'target-item' },
  data: { bonusStats: { attack: 3, accuracy: 2, armor: 1, health: 3 } },
});
expect(tx.itemAugment.create).toHaveBeenCalledWith({
  data: {
    itemId: 'target-item',
    augmentType: 'boss_stone',
    sourceKey: 'fangstone',
    metadata: { bonusStats: { attack: 2, accuracy: 2, armor: 1, health: 3 } },
  },
});
```

- [ ] **Step 5: Complete purchase implementation**

Append these functions to `apps/api/src/services/vexExchangeService.ts`:

```ts
async function spendGold(tx: Tx, playerId: string, goldCost: number): Promise<void> {
  const updated = await tx.player.updateMany({
    where: { id: playerId, gold: { gte: goldCost } },
    data: { gold: { decrement: goldCost } },
  });
  if (updated.count !== 1) {
    throw new AppError(400, 'Not enough gold', 'INSUFFICIENT_GOLD');
  }
}

async function consumeRequiredItems(tx: Tx, playerId: string, exchange: VexExchangeDefinition): Promise<void> {
  const templateNames = exchange.requiredItems.map((item) => item.itemTemplateName);
  const templateIds = await resolveTemplateIdsByName(tx, templateNames);
  for (const required of exchange.requiredItems) {
    await consumeItemsByTemplateTx(tx, playerId, templateIds.get(required.itemTemplateName)!, required.quantity);
  }
}

async function getOwnedTarget(tx: Tx, playerId: string, targetItemId: string) {
  const target = await tx.item.findUnique({
    where: { id: targetItemId },
    include: { template: true, itemAugments: true, equipment: true },
  });
  if (!target || target.ownerId !== playerId) {
    throw new AppError(404, 'Target item not found', 'TARGET_NOT_FOUND');
  }
  return target;
}

async function applyCreateItem(tx: Tx, playerId: string, exchange: VexExchangeDefinition, effect: Extract<VexExchangeEffect, { type: 'create_item' }>): Promise<string> {
  const templateIds = await resolveTemplateIdsByName(tx, [effect.itemTemplateName]);
  const template = await tx.itemTemplate.findUnique({
    where: { id: templateIds.get(effect.itemTemplateName)! },
    select: { id: true, name: true, maxDurability: true },
  });
  if (!template) throw new AppError(500, `Missing item template: ${effect.itemTemplateName}`, 'TEMPLATE_NOT_FOUND');

  await tx.item.create({
    data: {
      ownerId: playerId,
      templateId: template.id,
      rarity: 'common',
      quantity: 1,
      maxDurability: template.maxDurability,
      currentDurability: template.maxDurability,
      bonusStats: undefined,
      isSoulbound: effect.soulbound,
    },
    select: { id: true },
  });
  return `${template.name} is yours. Vex considers the transaction unusually fair.`;
}

async function applyTransformItem(tx: Tx, playerId: string, exchange: VexExchangeDefinition, effect: Extract<VexExchangeEffect, { type: 'transform_item' }>, targetItemId?: string): Promise<{ message: string; invalidatesEquipment: boolean }> {
  if (!targetItemId) throw new AppError(400, 'Target item is required', 'TARGET_REQUIRED');
  const target = await getOwnedTarget(tx, playerId, targetItemId);
  if (target.template.name !== effect.fromTemplateName) {
    throw new AppError(400, 'Target item is not eligible for this exchange', 'INVALID_TARGET');
  }
  const templateIds = await resolveTemplateIdsByName(tx, [effect.toTemplateName]);
  const nextTemplate = await tx.itemTemplate.findUnique({
    where: { id: templateIds.get(effect.toTemplateName)! },
    select: { id: true, name: true, maxDurability: true },
  });
  if (!nextTemplate) throw new AppError(500, `Missing item template: ${effect.toTemplateName}`, 'TEMPLATE_NOT_FOUND');

  await tx.item.update({
    where: { id: target.id },
    data: {
      templateId: nextTemplate.id,
      maxDurability: nextTemplate.maxDurability,
      currentDurability: nextTemplate.maxDurability,
      bonusStats: undefined,
      isSoulbound: effect.soulbound,
    },
  });
  return { message: `${nextTemplate.name} wakes in your hand. Vex refuses to explain the whispering.`, invalidatesEquipment: target.equipment.length > 0 };
}

async function applyDurabilityReinforcement(tx: Tx, playerId: string, exchange: VexExchangeDefinition, effect: Extract<VexExchangeEffect, { type: 'reinforce_durability' }>, targetItemId?: string): Promise<{ message: string; invalidatesEquipment: boolean }> {
  if (!targetItemId) throw new AppError(400, 'Target item is required', 'TARGET_REQUIRED');
  const target = await getOwnedTarget(tx, playerId, targetItemId);
  if (target.template.itemType !== 'weapon' && target.template.itemType !== 'armor') {
    throw new AppError(400, 'Only weapons and armor can be tempered', 'INVALID_TARGET');
  }
  if (target.itemAugments.some((augment) => augment.augmentType === effect.augmentType)) {
    throw new AppError(400, 'Item has already been tempered', 'AUGMENT_ALREADY_APPLIED');
  }
  const previousMaxDurability = target.maxDurability ?? target.template.maxDurability;
  const newMaxDurability = Math.ceil(target.template.maxDurability * (1 + effect.bonusPercent));

  await tx.item.update({
    where: { id: target.id },
    data: {
      maxDurability: newMaxDurability,
      currentDurability: newMaxDurability,
    },
  });
  await tx.itemAugment.create({
    data: {
      itemId: target.id,
      augmentType: effect.augmentType,
      sourceKey: exchange.key,
      metadata: { previousMaxDurability, newMaxDurability },
    },
  });
  return { message: `${target.template.name} has been tempered. Vex says the cracks were negotiable.`, invalidatesEquipment: target.equipment.length > 0 };
}

async function applyBossStone(tx: Tx, playerId: string, exchange: VexExchangeDefinition, effect: Extract<VexExchangeEffect, { type: 'apply_bonus_stats' }>, targetItemId?: string): Promise<{ message: string; invalidatesEquipment: boolean }> {
  if (!targetItemId) throw new AppError(400, 'Target item is required', 'TARGET_REQUIRED');
  const target = await getOwnedTarget(tx, playerId, targetItemId);
  if (!effect.eligibleTemplateNames.includes(target.template.name)) {
    throw new AppError(400, 'Target item is not eligible for this boss stone', 'INVALID_TARGET');
  }
  if (target.itemAugments.some((augment) => augment.augmentType === effect.augmentType)) {
    throw new AppError(400, 'Item already has a boss stone', 'AUGMENT_ALREADY_APPLIED');
  }
  const nextBonusStats = mergeStats(target.bonusStats as ItemStats | null, effect.bonusStats);
  await tx.item.update({
    where: { id: target.id },
    data: { bonusStats: nextBonusStats as Prisma.InputJsonObject },
  });
  await tx.itemAugment.create({
    data: {
      itemId: target.id,
      augmentType: effect.augmentType,
      sourceKey: exchange.key,
      metadata: { bonusStats: effect.bonusStats as Prisma.InputJsonObject },
    },
  });
  return { message: `${target.template.name} takes the stone. Vex smiles like that was the expensive part.`, invalidatesEquipment: target.equipment.length > 0 };
}

export async function purchaseVexExchange(playerId: string, exchangeKey: string, params: PurchaseParams): Promise<VexPurchaseServiceResult> {
  const exchange = getExchange(exchangeKey);
  let invalidatesEquipment = false;
  const message = await prisma.$transaction(async (tx) => {
    await spendGold(tx, playerId, exchange.goldCost);
    await consumeRequiredItems(tx, playerId, exchange);

    switch (exchange.effect.type) {
      case 'create_item':
        return applyCreateItem(tx, playerId, exchange, exchange.effect);
      case 'transform_item': {
        const result = await applyTransformItem(tx, playerId, exchange, exchange.effect, params.targetItemId);
        invalidatesEquipment = result.invalidatesEquipment;
        return result.message;
      }
      case 'reinforce_durability': {
        const result = await applyDurabilityReinforcement(tx, playerId, exchange, exchange.effect, params.targetItemId);
        invalidatesEquipment = result.invalidatesEquipment;
        return result.message;
      }
      case 'apply_bonus_stats': {
        const result = await applyBossStone(tx, playerId, exchange, exchange.effect, params.targetItemId);
        invalidatesEquipment = result.invalidatesEquipment;
        return result.message;
      }
    }
  });

  if (invalidatesEquipment) {
    await invalidateEquipmentCache(playerId);
  }

  return { exchangeKey, message, invalidatesEquipment };
}
```

- [ ] **Step 6: Run service tests**

Run:

```powershell
npm run test -- apps/api/src/services/vexExchangeService.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/services/vexExchangeService.ts apps/api/src/services/vexExchangeService.test.ts
git commit -m "feat: implement Vex exchange service"
```

---

### Task 6: Add Vex API Routes

**Files:**
- Create: `apps/api/src/routes/vex.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/seasonFreeze.test.ts`

- [ ] **Step 1: Create the route**

Create `apps/api/src/routes/vex.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireActiveSeason } from '../middleware/seasonGuard';
import { asyncHandler } from '../utils/asyncHandler';
import { buildStateUpdates, fetchEquipmentMap } from '../services/stateUpdateHelpers';
import { listVexExchanges, purchaseVexExchange } from '../services/vexExchangeService';

export const vexRouter = Router();
vexRouter.use(authenticate);

vexRouter.get('/exchanges', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  res.json(await listVexExchanges(playerId));
}));

const purchaseParamsSchema = z.object({
  exchangeKey: z.string().min(1),
});

const purchaseBodySchema = z.object({
  targetItemId: z.string().uuid().optional(),
}).default({});

vexRouter.post('/exchanges/:exchangeKey/purchase', requireActiveSeason, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { exchangeKey } = purchaseParamsSchema.parse(req.params);
  const body = purchaseBodySchema.parse(req.body);
  const result = await purchaseVexExchange(playerId, exchangeKey, body);
  const stateUpdates = await buildStateUpdates(playerId, ['gold', 'inventoryUsedSlots', 'inventoryCapacity', 'materialTotals']);
  if (result.invalidatesEquipment) {
    stateUpdates.equipment = await fetchEquipmentMap(playerId);
  }
  res.json({ exchangeKey: result.exchangeKey, message: result.message, stateUpdates });
}));
```

- [ ] **Step 2: Mount the route**

In `apps/api/src/app.ts`, add the import:

```ts
import { vexRouter } from './routes/vex';
```

Mount it after the shop route:

```ts
  app.use('/api/v1/shop', shopRouter);
  app.use('/api/v1/vex', vexRouter);
```

- [ ] **Step 3: Extend season freeze coverage**

In `apps/api/src/routes/seasonFreeze.test.ts`, add a mock and route mount for Vex:

```ts
vi.mock('../services/vexExchangeService', () => ({
  listVexExchanges: vi.fn(),
  purchaseVexExchange: vi.fn(),
}));
```

Add the route in the test app setup:

```ts
import { vexRouter } from './vex';
app.use('/api/v1/vex', vexRouter);
```

Add this test:

```ts
  it('blocks route-level guarded Vex exchange purchases for ended seasons', async () => {
    await request(app)
      .post('/api/v1/vex/exchanges/wayfarer_aegis/purchase')
      .send({})
      .expect(403);

    expect(purchaseVexExchange).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run route tests**

Run:

```powershell
npm run test -- apps/api/src/routes/seasonFreeze.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run API typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/routes/vex.ts apps/api/src/app.ts apps/api/src/routes/seasonFreeze.test.ts
git commit -m "feat: expose Vex exchange API"
```

---

### Task 7: Add Web API Client Types

**Files:**
- Create: `apps/web/src/lib/api/vex.ts`
- Modify: `apps/web/src/lib/api/index.ts`

- [ ] **Step 1: Add web API helpers**

Create `apps/web/src/lib/api/vex.ts`:

```ts
import type { VexExchangeListResponse, VexPurchaseResponse } from '@pocketrealm/shared';
import { fetchApi } from './core';

export async function getVexExchanges() {
  return fetchApi<VexExchangeListResponse>('/api/v1/vex/exchanges');
}

export async function purchaseVexExchange(exchangeKey: string, params?: { targetItemId?: string }) {
  return fetchApi<VexPurchaseResponse>(`/api/v1/vex/exchanges/${exchangeKey}/purchase`, {
    method: 'POST',
    body: params ? JSON.stringify(params) : undefined,
  });
}
```

- [ ] **Step 2: Export web API helpers**

In `apps/web/src/lib/api/index.ts`, add:

```ts
export { getVexExchanges, purchaseVexExchange } from './vex';
```

- [ ] **Step 3: Run web typecheck through the repo command**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/lib/api/vex.ts apps/web/src/lib/api/index.ts
git commit -m "feat: add Vex exchange API client"
```

---

### Task 8: Final Verification And Cleanup

**Files:**
- Review the diff from every file changed in Tasks 1-7.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- packages/database/prisma/seed-data/items.test.ts
npm run test -- apps/api/src/services/vexExchangeService.test.ts
npm run test -- apps/api/src/routes/seasonFreeze.test.ts
```

Expected: all commands PASS.

- [ ] **Step 2: Run broad static verification**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Invoke the simplify skill**

Because implementation changed code, invoke `superpowers:simplify` and review only touched code. Apply simplifications only when they reduce duplication or clarify boundaries without widening scope.

- [ ] **Step 4: Re-run focused verification after simplification**

Run:

```powershell
npm run test -- packages/database/prisma/seed-data/items.test.ts
npm run test -- apps/api/src/services/vexExchangeService.test.ts
npm run test -- apps/api/src/routes/seasonFreeze.test.ts
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Review git diff**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Expected:

- `git diff --check` exits 0.
- Only Vex boss reward files, schema/migration files, seed data, and Vex API client files are changed.
- General imbuements are not implemented; they remain in GitHub issue #357.

- [ ] **Step 6: Final commit if simplification changed files**

If Task 8 simplification changed code, commit those changes:

```powershell
git add .
git commit -m "refactor: simplify Vex exchange implementation"
```

Expected: commit succeeds or there are no simplification changes to commit.

---

## Self-Review Notes

- Spec coverage:
  - Boss item buffs: Task 2.
  - Aegis line and chained upgrade: Tasks 2, 4, 5.
  - Max durability reinforcement: Tasks 1, 4, 5.
  - Boss stones and one-time application: Tasks 1, 4, 5.
  - Transactional gold/material/item mutation: Task 5.
  - API exposure for UI: Tasks 6, 7.
  - Full timed Vex spawn: excluded by design and not planned here.
  - General item imbuements: excluded and tracked in GitHub issue #357.
- Type consistency:
  - `augmentType` values are `durability_reinforcement` and `boss_stone` across schema metadata, definitions, and service logic.
  - `VexPurchaseResponse` includes `stateUpdates` at the route layer, not inside the service transaction.
  - `targetItemId` is optional in the route body but required by service effects that mutate an existing item.
