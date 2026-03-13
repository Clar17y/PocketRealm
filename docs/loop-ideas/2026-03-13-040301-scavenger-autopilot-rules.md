# Scavenger Autopilot: Overflow Loot Triage Rules

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
Let players define priority rules for how overflow loot is handled when their inventory is full during combat/exploration chains. Instead of all excess items landing in a temporary Redis buffer that silently expires after 10 minutes, players configure a simple ordered ruleset (e.g., "auto-salvage common equipment," "always keep rare+ drops," "sell materials below tier 3"). When loot overflows, the system applies these rules server-side: high-priority items get stored as pending loot for manual claiming, while low-priority items are auto-salvaged or auto-sold for partial value. This transforms inventory overflow from a punishing "check your phone in 10 minutes or lose everything" moment into a strategic layer where players express their looting philosophy, and it rewards engaged players who fine-tune their rules with better returns from extended farming sessions.
