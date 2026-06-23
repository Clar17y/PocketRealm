# Vex Merchant Access Design

## Goal

Make Vex visible and usable in the game UI so players can discover that world boss drops can be traded for Vex exchanges.

The current Vex boss rewards branch provides the backend service, API routes, shared DTOs, and web API client helpers. This design adds the missing player-facing access layer: where Vex appears, how players open his menu, and how purchases update the game state.

## Current State

Implemented already:

- `GET /api/v1/vex/exchanges`
- `POST /api/v1/vex/exchanges/:exchangeKey/purchase`
- Web helpers `getVexExchanges()` and `purchaseVexExchange(...)`
- Exchange definitions for Aegis items, durability tempering, and boss stones
- State update payloads for gold, inventory, materials, and equipment

Not implemented yet:

- No Vex screen
- No Vex navigation entry
- No merchant panel on any existing screen
- No timed wandering merchant availability state
- No Vex NPC dialogue entry

## Recommended Access Model

Vex should appear as a permanent travelling merchant camp on the `World Events` screen.

Primary access:

- `Explore` bottom tab
- `World Events` screen
- A new `Vex's Camp` panel near the active boss encounter section
- Button: `Trade with Vex`
- Button navigates to a dedicated `vex` screen

This keeps the feature tied to world bosses without requiring timed spawn infrastructure. Players checking boss encounters will naturally see the merchant who explains why boss drops matter.

## Why Not Timed Spawns Yet

The more flavourful version is that Vex appears realm-wide for a limited time after a world boss dies. That should be deferred.

Timed Vex would require:

- database state for merchant availability
- event scheduling or expiry logic
- backend purchase guards while unavailable
- frontend timers
- notification/deep-link support
- edge-case handling when a player has the menu open as Vex expires

The first version should prove the exchange loop before adding availability windows.

## Screen And Navigation Design

Add a dedicated `vex` game screen.

Navigation behavior:

- `vex` belongs under the `Explore` bottom tab.
- Direct navigation to `vex` is supported through the existing screen navigation system.
- The `WorldEvents` screen receives an `onNavigate` callback and calls `onNavigate('vex')` when the player presses `Trade with Vex`.

The `vex` screen should not be a bottom-nav tab. It is a secondary Explore screen, similar to `worldEvents`, `casino`, or `training`.

## Vex Screen UX

The screen should feel like an in-game merchant menu, not an admin table.

Content:

- Title: `Vex, Collector of Trophies`
- Short flavour line explaining that Vex trades boss trophies for rare gear and item alterations.
- Player gold.
- Exchange category filters:
  - `All`
  - `Gear`
  - `Upgrades`
  - `Tempering`
  - `Boss Stones`
- Exchange cards sorted by `sortOrder`.

Each exchange card shows:

- name
- description
- gold cost
- required boss drops with owned quantity
- target item selector if `targetOptions` is non-empty
- blocked reason when unavailable
- purchase button when available

Target selection behavior:

- For exchanges with target options, the player must select one eligible item.
- Options should show item name, rarity, durability, and whether the exchange has already been applied.
- Already-applied targets should be visible but disabled or clearly blocked so players understand the one-time rule.
- If there are no eligible targets, show the API-provided blocked reason.

Purchase behavior:

- Disable the purchase button while the request is in flight.
- Call `purchaseVexExchange(exchange.key, { targetItemId })`.
- Apply returned `stateUpdates` through the same game-state update path used by other screens.
- Refresh `getVexExchanges()` after a successful purchase so owned material counts, gold, and target availability are current.
- Show the returned message as the success copy.

## World Events Panel

The `WorldEvents` screen should include a compact Vex panel whether or not there are active boss encounters.

Panel copy:

- Heading: `Vex's Camp`
- Body: `A travelling collector trades world boss trophies for rare gear, tempering, and boss stones.`
- Button: `Trade with Vex`

Placement:

- Below active boss encounters when bosses exist.
- Above the empty-state copy when there are no active events or bosses.

This means players can find Vex even between boss spawns, while still associating him with the boss system.

## NPC Dialogue

Add Vex to NPC dialogue constants as a merchant NPC.

Initial events:

- `greeting`
- `idle`
- `purchase`

The first implementation only needs to show a Vex dialogue banner on the `vex` screen when NPC dialogue is enabled. A purchase-specific line can be added later if the existing dialogue system does not support screen-local purchase reactions cleanly.

## Data Flow

Load:

1. `VexScreen` mounts.
2. Calls `getVexExchanges()`.
3. Stores `exchanges`, `gold`, loading state, and error state locally.

Purchase:

1. User selects a target item when required.
2. User presses purchase.
3. `purchaseVexExchange(exchangeKey, params)` posts to the API.
4. On success:
   - call `onStateUpdates(response.stateUpdates)` when present
   - show `response.message`
   - reload exchanges
5. On failure:
   - show the API error message
   - leave current selection intact

## Error And Edge Cases

- Loading failure: show a retry button.
- Purchase failure: show the message returned by the API.
- Exchange becomes unavailable between load and purchase: API error wins; screen reloads after the failed purchase.
- No exchanges returned: show `Vex has nothing to trade right now.`
- No target selected for target-based exchange: keep the purchase button disabled and show `Choose an item first.`
- Frozen season: API already blocks purchase. Surface the existing season-ended error.

## Non-Goals

Do not implement these in the first Vex UI slice:

- timed Vex spawn windows
- Vex notifications
- map markers
- Discord alerts
- random appearance chance
- extra exchanges beyond the current Vex definitions
- general poison/thorns/imbuement functionality

## Implementation Boundaries

Expected files:

- `apps/web/src/components/screens/VexScreen.tsx`
- `apps/web/src/components/screens/VexScreen.test.tsx`
- `apps/web/src/app/game/gameController.types.ts`
- `apps/web/src/app/game/useGameController.ts`
- `apps/web/src/app/game/GameScreenRenderer.tsx` or the relevant renderer module
- `apps/web/src/components/screens/WorldEvents.tsx`
- `apps/web/src/components/screens/WorldEvents.test.tsx` if existing test structure makes this straightforward
- `packages/shared/src/constants/npcDialogue.ts`
- `apps/web/src/lib/assets.ts` only if a dedicated Vex background asset is added; this design does not require one

The API service and routes should not need changes for the permanent-access version.

## Testing

Required focused tests:

- Vex screen loads exchanges and renders cards.
- Vex screen renders required item ownership and blocked reasons.
- Target-based exchange requires target selection.
- Successful purchase calls the web API, applies returned state updates, shows success copy, and refreshes exchanges.
- World Events screen renders `Vex's Camp` and calls `onNavigate('vex')`.
- `useGameController.getActiveTab()` maps `vex` to `explore`.

Manual verification:

- Navigate to `Explore -> World Events`.
- Open `Trade with Vex`.
- Confirm exchange list renders.
- Confirm disabled exchanges explain why.
- Confirm a successful mocked or seeded purchase updates gold/material/inventory state.

## Follow-Up Design

If the permanent merchant works well, the next design can make Vex truly wandering:

- Vex appears for a fixed window after a world boss dies.
- The API includes availability state and blocks purchases outside the window.
- The World Events panel changes to a timed event card.
- Boss defeat notifications can include a `Trade with Vex` deep link.
