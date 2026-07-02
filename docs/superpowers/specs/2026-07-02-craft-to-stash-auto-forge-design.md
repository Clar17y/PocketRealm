# Craft To Stash And Auto-Forge Design

## Goal

Let players run large crafting batches without being blocked by backpack size, and let them automate the repetitive "craft many, forge low rolls upward" loop without risking existing gear.

The target user flow is:

1. Select a recipe such as Silk Robe.
2. Enter a craft attempt budget such as 200.
3. Choose `Craft to stash` when they want all results stored outside backpack capacity.
4. Optionally choose `Forge to Rare+`, `Forge to Epic+`, or `Forge to Legendary`.
5. Receive only the final results and a detailed activity log of the craft and forge attempts.

## Current Context

The existing craft route already counts material ownership across backpack and stash through material totals and `getTotalQuantityByTemplate`. Materials are consumed from all owned matching stacks, including stashed stacks.

The current limitations are:

- Crafted outputs are always created in backpack inventory.
- Non-stackable crafting is capped by available backpack slots.
- `assertCanAct` blocks crafting while over-encumbered.
- The manual Forge screen only receives backpack inventory, so stashed items are not selectable there.
- Manual forge uses existing items and can therefore be risky if it is extended to include stash items without stronger source controls.

This design keeps manual forge unchanged and moves automation into crafting, where the source pool can be limited to newly crafted items only.

## Product Behavior

Crafting gains two explicit options:

- `destination`: `inventory` or `stash`, default `inventory`.
- `autoForgeMinRarity`: `null`, `rare`, `epic`, or `legendary`, default `null`.

The entered quantity remains an attempt budget. If the player enters 200, the server may use up to 200 craft attempts. It may use fewer when crafting to inventory with auto-forge and the final output would fill available backpack slots.

Auto-forge only applies to non-stackable weapon and armor recipes. Stackable, refining, resource, and consumable recipes can use `Craft to stash`, but cannot use auto-forge.

Auto-forge never consumes existing backpack or stash items. It only consumes virtual items created by the current craft request.

Manual forge remains unchanged for this feature. In particular, the manual Forge screen should not start pulling existing stashed gear into sacrifice lists.

## Storage Rules

### Craft To Inventory

Without auto-forge, current capacity behavior remains:

- Stackable outputs can merge into an existing backpack stack.
- New stackable output needs one open slot.
- Non-stackable output needs one open slot per created item.

With auto-forge enabled, items are processed virtually before being persisted. The server only creates final survivors and below-target leftovers after the auto-forge loop ends.

Minimum open slots:

| Target | Minimum Open Slots | Reason |
| --- | ---: | --- |
| Rare+ | 3 | One final Rare+ item plus at most one Common and one Uncommon leftover |
| Epic+ | 4 | One final Epic+ item plus at most one leftover below each lower tier |
| Legendary | 5 | One final Legendary item plus at most one leftover below each lower tier |

The auto-forge loop keeps each lower-than-target rarity pool reduced to at most one item. Any pair is immediately forged upward. This invariant makes the minimum slot requirements predictable.

When crafting to inventory with auto-forge, the server stops once continuing would risk exceeding available slots. Final survivors at or above the target rarity are prioritized, and lower-than-target leftovers are kept when they exist and fit within the same capacity bound.

### Craft To Stash

Crafting to stash bypasses backpack slot checks. Crafted and auto-forged final items are created with `inStash: true`.

Crafting to stash is allowed even when the player is over-encumbered. Recovery, activity lockouts, zone crafting rules, recipe unlocks, skill requirements, materials, and turns still apply.

## Auto-Forge Algorithm

The server treats the process as a virtual crafting and forging plan, then persists only the outcome.

For each attempted craft, up to the requested quantity:

1. Roll the crafted item result exactly as normal crafting would, including crafting crit rarity and bonus stats.
2. If the item already meets or exceeds `autoForgeMinRarity`, add it to final survivors.
3. Otherwise add it to the virtual pool for its rarity.
4. While any lower-than-target rarity pool has at least two items:
   - Select one target and one sacrifice from that same rarity.
   - Spend a forge attempt cost for the target rarity.
   - Roll forge success using the normal forge success chance and player luck.
   - On success, upgrade the target to the next rarity and roll the added bonus stat using the existing rarity logic.
   - On failure, destroy both virtual items.
   - Add the result back to the final survivors or lower-rarity pool as appropriate.
5. If destination is inventory and the survivor plus leftover count reaches the available slot limit, stop before the next craft attempt.

Auto-forge uses the same base forge costs, recipe discount, success chances, and bonus stat logic as manual forge. It does not consume Forge Luck or Forge Protection buffs. Those buffs remain manual-forge tools.

Below-target leftovers are kept in the selected destination and marked as leftovers in the response summary.

## Turn Cost Rules

The UI and server separate three values:

- `craftCost`: deterministic, based on actual craft attempts used.
- `expectedForgeCost`: advisory estimate for the UI.
- `maxReservedCost`: conservative upper bound used for preflight affordability.

The server must validate the player can afford `maxReservedCost` before consuming materials or creating items. This bound may be conservative. It must never underestimate.

Actual turn spending is based only on:

- Craft attempts actually used.
- Forge attempts actually rolled.
- Guild tax on the actual base cost through the existing tax path.

Unspent reserved turns are never deducted. If the random path fails early or inventory capacity stops the run before the attempt budget is exhausted, the player only pays for the actual work performed.

The activity response should include:

- Requested craft attempts.
- Actual craft attempts used.
- Craft turn cost.
- Actual forge turn cost.
- Conservative max cost used for the preflight.
- Tax information.

## API Shape

Extend `POST /api/v1/crafting/craft`.

Request:

```json
{
  "recipeId": "uuid",
  "quantity": 200,
  "destination": "stash",
  "autoForgeMinRarity": "rare"
}
```

Defaults preserve current behavior:

```json
{
  "destination": "inventory",
  "autoForgeMinRarity": null
}
```

Response additions:

```ts
type CraftDestination = 'inventory' | 'stash';
type AutoForgeTarget = 'rare' | 'epic' | 'legendary';

interface CraftAutoForgeAttempt {
  action: 'upgrade';
  fromRarity: 'common' | 'uncommon' | 'rare' | 'epic';
  toRarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
  success: boolean;
  roll: number;
  successChance: number;
  turnCost: number;
  targetVirtualId: string;
  sacrificeVirtualId: string;
  resultVirtualId: string | null;
}

interface CraftAutoForgeSummary {
  targetRarity: AutoForgeTarget;
  attempts: CraftAutoForgeAttempt[];
  finalCountsByRarity: Record<string, number>;
  leftoverCountsByRarity: Record<string, number>;
  actualForgeTurnCost: number;
  maxReservedTurnCost: number;
}
```

Existing response fields remain, including `crafted`, `craftedItemDetails`, `xp`, `tax`, and `stateUpdates`. `crafted.quantity` should report actual craft attempts used, not merely requested quantity.

For stash destination, `stateUpdates` should refresh `materialTotals` and inventory slot metadata, but newly stashed items should not be appended to backpack inventory state.

## Frontend Behavior

The Crafting screen adds controls inside the selected recipe panel:

- Destination segmented control: `Inventory` and `Stash`.
- Auto-forge segmented control for eligible recipes: `Off`, `Rare+`, `Epic+`, `Legendary`.
- When auto-forge is enabled, the quantity label becomes `Craft attempts`.

Button labels:

- `Craft 200 to stash`
- `Craft 200 and forge to Rare+`
- `Craft 200 to stash and forge to Rare+`

Cost preview:

- `Craft: 4,000 turns`
- `Expected forge: ~8,400 turns`
- `Max reserved: 12,200 turns`
- `Unspent turns are kept`

If destination is inventory and the player lacks the minimum open slots for the selected target rarity, disable the action and show the required slot count.

Activity log behavior:

1. Craft summary.
2. Individual auto-forge attempt lines in order.
3. Final rarity summary.
4. Leftover summary when below-target leftovers are kept.

## Service Boundaries

Keep route handlers thin:

- `apps/api/src/routes/crafting/craft.ts` remains HTTP orchestration only.
- New planning and execution logic belongs in `apps/api/src/services/crafting/craftRouteService.ts` or focused helpers under `apps/api/src/services/crafting/`.
- Pure cost and simulation helpers that do not touch DB should live in `packages/game-engine` only if they are genuinely reusable and side-effect free.
- Tunable limits and UI constants should live in `packages/shared/src/constants/gameConstants.ts`.

Likely helper boundaries:

- Parse and validate craft destination and auto-forge target in the existing crafting Zod schema.
- Build an auto-forge plan from virtual crafted items.
- Calculate conservative max reserved cost.
- Convert final virtual items into Prisma create rows for inventory or stash.
- Build response summaries and state updates.

## Error Handling

Reject before material consumption when:

- Recipe does not exist.
- Player lacks skill level.
- Recipe is locked.
- Current zone cannot craft the recipe.
- Player is recovering or activity locked.
- Destination is invalid.
- Auto-forge target is invalid or used on an ineligible recipe.
- Materials are insufficient for the maximum craft attempts that may be used.
- Turn balance is below the conservative max reserved cost.
- Destination is inventory and the minimum open-slot requirement is not met.

Over-encumbrance behavior changes only for `destination: "stash"`:

- Inventory destination still rejects over-encumbered players.
- Stash destination skips the over-encumbrance guard but still applies all other action guards.

## Testing

API and service tests:

- Craft to stash creates final items with `inStash: true`.
- Craft to stash updates material totals and does not append new backpack inventory items.
- Over-encumbered players can craft to stash but cannot craft to inventory.
- Auto-forge is rejected for stackable, resource, and consumable recipes.
- Auto-forge consumes only newly crafted virtual items.
- Existing backpack and stash items are never consumed by auto-forge.
- Conservative max-cost preflight rejects before material consumption.
- Actual cost can be lower than max reserved cost, and only actual cost is spent.
- Inventory destination enforces rare/epic/legendary minimum open-slot requirements.
- Below-target leftovers are persisted and reported.
- Craft attempts used can be lower than requested quantity when inventory capacity stops the loop.

Frontend tests:

- Crafting screen sends `destination` and `autoForgeMinRarity`.
- Destination defaults to inventory.
- Auto-forge controls only appear for eligible non-stackable equipment recipes.
- Quantity label changes to `Craft attempts` when auto-forge is enabled.
- Inventory destination shows and enforces minimum slot messaging.
- Button labels match destination and auto-forge state.

Regression tests:

- Normal crafting to inventory without auto-forge behaves as before.
- Stackable crafting still merges into backpack stacks by default.
- Manual forge behavior is unchanged.

## Documentation Updates

Update `docs/business-rules.md` during implementation:

- Crafting to stash is an exception to the over-encumbrance action block.
- Crafting can output directly to stash.
- Auto-forge is part of the crafting workflow and only uses newly crafted virtual items.

