# Database Audit: bossEncounterService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/bossEncounterService.ts` (786 lines, 8 exported functions)

## Prisma Models Touched

Direct: `BossEncounter`, `BossParticipant`, `Player`, `WorldEvent`
Via sub-services: `PlayerEquipment`, `Item`, `ItemTemplate`, `PlayerSkill`, `CombatTemplate`, `CombatTemplateSlot`, `TurnBank`
Redis: distributed lock for round resolution

---

## Findings

### N+1 Queries

**1. `resolveBossRoundInner` — per-participant combat data building (lines 329–363)**
Each participant triggers 6 parallel sub-service calls (`getHpState`, `getEquipmentStats`, `getActiveTemplate`, `computeResourcePools`, `getMainHandAttackSkill`, `getPlayerProgressionState`), totaling ~15–18 queries per participant. For 5 participants: **~75–90 queries**. Same pattern as expeditionService.

**2. `resolveBossRoundInner` — duplicate `getPlayerProgressionState` per participant**
`computeResourcePools` (line 335) calls `getPlayerProgressionState` internally, and it's also called directly at line 337. Same data fetched twice per participant.

**3. `checkAndResolveDueBossRounds` — sequential boss resolution (lines 669–672)**
Iterates due encounters sequentially, each triggering the full `resolveBossRound` (75–90+ queries).

**4. `revealBossRotation` — N parallel raw SQL upserts (lines 692–701)**
One raw SQL INSERT per alive player per round. For 5 alive players: 5 queries. Could batch.

**5. Auto-signup section (lines 501–545) — N parallel transactions**
Each eligible participant gets their own `$transaction` with `spendPlayerTurnsTx` + `create`. For 3 auto-signup players: 3 transactions with 2–3 queries each.

### Missing Indexes

**1. `BossParticipant` — no `@@index([playerId])` (already identified in statsService)**
`getBossHistory` queries `bossParticipant.findMany({ playerId })` — can't use `@@unique([encounterId, playerId, roundNumber])` for `playerId`-only filter.

### Payload Bloat

**1. `signUpForBossRound` — `bossParticipant.findUnique` full row for existence check (line 199)**
Fetches all 17 columns to check `!!existing`.

**2. `bossParticipant.findMany` in `resolveBossRoundInner` — no select (line 307)**
Fetches full rows for all signups. Uses most fields (resources, threat, templateRound).

### Cache Issues

**Good Redis usage for distributed lock** (lines 278–288). Compare-and-delete Lua script prevents lock ownership issues. Model pattern.

No read caching. Per-participant combat data building is the same cache-candidate pattern as combat (`getEquipmentStats`, `getPlayerGuildModifiers`, `getActiveTemplate`).

### Migration Risks

None. Good optimistic lock on `bossEncounter.updateMany` with `roundNumber` guard.

---

## Query Patterns

### `resolveBossRoundInner` — ~100–140 queries per round

| Phase | Queries | Notes |
|-------|---------|-------|
| Encounter + mob fetch | 1 (with joins) | Good select on joins |
| Signups fetch | 1 | No select (full rows) |
| HP rescale update | 1 | |
| Per-participant combat build | ~15–18 × N | Parallel N+1 |
| Additional skill level | 1 × N | Sequential after parallel |
| Encounter update (optimistic lock) | 1 | |
| Per-participant result update | N | Parallel |
| Boss rotation reveal | N | Parallel raw SQL |
| Auto-signup | 2–3 × eligible | Parallel transactions |
| Boss defeated: all participants fetch + loot | Many | Via distributeBossLoot |

### `getBossHistory` — 4–5 queries (good batching)

Clean batched pattern: distinct encounters → bulk fetch encounters + participations + killedBy usernames.

---

## Suggested Fixes

### Priority 1 — Batch-build participant combat data

Same recommendation as expeditionService: build a `prepareMultiplePlayersForCombat` that fetches all equipment, skills, templates in bulk.

### Priority 2 — Deduplicate `getPlayerProgressionState` call

`computeResourcePools` and the main `Promise.all` both call `getPlayerProgressionState`. Pass the result instead.

### Priority 3 — Batch `revealBossRotation`

Replace N individual raw SQL upserts with a single bulk query using `unnest` or `VALUES` clause.

### Priority 4 — Add `@@index([playerId])` on BossParticipant
