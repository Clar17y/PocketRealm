# ROOM_CONSTANTS & FULL_CLEAR_CONSTANTS Analysis

## Current Values

### ROOM_CONSTANTS
| Key | Value |
|-----|-------|
| ROOMS_SMALL | { min: 1, max: 1 } |
| ROOMS_MEDIUM | { min: 2, max: 2 } |
| ROOMS_LARGE | { min: 3, max: 4 } |
| MOBS_PER_ROOM_SMALL | { min: 2, max: 4 } |
| MOBS_PER_ROOM_MEDIUM | { min: 2, max: 4 } |
| MOBS_PER_ROOM_LARGE | { min: 2, max: 5 } |

### FULL_CLEAR_CONSTANTS
| Key | Value |
|-----|-------|
| DROP_MULTIPLIER | 1.5 |
| RECIPE_MULTIPLIER | 1.5 |
| CHEST_TIER_UPGRADE | true |

### Related Constants (EXPLORATION_CONSTANTS)
| Key | Value |
|-----|-------|
| ENCOUNTER_SITE_CHANCE_PER_TURN | 0.0008 |
| ENCOUNTER_SITE_DECAY_RATE_PER_HOUR | 0.06 |
| ENCOUNTER_TURN_COST (COMBAT_CONSTANTS) | 50 |

### Related Constants (CHEST_CONSTANTS)
| Key | Value |
|-----|-------|
| CHEST_RECIPE_CHANCE_SMALL | 0 |
| CHEST_RECIPE_CHANCE_MEDIUM | 0.02 |
| CHEST_RECIPE_CHANCE_LARGE | 0.05 |
| CHEST_MATERIAL_ROLLS_SMALL | { min: 1, max: 2 } |
| CHEST_MATERIAL_ROLLS_MEDIUM | { min: 2, max: 4 } |
| CHEST_MATERIAL_ROLLS_LARGE | { min: 3, max: 6 } |

## Analysis

### 1. Total Mob Count Distribution by Site Size

The room generator creates rooms independently, each with a random mob count. Total mobs = sum of per-room rolls.

**Small sites (1 room):**
- Min mobs: 1 * 2 = 2
- Max mobs: 1 * 4 = 4
- Expected: 1 * 3 = 3
- Distribution: uniform over {2, 3, 4}

**Medium sites (2 rooms, each 2-4 mobs):**
- Min mobs: 2 * 2 = 4
- Max mobs: 2 * 4 = 8
- Expected: 2 * 3 = 6
- Distribution: sum of two uniform(2,4) variables. Probabilities:
  - 4 mobs: 1/9 (11.1%)
  - 5 mobs: 2/9 (22.2%)
  - 6 mobs: 3/9 (33.3%)
  - 7 mobs: 2/9 (22.2%)
  - 8 mobs: 1/9 (11.1%)

**Large sites (3-4 rooms, each 2-5 mobs):**
- 3 rooms: min 6, max 15, expected 10.5
- 4 rooms: min 8, max 20, expected 14
- Blended expected (50/50 room count): 12.25
- Distribution: sum of 3-4 uniform(2,5) variables. For 3 rooms, the sum follows a convolution of three discrete uniforms on {2,3,4,5}. The central tendency clusters around 10-11 for 3 rooms, 13-15 for 4 rooms.

### 2. Turn Cost Analysis

Each mob costs ENCOUNTER_TURN_COST = 50 turns. All turns are charged upfront for a full-clear attempt.

| Size | E[Mobs] | E[Turn Cost] | Min Cost | Max Cost |
|------|---------|-------------|----------|----------|
| Small | 3 | 150 | 100 | 200 |
| Medium | 6 | 300 | 200 | 400 |
| Large | 12.25 | 612 | 300 | 1,000 |

Compared to single zone combat (50 turns per fight), encounter sites represent 2x-20x the turn investment. At 1 turn/second regen, a large full-clear costs ~10-17 minutes of banked turns.

### 3. Full-Clear vs Room-by-Room: Expected Value Comparison

**Full-clear bonuses:**
1. Chest tier upgrade: small->medium, medium->large, large->large (caps at large)
2. Drop multiplier: 1.5x on chest material rolls
3. Recipe multiplier: 1.5x on recipe chance

**Full-clear cost:** All remaining mobs charged upfront. Defeat resets strategy to room-by-room (no refund).

**Chest reward comparison for a medium site:**

| Strategy | Chest Rarity | E[Material Rolls] | Recipe Chance |
|----------|-------------|-------------------|---------------|
| Room-by-room | uncommon | 3.0 | 2% |
| Full-clear | rare | ceil(avg(3,6)*1.5) = ceil(6.75) = 7 | 5% * 1.5 = 7.5% |

For medium sites, full-clear upgrades uncommon chest to rare AND multiplies rolls by 1.5x. The material roll improvement is dramatic: from E[3.0] to E[7] (2.33x effective multiplier due to both tier upgrade and roll multiplier stacking).

**Chest reward comparison for a large site:**

| Strategy | Chest Rarity | E[Material Rolls] | Recipe Chance |
|----------|-------------|-------------------|---------------|
| Room-by-room | rare | 4.5 | 5% |
| Full-clear | rare (capped) | ceil(4.5*1.5) = 7 | 5% * 1.5 = 7.5% |

Large sites gain only the 1.5x multiplier since chest rarity is already capped at rare. The diminishing return is significant -- large full-clears are less rewarding relative to their risk than medium full-clears.

**Chest reward comparison for a small site:**

| Strategy | Chest Rarity | E[Material Rolls] | Recipe Chance |
|----------|-------------|-------------------|---------------|
| Room-by-room | common | 1.5 | 0% |
| Full-clear | uncommon | ceil(avg(2,4)*1.5) = ceil(4.5) = 5 | 2% * 1.5 = 3% |

Small sites get the biggest relative boost from full-clear (common->uncommon), but the absolute values are still modest.

### 4. Decay Pressure and Time-to-Act

ENCOUNTER_SITE_DECAY_RATE_PER_HOUR = 0.06 mobs/hour. This means:
- After 1 hour: floor(0.06) = 0 mobs decayed
- After 17 hours: floor(1.02) = 1 mob decayed
- After 34 hours: floor(2.04) = 2 mobs decayed

This is an extremely slow decay. A small site with 2 mobs takes ~34 hours to fully decay. A large site with 12 mobs takes ~200 hours (8.3 days) to fully decay. This is essentially cosmetic pressure -- players have days to act on any discovery.

However, once the site fully decays (all alive mobs become decayed), the site is auto-deleted. The critical question is: does decay of a single mob prevent full-clear? Looking at the code in `start.ts` line 380:

```
fullClearBonus: siteStrategy === 'full_clear' && siteFullClearActive
```

The `fullClearActive` flag is set when the strategy is chosen and only cleared on player defeat. Mob decay does NOT disable full-clear. So a player can let mobs decay, reducing the remaining mob count (and turn cost), while still getting full-clear bonuses. This is a potential exploit.

### 5. Role Composition and Power Curve

From `buildEncounterSiteMobs` in `helpers.ts`:
- Small: 0 bosses, 0 elites, all trash
- Medium: 0 bosses, 1 elite, rest trash
- Large: 1 boss, 2 elites, rest trash

For a large site with 12 mobs: 1 boss + 2 elites + 9 trash. The boss and elites are placed in later rooms (they're appended to the role queue after trash). This means the first room(s) are a warmup, and the difficulty spikes at the end.

With HP carrying between fights (roomCarryHp), this creates a war of attrition. If a player enters the final room with low HP, they face the hardest enemies. This is well-designed tension -- but the potion pool is shared across the entire site, so potion consumption in early rooms depletes resources for the boss room.

### 6. Defeat Penalty Asymmetry

On defeat during full-clear:
1. Strategy is downgraded to room-by-room (line 436-439)
2. All turns already spent are lost (no refund)
3. roomCarryHp is reset to null
4. Player incurs flee/knockout penalties

On defeat during room-by-room:
1. Defeated mobs in the current room are RESET to alive (line 441-448)
2. Turns spent on that room's mobs are lost
3. roomCarryHp is reset

The defeat penalty for full-clear is severe: you lose ALL upfront turn costs AND lose the full-clear bonus permanently. Room-by-room defeat only costs the current room's turns but resets that room's progress.

### 7. ROOM_CONSTANTS vs EXPLORATION_CONSTANTS Encounter Size Conflict

There's an inconsistency: EXPLORATION_CONSTANTS defines `ENCOUNTER_SIZE_SMALL/MEDIUM/LARGE` as the raw mob counts per site ({2-3}, {4-6}, {7-10}). ROOM_CONSTANTS defines rooms and per-room mob counts independently. Let's see if total mobs from rooms align:

| Size | EXPLORATION_CONSTANTS range | ROOM_CONSTANTS total range |
|------|---------------------------|--------------------------|
| Small | 2-3 | 2-4 |
| Medium | 4-6 | 4-8 |
| Large | 7-10 | 6-20 |

The room system can generate MORE mobs than the original encounter size specification. For large sites, the room system can produce up to 20 mobs (4 rooms * 5 mobs) vs the original cap of 10. The admin route still uses the old ENCOUNTER_SIZE values.

This mismatch means:
- Admin-spawned encounter sites have 7-10 mobs for large
- Player-discovered sites have 6-20 mobs for large
- The upper bound of 20 mobs = 1,000 turn cost for a large full-clear, which is significant (16.7 minutes of regen)

### 8. Medium Site Mob Variance is Too Low

MOBS_PER_ROOM_MEDIUM has the same range as MOBS_PER_ROOM_SMALL: {min: 2, max: 4}. The only difference is 2 rooms vs 1. This means medium sites are just "two small rooms" with no increased per-room danger. Meanwhile, MOBS_PER_ROOM_LARGE jumps to {min: 2, max: 5}, adding a 25% mob ceiling increase.

### 9. Full-Clear on Large Sites: Risk/Reward Imbalance

For large sites, the chest is already rare-tier regardless of strategy. Full-clear only provides:
- 1.5x material rolls (from avg 4.5 to avg 6.75, ceil'd)
- 1.5x recipe chance (from 5% to 7.5%)

But the risk is enormous: fighting 6-20 mobs including 1 boss and 2 elites in one session, with HP carrying over, spending all turns upfront with no refund. The 50% material boost on a large site (+2-3 rolls) is unlikely worth risking 300-1000 turns. Rational players should almost never full-clear large sites.

## Issues Found

### Issue 1: Decay Exploit for Full-Clear (Medium Severity)
Players can select full-clear strategy, then wait for mobs to decay. Since decay doesn't disable fullClearActive, they can fight fewer mobs while still receiving full-clear chest bonuses. A medium site (E[6] mobs) could decay to 4 mobs over ~34 hours, reducing turn cost by 33% while keeping full-clear rewards.

Worst case for a large site: Wait ~8 days for most mobs to decay down to 1, then fight 1 mob for 50 turns and receive a full-clear rare chest with 1.5x multiplier.

### Issue 2: Large Full-Clear Weak Reward Premium (Low Severity)
Large sites gain no chest tier upgrade from full-clear (already capped at rare). The 1.5x multiplier on materials and recipes is insufficient to compensate for the risk of fighting 1 boss + 2 elites with depleting HP/resources. Expected turn cost for large full-clear (E[612]) dwarfs the incremental reward.

### Issue 3: Admin/Player Site Generation Divergence (Low Severity)
Admin-spawned sites use EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_* (7-10 mobs for large) while player-discovered sites use ROOM_CONSTANTS (6-20 mobs for large). Admin sites are consistently easier to full-clear.

### Issue 4: Large Site Mob Count Variance Too High (Medium Severity)
Large sites range from 6 to 20 mobs (3.3x ratio). A 6-mob large site costs 300 turns; a 20-mob large site costs 1,000 turns. This variance makes it difficult for players to assess risk before committing to a strategy. The 50/50 room count roll (3 vs 4 rooms) alone creates a ~33% expected mob count swing.

### Issue 5: Medium Per-Room Mob Range Identical to Small (Low Severity)
MOBS_PER_ROOM_MEDIUM = MOBS_PER_ROOM_SMALL = {2,4}. Medium sites don't feel more dangerous per-room, only longer. A medium site's difficulty increase comes entirely from the elite mob and the attrition of 2 rooms instead of 1.

## Recommendations

### Recommendation 1: Disable Full-Clear Bonus When Mobs Decay
Track the original mob count at strategy selection time. If any mobs have decayed since strategy was set, reduce or disable full-clear bonuses proportionally. Simplest fix: set `fullClearActive = false` if any mob has decayed since strategy selection.

### Recommendation 2: Introduce Legendary Chest Tier for Large Full-Clears
Add a CHEST_TIER_UPGRADE path: large -> "legendary" (or "epic") chest tier exclusive to full-clears. This would make large full-clears meaningfully more rewarding. Currently `getUpgradedChestSize('large')` returns `'large'` unchanged.

### Recommendation 3: Tighten Large Site Variance
Change ROOMS_LARGE from `{min: 3, max: 4}` to `{min: 3, max: 3}` (fixed 3 rooms). Alternatively, change MOBS_PER_ROOM_LARGE from `{min: 2, max: 5}` to `{min: 3, max: 4}`. This would narrow the total mob range from 6-20 to 9-12, making turn cost more predictable.

Suggested: `ROOMS_LARGE: { min: 3, max: 3 }, MOBS_PER_ROOM_LARGE: { min: 3, max: 5 }` -> total 9-15 mobs (1.67x ratio, down from 3.3x).

### Recommendation 4: Differentiate Medium Per-Room Danger
Change MOBS_PER_ROOM_MEDIUM from `{min: 2, max: 4}` to `{min: 3, max: 4}`. This raises the medium floor from 4 total mobs to 6, narrowing variance and making medium sites feel distinct from "two small rooms."

### Recommendation 5: Align Admin Route with Room System
Update the admin encounter spawn route to use `generateRoomAssignments()` instead of raw ENCOUNTER_SIZE values, ensuring admin-spawned and player-discovered sites have identical structure.

## Risk Level

**medium** -- The decay exploit (Issue 1) allows players to trivialize encounter site difficulty while keeping full-clear bonuses. This undermines the intended risk/reward tradeoff that is the core design of the full-clear mechanic. The other issues are quality-of-life concerns that affect balance perception but don't break the game.
