# Death Echoes: Player-Triggered World Events

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
When a player is knocked out in a zone, the violent energy of their defeat has a small chance (5-10%) to trigger a localized "Death Echo" world event in that zone, lasting 1-2 hours. The event type is contextual: dying to a mob family spawns a "{family} Frenzy" (spawn_rate_up or damage_up for that family), while dying during a boss round spawns "Lingering Malice" (hp_up for all mobs in the zone). This transforms the knockout state from a purely punitive mechanic into something that ripples through the shared game world -- other players in the zone see and react to the event, creating emergent social dynamics ("who died to Wolves and started this Full Moon?"). The implementation is lightweight: hook into `enterRecoveringState` in hpService, call `spawnWorldEvent` with `createdBy: 'player_discovery'` and a contextual template selected from a small `DEATH_ECHO_TEMPLATES` constant, gated by a random roll and a per-zone cooldown check against existing active events.
