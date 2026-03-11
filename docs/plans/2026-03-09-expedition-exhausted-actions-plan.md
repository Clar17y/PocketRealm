# Expedition Exhausted Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Log exhausted expedition members in the existing `Attacks` section with their intended action preserved, and restore a build-safe round-log helper module path for the web app.

**Architecture:** Preserve intended action metadata inside the game-engine action resolver, extend the shared expedition round-log action union with an exhausted entry shape, and update the web round-log helper to render both normal and exhausted entries from the same list. Fix the web build path by introducing a `.ts` round-log module entrypoint that re-exports the JSX renderer used by `GuildExpeditionsTab`.

**Tech Stack:** TypeScript, Vitest, Next.js, shared package types, game-engine raid resolver, React server-side markup tests

---

### Task 1: Capture exhausted actions in the engine round log

**Files:**
- Modify: `packages/shared/src/types/expedition.types.ts`
- Modify: `packages/game-engine/src/combat/actionResolver.ts`
- Modify: `packages/game-engine/src/combat/combatHelpers.ts`
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Write the failing test**

Add a raid-round test where a participant intends an unaffordable action (for example `counter`, `ward`, or another non-free action) and therefore falls back to `Defend`. Assert that:
- `participantResults[0].wasExhausted` is `true`
- `roundLog.phases.playerAttacks` contains an exhausted log entry
- the exhausted log entry preserves the intended action label and the fallback `Defend` label
- the exhausted log entry includes the correct resource-failure reason

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/game-engine -- src/combat/raidRoundResolver.test.ts`
Expected: FAIL because exhausted actions are not currently written into the round log

**Step 3: Write minimal implementation**

Implement:
- exhaustion-reason tracking in `resolveAction`
- intended-action preservation in participant state
- an exhausted-action log entry shape in shared types
- emission of exhausted entries into `roundLog.phases.playerAttacks`

**Step 4: Run test to verify it passes**

Run: `npm test -w packages/game-engine -- src/combat/raidRoundResolver.test.ts`
Expected: PASS

### Task 2: Render exhausted entries and restore a build-safe round-log module path

**Files:**
- Create: `apps/web/src/components/guild/guildExpeditionRoundLog.ts`
- Create or Modify: `apps/web/src/components/guild/guildExpeditionRoundLogView.tsx`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.test.ts`
- Test: `apps/web/src/components/guild/GuildExpeditionsTab.test.ts`

**Step 1: Write the failing test**

Add a web test that renders:
- a normal current-player attack row
- a normal non-player attack row
- an exhausted-action row

Assert that the exhausted row renders text like:

```text
BotName: counter → Defend (Exhausted: mana)
```

and that the normal attack rows still render as before.

**Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.ts`
Expected: FAIL because exhausted entries are not currently supported

**Step 3: Write minimal implementation**

Implement:
- a build-safe `guildExpeditionRoundLog.ts` entrypoint that re-exports the JSX renderer from a `.tsx` file
- row rendering for exhausted entries in the shared round-log helper
- `GuildExpeditionsTab` consumption of the updated helper

**Step 4: Run test to verify it passes**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.ts`
Expected: PASS

### Task 3: Verify the integrated change

**Files:**
- Verify only: no new files

**Step 1: Run focused package tests**

Run: `npm test -w packages/game-engine -- src/combat/raidRoundResolver.test.ts`
Expected: PASS

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.ts src/lib/format.test.ts`
Expected: PASS

**Step 2: Run the web build**

Run: `npm run build -w apps/web`
Expected: PASS with no missing `guildExpeditionRoundLog.ts` error
