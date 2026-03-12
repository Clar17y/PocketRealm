# Town Crafting Restrictions Design

## Summary

Crafting is gated by zone. Each zone has a `maxCraftingLevel` (nullable int) that determines what can be crafted there. Wild zones default to `0` (no crafting). Towns have specific caps or `null` (unlimited).

## Data Model

Add to `Zone` table:
```
maxCraftingLevel Int? @default(0)
```

Seed values:
- Millbrook: `20`
- Thornwall: `null` (unlimited)
- All wild zones: `0`

## Crafting Gate Rules

A zone allows crafting if `maxCraftingLevel > 0` or is `null` (unlimited). No `zoneType` check needed.

- **Recipe crafting**: zone must allow crafting AND `recipe.requiredLevel <= zone.maxCraftingLevel` (skip check if null)
- **Forge upgrade/reroll**: zone must allow crafting (no level check)
- **Salvage**: zone must allow crafting (no level check)

## API Changes

### POST `/crafting/craft`
- Load player's current zone
- Reject if `maxCraftingLevel === 0`: "No crafting facilities available here"
- Reject if `recipe.requiredLevel > maxCraftingLevel`: error includes zone name and cap

### POST `/forge/upgrade`, `/forge/reroll`
- Reject if `maxCraftingLevel === 0`

### POST `/crafting/salvage`
- Reject if `maxCraftingLevel === 0`

### GET `/crafting/recipes`
- Include `zoneCraftingLevel: number | null` in response for frontend gating

## Frontend Changes

- Recipes above zone cap: greyed out, craft button disabled, reason shown inline ("Requires a higher-level forge")
- Forge/reroll/salvage buttons: disabled when `zoneCraftingLevel === 0` with tooltip "No crafting facilities here"
- No red error banners — restrictions are shown proactively via disabled UI
- Pattern matches existing exploration-in-town disable approach

## Migration

- Add `maxCraftingLevel Int?` to Zone with `@default(0)`
- Update Millbrook seed: `maxCraftingLevel = 20`
- Update Thornwall seed: `maxCraftingLevel = null`
- No data backfill needed
