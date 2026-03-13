# Security Audit: Exploration & Combat Start

## Files Reviewed
- `apps/api/src/routes/exploration/start.ts` — exploration POST endpoint (~800 lines)
- `apps/api/src/routes/exploration/helpers.ts` — schemas, utility functions, encounter site builder
- `apps/api/src/routes/combat/start.ts` — combat POST endpoint, encounter site room combat (~1023 lines)
- `apps/api/src/routes/combat/helpers.ts` — combat schemas, encounter site parsers (referenced)
- `apps/api/src/services/combatOrchestrationService.ts` — player combat prep, victory rewards
- `apps/api/src/services/turnBankService.ts` — `spendPlayerTurnsTx`
- `apps/api/src/services/persistedMobService.ts` — `persistMobHp`, `checkPersistedMobReencounter`
- `apps/api/src/services/pendingLootService.ts` — overflow loot storage
- `apps/api/src/services/zoneExplorationService.ts` — exploration progress tracking

## Findings

### 1. Exploration Doesn't Verify Player Is In The Target Zone
**Severity:** high
**Type:** privilege escalation

**Description:** The `POST /api/v1/exploration/start` endpoint at `start.ts:83` parses `body.zoneId` from user input and immediately uses it to fetch zone data and mobs. There is no check that the player's `currentZoneId` matches `body.zoneId`. A player in zone A can explore zone B remotely without traveling there.

**Exploit Scenario:**
1. Player is in the starter town (safe zone).
2. Player sends `POST /exploration/start { zoneId: "<high-tier-zone-id>", turns: 10000 }`.
3. The endpoint loads mobs from the high-tier zone, rolls exploration outcomes, and processes them.
4. Player discovers encounter sites, resource nodes, and fights ambush mobs from a zone they've never visited.
5. The player bypasses travel turn costs and zone discovery prerequisites.

**Suggested Fix:** Add a zone validation check:
```ts
const player = await prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } });
if (player?.currentZoneId !== body.zoneId) {
  throw new AppError(400, 'You must be in this zone to explore it', 'WRONG_ZONE');
}
```

---

### 2. Combat Start Accepts Arbitrary mobTemplateId Without Zone Ownership Check
**Severity:** medium
**Type:** input manipulation

**Description:** The `POST /api/v1/combat/start` endpoint at `combat/start.ts:711-716` accepts an optional `body.mobTemplateId`. It validates the mob exists and belongs to the zone (`found.zoneId !== zoneId`), but does NOT check that the player is in that zone. Combined with finding #1's issue (no currentZoneId check on the zoneId parameter), a player can fight any mob in any zone.

**Exploit Scenario:**
1. Player sends `POST /combat/start { zoneId: "<any-zone>", mobTemplateId: "<specific-mob-id>" }`.
2. The endpoint loads the mob template, validates it belongs to the specified zone.
3. Combat proceeds — player fights the mob from anywhere.
4. Player can target the weakest mobs in high-reward zones.

**Suggested Fix:** Validate `player.currentZoneId === body.zoneId` before allowing combat.

---

### 3. Encounter Site Combat Has No Zone Proximity Check
**Severity:** medium
**Type:** privilege escalation

**Description:** `handleEncounterSiteRoomCombat` at `combat/start.ts:81` takes an `encounterSiteId` from user input and only validates ownership via `findFirst({ where: { id: encounterSiteId, playerId } })`. It does NOT verify the player is currently in the same zone as the encounter site. A player could discover an encounter site in zone A, travel to a safe town, and continue fighting the site remotely.

**Exploit Scenario:**
1. Player discovers a large encounter site in a dangerous zone.
2. Player travels back to town (safe zone).
3. Player sends combat start requests to fight the encounter site from town.
4. If defeated, the player is in town and avoids flee/knockout penalties specific to the combat zone.

**Suggested Fix:** Add a zone check inside `handleEncounterSiteRoomCombat`:
```ts
const player = await prisma.player.findUnique({ where: { id: playerId }, select: { currentZoneId: true } });
if (player?.currentZoneId !== site.zoneId) {
  throw new AppError(400, 'You must be in the encounter zone to fight', 'WRONG_ZONE');
}
```

---

### 4. Exploration Turn Validation Has No Upper Bound Enforcement in Route
**Severity:** medium
**Type:** input manipulation

**Description:** The `startSchema` at `helpers.ts:25-29` validates `turns: z.number().int()` with no `.min()` or `.max()`. The `validateExplorationTurns()` function from game-engine enforces bounds (likely 10-10000 based on EXPLORATION_CONSTANTS), but this validation happens at line 90 AFTER the schema parse. A negative turns value would pass the Zod schema.

Looking at `validateExplorationTurns`, it returns `{ valid: false, error }` for out-of-range values. However, between schema parse and validation, no damage occurs since the validation happens before any DB operations. The real concern is integer overflow — `z.number().int()` accepts any integer including very large values like `Number.MAX_SAFE_INTEGER`.

**Suggested Fix:** Add bounds to the schema:
```ts
turns: z.number().int().min(EXPLORATION_CONSTANTS.MIN_TURNS).max(EXPLORATION_CONSTANTS.MAX_TURNS),
```

---

### 5. Full Clear Strategy Charges All Turns Upfront With No Refund
**Severity:** low
**Type:** business logic

**Description:** At `combat/start.ts:146-147`, full clear strategy calculates `totalTurnCost = totalMobCount * ENCOUNTER_TURN_COST` and charges all turns in a single transaction at line 329. If the player is defeated on mob 2 of 15, they've already paid for all 15 fights. The comment at line 144-145 says this is intentional ("risk/reward tradeoff").

However, upon defeat, the code at lines 432-450 also resets all defeated mobs in the current room back to `alive` status (line 442-443) or downgrades from full_clear to room_by_room. This means the player pays full turns for fights they "won" within the room, but those victories are erased.

**Exploit Scenario:** Not directly exploitable, but creates a UX trap where full clear with many rooms can consume thousands of turns and reset progress on defeat. Players who don't understand the mechanic waste large amounts of turns.

**Assessment:** Intentional by design per the code comment.

---

### 6. Encounter Site Decay Check Happens Outside Transaction
**Severity:** medium
**Type:** race condition

**Description:** In `handleEncounterSiteRoomCombat` at `combat/start.ts:94-100`, the decay check runs before the transaction. Inside the transaction (line 337), a fresh decay is computed. However, between the initial decay check and the transaction, the site could decay further or be modified by another request. The transaction re-fetches and re-decays (line 337), which is correct, but the room selection and mob loading at lines 108-142 use the stale pre-transaction data.

If mobs decayed between the pre-tx check and the tx re-fetch, the `defeatedSlots` array (line 319) may reference slots that no longer exist in the fresh data, causing incorrect mob status updates.

**Suggested Fix:** Move mob selection logic inside the transaction, or at minimum validate that `defeatedSlots` still match alive mobs in the fresh data.

---

### 7. Room Carry HP Can Be Set From Previous Session Without Freshness Check
**Severity:** low
**Type:** business logic

**Description:** At `combat/start.ts:176-179`, if `site.roomCarryHp` is set, the player's HP is overridden to that value via `setHp()`. This value was stored from a previous combat session. If the player has healed (rested, used potions) since then, the carry HP could be LOWER than their current HP, effectively un-healing them.

**Exploit Scenario:** (Inverse) If a player had high HP when leaving an encounter site and then takes damage elsewhere, returning to the encounter site would restore them to the higher carry HP. This is a free heal.

**Suggested Fix:** Use the minimum of carry HP and current HP:
```ts
currentPlayerHp = Math.min(site.roomCarryHp, hpState.currentHp);
```

---

### 8. Combat Buffs Consumed Per-Mob Outside Main Transaction
**Severity:** low
**Type:** race condition

**Description:** At `combat/start.ts:261-263`, combat buff charges are consumed in a separate `$transaction` per mob fought, outside the main turn-spending transaction at line 327. If the main transaction fails and rolls back, the buff charges are already consumed.

Additionally, the buff uses are tracked in a local `buffUsesLeft` variable that's decremented in memory, meaning concurrent requests could both consume charges for the same buff.

**Suggested Fix:** Move buff consumption into the main transaction, or at minimum make it idempotent.

---

### 9. Exploration Zone Exit Discovers Zones Without Travel Cost
**Severity:** low
**Type:** business logic

**Description:** Looking at the exploration start flow (lines visible in the large file), zone exit discoveries during exploration automatically call `discoverZone()` for neighboring zones. This adds the zone to the player's discovered zones without requiring the player to actually travel there, potentially bypassing discovery requirements or narrative gates.

**Assessment:** Likely intentional — exploration is the discovery mechanism. But if any zones should require quest completion or level requirements before discovery, the exploration system bypasses those.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **Exploration doesn't verify player is in target zone** | high | Yes — remote exploration |
| 2 | Combat accepts arbitrary mobTemplateId without zone check | medium | Yes — fight any mob from anywhere |
| 3 | Encounter site combat has no zone proximity check | medium | Yes — fight remotely from town |
| 4 | Exploration turns schema has no upper bound | medium | Edge case only |
| 5 | Full clear charges all turns upfront, resets on defeat | low | By design |
| 6 | Encounter site decay check outside transaction | medium | Race condition — stale mobs |
| 7 | Room carry HP can override current HP (both directions) | low | Free heal or un-heal |
| 8 | Combat buffs consumed outside main transaction | low | Race on concurrent requests |
| 9 | Zone exit discovers zones without travel cost | low | Likely intentional |
