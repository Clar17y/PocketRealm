# Expedition Improvements Design

## Context

Feedback from initial expedition testing revealed several UX, gameplay, and mechanical issues. This design addresses all of them in one cohesive pass.

---

## 1. Cooldown UI Gating

**Problem:** Launch buttons don't check cooldowns — clicking fires the API which returns a generic error.

**Solution:** New `GET /expedition/cooldowns` endpoint returns cooldown state per tier:

```ts
{
  weeklyCooldowns: Record<number, string | null>; // tier → ISO expiry or null
  betweenCooldown: string | null;                 // ISO expiry or null
  hasActiveExpedition: boolean;
}
```

Frontend disables each tier's Launch button when on cooldown and shows the reason + remaining time (e.g. "Weekly cooldown: 3d 14h" or "18h cooldown: 12h remaining").

---

## 2. Wipe → Reset to Recruiting (Max 3 Attempts)

**Problem:** Wipes restore snapshot and retry same room with same people. Logs blend across attempts. No way to swap players or discuss strategy.

**Design:**

On wipe (all players KO'd):
1. Increment `wipeCount` (new DB field on `GuildExpedition`)
2. Archive current attempt's `roundSummaries` + metadata (room reached, participants, timestamp) into `expeditionAttemptLogs` JSON field (array of attempts)
3. If `wipeCount >= 3` → auto-abandon (status `failed`, 18h cooldown triggers, NO weekly tier cooldown)
4. Otherwise:
   - Clear `roundSummaries`
   - Delete all `GuildExpeditionMember` rows
   - Reset `currentRoom` to 0
   - Regenerate room mobs from original tier definitions
   - Set status to `recruiting`, schedule signup window
5. Tokens already earned by players from cleared rooms are kept (already persisted)

**Leader abandon:** Officer+ can abandon at any time → status `failed`, 18h cooldown, no weekly tier cooldown. Logs archived.

**History view:** Shows each attempt separately with full logs for post-mortem review.

---

## 3. Cooldown Rework

**Changes from current behavior:**

| Cooldown | Old | New |
|----------|-----|-----|
| Between-expedition | 24 hours | **18 hours** (allows consecutive evening play) |
| Weekly tier | Triggers on completed OR failed | Triggers on **completed only** |
| Failed/abandoned | Triggers weekly + 24h | Triggers **18h only** (no weekly) |

This means: fail a tier → retry next evening. Complete a tier → locked for the week on that tier.

---

## 4. Buff/Debuff/DoT Visibility

**Problem:** `activeEffects` exist on mobs and players in the engine but the frontend shows nothing.

**Changes:**

**Data exposure:**
- `ExpeditionMobInfo` (in `toExpeditionData`): include `activeEffects` array — currently stripped to just `id, name, prefix, hp, maxHp`
- `ExpeditionMemberData` (in `toExpeditionMemberData`): include `activeEffects` — currently not exposed despite being stored on `GuildExpeditionMember`

**Frontend — mob list:** Compact pill badges below each mob's HP bar: effect name + rounds remaining. Color-coded: red for debuffs/DoTs (Poison, Burn, Bleed), orange for boss buffs (Enrage).

**Frontend — player list:** Effect badges next to player name/HP bar. Red for debuffs from mobs, green for buffs (Battle Cry, Fortitude), blue for defensive states.

---

## 5. Expedition Lockout

**Problem:** Players in an active expedition can still explore, fight, and travel freely — breaks immersion and creates resource conflicts.

**When locked:** Player is a member of an expedition with status `in_progress`. Recruiting phase does NOT lock.

**Blocked actions:** Combat (encounter sites, ambush), exploration, zone travel.

**Allowed actions:** Crafting, inventory, equipment, chat, guild features, bestiary, leaderboard, achievements, settings.

**Implementation:** `isPlayerInActiveExpedition(playerId)` check function called by blocked route handlers. Returns `{ locked: true, expeditionId }` or `{ locked: false }`.

**Frontend:** Blocked screens show banner: "You are on an expedition with your guild" with navigation link to expedition screen.

**Unlock:** Automatic when expedition completes, fails, or resets to recruiting (member rows deleted on wipe).

---

## 6. Configurable Round Timers

**New constants replacing single `ROUND_INTERVAL_MS`:**

```ts
ROUND_INTERVAL_BY_ROOM_TYPE: {
  trash: 2 * 60 * 1000,       // 2 min
  elite: 2 * 60 * 1000,       // 2 min
  mini_boss: 3 * 60 * 1000,   // 3 min
  event: 2 * 60 * 1000,       // 2 min
  final_boss: 3 * 60 * 1000,  // 3 min
}
```

Rest period between rooms stays at 5 minutes but officers can force-start the next room early (same "Force Next Round" button, verified to work during rest phase when `roundNumber === 0`).

---

## 7. Heal Targeting

**Problem:** `heal_ally` always auto-targets highest-threat player. No manual control.

**New DB field:** `healTargetPlayerId` on `GuildExpeditionMember` (nullable).

**New API endpoint:** `POST /expedition/:id/heal-target` — set which player to heal. Validates target is a member and alive.

**Engine change:** In `raidRoundResolver.ts` supportive phase: if `healTargetPlayerId` is set and target is alive, heal them. Otherwise fall back to **lowest-HP player** (better default than highest-threat).

**Frontend:** Player list becomes clickable (same UX as mob targeting). Click player → green border + "YOUR HEAL TARGET" badge. Separate from attack target — players can have both a mob target and a heal target simultaneously.

---

## 8. Potions in Expeditions

**Problem:** Potion actions (`use_hp_potion`, `use_stamina_potion`, `use_mana_potion`) exist in combat templates and players can slot them with conditionals, but the raid resolver ignores `use_potion` actions — they silently fall through to `defend`.

**Root cause:** `templateCombatEngine.ts` has full potion support (inventory lookup, potion sickness, consumption). The raid resolver doesn't call any of this.

**Fix:** Port potion logic into the raid round resolution:
- At round resolution time, fetch each participant's potion inventory
- Pass `availablePotions` per participant into the resolver
- Handle `use_potion` in the supportive phase: check potion sickness, find matching potion, apply heal, consume, apply sickness debuff
- Track `potionsConsumed` in round result → service layer deletes consumed items from inventory
- Potion sickness persists in `activeEffects` across rounds

---

## 9. Force-Start Next Room

Officers can skip the 5-minute rest timer between rooms using the existing "Force Next Round" button. Verify the backend `forceNextRound` handler works during rest phase (`roundNumber === 0`). Frontend already shows the button during `in_progress` — just ensure it's visible during rest periods.

---

## DB Schema Changes

```
GuildExpedition:
  + wipeCount          Int      @default(0)
  + expeditionAttemptLogs  Json?   // Array of archived attempt logs

GuildExpeditionMember:
  + healTargetPlayerId  String?  // FK to Player for manual heal targeting
```

## Constants Changes

```
EXPEDITION_CONSTANTS:
  - ROUND_INTERVAL_MS (removed)
  + ROUND_INTERVAL_BY_ROOM_TYPE (per room type)
  ~ BETWEEN_EXPEDITION_COOLDOWN_MS: 24h → 18h
  - MAX_WIPES_PER_EXPEDITION: 5 → 3 (renamed MAX_ATTEMPTS)
```
