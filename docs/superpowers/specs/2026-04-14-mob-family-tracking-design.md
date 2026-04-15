# Mob Family Tracking Design

## Summary

Add an optional tracking mode inside the existing Exploration screen that lets players search for a previously discovered mob family in their current zone.

Example: a player needs silk for tailoring, so they turn tracking on and select `Spiders`.

Tracking is not a replacement for exploration. It is a focused variant of exploration with a clear tradeoff:

- Worse than normal exploration for broad progression and total discovery volume
- Better than normal exploration for farming one mob family's drops

This should feel like "searching for spider nests" rather than summoning exact mobs on demand.

## Product Goals

- Give players a targeted farming lever for crafting goals and material bottlenecks
- Preserve the value of normal exploration as the best all-purpose field activity
- Keep zone progression and exploration tiers intact
- Reuse the current exploration flow instead of introducing a separate activity screen

## Non-Goals

- This is not exact mob-template targeting
- This does not bypass zone exploration tiers
- This does not replace resource nodes, hidden caches, or zone exits
- This does not add a separate `Track` action outside Exploration

## Player Rules

### 1. Tracking lives inside Exploration

The Exploration screen gains a `Tracking` section below the tier selector:

- `Tracking Off`
- `Tracking On`
- When `On`, the player chooses one mob family from the current zone

Tier selection remains a separate concern. Tracking is an extra filter on top of the existing exploration flow, not a replacement for tier choice.

### 2. Tracking is discovery-gated

A mob family can only be tracked if the player has already discovered that family in the current zone.

This preserves the explore-first loop:

1. Explore normally
2. Discover a family
3. Unlock tracking for that family in that zone
4. Use tracking when you need that family's drops

Tracking unlocks should be zone-specific, not global. Discovering `Spiders` in one zone should not automatically unlock spider tracking in every zone unless the family has also been discovered there.

### 3. Tracking never bypasses tiers

Tracking a family only changes family preference. It does not let players reach higher-tier members of that family early.

If a tracked family has members in tiers 1 through 4:

- only tier 1 members are eligible at tier 1 unlock
- tier 2 members join once tier 2 is unlocked
- tier 3 and 4 remain unavailable until those tiers are unlocked

This means tracking respects the same unlocked-tier filtering already used by exploration and encounter generation.

### 4. Tracking preserves the wider exploration ecosystem

When tracking `Spiders`, the player is looking for spider activity, but they can still find:

- resource nodes
- hidden caches
- zone exits
- event discoveries
- occasional non-tracked mob outcomes

This should feel like focused searching in the wild, not a sterile single-result mode.

## Core Design

### Mode Shape

Tracking is an optional modifier on the existing exploration request.

- Default: normal exploration
- Optional: tracking enabled with one selected mob family

This is the lightest-weight UX and fits the current Exploration screen without fragmenting the turn-spending loop.

### Outcome Philosophy

Tracking should reduce total mob/site discovery efficiency, but make successful combat-oriented discoveries heavily favor the tracked family.

Intended player experience:

- Normal exploration gives more overall variety and better broad progression
- Tracking gives fewer overall "hits", but a much larger share of those hits belong to the chosen family

### Strength Target

Tracking strength should be moderate.

That means:

- strong enough that players reliably feel the benefit
- not so strong that tracking makes normal exploration obsolete
- not a hard guarantee that every ambush or site belongs to the tracked family

## Detailed Behavior

### Ambushes

During exploration ambush resolution:

1. Build the normal eligible mob pool using existing unlocked-tier logic
2. If tracking is off, use the current selection behavior unchanged
3. If tracking is on:
   - isolate tracked-family mobs that are also currently tier-eligible
   - heavily bias selection toward that family
   - keep a smaller chance for non-tracked eligible mobs
4. If no tracked-family mobs are tier-eligible, fall back to normal exploration behavior

Result:

- a player tracking `Spiders` usually fights spider-family mobs
- but still occasionally gets something else
- and never gets spider variants from locked tiers

### Encounter Sites

Encounter-site discovery should follow the same product logic as ambushes.

When tracking is on:

- discovered encounter sites should strongly favor the tracked family
- site generation still uses only tier-eligible family members
- if the tracked family has no currently eligible members, the system falls back to normal site-family selection

This is critical for crafting-focused play because players are often tracking a family for both direct ambush drops and encounter-site chest/family value.

### Resource Nodes, Hidden Caches, Zone Exits

These outcomes should remain available while tracking is active.

Recommended behavior:

- keep them in the outcome pool
- allow modest tuning if needed for total efficiency balance
- do not remove them entirely

The player should still feel like they are exploring the zone, just with attention focused on one family.

## Unlock Source

The unlock condition should use the player's discovered families in the current zone, not raw bestiary visibility by mob template.

Reasoning:

- the feature is "track spiders", not "track Venomous Spider"
- family-level unlock matches the actual UI and player intent
- it avoids weird cases where one mob reveal unlocks tracking without the player ever having recognized the family as a whole

Implementation-wise, the source of truth can be any existing or derived data that reliably answers:

`Has this player discovered this mob family in this zone before?`

If no exact family-discovery record exists yet, the implementation can derive it from the player's bestiary kills plus zone family membership.

## UI Design

### Exploration Screen

Add a new `Tracking` card below the tier selector.

States:

1. `Tracking unavailable`
   - shown when the player has not discovered any trackable families in the current zone
   - helper text: `Discover a mob family in this zone before you can track it.`

2. `Tracking off`
   - default selected state
   - exploration behaves exactly as today

3. `Tracking on`
   - player selects one discovered family from the current zone
   - family list can be rendered as pills, segmented buttons, or a compact dropdown

### UI Copy

The UI should explicitly teach the tradeoff:

- `Track a discovered mob family in this zone`
- `Tracking finds fewer total leads, but more of them will belong to the selected family`
- `Tracking respects your unlocked exploration tiers`

### Interaction With Tier UI

Tier UI remains unchanged in concept:

- players still choose their tier as they do now
- exploration progress still only advances when exploring at max unlocked tier
- tracking applies after tier eligibility is determined

This preserves the current mental model:

- tier answers "how deep am I searching?"
- tracking answers "what family am I leaning toward?"

## Backend Design

### Request Shape

Extend the exploration start request with an optional tracked family identifier.

Example shape:

```ts
{
  zoneId: string;
  turns: number;
  tier?: number;
  trackingFamilyId?: string;
}
```

`trackingFamilyId` is optional. Absence means normal exploration.

### Validation

When `trackingFamilyId` is provided:

- it must belong to a mob family available in the player's current zone
- the player must have already discovered that family in the current zone
- the family must have at least one currently tier-eligible member, or the system must explicitly allow silent fallback to normal behavior

Preferred behavior:

- validate zone ownership and discovery
- allow silent fallback only for runtime "no eligible members after filtering" edge cases

### Selection Hooks

The main hook points are:

- exploration ambush selection in `apps/api/src/services/explorationOutcomeService.ts`
- encounter-site family selection / site mob generation in `apps/api/src/routes/exploration/helpers.ts` and related exploration flow

The existing tier-filtering pipeline should stay authoritative. Tracking should bias family selection after or alongside tier eligibility, never before it.

## Balance Guidance

The system needs two balance levers:

### 1. Total combat/site yield penalty

Tracking should discover fewer overall combat-oriented opportunities than normal exploration.

This is what keeps normal exploration best for broad progression.

### 2. Family preference strength

Among the combat/site results that do happen, the tracked family should be strongly favored.

This is what makes tracking worth using for material farming.

### First-pass tuning target

The initial implementation should target a moderate feel:

- clearly noticeable family bias
- clearly noticeable total-yield tradeoff
- not close to 100 percent guarantee

The exact constants can be tuned in implementation, but the intended behavior should land in this band:

- normal exploration remains the best default activity
- tracking is the best choice when the player cares about one specific family drop line

## Error Handling and Edge Cases

- If tracking is enabled but the family is no longer valid for the zone, reject the request
- If the family is undiscovered for that player in that zone, reject the request
- If tracked family members exist but all currently unlocked tiers exclude them, fall back to normal eligible selection rather than hard-failing the run
- If a zone only has one discovered family, tracking should still work and remain optional
- Tutorial exploration should ignore tracking and preserve its scripted behavior

## Testing

### Backend

- request validation for invalid family IDs
- request validation for undiscovered families
- ambush selection respects tracked-family bias
- ambush selection never includes locked-tier mobs from the tracked family
- encounter-site generation respects tracked-family bias
- fallback behavior works when tracked family has no currently eligible members
- tracking-off path matches current exploration behavior

### Frontend

- tracking UI hidden or disabled when no discovered families exist in zone
- tracking toggle preserves selected family state correctly
- selected family is sent in exploration request when tracking is on
- no tracking field sent when tracking is off
- helper copy explains tradeoff and tier rule

## Why This Direction

This design fits the current game better than a separate `Track` action because:

- it keeps the turn loop simple
- it preserves the identity of exploration
- it works naturally with the current tier selector
- it creates a clear crafting-oriented choice without adding a second field-activity system

Most importantly, it directly matches the intended player story:

`I need silk, so I search this zone for spiders. I still explore the world, but I tilt the odds toward what I need.`
