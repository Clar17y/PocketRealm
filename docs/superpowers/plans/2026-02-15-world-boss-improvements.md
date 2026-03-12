# World Boss UI & Mechanics Improvements

## Context
The WorldBossTab has several UI bugs (duplicate HP bars, undefined hits, missing boss damage) and needs gameplay improvements (timing, auto-signup, defeated boss lingering, boss history).

**Branch:** `feature/world-events-system`
**Worktree:** `.worktrees/feature-world-events-system`

---

## 1. HP Bars → Percentage Only

Both the `BossHpBar` (expanded detail) and the mini HP bar (collapsed summary) show HP. The expanded one shows absolute values which are misleading since HP rescales between rounds based on participant count.

**Change:** In `BossHpBar` component (`WorldBossTab.tsx:16-41`), replace `{current.toLocaleString()} / {max.toLocaleString()}` with `{Math.round(percent)}%`.

**Files:** `apps/web/src/app/game/screens/WorldBossTab.tsx`

---

## 2. Fix "undefined/undefined hits"

**Bug:** Round results show `undefined/undefined hits` for all attackers.

**Root cause:** `toBossParticipantData()` in the service layer strips `attacks`, `hits`, `crits` because the shared `BossParticipantData` type doesn't include them. The DB has these columns populated correctly by `resolveBossRound()`.

**Fix:**
- `packages/shared/src/types/worldEvent.types.ts` — add `attacks: number`, `hits: number`, `crits: number` to `BossParticipantData`
- `apps/api/src/services/bossEncounterService.ts` — add fields to `toBossParticipantData()` input signature + return object (lines 59-83)
- `apps/api/src/routes/boss.ts` — add `attacks`, `hits`, `crits` to the `GET /boss/:id/round/:num` response mapping (lines 206-214)

---

## 3. Boss Damage Per Round (roundSummaries JSON)

**Problem:** Boss damage to raid (`poolDamageTaken`, `bossHits`, `bossMisses`) is computed during `resolveBossRound()` but only emitted to zone chat, never persisted. The round results UI only shows player damage, not boss damage.

**Approach:** Add a JSON column on `BossEncounter` to accumulate per-round aggregate data.

**Schema change:** Add `roundSummaries Json? @map("round_summaries")` to `BossEncounter` model in `packages/database/prisma/schema.prisma`

**New shared type** in `worldEvent.types.ts`:
```ts
export interface BossRoundSummary {
  round: number;
  bossDamage: number;
  bossHits: number;
  bossMisses: number;
  totalPlayerDamage: number;
  bossHpPercent: number;
  raidPoolPercent: number;
}
```

**Service changes** in `bossEncounterService.ts`:
- After round resolution (~line 348), read existing `roundSummaries` from encounter, append new entry, include in the encounter update
- On wipe reset (~line 430), preserve existing summaries (don't clear them)
- Add `roundSummaries` to `toBossEncounterData` mapper

**API changes:** `roundSummaries` flows through existing `GET /boss/:id` response automatically via the spread.

**Frontend types** in `api.ts`: Add `roundSummaries?: BossRoundSummary[]` to `BossEncounterResponse`.

**UI changes** in `WorldBossTab.tsx`:
- Group resolved participants by round number
- Show round header with boss damage: "Boss dealt X dmg (Y hits, Z misses)" from matching `roundSummaries` entry
- Player results listed under each round header

---

## 4. Timing Changes

Currently `BOSS_ROUND_INTERVAL_MINUTES = 1` is used for both initial wait and between rounds. Split into two constants.

**Constants** in `gameConstants.ts`:
- Add `BOSS_INITIAL_WAIT_MINUTES: 15` — time after boss discovery before first round resolves
- Change `BOSS_ROUND_INTERVAL_MINUTES: 1` → `5` — time between subsequent rounds

**Service changes:**
- `createBossEncounter()` (line 85-108) — use `BOSS_INITIAL_WAIT_MINUTES` for initial `nextRoundAt`
- `resolveBossRound()` — continues using `BOSS_ROUND_INTERVAL_MINUTES` for subsequent rounds (already does, no change needed)

---

## 5. Defeated Boss Lingers with Fight Summary

Keep defeated bosses visible for one more round interval after death, showing a fight summary.

**Service changes** in `bossEncounterService.ts`:
- When boss is defeated (~line 317-318), set `nextRoundAt = now + BOSS_ROUND_INTERVAL_MINUTES` instead of `null`. Reuses `nextRoundAt` as "visible until" timestamp.

**Query changes** in `getActiveBossEncounters()` (~line 535):
- Change filter from `status: { in: ['waiting', 'in_progress'] }` to also include `OR (status = 'defeated' AND nextRoundAt > now)`

**Frontend** in `WorldBossTab.tsx`:
- When encounter is defeated, show a fight summary panel:
  - Total rounds taken
  - Total damage dealt (sum all participant damage across all rounds)
  - Top 5 contributors (aggregate damage by player, sorted desc)
  - Kill credit from `encounter.killedBy` (need to return killer username — enrich in route)
- The existing "Defeated" banner + signup-hidden logic already works (`isOver` check at line 88)

**Route enrichment** in `boss.ts`:
- For `GET /boss/active` and `GET /boss/:id`, include `killedByUsername` by looking up the `killedBy` player

---

## 6. Auto Sign-Up

Players can opt in to automatically re-sign for subsequent rounds using their last role. Turn commitment is always `BOSS_SIGNUP_TURN_COST` (200). Players can still manually change their role between rounds.

**Schema change:** Add `autoSignUp Boolean @default(false) @map("auto_sign_up")` to `BossParticipant` in `schema.prisma`

**API changes:**
- `POST /boss/:id/signup` — accept optional `autoSignUp: boolean` in request body, store on participant
- If player is already signed up for the round, **update** their role + autoSignUp instead of returning 409 error
- `signUpForBossRound()` in service — accept `autoSignUp` param, store it. When existing signup found, update instead of throwing.

**Auto-signup during round resolution** in `resolveBossRound()`:
- After resolving a round (after all participant updates, wipe handling, etc.), query participants from the just-resolved round who have `autoSignUp = true`
- For each, attempt to create a new participant for the next round:
  - Same role as last round
  - Deduct `BOSS_SIGNUP_TURN_COST` turns (skip silently if insufficient turns)
  - Copy `autoSignUp = true` to the new entry
  - Batch fetch `getHpState` for auto-signup players (need their current maxHp)
  - Skip players who are recovering (knocked out from wipe)
  - Skip if encounter is now defeated

**Frontend** in `WorldBossTab.tsx`:
- Add an "Auto sign-up" toggle (checkbox/switch) next to the signup button
- When toggling on, call signup with `autoSignUp: true`
- Show auto-signup indicator in the "Signed up for next round" list
- Role buttons remain editable — hitting signup again with a new role updates the existing entry

**Types:**
- `api.ts`: Add `autoSignUp?: boolean` to `BossParticipantResponse`
- `worldEvent.types.ts`: Add `autoSignUp: boolean` to `BossParticipantData`

---

## 7. Boss History Sub-Tab

Add a PvE/Boss toggle within the existing history view in CombatScreen.

**Backend** — new endpoint `GET /api/v1/boss/history` in `boss.ts`:
- Fetch all `BossParticipant` rows for authenticated player
- Group by encounter, aggregate: total damage, total healing, rounds participated
- Enrich with encounter data (mob name, zone, status, roundSummaries), killer username
- Sort by most recent participation
- Paginate (page, pageSize query params)

**Frontend types** in `api.ts`:
- `BossHistoryEntry` interface: encounter info + player's aggregate stats + encounter outcome
- `getBossHistory()` API function

**New component** `apps/web/src/components/screens/BossHistory.tsx`:
- List of boss encounters the player participated in
- Each row: boss name, zone, status badge (defeated/expired/in-progress), rounds participated, total damage/healing
- Expandable detail: per-round breakdown with round summaries (boss damage, player hit stats)
- Reuse the round-grouped display pattern from WorldBossTab

**Integration** in `CombatScreen.tsx`:
- When `activeView === 'history'`, add a PvE/Boss toggle at the top
- Default to PvE (existing CombatHistory component)
- Boss toggle renders BossHistory component

---

## Migration

Single Prisma migration covering both schema changes:
- `BossEncounter.roundSummaries` (Json?, nullable)
- `BossParticipant.autoSignUp` (Boolean, default false)

---

## Files Changed (summary)

| File | Changes |
|------|---------|
| `packages/shared/src/types/worldEvent.types.ts` | Add fields to `BossParticipantData`, add `BossRoundSummary` type, add `roundSummaries`/`autoSignUp` |
| `packages/shared/src/constants/gameConstants.ts` | Add `BOSS_INITIAL_WAIT_MINUTES: 15`, change `BOSS_ROUND_INTERVAL_MINUTES` to `5` |
| `packages/database/prisma/schema.prisma` | Add `roundSummaries Json?`, `autoSignUp Boolean` |
| `apps/api/src/services/bossEncounterService.ts` | Fix mapper, persist round summaries, auto-signup logic, timing split, defeated linger |
| `apps/api/src/routes/boss.ts` | Fix round endpoint fields, enrich killer username, add history endpoint, update signup to handle updates |
| `apps/web/src/lib/api.ts` | Update response types, add boss history API function |
| `apps/web/src/app/game/screens/WorldBossTab.tsx` | Percentage HP bars, round grouping with boss damage, auto-signup toggle, defeated fight summary |
| `apps/web/src/components/screens/BossHistory.tsx` | New component for boss encounter history |
| `apps/web/src/components/screens/CombatScreen.tsx` | PvE/Boss toggle in history view |

---

## Verification
1. `npm run db:migrate` — run new migration
2. `npm run build:packages` — build shared + game-engine + database
3. `npm run typecheck` — verify no TS errors
4. `npm run test:engine && npm run test:api` — run existing tests
5. Manual test: discover boss, verify 15min initial wait, sign up with auto-signup, watch rounds resolve at 5min intervals, verify:
   - HP bars show percentages only (not absolute values)
   - Round results show hits/crits correctly (no more undefined)
   - Boss damage to raid shown per round in round results
   - Auto-signup works across rounds, role changeable
   - Defeated boss lingers with fight summary for one interval
   - Boss history appears in history tab via PvE/Boss toggle
