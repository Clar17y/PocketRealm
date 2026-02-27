# Town Activities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a gold-based casino (shared roulette) and free fight simulator to town zones, giving players activities when turns are low.

**Architecture:** Gold field added to Player model. Casino uses a lazy global roulette round (stored in Redis) with bets in PostgreSQL. Training grounds reuses the existing `runCombat()` engine with a Redis cooldown. Both gated to town zones. Frontend gets two new screens with pixelated tavern aesthetic.

**Tech Stack:** Prisma migration, Express routes, Redis (round state + cooldowns), game-engine pure functions, React screens, Tailwind + RPG CSS variables.

---

### Task 1: Database — Add gold to Player and roulette models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

**Step 1: Add gold field to Player model**

In `schema.prisma`, add to the Player model after `attributePoints`:

```prisma
gold          Int     @default(0)
```

**Step 2: Add RouletteRound model**

```prisma
model RouletteRound {
  id         String   @id @default(uuid())
  spinNumber Int      @default(autoincrement())
  result     Int?
  startedAt  DateTime @default(now())
  resolvedAt DateTime?
  bets       RouletteBet[]

  @@map("roulette_rounds")
}

model RouletteBet {
  id       String @id @default(uuid())
  roundId  String
  playerId String
  betType  String @db.VarChar(16)
  betValue String @db.VarChar(32)
  amount   Int
  payout   Int?

  round  RouletteRound @relation(fields: [roundId], references: [id])
  player Player        @relation(fields: [playerId], references: [id])

  @@map("roulette_bets")
}
```

Add the relation to Player model:
```prisma
rouletteBets  RouletteBet[]
```

**Step 3: Run migration**

```bash
cd packages/database
npx prisma migrate dev --name add-gold-and-roulette
```

**Step 4: Verify Prisma client generates**

```bash
npm run db:generate
```

**Step 5: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat: add gold field and roulette models to schema"
```

---

### Task 2: Shared — Add casino and training constants + types

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Create: `packages/shared/src/types/casino.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Add constants to gameConstants.ts**

Add at the end of the file, before any trailing exports:

```ts
export const CASINO_CONSTANTS = {
  GOLD_EXCHANGE_RATE: 1,
  ROULETTE_MIN_BET: 1,
  ROULETTE_MAX_BET: 1000,
  ROULETTE_SLOTS: 37,
  ROULETTE_HISTORY_LENGTH: 20,
  ROUND_DURATION_SECONDS: 60,
  BETTING_WINDOW_SECONDS: 50,
} as const;

export const TRAINING_CONSTANTS = {
  COOLDOWN_SECONDS: 60,
} as const;
```

**Step 2: Create casino types**

```ts
// packages/shared/src/types/casino.types.ts

export type RouletteBetType =
  | 'straight'   // single number
  | 'split'      // 2 numbers
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'dozen'      // 1-12, 13-24, 25-36
  | 'column';    // column 1, 2, 3

export interface RouletteBetPlacement {
  betType: RouletteBetType;
  betValue: string;  // e.g. "17", "1,2", "1-12", "col1"
  amount: number;
}

export interface RouletteRoundState {
  roundId: string;
  phase: 'betting' | 'spinning' | 'result' | 'idle';
  result: number | null;
  startedAt: string;
  timeRemainingMs: number;
  bets: RoulettePublicBet[];
}

export interface RoulettePublicBet {
  playerName: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
}

export interface RouletteBetResult {
  betType: RouletteBetType;
  betValue: string;
  amount: number;
  payout: number;
  won: boolean;
}

export interface RouletteSpinResult {
  roundId: string;
  result: number;
  bets: RouletteBetResult[];
  totalWagered: number;
  totalPayout: number;
  goldAfter: number;
}

export interface RouletteHistoryEntry {
  spinNumber: number;
  result: number;
  resolvedAt: string;
}

// Roulette number properties
export const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36] as const;
export const ROULETTE_BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35] as const;
```

**Step 3: Export from index.ts**

Add to `packages/shared/src/index.ts`:
```ts
export * from './types/casino.types';
```

**Step 4: Build shared package**

```bash
npm run build --workspace=packages/shared
```

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat: add casino/training constants and roulette types"
```

---

### Task 3: Game Engine — Roulette pure functions

**Files:**
- Create: `packages/game-engine/src/casino/roulette.ts`
- Create: `packages/game-engine/src/casino/roulette.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Write failing tests**

```ts
// packages/game-engine/src/casino/roulette.test.ts
import { describe, expect, it } from 'vitest';
import {
  isWinningBet,
  calculatePayout,
  validateBet,
  getNumberColor,
} from './roulette';

describe('getNumberColor', () => {
  it('returns green for 0', () => {
    expect(getNumberColor(0)).toBe('green');
  });
  it('returns red for red numbers', () => {
    expect(getNumberColor(1)).toBe('red');
    expect(getNumberColor(36)).toBe('red');
  });
  it('returns black for black numbers', () => {
    expect(getNumberColor(2)).toBe('black');
    expect(getNumberColor(35)).toBe('black');
  });
});

describe('isWinningBet', () => {
  it('straight bet wins on exact number', () => {
    expect(isWinningBet('straight', '17', 17)).toBe(true);
    expect(isWinningBet('straight', '17', 18)).toBe(false);
  });
  it('split bet wins on either number', () => {
    expect(isWinningBet('split', '1,2', 1)).toBe(true);
    expect(isWinningBet('split', '1,2', 2)).toBe(true);
    expect(isWinningBet('split', '1,2', 3)).toBe(false);
  });
  it('red/black bets', () => {
    expect(isWinningBet('red', 'red', 1)).toBe(true);
    expect(isWinningBet('red', 'red', 2)).toBe(false);
    expect(isWinningBet('red', 'red', 0)).toBe(false);
    expect(isWinningBet('black', 'black', 2)).toBe(true);
  });
  it('odd/even bets', () => {
    expect(isWinningBet('odd', 'odd', 3)).toBe(true);
    expect(isWinningBet('odd', 'odd', 4)).toBe(false);
    expect(isWinningBet('odd', 'odd', 0)).toBe(false);
    expect(isWinningBet('even', 'even', 4)).toBe(true);
  });
  it('dozen bets', () => {
    expect(isWinningBet('dozen', '1-12', 6)).toBe(true);
    expect(isWinningBet('dozen', '1-12', 13)).toBe(false);
    expect(isWinningBet('dozen', '13-24', 20)).toBe(true);
    expect(isWinningBet('dozen', '25-36', 36)).toBe(true);
    expect(isWinningBet('dozen', '1-12', 0)).toBe(false);
  });
  it('column bets', () => {
    expect(isWinningBet('column', 'col1', 1)).toBe(true);
    expect(isWinningBet('column', 'col1', 4)).toBe(true);
    expect(isWinningBet('column', 'col2', 2)).toBe(true);
    expect(isWinningBet('column', 'col3', 3)).toBe(true);
    expect(isWinningBet('column', 'col1', 0)).toBe(false);
  });
});

describe('calculatePayout', () => {
  it('straight pays 35:1', () => {
    expect(calculatePayout('straight', 10)).toBe(360);
  });
  it('split pays 17:1', () => {
    expect(calculatePayout('split', 10)).toBe(180);
  });
  it('red/black pays 1:1', () => {
    expect(calculatePayout('red', 10)).toBe(20);
    expect(calculatePayout('black', 10)).toBe(20);
  });
  it('odd/even pays 1:1', () => {
    expect(calculatePayout('odd', 10)).toBe(20);
  });
  it('dozen/column pays 2:1', () => {
    expect(calculatePayout('dozen', 10)).toBe(30);
    expect(calculatePayout('column', 10)).toBe(30);
  });
});

describe('validateBet', () => {
  it('rejects amount below min', () => {
    expect(validateBet('straight', '17', 0).valid).toBe(false);
  });
  it('rejects amount above max', () => {
    expect(validateBet('straight', '17', 1001).valid).toBe(false);
  });
  it('rejects invalid bet type', () => {
    expect(validateBet('invalid' as any, '17', 10).valid).toBe(false);
  });
  it('rejects straight bet with out-of-range number', () => {
    expect(validateBet('straight', '37', 10).valid).toBe(false);
    expect(validateBet('straight', '-1', 10).valid).toBe(false);
  });
  it('rejects split with non-adjacent numbers', () => {
    expect(validateBet('split', '1,35', 10).valid).toBe(false);
  });
  it('accepts valid bets', () => {
    expect(validateBet('straight', '17', 10).valid).toBe(true);
    expect(validateBet('red', 'red', 50).valid).toBe(true);
    expect(validateBet('dozen', '1-12', 100).valid).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:engine -- --run src/casino/roulette.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement roulette pure functions**

```ts
// packages/game-engine/src/casino/roulette.ts
import { CASINO_CONSTANTS, ROULETTE_RED_NUMBERS, ROULETTE_BLACK_NUMBERS } from '@adventure/shared';
import type { RouletteBetType } from '@adventure/shared';

const RED_SET = new Set(ROULETTE_RED_NUMBERS);

export function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_SET.has(n) ? 'red' : 'black';
}

export function isWinningBet(betType: RouletteBetType, betValue: string, result: number): boolean {
  switch (betType) {
    case 'straight':
      return result === parseInt(betValue, 10);
    case 'split': {
      const [a, b] = betValue.split(',').map(Number);
      return result === a || result === b;
    }
    case 'red':
      return result > 0 && RED_SET.has(result);
    case 'black':
      return result > 0 && !RED_SET.has(result);
    case 'odd':
      return result > 0 && result % 2 === 1;
    case 'even':
      return result > 0 && result % 2 === 0;
    case 'dozen': {
      if (result === 0) return false;
      if (betValue === '1-12') return result >= 1 && result <= 12;
      if (betValue === '13-24') return result >= 13 && result <= 24;
      if (betValue === '25-36') return result >= 25 && result <= 36;
      return false;
    }
    case 'column': {
      if (result === 0) return false;
      const col = ((result - 1) % 3) + 1;
      if (betValue === 'col1') return col === 1;
      if (betValue === 'col2') return col === 2;
      if (betValue === 'col3') return col === 3;
      return false;
    }
    default:
      return false;
  }
}

const PAYOUT_MULTIPLIERS: Record<RouletteBetType, number> = {
  straight: 36,
  split: 18,
  red: 2,
  black: 2,
  odd: 2,
  even: 2,
  dozen: 3,
  column: 3,
};

export function calculatePayout(betType: RouletteBetType, amount: number): number {
  return amount * PAYOUT_MULTIPLIERS[betType];
}

// Valid adjacent split pairs on a standard roulette layout
const VALID_SPLITS = new Set<string>();
function initSplits() {
  for (let i = 1; i <= 36; i++) {
    // Horizontal neighbors (same row)
    if (i % 3 !== 0) VALID_SPLITS.add(`${i},${i + 1}`);
    // Vertical neighbors (next row)
    if (i + 3 <= 36) VALID_SPLITS.add(`${i},${i + 3}`);
  }
  // Include 0 splits with 1, 2, 3
  VALID_SPLITS.add('0,1');
  VALID_SPLITS.add('0,2');
  VALID_SPLITS.add('0,3');
}
initSplits();

export interface BetValidation {
  valid: boolean;
  error?: string;
}

export function validateBet(betType: RouletteBetType, betValue: string, amount: number): BetValidation {
  if (!Number.isInteger(amount) || amount < CASINO_CONSTANTS.ROULETTE_MIN_BET) {
    return { valid: false, error: `Minimum bet is ${CASINO_CONSTANTS.ROULETTE_MIN_BET}` };
  }
  if (amount > CASINO_CONSTANTS.ROULETTE_MAX_BET) {
    return { valid: false, error: `Maximum bet is ${CASINO_CONSTANTS.ROULETTE_MAX_BET}` };
  }

  switch (betType) {
    case 'straight': {
      const n = parseInt(betValue, 10);
      if (isNaN(n) || n < 0 || n > 36) return { valid: false, error: 'Number must be 0-36' };
      return { valid: true };
    }
    case 'split': {
      const parts = betValue.split(',').map(Number);
      if (parts.length !== 2 || parts.some(isNaN)) return { valid: false, error: 'Split requires two numbers' };
      const key = parts[0] < parts[1] ? `${parts[0]},${parts[1]}` : `${parts[1]},${parts[0]}`;
      if (!VALID_SPLITS.has(key)) return { valid: false, error: 'Numbers must be adjacent' };
      return { valid: true };
    }
    case 'red':
    case 'black':
    case 'odd':
    case 'even':
      return { valid: true };
    case 'dozen':
      if (!['1-12', '13-24', '25-36'].includes(betValue)) return { valid: false, error: 'Invalid dozen' };
      return { valid: true };
    case 'column':
      if (!['col1', 'col2', 'col3'].includes(betValue)) return { valid: false, error: 'Invalid column' };
      return { valid: true };
    default:
      return { valid: false, error: 'Invalid bet type' };
  }
}

export function generateSpinResult(): number {
  return Math.floor(Math.random() * CASINO_CONSTANTS.ROULETTE_SLOTS);
}
```

**Step 4: Export from game-engine index**

Add to `packages/game-engine/src/index.ts`:
```ts
export { isWinningBet, calculatePayout, validateBet, getNumberColor, generateSpinResult } from './casino/roulette';
```

**Step 5: Run tests to verify they pass**

```bash
npm run test:engine -- --run src/casino/roulette.test.ts
```
Expected: all PASS

**Step 6: Commit**

```bash
git add packages/game-engine/src/casino/ packages/game-engine/src/index.ts
git commit -m "feat: add roulette pure functions with tests"
```

---

### Task 4: API — Gold exchange service and route

**Files:**
- Create: `apps/api/src/services/casinoService.ts`
- Create: `apps/api/src/routes/casino.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create casino service — gold exchange**

```ts
// apps/api/src/services/casinoService.ts
import { prisma } from '@adventure/database';
import { CASINO_CONSTANTS } from '@adventure/shared';
import { spendPlayerTurnsTx } from './turnBankService';
import { AppError } from '../middleware/errorHandler';

export interface GoldExchangeResult {
  turnsSpent: number;
  goldGained: number;
  goldBalance: number;
  turnsRemaining: number;
}

export async function exchangeTurnsForGold(
  playerId: string,
  turns: number,
): Promise<GoldExchangeResult> {
  if (!Number.isInteger(turns) || turns <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_AMOUNT');
  }

  const goldGained = turns * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE;

  return prisma.$transaction(async (tx) => {
    const turnResult = await spendPlayerTurnsTx(tx, playerId, turns);

    const player = await (tx as any).player.update({
      where: { id: playerId },
      data: { gold: { increment: goldGained } },
      select: { gold: true },
    });

    return {
      turnsSpent: turns,
      goldGained,
      goldBalance: player.gold,
      turnsRemaining: turnResult.currentTurns,
    };
  });
}
```

**Step 2: Create casino route — exchange endpoint**

```ts
// apps/api/src/routes/casino.ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { exchangeTurnsForGold } from '../services/casinoService';
import { prisma } from '@adventure/database';

export const casinoRouter = Router();
casinoRouter.use(authenticate);

const exchangeSchema = z.object({
  turns: z.number().int().positive(),
});

casinoRouter.post('/exchange', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { turns } = exchangeSchema.parse(req.body);

  // Town gate
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) throw new AppError(400, 'Not in a zone', 'NO_ZONE');

  const zone = await prisma.zone.findUnique({ where: { id: player.currentZoneId } });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(403, 'Must be in a town to exchange gold', 'NOT_IN_TOWN');
  }

  const result = await exchangeTurnsForGold(playerId, turns);
  res.json(result);
}));
```

**Step 3: Register route in index.ts**

Add import and `app.use` to `apps/api/src/index.ts`:
```ts
import { casinoRouter } from './routes/casino';
// ...
app.use('/api/v1/casino', casinoRouter);
```

**Step 4: Wire gold into player GET response**

In `apps/api/src/routes/player.ts`, add `gold: true` to the `select` object in the GET `/` handler.

**Step 5: Build and verify**

```bash
npm run build:api
```

**Step 6: Commit**

```bash
git add apps/api/src/services/casinoService.ts apps/api/src/routes/casino.ts apps/api/src/index.ts apps/api/src/routes/player.ts
git commit -m "feat: add gold exchange service and route"
```

---

### Task 5: API — Roulette service (round management, betting, resolution)

**Files:**
- Modify: `apps/api/src/services/casinoService.ts`

**Step 1: Add Redis round state management**

Add to `casinoService.ts`:

```ts
import { redis } from '../redis';
import {
  isWinningBet,
  calculatePayout,
  validateBet,
  generateSpinResult,
} from '@adventure/game-engine';
import type { RouletteBetType, RouletteRoundState, RoulettePublicBet } from '@adventure/shared';

const ROUND_KEY = 'roulette:current_round';

interface ActiveRound {
  roundId: string;
  startedAt: number; // epoch ms
}

async function getOrCreateRound(): Promise<{ roundId: string; startedAt: number; isNew: boolean }> {
  const existing = await redis.get(ROUND_KEY);
  if (existing) {
    const parsed: ActiveRound = JSON.parse(existing);
    const elapsed = Date.now() - parsed.startedAt;
    if (elapsed < CASINO_CONSTANTS.ROUND_DURATION_SECONDS * 1000) {
      return { ...parsed, isNew: false };
    }
    // Round expired — resolve it before creating new one
    await resolveRound(parsed.roundId);
  }

  // Create new round
  const round = await prisma.rouletteRound.create({ data: {} });
  const active: ActiveRound = { roundId: round.id, startedAt: Date.now() };
  await redis.set(
    ROUND_KEY,
    JSON.stringify(active),
    'EX',
    CASINO_CONSTANTS.ROUND_DURATION_SECONDS + 10, // buffer
  );
  return { ...active, isNew: true };
}

async function resolveRound(roundId: string): Promise<number> {
  const result = generateSpinResult();

  const bets = await prisma.rouletteBet.findMany({ where: { roundId } });

  const updates = bets.map((bet) => {
    const won = isWinningBet(bet.betType as RouletteBetType, bet.betValue, result);
    const payout = won ? calculatePayout(bet.betType as RouletteBetType, bet.amount) : 0;
    return { id: bet.id, playerId: bet.playerId, payout };
  });

  await prisma.$transaction(async (tx) => {
    // Update round
    await (tx as any).rouletteRound.update({
      where: { id: roundId },
      data: { result, resolvedAt: new Date() },
    });

    // Update each bet payout
    for (const u of updates) {
      await (tx as any).rouletteBet.update({
        where: { id: u.id },
        data: { payout: u.payout },
      });
    }

    // Credit winnings to players
    const winnerTotals = new Map<string, number>();
    for (const u of updates) {
      if (u.payout > 0) {
        winnerTotals.set(u.playerId, (winnerTotals.get(u.playerId) ?? 0) + u.payout);
      }
    }
    for (const [playerId, total] of winnerTotals) {
      await (tx as any).player.update({
        where: { id: playerId },
        data: { gold: { increment: total } },
      });
    }
  });

  await redis.del(ROUND_KEY);
  return result;
}

export async function getCurrentRound(): Promise<RouletteRoundState> {
  const existing = await redis.get(ROUND_KEY);
  if (!existing) {
    return { roundId: '', phase: 'idle', result: null, startedAt: '', timeRemainingMs: 0, bets: [] };
  }

  const parsed: ActiveRound = JSON.parse(existing);
  const elapsed = Date.now() - parsed.startedAt;
  const totalMs = CASINO_CONSTANTS.ROUND_DURATION_SECONDS * 1000;
  const bettingMs = CASINO_CONSTANTS.BETTING_WINDOW_SECONDS * 1000;

  if (elapsed >= totalMs) {
    // Round just expired — resolve it
    const result = await resolveRound(parsed.roundId);
    return {
      roundId: parsed.roundId,
      phase: 'result',
      result,
      startedAt: new Date(parsed.startedAt).toISOString(),
      timeRemainingMs: 0,
      bets: await getPublicBets(parsed.roundId),
    };
  }

  const phase = elapsed < bettingMs ? 'betting' : 'spinning';
  const timeRemainingMs = totalMs - elapsed;

  return {
    roundId: parsed.roundId,
    phase,
    result: null,
    startedAt: new Date(parsed.startedAt).toISOString(),
    timeRemainingMs,
    bets: await getPublicBets(parsed.roundId),
  };
}

async function getPublicBets(roundId: string): Promise<RoulettePublicBet[]> {
  const bets = await prisma.rouletteBet.findMany({
    where: { roundId },
    include: { player: { select: { username: true } } },
  });
  return bets.map((b) => ({
    playerName: (b as any).player.username,
    betType: b.betType as RouletteBetType,
    betValue: b.betValue,
    amount: b.amount,
  }));
}

export async function placeBet(
  playerId: string,
  betType: RouletteBetType,
  betValue: string,
  amount: number,
): Promise<{ roundId: string; goldRemaining: number }> {
  const validation = validateBet(betType, betValue, amount);
  if (!validation.valid) {
    throw new AppError(400, validation.error!, 'INVALID_BET');
  }

  // Get or create a round (lazy start)
  const { roundId, startedAt } = await getOrCreateRound();

  // Check betting window
  const elapsed = Date.now() - startedAt;
  if (elapsed >= CASINO_CONSTANTS.BETTING_WINDOW_SECONDS * 1000) {
    throw new AppError(400, 'Betting window closed', 'BETTING_CLOSED');
  }

  // Deduct gold and place bet in transaction
  return prisma.$transaction(async (tx) => {
    const player = await (tx as any).player.findUnique({
      where: { id: playerId },
      select: { gold: true },
    });
    if (!player || player.gold < amount) {
      throw new AppError(400, 'Insufficient gold', 'INSUFFICIENT_GOLD');
    }

    await (tx as any).player.update({
      where: { id: playerId },
      data: { gold: { decrement: amount } },
    });

    await (tx as any).rouletteBet.create({
      data: { roundId, playerId, betType, betValue, amount },
    });

    return { roundId, goldRemaining: player.gold - amount };
  });
}

export async function getRouletteHistory(): Promise<{ spinNumber: number; result: number; resolvedAt: string }[]> {
  const rounds = await prisma.rouletteRound.findMany({
    where: { result: { not: null } },
    orderBy: { resolvedAt: 'desc' },
    take: CASINO_CONSTANTS.ROULETTE_HISTORY_LENGTH,
    select: { spinNumber: true, result: true, resolvedAt: true },
  });
  return rounds.map((r) => ({
    spinNumber: r.spinNumber,
    result: r.result!,
    resolvedAt: r.resolvedAt!.toISOString(),
  }));
}
```

**Step 2: Build and verify**

```bash
npm run build:api
```

**Step 3: Commit**

```bash
git add apps/api/src/services/casinoService.ts
git commit -m "feat: add roulette round management and betting service"
```

---

### Task 6: API — Roulette routes

**Files:**
- Modify: `apps/api/src/routes/casino.ts`

**Step 1: Add roulette endpoints to casino router**

Add to `apps/api/src/routes/casino.ts`:

```ts
import { getCurrentRound, placeBet, getRouletteHistory } from '../services/casinoService';
import type { RouletteBetType } from '@adventure/shared';

const betSchema = z.object({
  betType: z.enum(['straight', 'split', 'red', 'black', 'odd', 'even', 'dozen', 'column']),
  betValue: z.string(),
  amount: z.number().int().positive(),
});

casinoRouter.get('/roulette/round', asyncHandler(async (req, res) => {
  const round = await getCurrentRound();
  res.json(round);
}));

casinoRouter.post('/roulette/bet', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { betType, betValue, amount } = betSchema.parse(req.body);

  // Town gate
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) throw new AppError(400, 'Not in a zone', 'NO_ZONE');

  const zone = await prisma.zone.findUnique({ where: { id: player.currentZoneId } });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(403, 'Must be in a town to gamble', 'NOT_IN_TOWN');
  }

  const result = await placeBet(playerId, betType as RouletteBetType, betValue, amount);
  res.json(result);
}));

casinoRouter.get('/roulette/history', asyncHandler(async (_req, res) => {
  const history = await getRouletteHistory();
  res.json({ history });
}));
```

**Step 2: Build and verify**

```bash
npm run build:api
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/casino.ts
git commit -m "feat: add roulette round, bet, and history routes"
```

---

### Task 7: API — Training grounds service and route

**Files:**
- Create: `apps/api/src/services/trainingService.ts`
- Create: `apps/api/src/routes/training.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create training service**

```ts
// apps/api/src/services/trainingService.ts
import { prisma } from '@adventure/database';
import { redis } from '../redis';
import { runCombat, buildPlayerCombatStats, mobToCombatantStats, applyMobPrefix } from '@adventure/game-engine';
import { TRAINING_CONSTANTS } from '@adventure/shared';
import type { Combatant, CombatResult } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { getPlayerEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';

function cooldownKey(playerId: string): string {
  return `training:cooldown:${playerId}`;
}

export async function getCooldownRemaining(playerId: string): Promise<number> {
  const ttl = await redis.ttl(cooldownKey(playerId));
  return ttl > 0 ? ttl : 0;
}

export async function simulateFight(
  playerId: string,
  mobTemplateId: string,
  prefix: string | null,
): Promise<{ combat: CombatResult; cooldownSeconds: number }> {
  // Check cooldown
  const remaining = await getCooldownRemaining(playerId);
  if (remaining > 0) {
    throw new AppError(429, `Training cooldown: ${remaining}s remaining`, 'TRAINING_COOLDOWN');
  }

  // Verify mob is in player's bestiary
  const bestiaryEntry = await prisma.playerBestiary.findUnique({
    where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
  });
  if (!bestiaryEntry) {
    throw new AppError(400, 'You have not encountered this mob', 'MOB_NOT_IN_BESTIARY');
  }

  // If prefix specified, verify player has seen it
  if (prefix) {
    const prefixEntry = await prisma.playerBestiaryPrefix.findUnique({
      where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId, prefix } },
    });
    if (!prefixEntry) {
      throw new AppError(400, 'You have not encountered this prefix variant', 'PREFIX_NOT_IN_BESTIARY');
    }
  }

  // Load mob template
  const mob = await prisma.mobTemplate.findUnique({ where: { id: mobTemplateId } });
  if (!mob) throw new AppError(404, 'Mob not found', 'NOT_FOUND');

  // Apply prefix if specified
  const finalMob = prefix ? applyMobPrefix(mob as any, prefix) : mob;

  // Build player combat stats
  const [hpState, progression, equipmentStats] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: { currentHp: true },
    }).then(async (p) => {
      if (!p) throw new AppError(404, 'Player not found', 'NOT_FOUND');
      const { maxHp } = await getPlayerProgressionState(playerId);
      return { currentHp: p.currentHp, maxHp };
    }),
    getPlayerProgressionState(playerId),
    getPlayerEquipmentStats(playerId),
  ]);

  const attackSkill = 'melee'; // Default for training
  const attackLevel = progression.skills.find((s: any) => s.skillType === attackSkill)?.level ?? 1;

  const playerStats = buildPlayerCombatStats(
    hpState.currentHp,
    hpState.maxHp,
    { attackStyle: attackSkill, skillLevel: attackLevel, attributes: progression.attributes },
    equipmentStats,
  );

  const combatantA: Combatant = { id: playerId, name: 'You', stats: playerStats };
  const combatantB: Combatant = {
    id: mob.id,
    name: prefix ? `${prefix} ${mob.name}` : mob.name,
    stats: mobToCombatantStats(finalMob as any),
  };

  const combatResult = runCombat(combatantA, combatantB);

  // Set cooldown
  await redis.set(cooldownKey(playerId), '1', 'EX', TRAINING_CONSTANTS.COOLDOWN_SECONDS);

  return { combat: combatResult, cooldownSeconds: TRAINING_CONSTANTS.COOLDOWN_SECONDS };
}
```

**Step 2: Create training route**

```ts
// apps/api/src/routes/training.ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { simulateFight, getCooldownRemaining } from '../services/trainingService';
import { prisma } from '@adventure/database';

export const trainingRouter = Router();
trainingRouter.use(authenticate);

const fightSchema = z.object({
  mobTemplateId: z.string().uuid(),
  prefix: z.string().nullable().optional().default(null),
});

trainingRouter.post('/fight', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { mobTemplateId, prefix } = fightSchema.parse(req.body);

  // Town gate
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) throw new AppError(400, 'Not in a zone', 'NO_ZONE');

  const zone = await prisma.zone.findUnique({ where: { id: player.currentZoneId } });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(403, 'Must be in a town to use training grounds', 'NOT_IN_TOWN');
  }

  const result = await simulateFight(playerId, mobTemplateId, prefix);
  res.json(result);
}));

trainingRouter.get('/cooldown', asyncHandler(async (req, res) => {
  const remaining = await getCooldownRemaining(req.player!.playerId);
  res.json({ cooldownSeconds: remaining });
}));
```

**Step 3: Register route in index.ts**

Add to `apps/api/src/index.ts`:
```ts
import { trainingRouter } from './routes/training';
// ...
app.use('/api/v1/training', trainingRouter);
```

**Step 4: Build and verify**

```bash
npm run build:api
```

**Step 5: Commit**

```bash
git add apps/api/src/services/trainingService.ts apps/api/src/routes/training.ts apps/api/src/index.ts
git commit -m "feat: add training grounds service and route"
```

---

### Task 8: API — Wire gold into existing responses

**Files:**
- Modify: `apps/api/src/routes/player.ts` (already done in Task 4)
- Modify: `apps/api/src/utils/routeHelpers.ts` — replace `currentGold: 0` stubs
- Modify: any other files returning `currentGold: 0`

**Step 1: Update routeHelpers to read actual gold**

Find all `currentGold: 0` stubs and replace with actual player gold from DB. The `calculateFleeResult` call in `routeHelpers.ts` at line 172 passes `currentGold: 0` — update it to pass the player's actual gold balance.

Grep for all `currentGold: 0` across `apps/api/src/` and update each to fetch and pass real gold. This includes:
- `apps/api/src/utils/routeHelpers.ts:172`
- `apps/api/src/routes/zones.ts:432`
- `apps/api/src/services/bossEncounterService.ts:475`
- `apps/api/src/routes/exploration/start.ts:408`
- `apps/api/src/services/pvpService.ts:456`

For each, ensure the player's gold is fetched and passed instead of 0.

**Step 2: Build and verify**

```bash
npm run build:api
```

**Step 3: Run existing tests to check nothing breaks**

```bash
npm run test:api
```

**Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "feat: wire real gold into player responses and flee calculations"
```

---

### Task 9: Frontend — API client functions for casino and training

**Files:**
- Create: `apps/web/src/lib/api/casino.ts`
- Create: `apps/web/src/lib/api/training.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Step 1: Create casino API client**

```ts
// apps/web/src/lib/api/casino.ts
import { fetchApi } from './core';
import type {
  RouletteRoundState,
  RouletteBetType,
  RouletteHistoryEntry,
} from '@adventure/shared';

export interface GoldExchangeResponse {
  turnsSpent: number;
  goldGained: number;
  goldBalance: number;
  turnsRemaining: number;
}

export async function exchangeGold(turns: number) {
  return fetchApi<GoldExchangeResponse>('/api/v1/casino/exchange', {
    method: 'POST',
    body: JSON.stringify({ turns }),
  });
}

export async function getRouletteRound() {
  return fetchApi<RouletteRoundState>('/api/v1/casino/roulette/round');
}

export interface PlaceBetResponse {
  roundId: string;
  goldRemaining: number;
}

export async function placeRouletteBet(betType: RouletteBetType, betValue: string, amount: number) {
  return fetchApi<PlaceBetResponse>('/api/v1/casino/roulette/bet', {
    method: 'POST',
    body: JSON.stringify({ betType, betValue, amount }),
  });
}

export async function getRouletteHistory() {
  return fetchApi<{ history: RouletteHistoryEntry[] }>('/api/v1/casino/roulette/history');
}
```

**Step 2: Create training API client**

```ts
// apps/web/src/lib/api/training.ts
import { fetchApi } from './core';
import type { CombatResult } from '@adventure/shared';

export interface TrainingFightResponse {
  combat: CombatResult;
  cooldownSeconds: number;
}

export async function startTrainingFight(mobTemplateId: string, prefix: string | null) {
  return fetchApi<TrainingFightResponse>('/api/v1/training/fight', {
    method: 'POST',
    body: JSON.stringify({ mobTemplateId, prefix }),
  });
}

export interface TrainingCooldownResponse {
  cooldownSeconds: number;
}

export async function getTrainingCooldown() {
  return fetchApi<TrainingCooldownResponse>('/api/v1/training/cooldown');
}
```

**Step 3: Export from index.ts**

Add to `apps/web/src/lib/api/index.ts`:
```ts
export { exchangeGold, getRouletteRound, placeRouletteBet, getRouletteHistory } from './casino';
export type { GoldExchangeResponse, PlaceBetResponse } from './casino';
export { startTrainingFight, getTrainingCooldown } from './training';
export type { TrainingFightResponse, TrainingCooldownResponse } from './training';
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/api/
git commit -m "feat: add casino and training API client functions"
```

---

### Task 10: Frontend — Casino screen

**Files:**
- Create: `apps/web/src/components/screens/Casino.tsx`

This is the largest frontend task. Build the casino screen with:
- Gold exchange section (turn-to-gold converter)
- Roulette table with bet placement
- Animated roulette wheel (CSS/canvas animation, pixelated style)
- Live bet display showing all players' bets
- Spin history (last 20 results)
- Polling for round state every 2-3 seconds during active rounds
- Pixelated tavern aesthetic using RPG CSS variables

**Key implementation details:**
- Props follow the same pattern as other screens: data + callbacks from `useGameController`
- Polling via `useEffect` + `setInterval` for round state
- Wheel animation triggered when phase transitions to 'spinning'
- Bet placement UI: grid of numbers + outside bets (red/black, odd/even, dozens, columns)
- Use `var(--rpg-gold)`, `var(--rpg-green-light)`, `var(--rpg-red)` for roulette colors
- Show countdown timer during betting phase

The screen component receives props:
```ts
interface CasinoProps {
  gold: number;
  turns: number;
  onExchangeGold: (turns: number) => Promise<void>;
  onPlaceBet: (betType: RouletteBetType, betValue: string, amount: number) => Promise<void>;
  isInTown: boolean;
}
```

**Step 1: Build the Casino component**

Implement the full component with roulette board, wheel animation, and tavern styling. Use `useEffect` polling for round state. This is a creative frontend task — reference `design-principles` or `frontend-design` skills for UI quality.

**Step 2: Commit**

```bash
git add apps/web/src/components/screens/Casino.tsx
git commit -m "feat: add casino screen with roulette and gold exchange"
```

---

### Task 11: Frontend — Training Grounds screen

**Files:**
- Create: `apps/web/src/components/screens/TrainingGrounds.tsx`

Build the training grounds screen with:
- Mob picker from bestiary data (dropdown or card grid)
- Prefix variant selector (only show seen prefixes)
- "Fight" button with cooldown timer
- Combat playback reusing existing combat playback components
- No rewards display (explicitly show "Training — No rewards")

Props pattern:
```ts
interface TrainingGroundsProps {
  bestiary: BestiaryEntry[];
  onStartFight: (mobTemplateId: string, prefix: string | null) => Promise<void>;
  combatResult: CombatResult | null;
  cooldownSeconds: number;
  isInTown: boolean;
}
```

**Step 1: Build the TrainingGrounds component**

Reuse combat playback components from `apps/web/src/components/combat/` or `apps/web/src/components/playback/`. Show mob selector from bestiary, prefix picker, and fight button with cooldown.

**Step 2: Commit**

```bash
git add apps/web/src/components/screens/TrainingGrounds.tsx
git commit -m "feat: add training grounds screen with mob selector and combat sim"
```

---

### Task 12: Frontend — Integrate into useGameController and navigation

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add screen types**

Add `'casino' | 'training'` to the `Screen` type union.

**Step 2: Add state and handlers to useGameController**

Add gold state tracking, casino handlers (exchange, bet), training handlers (fight, cooldown), and data loading for casino round state.

**Step 3: Add screen rendering in page.tsx**

Add `Casino` and `TrainingGrounds` to the screen rendering switch/conditional in `page.tsx`. Add navigation buttons for both — only visible when in a town zone.

**Step 4: Add navigation entries**

Add Casino and Training Grounds to the navigation menu/sidebar, gated to `isInTown` condition.

**Step 5: Build and verify**

```bash
npm run build:web
```

**Step 6: Commit**

```bash
git add apps/web/src/app/game/
git commit -m "feat: integrate casino and training screens into game navigation"
```

---

### Task 13: Testing — Service and engine tests

**Files:**
- Game engine tests already done in Task 3
- Create: `apps/api/src/services/casinoService.test.ts`
- Create: `apps/api/src/services/trainingService.test.ts`

**Step 1: Write casino service tests**

Test gold exchange (happy path, insufficient turns), bet placement (valid/invalid, insufficient gold, betting window closed), round resolution (payouts calculated correctly, gold credited).

**Step 2: Write training service tests**

Test simulated fight (happy path, mob not in bestiary, prefix not seen, cooldown enforcement).

**Step 3: Run all tests**

```bash
npm run test
```

**Step 4: Commit**

```bash
git add apps/api/src/services/casinoService.test.ts apps/api/src/services/trainingService.test.ts
git commit -m "test: add casino and training service tests"
```

---

### Task 14: Database seed — Add gold to seeded players

**Files:**
- Modify: `packages/database/prisma/seed.ts`

**Step 1: Add starting gold to seeded players**

Give seeded test players some starting gold (e.g., 500) so the casino is immediately testable.

**Step 2: Commit**

```bash
git add packages/database/prisma/seed.ts
git commit -m "feat: seed players with starting gold for casino testing"
```

---

### Task 15: Manual testing and polish

**Step 1: Start dev environment**

```bash
docker-compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

**Step 2: Test full flow**

1. Log in, travel to a town
2. Exchange turns for gold
3. Place bets on roulette, verify round lifecycle
4. Check spin history
5. Open training grounds, select a bestiary mob
6. Run a training fight, verify combat playback
7. Verify cooldown timer
8. Verify both features are blocked outside town
9. Verify gold shows in player HUD

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish casino and training grounds after manual testing"
```
