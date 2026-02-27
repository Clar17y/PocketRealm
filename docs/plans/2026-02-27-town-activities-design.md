# Town Activities: Casino & Training Grounds

## Overview

Two new town-only activities to keep players engaged when turns are low or depleted. A shared roulette casino using gold (purchased with turns) and a free fight simulator against bestiary mobs.

## Gold Exchange

- 1 turn = 1 gold, one-way conversion (no gold → turns ever)
- Town-only, player chooses amount
- Gold already exists on Player model but currently has no source or sink
- This establishes gold as the casino currency

## Shared Roulette

### Core Concept

Global wheel — all players in the game bet on the same spin and see each other's bets. Social, competitive, and creates shared moments.

### Round Lifecycle

```
BETTING (0:00 - 0:50)  →  SPINNING (0:50 - 1:00)  →  RESULT  →  next round on first bet
```

- **Lazy rounds:** A new round starts when the first bet is placed after the previous round ends. No cron, no empty spins.
- ~50 seconds betting window, ~10 seconds for wheel animation + result display.
- Betting window closes when spinning begins — no late bets.

### Rules (European Roulette)

37 slots (0–36), single zero. House edge: 2.7%.

| Bet Type | Payout | Win Chance |
|----------|--------|------------|
| Single number | 35:1 | 2.7% |
| Split (2 numbers) | 17:1 | 5.4% |
| Red/Black | 1:1 | 48.6% |
| Odd/Even | 1:1 | 48.6% |
| Dozen (1-12, 13-24, 25-36) | 2:1 | 32.4% |
| Column | 2:1 | 32.4% |

### Limits

- Min bet: 1 gold
- Max bet: 1,000 gold
- Multiple bets per spin allowed (place on several positions)

### Social Layer

- All current bets visible on the table (player name, position, amount)
- Post-spin feed shows who won and how much
- Spin history: last 20 results displayed

### Frontend

- Pixelated tavern aesthetic with tavern folk around the table
- Animated roulette wheel for the spin phase
- Bet placement UI on the roulette board layout

## Training Grounds (Fight Simulator)

### Core Concept

Free, no-stakes combat practice against any mob in your bestiary. Uses the real combat engine for accurate results.

### Mechanics

- Pick any mob template from bestiary (must have encountered it)
- Pick any prefix variant you've seen for that mob
- Runs real `runCombat()` — same combat engine, same playback animation
- **No rewards:** Zero XP, loot, gold, bestiary progress
- **No consequences:** Zero HP loss, durability damage, turn cost
- **Rate limited:** 1 fight per 60 seconds (server-enforced via Redis TTL)
- Fights mob at template level, no scaling

### Use Cases

- Test new gear against known enemies
- Check if you can handle a tougher zone's mobs before committing turns to travel
- Something to do while waiting for turns
- Satisfying combat playback with no risk

## Architecture

### API Routes

```
POST   /api/v1/casino/exchange            — Convert turns to gold
GET    /api/v1/casino/roulette/round       — Current round state, time remaining, all bets
POST   /api/v1/casino/roulette/bet         — Place bet on current round
GET    /api/v1/casino/roulette/history     — Past spin results
POST   /api/v1/training/fight              — Start a simulated fight
```

### Data Model

**RouletteRound**
- id, spinNumber, result (null until resolved), startedAt, resolvedAt

**RouletteBet**
- roundId, playerId, betType, betValue, amount, payout (null until resolved)

**Training cooldown:** Redis key `training:cooldown:{playerId}` with 60s TTL. No DB model needed.

### Town Gating

Both casino and training routes verify `player.currentZone.zoneType === 'town'`. Return 403 if not in town.

### Game Constants

```ts
CASINO_CONSTANTS = {
  GOLD_EXCHANGE_RATE: 1,        // turns per gold
  ROULETTE_MIN_BET: 1,
  ROULETTE_MAX_BET: 1000,
  ROULETTE_SLOTS: 37,           // 0-36, European
  ROULETTE_HISTORY_LENGTH: 20,
  ROUND_DURATION_SECONDS: 60,
  BETTING_WINDOW_SECONDS: 50,
}

TRAINING_CONSTANTS = {
  COOLDOWN_SECONDS: 60,
}
```

### Polling

Frontend polls `GET /casino/roulette/round` every few seconds during active rounds to show updated bets and countdown. No WebSocket needed.

## Future Expansion

- Additional casino games (slots, dice, coin flip) — same gold economy
- Tavern NPC quest board — daily challenges that reward gold
- Gold shop — cosmetics or consumables purchasable with gold
- Tavern social features — emotes, spectating
