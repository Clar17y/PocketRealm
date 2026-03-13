# CASINO_CONSTANTS Analysis

## Current Values

| Constant | Value | Description |
|---|---|---|
| `GOLD_EXCHANGE_RATE` | 1 | Turns-to-gold conversion (1 turn = 1 gold) |
| `ROULETTE_MIN_BET` | 1 | Minimum wager per bet |
| `ROULETTE_MAX_BET` | 1000 | Maximum wager per bet |
| `ROULETTE_SLOTS` | 37 | Numbers on the wheel (0-36, single-zero European) |
| `ROULETTE_HISTORY_LENGTH` | 20 | Spin results shown in history UI |
| `ROULETTE_STATS_DEPTH` | 200 | Spins used for frequency statistics |
| `ROUND_DURATION_SECONDS` | 60 | Total round length |
| `BETTING_WINDOW_SECONDS` | 50 | Betting phase within a round |
| `BIG_WIN_THRESHOLD` | 500 | Payout amount that triggers big-win UI |

### Payout Multipliers (in game-engine, not in constants)

| Bet Type | Multiplier | Coverage | Win Probability | House Edge |
|---|---|---|---|---|
| straight | 36x | 1/37 | 2.703% | 2.703% |
| split | 18x | 2/37 | 5.405% | 2.703% |
| corner | 9x | 4/37 | 10.811% | 2.703% |
| dozen | 3x | 12/37 | 32.432% | 2.703% |
| column | 3x | 12/37 | 32.432% | 2.703% |
| red/black | 2x | 18/37 | 48.649% | 2.703% |
| odd/even | 2x | 18/37 | 48.649% | 2.703% |

Note: Payouts include the original wager (e.g., "straight 36x" means net profit = 35x bet). This matches standard European roulette.

## Analysis

### 1. House Edge and Expected Value

European single-zero roulette has a uniform house edge of 2.703% across all bet types:

```
EV = (coverage/37) * multiplier - 1
   = (coverage/37) * (37/coverage) * (coverage/37) ...

For straight: EV = (1/37)*36 + (36/37)*0 - 1 = 36/37 - 1 = -1/37 = -2.703%
For red:      EV = (18/37)*2 + (19/37)*0 - 1 = 36/37 - 1 = -1/37 = -2.703%
```

Every bet type has the same expected return of 97.3 cents per gold wagered. This is mathematically correct for European roulette.

### 2. Turn-to-Gold Exchange Rate

At `GOLD_EXCHANGE_RATE = 1`, converting 1000 turns yields 1000 gold. This is the entry point into the casino economy.

Turn generation: 1 turn/second = 3600 turns/hour = 86,400 turns/day.

A player can therefore generate 86,400 gold/day at maximum through exchange. With a bank cap of 64,800 turns, a single exchange session maxes at 64,800 gold.

### 3. Throughput and Volatility per Session

Rounds last 60 seconds with a 50-second betting window, yielding ~60 rounds/hour (with the 5-second result display gap).

**Max bet throughput per round:** There is no per-player bet count limit. A player can place unlimited bets per round (each up to 1000 gold), constrained only by their gold balance.

**Single bet volatility:**
- Max bet = 1000 gold.
- Max single payout = 1000 * 36 = 36,000 gold on a straight bet.
- Expected loss per max bet = 1000 * (1/37) = 27 gold.

**Hourly expected loss at max-bet even-money play:**
- 60 rounds * 1000 gold/round * 2.703% edge = 1,622 gold/hour lost to the house.

**Hourly expected loss at max-bet straight play:**
- Same EV: 60 * 1000 * 2.703% = 1,622 gold/hour.
- But variance is enormously higher. Standard deviation per straight bet = `1000 * sqrt((1/37)*36^2 + (36/37)*0^2 - (36/37-1)^2)` = `1000 * sqrt(35.07)` = ~5,922 gold.
- Over 60 bets: hourly SD = 5,922 * sqrt(60) = ~45,875 gold.

This means a straight-bet player can swing +/-90,000 gold in an hour (2 SD), which is larger than the turn bank cap conversion of 64,800 gold.

### 4. Gold Flow: Sources vs. Sinks

**Gold sources:**
- Turn exchange (primary): up to 86,400 gold/day
- Item selling: variable, typically small (base price * rarity multiplier)
- Casino winnings (redistributive, not a source -- net negative)

**Gold sinks:**
- Casino losses (2.703% of wagered amount disappears permanently)
- Flee/death gold loss (5-30% of gold balance)
- Equipment repair costs
- Mail costs (25 gold/message)
- Guild treasury contributions

The casino is a **gold sink** by design. At steady-state, 2.703% of all wagered gold is destroyed from the economy. This is healthy.

### 5. Scaling Curve

The casino has **no scaling with player level or progression**. A level 1 player and a level 50 player interact with identical constants. This is intentional for roulette (real-world roulette doesn't scale either), but it creates a potential progression disconnect:

- Early game: 1000 gold is a significant amount (many hours of turn generation).
- Late game: Players accumulate gold faster through selling higher-tier items. The 1000 max bet may feel trivially small, reducing engagement.

The exchange rate is linear (1:1) with no diminishing returns, so there's no penalty for bulk conversion.

### 6. Round Timing

```
|<-- 50s betting -->|<-- 10s spinning -->|<-- 5s result -->|
|<-------------- 60s round duration ----------------->|     |
```

The 5-second result display gap between rounds means effective cycle = ~65 seconds, yielding ~55 rounds/hour rather than 60.

The 50/60 split gives 83.3% of the round as betting window. This is generous -- it means players rarely miss a round due to timing.

### 7. Stats Depth

`ROULETTE_STATS_DEPTH = 200` shows frequency of each number across the last 200 spins. With 37 numbers, expected count per number = 200/37 = 5.4 spins.

The standard deviation = sqrt(200 * (1/37) * (36/37)) = sqrt(5.25) = 2.29.

So in a 200-spin sample, numbers will typically show between 1 and 10 hits. This provides just enough data for the Gambler's Fallacy UI (players who think they can spot "hot" or "cold" numbers). At 200 spins, the statistical noise is large enough to create apparent patterns but small enough that no real pattern detection is possible. This is well-calibrated for casino atmosphere.

## Issues Found

### Issue 1: No Per-Player Bet Limit Per Round (Medium)

Players can place unlimited bets per round. A player with 10,000 gold could place 10 bets of 1000 on different straight numbers, covering 10/37 = 27% of the wheel with 36x payout each.

**Degenerate strategy -- Full wheel coverage:**
A player places 37 straight bets of 1000 gold each (37,000 gold total). One will hit for 36,000. Net loss = 1,000 gold per round. This is just the house edge applied mechanically.

This isn't actually exploitable (the math always works against the player), but it enables a gold-laundering pattern: a player can convert a large gold balance into guaranteed small losses, which could be used to manipulate achievement tracking (`totalGoldWagered` inflates while gold barely changes).

More practically, allowing unlimited bets per round means a whale player can dominate the bet feed in the Socket.IO broadcast, spamming the casino chat with dozens of bet events per round.

### Issue 2: No Bet Diversity Restriction (Low)

A player can place multiple bets on the same number/type in the same round. For example, 10 separate straight bets on number 17 of 1000 each = effectively a 10,000 gold straight bet, bypassing the max bet of 1000. This renders `ROULETTE_MAX_BET` ineffective as a risk limiter.

### Issue 3: BIG_WIN_THRESHOLD May Be Too Low (Low)

`BIG_WIN_THRESHOLD = 500` gold triggers on any payout >= 500. A 250-gold bet on red that wins pays 500 gold, triggering the big-win animation. At max bet (1000) on even-money bets, every single win (payout = 2000) triggers it. This cheapens the "big win" feel.

For reference: max possible payout is 36,000 (straight at max bet). A threshold of 500 means the big-win trigger fires at just 1.4% of the max payout.

### Issue 4: Exchange Rate Creates No Friction (Low)

`GOLD_EXCHANGE_RATE = 1` means turns convert to gold with zero loss. Players can freely move between the turn economy and the gold economy with no penalty. This removes a potential balancing lever -- if casino gold were cheaper than "real" gold, the casino would be more clearly a leisure activity rather than an economic strategy.

However, since the casino is a net gold sink (2.703% house edge), this may be intentional: the friction IS the house edge, not the exchange rate.

### Issue 5: No Cooldown on Exchange (Low)

The exchange endpoint has no rate limit or cooldown. A player could rapidly exchange turns to gold in a script, though this is mitigated by the turn bank cap (64,800 max available at once).

## Recommendations

### R1: Add per-player bet count limit per round

Add `MAX_BETS_PER_ROUND: 5` to CASINO_CONSTANTS. Check in `placeBet` that the player hasn't exceeded this count for the current round. This prevents bet-feed spam and limits wager-inflation for achievements.

### R2: Deduplicate or aggregate same-outcome bets

Either reject duplicate bet targets (same betType + betValue from same player) or aggregate them into a single bet row, enforcing `ROULETTE_MAX_BET` as a true per-outcome cap.

### R3: Raise BIG_WIN_THRESHOLD to 5000

```
BIG_WIN_THRESHOLD: 500 -> 5000
```

At 5000, the trigger fires for: straight bets >= 139 gold, split bets >= 278 gold, corner bets >= 556 gold, dozen/column bets >= 1667 gold (impossible with max bet of 1000). This makes big wins meaningful -- only high-risk bets that actually pay off will trigger the animation.

### R4: Consider scaling max bet with player level (optional, low priority)

```
ROULETTE_BASE_MAX_BET: 200
ROULETTE_MAX_BET_PER_LEVEL: 40
```

At level 1: max bet = 240. At level 20: max bet = 1000. At level 50: max bet = 2200.

This would make the casino stay relevant at higher levels while protecting new players from losing too much too fast. However, this adds complexity and may not be worth it if the casino is meant to be a simple side activity.

### R5: History/stats constants are fine as-is

`ROULETTE_HISTORY_LENGTH = 20` and `ROULETTE_STATS_DEPTH = 200` are well-tuned for their purposes. No change needed.

### R6: Round timing is well-balanced

The 50s/60s betting/round split and 5-second result display create good pacing. No change needed.

## Risk Level

**low** -- The casino uses standard European roulette math with a correct 2.703% house edge. The fundamental economics are sound: it functions as a gold sink with entertainment value. The issues found are quality-of-life and exploit-prevention concerns (bet spam, max-bet bypass) rather than economy-breaking problems. No degenerate strategy can generate gold -- the house always wins in expectation.
