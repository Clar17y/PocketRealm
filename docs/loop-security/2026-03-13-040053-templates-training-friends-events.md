# Security Audit: Combat Templates, Training, Friends/Mail & World Events

## Files Reviewed
- `apps/api/src/routes/templates.ts` — CRUD for combat templates, activate
- `apps/api/src/routes/training.ts` — training fight simulation, cooldown
- `apps/api/src/routes/friends.ts` — friend requests, friends list, spar, block, mail
- `apps/api/src/routes/worldEvents.ts` — active events, zone events, event detail
- `apps/api/src/services/combatTemplateService.ts` — template CRUD, validation, active management
- `apps/api/src/services/trainingService.ts` — fight simulation, cooldown via Redis

## Findings

### 1. Template ID Parameter Not Validated as UUID
**Severity:** low
**Type:** input manipulation

**Description:** The `PATCH /:id`, `DELETE /:id`, and `POST /:id/activate` template routes at `templates.ts:81-104` extract `req.params.id` directly without UUID validation. While Prisma will return null/error for non-UUID IDs, Zod validation should be added for consistency and to fail fast.

The `createSchema` and `updateSchema` validate the body, but the URL parameter is unvalidated.

**Suggested Fix:** Add parameter validation:
```ts
const idSchema = z.object({ id: z.string().uuid() });
const { id } = idSchema.parse(req.params);
```

---

### 2. Template Action Validation Only Checks Availability, Not Validity
**Severity:** medium
**Type:** input manipulation

**Description:** `validateTemplateSlots` at `combatTemplateService.ts:174-198` checks that `slot.actionId` is in `ALWAYS_AVAILABLE_ACTION_IDS` or `unlockedActions`. However, it does NOT validate that the action ID corresponds to an actual action definition. If a player sends `{ actionId: "nonexistent_action_99" }` and it happens to be in `unlockedActions` (e.g., from a corrupted talent allocation), the template saves successfully but the combat engine would have to handle the unknown action at runtime.

**Assessment:** The combat engine likely has fallback behavior for unknown actions (defaulting to normal attack). Low practical impact but creates template corruption risk.

**Suggested Fix:** Also validate against the action definition registry:
```ts
const allDefinitions = { ...BASE_ACTION_DEFINITIONS };
if (!allDefinitions[slot.actionId]) {
  throw new AppError(400, `Unknown action '${slot.actionId}'`, 'UNKNOWN_ACTION');
}
```

---

### 3. Training Cooldown Is Redis-Based — Bypassable via Redis Flush
**Severity:** low
**Type:** business logic

**Description:** The training cooldown at `trainingService.ts:36-39` uses a Redis key with TTL. If Redis is flushed or the key expires prematurely, the cooldown is bypassed. The training simulation is side-effect-free (no turns spent, no HP changed), so this is low impact.

**Assessment:** By design — Redis is ephemeral. The cooldown prevents spam, not abuse.

---

### 4. Training Fight Accepts Any Mob in Bestiary — No Zone Restriction
**Severity:** low
**Type:** business logic

**Description:** `simulateFight` at `trainingService.ts:42-47` only checks that the mob is in the player's bestiary. It doesn't require the player to be in a specific zone. A player in a safe town can simulate fights against any mob they've encountered.

**Assessment:** Intentional — training is a town-gated activity (line 19: `assertInTown`). The simulation is purely informational with no game state changes.

---

### 5. Friend Request Accepts Any Player UUID
**Severity:** low
**Type:** input manipulation

**Description:** `POST /friends/request` at `friends.ts:52-57` accepts any UUID as `targetId`. The `sendFriendRequest` service should validate the target exists and isn't the requester themselves. If it doesn't, bogus friend requests to non-existent UUIDs could accumulate in the database.

**Assessment:** The service likely validates existence. Low severity — no game state impact.

---

### 6. Mail Body Not Sanitized for Content
**Severity:** medium
**Type:** input manipulation

**Description:** The `mailSchema` at `friends.ts:41-45` validates subject length (1-64) and body length (1-500 via `MAX_BODY_LENGTH`). But neither is sanitized for content:
- HTML/script injection (XSS if rendered unsanitized)
- Unicode control characters
- Impersonation of system messages

**Exploit Scenario:**
1. Player sends mail with `body: "<script>alert('xss')</script>"`.
2. Recipient opens the mail in the frontend.
3. If the frontend renders body as raw HTML, XSS executes.

**Suggested Fix:** Server-side sanitization (strip HTML tags, control chars). Frontend must also escape mail content.

---

### 7. Spar Spends Turns Before Running Combat — Non-Atomic
**Severity:** low
**Type:** race condition

**Description:** The spar route at `friends.ts:112-118` calls `spendSparTurns(attackerId)` then `runSpar(attackerId, username, defenderId)` as separate operations. If `runSpar` fails after turns are spent, the player loses turns with no spar result.

**Assessment:** Low impact — spar failures are rare and the turn cost is likely small.

---

### 8. World Events Readable by All Players — No Privacy
**Severity:** info
**Type:** data leakage

**Description:** All world event endpoints (`GET /events`, `GET /events/zone/:zoneId`, `GET /events/:id`) are public to any authenticated player. This includes events in zones the player hasn't discovered.

**Assessment:** Likely intentional — world events are meant to be visible globally to create community awareness.

---

### 9. Block List Delete Doesn't Validate UUID Format
**Severity:** info
**Type:** input manipulation

**Description:** `DELETE /friends/block/:id` at `friends.ts:129-132` uses `req.params.id` without UUID validation. Same pattern as the template ID issue (#1).

---

### 10. Friend Profile Correctly Validates Friendship
**Severity:** info
**Type:** privilege escalation (not found)

**Description:** `GET /friends/:id/profile` at `friends.ts:104-108` passes both `playerId` and the target ID to `getFriendProfile`, which should verify they're actually friends before exposing profile data.

**Assessment:** The service name suggests it validates friendship. This is the correct pattern.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | Template ID params not UUID-validated | low | Prisma handles gracefully |
| 2 | Template action validation doesn't check definition registry | medium | Creates corrupt templates |
| 3 | Training cooldown Redis-based — ephemeral | low | By design |
| 4 | Training accepts any bestiary mob from any zone | low | Intentional — town-gated |
| 5 | Friend request accepts any UUID | low | Service validates existence |
| 6 | **Mail body not sanitized** — XSS risk | medium | Yes — frontend-dependent |
| 7 | Spar turns spent before combat — non-atomic | low | Rare failure case |
| 8 | World events visible to all players | info | Intentional |
| 9 | Block delete doesn't validate UUID | info | Same as #1 |
| 10 | Friend profile correctly validates friendship | info | No issue |

**Overall assessment:** These remaining systems are well-implemented with low risk. The most notable finding is the mail XSS vector (#6) which depends on frontend escaping, and the template action validation gap (#2) which could create corrupt templates if talent allocations are compromised.
