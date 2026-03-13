# Mob Family Territorial Wars: Ecological Zone Conflicts

**Category:** feature
**Priority:** high
**Scope:** medium

## Description

Introduce dynamic territorial conflicts between mob families that share a zone, turning the static `ZoneMobFamily` discovery weights into a living ecosystem that shifts based on player behavior. When a player disproportionately farms one mob family in a zone (e.g., killing 20+ wolves but ignoring spiders), the rival family's `discoveryWeight` temporarily increases for that player -- the spiders expand into the territory the wolves vacated. At extreme imbalance (3:1+ kill ratio between two families in the same zone within a rolling 24-hour window), a "Territorial War" event triggers for that player: the next encounter site discovered has a chance to contain mobs from *both* families in the same site, with rival family mobs occupying different rooms and an elite "Alpha" variant of the expanding family as the final room boss. Clearing a Territorial War site grants bonus XP and a unique loot modifier (materials from both families), plus resets the ecological balance.

This leverages infrastructure that already exists but is underutilized: `ZoneMobFamily` maps multiple families to each zone with weighted discovery, `PlayerBestiary` tracks per-mob kill counts, and the encounter site room system already supports multi-mob compositions via the `mobs` JSON with room assignments. The kill ratio computation is a simple aggregation query against `PlayerBestiary` filtered to mob templates belonging to each `MobFamily` in the current zone. The weight adjustment is per-player and ephemeral (Redis key `ecology:{playerId}:{zoneId}` storing family kill deltas, decaying daily), so it doesn't pollute the shared zone data.

The design creates a self-balancing exploration incentive: players who autopilot the same mob family encounter escalating difficulty and unfamiliar enemy compositions, while players who rotate targets maintain equilibrium and avoid Territorial Wars entirely. It also gives the bestiary system a gameplay consequence -- your kill history isn't just a trophy wall, it actively shapes what you encounter next.
