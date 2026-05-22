# Resource Prospecting Design

## Summary

Add an optional prospecting mode inside the existing Exploration screen that lets players focus exploration toward resource nodes in the current zone.

Example: a player needs Copper Ore, so they choose `Copper Ore` as their prospecting target before exploring Forest Edge.

Prospecting is the resource-side counterpart to mob family tracking. It should not create a separate activity loop. It stays inside Exploration and creates a clear choice:

- normal exploration is best for encounter sites and broad zone activity
- mob family tracking is best for a specific mob family's combat drops
- resource prospecting is best for finding resource nodes and leaning toward one chosen resource

## Product Goals

- Give players direct agency over resource bottlenecks without making resource nodes guaranteed
- Make gathering progression line up better with zone exploration progression
- Preserve ambush frequency so exploration still feels dangerous
- Preserve normal exploration as the best mode for finding encounter sites
- Reuse the existing exploration flow, request path, and result playback

## Non-Goals

- This is not a separate gathering action
- This does not create resource nodes on demand
- This does not remove ambushes
- This does not stack with mob family tracking
- This does not require prior discovery of the resource in that zone

## Player Rules

### 1. Prospecting lives inside Exploration

The Exploration screen gains a focus mode selector:

- `None`
- `Track mob family`
- `Prospect resource`

Only one focus mode can be active for a run.

### 2. Prospecting is available immediately

Unlike mob family tracking, resource prospecting is not discovery-gated.

If a resource node template exists in the current zone, the player can prospect for it immediately.

Reasoning:

- the feature is meant to solve early resource starvation
- gating it behind first discovery weakens the fix
- skill-based targeting already keeps low-skill prospecting from being too precise

### 3. Prospecting keeps ambushes unchanged

Prospecting should not make exploration safer.

The ambush per-turn chance remains the same as normal exploration.

### 4. Prospecting trades encounter sites for resource nodes

Prospecting changes the non-ambush exploration mix by flipping the encounter-site and resource-node rates.

Current normal rates:

```txt
ambush:        0.0050
encounterSite: 0.0015
resourceNode:  0.0005
```

Prospecting first-pass rates:

```txt
ambush:        0.0050
encounterSite: 0.0005
resourceNode:  0.0015
```

This makes prospecting better for resource supply while preserving a real opportunity cost: fewer encounter sites.

## Resource Targeting

### Target Shape

Players choose a concrete resource node template available in the current zone, not just a skill.

Examples:

- `Copper Ore`
- `Oak Log`
- `Forest Sage`

The request should identify the selected resource node template by ID.

### Skill-Based Targeting Strength

Prospecting weights the selected resource more heavily. The bias scales with the relevant gathering skill level compared with the target node's level requirement.

```txt
levelsAbove = gatheringSkillLevel - node.levelRequired
progress = clamp(levelsAbove / 10, 0, 1)
```

For zones with three resource node templates:

```txt
At-level:       50 / 25 / 25
Cap at +10:     80 / 10 / 10
```

For zones with two resource node templates:

```txt
At-level:       65 / 35
Cap at +10:     85 / 15
```

The values interpolate linearly between at-level and cap. Negative `levelsAbove` values use the at-level split. If future zones have more than three resource node templates, use the three-node target share and distribute the remaining share evenly across the non-target nodes.

This means a low-skill player can intentionally look for Copper Ore, but a skilled miner becomes much better at finding it.

### Invalid or Underleveled Targets

The player can prospect for a node if the template exists in the zone.

If the player is below the node's required level, the UI should show that the resource can be searched for but cannot yet be gathered. The API should still allow prospecting because finding an unusable node is not an exploit, but gathering still enforces the existing level gate.

## Balance Expectations

The current resource-node rate cannot support gathering progression beyond Forest Edge.

Using current values:

- Forest Edge full exploration gives about 15 nodes, which is barely enough for 1 -> 5 across three gathering skills
- Deep Forest and Cave Entrance full exploration give about 22.5 nodes, but 5 -> 10 needs about 1,459 actions per skill
- At 20 percent guild tax, 45k spent turns produce 36k effective exploration turns, or about 18 expected nodes

Prospecting's flipped resource rate gives Deep Forest about 67.5 expected nodes over 45k effective turns. With three resources and a 50 / 25 / 25 split, the selected skill gets about 2,025 expected capacity at average 60 capacity per node, enough to cover the 5 -> 10 band with room for variance.

This is the intended shape: prospecting can carry one chosen gathering skill through a zone band, while normal exploration remains better for encounter-site discovery.

## Backend Design

### Request Shape

Extend the exploration start request with an optional prospecting target.

```ts
{
  zoneId: string;
  turns: number;
  tier?: number;
  trackingFamilyId?: string;
  prospectingResourceNodeId?: string;
}
```

Validation must reject requests that include both `trackingFamilyId` and `prospectingResourceNodeId`.

### Constants

Add prospecting constants near existing exploration tracking constants:

```ts
RESOURCE_PROSPECTING_CONSTANTS = {
  ENCOUNTER_SITE_RATE_MULTIPLIER: 1 / 3,
  RESOURCE_NODE_RATE_MULTIPLIER: 3,
  TARGET_BIAS_LEVELS_TO_CAP: 10,
  THREE_NODE_TARGET_SHARE_AT_LEVEL: 0.50,
  THREE_NODE_TARGET_SHARE_CAP: 0.80,
  TWO_NODE_TARGET_SHARE_AT_LEVEL: 0.65,
  TWO_NODE_TARGET_SHARE_CAP: 0.85,
}
```

The multiplier values intentionally flip `0.0015` and `0.0005` without changing ambushes.

### Simulation Flow

`simulateExploration` currently accepts a spawn-rate multiplier for ambushes and encounter sites. Prospecting needs separate rate control for resource nodes and encounter sites.

Recommended direction:

- keep ambush spawn-rate behavior unchanged
- pass an exploration rate options object instead of one broad multiplier
- apply prospecting modifiers only to encounter-site and resource-node rolls
- leave hidden cache, zone exit, and event discovery unchanged

World event spawn-rate modifiers should continue to affect ambushes and encounter sites. Prospecting then applies its encounter-site multiplier to the already event-adjusted site rate. Resource-node prospecting is independent of mob spawn-rate events.

### Resource Selection Hook

When a `resource_node` outcome is processed:

1. Load the current zone's resource nodes as today
2. If no prospecting target is present, use the current weighted selection behavior
3. If a prospecting target is present:
   - validate the target resource node exists in this zone
   - compute target share from skill proficiency
   - convert target share into temporary discovery weights
   - pick with the existing weighted picker

The implementation should not mutate database `discoveryWeight` values. The bias is request-local.

## Frontend Design

### Exploration Screen

The Exploration screen should expose one focus control with mutually exclusive choices:

- no focus
- mob family tracking
- resource prospecting

When `resource prospecting` is selected:

- show the current zone's resource node templates
- include resource type, required skill, and level requirement
- show a warning state for resources above the player's current skill level
- send `prospectingResourceNodeId` when starting exploration

Above-level resources should remain selectable as prospecting targets. The warning communicates that the player may discover the node before they can gather from it.

### Copy

Use concise copy that explains the tradeoff:

- `Prospect for resources in this zone`
- `Prospecting finds more resource nodes but fewer encounter sites`
- `Higher gathering skill improves targeting accuracy`

Do not describe exact percentages in the primary UI unless a detailed tooltip already exists for similar exploration math.

## Error Handling and Edge Cases

- Reject if both mob tracking and prospecting are submitted
- Reject if the prospecting resource node is not in the selected zone
- Allow prospecting for above-level resources, but gathering remains level-gated
- If a zone has one resource node, prospecting should select that node whenever a resource node outcome occurs
- Tutorial exploration should ignore prospecting and preserve scripted behavior
- Prospecting should work with guild tax because tax already reduces effective exploration turns before simulation

## Testing

### Backend

- request validation rejects simultaneous `trackingFamilyId` and `prospectingResourceNodeId`
- request validation rejects a resource node from another zone
- prospecting flips encounter-site and resource-node expectations while keeping ambush rate unchanged
- resource-node processing favors the selected target at at-level bias
- resource-node processing reaches cap bias at +10 levels
- two-resource zones use the two-node split
- one-resource zones always select the only resource node
- normal exploration remains unchanged when no prospecting target is submitted
- tutorial exploration ignores prospecting

### Frontend

- focus mode selector only allows one active mode
- resource prospecting list renders current-zone resource nodes
- selected resource ID is sent in exploration requests
- no prospecting field is sent when focus is off
- mob tracking and prospecting cannot both be submitted
- above-level resources communicate that discovery is allowed but gathering is locked

## Why This Direction

Flatly doubling node discovery helps Forest Edge but does not solve later zones. Deep Forest, Whispering Plains, Haunted Marsh, and Crystal Caverns need more than a flat 2x if players are expected to progress gathering skills alongside zone completion.

Prospecting solves the problem with a player choice instead of a passive global buff. Players who want encounter sites keep normal exploration. Players who need one resource type can pay the encounter-site opportunity cost and prospect for it.
