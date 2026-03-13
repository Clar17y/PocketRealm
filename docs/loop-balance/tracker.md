# Balance Issue Tracker

Generated from overnight balance audit (2026-03-13). Each issue is reviewed via brainstorming session to determine if it's a real problem and whether to fix it.

## Status Legend

- `pending` - Not yet reviewed
- `confirmed` - Reviewed, confirmed as issue, fix planned
- `wontfix` - Reviewed, not fixing (by design or low impact)
- `deferred` - Real issue but not priority right now

---

## Critical Severity

| # | System | Issue | Source Report | Status | Plan |
|---|--------|-------|--------------|--------|------|
| 1 | Guild | Treasury cap blocks L2/L3 projects and respec (cap maxes at 500k, projects cost 1.5-5M) | guild-constants | `confirmed` | Guild Economy Redesign |
| 2 | Guild | Turn contribution caps make L2/L3 projects mathematically impossible (need 40-100 contributors, max guild size 30) | guild-constants | `confirmed` | Guild Economy Redesign |

## High Severity

| # | System | Issue | Source Report | Status | Plan |
|---|--------|-------|--------------|--------|------|
| 3 | Skills | Guild/shop XP boosts are nearly useless (+50% boost = +0.17% effective XP per window) | skill-constants | `confirmed` | XP Boost Fix |
| 4 | Item Rarity | Zero-cost forge at high skill levels (5+ levels above = 0 turn cost, unlimited free upgrades) | item-rarity-constants | `wontfix` | |
| 5 | PvP | Attacker disadvantage is severe (uses current HP, risks knockout/gold loss, defender uses max HP) | pvp-constants | `confirmed` | PvP Loss Penalty Fix |

## Medium Severity

| # | System | Issue | Source Report | Status | Plan |
|---|--------|-------|--------------|--------|------|
| 6 | Exploration | Extreme ambush dominance (6.25x more common than encounter sites) | exploration-constants | `confirmed` | Encounter Site Rework |
| 7 | Exploration | Travel ambush rate creates punishing zone transitions (~4 forced combats per travel) | exploration-constants | `wontfix` | |
| 8 | Skills | Marginal XP per level too flat at high levels (level 100 reachable in 43 days combat) | skill-constants | `confirmed` | XP Curve Rebalance |
| 9 | Skills | 2.14x non-combat vs combat XP gap (non-combat maxes 2x faster) | skill-constants | `pending` | |
| 10 | Item Rarity | Luck stat disproportionate value (100 luck = 6.5x reduction in legendary forge cost) | item-rarity-constants | `pending` | |
| 11 | Durability | Infinite item lifespan at MIN_MAX_DURABILITY floor (items never destroyed) | durability-constants | `pending` | |
| 12 | Durability | Repair max-durability decay uniform across rarities (legendary and common same decay) | durability-constants | `pending` | |
| 13 | Durability | Repair cost flat regardless of item tier/rarity | durability-constants | `pending` | |
| 14 | Crafting | Zero-cost craft-salvage loop (5+ levels above = free infinite item generation) | crafting-constants | `wontfix` | |
| 15 | Combat | Defence constant (100) hardcoded, not in gameConstants | combat-constants | `pending` | |
| 16 | Combat | PvP hit curve extreme sensitivity (exponent 2.4 makes small stat gaps decisive) | combat-constants | `pending` | |
| 17 | PvP | Rating 0 deadlock (bracket [0,0], no opponents) | pvp-constants | `pending` | |
| 18 | PvP | Low-rating bracket starvation (death spiral below ~400 rating) | pvp-constants | `pending` | |
| 19 | HP | Recovery cost scales punitively with vitality (high-vit players pay more turns) | hp-constants | `pending` | |
| 20 | Boss | Pure tanks lose aggro to healers over long fights (0 persistent threat from taunt/defend) | boss-encounter-constants | `pending` | |
| 21 | Boss | Tank contribution score structurally low (absorb only credited on single-target rounds) | boss-encounter-constants | `pending` | |
| 22 | Boss | Tier 5 boss fights may be extremely long (200+ rounds, 16+ hours real time) | boss-encounter-constants | `pending` | |
| 23 | Gathering | Floor() dead zone - 10 levels of zero yield progress | gathering-constants | `pending` | |
| 24 | Gathering | Low-tier farming strictly dominant for resources (67% more resources, 92% more gems) | gathering-constants | `pending` | |
| 25 | Flee | Knockout rate extremely high at level parity (70% on defeat) | flee-constants | `pending` | |
| 26 | Casino | No per-player bet limit per round (unlimited bets, max-bet bypass via same-number stacking) | casino-constants | `pending` | |
| 27 | Guild | Contract rewards negligible (<1% of treasury income) | guild-constants | `confirmed` | Guild Economy Redesign |
| 28 | Guild | Boost scaling cliffs at 5 and 10 members (50%->75%->100% jumps) | guild-constants | `confirmed` | Guild Economy Redesign |
| 29 | Potion | Mana potion tier gap (T1 -> T4, no mid-game mana potion) | potion-constants | `pending` | |
| 30 | Room/Clear | Decay exploit for full-clear (wait for mobs to decay, keep full-clear bonuses) | room-and-full-clear-constants | `confirmed` | Encounter Site Rework |
| 31 | Room/Clear | Large site mob count variance too high (6-20 mobs, 3.3x ratio) | room-and-full-clear-constants | `pending` | |
| 32 | Chest | Small chests have zero recipe chance | chest-constants | `pending` | |
| 33 | World Event | Global spawn cooldown prevents zone+world events from co-spawning | world-event-constants | `pending` | |
| 34 | Stamina/Mana | Passive regen doesn't scale with level (flat 1.0/0.5 per second) | stamina-mana-constants | `pending` | |
| 35 | Item Rarity | dropChanceMultiplier asymmetry (multiplies non-common weights, doesn't reduce common) | item-rarity-constants | `pending` | |

## Low Severity

| # | System | Issue | Source Report | Status | Plan |
|---|--------|-------|--------------|--------|------|
| 36 | Exploration | Hidden cache near-impossibility at low turn counts (9.5% at 1000 turns) | exploration-constants | `pending` | |
| 37 | Exploration | Encounter site decay rate misaligned with discovery rate (sites accumulate) | exploration-constants | `confirmed` | Encounter Site Rework |
| 38 | Exploration | Min exploration (10 turns) is nearly valueless | exploration-constants | `pending` | |
| 39 | Exploration | Potential exploit with spawnRateMultiplier stacking | exploration-constants | `pending` | |
| 40 | Skills | Window-based cap creates degenerate multi-skill rotation | skill-constants | `pending` | |
| 41 | Skills | Level 1 to 10 is trivially fast | skill-constants | `pending` | |
| 42 | Item Rarity | Geometric sell multiplier vs exponential forge cost (minor) | item-rarity-constants | `pending` | |
| 43 | Item Rarity | Failure destroys item (design consideration for high tiers) | item-rarity-constants | `pending` | |
| 44 | Durability | Degradation rate too low for meaningful resource sink (909 fights to break) | durability-constants | `pending` | |
| 45 | Durability | Binary broken penalty (full stats at 0.01 durability, zero at 0) | durability-constants | `pending` | |
| 46 | Durability | No scaling of degradation with fight difficulty | durability-constants | `pending` | |
| 47 | Crafting | Epic craft chance cap very low (0.4% max) | crafting-constants | `pending` | |
| 48 | Crafting | Salvage harshness at low material quantities (50-67% loss at 2-3 materials) | crafting-constants | `pending` | |
| 49 | Crafting | Luck stat dominance in crafting | crafting-constants | `pending` | |
| 50 | Combat | Heavy attack strictly dominated in long fights | combat-constants | `pending` | |
| 51 | Combat | Light attack as infinite sustain | combat-constants | `pending` | |
| 52 | Combat | Crit stacking creates gear gap (base 2.5% vs max 22% damage increase) | combat-constants | `pending` | |
| 53 | Combat | Boss hit floor too generous (35% min) | combat-constants | `pending` | |
| 54 | PvP | K-factor too high for small population (K=32 causes volatility) | pvp-constants | `pending` | |
| 55 | PvP | Unused constant MIN_OPPONENTS_SHOWN | pvp-constants | `pending` | |
| 56 | PvP | Revenge chain exploitation (cheap alternating attacks) | pvp-constants | `pending` | |
| 57 | HP | Flat heal potions obsolete at high HP | hp-constants | `pending` | |
| 58 | HP | Wounded escape flat 1 HP inconsistency (doesn't scale with maxHP) | hp-constants | `pending` | |
| 59 | Boss | Free-rider floor at 50% loot is generous | boss-encounter-constants | `pending` | |
| 60 | Boss | BOSS_SINGLE_TARGET_DAMAGE_BY_TIER appears unused | boss-encounter-constants | `pending` | |
| 61 | Gathering | XP scaling too weak (12 XP/action max at node level 30) | gathering-constants | `pending` | |
| 62 | Gathering | XP cap unreachable (15,000 window cap never constrains) | gathering-constants | `pending` | |
| 63 | Flee | Evasion investment has poor ROI for flee (+2% per level) | flee-constants | `pending` | |
| 64 | Flee | Gold loss has no floor (perverse incentive to spend immediately) | flee-constants | `pending` | |
| 65 | Flee | Wounded escape barely better than knockout | flee-constants | `pending` | |
| 66 | Flee | No interaction with "how close the fight was" | flee-constants | `pending` | |
| 67 | Casino | No bet diversity restriction (same-number stacking bypasses max bet) | casino-constants | `pending` | |
| 68 | Casino | BIG_WIN_THRESHOLD too low (500g triggers on every max-bet even-money win) | casino-constants | `pending` | |
| 69 | Casino | Exchange rate creates no friction (1:1 turn-to-gold) | casino-constants | `pending` | |
| 70 | Potion | Dead code: AUTO_POTION_SICKNESS_DURATION (conflicts with actual value) | potion-constants | `pending` | |
| 71 | Potion | Dead constants: Recovery percent potions (orphaned, no items exist) | potion-constants | `pending` | |
| 72 | Potion | Mana potion values asymmetrically low vs stamina (~30% less) | potion-constants | `pending` | |
| 73 | Turn | Respec under max guild tax nearly impossible (96.5% of bank cap) | turn-constants | `pending` | |
| 74 | Turn | No turn sink for high-activity endgame | turn-constants | `pending` | |
| 75 | Room/Clear | Large full-clear weak reward premium (no chest tier upgrade, already capped at rare) | room-and-full-clear-constants | `pending` | |
| 76 | Room/Clear | Admin/player site generation divergence | room-and-full-clear-constants | `pending` | |
| 77 | Room/Clear | Medium per-room mob range identical to small | room-and-full-clear-constants | `pending` | |
| 78 | Chest | Large sites less material-roll-efficient than medium | chest-constants | `pending` | |
| 79 | Chest | No chest tier above rare (caps reward ceiling) | chest-constants | `pending` | |
| 80 | World Event | Dead code: HEALER_MAGIC_SCALING and ATTACKER_TURN_SCALING | world-event-constants | `pending` | |
| 81 | World Event | Persisted mob regen floor issue (low-HP mobs never heal) | world-event-constants | `pending` | |
| 82 | World Event | Uniform event durations (all 6 hours, no variation) | world-event-constants | `pending` | |
| 83 | World Event | Boss discovery via exploration vanishingly rare (3.16% at 10k turns) | world-event-constants | `pending` | |
| 84 | Character | Evasion triple-duty underpriced vs other defensive attributes | character-constants | `pending` | |
| 85 | Character | Absolute attributePoints write in XP service (race condition bug) | character-constants | `pending` | |
| 86 | Stamina/Mana | No mana-neutral spell (magic always depletes, falls back to Light Attack) | stamina-mana-constants | `pending` | |
| 87 | Stamina/Mana | Three-skill average for stamina creates specialist penalty | stamina-mana-constants | `pending` | |
| 88 | Stamina/Mana | Rest heal rates don't scale with level | stamina-mana-constants | `pending` | |
| 89 | Hidden Cache | Empty caches possible in barren zones (1-in-10k event with no reward) | hidden-cache-constants | `pending` | |
| 90 | Hidden Cache | No legendary tier in cache rarity weights | hidden-cache-constants | `pending` | |
| 91 | Inventory/Sell | 50% durability cliff on sell price (harsh binary threshold) | inventory-sell-constants | `pending` | |
| 92 | Inventory/Sell | Gold has few sinks (accumulates indefinitely) | inventory-sell-constants | `pending` | |
| 93 | Inventory/Sell | Champion bonus slots dead code (hardcoded false) | inventory-sell-constants | `pending` | |
| 94 | Guild | Discovery spec gathering yield may over-stack (up to 95%) | guild-constants | `confirmed` | Guild Economy Redesign |
| 95 | Guild | XP_PER_BOSS_ROUND appears unused/unimplemented | guild-constants | `confirmed` | Guild Economy Redesign |

## Implementation Plans

Links to implementation plans for confirmed fixes:

_(none yet)_

---

## Review Log

Decisions made during brainstorming sessions are recorded here.

### 2026-03-13 — Issue #8: XP Curve Too Flat

**Decision:** Confirmed. Two changes:
1. Bump `XP_EXPONENT` from 1.8 → 2.0 (roughly doubles time-to-max)
2. Bump `XP_WINDOW_HOURS` from 6 → 12 (less grind-heavy, don't need to log in every 6 hours, 2 windows/day → 1 window/day effective)
Needs playtesting after change. At exponent 2.0: combat skill level 100 ~107 days, non-combat ~50 days.

### 2026-03-13 — Issue #7: Travel Ambush Rate

**Decision:** Wontfix. Intentional friction, manageable with health potions since ambushes are 1v1. Travel ambush farming is ~3.3x more turn-efficient for raw combat but sacrifices encounter sites, resource nodes, caches, and zone exploration progress. Acceptable tradeoff.

### 2026-03-13 — Issues #6, #30, #37: Encounter Sites

**Decision:** Confirmed. Bundle as **Encounter Site Rework**:
1. Increase `ENCOUNTER_SITE_CHANCE_PER_TURN` (0.0008 → ~0.0015)
2. Increase `ENCOUNTER_SITE_DECAY_RATE_PER_HOUR` (0.06 → ~0.25)
3. Fix decay exploit — disable full-clear bonus if any mobs decayed since strategy selection
4. **Design exploration: multi-mob rooms** — all mobs in a room fight at once instead of sequential 1v1. Potentially reuse the raid-resolver (boss round engine) with a party of 1. Needs its own brainstorming session for combat implications.

### 2026-03-13 — Issue #5: PvP Attacker Disadvantage

**Decision:** Confirmed. Two changes:
1. **Remove gold loss from PvP entirely** — no gold transfer, no gold penalty on PvP defeat.
2. **Replace knockout with guaranteed flee on PvP loss** — skip the knockout roll entirely. Instead, always roll as a "successful flee" using the existing wounded/clean escape distribution (weighted toward 1 HP outcome, with a smaller chance of the higher HP clean escape). Attacker using current HP/stamina/mana stays intentional — that's the anti-spam gate.

### 2026-03-13 — Issues #4, #14: Zero-Cost Forge/Salvage

**Decision:** Wontfix. Crafting (item creation) always costs full turns — the discount only applies to forge upgrades and salvage. Since every item must be crafted first (real turn cost) and salvage always loses ~40% of bulk materials, there's no infinite loop. The material sink is the real gate, not turns. Zero-cost forge/salvage at high skill is a convenience reward for progression, not an exploit.

### 2026-03-13 — Issue #3: XP Boosts Nearly Useless

**Decision:** Confirmed. Fix A — move boost application to **after** the efficiency multiplier in `xpService.ts`. Currently: `boostedXp = raw * (1+boost)` → `applyXpGain(boostedXp)`. Change to: `applyXpGain(rawXp)` → `finalXp = xpAfterEfficiency * (1+boost)`. This makes a 15% boost genuinely yield 15% more effective XP. Need to consider total boost cap (guild upgrade + specialization + shop potion stacking) — may want a max combined boost of 30-50% to prevent runaway stacking.

### 2026-03-13 — Issues #1, #2, #27, #28, #94, #95: Guild Economy

**Decision:** Confirmed. All bundled under **Guild Economy Redesign** — needs a full brainstorming/design session, not just constant tweaks. The entire guild treasury economy is overtuned: costs assume turn income that doesn't exist at realistic guild sizes and tax rates. Project contribution categories (e.g. exploration turns) don't match real player behavior. Target pacing: T1 project in ~1 week, T2 in ~1 month, T3 in ~2-3 months for a 10-member guild at 10% tax. Needs redesign before general release.
