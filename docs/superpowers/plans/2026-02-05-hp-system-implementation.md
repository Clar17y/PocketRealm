# HP System Implementation Plan

**Status: Complete** (2026-02-05)

All 14 tasks implemented and merged to main. Additional improvements made during implementation:
- Flee mechanics now scale with evasion vs mob level (not just evasion)
- Added `level` field to mob_templates table
- Added knockout banners to Explore/Gathering/Crafting/Combat screens
- Blocked crafting while recovering

**Goal:** Implement persistent HP system with passive regeneration, active rest mechanic, knockout/flee mechanics, and potion support.

**Architecture:** Lazy HP calculation (like turns) - store `currentHp` and `lastHpRegenAt`, compute passive regen on read. HP persists between combats. Knockout enters "Recovering" state requiring turn cost to exit. Combat checks player HP and applies flee mechanics on defeat.

**Tech Stack:** Prisma (DB), Express routes, game-engine pure functions, React frontend components

---

## Task 1: Add HP Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Add HP_CONSTANTS block**

Add after `CRAFTING_CONSTANTS`:

```typescript
// =============================================================================
// HP & HEALTH
// =============================================================================

export const HP_CONSTANTS = {
  /** Base HP for all players */
  BASE_HP: 100,

  /** Additional HP per Vitality level */
  HP_PER_VITALITY: 5,

  /** Base passive HP regeneration per second */
  BASE_PASSIVE_REGEN: 0.4,

  /** Additional passive regen per Vitality level (per second) */
  PASSIVE_REGEN_PER_VITALITY: 0.04,

  /** Base HP healed per turn when resting */
  BASE_REST_HEAL: 2,

  /** Additional HP healed per turn per Vitality level */
  REST_HEAL_PER_VITALITY: 0.2,

  /** Turns required to recover from knockout (per max HP) */
  RECOVERY_TURNS_PER_MAX_HP: 1,

  /** HP percentage restored after recovery */
  RECOVERY_EXIT_HP_PERCENT: 0.25,
} as const;

export const FLEE_CONSTANTS = {
  /** Base chance to flee successfully */
  BASE_FLEE_CHANCE: 0.3,

  /** Additional flee chance per Evasion level */
  FLEE_CHANCE_PER_EVASION: 0.02,

  /** Roll threshold for clean escape */
  HIGH_SUCCESS_THRESHOLD: 0.8,

  /** Roll threshold for wounded escape */
  PARTIAL_SUCCESS_THRESHOLD: 0.4,

  /** HP percentage remaining on clean escape */
  HIGH_SUCCESS_HP_PERCENT: 0.15,

  /** HP remaining on wounded escape */
  PARTIAL_SUCCESS_HP: 1,

  /** Gold loss percentage on clean escape */
  GOLD_LOSS_MINOR: 0.05,

  /** Gold loss percentage on wounded escape */
  GOLD_LOSS_MODERATE: 0.15,

  /** Gold loss percentage on knockout */
  GOLD_LOSS_SEVERE: 0.30,
} as const;

export const POTION_CONSTANTS = {
  /** HP restored by Minor Health Potion */
  MINOR_HEALTH_HEAL: 50,

  /** HP restored by Health Potion */
  HEALTH_HEAL: 150,

  /** HP restored by Greater Health Potion */
  GREATER_HEALTH_HEAL: 400,

  /** HP percentage restored by Minor Recovery Potion */
  MINOR_RECOVERY_PERCENT: 0.25,

  /** HP percentage restored by Recovery Potion */
  RECOVERY_PERCENT: 0.50,

  /** HP percentage restored by Greater Recovery Potion */
  GREATER_RECOVERY_PERCENT: 1.0,
} as const;
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(shared): add HP, flee, and potion constants"
```

---

## Task 2: Add HP Types

**Files:**
- Create: `packages/shared/src/types/hp.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create HP types file**

```typescript
// packages/shared/src/types/hp.types.ts

export interface HpState {
  currentHp: number;
  maxHp: number;
  regenPerSecond: number;
  lastHpRegenAt: string;
  isRecovering: boolean;
  recoveryCost: number | null;
}

export interface RestResult {
  previousHp: number;
  healedAmount: number;
  currentHp: number;
  maxHp: number;
  turnsSpent: number;
}

export interface RecoveryResult {
  previousState: 'recovering';
  currentHp: number;
  maxHp: number;
  turnsSpent: number;
}

export type FleeOutcome = 'clean_escape' | 'wounded_escape' | 'knockout';

export interface FleeResult {
  outcome: FleeOutcome;
  remainingHp: number;
  goldLost: number;
  isRecovering: boolean;
  recoveryCost: number | null;
}
```

**Step 2: Export from index**

Add to `packages/shared/src/index.ts`:

```typescript
export * from './types/hp.types';
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/shared/src/types/hp.types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add HP system types"
```

---

## Task 3: Database Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add HP fields to Player model**

Find the Player model and add these fields after `lastActiveAt`:

```prisma
model Player {
  id           String    @id @default(uuid())
  username     String    @unique @db.VarChar(32)
  email        String    @unique @db.VarChar(255)
  passwordHash String    @map("password_hash") @db.VarChar(255)
  createdAt    DateTime  @default(now()) @map("created_at")
  lastActiveAt DateTime? @map("last_active_at")

  // HP System
  currentHp     Int      @default(100) @map("current_hp")
  lastHpRegenAt DateTime @default(now()) @map("last_hp_regen_at")
  isRecovering  Boolean  @default(false) @map("is_recovering")
  recoveryCost  Int?     @map("recovery_cost")

  turnBank          TurnBank?
  // ... rest of relations
```

**Step 2: Generate Prisma client**

Run: `npm run db:generate`
Expected: "Generated Prisma Client"

**Step 3: Create migration**

Run: `cd packages/database && npx prisma migrate dev --name add_hp_system`
Expected: Migration created and applied

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(database): add HP system fields to Player model"
```

---

## Task 4: HP Calculation Functions (Game Engine)

**Files:**
- Create: `packages/game-engine/src/hp/hpCalculator.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Create HP calculator module**

```typescript
// packages/game-engine/src/hp/hpCalculator.ts

import { HP_CONSTANTS } from '@adventure/shared';

export interface HpCalculationInput {
  vitalityLevel: number;
  equipmentHealthBonus: number;
}

export function calculateMaxHp(input: HpCalculationInput): number {
  return (
    HP_CONSTANTS.BASE_HP +
    input.vitalityLevel * HP_CONSTANTS.HP_PER_VITALITY +
    input.equipmentHealthBonus
  );
}

export function calculateRegenPerSecond(vitalityLevel: number): number {
  return (
    HP_CONSTANTS.BASE_PASSIVE_REGEN +
    vitalityLevel * HP_CONSTANTS.PASSIVE_REGEN_PER_VITALITY
  );
}

export function calculateHealPerTurn(vitalityLevel: number): number {
  return (
    HP_CONSTANTS.BASE_REST_HEAL +
    vitalityLevel * HP_CONSTANTS.REST_HEAL_PER_VITALITY
  );
}

export function calculateCurrentHp(
  storedHp: number,
  lastRegenAt: Date,
  maxHp: number,
  regenPerSecond: number,
  isRecovering: boolean,
  now: Date = new Date()
): number {
  // No passive regen while recovering
  if (isRecovering) return storedHp;

  const elapsedSeconds = (now.getTime() - lastRegenAt.getTime()) / 1000;
  const regenAmount = Math.floor(elapsedSeconds * regenPerSecond);
  return Math.min(storedHp + regenAmount, maxHp);
}

export function calculateRestHealing(
  currentHp: number,
  maxHp: number,
  healPerTurn: number,
  turnsToSpend: number
): { turnsUsed: number; healedAmount: number; newHp: number } {
  const hpNeeded = maxHp - currentHp;
  const maxHealAmount = healPerTurn * turnsToSpend;
  const actualHealAmount = Math.min(hpNeeded, maxHealAmount);
  const turnsUsed = Math.ceil(actualHealAmount / healPerTurn);

  return {
    turnsUsed: Math.max(turnsUsed, turnsToSpend > 0 ? 1 : 0),
    healedAmount: actualHealAmount,
    newHp: Math.min(currentHp + actualHealAmount, maxHp),
  };
}

export function calculateRecoveryCost(maxHp: number): number {
  return maxHp * HP_CONSTANTS.RECOVERY_TURNS_PER_MAX_HP;
}

export function calculateRecoveryExitHp(maxHp: number): number {
  return Math.floor(maxHp * HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT);
}
```

**Step 2: Export from index**

Add to `packages/game-engine/src/index.ts`:

```typescript
export * from './hp/hpCalculator';
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/game-engine && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/game-engine/src/hp/hpCalculator.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add HP calculation functions"
```

---

## Task 5: Flee Mechanics (Game Engine)

**Files:**
- Create: `packages/game-engine/src/hp/fleeMechanics.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Create flee mechanics module**

```typescript
// packages/game-engine/src/hp/fleeMechanics.ts

import { FLEE_CONSTANTS } from '@adventure/shared';
import type { FleeOutcome } from '@adventure/shared';

export interface FleeInput {
  evasionLevel: number;
  maxHp: number;
  currentGold: number;
}

export interface FleeCalculationResult {
  outcome: FleeOutcome;
  remainingHp: number;
  goldLost: number;
  recoveryCost: number | null;
}

export function calculateFleeChance(evasionLevel: number): number {
  return Math.min(
    0.95,
    FLEE_CONSTANTS.BASE_FLEE_CHANCE +
      evasionLevel * FLEE_CONSTANTS.FLEE_CHANCE_PER_EVASION
  );
}

export function determineFleeOutcome(
  roll: number,
  fleeChance: number
): FleeOutcome {
  const normalizedRoll = roll / fleeChance;

  if (normalizedRoll >= FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD) {
    return 'clean_escape';
  }
  if (normalizedRoll >= FLEE_CONSTANTS.PARTIAL_SUCCESS_THRESHOLD) {
    return 'wounded_escape';
  }
  return 'knockout';
}

export function calculateFleeResult(
  input: FleeInput,
  roll: number = Math.random()
): FleeCalculationResult {
  const fleeChance = calculateFleeChance(input.evasionLevel);
  const outcome = determineFleeOutcome(roll, fleeChance);

  let remainingHp: number;
  let goldLossPercent: number;
  let recoveryCost: number | null = null;

  switch (outcome) {
    case 'clean_escape':
      remainingHp = Math.max(
        1,
        Math.floor(input.maxHp * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT)
      );
      goldLossPercent = FLEE_CONSTANTS.GOLD_LOSS_MINOR;
      break;
    case 'wounded_escape':
      remainingHp = FLEE_CONSTANTS.PARTIAL_SUCCESS_HP;
      goldLossPercent = FLEE_CONSTANTS.GOLD_LOSS_MODERATE;
      break;
    case 'knockout':
      remainingHp = 0;
      goldLossPercent = FLEE_CONSTANTS.GOLD_LOSS_SEVERE;
      recoveryCost = input.maxHp; // 1 turn per max HP
      break;
  }

  const goldLost = Math.floor(input.currentGold * goldLossPercent);

  return {
    outcome,
    remainingHp,
    goldLost,
    recoveryCost,
  };
}
```

**Step 2: Export from index**

Add to `packages/game-engine/src/index.ts`:

```typescript
export * from './hp/fleeMechanics';
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/game-engine && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/game-engine/src/hp/fleeMechanics.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add flee mechanics calculations"
```

---

## Task 6: HP Service (Backend)

**Files:**
- Create: `apps/api/src/services/hpService.ts`

**Step 1: Create HP service**

```typescript
// apps/api/src/services/hpService.ts

import { prisma } from '@adventure/database';
import {
  calculateMaxHp,
  calculateRegenPerSecond,
  calculateCurrentHp,
  calculateHealPerTurn,
  calculateRestHealing,
  calculateRecoveryCost,
  calculateRecoveryExitHp,
} from '@adventure/game-engine';
import type { HpState, RestResult, RecoveryResult } from '@adventure/shared';
import { HP_CONSTANTS } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { getEquipmentStats } from './equipmentService';
import { spendPlayerTurns } from './turnBankService';

async function getVitalityLevel(playerId: string): Promise<number> {
  const skill = await prisma.playerSkill.findUnique({
    where: { playerId_skillType: { playerId, skillType: 'vitality' } },
    select: { level: true },
  });
  return skill?.level ?? 1;
}

export async function getHpState(
  playerId: string,
  now: Date = new Date()
): Promise<HpState> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      currentHp: true,
      lastHpRegenAt: true,
      isRecovering: true,
      recoveryCost: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const vitalityLevel = await getVitalityLevel(playerId);
  const equipmentStats = await getEquipmentStats(playerId);

  const maxHp = calculateMaxHp({
    vitalityLevel,
    equipmentHealthBonus: equipmentStats.health,
  });

  const regenPerSecond = calculateRegenPerSecond(vitalityLevel);

  const currentHp = calculateCurrentHp(
    player.currentHp,
    player.lastHpRegenAt,
    maxHp,
    regenPerSecond,
    player.isRecovering,
    now
  );

  return {
    currentHp,
    maxHp,
    regenPerSecond,
    lastHpRegenAt: player.lastHpRegenAt.toISOString(),
    isRecovering: player.isRecovering,
    recoveryCost: player.recoveryCost,
  };
}

export async function rest(
  playerId: string,
  turnsToSpend: number,
  now: Date = new Date()
): Promise<RestResult> {
  if (!Number.isInteger(turnsToSpend) || turnsToSpend <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_TURNS');
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      currentHp: true,
      lastHpRegenAt: true,
      isRecovering: true,
      recoveryCost: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (player.isRecovering) {
    throw new AppError(400, 'Cannot rest while recovering. Spend recovery turns first.', 'IS_RECOVERING');
  }

  const vitalityLevel = await getVitalityLevel(playerId);
  const equipmentStats = await getEquipmentStats(playerId);

  const maxHp = calculateMaxHp({
    vitalityLevel,
    equipmentHealthBonus: equipmentStats.health,
  });

  const regenPerSecond = calculateRegenPerSecond(vitalityLevel);
  const currentHp = calculateCurrentHp(
    player.currentHp,
    player.lastHpRegenAt,
    maxHp,
    regenPerSecond,
    false,
    now
  );

  if (currentHp >= maxHp) {
    throw new AppError(400, 'Already at full HP', 'FULL_HP');
  }

  const healPerTurn = calculateHealPerTurn(vitalityLevel);
  const healing = calculateRestHealing(currentHp, maxHp, healPerTurn, turnsToSpend);

  // Spend turns (will throw if insufficient)
  await spendPlayerTurns(playerId, healing.turnsUsed, now);

  // Update HP
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: healing.newHp,
      lastHpRegenAt: now,
    },
  });

  return {
    previousHp: currentHp,
    healedAmount: healing.healedAmount,
    currentHp: healing.newHp,
    maxHp,
    turnsSpent: healing.turnsUsed,
  };
}

export async function recover(
  playerId: string,
  now: Date = new Date()
): Promise<RecoveryResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      isRecovering: true,
      recoveryCost: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (!player.isRecovering) {
    throw new AppError(400, 'Not in recovering state', 'NOT_RECOVERING');
  }

  const recoveryCost = player.recoveryCost ?? 0;

  // Spend recovery turns (will throw if insufficient)
  await spendPlayerTurns(playerId, recoveryCost, now);

  const vitalityLevel = await getVitalityLevel(playerId);
  const equipmentStats = await getEquipmentStats(playerId);

  const maxHp = calculateMaxHp({
    vitalityLevel,
    equipmentHealthBonus: equipmentStats.health,
  });

  const exitHp = calculateRecoveryExitHp(maxHp);

  // Exit recovering state
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: exitHp,
      lastHpRegenAt: now,
      isRecovering: false,
      recoveryCost: null,
    },
  });

  return {
    previousState: 'recovering',
    currentHp: exitHp,
    maxHp,
    turnsSpent: recoveryCost,
  };
}

export async function setHp(
  playerId: string,
  newHp: number,
  now: Date = new Date()
): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: Math.max(0, newHp),
      lastHpRegenAt: now,
    },
  });
}

export async function enterRecoveringState(
  playerId: string,
  maxHp: number,
  now: Date = new Date()
): Promise<void> {
  const recoveryCost = calculateRecoveryCost(maxHp);

  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: 0,
      lastHpRegenAt: now,
      isRecovering: true,
      recoveryCost,
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/services/hpService.ts
git commit -m "feat(api): add HP service with rest and recovery"
```

---

## Task 7: HP and Rest Routes (Backend)

**Files:**
- Create: `apps/api/src/routes/hp.ts`
- Modify: `apps/api/src/index.ts` (to register route)

**Step 1: Create HP routes**

```typescript
// apps/api/src/routes/hp.ts

import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getHpState, rest, recover } from '../services/hpService';
import { getTurnState } from '../services/turnBankService';
import {
  calculateHealPerTurn,
  calculateRecoveryExitHp,
  calculateMaxHp,
} from '@adventure/game-engine';
import { getEquipmentStats } from '../services/equipmentService';

export const hpRouter = Router();

hpRouter.use(authenticate);

/**
 * GET /api/v1/hp
 * Get current HP state including regen info
 */
hpRouter.get('/', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const hpState = await getHpState(playerId);
    res.json(hpState);
  } catch (err) {
    next(err);
  }
});

const restSchema = z.object({
  turns: z.number().int().positive(),
});

/**
 * POST /api/v1/hp/rest
 * Spend turns to restore HP
 */
hpRouter.post('/rest', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = restSchema.parse(req.body);

    const result = await rest(playerId, body.turns);
    const turns = await getTurnState(playerId);

    // Log the activity
    await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'rest',
        turnsSpent: result.turnsSpent,
        result: {
          previousHp: result.previousHp,
          healedAmount: result.healedAmount,
          currentHp: result.currentHp,
          maxHp: result.maxHp,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    res.json({
      ...result,
      turns,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/hp/recover
 * Spend recovery turns to exit knockout state
 */
hpRouter.post('/recover', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    const result = await recover(playerId);
    const turns = await getTurnState(playerId);

    // Log the activity
    await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'recovery',
        turnsSpent: result.turnsSpent,
        result: {
          previousState: result.previousState,
          currentHp: result.currentHp,
          maxHp: result.maxHp,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    res.json({
      ...result,
      turns,
    });
  } catch (err) {
    next(err);
  }
});

const estimateSchema = z.object({
  turns: z.coerce.number().int().positive(),
});

/**
 * GET /api/v1/hp/rest/estimate?turns=100
 * Preview how much HP would be restored
 */
hpRouter.get('/rest/estimate', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const query = estimateSchema.parse(req.query);

    const hpState = await getHpState(playerId);

    if (hpState.isRecovering) {
      res.json({
        isRecovering: true,
        recoveryCost: hpState.recoveryCost,
        recoveryExitHp: calculateRecoveryExitHp(hpState.maxHp),
      });
      return;
    }

    const vitalitySkill = await prisma.playerSkill.findUnique({
      where: { playerId_skillType: { playerId, skillType: 'vitality' } },
      select: { level: true },
    });
    const vitalityLevel = vitalitySkill?.level ?? 1;

    const healPerTurn = calculateHealPerTurn(vitalityLevel);
    const hpNeeded = hpState.maxHp - hpState.currentHp;
    const maxHealAmount = healPerTurn * query.turns;
    const actualHealAmount = Math.min(hpNeeded, maxHealAmount);
    const turnsNeeded = Math.ceil(actualHealAmount / healPerTurn);

    res.json({
      isRecovering: false,
      currentHp: hpState.currentHp,
      maxHp: hpState.maxHp,
      healPerTurn,
      turnsRequested: query.turns,
      turnsNeeded: Math.min(turnsNeeded, query.turns),
      healAmount: actualHealAmount,
      resultingHp: Math.min(hpState.currentHp + actualHealAmount, hpState.maxHp),
    });
  } catch (err) {
    next(err);
  }
});
```

**Step 2: Register route in main app**

Find `apps/api/src/index.ts` and add the HP router import and registration alongside other routes:

```typescript
import { hpRouter } from './routes/hp';

// ... in route registration section:
app.use('/api/v1/hp', hpRouter);
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/hp.ts apps/api/src/index.ts
git commit -m "feat(api): add HP and rest endpoints"
```

---

## Task 8: Integrate HP into Combat

**Files:**
- Modify: `apps/api/src/routes/combat.ts`

**Step 1: Import HP service and flee mechanics**

Add imports at top of file:

```typescript
import { getHpState, setHp, enterRecoveringState } from '../services/hpService';
import { calculateFleeResult, calculateMaxHp } from '@adventure/game-engine';
import type { FleeOutcome } from '@adventure/shared';
```

**Step 2: Add recovering state check**

After `const playerId = req.player!.playerId;` in the `/start` handler, add:

```typescript
// Check if player is recovering (knocked out)
const hpState = await getHpState(playerId);
if (hpState.isRecovering) {
  throw new AppError(400, 'Cannot fight while recovering. Spend recovery turns first.', 'IS_RECOVERING');
}

// Check if player has HP to fight
if (hpState.currentHp <= 0) {
  throw new AppError(400, 'Cannot fight with 0 HP. Rest to recover health.', 'NO_HP');
}
```

**Step 3: Modify combat to use persistent HP**

Replace the `buildPlayerCombatStats` call to use current HP:

```typescript
const playerStats = buildPlayerCombatStats(
  hpState.currentHp, // Use current HP instead of base 100
  {
    attack: attackLevel,
    defence: defenceLevel,
    vitality: vitalityLevel,
    evasion: evasionLevel,
  },
  equipmentStats
);
```

**Step 4: Handle combat outcome with HP persistence**

After combat resolution, add HP update logic:

```typescript
// Update player HP based on combat outcome
if (combatResult.outcome === 'victory') {
  // Player takes damage but survives - update HP
  const finalPlayerHp = combatResult.log
    .filter((entry: { actor: string }) => entry.actor === 'mob')
    .reduce((hp: number) => hp, playerStats.hp); // Get final HP from combat log

  await setHp(playerId, combatResult.playerHpRemaining ?? hpState.currentHp);

  loot = await rollAndGrantLoot(playerId, mob.id);
  xpGrant = await grantSkillXp(playerId, attackSkill, combatResult.xpGained);
} else if (combatResult.outcome === 'defeat') {
  // Player lost - calculate flee outcome
  const fleeResult = calculateFleeResult({
    evasionLevel: evasionLevel,
    maxHp: hpState.maxHp,
    currentGold: 0, // TODO: implement gold system
  });

  if (fleeResult.outcome === 'knockout') {
    await enterRecoveringState(playerId, hpState.maxHp);
  } else {
    await setHp(playerId, fleeResult.remainingHp);
  }

  // Add flee info to response
  (combatResult as any).fleeResult = fleeResult;
}
```

**Step 5: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/api/src/routes/combat.ts
git commit -m "feat(api): integrate persistent HP into combat system"
```

---

## Task 9: Block Actions While Recovering

**Files:**
- Modify: `apps/api/src/routes/exploration.ts`
- Modify: `apps/api/src/routes/gathering.ts`
- Modify: `apps/api/src/routes/equipment.ts`

**Step 1: Add recovery check helper**

Create a shared helper or add to each file:

```typescript
import { getHpState } from '../services/hpService';

async function checkNotRecovering(playerId: string): Promise<void> {
  const hpState = await getHpState(playerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot perform this action while recovering', 'IS_RECOVERING');
  }
}
```

**Step 2: Add check to exploration start**

In `exploration.ts` `/start` handler, after `const playerId`:

```typescript
await checkNotRecovering(playerId);
```

**Step 3: Add check to gathering mine**

In `gathering.ts` `/mine` handler, after `const playerId`:

```typescript
await checkNotRecovering(playerId);
```

**Step 4: Add check to equipment equip/unequip**

In `equipment.ts` handlers, after `const playerId`:

```typescript
await checkNotRecovering(playerId);
```

**Step 5: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/api/src/routes/exploration.ts apps/api/src/routes/gathering.ts apps/api/src/routes/equipment.ts
git commit -m "feat(api): block actions while in recovering state"
```

---

## Task 10: Frontend API Functions

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add HP API functions**

Add after the existing API functions:

```typescript
// HP & Rest
export async function getHpState() {
  return fetchApi<{
    currentHp: number;
    maxHp: number;
    regenPerSecond: number;
    lastHpRegenAt: string;
    isRecovering: boolean;
    recoveryCost: number | null;
  }>('/api/v1/hp');
}

export async function restEstimate(turns: number) {
  return fetchApi<{
    isRecovering: boolean;
    recoveryCost?: number;
    recoveryExitHp?: number;
    currentHp?: number;
    maxHp?: number;
    healPerTurn?: number;
    turnsRequested?: number;
    turnsNeeded?: number;
    healAmount?: number;
    resultingHp?: number;
  }>(`/api/v1/hp/rest/estimate?turns=${turns}`);
}

export async function rest(turns: number) {
  return fetchApi<{
    previousHp: number;
    healedAmount: number;
    currentHp: number;
    maxHp: number;
    turnsSpent: number;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
  }>('/api/v1/hp/rest', {
    method: 'POST',
    body: JSON.stringify({ turns }),
  });
}

export async function recoverFromKnockout() {
  return fetchApi<{
    previousState: 'recovering';
    currentHp: number;
    maxHp: number;
    turnsSpent: number;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
  }>('/api/v1/hp/recover', {
    method: 'POST',
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add HP and rest API functions"
```

---

## Task 11: Dashboard HP Display

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx`

**Step 1: Update DashboardProps interface**

```typescript
interface DashboardProps {
  playerData: {
    turns: number;
    maxTurns: number;
    turnsRegenRate: number;
    gold: number;
    currentXP: number;
    nextLevelXP: number;
    currentZone: string;
    // Add HP fields
    currentHp: number;
    maxHp: number;
    hpRegenRate: number;
    isRecovering: boolean;
    recoveryCost: number | null;
  };
  skills: Array<{ name: string; level: number; icon?: LucideIcon; imageSrc?: string }>;
  onNavigate: (screen: string) => void;
}
```

**Step 2: Add HP display card after Turn Counter**

```typescript
{/* HP Display */}
<PixelCard>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center">
        <Heart size={32} color={playerData.isRecovering ? 'var(--rpg-red)' : 'var(--rpg-green-light)'} />
      </div>
      <div>
        <div className="text-sm text-[var(--rpg-text-secondary)]">
          {playerData.isRecovering ? 'Knocked Out' : 'Health'}
        </div>
        <div className="text-2xl font-bold text-[var(--rpg-green-light)] font-mono">
          {playerData.isRecovering ? (
            <span className="text-[var(--rpg-red)]">KO</span>
          ) : (
            `${playerData.currentHp} / ${playerData.maxHp}`
          )}
        </div>
      </div>
    </div>
    <div className="text-right">
      {playerData.isRecovering ? (
        <>
          <div className="text-xs text-[var(--rpg-text-secondary)]">Recovery Cost</div>
          <div className="text-sm text-[var(--rpg-red)]">
            {playerData.recoveryCost?.toLocaleString()} turns
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-[var(--rpg-text-secondary)]">Regen Rate</div>
          <div className="text-sm text-[var(--rpg-green-light)]">
            +{playerData.hpRegenRate.toFixed(1)}/sec
          </div>
        </>
      )}
    </div>
  </div>
  {!playerData.isRecovering && (
    <div className="mt-3">
      <StatBar
        current={playerData.currentHp}
        max={playerData.maxHp}
        color="green"
        size="sm"
        showNumbers={false}
      />
    </div>
  )}
</PixelCard>
```

**Step 3: Update Rest button to navigate**

```typescript
<PixelButton
  variant={playerData.isRecovering ? 'primary' : 'secondary'}
  onClick={() => onNavigate('rest')}
>
  <div className="flex items-center justify-center gap-2">
    <Heart size={20} />
    {playerData.isRecovering ? 'Recover' : 'Rest'}
  </div>
</PixelButton>
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Dashboard.tsx
git commit -m "feat(web): add HP display to dashboard"
```

---

## Task 12: Rest Screen Component

**Files:**
- Create: `apps/web/src/components/screens/Rest.tsx`

**Step 1: Create Rest screen**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { Heart, AlertTriangle } from 'lucide-react';
import * as api from '@/lib/api';

interface RestProps {
  onComplete: () => void;
  onTurnsUpdate: (turns: number) => void;
}

export function Rest({ onComplete, onTurnsUpdate }: RestProps) {
  const [hpState, setHpState] = useState<{
    currentHp: number;
    maxHp: number;
    regenPerSecond: number;
    isRecovering: boolean;
    recoveryCost: number | null;
  } | null>(null);

  const [turns, setTurns] = useState(100);
  const [estimate, setEstimate] = useState<{
    healAmount: number;
    resultingHp: number;
    turnsNeeded: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHpState = useCallback(async () => {
    const result = await api.getHpState();
    if (result.data) {
      setHpState(result.data);
    }
  }, []);

  const fetchEstimate = useCallback(async () => {
    if (!hpState || hpState.isRecovering) return;

    const result = await api.restEstimate(turns);
    if (result.data && !result.data.isRecovering) {
      setEstimate({
        healAmount: result.data.healAmount ?? 0,
        resultingHp: result.data.resultingHp ?? 0,
        turnsNeeded: result.data.turnsNeeded ?? 0,
      });
    }
  }, [turns, hpState]);

  useEffect(() => {
    fetchHpState();
  }, [fetchHpState]);

  useEffect(() => {
    const timer = setTimeout(fetchEstimate, 300);
    return () => clearTimeout(timer);
  }, [fetchEstimate]);

  const handleRest = async () => {
    if (!hpState) return;
    setIsLoading(true);
    setError(null);

    const result = await api.rest(turns);
    if (result.error) {
      setError(result.error.message);
      setIsLoading(false);
      return;
    }

    if (result.data) {
      onTurnsUpdate(result.data.turns.currentTurns);
      setHpState({
        ...hpState,
        currentHp: result.data.currentHp,
        maxHp: result.data.maxHp,
      });
    }

    setIsLoading(false);
  };

  const handleRecover = async () => {
    setIsLoading(true);
    setError(null);

    const result = await api.recoverFromKnockout();
    if (result.error) {
      setError(result.error.message);
      setIsLoading(false);
      return;
    }

    if (result.data) {
      onTurnsUpdate(result.data.turns.currentTurns);
      await fetchHpState();
    }

    setIsLoading(false);
  };

  if (!hpState) {
    return (
      <PixelCard>
        <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
          Loading...
        </div>
      </PixelCard>
    );
  }

  // Recovering mode
  if (hpState.isRecovering) {
    return (
      <div className="space-y-4">
        <PixelCard>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={32} color="var(--rpg-red)" />
            <div>
              <h2 className="text-xl font-bold text-[var(--rpg-red)]">Knocked Out</h2>
              <p className="text-sm text-[var(--rpg-text-secondary)]">
                You must recover before taking any actions
              </p>
            </div>
          </div>

          <div className="bg-[var(--rpg-background)] rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-[var(--rpg-text-secondary)]">Recovery Cost</span>
              <span className="text-xl font-bold text-[var(--rpg-gold)] font-mono">
                {hpState.recoveryCost?.toLocaleString()} turns
              </span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-[var(--rpg-text-secondary)]">HP After Recovery</span>
              <span className="text-lg font-bold text-[var(--rpg-green-light)] font-mono">
                {Math.floor(hpState.maxHp * 0.25)} / {hpState.maxHp}
              </span>
            </div>
          </div>

          {error && (
            <div className="text-[var(--rpg-red)] text-sm mb-4">{error}</div>
          )}

          <PixelButton
            variant="primary"
            onClick={handleRecover}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Recovering...' : 'Recover'}
          </PixelButton>
        </PixelCard>
      </div>
    );
  }

  // Normal rest mode
  const hpPercent = (hpState.currentHp / hpState.maxHp) * 100;
  const isFullHp = hpState.currentHp >= hpState.maxHp;

  return (
    <div className="space-y-4">
      <PixelCard>
        <div className="flex items-center gap-3 mb-4">
          <Heart size={32} color="var(--rpg-green-light)" />
          <div>
            <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Rest</h2>
            <p className="text-sm text-[var(--rpg-text-secondary)]">
              Spend turns to restore health
            </p>
          </div>
        </div>

        {/* Current HP */}
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm text-[var(--rpg-text-secondary)]">Current HP</span>
            <span className="text-sm font-mono text-[var(--rpg-green-light)]">
              {hpState.currentHp} / {hpState.maxHp}
            </span>
          </div>
          <StatBar
            current={hpState.currentHp}
            max={hpState.maxHp}
            color="green"
            size="md"
            showNumbers={false}
          />
          <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
            Passive regen: +{hpState.regenPerSecond.toFixed(1)} HP/sec
          </div>
        </div>

        {/* Turn Slider */}
        {!isFullHp && (
          <>
            <div className="mb-4">
              <label className="block text-sm text-[var(--rpg-text-secondary)] mb-2">
                Turns to spend: {turns}
              </label>
              <input
                type="range"
                min="10"
                max="1000"
                step="10"
                value={turns}
                onChange={(e) => setTurns(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Estimate */}
            {estimate && (
              <div className="bg-[var(--rpg-background)] rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--rpg-text-secondary)]">HP Restored</span>
                  <span className="text-lg font-bold text-[var(--rpg-green-light)] font-mono">
                    +{Math.floor(estimate.healAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[var(--rpg-text-secondary)]">Result</span>
                  <span className="font-mono">
                    {hpState.currentHp} → {Math.floor(estimate.resultingHp)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[var(--rpg-text-secondary)]">Turns Used</span>
                  <span className="font-mono text-[var(--rpg-gold)]">
                    {estimate.turnsNeeded}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-[var(--rpg-red)] text-sm mb-4">{error}</div>
            )}

            <PixelButton
              variant="primary"
              onClick={handleRest}
              disabled={isLoading || isFullHp}
              className="w-full"
            >
              {isLoading ? 'Resting...' : 'Rest'}
            </PixelButton>
          </>
        )}

        {isFullHp && (
          <div className="text-center py-4 text-[var(--rpg-green-light)]">
            You are at full health!
          </div>
        )}
      </PixelCard>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/Rest.tsx
git commit -m "feat(web): add Rest screen component with recovery mode"
```

---

## Task 13: Wire Up Rest Screen in App

**Files:**
- Modify: `apps/web/src/app/game/page.tsx` (or wherever screen routing happens)

**Step 1: Import Rest component**

```typescript
import { Rest } from '@/components/screens/Rest';
```

**Step 2: Add rest screen case**

In the screen rendering switch/conditional:

```typescript
case 'rest':
  return (
    <Rest
      onComplete={() => setScreen('dashboard')}
      onTurnsUpdate={(turns) => setPlayerData(prev => ({ ...prev, turns }))}
    />
  );
```

**Step 3: Fetch HP data with other player data**

Update the data fetching to include HP state:

```typescript
const hpResult = await api.getHpState();
if (hpResult.data) {
  setPlayerData(prev => ({
    ...prev,
    currentHp: hpResult.data.currentHp,
    maxHp: hpResult.data.maxHp,
    hpRegenRate: hpResult.data.regenPerSecond,
    isRecovering: hpResult.data.isRecovering,
    recoveryCost: hpResult.data.recoveryCost,
  }));
}
```

**Step 4: Verify the app runs**

Run: `npm run dev:web`
Test: Navigate to rest screen, verify it loads

**Step 5: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat(web): wire up Rest screen in game routing"
```

---

## Task 14: Final Integration Test

**Step 1: Start all services**

Run: `npm run dev`

**Step 2: Test HP flow manually**

1. Login or register
2. Check dashboard shows HP
3. Start combat - verify HP decreases on damage taken
4. Rest - verify HP restores
5. Lose combat intentionally - verify knockout state
6. Recover from knockout - verify returns to 25% HP
7. Verify cannot explore/gather/fight while recovering

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for HP system"
```

**Step 4: Final commit with feature complete message**

```bash
git add -A
git commit -m "feat: complete HP system implementation

- Persistent HP between encounters
- Passive regeneration based on Vitality
- Active rest mechanic with turn cost
- Knockout/flee system with Evasion
- Recovery state blocking actions
- Dashboard HP display
- Rest screen with two modes"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | HP Constants | `packages/shared/src/constants/gameConstants.ts` |
| 2 | HP Types | `packages/shared/src/types/hp.types.ts` |
| 3 | Database Schema | `packages/database/prisma/schema.prisma` |
| 4 | HP Calculator | `packages/game-engine/src/hp/hpCalculator.ts` |
| 5 | Flee Mechanics | `packages/game-engine/src/hp/fleeMechanics.ts` |
| 6 | HP Service | `apps/api/src/services/hpService.ts` |
| 7 | HP Routes | `apps/api/src/routes/hp.ts` |
| 8 | Combat Integration | `apps/api/src/routes/combat.ts` |
| 9 | Block Actions | `apps/api/src/routes/*.ts` |
| 10 | Frontend API | `apps/web/src/lib/api.ts` |
| 11 | Dashboard HP | `apps/web/src/components/screens/Dashboard.tsx` |
| 12 | Rest Screen | `apps/web/src/components/screens/Rest.tsx` |
| 13 | Wire Up Rest | `apps/web/src/app/game/page.tsx` |
| 14 | Integration Test | Manual testing |
