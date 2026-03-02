# Casino Atmosphere — Design Document

## Problem
The casino roulette experience is functional but lifeless. No social feedback, no visual excitement, no sense of other players at the table. Players place bets into a void and see a number appear.

## Goal
Make the casino feel like a casino — dealer callouts, chips piling up on the board, win celebrations, leaderboards, and a sense of shared experience.

## Features

### 1. Casino Socket Events (Foundation)

Server broadcasts round lifecycle events to all sockets in the `chat:casino` room. Replaces 3s polling for casino players. REST poll stays as reconnection fallback.

| Event | When | Payload |
|---|---|---|
| `casino:phase` | Phase changes | `{ phase, timeRemainingMs, result?, bets? }` |
| `casino:bet` | Any player places a bet | `{ playerName, betType, betValue, amount, playerId }` |
| `casino:result` | Round resolves | `{ result, color, winningBets: [{ playerName, betType, amount, payout }] }` |

### 2. Dealer System Messages

Client-side injections into casino chat from socket events. Not persisted to DB.

| Trigger | Message |
|---|---|
| Betting opens | *"Place your bets! 50 seconds remaining."* |
| Betting closes | *"No more bets. The wheel is spinning..."* |
| Result | *"The ball lands on **14 Red**!"* |
| Big win (payout >= `BIG_WIN_THRESHOLD`) | *"PlayerName wins 3,600g on a straight bet!"* |

Uses existing `system` message type styling (italic, gold, icon). `BIG_WIN_THRESHOLD` added to `CASINO_CONSTANTS` as a tunable game constant.

### 3. Bet Chips on the Board

Visual chip indicators on board cells showing where bets are placed.

- **Your bets:** Gold chip stack with amount
- **Others' bets:** Silver/grey chip stack
- Chips physically stack (offset vertically, 2-3px per layer) up to 3-4 layers; overflow shows count badge (e.g., "x7") on top chip
- Same cell can have both gold and silver stacks side by side
- Outside bets (red, dozen, column) get chips too
- Corner bets render at the 4-cell intersection
- Chips clear when new round starts

Data source: `roundState.bets` on join + incoming `casino:bet` socket events.

### 4. Corner Bets

New bet type: 4 adjacent numbers, **9:1 payout**.

- `RouletteBetType` gains `'corner'`
- Bet value format: `"1,2,4,5"` (four numbers sorted ascending, comma-separated)
- 22 valid corner positions (11 rows x 2 intersections)
- UI: invisible hit targets at grid intersections, highlighted on hover
- Game-engine: add to `validateBet`, `isWinningBet`, `calculatePayout`
- Shared: add to `getNumbersForBet` for hover preview

### 5. Session Bet History

Collapsible "My Bets" section below the roulette board.

- Accumulated client-side from `casino:bet` (own bets) + `casino:result` (fills in payout)
- Per entry: bet description, amount wagered, result (+Xg green / -Xg red), pending state
- Newest at top, capped at ~50 entries, scrollable
- Running session total at top: "Session: +1,250g" or "Session: -400g", color-coded
- Resets when leaving casino

### 6. Casino Leaderboards

Two new categories in existing leaderboard system:

| Category | Metric | SQL |
|---|---|---|
| `casino_profit` | `SUM(payout) - SUM(amount)` | Net profit (can go negative) |
| `casino_wagered` | `SUM(amount)` | Total volume wagered |

Uses existing Redis-cached leaderboard infrastructure. New entries in Rankings category dropdown.

### 7. Hot/Cold Numbers

Client-side computation from existing spin history (last 20 results).

- **Hot** (2+ appearances): subtle warm glow or flame icon in cell corner
- **Cold** (0 appearances): subtle blue tint or snowflake icon
- **Neutral** (1 appearance): no indicator
- Toggle-able via small button to avoid clutter

No backend changes. Pure visual flavor.

### 8. Win Animation

Client-side CSS animation triggered by `casino:result` when player has winning bets.

- **Regular win** (even-money, dozen, column): Gold shimmer + number pulse
- **Big win** (payout >= `BIG_WIN_THRESHOLD`): Gold coin shower / confetti, ~2 seconds
- **Straight hit** (36:1): Larger, more dramatic version

## New Game Constants

```
CASINO_CONSTANTS.BIG_WIN_THRESHOLD  — minimum payout to trigger big win callout + animation
```

## Data Flow Summary

```
Server resolves round
  → emits casino:phase (spinning)
  → emits casino:result { result, winningBets }
      → Client: injects dealer message into casino chat
      → Client: updates bet history with +/- results
      → Client: triggers win animation if player won
      → Client: clears chips, starts new round chip accumulation
  → emits casino:phase (betting) for new round
      → Client: dealer says "Place your bets!"

Player places bet
  → REST POST /roulette/bet (validates, deducts gold)
  → Server emits casino:bet to chat:casino room
      → Client: adds chip to board
      → Client: adds entry to session bet history (pending)
```

## Files Impacted

**Shared:**
- `packages/shared/src/types/casino.types.ts` — add `'corner'` to `RouletteBetType`, add socket event types
- `packages/shared/src/constants/gameConstants.ts` — add `BIG_WIN_THRESHOLD`

**Game Engine:**
- `packages/game-engine/src/casino/` — `validateBet`, `isWinningBet`, `calculatePayout` for corner bets

**API:**
- `apps/api/src/services/casinoService.ts` — emit socket events on phase change and bet placement
- `apps/api/src/services/leaderboardService.ts` — add `casino_profit` and `casino_wagered` categories
- `apps/api/src/socket/chatHandlers.ts` — (already has casino room; socket events use same room)

**Web:**
- `apps/web/src/components/screens/Casino.tsx` — chips on board, corner bet hit targets, hot/cold indicators, bet history section, win animation, dealer message injection
- `apps/web/src/hooks/useChat.ts` — handle casino socket events for dealer messages
- Socket listener setup for `casino:*` events
