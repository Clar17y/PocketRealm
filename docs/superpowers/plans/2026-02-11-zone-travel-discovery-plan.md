# Zone Travel & Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement server-side zone travel with turn costs, ambush-during-travel, persistent zone discovery, KO→town respawn, and a tiered tree world map UI.

**Architecture:** New `PlayerZoneDiscovery` table replaces activity-log-scanning for zone visibility. New `POST /zones/travel` endpoint handles turn costs, travel ambushes, and breadcrumb logic. KO from any combat sends player to their home town. Frontend `ZoneMap` rewritten as a tiered tree graph. Exploration disabled in towns.

**Tech Stack:** Prisma (migration), Express routes, game-engine pure functions, React/Next.js frontend

**Design doc:** `docs/superpowers/specs/2026-02-11-zone-travel-discovery-design.md`

---

### Task 1: Database Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: new migration via `npx prisma migrate dev`

**Step 1: Add PlayerZoneDiscovery model and Player zone fields to schema**

Add to `schema.prisma` after the `Zone` model:

```prisma
model PlayerZoneDiscovery {
  id           String   @id @default(uuid())
  playerId     String   @map("player_id")
  zoneId       String   @map("zone_id")
  discoveredAt DateTime @default(now()) @map("discovered_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  zone   Zone   @relation(fields: [zoneId], references: [id], onDelete: Cascade)

  @@unique([playerId, zoneId])
  @@index([playerId])
  @@map("player_zone_discoveries")
}
```

Add to the `Zone` model:
- `zoneExitChance Float? @map("zone_exit_chance")` field
- `discoveries PlayerZoneDiscovery[]` relation
- `playersHere Player[] @relation("current_zone")` relation
- `playersBreadcrumb Player[] @relation("breadcrumb_zone")` relation
- `playersHome Player[] @relation("home_town")` relation

Add to the `Player` model:
- `currentZoneId String? @map("current_zone_id")`
- `lastTravelledFromZoneId String? @map("last_travelled_from_zone_id")`
- `homeTownId String? @map("home_town_id")`
- `currentZone Zone? @relation("current_zone", fields: [currentZoneId], references: [id])`
- `lastTravelledFromZone Zone? @relation("breadcrumb_zone", fields: [lastTravelledFromZoneId], references: [id])`
- `homeTown Zone? @relation("home_town", fields: [homeTownId], references: [id])`
- `zoneDiscoveries PlayerZoneDiscovery[]` relation

**Step 2: Run migration**

```bash
cd packages/database && npx prisma migrate dev --name add_zone_travel_discovery
```

**Step 3: Regenerate Prisma client and build database package**

```bash
npm run db:generate && npm run build --workspace=packages/database
```

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add PlayerZoneDiscovery model and Player zone fields"
```

---

### Task 2: Game Constants & Game Engine Updates

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/game-engine/src/exploration/probabilityModel.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Update game constants**

In `gameConstants.ts`, add `TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04` to `EXPLORATION_CONSTANTS`. Remove the `ZONE_EXIT_CHANCE` line (replaced by per-zone field). The constant block should look like:

```typescript
export const EXPLORATION_CONSTANTS = {
  AMBUSH_CHANCE_PER_TURN: 0.005,
  ENCOUNTER_SITE_CHANCE_PER_TURN: 0.0008,
  RESOURCE_NODE_CHANCE: 0.0005,
  HIDDEN_CACHE_CHANCE: 0.0001,
  // ZONE_EXIT_CHANCE removed — now per-zone field (Zone.zoneExitChance)
  TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04,
  ENCOUNTER_SITE_DECAY_RATE_PER_HOUR: 0.06,
  RESOURCE_NODE_DECAY_RATE_PER_HOUR: 0.65,
  ENCOUNTER_SIZE_SMALL: { min: 2, max: 3 },
  ENCOUNTER_SIZE_MEDIUM: { min: 4, max: 6 },
  ENCOUNTER_SIZE_LARGE: { min: 7, max: 10 },
  MIN_EXPLORATION_TURNS: 10,
  MAX_EXPLORATION_TURNS: 10_000,
} as const;
```

**Step 2: Update `simulateExploration` to accept `zoneExitChance` parameter**

In `probabilityModel.ts`, change the signature from:
```typescript
export function simulateExploration(
  turns: number,
  canDiscoverZoneExit: boolean = false
): ExplorationOutcome[]
```
to:
```typescript
export function simulateExploration(
  turns: number,
  zoneExitChance: number | null = null
): ExplorationOutcome[]
```

- If `zoneExitChance` is `null` or `<= 0`, no zone exit rolls occur.
- Replace `EXPLORATION_CONSTANTS.ZONE_EXIT_CHANCE` with the passed-in value.
- The `canDiscoverZoneExit` flag logic is preserved: once a zone_exit is rolled, set `zoneExitChance = null` for the rest of the simulation.

**Step 3: Update `estimateExploration` to accept `zoneExitChance` parameter**

Change signature to:
```typescript
export function estimateExploration(turns: number, zoneExitChance: number | null = null): ExplorationEstimate
```

Add `zoneExitChance` to the estimate output (cumulative probability). If `zoneExitChance` is null, report 0.

Add to the `ExplorationEstimate` interface:
```typescript
zoneExitChance: number; // cumulative probability
```

**Step 4: Create `simulateTravelAmbushes` function**

Add a new exported function in `probabilityModel.ts`:

```typescript
export interface TravelAmbushOutcome {
  turnOccurred: number;
}

export function simulateTravelAmbushes(turns: number): TravelAmbushOutcome[] {
  const outcomes: TravelAmbushOutcome[] = [];
  for (let t = 1; t <= turns; t++) {
    if (Math.random() < EXPLORATION_CONSTANTS.TRAVEL_AMBUSH_CHANCE_PER_TURN) {
      outcomes.push({ turnOccurred: t });
    }
  }
  return outcomes;
}
```

**Step 5: Build shared and game-engine packages**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
```

**Step 6: Commit**

```bash
git add packages/shared/ packages/game-engine/
git commit -m "feat: add travel ambush simulation and per-zone exit chance"
```

---

### Task 3: Zone Discovery Service

**Files:**
- Create: `apps/api/src/services/zoneDiscoveryService.ts`

**Step 1: Create zone discovery service**

This service encapsulates all zone discovery logic. Functions:

```typescript
import { prisma } from '@adventure/database';

// Ensure starter zone + town-adjacent discoveries exist for a player
// Called lazily on GET /zones and on registration
export async function ensureStarterDiscoveries(playerId: string): Promise<void> {
  // 1. Find all starter zones
  // 2. Find all zone connections from starter zones
  // 3. Upsert PlayerZoneDiscovery for starter + connected zones
}

// Auto-discover all zones connected to a town when arriving
export async function discoverZonesFromTown(playerId: string, townZoneId: string): Promise<string[]> {
  // 1. Get all ZoneConnection from townZoneId
  // 2. Upsert PlayerZoneDiscovery for each connected zone
  // 3. Return newly discovered zone IDs
}

// Discover a single specific zone
export async function discoverZone(playerId: string, zoneId: string): Promise<void> {
  // Upsert PlayerZoneDiscovery
}

// Get all discovered zone IDs for a player
export async function getDiscoveredZoneIds(playerId: string): Promise<Set<string>> {
  const discoveries = await prisma.playerZoneDiscovery.findMany({
    where: { playerId },
    select: { zoneId: true },
  });
  return new Set(discoveries.map(d => d.zoneId));
}

// Get undiscovered neighbor zone IDs (for zone_exit rolls)
export async function getUndiscoveredNeighborZones(
  playerId: string,
  currentZoneId: string
): Promise<Array<{ id: string; name: string }>> {
  // 1. Get all zone connections from currentZoneId
  // 2. Get PlayerZoneDiscovery for this player
  // 3. Return connected zones that aren't discovered yet
}
```

All functions use `prisma` directly — no transaction needed for upserts since `@@unique` constraint handles conflicts.

Use Prisma's `createMany` with `skipDuplicates: true` for batch upserts.

**Step 2: Commit**

```bash
git add apps/api/src/services/zoneDiscoveryService.ts
git commit -m "feat: add zone discovery service"
```

---

### Task 4: Zones API Rewrite

**Files:**
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Rewrite GET /zones to use PlayerZoneDiscovery**

Replace the activity-log-scanning logic with:

1. Call `ensureStarterDiscoveries(playerId)` (lazy init)
2. Query `PlayerZoneDiscovery` for the player
3. Query all `Zone` records
4. Query all `ZoneConnection` records
5. Get `Player.currentZoneId` (fall back to starter zone if null — set it if null)
6. Return response with zones, connections, and currentZoneId

New response shape:
```typescript
{
  zones: Array<{
    id: string;
    name: string;          // "???" if undiscovered
    description: string | null;
    difficulty: number;
    travelCost: number;
    isStarter: boolean;
    discovered: boolean;
    zoneType: string;      // NEW
    zoneExitChance: number | null; // NEW
  }>;
  connections: Array<{ fromId: string; toId: string }>; // NEW
  currentZoneId: string; // NEW
}
```

**Step 2: Build and verify API compiles**

```bash
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
npx tsc --noEmit -p apps/api/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/zones.ts
git commit -m "feat: rewrite zones API to use PlayerZoneDiscovery"
```

---

### Task 5: Travel API Endpoint

**Files:**
- Modify: `apps/api/src/routes/zones.ts`
- Use services: `turnBankService`, `hpService`, `zoneDiscoveryService`, `xpService`, `lootService`, `durabilityService`, `equipmentService`, `attributesService`

**Step 1: Add POST /zones/travel endpoint**

Add to `zones.ts` after the GET handler:

```typescript
const travelSchema = z.object({
  zoneId: z.string().uuid(),
});

zonesRouter.post('/travel', async (req, res, next) => {
  // Implementation:
  // 1. Parse body, get playerId
  // 2. Get player's currentZoneId (error if null — shouldn't happen after lazy init)
  // 3. Reject if destination === current zone
  // 4. Validate destination is discovered (PlayerZoneDiscovery exists)
  // 5. Validate zone connection exists (currentZoneId → destination)
  // 6. Check HP state (can't travel while recovering or 0 HP)
  //
  // 7. BREADCRUMB CHECK: if destination === player.lastTravelledFromZoneId → free travel
  //    - Update currentZoneId, lastTravelledFromZoneId = old zone
  //    - If arriving at town: update homeTownId, auto-discover connected zones
  //    - Return success (no turns spent, no ambushes)
  //
  // 8. TOWN DEPARTURE: if current zone is town type → spend destination travelCost, no ambush
  //    - Spend turns
  //    - Update currentZoneId, lastTravelledFromZoneId
  //    - If arriving at town: update homeTownId, auto-discover connected zones
  //    - Return success
  //
  // 9. WILD TRAVERSAL: spend current zone's travelCost, run travel ambush sim
  //    - Spend turns from turn bank
  //    - simulateTravelAmbushes(zone.travelCost) to get ambush turn list
  //    - For each ambush: pick mob from current zone's mob pool, run combat
  //      - Victory: grant XP, loot, degrade durability, update currentHp
  //      - Defeat: calculate flee result
  //        - Knockout: respawn at homeTownId (call respawnToHomeTown helper)
  //          refund remaining travel turns, return KO response
  //        - Fled: abort travel, refund remaining turns, stay in current zone
  //    - On survival: update currentZoneId, lastTravelledFromZoneId
  //    - If arriving at town: update homeTownId, auto-discover connected zones
  //    - Create activity log
  //    - Return travel result with ambush events, updated turns, loot, xp
});
```

**Step 2: Create `respawnToHomeTown` helper**

Add a helper function (can live in `zoneDiscoveryService.ts` or inline in zones route):

```typescript
export async function respawnToHomeTown(playerId: string): Promise<{ townId: string; townName: string }> {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { homeTownId: true },
  });

  // Fallback to starter zone if no homeTownId
  const townId = player.homeTownId ?? (await getStarterZoneId());
  const town = await prisma.zone.findUniqueOrThrow({
    where: { id: townId },
    select: { id: true, name: true },
  });

  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentZoneId: town.id,
      lastTravelledFromZoneId: null,
    },
  });

  return { townId: town.id, townName: town.name };
}
```

**Step 3: Build and verify**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/zones.ts apps/api/src/services/zoneDiscoveryService.ts
git commit -m "feat: add POST /zones/travel with ambush simulation and breadcrumb logic"
```

---

### Task 6: Exploration API Updates

**Files:**
- Modify: `apps/api/src/routes/exploration.ts`

**Step 1: Reject town zones**

At the top of `POST /exploration/start`, after fetching the zone, add:

```typescript
if (zone.zoneType === 'town') {
  throw new AppError(400, 'Cannot explore in towns. Travel to a wild zone first.', 'TOWN_ZONE');
}
```

**Step 2: Use per-zone zoneExitChance and create PlayerZoneDiscovery on zone_exit**

Replace the `simulateExploration(body.turns, true)` call:

1. Query `getUndiscoveredNeighborZones(playerId, body.zoneId)` from the discovery service
2. Pass `zone.zoneExitChance` to `simulateExploration()` only if undiscovered neighbors exist; otherwise pass `null`
3. When processing a `zone_exit` outcome:
   - Pick a random undiscovered neighbor
   - Call `discoverZone(playerId, neighborZoneId)`
   - Update the event description to include the zone name: `"You discovered a path leading to **${zoneName}**."`
   - Store the discovered zone info in the event details

**Step 3: Update GET /exploration/estimate**

Accept optional `zoneExitChance` query param. Pass it to `estimateExploration()`. Return the zone exit probability in the estimate.

**Step 4: Build and verify**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/exploration.ts
git commit -m "feat: exploration rejects towns, uses per-zone exit chance, persists zone discoveries"
```

---

### Task 7: KO Respawn Logic

**Files:**
- Modify: `apps/api/src/routes/exploration.ts`
- Modify: `apps/api/src/routes/combat.ts`

**Step 1: Update exploration route KO handling**

In the exploration route's ambush defeat handler (around line 476), after `enterRecoveringState()`:

```typescript
if (fleeResult.outcome === 'knockout') {
  currentHp = 0;
  await enterRecoveringState(playerId, hpState.maxHp);
  const respawn = await respawnToHomeTown(playerId);
  // Add respawn info to the event details
  // ... existing event push code, add respawn info to details
}
```

**Step 2: Update combat route KO handling**

In the combat route (around line 612), after `enterRecoveringState()`:

```typescript
if (fleeResult.outcome === 'knockout') {
  await enterRecoveringState(playerId, hpState.maxHp);
  const respawn = await respawnToHomeTown(playerId);
  // Include respawn info in the response
}
```

Add `respawnedTo` field to the combat response's `fleeResult` when knockout occurs:
```typescript
fleeResult: fleeResult ? {
  outcome: fleeResult.outcome,
  remainingHp: fleeResult.remainingHp,
  goldLost: fleeResult.goldLost,
  isRecovering: fleeResult.outcome === 'knockout',
  recoveryCost: fleeResult.recoveryCost,
  respawnedTo: fleeResult.outcome === 'knockout' ? respawn : null, // NEW
} : null,
```

**Step 3: Build and verify**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/exploration.ts apps/api/src/routes/combat.ts
git commit -m "feat: KO respawns player to home town"
```

---

### Task 8: Registration & Seed Updates

**Files:**
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `packages/database/prisma/seed.ts`

**Step 1: Set initial zone on registration**

In `auth.ts` `POST /register`, update the `prisma.player.create` call to include:

```typescript
data: {
  ...existing fields,
  currentZoneId: starterZoneId,  // query starter zone first
  homeTownId: starterZoneId,
}
```

After player creation, call `ensureStarterDiscoveries(player.id)`.

To get the starter zone ID, query before the create:
```typescript
const starterZone = await prisma.zone.findFirst({ where: { isStarter: true } });
if (!starterZone) throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');
```

**Step 2: Add zoneExitChance to seed zones**

In `seed.ts`, add `zoneExitChance` to each zone's seed data:

```typescript
{ id: IDS.zones.millbrook, ..., zoneExitChance: null },        // town — auto-reveal
{ id: IDS.zones.forestEdge, ..., zoneExitChance: 0.0001 },     // ~10,000 turns
{ id: IDS.zones.deepForest, ..., zoneExitChance: 0.000033 },   // ~30,000 turns
{ id: IDS.zones.caveEntrance, ..., zoneExitChance: 0.000033 }, // ~30,000 turns
{ id: IDS.zones.ancientGrove, ..., zoneExitChance: null },     // dead end
{ id: IDS.zones.deepMines, ..., zoneExitChance: null },        // dead end
{ id: IDS.zones.whisperingPlains, ..., zoneExitChance: 0.000013 }, // ~75,000 turns
{ id: IDS.zones.thornwall, ..., zoneExitChance: null },        // town
{ id: IDS.zones.hauntedMarsh, ..., zoneExitChance: 0.0000067 }, // ~150,000 turns
{ id: IDS.zones.crystalCaverns, ..., zoneExitChance: null },   // dead end (for now)
{ id: IDS.zones.sunkenRuins, ..., zoneExitChance: null },      // dead end
```

**Step 3: Add PlayerZoneDiscovery cleanup to seed's cleanTemplateData**

Add `await p.playerZoneDiscovery.deleteMany({});` before the zone cleanup in `cleanTemplateData()`.

Also reset player zone fields:
```typescript
await prisma.player.updateMany({
  data: { currentZoneId: null, lastTravelledFromZoneId: null, homeTownId: null },
});
```

**Step 4: Build, run seed, verify**

```bash
npm run build --workspace=packages/database
npm run db:generate
npm run db:seed
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/auth.ts packages/database/prisma/seed.ts
git commit -m "feat: set initial zone on registration, add zoneExitChance to seed data"
```

---

### Task 9: Frontend — API Client & Types

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Update `getZones` response type**

```typescript
export async function getZones() {
  return fetchApi<{
    zones: Array<{
      id: string;
      name: string;
      description: string | null;
      difficulty: number;
      travelCost: number;
      isStarter: boolean;
      discovered: boolean;
      zoneType: string;
      zoneExitChance: number | null;
    }>;
    connections: Array<{ fromId: string; toId: string }>;
    currentZoneId: string;
  }>('/api/v1/zones');
}
```

**Step 2: Add `travelToZone` API function**

```typescript
export async function travelToZone(zoneId: string) {
  return fetchApi<{
    zone: { id: string; name: string; zoneType: string };
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    breadcrumbReturn: boolean;
    events: Array<{
      turn: number;
      type: string;
      description: string;
      details?: Record<string, unknown>;
    }>;
    aborted: boolean;
    refundedTurns: number;
    respawnedTo: { townId: string; townName: string } | null;
    newDiscoveries: Array<{ id: string; name: string }>;
  }>('/api/v1/zones/travel', {
    method: 'POST',
    body: JSON.stringify({ zoneId }),
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add travelToZone API client and updated zone types"
```

---

### Task 10: Frontend — useGameController Updates

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Add zone connections and currentZoneId to state**

Add state for connections and server-tracked zone:
```typescript
const [zoneConnections, setZoneConnections] = useState<Array<{ fromId: string; toId: string }>>([]);
```

Update the `loadAll` callback's zone handling to also set connections and update `activeZoneId` from server's `currentZoneId`:
```typescript
if (zonesRes.data) {
  setZones(zonesRes.data.zones);
  setZoneConnections(zonesRes.data.connections);
  setActiveZoneId(zonesRes.data.currentZoneId);
}
```

**Step 2: Rewrite `handleTravelToZone` to call the API**

```typescript
const handleTravelToZone = async (id: string) => {
  await runAction('travel', async () => {
    const res = await travelToZone(id);
    const data = res.data;
    if (!data) {
      setActionError(res.error?.message ?? 'Travel failed');
      return;
    }

    setTurns(data.turns.currentTurns);
    setActiveZoneId(data.zone.id);

    // Add travel events to exploration log
    if (data.events.length > 0) {
      const stampedEvents = data.events.map(event => ({
        timestamp: nowStamp(),
        type: event.type === 'ambush_defeat' ? 'danger' as const
            : event.type === 'ambush_victory' ? 'success' as const
            : 'info' as const,
        message: `Turn ${event.turn}: ${event.description}`,
      }));
      setExplorationLog(prev => [...stampedEvents.reverse(), ...prev]);
    }

    if (data.respawnedTo) {
      setExplorationLog(prev => [{
        timestamp: nowStamp(),
        type: 'danger',
        message: `You were knocked out and woke up in ${data.respawnedTo!.townName}.`,
      }, ...prev]);
    }

    // Refresh all state after travel
    await loadAll();
  });
};
```

**Step 3: Import `travelToZone` from api.ts**

Add to the import list at the top of the file.

**Step 4: Export `zoneConnections` from the hook**

Add `zoneConnections` to the return object.

**Step 5: Build and verify**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

(Note: the pre-existing TS error in page.tsx:333 is expected — not our fault.)

**Step 6: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: useGameController calls travel API and tracks zone connections"
```

---

### Task 11: Frontend — ZoneMap Tiered Tree Layout

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`

**Step 1: Rewrite ZoneMap component**

The new `ZoneMap` receives zones + connections + currentZoneId + available turns. It:

1. **Computes tiers** using BFS from the starter zone (Millbrook). Each zone's tier = shortest path distance from the starter.
2. **Renders tiers as rows.** Each row is centered. Zones in a row are spaced evenly.
3. **Draws connection lines** using SVG or CSS pseudo-elements between connected zones in adjacent tiers.
4. **Zone nodes** show:
   - Name (or "???" if locked)
   - Difficulty stars
   - Travel cost badge
   - Gold border if current zone
   - Dim/greyed if undiscovered
   - Town icon for town zones
5. **Tapping a discovered zone** selects it and shows a travel button with turn cost.
6. **Travel button** disabled if insufficient turns or if it's the current zone.

Updated props interface:
```typescript
interface ZoneMapProps {
  zones: Array<{
    id: string;
    name: string;
    description: string;
    difficulty: number;
    travelCost: number;
    isLocked: boolean;
    isCurrent: boolean;
    zoneType: string;
    imageSrc?: string;
  }>;
  connections: Array<{ fromId: string; toId: string }>;
  availableTurns: number;
  onTravel: (zoneId: string) => void;
}
```

For the tree layout, compute tiers via BFS:
```typescript
function computeTiers(zones, connections, starterId): Map<string, number> {
  const graph = new Map<string, string[]>();
  for (const conn of connections) {
    if (!graph.has(conn.fromId)) graph.set(conn.fromId, []);
    graph.get(conn.fromId)!.push(conn.toId);
  }
  const tiers = new Map<string, number>();
  const queue = [starterId];
  tiers.set(starterId, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentTier = tiers.get(current)!;
    for (const neighbor of graph.get(current) ?? []) {
      if (!tiers.has(neighbor)) {
        tiers.set(neighbor, currentTier + 1);
        queue.push(neighbor);
      }
    }
  }
  return tiers;
}
```

Group zones by tier, render each tier as a flexbox row. Use SVG overlay for connection lines between tiers.

**Step 2: Update `page.tsx` to pass new props to ZoneMap**

Update the `case 'zones'` in `page.tsx` to pass `connections` and `availableTurns`:

```tsx
case 'zones':
  return (
    <ZoneMap
      zones={zones.map(z => ({
        ...existing mapping,
        zoneType: z.zoneType ?? 'wild',
      }))}
      connections={zoneConnections}
      availableTurns={turns}
      onTravel={handleTravelToZone}
    />
  );
```

**Step 3: Build and verify**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: tiered tree world map layout with zone connections"
```

---

### Task 12: Frontend — Exploration Screen Town Guard

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Hide exploration UI in towns**

In `page.tsx`, in the `case 'explore'` handler, check if the current zone is a town. If so, show a message instead of the exploration UI:

```tsx
case 'explore': {
  const zone = currentZone;
  if (!zone) return null;

  // Check if current zone is a town
  if (zone.zoneType === 'town') {
    return (
      <PixelCard>
        <div className="text-center py-8">
          <h2 className="text-xl font-bold text-[var(--rpg-text-primary)] mb-2">
            {zone.name}
          </h2>
          <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">
            This is a peaceful town. Use the World Map to travel to a wild zone for exploration.
          </p>
          <PixelButton variant="gold" onClick={() => setActiveScreen('zones')}>
            Open World Map
          </PixelButton>
        </div>
      </PixelCard>
    );
  }

  // ... existing exploration rendering
}
```

This requires the zone's `zoneType` to be available. Update the `currentZone` derivation in `useGameController.ts` to include `zoneType` if not already present (it should be after Task 9's zone type updates).

**Step 2: Build and verify**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: hide exploration UI in towns, show world map redirect"
```

---

### Task 13: End-to-End Verification

**Step 1: Run database seed**

```bash
npm run db:seed
```

**Step 2: Start dev servers**

```bash
npm run dev
```

**Step 3: Manual test checklist**

- [ ] Register new account → starts in Millbrook, Forest Edge visible on world map
- [ ] Exploration tab in Millbrook → shows "peaceful town" message
- [ ] World Map → tiered tree layout, Millbrook highlighted, Forest Edge unlocked
- [ ] Travel to Forest Edge → turns deducted, no ambushes (departing from town)
- [ ] World Map shows Forest Edge as current, Millbrook as unlocked
- [ ] Travel back to Millbrook → free (breadcrumb return)
- [ ] Travel to Forest Edge again → free (breadcrumb)
- [ ] Explore in Forest Edge → ambushes, sites, resources work
- [ ] After enough exploration → "discovered a path to Deep Forest" with zone name
- [ ] Deep Forest appears on world map
- [ ] Travel to Deep Forest → ambushes from Forest Edge mobs during transit
- [ ] Get KO'd → respawn in Millbrook, breadcrumb reset

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes"
```
