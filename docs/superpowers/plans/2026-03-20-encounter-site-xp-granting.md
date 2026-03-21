# Encounter Site XP Granting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grant combat skill XP for each mob killed during encounter site combat (auto-resolve and manual), matching zone combat's XP pipeline.

**Architecture:** Encounter site combat currently runs through `encounterSiteCombatService.ts` using the raid round resolver, but never calls the XP granting pipeline. The fix loads `xpReward` for each mob template, sums XP for defeated mobs (applying prefix multipliers), calls `splitAndGrantXp`, includes XP grants in responses, and updates `stateUpdates` to include `skills` and `characterProgression`.

**Tech Stack:** TypeScript, Prisma, existing `splitAndGrantXp` + `serializeXpGrant` helpers.

**Worktree:** All work must be done in the existing encounter site rework worktree at `.worktrees/pocketrealm-encounter-site-rework/` (branch `encounter-site-rework`). Do NOT work in the main clone.

---

## Context

### Current Flow (no XP)

1. `autoResolveEncounterRoom` / `resolveManualEncounterRound` runs combat
2. Defeated mobs are tracked, site/room state is persisted
3. Activity log is created with combat data
4. **No XP is granted. No XP data in responses.**

### Target Flow

1. Combat runs (unchanged)
2. **Sum `xpReward` for each defeated mob** (with prefix multiplier)
3. **Call `splitAndGrantXp`** to grant XP to the player's combat skill
4. **Include `skillXpGrants` in HTTP response**
5. **Add `'skills'` and `'characterProgression'` to `buildStateUpdates`** calls in `sites.ts`

### Key Design Decisions

**XP splitting:** The raid round resolver doesn't track `damageByScalingStat` (only the template combat engine does). `splitAndGrantXp` handles this gracefully — when `damageByScalingStat` is undefined, all XP goes to the player's `attackSkill` (the fallback path). This is correct for encounter sites since players fight with one weapon.

**XP on defeat:** Zone combat grants zero XP on defeat. Encounter sites match this — XP is only granted when the room is cleared (all mobs killed). No partial XP for mobs killed before defeat.

**Activity logs:** XP data is NOT added to the activity log in this plan. The activity log is created inside the DB transaction (before XP granting happens outside it). The HTTP response provides XP data to the frontend, which is sufficient. Activity log XP can be added later if combat history needs it.

### Files

- Modify: `apps/api/src/services/encounterSiteCombatService.ts` — load xpReward, grant XP, return grants
- Modify: `apps/api/src/routes/combat/sites.ts` — forward XP grants in responses, add skills/characterProgression to stateUpdates
- Modify: `apps/web/src/lib/api/combat.ts` — add skillXpGrants to response types
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx` — display XP in result UI
- Test: `apps/api/src/services/encounterSiteCombatService.test.ts` — verify XP granting

### Reference Files (read before starting)

- `apps/api/src/services/combatOrchestrationService.ts` — `splitAndGrantXp` (lines 258-308)
- `apps/api/src/services/xpService.ts` — `grantSkillXp`, `GrantXpResult` type
- `apps/api/src/utils/routeHelpers.ts` — `serializeXpGrant` (lines 58-75)
- `apps/api/src/routes/combat/start.ts` — zone combat XP integration pattern (lines 240-250, 351, 402)
- `packages/shared/src/constants/mobPrefixes.ts` — `getMobPrefixDefinition` for xpMultiplier

---

### Task 1: Load xpReward and store combat metadata for XP

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts`

The `loadRoomMobsAsRaidState` Prisma query doesn't select `xpReward`. We need it to compute XP for defeated mobs.

- [ ] **Step 1: Add xpReward to the Prisma select in `loadRoomMobsAsRaidState`**

Add `xpReward: true` to the select clause at line 322-326. Return a `mobXpByTemplateId` record alongside the mobs.

Change the function signature:

```typescript
async function loadRoomMobsAsRaidState(
  roomMobs: EncounterMobSlot[],
  zoneId: string,
  mobFamilyId: string,
): Promise<{ mobs: ExpeditionMobState[]; mobXpByTemplateId: Record<string, number> }> {
```

Update the select to include `xpReward: true`.

Build the XP lookup as a plain `Record` (avoids Map↔Object conversion for Redis):
```typescript
const mobXpByTemplateId: Record<string, number> = {};
for (const t of mobTemplateRows) mobXpByTemplateId[t.id] = t.xpReward;
```

Return `{ mobs: expeditionMobs, mobXpByTemplateId }`.

- [ ] **Step 2: Refactor `buildParticipantForEncounterSite` to return XP-relevant metadata**

Currently this function calls `preparePlayerForCombat` internally but discards `attackSkill` and `guildMods.xpBoost`. Refactor to return them alongside the participant so callers don't need a second `preparePlayerForCombat` call after combat:

```typescript
async function buildParticipantForEncounterSite(
  playerId: string,
  username: string,
  currentHp: number,
  maxHp: number,
): Promise<{ participant: RaidParticipant; attackSkill: AttackSkill; guildXpBoost: number }> {
```

Import `type { AttackSkill }` from `../services/combatStatsService` (already imported in the file for `preparePlayerForCombat`).

Return `{ participant, attackSkill: prep.attackSkill, guildXpBoost: prep.guildMods.xpBoost }` alongside the existing `RaidParticipant` construction.

- [ ] **Step 3: Update callers of both functions**

**`autoResolveEncounterRoom`:** Destructure new shapes:
```typescript
const { mobs: expeditionMobs, mobXpByTemplateId } = await loadRoomMobsAsRaidState(...);
const { participant, attackSkill, guildXpBoost } = await buildParticipantForEncounterSite(...);
```

**`startManualEncounterRoom`:** Destructure and store in Redis session. Add fields to `ManualCombatState`:
```typescript
mobXpByTemplateId: Record<string, number>;
roomMobSlots: EncounterMobSlot[];  // original slots with prefix data for XP computation
attackSkill: string;
guildXpBoost: number;
```

Populate when creating the session:
```typescript
mobXpByTemplateId,
roomMobSlots: roomMobs,
attackSkill,
guildXpBoost,
```

- [ ] **Step 4: Verify build passes**

Run: `npx tsc -p apps/api/tsconfig.json --noEmit`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.ts
git commit -m "feat(encounter): load xpReward and expose attackSkill/guildXpBoost for XP granting"
```

---

### Task 2: Grant XP after auto-resolve combat

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts`
- Modify: `apps/api/src/routes/combat/sites.ts`

- [ ] **Step 1: Import XP dependencies in encounterSiteCombatService**

```typescript
import { splitAndGrantXp } from './combatOrchestrationService';
import type { GrantXpResult } from './xpService';
import { getMobPrefixDefinition } from '@pocketrealm/shared';
```

- [ ] **Step 2: Add helper to compute total XP for defeated mobs**

Add after `handleEncounterDefeat`. Export it for testing.

```typescript
export function computeDefeatedMobXp(
  defeatedMobIds: Set<string>,
  roomMobs: EncounterMobSlot[],
  mobXpByTemplateId: Record<string, number>,
): number {
  let totalXp = 0;
  for (const slot of roomMobs) {
    const mobId = makeEncounterMobId(slot.slot);
    if (!defeatedMobIds.has(mobId)) continue;
    const baseXp = mobXpByTemplateId[slot.mobTemplateId];
    if (baseXp === undefined) continue;
    let xp = baseXp;
    const prefix = getMobPrefixDefinition(slot.prefix);
    if (prefix) {
      xp = Math.max(1, Math.floor(xp * (prefix.xpMultiplier ?? 1)));
    }
    totalXp += xp;
  }
  return totalXp;
}
```

- [ ] **Step 3: Add xpGrants to AutoResolveEncounterResult**

```typescript
xpGrants: GrantXpResult[];
```

- [ ] **Step 4: Grant XP in autoResolveEncounterRoom**

After `setAllResources` (line ~690), before `handleEncounterDefeat`:

```typescript
// Grant XP for defeated mobs (only on room clear, not on defeat)
let xpGrants: GrantXpResult[] = [];
if (combatResult.outcome === 'cleared') {
  const totalXp = computeDefeatedMobXp(defeatedMobIds, roomMobs, mobXpByTemplateId);
  if (totalXp > 0) {
    xpGrants = await splitAndGrantXp(
      playerId, totalXp, attackSkill,
      undefined, undefined, guildXpBoost,
    );
  }
}
```

`attackSkill` and `guildXpBoost` come from the refactored `buildParticipantForEncounterSite` (Task 1).

Include `xpGrants` in the return value.

- [ ] **Step 5: Forward XP grants in sites.ts auto-resolve route**

Import `serializeXpGrant` from `../../utils/routeHelpers.js`.

Add to the auto-resolve response:
```typescript
skillXpGrants: result.xpGrants.map(serializeXpGrant),
```

Update the `buildStateUpdates` call to include `'skills'` and `'characterProgression'`:
```typescript
const stateUpdates = await buildStateUpdates(playerId, ['hp', 'resources', 'buffs', 'skills', 'characterProgression']);
```

- [ ] **Step 6: Verify build passes**

Run: `npx tsc -p apps/api/tsconfig.json --noEmit`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.ts apps/api/src/routes/combat/sites.ts
git commit -m "feat(encounter): grant XP for defeated mobs in auto-resolve"
```

---

### Task 3: Grant XP after manual combat round completion

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts`
- Modify: `apps/api/src/routes/combat/sites.ts`

**Important:** `state.mobs` (from `result.mobsAfter` in the raid resolver) only contains alive mobs — dead mobs are filtered out. So we cannot iterate `state.mobs` to find killed mobs. Instead, use `state.roomMobSlots` (the original slot data stored in Redis in Task 1) which has all mobs with their `mobTemplateId` and `prefix`. When `roomCleared` is true, ALL room mobs were killed, so we sum XP for every slot.

- [ ] **Step 1: Add xpGrants to ManualRoundResult**

```typescript
xpGrants: GrantXpResult[];
```

- [ ] **Step 2: Grant XP in resolveManualEncounterRound when room clears**

After `setAllResources` (line ~1195), before the defeat handling:

```typescript
let xpGrants: GrantXpResult[] = [];
if (roomCleared) {
  // All room mobs are killed — sum XP for every mob slot in the room
  let totalXp = 0;
  for (const slot of state.roomMobSlots) {
    const baseXp = state.mobXpByTemplateId[slot.mobTemplateId];
    if (baseXp === undefined) continue;
    let xp = baseXp;
    const prefix = getMobPrefixDefinition(slot.prefix);
    if (prefix) xp = Math.max(1, Math.floor(xp * (prefix.xpMultiplier ?? 1)));
    totalXp += xp;
  }
  if (totalXp > 0) {
    xpGrants = await splitAndGrantXp(
      playerId, totalXp, state.attackSkill as AttackSkill,
      undefined, undefined, state.guildXpBoost,
    );
  }
}
```

Include `xpGrants` in the return value.

- [ ] **Step 3: Forward XP grants in sites.ts round route**

Add `skillXpGrants` to the round response (only when combat ends):
```typescript
...(combatEnded && result.xpGrants?.length ? { skillXpGrants: result.xpGrants.map(serializeXpGrant) } : {}),
```

Update `buildStateUpdates` call to include `'skills'` and `'characterProgression'`:
```typescript
const stateUpdates = combatEnded
  ? await buildStateUpdates(playerId, ['hp', 'resources', 'buffs', 'skills', 'characterProgression'])
  : undefined;
```

- [ ] **Step 4: Verify build passes**

Run: `npx tsc -p apps/api/tsconfig.json --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.ts apps/api/src/routes/combat/sites.ts
git commit -m "feat(encounter): grant XP for defeated mobs in manual combat"
```

---

### Task 4: Frontend — add XP to response types and display

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`

- [ ] **Step 1: Add skillXpGrants to response types**

In `EncounterAutoResolveResponse`:
```typescript
skillXpGrants?: Array<{
  skillType: string;
  xpGained: number;
  xpAfterEfficiency: number;
  newLevel: number;
  leveledUp: boolean;
  characterLeveledUp?: boolean;
}>;
```

Add the same field to `EncounterManualRoundResponse`.

- [ ] **Step 2: Display XP in EncounterSiteCombatView room result**

Add state for XP grants:
```typescript
const [xpGrants, setXpGrants] = useState<EncounterAutoResolveResponse['skillXpGrants']>([]);
```

Capture from auto-resolve result:
```typescript
if (result.skillXpGrants) setXpGrants(result.skillXpGrants);
```

Capture from manual round result (when combat ends with clear):
```typescript
if (result.skillXpGrants) setXpGrants(result.skillXpGrants);
```

Clear on retry/advance:
```typescript
setXpGrants([]);
```

Display in the room result section (after the room cleared / site cleared header, before buttons). Show in both `outcome === 'cleared'` and `outcome === 'site_cleared'` sections:
```typescript
{xpGrants && xpGrants.length > 0 && (
  <div className="mt-1 space-y-0.5">
    {xpGrants.map(g => (
      <div key={g.skillType} className="text-xs text-[var(--rpg-text-primary)]">
        +{g.xpAfterEfficiency} {g.skillType.charAt(0).toUpperCase() + g.skillType.slice(1)} XP
        {g.leveledUp && <span className="text-[var(--rpg-gold)] ml-1">Level {g.newLevel}!</span>}
      </div>
    ))}
  </div>
)}
```

Do NOT show XP in the defeat section (XP is not granted on defeat).

- [ ] **Step 3: Verify build passes**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no new errors (pre-existing test errors are fine)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/combat.ts apps/web/src/components/encounter/EncounterSiteCombatView.tsx
git commit -m "feat(encounter): display XP grants in encounter site combat UI"
```

---

### Task 5: Write tests for XP computation

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.test.ts`

- [ ] **Step 1: Write tests for `computeDefeatedMobXp` helper**

Test cases:
- Returns 0 when no mobs defeated
- Sums xpReward for defeated mobs only (not alive ones)
- Applies prefix xpMultiplier when mob has a prefix
- Handles missing template gracefully (returns 0 for that mob)
- Multiple mobs with same templateId each grant XP independently

```typescript
import { computeDefeatedMobXp } from './encounterSiteCombatService';
import type { EncounterMobSlot } from '@pocketrealm/shared';

describe('computeDefeatedMobXp', () => {
  const makeSlot = (slot: number, mobTemplateId: string, prefix: string | null = null): EncounterMobSlot => ({
    slot, mobTemplateId, role: 'trash', prefix, status: 'alive', room: 1,
  });

  it('returns 0 when no mobs defeated', () => {
    const defeated = new Set<string>();
    const slots = [makeSlot(0, 'mob-a')];
    const xpMap = { 'mob-a': 10 };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(0);
  });

  it('sums xpReward for defeated mobs only', () => {
    const defeated = new Set(['encounter-mob-0', 'encounter-mob-1']);
    const slots = [makeSlot(0, 'mob-a'), makeSlot(1, 'mob-b'), makeSlot(2, 'mob-a')];
    const xpMap = { 'mob-a': 10, 'mob-b': 20 };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(30);
  });

  it('applies prefix xpMultiplier', () => {
    const defeated = new Set(['encounter-mob-0']);
    const slots = [makeSlot(0, 'mob-a', 'Savage')];
    const xpMap = { 'mob-a': 10 };
    // Savage prefix has xpMultiplier > 1 — result should be > 10
    const result = computeDefeatedMobXp(defeated, slots, xpMap);
    expect(result).toBeGreaterThan(10);
  });

  it('returns 0 for missing template', () => {
    const defeated = new Set(['encounter-mob-0']);
    const slots = [makeSlot(0, 'unknown-mob')];
    const xpMap = {};
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(0);
  });

  it('grants XP independently for same template used multiple times', () => {
    const defeated = new Set(['encounter-mob-0', 'encounter-mob-1']);
    const slots = [makeSlot(0, 'mob-a'), makeSlot(1, 'mob-a')];
    const xpMap = { 'mob-a': 15 };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run apps/api/src/services/encounterSiteCombatService.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.test.ts
git commit -m "test(encounter): add tests for encounter site XP computation"
```
