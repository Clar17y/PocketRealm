# Zone Activity Feed: Ambient Social Awareness

**Category:** feature
**Priority:** high
**Scope:** medium

## Description
Broadcast notable player actions as system messages to the zone chat channel, transforming zones from silent backdrops into living spaces where you see what others are doing. When a player in your zone scores a rare+ loot drop, crits a legendary craft, discovers a new zone exit, or defeats a tough mob prefix, a short system message appears in zone chat (e.g., "Kael forged a Rare Dragonbone Axe!", "Mira discovered a passage to the Frozen Wastes"). The infrastructure already exists: zone chat rooms track per-zone membership via Socket.IO, system messages are a supported `messageType`, and `getIo()` exposes the server instance for broadcasting from any service. Implementation is a thin `zoneActivityService.ts` that accepts an event descriptor and calls `io.to('chat:zone:{zoneId}').emit('chat:message', ...)` with `messageType: 'system'`, hooked into the post-combat loot path, crafting crit path, and zone discovery path. A `ZONE_ACTIVITY_CONSTANTS` group controls which events qualify and applies a per-event-type cooldown to prevent spam. This makes the multiplayer world feel populated and creates organic social moments -- players notice each other's accomplishments without needing to actively chat, and rare broadcasts ("Vex found a Legendary drop!") become shared server-wide stories.
