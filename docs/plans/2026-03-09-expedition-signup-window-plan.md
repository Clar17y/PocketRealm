# Expedition Signup Window Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delay the expedition recruiting countdown until the first participant signs up, and show clear recruiting UI copy before the timer exists.

**Architecture:** Keep the expedition status model unchanged and use `recruiting` plus `nextRoundAt: null` to represent "waiting for first signup." Update the API lifecycle first, driven by failing service tests, then add a focused web regression test for the recruiting placeholder state.

**Tech Stack:** TypeScript, Prisma service layer, React, Vitest

---

### Task 1: Lock down recruiting timer lifecycle in API tests

**Files:**
- Modify: `apps/api/src/services/expeditionService.test.ts`
- Test: `apps/api/src/services/expeditionService.test.ts`

**Step 1: Write the failing tests**

Add service tests that assert:

- `launchExpedition()` creates a recruiting expedition with `nextRoundAt: null`
- `signUpForExpedition()` starts `nextRoundAt` when the expedition currently has no timer
- `signUpForExpedition()` does not overwrite `nextRoundAt` when a timer already exists
- the wipe reset path returns the expedition to `recruiting` with `nextRoundAt: null`

Use existing Prisma mocks and inspect the relevant `create()` and `update()` payloads directly.

**Step 2: Run test to verify it fails**

Run: `npm test -w apps/api -- src/services/expeditionService.test.ts`
Expected: FAIL because launch and reset still populate `nextRoundAt`, and signup does not start the timer.

**Step 3: Write minimal implementation**

Update `apps/api/src/services/expeditionService.ts` so that:

- launch creates recruiting expeditions with `nextRoundAt: null`
- signup conditionally sets `nextRoundAt` only when the expedition is still recruiting and still has no timer
- wipe reset clears `nextRoundAt`

Keep the scheduler query unchanged so only due expeditions with a real timer are processed.

**Step 4: Run test to verify it passes**

Run: `npm test -w apps/api -- src/services/expeditionService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionService.test.ts
git commit -m "fix: start expedition signup timer on first signup"
```

### Task 2: Add recruiting UI coverage for the no-timer state

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.test.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`
- Test: `apps/web/src/components/guild/GuildExpeditionsTab.test.ts`

**Step 1: Write the failing test**

Add a web test that renders a recruiting expedition with `nextRoundAt: null` and asserts the recruiting summary shows `Starts after first signup` instead of an empty countdown slot.

**Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.ts`
Expected: FAIL because the recruiting view currently renders an empty countdown value when `nextRoundAt` is `null`.

**Step 3: Write minimal implementation**

Update the recruiting view in `apps/web/src/components/guild/GuildExpeditionsTab.tsx` to render:

- the countdown when `expedition.nextRoundAt` exists
- `Starts after first signup` when it does not

Do not change the in-progress timer behavior.

**Step 4: Run test to verify it passes**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/components/guild/GuildExpeditionsTab.test.ts
git commit -m "fix: clarify expedition recruiting timer state"
```

### Task 3: Run focused verification

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`
- Modify: `apps/api/src/services/expeditionService.test.ts`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.test.ts`

**Step 1: Run API verification**

Run: `npm test -w apps/api -- src/services/expeditionService.test.ts`
Expected: PASS

**Step 2: Run web verification**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.ts`
Expected: PASS

**Step 3: Run build verification**

Run: `npm run build -w apps/web`
Expected: PASS

**Step 4: Commit final integrated state**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionService.test.ts apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/components/guild/GuildExpeditionsTab.test.ts
git commit -m "fix: start expedition timers after first signup"
```
