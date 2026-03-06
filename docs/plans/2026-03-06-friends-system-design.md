# Friends System Design

## Overview

Social system adding mutual friendships, friend profiles, friendly sparring, text mail (gold sink), and player blocking. Accessed via a new "Social" hub that replaces the Guild nav icon, grouping Guild + Friends under one roof.

## Data Models

### Friendship

Single row per relationship. `senderId` tracks who initiated.

```
Friendship {
  id          String   @id @default(uuid())
  senderId    String   FK → Player
  receiverId  String   FK → Player
  status      String   @default("pending")  // "pending" | "accepted"
  createdAt   DateTime
  acceptedAt  DateTime?

  @@unique([senderId, receiverId])
  @@index([receiverId, status])
  @@index([senderId, status])
}
```

### PlayerBlock

Separate table — checked across friend requests, mail, and spar.

```
PlayerBlock {
  id         String   @id @default(uuid())
  blockerId  String   FK → Player
  blockedId  String   FK → Player
  createdAt  DateTime

  @@unique([blockerId, blockedId])
  @@index([blockerId])
}
```

### FriendMail

Soft-delete per side. System mails (spar notifications) use `isSystem: true` and skip gold cost.

```
FriendMail {
  id                    String   @id @default(uuid())
  senderId              String   FK → Player
  recipientId           String   FK → Player
  subject               String   (max 100)
  body                  String   (max 1000)
  goldCost              Int
  isSystem              Boolean  @default(false)
  isRead                Boolean  @default(false)
  isDeletedBySender     Boolean  @default(false)
  isDeletedByRecipient  Boolean  @default(false)
  createdAt             DateTime

  @@index([recipientId, isDeletedByRecipient, isRead])
  @@index([senderId, isDeletedBySender])
}
```

## Constants

```ts
FRIEND_CONSTANTS = {
  MAX_FRIENDS: 50,
  MAX_PENDING_REQUESTS: 20,
  REQUEST_COOLDOWN_SECONDS: 60,   // after decline, can't re-request for 60s
}

SPAR_CONSTANTS = {
  TURN_COST: 200,                 // attacker only, no ELO, no cooldown, no rewards
}

MAIL_CONSTANTS = {
  GOLD_COST: 25,                  // per player-sent message (gold sink)
  MAX_SUBJECT_LENGTH: 100,
  MAX_BODY_LENGTH: 1000,
  MAX_INBOX_SIZE: 100,
  MAX_SENT_SIZE: 50,
}
```

## API Endpoints

All require `authenticate` middleware. Prefixed `/api/v1/`.

### Friends (`/friends`)

```
POST   /friends/request                  // { targetId }
GET    /friends                          // list accepted friends
GET    /friends/requests/incoming        // pending received
GET    /friends/requests/outgoing        // pending sent
POST   /friends/requests/:id/accept
POST   /friends/requests/:id/decline
DELETE /friends/:id                      // unfriend
GET    /friends/:id/profile              // level + equipment
POST   /friends/:id/spar                 // friendly PvP
```

### Block (`/friends/block`)

```
POST   /friends/block                    // { targetId }
DELETE /friends/block/:id                // unblock
GET    /friends/block                    // list blocked
```

### Mail (`/friends/mail`)

```
POST   /friends/mail                     // { recipientId, subject, body }
GET    /friends/mail/inbox               // paginated
GET    /friends/mail/sent                // paginated
GET    /friends/mail/unread-count        // badge count
GET    /friends/mail/:id                 // read (marks as read)
DELETE /friends/mail/:id                 // soft-delete from your view
```

## Business Rules

### Friends
- Mutual: sender requests, receiver accepts/declines
- 50-friend cap per player, 20 max pending outgoing requests
- 60s cooldown after declining before same pair can re-request
- Both players can unfriend unilaterally (deletes the row)

### Blocking
- Blocking auto-unfriends if currently friends
- Blocking auto-declines any pending request from that player
- Blocked players cannot: send friend requests, send mail, send spar challenges
- One-directional check (blocker's list only)

### Spar
- Must be accepted friends
- 200 turn cost (attacker pays, defender pays nothing)
- Uses existing `runCombat()` — full combat resolution
- No ELO change, no cooldown, no loot, no XP
- Result returned to attacker for combat playback (ephemeral, not persisted)
- System mail auto-sent to defender: "{Attacker} just beat you in a friendly spar! They ended on {hp} HP." or "{Attacker} lost to you in a friendly spar! You showed them who's boss."

### Mail
- 25 gold per player-sent message (deducted on send)
- System mails (spar results) are free
- Soft-delete per side — mail truly gone when both sides delete
- 100 inbox cap, 50 sent cap (oldest auto-pruned on insert)
- Must be accepted friends to send mail (system mails bypass this)

## Service Architecture

| File | Responsibility |
|---|---|
| `friendService.ts` | Request/accept/decline/unfriend, list friends, friend profile |
| `blockService.ts` | Block/unblock/list, `isBlocked(a, b)` utility |
| `friendMailService.ts` | Send/inbox/sent/read/delete, unread count, system mail |
| `sparService.ts` | Validate friendship, deduct turns, run combat, send result mail |

### Cross-cutting
- `blockService.isBlocked(playerA, playerB)` called by friendService, friendMailService, sparService
- Online status: in-memory `Set<playerId>` from existing Socket.IO connections, cross-referenced when listing friends

## Frontend

### Navigation Change
- Bottom nav "Guild" icon → "Social" icon
- Social screen has two tabs: **Guild** (existing UI unchanged) and **Friends**
- Mail gets its own icon in the top header bar (envelope + unread badge)

### Friends Tab
- **Add friend**: username search input at top
- **Friends list**: online first, then offline. Name, level, online indicator. Click → profile modal
- **Requests tab**: incoming (accept/decline) + outgoing (cancel)
- **Blocked tab**: list with unblock button

### Friend Profile Modal
- Character level, equipped items (name + rarity)
- Online status indicator
- "Spar" button, "Send Mail" button, "Unfriend" button, "Block" button

### Mail Screen (from header icon)
- **Inbox**: unread bold, sender, subject preview, timestamp
- **Sent**: same layout
- **Compose**: recipient (auto-fill from friend profile), subject, body, "25 gold" cost shown
- **Read view**: full message + reply button

### Spar Flow
1. Click "Spar" on friend profile → confirmation dialog showing 200 turn cost
2. Combat resolves → attacker sees combat playback (reuse `CombatScreen`)
3. Defender receives system mail with outcome

### API Client
New file: `apps/web/src/lib/api/friends.ts` following existing pattern in `social.ts`
