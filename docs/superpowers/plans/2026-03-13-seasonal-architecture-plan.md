# Seasonal Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Account-above-Player architecture, Season model, and seasonal infrastructure so PocketRealm can run competitive seasonal realms alongside the permanent realm.

**Architecture:** New `Account` table sits above `Player`. Auth tokens embed `accountId + playerId + seasonId`. Each account has one permanent Player and optionally one seasonal Player. Season balance tuning is data-driven via JSON constant overrides. Merge pipeline transfers eligible progress from seasonal to permanent Player at season end. All infrastructure ships dormant on day one.

**Tech Stack:** Prisma 6 (PostgreSQL), Express 4, JWT, Redis (leaderboards), Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-seasonal-architecture-design.md`

---

## Chunk 1: Schema & Database

### Task 1: Account Model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add Account model to schema**

Add above the Player model:

```prisma
model Account {
  id            String    @id @default(uuid())
  email         String    @unique @db.VarChar(255)
  passwordHash  String    @map("password_hash") @db.VarChar(255)
  role          String    @default("player") @db.VarChar(16)
  createdAt     DateTime  @default(now()) @map("created_at")
  lastActiveAt  DateTime? @map("last_active_at")
  activePlayerId String?  @unique @map("active_player_id")

  activePlayer  Player?   @relation("ActivePlayer", fields: [activePlayerId], references: [id])
  players       Player[]  @relation("AccountPlayers")
  refreshTokens RefreshToken[]
  friendshipsSent     Friendship[]  @relation("FriendshipSender")
  friendshipsReceived Friendship[]  @relation("FriendshipReceiver")
  blocksInitiated     PlayerBlock[] @relation("PlayerBlockBlocker")
  blocksReceived      PlayerBlock[] @relation("PlayerBlockBlocked")
  friendMailsSent     FriendMail[]  @relation("FriendMailSender")
  friendMailsReceived FriendMail[]  @relation("FriendMailRecipient")
  seasonArchives      SeasonArchive[]
  hallOfFameEntries   HallOfFameEntry[]

  @@map("accounts")
}
```

- [ ] **Step 2: Refactor Player model**

Remove from Player: `email`, `passwordHash`, `role`. Add `accountId` and `seasonId`:

```prisma
model Player {
  id            String    @id @default(uuid())  username      String    @unique @db.VarChar(32)
  accountId     String    @map("account_id")  seasonId      String?   @map("season_id")  isBot         Boolean   @default(false) @map("is_bot")
  // ... keep all other existing fields (characterXp, gold, hp, etc.)

  account       Account   @relation("AccountPlayers", fields: [accountId], references: [id], onDelete: Cascade)
  activeFor     Account?  @relation("ActivePlayer")
  season        Season?   @relation(fields: [seasonId], references: [id])
  // ... keep all other existing relations

  @@index([accountId])
  @@index([seasonId])
  @@map("players")
}
```

- [ ] **Step 3: Move RefreshToken from Player to Account**

```prisma
model RefreshToken {
  id        String   @id @default(uuid())  accountId String   @map("account_id")  token     String   @unique @db.VarChar(512)
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  account   Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}
```

- [ ] **Step 4: Verify schema compiles**

Run: `cd packages/database && npx prisma format`
Expected: Schema formatted without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "schema: add Account model, refactor Player and RefreshToken"
```

---

### Task 2: Season & Seasonal Infrastructure Models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add Season model**

```prisma
model Season {
  id                String   @id @default(uuid())  name              String   @db.VarChar(64)
  status            String   @default("upcoming") @db.VarChar(16) // upcoming | active | ended | archived
  startsAt          DateTime @map("starts_at")
  endsAt            DateTime @map("ends_at")
  constantOverrides Json?    @map("constant_overrides")
  features          Json?    @default("[]")
  createdAt         DateTime @default(now()) @map("created_at")

  players           Player[]
  guilds            Guild[]
  itemTemplates     ItemTemplate[]
  craftingRecipes   CraftingRecipe[]
  zones             Zone[]
  mobTemplates      MobTemplate[]
  seasonArchives    SeasonArchive[]
  hallOfFameEntries HallOfFameEntry[]
  rewardTiers       SeasonRewardTier[]

  @@map("seasons")
}
```

- [ ] **Step 2: Add SeasonArchive model**

```prisma
model SeasonArchive {
  id               String   @id @default(uuid())  accountId        String   @map("account_id")  seasonId         String   @map("season_id")  username         String   @db.VarChar(32)
  characterLevel   Int      @map("character_level")
  characterXp      BigInt   @map("character_xp")
  attributes       Json
  skills           Json
  stats            Json
  combatTemplates  Json     @default("[]") @map("combat_templates")
  leaderboardRanks Json     @default("{}") @map("leaderboard_ranks")
  rewardsEarned    Json     @default("{}") @map("rewards_earned")
  mergeLog         Json     @default("{}") @map("merge_log")
  createdAt        DateTime @default(now()) @map("created_at")

  account          Account  @relation(fields: [accountId], references: [id])
  season           Season   @relation(fields: [seasonId], references: [id])

  @@unique([accountId, seasonId])
  @@map("season_archives")
}
```

- [ ] **Step 3: Add HallOfFameEntry model**

```prisma
model HallOfFameEntry {
  id        String   @id @default(uuid())  seasonId  String   @map("season_id")  category  String   @db.VarChar(32)
  rank      Int
  accountId String   @map("account_id")  username  String   @db.VarChar(32)
  value     Float
  createdAt DateTime @default(now()) @map("created_at")

  season    Season   @relation(fields: [seasonId], references: [id])
  account   Account  @relation(fields: [accountId], references: [id])

  @@unique([seasonId, category, rank])
  @@map("hall_of_fame_entries")
}
```

- [ ] **Step 4: Add SeasonRewardTier model**

```prisma
model SeasonRewardTier {
  id       String @id @default(uuid())  seasonId String @map("season_id")  category String @db.VarChar(32)
  minRank  Int    @map("min_rank")
  maxRank  Int    @map("max_rank")
  rewards  Json

  season   Season @relation(fields: [seasonId], references: [id])

  @@map("season_reward_tiers")
}
```

- [ ] **Step 5: Verify schema compiles**

Run: `cd packages/database && npx prisma format`
Expected: Schema formatted without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "schema: add Season, SeasonArchive, HallOfFameEntry, SeasonRewardTier models"
```

---

### Task 3: Content Scoping & Guild SeasonId

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add seasonId to content template tables**

Add to `ItemTemplate`:
```prisma
  seasonId    String?      @map("season_id")  season      Season?      @relation(fields: [seasonId], references: [id])
```

Add to `CraftingRecipe`:
```prisma
  seasonId    String?      @map("season_id")  season      Season?      @relation(fields: [seasonId], references: [id])
```

Add to `Zone`:
```prisma
  seasonId    String?      @map("season_id")  season      Season?      @relation(fields: [seasonId], references: [id])
```

Add to `MobTemplate`:
```prisma
  seasonId    String?      @map("season_id")  season      Season?      @relation(fields: [seasonId], references: [id])
```

Add to `Guild`:
```prisma
  seasonId    String?      @map("season_id")  season      Season?      @relation(fields: [seasonId], references: [id])
```

- [ ] **Step 2: Verify schema compiles**

Run: `cd packages/database && npx prisma format`

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "schema: add seasonId FK to content templates and Guild"
```

---

### Task 4: Social Features — Account-Scoped

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Refactor Friendship model**

Change `senderId`/`receiverId` from Player FK to Account FK:

```prisma
model Friendship {
  id         String    @id @default(uuid())  senderId   String    @map("sender_id")  receiverId String    @map("receiver_id")  status     String    @default("pending") @db.VarChar(16)
  createdAt  DateTime  @default(now()) @map("created_at")
  acceptedAt DateTime? @map("accepted_at")

  sender     Account   @relation("FriendshipSender", fields: [senderId], references: [id], onDelete: Cascade)
  receiver   Account   @relation("FriendshipReceiver", fields: [receiverId], references: [id], onDelete: Cascade)

  @@unique([senderId, receiverId])
  @@map("friendships")
}
```

- [ ] **Step 2: Refactor PlayerBlock model**

```prisma
model PlayerBlock {
  id        String   @id @default(uuid())  blockerId String   @map("blocker_id")  blockedId String   @map("blocked_id")  createdAt DateTime @default(now()) @map("created_at")

  blocker   Account  @relation("PlayerBlockBlocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   Account  @relation("PlayerBlockBlocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@map("player_blocks")
}
```

- [ ] **Step 3: Refactor FriendMail model**

```prisma
model FriendMail {
  id                   String   @id @default(uuid())  senderId             String   @map("sender_id")  recipientId          String   @map("recipient_id")  subject              String   @db.VarChar(100)
  body                 String   @db.VarChar(1000)
  goldCost             Int      @default(0) @map("gold_cost")
  isSystem             Boolean  @default(false) @map("is_system")
  isRead               Boolean  @default(false) @map("is_read")
  isDeletedBySender    Boolean  @default(false) @map("is_deleted_by_sender")
  isDeletedByRecipient Boolean  @default(false) @map("is_deleted_by_recipient")
  createdAt            DateTime @default(now()) @map("created_at")

  sender               Account  @relation("FriendMailSender", fields: [senderId], references: [id], onDelete: Cascade)
  recipient            Account  @relation("FriendMailRecipient", fields: [recipientId], references: [id], onDelete: Cascade)

  @@index([recipientId, isDeletedByRecipient, isRead])
  @@index([senderId, isDeletedBySender])
  @@map("friend_mails")
}
```

- [ ] **Step 4: Remove old Player relations for social features**

Remove from the Player model: `friendshipsSent`, `friendshipsReceived`, `blocksInitiated`, `blocksReceived`, `friendMailsSent`, `friendMailsReceived` relations.

- [ ] **Step 5: Verify schema compiles and commit**

Run: `cd packages/database && npx prisma format`

```bash
git add packages/database/prisma/schema.prisma
git commit -m "schema: move social features (Friendship, Block, Mail) to Account scope"
```

---

### Task 5: Create Migration & Reseed

**Files:**
- Modify: `packages/database/prisma/seed.ts`

- [ ] **Step 1: Create migration**

Run: `cd packages/database && npx prisma migrate dev --name seasonal-architecture --create-only`
Expected: Migration SQL file created (but not applied yet).

- [ ] **Step 1b: Add partial unique indexes to migration SQL**

Open the generated migration file and append:

```sql
-- Enforce one permanent player per account and one seasonal player per account+season
CREATE UNIQUE INDEX "players_account_permanent_unique" ON "players" ("account_id") WHERE "season_id" IS NULL;
CREATE UNIQUE INDEX "players_account_season_unique" ON "players" ("account_id", "season_id") WHERE "season_id" IS NOT NULL;
```

Then apply: `cd packages/database && npx prisma migrate dev`
Expected: Migration applied successfully.

- [ ] **Step 2: Update seed — create Account for each bot**

In `seedBots()`, update the bot creation flow to create an Account first, then a Player under it:

```ts
// For each bot:
const account = await prisma.account.create({
  data: {
    email: bot.email,
    passwordHash: bot.passwordHash,
    role: 'player',
  },
});

const player = await prisma.player.create({
  data: {
    username: bot.username,
    accountId: account.id,
    isBot: true,
    characterLevel: bot.characterLevel,
    // ... rest of bot fields
  },
});

// Set activePlayerId on account
await prisma.account.update({
  where: { id: account.id },
  data: { activePlayerId: player.id },
});
```

- [ ] **Step 3: Update cleanTemplateData()**

Add cleanup for new tables at the top of the function:
```ts
await prisma.seasonRewardTier.deleteMany({});
await prisma.hallOfFameEntry.deleteMany({});
await prisma.seasonArchive.deleteMany({});
await prisma.season.deleteMany({});
```

Update bot cleanup to also delete Account records:
```ts
// After deleting bot players, also delete their accounts
await prisma.account.deleteMany({
  where: { players: { none: {} } },
});
```

- [ ] **Step 4: Run seed and verify**

Run: `cd packages/database && npx prisma db seed`
Expected: Seed completes without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/
git commit -m "schema: create seasonal migration, update seed for Account model"
```

---

### Task 6: Shared Types Update

**Files:**
- Modify: `packages/shared/src/types/player.types.ts`
- Create: `packages/shared/src/types/season.types.ts`

- [ ] **Step 1: Update Player type — remove email, add accountId/seasonId**

In `packages/shared/src/types/player.types.ts`, update the `Player` interface:

```ts
export interface Player {
  id: string;
  username: string;
  accountId: string;
  seasonId: string | null;
  createdAt: Date;
  lastActiveAt: Date | null;
  characterXp: number;
  characterLevel: number;
  attributePoints: number;
  attributes: PlayerAttributes;
  gold: number;
}
```

- [ ] **Step 2: Create season types**

Create `packages/shared/src/types/season.types.ts`:

```ts
export interface Account {
  id: string;
  email: string;
  role: string;
  activePlayerId: string | null;
  createdAt: Date;
}

export type SeasonStatus = 'upcoming' | 'active' | 'ended' | 'archived';

export interface Season {
  id: string;
  name: string;
  status: SeasonStatus;
  startsAt: Date;
  endsAt: Date;
  constantOverrides: Record<string, Record<string, number>> | null;
  features: string[];
  createdAt: Date;
}

export interface SeasonArchive {
  id: string;
  accountId: string;
  seasonId: string;
  username: string;
  characterLevel: number;
  characterXp: number;
  attributes: Record<string, number>;
  skills: Record<string, { level: number; xp: number }>;
  stats: Record<string, number>;
  leaderboardRanks: Record<string, number>;
  rewardsEarned: Record<string, unknown>;
  mergeLog: Record<string, unknown>;
  createdAt: Date;
}

export interface HallOfFameEntry {
  id: string;
  seasonId: string;
  category: string;
  rank: number;
  accountId: string;
  username: string;
  value: number;
  createdAt: Date;
}

export interface CharacterSummary {
  id: string;
  username: string;
  characterLevel: number;
  seasonId: string | null;
  seasonName: string | null;
  seasonStatus: SeasonStatus | null;
  seasonEndsAt: Date | null;
}
```

- [ ] **Step 3: Export season types from shared index**

Add to `packages/shared/src/index.ts`:
```ts
export * from './types/season.types';
```

- [ ] **Step 4: Build shared package and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/player.types.ts packages/shared/src/types/season.types.ts packages/shared/src/index.ts
git commit -m "feat: add season types, update Player type for Account model"
```

---

## Chunk 2: Auth Refactor

### Task 7: Auth Middleware — New Payload & Season Cache

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/services/seasonCacheService.ts`

- [ ] **Step 1: Create season cache service**

Create `apps/api/src/services/seasonCacheService.ts`:

```ts
import { prisma } from '@pocketrealm/database';

interface CachedSeason {
  id: string;
  name: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  constantOverrides: Record<string, Record<string, number>> | null;
  features: string[];
}

let seasonCache: Map<string, CachedSeason> = new Map();
let lastRefreshed = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function refreshSeasonCache(): Promise<void> {
  const seasons = await prisma.season.findMany({
    where: { status: { in: ['active', 'ended'] } },
  });
  const newCache = new Map<string, CachedSeason>();
  for (const s of seasons) {
    newCache.set(s.id, {
      id: s.id,
      name: s.name,
      status: s.status,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      constantOverrides: s.constantOverrides as Record<string, Record<string, number>> | null,
      features: (s.features as string[]) ?? [],
    });
  }
  seasonCache = newCache;
  lastRefreshed = Date.now();
}

export function getCachedSeason(seasonId: string): CachedSeason | undefined {
  return seasonCache.get(seasonId);
}

export function isSeasonCacheStale(): boolean {
  return Date.now() - lastRefreshed > CACHE_TTL_MS;
}

export function getActiveSeason(): CachedSeason | undefined {
  for (const s of seasonCache.values()) {
    if (s.status === 'active') return s;
  }
  return undefined;
}
```

- [ ] **Step 2: Update AuthPayload interface**

In `apps/api/src/middleware/auth.ts`, update:

```ts
export interface AuthPayload {
  accountId: string;
  playerId: string;
  username: string;
  seasonId: string | null;
  role: string;
}
```

- [ ] **Step 3: Update authenticate middleware**

Update the `authenticate` function to attach `req.account` and `req.season`:

```ts
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid authorization header', 'UNAUTHORIZED');
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.player = payload;
    req.account = { id: payload.accountId, role: payload.role };

    if (payload.seasonId) {
      const season = getCachedSeason(payload.seasonId);
      if (season) {
        req.season = season;
      }
    }

    touchPlayerLastActive(payload.playerId);
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token', 'UNAUTHORIZED');
  }
}
```

- [ ] **Step 4: Update Express Request type augmentation**

Update the Express namespace declaration to include `account` and `season`:

```ts
declare global {
  namespace Express {
    interface Request {
      player?: AuthPayload;
      account?: { id: string; role: string };
      season?: {
        id: string;
        name: string;
        status: string;
        startsAt: Date;
        endsAt: Date;
        constantOverrides: Record<string, Record<string, number>> | null;
        features: string[];
      };
    }
  }
}
```

- [ ] **Step 5: Update optionalAuthenticate similarly**

Same pattern — set `req.account` and `req.season` when token is present and valid.

- [ ] **Step 6: Update generateAccessToken and generateRefreshToken**

The payload now includes `accountId`, `playerId`, `seasonId`. These functions accept the full `AuthPayload`. No signature changes needed — they already accept `AuthPayload`.

- [ ] **Step 7: Update verifyRefreshToken**

Validate that `accountId` and `playerId` are present (instead of just `playerId`):

```ts
export function verifyRefreshToken(token: string): AuthPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    if (!payload.accountId || !payload.playerId) {
      throw new Error('Invalid token payload');
    }
    return payload;
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token', 'UNAUTHORIZED');
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/services/seasonCacheService.ts
git commit -m "feat: refactor auth for Account model, add season cache service"
```

---

### Task 8: Admin Middleware Update

**Files:**
- Modify: `apps/api/src/middleware/admin.ts`

- [ ] **Step 1: Update requireAdmin to use req.account or req.player.role**

```ts
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.player?.role !== 'admin') {
    throw new AppError(403, 'Admin access required', 'FORBIDDEN');
  }
  next();
}
```

This already works because `req.player.role` comes from the JWT payload which now sources `role` from Account. No change needed — just verify and confirm.

- [ ] **Step 2: Commit (if changes were needed)**

---

### Task 9: Auth Routes — Register

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Update register endpoint**

Refactor to create Account first, then Player:

```ts
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password } = registerSchema.parse(req.body);

  // Check uniqueness
  const existingAccount = await prisma.account.findUnique({ where: { email } });
  if (existingAccount) throw new AppError(409, 'Email already registered');

  const existingPlayer = await prisma.player.findUnique({ where: { username } });
  if (existingPlayer) throw new AppError(409, 'Username already taken');

  const passwordHash = await bcrypt.hash(password, 10);
  const starterTown = await prisma.zone.findFirst({ where: { isStarter: true, seasonId: null } });
  if (!starterTown) throw new AppError(500, 'No starter zone configured');

  const startingZone = await prisma.zoneConnection.findFirst({
    where: { fromId: starterTown.id },
    include: { toZone: true },
  });
  if (!startingZone) throw new AppError(500, 'No starting zone connected');

  const result = await prisma.$transaction(async (tx) => {
    // Create Account
    const account = await tx.account.create({
      data: { email, passwordHash, role: 'player' },
    });

    // Create permanent Player
    const player = await tx.player.create({
      data: {
        username,
        accountId: account.id,
        currentZoneId: startingZone.toZone.id,
        lastTravelledFromZoneId: starterTown.id,
        homeTownId: starterTown.id,
        turnBank: {
          create: { currentTurns: TURN_CONSTANTS.STARTING_TURNS, lastRegenAt: new Date() },
        },
        skills: {
          createMany: { data: ALL_SKILLS.map(s => ({ skillType: s, level: 1, xp: BigInt(0) })) },
        },
      },
    });

    // Set active player
    await tx.account.update({
      where: { id: account.id },
      data: { activePlayerId: player.id },
    });

    return { account, player };
  });

  // Post-transaction setup (these functions use the global prisma client, not tx)
  await ensureEquipmentSlots(result.player.id);

  // Create starter off-hand item (same as current register logic)
  const starterTemplate = await prisma.itemTemplate.findUnique({
    where: { id: STARTER_LOADOUT.tutorialOffHandTemplateId },
  });
  if (starterTemplate) {
    const starterItem = await prisma.item.create({
      data: {
        templateId: starterTemplate.id,
        ownerId: result.player.id,
        rarity: 'common',
        currentDurability: starterTemplate.maxDurability ?? 100,
        maxDurability: starterTemplate.maxDurability ?? 100,
      },
    });
    await prisma.playerEquipment.update({
      where: { playerId_slot: { playerId: result.player.id, slot: 'off_hand' } },
      data: { itemId: starterItem.id },
    });
  }

  // Zone discoveries and starter encounter/resource nodes (same as current register)
  await ensureStarterDiscoveries(result.player.id, startingZone.toZone.id, starterTown.id);
  await ensureStarterEncounterAndNodes(result.player.id, startingZone.toZone.id);

  const payload: AuthPayload = {
    accountId: result.account.id,
    playerId: result.player.id,
    username: result.player.username,
    seasonId: null,
    role: result.account.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      accountId: result.account.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(Date.now()),
    },
  });

  res.status(201).json({
    player: { id: result.player.id, username, email, role: result.account.role },
    accessToken,
    refreshToken,
  });
}));
```

- [ ] **Step 2: Verify register works**

Run: `npm run dev:api` and test with curl or API client.
Expected: Registration creates Account + Player, returns JWT with accountId.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: refactor register to create Account + Player"
```

---

### Task 10: Auth Routes — Login, Refresh, Logout

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Update login endpoint**

Find the account by email (instead of player), verify password, resolve active player:

```ts
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const account = await prisma.account.findUnique({
    where: { email },
    include: {
      activePlayer: true,
      players: { where: { isBot: false }, select: { id: true, seasonId: true } },
    },
  });
  if (!account) throw new AppError(401, 'Invalid email or password');

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid email or password');

  // If no active player set, default to permanent player
  let activePlayer = account.activePlayer;
  if (!activePlayer) {
    const permanent = account.players.find(p => p.seasonId === null);
    if (!permanent) throw new AppError(500, 'No permanent player found');
    activePlayer = await prisma.player.findUniqueOrThrow({ where: { id: permanent.id } });
    await prisma.account.update({ where: { id: account.id }, data: { activePlayerId: permanent.id } });
  }

  await prisma.account.update({ where: { id: account.id }, data: { lastActiveAt: new Date() } });

  const payload: AuthPayload = {
    accountId: account.id,
    playerId: activePlayer.id,
    username: activePlayer.username,
    seasonId: activePlayer.seasonId,
    role: account.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      accountId: account.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(Date.now()),
    },
  });

  res.json({ player: { id: activePlayer.id, username: activePlayer.username, role: account.role }, accessToken, refreshToken });
}));
```

- [ ] **Step 2: Update refresh endpoint**

Change RefreshToken lookups from `playerId` to `accountId`:

```ts
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new AppError(400, 'Refresh token required');

  const payload = verifyRefreshToken(token);

  const storedToken = await prisma.refreshToken.findUnique({ where: { token } });
  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  // Fetch current active player (may have changed since token was issued)
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: storedToken.accountId },
    include: { activePlayer: true },
  });

  if (!account.activePlayer) throw new AppError(500, 'No active player');

  const newPayload: AuthPayload = {
    accountId: account.id,
    playerId: account.activePlayer.id,
    username: account.activePlayer.username,
    seasonId: account.activePlayer.seasonId,
    role: account.role,
  };

  const accessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { id: storedToken.id } }),
    prisma.refreshToken.create({
      data: {
        accountId: account.id,
        token: newRefreshToken,
        expiresAt: refreshTokenExpiresAt(Date.now()),
      },
    }),
    prisma.account.update({ where: { id: account.id }, data: { lastActiveAt: new Date() } }),
  ]);

  res.json({ accessToken, refreshToken: newRefreshToken });
}));
```

- [ ] **Step 3: Update logout endpoint**

```ts
router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } });
  }
  res.json({ success: true });
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: refactor login/refresh/logout for Account model"
```

---

### Task 11: Auth Routes — New Endpoints

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Add GET /auth/characters**

```ts
router.get('/characters', authenticate, asyncHandler(async (req, res) => {
  const players = await prisma.player.findMany({
    where: { accountId: req.player!.accountId, isBot: false },
    select: {
      id: true,
      username: true,
      characterLevel: true,
      seasonId: true,
      season: { select: { name: true, status: true, endsAt: true } },
    },
  });

  const characters: CharacterSummary[] = players.map(p => ({
    id: p.id,
    username: p.username,
    characterLevel: p.characterLevel,
    seasonId: p.seasonId,
    seasonName: p.season?.name ?? null,
    seasonStatus: p.season?.status as SeasonStatus ?? null,
    seasonEndsAt: p.season?.endsAt ?? null,
  }));

  res.json({ characters, activePlayerId: req.player!.playerId });
}));
```

- [ ] **Step 2: Add POST /auth/switch-player**

```ts
const switchPlayerSchema = z.object({ playerId: z.string().uuid() });

router.post('/switch-player', authenticate, asyncHandler(async (req, res) => {
  const { playerId } = switchPlayerSchema.parse(req.body);

  // Verify player belongs to this account
  const player = await prisma.player.findFirst({
    where: { id: playerId, accountId: req.player!.accountId, isBot: false },
    include: { season: { select: { id: true, status: true } } },
  });
  if (!player) throw new AppError(404, 'Character not found');

  // Don't allow switching to a player in an ended/archived season
  if (player.season && player.season.status !== 'active') {
    throw new AppError(400, 'This seasonal character is no longer playable');
  }

  await prisma.account.update({
    where: { id: req.player!.accountId },
    data: { activePlayerId: playerId },
  });

  const account = await prisma.account.findUniqueOrThrow({ where: { id: req.player!.accountId } });

  const payload: AuthPayload = {
    accountId: req.player!.accountId,
    playerId: player.id,
    username: player.username,
    seasonId: player.seasonId,
    role: account.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      accountId: req.player!.accountId,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(Date.now()),
    },
  });

  res.json({
    player: { id: player.id, username: player.username },
    accessToken,
    refreshToken,
  });
}));
```

- [ ] **Step 3: Add POST /auth/join-season**

```ts
const joinSeasonSchema = z.object({ username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/) });

router.post('/join-season', authenticate, asyncHandler(async (req, res) => {
  const { username } = joinSeasonSchema.parse(req.body);

  // Find active season
  const activeSeason = await prisma.season.findFirst({ where: { status: 'active' } });
  if (!activeSeason) throw new AppError(400, 'No active season');

  // Check if already has a character for this season
  const existing = await prisma.player.findFirst({
    where: { accountId: req.player!.accountId, seasonId: activeSeason.id },
  });
  if (existing) throw new AppError(409, 'Already have a character for this season');

  // Check username uniqueness
  const usernameTaken = await prisma.player.findUnique({ where: { username } });
  if (usernameTaken) throw new AppError(409, 'Username already taken');

  // Find seasonal starter zone (or fall back to permanent starter)
  const starterTown = await prisma.zone.findFirst({
    where: {
      isStarter: true,
      OR: [{ seasonId: activeSeason.id }, { seasonId: null }],
    },
    orderBy: { seasonId: 'desc' }, // prefer seasonal zone
  });
  if (!starterTown) throw new AppError(500, 'No starter zone configured');

  const startingZone = await prisma.zoneConnection.findFirst({
    where: { fromId: starterTown.id },
    include: { toZone: true },
  });
  if (!startingZone) throw new AppError(500, 'No starting zone connected');

  const player = await prisma.$transaction(async (tx) => {
    const p = await tx.player.create({
      data: {
        username,
        accountId: req.player!.accountId,
        seasonId: activeSeason.id,
        currentZoneId: startingZone.toZone.id,
        lastTravelledFromZoneId: starterTown.id,
        homeTownId: starterTown.id,
        turnBank: {
          create: { currentTurns: TURN_CONSTANTS.STARTING_TURNS, lastRegenAt: new Date() },
        },
        skills: {
          createMany: { data: ALL_SKILLS.map(s => ({ skillType: s, level: 1, xp: BigInt(0) })) },
        },
      },
    });

    await ensureEquipmentSlots(p.id, tx);
    // ... same starter setup as register (starter items, zone discoveries)

    return p;
  });

  // Switch to the new seasonal character
  await prisma.account.update({
    where: { id: req.player!.accountId },
    data: { activePlayerId: player.id },
  });

  const account = await prisma.account.findUniqueOrThrow({ where: { id: req.player!.accountId } });

  const payload: AuthPayload = {
    accountId: req.player!.accountId,
    playerId: player.id,
    username: player.username,
    seasonId: activeSeason.id,
    role: account.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      accountId: req.player!.accountId,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(Date.now()),
    },
  });

  res.status(201).json({
    player: { id: player.id, username: player.username },
    seasonId: activeSeason.id,
    accessToken,
    refreshToken,
  });
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: add characters, switch-player, join-season auth endpoints"
```

---

### Task 12: Update All `req.player.playerId` References

**Files:**
- Modify: All route files in `apps/api/src/routes/`

- [ ] **Step 1: Search for all usages of `req.player!.playerId`**

Run: `grep -r "req\.player\!" apps/api/src/routes/ --include="*.ts" | head -50`

The `AuthPayload` still has `playerId`, so `req.player!.playerId` continues to work. No bulk changes needed — the field name hasn't changed, just the JWT structure behind it.

Verify that `req.player!.role` still works (it does — role is still in the payload).

- [ ] **Step 2: Update any routes that reference `req.player!.email` or similar removed fields**

Search for usages:
Run: `grep -rn "req\.player.*email\|req\.player.*passwordHash" apps/api/src/routes/ --include="*.ts"`

If any routes access email via `req.player`, they need to fetch it from Account instead. These are likely rare (profile endpoints) and should query `prisma.account.findUnique({ where: { id: req.player!.accountId } })`.

- [ ] **Step 3: Update social feature routes**

The friends/block/mail routes in `apps/api/src/routes/friends.ts` (if it exists) need to use `req.player!.accountId` instead of `req.player!.playerId` for friendship, block, and mail operations.

Search: `grep -rn "playerId" apps/api/src/routes/friends.ts`

Update all Friendship/PlayerBlock/FriendMail queries to use `accountId` (from `req.player!.accountId`) instead of `playerId`.

- [ ] **Step 4: Update social feature services**

Similarly update `apps/api/src/services/friendService.ts` (if it exists) to work with `accountId`.

- [ ] **Step 5: Build and verify no TypeScript errors**

Run: `npm run typecheck`
Expected: No new errors from auth payload changes.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/ apps/api/src/services/
git commit -m "feat: update route handlers for Account-based auth payload"
```

---

## Chunk 3: Constants Resolver & Leaderboard Namespacing

### Task 13: Constants Resolver

**Files:**
- Create: `packages/shared/src/utils/seasonConstants.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create constants resolver**

Create `packages/shared/src/utils/seasonConstants.ts`:

```ts
import * as allConstants from '../constants/gameConstants';

// Build a lookup object from all exported constant groups
type ConstantGroups = typeof allConstants;
type GroupName = keyof ConstantGroups;

const GAME_CONSTANTS: Record<string, Record<string, unknown>> = {};
for (const [key, value] of Object.entries(allConstants)) {
  if (typeof value === 'object' && value !== null && key.endsWith('_CONSTANTS')) {
    GAME_CONSTANTS[key] = value as Record<string, unknown>;
  }
}

export type SeasonOverrides = Record<string, Record<string, number>> | null | undefined;

/**
 * Resolve a game constant, applying season overrides if present.
 * Falls back to the base constant value when no override exists.
 */
export function getSeasonConstant(
  group: string,
  key: string,
  overrides?: SeasonOverrides,
): number {
  const override = overrides?.[group]?.[key];
  if (override !== undefined) return override;

  const base = GAME_CONSTANTS[group]?.[key];
  if (typeof base !== 'number') {
    throw new Error(`Unknown constant: ${group}.${key}`);
  }
  return base;
}

/**
 * Get a full constant group with overrides applied.
 * Returns a new object with all values from the base group,
 * with any matching overrides applied on top.
 */
export function getSeasonConstantGroup<K extends GroupName>(
  group: K,
  overrides?: SeasonOverrides,
): ConstantGroups[K] {
  const base = allConstants[group];
  if (!overrides?.[group as string]) return base;

  return { ...base, ...overrides[group as string] } as ConstantGroups[K];
}
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:
```ts
export { getSeasonConstant, getSeasonConstantGroup, type SeasonOverrides } from './utils/seasonConstants';
```

- [ ] **Step 3: Write test for constants resolver**

Create `packages/shared/src/utils/seasonConstants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSeasonConstant, getSeasonConstantGroup } from './seasonConstants';

describe('getSeasonConstant', () => {
  it('returns base value when no overrides', () => {
    const val = getSeasonConstant('SKILL_CONSTANTS', 'XP_EXPONENT');
    expect(val).toBe(1.8);
  });

  it('returns override when present', () => {
    const val = getSeasonConstant('SKILL_CONSTANTS', 'XP_EXPONENT', {
      SKILL_CONSTANTS: { XP_EXPONENT: 2.0 },
    });
    expect(val).toBe(2.0);
  });

  it('returns base value for keys not in overrides', () => {
    const val = getSeasonConstant('SKILL_CONSTANTS', 'XP_BASE', {
      SKILL_CONSTANTS: { XP_EXPONENT: 2.0 },
    });
    expect(val).toBe(100);
  });

  it('throws for unknown constant', () => {
    expect(() => getSeasonConstant('FAKE_GROUP', 'FAKE_KEY')).toThrow('Unknown constant');
  });
});

describe('getSeasonConstantGroup', () => {
  it('returns base group when no overrides', () => {
    const group = getSeasonConstantGroup('SKILL_CONSTANTS');
    expect(group.XP_EXPONENT).toBe(1.8);
  });

  it('merges overrides into group', () => {
    const group = getSeasonConstantGroup('SKILL_CONSTANTS', {
      SKILL_CONSTANTS: { XP_EXPONENT: 2.0 },
    });
    expect(group.XP_EXPONENT).toBe(2.0);
    expect(group.XP_BASE).toBe(100); // unchanged
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=packages/shared -- --run seasonConstants`
Expected: All tests pass.

- [ ] **Step 5: Build and commit**

Run: `npm run build --workspace=packages/shared`

```bash
git add packages/shared/src/utils/seasonConstants.ts packages/shared/src/utils/seasonConstants.test.ts packages/shared/src/index.ts
git commit -m "feat: add season constants resolver with tests"
```

---

### Task 14: Leaderboard Namespacing

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts`
- Modify: `apps/api/src/routes/leaderboard.ts`

- [ ] **Step 1: Add seasonId parameter to Redis key generation**

In `leaderboardService.ts`, update the `writeToZset` helper and all refresh functions to accept an optional `seasonId` parameter. The Redis key becomes `leaderboard:${seasonId ?? 'permanent'}:${category}`:

```ts
function leaderboardKey(category: string, seasonId?: string | null): string {
  return `leaderboard:${seasonId ?? 'permanent'}:${category}`;
}

function metaKey(category: string, seasonId?: string | null): string {
  return `leaderboard:meta:${seasonId ?? 'permanent'}:${category}`;
}
```

- [ ] **Step 2: Update writeToZset to use scoped keys**

```ts
async function writeToZset(
  category: string,
  entries: Array<{ id: string; score: number; meta: Record<string, unknown> }>,
  seasonId?: string | null,
): Promise<void> {
  const zkey = leaderboardKey(category, seasonId);
  const mkey = metaKey(category, seasonId);
  // ... rest of logic unchanged, using zkey and mkey
}
```

- [ ] **Step 3: Update refresh functions to filter by seasonId**

Each refresh function needs a `seasonId` parameter. Add `WHERE player.seasonId = seasonId` (or `IS NULL`) to all queries.

For example, in `refreshProgression`:
```ts
async function refreshProgression(seasonId?: string | null): Promise<void> {
  const players = await prisma.player.findMany({
    where: {
      isBot: false,
      seasonId: seasonId ?? null,
    },
    select: { id: true, username: true, characterLevel: true, characterXp: true, isBot: true, activeTitle: true },
  });
  // ... write to scoped zset
}
```

Apply the same pattern to all 6 refresh functions (`refreshPvp`, `refreshProgression`, `refreshSkills`, `refreshCombat`, `refreshGuilds`, `refreshCasino`).

- [ ] **Step 4: Update refreshAllLeaderboards to refresh per realm**

```ts
export async function refreshAllLeaderboards(): Promise<void> {
  // Always refresh permanent realm
  await refreshAllForRealm(null);

  // Refresh active seasons
  const activeSeasons = await prisma.season.findMany({ where: { status: 'active' } });
  for (const season of activeSeasons) {
    await refreshAllForRealm(season.id);
  }

  await redis.set('leaderboard:last_refresh', new Date().toISOString());
}

async function refreshAllForRealm(seasonId: string | null): Promise<void> {
  const fns = [refreshPvp, refreshProgression, refreshSkills, refreshCombat, refreshGuilds, refreshCasino];
  for (const fn of fns) {
    try { await fn(seasonId); } catch (e) { console.error(`Leaderboard refresh failed:`, e); }
  }
}
```

- [ ] **Step 5: Update getLeaderboard to accept seasonId**

```ts
export async function getLeaderboard(
  category: string,
  playerId?: string,
  aroundMe?: boolean,
  seasonId?: string | null,
): Promise<LeaderboardResult> {
  const zkey = leaderboardKey(category, seasonId);
  const mkey = metaKey(category, seasonId);
  // ... rest unchanged, using scoped keys
}
```

- [ ] **Step 6: Update leaderboard route to accept seasonId query param**

In `apps/api/src/routes/leaderboard.ts`:

```ts
router.get('/:category', optionalAuthenticate, asyncHandler(async (req, res) => {
  const { category } = req.params;
  const aroundMe = req.query.around_me === 'true';
  const seasonId = (req.query.seasonId as string) || req.player?.seasonId || null;

  const result = await getLeaderboard(category, req.player?.playerId, aroundMe, seasonId);
  res.json(result);
}));
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts apps/api/src/routes/leaderboard.ts
git commit -m "feat: namespace leaderboards by season/permanent realm"
```

---

### Task 15: Season Admin Endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Add season management endpoints**

```ts
// GET /admin/seasons — list all seasons
router.get('/seasons', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const seasons = await prisma.season.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ seasons });
}));

// POST /admin/seasons — create a new season
const createSeasonSchema = z.object({
  name: z.string().min(1).max(64),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  constantOverrides: z.record(z.record(z.number())).optional(),
  features: z.array(z.string()).optional(),
});

router.post('/seasons', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const data = createSeasonSchema.parse(req.body);

  const season = await prisma.season.create({
    data: {
      name: data.name,
      status: 'upcoming',
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      constantOverrides: data.constantOverrides ?? null,
      features: data.features ?? [],
    },
  });

  res.status(201).json({ season });
}));

// POST /admin/seasons/:id/activate — start a season
router.post('/seasons/:id/activate', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Ensure no other season is active
  const activeSeason = await prisma.season.findFirst({ where: { status: 'active' } });
  if (activeSeason) throw new AppError(409, 'Another season is already active');

  const season = await prisma.season.update({
    where: { id },
    data: { status: 'active' },
  });

  // Refresh season cache
  await refreshSeasonCache();

  res.json({ season });
}));

// POST /admin/seasons/:id/end — end a season (triggers freeze)
router.post('/seasons/:id/end', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const season = await prisma.season.findUniqueOrThrow({ where: { id } });
  if (season.status !== 'active') throw new AppError(400, 'Season is not active');

  await prisma.season.update({
    where: { id },
    data: { status: 'ended' },
  });

  // Refresh cache so middleware sees the ended status
  await refreshSeasonCache();

  // Cancel active world events in seasonal zones
  // (updateMany doesn't support relation filters, so query zone IDs first)
  const seasonalZoneIds = await prisma.zone.findMany({
    where: { seasonId: id },
    select: { id: true },
  });
  if (seasonalZoneIds.length > 0) {
    await prisma.worldEvent.updateMany({
      where: { status: 'active', zoneId: { in: seasonalZoneIds.map(z => z.id) } },
      data: { status: 'cancelled' },
    });
  }

  res.json({ message: 'Season ended. Run merge when ready.' });
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "feat: add season admin endpoints (create, activate, end)"
```

---

### Task 16: Season Freeze Guard

**Files:**
- Create: `apps/api/src/middleware/seasonGuard.ts`

- [ ] **Step 1: Create middleware that blocks actions on ended/archived seasons**

```ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/**
 * Blocks turn-spending actions for players in ended/archived seasons.
 * Attach this to routes that modify game state (combat, exploration, crafting, etc.)
 */
export function requireActiveSeason(req: Request, _res: Response, next: NextFunction): void {
  if (req.season && req.season.status !== 'active') {
    throw new AppError(403, 'This season has ended. Your character is frozen pending merge.', 'SEASON_ENDED');
  }
  next();
}
```

- [ ] **Step 2: Apply to state-modifying routes**

Add `requireActiveSeason` after `authenticate` on routes that spend turns or modify player state. This includes: combat, exploration, crafting, gathering, travel, rest, pvp challenge, boss signup, casino, training, quests.

In `apps/api/src/index.ts` or in each route file, add:
```ts
import { requireActiveSeason } from '../middleware/seasonGuard';
// Then on state-modifying routes:
router.post('/start', authenticate, requireActiveSeason, asyncHandler(...));
```

Read-only routes (GET endpoints, leaderboards, bestiary, chat history) do NOT need this guard.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/seasonGuard.ts apps/api/src/routes/
git commit -m "feat: add season freeze guard middleware for ended seasons"
```

---

### Task 17: Initialize Season Cache on Server Start

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Import and call refreshSeasonCache on startup**

Add alongside the existing leaderboard refresh in `apps/api/src/index.ts`:

```ts
import { refreshSeasonCache } from './services/seasonCacheService';

// In the startup section, before/after leaderboard refresh:
refreshSeasonCache().catch(err => console.error('Season cache init failed:', err));
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: initialize season cache on server startup"
```

---

## Chunk 4: Merge Pipeline & Season Lifecycle

### Task 18: Merge Service — Core

**Files:**
- Create: `apps/api/src/services/seasonMergeService.ts`

- [ ] **Step 1: Create the merge service with item and gold transfer**

```ts
import { prisma } from '@pocketrealm/database';

interface MergeLog {
  items: { transferred: number; deleted: number };
  gold: { amount: number };
  skillXp: Record<string, number>;
  characterXp: { amount: number };
  achievements: { merged: number };
  bestiary: { merged: number };
  recipes: { merged: number };
  zoneDiscoveries: { merged: number };
}

export async function mergeSeasonalPlayer(
  seasonalPlayerId: string,
  permanentPlayerId: string,
  seasonId: string,
): Promise<MergeLog> {
  const log: MergeLog = {
    items: { transferred: 0, deleted: 0 },
    gold: { amount: 0 },
    skillXp: {},
    characterXp: { amount: 0 },
    achievements: { merged: 0 },
    bestiary: { merged: 0 },
    recipes: { merged: 0 },
    zoneDiscoveries: { merged: 0 },
  };

  await prisma.$transaction(async (tx) => {
    const seasonal = await tx.player.findUniqueOrThrow({ where: { id: seasonalPlayerId } });

    // Step 1: Transfer non-seasonal-exclusive items to permanent stash
    const transferableItems = await tx.item.findMany({
      where: {
        ownerId: seasonalPlayerId,
        template: { seasonId: null },
      },
    });
    for (const item of transferableItems) {
      await tx.item.update({
        where: { id: item.id },
        data: { ownerId: permanentPlayerId, inStash: true },
      });
    }
    log.items.transferred = transferableItems.length;

    // Delete seasonal-exclusive items
    const deleted = await tx.item.deleteMany({
      where: {
        ownerId: seasonalPlayerId,
        template: { seasonId: { not: null } },
      },
    });
    log.items.deleted = deleted.count;

    // Step 2: Transfer gold
    log.gold.amount = seasonal.gold;
    if (seasonal.gold > 0) {
      await tx.player.update({
        where: { id: permanentPlayerId },
        data: { gold: { increment: seasonal.gold } },
      });
    }

    // Step 3: Skill XP merge — record amounts for post-transaction granting
    // NOTE: XP must be granted through grantSkillXp() to respect efficiency windows
    // and daily caps. We record the amounts here and grant outside the transaction.
    const seasonalSkills = await tx.playerSkill.findMany({ where: { playerId: seasonalPlayerId } });
    for (const skill of seasonalSkills) {
      const xpEarned = Number(skill.xp);
      if (xpEarned > 0) {
        log.skillXp[skill.skillType] = xpEarned;
      }
    }

    // Step 4: Character XP — record for post-transaction granting
    log.characterXp.amount = Number(seasonal.characterXp);

    // Step 5: Achievements — union merge
    const seasonalAchievements = await tx.playerAchievement.findMany({
      where: { playerId: seasonalPlayerId },
    });
    for (const ach of seasonalAchievements) {
      const existing = await tx.playerAchievement.findUnique({
        where: { playerId_achievementId: { playerId: permanentPlayerId, achievementId: ach.achievementId } },
      });
      if (!existing) {
        await tx.playerAchievement.create({
          data: {
            playerId: permanentPlayerId,
            achievementId: ach.achievementId,
            unlockedAt: ach.unlockedAt,
            rewardClaimed: false,
          },
        });
        log.achievements.merged++;
      }
    }

    // Step 6: Bestiary — union merge, sum kills
    const seasonalBestiary = await tx.playerBestiary.findMany({
      where: { playerId: seasonalPlayerId },
    });
    for (const entry of seasonalBestiary) {
      const existing = await tx.playerBestiary.findUnique({
        where: {
          playerId_mobTemplateId: { playerId: permanentPlayerId, mobTemplateId: entry.mobTemplateId },
        },
      });
      if (existing) {
        await tx.playerBestiary.update({
          where: { playerId_mobTemplateId: { playerId: permanentPlayerId, mobTemplateId: entry.mobTemplateId } },
          data: { kills: { increment: entry.kills } },
        });
      } else {
        await tx.playerBestiary.create({
          data: {
            playerId: permanentPlayerId,
            mobTemplateId: entry.mobTemplateId,
            kills: entry.kills,
            firstEncounteredAt: entry.firstEncounteredAt,
          },
        });
      }
      log.bestiary.merged++;
    }

    // Bestiary prefixes — same pattern
    const seasonalPrefixes = await tx.playerBestiaryPrefix.findMany({
      where: { playerId: seasonalPlayerId },
    });
    for (const entry of seasonalPrefixes) {
      const existing = await tx.playerBestiaryPrefix.findUnique({
        where: {
          playerId_mobTemplateId_prefix: {
            playerId: permanentPlayerId,
            mobTemplateId: entry.mobTemplateId,
            prefix: entry.prefix,
          },
        },
      });
      if (existing) {
        await tx.playerBestiaryPrefix.update({
          where: {
            playerId_mobTemplateId_prefix: {
              playerId: permanentPlayerId,
              mobTemplateId: entry.mobTemplateId,
              prefix: entry.prefix,
            },
          },
          data: { kills: { increment: entry.kills } },
        });
      } else {
        await tx.playerBestiaryPrefix.create({
          data: {
            playerId: permanentPlayerId,
            mobTemplateId: entry.mobTemplateId,
            prefix: entry.prefix,
            kills: entry.kills,
            firstSeenAt: entry.firstSeenAt,
          },
        });
      }
    }

    // Step 7: Recipes — only permanent-realm recipes
    const seasonalRecipes = await tx.playerRecipe.findMany({
      where: {
        playerId: seasonalPlayerId,
        recipe: { seasonId: null },
      },
    });
    for (const recipe of seasonalRecipes) {
      const existing = await tx.playerRecipe.findUnique({
        where: { playerId_recipeId: { playerId: permanentPlayerId, recipeId: recipe.recipeId } },
      });
      if (!existing) {
        await tx.playerRecipe.create({
          data: { playerId: permanentPlayerId, recipeId: recipe.recipeId, learnedAt: recipe.learnedAt },
        });
        log.recipes.merged++;
      }
    }

    // Step 8: Zone discoveries — only permanent zones
    const seasonalDiscoveries = await tx.playerZoneDiscovery.findMany({
      where: {
        playerId: seasonalPlayerId,
        zone: { seasonId: null },
      },
    });
    for (const disc of seasonalDiscoveries) {
      const existing = await tx.playerZoneDiscovery.findUnique({
        where: { playerId_zoneId: { playerId: permanentPlayerId, zoneId: disc.zoneId } },
      });
      if (!existing) {
        await tx.playerZoneDiscovery.create({
          data: { playerId: permanentPlayerId, zoneId: disc.zoneId, discoveredAt: disc.discoveredAt },
        });
        log.zoneDiscoveries.merged++;
      }
    }
  });

  // Grant skill XP outside transaction via proper grantSkillXp flow
  // This respects the permanent player's efficiency windows and daily caps
  for (const [skillType, rawXp] of Object.entries(log.skillXp)) {
    if (rawXp > 0) {
      await grantSkillXp(permanentPlayerId, skillType as SkillType, rawXp);
    }
  }

  // Grant character XP similarly
  if (log.characterXp.amount > 0) {
    await prisma.player.update({
      where: { id: permanentPlayerId },
      data: { characterXp: { increment: log.characterXp.amount } },
    });
  }

  return log;
}
```

Import `grantSkillXp` from `../services/xpService` and `SkillType` from `@pocketrealm/shared`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/seasonMergeService.ts
git commit -m "feat: create season merge service with item/gold/xp/achievement/bestiary/recipe/zone transfer"
```

---

### Task 19: Season Archive & Cleanup

**Files:**
- Modify: `apps/api/src/services/seasonMergeService.ts`

- [ ] **Step 1: Add archive creation function**

```ts
export async function createSeasonArchive(
  seasonalPlayerId: string,
  accountId: string,
  seasonId: string,
  mergeLog: MergeLog,
): Promise<void> {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: seasonalPlayerId },
    include: {
      skills: true,
      stats: true,
    },
  });

  const combatTemplates = await prisma.combatTemplate.findMany({
    where: { playerId: seasonalPlayerId },
    include: { slots: { orderBy: { sortOrder: 'asc' } } },
  });

  // Snapshot leaderboard ranks from Redis
  const leaderboardRanks: Record<string, number> = {};
  // (Import getLeaderboard and query each category for this player's rank)

  await prisma.seasonArchive.create({
    data: {
      accountId,
      seasonId,
      username: player.username,
      characterLevel: player.characterLevel,
      characterXp: player.characterXp,
      attributes: player.attributes as object,
      skills: player.skills.map(s => ({
        skillType: s.skillType,
        level: s.level,
        xp: Number(s.xp),
      })),
      stats: player.stats ? {
        totalCrafts: player.stats.totalCrafts,
        totalKills: (player.stats as Record<string, unknown>).totalKills ?? 0,
        totalTurnsSpent: player.stats.totalTurnsSpent,
        peakGoldHeld: player.stats.peakGoldHeld,
      } : {},
      combatTemplates: combatTemplates.map(t => ({
        name: t.name,
        slots: t.slots.map(s => ({
          actionId: s.actionId,
          conditionType: s.conditionType,
          resource: s.resource,
          threshold: s.threshold,
          effectName: s.effectName,
          thenActionId: s.thenActionId,
        })),
      })),
      leaderboardRanks,
      mergeLog,
    },
  });
}
```

- [ ] **Step 2: Add full season merge orchestration function**

```ts
export async function runSeasonMerge(seasonId: string): Promise<{ merged: number; errors: string[] }> {
  const season = await prisma.season.findUniqueOrThrow({ where: { id: seasonId } });
  if (season.status !== 'ended') {
    throw new Error('Season must be in "ended" state to merge');
  }

  const seasonalPlayers = await prisma.player.findMany({
    where: { seasonId, isBot: false },
    select: { id: true, accountId: true },
  });

  let merged = 0;
  const errors: string[] = [];

  for (const sp of seasonalPlayers) {
    try {
      // Find permanent player for this account
      const permanent = await prisma.player.findFirst({
        where: { accountId: sp.accountId, seasonId: null, isBot: false },
      });
      if (!permanent) {
        errors.push(`No permanent player for account ${sp.accountId}`);
        continue;
      }

      // 1. Create archive snapshot BEFORE merge (preserves original state)
      await createSeasonArchive(sp.id, sp.accountId, seasonId, {
        items: { transferred: 0, deleted: 0 }, gold: { amount: 0 },
        skillXp: {}, characterXp: { amount: 0 }, achievements: { merged: 0 },
        bestiary: { merged: 0 }, recipes: { merged: 0 }, zoneDiscoveries: { merged: 0 },
      });

      // 2. Run merge transfers
      const mergeLog = await mergeSeasonalPlayer(sp.id, permanent.id, seasonId);

      // 3. Update archive with actual merge log
      await prisma.seasonArchive.updateMany({
        where: { accountId: sp.accountId, seasonId },
        data: { mergeLog: mergeLog as object },
      });

      // 2. Switch active player to permanent if it was the seasonal one
      await prisma.account.updateMany({
        where: { id: sp.accountId, activePlayerId: sp.id },
        data: { activePlayerId: permanent.id },
      });

      // 3. Delete seasonal player (cascade deletes all related data)
      await prisma.player.delete({ where: { id: sp.id } });

      merged++;
    } catch (e) {
      errors.push(`Failed to merge player ${sp.id}: ${(e as Error).message}`);
    }
  }

  // Delete seasonal bots
  const seasonalBots = await prisma.player.findMany({
    where: { seasonId, isBot: true },
    select: { id: true },
  });
  for (const bot of seasonalBots) {
    await prisma.player.delete({ where: { id: bot.id } });
  }

  // Clean up seasonal guilds
  await prisma.guild.deleteMany({ where: { seasonId } });

  // Mark season as archived
  await prisma.season.update({
    where: { id: seasonId },
    data: { status: 'archived' },
  });

  await refreshSeasonCache();

  return { merged, errors };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/seasonMergeService.ts
git commit -m "feat: add season archive creation and merge orchestration"
```

---

### Task 20: Hall of Fame & Reward Evaluation

**Files:**
- Create: `apps/api/src/services/seasonRewardService.ts`

- [ ] **Step 1: Create reward evaluation service**

```ts
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';

export async function evaluateSeasonRewards(seasonId: string): Promise<{ entries: number }> {
  const rewardTiers = await prisma.seasonRewardTier.findMany({
    where: { seasonId },
  });

  let totalEntries = 0;

  for (const tier of rewardTiers) {
    // Get top players from Redis leaderboard for this season+category
    const zkey = `leaderboard:${seasonId}:${tier.category}`;
    const mkey = `leaderboard:meta:${seasonId}:${tier.category}`;

    // Get players in the rank range
    const members = await redis.zrevrange(zkey, tier.minRank - 1, tier.maxRank - 1, 'WITHSCORES');

    for (let i = 0; i < members.length; i += 2) {
      const playerId = members[i];
      const score = parseFloat(members[i + 1]);
      const rank = tier.minRank + (i / 2);

      // Get metadata (username)
      const metaStr = await redis.hget(mkey, playerId);
      const meta = metaStr ? JSON.parse(metaStr) : {};

      // Find the account for this seasonal player
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { accountId: true, username: true },
      });
      if (!player) continue;

      // Create hall of fame entry
      await prisma.hallOfFameEntry.upsert({
        where: {
          seasonId_category_rank: { seasonId, category: tier.category, rank },
        },
        update: { accountId: player.accountId, username: player.username, value: score },
        create: {
          seasonId,
          category: tier.category,
          rank,
          accountId: player.accountId,
          username: player.username,
          value: score,
        },
      });
      totalEntries++;

      // Apply rewards to permanent player
      const rewards = tier.rewards as Record<string, unknown>;
      const permanentPlayer = await prisma.player.findFirst({
        where: { accountId: player.accountId, seasonId: null, isBot: false },
      });
      if (permanentPlayer && rewards.title) {
        // Unlock title achievement (specific implementation depends on achievement system)
        // For now, just record in archive
      }
    }
  }

  return { entries: totalEntries };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/seasonRewardService.ts
git commit -m "feat: add season reward evaluation and hall of fame population"
```

---

### Task 21: Admin Merge & Reward Endpoints

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Add merge and reward admin endpoints**

```ts
import { runSeasonMerge } from '../services/seasonMergeService';
import { evaluateSeasonRewards } from '../services/seasonRewardService';

// POST /admin/seasons/:id/evaluate-rewards — compute hall of fame entries
router.post('/seasons/:id/evaluate-rewards', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const season = await prisma.season.findUniqueOrThrow({ where: { id } });
  if (season.status !== 'ended') throw new AppError(400, 'Season must be ended before evaluating rewards');

  const result = await evaluateSeasonRewards(id);
  res.json({ message: 'Rewards evaluated', hallOfFameEntries: result.entries });
}));

// POST /admin/seasons/:id/merge — run the merge pipeline
router.post('/seasons/:id/merge', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await runSeasonMerge(id);
  res.json({ message: 'Merge complete', merged: result.merged, errors: result.errors });
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "feat: add admin endpoints for season reward evaluation and merge"
```

---

## Chunk 5: Frontend Changes

### Task 22: API Client Updates

**Files:**
- Modify: `apps/web/src/lib/api/auth.ts` (or wherever auth API calls live)

- [ ] **Step 1: Add new auth API functions**

```ts
export async function getCharacters(): Promise<{ characters: CharacterSummary[]; activePlayerId: string }> {
  return fetchApi('/auth/characters');
}

export async function switchPlayer(playerId: string): Promise<{ player: { id: string; username: string }; accessToken: string; refreshToken: string }> {
  return fetchApi('/auth/switch-player', { method: 'POST', body: { playerId } });
}

export async function joinSeason(username: string): Promise<{ player: { id: string; username: string }; seasonId: string; accessToken: string; refreshToken: string }> {
  return fetchApi('/auth/join-season', { method: 'POST', body: { username } });
}

export async function getActiveSeason(): Promise<{ season: Season | null }> {
  return fetchApi('/seasons/active');
}
```

- [ ] **Step 2: Add hall of fame and archive API functions**

```ts
export async function getHallOfFame(seasonId: string): Promise<{ entries: HallOfFameEntry[] }> {
  return fetchApi(`/seasons/${seasonId}/hall-of-fame`);
}

export async function getSeasonArchives(): Promise<{ archives: SeasonArchive[] }> {
  return fetchApi('/auth/season-archives');
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api/
git commit -m "feat: add frontend API client functions for seasons"
```

---

### Task 23: Auth Context — Token Handling for Character Switching

**Files:**
- Modify: `apps/web/src/hooks/useAuth.ts` (or wherever auth state is managed)

- [ ] **Step 1: Update token storage to handle character switches**

When `switchPlayer` or `joinSeason` returns new tokens, update stored tokens:

```ts
async function handleSwitchPlayer(playerId: string) {
  const result = await switchPlayer(playerId);
  setAccessToken(result.accessToken);
  setRefreshToken(result.refreshToken);
  // Reload game state for the new character
  window.location.reload(); // Simple approach — full reload clears all cached state
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat: handle character switching in auth context"
```

---

### Task 24: Character Picker Component

**Files:**
- Create: `apps/web/src/components/common/CharacterPicker.tsx`

- [ ] **Step 1: Create character picker dropdown**

A compact dropdown in the game header that shows when the account has multiple characters:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getCharacters, switchPlayer } from '@/lib/api/auth';
import type { CharacterSummary } from '@pocketrealm/shared';

export function CharacterPicker() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCharacters().then(data => {
      setCharacters(data.characters);
      setActivePlayerId(data.activePlayerId);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading || characters.length <= 1) return null;

  const activeChar = characters.find(c => c.id === activePlayerId);
  const otherChars = characters.filter(c => c.id !== activePlayerId);

  async function handleSwitch(playerId: string) {
    const result = await switchPlayer(playerId);
    // Store new tokens and reload
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    window.location.reload();
  }

  return (
    <div className="character-picker">
      <div className="active-character">
        <span>{activeChar?.username}</span>
        <span className="realm-badge">
          {activeChar?.seasonName ?? 'Permanent'}
        </span>
      </div>
      <div className="character-list">
        {otherChars.map(c => (
          <button key={c.id} onClick={() => handleSwitch(c.id)}>
            {c.username} — {c.seasonName ?? 'Permanent'} (Lv. {c.characterLevel})
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into game header**

Add `<CharacterPicker />` to the game header component (wherever the player name/level is displayed).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/CharacterPicker.tsx
git commit -m "feat: add character picker component for realm switching"
```

---

### Task 25: Realm Indicator

**Files:**
- Modify: Game header component (e.g., `apps/web/src/components/common/Header.tsx` or equivalent)

- [ ] **Step 1: Show realm indicator in header**

Read the current player's `seasonId` from auth context. If non-null, display the season name. If null, display "Permanent Realm" (or nothing — permanent is the default).

```tsx
{seasonName && (
  <span className="realm-indicator" style={{ color: 'var(--rpg-gold)' }}>
    {seasonName}
    {seasonEndsAt && (
      <span className="season-timer"> — {daysRemaining(seasonEndsAt)}d left</span>
    )}
  </span>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat: add realm indicator to game header"
```

---

### Task 26: Join Season Banner

**Files:**
- Create: `apps/web/src/components/common/JoinSeasonBanner.tsx`

- [ ] **Step 1: Create join season banner**

Shown when a season is active and the player has no seasonal character:

```tsx
'use client';

import { useState } from 'react';
import { joinSeason } from '@/lib/api/auth';

interface Props {
  seasonName: string;
  seasonEndsAt: Date;
  onJoined: () => void;
}

export function JoinSeasonBanner({ seasonName, seasonEndsAt, onJoined }: Props) {
  const [username, setUsername] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    try {
      const result = await joinSeason(username);
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      onJoined();
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="season-banner">
      <p>{seasonName} is live! Create a character to compete.</p>
      {!expanded ? (
        <button onClick={() => setExpanded(true)}>Join Season</button>
      ) : (
        <div>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Choose a seasonal name"
            maxLength={32}
          />
          <button onClick={handleJoin} disabled={username.length < 3}>Create Character</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into game screen — show when active season exists and player has no seasonal character**

In the main game page or screen container, check for active season and conditionally render the banner.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/JoinSeasonBanner.tsx
git commit -m "feat: add join season banner component"
```

---

### Task 27: Hall of Fame & Season Archive Screens

**Files:**
- Create: `apps/web/src/components/screens/HallOfFameScreen.tsx`
- Create: `apps/web/src/components/screens/SeasonArchiveScreen.tsx`

- [ ] **Step 1: Create Hall of Fame screen**

A read-only screen showing season winners by category. Can be a tab on the existing leaderboard screen or standalone.

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getHallOfFame } from '@/lib/api/auth';
import type { HallOfFameEntry } from '@pocketrealm/shared';

interface Props {
  seasonId: string;
  seasonName: string;
}

export function HallOfFameScreen({ seasonId, seasonName }: Props) {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);

  useEffect(() => {
    getHallOfFame(seasonId).then(data => setEntries(data.entries));
  }, [seasonId]);

  const grouped = entries.reduce<Record<string, HallOfFameEntry[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="hall-of-fame">
      <h2>{seasonName} — Hall of Fame</h2>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3>{category.replace(/_/g, ' ')}</h3>
          <ol>
            {items.sort((a, b) => a.rank - b.rank).map(e => (
              <li key={e.id}>#{e.rank} {e.username} — {e.value}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create Season Archive screen**

Shows the player's past seasonal characters:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getSeasonArchives } from '@/lib/api/auth';
import type { SeasonArchive } from '@pocketrealm/shared';

export function SeasonArchiveScreen() {
  const [archives, setArchives] = useState<SeasonArchive[]>([]);

  useEffect(() => {
    getSeasonArchives().then(data => setArchives(data.archives));
  }, []);

  if (archives.length === 0) return <p>No past seasons.</p>;

  return (
    <div className="season-archive">
      <h2>Past Seasons</h2>
      {archives.map(a => (
        <div key={a.id} className="archive-card">
          <h3>{a.username}</h3>
          <p>Level {a.characterLevel}</p>
          <div className="skills">
            {Object.entries(a.skills).map(([skill, data]) => (
              <span key={skill}>{skill}: Lv.{(data as { level: number }).level}</span>
            ))}
          </div>
          {Object.keys(a.leaderboardRanks).length > 0 && (
            <div className="rankings">
              <h4>Rankings</h4>
              {Object.entries(a.leaderboardRanks).map(([cat, rank]) => (
                <span key={cat}>#{rank} {cat.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add API routes for hall of fame and archive data**

Add to API (likely in a new `seasons.ts` route file or in `auth.ts`):

```ts
// GET /auth/season-archives
router.get('/season-archives', authenticate, asyncHandler(async (req, res) => {
  const archives = await prisma.seasonArchive.findMany({
    where: { accountId: req.player!.accountId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ archives });
}));

// GET /seasons/active — public endpoint for active season info
router.get('/seasons/active', asyncHandler(async (req, res) => {
  const season = await prisma.season.findFirst({
    where: { status: 'active' },
    select: { id: true, name: true, status: true, startsAt: true, endsAt: true },
  });
  res.json({ season: season ?? null });
}));

// GET /seasons/:id/hall-of-fame
router.get('/seasons/:id/hall-of-fame', asyncHandler(async (req, res) => {
  const entries = await prisma.hallOfFameEntry.findMany({
    where: { seasonId: req.params.id },
    orderBy: [{ category: 'asc' }, { rank: 'asc' }],
  });
  res.json({ entries });
}));
```

- [ ] **Step 4: Register season routes in index.ts**

Add to `apps/api/src/index.ts`:
```ts
import { seasonsRouter } from './routes/seasons';
app.use('/api/v1/seasons', seasonsRouter);
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/screens/ apps/api/src/routes/ apps/api/src/index.ts
git commit -m "feat: add hall of fame and season archive screens with API routes"
```

---

### Task 28: Leaderboard Season Filter

**Files:**
- Modify: `apps/web/src/components/leaderboard/` (existing leaderboard components)

- [ ] **Step 1: Add season toggle to leaderboard screen**

Add a dropdown/toggle to the existing leaderboard UI that lets players switch between "Permanent" and any active/archived season's leaderboard:

```tsx
<select value={selectedSeasonId ?? 'permanent'} onChange={e => {
  const val = e.target.value;
  setSelectedSeasonId(val === 'permanent' ? null : val);
}}>
  <option value="permanent">Permanent Realm</option>
  {seasons.map(s => (
    <option key={s.id} value={s.id}>{s.name}</option>
  ))}
</select>
```

- [ ] **Step 2: Pass seasonId to leaderboard API calls**

Update the leaderboard fetch to include `?seasonId=...` when a season is selected.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/leaderboard/
git commit -m "feat: add season filter to leaderboard screen"
```

---

### Task 28b: Chat Channel Scoping

**Files:**
- Modify: `apps/api/src/socket/` (chat socket handlers)

- [ ] **Step 1: Scope chat channels by realm**

Update Socket.IO chat handlers to prefix channel names with the player's realm:
- Permanent players join `world:permanent`
- Seasonal players join `world:season-{seasonId}`

The player's `seasonId` is available from the auth payload in the socket connection. Update the `joinChannel` and `sendMessage` handlers to use the scoped channel name.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/socket/
git commit -m "feat: scope chat channels by realm (permanent vs seasonal)"
```

---

## Chunk 6: Testing & Verification

### Task 29: Auth Flow Tests

**Files:**
- Modify: `apps/api/src/routes/auth.test.ts` (or create if needed)

- [ ] **Step 1: Write tests for Account-based registration**

```ts
describe('POST /auth/register', () => {
  it('creates Account + Player, returns JWT with accountId', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    // Decode JWT and verify accountId is present
    const decoded = jwt.decode(res.body.accessToken) as AuthPayload;
    expect(decoded.accountId).toBeDefined();
    expect(decoded.playerId).toBeDefined();
    expect(decoded.seasonId).toBeNull();
  });
});
```

- [ ] **Step 2: Write tests for character switching**

```ts
describe('POST /auth/switch-player', () => {
  it('returns new JWT with switched player', async () => { /* ... */ });
  it('rejects switching to another account player', async () => { /* ... */ });
});
```

- [ ] **Step 3: Write tests for join-season**

```ts
describe('POST /auth/join-season', () => {
  it('creates seasonal player and returns new JWT', async () => { /* ... */ });
  it('rejects when no active season', async () => { /* ... */ });
  it('rejects duplicate seasonal character', async () => { /* ... */ });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:api -- --run auth`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.test.ts
git commit -m "test: auth flow tests for Account model and season endpoints"
```

---

### Task 30: Constants Resolver Tests (already done in Task 13)

Verify the constants resolver tests from Task 13 still pass:

- [ ] **Step 1: Run shared package tests**

Run: `npm run test --workspace=packages/shared -- --run`
Expected: All tests pass including seasonConstants tests.

---

### Task 31: Full Build & Typecheck Verification

- [ ] **Step 1: Build all packages**

Run: `npm run build`
Expected: All packages build without errors.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors (excluding pre-existing ones documented in MEMORY.md).

- [ ] **Step 3: Run all tests**

Run: `npm run test -- --run`
Expected: All existing tests pass. New tests pass.

- [ ] **Step 4: Start dev server and verify basic flow**

Run: `npm run dev`
- Register a new account → should create Account + Player
- Login → should return JWT with accountId
- All existing game features work identically (no behavioral change)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: seasonal architecture foundation — Account model, auth refactor, season infrastructure"
```
