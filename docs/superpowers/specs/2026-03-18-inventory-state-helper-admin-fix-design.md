# Extract `buildInventoryStateUpdates` Helper + Fix Admin Over-Fetching

**Issue:** #219
**Date:** 2026-03-18

## Problem

### 1. Duplicated inventory stateUpdates construction

The crafting routes manually assemble `stateUpdates` with conditional spreading for inventory fields. This pattern is repeated 6 times across 3 files:

- `forge.ts` — upgrade success (line 205), upgrade failure (line 283), reroll (line 398)
- `salvage.ts` — single (line 183), batch (line 383)
- `craft.ts` — craft (line 340)

Each constructs a subset of: `inventoryRemoved`, `inventoryAdded`, `inventoryUpdated`, `inventoryUsedSlots`, `materialTotals`, plus optional extras like `buffs`.

### 2. Admin grant over-fetching

All admin grant endpoints (`/turns/grant`, `/player/xp`, `/tokens/grant`, `/items/grant`, `/guild/treasury`, `/player/level`, `/set-skill-level`, `/set-skill-levels`, `/player/attributes`) return minimal responses. The frontend `AdminScreen` calls `loadAll()` after every successful action, which fires 10 parallel GET requests — even though only 1-2 fields changed.

## Design

### Part 1: `buildInventoryStateUpdates` helper

Add a **pure synchronous** function to `stateUpdateHelpers.ts` that assembles already-fetched inventory data into a `Partial<StateUpdates>`:

```typescript
export function buildInventoryStateUpdates(opts: {
  removed?: string[];
  added?: InventoryItemDTO[];
  updated?: InventoryItemDTO[];
  inventoryUsedSlots: number;
  materialTotals?: Record<string, number>;
}): Partial<StateUpdates> {
  const result: Partial<StateUpdates> = {
    inventoryUsedSlots: opts.inventoryUsedSlots,
  };
  if (opts.removed && opts.removed.length > 0) result.inventoryRemoved = opts.removed;
  if (opts.added && opts.added.length > 0) result.inventoryAdded = opts.added;
  if (opts.updated && opts.updated.length > 0) result.inventoryUpdated = opts.updated;
  if (opts.materialTotals) result.materialTotals = opts.materialTotals;
  return result;
}
```

**Key:** This is a pure assembly function (no async, no DB). It's distinct from `mergeLootIntoStateUpdates` which does fetching. The crafting routes already fetch DTOs/meta separately — this just standardizes the object shape.

Callers can spread additional fields (e.g., `buffs`, `skills`, `characterProgression`) into the result:

```typescript
stateUpdates: {
  ...buildInventoryStateUpdates({ removed: [...], updated: [...], inventoryUsedSlots }),
  ...(buffs && { buffs }),
},
```

### Part 2: Admin grant stateUpdates

Each admin grant endpoint should return a `stateUpdates` object containing only the fields that changed. Use the existing `buildStateUpdates()` and `fetchCharacterProgression()` infrastructure.

| Endpoint | stateUpdates fields |
|---|---|
| `POST /turns/grant` | `turns` (already returned as `currentTurns`) — no stateUpdates needed, frontend just needs the returned value |
| `POST /player/xp` | `characterProgression` |
| `POST /player/level` | `characterProgression` (includes `attributePoints`) |
| `POST /set-skill-level` | `skills`, `resources` |
| `POST /set-skill-levels` | `skills`, `resources` |
| `POST /player/attributes` | `hp`, `resources` (attributes affect max HP/stamina/mana) |
| `POST /items/grant` | `inventoryAdded`/`inventoryUpdated`, `inventoryUsedSlots`, `materialTotals` |
| `POST /tokens/grant` | Return `questTokens` (already does) — admin-only, token display refreshes on next quest screen visit; no stateUpdates needed |
| `POST /guild/treasury` | Return `treasuryTurns` (already does) — guild state, not player state |

For endpoints where the response already contains the updated value (turns, tokens, treasury), the frontend can apply it directly without `stateUpdates`.

### Part 3: Frontend `AdminScreen` changes

Replace `onAction={loadAll}` with per-action state application:

1. **`useAdminAction` hook** — modify `act()` to return the API response data to the caller, instead of discarding it. Remove the `onAction` callback parameter entirely. New signature sketch:

```typescript
function useAdminAction() {
  const act = async <T>(
    label: string,
    fn: () => Promise<{ data?: T; error?: ... }>,
    opts?: { confirm?: string },
  ): Promise<T | null> => { ... };
  return { busy, msg, setMsg, act };
}
```

2. **`AdminScreen` props** — replace `onAction?: () => void` with `applyUpdates: (updates: StateUpdates) => void` and `setTurns: (n: number) => void`. Wire from `useGameController`'s exposed `applyStateUpdates` and `setTurns`.

3. **Each admin tab** — after `act()` resolves, check for `stateUpdates` in the response and call `applyUpdates()`. For turn grants, call `setTurns()` with the returned `currentTurns`.

4. **Non-state endpoints** (events, encounters, resource nodes) — these don't affect player state, so no callback needed. Remove the current `onAction?.()` calls for these tabs.

5. **API client types** (`apps/web/src/lib/api/admin.ts`) — update return types for endpoints that gain `stateUpdates` in their response (xp, level, skills, attributes, items).

## Scope

- `apps/api/src/services/stateUpdateHelpers.ts` — add `buildInventoryStateUpdates()`
- `apps/api/src/routes/crafting/forge.ts`, `salvage.ts`, `craft.ts` — refactor to use the new helper
- `apps/api/src/routes/admin.ts` — add `stateUpdates` to grant responses (xp, level, skills, attributes, items)
- `apps/web/src/lib/api/admin.ts` — update return types to include `stateUpdates`
- `apps/web/src/components/screens/AdminScreen.tsx` — replace `loadAll` with targeted state application
- `apps/web/src/app/game/useGameController.ts` — expose `applyStateUpdates` binding for admin use
- `apps/web/src/app/game/page.tsx` — update AdminScreen props from `onAction={loadAll}` to new pattern

## Out of scope

- Refactoring `mergeLootIntoStateUpdates` — different pattern (fetches from DB), combat-specific
- Adding stateUpdates to non-grant admin endpoints (events, zones, encounters) — these don't affect player state
