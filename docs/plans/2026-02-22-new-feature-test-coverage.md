# New Feature Test Coverage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive unit tests for features merged from main: admin middleware, admin routes, player settings, tutorial route handler, and tutorial exploration path.

**Architecture:** Unit tests with fully mocked Prisma (via `apps/api/src/__mocks__/database.ts`), peer services mocked with `vi.mock()`, inline Express req/res/next mocks for middleware and route handler tests. No HTTP integration tests (matches existing patterns).

**Tech Stack:** Vitest, vi.mock, vi.fn, Zod (schema validation under test)

---

### Task 1: Admin Middleware Tests

**Files:**
- Create: `apps/api/src/middleware/admin.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { requireAdmin } from './admin';
import { AppError } from './errorHandler';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAdmin', () => {
  it('calls next() when player has admin role', () => {
    const req = { player: { playerId: 'p1', username: 'admin', role: 'admin' } } as any;
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws 403 when player role is not admin', () => {
    const req = { player: { playerId: 'p1', username: 'user', role: 'player' } } as any;
    expect(() => requireAdmin(req, mockRes(), vi.fn())).toThrow(AppError);
    try { requireAdmin(req, mockRes(), vi.fn()); } catch (e: any) {
      expect(e.statusCode).toBe(403);
      expect(e.code).toBe('FORBIDDEN');
    }
  });

  it('throws 403 when req.player is undefined', () => {
    const req = {} as any;
    expect(() => requireAdmin(req, mockRes(), vi.fn())).toThrow(AppError);
  });

  it('throws 403 when role is missing', () => {
    const req = { player: { playerId: 'p1', username: 'user' } } as any;
    expect(() => requireAdmin(req, mockRes(), vi.fn())).toThrow(AppError);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/middleware/admin.test.ts`
Expected: 4 tests PASS

**Step 3: Commit**

```
git add apps/api/src/middleware/admin.test.ts
git commit -m "test: add admin middleware tests"
```

---

### Task 2: Player Settings Route Tests

**Files:**
- Create: `apps/api/src/routes/player.settings.test.ts`
- Reference: `apps/api/src/routes/player.ts:140-174` (settings endpoint)

The settings route uses Zod schema with `.refine()` for multiples validation and a "at least one setting required" refinement. We test the Zod schema directly since the route handler is thin (parse + Prisma update + return).

**Step 1: Write the test file**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Reproduce the exact schema from player.ts for direct testing
const settingsSchema = z.object({
  autoPotionThreshold: z.number().int().min(0).max(100).optional(),
  combatLogSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  explorationSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  autoSkipKnownCombat: z.boolean().optional(),
  defaultExploreTurns: z.number().int().min(10).max(10000).refine(v => v % 10 === 0, { message: 'Must be a multiple of 10' }).optional(),
  quickRestHealPercent: z.number().int().min(25).max(100).refine(v => v % 25 === 0, { message: 'Must be a multiple of 25' }).optional(),
  defaultRefiningMax: z.boolean().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), { message: 'At least one setting required' });

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
import { prisma } from '@adventure/database';

const mockPrisma = prisma as unknown as Record<string, any>;

describe('player settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('settingsSchema validation', () => {
    it('accepts valid autoPotionThreshold', () => {
      expect(() => settingsSchema.parse({ autoPotionThreshold: 50 })).not.toThrow();
    });

    it('accepts valid combatLogSpeedMs (multiple of 100)', () => {
      expect(() => settingsSchema.parse({ combatLogSpeedMs: 300 })).not.toThrow();
    });

    it('rejects combatLogSpeedMs not a multiple of 100', () => {
      expect(() => settingsSchema.parse({ combatLogSpeedMs: 150 })).toThrow();
    });

    it('accepts valid explorationSpeedMs (multiple of 100)', () => {
      expect(() => settingsSchema.parse({ explorationSpeedMs: 500 })).not.toThrow();
    });

    it('rejects explorationSpeedMs not a multiple of 100', () => {
      expect(() => settingsSchema.parse({ explorationSpeedMs: 250 })).toThrow();
    });

    it('accepts valid defaultExploreTurns (multiple of 10)', () => {
      expect(() => settingsSchema.parse({ defaultExploreTurns: 100 })).not.toThrow();
    });

    it('rejects defaultExploreTurns not a multiple of 10', () => {
      expect(() => settingsSchema.parse({ defaultExploreTurns: 55 })).toThrow();
    });

    it('accepts valid quickRestHealPercent (multiple of 25)', () => {
      expect(() => settingsSchema.parse({ quickRestHealPercent: 75 })).not.toThrow();
    });

    it('rejects quickRestHealPercent not a multiple of 25', () => {
      expect(() => settingsSchema.parse({ quickRestHealPercent: 30 })).toThrow();
    });

    it('rejects empty body (at least one setting required)', () => {
      expect(() => settingsSchema.parse({})).toThrow();
    });

    it('accepts boolean settings', () => {
      expect(() => settingsSchema.parse({ autoSkipKnownCombat: true })).not.toThrow();
      expect(() => settingsSchema.parse({ defaultRefiningMax: false })).not.toThrow();
    });

    it('accepts multiple settings at once', () => {
      expect(() => settingsSchema.parse({
        combatLogSpeedMs: 200,
        defaultExploreTurns: 500,
        autoSkipKnownCombat: true,
      })).not.toThrow();
    });
  });
});
```

**Step 2: Run test**

Run: `cd apps/api && npx vitest run src/routes/player.settings.test.ts`
Expected: 12 tests PASS

**Step 3: Commit**

```
git add apps/api/src/routes/player.settings.test.ts
git commit -m "test: add player settings schema validation tests"
```

---

### Task 3: Expand Tutorial Route Tests

**Files:**
- Modify: `apps/api/src/routes/player.tutorial.test.ts`

Add route-handler-level tests that mock Prisma and peer services to test the actual PATCH `/tutorial` behavior: DB update, achievement granting on step 9, and error paths.

**Step 1: Rewrite the test file to add route-level tests alongside existing pure logic tests**

Keep the existing `isValidTutorialAdvance` pure-logic tests and add a new `describe('PATCH /tutorial handler')` block:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
vi.mock('../services/statsService', () => ({
  incrementStats: vi.fn(),
}));
vi.mock('../services/achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
  emitAchievementNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@adventure/database';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';

const mockPrisma = prisma as unknown as Record<string, any>;
const mockIncrementStats = incrementStats as ReturnType<typeof vi.fn>;
const mockCheckAchievements = checkAchievements as ReturnType<typeof vi.fn>;
const mockEmitAchievementNotifications = emitAchievementNotifications as ReturnType<typeof vi.fn>;

/** Mirrors the validation logic in PATCH /player/tutorial */
function isValidTutorialAdvance(currentStep: number, requestedStep: number): boolean {
  const isSkip = requestedStep === -1;
  const isNextStep = requestedStep === currentStep + 1;
  if (!isSkip && !isNextStep) return false;
  if (currentStep >= 9 || currentStep === -1) return false;
  return true;
}

describe('tutorial step validation', () => {
  it('accepts valid forward step (current + 1)', () => {
    expect(isValidTutorialAdvance(2, 3)).toBe(true);
  });

  it('accepts skip (-1)', () => {
    expect(isValidTutorialAdvance(2, -1)).toBe(true);
  });

  it('rejects skipping steps', () => {
    expect(isValidTutorialAdvance(2, 5)).toBe(false);
  });

  it('rejects going backwards', () => {
    expect(isValidTutorialAdvance(5, 3)).toBe(false);
  });

  it('rejects updating already completed tutorial', () => {
    expect(isValidTutorialAdvance(9, 10)).toBe(false);
  });

  it('rejects skipping an already completed tutorial', () => {
    expect(isValidTutorialAdvance(9, -1)).toBe(false);
  });

  it('rejects advancing an already skipped tutorial', () => {
    expect(isValidTutorialAdvance(-1, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route-handler-level tests for PATCH /player/tutorial
// We import the router and simulate calling the handler with mock req/res/next
// ---------------------------------------------------------------------------

import { playerRouter } from './player';

// Helper to find the PATCH /tutorial handler from the Express router stack
function findHandler(method: string, path: string) {
  const layer = (playerRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  // The handler chain includes authenticate middleware first; get the last handler
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('PATCH /tutorial handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advances tutorial step and updates DB', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 2 });
    mockPrisma.player.update.mockResolvedValue({});

    const req = { player: { playerId: 'p1' }, body: { step: 3 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { tutorialStep: 3 },
    });
    expect(res.json).toHaveBeenCalledWith({ tutorialStep: 3 });
  });

  it('grants achievement when completing tutorial (step 9)', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 8 });
    mockPrisma.player.update.mockResolvedValue({});
    mockCheckAchievements.mockResolvedValue([{ id: 'tutorial_complete' }]);

    const req = { player: { playerId: 'p1' }, body: { step: 9 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(mockIncrementStats).toHaveBeenCalledWith('p1', { tutorialCompleted: 1 });
    expect(mockCheckAchievements).toHaveBeenCalledWith('p1', { statKeys: ['tutorialCompleted'] });
    expect(mockEmitAchievementNotifications).toHaveBeenCalledWith('p1', [{ id: 'tutorial_complete' }]);
  });

  it('does not grant achievement when skipping tutorial', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 3 });
    mockPrisma.player.update.mockResolvedValue({});

    const req = { player: { playerId: 'p1' }, body: { step: -1 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(mockIncrementStats).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ tutorialStep: -1 });
  });

  it('calls next with error when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    const req = { player: { playerId: 'p1' }, body: { step: 1 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('calls next with error for invalid step jump', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 2 });

    const req = { player: { playerId: 'p1' }, body: { step: 5 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'INVALID_STEP' }));
  });
});
```

**Step 2: Run test**

Run: `cd apps/api && npx vitest run src/routes/player.tutorial.test.ts`
Expected: 12 tests PASS (7 existing + 5 new)

**Step 3: Commit**

```
git add apps/api/src/routes/player.tutorial.test.ts
git commit -m "test: add route-handler-level tutorial tests"
```

---

### Task 4: Admin Route Tests (High-Value Endpoints)

**Files:**
- Create: `apps/api/src/routes/admin.test.ts`
- Reference: `apps/api/src/routes/admin.ts`

Tests the admin route handlers by extracting them from the router stack, same pattern as Task 3. Mocks Prisma and peer services (`turnBankService`, `inventoryService`, `worldEventService`, `bossEncounterService`, `attributesService`).

**Step 1: Write the test file**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
vi.mock('../services/turnBankService', () => ({
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 5000 }),
}));
vi.mock('../services/inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue({ id: 'item-1', quantity: 10 }),
}));
vi.mock('../services/worldEventService', () => ({
  spawnWorldEvent: vi.fn(),
  getEventById: vi.fn(),
}));
vi.mock('../services/bossEncounterService', () => ({
  createBossEncounter: vi.fn().mockResolvedValue({ id: 'boss-enc-1' }),
}));
vi.mock('../services/attributesService', () => ({
  normalizePlayerAttributes: vi.fn((attrs: any) => attrs ?? { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 }),
}));
vi.mock('@adventure/game-engine', () => ({
  xpForLevel: vi.fn((lvl: number) => lvl * 100),
  characterLevelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
  rollMobPrefix: vi.fn(() => null),
  rollBonusStatsForRarity: vi.fn(() => null),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock('../middleware/admin', () => ({
  requireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { prisma } from '@adventure/database';
import { refundPlayerTurns } from '../services/turnBankService';
import { addStackableItem } from '../services/inventoryService';
import { spawnWorldEvent, getEventById } from '../services/worldEventService';
import { createBossEncounter } from '../services/bossEncounterService';
import { adminRouter } from './admin';

const mockPrisma = prisma as unknown as Record<string, any>;
const mockSpawnWorldEvent = spawnWorldEvent as ReturnType<typeof vi.fn>;
const mockGetEventById = getEventById as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /turns/grant', () => {
    it('grants turns and returns result', async () => {
      const req = { player: { playerId: 'p1' }, body: { amount: 1000 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/turns/grant');
      await handler(req, res, vi.fn());

      expect(refundPlayerTurns).toHaveBeenCalledWith('p1', 1000);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /player/level', () => {
    it('sets player level and grants attribute points for level difference', async () => {
      mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ characterLevel: 5 });
      mockPrisma.player.update.mockResolvedValue({});

      const req = { player: { playerId: 'p1' }, body: { level: 10 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/player/level');
      await handler(req, res, vi.fn());

      expect(mockPrisma.player.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          characterLevel: 10,
          attributePoints: { increment: 5 },
        }),
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, level: 10 }));
    });
  });

  describe('POST /items/grant', () => {
    it('grants stackable items via addStackableItem', async () => {
      mockPrisma.itemTemplate.findUniqueOrThrow.mockResolvedValue({
        id: 'tpl-1', stackable: true, maxDurability: 0,
      });

      const req = { player: { playerId: 'p1' }, body: { templateId: 'tpl-1', quantity: 5 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/items/grant');
      await handler(req, res, vi.fn());

      expect(addStackableItem).toHaveBeenCalledWith('p1', 'tpl-1', 5);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('creates individual items for non-stackable templates', async () => {
      mockPrisma.itemTemplate.findUniqueOrThrow.mockResolvedValue({
        id: 'tpl-2', stackable: false, maxDurability: 100,
        itemType: 'weapon', baseStats: null, slot: 'main_hand',
      });
      mockPrisma.item.create.mockResolvedValue({ id: 'item-new' });

      const req = { player: { playerId: 'p1' }, body: { templateId: 'tpl-2', rarity: 'rare', quantity: 2 } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/items/grant');
      await handler(req, res, vi.fn());

      expect(mockPrisma.item.create).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /events/spawn', () => {
    it('spawns a world event from template', async () => {
      mockSpawnWorldEvent.mockResolvedValue({ id: 'evt-1', title: 'Test Event' });

      const req = {
        player: { playerId: 'p1' },
        body: { templateIndex: 0, zoneId: '00000000-0000-0000-0000-000000000001', durationHours: 2 },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/spawn');
      await handler(req, res, vi.fn());

      expect(mockSpawnWorldEvent).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 400 for invalid template index', async () => {
      const req = {
        player: { playerId: 'p1' },
        body: { templateIndex: 9999, zoneId: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/spawn');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 409 when event slot conflict', async () => {
      mockSpawnWorldEvent.mockResolvedValue(null);

      const req = {
        player: { playerId: 'p1' },
        body: { templateIndex: 0, zoneId: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/spawn');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('POST /events/:id/cancel', () => {
    it('cancels an active event', async () => {
      mockGetEventById.mockResolvedValue({ id: 'evt-1', status: 'active' });
      mockPrisma.worldEvent.update.mockResolvedValue({});

      const req = { params: { id: 'evt-1' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/:id/cancel');
      await handler(req, res, vi.fn());

      expect(mockPrisma.worldEvent.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ status: 'expired' }),
      }));
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 404 when event not found', async () => {
      mockGetEventById.mockResolvedValue(null);

      const req = { params: { id: 'not-found' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/events/:id/cancel');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /boss/spawn', () => {
    it('spawns a boss encounter', async () => {
      mockPrisma.mobTemplate.findUniqueOrThrow.mockResolvedValue({ id: 'mob-1', name: 'Dragon', hp: 1000, bossBaseHp: 5000 });
      mockSpawnWorldEvent.mockResolvedValue({ id: 'evt-boss' });
      mockPrisma.worldEvent.update.mockResolvedValue({});

      const req = {
        player: { playerId: 'p1' },
        body: { mobTemplateId: '00000000-0000-0000-0000-000000000001', zoneId: '00000000-0000-0000-0000-000000000002' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/boss/spawn');
      await handler(req, res, vi.fn());

      expect(createBossEncounter).toHaveBeenCalledWith('evt-boss', '00000000-0000-0000-0000-000000000001', 5000);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /zones/teleport', () => {
    it('teleports player to target zone', async () => {
      mockPrisma.zone.findUniqueOrThrow.mockResolvedValue({ id: 'z1' });
      mockPrisma.player.update.mockResolvedValue({});

      const req = {
        player: { playerId: 'p1' },
        body: { zoneId: '00000000-0000-0000-0000-000000000001' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/zones/teleport');
      await handler(req, res, vi.fn());

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { currentZoneId: '00000000-0000-0000-0000-000000000001' },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, zoneId: '00000000-0000-0000-0000-000000000001' });
    });
  });

  describe('POST /zones/discover-all', () => {
    it('upserts discovery for all zones', async () => {
      mockPrisma.zone.findMany.mockResolvedValue([{ id: 'z1' }, { id: 'z2' }, { id: 'z3' }]);
      mockPrisma.$transaction.mockResolvedValue([]);

      const req = { player: { playerId: 'p1' } } as any;
      const res = mockRes();
      const handler = findHandler('post', '/zones/discover-all');
      await handler(req, res, vi.fn());

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, discoveredCount: 3 });
    });
  });

  describe('POST /encounter/spawn', () => {
    it('creates an encounter site with mobs', async () => {
      mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValue({
        id: 'fam-1', name: 'Wolves', siteNounSmall: 'Den', siteNounMedium: 'Lair', siteNounLarge: 'Cavern',
        members: [{ mobTemplate: { id: 'mob-1' } }],
      });
      mockPrisma.encounterSite.create.mockResolvedValue({ id: 'site-1' });

      const req = {
        player: { playerId: 'p1' },
        body: { mobFamilyId: '00000000-0000-0000-0000-000000000001', zoneId: '00000000-0000-0000-0000-000000000002', size: 'small' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/encounter/spawn');
      await handler(req, res, vi.fn());

      expect(mockPrisma.encounterSite.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 400 when mob family has no members', async () => {
      mockPrisma.mobFamily.findUniqueOrThrow.mockResolvedValue({
        id: 'fam-1', name: 'Empty', siteNounSmall: 'Den', siteNounMedium: 'Lair', siteNounLarge: 'Cavern',
        members: [],
      });

      const req = {
        player: { playerId: 'p1' },
        body: { mobFamilyId: '00000000-0000-0000-0000-000000000001', zoneId: '00000000-0000-0000-0000-000000000002', size: 'small' },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/encounter/spawn');
      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /resource-nodes/spawn', () => {
    it('creates a player resource node with explicit capacity', async () => {
      mockPrisma.resourceNode.findUniqueOrThrow.mockResolvedValue({
        id: 'rn-1', resourceType: 'iron_ore', minCapacity: 10, maxCapacity: 50,
      });
      mockPrisma.playerResourceNode.create.mockResolvedValue({ id: 'prn-1' });

      const req = {
        player: { playerId: 'p1' },
        body: { resourceNodeId: '00000000-0000-0000-0000-000000000001', capacity: 30 },
      } as any;
      const res = mockRes();
      const handler = findHandler('post', '/resource-nodes/spawn');
      await handler(req, res, vi.fn());

      expect(mockPrisma.playerResourceNode.create).toHaveBeenCalledWith({
        data: {
          playerId: 'p1',
          resourceNodeId: '00000000-0000-0000-0000-000000000001',
          remainingCapacity: 30,
          decayedCapacity: 0,
        },
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true, resourceType: 'iron_ore', capacity: 30,
      }));
    });
  });
});
```

**Step 2: Run test**

Run: `cd apps/api && npx vitest run src/routes/admin.test.ts`
Expected: 15 tests PASS

**Step 3: Commit**

```
git add apps/api/src/routes/admin.test.ts
git commit -m "test: add admin route tests for high-value endpoints"
```

---

### Task 5: Tutorial Exploration Path Tests

**Files:**
- Create: `apps/api/src/routes/exploration/start.tutorial.test.ts`
- Reference: `apps/api/src/routes/exploration/start.ts:155-229`

These tests verify the tutorial-specific exploration path: forced 100 turns, guaranteed single ambush, Field Mouse selection, no prefix application.

Because the exploration start handler has many dependencies, we mock all service imports and focus specifically on the tutorial branching logic.

**Step 1: Write the test file**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../../__mocks__/database.js'));
vi.mock('../../services/turnBankService', () => ({
  spendPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 86300, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 86400, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
}));
vi.mock('../../services/hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  setHp: vi.fn(),
  enterRecoveringState: vi.fn(),
}));
vi.mock('../../services/lootService', () => ({
  rollAndGrantLoot: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/xpService', () => ({
  grantSkillXp: vi.fn().mockResolvedValue({
    skillType: 'melee', xpResult: { xpGained: 10, xpAfterEfficiency: 10, efficiency: 1, leveledUp: false, newLevel: 1, atDailyCap: false },
    newTotalXp: 10, newDailyXpGained: 10,
    characterXpGain: 5, characterXpAfter: 5, characterLevelBefore: 1, characterLevelAfter: 1,
    attributePointsAfter: 0, characterLeveledUp: false,
  }),
}));
vi.mock('../../services/durabilityService', () => ({
  degradeEquippedDurability: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({ attack: 5, accuracy: 5, defence: 5, magicDefence: 0, speed: 0, critChance: 0, critDamage: 1 }),
}));
vi.mock('../../services/attributesService', () => ({
  getPlayerProgressionState: vi.fn().mockResolvedValue({
    characterXp: 0, characterLevel: 1, attributePoints: 0,
    attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
  }),
}));
vi.mock('../../services/zoneDiscoveryService', () => ({
  discoverZone: vi.fn(),
  getUndiscoveredNeighborZones: vi.fn().mockResolvedValue([]),
  respawnToHomeTown: vi.fn(),
}));
vi.mock('../../services/zoneExplorationService', () => ({
  addExplorationTurns: vi.fn(),
  calculateExplorationPercent: vi.fn().mockReturnValue(10),
  getExplorationPercent: vi.fn().mockResolvedValue({ turnsExplored: 0, percent: 10, turnsToExplore: 10000 }),
}));
vi.mock('../../services/worldEventService', () => ({
  getActiveZoneModifiers: vi.fn().mockResolvedValue([]),
  spawnWorldEvent: vi.fn(),
}));
vi.mock('../../services/bossEncounterService', () => ({
  createBossEncounter: vi.fn(),
}));
vi.mock('../../services/eventSchedulerService', () => ({
  checkAndSpawnEvents: vi.fn(),
}));
vi.mock('../../socket', () => ({
  getIo: vi.fn(),
}));
vi.mock('../../services/achievementService', () => ({
  emitAchievementNotifications: vi.fn(),
  checkAchievements: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/systemMessageService', () => ({
  emitSystemMessage: vi.fn(),
}));
vi.mock('../../services/persistedMobService', () => ({
  persistMobHp: vi.fn(),
}));
vi.mock('../../services/potionService', () => ({
  buildPotionPool: vi.fn().mockResolvedValue([]),
  deductConsumedPotions: vi.fn(),
}));
vi.mock('../../services/combatStatsService', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  getSkillLevel: vi.fn().mockResolvedValue(1),
}));
vi.mock('../../services/statsService', () => ({
  incrementStats: vi.fn(),
}));
vi.mock('../../utils/routeHelpers.js', () => ({
  serializeXpGrant: vi.fn((grant: any) => ({
    skillType: grant.skillType, ...grant.xpResult,
    newTotalXp: grant.newTotalXp, newDailyXpGained: grant.newDailyXpGained,
    characterXpGain: grant.characterXpGain, characterXpAfter: grant.characterXpAfter,
    characterLevelBefore: grant.characterLevelBefore, characterLevelAfter: grant.characterLevelAfter,
    attributePointsAfter: grant.attributePointsAfter, characterLeveledUp: grant.characterLeveledUp,
  })),
}));

// Mock game-engine functions
vi.mock('@adventure/game-engine', () => ({
  applyMobEventModifiers: vi.fn((mob: any) => mob),
  applyMobPrefix: vi.fn((mob: any, prefix: any) => ({ ...mob, mobPrefix: prefix, mobDisplayName: prefix ? `${prefix} ${mob.name}` : mob.name })),
  buildPlayerCombatStats: vi.fn(() => ({ attack: 10, accuracy: 10, defence: 5, magicDefence: 0, speed: 5, hp: 100, critChance: 0.05, critDamage: 1.5 })),
  calculateFleeResult: vi.fn(),
  filterAndWeightMobsByTier: vi.fn(() => []),
  mobToCombatantStats: vi.fn((mob: any) => ({ attack: mob.attack ?? 5, accuracy: 5, defence: 5, magicDefence: 0, speed: 5, hp: mob.hp ?? 20, critChance: 0, critDamage: 1 })),
  rollMobPrefix: vi.fn(() => null),
  runCombat: vi.fn(() => ({
    outcome: 'victory',
    combatantAHpRemaining: 80,
    combatantAMaxHp: 100,
    combatantBMaxHp: 20,
    combatantBHpRemaining: 0,
    log: [],
    potionsConsumed: [],
  })),
  selectTierWithBleedthrough: vi.fn(() => 1),
  simulateExploration: vi.fn(() => []),
  validateExplorationTurns: vi.fn(() => ({ valid: true })),
}));

import { prisma } from '@adventure/database';
import { spendPlayerTurns } from '../../services/turnBankService';
import { applyMobPrefix, simulateExploration, runCombat } from '@adventure/game-engine';
import { startRouter } from './start';

const mockPrisma = prisma as unknown as Record<string, any>;
const mockSpendPlayerTurns = spendPlayerTurns as ReturnType<typeof vi.fn>;
const mockApplyMobPrefix = applyMobPrefix as ReturnType<typeof vi.fn>;
const mockSimulateExploration = simulateExploration as ReturnType<typeof vi.fn>;
const mockRunCombat = runCombat as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (startRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const ZONE_ID = '00000000-0000-0000-0000-000000000001';

function baseReq(overrides: Record<string, any> = {}) {
  return {
    player: { playerId: 'p1', username: 'TestPlayer' },
    body: { zoneId: ZONE_ID, turns: 500 },
    ...overrides,
  } as any;
}

function setupZoneAndMobs(tutorialStep: number) {
  mockPrisma.zone.findUnique.mockResolvedValue({
    id: ZONE_ID, name: 'Test Zone', difficulty: 1, zoneType: 'wild',
    zoneExitChance: 0.01, explorationTiers: null,
  });
  mockPrisma.mobTemplate.findMany.mockResolvedValue([
    { id: 'mob-fm', name: 'Field Mouse', level: 1, hp: 20, attack: 3, accuracy: 5, defence: 2, magicDefence: 0, speed: 5, xpReward: 10, encounterWeight: 100, explorationTier: 1, zoneId: ZONE_ID, dropChanceMultiplier: 1, spellPattern: [] },
    { id: 'mob-rat', name: 'Giant Rat', level: 2, hp: 30, attack: 5, accuracy: 5, defence: 3, magicDefence: 0, speed: 4, xpReward: 15, encounterWeight: 100, explorationTier: 1, zoneId: ZONE_ID, dropChanceMultiplier: 1, spellPattern: [] },
  ]);
  mockPrisma.resourceNode.findMany.mockResolvedValue([]);
  mockPrisma.zoneMobFamily.findMany.mockResolvedValue([]);
  mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
  mockPrisma.player.findUnique.mockResolvedValue({ autoPotionThreshold: 0, tutorialStep });
  mockPrisma.playerBestiary.upsert.mockResolvedValue({});
  mockPrisma.activityLog.create.mockResolvedValue({ id: 'log-1' });
}

describe('exploration tutorial path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces 100 turns when tutorialStep is 1 (regardless of body.turns)', async () => {
    setupZoneAndMobs(1);

    const req = baseReq({ body: { zoneId: ZONE_ID, turns: 500 } });
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Should spend 100 turns, not 500
    expect(mockSpendPlayerTurns).toHaveBeenCalledWith('p1', 100);
  });

  it('produces exactly one ambush at turn 50 and does not call simulateExploration', async () => {
    setupZoneAndMobs(1);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Should NOT call simulateExploration for tutorial
    expect(mockSimulateExploration).not.toHaveBeenCalled();
    // Should have run combat (from the forced ambush)
    expect(mockRunCombat).toHaveBeenCalled();
  });

  it('selects Field Mouse by name and applies no prefix', async () => {
    setupZoneAndMobs(1);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // applyMobPrefix should be called with null prefix
    expect(mockApplyMobPrefix).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Field Mouse' }),
      null,
    );
  });

  it('falls back to first mob if Field Mouse not found', async () => {
    setupZoneAndMobs(1);
    // Override mobs to not include Field Mouse
    mockPrisma.mobTemplate.findMany.mockResolvedValue([
      { id: 'mob-rat', name: 'Giant Rat', level: 2, hp: 30, attack: 5, accuracy: 5, defence: 3, magicDefence: 0, speed: 4, xpReward: 15, encounterWeight: 100, explorationTier: 1, zoneId: ZONE_ID, dropChanceMultiplier: 1, spellPattern: [] },
    ]);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    expect(mockApplyMobPrefix).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Giant Rat' }),
      null,
    );
  });

  it('uses simulateExploration for non-tutorial players (tutorialStep !== 1)', async () => {
    setupZoneAndMobs(0);
    mockSimulateExploration.mockReturnValue([]);

    const req = baseReq({ body: { zoneId: ZONE_ID, turns: 500 } });
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Should spend the requested turns, not 100
    expect(mockSpendPlayerTurns).toHaveBeenCalledWith('p1', 500);
    // Should call simulateExploration
    expect(mockSimulateExploration).toHaveBeenCalledWith(500, expect.anything());
  });

  it('combat victory during tutorial grants XP and loot normally', async () => {
    setupZoneAndMobs(1);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Response should include events with ambush_victory
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ambush_victory' }),
      ]),
    );
  });
});
```

**Step 2: Run test**

Run: `cd apps/api && npx vitest run src/routes/exploration/start.tutorial.test.ts`
Expected: 6 tests PASS

**Step 3: Commit**

```
git add apps/api/src/routes/exploration/start.tutorial.test.ts
git commit -m "test: add tutorial exploration path tests"
```

---

### Task 6: Run Full Test Suite and Final Commit

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass (existing + new)

**Step 2: Fix any failures**

If any test fails, diagnose and fix. Ensure all existing 745 tests plus the ~40 new tests pass.

**Step 3: Final commit (if any fixes needed)**

```
git add -A
git commit -m "fix: resolve any test issues from new coverage"
```
