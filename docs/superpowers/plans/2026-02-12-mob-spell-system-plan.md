# Mob Spell System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make mob buff, debuff, heal, and lifesteal spells actually work in combat — they currently do nothing.

**Architecture:** Update the shared `SpellAction` type to match seed data fields, add `SpellEffect` and `ActiveEffect` types, rewrite the combat engine's spell handler to support all spell types with per-round effect ticking, update seed data to use real values, and update the frontend to display the new spell log fields.

**Tech Stack:** TypeScript, shared types (`@adventure/shared`), pure game engine (`@adventure/game-engine`), React frontend (`CombatLogEntry`, `CombatPlayback`), Prisma seed data.

---

### Task 1: Update SpellAction and add SpellEffect/ActiveEffect types

**Files:**
- Modify: `packages/shared/src/types/combat.types.ts`

**Context:** The existing `SpellAction` type has `action: string` and `effect?: string` — but seed data writes `name` and uses `buff/debuff/heal` booleans. The new type needs `name`, `damage?`, `heal?`, `effects?: SpellEffect[]`. Also add `SpellEffect`, `ActiveEffect`, and extend `CombatState` with `activeEffects`. Add new optional fields to `CombatLogEntry`.

**Step 1: Replace SpellAction and add new types**

Replace the current `SpellAction` interface:

```typescript
export interface SpellAction {
  round: number;
  action: string;
  damage?: number;
  effect?: string;
}
```

With:

```typescript
export interface SpellEffect {
  stat: string;
  modifier: number;
  duration: number;
}

export interface SpellAction {
  round: number;
  name: string;
  damage?: number;
  heal?: number;
  effects?: SpellEffect[];
}

export interface ActiveEffect {
  name: string;
  target: 'player' | 'mob';
  stat: string;
  modifier: number;
  remainingRounds: number;
}
```

**Step 2: Add `activeEffects` to CombatState**

Add to the `CombatState` interface:

```typescript
activeEffects: ActiveEffect[];
```

**Step 3: Add new optional fields to CombatLogEntry**

Add these fields to the existing `CombatLogEntry` interface:

```typescript
spellName?: string;
healAmount?: number;
effectsApplied?: Array<{
  stat: string;
  modifier: number;
  duration: number;
  target: 'player' | 'mob';
}>;
effectsExpired?: Array<{
  name: string;
  target: 'player' | 'mob';
}>;
```

**Step 4: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 5: Commit**

```bash
git add packages/shared/src/types/combat.types.ts
git commit -m "feat: update SpellAction type, add SpellEffect/ActiveEffect, extend CombatState and CombatLogEntry"
```

---

### Task 2: Update seed data spell() helper and all mob spell patterns

**Files:**
- Modify: `packages/database/prisma/seed-data/mobs.ts`

**Context:** The `spell()` helper currently accepts `{ damage?, heal?, buff?, debuff? }`. Buff/debuff booleans need to become real `effects` arrays with stat/modifier/duration. Heal values already exist for some mobs. Reference the design doc tables at `docs/superpowers/specs/2026-02-12-mob-spell-system-design.md` for exact values.

**Step 1: Update the spell() helper function signature**

Replace the current `spell` function:

```typescript
function spell(round: number, name: string, opts: { damage?: number; heal?: number; buff?: boolean; debuff?: boolean } = {}) {
  return { round, name, ...opts };
}
```

With:

```typescript
function spell(round: number, name: string, opts: { damage?: number; heal?: number; effects?: Array<{ stat: string; modifier: number; duration: number }> } = {}) {
  return { round, name, ...opts };
}
```

**Step 2: Update all buff/debuff spell patterns with real values**

Replace every `{ buff: true }` and `{ debuff: true }` with actual `{ effects: [...] }` arrays. Use the tables from the design doc. Key mappings:

**Debuffs** (every `{ debuff: true }` becomes `{ effects: [{ stat, modifier (negative), duration }] }`):
- `Screech` → `{ effects: [{ stat: 'accuracy', modifier: -2, duration: 2 }] }`
- `Web Trap` → `{ effects: [{ stat: 'evasion', modifier: -2, duration: 2 }] }`
- `Hex` → `{ effects: [{ stat: 'accuracy', modifier: -3, duration: 2 }] }`
- `Confusion` → `{ effects: [{ stat: 'accuracy', modifier: -3, duration: 2 }] }`
- `Fear` → `{ effects: [{ stat: 'attack', modifier: -4, duration: 2 }] }`
- `Charm` → `{ effects: [{ stat: 'attack', modifier: -4, duration: 2 }] }`
- `Curse` → `{ effects: [{ stat: 'defence', modifier: -3, duration: 2 }] }`
- `Curse of Weakness` → `{ effects: [{ stat: 'defence', modifier: -4, duration: 2 }] }`
- `Dirty Trick` → `{ effects: [{ stat: 'accuracy', modifier: -3, duration: 2 }] }`
- `Grapple` → `{ effects: [{ stat: 'evasion', modifier: -4, duration: 2 }] }`
- `Constrict` → `{ effects: [{ stat: 'evasion', modifier: -5, duration: 3 }] }`
- `Crystal Prison` → `{ effects: [{ stat: 'evasion', modifier: -6, duration: 3 }] }`
- `Spectral Chains` → `{ effects: [{ stat: 'evasion', modifier: -5, duration: 2 }] }`
- `Madness Aura` → `{ effects: [{ stat: 'accuracy', modifier: -5, duration: 3 }] }`
- `Static Field` → `{ effects: [{ stat: 'evasion', modifier: -4, duration: 2 }] }`

**Buffs** (every `{ buff: true }` becomes `{ effects: [{ stat, modifier (positive), duration }] }`):
- `Howl` (level 8) → `{ effects: [{ stat: 'attack', modifier: 2, duration: 3 }] }`
- `Howl` (level 16) → `{ effects: [{ stat: 'attack', modifier: 4, duration: 3 }] }`
- `Rally` → `{ effects: [{ stat: 'attack', modifier: 2, duration: 3 }] }`
- `War Cry` → `{ effects: [{ stat: 'attack', modifier: 4, duration: 3 }] }`
- `Battle Cry` → `{ effects: [{ stat: 'attack', modifier: 4, duration: 3 }] }`
- `Royal Decree` → `{ effects: [{ stat: 'attack', modifier: 5, duration: 3 }] }`
- `Enchanted Blade` → `{ effects: [{ stat: 'attack', modifier: 3, duration: 3 }] }`
- `Spirit Shield` → `{ effects: [{ stat: 'defence', modifier: 4, duration: 3 }] }`
- `Dark Aura` → `{ effects: [{ stat: 'attack', modifier: 5, duration: 3 }] }`
- `Dark Shield` → `{ effects: [{ stat: 'defence', modifier: 5, duration: 3 }] }`
- `Harden` → `{ effects: [{ stat: 'defence', modifier: 5, duration: 3 }] }`
- `Diamond Shell` → `{ effects: [{ stat: 'defence', modifier: 5, duration: 3 }] }`
- `Scale Shield` → `{ effects: [{ stat: 'defence', modifier: 5, duration: 3 }] }`
- `Bark Shield` → `{ effects: [{ stat: 'defence', modifier: 3, duration: 3 }] }`
- `Resonance` → `{ effects: [{ stat: 'attack', modifier: 5, duration: 3 }] }`
- `Whip Crack` → `{ effects: [{ stat: 'attack', modifier: 3, duration: 3 }] }`
- `Burrow` → `{ effects: [{ stat: 'evasion', modifier: 4, duration: 2 }] }`
- `Submerge` → `{ effects: [{ stat: 'evasion', modifier: 5, duration: 2 }] }`
- `Raise Dead` → `{ effects: [{ stat: 'attack', modifier: 6, duration: 3 }] }`
- `Gadget Shield` → `{ effects: [{ stat: 'defence', modifier: 4, duration: 3 }] }`
- `Tidal Blessing` → `{ effects: [{ stat: 'attack', modifier: 6, duration: 3 }] }`
- `Royal Guard` → `{ effects: [{ stat: 'defence', modifier: 4, duration: 3 }] }`
- `Death Ward` → `{ effects: [{ stat: 'defence', modifier: 5, duration: 3 }] }`

Note: `Death Ward` is not in the design doc tables but has `{ buff: true }` in seed data. Use `defence +5, 3 rds` (level 36 mob, similar to Dark Shield).

**Step 3: Verify no `buff: true` or `debuff: true` remain**

Search the file for `buff:` and `debuff:` — should find zero results.

**Step 4: Commit**

```bash
git add packages/database/prisma/seed-data/mobs.ts
git commit -m "feat: replace buff/debuff booleans with real SpellEffect values in all mob spell patterns"
```

---

### Task 3: Implement effect ticking and effective stats in combat engine

**Files:**
- Modify: `packages/game-engine/src/combat/combatEngine.ts`

**Context:** The combat engine's main loop (`runCombat`) currently just calls `executePlayerAttack` and `executeMobAttack` each round. We need to:
1. Initialize `activeEffects: []` on `CombatState`
2. Add a `tickEffects` function that decrements `remainingRounds`, removes expired effects, and logs expiry
3. Add a `getEffectiveStats` function that computes base stats + active modifiers
4. Call `tickEffects` at the start of each round, then use `getEffectiveStats` for both player and mob attacks

**Step 1: Add `activeEffects` initialization to CombatState in runCombat**

In the `state` initialization object (line ~53), add:

```typescript
activeEffects: [],
```

**Step 2: Add tickEffects function**

Add before `runCombat`:

```typescript
function tickEffects(state: CombatState): void {
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

  // Group expired effects by name for cleaner log messages
  const expiredNames = new Map<string, { target: 'player' | 'mob' }>();
  for (const e of expired) {
    if (!expiredNames.has(e.name)) {
      expiredNames.set(e.name, { target: e.target });
    }
  }

  if (expiredNames.size > 0) {
    state.log.push({
      round: state.round,
      actor: 'mob', // system event, actor doesn't matter
      action: 'spell',
      message: Array.from(expiredNames.keys()).map(n => `${n} wore off.`).join(' '),
      effectsExpired: Array.from(expiredNames.entries()).map(([name, { target }]) => ({ name, target })),
      ...hpSnapshot(state),
    });
  }
}
```

**Step 3: Add getEffectiveStats function**

Add after `tickEffects`:

```typescript
function getEffectiveStats(baseStats: CombatantStats, activeEffects: ActiveEffect[], target: 'player' | 'mob'): CombatantStats {
  const effective = { ...baseStats };

  for (const effect of activeEffects) {
    if (effect.target !== target) continue;

    switch (effect.stat) {
      case 'attack': effective.attack += effect.modifier; break;
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

  // Floor at 0 for defensive stats
  effective.defence = Math.max(0, effective.defence);
  effective.magicDefence = Math.max(0, effective.magicDefence);
  effective.dodge = Math.max(0, effective.dodge);
  effective.evasion = Math.max(0, effective.evasion);
  effective.damageMin = Math.max(1, effective.damageMin);
  effective.damageMax = Math.max(effective.damageMin, effective.damageMax);

  return effective;
}
```

**Step 4: Wire into the main combat loop**

In `runCombat`, inside the `while` loop, after `state.round++`, add:

```typescript
tickEffects(state);
const effectivePlayerStats = getEffectiveStats(playerStats, state.activeEffects, 'player');
const effectiveMobStats = getEffectiveStats(mobStats, state.activeEffects, 'mob');
```

Then replace all `playerStats` and `mobStats` references in the attack calls with `effectivePlayerStats` and `effectiveMobStats`:

```typescript
if (playerGoesFirst) {
  executePlayerAttack(state, effectivePlayerStats, effectiveMobStats, mob.name);
  if (state.outcome) break;
  executeMobAttack(state, effectiveMobStats, effectivePlayerStats, mob);
} else {
  executeMobAttack(state, effectiveMobStats, effectivePlayerStats, mob);
  if (state.outcome) break;
  executePlayerAttack(state, effectivePlayerStats, effectiveMobStats, mob.name);
}
```

**Step 5: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: Compilation errors — `executeMobSpell` still uses old `spell.action` field. This will be fixed in Task 4.

**Step 6: Commit**

```bash
git add packages/game-engine/src/combat/combatEngine.ts
git commit -m "feat: add effect ticking and effective stats to combat round loop"
```

---

### Task 4: Rewrite executeSpell with full spell type support

**Files:**
- Modify: `packages/game-engine/src/combat/combatEngine.ts`

**Context:** Replace the old `executeMobSpell` function with a new `executeSpell` that handles damage, heal, lifesteal, and effects. Takes a `caster` parameter for future player spells. Also update `executeMobAttack` to call the new function with the updated `SpellAction` type (which now has `name` instead of `action`).

**Step 1: Import new types**

Update the import from `@adventure/shared` to include `SpellAction`, `ActiveEffect`, `SpellEffect`:

```typescript
import {
  CombatState,
  CombatLogEntry,
  CombatResult,
  CombatantStats,
  MobTemplate,
  SpellAction,
  ActiveEffect,
} from '@adventure/shared';
```

**Step 2: Replace executeMobSpell with executeSpell**

Delete the entire `executeMobSpell` function and replace with:

```typescript
function executeSpell(
  state: CombatState,
  spell: SpellAction,
  caster: 'player' | 'mob',
  casterStats: CombatantStats,
  targetStats: CombatantStats,
  casterName: string
): void {
  let finalDamage = 0;
  let healAmount = 0;
  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  // 1. Damage (mitigated by target's magicDefence)
  if (spell.damage) {
    const reduction = calculateDefenceReduction(targetStats.magicDefence);
    const mitigated = Math.floor(spell.damage * reduction);
    finalDamage = Math.max(1, spell.damage - mitigated);

    if (caster === 'mob') {
      state.playerHp -= finalDamage;
    } else {
      state.mobHp -= finalDamage;
    }
  }

  // 2. Heal (capped at caster's maxHp)
  if (spell.heal) {
    if (caster === 'mob') {
      const before = state.mobHp;
      state.mobHp = Math.min(state.mobMaxHp, state.mobHp + spell.heal);
      healAmount = state.mobHp - before;
    } else {
      const before = state.playerHp;
      state.playerHp = Math.min(state.playerMaxHp, state.playerHp + spell.heal);
      healAmount = state.playerHp - before;
    }
  }

  // 3. Effects (buffs on caster, debuffs on opponent)
  if (spell.effects) {
    for (const effect of spell.effects) {
      const target = effect.modifier >= 0 ? caster : (caster === 'player' ? 'mob' : 'player');
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

  // Build log message
  const parts: string[] = [];
  if (caster === 'mob') {
    parts.push(`The ${casterName} casts ${spell.name}`);
  } else {
    parts.push(`You cast ${spell.name}`);
  }

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
    actor: caster,
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

  // Check for knockout
  if (state.playerHp <= 0) {
    state.outcome = 'defeat';
    state.log.push({
      round: state.round,
      actor: 'mob',
      action: 'spell',
      message: `You have been knocked out by the ${caster === 'mob' ? casterName : 'your own spell'}!`,
      ...hpSnapshot(state),
    });
  } else if (state.mobHp <= 0) {
    state.outcome = 'victory';
    state.log.push({
      round: state.round,
      actor: 'player',
      action: 'spell',
      message: `The ${caster === 'mob' ? casterName : 'enemy'} falls defeated!`,
      ...hpSnapshot(state),
    });
  }
}
```

**Step 3: Update executeMobAttack to use executeSpell**

In `executeMobAttack`, change the spell call from:

```typescript
const spellAction = mob.spellPattern.find((s) => s.round === state.round);
if (spellAction) {
  executeMobSpell(state, spellAction, mob.name, playerStats);
  return;
}
```

To:

```typescript
const spellAction = mob.spellPattern.find((s) => s.round === state.round);
if (spellAction) {
  executeSpell(state, spellAction, 'mob', mobStats, playerStats, mob.name);
  return;
}
```

**Step 4: Build and verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine`
Expected: Compiles successfully.

**Step 5: Commit**

```bash
git add packages/game-engine/src/combat/combatEngine.ts
git commit -m "feat: rewrite executeSpell with damage, heal, lifesteal, and effects support"
```

---

### Task 5: Write combat engine tests for spell effects

**Files:**
- Create: `packages/game-engine/src/combat/__tests__/spellEffects.test.ts`

**Context:** Test the new spell mechanics: damage mitigation, heal capping, lifesteal combo, buff/debuff application, effect ticking/expiry, and effective stats calculation. Use direct function calls to `runCombat` with crafted mob templates.

**Step 1: Write tests**

Create `packages/game-engine/src/combat/__tests__/spellEffects.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCombat } from '../combatEngine';
import type { CombatantStats, MobTemplate } from '@adventure/shared';

function makePlayer(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    hp: 100,
    maxHp: 100,
    attack: 10,
    accuracy: 15,
    defence: 10,
    magicDefence: 5,
    dodge: 5,
    evasion: 5,
    damageMin: 5,
    damageMax: 10,
    speed: 10,
    damageType: 'physical',
    ...overrides,
  };
}

function makeMob(overrides: Partial<MobTemplate> = {}): MobTemplate & { currentHp?: number; maxHp?: number } {
  return {
    id: 'test-mob',
    name: 'Test Mob',
    zoneId: 'test-zone',
    level: 5,
    hp: 50,
    accuracy: 10,
    defence: 5,
    magicDefence: 3,
    evasion: 5,
    damageMin: 3,
    damageMax: 6,
    xpReward: 20,
    encounterWeight: 100,
    spellPattern: [],
    damageType: 'physical',
    ...overrides,
  };
}

describe('Spell Effects', () => {
  // Seed random to get predictable results is hard, so we test log entries
  // that appear regardless of hit/miss randomness

  it('logs damage spell with mitigation', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: 'Fire Bolt', damage: 10 }],
    });
    const result = runCombat(makePlayer(), mob);
    const spellEntry = result.log.find(e => e.spellName === 'Fire Bolt');
    expect(spellEntry).toBeDefined();
    expect(spellEntry!.action).toBe('spell');
    expect(spellEntry!.damage).toBeGreaterThan(0);
    expect(spellEntry!.rawDamage).toBe(10);
  });

  it('logs heal spell and caps at maxHp', () => {
    const mob = makeMob({
      hp: 10,
      spellPattern: [{ round: 1, name: 'Heal Self', heal: 50 }],
    });
    const result = runCombat(makePlayer(), mob);
    const healEntry = result.log.find(e => e.spellName === 'Heal Self');
    expect(healEntry).toBeDefined();
    expect(healEntry!.healAmount).toBeDefined();
    // Mob started at 10hp, maxHp is 10, so heal capped
    expect(healEntry!.mobHpAfter).toBeLessThanOrEqual(10);
  });

  it('logs lifesteal spell (damage + heal)', () => {
    const mob = makeMob({
      hp: 30,
      spellPattern: [{ round: 1, name: 'Life Drain', damage: 8, heal: 8 }],
    });
    const result = runCombat(makePlayer(), mob);
    const drainEntry = result.log.find(e => e.spellName === 'Life Drain');
    expect(drainEntry).toBeDefined();
    expect(drainEntry!.damage).toBeGreaterThan(0);
    expect(drainEntry!.healAmount).toBeGreaterThan(0);
  });

  it('applies buff effects to caster', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: 'Howl', effects: [{ stat: 'attack', modifier: 3, duration: 3 }] }],
    });
    const result = runCombat(makePlayer(), mob);
    const buffEntry = result.log.find(e => e.spellName === 'Howl');
    expect(buffEntry).toBeDefined();
    expect(buffEntry!.effectsApplied).toBeDefined();
    expect(buffEntry!.effectsApplied![0].stat).toBe('attack');
    expect(buffEntry!.effectsApplied![0].modifier).toBe(3);
    expect(buffEntry!.effectsApplied![0].target).toBe('mob'); // buff on caster (mob)
  });

  it('applies debuff effects to opponent', () => {
    const mob = makeMob({
      spellPattern: [{ round: 1, name: 'Web Trap', effects: [{ stat: 'evasion', modifier: -2, duration: 2 }] }],
    });
    const result = runCombat(makePlayer(), mob);
    const debuffEntry = result.log.find(e => e.spellName === 'Web Trap');
    expect(debuffEntry).toBeDefined();
    expect(debuffEntry!.effectsApplied).toBeDefined();
    expect(debuffEntry!.effectsApplied![0].stat).toBe('evasion');
    expect(debuffEntry!.effectsApplied![0].modifier).toBe(-2);
    expect(debuffEntry!.effectsApplied![0].target).toBe('player'); // debuff on opponent
  });

  it('expires effects after duration and logs expiry', () => {
    // Use a debuff with duration 1 on round 1 — should expire at start of round 2
    const mob = makeMob({
      hp: 200, // high HP so combat lasts
      spellPattern: [{ round: 1, name: 'Quick Hex', effects: [{ stat: 'accuracy', modifier: -3, duration: 1 }] }],
    });
    const player = makePlayer({ hp: 200, maxHp: 200 });
    const result = runCombat(player, mob);

    const expiryEntry = result.log.find(e => e.effectsExpired && e.effectsExpired.length > 0);
    expect(expiryEntry).toBeDefined();
    expect(expiryEntry!.effectsExpired![0].name).toBe('Quick Hex');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run packages/game-engine/src/combat/__tests__/spellEffects.test.ts`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/game-engine/src/combat/__tests__/spellEffects.test.ts
git commit -m "test: add spell effects tests for damage, heal, lifesteal, buffs, debuffs, expiry"
```

---

### Task 6: Update frontend LastCombatLogEntry type and CombatLogEntry display

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts` (lines 64-85, the `LastCombatLogEntry` interface)
- Modify: `apps/web/src/components/combat/CombatLogEntry.tsx`

**Context:** The frontend `LastCombatLogEntry` type needs new fields (`spellName`, `healAmount`, `effectsApplied`, `effectsExpired`). The `CombatLogEntry` component needs to display spell effects: heal amounts, buff/debuff applied, effect expiry. Action icon should show `🔮` for spells with effects and `💚` for heals.

**Step 1: Add fields to LastCombatLogEntry**

In `useGameController.ts`, add to the `LastCombatLogEntry` interface:

```typescript
spellName?: string;
healAmount?: number;
effectsApplied?: Array<{
  stat: string;
  modifier: number;
  duration: number;
  target: 'player' | 'mob';
}>;
effectsExpired?: Array<{
  name: string;
  target: 'player' | 'mob';
}>;
```

**Step 2: Update getActionIcon in CombatLogEntry.tsx**

Update the `getActionIcon` function to handle new spell types:

```typescript
function getActionIcon(entry: LastCombatLogEntry): string {
  if (entry.effectsExpired && entry.effectsExpired.length > 0) return '✨';
  if (entry.evaded) return '💨';
  if (entry.isCritical) return '💥';
  if (entry.healAmount && entry.healAmount > 0 && !entry.damage) return '💚';
  if (entry.effectsApplied && entry.effectsApplied.length > 0 && !entry.damage) return '🔮';
  if (entry.damage && entry.damage > 0) return isMagicDamage(entry) ? '✨' : '⚔️';
  if (entry.roll && !entry.damage) return '❌';
  return '';
}
```

**Step 3: Update the collapsed view in CombatLogEntry component**

After the existing damage and miss display (around line 87-93), add new display cases for spell effects:

```tsx
{entry.healAmount !== undefined && entry.healAmount > 0 && (
  <span className="text-[var(--rpg-green-light)] font-mono font-semibold">+{entry.healAmount} HP</span>
)}
{entry.effectsApplied && entry.effectsApplied.length > 0 && !entry.damage && !entry.healAmount && (
  <span className="text-[var(--rpg-blue-light)] text-xs">
    {entry.effectsApplied.map(e =>
      `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier}`
    ).join(', ')}
    {` (${entry.effectsApplied[0].duration} rds)`}
  </span>
)}
{entry.effectsExpired && entry.effectsExpired.length > 0 && (
  <span className="text-[var(--rpg-text-secondary)] text-xs italic">
    {entry.effectsExpired.map(e => `${e.name} wore off`).join(', ')}
  </span>
)}
```

Also handle the effect expiry entries which should show differently — they don't have a meaningful actor. For entries where `effectsExpired` is set, render a system-style row instead of the normal actor row. Wrap the existing round > 0 block in a condition:

```tsx
{entry.effectsExpired && entry.effectsExpired.length > 0 ? (
  <>
    <span className="text-[var(--rpg-gold)] font-mono w-7 shrink-0">R{entry.round}</span>
    <span className="shrink-0 text-xs">✨</span>
    <span className="text-[var(--rpg-text-secondary)] text-xs italic">
      {entry.effectsExpired.map(e => `${e.name} wore off`).join(', ')}
    </span>
  </>
) : (
  // ... existing round > 0 display
)}
```

**Step 4: Build frontend**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine`
(Frontend dev server will pick up changes automatically.)

**Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/components/combat/CombatLogEntry.tsx
git commit -m "feat: display spell heals, buffs, debuffs, and effect expiry in combat log UI"
```

---

### Task 7: Update CombatPlayback shake triggers for buffs/debuffs/heals

**Files:**
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx`

**Context:** Currently only damage triggers a shake. Per the design doc, any time a combatant is affected, their bar should shake: debuff on player → shake player bar, buff on mob → shake mob bar, heal on mob → shake mob bar.

**Step 1: Update the shake effect logic**

In `CombatPlayback.tsx`, the shake effect useEffect (around line 69-84) currently only checks `entry.damage`. Update it to also trigger on heals and effects:

```typescript
useEffect(() => {
  if (revealedCount === 0) return;

  const entry = log[revealedCount - 1];
  if (!entry) return;

  let target: 'player' | 'mob' | null = null;

  if (entry.damage && entry.damage > 0) {
    // Damage: shake the target (opposite of actor)
    target = entry.actor === 'player' ? 'mob' : 'player';
  } else if (entry.healAmount && entry.healAmount > 0) {
    // Heal: shake the caster (they're being affected)
    target = entry.actor;
  } else if (entry.effectsApplied && entry.effectsApplied.length > 0) {
    // Buff/debuff: shake whoever is affected
    // If all effects target the same combatant, shake that one
    const effectTarget = entry.effectsApplied[0].target;
    target = effectTarget;
  }

  if (!target) return;

  setShakeTarget(target);
  shakeTimer.current = setTimeout(() => setShakeTarget(null), 300);

  return () => {
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
  };
}, [revealedCount, log]);
```

**Step 2: Update the action flash display**

In the action flash section (around line 153-164), add cases for spell effects:

```tsx
{(() => {
  const lastEntry = log[revealedCount - 1];
  if (lastEntry.effectsExpired && lastEntry.effectsExpired.length > 0) {
    return <span className="text-[var(--rpg-text-secondary)] italic">
      {lastEntry.effectsExpired.map(e => `${e.name} wore off`).join(', ')}
    </span>;
  }
  if (lastEntry.evaded) return <span className="text-[var(--rpg-blue-light)]">Dodged!</span>;
  if (lastEntry.isCritical) return <span className="text-[var(--rpg-gold)] font-bold">Critical Hit! {lastEntry.damage} dmg</span>;
  if (lastEntry.damage && lastEntry.damage > 0 && lastEntry.healAmount && lastEntry.healAmount > 0) {
    return <span className="text-[var(--rpg-text-primary)]">{lastEntry.damage} dmg, +{lastEntry.healAmount} HP</span>;
  }
  if (lastEntry.damage && lastEntry.damage > 0) return <span className="text-[var(--rpg-text-primary)]">{lastEntry.damage} dmg</span>;
  if (lastEntry.healAmount && lastEntry.healAmount > 0) return <span className="text-[var(--rpg-green-light)]">+{lastEntry.healAmount} HP</span>;
  if (lastEntry.effectsApplied && lastEntry.effectsApplied.length > 0) {
    const e = lastEntry.effectsApplied[0];
    return <span className="text-[var(--rpg-blue-light)]">
      {lastEntry.spellName} ({e.stat} {e.modifier > 0 ? '+' : ''}{e.modifier})
    </span>;
  }
  if (lastEntry.roll && !lastEntry.damage) return <span className="text-[var(--rpg-text-secondary)]">Miss!</span>;
  return null;
})()}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/combat/CombatPlayback.tsx
git commit -m "feat: shake HP bars on buff/debuff/heal and update action flash display"
```

---

### Task 8: Re-seed database and manual test

**Files:** None (database operation)

**Context:** The seed data has changed — buff/debuff booleans are now effects arrays. Need to re-seed the database so mobs have the correct spell patterns.

**Step 1: Re-seed the database**

Run: `npm run db:seed` (or whatever the seed command is)

If no seed command exists, run:

```bash
npx prisma db seed --schema=packages/database/prisma/schema.prisma
```

**Step 2: Manual testing checklist**

Start the dev server (`npm run dev`) and test:

1. Fight a mob with a **damage spell** (e.g., Rat King - Frenzy R3) — should see spell damage with magic defence mitigation
2. Fight a mob with a **buff** (e.g., Alpha Wolf - Howl R3) — should see "attack +2, 3 rds" in log, mob bar shakes, subsequent mob attacks should hit harder
3. Fight a mob with a **debuff** (e.g., Giant Cave Spider - Web Trap R3) — should see "evasion -2, 2 rds" in log, player bar shakes
4. Fight a mob with a **heal** (e.g., Dryad - Heal Self R3) — should see "+8 HP" in log, mob bar shakes
5. Fight a mob with **lifesteal** (e.g., Vampire Bat - Life Drain R3) — should see damage AND heal in same entry
6. Verify effect **expiry** message appears after duration ends ("X wore off" with ✨ icon)
7. Verify **copy log** output includes spell information

**Step 3: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address issues found during manual spell system testing"
```
