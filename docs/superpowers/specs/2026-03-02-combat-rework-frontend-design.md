# Combat Rework — Frontend Design

5 tasks covering resource bars, template editor, skill tree, combat playback updates, and boss panel rework.

## Task 30: Resource Bars (Dashboard)

**State:** New `staminaState` and `manaState` in `useGameController` (same shape as `HpState`: `current`, `max`, `regenPerSecond`, `lastRegenAt`). Polled alongside HP every 10 seconds.

**API:** New `getResourceState()` in `api/player.ts` returning `{ stamina: ResourceState, mana: ResourceState }`. Client-side real-time interpolation using `lastRegenAt` + `regenPerSecond`.

**Dashboard:** Two new `StatBar` components below HP — Stamina (teal) and Mana (purple). Rest button extends to restore all three resources.

## Task 31: Template Editor (New Screen)

**Routing:** `Templates.tsx` screen, `'templates'` in `Screen` union, under `combat` tab alongside encounters and arena.

**API:** New `api/templates.ts`:
- `getTemplates()` — list all saved
- `getActiveTemplate()` — current active actions
- `createTemplate(name, actions)` — create (max 10)
- `updateTemplate(id, name, actions)` — edit
- `deleteTemplate(id)` — delete
- `setActiveTemplate(id)` — mark active

**Template list view:** Saved templates with active star, name, action count, edit/delete. "+ New Template" at bottom.

**Editor view (inline, replaces list):**
- Ordered action slots: name, icon, category color (green=offensive, blue=supportive, yellow=defensive), stamina/mana cost
- Drag-to-reorder or up/down arrows
- "Add Action" opens picker filtered to unlocked abilities
- Remove button per slot
- Resource preview: estimated drain per cycle vs regen, highlights rounds where rotation breaks (exhaustion → Defend fallback)
- Save/Cancel, editable name field

**Action picker:** Grouped by category. Each shows name, cost, description. Locked actions greyed ("Unlock in Skill Tree"). Equipment-granted actions marked with equipment icon.

## Task 32: Skill Tree (New Screen)

**Routing:** `TalentTree.tsx` screen, `'talentTree'` in `Screen` union, under `combat` tab.

**API:** New `api/skillPoints.ts`:
- `getSkillPointState()` — total earned, spent, available, allocations, unlocked actions
- `allocatePoint(nodeId)` — spend points
- `respec()` — reset all (turn cost)

**State:** New `skillPointState` in `useGameController` with `availablePoints`, `allocations`, `unlockedActions`. Loaded in `loadAll()`. `unlockedActions` drives the template editor's action picker filter.

**Layout:**
- Header: "Skill Points: N available"
- Four tabs: Melee / Ranged / Magic / General
- Nodes grouped by tier (1-5) with tier header showing skill level gate
- Each node row: status icon (unlocked/locked/affordable), name, cost, description, allocate button
- Locked tiers greyed with prerequisite text
- Nodes unlocking a combat action show action name highlighted
- Passive bonus nodes show bonus inline
- Respec button at bottom with turn cost

**Gating (client-side from shared constants):** Tier N requires 2+ nodes in tier N-1 AND skill level >= gate. Node requires all prerequisites unlocked AND enough points.

## Task 33: Combat Playback Updates

No new screens — extending `CombatPlayback.tsx` and `CombatLogEntry.tsx`.

**CombatLogEntry changes:**
- Action name as primary label per round
- Category color coding (green/blue/yellow)
- Interaction results inline: "Countered!", "Warded!", "Defended (35% reduced)"
- On expand: stamina/mana cost, resources after round
- "(Exhausted → Defend)" label on fallback

**CombatPlayback changes:**
- Small stamina/mana bars below each combatant's HP bar during playback (teal + purple), animated as rounds reveal
- Only shown when combat response includes resource data (backwards-compatible)
- Action flash shows action name

**API type extension:** Optional fields on `CombatLogEntryResponse`: `actionId`, `actionName`, `wasExhausted`, `staminaAfter`, `manaAfter`, `staminaCost`, `manaCost`. All optional for old log compatibility.

## Task 34: Boss Encounter Panel Rework

**Remove:** Role picker, raid pool HP bar, `raidPoolPercent` from summaries.

**Signup section:**
- Active template name + action count (e.g., "Melee Rotation (6r)")
- "Change Template" link → Templates screen
- Auto re-signup checkbox, turn cost, sign up button (no `role` in API call)

**Participant display:**
- Per-participant: username, HP/stamina/mana bars (small inline), threat value, damage dealt/healed/absorbed, status
- Shield icon on aggro holder (highest threat alive)
- Template round indicator ("Round 3/6")

**Round summaries:** `playersAlive`/`playersDead` instead of `raidPoolPercent`. Boss action name + target mode per round. Boss effect badges.

**Defeated summary:** Top contributors table with `damageAbsorbed` column. Client-computed contribution score.

**Bestiary integration:** Boss rotation reveal in mob detail modal: numbered action list for revealed rounds, "???" for unrevealed. Progress bar ("5/12 rounds revealed").

**API updates in `api/social.ts`:**
- Remove `role` from `signUpForBoss()`
- Remove `raidPoolHp`/`raidPoolMax` from `BossEncounterResponse`
- Add `bossEffects`, `currentStamina`, `currentMana`, `threat`, `damageAbsorbed`, `templateRound` to `BossParticipantResponse`
- `BossRoundSummary`: `playersAlive`/`playersDead` replaces `raidPoolPercent`
- Add `bossRotation` to bestiary `Monster` type
