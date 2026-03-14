# WORLD_EVENT_CONSTANTS Analysis

## Current Values

### Event Duration & Caps

| Constant | Value | Purpose |
|---|---|---|
| `RESOURCE_EVENT_DURATION_HOURS` | 6 | Duration for zone resource events |
| `MOB_EVENT_DURATION_HOURS` | 6 | Duration for zone mob events |
| `WORLD_WIDE_EVENT_DURATION_HOURS` | 6 | Duration for global events |
| `MAX_ZONE_EVENTS` | 2 | Max concurrent events per zone |
| `MAX_WORLD_EVENTS` | 1 | Max concurrent world-wide events |
| `EVENT_RESPAWN_DELAY_MINUTES` | 30 | Cooldown between any new event spawns |
| `EVENT_DISCOVERY_CHANCE_PER_TURN` | 0.0001 | Per-turn chance to discover an event while exploring |

### Boss Spawning & Timing

| Constant | Value | Purpose |
|---|---|---|
| `BOSS_DISCOVERY_CHANCE` | 0.05 | Chance a player event_discovery triggers a boss instead of a regular event |
| `MAX_BOSS_ENCOUNTERS` | 1 | Max concurrent boss encounters globally |
| `BOSS_INITIAL_WAIT_MINUTES` | 15 | Time before first boss round resolves |
| `BOSS_ROUND_INTERVAL_MINUTES` | 5 | Time between boss rounds |
| `BOSS_SIGNUP_TURN_COST` | 200 | Turns spent per round signup |

### Boss Tier Scaling

| Constant | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| `BOSS_HP_PER_PLAYER_BY_TIER` | 200 | 500 | 1,000 | 2,000 | 4,000 |
| `BOSS_AOE_PER_PLAYER_BY_TIER` | 15 | 30 | 50 | 80 | 120 |
| `BOSS_DEFENCE_BY_TIER` | 5 | 12 | 20 | 35 | 50 |
| `BOSS_BASE_XP_REWARD_BY_TIER` | 100 | 250 | 500 | 1,000 | 2,000 |

### Boss Rewards

| Constant | Value | Purpose |
|---|---|---|
| `BOSS_RECIPE_DROP_CHANCE` | 0.15 | Per-contributor chance to unlock an advanced recipe |
| `BOSS_RARITY_BONUS` | 5 | Added to mob level for loot rarity rolls |
| `BOSS_TROPHY_DROPS` | (map) | Guaranteed trophy materials per boss name |

### Persisted Mobs

| Constant | Value | Purpose |
|---|---|---|
| `PERSISTED_MOB_REGEN_PERCENT_PER_MINUTE` | 1 | Mob HP regen: 1% of maxHp per minute |
| `PERSISTED_MOB_REENCOUNTER_CHANCE` | 0.3 | Chance to re-encounter a persisted damaged mob |
| `PERSISTED_MOB_MAX_AGE_MINUTES` | 120 | Cleanup threshold: delete mobs older than this |

### Unused/Legacy

| Constant | Value | Purpose |
|---|---|---|
| `HEALER_MAGIC_SCALING` | 0.02 | Referenced only in design docs, not in source code |
| `ATTACKER_TURN_SCALING` | 0.001 | Referenced only in design docs, not in source code |

## Analysis

### 1. Event Spawn Cadence

The scheduler (`checkAndSpawnEvents`) runs every 60 seconds via a server-side timer. The spawn logic:

1. Expire stale events (those past `expiresAt`).
2. Resolve due boss rounds.
3. Check respawn cooldown: if *any* event was created within the last 30 minutes (`EVENT_RESPAWN_DELAY_MINUTES`), skip spawn entirely.
4. 50/50 roll for world-wide vs zone event.

**Steady-state throughput:**

With a 6-hour duration and 30-minute cooldown, the theoretical maximum is:
- One new event every 30 minutes = 12 events per 6-hour window.
- But `MAX_ZONE_EVENTS = 2` per zone and `MAX_WORLD_EVENTS = 1` caps the active pool.

With, say, 10 wild zones, the total active cap is 10 * 2 + 1 = 21 zone events + 1 world event. Since the spawn rate is 1 per 30 minutes and events last 6 hours, the active count at equilibrium approaches 12. This is well within the 21-slot cap, so the caps rarely throttle spawning. The 30-minute cooldown is the actual bottleneck.

**Edge case:** The cooldown checks `startedAt >= (now - 30min)` across *all* events, not per-zone. A zone event spawn resets the cooldown for world events and vice versa. This means zone and world events share a single spawn pipeline and cannot spawn within 30 minutes of each other.

### 2. Event Discovery During Exploration

`EVENT_DISCOVERY_CHANCE_PER_TURN = 0.0001` (0.01% per turn).

Using the cumulative probability formula `P = 1 - (1 - p)^n`:

| Turns Spent | Cumulative Discovery Chance |
|---|---|
| 100 | 0.995% |
| 500 | 4.88% |
| 1,000 | 9.52% |
| 5,000 | 39.4% |
| 10,000 | 63.2% |

At the maximum exploration slider (10,000 turns), players have a 63% chance to discover an event. At typical exploration amounts (500-2,000 turns), the chance is 5-18%. This makes event discovery a rare bonus -- players will encounter one roughly every 5-10 full exploration runs.

When an event_discovery fires, there is a second roll:
- 5% chance (`BOSS_DISCOVERY_CHANCE`) it spawns a boss (if the boss cap allows).
- Otherwise, it spawns a regular event from the weighted template pool.

Combined probability for a boss discovery in a single 10,000-turn exploration: `0.632 * 0.05 = 3.16%`. This is extremely rare, making player-discovered bosses a memorable event.

### 3. Boss Spawn Rate from Scheduler

Boss spawning is now driven by a dedicated timer rather than a probabilistic roll inside `trySpawnZoneEvent`. The `BOSS_SPAWN_CHANCE` constant has been removed.

`BOSS_SPAWN_INTERVAL_HOURS: 12` — a boss is spawned every 12 hours via `checkAndSpawnBoss`, independent of the zone event pipeline.

With `MAX_BOSS_ENCOUNTERS = 1`, the server can have at most one active boss. If a boss fight takes 2-4 hours (see boss encounter analysis), the effective boss availability is roughly one boss fight per 12-14 hours, which creates scarcity appropriate for a rare world event.

### 4. Event Modifier Stacking

Zone events and world events stack multiplicatively. The `applyModifier` function:
```
case 'damage_up': mods.mobDamageMultiplier *= (1 + event.effectValue)
```

With `MAX_ZONE_EVENTS = 2` per zone and `MAX_WORLD_EVENTS = 1`, the worst case is 3 events stacking:
- Zone: "Frenzy" (damage_up +25%)
- Zone: "{target} Uprising" (damage_up +40%, family-targeted)
- World: "Blood Moon" (damage_up +40%, Witches-targeted)

If all three apply to the same mob family: `1.25 * 1.40 * 1.40 = 2.45x` damage.

However, the spawn logic prevents duplicate effectTypes in the same zone (`existing = findFirst where effectType = same`). So a zone cannot have two `damage_up` events. The maximum same-zone stacking is one zone event + one world event of the same effectType: `1.25 * 1.40 = 1.75x` (zone-wide + family-specific).

The multiplicative model with the 0.1 floor on _down effects means negative stacking bottoms out at 10% of base value. Two `hp_down` events: `(1-0.20) * max(0.1, 1-0.30) = 0.80 * 0.70 = 0.56x`. This creates meaningful difficulty/ease variation without breaking combat.

### 5. Persisted Mob Regen Economy

Mobs that flee combat are saved to the database with their current HP. They regen at `1% maxHp per minute`.

**Full heal time by mob HP:**

| Mob Max HP | Time to Full Heal from 1 HP |
|---|---|
| 50 | 100 minutes |
| 200 | 100 minutes |
| 1,000 | 100 minutes |

Since regen is percentage-based, all mobs take exactly 100 minutes to fully regenerate from near-zero, regardless of absolute HP. The `PERSISTED_MOB_MAX_AGE_MINUTES = 120` cleanup runs every 5 minutes (server timer) and deletes mobs damaged more than 2 hours ago. Since full regen takes ~100 minutes, mobs will have fully regenerated before the 120-minute cleanup. This means the cleanup only catches edge cases (mobs that somehow weren't re-encountered and deleted via the full-heal check).

**Re-encounter math:**

`PERSISTED_MOB_REENCOUNTER_CHANCE = 0.3` means 30% chance per exploration to re-encounter a damaged mob (if one exists for the player in that zone + mob template). Combined with the exploration ambush system:
- When exploration generates a mob encounter, the route code checks `checkPersistedMobReencounter` first.
- 30% of the time, the player faces the damaged mob instead of a fresh one.
- 70% of the time, they face a fresh mob as normal.

After a failed flee where the mob survives with, say, 30% HP:
- At t=0: mob has 30% HP. Re-encounter at 30% chance gives 30% of encounters as a 30% HP mob.
- At t=30min: mob has 60% HP. Still possible to re-encounter.
- At t=70min: mob has 100% HP. `checkPersistedMobReencounter` deletes the record, no re-encounter.

The practical window for a meaningful re-encounter (mob still damaged) is ~70 minutes post-flee. Given exploration is done in bursts, a player who flees and immediately re-explores has a good chance of finishing off the mob.

### 6. Boss XP Rewards vs Normal Combat

| Tier | Boss Base XP | Normal Combat XP (estimated) | Ratio |
|---|---|---|---|
| 1 | 100 | ~20-30 | 3-5x |
| 2 | 250 | ~40-60 | 4-6x |
| 3 | 500 | ~60-100 | 5-8x |
| 4 | 1,000 | ~100-150 | 7-10x |
| 5 | 2,000 | ~150-250 | 8-13x |

Boss XP scales more aggressively than normal combat. At tier 5, a boss kill grants 8-13x the XP of a normal encounter. But the turn cost is higher: 200 turns per round across many rounds (total 2,000-10,000 turns) vs 50 turns for a normal encounter.

**XP per turn comparison (tier 5):**
- Normal combat: ~200 XP / 50 turns = 4.0 XP/turn
- Boss fight (5 players, 20 rounds): 2,000 XP / (200 * 20 = 4,000 turns) = 0.5 XP/turn

Bosses are 8x worse in XP-per-turn than normal grinding. The value proposition of bosses is not XP efficiency but the 15% recipe drop chance, trophy materials, and the +5 rarity bonus on loot rolls. Boss fights are a loot gamble, not an XP farm.

### 7. Event Template Weight Distribution

Zone-scoped templates total weight: 15+10+15+10+20+10+15+10+15+10+10+10+15+10+15 = 190.

World-scoped templates: 19 mob families * 8 + 24 resource types * 8 + 6 generic mob * 6 + 4 generic resource * 6 = 152 + 192 + 36 + 24 = 404.

The `pickWeighted` function selects based on these weights. Zone events are split roughly: 50% resource events (weight 70/190 = 37%) vs 50% mob events (weight 100/190 = 53%) with family-targeted mob events at weight 40/190 = 21%.

For world-wide events, signature templates (weight 8) dominate over generics (weight 6). A specific mob family like "Wolves" has weight 8 out of 404 = 2.0% chance per spawn. A generic template like "Mass Migration" has weight 6 out of 404 = 1.5% chance. Players will see a decent variety of world events, though some families/resources may feel over-represented due to the large number of similar-weight templates.

### 8. Uniform Duration Problem

All three duration constants are identical at 6 hours:
- `RESOURCE_EVENT_DURATION_HOURS: 6`
- `MOB_EVENT_DURATION_HOURS: 6`
- `WORLD_WIDE_EVENT_DURATION_HOURS: 6`

This means every event lasts exactly 6 hours regardless of impact. A world-wide "Blood Moon" (+40% Witch damage) has the same duration as a localized "Bountiful Harvest" (+25% zone yield). This flattens the economy of events: there is no temporal tradeoff where powerful events are shorter or weaker events are longer.

## Issues Found

### Issue 1: HEALER_MAGIC_SCALING and ATTACKER_TURN_SCALING are dead code (Low)
These constants are defined in `WORLD_EVENT_CONSTANTS` but never imported or referenced in any source file. They appear only in design documents from the original boss system proposal that was replaced by the round-based engine. They add noise to the constant group.

### Issue 2: Global spawn cooldown prevents zone+world events from co-spawning (Low-Medium)
The 30-minute `EVENT_RESPAWN_DELAY_MINUTES` cooldown checks all events globally. A zone event in Zone A resets the cooldown, blocking a world event that would otherwise spawn. With 10+ zones, this creates contention where zone events "steal" cooldown windows from world events (and vice versa). The 50/50 split partially mitigates this, but the system cannot spawn a zone event and a world event in the same 30-minute window.

### Issue 3: Persisted mob regen floor issue with low-HP mobs (Low)
The regen formula uses `Math.floor(maxHp * regenPercent / 100)`. For a mob with maxHp=3, after 1 minute: `floor(3 * 1 / 100) = floor(0.03) = 0`. The mob regenerates 0 HP per minute and never heals. It will persist until the 120-minute cleanup. This only affects mobs with maxHp < 100, where the per-minute regen rounds to zero. These mobs effectively have no passive regeneration.

### Issue 4: Uniform event durations miss a balance lever (Low)
All events last exactly 6 hours. World-wide events with strong modifiers (e.g., +40% damage) have the same duration as minor zone buffs (+25% yield). Differentiating durations (e.g., 4h for world events, 8h for weak zone events) would add strategic depth: powerful events are windows of opportunity, while weak ones are background ambiance.

### Issue 5: Boss discovery via exploration is vanishingly rare (Low)
Combined probability of player-triggered boss spawn (10,000 turns): 3.16%. At more typical exploration amounts (1,000 turns), it drops to 0.48%. The scheduler-driven boss spawn (expected every ~10 hours) dominates boss availability. Player discovery is so rare it may never happen in a normal play session, making the mechanic invisible to most players.

## Recommendations

### R1: Remove dead constants
Delete `HEALER_MAGIC_SCALING` and `ATTACKER_TURN_SCALING` from `WORLD_EVENT_CONSTANTS`. They are artifacts of a superseded design and confuse readers.

### R2: Consider per-scope cooldowns
Split `EVENT_RESPAWN_DELAY_MINUTES` into separate zone and world cooldowns (e.g., 20 min zone, 45 min world). This would allow zone events to spawn more frequently without blocking world events, and would make world events feel appropriately rare and impactful.

### R3: Use Math.ceil for persisted mob regen
Change `Math.floor` to `Math.ceil` in `calculatePersistedMobHp` to guarantee at least 1 HP regen per minute for any mob. This fixes the never-healing problem for mobs with maxHp < 100.

### R4: Differentiate event durations
Set `WORLD_WIDE_EVENT_DURATION_HOURS: 4` and keep zone durations at 6. Shorter world events create urgency (players rush to exploit them) while zone events remain as longer ambient conditions.

### R5: Increase BOSS_DISCOVERY_CHANCE
Raising from 0.05 to 0.15 would make the combined probability per 10,000-turn exploration ~9.5%, giving engaged explorers a meaningful chance at discovering a boss. The `MAX_BOSS_ENCOUNTERS = 1` cap still prevents boss flooding.

## Risk Level

**low** -- The world event system is structurally sound. The spawn cadence, modifier stacking, and caps interact correctly. The main issues are minor: dead code, a rounding edge case on tiny mobs, and some missed balance levers around duration and cooldown granularity. No values create degenerate gameplay or economy-breaking exploits.
