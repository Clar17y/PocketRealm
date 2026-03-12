# PvP Arena System Design

## Overview

Async ghost-based PvP accessible from town arenas. Players browse an Elo-rated ladder, optionally scout opponents, then challenge them. Combat resolves instantly against a snapshot of the defender's stats/gear. Defenders see the result as a combat log when they next check.

## Core Decisions

- **Async ghost-based** — fight a snapshot, no real-time needed
- **Town arenas only** — PvP initiated from any town, global ladder (no zone matching)
- **Generalized combat engine** — refactor `runCombat` to be combatant-agnostic; both PvE and PvP use the same function
- **Elo rating** — standard system, K=32, +/- 25% bracket for matchmaking
- **Full HP snapshots** — arena fights always use max HP
- **Rating + durability stakes** — no gold/item loss
- **24h cooldown per attacker-target pair**
- **Level 10 minimum** to participate (Arena button visible to all, gated on participation)

## User Flow

### Attacker
1. In a town zone → sees "Arena" in town UI
2. Opens Arena → PvP ladder: opponents within Elo bracket
3. Each row: username, rating, combat level
4. Optional: **Scout** (100 turns) → reveals attack style, armor class, power rating
5. **Challenge** (500 turns) → choose combat style → instant resolution
6. View combat log + rating change + durability loss

### Defender
1. Logs in → notification: "You were challenged by [player]!"
2. View combat log
3. Option: **Revenge attack** (250 turns, 50% discount)

## Turn Costs

| Action | Cost |
|--------|------|
| Challenge | 500 |
| Scout | 100 |
| Revenge | 250 |

## Combat Engine Refactor

### Current: player/mob hardcoded
```
runCombat(playerStats: CombatantStats, mob: MobTemplate) → CombatResult
CombatLogEntry.actor: 'player' | 'mob'
```

### New: combatant-agnostic
```typescript
interface Combatant {
  id: string;
  name: string;
  stats: CombatantStats;
  spells?: SpellPattern[];  // mobs have these, players don't (yet)
  damageType: DamageType;
}

function runCombat(combatantA: Combatant, combatantB: Combatant): CombatResult
```

- `CombatLogEntry.actor` → `'combatantA' | 'combatantB'`, add `actorName: string`
- `CombatResult` fields renamed: `playerMaxHp` → `combatantAMaxHp`, etc.
- `combatantAHpRemaining` replaces `playerHpRemaining`
- PvE call site builds `Combatant` from player data + `MobTemplate`
- PvP call site builds both from player snapshots

## Data Model

### PvpRating
```
id           String   @id @default(uuid())
playerId     String   @unique
rating       Int      @default(1000)
wins         Int      @default(0)
losses       Int      @default(0)
winStreak    Int      @default(0)
bestRating   Int      @default(1000)
lastFoughtAt DateTime?
createdAt    DateTime @default(now())
updatedAt    DateTime @updatedAt
```

### PvpMatch
```
id                   String   @id @default(uuid())
attackerId           String
defenderId           String
attackerRating       Int
defenderRating       Int
attackerRatingChange Int
defenderRatingChange Int
winnerId             String
combatLog            Json
attackerStyle        String
defenderStyle        String
turnsSpent           Int
isRevenge            Boolean  @default(false)
createdAt            DateTime @default(now())
```

### PvpCooldown
```
id         String   @id @default(uuid())
attackerId String
defenderId String
expiresAt  DateTime
@@unique([attackerId, defenderId])
```

## Constants (`gameConstants.ts`)

```typescript
export const PVP_CONSTANTS = {
  STARTING_RATING: 1000,
  K_FACTOR: 32,
  BRACKET_RANGE: 0.25,       // +/- 25% rating
  CHALLENGE_TURN_COST: 500,
  SCOUT_TURN_COST: 100,
  REVENGE_TURN_COST: 250,
  COOLDOWN_HOURS: 24,
  MIN_OPPONENTS_SHOWN: 10,
  MIN_CHARACTER_LEVEL: 10,
};
```

## API Routes

All under `/api/v1/pvp/`:

| Method | Route | Description | Turns |
|--------|-------|-------------|-------|
| GET | `/ladder` | Opponents in Elo bracket | 0 |
| GET | `/rating` | Your PvP stats | 0 |
| POST | `/scout` | Scout opponent `{targetId}` | 100 |
| POST | `/challenge` | Attack `{targetId, attackStyle}` | 500/250 |
| GET | `/history` | Match history | 0 |
| GET | `/notifications` | Unread attack results | 0 |

## Service Layer

**`pvpService.ts`:**
- `getLadder(playerId)` — players within bracket, exclude cooldowns
- `scoutOpponent(playerId, targetId)` — spend turns, return overview
- `challenge(attackerId, targetId, attackStyle)` — validate, build stats, run combat, update Elo, record match, apply durability
- `getNotifications(playerId)` — recent matches where player was defender

**`eloService.ts`:**
- `calculateNewRatings(winnerRating, loserRating, kFactor)` → `{winnerNew, loserNew}`
- Formula: expected = `1 / (1 + 10^((opponent - self) / 400))`

### Validations
- Attacker in town zone
- Target not on cooldown (24h)
- Target within Elo bracket (+/- 25%)
- Sufficient turns
- Cannot self-challenge
- Character level 10+

## Frontend

### Components
- **Arena Screen** — town UI feature with ladder, rating panel, history
- **Ladder View** — opponent list with Scout/Challenge buttons
- **Scout Modal** — attack style, armor class, power rating
- **Match History** — W/L list with rating deltas, tap for combat log
- **Notification Badge** — "You were attacked!" with revenge option
- **Combat Result** — reuse `CombatScreen` with player names

### Integration
- Town UI gets "Arena" button (always visible, participation gated at level 10)
- `useGameController` gets `handlePvpChallenge`, `handlePvpScout`
- Combat log viewer reused from PvE

## Scouting Info Revealed

| Field | Description |
|-------|-------------|
| Combat level | Character level |
| Attack style | Primary weapon type (melee/ranged/magic) |
| Armor class | Heavy/medium/light based on equipped gear |
| Power rating | Rough combat power number |

## Anti-Griefing

- **Elo brackets** (+/- 25%) — can't target far weaker players
- **24h cooldown per pair** — no repeat attacks
- **Full HP snapshots** — no preying on wounded players
- **Town-only initiation** — no surprise attacks
- **500 turn cost** — deliberate investment
- **Level 10 gate** — prevents smurf spam
- **Revenge discount** — defenders get a cheaper counterattack
- **No revenge chaining** — discount applies to most recent attacker only
