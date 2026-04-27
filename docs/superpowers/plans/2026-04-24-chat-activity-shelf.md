# Chat Activity Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a structured chat activity system with a compact global activity shelf, inline zone activity, and NPC comments that react once to recent relevant activity.

**Architecture:** Persist chat display through existing `chat_messages`, and persist structured activity metadata in `chat_activities` for querying and NPC reactions. Use a new API service as the only activity formatting/broadcasting boundary, then keep frontend rendering changes focused in `useChat`, `ChatPanel`, and `NpcDialogueBanner`.

**Tech Stack:** Next.js 16, Express 4, Prisma 6/PostgreSQL, Redis, Socket.IO, Zod, Vitest, React Testing Library.

---

## Scope Check

The spec touches schema, backend services, frontend chat UI, NPC dialogue, and gameplay emitters. These are coupled by one feature boundary: activity events. The plan keeps each task independently testable and commits at the boundary where the codebase remains buildable.

## File Structure

- `packages/database/prisma/schema.prisma` owns the `ChatActivity` and `PlayerNpcActivityReaction` models.
- `apps/api/src/__mocks__/database.ts` exposes mock Prisma models for service tests.
- `packages/shared/src/types/chat.types.ts` owns serializable chat activity event types and API response contracts.
- `packages/shared/src/constants/gameConstants.ts` owns tunable activity thresholds and cooldowns.
- `packages/shared/src/constants/chatActivity.ts` owns event formatting, rarity helpers, and NPC reaction rules.
- `apps/api/src/services/systemMessageService.ts` continues to persist and emit chat system messages, but returns the saved row.
- `apps/api/src/services/chatActivityService.ts` is the backend boundary for activity broadcasts and NPC reaction selection.
- `apps/api/src/routes/chat.ts` exposes history and NPC reaction endpoints.
- `apps/web/src/lib/api/social.ts` exposes the NPC reaction API client.
- `apps/web/src/hooks/useNpcActivityReaction.ts` fetches one NPC reaction line for a banner.
- `apps/web/src/components/common/NpcDialogueBanner.tsx` renders activity priority lines.
- `apps/web/src/hooks/useChat.ts` splits world player messages from global activity messages.
- `apps/web/src/components/ChatPanel.tsx` renders the activity shelf and improved tab accessibility.
- Gameplay emitters are added to `combat/start.ts`, `explorationOutcome/ambush.ts`, `explorationOutcomeService.ts`, `crafting/craft.ts`, `achievementService.ts`, and `bossEncounter/resolution.ts`.

---

### Task 1: Add Activity Schema And Prisma Test Mocks

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `apps/api/src/__mocks__/database.ts`
- Generate: one new directory under `packages/database/prisma/migrations/` from `prisma migrate dev --name add_chat_activity`

- [ ] **Step 1: Add Prisma models**

In `packages/database/prisma/schema.prisma`, add these models after `ChatMessage`:

```prisma
model ChatActivity {
  id            String    @id @default(uuid())
  chatMessageId String?   @unique @map("chat_message_id")
  eventType     String    @map("event_type") @db.VarChar(32)
  scope         String    @db.VarChar(16)
  zoneId        String?   @map("zone_id")
  actorPlayerId String?   @map("actor_player_id")
  actorUsername String?   @map("actor_username") @db.VarChar(32)
  subjectName   String?   @map("subject_name") @db.VarChar(96)
  subjectRarity String?   @map("subject_rarity") @db.VarChar(16)
  message       String    @db.VarChar(200)
  metadata      Json      @default("{}")
  expiresAt     DateTime? @map("expires_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  @@index([scope, createdAt])
  @@index([zoneId, createdAt])
  @@index([eventType, createdAt])
  @@map("chat_activities")
}

model PlayerNpcActivityReaction {
  playerId   String   @map("player_id")
  npcKey     String   @map("npc_key") @db.VarChar(64)
  activityId String   @map("activity_id")
  reactedAt  DateTime @default(now()) @map("reacted_at")

  @@id([playerId, npcKey, activityId])
  @@index([playerId, npcKey, reactedAt])
  @@map("player_npc_activity_reactions")
}
```

- [ ] **Step 2: Add Prisma mock models**

In `apps/api/src/__mocks__/database.ts`, add these fields beside `chatMessage`:

```typescript
  chatActivity: mockModel(),
  playerNpcActivityReaction: mockModel(),
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:migrate -- --name add_chat_activity`

Expected: Prisma creates a migration and regenerates the client without errors.

- [ ] **Step 4: Build database package**

Run: `npm run build -w packages/database`

Expected: `prisma generate` and `tsc` complete without errors.

- [ ] **Step 5: Commit**

```powershell
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations apps/api/src/__mocks__/database.ts
git commit -m "feat(chat): add structured activity persistence"
```

---

### Task 2: Add Shared Activity Contracts And NPC Reaction Rules

**Files:**
- Modify: `packages/shared/src/types/chat.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Create: `packages/shared/src/constants/chatActivity.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/constants/__tests__/chatActivity.test.ts`

- [ ] **Step 1: Write shared tests first**

Create `packages/shared/src/constants/__tests__/chatActivity.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  CHAT_ACTIVITY_EVENT_TYPES,
  formatChatActivityMessage,
  getNpcActivityReactionLine,
  getNpcActivityRelevance,
  isRarityAtLeast,
} from '../chatActivity';
import type { ChatActivityRecord } from '../../types/chat.types';

const craftActivity: ChatActivityRecord = {
  id: 'activity-1',
  eventType: 'craft_crit',
  scope: 'zone',
  zoneId: 'zone-1',
  actorPlayerId: 'player-1',
  actorUsername: 'Kael',
  subjectName: 'Steel Greatsword',
  subjectRarity: 'epic',
  message: 'Kael crafted an Epic Steel Greatsword.',
  metadata: { skillType: 'weaponsmithing' },
  createdAt: '2026-04-24T10:00:00.000Z',
};

describe('chatActivity constants', () => {
  it('declares the first-pass activity event types', () => {
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('rare_loot');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('craft_crit');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('zone_discovery');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('achievement');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('boss_defeat');
    expect(CHAT_ACTIVITY_EVENT_TYPES).toContain('server_milestone');
  });

  it('compares rarity using game rarity order', () => {
    expect(isRarityAtLeast('epic', 'rare')).toBe(true);
    expect(isRarityAtLeast('uncommon', 'rare')).toBe(false);
  });

  it('formats craft activity messages', () => {
    expect(formatChatActivityMessage('craft_crit', craftActivity)).toBe('Kael crafted an Epic Steel Greatsword.');
  });

  it('marks Kessa variants relevant to weaponsmithing craft activity', () => {
    const relevance = getNpcActivityRelevance('kessa-weaponsmithing', craftActivity);
    expect(relevance).toEqual({ relevant: true, preferOwn: true });
  });

  it('formats an NPC activity reaction line', () => {
    const line = getNpcActivityReactionLine('kessa-weaponsmithing', craftActivity);
    expect(line).toContain('Epic Steel Greatsword');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w packages/shared -- --run chatActivity`

Expected: FAIL because `../chatActivity` does not exist.

- [ ] **Step 3: Add shared types**

In `packages/shared/src/types/chat.types.ts`, add:

```typescript
export const CHAT_ACTIVITY_SCOPES = ['zone', 'global'] as const;
export type ChatActivityScope = (typeof CHAT_ACTIVITY_SCOPES)[number];

export const CHAT_ACTIVITY_EVENT_TYPES = [
  'rare_loot',
  'craft_crit',
  'zone_discovery',
  'achievement',
  'boss_defeat',
  'server_milestone',
] as const;
export type ChatActivityEventType = (typeof CHAT_ACTIVITY_EVENT_TYPES)[number];

export interface ChatActivityRecord {
  id: string;
  eventType: ChatActivityEventType;
  scope: ChatActivityScope;
  zoneId: string | null;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ChatNpcActivityReactionResponse {
  reaction: {
    activityId: string;
    eventType: ChatActivityEventType;
    line: string;
  } | null;
}
```

- [ ] **Step 4: Add tunable constants**

In `packages/shared/src/constants/gameConstants.ts`, add this near `NPC_DIALOGUE_CONSTANTS`:

```typescript
export const CHAT_ACTIVITY_CONSTANTS = {
  VISIBLE_GLOBAL_ACTIVITY_COUNT: 3,
  NPC_REACTION_LOOKBACK_HOURS: 48,
  COOLDOWN_PER_PLAYER_EVENT_MS: 60_000,
  MIN_LOOT_RARITY: 'rare',
  MIN_CRAFT_RARITY: 'rare',
} as const;
```

- [ ] **Step 5: Add `chatActivity.ts`**

Create `packages/shared/src/constants/chatActivity.ts`:

```typescript
import type { NpcKey } from './npcDialogue';
import type { ChatActivityEventType, ChatActivityRecord } from '../types/chat.types';

export { CHAT_ACTIVITY_EVENT_TYPES } from '../types/chat.types';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export function capitalise(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

export function isRarityAtLeast(rarity: string | null | undefined, minRarity: string): boolean {
  if (!rarity) return false;
  return RARITY_ORDER.indexOf(rarity as (typeof RARITY_ORDER)[number]) >= RARITY_ORDER.indexOf(minRarity as (typeof RARITY_ORDER)[number]);
}

export function formatChatActivityMessage(eventType: ChatActivityEventType, activity: Pick<ChatActivityRecord, 'actorUsername' | 'subjectName' | 'subjectRarity' | 'metadata'>): string {
  const actor = activity.actorUsername ?? 'Someone';
  const subject = activity.subjectName ?? 'something noteworthy';
  const rarity = activity.subjectRarity ? `${capitalise(activity.subjectRarity)} ` : '';

  switch (eventType) {
    case 'rare_loot':
      return `${actor} found a ${rarity}${subject}.`;
    case 'craft_crit':
      return `${actor} crafted an ${rarity}${subject}.`.replace(' an Rare ', ' a Rare ').replace(' an Legendary ', ' a Legendary ');
    case 'zone_discovery':
      return `${actor} discovered a passage to the ${subject}.`;
    case 'achievement':
      return `${actor} earned the achievement ${subject}.`;
    case 'boss_defeat':
      return `${subject} has been defeated.`;
    case 'server_milestone':
      return subject;
  }
}

export interface NpcActivityRelevance {
  relevant: boolean;
  preferOwn: boolean;
}

export function getNpcActivityRelevance(npcKey: NpcKey, activity: ChatActivityRecord): NpcActivityRelevance {
  const skillType = typeof activity.metadata.skillType === 'string' ? activity.metadata.skillType : null;

  if (activity.eventType === 'craft_crit') {
    if (npcKey.startsWith('kessa-') || npcKey === 'millbrook-blacksmith' || npcKey.startsWith('thornwall-blacksmith')) {
      return { relevant: ['weaponsmithing', 'armorsmithing', 'refining'].includes(skillType ?? ''), preferOwn: true };
    }
    if (npcKey.includes('artisan')) {
      return { relevant: ['leatherworking', 'tailoring', 'weaving', 'tanning'].includes(skillType ?? ''), preferOwn: true };
    }
    if (npcKey.includes('jeweller')) {
      return { relevant: skillType === 'jewelcrafting', preferOwn: true };
    }
    if (npcKey.includes('herbalist')) {
      return { relevant: skillType === 'alchemy', preferOwn: true };
    }
  }

  if (activity.eventType === 'rare_loot' && npcKey === 'millbrook-general-store') {
    return { relevant: true, preferOwn: true };
  }

  if ((activity.eventType === 'boss_defeat' || activity.eventType === 'zone_discovery') && npcKey === 'town-guard') {
    return { relevant: true, preferOwn: false };
  }

  if ((activity.eventType === 'achievement' || activity.eventType === 'server_milestone') && npcKey === 'millbrook-quest-board') {
    return { relevant: true, preferOwn: false };
  }

  return { relevant: false, preferOwn: false };
}

export function getNpcActivityReactionLine(npcKey: NpcKey, activity: ChatActivityRecord): string | null {
  const rarity = activity.subjectRarity ? `${capitalise(activity.subjectRarity)} ` : '';
  const subject = `${rarity}${activity.subjectName ?? 'work'}`;

  if (activity.eventType === 'craft_crit' && (npcKey.startsWith('kessa-') || npcKey === 'millbrook-blacksmith')) {
    return `${subject}, was it? Good. Means somebody was listening at the anvil.`;
  }
  if (activity.eventType === 'craft_crit' && npcKey.includes('artisan')) {
    return `${subject}. Clean work gets noticed faster than loud work.`;
  }
  if (activity.eventType === 'craft_crit' && npcKey.includes('jeweller')) {
    return `${subject}. Good stones deserve careful hands, and careful hands deserve witnesses.`;
  }
  if (activity.eventType === 'rare_loot' && npcKey === 'millbrook-general-store') {
    return `${subject} from the wilds? Put it somewhere dry before it becomes my problem.`;
  }
  if (activity.eventType === 'boss_defeat' && npcKey === 'town-guard') {
    return `${activity.subjectName ?? 'That boss'} falling will make tonight's watch easier. For once.`;
  }
  if (activity.eventType === 'zone_discovery' && npcKey === 'town-guard') {
    return `A new path to ${activity.subjectName ?? 'the wilds'} means new patrol routes. Naturally.`;
  }
  if (activity.eventType === 'achievement' && npcKey === 'millbrook-quest-board') {
    return `${activity.actorUsername ?? 'Someone'} earned ${activity.subjectName ?? 'a new mark'}? Good. I will update the ledger.`;
  }
  if (activity.eventType === 'server_milestone' && npcKey === 'millbrook-quest-board') {
    return activity.subjectName ?? activity.message;
  }
  return null;
}
```

- [ ] **Step 6: Export shared constants**

In `packages/shared/src/index.ts`, add:

```typescript
export * from './constants/chatActivity';
```

- [ ] **Step 7: Run shared tests**

Run: `npm run test -w packages/shared -- --run chatActivity`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add packages/shared/src/types/chat.types.ts packages/shared/src/constants/gameConstants.ts packages/shared/src/constants/chatActivity.ts packages/shared/src/constants/__tests__/chatActivity.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add chat activity contracts"
```

---

### Task 3: Return Saved System Message Rows

**Files:**
- Modify: `apps/api/src/services/systemMessageService.ts`
- Test: `apps/api/src/services/systemMessageService.test.ts`

- [ ] **Step 1: Update existing tests first**

In `apps/api/src/services/systemMessageService.test.ts`, add this assertion to the first test after the call:

```typescript
const result = await emitSystemMessage(null, 'world', 'world', 'Hello world');
expect(result).toEqual({
  id: 'msg-1',
  createdAt: new Date('2026-02-04T12:00:00Z'),
});
```

Replace the existing `await emitSystemMessage(null, 'world', 'world', 'Hello world');` call in that test with the `const result = await emitSystemMessage(null, 'world', 'world', 'Hello world');` line above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- --run systemMessageService`

Expected: FAIL because `emitSystemMessage` currently returns `undefined`.

- [ ] **Step 3: Return the saved row**

In `apps/api/src/services/systemMessageService.ts`, change the signature and ending:

```typescript
export async function emitSystemMessage(
  io: SocketServer | null,
  channelType: ChatChannelType,
  channelId: string,
  message: string,
): Promise<{ id: string; createdAt: Date }> {
  const row = await saveMessage({
    channelType,
    channelId,
    playerId: SYSTEM_PLAYER_ID,
    username: SYSTEM_USERNAME,
    message,
    messageType: 'system',
  });

  if (!io) return row;

  const event: ChatMessageEvent = {
    id: row.id,
    channelType,
    channelId,
    playerId: SYSTEM_PLAYER_ID,
    username: SYSTEM_USERNAME,
    message,
    messageType: 'system',
    createdAt: row.createdAt.toISOString(),
  };

  const room = `chat:${channelId}`;
  io.to(room).emit('chat:message', event);
  return row;
}
```

- [ ] **Step 4: Run test**

Run: `npm run test:api -- --run systemMessageService`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/services/systemMessageService.ts apps/api/src/services/systemMessageService.test.ts
git commit -m "refactor(chat): return saved system messages"
```

---

### Task 4: Build Chat Activity Service

**Files:**
- Create: `apps/api/src/services/chatActivityService.ts`
- Test: `apps/api/src/services/chatActivityService.test.ts`

- [ ] **Step 1: Write service tests first**

Create `apps/api/src/services/chatActivityService.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: { set: vi.fn() },
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
}));

vi.mock('./systemMessageService', () => ({
  emitSystemMessage: vi.fn(),
}));

import { redis } from '../redis';
import { mockPrisma } from '../__test__/setup';
import { emitSystemMessage } from './systemMessageService';
import {
  broadcastCraftActivity,
  broadcastRareLootActivity,
  getNpcActivityReaction,
} from './chatActivityService';

const mockRedis = redis as unknown as { set: ReturnType<typeof vi.fn> };
const mockEmitSystemMessage = emitSystemMessage as ReturnType<typeof vi.fn>;

describe('chatActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockEmitSystemMessage.mockResolvedValue({
      id: 'chat-1',
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    });
  });

  it('broadcasts and persists rare loot activity', async () => {
    await broadcastRareLootActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Mira',
      loot: [{ itemTemplateId: 'item-1', quantity: 1, rarity: 'rare', itemName: 'Willow Bark' }],
    });

    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      expect.anything(),
      'zone',
      'zone:zone-1',
      'Mira found a Rare Willow Bark.',
    );
    expect(mockPrisma.chatActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chatMessageId: 'chat-1',
        eventType: 'rare_loot',
        scope: 'zone',
        zoneId: 'zone-1',
        actorPlayerId: 'player-1',
        actorUsername: 'Mira',
        subjectName: 'Willow Bark',
        subjectRarity: 'rare',
      }),
    });
  });

  it('skips loot below rarity threshold', async () => {
    await broadcastRareLootActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Mira',
      loot: [{ itemTemplateId: 'item-1', quantity: 1, rarity: 'uncommon', itemName: 'Willow Bark' }],
    });

    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
    expect(mockPrisma.chatActivity.create).not.toHaveBeenCalled();
  });

  it('broadcasts craft activity with skill metadata', async () => {
    await broadcastCraftActivity({
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      itemName: 'Steel Greatsword',
      rarity: 'epic',
      skillType: 'weaponsmithing',
    });

    expect(mockPrisma.chatActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'craft_crit',
        metadata: { skillType: 'weaponsmithing' },
      }),
    });
  });

  it('returns and marks one NPC activity reaction', async () => {
    const activity = {
      id: 'activity-1',
      eventType: 'craft_crit',
      scope: 'zone',
      zoneId: 'zone-1',
      actorPlayerId: 'player-1',
      actorUsername: 'Kael',
      subjectName: 'Steel Greatsword',
      subjectRarity: 'epic',
      message: 'Kael crafted an Epic Steel Greatsword.',
      metadata: { skillType: 'weaponsmithing' },
      createdAt: new Date('2026-04-24T10:00:00.000Z'),
    };
    mockPrisma.chatActivity.findMany.mockResolvedValue([activity]);
    mockPrisma.playerNpcActivityReaction.findMany.mockResolvedValue([]);

    const result = await getNpcActivityReaction('player-1', 'kessa-weaponsmithing');

    expect(result?.activityId).toBe('activity-1');
    expect(result?.line).toContain('Epic Steel Greatsword');
    expect(mockPrisma.playerNpcActivityReaction.create).toHaveBeenCalledWith({
      data: { playerId: 'player-1', npcKey: 'kessa-weaponsmithing', activityId: 'activity-1' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- --run chatActivityService`

Expected: FAIL because `chatActivityService.ts` does not exist.

- [ ] **Step 3: Implement service**

Create `apps/api/src/services/chatActivityService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import {
  CHAT_ACTIVITY_CONSTANTS,
  formatChatActivityMessage,
  getNpcActivityReactionLine,
  getNpcActivityRelevance,
  isRarityAtLeast,
  type ChatActivityEventType,
  type ChatActivityRecord,
  type ChatNpcActivityReactionResponse,
  type NpcKey,
} from '@pocketrealm/shared';
import { redis } from '../redis';
import { getIo } from '../socket';
import { emitSystemMessage } from './systemMessageService';

interface LootActivityItem {
  itemTemplateId: string;
  quantity: number;
  rarity?: string | null;
  itemName?: string | null;
}

interface BaseActivityInput {
  zoneId: string;
  actorPlayerId: string | null;
  actorUsername: string | null;
}

function toRecord(row: {
  id: string;
  eventType: string;
  scope: string;
  zoneId: string | null;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  message: string;
  metadata: unknown;
  createdAt: Date;
}): ChatActivityRecord {
  return {
    id: row.id,
    eventType: row.eventType as ChatActivityEventType,
    scope: row.scope === 'global' ? 'global' : 'zone',
    zoneId: row.zoneId,
    actorPlayerId: row.actorPlayerId,
    actorUsername: row.actorUsername,
    subjectName: row.subjectName,
    subjectRarity: row.subjectRarity,
    message: row.message,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: row.createdAt.toISOString(),
  };
}

function pickBestItem(items: LootActivityItem[], minRarity: string): LootActivityItem | null {
  return items
    .filter((item) => isRarityAtLeast(item.rarity, minRarity) && item.itemName)
    .sort((a, b) => {
      const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      return order.indexOf(b.rarity ?? 'common') - order.indexOf(a.rarity ?? 'common');
    })[0] ?? null;
}

async function checkCooldown(actorPlayerId: string | null, eventType: ChatActivityEventType): Promise<boolean> {
  if (!actorPlayerId) return true;
  const key = `chat_activity:${actorPlayerId}:${eventType}`;
  const result = await redis.set(key, '1', 'PX', CHAT_ACTIVITY_CONSTANTS.COOLDOWN_PER_PLAYER_EVENT_MS, 'NX');
  return result === 'OK';
}

async function persistActivity(params: {
  eventType: ChatActivityEventType;
  scope: 'zone' | 'global';
  zoneId: string | null;
  actorPlayerId: string | null;
  actorUsername: string | null;
  subjectName: string | null;
  subjectRarity: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!(await checkCooldown(params.actorPlayerId, params.eventType))) return;

  const message = formatChatActivityMessage(params.eventType, {
    id: 'preview',
    eventType: params.eventType,
    scope: params.scope,
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.subjectName,
    subjectRarity: params.subjectRarity,
    message: '',
    metadata: params.metadata ?? {},
    createdAt: new Date().toISOString(),
  });

  const channelType = params.scope === 'global' ? 'world' : 'zone';
  const channelId = params.scope === 'global' ? 'world' : `zone:${params.zoneId}`;
  const row = await emitSystemMessage(getIo(), channelType, channelId, message);

  await prisma.chatActivity.create({
    data: {
      chatMessageId: row.id,
      eventType: params.eventType,
      scope: params.scope,
      zoneId: params.zoneId,
      actorPlayerId: params.actorPlayerId,
      actorUsername: params.actorUsername,
      subjectName: params.subjectName,
      subjectRarity: params.subjectRarity,
      message,
      metadata: params.metadata ?? {},
      expiresAt: new Date(Date.now() + CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_LOOKBACK_HOURS * 60 * 60 * 1000),
    },
  });
}

export async function broadcastRareLootActivity(params: BaseActivityInput & { loot: LootActivityItem[] }): Promise<void> {
  const bestItem = pickBestItem(params.loot, CHAT_ACTIVITY_CONSTANTS.MIN_LOOT_RARITY);
  if (!bestItem?.itemName) return;

  await persistActivity({
    eventType: 'rare_loot',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: bestItem.itemName,
    subjectRarity: bestItem.rarity ?? null,
    metadata: { itemTemplateId: bestItem.itemTemplateId, quantity: bestItem.quantity },
  });
}

export async function broadcastCraftActivity(params: BaseActivityInput & { itemName: string; rarity: string; skillType: string }): Promise<void> {
  if (!isRarityAtLeast(params.rarity, CHAT_ACTIVITY_CONSTANTS.MIN_CRAFT_RARITY)) return;

  await persistActivity({
    eventType: 'craft_crit',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.itemName,
    subjectRarity: params.rarity,
    metadata: { skillType: params.skillType },
  });
}

export async function broadcastZoneDiscoveryActivity(params: BaseActivityInput & { discoveredZoneName: string }): Promise<void> {
  await persistActivity({
    eventType: 'zone_discovery',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.discoveredZoneName,
    subjectRarity: null,
  });
}

export async function broadcastAchievementActivity(params: BaseActivityInput & { achievementTitle: string }): Promise<void> {
  await persistActivity({
    eventType: 'achievement',
    scope: 'zone',
    zoneId: params.zoneId,
    actorPlayerId: params.actorPlayerId,
    actorUsername: params.actorUsername,
    subjectName: params.achievementTitle,
    subjectRarity: null,
  });
}

export async function broadcastBossDefeatActivity(params: { zoneId: string | null; zoneName: string; bossName: string; killerName: string | null }): Promise<void> {
  await persistActivity({
    eventType: 'boss_defeat',
    scope: 'global',
    zoneId: params.zoneId,
    actorPlayerId: null,
    actorUsername: params.killerName,
    subjectName: `${params.bossName} in ${params.zoneName}`,
    subjectRarity: null,
  });
  if (params.zoneId) {
    await persistActivity({
      eventType: 'boss_defeat',
      scope: 'zone',
      zoneId: params.zoneId,
      actorPlayerId: null,
      actorUsername: params.killerName,
      subjectName: params.bossName,
      subjectRarity: null,
    });
  }
}

export async function getNpcActivityReaction(playerId: string, npcKey: NpcKey): Promise<ChatNpcActivityReactionResponse['reaction']> {
  const since = new Date(Date.now() - CHAT_ACTIVITY_CONSTANTS.NPC_REACTION_LOOKBACK_HOURS * 60 * 60 * 1000);
  const seen = await prisma.playerNpcActivityReaction.findMany({
    where: { playerId, npcKey },
    select: { activityId: true },
  });
  const seenIds = new Set(seen.map((row) => row.activityId));

  const rows = await prisma.chatActivity.findMany({
    where: {
      createdAt: { gte: since },
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  for (const row of rows) {
    if (seenIds.has(row.id)) continue;
    const activity = toRecord(row);
    const relevance = getNpcActivityRelevance(npcKey, activity);
    if (!relevance.relevant) continue;
    if (relevance.preferOwn && activity.actorPlayerId !== playerId) continue;

    const line = getNpcActivityReactionLine(npcKey, activity);
    if (!line) continue;

    await prisma.playerNpcActivityReaction.create({
      data: { playerId, npcKey, activityId: activity.id },
    });
    return { activityId: activity.id, eventType: activity.eventType, line };
  }

  return null;
}
```

- [ ] **Step 4: Run service test**

Run: `npm run test:api -- --run chatActivityService`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/services/chatActivityService.ts apps/api/src/services/chatActivityService.test.ts
git commit -m "feat(api): add chat activity service"
```

---

### Task 5: Add NPC Reaction API Route

**Files:**
- Modify: `apps/api/src/routes/chat.ts`
- Test: `apps/api/src/routes/chat.activity.test.ts`

- [ ] **Step 1: Write route test first**

Create `apps/api/src/routes/chat.activity.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../services/chatActivityService', () => ({
  getNpcActivityReaction: vi.fn(),
}));

import { getNpcActivityReaction } from '../services/chatActivityService';

const querySchema = z.object({
  npcKey: z.string().min(1).max(64),
});

describe('chat activity route contract', () => {
  it('accepts a valid NPC key query', () => {
    expect(querySchema.parse({ npcKey: 'kessa-weaponsmithing' })).toEqual({ npcKey: 'kessa-weaponsmithing' });
  });

  it('rejects missing NPC key query', () => {
    expect(() => querySchema.parse({})).toThrow();
  });

  it('service returns nullable reaction shape', async () => {
    vi.mocked(getNpcActivityReaction).mockResolvedValue({
      activityId: 'activity-1',
      eventType: 'craft_crit',
      line: 'Fine work.',
    });

    await expect(getNpcActivityReaction('player-1', 'kessa-weaponsmithing')).resolves.toEqual({
      activityId: 'activity-1',
      eventType: 'craft_crit',
      line: 'Fine work.',
    });
  });
});
```

- [ ] **Step 2: Run route test**

Run: `npm run test:api -- --run chat.activity`

Expected: PASS after the service from Task 4 exists. This test documents the query and response contract before route wiring.

- [ ] **Step 3: Add route handler**

In `apps/api/src/routes/chat.ts`, import `NPC_DIALOGUE`, `type NpcKey`, and `getNpcActivityReaction`:

```typescript
import { NPC_DIALOGUE, type NpcKey } from '@pocketrealm/shared';
import { getNpcActivityReaction } from '../services/chatActivityService';
```

Add this schema near `historyQuerySchema`:

```typescript
const npcReactionQuerySchema = z.object({
  npcKey: z.string().min(1).max(64),
});
```

Add this endpoint after `/history`:

```typescript
chatRouter.get('/activity/npc-reaction', asyncHandler(async (req, res) => {
  const parsed = npcReactionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Invalid query', code: 'VALIDATION_ERROR' } });
    return;
  }

  const { npcKey } = parsed.data;
  if (!NPC_DIALOGUE[npcKey]) {
    res.status(400).json({ error: { message: 'Unknown NPC', code: 'UNKNOWN_NPC' } });
    return;
  }

  const reaction = await getNpcActivityReaction(req.player!.playerId, npcKey as NpcKey);
  res.json({ reaction });
}));
```

- [ ] **Step 4: Run focused API tests**

Run: `npm run test:api -- --run "chat|chatActivity|systemMessage"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/routes/chat.ts apps/api/src/routes/chat.activity.test.ts
git commit -m "feat(api): expose NPC activity reactions"
```

---

### Task 6: Add NPC Reaction Fetching To Dialogue Banners

**Files:**
- Modify: `apps/web/src/lib/api/social.ts`
- Create: `apps/web/src/hooks/useNpcActivityReaction.ts`
- Modify: `apps/web/src/components/common/NpcDialogueBanner.tsx`
- Test: `apps/web/src/components/common/NpcDialogueBanner.test.tsx`

- [ ] **Step 1: Write banner test first**

Create `apps/web/src/components/common/NpcDialogueBanner.test.tsx`:

```typescript
// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NpcDialogueBanner } from './NpcDialogueBanner';

vi.mock('../../lib/npcLineRotation', () => ({
  getNextNpcLine: vi.fn(() => 'Normal line'),
}));

vi.mock('../../hooks/useSessionStorageToggle', () => ({
  useSessionStorageToggle: () => [true, vi.fn()] as const,
}));

vi.mock('../../hooks/useNpcActivityReaction', () => ({
  useNpcActivityReaction: vi.fn(() => null),
}));

afterEach(() => cleanup());

describe('NpcDialogueBanner', () => {
  it('renders an activity priority line before normal rotation', () => {
    render(
      <NpcDialogueBanner
        npcKey="millbrook-blacksmith"
        event="greeting"
        showDialogue
        activityLine="An Epic Steel Greatsword, was it? Good."
      />,
    );

    expect(screen.getByText(/Epic Steel Greatsword/)).toBeTruthy();
    expect(screen.queryByText(/Normal line/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- --run NpcDialogueBanner`

Expected: FAIL because `activityLine` prop and hook do not exist.

- [ ] **Step 3: Add API client**

In `apps/web/src/lib/api/social.ts`, import the response type:

```typescript
import type { ChatNpcActivityReactionResponse, StateUpdates, TitleStyleVariant } from '@pocketrealm/shared';
```

Replace the existing shared import with the combined import above, preserving existing imported types.

Add:

```typescript
export async function getNpcActivityReaction(npcKey: string) {
  return fetchApi<ChatNpcActivityReactionResponse>(
    `/api/v1/chat/activity/npc-reaction?npcKey=${encodeURIComponent(npcKey)}`,
  );
}
```

- [ ] **Step 4: Add hook**

Create `apps/web/src/hooks/useNpcActivityReaction.ts`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import type { NpcKey } from '@pocketrealm/shared';
import { getNpcActivityReaction } from '@/lib/api';

export function useNpcActivityReaction(npcKey: NpcKey, enabled: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLine(null);
      return;
    }

    let cancelled = false;
    getNpcActivityReaction(npcKey).then((res) => {
      if (cancelled) return;
      setLine(res.data?.reaction?.line ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, npcKey]);

  return line;
}
```

- [ ] **Step 5: Wire banner priority line**

In `apps/web/src/components/common/NpcDialogueBanner.tsx`, import the hook:

```typescript
import { useNpcActivityReaction } from '../../hooks/useNpcActivityReaction';
```

Change props and component signature:

```typescript
interface NpcDialogueBannerProps {
  npcKey: NpcKey;
  event: DialogueEvent;
  showDialogue?: boolean;
  activityLine?: string | null;
}

export function NpcDialogueBanner({ npcKey, event, showDialogue = true, activityLine: activityLineOverride }: NpcDialogueBannerProps) {
```

After `expanded`, add:

```typescript
  const fetchedActivityLine = useNpcActivityReaction(npcKey, showDialogue);
  const activityLine = activityLineOverride ?? fetchedActivityLine;
  const displayLine = activityLine ?? line;
```

Update the null guard and rendered text:

```typescript
  if (!showDialogue || !name || !displayLine) return null;
```

```tsx
          &ldquo;{displayLine}&rdquo;
```

- [ ] **Step 6: Run web test**

Run: `npm run test -w apps/web -- --run NpcDialogueBanner`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/api/social.ts apps/web/src/hooks/useNpcActivityReaction.ts apps/web/src/components/common/NpcDialogueBanner.tsx apps/web/src/components/common/NpcDialogueBanner.test.tsx
git commit -m "feat(web): let NPCs react to chat activity"
```

---

### Task 7: Split World Chat From Global Activity Shelf

**Files:**
- Modify: `apps/web/src/hooks/useChat.ts`
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Modify: `apps/web/src/app/game/page.tsx`
- Test: `apps/web/src/components/ChatPanel.test.ts`

- [ ] **Step 1: Write ChatPanel tests first**

In `apps/web/src/components/ChatPanel.test.ts`, add:

```typescript
  it('renders world system messages in the activity shelf, not the main world stream', () => {
    render(
      React.createElement(ChatPanel, {
        isOpen: true,
        toggleChat: vi.fn(),
        activeChannel: 'world',
        setActiveChannel: vi.fn(),
        worldMessages: [
          {
            id: 'm1',
            channelType: 'world',
            channelId: 'world',
            playerId: 'p1',
            username: 'Player',
            message: 'hello',
            createdAt: new Date('2026-04-18T12:00:00.000Z').toISOString(),
          },
        ],
        globalActivityMessages: [
          {
            id: 'a1',
            channelType: 'world',
            channelId: 'world',
            playerId: 'system',
            username: 'System',
            message: 'The Ashen Herald has been defeated.',
            messageType: 'system',
            createdAt: new Date('2026-04-18T12:01:00.000Z').toISOString(),
          },
        ],
        zoneMessages: [],
        casinoMessages: [],
        presence: { worldOnline: 1, zoneOnline: {} },
        unreadWorld: 0,
        unreadZone: 0,
        unreadCasino: 0,
        casinoActive: false,
        sendMessage: vi.fn(),
        rateLimitError: null,
        currentZoneId: null,
        currentZoneName: null,
        playerId: 'p2',
        pinnedMessage: null,
      }),
    );

    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('The Ashen Herald has been defeated.')).toBeTruthy();
    expect(screen.getByLabelText('Chat activity')).toBeTruthy();
  });
```

Update the existing test props to include `globalActivityMessages: []`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- --run ChatPanel`

Expected: FAIL because `globalActivityMessages` is not a prop.

- [ ] **Step 3: Update `useChat` return shape**

In `apps/web/src/hooks/useChat.ts`:

Add state:

```typescript
  const [globalActivityMessages, setGlobalActivityMessages] = useState<ChatMessageEvent[]>([]);
```

Add to `UseChatReturn`:

```typescript
  globalActivityMessages: ChatMessageEvent[];
```

Replace the world branch in `appendMessage`:

```typescript
    if (msg.channelType === 'world') {
      if (msg.messageType === 'system') {
        setGlobalActivityMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
        return;
      }

      setWorldMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'world') {
        setUnreadWorld((n) => n + 1);
      }
    } else if (msg.channelType === 'zone') {
```

In world history load, split messages:

```typescript
          const messages = res.data.messages as ChatMessageEvent[];
          setWorldMessages(messages.filter((msg) => msg.messageType !== 'system'));
          setGlobalActivityMessages(messages.filter((msg) => msg.messageType === 'system'));
```

Return `globalActivityMessages`.

- [ ] **Step 4: Update ChatPanel props and shelf rendering**

In `apps/web/src/components/ChatPanel.tsx`, add prop:

```typescript
  globalActivityMessages: ChatMessageEvent[];
```

Destructure it. Add a derived shelf list:

```typescript
  const visibleGlobalActivity = globalActivityMessages.slice(-3);
```

Add tab roles to the header container and buttons:

```tsx
        <div role="tablist" aria-label="Chat channels" className="flex items-center border-b border-[var(--rpg-border)] px-2 py-1.5 shrink-0">
```

Each tab button should receive `role="tab"` and `aria-selected={activeChannel === 'world'}` with the matching channel expression.

Before the rate limit block, add:

```tsx
        {visibleGlobalActivity.length > 0 && (
          <div
            aria-label="Chat activity"
            className="border-t border-[var(--rpg-border)] bg-[var(--rpg-background)]/40 px-3 py-2 space-y-1 shrink-0"
          >
            {visibleGlobalActivity.map((msg) => (
              <div key={msg.id} className="text-[11px] leading-snug text-[var(--rpg-text-secondary)]">
                <span className="text-[var(--rpg-gold)]">Activity</span>
                <span className="text-[var(--rpg-text-secondary)]">: </span>
                <span>{msg.message}</span>
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 5: Pass prop from game page**

In `apps/web/src/app/game/page.tsx`, add to `<ChatPanel>`:

```tsx
        globalActivityMessages={chat.globalActivityMessages}
```

- [ ] **Step 6: Run web test**

Run: `npm run test -w apps/web -- --run ChatPanel`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/hooks/useChat.ts apps/web/src/components/ChatPanel.tsx apps/web/src/components/ChatPanel.test.ts apps/web/src/app/game/page.tsx
git commit -m "feat(web): add chat activity shelf"
```

---

### Task 8: Emit Activity From Combat, Crafting, Exploration, Achievements, And Bosses

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/services/explorationOutcome/ambush.ts`
- Modify: `apps/api/src/services/explorationOutcomeService.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/crafting/craft.ts`
- Modify: `apps/api/src/services/achievementService.ts`
- Modify: `apps/api/src/services/bossEncounter/resolution.ts`

- [ ] **Step 1: Add zone combat rare loot broadcast**

In `apps/api/src/routes/combat/start.ts`, import:

```typescript
import { broadcastRareLootActivity } from '../../services/chatActivityService';
```

After `const lootWithNames = await enrichLootWithNames(loot);`, add:

```typescript
      if (combatResult.outcome === 'victory') {
        void broadcastRareLootActivity({
          zoneId,
          actorPlayerId: playerId,
          actorUsername: req.player!.username,
          loot: lootWithNames,
        }).catch(() => {});
      }
```

- [ ] **Step 2: Add exploration ambush rare loot broadcast**

In `apps/api/src/services/explorationOutcome/ambush.ts`, import:

```typescript
import { broadcastRareLootActivity } from '../chatActivityService';
import { enrichLootWithNames } from '../lootService';
```

After `loot = rewards.loot;`, add:

```typescript
    const lootWithNames = await enrichLootWithNames(loot);
    void broadcastRareLootActivity({
      zoneId,
      actorPlayerId: playerId,
      actorUsername: username,
      loot: lootWithNames,
    }).catch(() => {});
```

`username` is already destructured from `ctx` near the top of `processAmbushOutcome`; use that variable.

- [ ] **Step 3: Add zone discovery activity**

In `apps/api/src/services/explorationOutcomeService.ts`, import:

```typescript
import { broadcastZoneDiscoveryActivity } from './chatActivityService';
```

Add `username` to the existing `ctx` destructuring at the top of `processExplorationOutcomes`:

```typescript
    username,
```

After the direct `await discoverZone(playerId, neighbor.id);` inside the `zone_exit` branch, add:

```typescript
      void broadcastZoneDiscoveryActivity({
        zoneId,
        actorPlayerId: playerId,
        actorUsername: username,
        discoveredZoneName: neighbor.name,
      }).catch(() => {});
```

After auto-discovery in `apps/api/src/routes/exploration/start.ts`, import and add the same broadcast for `body.zoneId`, `req.player!.username`, and `neighbor.name` after `await discoverZone(playerId, neighbor.id);`.

- [ ] **Step 4: Add crafting activity**

In `apps/api/src/routes/crafting/craft.ts`, import:

```typescript
import { broadcastCraftActivity } from '../../services/chatActivityService';
```

After `const zone = await getZoneCraftingLevel(playerId);`, fetch the player context once:

```typescript
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { username: true, currentZoneId: true },
    });
    if (!player?.currentZoneId) {
      throw new AppError(400, 'You must be in a zone to craft', 'NO_ZONE');
    }
```

After the `createActivityLog` call that creates the crafting activity log, add:

```typescript
    const bestCraft = craftedItemDetails
      .filter((item) => item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary')
      .sort((a, b) => {
        const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        return order.indexOf(b.rarity) - order.indexOf(a.rarity);
      })[0];

    if (bestCraft && player.currentZoneId) {
      void broadcastCraftActivity({
        zoneId: player.currentZoneId,
        actorPlayerId: playerId,
        actorUsername: player.username,
        itemName: recipe.resultTemplate.name,
        rarity: bestCraft.rarity,
        skillType: recipe.skillType,
      }).catch(() => {});
    }
```

- [ ] **Step 5: Add achievement activity**

In `apps/api/src/services/achievementService.ts`, import:

```typescript
import { broadcastAchievementActivity } from './chatActivityService';
```

Inside `emitAchievementNotifications`, after `const io = getIo();`, fetch the player once:

```typescript
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { username: true, currentZoneId: true },
  });
```

Inside the per-achievement loop after the socket emit, add:

```typescript
    if (player?.currentZoneId) {
      void broadcastAchievementActivity({
        zoneId: player.currentZoneId,
        actorPlayerId: playerId,
        actorUsername: player.username,
        achievementTitle: ach.title,
      }).catch(() => {});
    }
```

- [ ] **Step 6: Replace boss defeat system messages with activity service**

In `apps/api/src/services/bossEncounter/resolution.ts`, import:

```typescript
import { broadcastBossDefeatActivity } from '../chatActivityService';
```

In the `if (result.bossDefeated)` branch, replace the two `emitSystemMessage` calls for world and zone boss defeat with:

```typescript
    await broadcastBossDefeatActivity({
      zoneId: encounter.event.zoneId,
      zoneName,
      bossName: encounter.mobTemplate.name,
      killerName,
    });
```

Keep wipe and boss-round progress messages on `emitSystemMessage`; only boss defeat becomes structured activity.

- [ ] **Step 7: Run focused API tests**

Run: `npm run test:api -- --run "chatActivity|systemMessage|achievement"`

Expected: PASS.

- [ ] **Step 8: Build API**

Run: `npm run build:api`

Expected: API build completes without TypeScript errors.

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/routes/combat/start.ts apps/api/src/routes/exploration/start.ts apps/api/src/services/explorationOutcome/ambush.ts apps/api/src/services/explorationOutcomeService.ts apps/api/src/routes/crafting/craft.ts apps/api/src/services/achievementService.ts apps/api/src/services/bossEncounter/resolution.ts
git commit -m "feat(chat): broadcast gameplay activity"
```

---

### Task 9: Final Verification And Cleanup

**Files:**
- Review touched diff only.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test:api -- --run "chat|chatActivity|systemMessage|achievement"
npm run test -w packages/shared -- --run chatActivity
npm run test -w apps/web -- --run "ChatPanel|NpcDialogueBanner"
```

Expected: All commands pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: No TypeScript errors.

- [ ] **Step 3: Invoke simplify skill**

Use the global `$simplify` skill on the touched diff. Focus on:

- `chatActivityService.ts` helper boundaries.
- Duplicate rarity sorting logic between service and gameplay call sites.
- `ChatPanel.tsx` readability after adding the shelf.
- Avoiding broad refactors outside touched code.

- [ ] **Step 4: Re-run focused tests after simplification**

Run:

```powershell
npm run test:api -- --run "chat|chatActivity|systemMessage|achievement"
npm run test -w packages/shared -- --run chatActivity
npm run test -w apps/web -- --run "ChatPanel|NpcDialogueBanner"
```

Expected: All commands pass.

- [ ] **Step 5: Commit cleanup**

If simplification changed files, commit:

```powershell
git add -u
git commit -m "refactor(chat): simplify activity shelf implementation"
```

If simplification made no changes, do not create an empty commit.

- [ ] **Step 6: Final status**

Run:

```powershell
git status --short
git log --oneline -n 8
```

Expected: only intentional changes are present, and the recent commits match the task sequence.
