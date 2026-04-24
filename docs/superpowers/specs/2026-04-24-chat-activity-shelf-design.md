# Chat Activity Shelf Design

## Overview

Improve the existing chat system with a balanced pass across liveliness, usability, and channel structure. The selected direction is an activity shelf: player conversation remains the primary chat stream, zone activity stays inline in zone chat, and global activity appears in a compact shelf inside the chat panel.

This broadens GitHub issue #166, "Zone activity feed", without turning chat into a new social product. The work should use the existing Socket.IO chat rooms, `chat_messages` persistence, system messages, and Redis cooldown patterns.

## Goals

- Make the world feel more active through ambient activity messages.
- Keep player conversation readable by separating global system activity from world chat text.
- Improve the existing chat panel without replacing it with a larger social console.
- Keep the implementation compatible with the current `world`, `zone`, and `casino` channel model.
- Do not add schema changes in the first implementation; if the existing `messageType: 'system'` contract proves insufficient, stop and revise this design before implementing a schema change.

## Non-Goals

- Direct messages, friends chat, moderation tools, or chat reports.
- A full-screen chat screen.
- Long-lived activity archive or searchable feed.
- New database tables for activity events.
- Changes to casino-specific real-time events beyond preserving the current casino chat behavior.

## Product Behavior

### World Chat

World chat should primarily show player messages. System messages persisted to the world channel represent global activity and should be pulled into the activity shelf instead of occupying the main message list.

The shelf shows the three most recent global activity items. It sits inside the existing floating panel, below the message list and above the input area. If there are no global activity items, the shelf is hidden.

### Zone Chat

Zone chat keeps local activity inline. Issue #166 events such as rare loot, crafting crits, discoveries, achievements, and boss moments appear as quieter system rows in the zone message stream. This keeps the current zone context lively without forcing players to switch tabs.

Zone activity should not create unread world counts. It should count as unread zone activity only when the panel is closed or another channel is active, matching current message behavior.

### Casino Chat

Casino chat remains scoped to casino activity. This pass should preserve dealer/system message injection and the current casino tab lifecycle.

## Activity Events

The first implementation should support these event families:

| Event | Scope | Example |
| --- | --- | --- |
| Rare+ loot drop | Zone | "Mira found a Rare Willow Bark." |
| Rare+ craft result | Zone | "Kael crafted an Epic Steel Greatsword." |
| Zone discovery | Zone | "Vex discovered a passage to the Frozen Wastes." |
| Achievement unlock | Zone | "Sven earned the achievement The Warrior." |
| Boss defeat | Zone and global where existing boss logic already broadcasts globally | "Millbrook pushed back the Ashen Herald." |
| Server-wide milestone or seasonal event | Global | "The first guild reached renown rank 10 this season." |

Only events that already have reliable trigger points should be included in the first pass. New event families can be added later through the same service.

## Backend Design

Create `apps/api/src/services/chatActivityService.ts` to wrap the existing `emitSystemMessage` infrastructure.

The service should expose intent-level functions rather than requiring each call site to format arbitrary strings:

```typescript
broadcastZoneActivity(zoneId, eventType, data)
broadcastGlobalActivity(eventType, data)
```

The service should:

- Format concise, sanitized system messages from typed event data.
- Persist activity through `emitSystemMessage`, using `channelType: 'zone'` and `channelId: zone:${zoneId}` for zone activity.
- Persist global shelf activity through `emitSystemMessage`, using `channelType: 'world'` and `channelId: 'world'`.
- Use Redis cooldowns keyed by player/event type where player-triggered spam is possible.
- Skip silently when required data is missing or Socket.IO is unavailable.
- Prefer fire-and-forget calls from gameplay routes and services so activity broadcasts do not block reward, combat, or crafting outcomes.

Shared constants should live in `packages/shared/src/constants/gameConstants.ts` as `CHAT_ACTIVITY_CONSTANTS`, covering enabled event types, rarity thresholds, visible shelf count, and cooldown duration.

## Frontend Design

Keep the current `ChatPanel` structure and add a small `ActivityShelf` rendering path. Extract `ActivityShelf` into its own component if the `ChatPanel` diff would otherwise mix shelf rendering with message-row rendering.

`useChat` should continue to own message state, unread counts, socket listeners, and history loading. It should derive:

- `worldChatMessages`: world messages where `messageType !== 'system'`.
- `globalActivityMessages`: recent world messages with `messageType: 'system'`.
- `zoneMessages`: zone player messages and zone system messages inline.
- `casinoMessages`: unchanged.

The panel should render:

- Current tabs, adding `tablist`, `tab`, and `aria-selected` while the tab markup is being edited.
- Main message list for the active channel.
- Inline zone system rows with a quieter treatment than player messages.
- Activity shelf only when global activity exists.
- Current rate-limit and input behavior.

The shelf should be compact. It should not add explanatory copy inside the app UI; the visual treatment should communicate that these are ambient events.

## Data Flow

```text
Gameplay service or route
  -> chatActivityService formats and cooldown-checks the event
  -> emitSystemMessage persists to chat_messages and emits Socket.IO chat:message
  -> useChat receives chat:message or history response
  -> world system messages render in ActivityShelf
  -> zone system messages render inline in zone chat
```

On reconnect, history loading should repopulate both the world message list and the shelf from existing `/chat/history` responses. This avoids a separate activity endpoint.

## UX Details

- System rows should be readable but visually subordinate to player messages.
- The shelf should show the latest three global activity items in chronological order, matching the chat stream's oldest-to-newest reading direction.
- Player messages should keep title styling, admin/mod badges, timestamps, and own-message coloring.
- Empty states should distinguish between "no player messages yet" and a hidden shelf with no global activity.
- The panel should remain usable at the current mobile max height.

## Testing

Backend:

- Unit tests for activity message formatting and cooldown behavior.
- Tests for skipping broadcasts when required event data is absent.
- Existing `systemMessageService` behavior remains the persistence/emission foundation.

Frontend:

- `ChatPanel` tests for global activity rendering in the shelf.
- `ChatPanel` tests that world system messages do not render as normal world chat rows.
- A focused `useChat` test only if existing test infrastructure makes hook behavior practical; otherwise cover derivation through component-level tests.

Verification:

- Run focused API service tests for the new activity service.
- Run focused web tests for `ChatPanel`.
- Run `npm run typecheck` after implementation.
- Run broader tests only if touched integration points make focused verification insufficient.

## Risks

- Existing world system messages may currently be expected inline. Moving them to the shelf changes presentation but keeps them visible.
- Some activity trigger points are in large route files. Implementation should avoid broad refactors and add small helper functions where needed.
- Redis cooldowns must fail safely; a cooldown failure should not break the underlying gameplay action.
- The chat panel is already compact on mobile. The shelf must be visually useful without crowding the input.

## Open Decisions Resolved

- Activity layout: activity shelf, not a separate full tab or two-pane console.
- Event placement: zone activity inline; global activity in the shelf.
- Persistence: reuse `chat_messages` and `messageType: 'system'`.
- Initial scope: issue #166 event families plus presentation improvements needed to make the hybrid model work.
