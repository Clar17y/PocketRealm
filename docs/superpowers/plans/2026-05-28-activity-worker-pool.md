# Activity Worker Pool Implementation Plan

> **For agentic workers:** This plan was executed on branch `codex/explore-performance`.

**Goal:** Keep the main Express thread responsive while long-running gameplay activities execute in a bounded worker-thread pool.

**Architecture:** The API keeps auth, season checks, request IDs, and response writing on the main thread. Supported gameplay activities are submitted as typed jobs to one shared activity worker pool. Workers execute the existing route services inline and return the existing `RouteServiceResponse` shape. Worker-originated chat/system events publish through Redis so the main Socket.IO process can emit them to connected clients.

**Implemented activity jobs:**
- `exploration.start`
- `zones.travel`

**Environment controls:**
- `ACTIVITY_WORKER_MODE=off|auto|always`
- `ACTIVITY_WORKER_COUNT`
- `ACTIVITY_WORKER_QUEUE_LIMIT`
- `ACTIVITY_WORKER_QUEUE_TIMEOUT_MS`
- Existing `EXPLORATION_WORKER_*` names are accepted as fallbacks for compatibility.

---

## Implementation Tasks

- [x] Add a generic bounded `WorkerPool` with queue backpressure, timeout handling, worker replacement, and close-time cleanup.
- [x] Add activity worker config parsing with safe defaults and small worker-count caps.
- [x] Add `activityWorkerClient` to run supported jobs inline when disabled or through the shared pool when enabled.
- [x] Add `workers/activityWorker.ts` as the worker-thread entrypoint.
- [x] Route `/api/v1/exploration/start` through `exploration.start`.
- [x] Route `/api/v1/zones/travel` through `zones.travel`.
- [x] Add a Redis realtime bridge so worker-originated system/chat messages still emit through the main Socket.IO server.
- [x] Optimize exploration persistence by batching independent discovery and combat-log writes.
- [x] Optimize exploration ambush handling by skipping no-op buff transactions, avoiding per-victory HP writes, and reusing preloaded guild XP boost.
- [x] Optimize travel ambush handling by batching combat-log writes, avoiding per-victory HP writes, and reusing preloaded guild XP boost.
- [x] Add focused tests for worker config, worker routing, concurrency, realtime bridge, exploration persistence, exploration ambush persistence, and travel ambush persistence.

## Verification

- `rtk npm run test -w apps/api -- src/services/workerPool.test.ts src/services/realtimeBridge.test.ts src/services/activityWorkerConfig.test.ts src/services/activityWorkerClient.test.ts src/services/activityWorkerConcurrency.test.ts src/routes/zones.activityWorker.test.ts src/routes/zones.tracking.test.ts src/routes/exploration/start.tutorial.test.ts src/routes/exploration/start.tracking.test.ts src/services/explorationOutcome/ambush.test.ts src/services/explorationPersistenceService.test.ts src/services/zoneRoutesService.travelPerformance.test.ts --run`
- `rtk npm run typecheck`
- `rtk npm run build:api`

## Operational Notes

- Use one shared pool rather than one pool per activity. This caps CPU pressure and limits additional Prisma/Postgres concurrency.
- Do not retry a job once it starts. Exploration and travel spend turns and write player state.
- Multi-hop travel remains sequential on the client because each hop can spend turns, produce loot, abort, or respawn the player.
