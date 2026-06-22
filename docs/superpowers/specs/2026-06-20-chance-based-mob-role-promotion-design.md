# Chance-Based Mob Role Promotion Design

## Goal

Make promoted mob roles visible outside large encounter sites by adding chance-based elite rolls to normal exploration ambushes, while keeping encounter sites more likely to contain promoted mobs and preserving their existing late-room pressure guarantees.

## Approved Rules

- Normal exploration ambushes can roll `elite`.
- Normal exploration ambushes do not roll `mini_boss`.
- Normal exploration elite chance starts at 5% per mob.
- Encounter-site mob slots roll for `elite` with a bonus chance over normal exploration.
- Encounter-site elite chance starts at 10% per slot.
- Encounter sites with 3+ rooms still guarantee at least one `elite`.
- If a 3+ room encounter site ends with only one elite, that elite must be in the final room.
- Chance-based elites may appear before the final room only when the site also has late-room elite pressure.
- Encounter-site `mini_boss` remains chance-based, final-room only, and starts at the existing 35% chance.
- A mini-boss does not satisfy or remove the elite guarantee.

## Architecture

Role rolling should live in pure game-engine helpers so normal exploration and encounter-site generation use the same role vocabulary and tunable constants. Shared constants define the rates. API services apply role stat/action modifiers at combat-load time, using the same modifier service already introduced for encounter-site combat.

Normal exploration is transient: it should roll the role after choosing the base mob and prefix, apply role scaling before building the template combatant, and include role-aware display/log metadata. Encounter sites are persisted: generated slot JSON keeps the role per slot, and the assignment helper applies chance rolls first, then enforces encounter-site placement guarantees.

## Data Flow

### Normal Exploration Ambush

1. Pick base mob template with existing tier/weight logic.
2. Roll prefix with existing prefix logic.
3. Roll exploration role with 5% `elite` chance.
4. Apply prefix modifiers.
5. Apply elite stat/XP modifiers when role is `elite`.
6. Build template combatant from the modified mob.
7. Use role-aware display names in travel events and combat logs.

### Encounter Site Generation

1. Generate room layout.
2. Create one `trash` assignment per mob slot.
3. Roll each slot for `elite` at 10%.
4. Roll final room for `mini_boss` at 35%, if there is capacity to keep an elite somewhere.
5. Enforce at least one elite for 3+ room sites.
6. If there is exactly one elite, move it to the final room.
7. For 4-room sites, preserve the existing second-elite pressure when capacity allows.

## Testing

- Game-engine tests cover normal exploration role rolls: no roll gives `trash`, elite roll gives `elite`, and mini-boss is not emitted for normal exploration.
- Game-engine encounter-site tests cover chance-based early elites, final-room guarantee when there is only one elite, multi-elite sites allowing earlier elites, and mini-boss plus elite coexistence.
- API exploration tests cover encounter-site persisted roles with chance rolls and final-room guarantee.
- API travel tests cover normal exploration ambushes applying elite role scaling and display metadata.
- Existing focused tests for encounter-site combat, route previews, shared role normalization, and web display continue to run.

## Non-Goals

- Do not add normal exploration mini-bosses.
- Do not create new unique elite mob templates.
- Do not rename world boss systems or action IDs.
- Do not make role rolls depend on player level or zone tier in this pass.

## Risks

- A 5% normal elite chance will be visible over repeated exploration, but individual local tests may still need deterministic mocks or admin tools.
- Applying elite scaling to normal ambushes increases potion pressure and durability loss. The starting values are intentionally conservative.
- Existing logs and UI may assume prefixes are the only display modifier for normal mobs; role-aware display names must be included where ambush results are surfaced.
