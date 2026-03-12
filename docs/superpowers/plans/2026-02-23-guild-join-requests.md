# Guild Join Requests & Level Restriction Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the non-functional "invite only" rejection with a proper join request workflow, and remove the level 10 minimum required to join any guild.

**Architecture:** Add a `GuildJoinRequest` DB model. Invite-only guilds show a "Request" button in search results; guild officers/leaders see pending requests in the Settings tab with accept/reject. The `closed` mode remains invite-only-in-name only (no requests). Open guilds are unchanged.

**Tech Stack:** Prisma (schema + migration), Express service + routes (TypeScript), Zod validation, Next.js 16 frontend (TypeScript).

---

## How the existing code works (read this first)

- **`requireRole(playerId, minRole)`** (`guildService.ts:334`) — looks up the player's `GuildMember` row, throws if not in a guild or insufficient role, returns the `membership` object (which has `membership.guildId`). Service functions use `membership.guildId`, NOT a route-param `guildId`.
- **`addGuildLog(guildId, eventType, message, metadata?, tx?)`** — writes a `GuildLog` row. Pass `tx` when inside a `prisma.$transaction`.
- **`GUILD_CONSTANTS`** lives in `packages/shared/src/constants/gameConstants.ts`. All tunable values go here.
- **Frontend API** lives in `apps/web/src/lib/api/guild.ts`. Types are inline interfaces; functions call `fetchApi<T>(url, options)`.
- **GuildScreen** (`apps/web/src/components/screens/GuildScreen.tsx`) — the single monolithic screen file. `NoGuildView` handles non-members (search + join). `GuildSettings` is shown only to officers/leaders.

---

## Task 1: Make the level 10 join requirement visible in the UI

The level 10 minimum is intentional (anti-smurf). The server already enforces it correctly. The problem is the UI silently disables the Join/Request button with no explanation.

**Files:**
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

**Step 1: Surface the reason for the disabled button**

The `NoGuildView` receives `characterLevel` as a prop. We need to:
1. Keep the button disabled when `characterLevel < GUILD_CONSTANTS.JOIN_MIN_LEVEL`
2. Show an explanation below the guild listing when the player is under level 10

In the search results section of `NoGuildView` (around lines 311-350), the guild list is inside `searchResults.map(...)`. Add a banner **above** the guild list, rendered once when the player is below the minimum level:

Find the opening of the results block:
```tsx
<div className="space-y-2">
  {searchResults.map((guild) => (
```

Change to:
```tsx
<div className="space-y-2">
  {characterLevel < GUILD_CONSTANTS.JOIN_MIN_LEVEL && (
    <p className="text-xs text-[var(--rpg-gold)] px-1">
      You must reach level {GUILD_CONSTANTS.JOIN_MIN_LEVEL} to join or request to join a guild.
    </p>
  )}
  {searchResults.map((guild) => (
```

The join button at line 332 already disables correctly via `characterLevel < (guild.minLevelRequirement || GUILD_CONSTANTS.JOIN_MIN_LEVEL)` — leave that condition as-is for now (the Request button added in Task 6 should follow the same pattern).

**Step 2: Typecheck**

```bash
cd D:/Code/Adventure/.worktrees/adventure-guild-system
npm run typecheck
```

Expected: no new errors. (There is a pre-existing error in `apps/web/src/app/game/page.tsx:333` — ignore it.)

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/GuildScreen.tsx
git commit -m "fix: show level requirement reason when join/request buttons are disabled"
```

---

## Task 2: Add GuildJoinRequest database model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add the model**

After the closing `}` of the `GuildLog` model (around line 855), add:

```prisma
model GuildJoinRequest {
  id        String   @id @default(uuid())
  guildId   String   @map("guild_id")
  playerId  String   @map("player_id")
  status    String   @default("pending") @db.VarChar(16)
  createdAt DateTime @default(now()) @map("created_at")

  guild  Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([guildId, playerId])
  @@index([guildId, status])
  @@map("guild_join_requests")
}
```

**Step 2: Add back-relations**

In the `Guild` model, add inside the relations block (after `logs GuildLog[]`):

```prisma
  joinRequests GuildJoinRequest[]
```

In the `Player` model, add inside the relations block (after `guildMember GuildMember?`):

```prisma
  guildJoinRequests GuildJoinRequest[]
```

**Step 3: Run migration**

```bash
cd D:/Code/Adventure/.worktrees/adventure-guild-system
npm run db:migrate -- --name add_guild_join_requests
```

Expected: `✔ Generated Prisma Client` + migration applied.

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma \
        packages/database/prisma/migrations/
git commit -m "feat: add GuildJoinRequest model and migration"
```

---

## Task 3: Add join request service functions

**Files:**
- Modify: `apps/api/src/services/guildService.ts`

Add the following **after** the `leaveGuild` function (around line 328), before the "Member Management" section comment.

**Step 1: Add JoinRequestData type export** (add near the top of the file with other type definitions, or just before the new functions):

```typescript
export interface JoinRequestData {
  id: string;
  playerId: string;
  username: string;
  characterLevel: number;
  createdAt: string;
}
```

**Step 2: Add `requestJoinGuild`**

```typescript
export async function requestJoinGuild(playerId: string, guildId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, username: true, characterLevel: true },
  });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  const existingMembership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (existingMembership) throw new AppError(400, 'Already in a guild', 'ALREADY_IN_GUILD');

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { _count: { select: { members: true } } },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (guild.recruitmentMode !== 'invite_only') {
    throw new AppError(400, 'Guild does not accept join requests', 'NOT_INVITE_ONLY');
  }

  const maxMembers = calculateMaxMembers(guild.level);
  if (guild._count.members >= maxMembers) throw new AppError(400, 'Guild is full', 'GUILD_FULL');

  if (guild.minLevelRequirement > 0 && player.characterLevel < guild.minLevelRequirement) {
    throw new AppError(400, `Character level ${guild.minLevelRequirement} required`, 'LEVEL_TOO_LOW');
  }

  const existing = await prisma.guildJoinRequest.findUnique({
    where: { guildId_playerId: { guildId, playerId } },
  });
  if (existing) throw new AppError(400, 'Join request already pending', 'REQUEST_ALREADY_SENT');

  await prisma.guildJoinRequest.create({ data: { guildId, playerId, status: 'pending' } });
  await addGuildLog(guildId, 'join_request_sent', `${player.username} requested to join`);
}
```

**Step 3: Add `getJoinRequests`**

```typescript
export async function getJoinRequests(officerId: string): Promise<JoinRequestData[]> {
  const membership = await requireRole(officerId, 'officer');

  const requests = await prisma.guildJoinRequest.findMany({
    where: { guildId: membership.guildId, status: 'pending' },
    include: { player: { select: { username: true, characterLevel: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return requests.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    username: r.player.username,
    characterLevel: r.player.characterLevel,
    createdAt: r.createdAt.toISOString(),
  }));
}
```

**Step 4: Add `respondToJoinRequest`**

```typescript
export async function respondToJoinRequest(
  officerId: string,
  requestId: string,
  accept: boolean,
): Promise<void> {
  const membership = await requireRole(officerId, 'officer');

  const request = await prisma.guildJoinRequest.findFirst({
    where: { id: requestId, guildId: membership.guildId, status: 'pending' },
    include: { player: { select: { username: true } } },
  });
  if (!request) throw new AppError(404, 'Request not found or already processed', 'NOT_FOUND');

  if (accept) {
    const guild = await prisma.guild.findUnique({
      where: { id: membership.guildId },
      include: { _count: { select: { members: true } } },
    });
    if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

    const maxMembers = calculateMaxMembers(guild.level);
    if (guild._count.members >= maxMembers) throw new AppError(400, 'Guild is full', 'GUILD_FULL');

    // Player may have joined elsewhere between request and acceptance
    const alreadyMember = await prisma.guildMember.findUnique({ where: { playerId: request.playerId } });
    if (alreadyMember) {
      await prisma.guildJoinRequest.update({ where: { id: requestId }, data: { status: 'rejected' } });
      throw new AppError(400, 'Player is already in a guild', 'ALREADY_IN_GUILD');
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.guildMember.create({ data: { guildId: membership.guildId, playerId: request.playerId, role: 'member' } });
      await tx.guildJoinRequest.update({ where: { id: requestId }, data: { status: 'accepted' } });
      await addGuildLog(membership.guildId, 'join_request_accepted', `${request.player.username} was accepted into the guild`, undefined, tx);
    });

    await addGuildXp(membership.guildId, GUILD_CONSTANTS.XP_PER_MEMBER_JOIN);
    void checkGuildAchievementsForAllMembers(membership.guildId, ['guildMemberCount']);
  } else {
    await prisma.$transaction(async (tx: any) => {
      await tx.guildJoinRequest.update({ where: { id: requestId }, data: { status: 'rejected' } });
      await addGuildLog(membership.guildId, 'join_request_rejected', `${request.player.username}'s join request was declined`, undefined, tx);
    });
  }
}
```

**Step 5: Typecheck**

```bash
cd D:/Code/Adventure/.worktrees/adventure-guild-system
npm run typecheck
```

Expected: no new errors.

**Step 6: Commit**

```bash
git add apps/api/src/services/guildService.ts
git commit -m "feat: add join request service functions"
```

---

## Task 4: Add join request API routes

**Files:**
- Modify: `apps/api/src/routes/guild.ts`

**Step 1: Update import from guildService**

Find the import block at the top of `guild.ts` and add the three new functions:

```typescript
import {
  createGuild, getPlayerGuild, getGuild, searchGuilds,
  joinGuild, leaveGuild, kickMember, promoteMember,
  demoteMember, transferLeadership, disbandGuild,
  updateSettings, getGuildLog,
  requestJoinGuild, getJoinRequests, respondToJoinRequest,
} from '../services/guildService';
```

**Step 2: Add the four new routes** after the `POST /:id/join` route (around line 98):

```typescript
// POST /:id/request — submit a join request (invite_only guilds)
guildRouter.post('/:id/request', asyncHandler(async (req, res) => {
  await requestJoinGuild(req.player!.playerId, req.params.id);
  res.json({ success: true });
}));

// GET /:id/requests — list pending join requests (officers/leaders only)
guildRouter.get('/:id/requests', asyncHandler(async (req, res) => {
  const requests = await getJoinRequests(req.player!.playerId);
  res.json({ requests });
}));

// POST /:id/requests/:requestId/accept
guildRouter.post('/:id/requests/:requestId/accept', asyncHandler(async (req, res) => {
  await respondToJoinRequest(req.player!.playerId, req.params.requestId, true);
  res.json({ success: true });
}));

// POST /:id/requests/:requestId/reject
guildRouter.post('/:id/requests/:requestId/reject', asyncHandler(async (req, res) => {
  await respondToJoinRequest(req.player!.playerId, req.params.requestId, false);
  res.json({ success: true });
}));
```

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/guild.ts
git commit -m "feat: add join request API routes"
```

---

## Task 5: Add frontend API types and functions

**Files:**
- Modify: `apps/web/src/lib/api/guild.ts`

**Step 1: Add the response types** (after `GuildContractsResponse`):

```typescript
export interface GuildJoinRequestResponse {
  id: string;
  playerId: string;
  username: string;
  characterLevel: number;
  createdAt: string;
}

export interface GuildJoinRequestsResponse {
  requests: GuildJoinRequestResponse[];
}
```

**Step 2: Add the API functions** (at the end of the file):

```typescript
export async function requestJoinGuild(guildId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/request`, { method: 'POST' });
}

export async function getGuildJoinRequests(guildId: string) {
  return fetchApi<GuildJoinRequestsResponse>(`/api/v1/guild/${guildId}/requests`);
}

export async function acceptJoinRequest(guildId: string, requestId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/requests/${requestId}/accept`, { method: 'POST' });
}

export async function rejectJoinRequest(guildId: string, requestId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/requests/${requestId}/reject`, { method: 'POST' });
}
```

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/api/guild.ts
git commit -m "feat: add join request frontend API functions and types"
```

---

## Task 6: Update GuildScreen frontend

**Files:**
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

This task has two independent parts: (A) the NoGuildView search results, and (B) the officer/leader requests panel.

---

### Part A: NoGuildView — "Request" button for invite_only guilds

**Step 1: Update the import from `@/lib/api`**

Add `requestJoinGuild`, `getGuildJoinRequests`, `acceptJoinRequest`, `rejectJoinRequest`, and `GuildJoinRequestResponse` to the imports at the top of the file:

```typescript
import {
  getPlayerGuild, createGuild, searchGuilds, joinGuild, leaveGuild,
  kickGuildMember, promoteGuildMember, demoteGuildMember,
  transferGuildLeadership, disbandGuild, updateGuildSettings, getGuildLog,
  getGuildUpgrades, activateGuildUpgrade, getGuildContracts,
  requestJoinGuild, getGuildJoinRequests, acceptJoinRequest, rejectJoinRequest,
  type PlayerGuildResponse, type GuildResponse, type GuildMemberResponse,
  type GuildLogResponse, type GuildUpgradesResponse, type GuildContractsResponse,
  type GuildJoinRequestResponse,
} from '@/lib/api';
```

**Step 2: Add `requestedGuildIds` state to `NoGuildView`**

Inside the `NoGuildView` function, add state alongside the existing state declarations:

```typescript
const [requestedGuildIds, setRequestedGuildIds] = useState<Set<string>>(new Set());
```

**Step 3: Add `handleRequest` handler to `NoGuildView`**

Add alongside `handleJoin`:

```typescript
const handleRequest = async (guildId: string) => {
  setActionLoading(true);
  setActionError(null);
  try {
    const res = await requestJoinGuild(guildId);
    if (res.error) { setActionError(res.error.message); return; }
    setRequestedGuildIds((prev) => new Set([...prev, guildId]));
  } catch (err: unknown) {
    setActionError(err instanceof Error ? err.message : 'Failed to send request');
  } finally {
    setActionLoading(false);
  }
};
```

**Step 4: Replace the search result button block**

Find the current button block in the search results map (around lines 329-339):

```tsx
{guild.recruitmentMode === 'open' && (
  <PixelButton
    onClick={() => handleJoin(guild.id)}
    disabled={actionLoading || characterLevel < (guild.minLevelRequirement || GUILD_CONSTANTS.JOIN_MIN_LEVEL)}
  >
    Join
  </PixelButton>
)}
{guild.recruitmentMode !== 'open' && (
  <span className="text-xs text-[var(--rpg-text-secondary)] capitalize">
    {guild.recruitmentMode.replace('_', ' ')}
  </span>
)}
```

Replace with:

```tsx
{guild.recruitmentMode === 'open' && (
  <PixelButton
    onClick={() => handleJoin(guild.id)}
    disabled={actionLoading || characterLevel < (guild.minLevelRequirement || GUILD_CONSTANTS.JOIN_MIN_LEVEL)}
  >
    Join
  </PixelButton>
)}
{guild.recruitmentMode === 'invite_only' && (
  requestedGuildIds.has(guild.id) ? (
    <span className="text-xs text-[var(--rpg-green-light)]">Request Sent</span>
  ) : (
    <PixelButton
      onClick={() => handleRequest(guild.id)}
      disabled={actionLoading || characterLevel < (guild.minLevelRequirement || GUILD_CONSTANTS.JOIN_MIN_LEVEL)}
    >
      Request
    </PixelButton>
  )
)}
{guild.recruitmentMode === 'closed' && (
  <span className="text-xs text-[var(--rpg-text-secondary)]">Closed</span>
)}
```

---

### Part B: GuildSettings — Pending join requests panel

**Step 1: Add `JoinRequestsSection` component**

Insert this new component just **before** the `GuildSettings` function definition (around line 806):

```tsx
function JoinRequestsSection({
  guildId,
  onRefresh,
  setError,
}: {
  guildId: string;
  onRefresh: () => void;
  setError: (err: string | null) => void;
}) {
  const [requests, setRequests] = useState<GuildJoinRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildJoinRequests(guildId);
      if (res.data) setRequests(res.data.requests);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const handleRespond = async (requestId: string, accept: boolean) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = accept
        ? await acceptJoinRequest(guildId, requestId)
        : await rejectJoinRequest(guildId, requestId);
      if (res.error) { setError(res.error.message); return; }
      await loadRequests();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <p className="text-sm opacity-60">Loading requests...</p>;

  if (requests.length === 0) {
    return <p className="text-sm text-[var(--rpg-text-secondary)]">No pending join requests.</p>;
  }

  return (
    <div className="space-y-2">
      {requests.map((req) => (
        <div
          key={req.id}
          className="p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)] flex justify-between items-center"
        >
          <div>
            <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{req.username}</p>
            <p className="text-xs text-[var(--rpg-text-secondary)]">Level {req.characterLevel}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(req.id, true)}
              disabled={actionLoading}
              className="text-xs px-2 py-1 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespond(req.id, false)}
              disabled={actionLoading}
              className="text-xs px-2 py-1 rounded bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Render `JoinRequestsSection` in `GuildSettings`**

Inside the `GuildSettings` return, add a new `PixelCard` **before** the settings card. Insert it at the top of the `<div className="space-y-3">`:

```tsx
{guild.recruitmentMode === 'invite_only' && (
  <PixelCard>
    <h3 className="text-lg font-bold text-[var(--rpg-text-primary)] mb-3">Join Requests</h3>
    <JoinRequestsSection guildId={guild.id} onRefresh={onRefresh} setError={setError} />
  </PixelCard>
)}
```

**Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/GuildScreen.tsx
git commit -m "feat: join request UI in search results and settings tab"
```

---

## Manual Testing Checklist

1. **Level requirement shown clearly** — With a character below level 10, go to Guild tab and search for guilds. Verify a gold message appears: "You must reach level 10 to join or request to join a guild." Verify all Join/Request buttons are disabled.

2. **Request to Join** — With a non-member, find an invite_only guild in search results. Verify a "Request" button appears instead of "Invite Only" text. Click it, verify button changes to "Request Sent".

3. **Closed guild unchanged** — An invite_only guild with mode set to `closed` should show "Closed" label only, no button.

4. **Officer sees requests** — As guild leader/officer with an invite_only guild, go to Settings tab. Verify "Join Requests" panel appears at the top listing any pending requests.

5. **Accept request** — Click Accept on a pending request. Verify:
   - The request disappears from the list
   - The player now appears in the Members tab
   - The guild activity log shows an acceptance entry

6. **Reject request** — Click Reject on a pending request. Verify it disappears from the list and the activity log shows a rejection entry.

7. **Duplicate request blocked** — Try sending a second request to the same guild. Verify the server returns an appropriate error.

8. **Open guild: no requests panel** — Change recruitment mode to `open` in settings. Verify the "Join Requests" panel disappears.
