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

### 4. Tutorial Flow Update

The existing 9-step tutorial needs two new steps to teach spending skill points and attribute points. These should come early — before the first combat encounter.

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
1. **Skill Points** — "You have 5 skill points! Open your abilities and unlock a combat skill."
2. **Attribute Points** — "You have 5 attribute points! Allocate them to shape your build."
3. Exploration (spend turns)
4. Combat (encounter site fight — now with a real ability equipped)
5. Gathering
6. Travel
7. Refining
8. Crafting
9. Equipment
10. Done

**New constant values:**

| Constant | Old Value | New Value |
|----------|-----------|-----------|
| `TUTORIAL_STEP_WELCOME` | 0 | 0 |
| `TUTORIAL_STEP_SKILL_POINTS` | — | 1 (new) |
| `TUTORIAL_STEP_ATTRIBUTE_POINTS` | — | 2 (new) |
| `TUTORIAL_STEP_EXPLORE` | 1 | 3 |
| `TUTORIAL_STEP_COMBAT` | 2 | 4 |
| `TUTORIAL_STEP_GATHER` | 3 | 5 |
| `TUTORIAL_STEP_TRAVEL` | 4 | 6 |
| `TUTORIAL_STEP_REFINE` | 5 | 7 |
| `TUTORIAL_STEP_CRAFT` | 6 | 8 |
| `TUTORIAL_STEP_EQUIP` | 7 | 9 |
| `TUTORIAL_STEP_DONE` | 8 | 10 |
| `TUTORIAL_COMPLETED` | 9 | 11 |
| `TUTORIAL_SKIPPED` | -1 | -1 (unchanged) |

The skill/attribute steps are inserted before exploration so the player has a build before their first fight.

**Tutorial constants must move to `packages/shared`** so both web and API can import them. Currently the constants live in `apps/web/src/lib/tutorial.ts` but the API uses hardcoded magic numbers (e.g., `tutorialStep === 1` in `exploration/start.ts` line ~191, `tutorialStep >= 9` in `player.ts` line ~221). Moving the constants to shared and importing them in both packages eliminates magic numbers and prevents renumbering bugs.

After the move:
- `exploration/start.ts` replaces `=== 1` with `=== TUTORIAL_STEP_EXPLORE` (now value 3)
- `player.ts` replaces `>= 9` with `>= TUTORIAL_COMPLETED` (now value 11)
- Any other API files using tutorial step magic numbers import from shared

**Note:** The tutorial *teaches* spending these points but the grants themselves come from character creation. If a player skips the tutorial (step -1), they still have 5 skill points and 5 attribute points to spend whenever they want.

## Constants Changes

### Modified

| Constant | Location | Old | New |
|----------|----------|-----|-----|
| Wayfinder Buckler `baseStats.accuracy` | `packages/database/prisma/seed-data/items.ts` | 12 | 7 |

### New

```typescript
CHARACTER_CONSTANTS: {
  ...existing,
  STARTING_SKILL_POINTS: 5,
  STARTING_ATTRIBUTE_POINTS: 5,
}
```

## Schema Changes

None. The `Player` model already has `attributePoints` (Int). Skill points are derived (not stored), and the starting bonus is added as a constant in the calculation. No migration needed.

Existing players are not a concern (no real players yet). Note: the `STARTING_SKILL_POINTS` bonus applies to all players via the derived calculation, but since there are no real players this is fine.

## Touch Points

| File | Change |
|------|--------|
| `packages/shared/src/constants/gameConstants.ts` | Add `STARTING_SKILL_POINTS`, `STARTING_ATTRIBUTE_POINTS` to `CHARACTER_CONSTANTS` |
| `apps/api/src/services/skillPointService.ts` | Extract shared `computePointsFromLevels()` helper; add starting bonus in both `getTotalPointsEarned()` and `allocatePoints()` inline derivation |
| `apps/api/src/routes/auth.ts` | Add `attributePoints: CHARACTER_CONSTANTS.STARTING_ATTRIBUTE_POINTS` to `tx.player.create()` data |
| `packages/database/prisma/seed-data/items.ts` | Buckler accuracy 12 → 7 |
| `packages/shared/src/constants/tutorialConstants.ts` | New file: tutorial step constants (moved from web, extended with new steps) |
| `apps/web/src/lib/tutorial.ts` | Import step constants from shared; add skill point + attribute point step configs |
| `apps/api/src/routes/exploration/start.ts` | Import from shared; replace `=== 1` with `=== TUTORIAL_STEP_EXPLORE` |
| `apps/api/src/routes/player.ts` | Import from shared; replace `>= 9` with `>= TUTORIAL_COMPLETED` |
| `apps/api/src/routes/exploration/start.tutorial.test.ts` | Import from shared; update step numbers |
| `apps/api/src/routes/player.tutorial.test.ts` | Import from shared; update step numbers |
| `apps/api/src/services/skillPointService.test.ts` | Update tests for new starting bonus (fresh players now have 5 points) |

## Related Work

- **Encounter site rework** ([spec](./2026-03-14-encounter-site-rework-design.md)) — ships separately, makes early combat more interesting alongside these grants
- **Early XP curve flattening** ([#213](https://github.com/Clar17y/Adventure/issues/213)) — future change, should ship after encounter site rework and elite mobs
- **Tracking system** ([#212](https://github.com/Clar17y/Adventure/issues/212)) — future turn lever, separate design
- **Elite/mini-boss mobs** — future brainstorm, adds challenging exploration interrupts
