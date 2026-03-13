# Consolidated Security Priority Report

**Coverage:** 21 audits covering every route file, cross-cutting infrastructure, shared services, database schema, game engine, and cross-system exploit chains.

## Critical / High Priority — Fix Before Launch

### 1. Hardcoded JWT Secret Fallback (auth + socket)
**Files:** `middleware/auth.ts:7`, `socket/socketAuth.ts:5`
**Impact:** Total authentication bypass if `JWT_SECRET` env var is missing
**Fix:** Remove fallback, crash on startup if not set

### 2. Pending Loot Double-Claim — Item Duplication (inventory)
**File:** `services/pendingLootService.ts:59-97`
**Impact:** Players can duplicate items by sending concurrent claim requests
**Fix:** Use Redis `GETDEL` or delete-before-process pattern

### 3. No Zone Presence Validation (exploration + combat)
**Files:** `routes/exploration/start.ts`, `routes/combat/start.ts`
**Impact:** Players can explore, fight, and discover encounters in any zone remotely
**Fix:** Add `player.currentZoneId === body.zoneId` check

### 4. POST /turns/spend Publicly Exposed (turns)
**File:** `routes/turns.ts:53-91`
**Impact:** Any authenticated user can drain all turns for nothing
**Fix:** Gate behind admin middleware or remove the endpoint

### 5. No Global Rate Limiting (infrastructure)
**File:** `index.ts`
**Impact:** Any user can overwhelm the server with rapid-fire requests
**Fix:** Add `express-rate-limit` middleware globally and per-player

### 6. Admin Role Not Re-Verified from DB (auth + admin)
**Files:** `middleware/auth.ts:81`, `middleware/admin.ts:5`
**Impact:** Revoked admins retain access for 15 minutes (access token lifetime)
**Fix:** Re-query player role from DB in `requireAdmin`

---

## Medium Priority — Fix in Next Sprint

| # | Finding | Audit | Fix |
|---|---------|-------|-----|
| 7 | Teleport scroll bypasses all travel restrictions | Quests/Shop | Add HP/recovering/lockout checks to `applyTeleport` |
| 8 | Boss HP scaling corruption — write before optimistic lock | Boss | Move HP scaling inside the lock check or add Redis lock |
| 9 | Gathering uses client-provided zone ID | Gathering | Read `player.currentZoneId` from DB |
| 10 | Refresh token reuse via activity window bypass | Auth | Require stored token to exist in DB |
| 11 | Guild creation: turn spend outside transaction | Guild | Move `spendPlayerTurns` inside `$transaction` |
| 12 | Skill point allocation not atomic — double-spend | Player | Wrap in `$transaction` |
| 13 | Achievement claim race — double rewards | Player | Use `updateMany WHERE rewardClaimed = false` |
| 14 | XP buff fetched outside transaction — double boost | Shared Services | Move buff fetch inside transaction |
| 15 | Attribute points absolute write — silent loss | Shared Services | Change to `{ increment: levelUps }` |
| 16 | Expedition force-round bypasses timing | Expedition | Check `nextRoundAt` before allowing |
| 17 | Shop purchase token race — duplicate items | Expedition | Use `updateMany WHERE tokens >= cost` |
| 18 | Travel refund includes tax inflation | Zones/HP | Calculate refund on base cost, not inflated |
| 19 | No login rate limiting | Auth | Add per-IP + per-email rate limit |
| 20 | Unlimited bets per roulette round | Casino | Add per-player per-round bet limit |
| 21 | Zone chat switch has no validation | Chat/Socket | Verify player is in the target zone |
| 22 | Chat/mail not sanitized — XSS risk | Friends + Chat | Server-side strip HTML + control chars |
| 23 | Craft quantity has no upper bound | Crafting | Add `.max(100)` to schema |
| 24 | Boss signup gives full HP regardless | Boss | Use `hpState.currentHp` not `maxHp` |
| 25 | Efficiency reset doubles XP capacity | Quests/Shop | Only allow when window expired |
| 26 | Guild log readable by any player | Guild | Add membership check |
| 27 | Leaderboard exposes player UUIDs + isAdmin publicly | Leaderboard | Strip `playerId` and `isAdmin` from public response |

---

## Low Priority — Track as Tech Debt

| # | Finding | Audit |
|---|---------|-------|
| 28 | Item creation outside transaction in craft route | Crafting |
| 29 | Travel turn spend not atomic with zone update | Zones/HP |
| 30 | Breadcrumb return bypasses connection validation | Zones/HP |
| 31 | Travel ambushes missing guild combat modifiers | Zones/HP |
| 32 | Admin ops target only admin's own account | Admin |
| 33 | No audit logging for admin actions | Admin |
| 34 | Bot creation creates permanent player records | Admin/Expedition |
| 35 | Achievement turn reward bypasses bank cap | Player |
| 36 | Room carry HP can override current HP | Combat |
| 37 | Encounter site decay check outside transaction | Combat |
| 38 | `prismaAny` bypasses type safety globally | Infrastructure |
| 39 | Template action validation doesn't check definition registry | Templates |
| 40 | Quest progress not atomic — stale reads | Quests |
| 41 | Daily bonus TOCTOU — double claim | Quests |
| 42 | World event spawn no duplicate prevention | Shared Services |
| 43 | No request ID tracking | Infrastructure |

---

## Patterns Observed

**Most common vulnerability type:** Race conditions / TOCTOU (14 findings). The codebase frequently reads state outside transactions, validates, then writes inside — creating windows for concurrent requests.

**Most common architectural gap:** Checks performed at service boundaries (guards before transactions) rather than inside transactions. Guild, achievement, expedition, and quest services all share this pattern.

**Strongest areas:** Turn bank service (excellent optimistic locking with retry), HP service (solid optimistic locking), sell service (fully transactional), casino round resolution (Redis NX lock).

**Recommended systemic fixes:**
1. Move all pre-flight checks inside transactions
2. Use `updateMany` with WHERE guards instead of read-then-update
3. Add global rate limiting as the highest-leverage single change
4. Centralize JWT secret to a single import
5. Add CHECK constraints on all currency-like DB columns (gold, tokens, treasury, quantity)

---

## Additional Audits (post-consolidation)

### Prisma Schema & Data Integrity (audit 19)
- Player.gold, Guild.treasuryTurns, Player.expeditionTokens all lack non-negative DB constraints
- Single migration adding CHECK constraints catches ALL application-level race conditions as defense-in-depth

### Game Engine Pure Functions (audit 20)
- Most robust layer in the codebase — excellent `finiteOrFallback` + `clamp` patterns
- Only finding: defence scaling constant (100) hardcoded instead of in gameConstants.ts

### Cross-System Exploit Chain Analysis (audit 21)
- 6 multi-step attack chains identified combining individual findings
- **Chain 1 (Critical):** Remote Farming Empire — zone IDs + no validation + client zone ID = farm endgame from starter town
- **Chain 2 (High):** Infinite Gold Factory — zero-cost craft loop + sell rarity items
- **Chain 3 (High):** Teleport Boss Leech — teleport bypass + full HP signup + HP rescaling
- See `2026-03-13-052012-exploit-chain-analysis.md` for full chain details and fix priority order

### Leaderboard & Bestiary (audit 18)
- Leaderboard exposes player UUIDs + isAdmin flag to unauthenticated users
