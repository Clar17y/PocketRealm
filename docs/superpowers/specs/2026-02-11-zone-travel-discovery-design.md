# Zone Travel & Discovery Design

## Problems

1. **Stuck in town** — player starts in Millbrook with no way to leave. Exploration yields nothing (no mobs, no resources in towns). Zone exits discovered during exploration aren't persisted.
2. **No server-side travel** — travel is client-side state only. `travelCost` exists on zones but is never charged.
3. **Flat world map** — zone list doesn't show the branching graph topology.
4. **Zone exit too easy to find** — 0.2%/turn means exits are discovered in ~500 turns. Should take days of exploration for early zones, weeks for later ones.
5. **No consequence for defeat** — getting KO'd during exploration leaves you in the same zone. No real punishment.

## Design Decisions

### Towns Are Safe Hubs
- **No exploration in towns.** API rejects exploration requests for `zoneType: "town"`. Frontend hides the exploration panel in towns.
- **Auto-discovery from towns.** Arriving at (or starting in) a town automatically reveals all connected zones. No exploration needed to leave.

### Zone Discovery Persistence
New model: `PlayerZoneDiscovery` (playerId, zoneId, discoveredAt). Replaces the current activity-log-scanning approach.

Discovery sources:
- **Starter zones** — created on character creation (or lazily on first `/zones` call)
- **Town auto-discovery** — on arrival at a town, all connected zones get records
- **Exploration zone_exit** — rolling a zone exit in a wild zone creates a record for one random undiscovered neighbor

### Zone Exit Discovery Scaling
New field on `Zone`: `zoneExitChance` (float). Each zone has its own tuned discovery rate.

| Zone | zoneExitChance | Avg Turns to Discover |
|------|---------------|----------------------|
| Forest Edge | 0.0001 | ~10,000 |
| Deep Forest | 0.000033 | ~30,000 |
| Cave Entrance | 0.000033 | ~30,000 |
| Whispering Plains | 0.000013 | ~75,000 |
| Haunted Marsh | 0.0000067 | ~150,000 |
| Dead-end zones | null | No exits to discover |
| Towns | — | Auto-reveal, no discovery needed |

Zones with multiple exits (e.g., Forest Edge → Deep Forest + Cave Entrance) require separate discoveries. Each zone_exit roll picks one random undiscovered neighbor. ~20,000 total turns to find both Forest Edge exits.

`simulateExploration()` receives the zone's `zoneExitChance` instead of reading a global constant. When all adjacent zones are discovered, `canDiscoverZoneExit` is false and no exit rolls occur.

Narrative: "You discovered a path leading to **Deep Forest**." (includes zone name, not generic).

### Server-Side Travel

New endpoint: `POST /api/v1/zones/travel`

New player fields:
- `currentZoneId` (FK to Zone) — where the player is now
- `lastTravelledFromZoneId` (nullable FK to Zone) — breadcrumb for free return
- `homeTownId` (FK to Zone) — respawn point, defaults to starter town

#### Travel Rules

**Breadcrumb return (free):** If destination matches `lastTravelledFromZoneId`, travel is instant and free. No turns spent, no ambushes.

**Town departure (safe):** Leaving a town costs the destination's `travelCost` but triggers no ambushes (towns have no mob pool).

**Wild zone traversal:** Costs the current zone's `travelCost` in turns. Those turns run through a travel-specific ambush simulation using the **current zone's** mob pool at a higher rate (`TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04`).

The ambushes happen in the zone you're crossing through, not the destination. You're fighting your way across dangerous territory.

**On successful arrival:**
1. `currentZoneId` = destination
2. `lastTravelledFromZoneId` = zone you left
3. If destination is a town: `homeTownId` = destination, auto-discover connected zones
4. XP and loot from travel ambushes are granted

**On defeat mid-transit:** Player stays in current zone. Turns consumed up to defeat are gone. Remaining travel turns refunded. Breadcrumb unchanged. Must rest and try again.

#### Expected Travel Ambushes

| Zone | Travel Cost | Expected Ambushes (@ 0.04/turn) |
|------|-----------|--------------------------------|
| Forest Edge | 50 | ~2 |
| Deep Forest | 150 | ~6 |
| Cave Entrance | 150 | ~6 |
| Ancient Grove | 300 | ~12 |
| Whispering Plains | 250 | ~10 |
| Deep Mines | 300 | ~12 |
| Haunted Marsh | 400 | ~16 |
| Crystal Caverns | 400 | ~16 |
| Sunken Ruins | 600 | ~24 |

Players must be strong enough to survive multiple ambushes without healing to traverse a zone. This is natural zone gating.

### KO & Respawn

**Rule:** Any defeat (exploration ambush, encounter site fight, or travel ambush) sends the player to their `homeTownId`.

On KO:
1. `currentZoneId` = `homeTownId`
2. `lastTravelledFromZoneId` = null (breadcrumb reset)
3. HP set to recovering state
4. Activity log: "You were defeated and woke up in [town name]."

Consequence scales with depth:
- KO'd in Forest Edge → Millbrook, 50 turns + ~2 fights to return
- KO'd in Deep Forest → Millbrook, 50 + 150 turns + ~8 fights across two zones
- KO'd in Haunted Marsh → Thornwall (if set as home), much shorter return

Setting Thornwall as home town is a meaningful progression milestone.

### World Map: Tiered Tree Layout

Updated `GET /api/v1/zones` response:
```typescript
{
  zones: Zone[],
  connections: { fromId: string, toId: string }[],
  currentZoneId: string
}
```

Zones rendered in horizontal tiers by graph distance from Millbrook:

```
Tier 0:           [Millbrook]
                      |
Tier 1:         [Forest Edge]
                  /        \
Tier 2:   [Deep Forest]  [Cave Entrance]
            /      \           |
Tier 3: [Ancient  [Whisp.   [Deep
         Grove]   Plains]   Mines]
                    |
Tier 4:         [Thornwall]
                 /        \
Tier 5: [Haunted       [Crystal
         Marsh]        Caverns]
            |
Tier 6: [Sunken Ruins]
```

Max width: 3 zones. Fits mobile. Compact zone nodes showing name, difficulty stars, travel cost. Connection lines via CSS pseudo-elements or lightweight SVG. Current zone highlighted gold. Undiscovered zones show as dim "???" nodes. Tapping a discovered zone shows travel button with turn cost.

## Database Changes

### New Model
```prisma
model PlayerZoneDiscovery {
  id           String   @id @default(uuid())
  playerId     String
  zoneId       String
  discoveredAt DateTime @default(now())
  player       Player   @relation(fields: [playerId], references: [id])
  zone         Zone     @relation(fields: [zoneId], references: [id])
  @@unique([playerId, zoneId])
  @@index([playerId])
}
```

### Modified Models
**Player:** add `currentZoneId`, `lastTravelledFromZoneId`, `homeTownId` (all FK to Zone)

**Zone:** add `zoneExitChance` (Float, nullable — null for dead ends and towns)

## API Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/zones/travel` | **New.** Validates discovery + connection, deducts turns, runs travel ambush sim, moves player, auto-discovers from towns |
| `GET /api/v1/zones` | Use `PlayerZoneDiscovery` instead of ActivityLog. Return connections + currentZoneId |
| `POST /api/v1/exploration/start` | Reject town zones. On zone_exit: create PlayerZoneDiscovery, include zone name. Use per-zone `zoneExitChance` |
| `GET /api/v1/exploration/estimate` | Accept per-zone exit chance. Hide exit line when nothing to discover |
| Combat/encounter routes | On KO: respawn to homeTownId, reset breadcrumb |

## New Constants

```typescript
TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04
```

Removed: `ZONE_EXIT_CHANCE` global constant (replaced by per-zone field).

## Frontend Changes

- `useGameController`: `handleTravelToZone` calls new travel API, refreshes turns + zones
- `ZoneMap`: tiered tree layout, show travel cost on button, disable if insufficient turns
- `Exploration`: hide entirely in towns
- Exploration estimate: use per-zone exit chance, hide exit line when all neighbors discovered
- KO handling: show respawn message, refresh zone/position state
