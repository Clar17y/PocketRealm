# Guild Economy Redesign — Design Spec

## Problem Statement

The guild economy is broken at small guild sizes (10-15 members). Six tracker issues (#1, #2, #27, #28, #94, #95) stem from the same root cause: all spending (projects, expeditions, boosts, respec) draws from a single treasury that caps at 600k, while project costs reach 5M. Turn contribution caps make L2/L3 projects mathematically impossible. Contract rewards are negligible. Boost scaling has arbitrary cliffs. Expeditions create perverse incentives against growing beyond 5 members.

**Design target:** 10-member guild at 10% tax rate as the baseline. Everything must work at this size.

**Income assumptions:** Players generate 1 turn/second (86,400 turns/day). Not all turns are spent — players accumulate between sessions, spend in bursts, and vary in activity. We assume ~60% average spend rate, giving a 10-member guild at 10% tax approximately **50,000 turns/day** treasury income. All pacing calculations use this conservative estimate.

## 1. Treasury & Economy Separation

### Current
Treasury funds everything — boosts, expeditions, projects, respec. All income from turn tax. Creates impossible trade-offs at small guild sizes.

### New Model
- **Treasury** handles operational spending only: boosts, expeditions, specialization respec.
- **Projects** funded entirely by direct player contributions (turns + materials). No treasury cost.
- **Treasury income** stays as turn tax (0-20%) + contract rewards (buffed).
- **Treasury cap** formula unchanged (`100k + level × 10k`). With projects removed from treasury spending, the cap is adequate for operational costs. Note: T2+ expedition costs may exceed the cap at low guild levels — this is intentional progression gating.

### Specialization Respec Cost
Reduced from 2,000,000 → **500,000** turns. The current value exceeds the treasury cap at all guild levels, making respec impossible. At 500k, respec requires a level 40+ guild (cap = 500k) — expensive but achievable.

### Contract Reward Buff
| Reward | Current | New |
|--------|---------|-----|
| Treasury turns | 500-2,000 | 5,000-15,000 |
| Guild XP | 200-800 | 500-2,000 |
| Renown | — | 50-200 (adds to existing `renown` field on Guild model) |

At ~50k turns/day treasury income, contracts provide a meaningful ~10-30% weekly income supplement (3 contracts/week [unchanged cadence] × 5k-15k = 15k-45k/week vs ~350k/week from tax). Previously <1%.

## 2. Project System Rework

### Contribution Caps
- Per-player turn cap: 10,000 → **50,000**
- Per-player material cap: 200 per category (unchanged — inventory-limited naturally)

### Revised Project Costs
No treasury cost. Turns + materials only. Per-player turn cap resets per project (as per existing `PER_PROJECT_TURN_CAP` semantics).

| Tier | Turn Goal | Target Pacing (10 members) |
|------|-----------|---------------------------|
| L1 | 150,000 | ~1 week (each member contributes ~2,150 turns/day) |
| L2 | 500,000 | ~1 month (each member contributes ~1,650 turns/day) |
| L3 | 1,000,000 | ~2-3 months (each member contributes ~1,650 turns/day) |

Pacing assumes casual contribution (~2% of daily turn generation). Motivated guilds finish faster. The per-player turn cap (50k) resets for each new project.

**L3 hard gate:** At 10 members × 50k cap = 500k max, which is less than the 1M L3 goal. This is an intentional hard gate — L3 projects require guilds to grow beyond 10 members (minimum 20 to hit the cap collectively). L3 is endgame content and should reward guilds that have grown. Guilds at the 10-member baseline can complete L1 and L2 projects comfortably.

**Material goals** scaled proportionally (~50% reduction from current values). Exact values to be determined during implementation based on current project definitions — apply a 0.5x multiplier to all material category quantities, rounded up.

### Passive Bonuses

| Tier | Crafting Crit | XP Boost | Travel Reduction | Gathering Yield | Repair Cost |
|------|--------------|----------|-----------------|----------------|-------------|
| L1 | +5% | +5% | -10% | — | — |
| L2 | +10% | +10% | -20% | — | -10% |
| L3 | +15% | +15% | -30% | +15% | -15% |

### Signature Unlocks

Each project tier includes a passive bonus AND a signature unlock — a new feature or mechanic gated behind guild progression.

**Implementation scoping:** Signature unlocks are described here as design intent. Each unlock that involves a new game system (Enchanting, Legendary Crafting, Proving Grounds, Expedition Planning, Shared Map Intel) requires its own design spec before implementation. This redesign implements the project system rework, economy changes, and unlock gating. The unlock features themselves are follow-up work — completing a project marks the unlock as available in the database, but the feature behind it ships separately.

Simple unlocks that are variations of existing mechanics (Guild Crafting Station = existing crafting + bonus modifier, Sparring Ring = existing PvP with modified rules, Guild Bounty Board = contract-like system, Expedition Mastery = new tier entry in existing expedition constants) can ship with this redesign.

#### Forge Path (Crafting)
- **L1 — Guild Crafting Station:** Craft at the guild station with a small bonus success chance that stacks with personal skill. *Ships with redesign — modifier on existing crafting.*
- **L2 — Enchanting:** New system. Add a bonus stat to existing gear. Consumes materials + turns. *Follow-up spec required.*
- **L3 — Legendary Crafting:** Unlocks legendary-tier crafting recipes. Recipes require rare boss-drop materials + high-tier gathered components. *Follow-up spec required.*

#### War Room Path (Combat)
- **L1 — Guild Bounty Board:** Weekly rotating elite mob targets. Guild members who kill the target earn bonus loot + guild XP. Refreshes weekly. *Ships with redesign — similar to contract system.*
- **L2 — Sparring Ring:** Guild members can PvP each other with no turn cost, no rating change, no gold loss. 1-minute cooldown (matches town training dummy). *Ships with redesign — modified PvP rules.*
- **L3 — Proving Grounds:** Weekly solo challenge gauntlet. Fight a sequence of increasingly hard mobs with no healing between fights. Leaderboard within the guild, top performers earn treasury-funded prizes. *Follow-up spec required.*

#### Scout Path (Exploration)
- **L1 — Shared Map Intel:** Guild members' exploration reveals zone information (encounter sites, resource node locations) for all other guild members. *Follow-up spec required.*
- **L2 — Expedition Planning:** Choose expedition modifiers before launch. Options like harder enemies + better loot, or safer + less reward. *Follow-up spec required.*
- **L3 — Expedition Mastery:** Unlocks T4 expeditions (harder, better loot tables, more rooms). Also allows longer expedition runs. *Ships with redesign — new tier in existing expedition system.*

#### Cross-Path: Apothecary (L2)
The Apothecary project requires ANY L1 completion (unchanged). It does not belong to a specific path and has no signature unlock — its value is the passive perk (-10% repair cost) and serving as a prerequisite for L3 projects. No changes needed.

### Project Structure
- **Max active projects:** 1 (unchanged — forces path choice)
- **Prerequisites:** L2 requires specific L1 completion. Apothecary requires ANY L1 (unchanged exception). L3 requires two specific L2 completions. (Unchanged)
- **Project keys:** Existing project keys (`guild_forge`, `war_room`, `scout_network`, etc.) are preserved. The signature unlock names (Guild Crafting Station, Sparring Ring, etc.) are display names, not key changes.

## 3. Expedition Rework

### Current
Guild-wide cooldown (1 per week), 5-player party, treasury cost per tier (200k/500k/1M).

### New Model
- **Per-player per-tier weekly cooldown** replaces guild-wide cooldown. Each player can run 1 expedition per tier per week. A player can run a T1 and a T2 in the same week, but not two T1s.
- **Party size / min participants:** Reduced to a flat 5 for all tiers. Current `MIN_PARTICIPANTS_BY_TIER: [5, 8, 12]` makes T3 impossible for the 10-member baseline. New: `MIN_PARTICIPANTS_BY_TIER: [5, 5, 5, 5]`.
- Multiple expedition parties can run simultaneously. Per-player cooldowns are the natural throttle (a 10-member guild can run at most 2 parties of 5 per tier per week).

### Expedition Cooldown Data Model
New table `ExpeditionCooldown`:
- `id` (PK)
- `playerId` (FK → Player)
- `tier` (integer, 1-4)
- `expiresAt` (DateTime, computed as `now() + COOLDOWN_DURATION_DAYS` at expedition completion)
- Unique constraint: `[playerId, tier]`

**Lifecycle:** Upsert on `[playerId, tier]` — when a player completes an expedition, upsert the row with the new `expiresAt`. Before launching, check if a row exists with `expiresAt > now()`. No cleanup job needed — expired rows are overwritten on next expedition.

Replaces any existing guild-level cooldown tracking.

### Treasury Costs (Reduced)
| Tier | Current | New |
|------|---------|-----|
| T1 | 200,000 | 50,000 |
| T2 | 500,000 | 125,000 |
| T3 | 1,000,000 | 250,000 |
| T4 (new, requires Scout L3) | — | 400,000 |

Note: T2 cost (125k) exceeds treasury cap at guild levels <3 (cap 130k). T3 (250k) requires level 15+. T4 (400k) requires level 30+. This is intentional progression gating.

Math check: A 10-person guild running 2 T1 expeditions/week spends 100k treasury turns. At ~50k/day income that's 2 days of tax — meaningful but sustainable.

## 4. Boost Scaling

### Current
Three hard cliffs: <5 members = 50%, 5-9 = 75%, 10+ = 100%.

### New
**Linear scaling: 10% per active member, capped at 100%.** Active = activity within 48 hours (unchanged).

| Active Members | Boost Effectiveness |
|---------------|-------------------|
| 1 | 10% |
| 3 | 30% |
| 5 | 50% |
| 7 | 70% |
| 10+ | 100% |

Every new active member contributes equally. No cliffs.

### Upgrade Costs & Durations
Unchanged (5k-25k treasury, 2-hour duration). Reasonable operational costs now that projects don't compete for treasury.

### Stacking Rules
Unchanged — upgrades + project perks + specialization bonuses stack additively. Discovery spec stacking (#94) left as-is; monitor with player data.

## 5. Small Fixes

### Wire Up XP_PER_BOSS_ROUND (#95)
`GUILD_CONSTANTS.XP_PER_BOSS_ROUND` (value 10) is defined but never called. Add `addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_BOSS_ROUND)` in boss round resolution so guilds earn XP from boss fights.

### Tracker Issue Disposition
| Issue | Status | Resolution |
|-------|--------|------------|
| #1 | Fixed | Treasury no longer funds projects |
| #2 | Fixed | Turn cap raised to 50k, project goals adjusted, treasury cost removed |
| #27 | Fixed | Contract rewards buffed ~10x, renown added |
| #28 | Fixed | Linear 10% per active member scaling |
| #94 | Wontfix | Monitor with player data |
| #95 | Fixed | Wire up guild XP from boss rounds |

## 6. Future Investigation (GitHub Issues)

These ideas emerged during brainstorming but are out of scope for this redesign. Create GitHub issues for future exploration:

1. **Guild PvP / War Declarations** — structured many-vs-many guild combat using the existing raid resolver. Process rounds when all participants lock in.
2. **Tactical Formations for Expeditions** — party members choose roles (vanguard/flanker/rearguard) for situational combat buffs during expedition fights.
3. **Guild Raids** — multi-party coordinated encounters harder than expeditions with unique loot tables. Distinct from expeditions in scale and difficulty.

## Constants Changes Summary

```
GUILD_CONSTANTS:
  // Unchanged
  CREATION_TURN_COST: 50_000
  BASE_MAX_MEMBERS: 10
  MEMBERS_PER_TWO_LEVELS: 1
  MAX_TAX_RATE: 20
  TREASURY_BASE_CAP: 100_000
  TREASURY_CAP_PER_LEVEL: 10_000
  BOOST_ELIGIBILITY_WINDOW_HOURS: 48
  XP_PER_MOB_KILL: 1
  XP_PER_CRAFT: 2
  XP_PER_BOSS_ROUND: 10  // unchanged value, newly wired up
  XP_PER_MEMBER_JOIN: 50

  // Changed — respec cost
  SPECIALIZATION_RESPEC_COST: 500_000   // was 2_000_000

  // Changed — boost scaling
  BOOST_SCALING_PER_MEMBER: 0.10        // NEW (replaces 3 cliff constants)
  BOOST_SCALING_MAX: 1.0                // NEW
  // Remove: BOOST_SCALING_MIN_FULL, BOOST_SCALING_MIN_MEDIUM,
  //         BOOST_SCALING_FULL, BOOST_SCALING_MEDIUM, BOOST_SCALING_LOW

  // Changed — project contribution
  PER_PROJECT_TURN_CAP: 50_000          // was 10_000

  // Changed — contract rewards
  CONTRACT_REWARD_TREASURY_MIN: 5_000   // was 500
  CONTRACT_REWARD_TREASURY_MAX: 15_000  // was 2_000
  CONTRACT_REWARD_XP_MIN: 500           // was 200
  CONTRACT_REWARD_XP_MAX: 2_000         // was 800
  CONTRACT_REWARD_RENOWN_MIN: 50        // NEW
  CONTRACT_REWARD_RENOWN_MAX: 200       // NEW

EXPEDITION_CONSTANTS:
  // Changed — treasury costs + T4
  TREASURY_COST_BY_TIER: [50_000, 125_000, 250_000, 400_000]  // was [200_000, 500_000, 1_000_000]
  // Changed — participant requirements
  MIN_PARTICIPANTS_BY_TIER: [5, 5, 5, 5]  // was [5, 8, 12]
  // Changed — cooldown model
  COOLDOWN_TYPE: 'per_player_per_tier'  // was guild-wide
  COOLDOWN_DURATION_DAYS: 7             // per player per tier
  // New — T4 values
  LEVEL_REQUIREMENT_BY_TIER: [10, 16, 23, 30]  // was [10, 16, 23]; T4 = level 30
  ROOMS_BY_TIER: [5, 6, 8, 10]                 // was [5, 6, 8]; T4 = 10 rooms

PROJECT DEFINITIONS:
  // All projects: remove treasuryCost field
  // L1 turn goals: 100_000 → 150_000
  // L2 turn goals: 300_000-400_000 → 500_000
  // L3 turn goals: 1_000_000 → 1_000_000 (unchanged)
  // Material goals: apply 0.5x multiplier, round up

NEW SCHEMA:
  // ExpeditionCooldown table (see Section 3)
```
