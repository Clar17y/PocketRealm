# Zone Activity Feed Design

## Overview

Broadcast notable player actions as system messages to the zone chat channel, making zones feel alive and populated. When a player in your zone scores a rare+ loot drop, crits a legendary craft, discovers a zone exit, defeats a boss, or unlocks an achievement, a short system message appears in zone chat.

## Qualifying Events

| Event | Trigger Point | Example Message |
|-------|--------------|-----------------|
| Rare+ loot drop | Post-combat loot grant | "Kael found a Rare Dragonbone Axe!" |
| Rare+ craft result | Crafting crit result | "Mira crafted an Epic Steel Greatsword!" |
| Zone exit discovery | Zone discovery service | "Vex discovered a passage to the Frozen Wastes!" |
| Boss kill | Boss defeat handler (modify existing message) | "The guild Ironborn defeated the Ancient Dragon!" |
| Achievement unlock | Achievement service | "Sven earned the achievement: The Warrior!" |

## Implementation

### New Service: `zoneActivityService.ts`

Single function: `broadcastZoneEvent(zoneId: string, eventType: ZoneActivityEventType, data: ZoneActivityData)`

- Obtains Socket.IO instance via `getIo()` from `../socket` (consistent with `achievementService.ts` pattern)
- Checks per-event-type cooldown (prevents spam if a player chain-farms rare drops)
- Formats the message string from event data
- Calls existing `emitSystemMessage(io, 'zone', `zone:${zoneId}`, message)` — note: channelId must be `zone:${zoneId}` (not bare zoneId) because Socket.IO rooms are `chat:zone:${zoneId}` and `emitSystemMessage` emits to `chat:${channelId}`

### Types

```typescript
type ZoneActivityEventType = 'rare_loot' | 'craft_crit' | 'zone_discovery' | 'boss_kill' | 'achievement';

interface ZoneActivityData {
  playerName: string;
  // Event-specific fields:
  itemName?: string;       // rare_loot, craft_crit
  rarity?: string;         // rare_loot, craft_crit
  zoneName?: string;       // zone_discovery (destination zone name)
  bossName?: string;       // boss_kill
  guildName?: string;      // boss_kill (if guild boss)
  achievementTitle?: string; // achievement
}
```

### Constants: `ZONE_ACTIVITY_CONSTANTS`

Add to `gameConstants.ts`:

```typescript
ZONE_ACTIVITY_CONSTANTS: {
  ENABLED_EVENTS: ['rare_loot', 'craft_crit', 'zone_discovery', 'boss_kill', 'achievement'],
  COOLDOWN_PER_EVENT_TYPE_MS: 60_000,  // Max 1 message per event type per player per 60s
  MIN_LOOT_RARITY: 'rare',             // Minimum rarity for loot broadcasts
  MIN_CRAFT_RARITY: 'rare',            // Minimum rarity for craft broadcasts
}
```

### Integration Points (5 hooks into existing services)

1. **Post-combat loot grant** — Two code paths grant combat loot:
   - `apps/api/src/routes/combat/start.ts` — encounter site combat, has `zoneId` in scope
   - `apps/api/src/routes/exploration/start.ts` — exploration ambush encounters, has `zoneId` in scope
   - In both: after `processCombatVictoryRewards` returns, check if any loot drop is rare+. Call `broadcastZoneEvent` from the route handler (not inside `processCombatVictoryRewards`, to avoid coupling the orchestration service to Socket.IO).

2. **Crafting crit result** — Hook in `apps/api/src/routes/crafting/craft.ts` (NOT `forge.ts`). The craft route is where `calculateCraftingCrit` runs and items can roll to rare/epic/legendary. After the crafting transaction completes (~line 252), check `craftedItemDetails` for rare+ rarity items. Forge upgrades (binary success/fail rarity bump) could also qualify — broadcast if the upgraded item reaches epic or legendary.

3. **Zone discovery** — After a new zone exit is discovered in the zone discovery service, broadcast to the *origin* zone (the zone the player is currently in).

4. **Boss defeat** — `bossEncounterService.ts` already emits system messages on boss defeat (lines 655-664). Rather than adding a duplicate message, modify the existing boss defeat system message to use the zone activity format. This is a modification of the existing hook, not a new one.

5. **Achievement unlock** — Inside `emitAchievementNotifications` in `achievementService.ts`, which already iterates over newly unlocked achievements. Add a `player.findUnique({ select: { currentZoneId: true } })` query to resolve the player's zone, then call `broadcastZoneEvent`. This adds one DB query per achievement check that produces unlocks (infrequent).

### Cooldown Mechanism

Redis key: `zone_activity:{playerId}:{eventType}` with TTL matching cooldown constant. Check before broadcasting — if key exists, skip silently. Cooldown is per-player globally (not per-zone), so a player changing zones is still rate-limited.

### Schema Changes

None. Purely Socket.IO + existing chat system message infrastructure.

### Frontend Changes

None required — system messages already render in the zone chat panel with `messageType: 'system'`. They'll appear naturally in the existing chat UI.

## Edge Cases

- Player not in a zone (e.g., `currentZoneId` is null): skip broadcast, no error
- Multiple rare drops in one combat: broadcast the highest rarity only
- During multi-encounter exploration: only broadcast the highest-rarity drop across all encounters in the batch
- Boss kill with multiple participants: broadcast once (from the boss service), not per-participant
