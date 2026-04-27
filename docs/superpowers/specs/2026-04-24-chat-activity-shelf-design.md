# Chat Activity Shelf Design

## Overview

Improve the existing chat system with a balanced pass across liveliness, usability, and channel structure. The selected direction is an activity shelf: player conversation remains the primary chat stream, zone activity stays inline in zone chat, and global activity appears in a compact shelf inside the chat panel.

This broadens GitHub issue #166, "Zone activity feed", without turning chat into a new social product. The work should use the existing Socket.IO chat rooms, `chat_messages` persistence, system messages, and Redis cooldown patterns.

## Goals

- Make the world feel more active through ambient activity messages.
- Keep player conversation readable by separating global system activity from world chat text.
- Improve the existing chat panel without replacing it with a larger social console.
- Keep the implementation compatible with the current `world`, `zone`, and `casino` channel model.
- Store structured activity data so chat events can feed other game surfaces, especially NPC dialogue.

## Non-Goals

- Direct messages, friends chat, moderation tools, or chat reports.
- A full-screen chat screen.
- Long-lived activity archive or searchable feed.
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

### NPC Activity Awareness

NPC dialogue reacts to notable activity that entered the chat system. If a player crafts an Epic Steel Greatsword and that activity is broadcast, Kessa can comment on it the next time the player sees her in town.

This is not free-form generated dialogue. It should use structured activity data plus hand-written template families mapped to relevant NPCs. The result is a small closed loop:

```text
Player action -> chat activity -> activity shelf or zone chat -> relevant NPC comment
```

NPC comments should be opportunistic and non-blocking. A relevant activity line can temporarily take priority over the normal greeting or idle line, then the banner returns to the existing rotation. Each player/NPC/activity combination should be shown once so NPCs do not repeat stale news every visit.

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

Only events that already have reliable trigger points are included in the first pass. New event families are added later through the same service.

## Backend Design

Create `apps/api/src/services/chatActivityService.ts` to wrap the existing `emitSystemMessage` infrastructure and persist structured activity metadata.

The service should expose intent-level functions rather than requiring each call site to format arbitrary strings:

```typescript
broadcastZoneActivity(zoneId, eventType, data)
broadcastGlobalActivity(eventType, data)
```

The service should:

- Format concise, sanitized system messages from typed event data.
- Persist the chat message through `emitSystemMessage`, using `channelType: 'zone'` and `channelId: zone:${zoneId}` for zone activity.
- Persist global shelf messages through `emitSystemMessage`, using `channelType: 'world'` and `channelId: 'world'`.
- Persist a structured activity record linked to the chat message.
- Use Redis cooldowns keyed by player/event type where player-triggered spam is possible.
- Skip silently when required data is missing or Socket.IO is unavailable.
- Prefer fire-and-forget calls from gameplay routes and services so activity broadcasts do not block reward, combat, or crafting outcomes.

Shared constants should live in `packages/shared/src/constants/gameConstants.ts` as `CHAT_ACTIVITY_CONSTANTS`, covering enabled event types, rarity thresholds, visible shelf count, and cooldown duration.

## Schema Design

Add a structured activity table named `ChatActivity`.

```prisma
model ChatActivity {
  id             String   @id @default(uuid())
  chatMessageId  String?  @unique @map("chat_message_id")
  eventType      String   @map("event_type") @db.VarChar(32)
  scope          String   @db.VarChar(16)
  zoneId         String?  @map("zone_id")
  actorPlayerId  String?  @map("actor_player_id")
  actorUsername  String?  @map("actor_username") @db.VarChar(32)
  subjectName    String?  @map("subject_name") @db.VarChar(96)
  subjectRarity  String?  @map("subject_rarity") @db.VarChar(16)
  message        String   @db.VarChar(200)
  metadata       Json     @default("{}")
  expiresAt      DateTime? @map("expires_at")
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([scope, createdAt])
  @@index([zoneId, createdAt])
  @@index([eventType, createdAt])
  @@map("chat_activities")
}
```

Add a per-player seen table so NPC reactions are memorable without becoming repetitive.

```prisma
model PlayerNpcActivityReaction {
  playerId   String   @map("player_id")
  npcKey     String   @map("npc_key") @db.VarChar(64)
  activityId String   @map("activity_id")
  reactedAt  DateTime @default(now()) @map("reacted_at")

  @@id([playerId, npcKey, activityId])
  @@index([playerId, npcKey, reactedAt])
  @@map("player_npc_activity_reactions")
}
```

These tables deliberately duplicate the rendered message and key subject fields. Chat display can stay simple, while NPC reactions can query structured data without parsing chat text.

`chatMessageId` is a denormalized reference to the persisted chat message. The first implementation does not need to add a Prisma relation field to `ChatMessage`.

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

### NPC Dialogue Integration

Add an API endpoint that returns one relevant activity reaction for the current player and NPC key:

```text
GET /api/v1/chat/activity/npc-reaction?npcKey=millbrook-blacksmith
```

The endpoint should:

- Authenticate the player.
- Resolve the player's current zone and home/town context.
- Look for recent unreacted `ChatActivity` records relevant to the supplied `npcKey`.
- Prefer the current player's own activity for profession NPCs, such as crafting and rare loot comments.
- Allow community/global activity for town-level NPCs, such as guards, quest board NPCs, and shopkeepers.
- Mark the selected activity as reacted for that player/NPC before returning it.
- Return `null` when no relevant activity exists.

Relevance should be defined in shared/static code, not in chat text. Examples:

- Kessa and other blacksmith keys react to `craft_crit` for metal weapons, armor, and refining.
- Artisan and jeweller keys react to craft events for their professions.
- Town guards react to boss defeats and major zone discoveries.
- Quest board NPCs react to achievements and server milestones.
- Shopkeepers can react lightly to rare loot finds.

Add shared NPC activity reaction definitions that map NPC keys and event types to formatter functions. These formatters turn the returned activity into an NPC-specific line.

```text
Kessa: "An Epic Steel Greatsword, was it? Good. Means somebody was listening at the anvil."
```

`NpcDialogueBanner` accepts an optional `activityLine` priority prop. When present, the banner renders that line instead of the normal rotated line for the current dialogue event. Existing `showNpcDialogue` preference still controls whether this appears.

## Data Flow

```text
Gameplay service or route
  -> chatActivityService formats and cooldown-checks the event
  -> emitSystemMessage persists to chat_messages and emits Socket.IO chat:message
  -> chatActivityService stores structured ChatActivity metadata
  -> useChat receives chat:message or history response
  -> world system messages render in ActivityShelf
  -> zone system messages render inline in zone chat
  -> NpcDialogueBanner asks for a relevant unreacted activity
  -> NPC renders one priority reaction line, then returns to normal dialogue
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
- Unit tests for structured activity persistence payloads.
- Tests for skipping broadcasts when required event data is absent.
- API tests for NPC reaction selection and once-per-player/NPC/activity behavior.
- Existing `systemMessageService` behavior remains the persistence/emission foundation.

Frontend:

- `ChatPanel` tests for global activity rendering in the shelf.
- `ChatPanel` tests that world system messages do not render as normal world chat rows.
- `NpcDialogueBanner` tests for priority activity line rendering.
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
- NPC reaction selection can become noisy if relevance is too broad. Start with a small mapping for obvious NPC/event pairs, then expand once it feels good in play.
- Marking NPC reactions as seen when fetched means a network response that never renders can consume the line. This is acceptable for the first pass because it prevents duplicate spam and the feature is ambient.

## Open Decisions Resolved

- Activity layout: activity shelf, not a separate full tab or two-pane console.
- Event placement: zone activity inline; global activity in the shelf.
- Persistence: use `chat_messages` for display plus `chat_activities` for structured metadata.
- NPC loop: relevant NPCs can comment once on recent activity that entered the chat activity system.
- Initial scope: issue #166 event families, activity shelf presentation, and a small NPC reaction loop for the most obvious NPC/event pairs.
