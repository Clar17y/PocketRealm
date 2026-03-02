# Casino Atmosphere Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dealer messages, bet chips, corner bets, session history, leaderboards, hot/cold numbers, and win animations to the casino.

**Architecture:** Server emits socket events (`casino:phase`, `casino:bet`, `casino:result`) to the `chat:casino` room on round lifecycle changes. The frontend listens and uses these events to inject dealer messages, display chips, track bet history, and trigger animations. Leaderboards use existing Redis ZSET infrastructure with SQL aggregation on `RouletteBet`.

**Tech Stack:** Socket.io, Prisma, Redis ZSET, Tailwind CSS animations

**Design doc:** `docs/plans/2026-03-02-casino-atmosphere-design.md`

---

### Task 1: Shared Types & Constants

Add corner bet type, socket event types, and `BIG_WIN_THRESHOLD` constant.

**Files:**
- Modify: `packages/shared/src/types/casino.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Add `'corner'` to `RouletteBetType`**

In `casino.types.ts`, add `| 'corner'` to the union (after `'column'`).

**Step 2: Add corner case to `getNumbersForBet`**

```ts
case 'corner': {
  const nums = betValue.split(',').map(Number);
  return new Set(nums);
}
```

**Step 3: Add socket event types**

Add to `casino.types.ts`:

```ts
export interface CasinoPhaseEvent {
  phase: 'betting' | 'spinning' | 'result';
  roundId: string;
  timeRemainingMs: number;
  result?: number;
  bets?: RoulettePublicBet[];
}

export interface CasinoBetEvent {
  playerName: string;
  playerId: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
}

export interface CasinoWinningBet {
  playerName: string;
  betType: RouletteBetType;
  amount: number;
  payout: number;
}

export interface CasinoResultEvent {
  result: number;
  color: 'red' | 'black' | 'green';
  winningBets: CasinoWinningBet[];
}
```

**Step 4: Add `BIG_WIN_THRESHOLD` to `CASINO_CONSTANTS`**

In `gameConstants.ts`, add to `CASINO_CONSTANTS`:

```ts
BIG_WIN_THRESHOLD: 500,  // Minimum payout for big win callout
```

**Step 5: Build shared package**

```bash
npm run build --workspace=packages/shared
```

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add corner bet type, casino socket events, BIG_WIN_THRESHOLD"
```

---

### Task 2: Corner Bet Game Engine (TDD)

Add corner bet validation, win checking, and payout to the pure game engine.

**Files:**
- Modify: `packages/game-engine/src/casino/roulette.ts`
- Modify: `packages/game-engine/src/casino/roulette.test.ts`

**Step 1: Write failing tests for corner bets**

Add test cases to `roulette.test.ts`:

```ts
// In isWinningBet tests:
it('corner: wins if result matches any of 4 numbers', () => {
  expect(isWinningBet('corner', '1,2,4,5', 1)).toBe(true);
  expect(isWinningBet('corner', '1,2,4,5', 5)).toBe(true);
  expect(isWinningBet('corner', '1,2,4,5', 3)).toBe(false);
});

// In calculatePayout tests:
it('corner pays 9:1', () => {
  expect(calculatePayout('corner', 10)).toBe(90);
});

// In validateBet tests:
it('validates corner bets with 4 adjacent numbers', () => {
  const valid = validateBet('corner', '1,2,4,5', 10);
  expect(valid.valid).toBe(true);
});
it('rejects non-adjacent corner bets', () => {
  const invalid = validateBet('corner', '1,2,3,4', 10);
  expect(invalid.valid).toBe(false);
});
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:engine -- --reporter=verbose 2>&1 | grep -A2 'corner'
```

**Step 3: Implement corner in `isWinningBet`**

Add case before `default`:

```ts
case 'corner': {
  const nums = betValue.split(',').map(Number);
  return nums.includes(result);
}
```

**Step 4: Implement corner in `calculatePayout`**

Add case:

```ts
case 'corner': return amount * 9;
```

**Step 5: Implement corner validation in `validateBet`**

Build valid corners set (similar to `VALID_SPLITS`):

```ts
const VALID_CORNERS = new Set<string>();
(function initCorners() {
  for (let row = 0; row < 11; row++) {
    const topLeft = row * 3 + 1;
    // Two corners per row: (topLeft, topLeft+1, topLeft+3, topLeft+4) and (topLeft+1, topLeft+2, topLeft+4, topLeft+5)
    VALID_CORNERS.add(`${topLeft},${topLeft + 1},${topLeft + 3},${topLeft + 4}`);
    VALID_CORNERS.add(`${topLeft + 1},${topLeft + 2},${topLeft + 4},${topLeft + 5}`);
  }
})();
```

Add case in `validateBet` switch:

```ts
case 'corner': {
  const nums = betValue.split(',').map(Number);
  if (nums.length !== 4 || nums.some(isNaN)) return { valid: false, error: 'Corner bet requires 4 numbers' };
  const sorted = [...nums].sort((a, b) => a - b).join(',');
  if (!VALID_CORNERS.has(sorted)) return { valid: false, error: 'Invalid corner position' };
  return { valid: true };
}
```

**Step 6: Run tests**

```bash
npm run test:engine
```

**Step 7: Commit**

```bash
git add packages/game-engine/
git commit -m "feat(game-engine): add corner bet type (9:1 payout)"
```

---

### Task 3: Backend Socket Events

Make `casinoService` emit socket events on phase changes, bet placement, and round resolution.

**Files:**
- Modify: `apps/api/src/services/casinoService.ts`
- Modify: `apps/api/src/routes/casino.ts` (add `'corner'` to Zod enum, pass `io` to service)
- Modify: `apps/api/src/services/casinoService.test.ts` (update mocks)

**Step 1: Import socket access in casinoService**

Add at top of `casinoService.ts`:

```ts
import { getIo } from '../socket';
import type { CasinoPhaseEvent, CasinoBetEvent, CasinoResultEvent } from '@adventure/shared';
```

**Step 2: Emit `casino:bet` after placing a bet**

At the end of `placeBet()`, after the transaction succeeds, add:

```ts
const io = getIo();
if (io) {
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { username: true } });
  const betEvent: CasinoBetEvent = {
    playerName: player?.username ?? 'Unknown',
    playerId,
    betType,
    betValue,
    amount,
  };
  io.to('chat:casino').emit('casino:bet', betEvent);
}
```

**Step 3: Emit `casino:result` after resolving a round**

At the end of `resolveRound()`, after the transaction, add:

```ts
const io = getIo();
if (io) {
  const winningBets = bets
    .filter((b) => {
      const won = isWinningBet(b.betType as RouletteBetType, b.betValue, result);
      return won;
    })
    .map((b) => ({
      playerName: b.player.username,
      betType: b.betType as RouletteBetType,
      amount: b.amount,
      payout: calculatePayout(b.betType as RouletteBetType, b.amount),
    }));

  const resultEvent: CasinoResultEvent = {
    result,
    color: getNumberColor(result),
    winningBets,
  };
  io.to('chat:casino').emit('casino:result', resultEvent);
}
```

Note: The `bets` query in `resolveRound` needs to include `player: { select: { username: true } }` in the Prisma include. Check the existing query and add `player` relation if not already included.

**Step 4: Emit `casino:phase` on phase transitions**

In `getCurrentRound()`, when phase is computed, emit to casino room if the phase just changed. Use a Redis key `roulette:last_phase` to track the last emitted phase and only emit on change:

```ts
const io = getIo();
if (io) {
  const lastPhase = await redis.get('roulette:last_phase');
  if (lastPhase !== phase) {
    await redis.set('roulette:last_phase', phase, 'EX', 70);
    const phaseEvent: CasinoPhaseEvent = {
      phase: phase as CasinoPhaseEvent['phase'],
      roundId,
      timeRemainingMs,
      result: phase === 'result' ? round.result ?? undefined : undefined,
      bets: phase === 'betting' ? await getPublicBets(roundId) : undefined,
    };
    io.to('chat:casino').emit('casino:phase', phaseEvent);
  }
}
```

**Step 5: Add `'corner'` to route Zod schema**

In `apps/api/src/routes/casino.ts`, update `betSchema`:

```ts
betType: z.enum(['straight', 'split', 'red', 'black', 'odd', 'even', 'dozen', 'column', 'corner']),
```

**Step 6: Update tests**

Update `casinoService.test.ts` to mock `getIo` returning `null` (so socket calls are no-ops in tests). Add mock at top:

```ts
vi.mock('../socket', () => ({ getIo: () => null }));
```

**Step 7: Build and typecheck API**

```bash
npm run build:api
npm run test:api
```

**Step 8: Commit**

```bash
git add apps/api/
git commit -m "feat(api): emit casino socket events on phase changes, bets, and results"
```

---

### Task 4: Frontend Casino Socket Hook

Create a `useCasinoSocket` hook that listens to `casino:*` events and provides state for chips, bet history, and dealer messages.

**Files:**
- Create: `apps/web/src/hooks/useCasinoSocket.ts`

**Step 1: Create the hook**

```ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type {
  CasinoPhaseEvent,
  CasinoBetEvent,
  CasinoResultEvent,
  RoulettePublicBet,
  RouletteBetType,
} from '@adventure/shared';
import { CASINO_CONSTANTS, getNumberColor } from '@adventure/shared';

export interface SessionBet {
  id: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
  roundId: string;
  payout: number | null; // null = pending
}

export interface DealerMessage {
  id: string;
  text: string;
  timestamp: number;
}

interface UseCasinoSocketReturn {
  liveBets: RoulettePublicBet[];
  sessionBets: SessionBet[];
  sessionProfit: number;
  dealerMessages: DealerMessage[];
  lastResult: CasinoResultEvent | null;
  phase: CasinoPhaseEvent['phase'] | null;
}

export function useCasinoSocket(
  active: boolean,
  playerId: string | null,
): UseCasinoSocketReturn {
  const [liveBets, setLiveBets] = useState<RoulettePublicBet[]>([]);
  const [sessionBets, setSessionBets] = useState<SessionBet[]>([]);
  const [dealerMessages, setDealerMessages] = useState<DealerMessage[]>([]);
  const [lastResult, setLastResult] = useState<CasinoResultEvent | null>(null);
  const [phase, setPhase] = useState<CasinoPhaseEvent['phase'] | null>(null);
  const roundIdRef = useRef<string | null>(null);

  const addDealerMsg = useCallback((text: string) => {
    setDealerMessages((prev) => [
      ...prev.slice(-49),
      { id: crypto.randomUUID(), text, timestamp: Date.now() },
    ]);
  }, []);

  const sessionProfit = sessionBets.reduce((sum, b) => {
    if (b.payout === null) return sum;
    return sum + (b.payout - b.amount);
  }, 0);

  useEffect(() => {
    if (!active) return;

    const socket = getSocket();

    const onPhase = (e: CasinoPhaseEvent) => {
      setPhase(e.phase);
      roundIdRef.current = e.roundId;

      if (e.phase === 'betting') {
        setLiveBets(e.bets ?? []);
        setLastResult(null);
        addDealerMsg(`Place your bets! ${CASINO_CONSTANTS.BETTING_WINDOW_SECONDS} seconds remaining.`);
      } else if (e.phase === 'spinning') {
        addDealerMsg('No more bets. The wheel is spinning...');
      }
    };

    const onBet = (e: CasinoBetEvent) => {
      setLiveBets((prev) => [...prev, {
        playerName: e.playerName,
        betType: e.betType,
        betValue: e.betValue,
        amount: e.amount,
      }]);
    };

    const onResult = (e: CasinoResultEvent) => {
      setLastResult(e);
      const color = getNumberColor(e.result);
      const colorLabel = color === 'green' ? 'Green' : color === 'red' ? 'Red' : 'Black';
      addDealerMsg(`The ball lands on ${e.result} ${colorLabel}!`);

      // Big winner callouts
      for (const wb of e.winningBets) {
        if (wb.payout >= CASINO_CONSTANTS.BIG_WIN_THRESHOLD) {
          addDealerMsg(`${wb.playerName} wins ${wb.payout.toLocaleString()}g on a ${wb.betType} bet!`);
        }
      }

      // Resolve session bets for this round
      setSessionBets((prev) =>
        prev.map((b) => {
          if (b.payout !== null || b.roundId !== roundIdRef.current) return b;
          const myWin = e.winningBets.find(
            (wb) => wb.betType === b.betType && wb.amount === b.amount,
          );
          return { ...b, payout: myWin ? myWin.payout : 0 };
        }),
      );
    };

    socket.on('casino:phase', onPhase);
    socket.on('casino:bet', onBet);
    socket.on('casino:result', onResult);

    return () => {
      socket.off('casino:phase', onPhase);
      socket.off('casino:bet', onBet);
      socket.off('casino:result', onResult);
    };
  }, [active, addDealerMsg]);

  // Track own bets placed via REST (called from Casino component)
  const trackBet = useCallback(
    (betType: RouletteBetType, betValue: string, amount: number, roundId: string) => {
      setSessionBets((prev) => [
        { id: crypto.randomUUID(), betType, betValue, amount, roundId, payout: null },
        ...prev,
      ].slice(0, 50));
    },
    [],
  );

  return { liveBets, sessionBets, sessionProfit, dealerMessages, lastResult, phase };
}
```

Note: `trackBet` needs to be exposed — add it to the return type and return object. Also add it to `UseCasinoSocketReturn`.

**Step 2: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useCasinoSocket.ts
git commit -m "feat(web): add useCasinoSocket hook for live casino events"
```

---

### Task 5: Dealer Messages in Casino Chat

Inject dealer messages from `useCasinoSocket` into the casino chat panel as system messages.

**Files:**
- Modify: `apps/web/src/hooks/useChat.ts`
- Modify: `apps/web/src/app/game/page.tsx` (wire up useCasinoSocket)

**Step 1: Accept dealer messages in useChat**

Add a function `injectDealerMessage(text: string)` to `useChat` that creates a synthetic `ChatMessageEvent` with `messageType: 'system'` and appends it to `casinoMessages`:

```ts
const injectCasinoSystemMessage = useCallback((text: string) => {
  const msg: ChatMessageEvent = {
    id: crypto.randomUUID(),
    channelType: 'casino',
    channelId: 'casino',
    playerId: 'dealer',
    username: 'Dealer',
    message: text,
    createdAt: new Date().toISOString(),
    messageType: 'system',
  };
  setCasinoMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
}, []);
```

Expose in `UseChatReturn` and the return object.

**Step 2: Wire up in page.tsx**

In the `useEffect` that tracks `activeScreen === 'casino'`, instantiate `useCasinoSocket`. When `dealerMessages` changes, call `chat.injectCasinoSystemMessage()` for new messages.

Alternatively, create the `useCasinoSocket` hook at the page level and pass `dealerMessages` to an effect that injects them:

```ts
const casinoSocket = useCasinoSocket(activeScreen === 'casino', player?.id ?? null);

// Inject dealer messages into casino chat
const lastDealerCountRef = useRef(0);
useEffect(() => {
  const msgs = casinoSocket.dealerMessages;
  if (msgs.length > lastDealerCountRef.current) {
    const newMsgs = msgs.slice(lastDealerCountRef.current);
    for (const msg of newMsgs) {
      chat.injectCasinoSystemMessage(msg.text);
    }
    lastDealerCountRef.current = msgs.length;
  }
}, [casinoSocket.dealerMessages, chat.injectCasinoSystemMessage]);
```

**Step 3: Pass `casinoSocket` data to Casino component**

Expand the `Casino` component props to receive `liveBets`, `sessionBets`, `sessionProfit`, `lastResult`, and `trackBet` from `useCasinoSocket`. Update the `renderScreen()` case.

**Step 4: Typecheck and test**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): inject dealer system messages into casino chat"
```

---

### Task 6: Bet Chips on Board

Render stacked chip indicators on board cells and outside bet areas.

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx`

**Step 1: Build a chip-position map from liveBets**

Create a `useMemo` that maps each bet to board positions. For `straight` bets, map to the number cell. For outside bets (`red`, `dozen`, `column`, etc.), map to their area identifier. For `corner` bets, map to the intersection key (e.g., `"corner:1,2,4,5"`).

```ts
interface ChipStack {
  myAmount: number;   // total gold from my bets
  myCount: number;    // number of my bets
  otherCount: number; // number of other players' bets
}

const chipMap = useMemo(() => {
  const map = new Map<string, ChipStack>();
  for (const bet of liveBets) {
    const key = bet.betType === 'straight' ? `num:${bet.betValue}`
      : bet.betType === 'corner' ? `corner:${bet.betValue}`
      : `${bet.betType}:${bet.betValue}`;
    const isMine = bet.playerName === playerName;
    const existing = map.get(key) ?? { myAmount: 0, myCount: 0, otherCount: 0 };
    if (isMine) {
      existing.myAmount += bet.amount;
      existing.myCount++;
    } else {
      existing.otherCount++;
    }
    map.set(key, existing);
  }
  return map;
}, [liveBets, playerName]);
```

**Step 2: Create a `ChipStack` component**

A small component that renders 1-4 vertically offset chip circles:

```tsx
function ChipStackIndicator({ myCount, otherCount, myAmount }: ChipStack) {
  const totalChips = Math.min(myCount + otherCount, 4);
  if (totalChips === 0) return null;
  const overflow = (myCount + otherCount) > 4 ? myCount + otherCount : 0;

  return (
    <div className="absolute bottom-0.5 right-0.5 flex flex-col-reverse items-center">
      {Array.from({ length: totalChips }, (_, i) => {
        const isMine = i < myCount;
        return (
          <div
            key={i}
            className={`w-3.5 h-2 rounded-full border text-[6px] font-bold flex items-center justify-center -mt-1 first:mt-0 ${
              isMine
                ? 'bg-[var(--rpg-gold)] border-[var(--rpg-gold)]/70 text-[var(--rpg-background)]'
                : 'bg-gray-400 border-gray-500 text-gray-800'
            }`}
          />
        );
      })}
      {overflow > 0 && (
        <span className="text-[7px] text-white font-bold">x{overflow}</span>
      )}
      {myAmount > 0 && (
        <span className="text-[7px] text-[var(--rpg-gold)] font-bold">{myAmount}g</span>
      )}
    </div>
  );
}
```

**Step 3: Add chips to number grid cells**

Wrap each number button in `relative` positioning and render `ChipStackIndicator` when the chip map has an entry for `num:${n}`:

```tsx
<button key={n} className="relative h-9 ...">
  {n}
  {chipMap.has(`num:${n}`) && (
    <ChipStackIndicator {...chipMap.get(`num:${n}`)!} />
  )}
</button>
```

**Step 4: Add chips to outside bet buttons**

Same pattern for column (`column:col1`), dozen (`dozen:1-12`), and even-money (`red:red`, etc.) buttons.

**Step 5: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/Casino.tsx
git commit -m "feat(web): render stacked bet chips on roulette board"
```

---

### Task 7: Corner Bet UI

Add invisible hit targets at grid intersections for placing corner bets.

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx`

**Step 1: Generate valid corner positions**

```ts
const CORNER_POSITIONS: { row: number; col: number; value: string; numbers: number[] }[] = [];
for (let row = 0; row < 11; row++) {
  const topLeft = row * 3 + 1;
  CORNER_POSITIONS.push({
    row, col: 0,
    value: `${topLeft},${topLeft + 1},${topLeft + 3},${topLeft + 4}`,
    numbers: [topLeft, topLeft + 1, topLeft + 3, topLeft + 4],
  });
  CORNER_POSITIONS.push({
    row, col: 1,
    value: `${topLeft + 1},${topLeft + 2},${topLeft + 4},${topLeft + 5}`,
    numbers: [topLeft + 1, topLeft + 2, topLeft + 4, topLeft + 5],
  });
}
```

**Step 2: Overlay corner hit targets on the grid**

Position the grid container as `relative`. Overlay small invisible hit targets at each intersection point. Each target is a `button` absolutely positioned at the corner where 4 cells meet:

```tsx
{CORNER_POSITIONS.map((corner) => (
  <button
    key={`corner-${corner.value}`}
    onClick={() => handleOutsideBet('corner', corner.value)}
    onMouseEnter={() => setHoveredBet({ type: 'corner', value: corner.value })}
    onMouseLeave={() => setHoveredBet(null)}
    className="absolute w-5 h-5 rounded-full z-10 hover:bg-[var(--rpg-gold)]/30 transition-colors"
    style={{
      left: `${((corner.col + 1) / 3) * 100}%`,
      top: `${((corner.row + 1) / 12) * 100}%`,
      transform: 'translate(-50%, -50%)',
    }}
    title={`Corner: ${corner.numbers.join(', ')}`}
  />
))}
```

**Step 3: Add corner to `formatBet` function**

```ts
case 'corner': return `Corner ${value}`;
```

**Step 4: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add corner bet hit targets on roulette grid"
```

---

### Task 8: Session Bet History

Add collapsible "My Bets" section below the roulette board.

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx`

**Step 1: Add session bet history section**

Below the bet controls in Casino.tsx, add:

```tsx
{/* Session Bet History */}
{sessionBets.length > 0 && (
  <PixelCard>
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold text-[var(--rpg-text-primary)] text-sm">
        My Bets
      </h3>
      <span className={`font-mono text-sm font-bold ${
        sessionProfit >= 0 ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'
      }`}>
        {sessionProfit >= 0 ? '+' : ''}{sessionProfit.toLocaleString()}g
      </span>
    </div>
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {sessionBets.map((bet) => (
        <div key={bet.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--rpg-background)]">
          <span className="text-[var(--rpg-text-secondary)]">
            {formatBet(bet.betType, bet.betValue)}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[var(--rpg-text-secondary)] font-mono">{bet.amount}g</span>
            {bet.payout === null ? (
              <span className="text-[var(--rpg-text-secondary)] italic">pending...</span>
            ) : bet.payout > 0 ? (
              <span className="text-[var(--rpg-green-light)] font-mono font-bold">
                +{(bet.payout - bet.amount).toLocaleString()}g
              </span>
            ) : (
              <span className="text-[var(--rpg-red)] font-mono font-bold">
                -{bet.amount.toLocaleString()}g
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  </PixelCard>
)}
```

**Step 2: Track bets on placement**

In the `handlePlaceBet` function, after a successful bet, call `trackBet()`:

```ts
await onPlaceBet(selectedBetType, selectedBetValue, betAmount);
trackBet(selectedBetType, selectedBetValue, betAmount, roundState?.roundId ?? '');
```

Ensure `trackBet` is passed as a prop from `useCasinoSocket`.

**Step 3: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add session bet history with profit/loss tracking"
```

---

### Task 9: Casino Leaderboards

Add `casino_profit` and `casino_wagered` categories to the leaderboard system.

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts`

**Step 1: Add category definitions**

Add to the `ALL_CATEGORIES` array (after guild categories):

```ts
{ slug: 'casino_profit', label: 'Casino Profit', group: 'Casino' },
{ slug: 'casino_wagered', label: 'Total Wagered', group: 'Casino' },
```

**Step 2: Add `refreshCasino()` function**

Follow the pattern of `refreshCombat()`:

```ts
async function refreshCasino(): Promise<void> {
  const rows = await prisma.$queryRaw<{ playerId: string; totalWagered: number; totalPayout: number }[]>`
    SELECT
      rb.player_id AS "playerId",
      SUM(rb.amount)::int AS "totalWagered",
      COALESCE(SUM(rb.payout), 0)::int AS "totalPayout"
    FROM roulette_bets rb
    WHERE rb.payout IS NOT NULL
    GROUP BY rb.player_id
  `;

  if (rows.length === 0) return;

  const playerIds = rows.map((r) => r.playerId);
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, username: true, characterLevel: true, isBot: true, isAdmin: true, activeTitle: true },
  });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const buildRows = (scoreFn: (r: typeof rows[0]) => number) =>
    rows.map((r) => {
      const p = playerMap.get(r.playerId);
      const titleDef = p?.activeTitle ? ACHIEVEMENTS_BY_ID.get(p.activeTitle) : null;
      return {
        playerId: r.playerId,
        score: scoreFn(r),
        username: p?.username ?? 'Unknown',
        characterLevel: p?.characterLevel ?? 1,
        isBot: p?.isBot ?? false,
        isAdmin: p?.isAdmin ?? false,
        title: titleDef?.titleReward,
        titleTier: titleDef?.tier,
      };
    });

  await writeToZset('casino_profit', buildRows((r) => r.totalPayout - r.totalWagered));
  await writeToZset('casino_wagered', buildRows((r) => r.totalWagered));
}
```

**Step 3: Add to `refreshAllLeaderboards()`**

Add `refreshCasino()` call in the master refresh function, following the same try/catch pattern as other refresh calls.

**Step 4: Build and test API**

```bash
npm run build:api
npm run test:api
```

**Step 5: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts
git commit -m "feat(api): add casino profit and wagered leaderboard categories"
```

---

### Task 10: Hot/Cold Numbers

Show heat indicators on the roulette board based on recent spin history.

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx`

**Step 1: Add toggle state**

```ts
const [showHeatMap, setShowHeatMap] = useState(false);
```

**Step 2: Compute hot/cold from history**

```ts
const heatMap = useMemo(() => {
  if (!showHeatMap) return null;
  const counts = new Map<number, number>();
  for (const entry of history) {
    counts.set(entry.result, (counts.get(entry.result) ?? 0) + 1);
  }
  return counts;
}, [history, showHeatMap]);
```

**Step 3: Add toggle button near spin history header**

A small button: "Hot/Cold" that toggles `showHeatMap`.

**Step 4: Apply visual indicators to number cells**

In the number grid button, add conditional classes based on `heatMap`:

```ts
const heat = heatMap?.get(n);
const heatClass = heatMap
  ? heat === undefined || heat === 0
    ? 'ring-1 ring-blue-400/40 ring-inset'  // cold
    : heat >= 2
      ? 'ring-1 ring-orange-400/50 ring-inset' // hot
      : '' // neutral (1 hit)
  : '';
```

**Step 5: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/Casino.tsx
git commit -m "feat(web): add hot/cold number heat map overlay"
```

---

### Task 11: Win Animation

Add gold coin shower / confetti on winning bets.

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx`
- Modify: `apps/web/src/app/globals.css` (add keyframes)

**Step 1: Add CSS keyframes for coin rain**

In `globals.css`:

```css
@keyframes coin-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}

@keyframes gold-shimmer {
  0% { opacity: 0; }
  20% { opacity: 0.6; }
  100% { opacity: 0; }
}
```

**Step 2: Create `WinCelebration` component**

A component that renders falling gold coins when `lastResult` contains a win for the current player:

```tsx
function WinCelebration({ payout, isBigWin }: { payout: number; isBigWin: boolean }) {
  const coinCount = isBigWin ? 20 : 8;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Gold shimmer overlay */}
      <div className="absolute inset-0 bg-[var(--rpg-gold)]/10" style={{ animation: 'gold-shimmer 1.5s ease-out forwards' }} />
      {/* Falling coins */}
      {Array.from({ length: coinCount }, (_, i) => (
        <div
          key={i}
          className="absolute text-lg"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 0.8}s`,
            animation: `coin-fall ${1.5 + Math.random()}s ease-in forwards`,
          }}
        >
          🪙
        </div>
      ))}
      {/* Payout text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-2xl font-bold text-[var(--rpg-gold)] animate-bounce">
          +{payout.toLocaleString()}g
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Track win state and render**

In the Casino component, compute whether the player won this round:

```ts
const [winAnimation, setWinAnimation] = useState<{ payout: number; isBigWin: boolean } | null>(null);

useEffect(() => {
  if (!lastResult) return;
  const myWinnings = sessionBets
    .filter((b) => b.payout !== null && b.payout > 0 && b.roundId === /* current roundId */)
    .reduce((sum, b) => sum + (b.payout ?? 0), 0);
  if (myWinnings > 0) {
    setWinAnimation({ payout: myWinnings, isBigWin: myWinnings >= CASINO_CONSTANTS.BIG_WIN_THRESHOLD });
    setTimeout(() => setWinAnimation(null), 2500);
  }
}, [lastResult]);
```

Render at the top of the component return:

```tsx
{winAnimation && <WinCelebration {...winAnimation} />}
```

**Step 4: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add win celebration animation with coin shower"
```

---

### Task 12: Final Integration & Polish

Wire everything together, remove polling fallback for socket-connected clients, update the `Casino` component props.

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Update Casino props**

Add to `CasinoProps`:

```ts
liveBets: RoulettePublicBet[];
sessionBets: SessionBet[];
sessionProfit: number;
lastResult: CasinoResultEvent | null;
trackBet: (betType: RouletteBetType, betValue: string, amount: number, roundId: string) => void;
playerName: string | null;
```

**Step 2: Replace bets from poll with socket liveBets**

Use `liveBets` from socket instead of `roundState.bets` for the chip display and live bets list. Keep the poll as fallback — if `liveBets` is empty but `roundState.bets` has data, use `roundState.bets`.

**Step 3: Update page.tsx renderScreen**

Pass all `casinoSocket.*` props to the Casino component.

**Step 4: Full typecheck + build**

```bash
npm run build --workspace=packages/shared
npm run build:api
npx tsc --noEmit -p apps/web/tsconfig.json
npm run test
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: integrate casino atmosphere — chips, history, hot/cold, animations"
```
