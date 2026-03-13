# Encounter Room Hazards: Environmental Modifiers per Room

**Category:** feature
**Priority:** high
**Scope:** medium

## Description
When an encounter site's rooms are generated, each room beyond the first has a chance (30-40%) to roll an environmental hazard from a zone-themed pool (e.g., volcanic zones get "Lava Fissures" applying burn-on-entry, forest zones get "Tangling Roots" reducing evasion, crypts get "Cursed Air" draining mana each round). Hazards apply as combat effect modifiers to both the player and the mobs in that room, forcing players to adapt their combat template per-room rather than using a single strategy for an entire site clear. This transforms encounter sites from a flat sequence of identical fights into a tactical gauntlet where room order matters -- players must weigh whether to push through a hazard room with depleted resources or retreat and re-approach. The implementation layers onto the existing `generateRoomAssignments` output by adding an optional `hazard` field to each `RoomLayout`, rolled from a `ROOM_HAZARD_DEFINITIONS` constant keyed by zone terrain type, and fed into `runCombat` as pre-applied effects on combat start. The full-clear bonus system already rewards completing all rooms, so hazards raise the stakes of that reward without changing the incentive structure.
