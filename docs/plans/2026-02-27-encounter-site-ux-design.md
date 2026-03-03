# Encounter Site UX Improvements

## Problems

1. **Flat combat history** — Encounter site fights appear as individual rows in Combat History. No way to see them grouped as a single encounter site.
2. **Loot duplication bug** — Aggregated loot concatenates per-fight arrays instead of combining by `itemTemplateId`. "Rat Pelt x1, Rat Pelt x2, Rat Pelt x1" instead of "Rat Pelt x4".
3. **Premature refresh** — `refreshPendingEncounters()` fires immediately after combat API returns (before playback). Can get stuck on "loading encounter sites" if the refresh fails.
4. **Layout order** — Combat playback appears below the encounter site list. Long lists force scrolling to see the battle.

## Solutions

### 1. Grouped Encounter Site History

**API changes:**

- Modify `GET /combat/logs` to exclude `encounter_site_fight` entries and include only summary logs (`encounter_site`, `zone_combat`, `exploration_ambush`, `travel_ambush`)
- Add `fightCount` and `encounterSiteId` fields to list response for encounter site entries
- Add `mobFamilyName` to encounter site summary logs for display/search
- New endpoint `GET /combat/logs/site/:logId/fights` — returns ordered list of per-fight log IDs for an encounter site summary log. Lightweight: returns IDs + mob names + outcomes only, not full logs.

**Frontend — Combat History tab:**

- Encounter site entries render as a single row: mob family image, site name, fight count, overall outcome, total XP
- Clicking opens detail view with 1/N navigation (prev/next arrows + "Fight 3/7" counter)
- Each fight's full log lazy-loaded via existing `GET /combat/logs/:id`
- Aggregated rewards summary shown alongside the navigation

**Frontend — Post-combat panel (lastCombat):**

- After encounter site playback completes, show 1/N navigation for all fights just completed
- Store the full `combatPlaybackQueue` (fight IDs + metadata) in `lastCombat` state so fights can be revisited
- Default to last fight's log. Navigate back to review earlier fights.

### 2. Loot Aggregation Fix

**Root cause:** `apps/api/src/routes/combat/start.ts:467` — `aggregatedLoot.push(...fight.loot)` concatenates without combining.

**Fix:** After collecting all fight loot, reduce by `itemTemplateId` to sum quantities. Preserve `itemName` from the first matching entry.

### 3. Defer Encounter Site Refresh

**Root cause:** `useGameController.ts:1193` — `refreshPendingEncounters()` in `handleStartCombat` runs before playback.

**Fix:**
- Remove `refreshPendingEncounters()` from the `handleStartCombat` callback
- Add it to `handleCombatPlaybackComplete()` — refresh after all fights finish
- Keep `loadAll()` and `loadTurnsAndHp()` in the original location (they update turns/HP which may be needed)
- For room_by_room: refresh after each room so the site card updates room progress

### 4. Reorder Layout

**Current:** Filters → Site List → Room Transition → Combat Playback → Last Combat

**New:** Filters → Combat Playback / Room Transition / Last Combat → Site List

Combat playback, room transitions, and the last combat panel all render above the encounter site list. When a fight starts, the player immediately sees the action at the top of the content area.
