# Zone Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broadcast notable player events (rare loot, crafting crits, discoveries, boss kills, achievements) as system messages to zone chat.

**Architecture:** New `zoneActivityService.ts` with a single broadcast function, hooked into 5 existing code paths. Uses existing `emitSystemMessage` infra + Redis cooldowns. No schema changes.

**Tech Stack:** Socket.IO (existing), Redis (cooldowns), Zod (validation)

**Spec:** `docs/superpowers/specs/2026-03-18-zone-activity-feed-design.md`

---

### Task 1: Add Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

- [ ] **Step 1: Add ZONE_ACTIVITY_CONSTANTS to gameConstants.ts**

After the last constant group, add:

```typescript
export const ZONE_ACTIVITY_CONSTANTS = {
  /** Event types that trigger zone broadcasts */
  ENABLED_EVENTS: ['rare_loot', 'craft_crit', 'zone_discovery', 'boss_kill', 'achievement'] as const,

  /** Per-player, per-event-type cooldown to prevent spam (ms) */
  COOLDOWN_PER_EVENT_TYPE_MS: 60_000,

  /** Minimum rarity for loot drop broadcasts */
  MIN_LOOT_RARITY: 'rare' as const,

  /** Minimum rarity for crafting result broadcasts */
  MIN_CRAFT_RARITY: 'rare' as const,
} as const;
```

- [ ] **Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(zone-activity): add ZONE_ACTIVITY_CONSTANTS"
```

---

### Task 2: Create Zone Activity Service

**Files:**
- Create: `apps/api/src/services/zoneActivityService.ts`
- Test: `apps/api/src/services/zoneActivityService.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};
vi.mock('../redis', () => ({ redis: mockRedis }));

// Mock Socket.IO
const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const mockIo = { to: mockTo } as any;
vi.mock('../socket', () => ({ getIo: () => mockIo }));

// Mock systemMessageService
const mockEmitSystemMessage = vi.fn();
vi.mock('./systemMessageService', () => ({
  emitSystemMessage: mockEmitSystemMessage,
}));

import { broadcastZoneEvent } from './zoneActivityService';

describe('zoneActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null); // No cooldown by default
    mockRedis.set.mockResolvedValue('OK');
  });

  it('broadcasts a rare loot event to zone chat', async () => {
    await broadcastZoneEvent('zone-1', 'rare_loot', {
      playerId: 'player-1',
      playerName: 'Kael',
      itemName: 'Dragonbone Axe',
      rarity: 'rare',
    });

    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      mockIo,
      'zone',
      'zone:zone-1',
      expect.stringContaining('Kael'),
    );
    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      mockIo,
      'zone',
      'zone:zone-1',
      expect.stringContaining('Dragonbone Axe'),
    );
  });

  it('respects per-player per-event-type cooldown', async () => {
    mockRedis.get.mockResolvedValue('1'); // Cooldown active

    await broadcastZoneEvent('zone-1', 'rare_loot', {
      playerId: 'player-1',
      playerName: 'Kael',
      itemName: 'Dragonbone Axe',
      rarity: 'rare',
    });

    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
  });

  it('sets cooldown key after broadcasting', async () => {
    await broadcastZoneEvent('zone-1', 'rare_loot', {
      playerId: 'player-1',
      playerName: 'Kael',
      itemName: 'Dragonbone Axe',
      rarity: 'rare',
    });

    expect(mockRedis.set).toHaveBeenCalledWith(
      'zone_activity:player-1:rare_loot',
      '1',
      'PX',
      60_000,
    );
  });

  it('formats achievement messages correctly', async () => {
    await broadcastZoneEvent('zone-1', 'achievement', {
      playerId: 'player-1',
      playerName: 'Sven',
      achievementTitle: 'The Warrior',
    });

    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      mockIo,
      'zone',
      'zone:zone-1',
      'Sven earned the achievement: The Warrior!',
    );
  });

  it('formats zone discovery messages correctly', async () => {
    await broadcastZoneEvent('zone-1', 'zone_discovery', {
      playerId: 'player-1',
      playerName: 'Vex',
      zoneName: 'Frozen Wastes',
    });

    expect(mockEmitSystemMessage).toHaveBeenCalledWith(
      mockIo,
      'zone',
      'zone:zone-1',
      'Vex discovered a passage to the Frozen Wastes!',
    );
  });

  // Note: `emitSystemMessage` already handles null io gracefully, so Socket.IO
  // unavailability does not need a separate test case.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run zoneActivityService`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/zoneActivityService.ts`:

```typescript
import { ZONE_ACTIVITY_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';
import { getIo } from '../socket';
import { emitSystemMessage } from './systemMessageService';

type ZoneActivityEventType = (typeof ZONE_ACTIVITY_CONSTANTS.ENABLED_EVENTS)[number];

interface ZoneActivityData {
  playerId: string;
  playerName: string;
  itemName?: string;
  rarity?: string;
  zoneName?: string;
  bossName?: string;
  guildName?: string;
  achievementTitle?: string;
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

function isRarityAtLeast(rarity: string, minRarity: string): boolean {
  return RARITY_ORDER.indexOf(rarity as any) >= RARITY_ORDER.indexOf(minRarity as any);
}

function formatMessage(eventType: ZoneActivityEventType, data: ZoneActivityData): string {
  switch (eventType) {
    case 'rare_loot':
      return `${data.playerName} found a ${capitalise(data.rarity ?? 'rare')} ${data.itemName}!`;
    case 'craft_crit':
      return `${data.playerName} crafted a ${capitalise(data.rarity ?? 'rare')} ${data.itemName}!`;
    case 'zone_discovery':
      return `${data.playerName} discovered a passage to the ${data.zoneName}!`;
    case 'boss_kill':
      return data.guildName
        ? `The guild ${data.guildName} defeated ${data.bossName}!`
        : `${data.playerName} defeated ${data.bossName}!`;
    case 'achievement':
      return `${data.playerName} earned the achievement: ${data.achievementTitle}!`;
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { RARITY_ORDER, isRarityAtLeast };

export async function broadcastZoneEvent(
  zoneId: string,
  eventType: ZoneActivityEventType,
  data: ZoneActivityData,
): Promise<void> {
  const io = getIo();
  if (!io) return;

  // Check cooldown
  const cooldownKey = `zone_activity:${data.playerId}:${eventType}`;
  const onCooldown = await redis.get(cooldownKey);
  if (onCooldown) return;

  const message = formatMessage(eventType, data);

  await emitSystemMessage(io, 'zone', `zone:${zoneId}`, message);

  // Set cooldown
  await redis.set(cooldownKey, '1', 'PX', ZONE_ACTIVITY_CONSTANTS.COOLDOWN_PER_EVENT_TYPE_MS);
}
```

Note: `RARITY_ORDER` and `isRarityAtLeast` are exported from this service so the hook call sites can use them. Import via `import { broadcastZoneEvent, RARITY_ORDER, isRarityAtLeast } from '../../services/zoneActivityService';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --run zoneActivityService`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/zoneActivityService.ts apps/api/src/services/zoneActivityService.test.ts
git commit -m "feat(zone-activity): create zoneActivityService with cooldown"
```

---

### Task 3: Hook into Combat Loot (Zone Combat)

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (zone combat section, around line 1004)

- [ ] **Step 1: Add import at top of file**

```typescript
import { broadcastZoneEvent, RARITY_ORDER, isRarityAtLeast } from '../../services/zoneActivityService';
import { ZONE_ACTIVITY_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 2: Add broadcast after zone combat activity log creation (~line 1005)**

After the `createActivityLog` call for zone combat, add:

```typescript
// Zone Activity Feed: broadcast rare+ loot drops
if (combatResult.outcome === 'victory' && lootWithNames.length > 0) {
  const bestDrop = lootWithNames
    .filter((l) => isRarityAtLeast(l.rarity, ZONE_ACTIVITY_CONSTANTS.MIN_LOOT_RARITY))
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))[0];
  if (bestDrop) {
    broadcastZoneEvent(zoneId, 'rare_loot', {
      playerId,
      playerName: player.username,
      itemName: bestDrop.itemName,
      rarity: bestDrop.rarity,
    }).catch(() => {}); // Fire and forget
  }
}
```

Note: The `LootDropWithName` type uses `itemName`, not `name`.

- [ ] **Step 3: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat(zone-activity): broadcast rare loot from zone combat"
```

---

### Task 4: Hook into Combat Loot (Encounter Site)

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (encounter site section, around line 565)

- [ ] **Step 1: Add broadcast after encounter site activity log**

Same pattern as Task 3, using `aggregatedLoot` instead of `lootWithNames`, and only on victory outcomes. The `zoneId` and `player.username` are already in scope.

```typescript
// Zone Activity Feed: broadcast rare+ loot drops from encounter site
if (aggregatedLoot.length > 0) {
  const bestDrop = aggregatedLoot
    .filter((l) => isRarityAtLeast(l.rarity, ZONE_ACTIVITY_CONSTANTS.MIN_LOOT_RARITY))
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))[0];
  if (bestDrop) {
    broadcastZoneEvent(zoneId, 'rare_loot', {
      playerId,
      playerName: player.username,
      itemName: bestDrop.itemName,
      rarity: bestDrop.rarity,
    }).catch(() => {});
  }
}
```

Note: The `LootDropWithName` type uses `itemName`, not `name`.

- [ ] **Step 2: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat(zone-activity): broadcast rare loot from encounter sites"
```

---

### Task 5: Hook into Exploration Ambush Loot

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts` (ambush loot path, around line 397)

- [ ] **Step 1: Add imports at top of file**

```typescript
import { broadcastZoneEvent, RARITY_ORDER, isRarityAtLeast } from '../../services/zoneActivityService';
import { ZONE_ACTIVITY_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 2: Add broadcast after ambush victory loot grant (~line 397)**

The exploration route grants loot on ambush victories. After the loot is granted, add:

```typescript
// Zone Activity Feed: broadcast rare+ loot drops from ambush
if (lootWithNames.length > 0) {
  const bestDrop = lootWithNames
    .filter((l) => isRarityAtLeast(l.rarity, ZONE_ACTIVITY_CONSTANTS.MIN_LOOT_RARITY))
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))[0];
  if (bestDrop) {
    broadcastZoneEvent(zoneId, 'rare_loot', {
      playerId,
      playerName: player.username,
      itemName: bestDrop.itemName,
      rarity: bestDrop.rarity,
    }).catch(() => {}); // Fire and forget
  }
}
```

Note: The `LootDropWithName` type uses `itemName`, not `name`. Check variable names in scope — `lootWithNames` or similar may be named differently in the exploration route.

- [ ] **Step 3: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat(zone-activity): broadcast rare loot from exploration ambushes"
```

---

### Task 6: Hook into Crafting Crits

**Files:**
- Modify: `apps/api/src/routes/crafting/craft.ts` (after activity log creation, ~line 312)

- [ ] **Step 1: Add import and broadcast after crafting activity log**

```typescript
import { broadcastZoneEvent, RARITY_ORDER, isRarityAtLeast } from '../../services/zoneActivityService';
import { ZONE_ACTIVITY_CONSTANTS } from '@pocketrealm/shared';
```

After the `createActivityLog` call (~line 312), add:

```typescript
// Zone Activity Feed: broadcast rare+ crafting results
// Note: `craftedItemDetails` doesn't have `name` — use `recipe.resultTemplate.name` which is already in scope
if (isRarityAtLeast(recipe.resultTemplate.rarity, ZONE_ACTIVITY_CONSTANTS.MIN_CRAFT_RARITY)) {
  const currentZoneId = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (currentZoneId?.currentZoneId) {
    broadcastZoneEvent(currentZoneId.currentZoneId, 'craft_crit', {
      playerId,
      playerName: player.username,
      itemName: recipe.resultTemplate.name,
      rarity: recipe.resultTemplate.rarity,
    }).catch(() => {});
  }
}
```

Note: Check whether `player.currentZoneId` is already available in scope from an earlier query. If so, use that instead of a new query.

- [ ] **Step 2: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/crafting/craft.ts
git commit -m "feat(zone-activity): broadcast rare crafting crits"
```

---

### Task 7: Hook into Achievement Unlocks

**Files:**
- Modify: `apps/api/src/services/achievementService.ts` (inside `emitAchievementNotifications` or after `checkAchievements` returns)

- [ ] **Step 1: Add zone broadcast to achievement notification flow**

Find the function that emits achievement notifications (likely `emitAchievementNotifications`). After it emits the Socket.IO `achievement_unlocked` event, add:

```typescript
import { broadcastZoneEvent } from './zoneActivityService';

// Inside the notification loop for each unlocked achievement:
const playerZone = await prisma.player.findUnique({
  where: { id: playerId },
  select: { currentZoneId: true },
});
if (playerZone?.currentZoneId) {
  for (const achievement of unlockedAchievements) {
    broadcastZoneEvent(playerZone.currentZoneId, 'achievement', {
      playerId,
      playerName: username,
      achievementTitle: achievement.title,
    }).catch(() => {});
  }
}
```

Note: Only one DB query for zone — loop broadcasts multiple achievements with the same zoneId.

- [ ] **Step 2: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/achievementService.ts
git commit -m "feat(zone-activity): broadcast achievement unlocks to zone"
```

---

### Task 8: Hook into Boss Defeats (Modify Existing Message)

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts` (boss defeat system message, ~line 655)

- [ ] **Step 1: Review the existing boss defeat system message**

Read `bossEncounterService.ts` around lines 655-664 to see the current message format. The existing message already broadcasts to zone and world. Modify the zone message to include guild attribution if applicable, matching the zone activity feed format.

This is a message format tweak, not a new hook. No new `broadcastZoneEvent` call needed — the existing `emitSystemMessage` call already handles it.

- [ ] **Step 2: Commit (if any changes were needed)**

```bash
git add apps/api/src/services/bossEncounterService.ts
git commit -m "feat(zone-activity): enhance boss defeat message format"
```

---

### Task 9: Hook into Zone Discovery

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts` (~line 631, after `discoverZone(playerId, neighbor.id)`)

- [ ] **Step 1: Add zone discovery broadcast**

The zone discovery code path is in `apps/api/src/routes/exploration/start.ts` at ~line 631, after the call to `discoverZone(playerId, neighbor.id)`. Variables in scope: `playerId`, `req.player!.username`, `neighbor.name` (destination zone name), `body.zoneId` (origin zone).

```typescript
import { broadcastZoneEvent } from '../../services/zoneActivityService';

// After creating the discovery record (~line 631):
broadcastZoneEvent(body.zoneId, 'zone_discovery', {
  playerId,
  playerName: req.player!.username,
  zoneName: neighbor.name,
}).catch(() => {});
```

- [ ] **Step 2: Verify the build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat(zone-activity): broadcast zone discoveries"
```

---

### Task 10: Final Integration Test

- [ ] **Step 1: Run full test suite**

Run: `npm run test:api`
Expected: All existing tests pass, new zoneActivityService tests pass

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No new type errors

- [ ] **Step 3: Build everything**

Run: `npm run build`
Expected: Clean build

**Note:** This plan covers backend only. Frontend implementation (UI components, screens) will be a separate follow-up plan.
