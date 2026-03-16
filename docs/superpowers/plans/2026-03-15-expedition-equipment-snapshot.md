# Expedition Equipment Snapshot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock equipment stats at room start for expeditions, eliminating per-round re-fetches and establishing a clear game mechanic: gear is locked for the duration of each room.

**Architecture:** At room start (both normal and auto-resolve), snapshot each member's combat-relevant data (`EquipmentStats`, `PerActionScaling`, attack style/level, guild modifiers, unlocked actions, potion pool) into Redis. `buildRaidParticipant` reads from the snapshot instead of hitting the DB. Snapshots are keyed per expedition+room+player and cleared on room end. The game design rule is: **equipment is locked when a room begins — swapping gear between rooms is allowed.**

**Tech Stack:** Redis (via existing `cacheService.ts`), Prisma 6, Vitest

---

## File Structure

### New Files
- Create: `apps/api/src/services/expeditionCombatCache.ts` — snapshot read/write/clear helpers for expedition combat data

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/src/services/expeditionService.ts` | Import cache helpers; snapshot at room start; read from snapshot in `buildRaidParticipant`; clear on room end |
| `apps/api/src/services/expeditionService.ts` | Remove per-round `getEquipmentStats` / `preparePlayerForCombat` calls from `buildRaidParticipant` |
| `apps/web/src/app/wiki/bosses/expeditions/page.tsx` | Add "Equipment Lock" section explaining the mechanic |
| `apps/web/src/app/wiki/items/durability/page.tsx` | Add note about expedition durability behavior |

---

## Chunk 1: Snapshot Cache Service + Integration

### Task 1: Create expeditionCombatCache Helper

**Files:**
- Create: `apps/api/src/services/expeditionCombatCache.ts`
- Create: `apps/api/src/services/__tests__/expeditionCombatCache.test.ts`

This module stores and retrieves a per-player combat snapshot for a given expedition room. The snapshot contains everything `buildRaidParticipant` needs to build a `RaidParticipant` without any DB queries (except HP/stamina/mana which change per round and are already on the member record).

The snapshot shape (uses existing shared types for correctness):

```ts
import type { EquipmentStats } from './equipmentService';
import type { AttackSkill } from './combatStatsService';
import type { PerActionScaling, CombatTemplateSlotData, CombatPotion, PlayerAttributes } from '@pocketrealm/shared';
import type { PlayerGuildModifiers } from './guildUpgradeService';

export interface ExpeditionCombatSnapshot {
  equipmentStats: EquipmentStats;
  attackSkill: AttackSkill;
  attackLevel: number;
  progression: { attributes: PlayerAttributes };
  guildMods: Pick<PlayerGuildModifiers, 'combatDamage' | 'defenseBoost'>;
  perActionScaling: PerActionScaling;
  playerTemplate: CombatTemplateSlotData[];
  unlockedActions: string[];
  potionPool: CombatPotion[];
  maxHp: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  maxMana: number;
  manaRegenPerRound: number;
}
```

- [ ] **Step 1: Write tests**

```ts
// apps/api/src/services/__tests__/expeditionCombatCache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
  },
}));

import {
  snapshotCombatData,
  getCombatSnapshot,
  clearRoomSnapshots,
  SNAPSHOT_TTL,
} from '../expeditionCombatCache';
import { redis } from '../../redis';

const fakeSnapshot = {
  equipmentStats: { attack: 5, armor: 3, health: 0, rangedPower: 0, magicPower: 0, accuracy: 0, magicDefence: 0, dodge: 0, luck: 0, critChance: 0, critDamage: 0, inventorySlots: 0 },
  attackSkill: 'melee' as const,
  attackLevel: 10,
  progression: { attributes: { strength: 5, dexterity: 5, intelligence: 5, vitality: 5, luck: 3, evasion: 2 } },
  guildMods: { combatDamage: 0.1, defenseBoost: 0.05 },
  perActionScaling: {},
  playerTemplate: [],
  unlockedActions: ['basic_attack'],
  potionPool: [],
  maxHp: 100,
  maxStamina: 50,
  staminaRegenPerRound: 5,
  maxMana: 30,
  manaRegenPerRound: 3,
};

describe('expeditionCombatCache', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('snapshotCombatData', () => {
    it('stores snapshot in Redis with correct key and TTL', async () => {
      vi.mocked(redis.set).mockResolvedValue('OK');
      await snapshotCombatData('exp-1', 2, 'player-1', fakeSnapshot);
      expect(redis.set).toHaveBeenCalledWith(
        'expedition:exp-1:room:2:player:player-1:combat',
        JSON.stringify(fakeSnapshot),
        'EX',
        SNAPSHOT_TTL,
      );
    });
  });

  describe('getCombatSnapshot', () => {
    it('returns parsed snapshot on hit', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(fakeSnapshot));
      const result = await getCombatSnapshot('exp-1', 2, 'player-1');
      expect(result).toEqual(fakeSnapshot);
    });

    it('returns null on miss', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      const result = await getCombatSnapshot('exp-1', 2, 'player-1');
      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('down'));
      const result = await getCombatSnapshot('exp-1', 2, 'player-1');
      expect(result).toBeNull();
    });
  });

  describe('clearRoomSnapshots', () => {
    it('deletes all keys matching the room pattern', async () => {
      vi.mocked(redis.keys).mockResolvedValue([
        'expedition:exp-1:room:2:player:p1:combat',
        'expedition:exp-1:room:2:player:p2:combat',
      ]);
      vi.mocked(redis.del).mockResolvedValue(2);
      await clearRoomSnapshots('exp-1', 2);
      expect(redis.keys).toHaveBeenCalledWith('expedition:exp-1:room:2:player:*:combat');
      expect(redis.del).toHaveBeenCalledWith(
        'expedition:exp-1:room:2:player:p1:combat',
        'expedition:exp-1:room:2:player:p2:combat',
      );
    });

    it('no-ops when no keys found', async () => {
      vi.mocked(redis.keys).mockResolvedValue([]);
      await clearRoomSnapshots('exp-1', 2);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

Run: `npm run test:api -- expeditionCombatCache`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement expeditionCombatCache**

```ts
// apps/api/src/services/expeditionCombatCache.ts
import { redis } from '../redis';
import type { EquipmentStats } from './equipmentService';
import type { AttackSkill } from './combatStatsService';
import type { PerActionScaling, CombatTemplateSlotData, CombatPotion, PlayerAttributes } from '@pocketrealm/shared';
import type { PlayerGuildModifiers } from './guildUpgradeService';

export interface ExpeditionCombatSnapshot {
  equipmentStats: EquipmentStats;
  attackSkill: AttackSkill;
  attackLevel: number;
  progression: { attributes: PlayerAttributes };
  guildMods: Pick<PlayerGuildModifiers, 'combatDamage' | 'defenseBoost'>;
  perActionScaling: PerActionScaling;
  playerTemplate: CombatTemplateSlotData[];
  unlockedActions: string[];
  potionPool: CombatPotion[];
  maxHp: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  maxMana: number;
  manaRegenPerRound: number;
}

/** TTL matches expedition timeout (2h) — snapshots self-expire if expedition abandoned. */
export const SNAPSHOT_TTL = 7200;

function key(expeditionId: string, roomIndex: number, playerId: string): string {
  return `expedition:${expeditionId}:room:${roomIndex}:player:${playerId}:combat`;
}

export async function snapshotCombatData(
  expeditionId: string,
  roomIndex: number,
  playerId: string,
  snapshot: ExpeditionCombatSnapshot,
): Promise<void> {
  try {
    await redis.set(key(expeditionId, roomIndex, playerId), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL);
  } catch {
    // Best-effort — fallback is DB re-fetch in buildRaidParticipant
  }
}

export async function getCombatSnapshot(
  expeditionId: string,
  roomIndex: number,
  playerId: string,
): Promise<ExpeditionCombatSnapshot | null> {
  try {
    const raw = await redis.get(key(expeditionId, roomIndex, playerId));
    return raw ? (JSON.parse(raw) as ExpeditionCombatSnapshot) : null;
  } catch {
    return null;
  }
}

// Note: redis.keys is O(N) but acceptable here — max 5-10 keys per room (guild size cap).
export async function clearRoomSnapshots(expeditionId: string, roomIndex: number): Promise<void> {
  try {
    const pattern = `expedition:${expeditionId}:room:${roomIndex}:player:*:combat`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Best-effort cleanup
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npm run test:api -- expeditionCombatCache`

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

`feat: add expeditionCombatCache — Redis snapshot helpers for expedition combat data`

---

### Task 2: Snapshot at Room Start + Read in buildRaidParticipant

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts` — `resolveExpeditionRound` (~line 794), `autoResolveRoom` (~line 940), `buildRaidParticipant` (~line 634)

This is the core change. When a room's first round triggers (either normal or auto-resolve), snapshot each member's combat data. Then `buildRaidParticipant` checks for a snapshot first, only falling back to DB queries if none exists.

**Important:** The snapshot must happen when `roundNumber === 0` (first round of a room). Both `resolveExpeditionRound` and `autoResolveRoom` already check this condition.

- [ ] **Step 1: Add snapshot creation to resolveExpeditionRound**

In `resolveExpeditionRound`, after building participants at line 822 and when `expedition.roundNumber === 0`, snapshot each participant's combat data before proceeding:

```ts
// After line 824 (participants built), before building threat table:
if (expedition.roundNumber === 0) {
  await Promise.all(
    participants.map((p, i) => {
      const member = aliveMembers[i];
      return snapshotCombatData(expeditionId, expedition.currentRoom, member.playerId, {
        equipmentStats: p._snapshotData.equipmentStats,
        attackSkill: p._snapshotData.attackSkill,
        attackLevel: p._snapshotData.attackLevel,
        progression: p._snapshotData.progression,
        guildMods: p._snapshotData.guildMods,
        perActionScaling: p._snapshotData.perActionScaling,
        playerTemplate: p.template,
        unlockedActions: p._snapshotData.unlockedActions,
        potionPool: p.availablePotions,
        maxHp: p.maxHp,
        maxStamina: p.maxStamina,
        staminaRegenPerRound: p.staminaRegenPerRound,
        maxMana: p.maxMana,
        manaRegenPerRound: p.manaRegenPerRound,
      });
    }),
  );
}
```

To make this work, `buildRaidParticipant` needs to return the intermediate data it fetched so we can snapshot it. Add a `_snapshotData` field to the returned `RaidParticipant` (it won't be consumed by the game engine — it's stripped before serialization).

Actually, a cleaner approach: **refactor `buildRaidParticipant` to accept an optional snapshot, and have a separate function that fetches the data and builds the snapshot.** This avoids polluting the `RaidParticipant` type.

Refactor `buildRaidParticipant` into two paths:

```ts
import { snapshotCombatData, getCombatSnapshot, type ExpeditionCombatSnapshot } from './expeditionCombatCache';

async function fetchCombatDataForSnapshot(
  member: BuildParticipantInput,
): Promise<ExpeditionCombatSnapshot> {
  const [equipStats, progression] = await Promise.all([
    getEquipmentStats(member.playerId),
    getPlayerProgressionState(member.playerId),
  ]);
  const maxHp = calculateMaxHp({
    vitalityLevel: progression.attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });

  const prep = await preparePlayerForCombat(member.playerId, {
    maxHp,
    preloaded: { equipmentStats: equipStats, progression },
  });

  return {
    equipmentStats: prep.equipmentStats,
    attackSkill: prep.attackSkill,
    attackLevel: prep.attackLevel,
    progression: { attributes: prep.progression.attributes },
    guildMods: { combatDamage: prep.guildMods.combatDamage, defenseBoost: prep.guildMods.defenseBoost },
    perActionScaling: prep.perActionScaling,
    playerTemplate: prep.playerTemplate,
    unlockedActions: prep.unlockedActions,
    potionPool: prep.potionPool,
    maxHp,
    maxStamina: prep.resources.maxStamina,
    staminaRegenPerRound: prep.resources.staminaRegenPerRound,
    maxMana: prep.resources.maxMana,
    manaRegenPerRound: prep.resources.manaRegenPerRound,
  };
}

function buildParticipantFromSnapshot(
  member: BuildParticipantInput,
  snapshot: ExpeditionCombatSnapshot,
): RaidParticipant {
  const stats = buildPlayerCombatStats(
    snapshot.maxHp, snapshot.maxHp,
    { attackStyle: snapshot.attackSkill, skillLevel: snapshot.attackLevel, attributes: snapshot.progression.attributes },
    snapshot.equipmentStats,
  );
  applyGuildCombatModifiers(stats, snapshot.guildMods);

  const unlockedSet = new Set(snapshot.unlockedActions);
  const filteredActions: Record<string, ActionDefinition> = {};
  for (const [id, def] of Object.entries(BASE_ACTION_DEFINITIONS)) {
    if (ALWAYS_AVAILABLE_ACTION_IDS.has(id) || unlockedSet.has(id)) {
      filteredActions[id] = def;
    }
  }
  for (const slot of snapshot.playerTemplate) {
    for (const actionId of [slot.actionId, slot.thenActionId]) {
      if (actionId && !filteredActions[actionId] && BASE_ACTION_DEFINITIONS[actionId]) {
        filteredActions[actionId] = BASE_ACTION_DEFINITIONS[actionId];
      }
    }
  }

  const effects = Array.isArray(member.activeEffects) ? member.activeEffects : [];

  return {
    playerId: member.playerId,
    username: member.player?.username,
    targetMobId: member.targetMobId ?? null,
    healTargetPlayerId: member.healTargetPlayerId ?? null,
    stats,
    template: snapshot.playerTemplate,
    actionDefinitions: filteredActions,
    hp: member.currentHp,
    maxHp: snapshot.maxHp,
    stamina: member.currentStamina,
    maxStamina: snapshot.maxStamina,
    staminaRegenPerRound: snapshot.staminaRegenPerRound,
    mana: member.currentMana,
    maxMana: snapshot.maxMana,
    manaRegenPerRound: snapshot.manaRegenPerRound,
    templateRound: member.templateRound,
    activeEffects: effects as RaidParticipant['activeEffects'],
    availablePotions: snapshot.potionPool,
  };
}
```

Then update `buildRaidParticipant` to try snapshot first:

```ts
async function buildRaidParticipant(
  member: BuildParticipantInput,
  expeditionId?: string,
  roomIndex?: number,
): Promise<RaidParticipant> {
  // Try cached snapshot first (set at room start)
  if (expeditionId !== undefined && roomIndex !== undefined) {
    const snapshot = await getCombatSnapshot(expeditionId, roomIndex, member.playerId);
    if (snapshot) return buildParticipantFromSnapshot(member, snapshot);
  }

  // Fallback: fetch from DB (first round of room, or cache miss)
  const snapshot = await fetchCombatDataForSnapshot(member);
  return buildParticipantFromSnapshot(member, snapshot);
}
```

- [ ] **Step 2: Update resolveExpeditionRound to snapshot on first round**

At line 822, pass `expeditionId` and `expedition.currentRoom` to `buildRaidParticipant`:

```ts
const participants: RaidParticipant[] = await Promise.all(
  aliveMembers.map(m => buildRaidParticipant(m, expeditionId, expedition.currentRoom)),
);
```

Before the `buildRaidParticipant` calls, if this is the first round (`expedition.roundNumber === 0`), snapshot each member's data:

```ts
if (expedition.roundNumber === 0) {
  // First round of room — fetch and snapshot combat data for all members
  const snapshots = await Promise.all(
    aliveMembers.map(async m => ({
      playerId: m.playerId,
      snapshot: await fetchCombatDataForSnapshot(m),
    })),
  );
  await Promise.all(
    snapshots.map(s => snapshotCombatData(expeditionId, expedition.currentRoom, s.playerId, s.snapshot)),
  );
}

// Build participants (will read from snapshot for rounds >= 1, or use just-created snapshot for round 0)
const participants: RaidParticipant[] = await Promise.all(
  aliveMembers.map(m => buildRaidParticipant(m, expeditionId, expedition.currentRoom)),
);
```

- [ ] **Step 3: Update autoResolveRoom to snapshot before the loop**

At line 973, snapshot before building participants:

```ts
// Snapshot combat data for all alive members (locked for the room)
const snapshots = await Promise.all(
  aliveMembers.map(async m => ({
    playerId: m.playerId,
    snapshot: await fetchCombatDataForSnapshot(m),
  })),
);
await Promise.all(
  snapshots.map(s => snapshotCombatData(expeditionId, expedition.currentRoom, s.playerId, s.snapshot)),
);

const participants: RaidParticipant[] = aliveMembers.map((m, i) =>
  buildParticipantFromSnapshot(m, snapshots[i].snapshot),
);
```

Note: for auto-resolve, we can directly use `buildParticipantFromSnapshot` since we just fetched the data — no need to round-trip through Redis.

- [ ] **Step 4: Run tests**

Run: `npm run test:api`

Expected: All existing tests pass. Some expedition tests may need updated mocks if they mock `getEquipmentStats` / `preparePlayerForCombat` at the call sites that changed.

- [ ] **Step 5: Commit**

`perf: snapshot expedition combat data at room start — eliminates per-round DB re-fetches`

---

### Task 3: Clear Snapshots on Room End

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts` — `handleRoomCleared` (~line 1144), `handleWipe`, `completeExpedition`

Snapshots must be cleared when a room ends (cleared, wiped, or expedition completes) so stale data doesn't persist.

- [ ] **Step 1: Add clearRoomSnapshots to handleRoomCleared**

At the top of `handleRoomCleared`, before awarding tokens:

```ts
import { clearRoomSnapshots } from './expeditionCombatCache';

// Clear combat snapshots for the completed room
await clearRoomSnapshots(expeditionId, expedition.currentRoom);
```

- [ ] **Step 2: Add clearRoomSnapshots to handleWipe (~line 1263)**

At the top of `handleWipe`, after fetching the expedition:

```ts
await clearRoomSnapshots(expeditionId, expedition.currentRoom);
```

- [ ] **Step 3: Add clearRoomSnapshots to completeExpedition (~line 1458)**

At the top of `completeExpedition`, after fetching the expedition:

```ts
await clearRoomSnapshots(expeditionId, expedition.currentRoom);
```

- [ ] **Step 4: Run tests**

Run: `npm run test:api`

Expected: All pass.

- [ ] **Step 5: Commit**

`fix: clear expedition combat snapshots on room clear, wipe, and completion`

---

## Chunk 2: Wiki Updates

### Task 4: Update Expedition Wiki Page

**Files:**
- Modify: `apps/web/src/app/wiki/bosses/expeditions/page.tsx`

Add a section explaining the equipment lock mechanic.

- [ ] **Step 1: Add "Equipment Lock" section**

After the existing "How Expeditions Differ from Boss Encounters" section, add:

```tsx
<h2>Equipment Lock</h2>
<p>
  When a room begins, each party member&rsquo;s equipment stats are
  <strong> locked for the duration of the room</strong>. Changing your
  equipped gear between rounds has no effect until the next room starts.
</p>
<ul>
  <li>
    <strong>Swapping gear between rooms</strong> — during the rest phase
    between rooms, you can freely change equipment. Your new stats will
    take effect when the next room begins.
  </li>
  <li>
    <strong>Durability</strong> — equipment durability continues to degrade
    during the room, but stat contributions are based on the snapshot taken
    at room start. Even if a weapon reaches 0 durability mid-room, it
    retains its full stats until the room ends.
  </li>
  <li>
    <strong>Why?</strong> — this ensures consistent combat calculations
    throughout each room and prevents mid-fight gear swapping.
  </li>
</ul>
```

- [ ] **Step 2: Build web to verify**

Run: `npm run build:web`

Expected: Builds without errors.

- [ ] **Step 3: Commit**

`docs: add equipment lock section to expedition wiki page`

---

### Task 5: Update Durability Wiki Page

**Files:**
- Modify: `apps/web/src/app/wiki/items/durability/page.tsx`

Add a note about expedition behavior.

- [ ] **Step 1: Add expedition note**

In the durability wiki page, find the section that discusses durability effects on combat. Add a note:

```tsx
<h3>Expeditions</h3>
<p>
  During expeditions, equipment stats are locked at the start of each room.
  Durability still degrades normally, but even if an item reaches 0
  durability mid-room, its stat contributions are preserved until the room
  ends. The durability penalty applies from the next room onward.
</p>
```

- [ ] **Step 2: Build web to verify**

Run: `npm run build:web`

Expected: Builds without errors.

- [ ] **Step 3: Commit**

`docs: add expedition durability note to wiki`

---

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| DB queries per round (5 members, normal) | ~30-40 (6-8 per member) | ~0 from snapshot (1 Redis GET per member) |
| DB queries per room (10 rounds, 5 members) | ~300-400 | ~30-40 (first round only) + 5 Redis GETs × 9 rounds |
| Auto-resolve overhead | Already efficient (builds once) | Same, but now also snapshots for consistency |
| Equipment mid-room exploits | Theoretically possible | Eliminated by design |
