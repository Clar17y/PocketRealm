# Guild System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a full guild system with cooperative progression (tax, treasury, upgrades, contracts, projects, specialization, expeditions) plus per-round tactical combat rework.

**Architecture:** Guild system adds ~12 new DB models, a guild service layer, guild routes, and hooks into existing turn spending/combat/crafting/gathering routes. Combat rework refactors the combat engine from instant-resolve to per-round action selection. All follows existing patterns: services with `AppError` throws, Zod-validated routes, vitest with mocked Prisma.

**Tech Stack:** Prisma (schema + migrations), Express routes with Zod, vitest, existing combat engine pure functions, Redis for guild leaderboard cache.

**Design Doc:** `docs/superpowers/specs/2026-02-21-guild-system-design.md`

---

## Phase 1: Core Guild Foundation

### Task 1: Shared Types & Constants

**Files:**
- Create: `packages/shared/src/types/guild.types.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Create guild types**

```typescript
// packages/shared/src/types/guild.types.ts

export type GuildRole = 'leader' | 'officer' | 'member';
export type GuildRecruitmentMode = 'open' | 'invite_only' | 'closed';
export type GuildSpecialization = 'warfare' | 'industry' | 'discovery';

export const GUILD_ROLES: GuildRole[] = ['leader', 'officer', 'member'];
export const GUILD_RECRUITMENT_MODES: GuildRecruitmentMode[] = ['open', 'invite_only', 'closed'];

export interface GuildData {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  leaderUsername?: string;
  level: number;
  xp: string; // bigint as string
  memberCount: number;
  maxMembers: number;
  recruitmentMode: GuildRecruitmentMode;
  minLevelRequirement: number;
  taxRate: number;
  specialization: GuildSpecialization | null;
  renown: number;
  seasonalRenown: number;
  treasuryTurns: number;
  treasuryCap: number;
  createdAt: string;
}

export interface GuildMemberData {
  playerId: string;
  username: string;
  characterLevel: number;
  role: GuildRole;
  joinedAt: string;
  totalTurnsContributed: number;
  weeklyTurnsContributed: number;
  lastActiveAt: string;
  isActive: boolean; // gained XP in last 48h
}

export interface GuildLogEntry {
  id: string;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface GuildSearchResult {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  level: number;
  memberCount: number;
  maxMembers: number;
  recruitmentMode: GuildRecruitmentMode;
  minLevelRequirement: number;
  taxRate: number;
  specialization: GuildSpecialization | null;
}
```

**Step 2: Add guild constants to `gameConstants.ts`**

Add a new `GUILD_CONSTANTS` section after the existing `CHAT_CONSTANTS` section (use the `// ===...===` separator pattern):

```typescript
// =============================================================================
// GUILD
// =============================================================================

export const GUILD_CONSTANTS = {
  /** Turn cost to create a guild */
  CREATION_TURN_COST: 50_000,
  /** Minimum character level to create a guild */
  CREATION_MIN_LEVEL: 20,
  /** Minimum character level to join a guild */
  JOIN_MIN_LEVEL: 10,
  /** Base max members at guild level 1 */
  BASE_MAX_MEMBERS: 10,
  /** Additional member slots per 2 guild levels */
  MEMBERS_PER_TWO_LEVELS: 1,
  /** Maximum tax rate (percentage) */
  MAX_TAX_RATE: 20,
  /** Base treasury capacity */
  TREASURY_BASE_CAP: 100_000,
  /** Additional treasury capacity per guild level */
  TREASURY_CAP_PER_LEVEL: 10_000,
  /** Guild level required to unlock specialization */
  SPECIALIZATION_UNLOCK_LEVEL: 10,
  /** Treasury cost to respec specialization */
  SPECIALIZATION_RESPEC_COST: 2_000_000,
  /** Hours of XP activity required to be considered "active" for boost eligibility */
  BOOST_ELIGIBILITY_WINDOW_HOURS: 48,
  /** Active member thresholds for boost scaling: <5 = 50%, 5-9 = 75%, 10+ = 100% */
  BOOST_SCALING_MIN_FULL: 10,
  BOOST_SCALING_MIN_MEDIUM: 5,
  BOOST_SCALING_FULL: 1.0,
  BOOST_SCALING_MEDIUM: 0.75,
  BOOST_SCALING_LOW: 0.5,
  /** XP required per guild level: floor(BASE * level^EXPONENT) */
  XP_PER_LEVEL_BASE: 100,
  XP_PER_LEVEL_EXPONENT: 1.8,
  /** Guild XP earned per member action */
  XP_PER_MOB_KILL: 1,
  XP_PER_CRAFT: 2,
  XP_PER_BOSS_ROUND: 10,
  XP_PER_MEMBER_JOIN: 50,
  /** Guild log page size */
  LOG_PAGE_SIZE: 50,
  /** Max description length */
  MAX_DESCRIPTION_LENGTH: 200,
  /** Guild name constraints */
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 32,
  /** Guild tag constraints */
  MIN_TAG_LENGTH: 2,
  MAX_TAG_LENGTH: 4,
} as const;
```

**Step 3: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './types/guild.types';
```

And ensure `GUILD_CONSTANTS` is already exported (it will be since `gameConstants.ts` is exported).

**Step 4: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 5: Commit**

```bash
git add packages/shared/src/types/guild.types.ts packages/shared/src/index.ts packages/shared/src/constants/gameConstants.ts
git commit -m "feat(shared): add guild types and constants"
```

---

### Task 2: Database Schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add Guild models to schema**

Add after the `// ACHIEVEMENTS` section:

```prisma
// =============================================================================
// GUILDS
// =============================================================================

model Guild {
  id                  String   @id @default(uuid())
  name                String   @unique @db.VarChar(32)
  tag                 String   @unique @db.VarChar(4)
  description         String?  @db.VarChar(200)
  leaderId            String   @map("leader_id")
  level               Int      @default(1)
  xp                  BigInt   @default(0)
  recruitmentMode     String   @default("invite_only") @map("recruitment_mode") @db.VarChar(16)
  minLevelRequirement Int      @default(0) @map("min_level_requirement")
  taxRate             Int      @default(5) @map("tax_rate")
  specialization      String?  @db.VarChar(16)
  renown              Int      @default(0)
  seasonalRenown      Int      @default(0) @map("seasonal_renown")
  treasuryTurns       Int      @default(0) @map("treasury_turns")
  createdAt           DateTime @default(now()) @map("created_at")

  members      GuildMember[]
  upgrades     GuildUpgrade[]
  projects     GuildProject[]
  contracts    GuildContract[]
  logs         GuildLog[]

  @@map("guilds")
}

model GuildMember {
  guildId                String   @map("guild_id")
  playerId               String   @unique @map("player_id")
  role                   String   @default("member") @db.VarChar(16)
  joinedAt               DateTime @default(now()) @map("joined_at")
  totalTurnsContributed  Int      @default(0) @map("total_turns_contributed")
  weeklyTurnsContributed Int      @default(0) @map("weekly_turns_contributed")
  lastActiveAt           DateTime @default(now()) @map("last_active_at")

  guild  Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@id([guildId, playerId])
  @@map("guild_members")
}

model GuildUpgrade {
  id          String   @id @default(uuid())
  guildId     String   @map("guild_id")
  upgradeType String   @map("upgrade_type") @db.VarChar(32)
  tier        Int      @default(1)
  activatedAt DateTime @default(now()) @map("activated_at")
  expiresAt   DateTime @map("expires_at")
  activatedBy String   @map("activated_by")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@index([guildId, upgradeType, expiresAt])
  @@map("guild_upgrades")
}

model GuildProject {
  id                String    @id @default(uuid())
  guildId           String    @map("guild_id")
  projectKey        String    @map("project_key") @db.VarChar(64)
  turnsContributed  Int       @default(0) @map("turns_contributed")
  materialsProgress Json      @default("{}") @map("materials_progress")
  status            String    @default("active") @db.VarChar(16)
  startedAt         DateTime  @default(now()) @map("started_at")
  completedAt       DateTime? @map("completed_at")

  guild         Guild                     @relation(fields: [guildId], references: [id], onDelete: Cascade)
  contributions GuildProjectContribution[]

  @@unique([guildId, projectKey])
  @@map("guild_projects")
}

model GuildProjectContribution {
  id                   String @id @default(uuid())
  projectId            String @map("project_id")
  playerId             String @map("player_id")
  turnsContributed     Int    @default(0) @map("turns_contributed")
  materialsContributed Json   @default("{}") @map("materials_contributed")

  project GuildProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, playerId])
  @@map("guild_project_contributions")
}

model GuildContract {
  id           String   @id @default(uuid())
  guildId      String   @map("guild_id")
  contractKey  String   @map("contract_key") @db.VarChar(64)
  targetValue  Int      @map("target_value")
  currentValue Int      @default(0) @map("current_value")
  status       String   @default("active") @db.VarChar(16)
  weekStartedAt DateTime @map("week_started_at")
  expiresAt    DateTime @map("expires_at")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@index([guildId, status])
  @@map("guild_contracts")
}

model GuildLog {
  id        String   @id @default(uuid())
  guildId   String   @map("guild_id")
  eventType String   @map("event_type") @db.VarChar(32)
  message   String   @db.VarChar(200)
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@index([guildId, createdAt])
  @@map("guild_logs")
}
```

**Step 2: Add GuildMember relation to Player model**

In the `Player` model, add after `achievements PlayerAchievement[]`:
```prisma
  guildMember        GuildMember?
```

**Step 3: Run migration**

Run: `npm run db:migrate -- --name guild_system`

**Step 4: Generate Prisma client**

Run: `npm run db:generate`

**Step 5: Build database package**

Run: `npm run build --workspace=packages/database`

**Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add guild system schema and migration"
```

---

### Task 3: Guild Service — Core CRUD

**Files:**
- Create: `apps/api/src/services/guildService.ts`
- Create: `apps/api/src/services/guildService.test.ts`

**Step 1: Write failing tests for guild creation**

```typescript
// apps/api/src/services/guildService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUILD_CONSTANTS } from '@adventure/shared';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';
import { createGuild, getGuild, getPlayerGuild, searchGuilds } from './guildService';

const mockPrisma = prisma as unknown as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGuild', () => {
  it('creates guild and sets creator as leader', async () => {
    const player = { id: 'p1', characterLevel: 25, username: 'TestPlayer' };
    mockPrisma.player.findUnique.mockResolvedValue(player);
    mockPrisma.guildMember.findUnique.mockResolvedValue(null); // not in a guild
    mockPrisma.guild.findFirst.mockResolvedValue(null); // name not taken
    mockPrisma.guild.create.mockResolvedValue({
      id: 'g1', name: 'TestGuild', tag: 'TG', description: null,
      leaderId: 'p1', level: 1, xp: 0n, recruitmentMode: 'invite_only',
      minLevelRequirement: 0, taxRate: 5, specialization: null,
      renown: 0, seasonalRenown: 0, treasuryTurns: 0,
      createdAt: new Date('2026-01-01'),
      _count: { members: 1 },
    });
    // Mock turnBank for spending turns
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1', currentTurns: 60000, lastRegenAt: new Date(),
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

    const result = await createGuild('p1', 'TestGuild', 'TG', null);

    expect(result.name).toBe('TestGuild');
    expect(result.tag).toBe('TG');
    expect(result.leaderId).toBe('p1');
  });

  it('throws if player level too low', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 5 });

    await expect(createGuild('p1', 'Test', 'TG', null))
      .rejects.toThrow(`Character level ${GUILD_CONSTANTS.CREATION_MIN_LEVEL} required`);
  });

  it('throws if player already in a guild', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 25 });
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g2', playerId: 'p1' });

    await expect(createGuild('p1', 'Test', 'TG', null))
      .rejects.toThrow('Already in a guild');
  });

  it('throws if guild name taken', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 25 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(createGuild('p1', 'TakenName', 'TG', null))
      .rejects.toThrow('name or tag already taken');
  });
});

describe('getPlayerGuild', () => {
  it('returns null if player has no guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await getPlayerGuild('p1');
    expect(result).toBeNull();
  });

  it('returns guild data with member list when player has guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member',
      guild: {
        id: 'g1', name: 'TestGuild', tag: 'TG', description: null,
        leaderId: 'leader1', level: 3, xp: 500n,
        recruitmentMode: 'open', minLevelRequirement: 0, taxRate: 10,
        specialization: null, renown: 100, seasonalRenown: 50,
        treasuryTurns: 5000, createdAt: new Date(),
        _count: { members: 5 },
        members: [
          { playerId: 'p1', role: 'member', joinedAt: new Date(),
            totalTurnsContributed: 100, weeklyTurnsContributed: 50,
            lastActiveAt: new Date(),
            player: { username: 'TestPlayer', characterLevel: 15 } },
        ],
      },
    });

    const result = await getPlayerGuild('p1');
    expect(result).not.toBeNull();
    expect(result!.guild.name).toBe('TestGuild');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run guildService`
Expected: FAIL (module not found)

**Step 3: Implement guild service**

Create `apps/api/src/services/guildService.ts` with these functions:

- `createGuild(playerId, name, tag, description)` — validates level/membership/uniqueness, spends turns, creates guild + member + log in transaction
- `getGuild(guildId)` — returns guild data with member list
- `getPlayerGuild(playerId)` — returns guild + role via GuildMember lookup, or null
- `searchGuilds(query?, page?)` — paginated search by name/tag, returns `GuildSearchResult[]`
- `joinGuild(playerId, guildId)` — validates level, recruitment mode, max members, creates member + log
- `leaveGuild(playerId)` — validates not leader, removes member + log
- `kickMember(requesterId, targetId)` — validates requester is officer+, target is not leader
- `promoteMember(leaderId, targetId)` — leader promotes member → officer
- `demoteMember(leaderId, targetId)` — leader demotes officer → member
- `transferLeadership(leaderId, targetId)` — transfer leader role
- `disbandGuild(leaderId)` — delete guild (cascade deletes members, upgrades, etc.)
- `updateSettings(requesterId, guildId, settings)` — update recruitment mode, min level, tax rate, description
- `getGuildLog(guildId, page?)` — paginated activity log
- `addGuildLog(guildId, eventType, message, metadata?)` — internal helper, used by all mutating functions
- `calculateMaxMembers(level)` — `GUILD_CONSTANTS.BASE_MAX_MEMBERS + floor(level / 2)`
- `calculateTreasuryCap(level)` — `GUILD_CONSTANTS.TREASURY_BASE_CAP + (level * GUILD_CONSTANTS.TREASURY_CAP_PER_LEVEL)`
- `calculateXpForLevel(level)` — `floor(GUILD_CONSTANTS.XP_PER_LEVEL_BASE * level ** GUILD_CONSTANTS.XP_PER_LEVEL_EXPONENT)`
- `addGuildXp(guildId, amount)` — add XP, check for level-up, return new level

Follow existing service patterns:
- Input validation throws `AppError` immediately
- Use `prisma.$transaction()` for multi-step operations
- Return typed interfaces (`GuildData`, `GuildMemberData`, etc.) not raw DB objects
- All guild-modifying operations call `addGuildLog()` within the transaction

**Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --run guildService`
Expected: PASS

**Step 5: Add tests for join/leave/kick/promote/demote**

Add test cases for:
- `joinGuild`: happy path (open guild), rejects if guild full, rejects if level too low, rejects if already in guild, rejects if invite-only
- `leaveGuild`: happy path, rejects if leader (must transfer first)
- `kickMember`: happy path (officer kicks member), rejects if kicking self, rejects if member tries to kick
- `promoteMember`: happy path, rejects if not leader
- `demoteMember`: happy path, rejects if target is leader
- `transferLeadership`: happy path (old leader becomes officer, new leader set)
- `disbandGuild`: happy path, rejects if not leader

**Step 6: Implement remaining functions and verify all tests pass**

Run: `npm run test:api -- --run guildService`
Expected: All PASS

**Step 7: Commit**

```bash
git add apps/api/src/services/guildService.ts apps/api/src/services/guildService.test.ts
git commit -m "feat(api): add guild service with CRUD and member management"
```

---

### Task 4: Guild Routes

**Files:**
- Create: `apps/api/src/routes/guild.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create guild router**

```typescript
// apps/api/src/routes/guild.ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import {
  createGuild, getPlayerGuild, getGuild, searchGuilds,
  joinGuild, leaveGuild, kickMember, promoteMember,
  demoteMember, transferLeadership, disbandGuild,
  updateSettings, getGuildLog,
} from '../services/guildService';

export const guildRouter = Router();
guildRouter.use(authenticate);

// Zod schemas
const createSchema = z.object({
  name: z.string().min(3).max(32).trim(),
  tag: z.string().min(2).max(4).trim().toUpperCase(),
  description: z.string().max(200).trim().nullable().optional(),
});

const settingsSchema = z.object({
  recruitmentMode: z.enum(['open', 'invite_only', 'closed']).optional(),
  minLevelRequirement: z.number().int().min(0).max(100).optional(),
  taxRate: z.number().int().min(0).max(20).optional(),
  description: z.string().max(200).trim().nullable().optional(),
});

const searchSchema = z.object({
  query: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const targetSchema = z.object({
  targetId: z.string().uuid(),
});

// POST / — create guild
guildRouter.post('/', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await createGuild(playerId, parsed.data.name, parsed.data.tag, parsed.data.description ?? null);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// GET / — get player's guild
guildRouter.get('/', async (req, res, next) => {
  try {
    const result = await getPlayerGuild(req.player!.playerId);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /search — search guilds
guildRouter.get('/search', async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid query', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await searchGuilds(parsed.data.query, parsed.data.page);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /:id — get guild by ID
guildRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await getGuild(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /:id — update settings
guildRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid settings', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await updateSettings(req.player!.playerId, req.params.id, parsed.data);
    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /:id — disband guild
guildRouter.delete('/:id', async (req, res, next) => {
  try {
    await disbandGuild(req.player!.playerId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/join
guildRouter.post('/:id/join', async (req, res, next) => {
  try {
    const result = await joinGuild(req.player!.playerId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /:id/leave
guildRouter.post('/:id/leave', async (req, res, next) => {
  try {
    await leaveGuild(req.player!.playerId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/kick
guildRouter.post('/:id/kick', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await kickMember(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/promote
guildRouter.post('/:id/promote', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await promoteMember(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/demote
guildRouter.post('/:id/demote', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await demoteMember(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/transfer
guildRouter.post('/:id/transfer', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await transferLeadership(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /:id/log
guildRouter.get('/:id/log', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const result = await getGuildLog(req.params.id, page);
    res.json(result);
  } catch (err) { next(err); }
});
```

**Step 2: Register route in `apps/api/src/index.ts`**

Find where other routes are registered (e.g., `app.use('/api/v1/chat', chatRouter)`) and add:
```typescript
import { guildRouter } from './routes/guild';
// ...
app.use('/api/v1/guild', guildRouter);
```

**Step 3: Build and typecheck**

Run: `npm run build:api`
Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/guild.ts apps/api/src/index.ts
git commit -m "feat(api): add guild routes with Zod validation"
```

---

### Task 5: Guild Tax Integration

**Files:**
- Modify: `apps/api/src/services/turnBankService.ts`
- Create: `apps/api/src/services/guildTaxService.ts`
- Modify: Routes that spend turns (combat, exploration, crafting, gathering, travel, pvp, hp rest, boss signup)

**Step 1: Create guild tax service**

```typescript
// apps/api/src/services/guildTaxService.ts
import { prisma } from '@adventure/database';

export interface TaxResult {
  preTaxAmount: number;
  taxAmount: number;
  postTaxAmount: number;
  guildId: string | null;
}

/**
 * Calculate and apply guild tax to a turn spend.
 * Returns the post-tax amount the player actually gets to use.
 * Tax goes to guild treasury.
 */
export async function applyGuildTax(
  playerId: string,
  turnAmount: number,
): Promise<TaxResult> {
  // Check if player is in a guild
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, taxRate: true, treasuryTurns: true, level: true } } },
  });

  if (!membership || membership.guild.taxRate === 0) {
    return { preTaxAmount: turnAmount, taxAmount: 0, postTaxAmount: turnAmount, guildId: null };
  }

  const taxRate = membership.guild.taxRate / 100;
  const taxAmount = Math.floor(turnAmount * taxRate);
  const postTaxAmount = turnAmount - taxAmount;

  if (taxAmount > 0) {
    const cap = calculateTreasuryCap(membership.guild.level);
    const newTreasury = Math.min(membership.guild.treasuryTurns + taxAmount, cap);
    const actualTax = newTreasury - membership.guild.treasuryTurns;

    await prisma.$transaction([
      prisma.guild.update({
        where: { id: membership.guild.id },
        data: { treasuryTurns: { increment: actualTax } },
      }),
      prisma.guildMember.update({
        where: { guildId_playerId: { guildId: membership.guild.id, playerId } },
        data: {
          totalTurnsContributed: { increment: actualTax },
          weeklyTurnsContributed: { increment: actualTax },
          lastActiveAt: new Date(),
        },
      }),
    ]);
  }

  return {
    preTaxAmount: turnAmount,
    taxAmount,
    postTaxAmount,
    guildId: membership.guild.id,
  };
}

function calculateTreasuryCap(level: number): number {
  return 100_000 + (level * 10_000);
}
```

**Step 2: Integrate tax into turn-spending routes**

For each route that calls `spendPlayerTurns()`, the integration pattern is:

```typescript
// Before: spends full amount
await spendPlayerTurns(playerId, turnCost);

// After: calculate tax, spend full amount, but use post-tax for the action
const { postTaxAmount } = await applyGuildTax(playerId, turnCost);
await spendPlayerTurns(playerId, turnCost); // player pays full cost
// Use postTaxAmount for the actual game action (e.g., exploration turns)
```

**Key routes to modify:**
- `apps/api/src/routes/exploration.ts` — exploration start (use `postTaxAmount` for exploration turns)
- `apps/api/src/routes/combat.ts` — combat start
- `apps/api/src/routes/crafting.ts` — craft/forge/salvage
- `apps/api/src/routes/gathering.ts` — mine
- `apps/api/src/routes/zones.ts` — travel
- `apps/api/src/routes/pvp.ts` — challenge/scout
- `apps/api/src/routes/hp.ts` — rest
- `apps/api/src/routes/boss.ts` — signup

For combat/crafting/PvP where the turn cost IS the cost (not a "turns used for action"), the tax simply reduces effective turns available. For exploration where turns = investment, the player gets `postTaxAmount` turns of exploration for their `turnCost` spend.

**Step 3: Add guild XP hooks**

In the same routes, after the action completes successfully, add guild XP:

```typescript
// After successful combat kill
import { addGuildXp, getPlayerGuildId } from '../services/guildService';
const guildId = await getPlayerGuildId(playerId);
if (guildId) await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
```

Same pattern for crafting (`XP_PER_CRAFT`) and boss rounds (`XP_PER_BOSS_ROUND`).

**Step 4: Write tests for tax service**

Test: tax calculated correctly, treasury capped, 0% tax returns full amount, no guild returns full amount.

**Step 5: Build and typecheck**

Run: `npm run build:api`
Run: `npm run typecheck`

**Step 6: Run all existing tests to verify no regressions**

Run: `npm run test:api`
Expected: All existing tests PASS (mocked DB means tax lookups return null → no tax applied)

**Step 7: Commit**

```bash
git add apps/api/src/services/guildTaxService.ts apps/api/src/services/guildTaxService.test.ts
git add apps/api/src/routes/exploration.ts apps/api/src/routes/combat.ts apps/api/src/routes/crafting.ts
git add apps/api/src/routes/gathering.ts apps/api/src/routes/zones.ts apps/api/src/routes/pvp.ts
git add apps/api/src/routes/hp.ts apps/api/src/routes/boss.ts
git commit -m "feat(api): add guild tax system with route integration"
```

---

### Task 6: Guild Chat Integration

**Files:**
- Modify: `apps/api/src/services/chatService.ts`
- Modify: `apps/api/src/socket/chatHandlers.ts` (if exists)

**Step 1: Add guild membership check for guild chat**

In `chatService.ts`, the existing `saveMessage` and `getChannelHistory` already accept `channelType`. For guild chat, add a validation that the player is a member of the guild (channelId = guildId).

Add a helper:
```typescript
export async function validateGuildChatAccess(playerId: string, guildId: string): Promise<boolean> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
  });
  return membership?.guildId === guildId;
}
```

**Step 2: Update socket handlers to validate guild chat access**

In the socket handler for `chat:send`, add guild membership check when `channelType === 'guild'`.

**Step 3: Commit**

```bash
git add apps/api/src/services/chatService.ts apps/api/src/socket/chatHandlers.ts
git commit -m "feat(api): add guild chat access validation"
```

---

### Task 7: Frontend API Types & Functions

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add guild API types and functions**

Add to `api.ts`:

```typescript
// Guild types
export interface GuildResponse {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  leaderUsername?: string;
  level: number;
  xp: string;
  memberCount: number;
  maxMembers: number;
  recruitmentMode: string;
  minLevelRequirement: number;
  taxRate: number;
  specialization: string | null;
  renown: number;
  seasonalRenown: number;
  treasuryTurns: number;
  treasuryCap: number;
  createdAt: string;
}

export interface GuildMemberResponse {
  playerId: string;
  username: string;
  characterLevel: number;
  role: string;
  joinedAt: string;
  totalTurnsContributed: number;
  weeklyTurnsContributed: number;
  isActive: boolean;
}

export interface PlayerGuildResponse {
  guild: GuildResponse;
  role: string;
  members: GuildMemberResponse[];
}

export interface GuildSearchResponse {
  guilds: GuildResponse[];
  total: number;
  page: number;
}

// Guild API functions
export async function getPlayerGuild(): Promise<PlayerGuildResponse | null> {
  return fetchApi<PlayerGuildResponse | null>('/guild');
}

export async function createGuild(name: string, tag: string, description: string | null): Promise<GuildResponse> {
  return fetchApi<GuildResponse>('/guild', {
    method: 'POST',
    body: JSON.stringify({ name, tag, description }),
  });
}

export async function searchGuilds(query?: string, page?: number): Promise<GuildSearchResponse> {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (page) params.set('page', String(page));
  return fetchApi<GuildSearchResponse>(`/guild/search?${params}`);
}

export async function joinGuild(guildId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}/join`, { method: 'POST' });
}

export async function leaveGuild(guildId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}/leave`, { method: 'POST' });
}

export async function kickGuildMember(guildId: string, targetId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}/kick`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function promoteGuildMember(guildId: string, targetId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}/promote`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function demoteGuildMember(guildId: string, targetId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}/demote`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function transferGuildLeadership(guildId: string, targetId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function disbandGuild(guildId: string): Promise<void> {
  await fetchApi(`/guild/${guildId}`, { method: 'DELETE' });
}

export async function updateGuildSettings(guildId: string, settings: Record<string, unknown>): Promise<GuildResponse> {
  return fetchApi<GuildResponse>(`/guild/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function getGuildLog(guildId: string, page?: number): Promise<{ entries: any[]; total: number }> {
  const params = page ? `?page=${page}` : '';
  return fetchApi(`/guild/${guildId}/log${params}`);
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add guild API types and functions"
```

---

### Task 8: Frontend Guild Screen

**Files:**
- Create: `apps/web/src/components/screens/GuildScreen.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts` (add guild navigation + state)
- Modify: `apps/web/src/app/game/page.tsx` (add GuildScreen to screen router)

**Step 1: Create GuildScreen component**

Build a tabbed guild screen with these views:
- **No Guild view**: Show guild search + create button
- **Guild Overview**: Guild info, level, XP bar, treasury, tax rate, members online
- **Members tab**: Member list with roles, promote/demote/kick actions for officers+
- **Activity Log tab**: Paginated guild log
- **Settings tab** (leader/officer): recruitment mode, tax rate, min level, description

Follow existing screen patterns (DashboardScreen, ArenaScreen, etc.):
- Use RPG theme CSS variables (`--rpg-gold`, `--rpg-green-light`, etc.)
- Use existing UI primitives from `components/ui/`
- Use existing `Pagination` component from `components/common/`

**Step 2: Add guild state to useGameController**

```typescript
// In useGameController.ts, add:
const [playerGuild, setPlayerGuild] = useState<PlayerGuildResponse | null>(null);
const [guildLoading, setGuildLoading] = useState(false);

const handleRefreshGuild = useCallback(async () => {
  setGuildLoading(true);
  try {
    const result = await getPlayerGuild();
    setPlayerGuild(result);
  } catch (err) {
    console.error('Failed to fetch guild:', err);
  } finally {
    setGuildLoading(false);
  }
}, []);
```

Add `guild` to the screen type union and expose guild-related state/handlers.

**Step 3: Add GuildScreen to page.tsx screen router**

In the screen routing switch/conditional in `page.tsx`, add the guild screen case.

**Step 4: Add Guild button to navigation**

Add a "Guild" button to the bottom navigation or side nav (follow existing nav patterns). Show a guild tag badge if the player is in a guild.

**Step 5: Build and test**

Run: `npm run build:web`
Expected: Builds without errors

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/GuildScreen.tsx
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat(web): add guild screen with search, create, members, log"
```

---

## Phase 2: Engagement Features (Outline)

### Task 9: Guild Upgrade Definitions & Service
- Define `GUILD_UPGRADE_DEFINITIONS` in `gameConstants.ts` (type, tiers, costs, effects, durations)
- Create `guildUpgradeService.ts` with `activateUpgrade()`, `getActiveUpgrades()`, `getAvailableUpgrades()`
- Check active upgrades in combat/crafting/gathering routes (same as world event modifier pattern)
- Add upgrade routes to `guild.ts`
- Add upgrade UI tab to GuildScreen

### Task 10: Guild Contract System
- Define `GUILD_CONTRACT_DEFINITIONS` in `gameConstants.ts` (types, target ranges by level)
- Create `guildContractService.ts` with `generateWeeklyContracts()`, `incrementContractProgress()`, `getActiveContracts()`
- Hook contract progress into combat/crafting/gathering routes (after action completes, check if guild has matching contract)
- Add contract routes + UI tab

### Task 11: Guild Leaderboard
- Extend existing `leaderboardService.ts` refresh to include guild categories
- Add guild Redis sorted sets
- Add guild leaderboard tab to LeaderboardScreen
- Add guild leaderboard routes

### Task 12: Guild Achievements
- Define `GUILD_ACHIEVEMENT_DEFINITIONS` in constants
- Create `guildAchievementService.ts` following player achievement pattern
- Hook checks into guild actions (contract complete, project complete, etc.)
- Add achievements tab to GuildScreen

---

## Phase 3: Projects & Specialization (Outline)

### Task 13: Guild Project Definitions & Service
- Define project tree in `GUILD_PROJECT_DEFINITIONS` (keys, costs, prerequisites, perks)
- Create `guildProjectService.ts` with `startProject()`, `contributeMaterials()`, `getProjects()`, `getCompletedPerks()`
- Apply project perks alongside upgrades in combat/crafting/gathering routes
- Add project tree UI (visual dependency graph with progress bars)

### Task 14: Guild Specialization
- Add specialization selection endpoint
- Define `GUILD_SPECIALIZATION_DEFINITIONS` (paths, tiers, level gates, bonuses)
- Apply specialization bonuses in relevant routes
- Add specialization UI (selection screen at level 10, current bonuses display)

---

## Phase 4: Combat Rework (Outline)

### Task 15: Combat Action Types & Engine Refactor
- Define combat action types in shared types
- Create `CombatRotation` model in schema
- Refactor `runCombat()` in game-engine to accept per-round actions instead of instant resolution
- Each round: resolve actions based on submitted choices (attack, skill, shield, heal)
- Maintain backward compatibility for NPC/mob actions (they use existing spell patterns)

### Task 16: Solo PvE Combat Rotation
- Create rotation CRUD service + routes
- Modify solo combat to use player's rotation for action sequence
- Add conditional override support (HP thresholds, enemy telegraphs)
- Update combat playback to show chosen actions per round

### Task 17: PvP Per-Round Combat
- Modify PvP to work in rounds with action submission windows
- Create PvP round submission endpoint
- Add timer/default-action logic
- Update PvP UI for round-by-round play

### Task 18: Boss Encounter Action Integration
- Add action submission to boss round signup
- Modify boss round resolution to use submitted actions
- Update boss UI for action selection per round

---

## Phase 5: Expeditions (Outline)

### Task 19: Expedition Schema & Definitions
- Add `GuildExpedition` and `GuildExpeditionMember` models
- Define expedition tiers, room compositions, mob packs in constants
- Create expedition seed data

### Task 20: Raid Combat Engine
- Create `raidEngine.ts` in game-engine with mob pack combat (group-vs-group, shared HP pools)
- Handle mob pack behaviors (attack, heal, buff, enrage)
- Handle per-round action resolution for raid participants

### Task 21: Expedition Service & Routes
- Create `expeditionService.ts` with launch, signup, room progression, loot distribution
- Add expedition routes to guild router
- Integrate with raid combat engine

### Task 22: Expedition Frontend
- Create expedition dungeon UI (room-by-room progress, mob pack status, action submission)
- Add expedition tab to GuildScreen
- Expedition results/loot display

---

## Verification Checklist (Phase 1)

After completing Tasks 1-8:

1. `npm run db:migrate` — migration succeeds
2. `npm run build` — all packages build
3. `npm run typecheck` — no TS errors
4. `npm run test:engine` — game engine tests pass (no changes)
5. `npm run test:api` — API tests pass including new guild tests
6. Manual test: create guild, join, leave, kick, promote, demote, transfer, disband
7. Manual test: guild chat works (send/receive messages in guild channel)
8. Manual test: guild tax deducts from turn spend and adds to treasury
9. Manual test: guild XP increments from member combat/crafting
10. Manual test: guild search returns guilds, filtered by name/tag
