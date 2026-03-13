# Security Audit: Leaderboard & Bestiary

## Files Reviewed
- `apps/api/src/routes/leaderboard.ts` — GET categories, GET /:category
- `apps/api/src/routes/bestiary.ts` — GET / (full bestiary with kills, prefixes, boss rotations)
- `apps/api/src/services/leaderboardService.ts` — Redis-cached leaderboard with 25+ categories, refresh logic

## Findings

### 1. Leaderboard Exposes Player UUIDs to Unauthenticated Users
**Severity:** medium
**Type:** data leakage

**Description:** The leaderboard router at `leaderboard.ts:8` uses `optionalAuthenticate` — meaning unauthenticated users can access leaderboards. The response includes `playerId` (UUID) for every entry (line 148-160 in service). Combined with the `isAdmin` flag (line 157), anyone can enumerate admin account UUIDs.

**Exploit Scenario:**
1. Unauthenticated attacker browses `GET /api/v1/leaderboard/character_level`.
2. Finds entries with `isAdmin: true` — now has the admin's UUID.
3. Uses the admin UUID in other attacks (e.g., PvP scouting, friend request spam).
4. The `playerId` can also be used with the zone chat vulnerability (from casino/chat audit) to target specific players.

**Suggested Fix:** Either require authentication for leaderboards, or strip `playerId` from public responses:
```ts
entries: entries.map(({ playerId, ...rest }) => rest),
```
Keep `playerId` only for the `myRank` entry.

---

### 2. Leaderboard Category Parameter Not Validated Against Injection
**Severity:** low
**Type:** input manipulation

**Description:** At `leaderboard.ts:14`, `req.params.category` is passed to `getLeaderboard(category)`. The service validates against `VALID_SLUGS` at line 109, throwing a 400 for invalid categories. However, the error message includes the user-provided category:
```ts
throw new AppError(400, `Invalid leaderboard category: ${category}`, 'INVALID_CATEGORY');
```
This creates a reflected content injection — the user's input is echoed in the error response. While not XSS (it's JSON), it could be used for error message manipulation or log injection.

**Assessment:** Low severity — JSON response prevents XSS, and the `VALID_SLUGS` check catches invalid input early.

**Suggested Fix:** Don't echo user input in error messages:
```ts
throw new AppError(400, 'Invalid leaderboard category', 'INVALID_CATEGORY');
```

---

### 3. Leaderboard Refresh Clears and Rebuilds Atomically — Brief Staleness Window
**Severity:** low
**Type:** race condition

**Description:** `writeToZset` at `leaderboardService.ts:194-219` calls `redis.del(key, metaKey)` then writes new data. Between the delete and the write, a concurrent `getLeaderboard` call would see an empty leaderboard. This window is brief (milliseconds) but exists.

**Assessment:** Acceptable for a leaderboard — brief staleness is standard. No financial impact.

---

### 4. Bestiary Exposes Full Mob Stats Including Drop Tables
**Severity:** info
**Type:** data leakage

**Description:** The bestiary endpoint at `bestiary.ts:26-148` returns complete mob data: HP, accuracy, defence, drop tables with exact drop rates (line 117: `Math.round(Number(dt.dropChance) * 10000) / 100`), and boss rotation patterns (lines 122-137).

For undiscovered mobs (`kills === 0` and `tierLocked`), the data is properly hidden with `isHidden` checks (lines 97-98). But once a mob is discovered (even with 1 kill), ALL information is revealed including exact drop rates.

**Assessment:** Likely intentional — the bestiary is a knowledge progression system. Hiding data until discovery is the designed gate. Once discovered, full info is the reward.

---

### 5. Boss Rotation Reveal Is Progressive and Well-Gated
**Severity:** info
**Type:** data leakage (not found)

**Description:** Boss rotation data at `bestiary.ts:122-137` only reveals rounds up to `roundsRevealed` (line 131: `template.actions.slice(0, roundsRevealed)`). This is set by surviving boss rounds (from `bossEncounterService.ts:664-679`). Players must actually participate and survive to learn each round's action.

**Assessment:** Good implementation — progressive revelation tied to gameplay participation.

---

### 6. Leaderboard `around_me` Feature Uses Optional Auth Correctly
**Severity:** info
**Type:** privilege escalation (not found)

**Description:** The `around_me` query param at `leaderboard.ts:16` uses `req.player?.playerId` from optional auth. If no token is provided, `playerId` is undefined and `around_me` silently falls back to showing the top entries. No crash, no error.

**Assessment:** Clean graceful degradation.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **Leaderboard exposes player UUIDs + isAdmin to unauthenticated users** | medium | Yes — admin UUID enumeration |
| 2 | Error message reflects user input | low | JSON prevents XSS |
| 3 | Leaderboard refresh has brief staleness window | low | By design |
| 4 | Bestiary reveals full mob stats after discovery | info | Intentional |
| 5 | Boss rotation progressive reveal well-gated | info | Good implementation |
| 6 | Optional auth graceful degradation | info | Good implementation |

**Overall assessment:** The leaderboard and bestiary are among the cleanest systems in the codebase. The main actionable finding is stripping `playerId` from public leaderboard responses and removing the `isAdmin` flag.
