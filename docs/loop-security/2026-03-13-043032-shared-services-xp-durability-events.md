# Security Audit: Shared Services (XP, Durability, World Events)

## Files Reviewed
- `apps/api/src/services/xpService.ts` — `grantSkillXp` (132 lines)
- `apps/api/src/services/durabilityService.ts` — `countCombatHits`, `degradeEquippedDurability` (115 lines)
- `apps/api/src/services/worldEventService.ts` — event CRUD, modifier computation, spawn, expire (300+ lines)
- `apps/api/src/services/guildUpgradeService.ts` — `getPlayerGuildModifiers` (referenced)
- `apps/api/src/services/buffService.ts` — `getBuffValue`, `consumeBuff` (referenced)

## Context

These three services are called from 10+ route handlers each. Unlike route-level audits that check input validation, this audit examines the internal logic of shared services for correctness, race conditions, and business logic abuse opportunities.

## Findings

### 1. XP Boost Fetched Outside Transaction — Stale Buff Value
**Severity:** medium
**Type:** race condition

**Description:** In `xpService.ts:31-33`, the guild XP boost and shop XP boost are fetched OUTSIDE the `$transaction` block (line 38). The buff value is read at line 32, then `consumeBuff` is called inside the transaction at line 113. Between the read and the consume, the buff could be consumed by a concurrent XP grant (e.g., from a simultaneous combat and gathering action).

If two concurrent XP grants both read `shopXpBoost > 0`, both enter the transaction, and both call `consumeBuff` — but the buff only has limited uses. The second `consumeBuff` might fail silently or consume a use that shouldn't exist.

**Exploit Scenario:**
1. Player has a 1-use XP boost buff.
2. Player sends two actions simultaneously (explore + gather).
3. Both read `shopXpBoost = 0.5` (buff exists).
4. Both apply the 50% boost to their XP calculations.
5. Both call `consumeBuff` inside their transactions.
6. First consume succeeds, buff deleted. Second consume has no buff to consume (no-op or error).
7. Player received double XP boost from a single-use buff.

**Suggested Fix:** Move buff fetching inside the transaction:
```ts
return prisma.$transaction(async (tx) => {
  const shopXpBoost = await getBuffValueTx(tx, playerId, 'xp_boost');
  // ... rest of XP logic ...
});
```

---

### 2. XP Grant Uses Absolute attributePoints Write — Not Atomic Increment
**Severity:** medium
**Type:** race condition

**Description:** At `xpService.ts:101-109`, the player update writes `attributePoints: attributePointsAfter` as an absolute value (line 108), not an `{ increment }`. The value is computed from `player.attributePoints + levelUps` (line 101). Two concurrent XP grants that both level up the player could overwrite each other's attribute point additions.

**Exploit Scenario:**
1. Player is at level 9 with 0 attribute points.
2. Two simultaneous combats both trigger XP that pushes to level 10.
3. Both transactions read `player.attributePoints = 0` and compute `0 + 1 = 1`.
4. Both write `attributePoints: 1`.
5. Player should have 2 attribute points but only has 1.

This is the OPPOSITE direction of typical race conditions — the player LOSES attribute points. It's a bug, not an exploit, but it causes silent progression loss.

**Suggested Fix:** Use atomic increment:
```ts
data: {
  characterXp: BigInt(characterXpAfter),
  characterLevel: characterLevelAfter,
  attributePoints: { increment: levelUps },
},
```

---

### 3. Durability Degradation Is Not Idempotent
**Severity:** low
**Type:** race condition

**Description:** `degradeEquippedDurability` at `durabilityService.ts:32-114` reads equipment, computes degradation, and updates inside a transaction. However, the read at line 45 is outside the transaction (uses `prisma`, not `tx`). The transaction at line 58 does the writes but uses the stale `uniqueItems` map from the outer read.

If equipment changes between the read and the transaction (e.g., player unequips an item via a concurrent request), the transaction would update an item that's no longer equipped.

**Assessment:** Low impact — the durability still decreases correctly for the item. The item just might not be equipped anymore. No duplication or financial loss.

---

### 4. World Event Spawn Has No Duplicate Prevention Across Concurrent Requests
**Severity:** low
**Type:** race condition

**Description:** `spawnWorldEvent` at `worldEventService.ts:240-295` checks `MAX_ZONE_EVENTS` and duplicate `effectType` BEFORE creating the event (lines 254-271). Two concurrent spawn requests could both pass these checks and both create events, exceeding the cap or creating duplicate effectTypes.

The slot check at line 263-271 is a read-then-write without a transaction or unique constraint. Two events with the same effectType in the same zone could coexist.

**Assessment:** World events are spawned by server-side timers (not player-triggered), so concurrent spawns are unlikely. But the `POST /admin/events/spawn` endpoint could trigger this with rapid clicks.

**Suggested Fix:** Use a unique constraint on `(zoneId, effectType, status)` in the database, or wrap the check+create in a transaction with a lock.

---

### 5. World Event Modifiers Stack Multiplicatively Without Cap
**Severity:** low
**Type:** business logic

**Description:** `applyModifier` at `worldEventService.ts:88-101` multiplies modifiers for each active event. Multiple `damage_up` events compound: two 50% damage-up events give `1.5 * 1.5 = 2.25x` damage, not `2.0x`. For `_down` modifiers, there's a `Math.max(0.1)` floor per event, but two 90% down events give `0.1 * 0.1 = 0.01x` — effectively negating all mob damage.

The 0.1 floor is per-modifier, not on the final result. Stacking many `_down` events could reduce modifiers to near-zero.

**Assessment:** Events are spawned by the system with caps (MAX_ZONE_EVENTS, MAX_WORLD_EVENTS), limiting the stacking. But admin-spawned events bypass these caps.

**Suggested Fix:** Add a final floor/cap after all modifiers:
```ts
mods.mobDamageMultiplier = Math.max(0.1, Math.min(5, mods.mobDamageMultiplier));
```

---

### 6. XP Service Transaction Is Well-Structured
**Severity:** info
**Type:** race condition (not found)

**Description:** The XP grant wraps skill update + player update + buff consume in a single `$transaction`. If any step fails, all roll back. The skill level calculation uses the fresh in-transaction data. This is a solid pattern.

**Assessment:** The transaction structure is correct. The issues above (#1, #2) are about data fetched before/written inside the transaction, not about the transaction itself.

---

### 7. Durability Degradation Correctly Handles Already-Broken Items
**Severity:** info
**Type:** business logic (not found)

**Description:** At `durabilityService.ts:86-87`, the `wasBroken` check prevents marking an already-broken item as newly broken. The `isBroken: nowBroken && !wasBroken` logic only triggers the "broken" notification once, not on every subsequent combat. Good implementation.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **XP buff fetched outside transaction** — double boost from single-use buff | medium | Yes — concurrent actions |
| 2 | **Attribute points absolute write** — concurrent level-ups lose points | medium | Bug — silent progression loss |
| 3 | Durability read outside transaction — stale equipment data | low | Cosmetic only |
| 4 | World event spawn no duplicate prevention for concurrent requests | low | Admin-only trigger |
| 5 | Event modifiers stack multiplicatively without final cap | low | System-limited |
| 6 | XP transaction structure is solid | info | N/A |
| 7 | Durability handles broken items correctly | info | N/A |

## Cross-Reference Notes

This audit identified that **finding #2 (absolute attributePoints write)** also affects the `attributesService.ts:91` allocation path — but that function correctly reads inside a transaction, so it only races with XP grants, not with itself. The most impactful fix is changing line 108 of `xpService.ts` from absolute write to `{ increment: levelUps }`.
