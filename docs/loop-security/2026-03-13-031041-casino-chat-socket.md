# Security Audit: Casino & Chat/Socket System

## Files Reviewed
- `apps/api/src/routes/casino.ts` — exchange, roulette bet/round/history/stats endpoints
- `apps/api/src/services/casinoService.ts` — `exchangeTurnsForGold`, `placeBet`, `getCurrentRound`, `resolveRound`, roulette management
- `apps/api/src/socket/chatHandlers.ts` — chat:send, zone switching, casino room, pin/unpin
- `apps/api/src/socket/socketAuth.ts` — Socket.IO JWT authentication
- `apps/api/src/services/chatService.ts` — rate limiting, message storage, history
- `packages/shared/src/constants/gameConstants.ts` — `CASINO_CONSTANTS`

## Findings

### 1. Exchange Endpoint Has No Upper Bound on Turns
**Severity:** medium
**Type:** input manipulation

**Description:** The `exchangeSchema` at `casino.ts:27` validates `turns: z.number().int().positive()` with no `.max()`. A player could exchange millions of turns for gold in a single request. While `spendPlayerTurnsTx` will fail if the player doesn't have enough turns, a player with a large turn bank (up to 64,800 cap) could convert their entire bank to gold instantly.

At `GOLD_EXCHANGE_RATE: 1`, exchanging 64,800 turns gives 64,800 gold. This isn't inherently broken, but it's a one-way conversion — there's no gold-to-turns exchange. A player who accidentally converts all turns is stuck with no way to play until turns regenerate.

**Suggested Fix:** Add a reasonable max or require confirmation for large amounts:
```ts
turns: z.number().int().positive().max(CASINO_CONSTANTS.MAX_EXCHANGE_AMOUNT ?? 10000),
```

---

### 2. Bet Amount Not Validated Against ROULETTE_MAX_BET in Route
**Severity:** medium
**Type:** input manipulation

**Description:** The `betSchema` at `casino.ts:43` validates `amount: z.number().int().positive()` with no max. The `validateBet` function from game-engine (called at `casinoService.ts:308`) should enforce `ROULETTE_MIN_BET` and `ROULETTE_MAX_BET`, but this validation happens AFTER the schema parse. If `validateBet` has a bug or the constants are misconfigured, the schema provides no safety net.

More importantly, a player can place unlimited bets per round — there's no check for total bets per player per round. A player could place 100 bets of 1000 gold each (100,000 gold wagered) on a single round.

**Exploit Scenario:**
1. Player has 50,000 gold.
2. Player places 50 bets of 1000 gold each on different numbers in the same round.
3. Each bet is processed in its own transaction — gold is checked and deducted per bet.
4. One number wins: payout is 35:1 = 35,000 gold. Net cost: 50,000 - 35,000 = 15,000.
5. But with strategic bet placement (covering 35 of 37 numbers), expected value approaches positive.

Actually, roulette math with a 0 pocket means covering all numbers is always negative EV. But unlimited bets create variance issues and can be used for gold laundering between accounts if combined with a partner.

**Suggested Fix:** Add per-player per-round bet limit and total wager cap:
```ts
const existingBets = await tx.rouletteBet.count({ where: { roundId, playerId } });
if (existingBets >= CASINO_CONSTANTS.MAX_BETS_PER_ROUND) {
  throw new AppError(400, 'Maximum bets per round reached', 'BET_LIMIT');
}
```

---

### 3. Chat Zone Switch Has No Validation
**Severity:** medium
**Type:** privilege escalation

**Description:** The `chat:switch-zone` handler at `chatHandlers.ts:134-152` accepts any `zoneId` string and immediately joins the socket to `chat:zone:${zoneId}`. There's no validation that:
1. The zone ID exists
2. The player is actually in that zone
3. The player has discovered that zone

A player can join ANY zone's chat room and read all messages.

**Exploit Scenario:**
1. Player is in the starter town.
2. Player emits `chat:switch-zone { zoneId: "<endgame-zone-id>" }`.
3. Socket joins `chat:zone:<endgame-zone-id>`.
4. Player can read and send messages in the endgame zone's chat.
5. Player can use zone chat to gather intel about high-level zone activity.

**Suggested Fix:** Validate the player is in the target zone:
```ts
const player = await prisma.player.findUnique({
  where: { id: playerId },
  select: { currentZoneId: true },
});
if (player?.currentZoneId !== zoneId) return;
```

---

### 4. Chat Message Injection: No Content Sanitization
**Severity:** medium
**Type:** input manipulation

**Description:** Chat messages at `chatHandlers.ts:87-88` are trimmed and length-checked, but not sanitized for content. Messages can contain:
- HTML/script tags (XSS risk if rendered without escaping on the frontend)
- Unicode control characters
- Extremely long runs of the same character (visual spam)
- Fake system message formatting (impersonating system/admin messages)

The `role` field is broadcast at line 127, which the frontend could use for styling. A forged admin JWT (see auth audit) could send messages with `role: 'admin'`.

**Suggested Fix:** Sanitize messages server-side:
```ts
const sanitized = trimmed
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
  .slice(0, CHAT_CONSTANTS.MAX_MESSAGE_LENGTH);
```
Frontend must also HTML-escape all message content.

---

### 5. Socket Auth Duplicates Hardcoded JWT Secret
**Severity:** high (cross-reference)
**Type:** privilege escalation

**Description:** `socketAuth.ts:5` duplicates the same hardcoded fallback from the HTTP auth middleware:
```ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
```
This means the Socket.IO authentication has the same critical vulnerability as the HTTP auth — if `JWT_SECRET` env var is missing, anyone can forge socket connections with arbitrary player IDs and admin roles.

**Suggested Fix:** Import the JWT secret from a single shared location rather than duplicating:
```ts
import { JWT_SECRET } from '../middleware/auth'; // Export from auth.ts
```

---

### 6. Casino Bet Broadcasts playerId to All Casino Chat Participants
**Severity:** low
**Type:** data leakage

**Description:** At `casinoService.ts:348-350`, the `casino:bet` event broadcasts `playerId` (UUID) to all players in the casino chat room:
```ts
const betEvent: CasinoBetEvent = { playerName, playerId, betType, betValue, amount };
io.to('chat:casino').emit('casino:bet', betEvent);
```
While `playerName` is public, the UUID `playerId` could be used to target the player via other vulnerable endpoints (e.g., the PvP scout bypass from the PvP audit).

**Suggested Fix:** Remove `playerId` from the broadcast — `playerName` is sufficient for display:
```ts
const betEvent = { playerName, betType, betValue, amount };
```

---

### 7. Round Resolution Race: Double Resolution Window
**Severity:** low (mitigated)
**Type:** race condition

**Description:** `resolveRound` at `casinoService.ts:99-198` uses a Redis `SET NX` lock (line 102) to prevent concurrent resolution. This is well-implemented — the lock prevents double payouts. However, the fallback polling loop (lines 105-113) waits up to 3 seconds and returns `0` if resolution isn't complete, which could give a misleading result to the caller.

**Assessment:** The lock is correct and prevents the critical double-payout issue. The fallback `return 0` is imprecise but doesn't cause financial loss since it's only used for display purposes.

---

### 8. Pin/Unpin Admin Check Uses JWT Role (Same Pattern)
**Severity:** low
**Type:** privilege escalation

**Description:** Chat pin/unpin at `chatHandlers.ts:164-165` and `184-185` check `role !== 'admin'` where `role` comes from `socket.data` (set during socket auth from the JWT). Like the HTTP admin middleware, this trusts the JWT role without DB verification.

**Assessment:** Same root cause as the auth audit finding — mitigated by fixing JWT verification globally.

---

### 9. Casino Join Has No Town Check
**Severity:** info
**Type:** business logic

**Description:** The `chat:join-casino` handler at `chatHandlers.ts:155-157` unconditionally joins the socket to the casino room. The HTTP casino endpoints (`/exchange`, `/roulette/bet`) enforce `assertInTown`, but the real-time casino chat is accessible from anywhere. A player in the wild can watch bets and results in real-time.

**Assessment:** This may be intentional — allowing spectating from anywhere while restricting betting to towns. Not a security issue.

---

### 10. Chat History Endpoint Doesn't Validate Channel Access
**Severity:** low
**Type:** data leakage

**Description:** Looking at `apps/api/src/routes/chat.ts` (if it exists) or the chat service, `getChannelHistory` at `chatService.ts:49-89` takes `channelType` and `channelId` as parameters and queries all messages without ownership validation. If exposed via a REST endpoint, any player could read guild chat history for any guild.

**Assessment:** The HTTP chat history endpoint would need its own access check. The Socket.IO path is gated by room membership (can only receive messages for rooms you've joined), but the `chat:switch-zone` vulnerability (#3) undermines this for zone chat.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | Exchange has no upper turn bound | medium | Accidental full-bank conversion |
| 2 | **Unlimited bets per round, no per-player cap** | medium | Yes — variance manipulation, gold laundering |
| 3 | **Zone chat switch has no validation** — join any zone's chat | medium | Yes — eavesdrop on any zone |
| 4 | Chat messages not sanitized — XSS/injection risk | medium | Yes — frontend dependent |
| 5 | **Socket auth duplicates hardcoded JWT secret** (cross-ref) | high | Yes — if env missing |
| 6 | Casino bet broadcasts playerId to all participants | low | UUID exposure |
| 7 | Round resolution race well-mitigated with Redis lock | low | No — lock prevents double payout |
| 8 | Pin/unpin admin check uses JWT role | low | Same root cause as auth audit |
| 9 | Casino join has no town check (spectating from anywhere) | info | Likely intentional |
| 10 | Chat history may lack channel access validation | low | Depends on HTTP endpoint |
