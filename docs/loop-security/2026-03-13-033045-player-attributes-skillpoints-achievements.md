# Security Audit: Player Attributes, Skill Points & Achievements

## Files Reviewed
- `apps/api/src/routes/player.ts` — GET player, skills, attributes, equipment, buffs; POST attributes; PATCH settings, tutorial
- `apps/api/src/routes/skillpoints.ts` — GET skillpoints, POST allocate, POST respec
- `apps/api/src/routes/achievements.ts` — GET achievements, unclaimed count; POST claim; GET/PUT title
- `apps/api/src/services/attributesService.ts` — `allocateAttributePoints`, `getPlayerProgressionState`, `normalizePlayerAttributes`
- `apps/api/src/services/skillPointService.ts` — `getSkillPoints`, `allocatePoints`, `respecPoints`, `getUnlockedActions`
- `apps/api/src/services/achievementService.ts` — `claimReward`, `setActiveTitle`, `getUnclaimedCount`

## Findings

### 1. Attribute Allocation Has No Upper Bound Per Attribute
**Severity:** medium
**Type:** input manipulation

**Description:** The `allocateAttributesSchema` at `player.ts:119-124` validates `points: z.number().int().positive().default(1)` with no maximum. A player could send `{ attribute: "vitality", points: 999999 }`. The service at `attributesService.ts:63` floors and validates positivity, and checks `player.attributePoints < spendPoints` (line 84), which prevents spending more than available.

However, all attribute points from a player's lifetime can be dumped into a single attribute in one request. There's no per-attribute cap. A player at level 100 with 99 attribute points could put all 99 into vitality, getting 99 * 5 = 495 bonus HP plus the base, making them nearly unkillable in PvP.

**Assessment:** This may be intentional — allowing full specialization. But if the intent is balanced builds, a per-attribute cap is needed.

**Suggested Fix:** If balance requires it, add a per-attribute max:
```ts
if (attributes[attribute] + spendPoints > ATTRIBUTE_CAP) {
  throw new AppError(400, `Cannot exceed ${ATTRIBUTE_CAP} in a single attribute`, 'ATTRIBUTE_CAP');
}
```

---

### 2. Skill Point Allocation Is Not Atomic (TOCTOU)
**Severity:** medium
**Type:** race condition

**Description:** `allocatePoints` at `skillPointService.ts:59-105` reads the state (line 63), performs checks, then writes the update (line 99) — all without a transaction. Two concurrent allocate requests for different nodes could both read the same `availablePoints` value and both succeed, spending more points than available.

**Exploit Scenario:**
1. Player has 1 available skill point.
2. Player sends two simultaneous `POST /skillpoints/allocate` for two different 1-point nodes.
3. Both read `availablePoints: 1`.
4. Both pass the `availablePoints < node.pointCost` check.
5. Both write their allocation.
6. Player has allocated 2 points but only had 1 available.

**Suggested Fix:** Wrap the read-check-write in a `$transaction`:
```ts
await prisma.$transaction(async (tx) => {
  const record = await tx.skillPointAllocation.findUnique({ where: { playerId } });
  // ... validate ...
  await tx.skillPointAllocation.update({ ... });
});
```

---

### 3. Achievement Turn Reward Bypasses Turn Bank Cap
**Severity:** medium
**Type:** business logic

**Description:** `claimReward` at `achievementService.ts:187-190` grants turn rewards via:
```ts
await tx.turnBank.update({
  where: { playerId },
  data: { currentTurns: { increment: reward.amount } },
});
```
This directly increments `currentTurns` without checking the `TURN_CONSTANTS.BANK_CAP` (64,800). If a player claims a turn reward when near the cap, they exceed it. The `refundPlayerTurns` function in `turnBankService.ts:143` correctly caps at `BANK_CAP`, but the achievement system bypasses this.

**Exploit Scenario:**
1. Player has 64,000 turns (near the 64,800 cap).
2. Player claims an achievement reward of 1,000 turns.
3. Turn bank becomes 65,000 — exceeding the cap.
4. Normal regen would stop at 64,800, but the direct increment bypasses this.

**Suggested Fix:** Use `refundPlayerTurnsTx` instead of direct increment:
```ts
case 'turns':
  await refundPlayerTurnsTx(tx, playerId, reward.amount);
  break;
```

---

### 4. Achievement Claim Doesn't Check Reward Claimed Status
**Severity:** low (mitigated)
**Type:** race condition

**Description:** `claimReward` at `achievementService.ts:169` checks `playerAch.rewardClaimed` before the transaction. Inside the transaction (line 174), it updates `rewardClaimed: true` without an optimistic lock condition. Two concurrent claims could both read `rewardClaimed: false` and both enter the transaction.

However, the `playerAchievement.update` at line 174 is on a unique row (playerId + achievementId), and the second update would succeed but just set `rewardClaimed: true` again (idempotent). The real risk is that both transactions also execute the reward grants (lines 179-211), potentially doubling attribute points, turns, or items.

**Exploit Scenario:**
1. Player has unclaimed achievement with reward: 5 attribute points.
2. Player sends two simultaneous `POST /achievements/:id/claim`.
3. Both read `rewardClaimed: false`.
4. Both enter the transaction. Both update `rewardClaimed: true`. Both grant 5 attribute points.
5. Player gets 10 attribute points instead of 5.

**Suggested Fix:** Add optimistic locking to the update:
```ts
const updated = await tx.playerAchievement.updateMany({
  where: { playerId, achievementId, rewardClaimed: false },
  data: { rewardClaimed: true },
});
if (updated.count !== 1) throw new AppError(409, 'Reward already claimed', 'ALREADY_CLAIMED');
```

---

### 5. setActiveTitle Doesn't Verify Reward Was Claimed
**Severity:** low
**Type:** business logic

**Description:** `setActiveTitle` at `achievementService.ts:217-235` checks that the achievement is unlocked (line 222-225) but doesn't check that the reward was claimed. A player could set a title from an achievement they've unlocked but haven't claimed the reward for.

**Assessment:** This is likely intentional — the title is earned by unlocking, not by claiming. Titles are cosmetic, not mechanical. Low severity.

---

### 6. Player Settings homeTownId Can Be Set to Any Town the Player Is Currently In
**Severity:** low
**Type:** business logic

**Description:** The `PATCH /player/settings` endpoint at `player.ts:165-179` validates that `homeTownId` matches `player.currentZoneId` and that the zone is a town. This is correct, but it allows changing the home town freely with no cost. The travel system charges turns for zone movement but home-setting is free.

If a player reaches a new town and sets it as home, then gets knocked out anywhere, they respawn at the new town for free. This could be used strategically to "save progress" at forward towns.

**Assessment:** Likely intended behavior — towns are natural checkpoints. Not a security issue.

---

### 7. Tutorial Step Can Be Set to Any Valid Value via PATCH
**Severity:** info
**Type:** input manipulation

**Description:** The tutorial endpoint at `player.ts:210-213` validates that the step is either -1 (skip) or exactly `currentStep + 1` (advance). This prevents skipping individual steps. However, the `skip` action (-1) is always available, meaning any player can skip the entire tutorial immediately.

**Assessment:** Intentional — the skip button is a UX feature for returning players.

---

### 8. Player Profile Exposes Email in Response
**Severity:** low
**Type:** data leakage

**Description:** `GET /api/v1/player` at `player.ts:33-55` includes `email: true` in the select clause, and the response at line 66-73 includes the full email address. While this is only the player's own profile (not another player's), the email is sent to the client on every profile load.

If the client stores this in local storage or logs it, it could be exposed. More importantly, the registration response at `auth.ts:141-150` also returns the email. If any future endpoint exposes other players' profiles (leaderboard details, guild member info), emails could leak.

**Assessment:** Currently safe (own profile only), but a latent risk if profile data is ever shared.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | No per-attribute cap — full specialization possible | medium | By design or balance issue |
| 2 | **Skill point allocation not atomic** — double-spend points | medium | Yes — race condition |
| 3 | **Achievement turn reward bypasses bank cap** | medium | Yes — exceed turn cap |
| 4 | **Achievement claim race** — double reward on concurrent claims | low | Yes — duplicate rewards |
| 5 | Title doesn't require reward claimed | low | Cosmetic only |
| 6 | Home town setting is free | low | Strategic but intentional |
| 7 | Tutorial skip always available | info | By design |
| 8 | Player profile exposes email | low | Own profile only |
