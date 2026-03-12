# Guild Expeditions — Feedback Fixes & Mob Targeting

## Context

After initial playtesting of guild expeditions, 5 issues identified:

1. **Signup button stays clickable** after signing up
2. **"Next Round: Expired"** shows instead of auto-refreshing
3. **Can't see mob details** (names, HP) during combat
4. **No target coordination** — all players focus-fire lowest HP mob
5. **Expedition log is empty** — no outcome, loot, or contribution details

## Changes

### Step 1: Schema — Add `targetMobId`

**File:** `packages/database/prisma/schema.prisma`

Add nullable field to `GuildExpeditionMember`:
```prisma
targetMobId  String?  @map("target_mob_id")
```

New migration required.

---

### Step 2: Shared Types

**File:** `packages/shared/src/types/expedition.types.ts`

Add `currentRoomMobs` to `ExpeditionData`:
```ts
currentRoomMobs: { id: string; name: string; prefix: string | null; hp: number; maxHp: number }[];
```

Add `targetMobId` to `ExpeditionMemberData`:
```ts
targetMobId: string | null;
```

Add optional `targetMobId` to `RaidParticipant`:
```ts
targetMobId?: string | null;
```

Rebuild shared package after.

---

### Step 3: Backend

#### 3a: Expose mob data in API response

**File:** `apps/api/src/services/expeditionService.ts`

In `toExpeditionData`, extract current room mobs (id, name, prefix, hp, maxHp) from `roomDefinitions` JSON and include in the response.

In `toExpeditionMemberData`, include `targetMobId`.

#### 3b: New endpoint — `PATCH /expedition/:id/target`

**File:** `apps/api/src/routes/expedition.ts`

- Body: `{ targetMobId: string | null }` (null to clear / use auto)
- Validate: expedition is `in_progress`, player is a member, mob exists in current room and is alive
- Update `GuildExpeditionMember.targetMobId`

#### 3c: Reset `targetMobId` on room transitions

In `handleRoomCleared` and `handleWipe`, reset `targetMobId: null` alongside the other per-room resets (roomDamage, roomHealing, KO flags, threat).

#### 3d: Pass targeting to raid engine

In `buildRaidParticipant`, accept and forward `targetMobId` to the `RaidParticipant` struct. In `resolveExpeditionRound`, read each member's `targetMobId` and pass it through.

---

### Step 4: Game Engine — Per-player Targeting

**File:** `packages/game-engine/src/combat/raidRoundResolver.ts`

Player offensive phase (~line 140), change single-target selection:

**Before:**
```ts
const targets = isAoe
  ? aliveMobs
  : [aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];
```

**After:**
```ts
const preferredTarget = p.targetMobId
  ? aliveMobs.find(m => m.id === p.targetMobId)
  : null;
const targets = isAoe
  ? aliveMobs
  : [preferredTarget ?? aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];
```

Falls back to lowest HP if chosen mob is dead or not found.

---

### Step 5: Frontend API Client

**File:** `apps/web/src/lib/api/expedition.ts`

```ts
export async function setExpeditionTarget(expeditionId: string, targetMobId: string | null) {
  return fetchApi<{ success: boolean }>(`/api/v1/expedition/${expeditionId}/target`, {
    method: 'PATCH',
    body: JSON.stringify({ targetMobId }),
  });
}
```

---

### Step 6: Frontend UI

**File:** `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

#### 6a: Pass `playerId` prop

Add `playerId: string` to `GuildExpeditionsTabProps`. Pass from `GuildScreen.tsx` (already available).

#### 6b: Fix signup button (Bug 1)

In `RecruitingView`, check `members.some(m => m.playerId === playerId)`. If already signed up, disable button and show "Signed Up".

#### 6c: Fix expired timer (Bug 2)

Add `onExpired` callback to `Countdown` component. When `remaining <= 0`, call `onExpired` once. Wire to `loadExpedition()` in parent views.

#### 6d: Show mob HP bars (Bug 3)

In `InProgressView`, add "Current Room Mobs" section. Show each mob with name (including prefix), HP bar, color coding by health %.

#### 6e: Mob target selection (Bug 4)

Make each mob clickable. Highlight current player's selected target. Clicking a mob calls `setExpeditionTarget`. Show "Auto (lowest HP)" as default/reset option.

#### 6f: Richer outcome views (Bug 5)

Pass `members` to `CompletedView` and `FailedView`. Show:
- Clear victory/defeat outcome
- Participant contributions (damage + healing, sorted)
- Rooms cleared / total rooms

**File:** `apps/web/src/components/screens/GuildScreen.tsx`

Pass `playerId` to `GuildExpeditionsTab`.

---

## Verification

1. Schema migration: `npm run db:migrate`
2. Rebuild packages: `npm run build:packages`
3. Type check: `npm run typecheck`
4. Engine tests: `npm run test:engine`
5. API tests: `npm run test:api`
6. Manual: launch → signup → timer → mob display → targeting → outcome views
