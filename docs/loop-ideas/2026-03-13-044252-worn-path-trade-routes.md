# Worn Path Trade Routes: Community-Driven Travel Shortcuts

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description

Track aggregate player travel across each `ZoneConnection` in a shared Redis counter (`travel_volume:{fromId}:{toId}`). When a connection accumulates enough total traversals across all players (e.g., 500 trips), it upgrades to a "Worn Path" that grants a 20% travel cost reduction for everyone using that route. At higher thresholds (2000, 5000), it becomes a "Trade Route" (35% reduction, zero ambush chance) and then a "King's Road" (50% reduction, zero ambush chance, small passive gold trickle per trip). Worn Paths decay slowly if traffic drops below a minimum rate (e.g., fewer than 10 trips/day reverts one tier per week), so the network is living infrastructure that the community must maintain through continued use. The zone map UI highlights upgraded connections with distinct visual styles (faint trail, cobblestone, paved road), giving players a visceral sense of the world being shaped by collective behavior. This creates emergent economic geography: popular routes between high-value zones and crafting towns naturally develop into highways, while backwater connections remain dangerous wilderness, rewarding guilds that coordinate travel to build infrastructure in strategically valuable corridors. Implementation requires no schema changes -- Redis sorted sets track per-connection volume with daily bucketing for decay checks, and the travel cost calculation in `zones.ts` reads the connection tier before computing `baseTravelCost` and ambush eligibility.
