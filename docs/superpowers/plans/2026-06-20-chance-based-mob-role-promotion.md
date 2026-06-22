# Chance-Based Mob Role Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chance-based elite role rolls to normal exploration ambushes and encounter-site mob slots while preserving encounter-site final-room pressure guarantees.

**Architecture:** Add pure role-roll helpers in `packages/game-engine` backed by tunable shared constants. Encounter-site generation uses chance rolls plus guarantee enforcement. Normal exploration ambushes roll `elite` only, then reuse the existing API role modifier service for stats/XP and shared display-name formatting.

**Tech Stack:** TypeScript, Vitest, Next.js/Express monorepo packages.

---

## Files

- Modify `packages/shared/src/constants/gameConstants.ts` to add elite chance constants.
- Modify `packages/game-engine/src/exploration/encounterRolePromotion.ts` to add normal exploration role rolling and chance-based encounter-site elite assignment.
- Modify `packages/game-engine/src/exploration/encounterRolePromotion.test.ts` for role roll and placement behavior.
- Modify `apps/api/src/services/exploration/helpers.test.ts` for persisted encounter-site role placement.
- Modify `apps/api/src/services/zoneRoutesService.ts` to apply normal exploration elite roles.
- Modify `apps/api/src/services/zoneRoutesService.travelPerformance.test.ts` for ambush role scaling/display metadata.
- Modify `docs/superpowers/plans/2026-06-19-encounter-site-role-promotion.md` only if acceptance notes need to mention chance rolls.

---

## Task 1: Add Shared Chance Constants and Pure Role Rolls

- [ ] Add `NORMAL_EXPLORATION_ELITE_CHANCE: 0.05` and `ENCOUNTER_SITE_ELITE_CHANCE: 0.10` to `ENCOUNTER_SITE_ROLE_CONSTANTS`.
- [ ] Add `rollNormalExplorationMobRole(options?: { rng?: () => number; eliteChance?: number }): EncounterMobRole` to `encounterRolePromotion.ts`.
- [ ] Update `AssignEncounterRolesOptions` with `eliteChance?: number`.
- [ ] In `assignEncounterRolesToRooms`, roll every slot for elite using `eliteChance` before mini-boss/guarantee logic.
- [ ] Ensure `mini_boss` remains final-room only.
- [ ] Ensure exactly-one-elite 3+ room sites move that elite to the final room.
- [ ] Preserve a second elite for 4-room sites.
- [ ] Add tests:
  - normal exploration returns `trash` when roll misses.
  - normal exploration returns `elite` when roll hits.
  - normal exploration never returns `mini_boss`.
  - encounter-site chance rolls can produce an earlier elite when another elite remains in the final room.
  - if the only elite was rolled early, it moves to the final room.
- [ ] Run `rtk npm run test -w packages/game-engine -- encounterRolePromotion`.
- [ ] Commit as `Add chance-based encounter role rolls`.

## Task 2: Apply Elite Rolls to Normal Exploration Ambushes

- [ ] Import `rollNormalExplorationMobRole` from `@pocketrealm/game-engine`.
- [ ] Import `formatEncounterMobDisplayName` from `@pocketrealm/shared`.
- [ ] Import `applyEncounterRoleModifiers` from `./encounterSiteMobRoleService`.
- [ ] In `zoneRoutesService.ts`, after `applyMobPrefix`, roll `role`.
- [ ] Apply `applyEncounterRoleModifiers(prefixedMob, role)` before `mobToTemplateCombatant`.
- [ ] Build `mobDisplayName` with `formatEncounterMobDisplayName({ name: roleModifiedMob.name, prefix: roleModifiedMob.mobPrefix, role })`.
- [ ] Use the role-modified mob for combat rewards, flee level, combat logs, and event details.
- [ ] Add role metadata to activity log/details where local types allow it: `mobRole: role`.
- [ ] Update travel performance test mocks and add an assertion that a forced elite ambush increases mob max HP and display name includes `Elite`.
- [ ] Run `rtk npm run test -w apps/api -- zoneRoutesService.travelPerformance`.
- [ ] Commit as `Apply elite rolls to exploration ambushes`.

## Task 3: Verify Encounter-Site Persistence Uses Chance Rules

- [ ] Update `exploration/helpers.test.ts` to force role assignments through the real helper for a 3+ room site where an early elite roll would otherwise be the only elite.
- [ ] Assert the persisted elite is in the final room when it is the only elite.
- [ ] Assert a multi-elite site may keep an earlier elite when final-room pressure exists.
- [ ] Run `rtk npm run test -w apps/api -- exploration/helpers`.
- [ ] Commit as `Cover chance-based encounter site roles`.

## Task 4: Focused Verification and PR Update

- [ ] Run `rtk git diff --check`.
- [ ] Run `rtk npm run test -w packages/game-engine -- encounterRolePromotion`.
- [ ] Run `rtk npm run test -w apps/api -- zoneRoutesService.travelPerformance exploration/helpers encounterSiteCombatCore encounterSiteMobRoleService`.
- [ ] Run `rtk npm run test -w apps/web -- combatHelpers CombatScreen useEncounterSites`.
- [ ] Run `rtk npm run typecheck`.
- [ ] Push the branch with `git push`.
