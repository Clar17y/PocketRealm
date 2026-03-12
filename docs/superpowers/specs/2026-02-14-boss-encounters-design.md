# Boss Encounters Design

**Status: Not started**
**Branch**: `feature/world-events-system`

## Overview

Zone-scoped async raid bosses that scale dynamically based on participant count and zone tier. Players sign up each round, choosing attacker or healer roles. Bosses persist HP between wipe attempts as a percentage, so multiple groups can chip away at a tough boss over time.

## Spawning

Hybrid: scheduler-driven + exploration discovery.

**Scheduler path:** When the event scheduler rolls a zone event, there is a `BOSS_SPAWN_CHANCE` (10%) that it becomes a boss instead of a regular mob/resource event. Only fires if no active boss exists (`MAX_BOSS_ENCOUNTERS: 1`).

**Discovery path:** During exploration event discovery, a separate `BOSS_DISCOVERY_CHANCE` (5%) roll can trigger a boss encounter. The discovering player gets credit (`createdBy: 'player_discovery'`).

**Both paths:**
1. Pick a random `MobTemplate` where `isBoss = true` from the zone's mob families
2. Create `WorldEvent` with `type: 'boss'`, zone-scoped, `expiresAt: null` (bosses don't time-expire)
3. Create `BossEncounter` linked to the event, `status: 'waiting'`, `nextRoundAt: now + BOSS_ROUND_INTERVAL_MINUTES`
4. Announce in world chat AND zone chat

## Signup

- Player must be in the boss's zone
- Choose role: `attacker` or `healer`
- Commit turns (deducted immediately on signup)
- Can switch roles between rounds
- One signup per player per round (`@@unique([encounterId, playerId, roundNumber])`)

## Dynamic Scaling

Boss stats scale from zone tier (1-5) and participant count. No hardcoded HP/AOE on boss templates.

```
bossMaxHp  = BOSS_HP_PER_PLAYER_BY_TIER[tier]  * participantCount
bossAoeDmg = BOSS_AOE_PER_PLAYER_BY_TIER[tier] * participantCount
bossDefence = BOSS_DEFENCE_BY_TIER[tier]         (flat, not scaled by count)
```

**Scaling locks at round 1 resolution.** Subsequent rounds of the same attempt keep the same maxHp. If the raid wipes and a new group forms, stats re-scale to the new group size.

### Per-player baselines by tier

| Tier | HP per player | AOE per player | Defence |
|------|---------------|----------------|---------|
| 1    | 200           | 15             | 5       |
| 2    | 500           | 30             | 12      |
| 3    | 1000          | 50             | 20      |
| 4    | 2000          | 80             | 35      |
| 5    | 4000          | 120            | 50      |

## Shared Raid HP Pool

The raid group shares a single HP pool instead of tracking individual participant HP.

**Pool size** = sum of all participants' max HP (base HP + vitality scaling).

The boss deals a single hit to the pool each round, reduced by the raid's averaged defences:

```
poolDamage = max(bossAoeDmg - avg(participants' defence), MIN_DAMAGE)
raidPool  -= poolDamage
```

Averaging defence across participants means tanky players in heavy armor directly reduce raid damage. A group of glass cannons takes more pool damage than a balanced group.

## Round Resolution

Rounds resolve lazily every `BOSS_ROUND_INTERVAL_MINUTES` (30 min). Resolution triggers when any player hits a boss API endpoint or the scheduler ticks.

### Round flow

1. Gather all signups for the current round number
2. If no signups: push `nextRoundAt` forward by another interval, skip resolution
3. On round 1: lock boss scaling (maxHp, aoeDmg) based on participant count + zone tier
4. Snapshot attacker stats (equipped weapon → attack style, skill level, equipment stats) and healer stats (magic skill level) from DB at resolution time
5. **Attack phase:** Each attacker rolls individually against the boss (d20 + accuracy vs boss dodge). Real equipped weapon stats, real skill levels. Same combat math as normal encounters.
6. **Boss phase:** Single hit against the shared raid pool, reduced by averaged participant defence.
7. **Heal phase:** Each healer restores HP to the pool: `healAmount = turnsCommitted * (1 + magicLevel * HEALER_MAGIC_SCALING)`. Pool capped at max.
8. Check outcomes:
   - Boss HP ≤ 0 → **defeated**
   - Raid pool ≤ 0 → **wipe**
   - Otherwise → increment round, set next `nextRoundAt`, status → `in_progress`

### Lazy trigger points

`checkAndResolveDueBossRounds(io)` called from:
- `GET /api/v1/boss/active`
- `GET /api/v1/boss/:id`
- `POST /api/v1/boss/:id/signup`
- `checkAndSpawnEvents()` (scheduler tick during exploration)

## Attacker Stats

Read the player's equipped weapon at round resolution time to determine:
- **Attack style:** weapon type → melee/ranged/magic
- **Skill level:** from `PlayerSkill` matching the attack style
- **Equipment stats:** aggregated from all equipped items (attack, accuracy, critChance, etc.)

Same stat resolution as normal combat. No weapon equipped → melee with bare-hands stats (attack: 1, accuracy: 0).

## Healer Scaling

```
healAmount = turnsCommitted * (1 + magicLevel * HEALER_MAGIC_SCALING)
```

With `HEALER_MAGIC_SCALING: 0.02`:
- Magic level 1: turns * 1.02
- Magic level 25: turns * 1.50
- Magic level 50: turns * 2.00
- Magic level 100: turns * 3.00

Magic level read from `PlayerSkill` at round resolution time.

## Wipe Mechanic

When the raid pool hits 0:
- Each player gets an individual **flee roll** using the existing evasion-based flee formula
- Successful flee → escape with reduced overworld HP (same as normal flee)
- Failed flee → overworld knockout (normal recovery rules apply)
- Boss HP persisted as a **percentage** of its current maxHp

## HP Persistence Between Attempts

Boss HP stored as percentage remaining. When a new group forms:

1. New `maxHp = HP_PER_PLAYER[tier] * newParticipantCount`
2. Apply persisted percentage → `currentHp = maxHp * percentRemaining`

**Example:**
- Group 1: 8 players, tier 2. Boss maxHp = 4000. They deal 2400 damage → 40% remaining.
- Raid wipes. Boss persists at 40%.
- Group 2: 3 players. Boss maxHp = 1500. Starts at 1500 * 0.40 = 600 HP.
- Group 2 finishes it off.

## Boss Death & Loot

On boss HP reaching 0:
- Loot distributed to ALL contributors across ALL attempts, weighted by cumulative `totalDamage + totalHealing`
- `BossEncounter` status → `defeated`
- `WorldEvent` status → `completed`
- Chat announcement to world + zone: "The {boss} in {zone} has been defeated!"

## Boss Templates (Seed Data)

One boss per mob family (19 total). Templates only need:
- `name`, `level`, `isBoss: true`
- `MobFamilyMember` linking to the family
- No hardcoded HP/AOE (calculated dynamically from zone tier + participants)

| Family | Boss Name | Level |
|--------|-----------|-------|
| Wolves | Alpha Direwolf | 10 |
| Goblins | Goblin Warchief | 8 |
| Undead | Lich Lord | 20 |
| Spiders | Broodmother | 12 |
| Elementals | Primordial Core | 25 |
| Golems | Iron Colossus | 22 |
| Bandits | Bandit King | 15 |
| Serpents | Hydra Matriarch | 18 |
| Bats | Duskwing Elder | 6 |
| Boars | Razortusk | 8 |
| Crawlers | Hive Queen | 14 |
| Fae | Fae Monarch | 16 |
| Harpies | Stormcaller Matron | 12 |
| Spirits | Wraith Sovereign | 20 |
| Swamp Beasts | Mire Leviathan | 18 |
| Treants | Ancient Ironbark | 22 |
| Vermin | Rat King | 5 |
| Witches | Coven Archon | 16 |
| Abominations | The Amalgam | 25 |

## Constants

```typescript
// Boss spawning
BOSS_SPAWN_CHANCE: 0.10,
BOSS_DISCOVERY_CHANCE: 0.05,
MAX_BOSS_ENCOUNTERS: 1,

// Dynamic scaling by zone tier (index 0 = tier 1)
BOSS_HP_PER_PLAYER_BY_TIER: [200, 500, 1000, 2000, 4000],
BOSS_AOE_PER_PLAYER_BY_TIER: [15, 30, 50, 80, 120],
BOSS_DEFENCE_BY_TIER: [5, 12, 20, 35, 50],

// Round timing
BOSS_ROUND_INTERVAL_MINUTES: 30,

// Healer scaling
HEALER_MAGIC_SCALING: 0.02,
```

Remove `BOSS_AOE_DAMAGE`, `BOSS_EXPECTED_PARTICIPANTS`, `BOSS_HP_SCALE_FACTOR`, `HEALER_MAX_TARGETS` — no longer needed with dynamic scaling and shared pool.

## DB Changes

No schema changes needed. Existing models support everything:
- `BossEncounter.currentHp` / `maxHp` / `baseHp` → store scaled values, `baseHp` unused (dynamic now)
- `BossParticipant.currentHp` → repurpose or ignore (shared pool replaces individual HP)
- `BossParticipant.totalDamage` / `totalHealing` → cumulative across attempts for loot weighting

One consideration: `BossParticipant.currentHp` was for individual tracking. With the shared pool, we could store the pool HP on `BossEncounter` directly (add a `raidPoolHp` column) or compute it fresh each round from participant max HPs. Computing fresh is simpler — no new column needed.

## API Changes

No new endpoints needed. Existing boss routes cover everything:
- `GET /boss/active` — list active bosses (+ trigger lazy resolution)
- `GET /boss/:id` — encounter detail (+ trigger lazy resolution)
- `POST /boss/:id/signup` — sign up for next round (+ trigger lazy resolution)
- `GET /boss/:id/round/:num` — round results

Changes to existing endpoints:
- Signup response should include round scaling info (bossMaxHp, raidPoolHp)
- Encounter detail should show raid pool status
- Round results should include pool damage taken and healing done
