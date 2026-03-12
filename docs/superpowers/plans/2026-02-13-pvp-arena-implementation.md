# PvP Arena System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generalize the combat engine to support any-vs-any combat, then build an async PvP arena system on top of it.

**Architecture:** Refactor `runCombat` from player/mob-specific to combatant-agnostic (Approach B from design). Then add PvP tables, Elo service, PvP routes, and an Arena frontend screen. PvP is async ghost-based — fight a snapshot of the defender's stats/gear.

**Tech Stack:** TypeScript, Prisma (Postgres), Express, Next.js, existing game-engine pure functions.

**Design doc:** `docs/superpowers/specs/2026-02-13-pvp-arena-design.md`

---

## Phase 1: Combat Engine Generalization

### Task 1: Refactor combat types

**Files:**
- Modify: `packages/shared/src/types/combat.types.ts`

**Step 1: Add `CombatActor` type and `Combatant` interface**

Add after the `SpellAction` interface (after line 35):

```typescript
export type CombatActor = 'combatantA' | 'combatantB';

export interface Combatant {
  id: string;
  name: string;
  stats: CombatantStats;
  spells?: SpellAction[];
}
```

**Step 2: Update `ActiveEffect.target`**

Change line 39 from `target: 'player' | 'mob'` to `target: CombatActor`.

**Step 3: Update `CombatState`**

Replace the `CombatState` interface (lines 45-54):

```typescript
export interface CombatState {
  combatantAHp: number;
  combatantAMaxHp: number;
  combatantBHp: number;
  combatantBMaxHp: number;
  round: number;
  log: CombatLogEntry[];
  outcome: CombatOutcome | null;
  activeEffects: ActiveEffect[];
}
```

**Step 4: Update `CombatLogEntry`**

Replace the `CombatLogEntry` interface (lines 56-90):

```typescript
export interface CombatLogEntry {
  round: number;
  actor: CombatActor;
  actorName: string;
  action: CombatAction;
  roll?: number;
  damage?: number;
  blocked?: number;
  evaded?: boolean;
  message: string;
  attackModifier?: number;
  accuracyModifier?: number;
  targetDodge?: number;
  targetEvasion?: number;
  targetDefence?: number;
  targetMagicDefence?: number;
  rawDamage?: number;
  armorReduction?: number;
  magicDefenceReduction?: number;
  isCritical?: boolean;
  critMultiplier?: number;
  combatantAHpAfter?: number;
  combatantBHpAfter?: number;
  spellName?: string;
  healAmount?: number;
  effectsApplied?: Array<{
    stat: string;
    modifier: number;
    duration: number;
    target: CombatActor;
  }>;
  effectsExpired?: Array<{
    name: string;
    target: CombatActor;
  }>;
}
```

**Step 5: Update `CombatResult`**

Replace the `CombatResult` interface (lines 96-106). Remove `xpGained`, `loot`, `durabilityLost`, `turnsSpent` — these are caller concerns, not engine concerns. Add `combatantBHpRemaining`.

```typescript
export interface CombatResult {
  outcome: CombatOutcome;
  log: CombatLogEntry[];
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  combatantAHpRemaining: number;
  combatantBHpRemaining: number;
}
```

Keep `LootDrop` and `DurabilityLoss` types — they're still used by the API layer.

**Step 6: Build shared package and verify**

```bash
npm run build --workspace=packages/shared
```

Expected: build succeeds (shared has no downstream deps at this stage).

**Step 7: Commit**

```bash
git add packages/shared/src/types/combat.types.ts
git commit -m "refactor: generalize combat types to combatant-agnostic"
```

---

### Task 2: Add `mobToCombatantStats` utility

**Files:**
- Modify: `packages/game-engine/src/combat/damageCalculator.ts`
- Test: `packages/game-engine/src/combat/damageCalculator.test.ts`

**Step 1: Write a failing test**

Add to `damageCalculator.test.ts`:

```typescript
import { mobToCombatantStats } from './damageCalculator';
import type { MobTemplate } from '@adventure/shared';

describe('mobToCombatantStats', () => {
  const baseMob: MobTemplate = {
    id: 'mob1', name: 'Goblin', zoneId: 'z1', level: 5,
    hp: 50, accuracy: 12, defence: 8, magicDefence: 4, evasion: 6,
    damageMin: 3, damageMax: 7, xpReward: 25, encounterWeight: 1,
    spellPattern: [], damageType: 'physical',
  };

  it('maps MobTemplate fields to CombatantStats', () => {
    const stats = mobToCombatantStats(baseMob);
    expect(stats.hp).toBe(50);
    expect(stats.maxHp).toBe(50);
    expect(stats.attack).toBe(12);     // mob.accuracy → attack
    expect(stats.accuracy).toBe(12);   // mob.accuracy → accuracy
    expect(stats.defence).toBe(8);
    expect(stats.magicDefence).toBe(4);
    expect(stats.dodge).toBe(6);       // mob.evasion → dodge
    expect(stats.evasion).toBe(0);     // always 0 for mobs
    expect(stats.speed).toBe(0);       // always 0 for mobs
    expect(stats.damageMin).toBe(3);
    expect(stats.damageMax).toBe(7);
    expect(stats.damageType).toBe('physical');
  });

  it('uses currentHp/maxHp overrides when provided', () => {
    const wounded = { ...baseMob, currentHp: 30, maxHp: 60 };
    const stats = mobToCombatantStats(wounded);
    expect(stats.hp).toBe(30);
    expect(stats.maxHp).toBe(60);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run test:engine -- --run damageCalculator
```

**Step 3: Implement `mobToCombatantStats`**

Add to `damageCalculator.ts` (after `buildPlayerCombatStats`):

```typescript
export function mobToCombatantStats(
  mob: MobTemplate & { currentHp?: number; maxHp?: number }
): CombatantStats {
  return {
    hp: mob.currentHp ?? mob.hp,
    maxHp: mob.maxHp ?? mob.hp,
    attack: mob.accuracy,
    accuracy: mob.accuracy,
    defence: mob.defence,
    magicDefence: mob.magicDefence,
    dodge: mob.evasion,
    evasion: 0,
    damageMin: mob.damageMin,
    damageMax: mob.damageMax,
    speed: 0,
    damageType: mob.damageType,
  };
}
```

Add `MobTemplate` to the imports from `@adventure/shared`.

**Step 4: Run test to verify it passes**

```bash
npm run test:engine -- --run damageCalculator
```

**Step 5: Commit**

```bash
git add packages/game-engine/src/combat/damageCalculator.ts packages/game-engine/src/combat/damageCalculator.test.ts
git commit -m "feat: add mobToCombatantStats utility function"
```

---

### Task 3: Refactor combat engine

**Files:**
- Modify: `packages/game-engine/src/combat/combatEngine.ts`

This is the largest single task. Replace the hardcoded player/mob logic with a generic combatant system.

**Step 1: Rewrite `combatEngine.ts`**

The full refactored file. Key changes:
- `runCombat(combatantA: Combatant, combatantB: Combatant)` signature
- Single `executeAttack()` function replaces `executePlayerAttack` + `executeMobAttack`
- `executeSpell` uses `CombatActor` instead of `'player' | 'mob'`
- All state fields use `combatantA`/`combatantB` naming
- Log messages use combatant names instead of "You"/"The mob"

```typescript
import {
  ActiveEffect,
  CombatActor,
  CombatState,
  CombatLogEntry,
  CombatResult,
  CombatantStats,
  Combatant,
  SpellAction,
} from '@adventure/shared';
import {
  rollD20,
  rollDamage,
  doesAttackHit,
  isCriticalHit,
  calculateFinalDamage,
  calculateDefenceReduction,
  rollInitiative,
} from './damageCalculator';

const MAX_ROUNDS = 100;

function getHp(state: CombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAHp : state.combatantBHp;
}

function getMaxHp(state: CombatState, actor: CombatActor): number {
  return actor === 'combatantA' ? state.combatantAMaxHp : state.combatantBMaxHp;
}

function applyDamage(state: CombatState, target: CombatActor, damage: number): void {
  if (target === 'combatantA') {
    state.combatantAHp -= damage;
  } else {
    state.combatantBHp -= damage;
  }
}

function applyHeal(state: CombatState, target: CombatActor, heal: number): number {
  if (target === 'combatantA') {
    const before = state.combatantAHp;
    state.combatantAHp = Math.min(state.combatantAMaxHp, state.combatantAHp + heal);
    return state.combatantAHp - before;
  } else {
    const before = state.combatantBHp;
    state.combatantBHp = Math.min(state.combatantBMaxHp, state.combatantBHp + heal);
    return state.combatantBHp - before;
  }
}

function opponent(actor: CombatActor): CombatActor {
  return actor === 'combatantA' ? 'combatantB' : 'combatantA';
}

function hpSnapshot(state: CombatState): Pick<CombatLogEntry, 'combatantAHpAfter' | 'combatantBHpAfter'> {
  return {
    combatantAHpAfter: Math.max(0, state.combatantAHp),
    combatantBHpAfter: Math.max(0, state.combatantBHp),
  };
}

function tickEffects(state: CombatState, names: { combatantA: string; combatantB: string }): void {
  const expired: ActiveEffect[] = [];
  const remaining: ActiveEffect[] = [];

  for (const effect of state.activeEffects) {
    effect.remainingRounds--;
    if (effect.remainingRounds <= 0) {
      expired.push(effect);
    } else {
      remaining.push(effect);
    }
  }

  state.activeEffects = remaining;

  const expiredNames = new Map<string, { target: CombatActor }>();
  for (const e of expired) {
    if (!expiredNames.has(e.name)) {
      expiredNames.set(e.name, { target: e.target });
    }
  }

  if (expiredNames.size > 0) {
    state.log.push({
      round: state.round,
      actor: 'combatantB',
      actorName: names.combatantB,
      action: 'spell',
      message: Array.from(expiredNames.keys()).map(n => `${n} wore off.`).join(' '),
      effectsExpired: Array.from(expiredNames.entries()).map(([name, { target }]) => ({ name, target })),
      ...hpSnapshot(state),
    });
  }
}

function getEffectiveStats(baseStats: CombatantStats, activeEffects: ActiveEffect[], target: CombatActor): CombatantStats {
  const effective = { ...baseStats };

  for (const effect of activeEffects) {
    if (effect.target !== target) continue;

    switch (effect.stat) {
      case 'attack':
        effective.damageMin += effect.modifier;
        effective.damageMax += effect.modifier;
        break;
      case 'accuracy': effective.accuracy += effect.modifier; break;
      case 'defence': effective.defence += effect.modifier; break;
      case 'magicDefence': effective.magicDefence += effect.modifier; break;
      case 'dodge': effective.dodge += effect.modifier; break;
      case 'evasion': effective.evasion += effect.modifier; break;
      case 'speed': effective.speed += effect.modifier; break;
      case 'critChance': effective.critChance = (effective.critChance ?? 0) + effect.modifier; break;
      case 'damageMin': effective.damageMin += effect.modifier; break;
      case 'damageMax': effective.damageMax += effect.modifier; break;
    }
  }

  effective.defence = Math.max(0, effective.defence);
  effective.magicDefence = Math.max(0, effective.magicDefence);
  effective.dodge = Math.max(0, effective.dodge);
  effective.evasion = Math.max(0, effective.evasion);
  effective.damageMin = Math.max(1, effective.damageMin);
  effective.damageMax = Math.max(effective.damageMin, effective.damageMax);

  return effective;
}

/**
 * Run a complete combat encounter between two combatants.
 * Pure function — no side effects, fully deterministic given same random seed.
 */
export function runCombat(combatantA: Combatant, combatantB: Combatant): CombatResult {
  const state: CombatState = {
    combatantAHp: combatantA.stats.hp,
    combatantAMaxHp: combatantA.stats.maxHp,
    combatantBHp: combatantB.stats.hp,
    combatantBMaxHp: combatantB.stats.maxHp,
    round: 0,
    log: [],
    outcome: null,
    activeEffects: [],
  };

  const names = { combatantA: combatantA.name, combatantB: combatantB.name };

  const initA = rollInitiative(combatantA.stats.speed);
  const initB = rollInitiative(combatantB.stats.speed);
  const aGoesFirst = initA >= initB;

  const firstName = aGoesFirst ? combatantA.name : combatantB.name;
  state.log.push({
    round: 0,
    actor: aGoesFirst ? 'combatantA' : 'combatantB',
    actorName: firstName,
    action: 'attack',
    roll: initA,
    message: `Combat begins! Initiative: ${combatantA.name} ${initA}, ${combatantB.name} ${initB}`,
    ...hpSnapshot(state),
  });

  while (state.round < MAX_ROUNDS && state.outcome === null) {
    state.round++;

    const effectiveA = getEffectiveStats(combatantA.stats, state.activeEffects, 'combatantA');
    const effectiveB = getEffectiveStats(combatantB.stats, state.activeEffects, 'combatantB');

    if (aGoesFirst) {
      executeAttack(state, 'combatantA', effectiveA, effectiveB, combatantA, combatantB);
      if (state.outcome) break;
      executeAttack(state, 'combatantB', effectiveB, effectiveA, combatantB, combatantA);
    } else {
      executeAttack(state, 'combatantB', effectiveB, effectiveA, combatantB, combatantA);
      if (state.outcome) break;
      executeAttack(state, 'combatantA', effectiveA, effectiveB, combatantA, combatantB);
    }

    tickEffects(state, names);
  }

  if (state.outcome === null) {
    state.outcome = 'defeat';
    state.log.push({
      round: state.round,
      actor: 'combatantB',
      actorName: combatantB.name,
      action: 'attack',
      message: 'Combat timed out. The fight ends in exhaustion.',
      ...hpSnapshot(state),
    });
  }

  return {
    outcome: state.outcome,
    log: state.log,
    combatantAMaxHp: state.combatantAMaxHp,
    combatantBMaxHp: state.combatantBMaxHp,
    combatantAHpRemaining: Math.max(0, state.combatantAHp),
    combatantBHpRemaining: Math.max(0, state.combatantBHp),
  };
}

function executeAttack(
  state: CombatState,
  attackerKey: CombatActor,
  attackerStats: CombatantStats,
  defenderStats: CombatantStats,
  attacker: Combatant,
  defender: Combatant,
): void {
  // Check for spells first
  const spellAction = attacker.spells?.find((s) => s.round === state.round);
  if (spellAction) {
    executeSpell(state, spellAction, attackerKey, attackerStats, defenderStats, attacker.name, defender.name);
    return;
  }

  const attackRoll = rollD20();
  const hits = doesAttackHit(attackRoll, attackerStats.accuracy, defenderStats.dodge, defenderStats.evasion);

  if (!hits) {
    const wouldHitWithoutAvoidance = doesAttackHit(attackRoll, attackerStats.accuracy, 0, 0);

    state.log.push({
      round: state.round,
      actor: attackerKey,
      actorName: attacker.name,
      action: 'attack',
      roll: attackRoll,
      evaded: wouldHitWithoutAvoidance,
      attackModifier: attackerStats.attack,
      accuracyModifier: attackerStats.accuracy,
      targetDodge: defenderStats.dodge,
      targetEvasion: defenderStats.evasion,
      message: wouldHitWithoutAvoidance
        ? `${defender.name} avoids ${attacker.name}'s attack!`
        : `${attacker.name} swings at ${defender.name} but misses!`,
      ...hpSnapshot(state),
    });
    return;
  }

  const rawDamage = rollDamage(attackerStats.damageMin, attackerStats.damageMax);
  const crit = isCriticalHit(attackerStats.critChance ?? 0);
  const effectiveDefence = attackerStats.damageType === 'magic' ? defenderStats.magicDefence : defenderStats.defence;
  const { damage: finalDamage, actualMultiplier } = calculateFinalDamage(rawDamage, effectiveDefence, crit, attackerStats.critDamage ?? 0);
  const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));

  applyDamage(state, opponent(attackerKey), finalDamage);

  const critText = crit ? ' CRITICAL HIT!' : '';
  state.log.push({
    round: state.round,
    actor: attackerKey,
    actorName: attacker.name,
    action: 'attack',
    roll: attackRoll,
    damage: finalDamage,
    attackModifier: attackerStats.attack,
    accuracyModifier: attackerStats.accuracy,
    targetDodge: defenderStats.dodge,
    targetEvasion: defenderStats.evasion,
    targetDefence: attackerStats.damageType === 'magic' ? undefined : defenderStats.defence,
    targetMagicDefence: attackerStats.damageType === 'magic' ? defenderStats.magicDefence : undefined,
    rawDamage,
    armorReduction: attackerStats.damageType === 'magic' ? undefined : armorReduction,
    magicDefenceReduction: attackerStats.damageType === 'magic' ? armorReduction : undefined,
    isCritical: crit,
    ...(crit ? { critMultiplier: actualMultiplier } : {}),
    message: `${attacker.name} strikes ${defender.name} for ${finalDamage} damage!${critText}`,
    ...hpSnapshot(state),
  });

  const defenderHp = getHp(state, opponent(attackerKey));
  if (defenderHp <= 0) {
    // combatantA winning = 'victory', combatantB winning = 'defeat'
    state.outcome = attackerKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push({
      round: state.round,
      actor: attackerKey,
      actorName: attacker.name,
      action: 'attack',
      message: `${defender.name} falls defeated!`,
      ...hpSnapshot(state),
    });
  }
}

function executeSpell(
  state: CombatState,
  spell: SpellAction,
  casterKey: CombatActor,
  casterStats: CombatantStats,
  targetStats: CombatantStats,
  casterName: string,
  targetName: string,
): void {
  let finalDamage = 0;
  let healAmount = 0;
  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  if (spell.damage) {
    const reduction = calculateDefenceReduction(targetStats.magicDefence);
    const mitigated = Math.floor(spell.damage * reduction);
    finalDamage = Math.max(1, spell.damage - mitigated);
    applyDamage(state, opponent(casterKey), finalDamage);
  }

  if (spell.heal) {
    healAmount = applyHeal(state, casterKey, spell.heal);
  }

  if (spell.effects) {
    for (const effect of spell.effects) {
      const target = effect.modifier >= 0 ? casterKey : opponent(casterKey);
      state.activeEffects.push({
        name: spell.name,
        target,
        stat: effect.stat,
        modifier: effect.modifier,
        remainingRounds: effect.duration,
      });
      appliedEffects.push({
        stat: effect.stat,
        modifier: effect.modifier,
        duration: effect.duration,
        target,
      });
    }
  }

  const parts: string[] = [];
  parts.push(`${casterName} casts ${spell.name}`);

  if (finalDamage > 0) {
    parts[0] += ` for ${finalDamage} damage`;
  }
  if (healAmount > 0) {
    if (finalDamage > 0) {
      parts.push(`Heals ${healAmount} HP`);
    } else {
      parts[0] += `! +${healAmount} HP`;
    }
  }
  if (appliedEffects.length > 0 && finalDamage === 0 && healAmount === 0) {
    const effectDesc = appliedEffects.map(e =>
      `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier}, ${e.duration} rds`
    ).join('; ');
    parts[0] += `! (${effectDesc})`;
  }

  const message = parts.length > 1 ? parts[0] + '! ' + parts.slice(1).join('. ') + '.' : parts[0] + '!';

  state.log.push({
    round: state.round,
    actor: casterKey,
    actorName: casterName,
    action: 'spell',
    damage: finalDamage > 0 ? finalDamage : undefined,
    rawDamage: spell.damage,
    targetMagicDefence: spell.damage ? targetStats.magicDefence : undefined,
    magicDefenceReduction: spell.damage ? Math.floor(spell.damage * calculateDefenceReduction(targetStats.magicDefence)) : undefined,
    spellName: spell.name,
    healAmount: healAmount > 0 ? healAmount : undefined,
    effectsApplied: appliedEffects.length > 0 ? appliedEffects : undefined,
    message,
    ...hpSnapshot(state),
  });

  const defenderHp = getHp(state, opponent(casterKey));
  const casterHp = getHp(state, casterKey);

  if (defenderHp <= 0) {
    state.outcome = casterKey === 'combatantA' ? 'victory' : 'defeat';
    state.log.push({
      round: state.round,
      actor: casterKey,
      actorName: casterName,
      action: 'spell',
      message: `${targetName} falls defeated!`,
      ...hpSnapshot(state),
    });
  } else if (casterHp <= 0) {
    state.outcome = casterKey === 'combatantA' ? 'defeat' : 'victory';
    state.log.push({
      round: state.round,
      actor: opponent(casterKey),
      actorName: targetName,
      action: 'spell',
      message: `${casterName} has been knocked out!`,
      ...hpSnapshot(state),
    });
  }
}
```

**Step 2: Build game-engine to check for type errors**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
```

Note: the API and web packages will have errors at this point — that's expected, they'll be fixed in later tasks.

**Step 3: Commit**

```bash
git add packages/game-engine/src/combat/combatEngine.ts
git commit -m "refactor: generalize combat engine to combatant-agnostic"
```

---

### Task 4: Update combat engine tests

**Files:**
- Modify: `packages/game-engine/src/combat/combatEngine.test.ts`

**Step 1: Update all tests to use `Combatant` objects**

Every test that calls `runCombat` currently passes `(playerStats: CombatantStats, mob: MobTemplate)`. Change these to `(combatantA: Combatant, combatantB: Combatant)`.

Pattern for converting existing test setup:

**Before:**
```typescript
const playerStats: CombatantStats = { hp: 100, maxHp: 100, ... };
const mob: MobTemplate = { id: 'mob1', name: 'Goblin', ... };
const result = runCombat(playerStats, mob);
```

**After:**
```typescript
const playerStats: CombatantStats = { hp: 100, maxHp: 100, ... };
const mobStats: CombatantStats = { hp: 50, maxHp: 50, attack: mob.accuracy, accuracy: mob.accuracy, defence: mob.defence, ... };
const combatantA: Combatant = { id: 'player1', name: 'Player', stats: playerStats };
const combatantB: Combatant = { id: 'mob1', name: 'Goblin', stats: mobStats, spells: mob.spellPattern };
const result = runCombat(combatantA, combatantB);
```

Update assertions that reference old field names:
- `result.playerMaxHp` → `result.combatantAMaxHp`
- `result.mobMaxHp` → `result.combatantBMaxHp`
- `result.playerHpRemaining` → `result.combatantAHpRemaining`
- `result.xpGained` → remove (no longer on CombatResult)
- `entry.actor === 'player'` → `entry.actor === 'combatantA'`
- `entry.actor === 'mob'` → `entry.actor === 'combatantB'`
- `entry.playerHpAfter` → `entry.combatantAHpAfter`
- `entry.mobHpAfter` → `entry.combatantBHpAfter`

**Step 2: Run tests**

```bash
npm run test:engine -- --run combatEngine
```

**Step 3: Commit**

```bash
git add packages/game-engine/src/combat/combatEngine.test.ts
git commit -m "test: update combat engine tests for combatant-agnostic types"
```

---

### Task 5: Export new types from game-engine

**Files:**
- Modify: `packages/game-engine/src/index.ts` (if `mobToCombatantStats` isn't already exported via the wildcard re-export)

**Step 1: Verify exports**

The existing `export * from './combat/damageCalculator'` should already export `mobToCombatantStats`. Verify by building:

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
npm run test:engine -- --run
```

All engine tests must pass.

**Step 2: Commit (if changes needed)**

---

## Phase 2: API + Frontend Adaptation

### Task 6: Update API combat route

**Files:**
- Modify: `apps/api/src/routes/combat.ts`

**Step 1: Update imports**

Add `Combatant` to imports from `@adventure/shared`. Add `mobToCombatantStats` to imports from `@adventure/game-engine`.

**Step 2: Update the combat execution block**

In `POST /start` (around line 542), change from:

```typescript
const combatResult = runCombat(playerStats, prefixedMob);
```

To:

```typescript
const combatantA: Combatant = {
  id: playerId,
  name: player.username,
  stats: playerStats,
};

const combatantB: Combatant = {
  id: prefixedMob.id,
  name: prefixedMob.mobDisplayName ?? prefixedMob.name,
  stats: mobToCombatantStats(prefixedMob),
  spells: prefixedMob.spellPattern,
};

const combatResult = runCombat(combatantA, combatantB);
```

**Step 3: Update all references to old CombatResult fields**

Search and replace throughout the file:
- `combatResult.playerMaxHp` → `combatResult.combatantAMaxHp`
- `combatResult.mobMaxHp` → `combatResult.combatantBMaxHp`
- `combatResult.playerHpRemaining` → `combatResult.combatantAHpRemaining`
- `combatResult.xpGained` → `prefixedMob.xpReward` (only in victory branch)
- Remove any reads of `combatResult.loot`, `combatResult.durabilityLost`, `combatResult.turnsSpent` (these were always empty/zero from the engine anyway)

**Step 4: Update the API response JSON**

The response currently sends `playerMaxHp` and `mobMaxHp` fields. Update to send the new field names, OR keep the response format and map:

```typescript
// In the response JSON:
combat: {
  ...
  playerMaxHp: combatResult.combatantAMaxHp,
  mobMaxHp: combatResult.combatantBMaxHp,
  ...
}
```

**Decision: keep the PvE API response format unchanged** to minimize frontend churn. The API translates from generic engine types to the existing response shape. The combat log entries in the response keep the new `combatantA`/`combatantB` actor values and gain the `actorName` field — the frontend will be updated to use these.

For the combat log entries in the response, map the engine's log entries to include the new fields:

```typescript
log: combatResult.log.map(entry => ({
  ...entry,
  // Keep backward compat aliases for frontend transition
  playerHpAfter: entry.combatantAHpAfter,
  mobHpAfter: entry.combatantBHpAfter,
})),
```

**Note:** You can either keep both old and new field names during transition, or update the frontend simultaneously. The cleaner approach is to update the frontend to use the new field names directly.

**Step 5: Build and verify**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
npx tsc --noEmit -p apps/api/tsconfig.json
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/combat.ts
git commit -m "refactor: update combat route for combatant-agnostic engine"
```

---

### Task 7: Update frontend combat types

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/combatShare.ts`
- Modify: `apps/web/src/lib/combatShare.test.ts`

**Step 1: Update `CombatLogEntryResponse` in `api.ts`**

Around line 502-523, update the type:
- `actor: 'player' | 'mob'` → `actor: 'combatantA' | 'combatantB'`
- Add `actorName: string`
- `playerHpAfter?: number` → `combatantAHpAfter?: number`
- `mobHpAfter?: number` → `combatantBHpAfter?: number`
- Update `effectsApplied` and `effectsExpired` target types to `'combatantA' | 'combatantB'`

**Step 2: Update `combatShare.ts`**

- `ShareCombatLogEntry.actor` → `'combatantA' | 'combatantB'`
- `playerHpAfter` → `combatantAHpAfter`
- `mobHpAfter` → `combatantBHpAfter`
- Update `resolvePlayerMaxHp` and `resolveMobMaxHp` to use new field names (or rename them to `resolveCombatantAMaxHp`/`resolveCombatantBMaxHp`)
- Update `formatCombatShareText` to use `actorName` instead of hardcoded "You"/"Mob"

**Step 3: Update `combatShare.test.ts`**

Update all mock data to use new field names.

**Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/combatShare.ts apps/web/src/lib/combatShare.test.ts
git commit -m "refactor: update frontend combat types for combatant-agnostic engine"
```

---

### Task 8: Update frontend combat components

**Files:**
- Modify: `apps/web/src/components/combat/CombatLogEntry.tsx`
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx`
- Modify: `apps/web/src/components/playback/TurnPlayback.tsx`

**Step 1: Update `CombatLogEntry.tsx`**

- `entry.actor === 'player'` → `entry.actor === 'combatantA'` (combatantA is always "you" in PvE, and the attacker in PvP)
- `entry.playerHpAfter` → `entry.combatantAHpAfter`
- `entry.mobHpAfter` → `entry.combatantBHpAfter`

**Step 2: Update `CombatPlayback.tsx`**

- `shakeTarget` typed as `'combatantA' | 'combatantB' | null`
- `entry.actor === 'player' ? 'mob' : 'player'` → `entry.actor === 'combatantA' ? 'combatantB' : 'combatantA'`
- `entry.playerHpAfter` → `entry.combatantAHpAfter`
- `entry.mobHpAfter` → `entry.combatantBHpAfter`
- Props: `playerMaxHp` → `combatantAMaxHp` (or keep prop names and just change inner logic)

**Step 3: Update `TurnPlayback.tsx`**

- Inline combat log entry type: update `actor`, `playerHpAfter`, `mobHpAfter` field names
- `playerHpAfter` tracking logic → `combatantAHpAfter`

**Step 4: Commit**

```bash
git add apps/web/src/components/combat/ apps/web/src/components/playback/
git commit -m "refactor: update combat components for combatant-agnostic types"
```

---

### Task 9: Update game controller and combat screen

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

**Step 1: Update `LastCombatLogEntry` type in `useGameController.ts`**

Update the inline type that maps API response to local state. Change `playerHpAfter`/`mobHpAfter` fields and `actor` type.

**Step 2: Update `combatPlaybackData` construction**

The playback data object (around line 870) maps `playerMaxHp`, `mobMaxHp` etc. Update field names.

**Step 3: Update `CombatScreen.tsx`**

- `combatPlaybackData.playerMaxHp` → update prop names
- `lastCombat.mobMaxHp` → update field names
- `resolveMobMaxHp` call → update to use new function name if renamed

**Step 4: Full typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/web/src/app/game/
git commit -m "refactor: update game controller and combat screen for combatant-agnostic types"
```

---

### Task 10: Full integration verification

**Step 1: Build all packages**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
```

**Step 2: Run all tests**

```bash
npm run test
```

**Step 3: Full typecheck**

```bash
npm run typecheck
```

**Step 4: Manual smoke test**

```bash
npm run dev
```

Test PvE combat still works end-to-end (start a fight, see combat log, see rewards).

**Step 5: Commit any remaining fixes, then tag the refactor**

```bash
git commit -m "refactor: complete combat engine generalization"
```

---

## Phase 3: PvP Database + Constants

### Task 11: Add PVP constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Add PVP_CONSTANTS**

Add at the end of the file (after `CHAT_CONSTANTS`):

```typescript
export const PVP_CONSTANTS = {
  STARTING_RATING: 1000,
  K_FACTOR: 32,
  BRACKET_RANGE: 0.25,
  CHALLENGE_TURN_COST: 500,
  SCOUT_TURN_COST: 100,
  REVENGE_TURN_COST: 250,
  COOLDOWN_HOURS: 24,
  MIN_OPPONENTS_SHOWN: 10,
  MIN_CHARACTER_LEVEL: 10,
};
```

**Step 2: Build shared**

```bash
npm run build --workspace=packages/shared
```

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add PVP_CONSTANTS to game constants"
```

---

### Task 12: Add PvP database schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add PvP models**

Add after the existing models:

```prisma
model PvpRating {
  id           String    @id @default(uuid())
  playerId     String    @unique @map("player_id")
  player       Player    @relation(fields: [playerId], references: [id])
  rating       Int       @default(1000)
  wins         Int       @default(0)
  losses       Int       @default(0)
  winStreak    Int       @default(0) @map("win_streak")
  bestRating   Int       @default(1000) @map("best_rating")
  lastFoughtAt DateTime? @map("last_fought_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("pvp_ratings")
}

model PvpMatch {
  id                   String   @id @default(uuid())
  attackerId           String   @map("attacker_id")
  attacker             Player   @relation("PvpAttacker", fields: [attackerId], references: [id])
  defenderId           String   @map("defender_id")
  defender             Player   @relation("PvpDefender", fields: [defenderId], references: [id])
  attackerRating       Int      @map("attacker_rating")
  defenderRating       Int      @map("defender_rating")
  attackerRatingChange Int      @map("attacker_rating_change")
  defenderRatingChange Int      @map("defender_rating_change")
  winnerId             String   @map("winner_id")
  combatLog            Json     @map("combat_log")
  attackerStyle        String   @map("attacker_style") @db.VarChar(16)
  defenderStyle        String   @map("defender_style") @db.VarChar(16)
  turnsSpent           Int      @map("turns_spent")
  isRevenge            Boolean  @default(false) @map("is_revenge")
  attackerRead         Boolean  @default(true) @map("attacker_read")
  defenderRead         Boolean  @default(false) @map("defender_read")
  createdAt            DateTime @default(now()) @map("created_at")

  @@index([attackerId, createdAt])
  @@index([defenderId, createdAt])
  @@map("pvp_matches")
}

model PvpCooldown {
  id         String   @id @default(uuid())
  attackerId String   @map("attacker_id")
  defenderId String   @map("defender_id")
  expiresAt  DateTime @map("expires_at")

  @@unique([attackerId, defenderId])
  @@map("pvp_cooldowns")
}
```

**Step 2: Add relations to Player model**

Add to the `Player` model:

```prisma
pvpRating     PvpRating?
pvpAttacks    PvpMatch[] @relation("PvpAttacker")
pvpDefenses   PvpMatch[] @relation("PvpDefender")
```

**Step 3: Generate Prisma client and run migration**

```bash
npm run db:generate
npm run db:migrate -- --name add_pvp_tables
```

**Step 4: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat: add PvP database tables (ratings, matches, cooldowns)"
```

---

## Phase 4: PvP Backend

### Task 13: Create Elo service

**Files:**
- Create: `apps/api/src/services/eloService.ts`
- Create: `apps/api/src/services/eloService.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateEloChange } from './eloService';

describe('calculateEloChange', () => {
  it('equal ratings: winner gains ~16, loser loses ~16', () => {
    const result = calculateEloChange(1000, 1000, 32);
    expect(result.winnerDelta).toBe(16);
    expect(result.loserDelta).toBe(-16);
  });

  it('underdog wins: gains more points', () => {
    const result = calculateEloChange(800, 1200, 32);
    expect(result.winnerDelta).toBeGreaterThan(16);
  });

  it('favorite wins: gains fewer points', () => {
    const result = calculateEloChange(1200, 800, 32);
    expect(result.winnerDelta).toBeLessThan(16);
  });

  it('rating never goes below 0', () => {
    const result = calculateEloChange(1200, 10, 32);
    expect(result.loserDelta).toBeGreaterThanOrEqual(-10);
  });
});
```

**Step 2: Implement**

```typescript
export function calculateEloChange(
  winnerRating: number,
  loserRating: number,
  kFactor: number,
): { winnerDelta: number; loserDelta: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const winnerDelta = Math.round(kFactor * (1 - expectedWinner));
  // Ensure loser can't go below 0
  const loserDelta = Math.max(-loserRating, -winnerDelta);
  return { winnerDelta, loserDelta };
}
```

**Step 3: Run tests, commit**

```bash
npm run test:api -- --run eloService
git add apps/api/src/services/eloService.ts apps/api/src/services/eloService.test.ts
git commit -m "feat: add Elo rating calculation service"
```

---

### Task 14: Create PvP service

**Files:**
- Create: `apps/api/src/services/pvpService.ts`

This is the core PvP business logic. Key functions:

**`getOrCreateRating(playerId)`** — upserts PvpRating record on first arena visit.

**`getLadder(playerId)`** — queries players within Elo bracket:
```sql
WHERE pvpRating.rating BETWEEN myRating * (1 - BRACKET_RANGE) AND myRating * (1 + BRACKET_RANGE)
AND playerId != myId
AND characterLevel >= MIN_CHARACTER_LEVEL
```
Excludes players on cooldown. Returns min `MIN_OPPONENTS_SHOWN` entries (expand bracket if needed).

**`scoutOpponent(playerId, targetId)`** — spend turns, return:
- `combatLevel`: target's character level
- `attackStyle`: inferred from equipped main-hand weapon type
- `armorClass`: inferred from equipped armor weight
- `powerRating`: rough formula from total equipment stats + skill levels

**`challenge(attackerId, targetId, attackStyle, isRevenge)`** — the main PvP flow:
1. Validate: attacker in town, level >= 10, has enough turns, target not on cooldown, target in bracket
2. Check `isRevenge`: verify most recent PvpMatch has target as attacker against this player
3. Build attacker `CombatantStats` via `buildPlayerCombatStats` with full HP
4. Build defender snapshot `CombatantStats` via `buildPlayerCombatStats` with full HP (using defender's equipment + skills)
5. Determine defender's combat style from their equipped weapon
6. Build `Combatant` objects, call `runCombat(attackerCombatant, defenderCombatant)`
7. Calculate Elo changes via `calculateEloChange`
8. In transaction:
   - Spend turns (CHALLENGE_TURN_COST or REVENGE_TURN_COST)
   - Update both players' PvpRating (rating, wins/losses, winStreak, bestRating)
   - Create PvpMatch record
   - Upsert PvpCooldown (24h expiry)
   - Apply durability loss to both players' equipment
9. Return match result with combat log

**`getHistory(playerId, page, pageSize)`** — paginated match history.

**`getNotifications(playerId)`** — unread matches where player was defender (`defenderRead = false`). Mark as read on fetch.

**Implementation notes:**
- Follow the service pattern from `xpService.ts` and `equipmentService.ts` — import prisma directly, export pure-ish functions
- Use `getEquipmentStats(playerId)` from `equipmentService` to build defender stats
- Use `buildPlayerCombatStats` from `@adventure/game-engine` for both combatants
- Defender's attack style: infer from their equipped main-hand item's `attackSkill` field (or default to melee)

**Step 1: Implement the service**

**Step 2: Write tests for key logic (mocking prisma)**

**Step 3: Commit**

```bash
git add apps/api/src/services/pvpService.ts apps/api/src/services/pvpService.test.ts
git commit -m "feat: add PvP service with ladder, scout, challenge, notifications"
```

---

### Task 15: Create PvP routes

**Files:**
- Create: `apps/api/src/routes/pvp.ts`

Follow the pattern from `combat.ts`: create an Express router, apply `authenticate` middleware, define routes.

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
// ... service imports

const pvpRouter = Router();
pvpRouter.use(authenticate);

// GET /ladder
pvpRouter.get('/ladder', async (req, res, next) => { ... });

// GET /rating
pvpRouter.get('/rating', async (req, res, next) => { ... });

// POST /scout
const scoutSchema = z.object({ targetId: z.string().uuid() });
pvpRouter.post('/scout', async (req, res, next) => { ... });

// POST /challenge
const challengeSchema = z.object({
  targetId: z.string().uuid(),
  attackStyle: z.enum(['melee', 'ranged', 'magic']),
});
pvpRouter.post('/challenge', async (req, res, next) => { ... });

// GET /history
pvpRouter.get('/history', async (req, res, next) => { ... });

// GET /notifications
pvpRouter.get('/notifications', async (req, res, next) => { ... });

export { pvpRouter };
```

Each route handler follows the pattern:
1. Extract `playerId` from `req.player!.playerId`
2. Validate body with Zod schema
3. Call service function
4. Return JSON response
5. Catch errors with `next(err)`

**Step 1: Implement routes**

**Step 2: Commit**

```bash
git add apps/api/src/routes/pvp.ts
git commit -m "feat: add PvP API routes"
```

---

### Task 16: Register PvP routes

**Files:**
- Modify: `apps/api/src/index.ts`

**Step 1: Import and register**

Add after the other route imports:

```typescript
import { pvpRouter } from './routes/pvp';
```

Add after the other `app.use` calls (around line 88):

```typescript
app.use('/api/v1/pvp', pvpRouter);
```

**Step 2: Verify API starts**

```bash
npm run dev:api
```

Test with: `curl http://localhost:4000/api/v1/pvp/ladder` (should return 401 without auth).

**Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: register PvP routes in API server"
```

---

## Phase 5: PvP Frontend

### Task 17: Add PvP API client functions

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add PvP response types**

```typescript
export interface PvpRatingResponse {
  rating: number;
  wins: number;
  losses: number;
  winStreak: number;
  bestRating: number;
}

export interface PvpLadderEntry {
  playerId: string;
  username: string;
  rating: number;
  characterLevel: number;
  isScouted: boolean;
  scoutData?: PvpScoutData;
}

export interface PvpScoutData {
  combatLevel: number;
  attackStyle: string;
  armorClass: string;
  powerRating: number;
}

export interface PvpMatchResponse {
  id: string;
  attackerName: string;
  defenderName: string;
  attackerId: string;
  defenderId: string;
  winnerId: string;
  attackerRatingChange: number;
  defenderRatingChange: number;
  attackerStyle: string;
  defenderStyle: string;
  isRevenge: boolean;
  createdAt: string;
  combatLog: CombatLogEntryResponse[];
}

export interface PvpNotification {
  matchId: string;
  attackerName: string;
  outcome: 'victory' | 'defeat';
  ratingChange: number;
  createdAt: string;
}
```

**Step 2: Add API functions**

```typescript
export async function getPvpRating() {
  return fetchApi<PvpRatingResponse>('/api/v1/pvp/rating');
}

export async function getPvpLadder() {
  return fetchApi<PvpLadderEntry[]>('/api/v1/pvp/ladder');
}

export async function scoutPvpOpponent(targetId: string) {
  return fetchApi<{ scoutData: PvpScoutData; turns: TurnResponse }>('/api/v1/pvp/scout', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function challengePvpOpponent(targetId: string, attackStyle: string) {
  return fetchApi<{ match: PvpMatchResponse; turns: TurnResponse }>('/api/v1/pvp/challenge', {
    method: 'POST',
    body: JSON.stringify({ targetId, attackStyle }),
  });
}

export async function getPvpHistory(page = 1) {
  return fetchApi<{ matches: PvpMatchResponse[]; pagination: PaginationResponse }>(`/api/v1/pvp/history?page=${page}`);
}

export async function getPvpNotifications() {
  return fetchApi<PvpNotification[]>('/api/v1/pvp/notifications');
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add PvP API client functions"
```

---

### Task 18: Create ArenaScreen component

**Files:**
- Create: `apps/web/src/app/game/screens/ArenaScreen.tsx`

Build the Arena UI with these sections:

1. **Your Rating panel** — Elo rating, W/L, win streak, best rating
2. **Ladder** — list of opponents with Scout/Challenge buttons
3. **Scout Modal** — shows scouted data after paying turns
4. **Attack Style selector** — melee/ranged/magic choice before challenge
5. **Match History** — recent PvP fights with expandable combat logs
6. **Level gate message** — "Reach level 10 to compete" for underleveled players

Follow existing component patterns (RPG theme CSS variables, similar button/card styling to CombatScreen).

**Key props:**
```typescript
interface ArenaScreenProps {
  characterLevel: number;
  busyAction: string | null;
  onScout: (targetId: string) => Promise<void>;
  onChallenge: (targetId: string, attackStyle: string) => Promise<void>;
}
```

State managed internally: ladder data, rating, history, selected opponent, scout data.

Use `useEffect` to fetch ladder and rating on mount. Loading/error states.

**Step 1: Implement component**

**Step 2: Commit**

```bash
git add apps/web/src/app/game/screens/ArenaScreen.tsx
git commit -m "feat: add ArenaScreen component"
```

---

### Task 19: Integrate PvP into game controller

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Add 'arena' to Screen type**

Add `'arena'` to the Screen union type (around line 30-43).

**Step 2: Add PvP action handlers**

```typescript
const handlePvpScout = useCallback(async (targetId: string) => {
  return runAction('pvpScout', async () => {
    const result = await scoutPvpOpponent(targetId);
    if (result.data) {
      setTurns(result.data.turns);
    }
    return result;
  });
}, [runAction]);

const handlePvpChallenge = useCallback(async (targetId: string, attackStyle: string) => {
  return runAction('pvpChallenge', async () => {
    const result = await challengePvpOpponent(targetId, attackStyle);
    if (result.data) {
      setTurns(result.data.turns);
      // Could trigger combat playback here
    }
    return result;
  });
}, [runAction]);
```

**Step 3: Add PvP notification badge count**

Add state for unread PvP notification count. Fetch on load and periodically.

**Step 4: Expose new state and handlers in return value**

Add to the returned object.

**Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: integrate PvP actions into game controller"
```

---

### Task 20: Integrate ArenaScreen into page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add ArenaScreen to renderScreen()**

Add a case in the `renderScreen()` switch statement:

```typescript
case 'arena':
  return <ArenaScreen
    characterLevel={player?.characterLevel ?? 0}
    busyAction={busyAction}
    onScout={handlePvpScout}
    onChallenge={handlePvpChallenge}
  />;
```

**Step 2: Add Arena to town UI navigation**

Add an "Arena" button/tab visible in town zones. The Arena should appear alongside other town features.

If the current zone is a town (`currentZone?.zoneType === 'town'`), show the Arena tab in the sub-navigation or as a button on the home/town screen.

**Step 3: Add PvP notification indicator**

Show a badge on the Arena button when there are unread PvP notifications.

**Step 4: Typecheck and test**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
npm run dev
```

Manual test: navigate to a town, see Arena button, open it, see the ladder (may be empty for dev).

**Step 5: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: integrate ArenaScreen into game page with town navigation"
```

---

## Final Verification

### Task 21: End-to-end verification

**Step 1: Full build**

```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/game-engine
npm run typecheck
npm run test
```

**Step 2: Manual E2E testing**

1. Start dev servers: `npm run dev`
2. Test PvE combat still works (no regression)
3. Create two test accounts
4. Level one to 10+
5. Visit Arena in town — see ladder
6. Scout an opponent — verify turn spend + data shown
7. Challenge — verify combat log, rating change, durability loss
8. Log in as defender — verify notification, combat log, revenge option
9. Test revenge attack at discounted cost
10. Test cooldown (can't attack same player again within 24h)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete PvP arena system implementation"
```
