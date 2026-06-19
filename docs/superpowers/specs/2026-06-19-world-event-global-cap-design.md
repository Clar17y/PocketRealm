# World Event Global Cap — Design

**Date:** 2026-06-19
**Branch:** `world-event-global-cap`
**Status:** Approved

## Problem

In production, nearly every wild zone has one or more active world events at all
times. World events are meant to feel like notable, location-specific happenings
that give players a reason to travel to a zone — but right now they are constant
ambient noise across the whole map.

### Root cause

There is **no global cap** on the number of concurrent world events. The existing
caps are narrower than they appear:

- `MAX_ZONE_EVENTS: 2` — limit **per individual zone**, not a worldwide total.
- `MAX_WORLD_EVENTS: 1` — applies only to *world-wide* events (`zoneId = null`).
- `MAX_BOSS_ENCOUNTERS: 1` — boss encounters only.

With ~8 wild zones and a per-zone cap of 2, the system can sustain up to **16
zone events** simultaneously. Worse, `trySpawnZoneEvent` actively *prioritizes
empty zones* on each spawn, so the scheduler steadily seeds every zone until the
whole map is saturated. The "3" remembered from old balance docs was only the
theoretical worst-case stack *within a single zone* (2 zone + 1 world-wide), never
a real global limit.

## Goal

Introduce a real **global concurrent-event cap** so that most zones are quiet most
of the time and an active event is a genuine draw to a zone.

## Design

### 1. New constant

`packages/shared/src/constants/gameConstants.ts` → `WORLD_EVENT_CONSTANTS`:

```ts
MAX_ACTIVE_EVENTS: 4,   // global cap on ambient (non-boss) events worldwide
```

Unchanged: `MAX_ZONE_EVENTS: 2` (per-zone limit retained), `MAX_WORLD_EVENTS: 1`,
`MAX_BOSS_ENCOUNTERS: 1`.

On an 8-zone map, a cap of 4 means at least half the world is calm at any moment.

### 2. Authoritative enforcement — inside `spawnWorldEvent`

Every spawn path (scheduler, exploration player-discovery, admin panel) funnels
through `worldEventService.spawnWorldEvent`, which already enforces the per-zone
cap inside a serializable transaction. Add the global gate immediately after the
per-zone check, applying it **only to non-boss events**:

```ts
if (params.type !== 'boss') {
  const activeAmbient = await tx.worldEvent.count({
    where: { status: 'active', type: { not: 'boss' } },
  });
  if (activeAmbient >= WORLD_EVENT_CONSTANTS.MAX_ACTIVE_EVENTS) return null;
}
```

Bosses are excluded from both the count and the gate, so they remain governed
solely by `MAX_BOSS_ENCOUNTERS`. Because the check lives in the existing
serializable transaction, it is race-safe against concurrent spawns.

### 3. Scheduler early-out (optimization)

In `eventSchedulerService.checkAndSpawnEvents` (Step 4, the spawn step), short-
circuit before rolling for / resolving a template if the global cap is already
reached. This avoids wasted target-resolution queries. The transaction in §2
remains the source of truth; this is purely an optimization.

## Decisions

- **World-wide events count toward the cap.** A world-wide event is ambient noise
  too. Peak composition could be e.g. `1 world-wide + 3 zone`, or up to `4 zone`
  events spread across zones (the existing free-zone-priority logic distributes
  them rather than stacking). `MAX_WORLD_EVENTS: 1` still independently limits
  world-wide events to one at a time.
- **Admin spawns are subject to the cap.** Same behavior as today's per-zone cap:
  `spawnWorldEvent` returns `null`, surfaced to the admin as the existing
  `409 SLOT_CONFLICT`. Admins can cancel an active event to free a slot. No
  special bypass path — keeps the model simple.
- **No retroactive cleanup of production.** Existing events expire naturally
  (zone 6h / world-wide 4h) and nothing new spawns until under the cap, so
  production self-heals within ~6 hours of deploy. A one-time admin "trim to cap"
  is out of scope.

## Testing

Unit tests in `apps/api/src/services/worldEventService.test.ts`:

- Ambient (non-boss) spawn returns `null` when `MAX_ACTIVE_EVENTS` non-boss
  events are already active.
- Ambient spawn succeeds when active count is below the cap.
- Boss spawn still succeeds when `MAX_ACTIVE_EVENTS` ambient events are active
  (bosses excluded from the gate).

The existing per-zone cap test must continue to pass; the mocked
`worldEvent.count` will need to distinguish the per-zone query from the global
query by its `where` clause.

## Out of Scope

- Changing event durations, weights, spawn cooldown, or per-zone cap value.
- Any UI changes to the World Events screen.
- One-time production cleanup tooling.
