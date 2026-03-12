# Boss Encounters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dynamically-scaled boss encounters with shared raid HP pool, real combat stats, and hybrid spawning (scheduler + exploration discovery).

**Architecture:** Rewrite the existing boss round resolver (game-engine) to use a shared raid HP pool instead of individual participant HP. Update the boss encounter service to dynamically scale boss stats from zone tier + participant count, snapshot real attacker/healer stats at resolution time, and handle wipe/flee mechanics. Add boss spawning to the event scheduler and exploration routes. All existing DB models, routes, and frontend components remain — they just get updated logic.

**Tech Stack:** TypeScript, Prisma, Vitest, Express, Socket.IO, Next.js React

---

### Task 1: Update constants — replace old boss constants with dynamic scaling

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (WORLD_EVENT_CONSTANTS block, lines ~390-406)

**Step 1: Update constants**

Replace the old boss constants with the new dynamic scaling arrays. In `WORLD_EVENT_CONSTANTS`, remove `BOSS_AOE_DAMAGE`, `BOSS_EXPECTED_PARTICIPANTS`, `BOSS_HP_SCALE_FACTOR`, `HEALER_MAX_TARGETS` and add:

```typescript
// Boss spawning
BOSS_SPAWN_CHANCE: 0.10,
BOSS_DISCOVERY_CHANCE: 0.05,
MAX_BOSS_ENCOUNTERS: 1,

// Dynamic scaling by zone tier (index 0 = tier 1, through tier 5)
BOSS_HP_PER_PLAYER_BY_TIER: [200, 500, 1000, 2000, 4000] as readonly number[],
BOSS_AOE_PER_PLAYER_BY_TIER: [15, 30, 50, 80, 120] as readonly number[],
BOSS_DEFENCE_BY_TIER: [5, 12, 20, 35, 50] as readonly number[],

// Healer scaling
HEALER_MAGIC_SCALING: 0.02,
```

Keep `BOSS_ROUND_INTERVAL_MINUTES: 30` and all `PERSISTED_MOB_*` constants unchanged.

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 3: Commit**

```
feat: update boss constants for dynamic scaling
```

---

### Task 2: Extract shared combat stat helpers into a service

**Files:**
- Create: `apps/api/src/services/combatStatsService.ts`
- Modify: `apps/api/src/routes/combat.ts` (remove local helpers, import from service)
- Modify: `apps/api/src/routes/exploration.ts` (remove local helpers, import from service)
- Modify: `apps/api/src/routes/zones.ts` (remove local helpers, import from service)

The functions `attackSkillFromRequiredSkill`, `getMainHandAttackSkill`, and `getSkillLevel` are duplicated in `combat.ts:75-260`, `exploration.ts:132-154`, and `zones.ts:112-132`. Extract them into a shared service.

**Step 1: Create `combatStatsService.ts`**

```typescript
import { prisma } from '@adventure/database';
import type { SkillType } from '@adventure/shared';

export type AttackSkill = 'melee' | 'ranged' | 'magic';

export function attackSkillFromRequiredSkill(value: SkillType | null | undefined): AttackSkill | null {
  if (value === 'melee' || value === 'ranged' || value === 'magic') return value;
  return null;
}

export async function getMainHandAttackSkill(playerId: string): Promise<AttackSkill | null> {
  const mainHand = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: 'main_hand' } },
    include: { item: { include: { template: true } } },
  });
  const requiredSkill = mainHand?.item?.template?.requiredSkill as SkillType | null | undefined;
  return attackSkillFromRequiredSkill(requiredSkill);
}

export async function getSkillLevel(playerId: string, skillType: SkillType): Promise<number> {
  const skill = await prisma.playerSkill.findUnique({
    where: { playerId_skillType: { playerId, skillType } },
    select: { level: true },
  });
  return skill?.level ?? 1;
}
```

**Step 2: Update `combat.ts`, `exploration.ts`, `zones.ts`**

In each file, remove the local `attackSkillFromRequiredSkill`, `getMainHandAttackSkill`, `getSkillLevel` functions and replace with:

```typescript
import { getMainHandAttackSkill, getSkillLevel, type AttackSkill } from '../services/combatStatsService';
```

Remove the local `type AttackSkill` definition in each file too. The `attackSkillFromRequiredSkill` function is only used inside `getMainHandAttackSkill`, so no external callers need updating.

**Step 3: Verify compilation**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Step 4: Commit**

```
refactor: extract shared combat stat helpers into combatStatsService
```

---

### Task 3: Rewrite boss round resolver for shared raid HP pool

**Files:**
- Modify: `packages/game-engine/src/combat/bossRoundResolver.ts`
- Modify: `packages/game-engine/src/combat/bossRoundResolver.test.ts` (create if not exists)

The current resolver tracks individual participant HP and uses `HEALER_MAX_TARGETS` for targeted healing. Rewrite to use a shared raid HP pool.

**Step 1: Rewrite `bossRoundResolver.ts`**

Replace the existing interfaces and function with:

```typescript
import { COMBAT_CONSTANTS } from '@adventure/shared';
import {
  rollD20,
  rollDamage,
  doesAttackHit,
  isCriticalHit,
  calculateFinalDamage,
} from './damageCalculator';

export interface BossStats {
  defence: number;
  magicDefence: number;
  dodge: number;
  aoeDamage: number;
  avgParticipantDefence: number;
}

export interface BossRoundAttacker {
  playerId: string;
  stats: import('@adventure/shared').CombatantStats;
}

export interface BossRoundHealer {
  playerId: string;
  healAmount: number;
}

export interface BossRoundInput {
  bossHp: number;
  bossMaxHp: number;
  boss: BossStats;
  attackers: BossRoundAttacker[];
  healers: BossRoundHealer[];
  raidPool: number;
  raidPoolMax: number;
}

export interface AttackerResult {
  playerId: string;
  hit: boolean;
  damage: number;
  isCritical: boolean;
}

export interface HealerResult {
  playerId: string;
  healAmount: number;
}

export interface BossRoundResult {
  bossHpAfter: number;
  bossDefeated: boolean;
  attackerResults: AttackerResult[];
  poolDamageTaken: number;
  healerResults: HealerResult[];
  raidPoolAfter: number;
  raidWiped: boolean;
}

export function resolveBossRoundLogic(
  input: BossRoundInput,
  roll?: () => number,
): BossRoundResult {
  const rollFn = roll ?? rollD20;
  let bossHp = input.bossHp;
  let raidPool = input.raidPool;

  // 1. Attack phase: each attacker rolls against boss
  const attackerResults: AttackerResult[] = [];
  for (const attacker of input.attackers) {
    const attackRoll = rollFn();
    const hits = doesAttackHit(attackRoll, attacker.stats.accuracy, input.boss.dodge, 0);

    if (!hits) {
      attackerResults.push({ playerId: attacker.playerId, hit: false, damage: 0, isCritical: false });
      continue;
    }

    const rawDmg = rollDamage(attacker.stats.damageMin, attacker.stats.damageMax);
    const crit = isCriticalHit(attacker.stats.critChance ?? 0);
    const effectiveDefence = attacker.stats.damageType === 'magic'
      ? input.boss.magicDefence
      : input.boss.defence;
    const { damage } = calculateFinalDamage(rawDmg, effectiveDefence, crit, attacker.stats.critDamage ?? 0);

    bossHp -= damage;
    attackerResults.push({ playerId: attacker.playerId, hit: true, damage, isCritical: crit });
  }

  const bossDefeated = bossHp <= 0;

  // 2. Boss phase: single hit to raid pool, reduced by avg defence
  let poolDamageTaken = 0;
  if (!bossDefeated) {
    poolDamageTaken = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, input.boss.aoeDamage - input.boss.avgParticipantDefence);
    raidPool -= poolDamageTaken;
  }

  // 3. Heal phase: healers restore pool HP
  const healerResults: HealerResult[] = [];
  for (const healer of input.healers) {
    const healed = Math.min(healer.healAmount, input.raidPoolMax - raidPool);
    if (healed > 0) {
      raidPool += healed;
    }
    healerResults.push({ playerId: healer.playerId, healAmount: Math.max(0, healed) });
  }

  const raidWiped = raidPool <= 0;

  return {
    bossHpAfter: Math.max(0, bossHp),
    bossDefeated,
    attackerResults,
    poolDamageTaken,
    healerResults,
    raidPoolAfter: Math.max(0, raidPool),
    raidWiped,
  };
}
```

Key differences from current code:
- Removed `participantHpAfter` Map and `knockouts` array — no individual tracking
- Removed `currentHp` from `BossRoundAttacker` and `BossRoundHealer`
- Added `raidPool`, `raidPoolMax` to input
- Added `avgParticipantDefence` to `BossStats`
- `HealerResult` is now `{ playerId, healAmount }` not `{ playerId, targets[] }`
- Output: `raidPoolAfter`, `raidWiped`, `poolDamageTaken` instead of per-player HP

**Step 2: Write tests for the new resolver**

Create `packages/game-engine/src/combat/bossRoundResolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveBossRoundLogic, type BossRoundInput } from './bossRoundResolver';

function makeInput(overrides: Partial<BossRoundInput> = {}): BossRoundInput {
  return {
    bossHp: 1000,
    bossMaxHp: 1000,
    boss: { defence: 10, magicDefence: 5, dodge: 5, aoeDamage: 50, avgParticipantDefence: 10 },
    attackers: [],
    healers: [],
    raidPool: 500,
    raidPoolMax: 500,
    ...overrides,
  };
}

describe('resolveBossRoundLogic', () => {
  it('returns no damage when no attackers', () => {
    const result = resolveBossRoundLogic(makeInput(), () => 1);
    expect(result.bossHpAfter).toBe(1000);
    expect(result.bossDefeated).toBe(false);
    expect(result.raidWiped).toBe(false);
  });

  it('boss deals poolDamage = aoeDamage - avgDefence', () => {
    const result = resolveBossRoundLogic(makeInput(), () => 1); // all miss
    expect(result.poolDamageTaken).toBe(40); // 50 - 10
    expect(result.raidPoolAfter).toBe(460);
  });

  it('boss defeated when HP reaches 0', () => {
    const input = makeInput({
      bossHp: 5,
      attackers: [{ playerId: 'p1', stats: { hp: 100, maxHp: 100, attack: 50, accuracy: 100, speed: 10, damageMin: 50, damageMax: 50, damageType: 'physical', critChance: 0, critDamage: 0, armour: 0, magicDefence: 0, dodge: 0 } }],
    });
    const result = resolveBossRoundLogic(input, () => 20); // guaranteed hit
    expect(result.bossDefeated).toBe(true);
    expect(result.poolDamageTaken).toBe(0); // boss dead, no AOE
  });

  it('raid wipes when pool reaches 0', () => {
    const input = makeInput({ raidPool: 30 }); // 30 < 40 pool damage
    const result = resolveBossRoundLogic(input, () => 1);
    expect(result.raidWiped).toBe(true);
    expect(result.raidPoolAfter).toBe(0);
  });

  it('healers restore pool HP capped at max', () => {
    const input = makeInput({
      raidPool: 400,
      raidPoolMax: 500,
      healers: [{ playerId: 'h1', healAmount: 200 }],
    });
    const result = resolveBossRoundLogic(input, () => 1); // miss, boss deals 40 AOE
    // Pool after AOE: 400 - 40 = 360. Healer heals min(200, 500-360) = 140
    expect(result.raidPoolAfter).toBe(500);
    expect(result.healerResults[0]!.healAmount).toBe(140);
  });
});
```

**Step 3: Run tests**

Run: `npm run test:engine`

**Step 4: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`

**Step 5: Commit**

```
feat: rewrite boss round resolver with shared raid HP pool
```

---

### Task 4: Rewrite boss encounter service — dynamic scaling, real stats, wipe/flee

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts`

This is the biggest task. The service needs to:
1. Scale boss stats from zone tier + participant count (not hardcoded)
2. Snapshot real attacker stats (equipped weapon + skill level) at resolution time
3. Scale healer healing with magic level
4. Handle raid wipe with flee rolls
5. Persist boss HP as a percentage between wipe attempts
6. Compute shared raid pool from participant max HPs

**Step 1: Rewrite `resolveBossRound` function**

Replace the function body (lines ~181-373). Key changes:

a) **Fetch zone tier** alongside the encounter:
```typescript
const encounter = await prisma.bossEncounter.findUnique({
  where: { id: encounterId },
  include: {
    event: { select: { zoneId: true, title: true, zone: { select: { name: true, difficulty: true } } } },
    mobTemplate: { select: { name: true, level: true } },
  },
});
```

b) **Dynamic scaling on round 1** — replace the old post-round-1 scaling block:
```typescript
const zoneTier = encounter.event.zone?.difficulty ?? 1;
const tierIndex = Math.max(0, Math.min(4, zoneTier - 1));
const participantCount = signups.length;

if (encounter.roundNumber === 0) {
  // First round: lock scaling
  const scaledMaxHp = WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[tierIndex]! * participantCount;
  const hpPercent = encounter.maxHp > 0 ? encounter.currentHp / encounter.maxHp : 1;
  const scaledCurrentHp = Math.round(scaledMaxHp * hpPercent);
  await prisma.bossEncounter.update({
    where: { id: encounterId },
    data: { maxHp: scaledMaxHp, currentHp: scaledCurrentHp, scaledAt: new Date() },
  });
  encounter.maxHp = scaledMaxHp;
  encounter.currentHp = scaledCurrentHp;
}
```

c) **Build attacker list with real stats** using the new `combatStatsService`:
```typescript
import { getMainHandAttackSkill, getSkillLevel } from './combatStatsService';

for (const signup of signups) {
  if (signup.role === 'attacker') {
    const [mainHandSkill, equipStats, progression] = await Promise.all([
      getMainHandAttackSkill(signup.playerId),
      getEquipmentStats(signup.playerId),
      getPlayerProgressionState(signup.playerId),
    ]);
    const attackSkill = mainHandSkill ?? 'melee';
    const skillLevel = await getSkillLevel(signup.playerId, attackSkill);
    const stats = buildPlayerCombatStats(
      hpState.maxHp, hpState.maxHp,
      { attackStyle: attackSkill, skillLevel, attributes: progression.attributes },
      equipStats,
    );
    attackers.push({ playerId: signup.playerId, stats });
  }
}
```

d) **Build healer list with magic-scaled healing:**
```typescript
for (const signup of signups) {
  if (signup.role === 'healer') {
    const magicLevel = await getSkillLevel(signup.playerId, 'magic');
    const healAmount = Math.floor(
      signup.turnsCommitted * (1 + magicLevel * WORLD_EVENT_CONSTANTS.HEALER_MAGIC_SCALING)
    );
    healers.push({ playerId: signup.playerId, healAmount });
  }
}
```

e) **Compute raid pool + avg defence:**
```typescript
let raidPoolMax = 0;
let totalDefence = 0;
for (const signup of signups) {
  const hp = await getHpState(signup.playerId);
  raidPoolMax += hp.maxHp;
  const equip = await getEquipmentStats(signup.playerId);
  totalDefence += (equip.armour ?? 0);
}
const avgDefence = signups.length > 0 ? totalDefence / signups.length : 0;
```

f) **Build boss stats dynamically:**
```typescript
const bossStats: BossStats = {
  defence: WORLD_EVENT_CONSTANTS.BOSS_DEFENCE_BY_TIER[tierIndex]!,
  magicDefence: Math.round(WORLD_EVENT_CONSTANTS.BOSS_DEFENCE_BY_TIER[tierIndex]! * 0.7),
  dodge: Math.round(zoneTier * 3),
  aoeDamage: WORLD_EVENT_CONSTANTS.BOSS_AOE_PER_PLAYER_BY_TIER[tierIndex]! * participantCount,
  avgParticipantDefence: avgDefence,
};
```

g) **Handle wipe with flee rolls** (after getting the round result):
```typescript
if (result.raidWiped) {
  // Each participant gets a flee roll
  for (const signup of signups) {
    const [hpState, evasionLevel] = await Promise.all([
      getHpState(signup.playerId),
      getSkillLevel(signup.playerId, 'evasion'),
    ]);
    const fleeResult = calculateFleeResult({
      evasionLevel,
      mobLevel: encounter.mobTemplate.level ?? 1,
      maxHp: hpState.maxHp,
      currentGold: 0, // no gold loss from boss wipes
    });
    if (fleeResult.outcome === 'knockout') {
      await setHp(signup.playerId, 0);
      await enterRecoveringState(signup.playerId, fleeResult.recoveryCost ?? hpState.maxHp);
    } else {
      await setHp(signup.playerId, fleeResult.remainingHp);
    }
  }

  // Persist boss HP as percentage
  const hpPercent = encounter.maxHp > 0 ? result.bossHpAfter / encounter.maxHp : 1;
  await prisma.bossEncounter.update({
    where: { id: encounterId },
    data: {
      currentHp: result.bossHpAfter,
      roundNumber: 0, // reset for next attempt
      nextRoundAt: new Date(Date.now() + WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES * 60 * 1000),
      status: 'waiting',
    },
  });
}
```

h) **Remove old individual HP tracking** — remove the `participantHpAfter` loop and the old round-1 scaling block that used `BOSS_EXPECTED_PARTICIPANTS`.

i) **Update chat messages** to include zone chat:
```typescript
if (result.bossDefeated) {
  // ... existing loot distribution ...
  await emitSystemMessage(io, 'world', 'world', `${encounter.mobTemplate.name} in ${zoneName} has been slain! ${killerName} dealt the final blow.`);
  if (encounter.event.zoneId) {
    await emitSystemMessage(io, 'zone', `zone:${encounter.event.zoneId}`, `${encounter.mobTemplate.name} has been slain! ${killerName} dealt the final blow.`);
  }
} else if (result.raidWiped) {
  await emitSystemMessage(io, 'world', 'world', `The raid against ${encounter.mobTemplate.name} in ${zoneName} has been wiped!`);
  if (encounter.event.zoneId) {
    await emitSystemMessage(io, 'zone', `zone:${encounter.event.zoneId}`, `The raid against ${encounter.mobTemplate.name} has been wiped! The boss is weakened...`);
  }
}
```

**Step 2: Import new dependencies**

Add to imports:
```typescript
import { calculateFleeResult } from '@adventure/game-engine';
import { getMainHandAttackSkill, getSkillLevel } from './combatStatsService';
import { setHp, enterRecoveringState } from './hpService';
```

Remove from `BossStats` import (it's now re-exported from the rewritten resolver).

**Step 3: Verify compilation**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Step 4: Commit**

```
feat: rewrite boss encounter service with dynamic scaling and shared raid pool
```

---

### Task 5: Add boss spawning to event scheduler

**Files:**
- Modify: `apps/api/src/services/eventSchedulerService.ts`

**Step 1: Add boss spawn logic**

Add a `trySpawnBoss` function and integrate it into `checkAndSpawnEvents`.

```typescript
import { createBossEncounter } from './bossEncounterService';

async function trySpawnBoss(io: SocketServer | null, zoneId: string, zoneName: string): Promise<boolean> {
  // Check boss cap
  const activeBosses = await prisma.bossEncounter.count({
    where: { status: { in: ['waiting', 'in_progress'] } },
  });
  if (activeBosses >= WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS) return false;

  // Find boss mobs in this zone's families
  const zoneFamilies = await prisma.zoneMobFamily.findMany({
    where: { zoneId },
    select: { mobFamilyId: true },
  });
  const familyIds = zoneFamilies.map(f => f.mobFamilyId);

  const bossMobs = await prisma.mobTemplate.findMany({
    where: {
      isBoss: true,
      mobFamilyMembers: { some: { mobFamilyId: { in: familyIds } } },
    },
  });
  if (bossMobs.length === 0) return false;

  const bossMob = bossMobs[Math.floor(Math.random() * bossMobs.length)]!;

  // Create world event (type: boss, no expiry)
  const event = await spawnWorldEvent({
    type: 'boss',
    zoneId,
    title: `${bossMob.name} Appears`,
    description: `A fearsome ${bossMob.name} has been spotted in ${zoneName}!`,
    effectType: 'damage_up', // placeholder, bosses don't use effect modifiers
    effectValue: 0,
    durationHours: 0, // no expiry
    createdBy: 'system',
  });
  if (!event) return false;

  // Override expiresAt to null (bosses don't time-expire)
  await prisma.worldEvent.update({
    where: { id: event.id },
    data: { expiresAt: null },
  });

  // Create boss encounter
  const initialHp = 1000; // placeholder — will be dynamically scaled on round 1
  await createBossEncounter(event.id, bossMob.id, initialHp);

  // Announce
  await emitSystemMessage(io, 'world', 'world', `A boss has appeared in ${zoneName}: ${bossMob.name}!`);
  await emitSystemMessage(io, 'zone', `zone:${zoneId}`, `A boss has appeared: ${bossMob.name}! Sign up for the raid!`);

  return true;
}
```

**Step 2: Integrate into `trySpawnZoneEvent`**

At the beginning of `trySpawnZoneEvent`, after picking a zone, add a boss spawn roll:

```typescript
// Roll for boss spawn (before regular event)
if (Math.random() < WORLD_EVENT_CONSTANTS.BOSS_SPAWN_CHANCE) {
  const spawned = await trySpawnBoss(io, zone.id, zone.name);
  if (spawned) return;
}
```

**Step 3: Add lazy boss resolution to scheduler tick**

In `checkAndSpawnEvents`, after expiring stale events, add:

```typescript
import { checkAndResolveDueBossRounds } from './bossEncounterService';

// Resolve any due boss rounds
await checkAndResolveDueBossRounds(io);
```

**Step 4: Commit**

```
feat: add boss spawning to event scheduler with discovery chance
```

---

### Task 6: Add boss discovery to exploration

**Files:**
- Modify: `apps/api/src/routes/exploration.ts`

**Step 1: Add boss discovery roll in the `event_discovery` handler**

Inside the existing `if (outcome.type === 'event_discovery')` block (around line 769), add a boss discovery roll before the regular event spawn:

```typescript
if (outcome.type === 'event_discovery') {
  // Roll for boss discovery first
  if (Math.random() < WORLD_EVENT_CONSTANTS.BOSS_DISCOVERY_CHANCE) {
    // Check boss cap
    const activeBosses = await prisma.bossEncounter.count({
      where: { status: { in: ['waiting', 'in_progress'] } },
    });

    if (activeBosses < WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS) {
      // Find boss mobs from zone families
      const zoneFamilies = await prisma.zoneMobFamily.findMany({
        where: { zoneId: body.zoneId },
        select: { mobFamilyId: true },
      });
      const familyIds = zoneFamilies.map(f => f.mobFamilyId);
      const bossMobs = await prisma.mobTemplate.findMany({
        where: {
          isBoss: true,
          mobFamilyMembers: { some: { mobFamilyId: { in: familyIds } } },
        },
      });

      if (bossMobs.length > 0) {
        const bossMob = bossMobs[Math.floor(Math.random() * bossMobs.length)]!;
        const bossEvent = await spawnWorldEvent({
          type: 'boss',
          zoneId: body.zoneId,
          title: `${bossMob.name} Discovered`,
          description: `You stumbled upon the lair of ${bossMob.name}!`,
          effectType: 'damage_up',
          effectValue: 0,
          durationHours: 0,
          createdBy: 'player_discovery',
        });

        if (bossEvent) {
          await prisma.worldEvent.update({
            where: { id: bossEvent.id },
            data: { expiresAt: null },
          });
          const { createBossEncounter } = await import('../services/bossEncounterService');
          await createBossEncounter(bossEvent.id, bossMob.id, 1000);

          await emitSystemMessage(getIo(), 'world', 'world',
            `${zone.name}: A player has discovered ${bossMob.name}!`);
          await emitSystemMessage(getIo(), 'zone', `zone:${body.zoneId}`,
            `A player has discovered a boss: ${bossMob.name}! Sign up for the raid!`);

          events.push({
            turn: outcome.turnOccurred,
            type: 'event_discovery',
            description: `You discovered a boss: **${bossMob.name}**! A raid encounter has been created.`,
            details: { eventId: bossEvent.id, eventTitle: bossEvent.title },
          });
          continue; // skip regular event discovery
        }
      }
    }
  }

  // ... existing regular event discovery code ...
}
```

**Step 2: Commit**

```
feat: add boss discovery during exploration
```

---

### Task 7: Add lazy boss resolution to boss routes

**Files:**
- Modify: `apps/api/src/routes/boss.ts`

**Step 1: Add lazy resolution calls**

Import `checkAndResolveDueBossRounds` and call it at the start of the three endpoints that should trigger resolution:

```typescript
import { checkAndResolveDueBossRounds } from '../services/bossEncounterService';
import { getIo } from '../socket';
```

In `GET /boss/active`:
```typescript
await checkAndResolveDueBossRounds(getIo());
```

In `GET /boss/:id`:
```typescript
await checkAndResolveDueBossRounds(getIo());
```

In `POST /boss/:id/signup`:
```typescript
await checkAndResolveDueBossRounds(getIo());
```

Add each call as the first line inside the `try` block, before any other logic.

**Step 2: Add zone check to signup**

The player must be in the boss's zone. After getting the encounter, verify:

```typescript
// Check player is in the boss zone
const event = await prisma.worldEvent.findUnique({
  where: { id: data.encounter.eventId },
  select: { zoneId: true },
});
const player = await prisma.player.findUnique({
  where: { id: playerId },
  select: { currentZoneId: true },
});
if (event?.zoneId && player?.currentZoneId !== event.zoneId) {
  throw new AppError(400, 'You must be in the boss zone to sign up', 'WRONG_ZONE');
}
```

**Step 3: Commit**

```
feat: add lazy boss resolution and zone validation to boss routes
```

---

### Task 8: Update frontend boss panel for shared raid pool

**Files:**
- Modify: `apps/web/src/lib/api.ts` (update `BossEncounterResponse` type)
- Modify: `apps/web/src/components/BossEncounterPanel.tsx`

**Step 1: Update API response type**

Add `raidPool` fields to `BossEncounterResponse`:

```typescript
export interface BossEncounterResponse {
  // ... existing fields ...
  raidPoolHp?: number;
  raidPoolMax?: number;
  zoneName?: string;
}
```

**Step 2: Update boss route to return raid pool info**

In `apps/api/src/routes/boss.ts` `GET /boss/:id`, compute and return the raid pool:

```typescript
// Compute raid pool from current round signups
const nextRound = data.encounter.roundNumber + 1;
const currentSignups = data.participants.filter(p => p.roundNumber === nextRound);
let raidPoolMax = 0;
for (const p of currentSignups) {
  const hp = await getHpState(p.playerId);
  raidPoolMax += hp.maxHp;
}

res.json({
  encounter: {
    ...data.encounter,
    mobName: mob?.name ?? 'Unknown',
    mobLevel: mob?.level ?? 1,
    raidPoolMax,
  },
  participants: data.participants,
});
```

**Step 3: Update `BossEncounterPanel.tsx`**

Add a raid pool HP bar below the boss HP bar:

```tsx
{/* Raid Pool */}
{encounter.raidPoolMax && encounter.raidPoolMax > 0 && (
  <div>
    <div className="flex justify-between text-xs mb-1">
      <span>Raid Pool</span>
      <span>{encounter.raidPoolMax.toLocaleString()} HP</span>
    </div>
    <div className="w-full h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <div className="h-full rounded-full" style={{ width: '100%', background: 'var(--rpg-green-light)' }} />
    </div>
  </div>
)}
```

**Step 4: Commit**

```
feat: show raid pool in boss encounter panel
```

---

### Task 9: Integration test — manual verification

**Steps:**
1. Set test constants: `BOSS_SPAWN_CHANCE: 1.0`, `BOSS_ROUND_INTERVAL_MINUTES: 1` (1 minute rounds for testing)
2. Run: `npm run dev` from the worktree
3. Explore in any wild zone — should trigger a boss discovery or scheduler boss spawn
4. Check world chat and zone chat for boss announcements
5. Sign up as attacker, wait 1 minute, verify round resolves
6. Sign up as healer on a second account if possible
7. Verify boss HP decreases and raid pool takes damage
8. Reset test constants back to production values
9. Commit any final fixes

```
fix: address integration test findings
```

---

### Task 10: Restore production constants and final cleanup

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Restore all test constants**

Search for all `TODO: restore` comments and fix:
```typescript
RESOURCE_EVENT_DURATION_HOURS: 6,
MOB_EVENT_DURATION_HOURS: 6,
WORLD_WIDE_EVENT_DURATION_HOURS: 8,
EVENT_RESPAWN_DELAY_MINUTES: 30,
EVENT_DISCOVERY_CHANCE_PER_TURN: 0.0001,
BOSS_SPAWN_CHANCE: 0.10,
BOSS_ROUND_INTERVAL_MINUTES: 30,
```

**Step 2: Build and verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine`

**Step 3: Commit and push**

```
chore: restore production constants, remove test overrides
```

Push: `git push`
