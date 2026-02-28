# PvP Rework Design — Template Combat

## Goal

Replace `runCombat()` with `runTemplateCombat()` in PvP so both players fight using their active combat templates with stamina/mana resources. Add template-aware scouting and enriched combat logs.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Defender template source | Live lookup at challenge time | Simple, always current. Template changes between scout and fight add strategic depth. |
| Defender resources | Max HP, max stamina, max mana | Consistent anti-griefing. Fair template-vs-template on equal footing. |
| Attacker resources | Current (lazy regen), persisted after combat | PvP has real resource cost beyond turns. Consistent with PvE. |
| Scout info | Category breakdown | Template length, offensive/defensive/supportive counts, max stam/mana, talent tree investment. Enough to counter-plan without spoiling rotation. |
| Scout notification | Yes | "You were scouted by [player]" alerts defender to change templates. Adds meta-game. |
| Post-fight log visibility | Full rotation revealed | Both players see complete per-round actions. Learn from opponents. |

## Task 19: Template vs Template Combat

### Attacker Combatant
- Build `TemplateCombatant` from current HP (via `getHpState`), current stamina/mana (via `getResourceState` with lazy regen)
- Fetch active template via `getActiveTemplate(playerId)`
- `actionDefinitions: { ...BASE_ACTION_DEFINITIONS }` (talent action defs added when implemented)
- After combat: `setAllResources(playerId, hp, stamina, mana)` to persist post-combat state
- Defeat path: flee/knockout handling unchanged, resources still persisted

### Defender Ghost
- Build `TemplateCombatant` with `maxHp` for HP, `maxStamina` for stamina, `maxMana` for mana
- Fetch defender's current active template via `getActiveTemplate(defenderId)`
- Compute max resources from defender's skill levels (same calculators as attacker)
- No state changes to defender — ghost model preserved
- Durability degrades for both (existing behavior)

### Combat Execution
- Call `runTemplateCombat(attackerCombatant, defenderCombatant)` — no `CombatOptions` (no auto-potions in PvP; potions are template actions now)
- Store `TemplateCombatResult` in `PvpMatch.combatLog`
- Elo calculation, cooldown, match recording unchanged

### Changes
- **Modify:** `apps/api/src/services/pvpService.ts` — `challenge()` function
- **Import:** `runTemplateCombat`, `calculateMaxStamina`, `calculateStaminaRegenPerRound`, `calculateMaxMana`, `calculateManaRegenPerRound` from `@adventure/game-engine`
- **Import:** `getActiveTemplate` from `combatTemplateService`, `getResourceState`, `setAllResources` from `resourceService`
- **Remove:** `runCombat` import from `@adventure/game-engine`

## Task 20: Scout Rework

### New Scout Response Fields

Add to the existing scout response:

```typescript
templateInfo: {
  templateLength: number;           // Actions in rotation
  offensiveCount: number;           // Actions with category 'offensive'
  defensiveCount: number;           // Actions with category 'defensive'
  supportiveCount: number;          // Actions with category 'supportive'
  maxStamina: number;
  maxMana: number;
  talentInvestment: {
    melee: number;                  // Highest tier unlocked (0 = none)
    ranged: number;
    magic: number;
    general: number;
  };
}
```

### Scout Notification

When `scoutOpponent()` is called, create a scout notification for the defender. Options:
- **Option A:** Add a `PvpScoutLog` model with `scouterId`, `targetId`, `createdAt`, `read` flag
- **Option B:** Reuse existing PvP notification pattern — add a `scoutedBy` field or create a lightweight activity log entry

Recommended: **Option A** — new `PvpScoutLog` model. Clean separation, simple query for unread scouts.

```prisma
model PvpScoutLog {
  id        String   @id @default(uuid())
  scouterId String   @map("scouter_id")
  targetId  String   @map("target_id")
  isRead    Boolean  @default(false) @map("is_read")
  createdAt DateTime @default(now()) @map("created_at")

  scouter Player @relation("PvpScouter", fields: [scouterId], references: [id], onDelete: Cascade)
  target  Player @relation("PvpScoutTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@index([targetId, isRead])
  @@map("pvp_scout_logs")
}
```

### Changes
- **Modify:** `apps/api/src/services/pvpService.ts` — `scoutOpponent()` to compute template info and create scout log
- **Modify:** `packages/database/prisma/schema.prisma` — add `PvpScoutLog` model + Player relations
- **Modify:** `apps/api/src/routes/pvp.ts` — add `GET /notifications/scouts` and `POST /notifications/scouts/read` endpoints
- **Import:** `getActiveTemplate` from `combatTemplateService`, `getSkillPoints` from `skillPointService`, resource calculators

## Task 21: PvP Combat Log Updates

`TemplateCombatLogEntry` already extends `CombatLogEntry` with per-round action names, resource snapshots, exhaustion flags, and interaction results. No type changes needed.

### Changes
- **Modify:** `apps/api/src/routes/pvp.ts` — match detail endpoint returns the richer log format
- The `PvpMatch.combatLog` JSON field automatically stores the full `TemplateCombatResult` since the challenge function serializes the result
- Frontend (Phase 6) will render the enriched log with action names and resource bars

## Testing

### pvpService.test.ts Updates
- Mock `runTemplateCombat` instead of `runCombat`
- Mock `getActiveTemplate`, `getResourceState`, `setAllResources`
- Mock resource calculators for defender max computation
- Test: attacker uses current resources, defender uses max
- Test: post-combat persists attacker resources
- Test: defeat persists attacker resources
- Test: scout returns template info (category counts, resource profile, talent investment)
- Test: scout creates notification for defender
- Test: scout notification endpoints (get, mark read)

### No Game Engine Changes
All combat logic is already in `templateCombatEngine.ts`. PvP just calls it with different combatant construction.
