# Admin Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an in-game admin panel that lets admins grant themselves turns, items, XP, levels, attributes, discover zones, teleport, spawn encounter sites, spawn/cancel world events, and spawn world bosses — plus PvP ELO protection and admin tags on leaderboards.

**Architecture:** Single `admin.ts` route file with `requireAdmin` middleware guards all 15 endpoints. Frontend adds an `/admin` screen within the existing game page (new Screen type value), with 4 tabbed sections (Player, Items, World, Zones). The `role` field is added to the GET /player response and frontend auth context so the admin nav link renders conditionally.

**Tech Stack:** Express routes, Prisma ORM, Zod validation, Next.js React frontend, Redis (leaderboard metadata), existing RPG theme CSS variables.

---

### Task 1: `requireAdmin` Middleware

**Files:**
- Create: `apps/api/src/middleware/admin.ts`

**Step 1: Create the middleware**

```typescript
// apps/api/src/middleware/admin.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.player?.role !== 'admin') {
    throw new AppError(403, 'Admin access required', 'FORBIDDEN');
  }
  next();
}
```

**Step 2: Commit**

```bash
git add apps/api/src/middleware/admin.ts
git commit -m "feat: add requireAdmin middleware"
```

---

### Task 2: Admin Route File — Player Endpoints

**Files:**
- Create: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/index.ts:1-102` (add import + route registration)

**Step 1: Create admin route file with player endpoints**

Create `apps/api/src/routes/admin.ts` with:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@adventure/database';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { refundPlayerTurns } from '../services/turnBankService';
import { xpForLevel, characterLevelFromXp } from '@adventure/game-engine';
import { ATTRIBUTE_TYPES, CHARACTER_CONSTANTS, type PlayerAttributes } from '@adventure/shared';
import { normalizePlayerAttributes } from '../services/attributesService';

const router = Router();
router.use(authenticate, requireAdmin);

// Async handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// POST /admin/turns/grant
const grantTurnsSchema = z.object({ amount: z.number().int().min(1).max(1_000_000) });

router.post('/turns/grant', asyncHandler(async (req, res) => {
  const { amount } = grantTurnsSchema.parse(req.body);
  const result = await refundPlayerTurns(req.player!.playerId, amount);
  res.json({ success: true, ...result });
}));

// POST /admin/player/level
const setLevelSchema = z.object({ level: z.number().int().min(1).max(CHARACTER_CONSTANTS.MAX_LEVEL) });

router.post('/player/level', asyncHandler(async (req, res) => {
  const { level } = setLevelSchema.parse(req.body);
  const xp = xpForLevel(level);
  const player = await prisma.player.findUniqueOrThrow({ where: { id: req.player!.playerId } });
  const currentLevel = player.characterLevel;
  const levelDiff = Math.max(0, level - currentLevel);

  await prisma.player.update({
    where: { id: req.player!.playerId },
    data: {
      characterLevel: level,
      characterXp: BigInt(xp),
      attributePoints: { increment: levelDiff },
    },
  });
  res.json({ success: true, level, characterXp: xp });
}));

// POST /admin/player/xp
const grantXpSchema = z.object({ amount: z.number().int().min(1) });

router.post('/player/xp', asyncHandler(async (req, res) => {
  const { amount } = grantXpSchema.parse(req.body);
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: req.player!.playerId },
    select: { characterXp: true, characterLevel: true },
  });
  const newXp = Number(player.characterXp) + amount;
  const newLevel = characterLevelFromXp(newXp);
  const levelUps = Math.max(0, newLevel - player.characterLevel);

  await prisma.player.update({
    where: { id: req.player!.playerId },
    data: {
      characterXp: BigInt(newXp),
      characterLevel: newLevel,
      attributePoints: { increment: levelUps },
    },
  });
  res.json({ success: true, characterXp: newXp, characterLevel: newLevel, levelUps });
}));

// POST /admin/player/attributes
const setAttributesSchema = z.object({
  attributePoints: z.number().int().min(0).optional(),
  attributes: z.record(z.enum(['vitality', 'strength', 'dexterity', 'intelligence', 'luck', 'evasion']), z.number().int().min(0)).optional(),
});

router.post('/player/attributes', asyncHandler(async (req, res) => {
  const body = setAttributesSchema.parse(req.body);
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: req.player!.playerId },
    select: { attributes: true, attributePoints: true },
  });
  const current = normalizePlayerAttributes(player.attributes);
  const merged: PlayerAttributes = { ...current, ...(body.attributes ?? {}) };
  const data: Record<string, unknown> = {};
  if (body.attributes) data.attributes = merged;
  if (body.attributePoints !== undefined) data.attributePoints = body.attributePoints;

  await prisma.player.update({ where: { id: req.player!.playerId }, data });
  res.json({ success: true, attributes: merged, attributePoints: body.attributePoints ?? player.attributePoints });
}));

export const adminRouter = router;
```

**Step 2: Register admin router in index.ts**

In `apps/api/src/index.ts`, add import at top (after line 23):
```typescript
import { adminRouter } from './routes/admin';
```

Add route registration (after line 102):
```typescript
app.use('/api/v1/admin', adminRouter);
```

**Step 3: Build and verify no TypeScript errors**

```bash
npm run build:api
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/index.ts
git commit -m "feat: add admin route with player endpoints (turns, level, xp, attributes)"
```

---

### Task 3: Admin Route — Item Endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Step 1: Add item endpoints to admin.ts**

Add these imports at the top:
```typescript
import { addStackableItem } from '../services/inventoryService';
import { rollBonusStatsForRarity } from '@adventure/game-engine';
import type { ItemRarity, EquipmentSlot, ItemType, ItemStats } from '@adventure/shared';
import { Prisma } from '@adventure/database';
```

Add these endpoints after the player endpoints:

```typescript
// GET /admin/items/templates
router.get('/items/templates', asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (type) where.itemType = type;

  const templates = await prisma.itemTemplate.findMany({
    where,
    orderBy: [{ itemType: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
    take: 100,
  });
  res.json({ templates });
}));

// POST /admin/items/grant
const grantItemSchema = z.object({
  templateId: z.string().uuid(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
  quantity: z.number().int().min(1).max(1000).default(1),
});

router.post('/items/grant', asyncHandler(async (req, res) => {
  const { templateId, rarity, quantity } = grantItemSchema.parse(req.body);
  const template = await prisma.itemTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const playerId = req.player!.playerId;

  if (template.stackable) {
    const result = await addStackableItem(playerId, templateId, quantity);
    res.json({ success: true, item: result });
    return;
  }

  // Non-stackable: create individual item(s) with rarity + bonus stats
  const items = [];
  for (let i = 0; i < quantity; i++) {
    const bonusStats = rollBonusStatsForRarity({
      itemType: template.itemType as ItemType,
      rarity: rarity as ItemRarity,
      baseStats: template.baseStats as ItemStats | null,
      slot: template.slot as EquipmentSlot | null,
    });
    const item = await prisma.item.create({
      data: {
        ownerId: playerId,
        templateId,
        rarity,
        quantity: 1,
        maxDurability: template.maxDurability,
        currentDurability: template.maxDurability,
        bonusStats: bonusStats ? (bonusStats as unknown as Prisma.InputJsonObject) : undefined,
      },
    });
    items.push(item);
  }
  res.json({ success: true, items });
}));
```

**Step 2: Build and verify**

```bash
npm run build:api
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "feat: add admin item grant endpoints (template search + item creation)"
```

---

### Task 4: Admin Route — World Event & Boss Endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Step 1: Add world event and boss imports**

Add to imports:
```typescript
import { WORLD_EVENT_TEMPLATES, WORLD_EVENT_CONSTANTS } from '@adventure/shared';
import { spawnWorldEvent, getEventById } from '../services/worldEventService';
import { createBossEncounter } from '../services/bossEncounterService';
```

**Step 2: Add world event and boss endpoints**

```typescript
// GET /admin/events/templates
router.get('/events/templates', (_req, res) => {
  res.json({ templates: WORLD_EVENT_TEMPLATES.map((t, i) => ({ id: i, ...t })) });
});

// POST /admin/events/spawn
const spawnEventSchema = z.object({
  templateIndex: z.number().int().min(0),
  zoneId: z.string().uuid(),
  durationHours: z.number().min(0.1).max(168).default(2),
});

router.post('/events/spawn', asyncHandler(async (req, res) => {
  const { templateIndex, zoneId, durationHours } = spawnEventSchema.parse(req.body);
  const template = WORLD_EVENT_TEMPLATES[templateIndex];
  if (!template) {
    res.status(400).json({ error: { message: 'Invalid template index', code: 'INVALID_TEMPLATE' } });
    return;
  }

  // Pick a target if template uses family/resource targeting
  let targetFamily: string | undefined;
  let targetResource: string | undefined;
  if (template.fixedTarget) {
    if (template.targeting === 'family') targetFamily = template.fixedTarget;
    if (template.targeting === 'resource') targetResource = template.fixedTarget;
  } else if (template.targeting === 'family') {
    // Pick a random mob family from the zone
    const families = await prisma.zoneMobFamily.findMany({
      where: { zoneId },
      include: { mobFamily: { select: { name: true } } },
    });
    if (families.length > 0) {
      targetFamily = families[Math.floor(Math.random() * families.length)].mobFamily.name;
    }
  } else if (template.targeting === 'resource') {
    const nodes = await prisma.resourceNode.findMany({
      where: { zoneId },
      select: { resourceType: true },
    });
    const types = [...new Set(nodes.map((n) => n.resourceType))];
    if (types.length > 0) {
      targetResource = types[Math.floor(Math.random() * types.length)];
    }
  }

  const title = template.title.replace('{target}', targetFamily ?? targetResource ?? 'Unknown');
  const description = template.description.replace('{target}', targetFamily ?? targetResource ?? 'Unknown');

  const event = await spawnWorldEvent({
    type: template.type,
    zoneId,
    title,
    description,
    effectType: template.effectType,
    effectValue: template.effectValue,
    targetFamily,
    targetResource,
    durationHours,
    createdBy: 'system',
  });

  res.json({ success: true, event });
}));

// POST /admin/events/:id/cancel
router.post('/events/:id/cancel', asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  const event = await getEventById(eventId);
  if (!event) {
    res.status(404).json({ error: { message: 'Event not found', code: 'NOT_FOUND' } });
    return;
  }
  await prisma.worldEvent.update({
    where: { id: eventId },
    data: { status: 'expired', expiresAt: new Date() },
  });
  res.json({ success: true });
}));

// GET /admin/mobs
router.get('/mobs', asyncHandler(async (_req, res) => {
  const mobs = await prisma.mobTemplate.findMany({
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, level: true, baseHp: true },
  });
  res.json({ mobs });
}));

// POST /admin/boss/spawn
const spawnBossSchema = z.object({
  mobTemplateId: z.string().uuid(),
  zoneId: z.string().uuid(),
});

router.post('/boss/spawn', asyncHandler(async (req, res) => {
  const { mobTemplateId, zoneId } = spawnBossSchema.parse(req.body);
  const mob = await prisma.mobTemplate.findUniqueOrThrow({ where: { id: mobTemplateId } });

  // Create a world event for the boss
  const event = await spawnWorldEvent({
    type: 'boss',
    zoneId,
    title: `${mob.name} Sighted`,
    description: `A fearsome ${mob.name} has appeared!`,
    effectType: 'spawn_rate_up',
    effectValue: 0,
    targetMobId: mobTemplateId,
    durationHours: WORLD_EVENT_CONSTANTS.BOSS_EVENT_DURATION_HOURS,
    createdBy: 'system',
  });

  if (!event) {
    res.status(409).json({ error: { message: 'Could not spawn boss event (slot conflict)', code: 'SLOT_CONFLICT' } });
    return;
  }

  const encounter = await createBossEncounter(event.id, mobTemplateId, mob.baseHp);
  res.json({ success: true, event, encounter });
}));
```

**Step 3: Build and verify**

```bash
npm run build:api
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "feat: add admin world event and boss spawn endpoints"
```

---

### Task 5: Admin Route — Zone & Encounter Site Endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Step 1: Add zone and encounter site endpoints**

Add to imports:
```typescript
import { rollMobPrefix } from '@adventure/game-engine';
import { EXPLORATION_CONSTANTS } from '@adventure/shared';
```

Add these endpoints:

```typescript
// GET /admin/zones
router.get('/zones', asyncHandler(async (_req, res) => {
  const zones = await prisma.zone.findMany({
    include: {
      connectionsFrom: { select: { toId: true, explorationThreshold: true } },
    },
    orderBy: { difficulty: 'asc' },
  });
  res.json({ zones });
}));

// POST /admin/zones/discover-all
router.post('/zones/discover-all', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const zones = await prisma.zone.findMany({ select: { id: true } });

  await prisma.$transaction(
    zones.map((z) =>
      prisma.playerZoneDiscovery.upsert({
        where: { playerId_zoneId: { playerId, zoneId: z.id } },
        create: { playerId, zoneId: z.id },
        update: {},
      })
    )
  );
  res.json({ success: true, discoveredCount: zones.length });
}));

// POST /admin/zones/teleport
const teleportSchema = z.object({ zoneId: z.string().uuid() });

router.post('/zones/teleport', asyncHandler(async (req, res) => {
  const { zoneId } = teleportSchema.parse(req.body);
  await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } });
  await prisma.player.update({
    where: { id: req.player!.playerId },
    data: { currentZoneId: zoneId },
  });
  res.json({ success: true, zoneId });
}));

// POST /admin/encounter/spawn
const spawnEncounterSchema = z.object({
  mobFamilyId: z.string().uuid(),
  zoneId: z.string().uuid(),
  size: z.enum(['small', 'medium', 'large']),
});

router.post('/encounter/spawn', asyncHandler(async (req, res) => {
  const { mobFamilyId, zoneId, size } = spawnEncounterSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const family = await prisma.mobFamily.findUniqueOrThrow({
    where: { id: mobFamilyId },
    include: {
      members: {
        include: { mobTemplate: true },
      },
    },
  });

  // Determine mob count range from size
  const sizeConfig = {
    small: EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL,
    medium: EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM,
    large: EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE,
  }[size];
  const mobCount = Math.floor(Math.random() * (sizeConfig.max - sizeConfig.min + 1)) + sizeConfig.min;

  // Build mob slots based on size composition
  const mobs: Array<{ slot: number; mobTemplateId: string; role: string; prefix: string | null; status: string }> = [];
  const members = family.members;
  if (members.length === 0) {
    res.status(400).json({ error: { message: 'Mob family has no members', code: 'NO_MEMBERS' } });
    return;
  }

  const pickMember = () => members[Math.floor(Math.random() * members.length)];

  let slot = 0;
  if (size === 'large') {
    // 1 boss + 2 elites + rest trash
    const boss = pickMember();
    mobs.push({ slot: slot++, mobTemplateId: boss.mobTemplate.id, role: 'boss', prefix: rollMobPrefix()?.id ?? null, status: 'alive' });
    for (let i = 0; i < 2 && slot < mobCount; i++) {
      const elite = pickMember();
      mobs.push({ slot: slot++, mobTemplateId: elite.mobTemplate.id, role: 'elite', prefix: rollMobPrefix()?.id ?? null, status: 'alive' });
    }
  } else if (size === 'medium') {
    // 1 elite + rest trash
    const elite = pickMember();
    mobs.push({ slot: slot++, mobTemplateId: elite.mobTemplate.id, role: 'elite', prefix: rollMobPrefix()?.id ?? null, status: 'alive' });
  }

  // Fill remaining slots with trash
  while (slot < mobCount) {
    const trash = pickMember();
    mobs.push({ slot: slot++, mobTemplateId: trash.mobTemplate.id, role: 'trash', prefix: rollMobPrefix()?.id ?? null, status: 'alive' });
  }

  // Generate site name
  const sizeNounField = size === 'small' ? 'siteNounSmall' : size === 'medium' ? 'siteNounMedium' : 'siteNounLarge';
  const noun = (family as Record<string, unknown>)[sizeNounField] as string | null;
  const namePrefix = size === 'small' ? 'Small ' : size === 'large' ? 'Large ' : '';
  const siteName = `${namePrefix}${family.name} ${noun ?? 'Camp'}`;

  const site = await prisma.encounterSite.create({
    data: {
      playerId,
      zoneId,
      mobFamilyId,
      name: siteName,
      size,
      mobs: { mobs },
    },
  });

  res.json({ success: true, site });
}));
```

**Step 2: Also add a GET endpoint for mob families (needed by the encounter spawn UI)**

```typescript
// GET /admin/mob-families
router.get('/mob-families', asyncHandler(async (_req, res) => {
  const families = await prisma.mobFamily.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json({ families });
}));
```

**Step 3: Build and verify**

```bash
npm run build:api
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "feat: add admin zone, teleport, encounter spawn endpoints"
```

---

### Task 6: PvP ELO Protection for Admins

**Files:**
- Modify: `apps/api/src/services/pvpService.ts:206-423` (the `challenge` function)

**Step 1: Add admin role check in the challenge function**

In `pvpService.ts`, after the ELO calculation at line 338-342, add a check. Find the block:

```typescript
const score = isDraw ? 0.5 : attackerWon ? 1 : 0;
const elo = calculateEloChange(attackerRating.rating, defenderRating.rating, PVP_CONSTANTS.K_FACTOR, score);
const attackerRatingChange = elo.deltaA;
const defenderRatingChange = elo.deltaB;
```

Change to use `let` and add the admin override:

```typescript
const score = isDraw ? 0.5 : attackerWon ? 1 : 0;
const elo = calculateEloChange(attackerRating.rating, defenderRating.rating, PVP_CONSTANTS.K_FACTOR, score);
let attackerRatingChange = elo.deltaA;
let defenderRatingChange = elo.deltaB;

// Zero ELO changes when an admin is involved
const [attackerPlayer, defenderPlayer] = await Promise.all([
  prisma.player.findUnique({ where: { id: attackerId }, select: { role: true } }),
  prisma.player.findUnique({ where: { id: targetId }, select: { role: true } }),
]);
if (attackerPlayer?.role === 'admin' || defenderPlayer?.role === 'admin') {
  attackerRatingChange = 0;
  defenderRatingChange = 0;
}
```

**Step 2: Build and verify**

```bash
npm run build:api
```

**Step 3: Commit**

```bash
git add apps/api/src/services/pvpService.ts
git commit -m "feat: zero PvP ELO changes when an admin is involved"
```

---

### Task 7: Admin Tag on Leaderboards — Backend

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts:71-80` (LeaderboardEntry interface)
- Modify: `apps/api/src/services/leaderboardService.ts:178-209` (writeToZset metadata)
- Modify: `apps/api/src/services/leaderboardService.ts:130-146` (readMetadata parsing)

**Step 1: Add `isAdmin` to LeaderboardEntry**

In `leaderboardService.ts`, find the `LeaderboardEntry` interface (line 71) and add `isAdmin`:

```typescript
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  characterLevel: number;
  score: number;
  isBot: boolean;
  isAdmin: boolean;
  title?: string;
  titleTier?: number;
}
```

**Step 2: Include role in Redis metadata writes**

Find the `writeToZset()` function and wherever metadata JSON is stringified, add `isAdmin`. The metadata object pattern is `{ username, characterLevel, isBot, title, titleTier }` — add `isAdmin: player.role === 'admin'`.

Look at each `refresh*()` function that calls `writeToZset()` to ensure the metadata includes the `role`/`isAdmin` field. The player query selects need to include `role: true`.

**Step 3: Include `isAdmin` in metadata parsing**

In the read/parse block (around line 130-146), update the fallback and parsing to include `isAdmin`:

```typescript
// Existing fallback:
{ username: 'Unknown', characterLevel: 1, isBot: false }
// Change to:
{ username: 'Unknown', characterLevel: 1, isBot: false, isAdmin: false }
```

Parse `isAdmin: !!meta.isAdmin` from the JSON.

**Step 4: Build and verify**

```bash
npm run build:api
```

**Step 5: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts
git commit -m "feat: include isAdmin in leaderboard metadata"
```

---

### Task 8: Admin Tag on Leaderboards & Arena — Frontend

**Files:**
- Modify: `apps/web/src/lib/api.ts:1115-1122` (PvpLadderEntry type)
- Modify: `apps/web/src/lib/api.ts:1466-1475` (LeaderboardEntry type)
- Modify: `apps/web/src/components/leaderboard/LeaderboardTable.tsx:100` (render admin badge)
- Modify: `apps/web/src/app/game/screens/ArenaScreen.tsx:374-384` (render admin badge on ladder)

**Step 1: Add `isAdmin` to frontend types**

In `apps/web/src/lib/api.ts`, add `isAdmin: boolean` to both:
- `LeaderboardEntry` (after `isBot`): `isAdmin: boolean;`
- `PvpLadderEntry` (after `titleTier`): `isAdmin?: boolean;`

**Step 2: Add admin badge to LeaderboardTable**

In `LeaderboardTable.tsx`, add a `Shield` import from lucide-react:
```typescript
import { Bot, Medal, Shield } from 'lucide-react';
```

After the existing bot indicator line (line 100):
```tsx
{entry.isBot && <Bot className="w-3.5 h-3.5 text-[var(--rpg-text-secondary)] shrink-0" />}
```

Add:
```tsx
{entry.isAdmin && <Shield className="w-3.5 h-3.5 text-[var(--rpg-gold)] shrink-0" />}
```

**Step 3: Add admin badge to ArenaScreen ladder**

In `ArenaScreen.tsx`, add a `Shield` import from lucide-react. In the opponent rendering block (around line 384, after the title span), add:
```tsx
{opponent.isAdmin && <Shield className="w-3.5 h-3.5 text-[var(--rpg-gold)] shrink-0" />}
```

**Step 4: Build and verify**

```bash
npm run build:web
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/components/leaderboard/LeaderboardTable.tsx apps/web/src/app/game/screens/ArenaScreen.tsx
git commit -m "feat: show admin shield badge on leaderboards and arena ladder"
```

---

### Task 9: Add `isAdmin` to PvP Ladder API Response

**Files:**
- Modify: `apps/api/src/services/pvpService.ts:36-73` (getLadder function)

**Step 1: Add role to ladder player select and response**

In `pvpService.ts` `getLadder()`, update the player select (line 56):

```typescript
player: { select: { username: true, characterLevel: true, activeTitle: true, role: true } },
```

In the map at line 63-72, add `isAdmin`:

```typescript
return {
  playerId: c.playerId,
  username: c.player.username,
  rating: c.rating,
  characterLevel: c.player.characterLevel,
  title: titleDef?.titleReward,
  titleTier: titleDef?.tier,
  isAdmin: c.player.role === 'admin',
};
```

**Step 2: Build and verify**

```bash
npm run build:api
```

**Step 3: Commit**

```bash
git add apps/api/src/services/pvpService.ts
git commit -m "feat: include isAdmin in PvP ladder responses"
```

---

### Task 10: Add `role` to GET /player Response & Frontend Auth

**Files:**
- Modify: `apps/api/src/routes/player.ts:29-57` (add role to select + response)
- Modify: `apps/web/src/hooks/useAuth.ts:6-10` (add role to Player interface)
- Modify: `apps/web/src/lib/api.ts` (add role to player response type)

**Step 1: Add `role` to the GET /player API select**

In `apps/api/src/routes/player.ts`, add `role: true` to the select clause (around line 29-41):

```typescript
select: {
  id: true,
  username: true,
  email: true,
  role: true,
  createdAt: true,
  // ... rest unchanged
},
```

**Step 2: Add `role` to frontend Player interface**

In `apps/web/src/hooks/useAuth.ts`, update the Player interface:

```typescript
interface Player {
  id: string;
  username: string;
  email: string;
  role: string;
}
```

In `apps/web/src/lib/api.ts`, find the player response type (around line 198-219) and ensure `role` is included.

**Step 3: Build and verify**

```bash
npm run build:web
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/player.ts apps/web/src/hooks/useAuth.ts apps/web/src/lib/api.ts
git commit -m "feat: expose player role in GET /player and frontend auth context"
```

---

### Task 11: Frontend — Admin API Functions

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add admin API functions at bottom)

**Step 1: Add admin response types and API functions**

Add to the bottom of `apps/web/src/lib/api.ts`:

```typescript
// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminItemTemplate {
  id: string;
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  stackable: boolean;
  requiredLevel: number | null;
}

export interface AdminZone {
  id: string;
  name: string;
  difficulty: number;
  zoneType: string;
  connectionsFrom: Array<{ toId: string; explorationThreshold: number }>;
}

export interface AdminMobTemplate {
  id: string;
  name: string;
  level: number;
  baseHp: number;
}

export interface AdminMobFamily {
  id: string;
  name: string;
}

export interface AdminEventTemplate {
  id: number;
  type: string;
  scope: string;
  title: string;
  description: string;
  effectType: string;
  effectValue: number;
  targeting: string;
  fixedTarget?: string;
}

// Player admin actions
export async function adminGrantTurns(amount: number) {
  return fetchApi<{ success: boolean; currentTurns: number }>('/api/v1/admin/turns/grant', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminSetLevel(level: number) {
  return fetchApi<{ success: boolean; level: number; characterXp: number }>('/api/v1/admin/player/level', {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

export async function adminGrantXp(amount: number) {
  return fetchApi<{ success: boolean; characterXp: number; characterLevel: number }>('/api/v1/admin/player/xp', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminSetAttributes(data: { attributePoints?: number; attributes?: Record<string, number> }) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/player/attributes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Item admin actions
export async function adminGetItemTemplates(search?: string, type?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  const qs = params.toString();
  return fetchApi<{ templates: AdminItemTemplate[] }>(`/api/v1/admin/items/templates${qs ? `?${qs}` : ''}`);
}

export async function adminGrantItem(templateId: string, rarity: string, quantity: number) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/items/grant', {
    method: 'POST',
    body: JSON.stringify({ templateId, rarity, quantity }),
  });
}

// World admin actions
export async function adminGetEventTemplates() {
  return fetchApi<{ templates: AdminEventTemplate[] }>('/api/v1/admin/events/templates');
}

export async function adminSpawnEvent(templateIndex: number, zoneId: string, durationHours?: number) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/events/spawn', {
    method: 'POST',
    body: JSON.stringify({ templateIndex, zoneId, durationHours }),
  });
}

export async function adminCancelEvent(eventId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/admin/events/${eventId}/cancel`, {
    method: 'POST',
  });
}

export async function adminGetMobs() {
  return fetchApi<{ mobs: AdminMobTemplate[] }>('/api/v1/admin/mobs');
}

export async function adminGetMobFamilies() {
  return fetchApi<{ families: AdminMobFamily[] }>('/api/v1/admin/mob-families');
}

export async function adminSpawnBoss(mobTemplateId: string, zoneId: string) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/boss/spawn', {
    method: 'POST',
    body: JSON.stringify({ mobTemplateId, zoneId }),
  });
}

// Zone admin actions
export async function adminGetZones() {
  return fetchApi<{ zones: AdminZone[] }>('/api/v1/admin/zones');
}

export async function adminDiscoverAllZones() {
  return fetchApi<{ success: boolean; discoveredCount: number }>('/api/v1/admin/zones/discover-all', {
    method: 'POST',
  });
}

export async function adminTeleport(zoneId: string) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/zones/teleport', {
    method: 'POST',
    body: JSON.stringify({ zoneId }),
  });
}

export async function adminSpawnEncounter(mobFamilyId: string, zoneId: string, size: string) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/encounter/spawn', {
    method: 'POST',
    body: JSON.stringify({ mobFamilyId, zoneId, size }),
  });
}

export async function adminGetActiveEvents() {
  return fetchApi<{ events: Array<{ id: string; title: string; status: string; zoneId: string | null; expiresAt: string | null }> }>('/api/v1/events');
}
```

**Step 2: Build and verify**

```bash
npm run build:web
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add admin API functions to frontend api.ts"
```

---

### Task 12: Frontend — Admin Screen Component

**Files:**
- Create: `apps/web/src/components/screens/AdminScreen.tsx`

**Step 1: Create the AdminScreen component**

Create `apps/web/src/components/screens/AdminScreen.tsx` with all 4 tabs (Player, Items, World, Zones). This is the largest single file — a tabbed panel with forms for each admin action.

Key UI patterns to follow:
- Use `PixelCard` from `@/components/common/PixelCard` for card containers
- Use RPG theme CSS variables (`--rpg-gold`, `--rpg-green-light`, `--rpg-bg-primary`, `--rpg-border`, etc.)
- Use `useState` for tab selection and form state
- Use `useEffect` for loading reference data (templates, zones, mobs)
- Show success/error feedback inline (simple status message per section)

The component should:
1. Have 4 tab buttons at the top: Player, Items, World, Zones
2. **Player tab**: Number inputs + buttons for turns, level, XP, attribute points, individual attributes
3. **Items tab**: Search input + type filter dropdown, template list, rarity dropdown, quantity input, grant button
4. **World tab**: Event template dropdown + zone dropdown + spawn button, active events list with cancel buttons, mob template dropdown + zone dropdown + spawn boss button
5. **Zones tab**: Zone list with teleport buttons, discover-all button, mob family + zone + size dropdowns + spawn encounter button

All forms call the API functions from Task 11 and show inline success/error messages.

**Step 2: Build and verify**

```bash
npm run build:web
```

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/AdminScreen.tsx
git commit -m "feat: add AdminScreen component with Player, Items, World, Zones tabs"
```

---

### Task 13: Frontend — Wire Admin Screen into Game Page

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:41-58` (add 'admin' to Screen type)
- Modify: `apps/web/src/app/game/page.tsx` (add admin screen rendering, admin nav link, admin sub-tab)

**Step 1: Add 'admin' to the Screen type**

In `useGameController.ts`, add `'admin'` to the Screen union (line 41-58):

```typescript
export type Screen =
  | 'home'
  | 'explore'
  // ... existing values ...
  | 'leaderboard'
  | 'admin';
```

In `getActiveTab()` (line 729), add `'admin'` to the home group:

```typescript
if (['home', 'skills', 'zones', 'bestiary', 'rest', 'worldEvents', 'achievements', 'leaderboard', 'admin'].includes(activeScreen)) return 'home';
```

**Step 2: Add AdminScreen to page.tsx**

In `page.tsx`:

1. Import at top:
```typescript
import AdminScreen from '@/components/screens/AdminScreen';
```

2. Add case in `renderScreen()` (around line 289):
```typescript
case 'admin':
  return <AdminScreen />;
```

3. In the home tab sub-navigation (lines 853-877), conditionally add the admin tab. After the existing tabs array, add:
```typescript
// After the .map() but inside the flex container:
{player?.role === 'admin' && (
  <button
    key="admin"
    onClick={() => setActiveScreen('admin' as Screen)}
    className={`...same classes as other tabs...`}
  >
    Admin
  </button>
)}
```

The exact button classes match the existing tab buttons in the same section.

**Step 3: Build and verify**

```bash
npm run build:web
```

**Step 4: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat: wire admin screen into game page navigation"
```

---

### Task 14: Add Active Events List Endpoint for Admin

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

**Step 1: Add an endpoint to list all active events**

The existing `GET /api/v1/events` endpoint is public — but the admin panel needs all active events globally (not zone-scoped). Add to admin.ts:

```typescript
// GET /admin/events/active
router.get('/events/active', asyncHandler(async (_req, res) => {
  const events = await prisma.worldEvent.findMany({
    where: { status: 'active' },
    include: { zone: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
  });
  res.json({ events: events.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    effectType: e.effectType,
    effectValue: e.effectValue,
    zoneName: e.zone?.name ?? 'World',
    status: e.status,
    expiresAt: e.expiresAt?.toISOString() ?? null,
  })) });
}));
```

**Step 2: Update frontend to use this endpoint**

In `api.ts`, update `adminGetActiveEvents`:

```typescript
export async function adminGetActiveEvents() {
  return fetchApi<{ events: Array<{ id: string; title: string; type: string; effectType: string; effectValue: number; zoneName: string; status: string; expiresAt: string | null }> }>('/api/v1/admin/events/active');
}
```

**Step 3: Build and verify**

```bash
npm run build:api && npm run build:web
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/web/src/lib/api.ts
git commit -m "feat: add admin active events list endpoint"
```

---

### Task 15: End-to-End Manual Testing

**Step 1: Start local dev environment**

```bash
docker-compose up -d
npm run dev
```

**Step 2: Set yourself as admin**

```sql
-- In Prisma Studio or direct DB:
UPDATE players SET role = 'admin' WHERE username = 'YOUR_USERNAME';
```

Or via Prisma Studio: `npm run db:studio`, find your player, set `role` to `'admin'`.

**Step 3: Log out and back in** (to get a new JWT with the admin role)

**Step 4: Test each admin feature**

1. Verify "Admin" tab appears in home sub-navigation
2. Player tab: grant turns, set level, grant XP, set attributes
3. Items tab: search templates, grant a stackable item, grant equipment at legendary rarity
4. World tab: spawn event from template, cancel it, spawn a boss
5. Zones tab: discover all zones, teleport to a zone, spawn an encounter site
6. Verify admin shield badge appears on leaderboard next to your name
7. Verify PvP with admin zeroes ELO changes (test via arena challenge)
8. Verify non-admin user cannot see admin tab or access admin endpoints (403)

**Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during admin panel testing"
```
