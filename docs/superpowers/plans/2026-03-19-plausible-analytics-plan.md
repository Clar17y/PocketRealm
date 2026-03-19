# Plausible Analytics & Admin Balance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Plausible analytics with 11 typed custom events across all game action callsites, plus a server-side admin balance report endpoint for game balance analysis.

**Architecture:** Client-side analytics via Plausible script tag + typed `trackEvent()` wrapper wired into the game controller's action handlers. Server-side balance report via raw SQL aggregation queries on existing `ActivityLog` and `PlayerSkill` tables, cached in Redis via existing `cachedQuery` utility, exposed through the existing admin router.

**Tech Stack:** Plausible Analytics (script tag), Next.js `next/script`, PostgreSQL `percentile_cont` / JSONB extraction via `prisma.$queryRaw`, Redis caching via `cachedQuery`.

**Spec:** `docs/superpowers/specs/2026-03-19-plausible-analytics-design.md`

---

### Task 1: Analytics Event Wrapper

**Files:**
- Create: `apps/web/src/lib/analytics.ts`

- [ ] **Step 1: Create the typed analytics wrapper**

Create `apps/web/src/lib/analytics.ts`:

```typescript
type EventMap = {
  signup: undefined;
  tutorial_complete: undefined;
  first_combat: { zone?: string };
  first_craft: { skill?: string };
  action: { type: string; turns: number; zone?: string };
  level_up: { skill: string; level: number };
  death: { zone: string; mob: string };
  screen_view: { screen: string };
  pwa_install: undefined;
  push_subscribe: undefined;
  session_start: { characterLevel: number; daysSinceSignup: number };
};

type AnalyticsEvent = keyof EventMap;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
  }
}

export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  ...args: EventMap[E] extends undefined ? [] : [EventMap[E]]
): void {
  const props = args[0] as Record<string, string | number> | undefined;
  window.plausible?.(event, props ? { props } : undefined);
}

/**
 * Fire a one-time event guarded by a localStorage flag.
 * Returns true if the event fired (first time), false if already tracked.
 */
export function trackOnce<E extends AnalyticsEvent>(
  event: E,
  ...args: EventMap[E] extends undefined ? [] : [EventMap[E]]
): boolean {
  const key = `pr_tracked_${event}`;
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, '1');
  trackEvent(event, ...args);
  return true;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors from analytics.ts

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/analytics.ts
git commit -m "feat: add typed Plausible analytics event wrapper"
```

---

### Task 2: Plausible Script Tag & Env Var

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Add Plausible script to layout.tsx**

In `apps/web/src/app/layout.tsx`, add the `Script` import and inject the Plausible script in the `<html>` tag before `<body>`:

```typescript
import Script from 'next/script';
```

Update the return to:

```tsx
return (
  <html lang="en">
    <head>
      {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
        <Script
          defer
          data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      )}
    </head>
    <body className={`${almendra.variable} ${crimsonText.variable} ${silkscreen.variable}`}>{children}</body>
  </html>
);
```

- [ ] **Step 2: Add env var to .env.example**

Append to `apps/web/.env.example`:

```
# Analytics (Plausible)
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/.env.example
git commit -m "feat: add Plausible script tag to layout, gated on env var"
```

---

### Task 3: Wire Signup & Session Start Events

**Files:**
- Modify: `apps/web/src/app/register/page.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add signup tracking to register page**

In `apps/web/src/app/register/page.tsx`, add import at top:

```typescript
import { trackEvent } from '@/lib/analytics';
```

After `setTokens(data.accessToken, data.refreshToken, data.player);` (line 39), before `router.push('/game');`, add:

```typescript
trackEvent('signup');
```

- [ ] **Step 2: Add session_start tracking to game controller**

In `apps/web/src/app/game/useGameController.ts`, add import at top (after the existing imports):

```typescript
import { trackEvent, trackOnce } from '@/lib/analytics';
```

In the main initialization `useEffect` (line 679), after `void loadAll();`, the session_start event should fire after the player data is loaded. Add a new `useEffect` that depends on `characterLevel` and `isAuthenticated`:

Find a suitable location after the initialization effect (around line 693) and add:

```typescript
// Analytics: track session start once per page load
const sessionTrackedRef = useRef(false);
```

Add this ref near the other refs at the top of the hook. Then add a `useEffect`:

```typescript
useEffect(() => {
  if (!isAuthenticated || sessionTrackedRef.current || characterLevel === 0) return;
  sessionTrackedRef.current = true;
  const createdAt = localStorage.getItem('playerCreatedAt');
  const daysSinceSignup = createdAt
    ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
    : 0;
  trackEvent('session_start', { characterLevel, daysSinceSignup });
}, [isAuthenticated, characterLevel]);
```

Note: `playerCreatedAt` is set during login/register via `setTokens`. Check if the player object includes `createdAt` — if so, store it in localStorage during `setTokens`. If not available, pass `0` for `daysSinceSignup` and skip that prop. Adapt to whatever the player object provides.

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/register/page.tsx apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire signup and session_start analytics events"
```

---

### Task 4: Wire Screen View Event

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add screen_view tracking to handleNavigate**

In `apps/web/src/app/game/useGameController.ts`, in the `handleNavigate` function (line 1049), at the very end after `setActiveScreen(resolved as Screen);` (line 1079), add:

```typescript
trackEvent('screen_view', { screen: resolved });
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire screen_view analytics event on tab navigation"
```

---

### Task 5: Wire Combat Events (action, death, first_combat, level_up)

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add analytics to handleStartCombat**

In `handleStartCombat()` (line 888), after `applyStateUpdates(data.stateUpdates, stateSetters);` (line 1029), add the analytics calls. The zone name comes from `selectedSite?.zoneName`, turns cost is fixed at `COMBAT_CONSTANTS.ENCOUNTER_TURN_COST` (50), and outcome/mob info comes from the combat data.

```typescript
// Analytics: track combat action
const zoneName = selectedSite?.zoneName ?? '';
trackEvent('action', { type: 'combat', turns: 50, zone: zoneName });

// Track first combat (once per device)
trackOnce('first_combat', { zone: zoneName });

// Track deaths
const overallOutcome = data.combat.fights?.length
  ? data.combat.fights[data.combat.fights.length - 1].outcome
  : data.combat.outcome;
if (overallOutcome === 'loss') {
  const mobName = data.combat.fights?.length
    ? data.combat.fights[data.combat.fights.length - 1].mobDisplayName
    : data.combat.mobDisplayName;
  trackEvent('death', { zone: zoneName, mob: mobName });
}

// Track level-ups from combat
for (const grant of data.rewards?.skillXpGrants ?? []) {
  if (grant.leveledUp) {
    trackEvent('level_up', { skill: grant.skillType, level: grant.newLevel });
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire combat analytics events (action, death, first_combat, level_up)"
```

---

### Task 6: Wire Gathering Events (action, level_up)

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add analytics to handleMine**

In `handleMine()` (line 1082), after `applyStateUpdates(data.stateUpdates, stateSetters);` (line 1159), add:

```typescript
// Analytics: track gathering action
const gatherType = data.xp?.skillType ?? 'mining';
trackEvent('action', { type: gatherType, turns: turnSpend, zone: activeZoneId ?? '' });

if (data.xp?.leveledUp) {
  trackEvent('level_up', { skill: data.xp.skillType, level: data.xp.newLevel });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire gathering analytics events (action, level_up)"
```

---

### Task 7: Wire Crafting Events (action, first_craft, level_up)

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add analytics to handleCraft**

In `handleCraft()` (line 1165), after `applyStateUpdates(data.stateUpdates, stateSetters);` (line 1239), add:

```typescript
// Analytics: track crafting action
const craftTurns = recipe ? recipe.turnCost * quantity : 50;
trackEvent('action', { type: data.xp.skillType, turns: craftTurns });

// Track first craft (once per device)
trackOnce('first_craft', { skill: data.xp.skillType });

if (data.xp?.leveledUp) {
  trackEvent('level_up', { skill: data.xp.skillType, level: data.xp.newLevel });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire crafting analytics events (action, first_craft, level_up)"
```

---

### Task 8: Wire Exploration, Forge, Salvage, Rest Events

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Add analytics to exploration**

In `finalizeExplorationPlayback()` (line 853), after `applyStateUpdates(savedStateUpdates, stateSetters);` (line 860), add:

```typescript
// Analytics: track exploration action
if (explorationPlaybackData) {
  trackEvent('action', {
    type: 'exploration',
    turns: explorationPlaybackData.totalTurns,
    zone: explorationPlaybackData.zoneName,
  });
}
```

Note: `explorationPlaybackData` is set to null on line 856 before this code runs. The analytics call needs to be placed *before* `setExplorationPlaybackData(null)` (line 856). Restructure to capture data before clearing:

```typescript
const finalizeExplorationPlayback = async () => {
  const pendingIds = explorationPlaybackData?.pendingLootSessionIds;
  const savedStateUpdates = explorationPlaybackData?.stateUpdates;

  // Analytics: track exploration action (before clearing playback data)
  if (explorationPlaybackData) {
    trackEvent('action', {
      type: 'exploration',
      turns: explorationPlaybackData.totalTurns,
      zone: explorationPlaybackData.zoneName,
    });
  }

  setExplorationPlaybackData(null);
  // ... rest unchanged
```

- [ ] **Step 2: Add analytics to forge upgrade**

In `handleForgeUpgrade()` (line 1259), after the success/protected/fail log branches, add before the closing `});`:

```typescript
trackEvent('action', { type: 'forge_upgrade', turns: 100 });
```

The turn cost varies by rarity but a constant approximation is fine for analytics — the exact turns are tracked server-side in ActivityLog.

- [ ] **Step 3: Add analytics to forge reroll**

In `handleForgeReroll()` (line 1294), before the closing `});`, add:

```typescript
trackEvent('action', { type: 'forge_reroll', turns: 75 });
```

- [ ] **Step 4: Add analytics to salvage**

In `handleSalvageItem()` (line 1245), before the closing `});`, add:

```typescript
trackEvent('action', { type: 'salvage', turns: 50 });
```

In `handleSalvageBatch()` (line 1252), before the closing `});`, add:

```typescript
trackEvent('action', { type: 'salvage', turns: data.totalTurnCost });
```

- [ ] **Step 5: Add analytics to rest**

In `handleQuickRest()` (line 1687), after `pushLog(...)` (line 1704), add:

```typescript
trackEvent('action', { type: 'rest', turns: actualTurns });
```

- [ ] **Step 6: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire exploration, forge, salvage, rest analytics events"
```

---

### Task 9: Wire Tutorial Complete, PWA Install, Push Subscribe Events

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/hooks/usePushNotifications.ts`

- [ ] **Step 1: Add tutorial_complete tracking**

In `apps/web/src/app/game/useGameController.ts`, in the `advanceTutorial` function (line 624):

```typescript
const advanceTutorial = useCallback(async (fromStep: number) => {
  if (tutorialStep !== fromStep) return;
  const nextStep = fromStep + 1;
  const res = await updateTutorialStep(nextStep);
  if (res.data) {
    setTutorialStep(res.data.tutorialStep);
    if (res.data.tutorialStep === TUTORIAL_COMPLETED) {
      trackEvent('tutorial_complete');
    }
  }
}, [tutorialStep]);
```

- [ ] **Step 2: Add pwa_install tracking**

In `apps/web/src/app/game/useGameController.ts`, add a new `useEffect` near the other initialization effects (after the session tracking effect):

```typescript
// Analytics: track PWA install
useEffect(() => {
  const handler = () => trackEvent('pwa_install');
  window.addEventListener('appinstalled', handler);
  return () => window.removeEventListener('appinstalled', handler);
}, []);
```

- [ ] **Step 3: Add push_subscribe tracking**

In `apps/web/src/hooks/usePushNotifications.ts`, add import:

```typescript
import { trackEvent } from '@/lib/analytics';
```

In the `subscribe` callback, after `setState('subscribed');` (line 57), add:

```typescript
trackEvent('push_subscribe');
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/hooks/usePushNotifications.ts
git commit -m "feat: wire tutorial_complete, pwa_install, push_subscribe analytics events"
```

---

### Task 10: Admin Balance Analytics Service

**Files:**
- Create: `apps/api/src/services/analyticsService.ts`

- [ ] **Step 1: Create the analytics service**

Create `apps/api/src/services/analyticsService.ts`:

```typescript
import { Prisma, prisma } from '@pocketrealm/database';
import { cachedQuery } from './cacheService';

interface SkillDistEntry {
  avg: number;
  median: number;
  p90: number;
  playerCount: number;
}

interface TurnDistEntry {
  totalTurns: number;
  actionCount: number;
  avgTurnsPerAction: number;
}

interface XpEffEntry {
  totalXpGained: number;
  totalTurnsSpent: number;
  xpPerTurn: number;
}

interface ProgressionEntry {
  atLevel5: number;
  atLevel10: number;
  atLevel15: number;
  atLevel20: number;
  atLevel30: number;
}

interface ZoneActivityEntry {
  totalTurns: number;
  actionCount: number;
  uniquePlayers: number;
}

export interface BalanceReport {
  period: string;
  generatedAt: string;
  activePlayers: number;
  skillDistribution: Record<string, SkillDistEntry>;
  turnDistribution: Record<string, TurnDistEntry>;
  xpEfficiency: Record<string, XpEffEntry>;
  progressionVelocity: Record<string, ProgressionEntry>;
  zoneActivity: Record<string, ZoneActivityEntry>;
}

const PERIOD_MAP: Record<string, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export async function getBalanceReport(period: string): Promise<BalanceReport> {
  const intervalSql = PERIOD_MAP[period] ?? '7 days';
  const cacheKey = `analytics:balance:v1:${period}`;

  return cachedQuery(cacheKey, async () => {
    const cutoff = Prisma.sql`NOW() - ${intervalSql}::interval`;

    // Active players in period
    const activeResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT player_id) as count
      FROM activity_logs
      WHERE created_at >= ${cutoff}
    `;
    const activePlayers = Number(activeResult[0].count);

    // Skill distribution for active players
    const skillDist = await prisma.$queryRaw<Array<{
      skill_type: string;
      avg_level: number;
      median_level: number;
      p90_level: number;
      player_count: bigint;
    }>>`
      SELECT
        ps.skill_type,
        ROUND(AVG(ps.level)::numeric, 1) as avg_level,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ps.level)::numeric, 1) as median_level,
        ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ps.level)::numeric, 1) as p90_level,
        COUNT(*) as player_count
      FROM player_skills ps
      WHERE ps.player_id IN (
        SELECT DISTINCT player_id FROM activity_logs WHERE created_at >= ${cutoff}
      )
      AND ps.level > 1
      GROUP BY ps.skill_type
      ORDER BY ps.skill_type
    `;

    const skillDistribution: Record<string, SkillDistEntry> = {};
    for (const row of skillDist) {
      skillDistribution[row.skill_type] = {
        avg: Number(row.avg_level),
        median: Number(row.median_level),
        p90: Number(row.p90_level),
        playerCount: Number(row.player_count),
      };
    }

    // Turn distribution by activity type
    const turnDist = await prisma.$queryRaw<Array<{
      activity_type: string;
      total_turns: bigint;
      action_count: bigint;
    }>>`
      SELECT
        activity_type,
        COALESCE(SUM(turns_spent), 0) as total_turns,
        COUNT(*) as action_count
      FROM activity_logs
      WHERE created_at >= ${cutoff}
      GROUP BY activity_type
      ORDER BY total_turns DESC
    `;

    const turnDistribution: Record<string, TurnDistEntry> = {};
    for (const row of turnDist) {
      const total = Number(row.total_turns);
      const count = Number(row.action_count);
      turnDistribution[row.activity_type] = {
        totalTurns: total,
        actionCount: count,
        avgTurnsPerAction: count > 0 ? Math.round(total / count) : 0,
      };
    }

    // XP efficiency by skill category
    // Combat XP is in result->'skillXpGrants'->0->>'xpAfterEfficiency'
    // Gathering/crafting XP is in result->'xp'->>'xpAfterEfficiency'
    const xpEff = await prisma.$queryRaw<Array<{
      category: string;
      total_xp: number;
      total_turns: bigint;
    }>>`
      SELECT category, COALESCE(SUM(xp), 0) as total_xp, COALESCE(SUM(turns_spent), 0) as total_turns
      FROM (
        -- Combat XP (from skillXpGrants array)
        SELECT
          'combat' as category,
          COALESCE((result->'rewards'->'skillXpGrants'->0->>'xpAfterEfficiency')::numeric, 0) as xp,
          turns_spent
        FROM activity_logs
        WHERE activity_type = 'combat'
          AND created_at >= ${cutoff}

        UNION ALL

        -- Gathering XP
        SELECT
          activity_type as category,
          COALESCE((result->'xp'->>'xpAfterEfficiency')::numeric, 0) as xp,
          turns_spent
        FROM activity_logs
        WHERE activity_type IN ('mining', 'foraging', 'woodcutting')
          AND created_at >= ${cutoff}

        UNION ALL

        -- Crafting XP
        SELECT
          'crafting' as category,
          COALESCE((result->'xp'->>'xpAfterEfficiency')::numeric, 0) as xp,
          turns_spent
        FROM activity_logs
        WHERE activity_type = 'crafting'
          AND created_at >= ${cutoff}
      ) sub
      GROUP BY category
      ORDER BY category
    `;

    const xpEfficiency: Record<string, XpEffEntry> = {};
    for (const row of xpEff) {
      const totalXp = Number(row.total_xp);
      const totalTurns = Number(row.total_turns);
      xpEfficiency[row.category] = {
        totalXpGained: Math.round(totalXp),
        totalTurnsSpent: totalTurns,
        xpPerTurn: totalTurns > 0 ? Math.round((totalXp / totalTurns) * 100) / 100 : 0,
      };
    }

    // Progression velocity — % of active players at each level threshold per skill
    const progression = await prisma.$queryRaw<Array<{
      skill_type: string;
      at_5: bigint;
      at_10: bigint;
      at_15: bigint;
      at_20: bigint;
      at_30: bigint;
    }>>`
      SELECT
        ps.skill_type,
        COUNT(*) FILTER (WHERE ps.level >= 5) as at_5,
        COUNT(*) FILTER (WHERE ps.level >= 10) as at_10,
        COUNT(*) FILTER (WHERE ps.level >= 15) as at_15,
        COUNT(*) FILTER (WHERE ps.level >= 20) as at_20,
        COUNT(*) FILTER (WHERE ps.level >= 30) as at_30
      FROM player_skills ps
      WHERE ps.player_id IN (
        SELECT DISTINCT player_id FROM activity_logs WHERE created_at >= ${cutoff}
      )
      GROUP BY ps.skill_type
      ORDER BY ps.skill_type
    `;

    const progressionVelocity: Record<string, ProgressionEntry> = {};
    for (const row of progression) {
      const pct = (n: bigint) => activePlayers > 0 ? Math.round((Number(n) / activePlayers) * 100) : 0;
      progressionVelocity[row.skill_type] = {
        atLevel5: pct(row.at_5),
        atLevel10: pct(row.at_10),
        atLevel15: pct(row.at_15),
        atLevel20: pct(row.at_20),
        atLevel30: pct(row.at_30),
      };
    }

    // Zone activity — turns and unique players per zone
    // Zone info is stored differently per activity type. Use a COALESCE approach
    // to extract zone from whichever JSON path has it.
    const zoneAct = await prisma.$queryRaw<Array<{
      zone_name: string;
      total_turns: bigint;
      action_count: bigint;
      unique_players: bigint;
    }>>`
      SELECT
        zone_name,
        COALESCE(SUM(turns_spent), 0) as total_turns,
        COUNT(*) as action_count,
        COUNT(DISTINCT player_id) as unique_players
      FROM (
        SELECT
          player_id,
          turns_spent,
          COALESCE(
            result->>'zoneName',
            result->'zone'->>'name',
            'unknown'
          ) as zone_name
        FROM activity_logs
        WHERE created_at >= ${cutoff}
          AND activity_type IN ('combat', 'exploration', 'mining', 'foraging', 'woodcutting')
      ) sub
      WHERE zone_name != 'unknown'
      GROUP BY zone_name
      ORDER BY total_turns DESC
    `;

    const zoneActivity: Record<string, ZoneActivityEntry> = {};
    for (const row of zoneAct) {
      zoneActivity[row.zone_name] = {
        totalTurns: Number(row.total_turns),
        actionCount: Number(row.action_count),
        uniquePlayers: Number(row.unique_players),
      };
    }

    return {
      period,
      generatedAt: new Date().toISOString(),
      activePlayers,
      skillDistribution,
      turnDistribution,
      xpEfficiency,
      progressionVelocity,
      zoneActivity,
    };
  }, 600); // 10 minute cache
}
```

Note: The JSONB paths for XP extraction vary by activity type. The combat path uses `result->'rewards'->'skillXpGrants'->0->>'xpAfterEfficiency'` — verify this matches the actual stored JSON structure by checking a sample ActivityLog row:

```sql
SELECT result FROM activity_logs WHERE activity_type = 'combat' LIMIT 1;
```

Adjust the JSON path if needed. The gathering/crafting path `result->'xp'->>'xpAfterEfficiency'` should be correct based on how `createActivityLog` is called from gathering/crafting routes.

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors. If the Prisma raw SQL types cause issues, cast with `as unknown as Array<...>`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/analyticsService.ts
git commit -m "feat: add analytics service with balance report aggregate queries"
```

---

### Task 11: Admin Balance Report Route

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Add balance report endpoint to admin router**

In `apps/api/src/routes/admin.ts`, add import at the top (after the existing imports, around line 14):

```typescript
import { getBalanceReport } from '../services/analyticsService';
```

Before the `export const adminRouter = router;` line (line 817), add:

```typescript
// ---------- Analytics ----------

const balancePeriodSchema = z.object({
  period: z.enum(['1h', '24h', '7d', '30d']).default('7d'),
});

router.get('/analytics/balance', asyncHandler(async (req, res) => {
  const { period } = balancePeriodSchema.parse(req.query);
  const report = await getBalanceReport(period);
  res.json(report);
}));
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run build:api 2>&1 | tail -20`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "feat: add GET /admin/analytics/balance endpoint for game balance report"
```

---

### Task 12: Analytics Service Tests

**Files:**
- Create: `apps/api/src/services/analyticsService.test.ts`

- [ ] **Step 1: Write tests for the analytics service**

Create `apps/api/src/services/analyticsService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBalanceReport } from './analyticsService';

// Mock Prisma
vi.mock('@pocketrealm/database', () => ({
  Prisma: { sql: vi.fn((...args: unknown[]) => args) },
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Mock cacheService to always call fetcher
vi.mock('./cacheService', () => ({
  cachedQuery: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
}));

import { prisma } from '@pocketrealm/database';

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBalanceReport', () => {
    it('returns a complete balance report with all sections', async () => {
      const mockQueryRaw = vi.mocked(prisma.$queryRaw);

      // Mock responses for each query in order
      // 1. Active players count
      mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(100) }]);
      // 2. Skill distribution
      mockQueryRaw.mockResolvedValueOnce([
        { skill_type: 'melee', avg_level: 12.3, median_level: 10, p90_level: 25, player_count: BigInt(80) },
        { skill_type: 'mining', avg_level: 8.1, median_level: 7, p90_level: 15, player_count: BigInt(60) },
      ]);
      // 3. Turn distribution
      mockQueryRaw.mockResolvedValueOnce([
        { activity_type: 'combat', total_turns: BigInt(500000), action_count: BigInt(10000) },
        { activity_type: 'mining', total_turns: BigInt(120000), action_count: BigInt(4000) },
      ]);
      // 4. XP efficiency
      mockQueryRaw.mockResolvedValueOnce([
        { category: 'combat', total_xp: 210000, total_turns: BigInt(500000) },
        { category: 'mining', total_xp: 90000, total_turns: BigInt(120000) },
      ]);
      // 5. Progression velocity
      mockQueryRaw.mockResolvedValueOnce([
        { skill_type: 'melee', at_5: BigInt(80), at_10: BigInt(50), at_15: BigInt(30), at_20: BigInt(10), at_30: BigInt(2) },
        { skill_type: 'mining', at_5: BigInt(60), at_10: BigInt(30), at_15: BigInt(10), at_20: BigInt(3), at_30: BigInt(0) },
      ]);
      // 6. Zone activity
      mockQueryRaw.mockResolvedValueOnce([
        { zone_name: 'Forest Edge', total_turns: BigInt(200000), action_count: BigInt(5000), unique_players: BigInt(80) },
      ]);

      const report = await getBalanceReport('7d');

      expect(report.period).toBe('7d');
      expect(report.activePlayers).toBe(100);
      expect(report.skillDistribution.melee.avg).toBe(12.3);
      expect(report.skillDistribution.melee.median).toBe(10);
      expect(report.skillDistribution.mining.playerCount).toBe(60);
      expect(report.turnDistribution.combat.totalTurns).toBe(500000);
      expect(report.turnDistribution.combat.avgTurnsPerAction).toBe(50);
      expect(report.xpEfficiency.combat.xpPerTurn).toBe(0.42);
      expect(report.progressionVelocity.melee.atLevel5).toBe(80);
      expect(report.progressionVelocity.melee.atLevel30).toBe(2);
      expect(report.zoneActivity['Forest Edge'].uniquePlayers).toBe(80);
      expect(report.generatedAt).toBeDefined();
    });

    it('handles empty data gracefully', async () => {
      const mockQueryRaw = vi.mocked(prisma.$queryRaw);

      mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]); // active players
      mockQueryRaw.mockResolvedValueOnce([]); // skill dist
      mockQueryRaw.mockResolvedValueOnce([]); // turn dist
      mockQueryRaw.mockResolvedValueOnce([]); // xp eff
      mockQueryRaw.mockResolvedValueOnce([]); // progression
      mockQueryRaw.mockResolvedValueOnce([]); // zone activity

      const report = await getBalanceReport('24h');

      expect(report.activePlayers).toBe(0);
      expect(Object.keys(report.skillDistribution)).toHaveLength(0);
      expect(Object.keys(report.turnDistribution)).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd apps/api && npx vitest run src/services/analyticsService.test.ts`
Expected: all tests PASS. If mock ordering issues, adjust the mock setup.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/analyticsService.test.ts
git commit -m "test: add analytics service unit tests for balance report"
```

---

### Task 13: Full Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: all tests pass, no regressions

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no new errors (pre-existing error in `apps/web/src/app/game/page.tsx:333` is known and not ours)

- [ ] **Step 3: Build verification**

Run: `npm run build`
Expected: both web and API build successfully

- [ ] **Step 4: Verify JSONB paths against real data (if DB available)**

Run against the worktree database:

```sql
-- Check combat result JSON structure
SELECT jsonb_pretty(result) FROM activity_logs WHERE activity_type = 'combat' LIMIT 1;

-- Check gathering result JSON structure
SELECT jsonb_pretty(result) FROM activity_logs WHERE activity_type = 'mining' LIMIT 1;

-- Check crafting result JSON structure
SELECT jsonb_pretty(result) FROM activity_logs WHERE activity_type = 'crafting' LIMIT 1;
```

If the JSONB paths in the XP efficiency or zone activity queries don't match the actual JSON structure, update `analyticsService.ts` accordingly.
