# Encounter Site Combat Log Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hit chance formatting, persist round logs on rejoin, add mob attack detail to encounter logs, and store/display encounter site room combat history.

**Architecture:** Four independent improvements sharing some data flow: (1) unified hit breakdown formatter used by both 1v1 and encounter log rendering, (2) round logs re-added to Redis manual combat session and returned on resume, (3) `MobActionLogEntry.targets` extended with hit resolution fields populated in the raid round resolver, (4) ActivityLog entries created per-room with `source: 'encounter_site_room'` and rendered in CombatHistory.

**Tech Stack:** TypeScript, Next.js, Express, Prisma, Redis, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-encounter-combat-log-improvements-design.md`

**Worktree:** `D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework`

**Build commands:**
```bash
npm run build -w packages/shared     # After shared type changes
npm run build -w packages/game-engine # After engine changes
npm run test:engine                   # 755 tests
npm run test:api                      # 1793 tests
npx tsc -p apps/api/tsconfig.json    # API typecheck
npx tsc -p apps/web/tsconfig.json    # Web typecheck (ignore pre-existing test errors)
```

---

## Task 1: Unified Hit Chance Formatter

Rewrite `formatHitBreakdown` to drop the misleading `Roll: X + Y ACC` prefix and use `{pct}% chance ({hit} hit vs {avoid} avoid), sample {sample} => {result}` with 2 DP formatting. Update existing tests.

**Files:**
- Modify: `apps/web/src/components/combat/combatLogEntryUtils.ts`
- Modify: `apps/web/src/components/combat/combatLogEntryUtils.test.ts`

- [ ] **Step 1: Update the test to expect new format**

In `combatLogEntryUtils.test.ts`, rewrite the existing test to match the new format. The function signature stays the same (still accepts `HitBreakdownEntry`), but the output format changes:

```typescript
import { describe, expect, it } from 'vitest';
import { formatHitBreakdown } from './combatLogEntryUtils';

describe('formatHitBreakdown', () => {
  it('formats hit breakdown with 2DP percentage and sample', () => {
    const text = formatHitBreakdown({
      hitChance: 0.25,
      hitRollValue: 0.95,
      attackerHitScore: 12,
      defenderAvoidScore: 2,
    });

    expect(text).toBe('25.00% chance (12 hit vs 2 avoid), sample 0.95 => Miss');
  });

  it('formats a hit result', () => {
    const text = formatHitBreakdown({
      hitChance: 0.5,
      hitRollValue: 0.44,
      attackerHitScore: 12,
      defenderAvoidScore: 2,
    });

    expect(text).toBe('50.00% chance (12 hit vs 2 avoid), sample 0.44 => Hit');
  });

  it('returns null when required fields are missing', () => {
    const text = formatHitBreakdown({});
    expect(text).toBeNull();
  });

  it('still accepts legacy fields without breaking (returns null if no new fields)', () => {
    const text = formatHitBreakdown({
      roll: 4,
      accuracyModifier: 0,
    });
    expect(text).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx vitest run apps/web/src/components/combat/combatLogEntryUtils.test.ts`

Expected: FAIL — old format doesn't match new assertions.

- [ ] **Step 3: Rewrite formatHitBreakdown**

In `combatLogEntryUtils.ts`, replace the entire file:

```typescript
type HitBreakdownEntry = {
  roll?: number;
  accuracyModifier?: number;
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
};

export function formatHitBreakdown(entry: HitBreakdownEntry): string | null {
  if (
    entry.hitChance !== undefined &&
    entry.hitRollValue !== undefined &&
    entry.attackerHitScore !== undefined &&
    entry.defenderAvoidScore !== undefined
  ) {
    const result = entry.hitRollValue < entry.hitChance ? 'Hit' : 'Miss';
    return `${(entry.hitChance * 100).toFixed(2)}% chance `
      + `(${entry.attackerHitScore} hit vs ${entry.defenderAvoidScore} avoid), `
      + `sample ${entry.hitRollValue.toFixed(2)} => ${result}`;
  }

  return null;
}
```

Key changes: dropped `entry.roll` requirement, dropped `Roll: X + ACC` prefix, use `.toFixed(2)` for percentage and sample.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx vitest run apps/web/src/components/combat/combatLogEntryUtils.test.ts`

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Update AttackDetail in RoundLogAttackRow.tsx to use formatHitBreakdown**

In `apps/web/src/components/common/combat/RoundLogAttackRow.tsx`, add the import and rewrite `AttackDetail`:

Add import at top:
```typescript
import { formatHitBreakdown } from '../../combat/combatLogEntryUtils';
```

Replace the `AttackDetail` function (lines 28-54) with:
```typescript
function AttackDetail({ attack }: { attack: PlayerAttackEntry }) {
  const hitText = formatHitBreakdown({
    hitChance: attack.hitChance,
    hitRollValue: attack.hitRollValue,
    attackerHitScore: attack.attackerHitScore,
    defenderAvoidScore: attack.defenderAvoidScore,
  });

  return (
    <div className="ml-2 mt-0.5 text-[var(--rpg-text-secondary)] opacity-80 space-y-0.5">
      {hitText && <div>{hitText}</div>}
      {attack.hit && attack.totalDamage !== undefined && (
        <div>
          Damage: {attack.damageRoll ?? attack.totalDamage} raw
          {attack.crit && ' \u00d7 1.5 crit'}
          {' = '}{attack.totalDamage} final
        </div>
      )}
      {(attack.staminaCost > 0 || attack.manaCost > 0) && (
        <div>
          {attack.staminaCost > 0 && <span className="text-teal-400">-{attack.staminaCost} STA</span>}
          {attack.staminaCost > 0 && attack.manaCost > 0 && ' / '}
          {attack.manaCost > 0 && <span className="text-[var(--rpg-blue-light)]">-{attack.manaCost} MP</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and verify**

Run: `cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx tsc -p apps/web/tsconfig.json 2>&1 | grep -v "\.test\." | grep "error TS"`

Expected: No errors from changed files.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/combat/combatLogEntryUtils.ts apps/web/src/components/combat/combatLogEntryUtils.test.ts apps/web/src/components/common/combat/RoundLogAttackRow.tsx
git commit -m "fix: unify hit chance format across 1v1 and encounter combat logs"
```

---

## Task 2: Extend MobActionLogEntry with Hit Resolution Fields

Add optional hit detail fields to the mob attack target type in shared, then populate them in the game engine.

**Files:**
- Modify: `packages/shared/src/types/expedition.types.ts`
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`

- [ ] **Step 1: Extend MobActionLogEntry.targets type**

In `packages/shared/src/types/expedition.types.ts`, find the `MobActionLogEntry` interface (line 238) and extend the targets array element type. Replace the `targets` field:

```typescript
export interface MobActionLogEntry {
  mobId: string;
  mobName: string;
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  wasTelegraphed: boolean;
  targets: {
    playerId: string;
    username: string;
    damageTaken: number;
    blocked: boolean;
    dodged: boolean;
    knockedOut: boolean;
    hitChance?: number;
    hitRollValue?: number;
    mobHitScore?: number;
    playerAvoidScore?: number;
    damageRoll?: number;
  }[];
}
```

- [ ] **Step 2: Build shared package**

Run: `cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npm run build -w packages/shared`

Expected: Clean build.

- [ ] **Step 3: Populate hit detail fields in raidRoundResolver.ts**

In `packages/game-engine/src/combat/raidRoundResolver.ts`, update the three mob attack target push sites.

**Block path** (~line 869): Add `mobHitScore` and `playerAvoidScore`. These variables are scoped outside the block check (mob offensive calculation starts earlier). The block check happens at ~line 864 *before* the `resolveHitCheck` call, so `mobHitScore` and `playerAvoidScore` are available. Replace the block push:

```typescript
            mobLogEntry.targets.push({
              playerId: targetId,
              username: getUsername(targetId),
              damageTaken: 0,
              blocked: true,
              dodged: false,
              knockedOut: false,
              mobHitScore,
              playerAvoidScore,
            });
```

**Dodge path** (~line 903): The `hitResult` from `resolveHitCheck` is in scope. Replace:

```typescript
            mobLogEntry.targets.push({
              playerId: targetId,
              username: getUsername(targetId),
              damageTaken: 0,
              blocked: false,
              dodged: true,
              knockedOut: false,
              hitChance: hitResult.hitChance,
              hitRollValue: hitResult.hitRollValue,
              mobHitScore,
              playerAvoidScore,
            });
```

**Hit path** (~line 963): `hitResult` may or may not exist (if `alwaysHits` is true, the hit check is skipped). `dmgRaw` is available at ~line 915. The `damage` variable (final after mitigation) is at ~line 957. Replace:

```typescript
          mobLogEntry.targets.push({
            playerId: targetId,
            username: getUsername(targetId),
            damageTaken: damage,
            blocked: false,
            dodged: false,
            knockedOut: targetState.hp <= 0,
            hitChance: hitResult?.hitChance,
            hitRollValue: hitResult?.hitRollValue,
            mobHitScore,
            playerAvoidScore,
            damageRoll: dmgRaw,
          });
```

Note: For `alwaysHits` attacks, `hitResult` is undefined because the `resolveHitCheck` call is inside `if (!mActionDef.alwaysHits)`. Using optional chaining (`hitResult?.hitChance`) handles this — the fields will be `undefined`, which the frontend renders as "Guaranteed Hit". However, `mobHitScore` and `playerAvoidScore` are set *before* the `if (!mActionDef.alwaysHits)` block — check scope. If they're inside the block, move them before it or use the mob's base stats directly. Read lines 880-883 to confirm:

```typescript
        // Line 880-883:
        if (!mActionDef.alwaysHits) {
          const mobHitScore = mob.stats.accuracy + (mActionDef.accuracyModifier ?? 0);
          const playerAvoidScore = calculateAvoidScore(targetParticipant.stats);
```

They ARE inside the `if` block. We need to compute them outside:

Move the `mobHitScore` and `playerAvoidScore` calculations before the `if (!mActionDef.alwaysHits)` check. Declare them with `let` at the per-target scope level (~line 855 area, inside the `for (const targetId of targets)` loop), then assign them:

```typescript
        const mobHitScore = mob.stats.accuracy + (mActionDef.accuracyModifier ?? 0);
        const playerAvoidScore = calculateAvoidScore(targetParticipant.stats);

        // Hit resolution: normal attacks can be dodged, boss specials (alwaysHits) cannot
        let hitResult: HitResolution | undefined;
        if (!mActionDef.alwaysHits) {
          hitResult = resolveHitCheck({
            combatMode,
            hitScore: mobHitScore,
            avoidScore: playerAvoidScore,
            hitRollValue: roll.rollHitChance(),
          });
```

Also add the `HitResolution` type import. The file is in `packages/game-engine/src/combat/`, so the import path is `./damageCalculator`. Add `HitResolution` to the existing import from `./damageCalculator` (~line 39-46).

- [ ] **Step 4: Build game-engine and run tests**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npm run build -w packages/game-engine && npm run test:engine
```

Expected: 755 tests pass. The new fields are optional so no existing test assertions break.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/expedition.types.ts packages/game-engine/src/combat/raidRoundResolver.ts
git commit -m "feat: add hit resolution detail to mob attack log entries"
```

---

## Task 3: Render Mob Attack Detail in Frontend

Make mob attack targets expandable in `RoundLogContent.tsx` to show hit resolution detail using the unified formatter.

**Files:**
- Modify: `apps/web/src/components/common/combat/RoundLogContent.tsx`

- [ ] **Step 1: Add expandable mob target detail**

In `RoundLogContent.tsx`, add the import for `formatHitBreakdown` and a `useState` import, then update the mob target rendering to be clickable with an expansion panel.

Add imports:
```typescript
import { useState } from 'react';
import { formatHitBreakdown } from '../../combat/combatLogEntryUtils';
```

Remove existing `'use client';` if present (it's at line 1) — keep it, just add the new imports after it.

Replace the mob targets rendering section (the `ma.targets.map` block inside the mob actions section, ~lines 79-93) with an expandable version. Extract a `MobTargetRow` component at the top of the file (below imports):

```typescript
function MobTargetRow({ target }: { target: MobActionLogEntry['targets'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = target.hitChance !== undefined || target.blocked;

  const hitText = !target.blocked ? formatHitBreakdown({
    hitChance: target.hitChance,
    hitRollValue: target.hitRollValue,
    attackerHitScore: target.mobHitScore,
    defenderAvoidScore: target.playerAvoidScore,
  }) : null;

  return (
    <div
      className={`text-[var(--rpg-text-secondary)] ${hasDetail ? 'cursor-pointer hover:bg-[var(--rpg-surface)]/50 rounded px-1 -mx-1' : ''}`}
      onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
    >
      <div className="flex items-center gap-0.5">
        <span>
          {target.username}: {target.blocked ? (
            <span className="text-[var(--rpg-blue-light)]">BLOCKED</span>
          ) : target.dodged ? (
            <span className="text-[var(--rpg-green-light)]">DODGED</span>
          ) : (
            <>
              <span className="text-[var(--rpg-red)]">-{target.damageTaken} HP</span>
              {target.knockedOut && <span className="text-[var(--rpg-red)] font-bold"> KO!</span>}
            </>
          )}
        </span>
        {hasDetail && (
          <span className="text-[var(--rpg-text-secondary)] ml-auto text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
        )}
      </div>
      {expanded && (
        <div className="ml-2 mt-0.5 text-[var(--rpg-text-secondary)] opacity-80 space-y-0.5">
          {target.blocked && <div>Blocked (hit check skipped)</div>}
          {hitText && <div>{hitText}</div>}
          {!target.blocked && !hitText && target.damageTaken > 0 && <div>Guaranteed Hit</div>}
          {target.damageTaken > 0 && target.damageRoll !== undefined && (
            <div>Damage: {target.damageRoll} raw = {target.damageTaken} final</div>
          )}
        </div>
      )}
    </div>
  );
}
```

Update the existing `@pocketrealm/shared` import at line 3 to add `MobActionLogEntry`:
```typescript
import type { ExpeditionRoundLog, MobActionLogEntry } from '@pocketrealm/shared';
```

Then replace the inline target rendering (~lines 79-93):
```typescript
{ma.targets.map((t, k) => (
  <MobTargetRow key={k} target={t} />
))}
```

- [ ] **Step 2: Typecheck**

Run: `cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npm run build -w packages/shared && npx tsc -p apps/web/tsconfig.json 2>&1 | grep -v "\.test\." | grep "error TS"`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/combat/RoundLogContent.tsx
git commit -m "feat: add expandable hit detail to mob attack log entries"
```

---

## Task 4: Round Log Persistence on Rejoin

Re-add `roundLogs` to the Redis combat session so they survive page navigation. Return them on resume.

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts`
- Modify: `apps/api/src/routes/combat/sites.ts`
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`

- [ ] **Step 1: Re-add roundLogs to ManualCombatState**

In `encounterSiteCombatService.ts`, add `roundLogs` back to the `ManualCombatState` interface (~line 647):

```typescript
interface ManualCombatState {
  playerId: string;
  siteId: string;
  currentRoom: number;
  participant: RaidParticipant;
  mobs: ExpeditionMobState[];
  threatTable: RaidThreatEntry[];
  roundNumber: number;
  allPotionsConsumed: PotionConsumed[];
  roundLogs: ExpeditionRoundLog[];
  maxHp: number;
  turnCostCharged: number;
  totalRooms: number;
  mobFamilyId: string;
  createdAt: number;
}
```

- [ ] **Step 2: Initialize roundLogs in session creation**

In `startManualEncounterRoom`, add `roundLogs: []` to the `setCombatSession` call (~line 805):

```typescript
    await setCombatSession(playerId, siteId, {
      playerId,
      siteId,
      currentRoom,
      participant,
      mobs: expeditionMobs,
      threatTable: initThreatTable([playerId]),
      roundNumber: 0,
      allPotionsConsumed: [],
      roundLogs: [],
      maxHp: hpState.maxHp,
      ...
```

- [ ] **Step 3: Push round log after each round**

In `resolveManualEncounterRound`, after `state.threatTable = result.threatTableAfter;` (~line 912), re-add:

```typescript
  state.roundLogs.push(result.roundLog);
```

- [ ] **Step 4: Add roundLogs to StartManualRoomResult and return on resume**

Add field to `StartManualRoomResult` interface:

```typescript
export interface StartManualRoomResult {
  ...
  roundNumber: number;
  roundLogs: ExpeditionRoundLog[];
}
```

In the resume path of `startManualEncounterRoom` (~line 741), add `roundLogs` to the return:

```typescript
    return {
      ...
      roundNumber: existingState.roundNumber,
      roundLogs: (existingState as { roundLogs?: ExpeditionRoundLog[] }).roundLogs ?? [],
    };
```

The cast handles backwards compatibility with sessions created before this field existed.

In the fresh session return (~line 822), add `roundLogs: []`:

```typescript
  return {
    ...
    roundNumber: 0,
    roundLogs: [],
  };
```

- [ ] **Step 5: Pass through roundLogs in route handler**

In `apps/api/src/routes/combat/sites.ts`, in the `start-room` route handler response (~line 329), add `roundLogs`:

```typescript
      res.json({
        currentRoom: result.currentRoom,
        totalRooms: result.totalRooms,
        mobs: result.mobs,
        playerState: { ... },
        roundNumber: result.roundNumber,
        roundLogs: result.roundLogs,
      });
```

- [ ] **Step 6: Add roundLogs to frontend type**

In `apps/web/src/lib/api/combat.ts`, add to `EncounterStartRoomResponse` (~line 550):

```typescript
export interface EncounterStartRoomResponse {
  ...
  roundNumber: number;
  roundLogs?: ExpeditionRoundLog[];
  stateUpdates?: StateUpdates;
}
```

- [ ] **Step 7: Restore roundLogs on resume in EncounterSiteCombatView**

In `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`, update the resume probe (~line 112) to seed round logs:

In the `roundNumber > 0` branch (resuming):
```typescript
        if (result.roundNumber > 0) {
          setMobs(startRoomMobsToExpeditionMobs(result.mobs));
          setPlayerState(result.playerState);
          setRoundLogs(result.roundLogs ?? []);
          setState('manual_combat');
        }
```

Also seed in the fresh session branch (roundNumber === 0):
```typescript
        } else {
          setMobs(startRoomMobsToExpeditionMobs(result.mobs));
          setPlayerState(result.playerState);
          setRoundLogs(result.roundLogs ?? []);
        }
```

- [ ] **Step 8: Build and test**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx tsc -p apps/api/tsconfig.json && npm run test:api && npx tsc -p apps/web/tsconfig.json 2>&1 | grep -v "\.test\." | grep "error TS"
```

Expected: API builds clean, 1793 tests pass, no new web type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.ts apps/api/src/routes/combat/sites.ts apps/web/src/lib/api/combat.ts apps/web/src/components/encounter/EncounterSiteCombatView.tsx
git commit -m "feat: persist and restore round logs on encounter site rejoin"
```

---

## Task 5: Store Encounter Site Room Combat History

Create ActivityLog entries when rooms resolve. Add required metadata to ManualCombatState.

**Files:**
- Modify: `apps/api/src/services/encounterSiteCombatService.ts`

- [ ] **Step 1: Add metadata fields to ManualCombatState**

Extend the interface with fields needed for the ActivityLog:

```typescript
interface ManualCombatState {
  ...
  mobFamilyId: string;
  siteName: string;
  zoneId: string;
  zoneName: string;
  mobFamilyName: string;
  initialMobs: Array<{ mobId: string; slot: number; name: string; prefix: string | null; hp: number; maxHp: number }>;
  createdAt: number;
}
```

- [ ] **Step 2: Update startManualEncounterRoom site query**

Change the site query (~line 763) to include zone and mob family names:

```typescript
  const site = await prisma.encounterSite.findFirst({
    where: { id: siteId, playerId },
    include: {
      zone: { select: { name: true } },
      mobFamily: { select: { name: true } },
    },
  });
```

- [ ] **Step 3: Populate new fields in session creation**

Update the `setCombatSession` call to include the new metadata:

```typescript
    await setCombatSession(playerId, siteId, {
      ...
      mobFamilyId: site.mobFamilyId,
      siteName: site.name,
      zoneId: site.zoneId,
      zoneName: site.zone.name,
      mobFamilyName: site.mobFamily.name,
      initialMobs: expeditionMobs.map(m => ({
        mobId: m.id,
        slot: parseEncounterMobSlot(m.id) ?? 0,
        name: m.name,
        prefix: m.prefix,
        hp: m.hp,
        maxHp: m.maxHp,
      })),
      createdAt: Date.now(),
    });
```

- [ ] **Step 4: Update autoResolveEncounterRoom site query**

Add `zone` include to the auto-resolve site query (~line 447):

```typescript
  const site = await prisma.encounterSite.findFirst({
    where: { id: siteId, playerId },
    include: {
      mobFamily: { select: { name: true } },
      zone: { select: { name: true } },
    },
  });
```

- [ ] **Step 5: Add ActivityLog creation to autoResolveEncounterRoom transaction**

Inside the transaction block, before the `return` statement (~line 601), add:

```typescript
    // Log room combat to activity history
    await tx.activityLog.create({
      data: {
        playerId,
        activityType: 'combat',
        turnsSpent: totalTurnCost,
        result: {
          source: 'encounter_site_room',
          siteId,
          siteName: site.name,
          mobFamilyName: site.mobFamily.name,
          mobFamilyId: site.mobFamilyId,
          zoneId: site.zoneId,
          zoneName: site.zone.name,
          room: currentRoom,
          totalRooms: site.totalRooms ?? 1,
          outcome: combatResult.outcome,
          mode: 'auto',
          roundsResolved: combatResult.roundsResolved,
          rounds: combatResult.rounds,
          initialMobs: expeditionMobs.map(m => ({
            mobId: m.id,
            slot: parseEncounterMobSlot(m.id) ?? 0,
            name: m.name,
            prefix: m.prefix,
            hp: m.hp,
            maxHp: m.maxHp,
          })),
          siteCleared,
          chestReward: completionRewards,
        } as unknown as Prisma.InputJsonObject,
      },
    });
```

- [ ] **Step 6: Add ActivityLog creation to resolveManualEncounterRound transaction**

Inside the manual transaction block, before the `return` (~line 1030), build the full rounds array (accumulated logs + current round) and create the ActivityLog:

```typescript
    // Build full round log: accumulated prior rounds + this round
    const allRounds = [...(state.roundLogs ?? []), result.roundLog];

    // Log room combat to activity history
    await tx.activityLog.create({
      data: {
        playerId,
        activityType: 'combat',
        turnsSpent: state.turnCostCharged,
        result: {
          source: 'encounter_site_room',
          siteId: state.siteId,
          siteName: state.siteName ?? 'Unknown Site',
          mobFamilyName: state.mobFamilyName ?? 'Unknown',
          mobFamilyId: state.mobFamilyId,
          zoneId: state.zoneId ?? '',
          zoneName: state.zoneName ?? 'Unknown Zone',
          room: state.currentRoom,
          totalRooms: state.totalRooms,
          outcome: roomCleared ? 'cleared' : 'defeated',
          mode: 'manual',
          roundsResolved: state.roundNumber,
          rounds: allRounds,
          initialMobs: state.initialMobs ?? [],
          siteCleared,
          chestReward: completionRewards,
        } as unknown as Prisma.InputJsonObject,
      },
    });
```

- [ ] **Step 7: Build and test**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx tsc -p apps/api/tsconfig.json && npm run test:api
```

Expected: Clean build, 1793 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.ts
git commit -m "feat: store encounter site room combat results in activity log"
```

---

## Task 6: Encounter Site Room History — API

Ensure the combat logs API returns `encounter_site_room` entries and passes through `source` in the detail response.

**Files:**
- Modify: `apps/api/src/routes/combat/logs.ts`

- [ ] **Step 1: Verify list endpoint includes encounter_site_room**

The list endpoint filters `activityType = 'combat'` and excludes `source <> 'encounter_site_fight'`. Since we store with `activityType: 'combat'` and `source: 'encounter_site_room'`, entries will appear in the list automatically. No WHERE clause change needed.

Check: the SELECT columns extract `mobName`, `mobDisplayName`, etc. from result JSON. For `encounter_site_room` entries, `mobName` will be null but `mobFamilyName` will have a value. The existing response already includes `mobFamilyName` and `source`, so the frontend can use these to render differently. Verify the `roundCount` extraction works — it uses `jsonb_array_elements("result"->'log')` which won't work for encounter_site_room (which has `rounds` not `log`).

Add a fallback for `roundCount` in the SELECT columns. Find the `roundCount` column (~line 113) and update it:

```sql
COALESCE(
  NULLIF(("result"->>'roundsResolved'), '')::int,
  (
    SELECT MAX(
      CASE
        WHEN jsonb_typeof(log_entry->'round') = 'number'
          THEN (log_entry->>'round')::int
        ELSE 0
      END
    )
    FROM jsonb_array_elements(COALESCE("result"->'log', '[]'::jsonb)) AS log_entry
  ),
  0
) AS "roundCount",
```

This checks `roundsResolved` first (encounter_site_room format), then falls back to the existing log-based count (1v1 format).

Also add `siteName` and `room`/`totalRooms` to the SELECT:

```sql
("result"->>'siteName') AS "siteName",
("result"->>'room')::int AS "siteRoom",
("result"->>'totalRooms')::int AS "siteTotalRooms",
("result"->>'mode') AS "siteMode",
```

Also update the `CombatHistoryListRow` TypeScript interface in `logs.ts` (~line 29-44) to include the new fields. Find the interface (it types the raw SQL row) and add:

```typescript
  siteName: string | null;
  siteRoom: number | null;
  siteTotalRooms: number | null;
  siteMode: string | null;
```

This prevents TypeScript errors when accessing `row.siteName` etc. in the response mapping.

- [ ] **Step 2: Add source to detail endpoint response**

In the detail endpoint (`GET /logs/:id`, ~line 279), the response returns `combat: result`. The `result` JSON already contains `source`. The frontend receives it as `combat.source`. Verify this is the case — read the detail response at ~line 295. If `source` is not exposed at the top level, ensure it's accessible inside the `combat` object.

- [ ] **Step 3: Add new fields to response**

Update the list response mapping (~line 180) to include the new fields:

```typescript
    logId: row.id,
    ...
    mobFamilyName: row.mobFamilyName ?? null,
    siteName: row.siteName ?? null,
    siteRoom: row.siteRoom ?? null,
    siteTotalRooms: row.siteTotalRooms ?? null,
    siteMode: row.siteMode ?? null,
```

- [ ] **Step 4: Build and test**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx tsc -p apps/api/tsconfig.json && npm run test:api
```

Expected: Clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/combat/logs.ts
git commit -m "feat: include encounter site room data in combat history API"
```

---

## Task 7: Encounter Site Room History — Frontend

Add rendering branch in CombatHistory for `encounter_site_room` entries, and update the detail view to use `RoundLogContent`.

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/components/screens/CombatHistory.tsx`

- [ ] **Step 1: Update frontend types**

In `apps/web/src/lib/api/combat.ts`, add `'encounter_site_room'` to `CombatSourceResponse`:

```typescript
export type CombatSourceResponse = 'zone_combat' | 'encounter_site' | 'encounter_site_room' | 'exploration_ambush' | 'travel_ambush';
```

Add new fields to `CombatHistoryListItemResponse`:

```typescript
export interface CombatHistoryListItemResponse {
  ...
  mobFamilyName: string | null;
  siteName: string | null;
  siteRoom: number | null;
  siteTotalRooms: number | null;
  siteMode: string | null;
}
```

- [ ] **Step 2: Add encounter_site_room list item rendering**

In `CombatHistory.tsx`, update the list item rendering (~line 360). In the existing `rows.map` block, add a branch when `entry.source === 'encounter_site_room'`:

Before the existing mob image/name display, add:

```typescript
{entry.source === 'encounter_site_room' ? (
  <>
    <span className="truncate">
      <span className={outcomeColor(entry.outcome)}>{outcomeIcon(entry.outcome)}</span>
      {' '}
      {entry.siteName ?? 'Unknown Site'}
    </span>
    <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--rpg-blue-light)]/10 text-[var(--rpg-blue-light)] font-pixel font-normal">
      Room {entry.siteRoom}/{entry.siteTotalRooms}
    </span>
  </>
) : (
  // ... existing mob name rendering
)}
```

Update the subtitle line for encounter_site_room:

```typescript
{entry.source === 'encounter_site_room' ? (
  <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
    {entry.mobFamilyName ?? 'Unknown'} | {entry.siteMode === 'auto' ? 'Auto' : 'Manual'} | {entry.zoneName ?? 'Unknown Zone'} | {relativeTime(entry.createdAt)}
  </div>
) : (
  // ... existing subtitle
)}
```

- [ ] **Step 3: Add encounter_site_room detail rendering**

When an encounter_site_room entry is selected and the detail is loaded, the `combat` object's `source` field will be `'encounter_site_room'`. The `combat` object will have `rounds: ExpeditionRoundLog[]` instead of `log: CombatLogEntryResponse[]`.

Add the `RoundLogContent` import:
```typescript
import { RoundLogContent } from '@/components/common/combat';
```

Add an `ExpeditionRoundLog` type import:
```typescript
import type { ExpeditionRoundLog } from '@pocketrealm/shared';
```

In the detail view rendering (~line 452), add a branch before the existing log rendering:

```typescript
{selectedDetail && (selectedDetail as { source?: string }).source === 'encounter_site_room' ? (
  <div className="max-h-96 overflow-y-auto space-y-3 border-t border-[var(--rpg-border)] pt-2">
    {((selectedDetail as { rounds?: ExpeditionRoundLog[] }).rounds ?? []).map((roundLog, i) => (
      <div key={i}>
        <p className="text-xs font-bold text-[var(--rpg-text-secondary)] mb-1">Round {roundLog.round}</p>
        <RoundLogContent log={roundLog} playerId={null} />
      </div>
    ))}
    {(selectedDetail as { chestReward?: unknown }).chestReward && (
      <div className="border-t border-[var(--rpg-border)] pt-2 text-xs text-[var(--rpg-gold)]">
        Chest reward received on site completion
      </div>
    )}
  </div>
) : (
  // ... existing CombatLogEntry rendering
)}
```

Notes:
- The type casts are needed because `CombatResultResponse` doesn't have `rounds` — we're working with a different shape. A discriminated union would be cleaner but casts suffice for now.
- `playerId={null}` is passed since this is a history view without a "current player" context. `RoundLogContent` passes it through to `RoundLogAttackRow` which uses it to highlight "You" — with `null`, no attacks get special highlighting, which is correct for history view.
- The branch MUST wrap the existing `selectedDetail.log.map(...)` rendering — without it, accessing `.log` on an `encounter_site_room` result (which has `rounds` instead of `log`) would crash.

- [ ] **Step 4: Update formatCombatSource for the new source type**

Find the `formatCombatSource` helper in `CombatHistory.tsx` and add a case:

```typescript
case 'encounter_site_room': return 'Encounter Room';
```

- [ ] **Step 5: Typecheck**

Run: `cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npx tsc -p apps/web/tsconfig.json 2>&1 | grep -v "\.test\." | grep "error TS"`

Expected: No new type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/combat.ts apps/web/src/components/screens/CombatHistory.tsx
git commit -m "feat: display encounter site room combat in history tab"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full build**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npm run build -w packages/shared && npm run build -w packages/game-engine && npx tsc -p apps/api/tsconfig.json && npx tsc -p apps/web/tsconfig.json 2>&1 | grep -v "\.test\." | grep "error TS"
```

- [ ] **Step 2: Full test suite**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && npm run test:engine && npm run test:api
```

Expected: 755 engine tests, 1793 API tests — all pass.

- [ ] **Step 3: Review all changes**

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework && git diff --stat HEAD~7
```

Verify all files touched match the plan.
