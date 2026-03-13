# Security Audit: Gathering, Turn Bank & Resources

## Files Reviewed
- `apps/api/src/routes/gathering.ts` — GET nodes, POST mine (517 lines)
- `apps/api/src/routes/turns.ts` — GET turns, POST spend
- `apps/api/src/routes/resources.ts` — GET resources, POST rest, GET estimate
- `apps/api/src/services/turnBankService.ts` — `spendPlayerTurnsTx`, `refundPlayerTurns`, optimistic locking
- `apps/api/src/services/resourceService.ts` — `restStamina`, `restMana` (referenced)
- `apps/api/src/services/inventoryService.ts` — `addStackableItemTx`, `getInventoryState` (referenced)
- `apps/api/src/services/guildTaxService.ts` — tax calculation (referenced)

## Findings

### 1. POST /turns/spend Is a Publicly Exposed Turn Drain
**Severity:** high
**Type:** business logic

**Description:** The `POST /api/v1/turns/spend` endpoint at `turns.ts:53-91` allows any authenticated player to spend an arbitrary number of turns for no benefit. The `reason` field is optional and has no effect on game logic — turns are simply deducted. There's no validation that the caller is a service or admin.

This endpoint appears to be a leftover from internal service communication that was never locked down. Unlike other turn-spending actions (crafting, exploration, rest) which provide game value in return, this endpoint provides nothing.

**Exploit Scenario:**
1. A malicious script or browser extension sends `POST /turns/spend { amount: 64800 }`.
2. Player's entire turn bank is drained.
3. No items, XP, or game progress is gained in return.
4. Player must wait 18 hours for turns to regenerate.

More concerning: an XSS exploit or compromised client could silently drain a victim's turns.

**Suggested Fix:** Either:
- Gate behind `requireAdmin` middleware
- Remove the endpoint entirely (turn spending should only happen through game actions)
- Add a confirmation mechanism or rate limit

---

### 2. Turn Spend Is Not Atomic in the Direct Endpoint
**Severity:** medium
**Type:** race condition

**Description:** The `POST /turns/spend` at `turns.ts:57-84` reads the turn bank, calculates the new balance, then writes the update — all without a transaction. Two concurrent spend requests could both read the same balance and both succeed, effectively allowing the player to spend more turns than they have.

The `spendPlayerTurnsWithClient` function used by other services has optimistic locking (CAS check on `currentTurns` and `lastRegenAt`), but the `POST /turns/spend` route at `turns.ts:72-84` does NOT use `spendPlayerTurnsTx` — it calls the raw `spendTurns` game-engine function and directly updates the turn bank without any optimistic lock.

**Exploit Scenario:**
1. Player has 100 turns.
2. Player sends two simultaneous `POST /turns/spend { amount: 80 }` requests.
3. Both read `currentTurns: 100`.
4. Both calculate `newBalance: 20`.
5. Both write `currentTurns: 20`. (Second write overwrites the first.)
6. Net effect: Player spent 80 turns (not 160). The second request was effectively free.

In reverse: if player sends `{ amount: 90 }` twice, both succeed despite only having 100 turns — spending 90 + 90 = 180 turns they don't have, landing at 10 turns instead of -80.

Wait — actually, both would compute `spendTurns(100, 90)` = 10, and both would write 10. So the player spends 90 effectively, not 180. The race makes the second spend silently fail (same value written twice). This is a turn-SAVING exploit, not turn-draining.

**Assessment:** The race condition means concurrent requests don't double-spend — they single-spend. Still a bug but not financially exploitable. The real issue is the missing optimistic lock.

**Suggested Fix:** Use `spendPlayerTurns` instead of the manual calculation:
```ts
const result = await spendPlayerTurns(playerId, body.amount);
res.json(result);
```

---

### 3. Gathering Mine Uses Client-Provided currentZoneId for Validation
**Severity:** medium
**Type:** input manipulation

**Description:** The `mineSchema` at `gathering.ts:203-207` requires `currentZoneId: z.string().uuid()` from the request body. The zone check at line 274-277 compares `template.zoneId !== body.currentZoneId`. This trusts the CLIENT to report which zone they're in.

However, the actual player zone should be read from the database (`player.currentZoneId`), not from the request body. A player could send any zone ID matching the resource node's zone and bypass the proximity check.

**Exploit Scenario:**
1. Player discovers a resource node in zone B.
2. Player travels to the safe town (zone A).
3. Player sends `POST /gathering/mine { playerNodeId: "...", turns: 1000, currentZoneId: "<zone-B-id>" }`.
4. The check `template.zoneId !== body.currentZoneId` passes because the player provided the correct zone ID.
5. Player mines the resource node remotely without being in the zone.

**Suggested Fix:** Read the player's current zone from the database:
```ts
const player = await prisma.player.findUnique({
  where: { id: playerId },
  select: { currentZoneId: true },
});
if (template.zoneId !== player?.currentZoneId) {
  throw new AppError(400, 'You must travel to this zone', 'WRONG_ZONE');
}
```

---

### 4. Gathering Mine Has No Upper Turn Bound
**Severity:** low
**Type:** input manipulation

**Description:** The `mineSchema` validates `turns: z.number().int().positive()` with no `.max()`. A player could request `turns: 999999999`. The service handles this gracefully — actions are capped by effective turns and node capacity — but the schema should provide an early bound.

**Assessment:** No exploit possible due to internal capping. The min check at line 285-287 enforces `BASE_TURN_COST` minimum. Adding a max would improve input validation hygiene.

**Suggested Fix:** Add `.max()` to the schema:
```ts
turns: z.number().int().positive().max(100000),
```

---

### 5. Turn Bank Optimistic Locking Is Well-Implemented
**Severity:** info
**Type:** race condition

**Description:** `spendPlayerTurnsWithClient` at `turnBankService.ts:44-97` uses optimistic locking with retry (3 attempts). The `updateMany` at line 69 includes `WHERE currentTurns = X AND lastRegenAt = Y`, preventing stale writes. If the CAS fails, it retries. After 3 failures, it throws a 409.

Similarly, `refundPlayerTurnsWithClient` at line 124-173 uses the same pattern for refunds.

**Assessment:** Excellent implementation. The 3-retry limit with CAS is a solid pattern for handling concurrent turn modifications. The `now` parameter is consistent within a single attempt, preventing clock skew issues.

---

### 6. Gathering Gem Crit Outside Transaction
**Severity:** low
**Type:** race condition

**Description:** At `gathering.ts:428-429`, gem drops from gathering crits are created in a separate `$transaction` after the main gathering transaction has completed. If the gem creation fails, the player has already mined and received the primary resources but misses the gem bonus.

**Assessment:** Low impact — the player loses a bonus gem, not the primary gather. The gem transaction is isolated to prevent the main gather from failing due to a gem inventory issue.

---

### 7. Resource Rest Has No Upper Turn Bound
**Severity:** low
**Type:** input manipulation

**Description:** The `restSchema` at `resources.ts:24` validates `turns: z.number().int().positive()` with no max. Like the HP rest endpoint (from the zones/HP audit), the service correctly caps healing at max resource value. No exploit possible, but the schema should bound the input.

---

### 8. Node Decay Cleanup Happens During List Endpoint
**Severity:** low
**Type:** business logic

**Description:** The `GET /gathering/nodes` endpoint at `gathering.ts:106-138` performs decay calculations and database deletions/updates during a read operation. Each decayed node triggers an `updateMany` or `deleteMany`. With many nodes, this creates a slow read endpoint that modifies state.

**Assessment:** This is a lazy-evaluation pattern (similar to turn regeneration). The optimistic locking on decay updates prevents conflicts. But it adds latency to what appears to be a simple list endpoint.

---

### 9. Gathering Yield Can Exceed Node Capacity With Event Multipliers
**Severity:** low
**Type:** business logic

**Description:** At `gathering.ts:351-354`, when `eventMultiplier > 1`, the total yield is calculated as `Math.floor(innerRawYield * eventMultiplier)`. The `innerRawYield` is already capped at `effectiveCapacity`, but after the event multiplier is applied, `innerTotalYield` can exceed `effectiveCapacity`. The `innerNewCapacity = effectiveCapacity - innerTotalYield` could go negative.

When `innerNewCapacity <= 0`, `innerNodeDepleted = true` and the node is deleted. The player receives more resources than the node actually contained. For example: node has 5 capacity, event gives 2x yield, player gets 10 resources.

**Assessment:** Likely intentional — events are meant to be impactful. But it creates a resource multiplication exploit during yield_up events.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **POST /turns/spend is publicly exposed turn drain** | high | Yes — drain turns for nothing |
| 2 | Turn spend endpoint lacks optimistic locking | medium | Race condition — turn saving, not draining |
| 3 | **Gathering uses client-provided zone ID** — remote mining | medium | Yes — mine from any zone |
| 4 | Gathering mine has no upper turn bound | low | No — internally capped |
| 5 | Turn bank optimistic locking well-implemented | info | N/A — good pattern |
| 6 | Gem crit outside main transaction | low | Minor bonus loss |
| 7 | Resource rest has no upper turn bound | low | No — internally capped |
| 8 | Node decay cleanup during read endpoint | low | Performance concern |
| 9 | Yield can exceed node capacity with event multipliers | low | Resource multiplication during events |
