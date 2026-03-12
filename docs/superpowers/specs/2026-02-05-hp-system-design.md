# HP System Design

**Status: Implemented** (2026-02-05)

Core HP system is complete. Potions are designed but not yet implemented.

## Overview

Persistent HP system with resource management that creates strategic depth around turn economy. Players must balance exploring, fighting, resting, and crafting to maintain combat readiness.

**Three paths to HP sustainability:**
- **Vitality investment** - Higher max HP + faster passive regen + faster rest rate
- **Alchemy investment** - Craft Health Potions (burst heal) and Recovery Potions (skip knockout penalty)
- **Hybrid** - Balance both for flexibility

## HP Calculation

**Formula:**
```
maxHp = BASE_HP + (vitalityLevel × HP_PER_VITALITY) + equipmentHealthBonus
```

**Values:**
- `BASE_HP`: 100
- `HP_PER_VITALITY`: 5 per level

**Examples:**
| Build | Vitality | Gear Bonus | Max HP |
|-------|----------|------------|--------|
| New player | 0 | 0 | 100 |
| Mid game | 20 | 0 | 200 |
| Late game | 40 | 0 | 300 |
| Endgame | 40 | +300 | 600 |

**Persistence:**
- `currentHp` stored in database on Player model
- Capped at `maxHp` (recalculated if gear/Vitality changes reduce max below current)
- Lazy calculation pattern (like turns): store `lastHpRegenAt` timestamp, calculate passive regen on read

## Passive Regeneration

**Formula:**
```
regenPerSecond = BASE_PASSIVE_REGEN + (vitalityLevel × PASSIVE_REGEN_PER_VITALITY)
```

**Values:**
- `BASE_PASSIVE_REGEN`: 0.4 HP/sec
- `PASSIVE_REGEN_PER_VITALITY`: 0.04 HP/sec per level

**Examples:**
| Vitality | Regen Rate | Time to Full (300 HP) |
|----------|------------|----------------------|
| 0 | 0.4 HP/sec | 12.5 min |
| 20 | 1.2 HP/sec | 4.2 min |
| 40 | 2.0 HP/sec | 2.5 min |

**Behavior:**
- Ticks continuously in real-time (calculated on read)
- Works while offline/logged out
- Stops at `maxHp` (no overheal)
- Does NOT tick while in Recovering state

## Rest Mechanic

**Formula:**
```
healPerTurn = BASE_REST_HEAL + (vitalityLevel × REST_HEAL_PER_VITALITY)
```

**Values:**
- `BASE_REST_HEAL`: 2 HP/turn
- `REST_HEAL_PER_VITALITY`: 0.2 HP/turn per level

**Examples:**
| Vitality | Heal Rate | Turns to Full (300 HP) |
|----------|-----------|------------------------|
| 0 | 2 HP/turn | 150 turns |
| 20 | 6 HP/turn | 50 turns |
| 40 | 10 HP/turn | 30 turns |

**UI Flow (mirrors Explore/Gathering):**
1. Player opens Rest screen
2. Slider to select turns to spend
3. Preview shows: "Heal X HP (Y → Z)"
4. Confirm to execute

**Constraints:**
- Cannot rest while in Recovering state
- Cannot rest above `maxHp`
- Auto-caps if selected turns would overheal

## Knockout & Flee Mechanics

**When player HP hits 0 during combat:**

An Evasion roll determines the outcome.

**Flee Outcomes (Evasion-based):**
| Roll Result | Outcome | HP State | Penalty |
|-------------|---------|----------|---------|
| High success | Clean escape | 10-20% HP remains | Lose small % gold |
| Partial success | Wounded escape | 1 HP remains | Lose moderate gold, no XP |
| Failure | Knocked out | 0 HP, Recovering state | Lose significant gold, no XP, recovery turn cost |

**Evasion Roll Formula:**
```
levelDiff = evasionLevel - mobLevel
fleeChance = BASE_FLEE_CHANCE + (levelDiff × FLEE_CHANCE_PER_LEVEL_DIFF)
fleeChance = clamp(fleeChance, MIN_FLEE_CHANCE, MAX_FLEE_CHANCE)
```

This means fighting equal-level mobs gives 30% base flee chance (70% knockout), while outleveling mobs increases your escape chance up to 95%.

**Recovering State Restrictions:**
- Cannot explore
- Cannot fight
- Cannot gather
- Cannot rest (must spend recovery turns first)
- Cannot change equipment (prevents exploit of removing HP gear to reduce recovery cost)

**Recovery:**
- Cost: 1 turn per max HP (locked at knockout)
- Result: Exit Recovering state at 25% max HP
- Alternative: Use Recovery Potion to skip turn cost

## Potions

**Health Potions (instant heal, no cooldown):**
| Tier | HP Restored | Alchemy Level |
|------|-------------|---------------|
| Minor Health Potion | 50 HP | Low |
| Health Potion | 150 HP | Mid |
| Greater Health Potion | 400 HP | High |

**Recovery Potions (skip knockout penalty + restore HP):**
| Tier | HP Restored | Alchemy Level |
|------|-------------|---------------|
| Minor Recovery Potion | 25% max HP | Low |
| Recovery Potion | 50% max HP | Mid |
| Greater Recovery Potion | 100% max HP | High |

**Usage Rules:**
- Health Potions: Usable anytime (except Recovering state)
- Recovery Potions: Only usable while in Recovering state
- No cooldowns

## Game Constants

```typescript
export const HP_CONSTANTS = {
  BASE_HP: 100,
  HP_PER_VITALITY: 5,
  BASE_PASSIVE_REGEN: 0.4,
  PASSIVE_REGEN_PER_VITALITY: 0.04,
  BASE_REST_HEAL: 2,
  REST_HEAL_PER_VITALITY: 0.2,
  RECOVERY_TURNS_PER_MAX_HP: 1,
  RECOVERY_EXIT_HP_PERCENT: 0.25,
} as const;

export const FLEE_CONSTANTS = {
  BASE_FLEE_CHANCE: 0.3,           // When evasion == mob level
  FLEE_CHANCE_PER_LEVEL_DIFF: 0.02, // Per level difference (evasion - mobLevel)
  MIN_FLEE_CHANCE: 0.05,           // Floor (95% knockout max)
  MAX_FLEE_CHANCE: 0.95,           // Cap (5% knockout min)
  HIGH_SUCCESS_THRESHOLD: 0.8,     // Top 20% of successful escapes = clean
  HIGH_SUCCESS_HP_PERCENT: 0.15,
  PARTIAL_SUCCESS_HP: 1,
  GOLD_LOSS_MINOR: 0.05,
  GOLD_LOSS_MODERATE: 0.15,
  GOLD_LOSS_SEVERE: 0.30,
} as const;

export const POTION_CONSTANTS = {
  MINOR_HEALTH_HEAL: 50,
  HEALTH_HEAL: 150,
  GREATER_HEALTH_HEAL: 400,
  MINOR_RECOVERY_PERCENT: 0.25,
  RECOVERY_PERCENT: 0.50,
  GREATER_RECOVERY_PERCENT: 1.0,
} as const;
```

## Database Changes

**Player model additions:**
```prisma
model Player {
  currentHp       Int       @default(100)
  lastHpRegenAt   DateTime  @default(now())
  isRecovering    Boolean   @default(false)
  recoveryCost    Int?      // Snapshot of maxHp at knockout
}
```

**Migration notes:**
- Existing players: `currentHp` = calculated maxHp, `lastHpRegenAt` = now, `isRecovering` = false

## UI Changes

**Dashboard:**
- HP bar: Current HP / Max HP with visual indicator
- Passive regen rate displayed
- Warning indicator when HP low, "KO" badge when Recovering

**Rest Screen (two modes):**

Mode 1 - Knocked Out:
- "You are knocked out"
- Shows recovery turn cost
- "Recover" button + "Use Potion" dropdown

Mode 2 - Normal:
- Current HP / Max HP + passive regen rate
- Turn slider with heal preview
- "Rest" button

## Build Trade-offs

| Path | Investment | Benefit |
|------|------------|---------|
| Vitality | Skill levels | Bigger HP pool, faster regen, faster rest |
| Evasion | Skill levels | Better flee outcomes when losing |
| Alchemy | Skill levels + materials + turns | Potions for burst heal / skip recovery |

## Implementation Status

**Implemented:**
- Database: 4 new fields on Player model + mob level field
- Backend: HP service, rest/recover endpoints, combat integration with flee mechanics
- Frontend: Dashboard HP display, Rest screen with recovery mode, knockout banners on all action screens
- Action blocking while recovering (explore, gather, craft, fight, equip)
- Flee chance scales with evasion vs mob level

**Not Yet Implemented:**
- Health Potions (burst heal)
- Recovery Potions (skip knockout penalty)
- Gold loss on flee (gold system not implemented)
