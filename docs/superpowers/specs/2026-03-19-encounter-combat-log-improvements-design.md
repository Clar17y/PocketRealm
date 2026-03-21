# Encounter Site Combat Log Improvements

**Date:** 2026-03-19
**Branch:** encounter-site-rework

## Problem

Four issues with encounter site combat logs:

1. Hit chance detail shows raw floats and misleading format (both encounter site and 1v1)
2. Round logs lost when player leaves and rejoins mid-combat
3. Mob attack log entries show only DODGED/BLOCKED/damage with no detail on why
4. Encounter site room combat has no history — results aren't stored or viewable in the History tab

**Dependencies:** Section 4 depends on Section 2 (needs `roundLogs` in Redis state for the manual path's ActivityLog).

## 1. Unified Hit Chance Formatting

### Current state

**1v1 format** (`formatHitBreakdown` in `combatLogEntryUtils.ts`):
```
Roll: 15 + 12 ACC | 50.0% chance (12 hit vs 2 avoid), sample 0.44 => Hit
```
The `Roll: 15 + 12 ACC` is misleading — the D20 roll doesn't determine hit/miss (except natural 1/20). The actual outcome is `hitRollValue < hitChance`.

**Encounter site format** (`AttackDetail` in `RoundLogAttackRow.tsx`):
```
Roll: 0.8551954555567556 + 12 ACC | 42% chance (12 hit vs 5 avoid), sample 0.01 => Miss
```
Bugs: raw float for roll, `hitRollValue/100` for sample (nonsensical), integer percentage.

### Target format (both systems)

```
42.35% chance (12 hit vs 5 avoid), sample 0.86 => Miss
```

Shows: probability (2 DP), the scores that produced it, the random sample (2 DP), and the outcome.

### Changes

- **`combatLogEntryUtils.ts`** — rewrite `formatHitBreakdown` to use unified format, drop `Roll: X + Y ACC`. Call `formatHitBreakdown` from both rendering paths.
- **`RoundLogAttackRow.tsx`** — rewrite `AttackDetail` to call `formatHitBreakdown` (returns string) instead of inline JSX formatting.

## 2. Round Log Persistence on Rejoin

### Current state

When a player navigates away mid-manual-combat and returns, the `EncounterSiteCombatView` remounts with empty state. The resume probe calls `startManualEncounterRoom` which returns session state (HP, mobs, round number) but not prior round logs. The `roundLogs` field was removed from `ManualCombatState` during a refactoring pass.

### Changes

- **`ManualCombatState`** — re-add `roundLogs: ExpeditionRoundLog[]`
- **`resolveManualEncounterRound`** — re-add `state.roundLogs.push(result.roundLog)` after each round
- **`StartManualRoomResult`** — add `roundLogs: ExpeditionRoundLog[]` field
- **`startManualEncounterRoom` resume path** — return `existingState.roundLogs ?? []` (backwards compatible with sessions created before this change)
- **Route handler** (`sites.ts` start-room) — pass through `roundLogs` in response DTO
- **Frontend `EncounterStartRoomResponse`** — add `roundLogs?: ExpeditionRoundLog[]` field
- **`EncounterSiteCombatView` resume probe** — seed `setRoundLogs(result.roundLogs ?? [])` from the response

## 3. Mob Attack Detail in Logs

### Current state

`MobActionLogEntry.targets[]` only tracks `blocked: boolean`, `dodged: boolean`, `damageTaken: number`. No hit chance, accuracy scores, or roll values. The game engine computes all these values at `raidRoundResolver.ts:882-889` but discards them.

### Type change

In `packages/shared/src/types/expedition.types.ts`, extend the targets entry:

```typescript
targets: {
  // existing fields
  playerId: string;
  username: string;
  damageTaken: number;
  blocked: boolean;
  dodged: boolean;
  knockedOut: boolean;
  // new: hit resolution detail (optional for backwards compatibility)
  hitChance?: number;
  hitRollValue?: number;
  mobHitScore?: number;
  playerAvoidScore?: number;
  damageRoll?: number;
}[];
```

### Game engine changes

In `raidRoundResolver.ts`, populate the new fields at each mob attack outcome point:

- **Block**: set `mobHitScore`, `playerAvoidScore` (hit check was skipped due to block stance)
- **Dodge**: capture `hitResult.hitChance`, `hitResult.hitRollValue`, `mobHitScore`, `playerAvoidScore` from the existing `resolveHitCheck` call
- **Hit**: same hit resolution fields plus `damageRoll` (raw damage before mitigation, from `dmgRaw`)
- **`alwaysHits` path**: when `mActionDef.alwaysHits` is true, the hit check is skipped entirely. Set no hit resolution fields (they remain `undefined`). Frontend renders "Guaranteed Hit" instead of a breakdown.

### Frontend changes

In `RoundLogContent.tsx`, make each mob target entry clickable/expandable (matching the pattern in `RoundLogAttackRow`):

- **Dodge**: `42.35% chance (8 hit vs 12 avoid), sample 0.86 => Dodge`
- **Block**: `Blocked (hit check skipped)`
- **Hit with detail**: `62.50% chance (8 hit vs 5 avoid), sample 0.07 => Hit` + `Damage: 12 raw = 12 final`
- **`alwaysHits`**: `Guaranteed Hit` + `Damage: 12 raw = 12 final`

Use the same unified format from section 1 (call `formatHitBreakdown`).

## 4. Encounter Site Combat History

### Storage

After each room resolves (both auto-resolve and manual), create an ActivityLog entry inside the existing transaction block. Use `activityType: 'combat'` with `source: 'encounter_site_room'` to match the existing encounter site pattern (`source: 'encounter_site'` / `source: 'encounter_site_fight'`):

```typescript
tx.activityLog.create({
  data: {
    playerId,
    activityType: 'combat',
    turnsSpent: turnCost,
    result: {
      source: 'encounter_site_room',
      siteId,
      siteName,
      mobFamilyName,
      mobFamilyId,
      zoneId,
      zoneName,
      room: currentRoom,
      totalRooms,
      outcome: 'cleared' | 'defeated',
      mode: 'auto' | 'manual',
      roundsResolved: number,
      rounds: ExpeditionRoundLog[],
      initialMobs: Array<{ mobId, slot, name, prefix, hp, maxHp }>,
      siteCleared: boolean,
      chestReward: completionRewards | null,
    },
  },
});
```

### Data availability

**Auto-resolve path**: the site query already includes `mobFamily: { select: { name: true } }`. Add `zone: { select: { name: true } }` to get `zoneName`. All other fields are available locally.

**Manual path**: `ManualCombatState` needs additional fields populated at session creation time:
- `siteName` — from the site query
- `zoneId` — from the site query
- `zoneName` — add `zone: { select: { name: true } }` to the `startManualEncounterRoom` site query
- `mobFamilyName` — add `mobFamily: { select: { name: true } }` to the same query
- `initialMobs` — capture from `expeditionMobs` at session creation

The `startManualEncounterRoom` query (line 763) needs `include: { zone: { select: { name: true } }, mobFamily: { select: { name: true } } }`.

The accumulated `roundLogs` from Section 2 provides the `rounds` array for the manual path's ActivityLog entry.

### API changes

In `apps/api/src/routes/combat/logs.ts`, the existing list query already filters on `activityType = 'combat'`, so `encounter_site_room` entries will be included automatically. The existing exclusion filter `COALESCE(("result"->>'source'), '') <> 'encounter_site_fight'` should be extended to also exclude `'encounter_site_room'` from the main list if we want them in a separate section, or keep them mixed in (design choice: keep them mixed in, distinguished by rendering).

The detail endpoint (`GET /logs/:id`) also uses `activityType: 'combat'`, so it will find these entries. The response needs a `source` field passed through so the frontend can branch rendering.

### Frontend changes

In `CombatHistory.tsx`, add a rendering branch when `source === 'encounter_site_room'`:

**List item:**
- Left: mob family image (if available) or site icon
- Title: site name
- Subtitle: "Room 2/5 · Auto · 3 rounds"
- Right: outcome badge (Cleared / Defeated), zone name

**Detail view:**
- Header: site name, room X/Y, mode, outcome
- Chest reward display (if site cleared and rewards present)
- Round-by-round log using `RoundLogContent` component (same component used in live combat)
- Initial mob roster display

The detail API response needs `source` included so the frontend can distinguish `encounter_site_room` from regular combat. Add `source` to the response type (or extract it from the `result` JSON in the existing query).

### Edge cases

- **Abandoned/decayed sites**: if a site disappears mid-manual-combat, the transaction throws `ENCOUNTER_SITE_UNAVAILABLE` before the ActivityLog is created. No log is stored for abandoned combats. This is intended — only completed room fights get logged.
- **Large logs**: `ExpeditionRoundLog[]` per room can be several KB for long fights. This matches existing 1v1 behavior (full combat logs in ActivityLog JSON). Acceptable trade-off.

## Files touched

### Packages
- `packages/shared/src/types/expedition.types.ts` — extend MobActionLogEntry targets
- `packages/game-engine/src/combat/raidRoundResolver.ts` — populate hit detail fields

### API
- `apps/api/src/services/encounterSiteCombatService.ts` — re-add roundLogs, add ManualCombatState fields, add ActivityLog creation, add zone/mobFamily includes
- `apps/api/src/routes/combat/sites.ts` — pass through roundLogs on resume
- `apps/api/src/routes/combat/logs.ts` — ensure source is passed through in detail response

### Frontend
- `apps/web/src/components/combat/combatLogEntryUtils.ts` — rewrite formatHitBreakdown
- `apps/web/src/components/common/combat/RoundLogAttackRow.tsx` — rewrite AttackDetail to call formatHitBreakdown
- `apps/web/src/components/common/combat/RoundLogContent.tsx` — add expandable mob attack detail
- `apps/web/src/components/screens/CombatHistory.tsx` — add encounter_site_room rendering branch
- `apps/web/src/lib/api/combat.ts` — add roundLogs to EncounterStartRoomResponse
- `apps/web/src/components/encounter/EncounterSiteCombatView.tsx` — restore roundLogs on resume
