# Expedition Codex Review Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 issues found by Codex code review of the expedition themed encounters implementation.

**Architecture:** The raid round resolver (`raidRoundResolver.ts`) needs effect propagation — mob actions that have effects must write those effects into player/mob state, and combat calculations must use effect-modified stats.

**Tech Stack:** TypeScript, Vitest

**Worktree:** D:/Code/Adventure/.worktrees/pocketrealm-guild-expeditions
**Branch:** guild-expeditions

---

## Context: What's Already Done

The themed encounters system is implemented across 14 tasks:
- 22 new boss actions, 4 Tier 1 themes, 32 mob templates
- Room generator, service, UI all wired up
- 5 new mechanics: stacking DoT, root/fear, mark+execute, summon adds, rally
- 595 game-engine tests passing

But Codex review found the mechanics are cosmetic because the resolver doesn't propagate effects or use modified stats.

## Issue 1+3 (Critical): Effect Propagation and Stat Modification

### Problem
When a mob uses an action with `mActionDef.effect` (e.g. `boss_mark_for_death`, `boss_wither`, `boss_root`), that effect is NEVER written into the target's `activeEffects`. The resolver rebuilds `participantEffectsAfter` from `input.participants[i].activeEffects` (the previous round's state), so new effects from this round are lost.

Additionally, even if effects were stored, combat resolution reads raw base stats (`input.participants[i].stats.defence`), not effect-modified stats. So stat buffs/debuffs (wither -8 defence, rally +8 attack) have no mechanical impact.

### Files
- `packages/game-engine/src/combat/raidRoundResolver.ts` — mob offensive phase (~line 460) and effect tick (~line 622)
- `packages/game-engine/src/combat/combatHelpers.ts` — action resolution may discard effects

### Fix

**Part A: Apply mob effects to players**

In the mob offensive phase (Step 6), after a mob action resolves, if `mActionDef.effect` exists:
- For single_target actions: push the effect onto a `newPlayerEffects[targetIdx]` accumulator
- For AoE actions: push the effect onto all alive player accumulators
- Format as `BossActiveEffect`: `{ name, stat, modifier, roundsRemaining: duration, damagePerRound?, dotDamageType? }`

In the effect tick section (Step 9), merge `newPlayerEffects[idx]` into the player's effects BEFORE ticking durations. This ensures new effects survive to next round.

**Part B: Apply mob effects to mobs (rally, frenzy, bark_shield)**

This is already partially done for rally (it pushes effects onto mob activeEffects). Verify frenzy and bark_shield also write to mob activeEffects.

**Part C: Use effect-modified stats in damage calculations**

When calculating mob damage against a player:
- Sum all active effects on the target that modify `defence` or `magicDefence`
- Apply the modifier sum to the raw stat before damage calculation
- Same for accuracy/evasion modifiers

When calculating player damage against a mob:
- Sum all active effects on the mob that modify `defence` or `attack`
- Apply the modifier sum

Create a helper function:
```typescript
function getEffectiveStatValue(baseStat: number, effects: BossActiveEffect[], statName: string): number {
  const modifier = effects
    .filter(e => e.stat === statName && e.roundsRemaining > 0)
    .reduce((sum, e) => sum + e.modifier, 0);
  return Math.max(0, baseStat + modifier);
}
```

### Tests
- Test that `boss_wither` (AoE -8 defence) actually reduces defence in next mob attack damage
- Test that `boss_mark_for_death` is applied by mob and persists to next round
- Test that `boss_rally` +8 attack modifier increases mob damage
- Test that `boss_root` effect is applied by mob action and forces defend next round
- Test that `boss_poison_spray` applies DoT effect that ticks next round

---

## Issue 2 (Critical): Summon Adds Bugs

### Problem
4 separate bugs:
1. Spawned mobs are appended to `mobState` during the `for (const mob of mobState)` loop, so they act immediately in the same round
2. The summon pool is never consumed — same mobs can be summoned infinitely
3. Spawned mobs aren't persisted to the DB, so they disappear between rounds
4. `mobsKilledThisRound` can go negative (counts original mobs vs final mobs, but final includes summons)

### Files
- `packages/game-engine/src/combat/raidRoundResolver.ts` ~line 416 (summon logic)
- `apps/api/src/services/expeditionService.ts` ~line 776 (mob persistence)

### Fix

**Bug 1:** Collect spawned mobs in a separate `spawnedThisRound` array. After the mob loop finishes, push them into `mobState`. This prevents them acting this round.

**Bug 2:** After spawning, remove the used entries from a mutable copy of `summonPool`, or track spawned count. Since summon pool is small (2 mobs), limiting total summons per fight (e.g. max 6-8 adds across the entire boss fight) is reasonable.

**Bug 3:** In `expeditionService.ts`, when persisting round results, include spawned mobs in the room definition's mob list. The `roomDefinitions` JSON needs to be updated with new mobs after each round. OR: track spawned mobs separately in a `spawnedMobs` JSON field.

**Bug 4:** Calculate kills as: `originalMobCount - aliveMobCountExcludingSummons` or simply `deadMobs.length` from mobs that were alive at start of round.

### Tests
- Test spawned mobs don't act in the round they were summoned
- Test summon pool is consumed (finite summons)
- Test kill count doesn't go negative when mobs are summoned

---

## Issue 4 (High): Empty mobTemplateId

### Problem
`buildMobFromTheme()` sets `mobTemplateId: ''`. The seed data has real UUIDs for expedition mobs, but the theme definitions use `key` strings that don't map to UUIDs.

### Fix

Option A: At expedition launch time, query the DB for expedition mob templates and build a `key → UUID` mapping. Pass this mapping to the room generator.

Option B: Store UUIDs in the theme definitions directly (hardcoded from seed data). This breaks if seed IDs change.

Option C: Use the `isExpeditionMob` flag + mob name to look up templates at loot time.

**Recommended: Option A** — query once at launch, pass the map to `generateExpeditionRooms`, and use it in `buildMobFromTheme`.

### Files
- `packages/game-engine/src/expedition/roomGenerator.ts` — buildMobFromTheme needs templateId
- `apps/api/src/services/expeditionService.ts` — query mob templates at launch

---

## Issue 5 (Medium): Rest Doesn't Clear Stacking DoTs

### Problem
`expeditionService.ts` ~line 877 resets KO/threat/resources between rooms but doesn't clear `activeEffects`. Design says stacking DoTs (duration 999) clear between rooms.

### Fix
In the rest/room-transition logic, reset `activeEffects` to `[]` for all members:
```typescript
activeEffects: [],
```

### Test
- Verify effects are cleared between rooms

---

## Issue 6 (Medium): Tier 2/3 UI Regression

### Problem
`EXPEDITION_THEMES` only has Tier 1 themes. `launchExpedition` throws if no themes match the tier. But the UI still shows Tier 2 and 3 options.

### Fix
In `GuildExpeditionsTab.tsx`, filter `TIER_CONFIGS` to only show tiers that have at least one theme. Import `EXPEDITION_THEMES` on the frontend and filter:
```typescript
const availableTiers = TIER_CONFIGS.filter(cfg =>
  EXPEDITION_THEMES.some(t => t.tier === cfg.tier)
);
```

Or simpler: just show all tiers but disable the launch button for tiers without themes, with a "Coming Soon" label.

---

## Execution Order

1. **Issue 1+3 first** (effect propagation + stat modification) — this is the foundation everything else depends on
2. **Issue 2** (summon adds bugs) — independent but important
3. **Issue 4** (mobTemplateId) — needed for loot
4. **Issue 5** (rest clears effects) — simple
5. **Issue 6** (tier UI) — simple
