# Friends System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mutual friends system with blocking, text mail (gold sink), and friendly sparring to PocketRealm.

**Architecture:** Three new Prisma models (Friendship, PlayerBlock, FriendMail) with four backend services (blockService, friendService, friendMailService, sparService) and a new `/friends` route group. Frontend wraps existing Guild screen into a Social hub with a new Friends tab, plus a mail icon in the header.

**Tech Stack:** Prisma 6 (schema + migration), Express routes with Zod validation, Vitest for service tests, React components with Tailwind CSS, fetchApi client pattern.

**Design doc:** `docs/superpowers/specs/2026-03-06-friends-system-design.md`

---

## Task 1: Prisma Schema — Add Friendship, PlayerBlock, FriendMail Models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add Friendship model to schema**

Add after the existing Guild models section:

```prisma
// ─── Friends & Social ───────────────────────────────────────────────

model Friendship {
  id         String    @id @default(uuid())
  senderId   String    @map("sender_id")
  receiverId String    @map("receiver_id")
  status     String    @default("pending") @db.VarChar(16)
  createdAt  DateTime  @default(now()) @map("created_at")
  acceptedAt DateTime? @map("accepted_at")

  sender   Player @relation("FriendshipSender", fields: [senderId], references: [id], onDelete: Cascade)
  receiver Player @relation("FriendshipReceiver", fields: [receiverId], references: [id], onDelete: Cascade)

  @@unique([senderId, receiverId])
  @@index([receiverId, status])
  @@index([senderId, status])
  @@map("friendships")
}

model PlayerBlock {
  id        String   @id @default(uuid())
  blockerId String   @map("blocker_id")
  blockedId String   @map("blocked_id")
  createdAt DateTime @default(now()) @map("created_at")

  blocker Player @relation("PlayerBlockBlocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked Player @relation("PlayerBlockBlocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@index([blockerId])
  @@map("player_blocks")
}

model FriendMail {
  id                   String   @id @default(uuid())
  senderId             String   @map("sender_id")
  recipientId          String   @map("recipient_id")
  subject              String   @db.VarChar(100)
  body                 String   @db.VarChar(1000)
  goldCost             Int      @default(0) @map("gold_cost")
  isSystem             Boolean  @default(false) @map("is_system")
  isRead               Boolean  @default(false) @map("is_read")
  isDeletedBySender    Boolean  @default(false) @map("is_deleted_by_sender")
  isDeletedByRecipient Boolean  @default(false) @map("is_deleted_by_recipient")
  createdAt            DateTime @default(now()) @map("created_at")

  sender    Player @relation("FriendMailSender", fields: [senderId], references: [id], onDelete: Cascade)
  recipient Player @relation("FriendMailRecipient", fields: [recipientId], references: [id], onDelete: Cascade)

  @@index([recipientId, isDeletedByRecipient, isRead])
  @@index([senderId, isDeletedBySender])
  @@map("friend_mails")
}
```

**Step 2: Add relations to Player model**

Add these relations to the existing Player model alongside the other relation fields:

```prisma
  // Friends & Social
  friendshipsSent     Friendship[]  @relation("FriendshipSender")
  friendshipsReceived Friendship[]  @relation("FriendshipReceiver")
  blocksInitiated     PlayerBlock[] @relation("PlayerBlockBlocker")
  blocksReceived      PlayerBlock[] @relation("PlayerBlockBlocked")
  friendMailsSent     FriendMail[]  @relation("FriendMailSender")
  friendMailsReceived FriendMail[]  @relation("FriendMailRecipient")
```

**Step 3: Run migration**

```bash
cd packages/database && npx prisma migrate dev --name add-friends-system
```

Expected: Migration file created in `prisma/migrations/`, schema validated, client regenerated.

**Step 4: Build database package**

```bash
npm run build --workspace=packages/database
```

Expected: Compiles without errors.

**Step 5: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(db): add Friendship, PlayerBlock, FriendMail models"
```

---

## Task 2: Shared Constants & Types

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Create: `packages/shared/src/types/friend.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Add constants to gameConstants.ts**

Add at the end before the file closes, following the existing pattern (`export const X = { ... } as const;`):

```typescript
export const FRIEND_CONSTANTS = {
  MAX_FRIENDS: 50,
  MAX_PENDING_REQUESTS: 20,
  REQUEST_COOLDOWN_SECONDS: 60,
} as const;

export const SPAR_CONSTANTS = {
  TURN_COST: 200,
} as const;

export const MAIL_CONSTANTS = {
  GOLD_COST: 25,
  MAX_SUBJECT_LENGTH: 100,
  MAX_BODY_LENGTH: 1000,
  MAX_INBOX_SIZE: 100,
  MAX_SENT_SIZE: 50,
} as const;
```

**Step 2: Create friend types**

Create `packages/shared/src/types/friend.types.ts`:

```typescript
export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendListEntry {
  friendshipId: string;
  playerId: string;
  username: string;
  characterLevel: number;
  isOnline: boolean;
}

export interface FriendRequest {
  friendshipId: string;
  playerId: string;
  username: string;
  characterLevel: number;
  createdAt: string;
}

export interface FriendProfile {
  playerId: string;
  username: string;
  characterLevel: number;
  isOnline: boolean;
  equipment: FriendEquipmentSlot[];
}

export interface FriendEquipmentSlot {
  slot: string;
  itemName: string | null;
  rarity: string | null;
}

export interface BlockedPlayer {
  blockId: string;
  playerId: string;
  username: string;
  createdAt: string;
}

export interface FriendMailEntry {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  body: string;
  goldCost: number;
  isSystem: boolean;
  isRead: boolean;
  createdAt: string;
}
```

**Step 3: Add barrel exports**

In `packages/shared/src/index.ts`, add:

```typescript
export * from './types/friend.types';
```

**Step 4: Build shared package**

```bash
npm run build --workspace=packages/shared
```

Expected: Compiles without errors.

**Step 5: Commit**

```bash
git add packages/shared/src/
git commit -m "feat(shared): add friend system constants and types"
```

---

## Task 3: Block Service (Backend)

**Files:**
- Create: `apps/api/src/services/blockService.ts`
- Create: `apps/api/src/services/blockService.test.ts`

**Reference:** `apps/api/src/services/chatService.test.ts` for test patterns, `apps/api/src/__test__/setup.ts` for mock setup.

**Step 1: Write failing tests**

Create `apps/api/src/services/blockService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';

import { isBlocked, blockPlayer, unblockPlayer, getBlockList } from './blockService';

describe('blockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isBlocked', () => {
    it('returns true when blocker has blocked the target', async () => {
      mockPrisma.playerBlock.findUnique.mockResolvedValue({ id: 'block-1' });

      const result = await isBlocked('blocker-id', 'blocked-id');

      expect(result).toBe(true);
      expect(mockPrisma.playerBlock.findUnique).toHaveBeenCalledWith({
        where: {
          blockerId_blockedId: {
            blockerId: 'blocker-id',
            blockedId: 'blocked-id',
          },
        },
        select: { id: true },
      });
    });

    it('returns false when no block exists', async () => {
      mockPrisma.playerBlock.findUnique.mockResolvedValue(null);

      const result = await isBlocked('a', 'b');

      expect(result).toBe(false);
    });
  });

  describe('blockPlayer', () => {
    it('creates block, removes friendship, and declines pending requests in a transaction', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: 'target-id', username: 'Target' });
      mockPrisma.playerBlock.findUnique.mockResolvedValue(null);

      const txMock = {
        playerBlock: { create: vi.fn().mockResolvedValue({ id: 'block-1' }) },
        friendship: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

      await blockPlayer('blocker-id', 'target-id');

      expect(txMock.playerBlock.create).toHaveBeenCalled();
      expect(txMock.friendship.deleteMany).toHaveBeenCalled();
    });

    it('throws if target player not found', async () => {
      mockPrisma.player.findUnique.mockResolvedValue(null);

      await expect(blockPlayer('a', 'nonexistent')).rejects.toThrow('Player not found');
    });

    it('throws if already blocked', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: 'target-id' });
      mockPrisma.playerBlock.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(blockPlayer('a', 'target-id')).rejects.toThrow('Already blocked');
    });
  });

  describe('unblockPlayer', () => {
    it('deletes the block record', async () => {
      mockPrisma.playerBlock.findFirst.mockResolvedValue({ id: 'block-1', blockerId: 'a' });
      mockPrisma.playerBlock.delete.mockResolvedValue({});

      await unblockPlayer('a', 'block-1');

      expect(mockPrisma.playerBlock.delete).toHaveBeenCalledWith({
        where: { id: 'block-1' },
      });
    });

    it('throws if block not found or not owned', async () => {
      mockPrisma.playerBlock.findFirst.mockResolvedValue(null);

      await expect(unblockPlayer('a', 'bad-id')).rejects.toThrow('Block not found');
    });
  });

  describe('getBlockList', () => {
    it('returns blocked players with username', async () => {
      mockPrisma.playerBlock.findMany.mockResolvedValue([
        {
          id: 'block-1',
          blockedId: 'p2',
          createdAt: new Date('2025-01-01'),
          blocked: { username: 'Player2' },
        },
      ]);

      const result = await getBlockList('p1');

      expect(result).toEqual([
        {
          blockId: 'block-1',
          playerId: 'p2',
          username: 'Player2',
          createdAt: expect.any(String),
        },
      ]);
    });
  });
});
```

**Step 2: Run tests to verify failure**

```bash
cd apps/api && npx vitest run src/services/blockService.test.ts
```

Expected: FAIL — cannot find module `./blockService`.

**Step 3: Implement blockService**

Create `apps/api/src/services/blockService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import type { BlockedPlayer } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const block = await prisma.playerBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { id: true },
  });
  return block !== null;
}

export async function blockPlayer(blockerId: string, targetId: string): Promise<void> {
  if (blockerId === targetId) {
    throw new AppError(400, 'Cannot block yourself', 'SELF_BLOCK');
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const existing = await prisma.playerBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId: targetId } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(400, 'Already blocked', 'ALREADY_BLOCKED');
  }

  await prisma.$transaction(async (tx) => {
    await tx.playerBlock.create({
      data: { blockerId, blockedId: targetId },
    });

    // Remove any existing friendship (either direction)
    await tx.friendship.deleteMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: blockerId, receiverId: targetId },
          { senderId: targetId, receiverId: blockerId },
        ],
      },
    });

    // Decline any pending requests from the blocked player
    await tx.friendship.updateMany({
      where: {
        senderId: targetId,
        receiverId: blockerId,
        status: 'pending',
      },
      data: { status: 'declined' },
    });
  });
}

export async function unblockPlayer(playerId: string, blockId: string): Promise<void> {
  const block = await prisma.playerBlock.findFirst({
    where: { id: blockId, blockerId: playerId },
    select: { id: true },
  });
  if (!block) {
    throw new AppError(404, 'Block not found', 'NOT_FOUND');
  }

  await prisma.playerBlock.delete({ where: { id: blockId } });
}

export async function getBlockList(playerId: string): Promise<BlockedPlayer[]> {
  const blocks = await prisma.playerBlock.findMany({
    where: { blockerId: playerId },
    include: { blocked: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return blocks.map((b) => ({
    blockId: b.id,
    playerId: b.blockedId,
    username: b.blocked.username,
    createdAt: b.createdAt.toISOString(),
  }));
}
```

**Step 4: Run tests to verify pass**

```bash
cd apps/api && npx vitest run src/services/blockService.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/blockService.ts apps/api/src/services/blockService.test.ts
git commit -m "feat(api): add blockService with tests"
```

---

## Task 4: Friend Service (Backend)

**Files:**
- Create: `apps/api/src/services/friendService.ts`
- Create: `apps/api/src/services/friendService.test.ts`

**Step 1: Write failing tests**

Create `apps/api/src/services/friendService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn(),
}));

import { isBlocked } from './blockService';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getFriendProfile,
} from './friendService';

const mockIsBlocked = vi.mocked(isBlocked);

describe('friendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlocked.mockResolvedValue(false);
  });

  describe('sendFriendRequest', () => {
    it('creates a pending friendship', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: 'target', username: 'Target' });
      mockPrisma.friendship.findFirst.mockResolvedValue(null);
      mockPrisma.friendship.count.mockResolvedValue(0); // pending count
      mockPrisma.friendship.create.mockResolvedValue({ id: 'f1', status: 'pending' });

      // Friend count queries (sender + receiver)
      const countMock = mockPrisma.friendship.count;
      countMock.mockResolvedValueOnce(5);  // sender outgoing pending
      countMock.mockResolvedValueOnce(10); // sender accepted friends
      countMock.mockResolvedValueOnce(10); // receiver accepted friends

      mockPrisma.friendship.create.mockResolvedValue({ id: 'f1' });

      await sendFriendRequest('sender', 'target');

      expect(mockPrisma.friendship.create).toHaveBeenCalled();
    });

    it('throws if target is self', async () => {
      await expect(sendFriendRequest('a', 'a')).rejects.toThrow('Cannot send friend request to yourself');
    });

    it('throws if blocked by target', async () => {
      mockPrisma.player.findUnique.mockResolvedValue({ id: 'target' });
      mockIsBlocked.mockResolvedValue(true);

      await expect(sendFriendRequest('sender', 'target')).rejects.toThrow();
    });
  });

  describe('acceptFriendRequest', () => {
    it('updates friendship status to accepted', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        senderId: 'sender',
        receiverId: 'receiver',
        status: 'pending',
      });
      mockPrisma.friendship.count.mockResolvedValue(10); // both under cap
      mockPrisma.friendship.update.mockResolvedValue({});

      await acceptFriendRequest('receiver', 'f1');

      expect(mockPrisma.friendship.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { status: 'accepted', acceptedAt: expect.any(Date) },
      });
    });

    it('throws if request not found or not receiver', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(acceptFriendRequest('wrong-player', 'f1')).rejects.toThrow('Friend request not found');
    });
  });

  describe('declineFriendRequest', () => {
    it('deletes the pending friendship', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        senderId: 'sender',
        receiverId: 'receiver',
        status: 'pending',
      });
      mockPrisma.friendship.delete.mockResolvedValue({});

      await declineFriendRequest('receiver', 'f1');

      expect(mockPrisma.friendship.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });
  });

  describe('unfriend', () => {
    it('deletes an accepted friendship where player is sender or receiver', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        senderId: 'a',
        receiverId: 'b',
        status: 'accepted',
      });
      mockPrisma.friendship.delete.mockResolvedValue({});

      await unfriend('a', 'f1');

      expect(mockPrisma.friendship.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });

    it('throws if friendship not found', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(unfriend('a', 'bad-id')).rejects.toThrow('Friendship not found');
    });
  });

  describe('getFriends', () => {
    it('returns accepted friends with player info', async () => {
      mockPrisma.friendship.findMany.mockResolvedValue([
        {
          id: 'f1',
          senderId: 'me',
          receiverId: 'other',
          sender: { id: 'me', username: 'Me', characterLevel: 10 },
          receiver: { id: 'other', username: 'Other', characterLevel: 20 },
        },
      ]);

      const result = await getFriends('me', new Set());

      expect(result).toEqual([
        {
          friendshipId: 'f1',
          playerId: 'other',
          username: 'Other',
          characterLevel: 20,
          isOnline: false,
        },
      ]);
    });
  });
});
```

**Step 2: Run tests to verify failure**

```bash
cd apps/api && npx vitest run src/services/friendService.test.ts
```

Expected: FAIL — cannot find module `./friendService`.

**Step 3: Implement friendService**

Create `apps/api/src/services/friendService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import {
  FRIEND_CONSTANTS,
  type FriendListEntry,
  type FriendRequest,
  type FriendProfile,
  type FriendEquipmentSlot,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';

const EQUIPMENT_SLOTS = [
  'head', 'neck', 'chest', 'gloves', 'belt',
  'legs', 'boots', 'main_hand', 'off_hand', 'ring', 'charm',
];

export async function sendFriendRequest(senderId: string, targetId: string): Promise<void> {
  if (senderId === targetId) {
    throw new AppError(400, 'Cannot send friend request to yourself', 'SELF_REQUEST');
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  // Check blocks in both directions
  if (await isBlocked(targetId, senderId)) {
    throw new AppError(400, 'Cannot send friend request to this player', 'BLOCKED');
  }
  if (await isBlocked(senderId, targetId)) {
    throw new AppError(400, 'Cannot send friend request to a player you have blocked', 'BLOCKER');
  }

  // Check for existing friendship (either direction)
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId, receiverId: targetId },
        { senderId: targetId, receiverId: senderId },
      ],
    },
    select: { id: true, status: true },
  });

  if (existing?.status === 'accepted') {
    throw new AppError(400, 'Already friends', 'ALREADY_FRIENDS');
  }
  if (existing?.status === 'pending') {
    throw new AppError(400, 'Friend request already pending', 'ALREADY_PENDING');
  }

  // Check pending outgoing request cap
  const pendingCount = await prisma.friendship.count({
    where: { senderId, status: 'pending' },
  });
  if (pendingCount >= FRIEND_CONSTANTS.MAX_PENDING_REQUESTS) {
    throw new AppError(400, 'Too many pending friend requests', 'MAX_PENDING_REQUESTS');
  }

  // Check friend cap for both players
  const [senderFriendCount, receiverFriendCount] = await Promise.all([
    countAcceptedFriends(senderId),
    countAcceptedFriends(targetId),
  ]);
  if (senderFriendCount >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'Your friends list is full', 'SENDER_MAX_FRIENDS');
  }
  if (receiverFriendCount >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, "That player's friends list is full", 'RECEIVER_MAX_FRIENDS');
  }

  await prisma.friendship.create({
    data: { senderId, receiverId: targetId },
  });
}

export async function acceptFriendRequest(playerId: string, friendshipId: string): Promise<void> {
  const request = await prisma.friendship.findFirst({
    where: { id: friendshipId, receiverId: playerId, status: 'pending' },
    select: { id: true, senderId: true, receiverId: true },
  });
  if (!request) {
    throw new AppError(404, 'Friend request not found', 'NOT_FOUND');
  }

  // Recheck friend caps
  const [senderCount, receiverCount] = await Promise.all([
    countAcceptedFriends(request.senderId),
    countAcceptedFriends(request.receiverId),
  ]);
  if (senderCount >= FRIEND_CONSTANTS.MAX_FRIENDS || receiverCount >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new AppError(400, 'Friends list is full', 'MAX_FRIENDS');
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
}

export async function declineFriendRequest(playerId: string, friendshipId: string): Promise<void> {
  const request = await prisma.friendship.findFirst({
    where: { id: friendshipId, receiverId: playerId, status: 'pending' },
    select: { id: true },
  });
  if (!request) {
    throw new AppError(404, 'Friend request not found', 'NOT_FOUND');
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
}

export async function unfriend(playerId: string, friendshipId: string): Promise<void> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
    select: { id: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
}

export async function getFriends(
  playerId: string,
  onlinePlayers: Set<string>,
): Promise<FriendListEntry[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
    include: {
      sender: { select: { id: true, username: true, characterLevel: true } },
      receiver: { select: { id: true, username: true, characterLevel: true } },
    },
  });

  return friendships.map((f) => {
    const friend = f.senderId === playerId ? f.receiver : f.sender;
    return {
      friendshipId: f.id,
      playerId: friend.id,
      username: friend.username,
      characterLevel: friend.characterLevel,
      isOnline: onlinePlayers.has(friend.id),
    };
  });
}

export async function getIncomingRequests(playerId: string): Promise<FriendRequest[]> {
  const requests = await prisma.friendship.findMany({
    where: { receiverId: playerId, status: 'pending' },
    include: { sender: { select: { id: true, username: true, characterLevel: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return requests.map((r) => ({
    friendshipId: r.id,
    playerId: r.sender.id,
    username: r.sender.username,
    characterLevel: r.sender.characterLevel,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getOutgoingRequests(playerId: string): Promise<FriendRequest[]> {
  const requests = await prisma.friendship.findMany({
    where: { senderId: playerId, status: 'pending' },
    include: { receiver: { select: { id: true, username: true, characterLevel: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return requests.map((r) => ({
    friendshipId: r.id,
    playerId: r.receiver.id,
    username: r.receiver.username,
    characterLevel: r.receiver.characterLevel,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getFriendProfile(
  playerId: string,
  friendshipId: string,
  onlinePlayers: Set<string>,
): Promise<FriendProfile> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
    select: { senderId: true, receiverId: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  const friendId = friendship.senderId === playerId
    ? friendship.receiverId
    : friendship.senderId;

  const friend = await prisma.player.findUnique({
    where: { id: friendId },
    select: { id: true, username: true, characterLevel: true },
  });
  if (!friend) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const equipment = await prisma.playerEquipment.findMany({
    where: { playerId: friendId },
    include: { item: { include: { template: true } } },
  });

  const equipmentSlots: FriendEquipmentSlot[] = EQUIPMENT_SLOTS.map((slot) => {
    const eq = equipment.find((e) => e.slot === slot);
    return {
      slot,
      itemName: eq?.item?.template?.name ?? null,
      rarity: eq?.item?.rarity ?? null,
    };
  });

  return {
    playerId: friend.id,
    username: friend.username,
    characterLevel: friend.characterLevel,
    isOnline: onlinePlayers.has(friend.id),
    equipment: equipmentSlots,
  };
}

export async function findPlayerByUsername(username: string) {
  return prisma.player.findUnique({
    where: { username },
    select: { id: true, username: true, characterLevel: true },
  });
}

async function countAcceptedFriends(playerId: string): Promise<number> {
  return prisma.friendship.count({
    where: {
      status: 'accepted',
      OR: [{ senderId: playerId }, { receiverId: playerId }],
    },
  });
}
```

**Step 4: Run tests to verify pass**

```bash
cd apps/api && npx vitest run src/services/friendService.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/friendService.ts apps/api/src/services/friendService.test.ts
git commit -m "feat(api): add friendService with tests"
```

---

## Task 5: Friend Mail Service (Backend)

**Files:**
- Create: `apps/api/src/services/friendMailService.ts`
- Create: `apps/api/src/services/friendMailService.test.ts`

**Step 1: Write failing tests**

Create `apps/api/src/services/friendMailService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn(),
}));

import { isBlocked } from './blockService';
import {
  sendMail,
  sendSystemMail,
  getInbox,
  getSentMail,
  readMail,
  deleteMail,
  getUnreadCount,
} from './friendMailService';

const mockIsBlocked = vi.mocked(isBlocked);

describe('friendMailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlocked.mockResolvedValue(false);
  });

  describe('sendMail', () => {
    it('deducts gold and creates mail entry', async () => {
      // Friendship exists
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'f1', status: 'accepted' });

      const txMock = {
        player: {
          findUnique: vi.fn().mockResolvedValue({ gold: 100 }),
          update: vi.fn().mockResolvedValue({}),
        },
        friendMail: {
          create: vi.fn().mockResolvedValue({ id: 'mail-1' }),
          count: vi.fn().mockResolvedValue(5),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

      await sendMail('sender', 'recipient', 'Hello', 'Body text');

      expect(txMock.player.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sender' },
          data: { gold: { decrement: 25 } },
        }),
      );
      expect(txMock.friendMail.create).toHaveBeenCalled();
    });

    it('throws if not friends', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(sendMail('a', 'b', 'Sub', 'Body')).rejects.toThrow('Must be friends to send mail');
    });
  });

  describe('sendSystemMail', () => {
    it('creates a system mail with no gold cost', async () => {
      mockPrisma.friendMail.create.mockResolvedValue({ id: 'sys-1' });

      await sendSystemMail('sender', 'recipient', 'Spar Result', 'You lost!');

      expect(mockPrisma.friendMail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isSystem: true,
          goldCost: 0,
        }),
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread non-deleted mails', async () => {
      mockPrisma.friendMail.count.mockResolvedValue(3);

      const result = await getUnreadCount('p1');

      expect(result).toBe(3);
      expect(mockPrisma.friendMail.count).toHaveBeenCalledWith({
        where: {
          recipientId: 'p1',
          isRead: false,
          isDeletedByRecipient: false,
        },
      });
    });
  });

  describe('readMail', () => {
    it('marks mail as read and returns it', async () => {
      const mail = {
        id: 'mail-1',
        senderId: 'p2',
        recipientId: 'p1',
        subject: 'Hi',
        body: 'Hello',
        goldCost: 25,
        isSystem: false,
        isRead: false,
        isDeletedBySender: false,
        isDeletedByRecipient: false,
        createdAt: new Date('2025-01-01'),
        sender: { username: 'Sender' },
        recipient: { username: 'Recipient' },
      };
      mockPrisma.friendMail.findFirst.mockResolvedValue(mail);
      mockPrisma.friendMail.update.mockResolvedValue({});

      const result = await readMail('p1', 'mail-1');

      expect(result.subject).toBe('Hi');
      expect(mockPrisma.friendMail.update).toHaveBeenCalledWith({
        where: { id: 'mail-1' },
        data: { isRead: true },
      });
    });
  });

  describe('deleteMail', () => {
    it('sets isDeletedByRecipient when recipient deletes', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: 'p2',
        recipientId: 'p1',
        isDeletedBySender: false,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.update.mockResolvedValue({});

      await deleteMail('p1', 'mail-1');

      expect(mockPrisma.friendMail.update).toHaveBeenCalledWith({
        where: { id: 'mail-1' },
        data: { isDeletedByRecipient: true },
      });
    });

    it('hard-deletes when both sides have deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: 'p2',
        recipientId: 'p1',
        isDeletedBySender: true,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.delete.mockResolvedValue({});

      await deleteMail('p1', 'mail-1');

      expect(mockPrisma.friendMail.delete).toHaveBeenCalledWith({ where: { id: 'mail-1' } });
    });
  });
});
```

**Step 2: Run tests to verify failure**

```bash
cd apps/api && npx vitest run src/services/friendMailService.test.ts
```

Expected: FAIL — cannot find module `./friendMailService`.

**Step 3: Implement friendMailService**

Create `apps/api/src/services/friendMailService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import { MAIL_CONSTANTS, type FriendMailEntry } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';

export async function sendMail(
  senderId: string,
  recipientId: string,
  subject: string,
  body: string,
): Promise<void> {
  if (senderId === recipientId) {
    throw new AppError(400, 'Cannot send mail to yourself', 'SELF_MAIL');
  }

  // Must be friends
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId, receiverId: recipientId },
        { senderId: recipientId, receiverId: senderId },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    throw new AppError(400, 'Must be friends to send mail', 'NOT_FRIENDS');
  }

  if (await isBlocked(recipientId, senderId)) {
    throw new AppError(400, 'Cannot send mail to this player', 'BLOCKED');
  }

  await prisma.$transaction(async (tx) => {
    // Check gold
    const sender = await tx.player.findUnique({
      where: { id: senderId },
      select: { gold: true },
    });
    if (!sender || sender.gold < MAIL_CONSTANTS.GOLD_COST) {
      throw new AppError(400, 'Not enough gold', 'INSUFFICIENT_GOLD');
    }

    // Deduct gold
    await tx.player.update({
      where: { id: senderId },
      data: { gold: { decrement: MAIL_CONSTANTS.GOLD_COST } },
    });

    // Create mail
    await tx.friendMail.create({
      data: {
        senderId,
        recipientId,
        subject: subject.slice(0, MAIL_CONSTANTS.MAX_SUBJECT_LENGTH),
        body: body.slice(0, MAIL_CONSTANTS.MAX_BODY_LENGTH),
        goldCost: MAIL_CONSTANTS.GOLD_COST,
      },
    });

    // Prune inbox if over cap (delete oldest)
    const recipientInboxCount = await tx.friendMail.count({
      where: { recipientId, isDeletedByRecipient: false },
    });
    if (recipientInboxCount > MAIL_CONSTANTS.MAX_INBOX_SIZE) {
      const excess = await tx.friendMail.findMany({
        where: { recipientId, isDeletedByRecipient: false },
        orderBy: { createdAt: 'asc' },
        take: recipientInboxCount - MAIL_CONSTANTS.MAX_INBOX_SIZE,
        select: { id: true },
      });
      if (excess.length > 0) {
        await tx.friendMail.updateMany({
          where: { id: { in: excess.map((e) => e.id) } },
          data: { isDeletedByRecipient: true },
        });
      }
    }
  });
}

export async function sendSystemMail(
  senderId: string,
  recipientId: string,
  subject: string,
  body: string,
): Promise<void> {
  await prisma.friendMail.create({
    data: {
      senderId,
      recipientId,
      subject,
      body,
      goldCost: 0,
      isSystem: true,
    },
  });
}

export async function getInbox(
  playerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ mails: FriendMailEntry[]; total: number }> {
  const where = { recipientId: playerId, isDeletedByRecipient: false };

  const [mails, total] = await Promise.all([
    prisma.friendMail.findMany({
      where,
      include: {
        sender: { select: { username: true } },
        recipient: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.friendMail.count({ where }),
  ]);

  return {
    mails: mails.map(toMailEntry),
    total,
  };
}

export async function getSentMail(
  playerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ mails: FriendMailEntry[]; total: number }> {
  const where = { senderId: playerId, isDeletedBySender: false, isSystem: false };

  const [mails, total] = await Promise.all([
    prisma.friendMail.findMany({
      where,
      include: {
        sender: { select: { username: true } },
        recipient: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.friendMail.count({ where }),
  ]);

  return {
    mails: mails.map(toMailEntry),
    total,
  };
}

export async function readMail(playerId: string, mailId: string): Promise<FriendMailEntry> {
  const mail = await prisma.friendMail.findFirst({
    where: {
      id: mailId,
      OR: [
        { recipientId: playerId, isDeletedByRecipient: false },
        { senderId: playerId, isDeletedBySender: false },
      ],
    },
    include: {
      sender: { select: { username: true } },
      recipient: { select: { username: true } },
    },
  });
  if (!mail) {
    throw new AppError(404, 'Mail not found', 'NOT_FOUND');
  }

  // Mark as read if recipient is reading
  if (mail.recipientId === playerId && !mail.isRead) {
    await prisma.friendMail.update({
      where: { id: mailId },
      data: { isRead: true },
    });
  }

  return toMailEntry({ ...mail, isRead: true });
}

export async function deleteMail(playerId: string, mailId: string): Promise<void> {
  const mail = await prisma.friendMail.findFirst({
    where: {
      id: mailId,
      OR: [{ senderId: playerId }, { recipientId: playerId }],
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      isDeletedBySender: true,
      isDeletedByRecipient: true,
    },
  });
  if (!mail) {
    throw new AppError(404, 'Mail not found', 'NOT_FOUND');
  }

  const isSender = mail.senderId === playerId;
  const otherSideDeleted = isSender ? mail.isDeletedByRecipient : mail.isDeletedBySender;

  if (otherSideDeleted) {
    // Both sides deleted — hard delete
    await prisma.friendMail.delete({ where: { id: mailId } });
  } else {
    // Soft delete for this side
    await prisma.friendMail.update({
      where: { id: mailId },
      data: isSender ? { isDeletedBySender: true } : { isDeletedByRecipient: true },
    });
  }
}

export async function getUnreadCount(playerId: string): Promise<number> {
  return prisma.friendMail.count({
    where: {
      recipientId: playerId,
      isRead: false,
      isDeletedByRecipient: false,
    },
  });
}

function toMailEntry(mail: {
  id: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  goldCost: number;
  isSystem: boolean;
  isRead: boolean;
  createdAt: Date;
  sender: { username: string };
  recipient: { username: string };
}): FriendMailEntry {
  return {
    id: mail.id,
    senderId: mail.senderId,
    senderName: mail.sender.username,
    recipientId: mail.recipientId,
    recipientName: mail.recipient.username,
    subject: mail.subject,
    body: mail.body,
    goldCost: mail.goldCost,
    isSystem: mail.isSystem,
    isRead: mail.isRead,
    createdAt: mail.createdAt.toISOString(),
  };
}
```

**Step 4: Run tests to verify pass**

```bash
cd apps/api && npx vitest run src/services/friendMailService.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/friendMailService.ts apps/api/src/services/friendMailService.test.ts
git commit -m "feat(api): add friendMailService with tests"
```

---

## Task 6: Spar Service (Backend)

**Files:**
- Create: `apps/api/src/services/sparService.ts`
- Create: `apps/api/src/services/sparService.test.ts`

**Reference:** `apps/api/src/services/pvpService.ts` for combat setup pattern, `apps/api/src/services/combatOrchestrationService.ts` for `buildPlayerTemplateCombatant`.

**Step 1: Write failing tests**

Create `apps/api/src/services/sparService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn().mockResolvedValue(false),
}));

vi.mock('./friendMailService', () => ({
  sendSystemMail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({ currentTurns: 800 }),
}));

vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ isRecovering: false, currentHp: 100 }),
}));

import { validateSpar } from './sparService';

describe('sparService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateSpar', () => {
    it('throws if friendship not found', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(validateSpar('attacker', 'bad-id')).rejects.toThrow('Friendship not found');
    });

    it('throws if player is recovering', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        senderId: 'attacker',
        receiverId: 'defender',
        status: 'accepted',
      });

      const { getHpState } = await import('./hpService');
      vi.mocked(getHpState).mockResolvedValue({ isRecovering: true, currentHp: 0 } as ReturnType<typeof getHpState> extends Promise<infer R> ? R : never);

      await expect(validateSpar('attacker', 'f1')).rejects.toThrow('Cannot spar while recovering');
    });

    it('returns attacker and defender IDs when valid', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        senderId: 'attacker',
        receiverId: 'defender',
        status: 'accepted',
      });

      const result = await validateSpar('attacker', 'f1');

      expect(result).toEqual({
        attackerId: 'attacker',
        defenderId: 'defender',
      });
    });
  });
});
```

**Step 2: Run tests to verify failure**

```bash
cd apps/api && npx vitest run src/services/sparService.test.ts
```

Expected: FAIL — cannot find module `./sparService`.

**Step 3: Implement sparService**

Create `apps/api/src/services/sparService.ts`:

The spar service validates the spar, then the route handler orchestrates the actual combat (reusing existing PvP combat logic from pvpService). This keeps sparService focused.

```typescript
import { prisma } from '@pocketrealm/database';
import { SPAR_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';
import { getHpState } from './hpService';
import { spendPlayerTurnsTx } from './turnBankService';
import { sendSystemMail } from './friendMailService';

interface SparValidation {
  attackerId: string;
  defenderId: string;
}

export async function validateSpar(
  attackerId: string,
  friendshipId: string,
): Promise<SparValidation> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: attackerId }, { receiverId: attackerId }],
    },
    select: { senderId: true, receiverId: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  const defenderId = friendship.senderId === attackerId
    ? friendship.receiverId
    : friendship.senderId;

  // HP check
  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot spar while recovering', 'IS_RECOVERING');
  }

  // Block check
  if (await isBlocked(defenderId, attackerId)) {
    throw new AppError(400, 'Cannot spar with this player', 'BLOCKED');
  }

  return { attackerId, defenderId };
}

export async function spendSparTurns(attackerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, attackerId, SPAR_CONSTANTS.TURN_COST);
  });
}

export async function sendSparResultMail(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  attackerWon: boolean,
  winnerHp: number,
): Promise<void> {
  const subject = 'Friendly Spar Result';
  const body = attackerWon
    ? `${attackerName} beat you in a friendly spar! They ended on ${winnerHp} HP.`
    : `${attackerName} lost to you in a friendly spar! You showed them who's boss.`;

  await sendSystemMail(attackerId, defenderId, subject, body);
}
```

**Step 4: Run tests to verify pass**

```bash
cd apps/api && npx vitest run src/services/sparService.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/sparService.ts apps/api/src/services/sparService.test.ts
git commit -m "feat(api): add sparService with tests"
```

---

## Task 7: Friends Routes (Backend)

**Files:**
- Create: `apps/api/src/routes/friends.ts`
- Modify: `apps/api/src/index.ts`

**Reference:** `apps/api/src/routes/pvp.ts` for route patterns, `apps/api/src/socket/index.ts` for `getIo()`.

**Step 1: Create routes file**

Create `apps/api/src/routes/friends.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getFriendProfile,
  findPlayerByUsername,
} from '../services/friendService';
import {
  blockPlayer,
  unblockPlayer,
  getBlockList,
} from '../services/blockService';
import {
  sendMail,
  getInbox,
  getSentMail,
  readMail,
  deleteMail,
  getUnreadCount,
} from '../services/friendMailService';
import {
  validateSpar,
  spendSparTurns,
  sendSparResultMail,
} from '../services/sparService';
import { getIo } from '../socket';
import { MAIL_CONSTANTS } from '@pocketrealm/shared';

export const friendsRouter = Router();
friendsRouter.use(authenticate);

// --- Helpers ---

function getOnlinePlayers(): Set<string> {
  const io = getIo();
  if (!io) return new Set();
  const players = new Set<string>();
  for (const [, socket] of io.sockets.sockets) {
    if (socket.data.playerId) players.add(socket.data.playerId);
  }
  return players;
}

// --- Schemas ---

const targetIdSchema = z.object({ targetId: z.string().uuid() });
const usernameSchema = z.object({ username: z.string().min(1).max(32) });
const mailSchema = z.object({
  recipientId: z.string().uuid(),
  subject: z.string().min(1).max(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH),
  body: z.string().min(1).max(MAIL_CONSTANTS.MAX_BODY_LENGTH),
});
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
});

// ─── Friend Requests ──────────────────────────────────────────────

friendsRouter.post('/request', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { targetId } = targetIdSchema.parse(req.body);
  await sendFriendRequest(playerId, targetId);
  res.json({ success: true });
}));

friendsRouter.post('/request/search', asyncHandler(async (req, res) => {
  const { username } = usernameSchema.parse(req.body);
  const player = await findPlayerByUsername(username);
  if (!player) {
    res.json({ player: null });
    return;
  }
  res.json({ player });
}));

friendsRouter.get('/requests/incoming', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const requests = await getIncomingRequests(playerId);
  res.json({ requests });
}));

friendsRouter.get('/requests/outgoing', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const requests = await getOutgoingRequests(playerId);
  res.json({ requests });
}));

friendsRouter.post('/requests/:id/accept', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await acceptFriendRequest(playerId, req.params.id);
  res.json({ success: true });
}));

friendsRouter.post('/requests/:id/decline', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await declineFriendRequest(playerId, req.params.id);
  res.json({ success: true });
}));

// ─── Friends List ─────────────────────────────────────────────────

friendsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const friends = await getFriends(playerId, getOnlinePlayers());
  res.json({ friends });
}));

friendsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await unfriend(playerId, req.params.id);
  res.json({ success: true });
}));

friendsRouter.get('/:id/profile', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const profile = await getFriendProfile(playerId, req.params.id, getOnlinePlayers());
  res.json(profile);
}));

// ─── Spar ─────────────────────────────────────────────────────────

friendsRouter.post('/:id/spar', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { attackerId, defenderId } = await validateSpar(playerId, req.params.id);

  await spendSparTurns(attackerId);

  // Reuse PvP combat logic — import the challenge combat builder
  // This will be wired to the existing combat engine
  // For now, return a placeholder that the full spar route will expand
  // The actual combat execution follows the same pattern as pvpService.challenge()
  // but without ELO, cooldowns, or match persistence

  // TODO: Wire to combat engine in spar route implementation
  res.json({ attackerId, defenderId, message: 'Spar initiated' });
}));

// ─── Block ────────────────────────────────────────────────────────

friendsRouter.post('/block', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { targetId } = targetIdSchema.parse(req.body);
  await blockPlayer(playerId, targetId);
  res.json({ success: true });
}));

friendsRouter.delete('/block/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await unblockPlayer(playerId, req.params.id);
  res.json({ success: true });
}));

friendsRouter.get('/block', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const blocks = await getBlockList(playerId);
  res.json({ blocks });
}));

// ─── Mail ─────────────────────────────────────────────────────────

friendsRouter.post('/mail', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { recipientId, subject, body } = mailSchema.parse(req.body);
  await sendMail(playerId, recipientId, subject, body);
  res.json({ success: true });
}));

friendsRouter.get('/mail/inbox', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { page } = paginationSchema.parse(req.query);
  const result = await getInbox(playerId, page);
  res.json(result);
}));

friendsRouter.get('/mail/sent', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { page } = paginationSchema.parse(req.query);
  const result = await getSentMail(playerId, page);
  res.json(result);
}));

friendsRouter.get('/mail/unread-count', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const count = await getUnreadCount(playerId);
  res.json({ count });
}));

friendsRouter.get('/mail/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const mail = await readMail(playerId, req.params.id);
  res.json(mail);
}));

friendsRouter.delete('/mail/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await deleteMail(playerId, req.params.id);
  res.json({ success: true });
}));
```

**Step 2: Register route in index.ts**

In `apps/api/src/index.ts`, add import and route registration:

```typescript
import { friendsRouter } from './routes/friends';

// Add with other routes:
app.use('/api/v1/friends', friendsRouter);
```

**Step 3: Build to verify compilation**

```bash
npm run build:api
```

Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add apps/api/src/routes/friends.ts apps/api/src/index.ts
git commit -m "feat(api): add friends routes and register in app"
```

---

## Task 8: Wire Spar Combat (Backend)

**Files:**
- Modify: `apps/api/src/routes/friends.ts` (spar endpoint)

**Reference:** `apps/api/src/services/pvpService.ts` (the `challenge` function) for the exact combat setup pattern.

**Step 1: Read pvpService.challenge to understand combat wiring**

Read `apps/api/src/services/pvpService.ts` — the `challenge()` function. Understand how it:
1. Loads attacker + defender stats, equipment, templates, skills
2. Builds `TemplateCombatant` for each
3. Calls `runTemplateCombat()`
4. Processes results (HP, durability, XP, ELO, match record)

For spar: replicate steps 1-3, skip step 4 (no ELO, no XP, no durability, no match record). Only send system mail to defender.

**Step 2: Implement full spar route**

Replace the spar route placeholder in `apps/api/src/routes/friends.ts`. The spar route should:

1. Call `validateSpar()` to verify friendship and HP
2. Call `spendSparTurns()` to deduct turns
3. Load both players' combat stats (same as PvP challenge)
4. Build combatants and run `runTemplateCombat()`
5. Send system mail to defender with result
6. Return combat log to attacker for playback

Follow the exact pattern from `pvpService.challenge()` for loading stats and building combatants, but strip out all post-combat processing (ELO, XP, durability, match record, notifications).

**Step 3: Build to verify**

```bash
npm run build:api
```

Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add apps/api/src/routes/friends.ts
git commit -m "feat(api): wire spar combat to existing combat engine"
```

---

## Task 9: Frontend API Client

**Files:**
- Create: `apps/web/src/lib/api/friends.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Reference:** `apps/web/src/lib/api/social.ts` and `apps/web/src/lib/api/guild.ts` for patterns.

**Step 1: Create friends API client**

Create `apps/web/src/lib/api/friends.ts`:

```typescript
import { fetchApi } from './core';
import type {
  FriendListEntry,
  FriendRequest,
  FriendProfile,
  BlockedPlayer,
  FriendMailEntry,
} from '@pocketrealm/shared';
import type { CombatLogEntryResponse, CombatOutcomeResponse } from './combat';

// ─── Friends ──────────────────────────────────────────────────────

export async function getFriendsList() {
  return fetchApi<{ friends: FriendListEntry[] }>('/api/v1/friends');
}

export async function sendFriendRequest(targetId: string) {
  return fetchApi<{ success: boolean }>('/api/v1/friends/request', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function searchPlayerByUsername(username: string) {
  return fetchApi<{ player: { id: string; username: string; characterLevel: number } | null }>(
    '/api/v1/friends/request/search',
    { method: 'POST', body: JSON.stringify({ username }) },
  );
}

export async function getIncomingFriendRequests() {
  return fetchApi<{ requests: FriendRequest[] }>('/api/v1/friends/requests/incoming');
}

export async function getOutgoingFriendRequests() {
  return fetchApi<{ requests: FriendRequest[] }>('/api/v1/friends/requests/outgoing');
}

export async function acceptFriendRequest(friendshipId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/requests/${friendshipId}/accept`, {
    method: 'POST',
  });
}

export async function declineFriendRequest(friendshipId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/requests/${friendshipId}/decline`, {
    method: 'POST',
  });
}

export async function unfriend(friendshipId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/${friendshipId}`, {
    method: 'DELETE',
  });
}

export async function getFriendProfile(friendshipId: string) {
  return fetchApi<FriendProfile>(`/api/v1/friends/${friendshipId}/profile`);
}

// ─── Spar ─────────────────────────────────────────────────────────

export interface SparResponse {
  winnerId: string | null;
  isDraw: boolean;
  attackerName: string;
  defenderName: string;
  attackerHpRemaining: number;
  defenderHpRemaining: number;
  combat: {
    outcome: CombatOutcomeResponse;
    log: CombatLogEntryResponse[];
  };
}

export async function sparFriend(friendshipId: string) {
  return fetchApi<SparResponse>(`/api/v1/friends/${friendshipId}/spar`, {
    method: 'POST',
  });
}

// ─── Block ────────────────────────────────────────────────────────

export async function blockPlayer(targetId: string) {
  return fetchApi<{ success: boolean }>('/api/v1/friends/block', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function unblockPlayer(blockId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/block/${blockId}`, {
    method: 'DELETE',
  });
}

export async function getBlockList() {
  return fetchApi<{ blocks: BlockedPlayer[] }>('/api/v1/friends/block');
}

// ─── Mail ─────────────────────────────────────────────────────────

export async function sendFriendMail(recipientId: string, subject: string, body: string) {
  return fetchApi<{ success: boolean }>('/api/v1/friends/mail', {
    method: 'POST',
    body: JSON.stringify({ recipientId, subject, body }),
  });
}

export async function getFriendMailInbox(page = 1) {
  return fetchApi<{ mails: FriendMailEntry[]; total: number }>(
    `/api/v1/friends/mail/inbox?page=${page}`,
  );
}

export async function getFriendMailSent(page = 1) {
  return fetchApi<{ mails: FriendMailEntry[]; total: number }>(
    `/api/v1/friends/mail/sent?page=${page}`,
  );
}

export async function getFriendMailUnreadCount() {
  return fetchApi<{ count: number }>('/api/v1/friends/mail/unread-count');
}

export async function readFriendMail(mailId: string) {
  return fetchApi<FriendMailEntry>(`/api/v1/friends/mail/${mailId}`);
}

export async function deleteFriendMail(mailId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/friends/mail/${mailId}`, {
    method: 'DELETE',
  });
}
```

**Step 2: Add barrel exports to index**

In `apps/web/src/lib/api/index.ts`, add:

```typescript
export {
  getFriendsList,
  sendFriendRequest,
  searchPlayerByUsername,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriendProfile,
  sparFriend,
  blockPlayer,
  unblockPlayer,
  getBlockList,
  sendFriendMail,
  getFriendMailInbox,
  getFriendMailSent,
  getFriendMailUnreadCount,
  readFriendMail,
  deleteFriendMail,
} from './friends';
export type { SparResponse } from './friends';
```

**Step 3: Build to verify**

```bash
npm run build:web
```

Expected: Compiles (may have pre-existing TS error in page.tsx — that's not ours).

**Step 4: Commit**

```bash
git add apps/web/src/lib/api/friends.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): add friends API client"
```

---

## Task 10: Navigation — Guild to Social Hub

**Files:**
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts` (or `gameController.types.ts`)
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Update BottomNav**

In `apps/web/src/components/BottomNav.tsx`, change the guild nav item:

```typescript
// Change:
{ id: 'guild', label: 'Guild', icon: 'guild' },
// To:
{ id: 'social', label: 'Social', icon: 'guild' },
```

**Step 2: Update Screen type**

In the Screen type definition (check `gameController.types.ts` or wherever `Screen` is defined), add `'friends'` to the union type and replace `'guild'` handling:

```typescript
| 'guild'
| 'friends'
```

**Step 3: Update getActiveTab**

In `useGameController.ts`, update `getActiveTab`:

```typescript
// Change:
if (activeScreen === 'guild') return 'guild';
// To:
if (activeScreen === 'guild' || activeScreen === 'friends') return 'social';
```

**Step 4: Update handleNavigate default screen**

When the "social" tab is clicked, default to whichever sub-screen was last active (guild or friends), or default to guild:

```typescript
// In handleNavigate, handle 'social' tab:
case 'social':
  setActiveScreen('guild'); // default sub-screen
  break;
```

**Step 5: Add SubNav for social tab**

In `page.tsx`, add a SubNav for the social tab:

```typescript
{getActiveTab() === 'social' && (
  <SubNav
    tabs={[
      { id: 'guild', label: 'Guild' },
      { id: 'friends', label: 'Friends', badge: incomingFriendRequestCount },
    ]}
    activeId={activeScreen}
    onSelect={(id) => setActiveScreen(id as Screen)}
  />
)}
```

**Step 6: Update screen rendering**

In the `renderScreen` function, the `guild` case already exists. Add the `friends` case:

```typescript
case 'friends':
  return <FriendsScreen playerId={player?.id ?? null} onTurnsChanged={() => void loadTurnsAndHp()} />;
```

**Step 7: Add mail unread count + friend request count state**

Add state for tracking friend request count and mail unread count alongside existing `pvpNotificationCount`:

```typescript
const [incomingFriendRequestCount, setIncomingFriendRequestCount] = useState(0);
const [mailUnreadCount, setMailUnreadCount] = useState(0);
```

Load them in the same pattern as PvP notification counts.

**Step 8: Build to verify**

```bash
npm run build:web
```

Expected: Compiles (FriendsScreen not yet created — may need a placeholder import).

**Step 9: Commit**

```bash
git add apps/web/src/components/BottomNav.tsx apps/web/src/app/game/
git commit -m "feat(web): convert Guild nav to Social hub with Friends sub-tab"
```

---

## Task 11: Friends Screen Component

**Files:**
- Create: `apps/web/src/components/screens/FriendsScreen.tsx`

**Reference:** `apps/web/src/components/screens/GuildScreen.tsx` for screen structure pattern.

**Step 1: Create FriendsScreen**

The FriendsScreen has 4 sub-views: friends list, incoming requests, outgoing requests, blocked. Plus an "Add Friend" section at the top.

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getFriendsList,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  searchPlayerByUsername,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getBlockList,
  unblockPlayer,
  getFriendProfile,
} from '@/lib/api';
import type { FriendListEntry, FriendRequest, BlockedPlayer, FriendProfile } from '@pocketrealm/shared';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { FRIEND_CONSTANTS } from '@pocketrealm/shared';

interface FriendsScreenProps {
  playerId: string | null;
  onTurnsChanged: () => void;
  onFriendRequestCountChanged?: () => void;
}

type FriendsView = 'list' | 'incoming' | 'outgoing' | 'blocked';
```

Build out the full component with:
- State management for friends, requests, blocks, loading, error
- Add friend by username search (input + button)
- Friends list sorted online-first, each with a "View Profile" button
- Incoming requests with accept/decline buttons
- Outgoing requests with cancel button (using `declineFriendRequest` on the sender side — the route handles this since the decline endpoint uses `findFirst` with receiverId)
- Blocked list with unblock buttons
- Friend profile modal (separate component or inline)
- Spar button on profile modal
- Send mail button on profile modal

**Step 2: Build to verify**

```bash
npm run build:web
```

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/FriendsScreen.tsx
git commit -m "feat(web): add FriendsScreen component"
```

---

## Task 12: Friend Profile Modal

**Files:**
- Create: `apps/web/src/components/friends/FriendProfileModal.tsx`

**Reference:** `apps/web/src/components/common/ConfirmModal.tsx` for modal pattern.

**Step 1: Create FriendProfileModal**

Shows: username, level, 11 equipment slots (name + rarity colored), online indicator. Action buttons: Spar (200 turns), Send Mail, Unfriend, Block.

Uses `ModalOverlay` as the base. Fetches profile data via `getFriendProfile(friendshipId)`.

Equipment slots rendered as a simple list with rarity-colored item names (using existing `RARITY_COLORS` from `@/lib/rarity`).

**Step 2: Build to verify**

```bash
npm run build:web
```

**Step 3: Commit**

```bash
git add apps/web/src/components/friends/FriendProfileModal.tsx
git commit -m "feat(web): add FriendProfileModal component"
```

---

## Task 13: Mail Screen Component

**Files:**
- Create: `apps/web/src/components/screens/MailScreen.tsx`

**Reference:** `apps/web/src/components/screens/GuildScreen.tsx` for screen layout pattern.

**Step 1: Create MailScreen**

Sub-views: inbox, sent, compose, read.

- **Inbox**: list of mails, unread in bold, click to read. Paginated.
- **Sent**: same layout, paginated.
- **Compose**: recipient ID (pre-filled if opened from friend profile), subject input, body textarea, gold cost display, send button.
- **Read**: full message display, reply button (opens compose pre-filled), delete button.

System mails shown with a distinct visual indicator (different icon or label).

**Step 2: Integrate into page.tsx**

Add a mail icon button in the header area of `page.tsx`. When clicked, open MailScreen as a modal overlay or navigate to a dedicated screen.

Decision: Since mail needs its own full-screen view with inbox/sent/compose/read — add it as a new Screen type `'mail'` accessible via a header icon. Add to the Screen union type and renderScreen switch.

The mail icon shows a badge with `mailUnreadCount`.

**Step 3: Build to verify**

```bash
npm run build:web
```

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/MailScreen.tsx apps/web/src/app/game/page.tsx
git commit -m "feat(web): add MailScreen with inbox, sent, compose, read views"
```

---

## Task 14: Spar Combat Playback Integration

**Files:**
- Modify: `apps/web/src/components/screens/FriendsScreen.tsx`
- Modify: `apps/web/src/components/friends/FriendProfileModal.tsx`

**Reference:** `apps/web/src/app/game/screens/ArenaScreen.tsx` for how PvP combat playback works (CombatPlayback component, state management).

**Step 1: Wire spar button to combat**

In FriendProfileModal, the "Spar" button should:
1. Show confirmation with "200 turns" cost
2. Call `sparFriend(friendshipId)`
3. On success, pass combat result back to FriendsScreen
4. FriendsScreen shows CombatPlayback overlay (reuse existing `CombatPlayback` component)

Follow the exact pattern from ArenaScreen: `lastResult` state → `pvpPlaybackActive` → render `CombatPlayback` when active.

**Step 2: Build and test manually**

```bash
npm run build:web
```

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/FriendsScreen.tsx apps/web/src/components/friends/
git commit -m "feat(web): wire spar combat playback to friends screen"
```

---

## Task 15: Integration Testing & Polish

**Step 1: Run all existing tests**

```bash
npm run test
```

Fix any failures introduced by the new code.

**Step 2: Manual testing checklist**

Start local dev (`npm run dev`) and test:

- [ ] Send friend request by searching username
- [ ] Receive friend request on another account, accept it
- [ ] Both players see each other in friends list
- [ ] View friend's profile (level + equipment)
- [ ] Send mail to friend (25 gold deducted)
- [ ] Receive mail in inbox, read it, reply
- [ ] Delete mail from inbox
- [ ] Spar a friend (200 turns, combat playback, system mail sent)
- [ ] Unfriend removes from both lists
- [ ] Block a player → auto-unfriends, can't send requests/mail/spar
- [ ] Unblock restores ability to send requests
- [ ] Friend request cap (50 friends) enforced
- [ ] Pending request cap (20) enforced
- [ ] Mail gold cost shown correctly, insufficient gold rejected
- [ ] Online status indicator works for connected friends
- [ ] Social tab shows Guild and Friends sub-tabs
- [ ] Mail icon in header shows unread badge

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete friends system — friends, mail, spar, blocking"
```
