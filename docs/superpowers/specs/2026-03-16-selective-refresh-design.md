# Selective Refresh & Rate Limit UX

**Issue:** #176 — Rate limiting hit too easily during crafting (loadAll fires 11 requests per action)
**Date:** 2026-03-16

## Problem

Every player action calls `loadAll()` which fires 11 parallel GET requests (turns, player, skills, zones, inventory, equipment, crafting recipes, HP, resources, skill points, buffs). Combined with the action POST itself, that's 12 API calls per action. With a 120 req/min global rate limit, players can only perform ~10 actions per minute before getting rate-limited — with no UI feedback when it happens.

## Solution Overview

Three layers of optimization:

1. **Enriched API responses** — Action endpoints return all changed state inline via a `stateUpdates` object with inventory deltas, eliminating post-action GETs entirely.
2. **Screen-aware polling** — The 10s polling interval only fetches data relevant to the current screen, and skips HP/resources when at max.
3. **429 toast** — `fetchApi` detects rate-limit responses and shows a debounced toast notification.

## Design

### 1. StateUpdates Response Shape

Every action endpoint returns a `stateUpdates` object alongside its existing response fields. The frontend uses this to patch local state without follow-up fetches.

```ts
interface InventoryItemDTO {
  id: string;
  templateId: string;
  name: string;
  description: string;
  type: string;
  subtype: string | null;
  rarity: string;
  level: number;
  quantity: number;
  stackable: boolean;
  maxStack: number;
  stats: Record<string, number> | null;
  slot: string | null;
  durability: number | null;
  maxDurability: number | null;
}

interface StateUpdates {
  // Inventory deltas (not full list)
  inventoryAdded?: InventoryItemDTO[];    // new items to append
  inventoryRemoved?: string[];            // item IDs to remove
  inventoryUpdated?: InventoryItemDTO[];  // items with changed quantity/durability

  // Full replacements (these are small objects)
  equipment?: Record<string, InventoryItemDTO | null>;  // ~8 slots
  skills?: SkillState[];
  resources?: { stamina: ResourceState; mana: ResourceState };
  hp?: HpState;
  gold?: number;
  buffs?: BuffState[];
  inventoryCapacity?: number;
  inventoryUsedSlots?: number;
  characterProgression?: {
    characterXp: number;
    characterLevel: number;
    attributePoints: number;
  };
}
```

### 2. API Route Enrichment

Each action route builds a `stateUpdates` object before responding. The enrichment is additive — existing response fields remain unchanged.

| Route | stateUpdates fields |
|-------|-------------------|
| `POST /crafting/craft` | `inventoryAdded` (crafted items), `inventoryRemoved` (consumed materials — stackable items with qty 0), `inventoryUpdated` (partially consumed stacks), `skills`, `resources`, `inventoryUsedSlots`, `characterProgression` (XP may trigger level-up) |
| `POST /crafting/salvage` | `inventoryAdded` (returned materials), `inventoryRemoved` (salvaged item), `inventoryUpdated` (stacks that gained quantity), `inventoryUsedSlots` |
| `POST /crafting/salvage/batch` | Same as salvage, multiple items |
| `POST /gathering/mine` | `inventoryAdded` (gathered items + gems), `inventoryUpdated` (existing stacks incremented), `skills`, `resources`, `inventoryUsedSlots`, `characterProgression` |
| `POST /equipment/equip` | `inventoryRemoved` (item leaves inventory), `equipment` (full map), `inventoryUsedSlots` |
| `POST /equipment/unequip` | `inventoryAdded` (item returns to inventory), `equipment` (full map), `inventoryUsedSlots` |
| `POST /combat/start` | `hp`, `skills`, `resources`, `inventoryUpdated` (durability changes), `buffs`, `characterProgression` |
| `POST /exploration/start` | `hp`, `resources` |
| `POST /inventory/sell` | `inventoryRemoved`, `gold`, `inventoryUsedSlots` |
| `POST /inventory/sell/bulk` | `inventoryRemoved`, `gold`, `inventoryUsedSlots` |
| `POST /inventory/use` | `inventoryRemoved` or `inventoryUpdated` (quantity -1), `hp`, `resources`, `buffs` |
| `POST /inventory/destroy` | `inventoryRemoved`, `inventoryUsedSlots` |
| `POST /equipment/repair` | `inventoryUpdated` or `inventoryRemoved` (if destroyed), `gold` |
| `POST /equipment/repair-all` | `inventoryUpdated`, `inventoryRemoved` (destroyed items), `gold` |
| `POST /stash/deposit` | `inventoryRemoved`, `inventoryUsedSlots` |
| `POST /stash/deposit/batch` | `inventoryRemoved`, `inventoryUsedSlots` |
| `POST /stash/withdraw` | `inventoryAdded`, `inventoryUsedSlots` |
| `POST /stash/withdraw/batch` | `inventoryAdded`, `inventoryUsedSlots` |
| `POST /loot/claim` | `inventoryAdded`, `inventoryUsedSlots` |
| `POST /travel/start` | `hp`, `resources` |
| `POST /rest/start` | `hp`, `resources` |
| `POST /buffs/activate` | `buffs`, `inventoryRemoved` or `inventoryUpdated` |
| `POST /pvp/scout` | (no stateUpdates — scout returns scout data, turns set from response inline) |
| `POST /pvp/challenge` | `hp`, `resources`, `skills`, `characterProgression` |
| `POST /skillpoints/allocate` | (returns full `SkillPointState` directly — no stateUpdates needed, handler already sets state from response) |

**Out of scope:** PvP scout/challenge currently use `onTurnsChanged`/`onHpChanged` callbacks from `ArenaScreen` that call `loadTurnsAndHp()` in the parent. These will be refactored: the PvP API responses will include `stateUpdates`, and `ArenaScreen` will call `applyStateUpdates` directly instead of using callbacks. The `onTurnsChanged`/`onHpChanged` callback props will be removed.

#### Building stateUpdates in Services

Each service already has access to the data it needs. The pattern:

```ts
// In craftingService.ts (example)
async function craftItem(playerId, recipeId, quantity) {
  // ...existing craft logic with transaction...

  // After transaction, build stateUpdates from data we already have:
  const addedItems = await prisma.inventoryItem.findMany({
    where: { id: { in: craftedItemIds } },
    include: { template: true },
  });

  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
  });

  return {
    ...existingResponse,
    stateUpdates: {
      inventoryAdded: addedItems.map(toInventoryItemDTO),
      inventoryRemoved: fullyConsumedItemIds,
      inventoryUpdated: partiallyConsumedItems.map(toInventoryItemDTO),
      skills: skills.map(toSkillState),
      inventoryUsedSlots: await countUsedSlots(playerId),
    },
  };
}
```

A shared `toInventoryItemDTO(item)` helper serialises a Prisma inventory item + template join into the DTO shape. `InventoryItemDTO` should reuse or extend existing inventory types in `packages/shared` if a suitable type exists, rather than creating a parallel definition. A shared `buildStateUpdates(playerId, fields[])` helper can fetch only the requested fields to avoid duplication across services.

### 3. Frontend: applyStateUpdates Utility

New file: `apps/web/src/app/game/applyStateUpdates.ts`

```ts
interface StateSetters {
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setInventoryCapacity: (n: number) => void;
  setInventoryUsedSlots: (n: number) => void;
  setEquipment: (eq: EquipmentMap) => void;
  setSkills: (skills: SkillState[]) => void;
  setHpState: (hp: HpState) => void;
  setStaminaState: (s: ResourceState) => void;
  setManaState: (m: ResourceState) => void;
  setGold: (g: number) => void;
  setActiveBuffs: (b: BuffState[]) => void;
  setCharacterProgression: (cp: CharacterProgression) => void;
}

function applyStateUpdates(updates: StateUpdates | undefined, setters: StateSetters) {
  if (!updates) return;

  // Inventory deltas
  if (updates.inventoryAdded || updates.inventoryRemoved || updates.inventoryUpdated) {
    setters.setInventory(prev => {
      let next = [...prev];
      if (updates.inventoryRemoved) {
        const removeSet = new Set(updates.inventoryRemoved);
        next = next.filter(item => !removeSet.has(item.id));
      }
      if (updates.inventoryUpdated) {
        const updateMap = new Map(updates.inventoryUpdated.map(i => [i.id, i]));
        next = next.map(item => updateMap.get(item.id) ?? item);
      }
      if (updates.inventoryAdded) {
        next.push(...updates.inventoryAdded);
      }
      return next;
    });
  }

  if (updates.equipment !== undefined) setters.setEquipment(updates.equipment);
  if (updates.skills !== undefined) setters.setSkills(updates.skills);
  if (updates.hp !== undefined) setters.setHpState(updates.hp);
  if (updates.resources !== undefined) {
    setters.setStaminaState(updates.resources.stamina);
    setters.setManaState(updates.resources.mana);
  }
  if (updates.gold !== undefined) setters.setGold(updates.gold);
  if (updates.buffs !== undefined) setters.setActiveBuffs(updates.buffs);
  if (updates.inventoryCapacity !== undefined) setters.setInventoryCapacity(updates.inventoryCapacity);
  if (updates.inventoryUsedSlots !== undefined) setters.setInventoryUsedSlots(updates.inventoryUsedSlots);
  if (updates.characterProgression !== undefined) setters.setCharacterProgression(updates.characterProgression);
}
```

### 4. simpleAction Refactor

`runSimpleAction` loses its `loadAll` parameter. The `onSuccess` callback is responsible for all state updates:

```ts
// simpleAction.ts — after
export async function runSimpleAction<T>({
  actionName,
  apiFn,
  onSuccess,
  setActionError,
}: RunSimpleActionOptions<T>) {
  const res = await apiFn();
  if (!res.data) {
    setActionError(res.error?.message ?? `${actionName.replace(/_/g, ' ')} failed`);
    return;
  }
  await onSuccess?.(res.data);
}
```

In `useGameController`, the `simpleAction` wrapper passes `stateSetters` and calls `applyStateUpdates`:

```ts
const simpleAction = async <T extends { stateUpdates?: StateUpdates }>(
  actionName: string,
  apiFn: () => Promise<ApiResponse<T>>,
  onSuccess?: (data: T) => void | Promise<void>,
) => {
  await runAction(actionName, async () => {
    await runSimpleAction({
      actionName,
      apiFn,
      onSuccess: async (data) => {
        applyStateUpdates(data.stateUpdates, stateSetters);
        await onSuccess?.(data);
      },
      setActionError,
    });
  });
};
```

Non-simple handlers (craft, combat, exploration, gathering, travel) call `applyStateUpdates` directly in their handler bodies.

### 5. Screen-Aware Polling

Replace the single 10s `loadTurnsAndHp` interval with a screen-aware poller. Note: `loadTurnsAndHp` is also called mid-travel-hop (3 call sites) to refresh state between multi-zone travel hops. These call sites will also switch to `applyStateUpdates` — the travel API response already returns turns, and will be enriched with `hp` and `resources` in `stateUpdates`.

```ts
// Screens grouped by data needs
const SCREEN_POLL_NEEDS: Record<string, string[]> = {
  explore:    ['turns', 'hp', 'resources'],
  combat:     ['turns', 'hp', 'resources'],
  rest:       ['turns', 'hp', 'resources'],
  home:       ['turns', 'hp', 'resources'],
  gathering:  ['turns'],
  crafting:   ['turns'],
  forge:      ['turns'],
  casino:     ['turns'],
  skills:     ['turns'],
  zones:      ['turns'],
  bestiary:   ['turns'],
  training:   ['turns'],
  // etc — default to ['turns'] for unlisted screens
};
```

**Skip-at-max optimisation:** Before fetching HP or resources, check local state:
- If `hpState.currentHp >= hpState.maxHp` → skip HP fetch
- If `staminaState.current >= staminaState.max && manaState.current >= manaState.max` → skip resources fetch

This means on the crafting screen at full HP: **1 request per 10s** (just turns) instead of 3.

The `loadTurnsAndHp` function becomes `pollScreenData`:

```ts
const pollScreenData = useCallback(async () => {
  const needs = SCREEN_POLL_NEEDS[activeScreen] ?? ['turns'];
  const fetches: Promise<void>[] = [];

  // Turns always poll
  fetches.push(getTurns().then(res => { if (res.data) setTurns(res.data.currentTurns); }));

  if (needs.includes('hp') && hpState.currentHp < hpState.maxHp) {
    fetches.push(getHpState().then(res => {
      if (res.data) { setHpState(res.data); hpStateRef.current = res.data; }
    }));
  }

  if (needs.includes('resources')) {
    const staminaFull = staminaState.current >= staminaState.max;
    const manaFull = manaState.current >= manaState.max;
    if (!staminaFull || !manaFull) {
      fetches.push(getResources().then(res => {
        if (res.data) { setStaminaState(res.data.stamina); setManaState(res.data.mana); }
      }));
    }
  }

  await Promise.all(fetches);
}, [activeScreen, hpState, staminaState, manaState]);
```

### 6. 429 Rate Limit Toast

**In `fetchApi` (apps/web/src/lib/api/core.ts):**

```ts
if (res.status === 429) {
  window.dispatchEvent(new CustomEvent('api:rate-limited'));
  return { error: { message: 'Too many requests', code: 'RATE_LIMITED' } };
}
```

This goes before the existing `!res.ok` block (lines 132-146) so it's caught before the generic error path.

**Toast listener** — in the game layout or a dedicated hook:

```ts
function useRateLimitToast() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      if (timeout) return; // debounce
      showToast('Too many requests — wait a moment', 'warning');
      timeout = setTimeout(() => { timeout = null; }, 4000);
    };

    window.addEventListener('api:rate-limited', handler);
    return () => window.removeEventListener('api:rate-limited', handler);
  }, []);
}
```

Integrates with the existing `useToastQueue` system. A new `RateLimitToast` component (similar to `QuestToast`) registers via `window.__showRateLimitToast` and renders through `ToastContainer`. The `useRateLimitToast` hook listens for the `api:rate-limited` event and calls the global:

```ts
function useRateLimitToast() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timeout) return;
      const show = (window as Record<string, unknown>).__showRateLimitToast as
        | ((msg: string) => void) | undefined;
      show?.('Too many requests — wait a moment');
      timeout = setTimeout(() => { timeout = null; }, 4000);
    };
    window.addEventListener('api:rate-limited', handler);
    return () => window.removeEventListener('api:rate-limited', handler);
  }, []);
}
```

### 7. loadAll Retained for Initial Load Only

`loadAll()` stays but is only called on mount (line 551 in `useGameController.ts`). It is removed from:
- `simpleAction` / `runSimpleAction`
- `handleCraft`
- `handleStartExploration` / exploration playback complete
- `handleStartCombat`
- `handleGather`
- Loot claiming
- Travel hops
- All other action handlers

The function itself can be simplified later, but that's out of scope.

## Request Count Comparison

| Scenario | Before | After |
|----------|--------|-------|
| Single craft action | 12 (1 POST + 11 GET) | 1 (1 POST) |
| 10 crafts in 1 minute | 120 (rate limited) | 10 |
| Idle on crafting screen (per 10s) | 3 (turns + HP + resources) | 1 (turns only) |
| Idle on explore screen at full HP (per 10s) | 3 | 1 (turns only) |
| Idle on explore screen at low HP (per 10s) | 3 | 2-3 (turns + HP, maybe resources) |
| Initial page load | 11 | 11 (unchanged) |

## Files Changed

### API (new/modified)
- `packages/shared/src/types/stateUpdates.types.ts` — `StateUpdates`, `InventoryItemDTO` type definitions
- `apps/api/src/services/stateUpdateHelpers.ts` — `toInventoryItemDTO()`, `buildStateUpdates()` shared helpers
- `apps/api/src/routes/crafting/craft.ts` — add stateUpdates to response
- `apps/api/src/routes/crafting/salvage.ts` — add stateUpdates to response
- `apps/api/src/routes/gathering.ts` — add stateUpdates to response
- `apps/api/src/routes/equipment.ts` — add stateUpdates to response
- `apps/api/src/routes/inventory.ts` — add stateUpdates (sell, destroy, use)
- `apps/api/src/routes/combat/start.ts` — add stateUpdates to response
- `apps/api/src/routes/exploration/start.ts` — add stateUpdates to response
- `apps/api/src/routes/travel.ts` — add stateUpdates to response
- `apps/api/src/routes/rest.ts` — add stateUpdates to response
- `apps/api/src/routes/stash.ts` — add stateUpdates to response
- `apps/api/src/routes/loot.ts` — add stateUpdates to response
- `apps/api/src/routes/buffs.ts` — add stateUpdates to response
- `apps/api/src/routes/equipment.ts` — repair endpoints add stateUpdates

### Frontend (new/modified)
- `apps/web/src/app/game/applyStateUpdates.ts` — new utility
- `apps/web/src/app/game/simpleAction.ts` — remove loadAll parameter
- `apps/web/src/app/game/useGameController.ts` — refactor all handlers, screen-aware polling
- `apps/web/src/lib/api/core.ts` — 429 detection + event dispatch
- `apps/web/src/app/game/hooks/useRateLimitToast.ts` — new hook for toast display

### Shared
- `packages/shared/src/types/stateUpdates.types.ts` — shared type definitions

## Testing

- **Unit tests** for `applyStateUpdates` — verify inventory merge logic (add, remove, update, combinations)
- **Unit tests** for `toInventoryItemDTO` — verify serialisation
- **API integration tests** — verify each enriched route returns valid `stateUpdates`
- **Manual testing** — craft 20 items rapidly, verify no rate limiting and UI stays consistent
- **E2E** — existing Playwright tests should pass without changes (behaviour is identical, just fewer network calls)
