# Early Game Starting Grants

## Goal

Make the first hour of gameplay feel like real character-building by granting new players immediate access to active abilities and attribute choices. Currently, players start with zero skill points and zero attribute points, meaning combat is nothing but auto-attacking (light attack) until they grind enough levels to unlock anything interesting. These changes give players a build identity from their first fight.

## Changes

### 1. Starting Skill Points

Grant **5 skill points** at character creation. This is enough to purchase one active combat ability (e.g., Fireball, Aimed Shot, Power Strike) from the skill point tree immediately.

**Current state:** Skill points are derived, not stored. `getTotalPointsEarned()` in `apps/api/src/services/skillPointService.ts` computes total points as `sum of (level - 1) * POINTS_PER_LEVEL` across all skills. A brand new player has 0 skill points and can only use `light_attack` until they level a combat skill.

**Change:** Add `STARTING_SKILL_POINTS: 5` to `CHARACTER_CONSTANTS`. The starting bonus must be added in **two places** in `skillPointService.ts`:

1. `getTotalPointsEarned()` (line ~22) — used by `getSkillPoints()` for display: add `+ CHARACTER_CONSTANTS.STARTING_SKILL_POINTS` to the return value.
2. The inline derivation inside `allocatePoints()` (line ~74) — used inside a Prisma transaction for spend validation: add the same `+ CHARACTER_CONSTANTS.STARTING_SKILL_POINTS` after the reduce. Both must agree or players will see available points they can't spend.

Alternatively, extract a pure `computePointsFromLevels(skills: { level: number }[]): number` helper that both call, which adds the starting bonus in one place. This is the recommended approach to avoid future divergence.

No schema change needed — the bonus is a constant added to the derived total.

**Effect:** Players enter the tutorial with a real combat ability equipped in their template. The tutorial combat step (now step 4 — encounter site fight) is their first chance to use it, making that fight immediately more engaging than "spam light attack."

### 2. Starting Attribute Points

Grant **5 attribute points** at character creation. Players can allocate these across the 6 attributes: vitality, strength, dexterity, intelligence, luck, evasion.

**Current state:** Attribute points are earned at 1 per character level-up (`xpService.ts` line 119-120). A new player has 0 attribute points and 0 in all attributes. First attribute point comes at character level 2.

**Change:** In `apps/api/src/routes/auth.ts`, add `attributePoints: CHARACTER_CONSTANTS.STARTING_ATTRIBUTE_POINTS` to the `tx.player.create({ data: { ... } })` call. Currently this field is not set during creation (defaults to 0 from schema).

**Effect:** Players make their first build decision before they even fight. A melee player dumps Strength, a mage goes Intelligence, a tank goes Vitality — the game has differentiation from minute one.

### 3. Wayfinder Buckler Accuracy Nerf

Reduce the starter off-hand's accuracy bonus from **+12 to +7**.

**Current state:** The Wayfinder Buckler (`starter_wayfinder_buckler` in `packages/database/prisma/seed-data/items.ts`) grants `{ accuracy: 12, health: 4 }`. This gives new players a comfortable accuracy buffer with no investment.

**Change:** Update `baseStats.accuracy` from `12` to `7` in the item template seed data.

**Rationale:** Each point in a combat attribute (Strength, Dexterity, or Intelligence) grants +1 accuracy for its combat style (`CHARACTER_CONSTANTS.ACCURACY_PER_STRENGTH/DEXTERITY/INTELLIGENCE`). A player who puts all 5 attribute points into their primary combat stat recovers the full +12 accuracy. A player who spreads points across non-accuracy attributes accepts lower hit rates but gains other benefits (more HP from Vitality, better crits from Luck, etc.). This turns the attribute point grant into a real tradeoff rather than free stats on top of an already-generous buckler.

### 4. Starter Weapon Choice (Kessa Ironweld)

New players receive a starter main-hand weapon before leaving Millbrook. **Kessa Ironweld** (the blacksmith NPC) presents a popup with 3 weapon options. The player picks one, it's created and auto-equipped.

**Lore framing:** Kessa intercepts you as you're about to leave town for the first time. Flavor text in her voice — direct, impatient, caring-under-gruffness. Example: *"Heading past the gate bare-handed? Not on my watch. Pick one — and try not to break it before you're out of earshot."*

**Weapon options:**

| Weapon | ID | Skill | Base Stats | Durability | Sell Price |
|--------|----|-------|------------|------------|------------|
| Kessa's Training Sword | `starter_training_sword` | melee | `{ attack: 4 }` | 70 | 0 |
| Kessa's Training Bow | `starter_training_bow` | ranged | `{ rangedPower: 3 }` | 70 | 0 |
| Kessa's Training Staff | `starter_training_staff` | magic | `{ magicPower: 5 }` | 70 | 0 |

Stats match existing tier 1 weapons (Wooden Sword, Oak Shortbow, Oak Staff) but with `sellPrice: 0` (soulbound, like the Wayfinder Buckler). All tier 1, requiredLevel 1, `slot: 'main_hand'`.

**Implementation:**

1. Add 3 starter weapon templates to seed data (`packages/database/prisma/seed-data/items.ts`), following the `weapon()` helper pattern used by existing weapons.
2. Add the 3 template IDs to `STARTER_LOADOUT` in `gameConstants.ts`:
   ```typescript
   export const STARTER_LOADOUT = {
     tutorialOffHandTemplateId: 'starter_wayfinder_buckler',
     starterWeaponIds: {
       melee: 'starter_training_sword',
       ranged: 'starter_training_bow',
       magic: 'starter_training_staff',
     },
   } as const;
   ```
3. New API endpoint `POST /api/v1/player/starter-weapon` — accepts `{ weaponType: 'melee' | 'ranged' | 'magic' }`, validates player hasn't already claimed one, creates the item, equips it to `main_hand`. Callable once per player.
4. Frontend popup: gold-outline modal (reusing existing popup component) showing the 3 weapons with name, stats, and Kessa's flavor text. Player taps one, frontend calls the endpoint, weapon is equipped, tutorial advances.

**Why not grant at registration like the buckler?** The weapon is a *choice* — the player must see the options and pick. Registration happens before the game UI loads. The popup must render in-game during the tutorial.

### 5. Tutorial Flow Update

The existing 9-step tutorial gains 3 new steps: starter weapon choice, skill points, and attribute points. The equip step is repurposed to equip the weapon Kessa just gave you (instead of crafted gear). The original equip-crafted-gear moment happens naturally after the craft step without a dedicated tutorial step.

**Current tutorial order:**
0. Welcome (turn economy)
1. Exploration (spend turns)
2. Combat (encounter site fight)
3. Gathering
4. Travel
5. Refining
6. Crafting
7. Equipment
8. Done

**Proposed tutorial order:**
0. Welcome (turn economy)
1. **Starter Weapon** — Kessa's popup, pick sword/bow/staff
2. **Equip** — "Equip the weapon Kessa gave you" (repurposed from old step 7)
3. **Skill Points** — "Open your talents and unlock a combat ability." Advances when player has spent ≥1 skill point.
4. **Attribute Points** — "Allocate your attribute points to shape your build." Advances when player has allocated ≥1 attribute point.
5. Exploration (spend turns)
6. Combat (encounter site fight — now with weapon + ability + stats)
7. Gathering
8. Travel
9. Refining
10. Craft
11. Done

**New constant values:**

| Constant | Old Value | New Value |
|----------|-----------|-----------|
| `TUTORIAL_STEP_WELCOME` | 0 | 0 |
| `TUTORIAL_STEP_STARTER_WEAPON` | — | 1 (new) |
| `TUTORIAL_STEP_EQUIP` | 7 | 2 (moved) |
| `TUTORIAL_STEP_SKILL_POINTS` | — | 3 (new) |
| `TUTORIAL_STEP_ATTRIBUTE_POINTS` | — | 4 (new) |
| `TUTORIAL_STEP_EXPLORE` | 1 | 5 |
| `TUTORIAL_STEP_COMBAT` | 2 | 6 |
| `TUTORIAL_STEP_GATHER` | 3 | 7 |
| `TUTORIAL_STEP_TRAVEL` | 4 | 8 |
| `TUTORIAL_STEP_REFINE` | 5 | 9 |
| `TUTORIAL_STEP_CRAFT` | 6 | 10 |
| `TUTORIAL_STEP_DONE` | 8 | 11 |
| `TUTORIAL_COMPLETED` | 9 | 12 |
| `TUTORIAL_SKIPPED` | -1 | -1 (unchanged) |

**Tutorial constants live in `packages/shared`** so both web and API can import them. (Already implemented — `packages/shared/src/constants/tutorialConstants.ts` with re-export from `apps/web/src/lib/tutorial.ts`.)

**Tutorial advancement triggers (new):**

| Step | Trigger | Detection |
|------|---------|-----------|
| Starter Weapon | Player calls `POST /player/starter-weapon` | Endpoint response triggers frontend to advance |
| Equip | Player equips the starter weapon to `main_hand` | Frontend detects equipment change, advances |
| Skill Points | Player has spent ≥1 skill point | Frontend polls or reacts to `getSkillPoints()` result where `totalPointsSpent > 0`, advances |
| Attribute Points | Player has allocated ≥1 attribute point | Frontend polls or reacts to attribute state where any attribute > 0, advances |

All other steps use existing advancement patterns (manual "next" or action detection).

**Note:** The tutorial *teaches* spending these points but the grants themselves come from character creation. If a player skips the tutorial (step -1), they still have 5 skill points, 5 attribute points, and can claim a starter weapon whenever they want.

## Constants Changes

### Modified (already implemented)

| Constant | Location | Old | New |
|----------|----------|-----|-----|
| Wayfinder Buckler `baseStats.accuracy` | `packages/database/prisma/seed-data/items.ts` | 12 | 7 |

### New (already implemented)

```typescript
CHARACTER_CONSTANTS: {
  ...existing,
  STARTING_SKILL_POINTS: 5,
  STARTING_ATTRIBUTE_POINTS: 5,
}
```

### New (pending — starter weapon + tutorial reorder)

```typescript
STARTER_LOADOUT: {
  tutorialOffHandTemplateId: 'starter_wayfinder_buckler',
  starterWeaponIds: {
    melee: 'starter_training_sword',
    ranged: 'starter_training_bow',
    magic: 'starter_training_staff',
  },
}
```

Tutorial constants in `packages/shared/src/constants/tutorialConstants.ts` need updating to the new step numbering (see section 5).

## Schema Changes

None. The `Player` model already has `attributePoints` (Int). Skill points are derived (not stored), and the starting bonus is added as a constant in the calculation. No migration needed. Starter weapon is a regular `Item` created via existing `item.create()` — no schema changes.

Existing players are not a concern (no real players yet).

## Touch Points

### Already implemented (PR #215)

| File | Change |
|------|--------|
| `packages/shared/src/constants/gameConstants.ts` | Added `STARTING_SKILL_POINTS`, `STARTING_ATTRIBUTE_POINTS` to `CHARACTER_CONSTANTS` |
| `apps/api/src/services/skillPointService.ts` | Extracted `computeTotalSkillPoints()` helper; starting bonus in both derivation sites |
| `apps/api/src/routes/auth.ts` | Added `attributePoints: CHARACTER_CONSTANTS.STARTING_ATTRIBUTE_POINTS` to `tx.player.create()` |
| `packages/database/prisma/seed-data/items.ts` | Buckler accuracy 12 → 7 |
| `packages/shared/src/constants/tutorialConstants.ts` | Tutorial step constants (moved from web to shared) |
| `apps/web/src/lib/tutorial.ts` | Import step constants from shared; added skill point + attribute point step configs |
| `apps/api/src/routes/exploration/start.ts` | Uses `TUTORIAL_STEP_EXPLORE` constant |
| `apps/api/src/routes/player.ts` | Uses `TUTORIAL_COMPLETED`, `TUTORIAL_SKIPPED` constants; updated Zod schema |
| Test files | Updated with shared constants and new numbering |

### Pending (starter weapon + tutorial reorder)

| File | Change |
|------|--------|
| `packages/shared/src/constants/gameConstants.ts` | Add `starterWeaponIds` to `STARTER_LOADOUT` |
| `packages/database/prisma/seed-data/items.ts` | Add 3 starter weapon templates |
| `packages/shared/src/constants/tutorialConstants.ts` | Reorder steps: add `TUTORIAL_STEP_STARTER_WEAPON`, move `TUTORIAL_STEP_EQUIP`, renumber all |
| `apps/api/src/routes/player.ts` | New `POST /player/starter-weapon` endpoint |
| `apps/web/src/lib/tutorial.ts` | Update step definitions, add starter weapon + equip steps, reorder |
| `apps/web/src/components/` | Starter weapon choice popup component (gold-outline modal) |
| `apps/web/src/app/game/` | Tutorial advancement triggers for skill points and attribute points steps |
| `apps/api/src/routes/exploration/start.ts` | Update `TUTORIAL_STEP_EXPLORE` value (now 5) |
| Test files | Update step numbers again |

## Related Work

- **Encounter site rework** ([spec](./2026-03-14-encounter-site-rework-design.md)) — ships separately, makes early combat more interesting alongside these grants
- **Early XP curve flattening** ([#213](https://github.com/Clar17y/Adventure/issues/213)) — future change, should ship after encounter site rework and elite mobs
- **Tracking system** ([#212](https://github.com/Clar17y/Adventure/issues/212)) — future turn lever, separate design
- **Elite/mini-boss mobs** — future brainstorm, adds challenging exploration interrupts
