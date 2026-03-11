# Expedition Round Log Targets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show target mob names in compact expedition attack log rows for other players and bots while preserving the detailed current-player row.

**Architecture:** Keep the change entirely in the web rendering layer because `targetMobName` already exists in the shared round-log data. Add a focused UI regression test around the round-log renderer, then make the smallest JSX change to the non-player branch.

**Tech Stack:** React, TypeScript, Vitest

---

### Task 1: Add regression coverage for round-log rendering

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`
- Create: `apps/web/src/components/guild/GuildExpeditionsTab.test.tsx`
- Test: `apps/web/src/components/guild/GuildExpeditionsTab.test.tsx`

**Step 1: Write the failing test**

Create a test that renders a round log with:
- one current-player attack containing `targetMobName`
- one non-player attack containing `targetMobName`
- one non-player attack with `targetMobName: null`

Assert that:
- the non-player row shows `username: action → target | HIT dmg`
- the current-player row still shows the detailed target-and-roll format
- the null-target row still renders without crashing

**Step 2: Run test to verify it fails**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.tsx`
Expected: FAIL because compact non-player rows do not render `targetMobName`

**Step 3: Write minimal implementation**

Update the compact non-player attack branch in `GuildExpeditionsTab.tsx` to append:

```tsx
{atk.targetMobName ? (
  <>
    {' \u2192 '}
    <span className="text-[var(--rpg-text-primary)]">{atk.targetMobName}</span>
    {' | '}
  </>
) : (
  ' \u2192 '
)}
```

before the hit/miss section, keeping the current-player branch unchanged.

**Step 4: Run test to verify it passes**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.tsx`
Expected: PASS

**Step 5: Run focused verification**

Run: `npm test -w apps/web -- src/components/guild/GuildExpeditionsTab.test.tsx src/lib/format.test.ts`
Expected: PASS
