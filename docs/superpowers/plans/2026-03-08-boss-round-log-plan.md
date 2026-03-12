# Boss Round Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add detailed per-round action logs to boss encounters, showing phased combat breakdown with full roll detail for self and summaries for others, plus telegraph integration and rotation knowledge.

**Architecture:** Extend the game engine's `resolveBossRound()` to emit a `BossRoundLog` alongside existing results. Store logs as a JSON array on `BossEncounter`. Frontend expands round rows inline to show phased log with self-detail. New rotation endpoint for pre-round view.

**Tech Stack:** TypeScript, Prisma (migration), Vitest (game-engine tests), React (frontend components)

---

### Task 1: Add BossRoundLog types to shared package

**Files:**
- Modify: `packages/shared/src/types/worldEvent.types.ts` (append after line 113)
- Modify: `packages/shared/src/types/bossTemplate.types.ts` (append after line 26)

**Step 1: Add round log types to worldEvent.types.ts**

Append these types after the `BossParticipantData` interface (line 113):

```typescript
export interface BossPlayerAttackLog {
  playerId: string;
  username: string;
  actionId: string;
  actionLabel: string;
  attackRoll: number;
  modifier: number;
  totalRoll: number;
  defenseTarget: number;
  hit: boolean;
  crit: boolean;
  damageRoll?: number;
  damageBonus?: number;
  totalDamage?: number;
  staminaCost?: number;
  manaCost?: number;
}

export interface BossBossActionLog {
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  wasTelegraphed: boolean;
  targets: Array<{
    playerId: string;
    username: string;
    damageTaken: number;
    blocked: number;
    knockedOut: boolean;
  }>;
}

export interface BossHealingLog {
  playerId: string;
  username: string;
  actionLabel: string;
  amountHealed: number;
  targetPlayerId: string;
  targetUsername: string;
}

export interface BossOutcomeLog {
  bossHpPercent: number;
  bossDefeated: boolean;
  playersAlive: number;
  playersKnockedOut: number;
  wipe: boolean;
}

export interface BossTelegraphLog {
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  warningText: string;
}

export interface BossRoundLog {
  round: number;
  phases: {
    playerAttacks: BossPlayerAttackLog[];
    bossActions: BossBossActionLog[];
    healing: BossHealingLog[];
    outcome: BossOutcomeLog;
  };
  telegraph: BossTelegraphLog | null;
}
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds

**Step 3: Commit**

```
feat(shared): add BossRoundLog types for detailed boss action logs
```

---

### Task 2: Extend game engine to emit BossRoundLog

**Files:**
- Modify: `packages/game-engine/src/combat/bossRoundResolver.ts`
- Test: `packages/game-engine/src/combat/bossRoundResolver.test.ts`

**Step 1: Write failing tests for roundLog output**

Add to `bossRoundResolver.test.ts` after the existing describe blocks:

```typescript
describe('roundLog output', () => {
  it('returns a roundLog with player attack entries', () => {
    const p1 = makeParticipant({ playerId: 'p1' });
    const p2 = makeParticipant({ playerId: 'p2' });
    const result = resolveBossRound(makeInput({ participants: [p1, p2] }), alwaysHitRng);
    expect(result.roundLog).toBeDefined();
    expect(result.roundLog.phases.playerAttacks).toHaveLength(2);
    const entry = result.roundLog.phases.playerAttacks[0];
    expect(entry.playerId).toBe('p1');
    expect(entry.attackRoll).toBe(15); // from alwaysHitRng
    expect(entry.hit).toBe(true);
    expect(entry.totalDamage).toBeGreaterThan(0);
  });

  it('records miss details in player attack log', () => {
    const result = resolveBossRound(makeInput(), alwaysMissRng);
    const entry = result.roundLog.phases.playerAttacks[0];
    expect(entry.hit).toBe(false);
    expect(entry.totalDamage).toBeUndefined();
  });

  it('records crit in player attack log', () => {
    const result = resolveBossRound(makeInput(), alwaysCritRng);
    const entry = result.roundLog.phases.playerAttacks[0];
    expect(entry.crit).toBe(true);
    expect(entry.totalDamage).toBeGreaterThan(0);
  });

  it('records boss action log entries', () => {
    const boss = makeBoss({
      template: [{ actionId: 'boss_physical_attack', targetMode: 'aoe' }],
    });
    const p1 = makeParticipant({ playerId: 'p1', hp: 200, maxHp: 200 });
    const p2 = makeParticipant({ playerId: 'p2', hp: 200, maxHp: 200 });
    const result = resolveBossRound(makeInput({ boss, participants: [p1, p2] }), alwaysHitRng);
    expect(result.roundLog.phases.bossActions).toHaveLength(1);
    const action = result.roundLog.phases.bossActions[0];
    expect(action.actionId).toBe('boss_physical_attack');
    expect(action.targetMode).toBe('aoe');
    expect(action.targets).toHaveLength(2);
  });

  it('records healing log entries', () => {
    const healAction: ActionDefinition = {
      id: 'heal_self', name: 'Heal', description: 'Heal self',
      actionType: 'heal_self', category: 'supportive',
      cost: { stamina: 10, mana: 30 }, healFlat: 25, healPercent: 0.1, isChanneling: true,
    };
    const p = makeParticipant({
      hp: 50, maxHp: 100, mana: 100,
      template: slotsOf('heal_self'),
      actionDefinitions: { ...BASE_ACTION_DEFINITIONS, heal_self: healAction },
    });
    const boss = makeBoss({ template: [{ actionId: 'boss_rest', targetMode: 'single_target' }] });
    const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
    expect(result.roundLog.phases.healing).toHaveLength(1);
    expect(result.roundLog.phases.healing[0].amountHealed).toBeGreaterThan(0);
  });

  it('records outcome in roundLog', () => {
    const result = resolveBossRound(makeInput(), alwaysHitRng);
    expect(result.roundLog.phases.outcome.bossDefeated).toBe(false);
    expect(result.roundLog.phases.outcome.playersAlive).toBe(1);
  });

  it('records telegraph when next boss action is telegraphed', () => {
    const boss = makeBoss({
      template: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true, label: 'Earthquake' },
      ],
      roundNumber: 1, // will use action index 0, next is index 1 (telegraphed)
    });
    const result = resolveBossRound(makeInput({ boss }), alwaysHitRng);
    expect(result.roundLog.telegraph).not.toBeNull();
    expect(result.roundLog.telegraph!.actionId).toBe('boss_earthquake');
    expect(result.roundLog.telegraph!.warningText).toContain('Earthquake');
  });

  it('telegraph is null when next boss action is not telegraphed', () => {
    const boss = makeBoss({
      template: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_earthquake', targetMode: 'aoe' }, // no isTelegraphed
      ],
      roundNumber: 1,
    });
    const result = resolveBossRound(makeInput({ boss }), alwaysHitRng);
    expect(result.roundLog.telegraph).toBeNull();
  });

  it('defensive actions are logged with zero damage for non-offensive players', () => {
    const p = makeParticipant({ template: slotsOf('defend') });
    const result = resolveBossRound(makeInput({ participants: [p] }), alwaysHitRng);
    // Defend is not offensive, so no attack log entry for this player
    expect(result.roundLog.phases.playerAttacks).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:engine -- --run bossRoundResolver`
Expected: FAIL — `result.roundLog` is undefined

**Step 3: Update BossRoundResult to include roundLog**

In `bossRoundResolver.ts`, add import and update the result interface:

Add to imports (line 6-7):
```typescript
import type { BossRoundLog, BossPlayerAttackLog, BossBossActionLog, BossHealingLog } from '@pocketrealm/shared';
```

Update `BossRoundResult` (line 81-91) — add `roundLog` field:
```typescript
export interface BossRoundResult {
  bossHpAfter: number;
  bossDefeated: boolean;
  bossActionId: string;
  bossTargetMode: BossTargetMode;
  bossTargetPlayerIds: string[];
  participantResults: BossRoundParticipantResult[];
  threatTableAfter: ThreatEntry[];
  bossActiveEffectsAfter: BossActiveEffect[];
  allPlayersDead: boolean;
  roundLog: BossRoundLog;
}
```

**Step 4: Build the roundLog inside resolveBossRound()**

The engine needs a `usernameMap` to populate usernames in log entries. Add a `usernames` parameter:

Update `BossRoundParticipant` (line 29-44) — add `username` field:
```typescript
export interface BossRoundParticipant {
  playerId: string;
  username: string; // NEW
  stats: CombatantStats;
  // ... rest unchanged
}
```

Inside `resolveBossRound()`, build log entries alongside existing logic:

**After Step 1 (action picking, ~line 157):** Initialize log arrays:
```typescript
const attackLogs: BossPlayerAttackLog[] = [];
const bossActionLogs: BossBossActionLog[] = [];
const healingLogs: BossHealingLog[] = [];
```

**Inside Step 5 (offensive actions, lines 192-220):** Capture attack details.

Replace the offensive loop body to capture roll data while keeping existing logic:

```typescript
// --- Step 5: Offensive actions resolve against boss ---
for (let i = 0; i < input.participants.length; i++) {
  const p = input.participants[i];
  const s = pState[i];
  const def = s.actionDef;
  if (!def || def.category !== 'offensive' || (def.damageMultiplier ?? 0) <= 0) continue;

  const attackRoll = roll.rollD20();
  const modifier = p.stats.accuracy + (def.accuracyModifier ?? 0);
  const hits = doesAttackHit(attackRoll, modifier, bossStats.dodge, 0);

  const logEntry: BossPlayerAttackLog = {
    playerId: s.playerId,
    username: p.username,
    actionId: s.actionId,
    actionLabel: def.name,
    attackRoll,
    modifier,
    totalRoll: attackRoll + modifier,
    defenseTarget: 10 + bossStats.dodge,
    hit: hits,
    crit: false,
    staminaCost: def.cost.stamina > 0 ? def.cost.stamina : undefined,
    manaCost: def.cost.mana > 0 ? def.cost.mana : undefined,
  };

  if (!hits) {
    s.hit = false;
    attackLogs.push(logEntry);
    continue;
  }

  const rawDmg = roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
  const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
  const crit = roll.rollCrit(p.stats.critChance ?? 0);
  const effectiveDefence = (def.damageType === 'magic' || p.stats.damageType === 'magic')
    ? bossStats.magicDefence
    : bossStats.defence;
  const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);

  bossHp -= damage;
  s.damageDealt = damage;
  s.hit = true;
  s.isCritical = crit;
  addDamageThreat(input.threatTable, s.playerId, damage);

  logEntry.hit = true;
  logEntry.crit = crit;
  logEntry.damageRoll = rawDmg;
  logEntry.damageBonus = scaledDmg - rawDmg;
  logEntry.totalDamage = damage;
  attackLogs.push(logEntry);
}
```

**Inside Step 6 (supportive/healing, lines 225-258):** Capture healing details:

After each heal calculation, push to `healingLogs`:
```typescript
// After heal_self actualHeal calculation:
healingLogs.push({
  playerId: s.playerId,
  username: p.username,
  actionLabel: def.name,
  amountHealed: actualHeal,
  targetPlayerId: s.playerId,
  targetUsername: p.username,
});

// After heal_ally actualHeal calculation:
healingLogs.push({
  playerId: s.playerId,
  username: p.username,
  actionLabel: def.name,
  amountHealed: actualHeal,
  targetPlayerId: aggroHolder,
  targetUsername: input.participants.find(pp => pp.playerId === aggroHolder)?.username ?? '',
});
```

**Inside Step 7 (boss action, lines 260-322):** Capture boss action details:

Build a `BossBossActionLog` entry. After the boss action target loop, determine if the current action was telegraphed from the previous round:

```typescript
// After targets are resolved, before boss heal_self check:
if (bossActionDef.category === 'offensive' || bossActionDef.actionType === 'debuff_spell') {
  // Check if this action was telegraphed (previous round's next action had isTelegraphed)
  const prevActionIndex = (input.boss.roundNumber - 2) % input.boss.template.length;
  const prevAction = input.boss.roundNumber > 1 ? input.boss.template[prevActionIndex] : null;
  // This action is "wasTelegraphed" if the previous round's NEXT action (which is this one) was telegraphed
  // Actually: this round's action was telegraphed if itself has isTelegraphed
  const wasTelegraphed = bossTemplateAction.isTelegraphed ?? false;

  bossActionLogs.push({
    actionId: bossActionId,
    actionLabel: bossActionDef.name,
    targetMode: bossTargetMode,
    wasTelegraphed,
    targets: bossTargetPlayerIds.map(targetId => {
      const ts = pState.find(ps => ps.playerId === targetId)!;
      const tp = input.participants.find(pp => pp.playerId === targetId)!;
      return {
        playerId: targetId,
        username: tp.username,
        damageTaken: ts.damageTaken, // Note: this is cumulative, need per-action
        blocked: 0, // Will be computed below
        knockedOut: ts.hp <= 0,
      };
    }),
  });
}
```

**Important detail:** The current code accumulates `damageTaken` on `pState`. To get per-action damage for the log, snapshot `damageTaken` before boss action and compute diff. Add before the boss action loop (inside the `if (!bossDefeated && bossActionDef)` block):

```typescript
// Snapshot damage before boss action
const dmgBefore = new Map(pState.map(s => [s.playerId, s.damageTaken]));
```

Then in the log entry, use:
```typescript
damageTaken: ts.damageTaken - (dmgBefore.get(targetId) ?? 0),
```

For `blocked`, track the pre-reduction damage vs actual:
During the boss damage loop, capture the raw-vs-reduced diff. This requires a small refactor inside the boss damage loop to track `blockedAmount` per target. Add a map:

```typescript
const bossBlockedMap = new Map<string, number>();
```

Inside the damage loop, after calculating `damage` but before applying it:
```typescript
const rawBeforeReduction = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, scaledBossDmg - effectivePlayerDefence);
const blocked = rawBeforeReduction - damage; // from damageReductionPercent
bossBlockedMap.set(targetId, (bossBlockedMap.get(targetId) ?? 0) + blocked);
```

Then use `blocked: bossBlockedMap.get(targetId) ?? 0` in the log entry.

**After Step 8 (end-of-round):** Build telegraph and assemble roundLog.

```typescript
// Determine next round's telegraph
let telegraph: BossRoundLog['telegraph'] = null;
const nextBossActionIndex = input.boss.roundNumber % input.boss.template.length;
const nextBossAction = input.boss.template[nextBossActionIndex];
if (nextBossAction?.isTelegraphed) {
  const nextActionDef = input.boss.actionDefinitions[nextBossAction.actionId];
  const label = nextBossAction.label ?? nextActionDef?.name ?? nextBossAction.actionId;
  telegraph = {
    actionId: nextBossAction.actionId,
    actionLabel: label,
    targetMode: nextBossAction.targetMode,
    warningText: `Boss is preparing ${label}!`,
  };
}

const roundLog: BossRoundLog = {
  round: input.boss.roundNumber,
  phases: {
    playerAttacks: attackLogs,
    bossActions: bossActionLogs,
    healing: healingLogs,
    outcome: {
      bossHpPercent: input.boss.maxHp > 0 ? Math.round((Math.max(0, bossHp) / input.boss.maxHp) * 100) : 0,
      bossDefeated,
      playersAlive: pState.filter(s => s.hp > 0).length,
      playersKnockedOut: pState.filter(s => s.hp <= 0).length,
      wipe: pState.every(s => s.hp <= 0),
    },
  },
  telegraph,
};
```

Add `roundLog` to the return object (line 373-383):
```typescript
return {
  // ... existing fields
  roundLog,
};
```

**Step 5: Run tests**

Run: `npm run test:engine -- --run bossRoundResolver`
Expected: All tests pass including new roundLog tests

**Step 6: Fix existing test compilation**

Existing tests and service code don't pass `username` to `BossRoundParticipant`. Update:

In `bossRoundResolver.test.ts`, update `makeParticipant` helper to include `username`:
```typescript
function makeParticipant(overrides: Partial<BossRoundParticipant> = {}): BossRoundParticipant {
  return {
    playerId: 'p1',
    username: overrides.playerId ?? 'p1', // default username = playerId
    // ... rest unchanged
    ...overrides,
  };
}
```

**Step 7: Build game-engine package**

Run: `npm run build --workspace=packages/game-engine`
Expected: Build succeeds

**Step 8: Commit**

```
feat(game-engine): emit BossRoundLog from resolveBossRound with roll details
```

---

### Task 3: Add username to BossRoundParticipant in service layer

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts` (lines 306-342, participant building)

**Step 1: Add username resolution to participant building**

In `resolveBossRound()`, the participant-building `Promise.all` (line 306-343) needs to also fetch username. Update the map callback:

```typescript
const participants: BossRoundParticipant[] = await Promise.all(
  signups.map(async (signup) => {
    const [hpState, equipStats, template, resources, player] = await Promise.all([
      getHpState(signup.playerId),
      getEquipmentStats(signup.playerId),
      getActiveTemplate(signup.playerId),
      computeResourcePools(signup.playerId),
      prisma.player.findUnique({ where: { id: signup.playerId }, select: { username: true } }),
    ]);
    // ... existing stat building ...
    return {
      playerId: signup.playerId,
      username: player?.username ?? signup.playerId.slice(0, 8),
      // ... rest unchanged
    };
  }),
);
```

**Step 2: Verify API typecheck**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No new errors

**Step 3: Commit**

```
feat(api): pass username to BossRoundParticipant for round log
```

---

### Task 4: Database migration — add roundLogs field

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (line 676, after `roundSummaries`)
- New migration

**Step 1: Add roundLogs field to schema**

After `roundSummaries Json? @map("round_summaries")` (line 675), add:
```prisma
  roundLogs      Json      @default("[]") @map("round_logs")
```

**Step 2: Generate and run migration**

Run: `npx prisma migrate dev --name add-boss-round-logs --schema packages/database/prisma/schema.prisma`
Expected: Migration created and applied

**Step 3: Generate Prisma client**

Run: `npm run db:generate`
Expected: Client generated

**Step 4: Commit**

```
feat(db): add roundLogs JSON field to BossEncounter
```

---

### Task 5: Persist roundLog in service and expose via API

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts` (lines 432-443, encounter update)
- Modify: `apps/api/src/services/bossEncounterService.ts` (lines 41-78, mapper)
- Modify: `apps/api/src/routes/boss.ts` (lines 90-135, GET /:id)

**Step 1: Update toBossEncounterData mapper to include roundLogs**

In `toBossEncounterData` (line 41-78), add to the input type:
```typescript
roundLogs?: unknown;
```

Add to the return object:
```typescript
roundLogs: Array.isArray(row.roundLogs) ? row.roundLogs as BossRoundLog[] : [],
```

Update the `BossEncounterData` type in `worldEvent.types.ts` to include:
```typescript
roundLogs: BossRoundLog[];
```

**Step 2: Persist roundLog after round resolution**

In `resolveBossRound()`, after `const result = resolveBossRoundEngine(input);` (line 385), the `roundLog` is available on `result.roundLog`.

In the encounter update (lines 432-443), add `roundLogs` to the data:

```typescript
// Build updated roundLogs array
const existingLogs = (Array.isArray(encounter.roundLogs) ? encounter.roundLogs : []) as unknown as BossRoundLog[];
const newLogs = [...existingLogs, result.roundLog];
```

Add to the `data` object in `prisma.bossEncounter.updateMany`:
```typescript
roundLogs: JSON.parse(JSON.stringify(newLogs)),
```

**Step 3: Add roundLogs to API response types**

In `apps/api/src/routes/boss.ts`, `GET /:id` already returns the full encounter via `toBossEncounterData` — `roundLogs` will be included automatically.

**Step 4: Add rotation endpoint**

In `boss.ts`, add a new route before the existing routes:

```typescript
// GET /boss/:id/rotation — player's known boss rotation
bossRouter.get('/:id/rotation', asyncHandler(async (req, res) => {
  const playerId = req.player!.id;
  const encounterId = req.params.id;

  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
    select: { mobTemplateId: true, mobTemplate: { select: { name: true } } },
  });
  if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

  const bossTemplate = BOSS_TEMPLATES[encounter.mobTemplate.name];
  const totalRounds = bossTemplate?.actions.length ?? 0;

  const rotation = await prisma.playerBossRotation.findUnique({
    where: {
      playerId_mobTemplateId: { playerId, mobTemplateId: encounter.mobTemplateId },
    },
  });

  const revealedRounds = rotation?.roundsRevealed ?? 0;
  const actions = bossTemplate?.actions
    .slice(0, revealedRounds)
    .map((action, i) => ({
      round: i + 1,
      actionName: action.label ?? bossTemplate.actionDefinitions[action.actionId]?.name ?? action.actionId,
      targetMode: action.targetMode,
      isTelegraphed: action.isTelegraphed ?? false,
    })) ?? [];

  res.json({ totalRounds, revealedRounds, actions });
}));
```

Import `BOSS_TEMPLATES` at top of file if not already imported.

**Step 5: Verify API typecheck**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No errors

**Step 6: Commit**

```
feat(api): persist roundLog and add rotation endpoint
```

---

### Task 6: Frontend types and API client

**Files:**
- Modify: `apps/web/src/lib/api/social.ts`

**Step 1: Add BossRoundLog types to frontend**

Add after `BossRoundSummary` interface (~line 244):

```typescript
export interface BossPlayerAttackLog {
  playerId: string;
  username: string;
  actionId: string;
  actionLabel: string;
  attackRoll: number;
  modifier: number;
  totalRoll: number;
  defenseTarget: number;
  hit: boolean;
  crit: boolean;
  damageRoll?: number;
  damageBonus?: number;
  totalDamage?: number;
  staminaCost?: number;
  manaCost?: number;
}

export interface BossBossActionLog {
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  wasTelegraphed: boolean;
  targets: Array<{
    playerId: string;
    username: string;
    damageTaken: number;
    blocked: number;
    knockedOut: boolean;
  }>;
}

export interface BossHealingLog {
  playerId: string;
  username: string;
  actionLabel: string;
  amountHealed: number;
  targetPlayerId: string;
  targetUsername: string;
}

export interface BossOutcomeLog {
  bossHpPercent: number;
  bossDefeated: boolean;
  playersAlive: number;
  playersKnockedOut: number;
  wipe: boolean;
}

export interface BossTelegraphLog {
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  warningText: string;
}

export interface BossRoundLog {
  round: number;
  phases: {
    playerAttacks: BossPlayerAttackLog[];
    bossActions: BossBossActionLog[];
    healing: BossHealingLog[];
    outcome: BossOutcomeLog;
  };
  telegraph: BossTelegraphLog | null;
}

export interface BossRotationReveal {
  totalRounds: number;
  revealedRounds: number;
  actions: Array<{
    round: number;
    actionName: string;
    targetMode: 'single_target' | 'aoe';
    isTelegraphed: boolean;
  }>;
}
```

**Step 2: Add roundLogs to BossEncounterResponse**

Add to `BossEncounterResponse` (~line 246-264):
```typescript
roundLogs?: BossRoundLog[];
```

**Step 3: Add API functions**

After `getBossHistory` (~line 328), add:

```typescript
export async function getBossRotation(id: string) {
  return fetchApi<BossRotationReveal>(`/api/v1/boss/${id}/rotation`);
}
```

**Step 4: Commit**

```
feat(web): add BossRoundLog types and rotation API client
```

---

### Task 7: BossRoundLogView component

**Files:**
- Create: `apps/web/src/components/boss/BossRoundLogView.tsx`

**Step 1: Create the component**

This component renders an expanded round log with phased sections. It receives the `BossRoundLog` for a specific round, the current player's ID, and the previous round's telegraph (if any).

```typescript
'use client';

import { Skull } from 'lucide-react';
import type { BossRoundLog, BossPlayerAttackLog, BossBossActionLog, BossHealingLog, BossTelegraphLog } from '@/lib/api';

interface BossRoundLogViewProps {
  log: BossRoundLog;
  playerId: string;
  prevTelegraph: BossTelegraphLog | null;
}

export function BossRoundLogView({ log, playerId, prevTelegraph }: BossRoundLogViewProps) {
  return (
    <div className="mt-2 space-y-3 text-xs border border-[var(--rpg-border)] rounded-lg p-3 bg-[var(--rpg-surface-dark)]">
      {/* Previous round telegraph warning */}
      {prevTelegraph && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--rpg-gold)' }}>
          <span>⚠️</span>
          <span className="font-semibold">Telegraphed: {prevTelegraph.warningText}</span>
        </div>
      )}

      {/* Player Attacks Phase */}
      {log.phases.playerAttacks.length > 0 && (
        <div>
          <p className="font-semibold mb-1" style={{ color: 'var(--rpg-text-primary)' }}>⚔️ Player Attacks</p>
          <div className="space-y-1.5">
            {log.phases.playerAttacks.map((entry, i) => (
              entry.playerId === playerId
                ? <SelfAttackEntry key={i} entry={entry} />
                : <OtherAttackEntry key={i} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Boss Actions Phase */}
      {log.phases.bossActions.length > 0 && (
        <div>
          <p className="font-semibold mb-1" style={{ color: 'var(--rpg-text-primary)' }}>🐉 Boss Actions</p>
          <div className="space-y-1.5">
            {log.phases.bossActions.map((action, i) => (
              <BossActionEntry key={i} action={action} playerId={playerId} />
            ))}
          </div>
        </div>
      )}

      {/* Healing Phase */}
      {log.phases.healing.length > 0 && (
        <div>
          <p className="font-semibold mb-1" style={{ color: 'var(--rpg-text-primary)' }}>💚 Healing</p>
          <div className="space-y-0.5">
            {log.phases.healing.map((entry, i) => (
              <HealingEntry key={i} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Outcome */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span>📊 Boss HP: {log.phases.outcome.bossHpPercent}%</span>
        <span>
          {log.phases.outcome.playersAlive} alive
          {log.phases.outcome.playersKnockedOut > 0 && (
            <span className="text-[var(--rpg-red)] ml-1">
              {log.phases.outcome.playersKnockedOut} KO
            </span>
          )}
        </span>
        {log.phases.outcome.bossDefeated && (
          <span className="font-bold text-[var(--rpg-green-light)]">BOSS DEFEATED!</span>
        )}
        {log.phases.outcome.wipe && (
          <span className="font-bold text-[var(--rpg-red)]">WIPE!</span>
        )}
      </div>

      {/* Next round telegraph */}
      {log.telegraph && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--rpg-gold)' }}>
          <span>⚠️</span>
          <span className="font-semibold">Next: {log.telegraph.warningText}</span>
        </div>
      )}
    </div>
  );
}

function SelfAttackEntry({ entry }: { entry: BossPlayerAttackLog }) {
  return (
    <div className="rounded px-2 py-1.5 border border-[var(--rpg-border)]"
      style={{ background: 'rgba(59,130,246,0.08)' }}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[var(--rpg-blue-light)]">
          You — {entry.actionLabel}
        </span>
        {entry.hit ? (
          <span className={entry.crit ? 'font-bold text-[var(--rpg-gold)]' : 'text-[var(--rpg-green-light)]'}>
            {entry.crit ? 'CRIT!' : 'HIT'} — {entry.totalDamage} dmg
          </span>
        ) : (
          <span className="text-[var(--rpg-text-secondary)]">MISS</span>
        )}
      </div>
      <div className="mt-0.5 text-[var(--rpg-text-secondary)]">
        Roll {entry.attackRoll} + {entry.modifier} = {entry.totalRoll} vs {entry.defenseTarget} defense
        {entry.hit && entry.damageRoll !== undefined && (
          <span className="ml-2">
            | Damage: {entry.damageRoll}{entry.damageBonus ? ` + ${entry.damageBonus}` : ''} → {entry.totalDamage}
          </span>
        )}
        {entry.staminaCost && <span className="ml-2">| -{entry.staminaCost} stamina</span>}
        {entry.manaCost && <span className="ml-2">| -{entry.manaCost} mana</span>}
      </div>
    </div>
  );
}

function OtherAttackEntry({ entry }: { entry: BossPlayerAttackLog }) {
  return (
    <div className="px-2 py-0.5">
      <span className="text-[var(--rpg-text-primary)]">{entry.username}</span>
      {': '}
      <span className="text-[var(--rpg-text-secondary)]">{entry.actionLabel}</span>
      {' → '}
      {entry.hit ? (
        <span className={entry.crit ? 'font-bold text-[var(--rpg-gold)]' : 'text-[var(--rpg-green-light)]'}>
          {entry.crit ? 'CRIT ' : ''}HIT for {entry.totalDamage} dmg
        </span>
      ) : (
        <span className="text-[var(--rpg-text-secondary)]">MISS</span>
      )}
    </div>
  );
}

function BossActionEntry({ action, playerId }: { action: BossBossActionLog; playerId: string }) {
  return (
    <div className={`rounded px-2 py-1.5 ${action.wasTelegraphed ? 'border border-[var(--rpg-gold)]' : ''}`}
      style={action.wasTelegraphed ? { background: 'rgba(234,179,8,0.1)' } : undefined}>
      <div className="flex items-center gap-2">
        {action.wasTelegraphed && (
          <span className="text-[10px] font-bold px-1 py-0.5 rounded"
            style={{ background: 'var(--rpg-gold)', color: 'var(--rpg-bg)' }}>
            TELEGRAPHED
          </span>
        )}
        <span className="font-semibold text-[var(--rpg-red)]">
          {action.actionLabel}
          {action.targetMode === 'aoe' && ' (AoE)'}
        </span>
      </div>
      <div className="mt-0.5 space-y-0.5">
        {action.targets.map((t) => (
          <div key={t.playerId} className="flex items-center gap-1">
            <span className={t.playerId === playerId ? 'text-[var(--rpg-blue-light)]' : ''}>
              {t.playerId === playerId ? 'You' : t.username}
            </span>
            {': '}
            <span className="text-[var(--rpg-red)]">{t.damageTaken} dmg</span>
            {t.blocked > 0 && (
              <span className="text-[var(--rpg-text-secondary)]">({t.blocked} blocked)</span>
            )}
            {t.knockedOut && (
              <span className="inline-flex items-center gap-0.5 text-[var(--rpg-red)] font-bold">
                <Skull size={10} /> KO
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HealingEntry({ entry }: { entry: BossHealingLog }) {
  const isSelf = entry.playerId === entry.targetPlayerId;
  return (
    <div className="px-2 py-0.5">
      <span className="text-[var(--rpg-text-primary)]">{entry.username}</span>
      {': '}
      <span className="text-[var(--rpg-text-secondary)]">{entry.actionLabel}</span>
      {' → '}
      <span className="text-[var(--rpg-green-light)]">
        +{entry.amountHealed} HP
        {!isSelf && <> to {entry.targetUsername}</>}
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```
feat(web): add BossRoundLogView component for phased round display
```

---

### Task 8: BossPreRoundView component

**Files:**
- Create: `apps/web/src/components/boss/BossPreRoundView.tsx`

**Step 1: Create the pre-round view component**

Shows telegraph warning, known rotation, and signup list before a round resolves.

```typescript
'use client';

import { useEffect, useState } from 'react';
import { getBossRotation, type BossTelegraphLog, type BossRotationReveal } from '@/lib/api';

interface BossPreRoundViewProps {
  encounterId: string;
  prevTelegraph: BossTelegraphLog | null;
  signedUpPlayers: Array<{ username: string; autoSignUp: boolean }>;
}

export function BossPreRoundView({ encounterId, prevTelegraph, signedUpPlayers }: BossPreRoundViewProps) {
  const [rotation, setRotation] = useState<BossRotationReveal | null>(null);

  useEffect(() => {
    getBossRotation(encounterId).then(res => {
      if (res.data) setRotation(res.data);
    });
  }, [encounterId]);

  return (
    <div className="space-y-3 text-xs border border-[var(--rpg-border)] rounded-lg p-3 bg-[var(--rpg-surface-dark)]">
      {/* Telegraph warning */}
      {prevTelegraph && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--rpg-gold)' }}>
          <span>⚠️</span>
          <span className="font-semibold">Telegraphed: {prevTelegraph.warningText}</span>
        </div>
      )}

      {/* Known rotation */}
      {rotation && rotation.totalRounds > 0 && (
        <div>
          <p className="font-semibold mb-1 text-[var(--rpg-text-primary)]">📖 Known Boss Rotation</p>
          <div className="space-y-0.5">
            {Array.from({ length: rotation.totalRounds }, (_, i) => {
              const known = rotation.actions.find(a => a.round === i + 1);
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5">
                  <span className="w-6 text-[var(--rpg-text-secondary)]">R{i + 1}</span>
                  {known ? (
                    <>
                      <span className="text-[var(--rpg-text-primary)]">{known.actionName}</span>
                      <span className="text-[var(--rpg-text-secondary)]">({known.targetMode === 'aoe' ? 'AoE' : 'Single'})</span>
                      {known.isTelegraphed && (
                        <span className="text-[10px] px-1 py-0.5 rounded"
                          style={{ background: 'rgba(234,179,8,0.2)', color: 'var(--rpg-gold)' }}>
                          telegraphed
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[var(--rpg-text-secondary)]">???</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signed up players */}
      {signedUpPlayers.length > 0 && (
        <div>
          <p className="font-semibold mb-1 text-[var(--rpg-text-primary)]">
            👥 Signed Up ({signedUpPlayers.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {signedUpPlayers.map((p, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[var(--rpg-text-primary)]"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                {p.username}
                {p.autoSignUp && <span className="ml-0.5 opacity-60">(auto)</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```
feat(web): add BossPreRoundView component with rotation and telegraph
```

---

### Task 9: Integrate into BossEncounterPanel

**Files:**
- Modify: `apps/web/src/components/BossEncounterPanel.tsx`

**Step 1: Add expandable round log to existing round list**

Add imports:
```typescript
import { BossRoundLogView } from '@/components/boss/BossRoundLogView';
import { BossPreRoundView } from '@/components/boss/BossPreRoundView';
import type { BossRoundLog, BossTelegraphLog } from '@/lib/api';
```

Add state for expanded round:
```typescript
const [expandedRound, setExpandedRound] = useState<number | null>(null);
```

Build a roundLogs map from encounter data:
```typescript
const roundLogMap = useMemo(() => {
  const map = new Map<number, BossRoundLog>();
  if (encounter?.roundLogs) {
    for (const log of encounter.roundLogs) {
      map.set(log.round, log);
    }
  }
  return map;
}, [encounter?.roundLogs]);
```

Helper for previous round's telegraph:
```typescript
function getPrevTelegraph(roundNum: number): BossTelegraphLog | null {
  const prevLog = roundLogMap.get(roundNum - 1);
  return prevLog?.telegraph ?? null;
}
```

**Step 2: Add pre-round view before signup section**

Before the signup section (around line 229), when `!isOver`, add:

```typescript
{/* Pre-round view (telegraph + rotation + signups for next round) */}
{!isOver && encounter && (() => {
  const nextRound = encounter.roundNumber + 1;
  const nextRoundParticipants = participants
    .filter(p => p.roundNumber === nextRound)
    .map(p => ({ username: displayName(p.playerId), autoSignUp: p.autoSignUp }));
  const lastTelegraph = roundLogMap.get(encounter.roundNumber)?.telegraph ?? null;

  return (
    <BossPreRoundView
      encounterId={encounterId}
      prevTelegraph={lastTelegraph}
      signedUpPlayers={nextRoundParticipants}
    />
  );
})()}
```

**Step 3: Make round headers clickable and render log when expanded**

In the round groups section (~line 321-411), make the round header row a clickable button that toggles `expandedRound`. When expanded and a `BossRoundLog` exists for that round, render `BossRoundLogView` below the header.

Replace the round header div (line 326-333):
```typescript
<button
  type="button"
  className="flex justify-between text-xs font-semibold mb-1 w-full text-left"
  style={{ color: 'var(--rpg-gold)' }}
  onClick={() => setExpandedRound(expandedRound === roundNum ? null : roundNum)}
>
  <span>Round {roundNum} {expandedRound === roundNum ? '▼' : '▶'}</span>
  {summary && (
    <span>
      Boss dealt {summary.bossDamage.toLocaleString()} dmg | Players dealt {summary.totalPlayerDamage.toLocaleString()} dmg
    </span>
  )}
</button>
```

After the header, conditionally render the log view:
```typescript
{expandedRound === roundNum && roundLogMap.has(roundNum) && playerId && (
  <BossRoundLogView
    log={roundLogMap.get(roundNum)!}
    playerId={playerId}
    prevTelegraph={getPrevTelegraph(roundNum)}
  />
)}
```

Keep existing participant rows visible only when round is NOT expanded (they're redundant when the log is shown):
```typescript
{expandedRound !== roundNum && (
  <div className="space-y-1.5">
    {/* existing participant rows */}
  </div>
)}
```

**Step 4: Verify frontend typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors (pre-existing error in page.tsx is expected)

**Step 5: Commit**

```
feat(web): integrate round log and pre-round views into BossEncounterPanel
```

---

### Task 10: Update BossHistory to use round logs

**Files:**
- Modify: `apps/web/src/components/screens/BossHistory.tsx`

**Step 1: Add lazy-load round logs on expand**

When a history entry is expanded, fetch the full encounter via `getBossEncounter` to get `roundLogs`. Store in a map.

Add imports:
```typescript
import { getBossEncounter, type BossRoundLog, type BossTelegraphLog } from '@/lib/api';
import { BossRoundLogView } from '@/components/boss/BossRoundLogView';
```

Add state:
```typescript
const [roundLogs, setRoundLogs] = useState<Map<string, BossRoundLog[]>>(new Map());
const [expandedRound, setExpandedRound] = useState<{ encounterId: string; round: number } | null>(null);
const [loadingLogs, setLoadingLogs] = useState<string | null>(null);
```

Modify the expand handler to lazy-load:
```typescript
async function handleExpand(encounterId: string) {
  if (expandedId === encounterId) {
    setExpandedId(null);
    return;
  }
  setExpandedId(encounterId);
  setExpandedRound(null);

  if (!roundLogs.has(encounterId)) {
    setLoadingLogs(encounterId);
    const res = await getBossEncounter(encounterId);
    if (res.data?.encounter.roundLogs) {
      setRoundLogs(prev => new Map(prev).set(encounterId, res.data!.encounter.roundLogs ?? []));
    }
    setLoadingLogs(null);
  }
}
```

**Step 2: Replace round breakdown with expandable round log rows**

In the expanded section of each entry, replace the static round summary list (lines 110-126) with clickable round rows that expand to show `BossRoundLogView`:

```typescript
{entry.encounter.roundSummaries && entry.encounter.roundSummaries.length > 0 && (
  <div>
    <p className="font-semibold mb-1">Round breakdown:</p>
    {loadingLogs === entry.encounter.id && (
      <p className="text-[var(--rpg-text-secondary)]">Loading details...</p>
    )}
    <div className="space-y-1">
      {entry.encounter.roundSummaries.map((rs) => {
        const isRoundExpanded = expandedRound?.encounterId === entry.encounter.id && expandedRound.round === rs.round;
        const logs = roundLogs.get(entry.encounter.id) ?? [];
        const log = logs.find(l => l.round === rs.round);
        const prevLog = logs.find(l => l.round === rs.round - 1);

        return (
          <div key={rs.round}>
            <button
              type="button"
              className="flex justify-between w-full text-left"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedRound(isRoundExpanded ? null : { encounterId: entry.encounter.id, round: rs.round });
              }}
            >
              <span>Round <span className="font-pixel text-[8px]">{rs.round}</span> {isRoundExpanded ? '▼' : '▶'}</span>
              <span>
                Players: <span className="font-pixel text-[8px]">{rs.totalPlayerDamage.toLocaleString()}</span> dmg |
                Boss: <span className="font-pixel text-[8px]">{rs.bossDamage.toLocaleString()}</span> dmg |
                HP: <span className="font-pixel text-[8px]">{rs.bossHpPercent}%</span>
              </span>
            </button>
            {isRoundExpanded && log && (
              <BossRoundLogView
                log={log}
                playerId={/* need player ID */}
                prevTelegraph={prevLog?.telegraph ?? null}
              />
            )}
          </div>
        );
      })}
    </div>
  </div>
)}
```

The `BossHistory` component needs the current player's ID. Add a prop or fetch it. The simplest approach: accept `playerId` as a prop from the parent game controller.

Update `BossHistory` to accept `playerId`:
```typescript
interface BossHistoryProps {
  playerId?: string;
}

export function BossHistory({ playerId }: BossHistoryProps) {
```

Pass it through from the game controller / screen navigation.

**Step 3: Verify frontend typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No new errors

**Step 4: Commit**

```
feat(web): add expandable round logs to BossHistory screen
```

---

### Task 11: Verify and final typecheck

**Step 1: Build all packages**

Run: `npm run build:packages`
Expected: All packages build

**Step 2: Run game engine tests**

Run: `npm run test:engine -- --run`
Expected: All tests pass

**Step 3: Run API tests**

Run: `npm run test:api -- --run`
Expected: All tests pass (boss service tests may need `username` field added to mock participants)

**Step 4: Full typecheck**

Run: `npm run typecheck`
Expected: No new errors

**Step 5: Commit any fixes from verification**

```
fix: address typecheck and test issues from boss round log feature
```
