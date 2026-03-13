# Security Audit: Prisma Schema & Data Integrity

## Files Reviewed
- `packages/database/prisma/schema.prisma` (~1022 lines, 50 models)
- Cross-referenced with findings from all 18 previous audits

## Context

This audit examines the database schema layer for missing constraints, cascade risks, and data integrity gaps that could enable exploits regardless of which route is used.

## Findings

### 1. Player.gold Has No Non-Negative Constraint
**Severity:** medium
**Type:** business logic

**Description:** The `Player.gold` field is `Int @default(0)` with no database-level constraint preventing negative values. Multiple routes use `{ decrement: amount }` operations (casino bets, guild tax, gold loss on defeat) that can drive gold negative if concurrent requests overlap. PostgreSQL `Int` columns accept negative values by default.

The concurrent casino bet race (from casino/chat audit finding #4) and the concurrent expedition shop purchase race (from expedition audit finding #4) both rely on application-level checks that can be bypassed via TOCTOU.

**Suggested Fix:** Add a PostgreSQL CHECK constraint via migration:
```sql
ALTER TABLE players ADD CONSTRAINT gold_non_negative CHECK (gold >= 0);
```
This makes the DB reject any update that would go negative, catching all concurrent races.

---

### 2. Guild.treasuryTurns Has No Non-Negative Constraint
**Severity:** medium
**Type:** business logic

**Description:** `Guild.treasuryTurns` is an unconstrained `Int`. The specialization respec race (from guild audit finding #7) and expedition launch race (from expedition audit finding #3) both use `{ decrement }` that can drive treasury negative. Application-level checks are outside transactions.

**Suggested Fix:**
```sql
ALTER TABLE guilds ADD CONSTRAINT treasury_non_negative CHECK (treasury_turns >= 0);
```

---

### 3. Player.expeditionTokens Has No Non-Negative Constraint
**Severity:** medium
**Type:** business logic

**Description:** `Player.expeditionTokens` is `Int @default(0)`. The shop purchase race (expedition audit finding #4) uses `{ decrement }` outside a guard, enabling negative token balances.

**Suggested Fix:**
```sql
ALTER TABLE players ADD CONSTRAINT expedition_tokens_non_negative CHECK (expedition_tokens >= 0);
```

---

### 4. PlayerQuestState.questTokens Has No Non-Negative Constraint
**Severity:** low
**Type:** business logic

**Description:** `PlayerQuestState.questTokens` can go negative via the same pattern. The quest shop purchase (from quests/shop audit) uses `{ decrement }` inside a transaction with a check, which is safer, but still lacks a DB-level guard.

**Suggested Fix:**
```sql
ALTER TABLE player_quest_state ADD CONSTRAINT quest_tokens_non_negative CHECK (quest_tokens >= 0);
```

---

### 5. Item.quantity Has No Minimum Constraint
**Severity:** low
**Type:** business logic

**Description:** `Item.quantity` is `Int @default(1)` with no minimum. The delete stack endpoint (from inventory audit finding #3) computes `item.quantity - query.quantity` without guarding against negative results. While the application logic prevents this in most paths, a DB constraint would provide defense-in-depth.

**Suggested Fix:**
```sql
ALTER TABLE items ADD CONSTRAINT quantity_positive CHECK (quantity >= 1);
```

---

### 6. No Foreign Key from Player.currentZoneId to Zone.id
**Severity:** info
**Type:** data integrity

**Description:** `Player.currentZoneId` is `String?` with a Prisma relation to Zone, which DOES create a FK constraint. However, zone deletion (`onDelete` is not specified, defaulting to `Restrict`) means deleting a zone with players in it would fail. This is correct behavior — zones shouldn't be deleted while occupied.

**Assessment:** No issue — Prisma correctly enforces the FK.

---

### 7. Item onDelete: Cascade from Player, but SetNull from Equipment
**Severity:** info
**Type:** data integrity

**Description:** `Item` has `onDelete: Cascade` from Player (line 221) — deleting a player deletes all their items. `PlayerEquipment` has `onDelete: SetNull` from Item (line 173) — deleting an item sets the equipment slot to null. This is the correct cascade chain: player deletion cleans up everything, item deletion safely unequips.

**Assessment:** Good design — cascade chain is correct.

---

### 8. No Unique Constraint on (ownerId, templateId, inStash) for Stackable Items
**Severity:** low
**Type:** data integrity

**Description:** Stackable items should have at most one row per (ownerId, templateId, inStash) combination. The application enforces this via `findFirst` + `update/create` patterns, but there's no database-level unique constraint. A race condition could create duplicate stacks (e.g., the loot claim double-stack issue from inventory audit finding #5).

**Suggested Fix:** A partial unique index would enforce this:
```sql
CREATE UNIQUE INDEX items_stackable_unique
ON items (owner_id, template_id, in_stash)
WHERE quantity > 0;
```
However, this requires knowledge of which templates are stackable, making it complex. The better fix is at the application level.

---

### 9. TurnBank.currentTurns Can Exceed BANK_CAP
**Severity:** low
**Type:** business logic

**Description:** `TurnBank.currentTurns` is an unconstrained `Int`. While the application's `refundPlayerTurns` function caps at `TURN_CONSTANTS.BANK_CAP`, the achievement reward bypass (from player/attributes audit finding #3) uses `{ increment }` directly, exceeding the cap. A DB constraint would catch this.

**Suggested Fix:**
```sql
ALTER TABLE turn_banks ADD CONSTRAINT turns_within_cap CHECK (current_turns >= 0 AND current_turns <= 200000);
```
Use a generous upper bound (e.g., 200K) to allow edge cases while preventing extreme violations.

---

### 10. No Index on Item.ownerId
**Severity:** low
**Type:** performance / data integrity

**Description:** The `Item` model has no explicit `@@index([ownerId])`. Every inventory query filters by `ownerId`, making this a high-frequency access pattern. PostgreSQL may create an implicit index via the FK, but an explicit index ensures consistent performance.

**Assessment:** Performance concern, not a security issue. But slow inventory queries could be weaponized for DoS against the server.

---

## Summary

| # | Finding | Severity | Type |
|---|---------|----------|------|
| 1 | **Player.gold no non-negative constraint** | medium | Negative gold via race |
| 2 | **Guild.treasuryTurns no non-negative constraint** | medium | Negative treasury via race |
| 3 | **Player.expeditionTokens no non-negative constraint** | medium | Negative tokens via race |
| 4 | PlayerQuestState.questTokens no non-negative constraint | low | Same pattern |
| 5 | Item.quantity no minimum constraint | low | Potential negative quantity |
| 6 | currentZoneId FK correctly enforced | info | Good design |
| 7 | Item cascade chain correct | info | Good design |
| 8 | No unique constraint for stackable items | low | Duplicate stacks possible |
| 9 | TurnBank.currentTurns can exceed cap | low | Achievement bypass |
| 10 | No explicit index on Item.ownerId | low | Performance |

## Systemic Recommendation

The most impactful single migration would add CHECK constraints on all currency-like integer fields:

```sql
ALTER TABLE players ADD CONSTRAINT gold_non_negative CHECK (gold >= 0);
ALTER TABLE players ADD CONSTRAINT expedition_tokens_non_negative CHECK (expedition_tokens >= 0);
ALTER TABLE guilds ADD CONSTRAINT treasury_non_negative CHECK (treasury_turns >= 0);
ALTER TABLE player_quest_state ADD CONSTRAINT quest_tokens_non_negative CHECK (quest_tokens >= 0);
ALTER TABLE items ADD CONSTRAINT quantity_positive CHECK (quantity >= 1);
```

This is a **defense-in-depth** measure that catches ALL application-level race conditions on currency fields, regardless of which route or service contains the bug. It's the highest-leverage database-level security fix available.
