# Nemesis Mob Rivalries

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
When a player is knocked out by a mob or flees combat, that specific mob variant (template + prefix) is recorded as a "Nemesis" on the player's bestiary entry. Nemeses gain a stacking stat bonus (+5% HP and damage per encounter, up to +25%) and have an increased spawn weight in the zone where the rivalry began. Defeating a Nemesis clears the rivalry, grants bonus XP proportional to the stack count, and has a guaranteed rare+ loot drop. The system creates memorable personal stories ("that Enraged Stone Golem keeps killing me") and turns frustrating deaths into motivating comeback arcs. Implementation is lightweight: a small `PlayerNemesis` table (playerId, mobTemplateId, prefix, zoneId, stackCount, createdAt) plus a check in exploration mob selection to boost Nemesis spawn weight, and a post-combat hook to escalate or resolve the rivalry. The training ground already validates bestiary entries and applies prefixes, so players can practice against their Nemesis before attempting a real rematch.
