# Zone Mastery Echoes

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
When a player reaches 100% exploration in a zone, that zone becomes "mastered" and grants a persistent passive bonus called an Echo — a small thematic buff tied to the zone's identity (e.g., a volcanic zone grants +3% crit damage, a forest zone grants +5% gathering yield, a cursed zone grants +2% evasion). Echoes stack across all mastered zones, giving long-term explorers a meaningful power curve that rewards breadth of exploration over grinding a single zone. This transforms zone exploration percentage from a gating mechanic into a long-term progression system, and gives players a compelling reason to revisit and fully clear lower-tier zones they may have skipped. The bestiary already tracks per-zone discovery, and the tier/exploration infrastructure (`ZONE_EXPLORATION_CONSTANTS`, `PlayerZoneExploration`) provides the completion trigger — Echoes would layer on top as a lightweight player buff table keyed by zoneId.
