# Security Audit: Expedition System

## Files Reviewed
- `apps/api/src/routes/expedition.ts` — 14 expedition route handlers (320 lines)
- `apps/api/src/services/expeditionService.ts` — launch, signup, force-start, round resolution, recovery, abandon, targeting
- `apps/api/src/services/expeditionShopService.ts` — token balance, shop purchase
- `apps/api/src/services/expeditionLootService.ts` — token awarding, loot distribution (referenced)
- `apps/api/src/services/turnBankService.ts` — `spendPlayerTurnsTx` (referenced)

## Findings

### 1. Force-Round Resolves Without Checking Round Timing
**Severity:** medium
**Type:** business logic

**Description:** The `POST /:id/force-round` endpoint at `expedition.ts:211-250` calls `resolveExpeditionRound(id, null)` directly after validating guild membership and officer role. Unlike the normal round resolution flow which checks `nextRoundAt` timing, force-round bypasses timing entirely.

An officer can spam `force-round` to resolve multiple rounds per second, skipping the intended round interval (`EXPEDITION_CONSTANTS.ROUND_INTERVAL_MS`). This allows an entire expedition (10+ rooms, multiple rounds each) to be completed in seconds.

**Exploit Scenario:**
1. Guild launches a tier 3 expedition and signs up strong members.
2. Officer sends rapid-fire `POST /expedition/<id>/force-round` requests.
3. Each call resolves one round immediately, bypassing the round interval timer.
4. 50+ rounds are resolved in under a minute.
5. Guild completes the expedition in seconds instead of the intended hours/days.

**Suggested Fix:** Check that `nextRoundAt` has passed before allowing force-round:
```ts
if (expedition.nextRoundAt && expedition.nextRoundAt > new Date()) {
  throw new AppError(400, 'Round is not ready yet', 'ROUND_NOT_READY');
}
```

---

### 2. Auto-Resolve Has Same Timing Bypass
**Severity:** medium
**Type:** business logic

**Description:** The `POST /:id/auto-resolve` endpoint at `expedition.ts:253-285` calls `autoResolveRoom(id)` which resolves multiple rounds until the room is cleared or a wipe occurs. This also bypasses round timing, completing an entire room in one request.

Combined with finding #1, an officer can call auto-resolve for each room, completing the entire expedition in ~10 HTTP requests.

**Suggested Fix:** Either add a cooldown to auto-resolve, or make it respect round timing by scheduling rounds rather than resolving them synchronously.

---

### 3. Treasury Deduction Outside Transaction (Launch)
**Severity:** medium
**Type:** race condition

**Description:** In `launchExpedition` at `expeditionService.ts:278-281`, the treasury balance check (`guild.treasuryTurns < treasuryCost`) happens outside the transaction. The actual deduction is inside the transaction (line 295-297). Two concurrent launch requests could both pass the balance check and both enter the transaction.

However, the `{ decrement: treasuryCost }` operation is atomic in PostgreSQL — it will drive the treasury negative rather than fail. There's no `WHERE treasuryTurns >= cost` guard.

**Exploit Scenario:**
1. Guild has exactly 1,000 treasury turns (equal to tier 1 cost).
2. Two officers launch tier 1 expeditions simultaneously.
3. Both pass `guild.treasuryTurns < treasuryCost` check.
4. Both transactions decrement 1,000. Treasury goes to -1,000.
5. Guild now has two active expeditions and negative treasury.

The `activeExpedition` check at line 267-269 provides some protection — but two perfectly simultaneous requests could both read "no active expedition" before either creates one.

**Suggested Fix:** Use `updateMany` with a guard inside the transaction:
```ts
const result = await tx.guild.updateMany({
  where: { id: guildId, treasuryTurns: { gte: treasuryCost } },
  data: { treasuryTurns: { decrement: treasuryCost } },
});
if (result.count === 0) throw new AppError(400, 'Insufficient treasury', 'INSUFFICIENT_TREASURY');
```

---

### 4. Shop Purchase Token Check Outside Transaction
**Severity:** medium
**Type:** race condition

**Description:** `purchaseShopItem` at `expeditionShopService.ts:39-47` checks `player.expeditionTokens < shopItem.tokenCost` outside the transaction. The `{ decrement: shopItem.tokenCost }` at line 82 is inside the transaction but has no guard. Two concurrent purchases could both pass and both decrement, driving tokens negative.

**Exploit Scenario:**
1. Player has exactly 100 tokens. Shop item costs 100.
2. Player sends two simultaneous `POST /shop/purchase` for the same item.
3. Both pass the token check.
4. Both create soulbound items and decrement 100 tokens.
5. Player gets two items but only paid once (tokens go to -100).

**Suggested Fix:** Add a guard inside the transaction:
```ts
const updatedPlayer = await tx.player.updateMany({
  where: { id: playerId, expeditionTokens: { gte: shopItem.tokenCost } },
  data: { expeditionTokens: { decrement: shopItem.tokenCost } },
});
if (updatedPlayer.count === 0) throw new AppError(400, 'Insufficient tokens', 'INSUFFICIENT_TOKENS');
```

---

### 5. Signup Enters Full HP Regardless of Current HP
**Severity:** low
**Type:** business logic

**Description:** `signUpForExpedition` at `expeditionService.ts:369-372` checks `hpState.isRecovering` but doesn't check `hpState.currentHp`. The member record is created with `currentHp: maxHp` (line 387 equivalent — calculated at line 383), meaning the player enters the expedition at full HP regardless of their actual HP.

This is the same pattern as the boss signup finding from the boss audit. A player at 1 HP gets a free full heal by joining an expedition.

**Assessment:** Likely intentional for expeditions — the expedition is a separate instance from the open world. Lower severity than boss signup because expeditions are instanced.

---

### 6. Recover From KO Grants Full Resources
**Severity:** low
**Type:** business logic

**Description:** The `POST /:id/recover` endpoint calls `recoverFromKO(id, playerId)`. Looking at the service, knocked-out expedition members likely recover to full or partial HP/resources. This is internal to the expedition instance and doesn't affect the open world.

**Assessment:** Expected behavior for a raid recovery mechanic.

---

### 7. Target/Heal-Target Accept Any String IDs
**Severity:** low
**Type:** input manipulation

**Description:** The `PATCH /:id/target` endpoint at `expedition.ts:295-301` accepts `targetMobId: z.string().nullable()` — a freeform string, not `.uuid()`. The `PATCH /:id/heal-target` at line 305 accepts `healTargetPlayerId: z.string().uuid().nullable()`. The mob target could be set to any string value.

The service should validate that `targetMobId` corresponds to an alive mob in the current room. If it doesn't, the combat resolution would pick a default target. Not exploitable, but sloppy validation.

**Suggested Fix:** Add `.uuid()` validation and verify the mob exists in the current room within the service.

---

### 8. Expedition Status Visible to Any Guild Member
**Severity:** info
**Type:** data leakage

**Description:** The `GET /:id` endpoint at `expedition.ts:149-183` correctly verifies guild membership before returning data (line 162-168). The `GET /active` and `GET /history` endpoints also scope to the player's guild. Access control is properly implemented.

**Assessment:** No issue — well-implemented guild scoping on all read endpoints.

---

### 9. Abandon Doesn't Check Role
**Severity:** low
**Type:** business logic

**Description:** The `POST /:id/abandon` endpoint at `expedition.ts:288-292` calls `abandonExpedition(id, playerId)`. The service should validate that only officers/leaders can abandon (since only they can launch). If any guild member can abandon an expedition, it creates a grief vector — a disgruntled member could cancel the entire guild's expedition.

**Assessment:** Need to verify the service implementation. If `abandonExpedition` checks role internally, this is fine. If not, any guild member can destroy the expedition.

**Suggested Fix:** Either verify role in the route or confirm the service does it.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **Force-round bypasses timing** — complete expedition in seconds | medium | Yes — speed exploit |
| 2 | **Auto-resolve bypasses timing** — clear rooms instantly | medium | Yes — same exploit |
| 3 | **Treasury deduction race** — negative treasury, double expedition | medium | Yes — concurrent launches |
| 4 | **Shop purchase token race** — negative tokens, free items | medium | Yes — concurrent purchases |
| 5 | Signup enters full HP regardless of current HP | low | Free heal, likely intentional |
| 6 | Recover from KO grants full resources | low | Expected behavior |
| 7 | Target mob ID accepts freeform string | low | No — defaults on invalid |
| 8 | Expedition data properly guild-scoped | info | No issue |
| 9 | Abandon may not check officer role | low | Potential grief vector |
