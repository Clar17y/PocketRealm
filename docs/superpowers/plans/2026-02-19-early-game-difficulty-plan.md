# Early-Game Difficulty Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add room-based encounter sites and tier bleedthrough mob selection to create meaningful early-game danger through attrition pressure and surprise threats.

**Architecture:** Two independent features built on the existing JSON-based encounter site system. Tier bleedthrough modifies mob selection in `mobTierFilter.ts`. Room system adds `room` field to the existing `EncounterMobSlot` JSON and new columns to `EncounterSite` for strategy/room tracking. No new Prisma models — room state is derived from mob JSON.

**Tech Stack:** TypeScript, Prisma 6, Express 4, Vitest, Next.js 16

**Design doc:** `docs/superpowers/specs/2026-02-19-early-game-difficulty-design.md`

---

## Task 1: Add Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:117-139` (EXPLORATION_CONSTANTS + CHEST_CONSTANTS area)
- Modify: `packages/shared/src/constants/gameConstants.ts:469-472` (ZONE_EXPLORATION_CONSTANTS area)

**Step 1: Add tier bleedthrough constants**

In `gameConstants.ts`, add after `ZONE_EXPLORATION_CONSTANTS` (line 472):

```typescript
export const TIER_BLEED_CONSTANTS = {
  CURRENT_TIER_WEIGHT: 0.75,
  PLUS_ONE_TIER_WEIGHT: 0.20,
  PLUS_TWO_TIER_WEIGHT: 0.05,
} as const;
```

**Step 2: Add room and full-clear constants**

In `gameConstants.ts`, add after the new `TIER_BLEED_CONSTANTS`:

```typescript
export const ROOM_CONSTANTS = {
  ROOMS_SMALL: { min: 1, max: 1 },
  ROOMS_MEDIUM: { min: 2, max: 2 },
  ROOMS_LARGE: { min: 3, max: 4 },
  MOBS_PER_ROOM_SMALL: { min: 2, max: 4 },
  MOBS_PER_ROOM_MEDIUM: { min: 2, max: 4 },
  MOBS_PER_ROOM_LARGE: { min: 2, max: 5 },
} as const;

export const FULL_CLEAR_CONSTANTS = {
  DROP_MULTIPLIER: 1.5,
  RECIPE_MULTIPLIER: 1.5,
  CHEST_TIER_UPGRADE: true,
} as const;
```

**Step 3: Export new constants**

Verify `packages/shared/src/index.ts` re-exports from `./constants/gameConstants` (it should already via `export *`). No change needed if so.

**Step 4: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

**Step 5: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add tier bleedthrough, room, and full-clear constants"
```

---

## Task 2: Tier Bleedthrough Function (Game Engine)

**Files:**
- Modify: `packages/game-engine/src/exploration/mobTierFilter.ts`
- Modify: `packages/game-engine/src/exploration/mobTierFilter.test.ts`

**Step 1: Write failing tests for `selectTierWithBleedthrough`**

Add to `mobTierFilter.test.ts`:

```typescript
import { selectTierWithBleedthrough } from './mobTierFilter';

describe('selectTierWithBleedthrough', () => {
  const defaultTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  it('returns current tier when rng < 0.75', () => {
    const result = selectTierWithBleedthrough(1, defaultTiers, () => 0.5);
    expect(result).toBe(1);
  });

  it('returns tier+1 when rng is between 0.75 and 0.95', () => {
    const result = selectTierWithBleedthrough(1, defaultTiers, () => 0.85);
    expect(result).toBe(2);
  });

  it('returns tier+2 when rng >= 0.95', () => {
    const result = selectTierWithBleedthrough(1, defaultTiers, () => 0.96);
    expect(result).toBe(3);
  });

  it('caps at max tier in zone', () => {
    const twoTierZone = { '1': 0, '2': 25 };
    // rng 0.96 would want tier+2 = 3, but max is 2
    const result = selectTierWithBleedthrough(1, twoTierZone, () => 0.96);
    expect(result).toBe(2);
  });

  it('caps tier+1 at max tier when at highest tier', () => {
    // At tier 4 (max), tier+1 doesn't exist → stays at 4
    const result = selectTierWithBleedthrough(4, defaultTiers, () => 0.85);
    expect(result).toBe(4);
  });

  it('returns current tier for single-tier zone', () => {
    const singleTier = { '1': 0 };
    const result = selectTierWithBleedthrough(1, singleTier, () => 0.96);
    expect(result).toBe(1);
  });

  it('uses null zoneTiers as default tiers', () => {
    const result = selectTierWithBleedthrough(1, null, () => 0.85);
    expect(result).toBe(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/exploration/mobTierFilter.test.ts`
Expected: FAIL — `selectTierWithBleedthrough` is not exported.

**Step 3: Implement `selectTierWithBleedthrough`**

Add to `mobTierFilter.ts`:

```typescript
import { TIER_BLEED_CONSTANTS, ZONE_EXPLORATION_CONSTANTS } from '@adventure/shared';

export function selectTierWithBleedthrough(
  currentTier: number,
  zoneTiers: Record<string, number> | null,
  rng: () => number = Math.random,
): number {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;
  const maxTier = Math.max(...Object.keys(tiers).map(Number).filter(n => !isNaN(n)), 0);
  if (maxTier <= 0) return currentTier;

  const roll = rng();
  let selectedTier: number;

  if (roll < TIER_BLEED_CONSTANTS.CURRENT_TIER_WEIGHT) {
    selectedTier = currentTier;
  } else if (roll < TIER_BLEED_CONSTANTS.CURRENT_TIER_WEIGHT + TIER_BLEED_CONSTANTS.PLUS_ONE_TIER_WEIGHT) {
    selectedTier = currentTier + 1;
  } else {
    selectedTier = currentTier + 2;
  }

  return Math.min(selectedTier, maxTier);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/exploration/mobTierFilter.test.ts`
Expected: All PASS.

**Step 5: Export from game engine index**

Verify `selectTierWithBleedthrough` is exported. `packages/game-engine/src/index.ts` has `export * from './exploration/mobTierFilter'` (line ~15), so the named export will be picked up automatically.

**Step 6: Build game engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build.

**Step 7: Commit**

```bash
git add packages/game-engine/src/exploration/mobTierFilter.ts packages/game-engine/src/exploration/mobTierFilter.test.ts
git commit -m "feat: add tier bleedthrough selection function"
```

---

## Task 3: Integrate Tier Bleedthrough into Mob Selection

**Files:**
- Modify: `apps/api/src/routes/exploration.ts:226-311` (`buildEncounterSiteMobs` function)
- Modify: `apps/api/src/routes/exploration.ts:1` (imports)
- Modify: `apps/api/src/routes/combat.ts:491-507` (random zone combat mob selection)
- Modify: `apps/api/src/routes/combat.ts:4` (imports)

**Context:** Currently `buildEncounterSiteMobs` filters family members by `explorationPercent >= threshold`. We need to change this so each mob slot rolls its tier independently using `selectTierWithBleedthrough`. For random zone combat, the same logic applies to the mob pool selection.

**Step 1: Update `buildEncounterSiteMobs` in exploration.ts**

Replace the zone member filtering logic (lines 233-240) to use tier bleedthrough. Instead of filtering to only unlocked tiers, filter to ALL zone members, then for each mob slot roll a tier.

The function currently filters members first, then picks from the filtered set. We need to:
1. Group members by tier
2. For each mob slot, call `selectTierWithBleedthrough` to pick a tier
3. Pick a member from that tier (fallback to nearest available tier)

Modify `buildEncounterSiteMobs`:

```typescript
function buildEncounterSiteMobs(
  family: ZoneFamilyRow['mobFamily'],
  size: EncounterSiteSize,
  zoneId: string,
  explorationPercent: number = 100,
  zoneTiers: Record<string, number> | null = null,
): EncounterMobSlot[] {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

  // Determine current unlocked tier
  let currentTier = 0;
  for (const [tierStr, threshold] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    if (explorationPercent >= threshold && tier > currentTier) {
      currentTier = tier;
    }
  }
  if (currentTier === 0) return [];

  // Get ALL zone members (not filtered by tier)
  const zoneMembers = family.members
    .filter((member) => member.mobTemplate.zoneId === zoneId);
  if (zoneMembers.length === 0) return [];

  // Group members by tier
  const membersByTier = new Map<number, ZoneFamilyMember[]>();
  for (const member of zoneMembers) {
    const tier = member.mobTemplate.explorationTier ?? 1;
    if (!membersByTier.has(tier)) membersByTier.set(tier, []);
    membersByTier.get(tier)!.push(member);
  }

  // Helper: pick a member for a given role at a bleedthrough-selected tier
  function pickMemberWithBleedthrough(
    role: EncounterMobRole,
    fallbackRoles: EncounterMobRole[],
  ): ZoneFamilyMember | null {
    const selectedTier = selectTierWithBleedthrough(currentTier, tiers);
    // Try selected tier, then fall back to lower tiers
    for (let t = selectedTier; t >= 1; t--) {
      const tierMembers = membersByTier.get(t) ?? [];
      if (tierMembers.length === 0) continue;
      const picked = pickFamilyMemberByRole(tierMembers, role, fallbackRoles);
      if (picked) return picked;
    }
    // Last resort: any member
    return pickFamilyMemberByRole(zoneMembers, role, fallbackRoles);
  }

  const { min, max } = getEncounterRange(size);
  const total = randomIntInclusive(min, max);

  let bossCount = 0;
  let eliteCount = 0;
  if (size === 'medium') {
    eliteCount = 1;
  } else if (size === 'large') {
    bossCount = 1;
    eliteCount = 2;
  }

  let trashCount = Math.max(0, total - eliteCount - bossCount);
  if (size === 'small' && trashCount < 2) {
    trashCount = Math.max(2, total);
  }

  const mobs: EncounterMobSlot[] = [];
  let slot = 0;

  for (let i = 0; i < trashCount; i++) {
    const member = pickMemberWithBleedthrough('trash', ['elite', 'boss']);
    if (!member) continue;
    mobs.push({
      slot: slot++,
      mobTemplateId: member.mobTemplate.id,
      role: 'trash',
      prefix: rollMobPrefix(),
      status: 'alive',
    });
  }

  for (let i = 0; i < eliteCount; i++) {
    const member = pickMemberWithBleedthrough('elite', ['trash', 'boss']);
    if (!member) continue;
    mobs.push({
      slot: slot++,
      mobTemplateId: member.mobTemplate.id,
      role: 'elite',
      prefix: rollMobPrefix(),
      status: 'alive',
    });
  }

  for (let i = 0; i < bossCount; i++) {
    const member = pickMemberWithBleedthrough('boss', ['elite', 'trash']);
    if (!member) continue;
    mobs.push({
      slot: slot++,
      mobTemplateId: member.mobTemplate.id,
      role: 'boss',
      prefix: rollMobPrefix(),
      status: 'alive',
    });
  }

  if (mobs.length === 0 && zoneMembers.length > 0) {
    const member = zoneMembers[0]!;
    mobs.push({
      slot: 0,
      mobTemplateId: member.mobTemplate.id,
      role: 'trash',
      prefix: rollMobPrefix(),
      status: 'alive',
    });
  }

  return mobs;
}
```

Add import at top of exploration.ts:
```typescript
import { selectTierWithBleedthrough } from '@adventure/game-engine';
```

**Step 2: Update random zone combat in combat.ts**

In `combat.ts` lines 491-506, modify the random mob selection to use tier bleedthrough:

```typescript
} else {
  const mobs = await prisma.mobTemplate.findMany({ where: { zoneId } });
  const zoneTiers = (zone as unknown as { explorationTiers: Record<string, number> | null }).explorationTiers;
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

  // Determine current tier from exploration %
  let currentTier = 0;
  for (const [tierStr, threshold] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    if (explorationProgress.percent >= threshold && tier > currentTier) {
      currentTier = tier;
    }
  }

  // Select tier with bleedthrough
  const selectedTier = selectTierWithBleedthrough(currentTier, zoneTiers);

  // Filter mobs to selected tier, fallback to current tier, then any tier
  let candidates = mobs.filter(m =>
    ((m as unknown as { explorationTier: number | null }).explorationTier ?? 1) === selectedTier
  );
  if (candidates.length === 0) {
    candidates = mobs.filter(m =>
      ((m as unknown as { explorationTier: number | null }).explorationTier ?? 1) === currentTier
    );
  }
  if (candidates.length === 0) {
    candidates = mobs;
  }

  const tieredMobs = filterAndWeightMobsByTier(
    candidates.map(m => ({
      ...m,
      explorationTier: (m as unknown as { explorationTier: number | null }).explorationTier ?? 1,
    })),
    100, // pass 100 to bypass tier filtering since we already selected the tier
    { [String(selectedTier)]: 0, ...(currentTier !== selectedTier ? { [String(currentTier)]: 0 } : {}) },
  );
  const picked = pickWeighted(tieredMobs);
  if (!picked) {
    throw new AppError(400, 'No mobs available for this zone', 'NO_MOBS');
  }
  mob = picked as unknown as MobTemplate & { spellPattern: unknown };
}
```

Add import at top of combat.ts:
```typescript
import { selectTierWithBleedthrough } from '@adventure/game-engine';
```
Also add:
```typescript
import { ZONE_EXPLORATION_CONSTANTS } from '@adventure/shared';
```

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new errors (pre-existing `page.tsx:333` error is expected).

**Step 4: Test manually**

Run dev server, explore a zone, verify encounter sites occasionally spawn with higher-tier mobs. Verify random zone combat can produce higher-tier mobs.

**Step 5: Commit**

```bash
git add apps/api/src/routes/exploration.ts apps/api/src/routes/combat.ts
git commit -m "feat: integrate tier bleedthrough into mob selection"
```

---

## Task 4: Room Generation Function (Game Engine)

**Files:**
- Create: `packages/game-engine/src/exploration/roomGenerator.ts`
- Create: `packages/game-engine/src/exploration/roomGenerator.test.ts`
- Modify: `packages/game-engine/src/index.ts` (add export)

**Step 1: Write failing tests**

Create `roomGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateRoomAssignments } from './roomGenerator';

describe('generateRoomAssignments', () => {
  it('assigns all mobs to 1 room for small sites', () => {
    const result = generateRoomAssignments('small', () => 0.5);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]!.mobCount).toBeGreaterThanOrEqual(2);
    expect(result.rooms[0]!.mobCount).toBeLessThanOrEqual(4);
  });

  it('assigns mobs to 2 rooms for medium sites', () => {
    const result = generateRoomAssignments('medium', () => 0.5);
    expect(result.rooms).toHaveLength(2);
    for (const room of result.rooms) {
      expect(room.mobCount).toBeGreaterThanOrEqual(2);
      expect(room.mobCount).toBeLessThanOrEqual(4);
    }
  });

  it('assigns mobs to 3-4 rooms for large sites', () => {
    const result = generateRoomAssignments('large', () => 0.5);
    expect(result.rooms.length).toBeGreaterThanOrEqual(3);
    expect(result.rooms.length).toBeLessThanOrEqual(4);
    for (const room of result.rooms) {
      expect(room.mobCount).toBeGreaterThanOrEqual(2);
      expect(room.mobCount).toBeLessThanOrEqual(5);
    }
  });

  it('room numbers are 1-indexed and sequential', () => {
    const result = generateRoomAssignments('medium', () => 0.5);
    expect(result.rooms.map(r => r.roomNumber)).toEqual([1, 2]);
  });

  it('totalMobs equals sum of all room mobCounts', () => {
    const result = generateRoomAssignments('large', () => 0.5);
    const sum = result.rooms.reduce((s, r) => s + r.mobCount, 0);
    expect(result.totalMobs).toBe(sum);
  });

  it('returns deterministic results with fixed rng', () => {
    const rng = () => 0.5;
    const a = generateRoomAssignments('medium', rng);
    const b = generateRoomAssignments('medium', rng);
    expect(a).toEqual(b);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/exploration/roomGenerator.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `generateRoomAssignments`**

Create `roomGenerator.ts`:

```typescript
import { ROOM_CONSTANTS } from '@adventure/shared';

type EncounterSiteSize = 'small' | 'medium' | 'large';

interface RoomLayout {
  roomNumber: number;
  mobCount: number;
}

interface RoomAssignments {
  rooms: RoomLayout[];
  totalMobs: number;
}

function rollRange(min: number, max: number, rng: () => number): number {
  if (min >= max) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function generateRoomAssignments(
  size: EncounterSiteSize,
  rng: () => number = Math.random,
): RoomAssignments {
  const roomRange = size === 'small' ? ROOM_CONSTANTS.ROOMS_SMALL
    : size === 'medium' ? ROOM_CONSTANTS.ROOMS_MEDIUM
    : ROOM_CONSTANTS.ROOMS_LARGE;

  const mobRange = size === 'small' ? ROOM_CONSTANTS.MOBS_PER_ROOM_SMALL
    : size === 'medium' ? ROOM_CONSTANTS.MOBS_PER_ROOM_MEDIUM
    : ROOM_CONSTANTS.MOBS_PER_ROOM_LARGE;

  const roomCount = rollRange(roomRange.min, roomRange.max, rng);

  const rooms: RoomLayout[] = [];
  let totalMobs = 0;

  for (let i = 0; i < roomCount; i++) {
    const mobCount = rollRange(mobRange.min, mobRange.max, rng);
    rooms.push({ roomNumber: i + 1, mobCount });
    totalMobs += mobCount;
  }

  return { rooms, totalMobs };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/exploration/roomGenerator.test.ts`
Expected: All PASS.

**Step 5: Export from game engine**

Add to `packages/game-engine/src/index.ts`:

```typescript
export * from './exploration/roomGenerator';
```

**Step 6: Build game engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build.

**Step 7: Commit**

```bash
git add packages/game-engine/src/exploration/roomGenerator.ts packages/game-engine/src/exploration/roomGenerator.test.ts packages/game-engine/src/index.ts
git commit -m "feat: add room generation function for encounter sites"
```

---

## Task 5: Database Migration

**Files:**
- Create: `packages/database/prisma/migrations/<timestamp>_add_encounter_rooms/migration.sql` (via prisma migrate)
- Modify: `packages/database/prisma/schema.prisma` (EncounterSite model)

**Context:** The `EncounterSite` model needs new columns. Mobs already store as JSON, so we add a `room` field to the JSON shape (no schema change needed for that — it's just a convention in the code). The Prisma model needs:
- `clearStrategy` — nullable string, null means not yet selected
- `currentRoom` — int, default 1
- `fullClearActive` — boolean, default true
- `roomCarryHp` — nullable int, used to freeze HP between fights in a room

**Step 1: Update Prisma schema**

Add to the `EncounterSite` model in `schema.prisma`:

```prisma
  clearStrategy    String?  @map("clear_strategy") @db.VarChar(16)
  currentRoom      Int      @default(1) @map("current_room")
  fullClearActive  Boolean  @default(true) @map("full_clear_active")
  roomCarryHp      Int?     @map("room_carry_hp")
```

**Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_encounter_rooms --schema packages/database/prisma/schema.prisma`
Expected: Migration created and applied. Existing encounter sites get default values (null strategy, room 1, fullClearActive true, null carryHp).

**Step 3: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma client updated with new fields.

**Step 4: Build database package**

Run: `npm run build --workspace=packages/database`
Expected: Clean build.

**Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add room tracking columns to encounter_sites"
```

---

## Task 6: Update Encounter Mob JSON Shape & Site Generation

**Files:**
- Modify: `apps/api/src/routes/exploration.ts:75-81` (EncounterMobSlot interface)
- Modify: `apps/api/src/routes/exploration.ts:226-311` (buildEncounterSiteMobs function)
- Modify: `apps/api/src/routes/exploration.ts:189-193` (getEncounterRange — remove or replace)
- Modify: `apps/api/src/routes/combat.ts:97-103` (EncounterMobState interface)
- Modify: `apps/api/src/routes/combat.ts:105-131` (parseEncounterSiteMobs)

**Step 1: Add `room` field to EncounterMobSlot**

In `exploration.ts`, update the interface:

```typescript
interface EncounterMobSlot {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;  // 1-indexed room number
}
```

**Step 2: Add `room` field to EncounterMobState in combat.ts**

```typescript
interface EncounterMobState {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;
}
```

Update `parseEncounterSiteMobs` to parse the `room` field:

```typescript
const room = typeof row.room === 'number' ? Math.floor(row.room) : 1;
// ... in the push:
parsed.push({ slot, mobTemplateId, role, prefix, status, room });
```

**Step 3: Rebuild `buildEncounterSiteMobs` to use rooms**

Replace the function to generate mobs using `generateRoomAssignments`:

```typescript
import { generateRoomAssignments, selectTierWithBleedthrough } from '@adventure/game-engine';

function buildEncounterSiteMobs(
  family: ZoneFamilyRow['mobFamily'],
  size: EncounterSiteSize,
  zoneId: string,
  explorationPercent: number = 100,
  zoneTiers: Record<string, number> | null = null,
): EncounterMobSlot[] {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

  let currentTier = 0;
  for (const [tierStr, threshold] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    if (explorationPercent >= threshold && tier > currentTier) {
      currentTier = tier;
    }
  }
  if (currentTier === 0) return [];

  const zoneMembers = family.members
    .filter((member) => member.mobTemplate.zoneId === zoneId);
  if (zoneMembers.length === 0) return [];

  const membersByTier = new Map<number, ZoneFamilyMember[]>();
  for (const member of zoneMembers) {
    const tier = member.mobTemplate.explorationTier ?? 1;
    if (!membersByTier.has(tier)) membersByTier.set(tier, []);
    membersByTier.get(tier)!.push(member);
  }

  function pickMemberWithBleedthrough(
    role: EncounterMobRole,
    fallbackRoles: EncounterMobRole[],
  ): ZoneFamilyMember | null {
    const selectedTier = selectTierWithBleedthrough(currentTier, tiers);
    for (let t = selectedTier; t >= 1; t--) {
      const tierMembers = membersByTier.get(t) ?? [];
      if (tierMembers.length === 0) continue;
      const picked = pickFamilyMemberByRole(tierMembers, role, fallbackRoles);
      if (picked) return picked;
    }
    return pickFamilyMemberByRole(zoneMembers, role, fallbackRoles);
  }

  const { rooms, totalMobs } = generateRoomAssignments(size);

  // Determine role composition based on site size
  let bossCount = 0;
  let eliteCount = 0;
  if (size === 'medium') eliteCount = 1;
  else if (size === 'large') { bossCount = 1; eliteCount = 2; }

  const trashCount = Math.max(0, totalMobs - eliteCount - bossCount);

  // Build flat mob list with roles
  const roleQueue: EncounterMobRole[] = [
    ...Array(trashCount).fill('trash' as const),
    ...Array(eliteCount).fill('elite' as const),
    ...Array(bossCount).fill('boss' as const),
  ];

  // Assign mobs to rooms sequentially
  const mobs: EncounterMobSlot[] = [];
  let slot = 0;
  let roleIndex = 0;

  for (const room of rooms) {
    for (let i = 0; i < room.mobCount && roleIndex < roleQueue.length; i++) {
      const role = roleQueue[roleIndex]!;
      const fallbacks: EncounterMobRole[] = role === 'trash'
        ? ['elite', 'boss'] : role === 'elite'
        ? ['trash', 'boss'] : ['elite', 'trash'];

      const member = pickMemberWithBleedthrough(role, fallbacks);
      if (!member) continue;

      mobs.push({
        slot: slot++,
        mobTemplateId: member.mobTemplate.id,
        role,
        prefix: rollMobPrefix(),
        status: 'alive',
        room: room.roomNumber,
      });
      roleIndex++;
    }
  }

  if (mobs.length === 0 && zoneMembers.length > 0) {
    const member = zoneMembers[0]!;
    mobs.push({
      slot: 0,
      mobTemplateId: member.mobTemplate.id,
      role: 'trash',
      prefix: rollMobPrefix(),
      status: 'alive',
      room: 1,
    });
  }

  return mobs;
}
```

**Step 4: Remove `getEncounterRange` function**

The old `getEncounterRange` function (lines 189-193) is no longer needed since mob counts come from `generateRoomAssignments`. Remove it (or keep if used elsewhere — search first with grep).

**Step 5: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

**Step 6: Commit**

```bash
git add apps/api/src/routes/exploration.ts apps/api/src/routes/combat.ts
git commit -m "feat: add room assignments to encounter site mob generation"
```

---

## Task 7: Strategy Selection Endpoint

**Files:**
- Modify: `apps/api/src/routes/combat.ts` (add new endpoint)

**Step 1: Add strategy selection endpoint**

Add after the `/sites/abandon` endpoint:

```typescript
const strategySchema = z.object({
  strategy: z.enum(['full_clear', 'room_by_room']),
});

/**
 * POST /api/v1/combat/sites/:id/strategy
 * Select clearing strategy for an encounter site.
 */
combatRouter.post('/sites/:id/strategy', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const siteId = req.params.id;
    const body = strategySchema.parse(req.body);

    const site = await prismaAny.encounterSite.findFirst({
      where: { id: siteId, playerId },
    });

    if (!site) {
      throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');
    }

    if (site.clearStrategy) {
      throw new AppError(400, 'Strategy already selected for this site', 'STRATEGY_ALREADY_SET');
    }

    await prismaAny.encounterSite.update({
      where: { id: siteId },
      data: {
        clearStrategy: body.strategy,
        fullClearActive: body.strategy === 'full_clear',
      },
    });

    res.json({
      success: true,
      encounterSiteId: siteId,
      strategy: body.strategy,
    });
  } catch (err) {
    next(err);
  }
});
```

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add apps/api/src/routes/combat.ts
git commit -m "feat: add strategy selection endpoint for encounter sites"
```

---

## Task 8: Room-Aware Combat Flow

**Files:**
- Modify: `apps/api/src/routes/combat.ts:421-812` (`POST /combat/start` handler)

This is the most complex task. The combat start endpoint needs to:
1. Require strategy to be set before fighting a site
2. Pick the next mob from the current room (not globally)
3. After victory, carry HP for room-based fighting
4. Handle room completion and room transitions
5. Handle knockout with strategy-specific behavior
6. Handle full-clear bonus on site completion

**Step 1: Update `getNextEncounterMob` for room awareness**

Replace the function to filter by current room:

```typescript
function getNextEncounterMob(mobs: EncounterMobState[], currentRoom: number): EncounterMobState | null {
  const alive = mobs.filter((mob) => mob.status === 'alive' && mob.room === currentRoom);
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}
```

Also add a helper to check room state:

```typescript
function getRoomState(mobs: EncounterMobState[], roomNumber: number): {
  total: number;
  alive: number;
  defeated: number;
} {
  const roomMobs = mobs.filter(m => m.room === roomNumber);
  let alive = 0, defeated = 0;
  for (const m of roomMobs) {
    if (m.status === 'alive') alive++;
    if (m.status === 'defeated') defeated++;
  }
  return { total: roomMobs.length, alive, defeated };
}

function getMaxRoom(mobs: EncounterMobState[]): number {
  return Math.max(...mobs.map(m => m.room), 1);
}

function getNextUnfinishedRoom(mobs: EncounterMobState[], startRoom: number): number | null {
  const maxRoom = getMaxRoom(mobs);
  for (let r = startRoom; r <= maxRoom; r++) {
    const state = getRoomState(mobs, r);
    if (state.alive > 0) return r;
  }
  return null;
}
```

**Step 2: Modify combat start to require strategy**

In the encounter site combat section (after site lookup, ~line 443):

```typescript
if (body.encounterSiteId) {
  const site = await prismaAny.encounterSite.findFirst({
    where: { id: body.encounterSiteId, playerId },
    include: { zone: { select: { id: true } } },
  });

  if (!site) {
    throw new AppError(404, 'Encounter site not found', 'NOT_FOUND');
  }

  if (!site.clearStrategy) {
    throw new AppError(400, 'Select a clearing strategy before fighting', 'STRATEGY_NOT_SET');
  }

  const decayed = await applyEncounterSiteDecayAndPersist({ ... }, new Date());
  if (!decayed) {
    throw new AppError(410, 'Encounter site has decayed', 'SITE_DECAYED');
  }

  // Get next mob from current room
  const currentRoom = site.currentRoom ?? 1;
  const nextMob = getNextEncounterMob(decayed.mobs, currentRoom);
  if (!nextMob) {
    throw new AppError(400, 'No mobs remaining in current room', 'ROOM_EMPTY');
  }

  consumedEncounterSiteId = site.id;
  consumedEncounterMobSlot = nextMob.slot;
  zoneId = site.zoneId;
  mobTemplateId = nextMob.mobTemplateId;
  mobPrefix = nextMob.prefix ?? null;
  siteStrategy = site.clearStrategy;
  siteCurrentRoom = currentRoom;
  siteFullClearActive = site.fullClearActive;

  // Apply carry HP if mid-room
  if (site.roomCarryHp !== null) {
    roomCarryHpOverride = site.roomCarryHp;
  }
}
```

Add new variables at the top of the handler:

```typescript
let siteStrategy = null as null | string;
let siteCurrentRoom = 1;
let siteFullClearActive = true;
let roomCarryHpOverride = null as null | number;
```

**Step 3: Apply carry HP before combat**

After building player stats but before running combat, if there's a carry HP override:

```typescript
if (roomCarryHpOverride !== null) {
  // Force player HP to carry value (bypass passive regen)
  await setHp(playerId, roomCarryHpOverride);
  playerStats.currentHp = roomCarryHpOverride;
  combatantA.stats.currentHp = roomCarryHpOverride;
}
```

Actually, this needs to happen before `buildPlayerCombatStats` is called, or we override after. The cleanest approach: after building `playerStats`, override the `currentHp` if `roomCarryHpOverride` is set.

**Step 4: Handle post-combat room logic**

In the transaction block where site mobs are updated (after victory):

```typescript
if (consumedEncounterSiteId && combatResult.outcome === 'victory') {
  // ... existing site refetch and decay logic ...

  target.status = 'defeated';

  // Check if current room is cleared
  const roomState = getRoomState(mobs, siteCurrentRoom);
  const maxRoom = getMaxRoom(mobs);
  let newCurrentRoom = siteCurrentRoom;
  let newRoomCarryHp: number | null = combatResult.combatantAHpRemaining;
  let siteCleared = false;

  if (roomState.alive <= 0) {
    // Room cleared
    if (siteStrategy === 'full_clear' && siteFullClearActive) {
      // Auto-advance to next room
      const nextRoom = getNextUnfinishedRoom(mobs, siteCurrentRoom + 1);
      if (nextRoom) {
        newCurrentRoom = nextRoom;
        // HP carries to next room in full clear
      } else {
        siteCleared = true;
      }
    } else {
      // Room by room: check if site is fully cleared
      const overallCounts = countEncounterSiteState(mobs);
      if (overallCounts.alive <= 0) {
        siteCleared = true;
      } else {
        // Room cleared, player can leave. Advance current room.
        const nextRoom = getNextUnfinishedRoom(mobs, siteCurrentRoom + 1);
        if (nextRoom) {
          newCurrentRoom = nextRoom;
        }
        newRoomCarryHp = null; // Clear carry HP — player can heal between rooms
        roomCleared = true; // Signal to frontend
      }
    }
  }

  if (siteCleared) {
    const isFullClear = siteStrategy === 'full_clear' && siteFullClearActive;
    siteCompletionRewards = await grantEncounterSiteChestRewardsTx(tx, {
      playerId,
      mobFamilyId: site.mobFamilyId,
      size: toEncounterSiteSize(site.size),
      fullClearBonus: isFullClear,
    });
    await txAny.encounterSite.deleteMany({ where: { id: consumedEncounterSiteId, playerId } });
    encounterSiteCleared = true;
  } else {
    await txAny.encounterSite.update({
      where: { id: consumedEncounterSiteId },
      data: {
        mobs: serializeEncounterSiteMobs(mobs),
        currentRoom: newCurrentRoom,
        roomCarryHp: newRoomCarryHp,
      },
    });
  }
}
```

**Step 5: Handle defeat in room context**

In the defeat handling section, add room-specific logic:

```typescript
if (combatResult.outcome === 'defeat' && consumedEncounterSiteId) {
  // Handle room-specific knockout
  const site = await prismaAny.encounterSite.findFirst({
    where: { id: consumedEncounterSiteId, playerId },
  });

  if (site) {
    const mobs = parseEncounterSiteMobs(site.mobs);

    if (siteStrategy === 'full_clear' && siteFullClearActive) {
      // Full clear failed: downgrade to room_by_room, keep kill progress
      await prismaAny.encounterSite.update({
        where: { id: consumedEncounterSiteId },
        data: {
          clearStrategy: 'room_by_room',
          fullClearActive: false,
          roomCarryHp: null,
        },
      });
    } else {
      // Room by room: reset current room's mobs to alive
      const resetMobs = mobs.map(m =>
        m.room === siteCurrentRoom && m.status === 'defeated'
          ? { ...m, status: 'alive' as const }
          : m
      );
      await prismaAny.encounterSite.update({
        where: { id: consumedEncounterSiteId },
        data: {
          mobs: serializeEncounterSiteMobs(resetMobs),
          roomCarryHp: null,
        },
      });
    }
  }
}
```

**Step 6: Update combat response to include room info**

Add to the response JSON:

```typescript
room: consumedEncounterSiteId ? {
  currentRoom: siteCurrentRoom,
  roomCleared: roomCleared ?? false,
  siteStrategy: siteStrategy,
} : undefined,
```

**Step 7: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

**Step 8: Commit**

```bash
git add apps/api/src/routes/combat.ts
git commit -m "feat: room-aware combat flow with HP carry and strategy handling"
```

---

## Task 9: Full-Clear Bonus in Chest Service

**Files:**
- Modify: `apps/api/src/services/chestService.ts:70-198`
- Modify: `packages/game-engine/src/exploration/encounterChest.ts`
- Modify: `packages/game-engine/src/exploration/encounterChest.test.ts`

**Step 1: Write failing test for chest tier upgrade**

Add to `encounterChest.test.ts`:

```typescript
import { getUpgradedChestSize } from './encounterChest';

describe('getUpgradedChestSize', () => {
  it('upgrades small to medium', () => {
    expect(getUpgradedChestSize('small')).toBe('medium');
  });

  it('upgrades medium to large', () => {
    expect(getUpgradedChestSize('medium')).toBe('large');
  });

  it('keeps large as large (no tier above)', () => {
    expect(getUpgradedChestSize('large')).toBe('large');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-engine/src/exploration/encounterChest.test.ts`
Expected: FAIL — `getUpgradedChestSize` not exported.

**Step 3: Implement `getUpgradedChestSize`**

Add to `encounterChest.ts`:

```typescript
export function getUpgradedChestSize(size: EncounterSiteSize): EncounterSiteSize {
  if (size === 'small') return 'medium';
  if (size === 'medium') return 'large';
  return 'large';
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/game-engine/src/exploration/encounterChest.test.ts`
Expected: All PASS.

**Step 5: Update `grantEncounterSiteChestRewardsTx` to accept full-clear bonus**

Modify the function signature in `chestService.ts`:

```typescript
export async function grantEncounterSiteChestRewardsTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    mobFamilyId: string;
    size: EncounterSiteSize;
    fullClearBonus?: boolean;
  }
): Promise<EncounterSiteChestRewards> {
```

Import `getUpgradedChestSize` and `FULL_CLEAR_CONSTANTS`:

```typescript
import {
  getChestRarityForEncounterSize,
  getUpgradedChestSize,
  rollChestMaterialRolls,
  rollEncounterChestRecipeDrop,
  type ChestRarity,
  type EncounterSiteSize,
} from '@adventure/game-engine';
import { FULL_CLEAR_CONSTANTS } from '@adventure/shared';
```

Apply bonus logic:

```typescript
const effectiveSize = params.fullClearBonus && FULL_CLEAR_CONSTANTS.CHEST_TIER_UPGRADE
  ? getUpgradedChestSize(params.size)
  : params.size;

const chestRarity = getChestRarityForEncounterSize(effectiveSize);
const materialRolls = rollChestMaterialRolls(effectiveSize);
```

For the recipe roll, apply multiplier:

```typescript
const baseRecipeChance = getChestRecipeChanceForEncounterSize(effectiveSize);
const recipeChance = params.fullClearBonus
  ? baseRecipeChance * FULL_CLEAR_CONSTANTS.RECIPE_MULTIPLIER
  : baseRecipeChance;
const rolledRecipe = Math.random() < recipeChance;
```

Replace the existing `rollEncounterChestRecipeDrop(params.size)` call with this custom roll.

For the drop chance multiplier, modify `pickWeightedChestDrop` or apply it during the loop:

```typescript
const dropMultiplier = params.fullClearBonus ? FULL_CLEAR_CONSTANTS.DROP_MULTIPLIER : 1;

// In the drop entries loop, apply multiplier to weights:
const adjustedEntries = dropEntries.map(e => ({
  ...e,
  dropChance: decimalLikeToNumber(e.dropChance) * dropMultiplier,
}));
```

**Step 6: Import `getChestRecipeChanceForEncounterSize`**

Add to the imports from `@adventure/game-engine`:

```typescript
import {
  getChestRarityForEncounterSize,
  getChestRecipeChanceForEncounterSize,
  getUpgradedChestSize,
  rollChestMaterialRolls,
  type ChestRarity,
  type EncounterSiteSize,
} from '@adventure/game-engine';
```

(Note: `rollEncounterChestRecipeDrop` is no longer imported since we do the roll manually.)

**Step 7: Build and typecheck**

Run: `npm run build --workspace=packages/game-engine && npm run typecheck`
Expected: Clean.

**Step 8: Commit**

```bash
git add packages/game-engine/src/exploration/encounterChest.ts packages/game-engine/src/exploration/encounterChest.test.ts apps/api/src/services/chestService.ts
git commit -m "feat: add full-clear bonus to chest reward service"
```

---

## Task 10: Update Site List Response with Room Info

**Files:**
- Modify: `apps/api/src/routes/combat.ts:244-389` (`GET /combat/sites` handler)

**Step 1: Add room info to site list response**

Update the `activeSites` type to include room fields:

```typescript
const activeSites: Array<{
  encounterSiteId: string;
  zoneId: string;
  zoneName: string;
  mobFamilyId: string;
  mobFamilyName: string;
  siteName: string;
  size: string;
  totalMobs: number;
  aliveMobs: number;
  defeatedMobs: number;
  decayedMobs: number;
  nextMobTemplateId: string | null;
  nextMobPrefix: string | null;
  discoveredAt: string;
  clearStrategy: string | null;
  currentRoom: number;
  totalRooms: number;
  roomMobCounts: Array<{ room: number; alive: number; total: number }>;
}> = [];
```

In the loop where sites are processed, add room computation:

```typescript
const mobs = decayed.mobs as (EncounterMobState & { room?: number })[];
const roomNumbers = [...new Set(mobs.map(m => m.room ?? 1))].sort((a, b) => a - b);
const roomMobCounts = roomNumbers.map(room => {
  const roomMobs = mobs.filter(m => (m.room ?? 1) === room);
  return {
    room,
    alive: roomMobs.filter(m => m.status === 'alive').length,
    total: roomMobs.length,
  };
});

activeSites.push({
  // ... existing fields ...
  clearStrategy: site.clearStrategy ?? null,
  currentRoom: site.currentRoom ?? 1,
  totalRooms: roomNumbers.length,
  roomMobCounts,
});
```

Update the response mapping to include the new fields.

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add apps/api/src/routes/combat.ts
git commit -m "feat: add room info to encounter sites list response"
```

---

## Task 11: Frontend — API Types & Strategy Selection

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add types and API function)
- Modify: `apps/web/src/app/game/useGameController.ts` (add strategy state and handler)

**Step 1: Add API types and function**

In `api.ts`, add the strategy selection function:

```typescript
export async function selectSiteStrategy(
  encounterSiteId: string,
  strategy: 'full_clear' | 'room_by_room'
) {
  return fetchApi<{ success: boolean; encounterSiteId: string; strategy: string }>(
    `/api/v1/combat/sites/${encounterSiteId}/strategy`,
    {
      method: 'POST',
      body: JSON.stringify({ strategy }),
    }
  );
}
```

Update the `PendingEncounter` type to include room fields:

```typescript
interface PendingEncounter {
  // ... existing fields ...
  clearStrategy: string | null;
  currentRoom: number;
  totalRooms: number;
  roomMobCounts: Array<{ room: number; alive: number; total: number }>;
}
```

Update the `CombatResponse` interface to include room info:

```typescript
combat: {
  // ... existing fields ...
  room?: {
    currentRoom: number;
    roomCleared: boolean;
    siteStrategy: string;
  };
};
```

**Step 2: Add strategy selection handler to useGameController**

```typescript
const handleSelectStrategy = useCallback(async (
  encounterSiteId: string,
  strategy: 'full_clear' | 'room_by_room'
) => {
  setBusyAction('strategy');
  try {
    await selectSiteStrategy(encounterSiteId, strategy);
    await refreshPendingEncounters();
  } catch (err) {
    pushLog({ type: 'error', message: `Failed to select strategy: ${(err as Error).message}` });
  } finally {
    setBusyAction(null);
  }
}, [refreshPendingEncounters, pushLog]);
```

Export it from the hook and pass it through to `CombatScreen`.

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new errors (some frontend type mismatches may need fixing where `PendingEncounter` is used).

**Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/game/useGameController.ts
git commit -m "feat: add strategy selection API and controller handler"
```

---

## Task 12: Frontend — Strategy Selection UI

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

**Step 1: Add strategy selection modal**

When a player clicks "Fight" on a site with no `clearStrategy` set, show a modal instead of starting combat:

```tsx
{showStrategyModal && (
  <div className="modal-overlay">
    <div className="rpg-card p-4">
      <h3 className="text-rpg-gold mb-2">Choose Strategy</h3>
      <p className="text-sm text-rpg-light-dim mb-4">
        {strategyModalSite?.siteName} — {strategyModalSite?.totalRooms} room(s)
      </p>
      <div className="flex flex-col gap-2">
        <button
          className="rpg-btn rpg-btn-primary"
          onClick={() => handleStrategySelect('full_clear')}
        >
          <span className="font-bold">Full Clear</span>
          <span className="text-xs block">Fight all rooms back-to-back. Better rewards on success.</span>
        </button>
        <button
          className="rpg-btn"
          onClick={() => handleStrategySelect('room_by_room')}
        >
          <span className="font-bold">Room by Room</span>
          <span className="text-xs block">Clear one room at a time. Heal between rooms.</span>
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 2: Update the "Fight" button logic**

Modify the `onStartCombat` callback to check if strategy is set:

```typescript
const handleFightClick = (site: PendingEncounter) => {
  if (!site.clearStrategy) {
    setStrategyModalSite(site);
    setShowStrategyModal(true);
  } else {
    onStartCombat(site.encounterSiteId);
  }
};
```

**Step 3: Show room info on encounter site rows**

Update the site row to show room progress:

```tsx
<span className="text-xs text-rpg-light-dim">
  Room {e.currentRoom}/{e.totalRooms} — {e.aliveMobs}/{e.totalMobs} mobs
</span>
```

**Step 4: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

**Step 5: Commit**

```bash
git add apps/web/src/app/game/screens/CombatScreen.tsx
git commit -m "feat: add strategy selection modal and room progress display"
```

---

## Task 13: Frontend — Room Combat Feedback

**Files:**
- Modify: `apps/web/src/components/combat/CombatRewardsSummary.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts` (handle room-cleared response)

**Step 1: Update combat result handling for rooms**

In `handleStartCombat`, after combat completes, check the `room` field in the response:

```typescript
if (data.combat.room?.roomCleared && data.combat.room.siteStrategy === 'room_by_room') {
  pushLog({
    type: 'success',
    message: `Room ${data.combat.room.currentRoom} cleared! You can rest before the next room.`,
  });
}
```

**Step 2: Update CombatRewardsSummary for full-clear bonus**

When `siteCompletion` rewards are shown and the strategy was full_clear, add a visual indicator:

```tsx
{rewards.siteCompletion && (
  <div>
    {rewards.fullClearBonus && (
      <div className="text-rpg-gold font-bold text-sm mb-1">
        FULL CLEAR BONUS — Enhanced Rewards!
      </div>
    )}
    {/* existing chest display */}
  </div>
)}
```

This requires passing `fullClearBonus` through the response. Add it to the `CombatResponse.rewards.siteCompletion` type:

```typescript
siteCompletion?: {
  // ... existing fields ...
  fullClearBonus?: boolean;
} | null;
```

And set it in the API response (combat.ts) when building `siteCompletionWithNames`:

```typescript
const siteCompletionWithNames = siteCompletionRewards
  ? {
      ...existing,
      fullClearBonus: siteStrategy === 'full_clear' && siteFullClearActive,
    }
  : null;
```

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No new errors.

**Step 4: Commit**

```bash
git add apps/web/src/components/combat/CombatRewardsSummary.tsx apps/web/src/app/game/useGameController.ts apps/web/src/lib/api.ts apps/api/src/routes/combat.ts
git commit -m "feat: add room combat feedback and full-clear bonus display"
```

---

## Task 14: Manual Testing & Polish

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test tier bleedthrough**

1. Create a fresh character or use an existing one at 0% exploration
2. Explore with 500-1000 turns in a zone
3. Verify that encounter sites sometimes contain tier 2 mobs (check site mob list)
4. Verify random zone combat occasionally spawns tier 2 mobs

**Step 3: Test room system**

1. Find an encounter site
2. Verify strategy selection modal appears on first fight
3. Test "Room by Room":
   - Fight through a room — verify HP carries between mobs
   - After room clear, verify you return to site list
   - Re-engage and verify next room loads
   - If knocked out mid-room, verify room mobs reset
4. Test "Full Clear":
   - Fight through all rooms continuously — verify HP carries
   - If knocked out, verify strategy downgrades and progress preserved
   - On success, verify full-clear bonus on chest rewards

**Step 4: Test edge cases**

- Site with only 1 room (small) — both strategies should work identically
- Site decay during a room fight
- Abandoning a site mid-room
- Sites discovered before the migration (no room field) — verify backward compatibility (default room=1)

**Step 5: Fix any issues found**

Address bugs and polish as needed.

**Step 6: Final commit**

```bash
git add -A
git commit -m "fix: polish room system and tier bleedthrough edge cases"
```
