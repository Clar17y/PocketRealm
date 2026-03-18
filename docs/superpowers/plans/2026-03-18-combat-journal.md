# Combat Journal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only analytics dashboard that mines existing combat ActivityLog entries to show players performance stats and improvement trends.

**Architecture:** New `combatJournalService.ts` computes stats from ActivityLog JSON. New `GET /player/combat-journal` route. Redis cache (5min TTL). Small prerequisite: enrich combat activity log writes with `damageByScalingStat`.

**Tech Stack:** Prisma (JSON queries), Redis (cache), Express, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-combat-journal-design.md`

---

### Task 1: Prerequisite — Enrich Combat Activity Logs

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (zone combat and encounter site activity log writes)
- Modify: `apps/api/src/services/combatOrchestrationService.ts` (exploration_ambush/travel_ambush sources)

- [ ] **Step 1: Add `damageByScalingStat` to zone combat activity log**

In the zone combat `createActivityLog` call (~line 974), add `damageByScalingStat` to the `result` object. The value is already available on `combatResult.damageByScalingStat`:

```typescript
result: {
  // ... existing fields ...
  damageByScalingStat: combatResult.damageByScalingStat,
}
```

- [ ] **Step 2: Add `damageByScalingStat` to encounter site individual fight logs**

In the encounter site `encounter_site_fight` individual activity log writes (~line 572 in `start.ts`), add `damageByScalingStat` from each individual combat result:

```typescript
result: {
  // ... existing fields ...
  damageByScalingStat: combatResult.damageByScalingStat,
}
```

- [ ] **Step 3: Add `damageByScalingStat` to encounter site summary activity log**

In the encounter site summary `createActivityLog` call (~line 532), add the same field from the last combat result:

```typescript
result: {
  // ... existing fields ...
  damageByScalingStat: lastCombatResult?.damageByScalingStat ?? { melee: 0, ranged: 0, magic: 0 },
}
```

- [ ] **Step 4: Add `damageByScalingStat` to `buildCombatLogResult` in combatOrchestrationService.ts**

In `apps/api/src/services/combatOrchestrationService.ts`, update the `buildCombatLogResult` function to include `damageByScalingStat` from the combat result. This ensures exploration_ambush and travel_ambush sources also persist this data:

```typescript
// In buildCombatLogResult:
damageByScalingStat: combatResult.damageByScalingStat,
```

- [ ] **Step 5: Verify build**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/combat/start.ts apps/api/src/services/combatOrchestrationService.ts
git commit -m "feat(journal): persist damageByScalingStat in combat activity logs"
```

---

### Task 2: Create Combat Journal Service — Stats Computation

**Files:**
- Create: `apps/api/src/services/combatJournalService.ts`
- Test: `apps/api/src/services/combatJournalService.test.ts`

- [ ] **Step 1: Write test for stats computation**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRedis = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
vi.mock('../redis', () => ({ redis: mockRedis }));

const mockPrisma = {
  activityLog: { findMany: vi.fn() },
  mobFamilyMember: { findMany: vi.fn() },
};
vi.mock('@pocketrealm/database', () => ({ prisma: mockPrisma }));

import { computeJournalStats } from './combatJournalService';

function makeCombatLog(overrides: Record<string, unknown> = {}) {
  const { createdAt, ...resultOverrides } = overrides;
  return {
    id: 'log-1',
    activityType: 'combat',
    turnsSpent: 1,
    createdAt: (createdAt as Date) ?? new Date('2026-03-18'),
    result: {
      outcome: 'victory',
      source: 'zone_combat',
      playerMaxHp: 100,
      mobTemplateId: 'mob-1',
      mobName: 'Wolf',
      attackSkill: 'melee',
      log: [
        {
          round: 1,
          combatantAHpAfter: 80,
          damage: 25,
          staminaCost: 5,
          manaCost: 0,
          wasExhausted: false,
        },
        {
          round: 2,
          combatantAHpAfter: 70,
          damage: 30,
          staminaCost: 5,
          manaCost: 0,
          wasExhausted: false,
        },
      ],
      damageByScalingStat: { melee: 55, ranged: 0, magic: 0 },
      ...resultOverrides,
    },
  };
}

describe('computeJournalStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes win rate from combat logs', () => {
    const logs = [
      makeCombatLog({ outcome: 'victory' }),
      makeCombatLog({ outcome: 'victory' }),
      makeCombatLog({ outcome: 'defeat' }),
    ];

    const stats = computeJournalStats(logs as any);
    expect(stats.winRate).toBeCloseTo(2 / 3);
    expect(stats.totalFights).toBe(3);
  });

  it('computes average rounds to kill from victories', () => {
    const logs = [
      makeCombatLog({ outcome: 'victory', log: [{ round: 1 }, { round: 2 }, { round: 3 }] }),
      makeCombatLog({ outcome: 'victory', log: [{ round: 1 }] }),
      makeCombatLog({ outcome: 'defeat', log: [{ round: 1 }, { round: 2 }] }),
    ];

    const stats = computeJournalStats(logs as any);
    expect(stats.avgRoundsToKill).toBe(2); // (3 + 1) / 2 victories
  });

  it('counts exhaustion rate', () => {
    const logs = [
      makeCombatLog({
        log: [
          { round: 1, wasExhausted: true },
          { round: 2, wasExhausted: false },
          { round: 3, wasExhausted: true },
        ],
      }),
    ];

    const stats = computeJournalStats(logs as any);
    expect(stats.exhaustionRate).toBe(2); // 2 exhausted rounds in 1 fight
  });

  it('computes defeat breakdown', () => {
    const logs = [
      makeCombatLog({ outcome: 'defeat' }),
      makeCombatLog({ outcome: 'defeat' }),
      makeCombatLog({ outcome: 'fled' }),
      makeCombatLog({ outcome: 'draw' }),
    ];

    const stats = computeJournalStats(logs as any);
    expect(stats.defeatBreakdown).toEqual({ defeat: 2, fled: 1, draw: 1 });
  });

  it('computes efficiency score from last log entry HP', () => {
    const logs = [
      makeCombatLog({
        outcome: 'victory',
        playerMaxHp: 100,
        log: [{ round: 1, combatantAHpAfter: 80 }],
      }),
    ];

    const stats = computeJournalStats(logs as any);
    expect(stats.efficiencyScore).toBeCloseTo(0.8); // 80/100
  });
});
```

Note: The `makeCombatLog` helper separates `createdAt` (top-level property) from `result` overrides. Top-level properties like `createdAt` are handled separately and not nested inside `result`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- --run combatJournalService`
Expected: FAIL — module not found

- [ ] **Step 3: Implement stats computation**

Create `apps/api/src/services/combatJournalService.ts`:

```typescript
import type { ActivityLog } from '@prisma/client';

interface CombatLogEntry {
  round: number;
  combatantAHpAfter?: number;
  damage?: number;
  staminaCost?: number;
  manaCost?: number;
  wasExhausted?: boolean;
}

interface CombatResult {
  outcome: string;
  source: string;
  playerMaxHp: number;
  mobTemplateId: string;
  mobName: string;
  attackSkill: string;
  log: CombatLogEntry[];
  damageByScalingStat?: { melee: number; ranged: number; magic: number };
}

export interface JournalStats {
  totalFights: number;
  winRate: number;
  winRateByFamily: Record<string, number>;
  avgRoundsToKill: number;
  avgRoundsToKillByFamily: Record<string, number>;
  efficiencyScore: number;
  defeatBreakdown: { defeat: number; fled: number; draw: number };
  resourceEfficiency: { staminaPerDamage: number; manaPerDamage: number };
  damageSplit: { melee: number; ranged: number; magic: number };
  exhaustionRate: number;
}

export function computeJournalStats(
  logs: Array<{ result: CombatResult }>,
  familyMap?: Map<string, string>,
): JournalStats {
  const total = logs.length;
  if (total === 0) return emptyStats();

  let wins = 0;
  let defeats = 0;
  let fled = 0;
  let draws = 0;
  let totalRoundsOnVictory = 0;
  let victoriesCount = 0;
  let totalEfficiency = 0;
  let efficiencyCount = 0;
  let totalStamina = 0;
  let totalMana = 0;
  let totalDamage = 0;
  let totalExhausted = 0;
  const damageSplit = { melee: 0, ranged: 0, magic: 0 };

  const winsByFamily = new Map<string, { wins: number; total: number }>();
  const roundsByFamily = new Map<string, { rounds: number; victories: number }>();

  for (const log of logs) {
    const r = log.result;
    const family = familyMap?.get(r.mobTemplateId) ?? r.mobName;

    // Win rate
    if (r.outcome === 'victory') {
      wins++;
      victoriesCount++;
      const maxRound = Math.max(...r.log.map((e) => e.round ?? 0), 0);
      totalRoundsOnVictory += maxRound;

      const fam = roundsByFamily.get(family) ?? { rounds: 0, victories: 0 };
      fam.rounds += maxRound;
      fam.victories++;
      roundsByFamily.set(family, fam);
    } else if (r.outcome === 'defeat') defeats++;
    else if (r.outcome === 'fled') fled++;
    else if (r.outcome === 'draw') draws++;

    // Per-family win tracking
    const famWin = winsByFamily.get(family) ?? { wins: 0, total: 0 };
    famWin.total++;
    if (r.outcome === 'victory') famWin.wins++;
    winsByFamily.set(family, famWin);

    // Efficiency score (HP remaining / max HP)
    if (r.log.length > 0 && r.playerMaxHp > 0) {
      const lastEntry = r.log[r.log.length - 1];
      if (lastEntry?.combatantAHpAfter != null) {
        totalEfficiency += lastEntry.combatantAHpAfter / r.playerMaxHp;
        efficiencyCount++;
      }
    }

    // Resource efficiency + exhaustion
    for (const entry of r.log) {
      totalStamina += entry.staminaCost ?? 0;
      totalMana += entry.manaCost ?? 0;
      totalDamage += entry.damage ?? 0;
      if (entry.wasExhausted) totalExhausted++;
    }

    // Damage split
    if (r.damageByScalingStat) {
      damageSplit.melee += r.damageByScalingStat.melee;
      damageSplit.ranged += r.damageByScalingStat.ranged;
      damageSplit.magic += r.damageByScalingStat.magic;
    }
  }

  const totalDmgSplit = damageSplit.melee + damageSplit.ranged + damageSplit.magic;

  return {
    totalFights: total,
    winRate: wins / total,
    winRateByFamily: Object.fromEntries(
      [...winsByFamily].map(([k, v]) => [k, v.wins / v.total]),
    ),
    avgRoundsToKill: victoriesCount > 0 ? totalRoundsOnVictory / victoriesCount : 0,
    avgRoundsToKillByFamily: Object.fromEntries(
      [...roundsByFamily].map(([k, v]) => [k, v.victories > 0 ? v.rounds / v.victories : 0]),
    ),
    efficiencyScore: efficiencyCount > 0 ? totalEfficiency / efficiencyCount : 0,
    defeatBreakdown: { defeat: defeats, fled, draw: draws },
    resourceEfficiency: {
      staminaPerDamage: totalDamage > 0 ? totalStamina / totalDamage : 0,
      manaPerDamage: totalDamage > 0 ? totalMana / totalDamage : 0,
    },
    damageSplit: totalDmgSplit > 0
      ? {
          melee: damageSplit.melee / totalDmgSplit,
          ranged: damageSplit.ranged / totalDmgSplit,
          magic: damageSplit.magic / totalDmgSplit,
        }
      : { melee: 0, ranged: 0, magic: 0 },
    exhaustionRate: total > 0 ? totalExhausted / total : 0,
  };
}

function emptyStats(): JournalStats {
  return {
    totalFights: 0,
    winRate: 0,
    winRateByFamily: {},
    avgRoundsToKill: 0,
    avgRoundsToKillByFamily: {},
    efficiencyScore: 0,
    defeatBreakdown: { defeat: 0, fled: 0, draw: 0 },
    resourceEfficiency: { staminaPerDamage: 0, manaPerDamage: 0 },
    damageSplit: { melee: 0, ranged: 0, magic: 0 },
    exhaustionRate: 0,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:api -- --run combatJournalService`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/combatJournalService.ts apps/api/src/services/combatJournalService.test.ts
git commit -m "feat(journal): add stats computation from combat logs"
```

---

### Task 3: Add Trend Computation

**Files:**
- Modify: `apps/api/src/services/combatJournalService.ts`
- Modify: `apps/api/src/services/combatJournalService.test.ts`

- [ ] **Step 1: Write trend computation test**

```typescript
describe('computeJournalTrends', () => {
  it('computes rolling 10-fight win rate windows', () => {
    // 20 fights: first 10 are losses, last 10 are wins
    const logs = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeCombatLog({ outcome: 'defeat', createdAt: new Date(2026, 2, i + 1) })),
      ...Array.from({ length: 10 }, (_, i) =>
        makeCombatLog({ outcome: 'victory', createdAt: new Date(2026, 2, i + 11) })),
    ];

    const trends = computeJournalTrends(logs as any);
    // First window (fights 1-10): 0% win rate
    // Last window (fights 11-20): 100% win rate
    expect(trends.winRate[0].value).toBeCloseTo(0);
    expect(trends.winRate[trends.winRate.length - 1].value).toBeCloseTo(1);
  });

  it('returns empty trends for < 10 fights', () => {
    const logs = Array.from({ length: 5 }, () => makeCombatLog());
    const trends = computeJournalTrends(logs as any);
    expect(trends.winRate).toHaveLength(0);
  });

  it('includes direction indicator comparing last window to 20 fights ago', () => {
    // 30 fights: first 10 losses, then 20 wins — should show 'improving' direction
    const logs = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeCombatLog({ outcome: 'defeat', createdAt: new Date(2026, 2, i + 1) })),
      ...Array.from({ length: 20 }, (_, i) =>
        makeCombatLog({ outcome: 'victory', createdAt: new Date(2026, 2, i + 11) })),
    ];

    const trends = computeJournalTrends(logs as any);
    expect(trends.winRate.length).toBeGreaterThan(0);
    expect(trends.directions.winRate).toBe('improving');
  });
});
```

- [ ] **Step 2: Implement trend computation**

Add to `combatJournalService.ts`:

```typescript
export interface TrendPoint {
  fightIndex: number;
  value: number;
  timestamp: string;
}

export type TrendDirection = 'improving' | 'stable' | 'declining';

export interface TrendDirections {
  winRate: TrendDirection;
  roundsToKill: TrendDirection;
  efficiency: TrendDirection;
  exhaustionRate: TrendDirection;
}

export interface JournalTrends {
  winRate: TrendPoint[];
  roundsToKill: TrendPoint[];
  efficiency: TrendPoint[];
  exhaustionRate: TrendPoint[];
  directions: TrendDirections;
}

function computeDirection(points: TrendPoint[], higherIsBetter: boolean): TrendDirection {
  if (points.length < 20) return 'stable';
  const recent = points[points.length - 1].value;
  const past = points[Math.max(0, points.length - 20)].value;
  const delta = recent - past;
  const threshold = 0.05; // 5% change threshold
  if (Math.abs(delta) < threshold) return 'stable';
  if (higherIsBetter) return delta > 0 ? 'improving' : 'declining';
  return delta < 0 ? 'improving' : 'declining';
}

export function computeJournalTrends(
  logs: Array<{ result: CombatResult; createdAt: Date }>,
): JournalTrends {
  const WINDOW = 10;
  if (logs.length < WINDOW) {
    return {
      winRate: [], roundsToKill: [], efficiency: [], exhaustionRate: [],
      directions: { winRate: 'stable', roundsToKill: 'stable', efficiency: 'stable', exhaustionRate: 'stable' },
    };
  }

  const winRate: TrendPoint[] = [];
  const roundsToKill: TrendPoint[] = [];
  const efficiency: TrendPoint[] = [];
  const exhaustionRate: TrendPoint[] = [];

  for (let i = WINDOW - 1; i < logs.length; i++) {
    const window = logs.slice(i - WINDOW + 1, i + 1);
    const idx = i + 1;
    const ts = logs[i].createdAt.toISOString();

    // Win rate
    const wins = window.filter((l) => l.result.outcome === 'victory').length;
    winRate.push({ fightIndex: idx, value: wins / WINDOW, timestamp: ts });

    // Rounds to kill (victories only)
    const victoryRounds = window
      .filter((l) => l.result.outcome === 'victory')
      .map((l) => Math.max(...l.result.log.map((e) => e.round ?? 0), 0));
    const avgRounds = victoryRounds.length > 0
      ? victoryRounds.reduce((a, b) => a + b, 0) / victoryRounds.length
      : 0;
    roundsToKill.push({ fightIndex: idx, value: avgRounds, timestamp: ts });

    // Efficiency
    const effValues = window
      .filter((l) => l.result.log.length > 0 && l.result.playerMaxHp > 0)
      .map((l) => {
        const last = l.result.log[l.result.log.length - 1];
        return (last?.combatantAHpAfter ?? 0) / l.result.playerMaxHp;
      });
    const avgEff = effValues.length > 0 ? effValues.reduce((a, b) => a + b, 0) / effValues.length : 0;
    efficiency.push({ fightIndex: idx, value: avgEff, timestamp: ts });

    // Exhaustion rate
    const exhausted = window.reduce(
      (sum, l) => sum + l.result.log.filter((e) => e.wasExhausted).length,
      0,
    );
    exhaustionRate.push({ fightIndex: idx, value: exhausted / WINDOW, timestamp: ts });
  }

  // Compute direction indicators
  const directions: TrendDirections = {
    winRate: computeDirection(winRate, true),
    roundsToKill: computeDirection(roundsToKill, false), // Lower is better
    efficiency: computeDirection(efficiency, true),
    exhaustionRate: computeDirection(exhaustionRate, false), // Lower is better
  };

  return { winRate, roundsToKill, efficiency, exhaustionRate, directions };
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test:api -- --run combatJournalService`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/combatJournalService.ts apps/api/src/services/combatJournalService.test.ts
git commit -m "feat(journal): add trend computation with rolling 10-fight windows and direction indicators"
```

---

### Task 4: Create Journal Route with Caching

**Files:**
- Create: `apps/api/src/routes/journal.ts`
- Modify: `apps/api/src/index.ts` (mount journal router — note: `apps/api/src/routes/index.ts` does NOT exist, routes are mounted in `apps/api/src/index.ts`)

Alternatively, add the route to the existing `playerRouter` in `apps/api/src/routes/player.ts` if that file already handles `/player` routes.

- [ ] **Step 1: Create the route**

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { computeJournalStats, computeJournalTrends, computePersonalBests } from '../services/combatJournalService';

const router = Router();

router.get('/combat-journal', authenticate, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const cacheKey = `combat_journal:${playerId}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Fetch last 200 combat logs (desc order to get most recent, then reverse for chronological)
  const logs = await prisma.activityLog.findMany({
    where: {
      playerId,
      activityType: 'combat',
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      result: true,
      createdAt: true,
    },
  });

  // Reverse to chronological order for trend computation
  logs.reverse();

  // Filter to individual fight sources (skip encounter_site summaries)
  const fightLogs = logs.filter((l) => {
    const r = l.result as any;
    return r.source !== 'encounter_site'; // Keep zone_combat, encounter_site_fight, exploration_ambush
  });

  // Resolve mob families
  const mobTemplateIds = [...new Set(fightLogs.map((l) => (l.result as any).mobTemplateId))];
  const familyMembers = await prisma.mobFamilyMember.findMany({
    where: { mobTemplateId: { in: mobTemplateIds } },
    include: { family: { select: { name: true } } },
  });
  const familyMap = new Map(familyMembers.map((m) => [m.mobTemplateId, m.family.name]));

  // Compute stats (last 50) and trends (all 200)
  const statsLogs = fightLogs.slice(-50);
  const stats = computeJournalStats(statsLogs as any, familyMap);
  const trends = computeJournalTrends(fightLogs as any);
  const personalBests = computePersonalBests(trends);

  const response = { stats, trends, personalBests };

  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(response), 'EX', 300);

  res.json(response);
}));

export default router;
```

- [ ] **Step 2: Mount router**

In `apps/api/src/index.ts`, add:

```typescript
import journalRouter from './routes/journal';
// ...
app.use('/api/v1/player', journalRouter);
```

Or, if a `playerRouter` already exists in `apps/api/src/routes/player.ts` and is mounted at `/api/v1/player`, add the combat-journal route directly to that file instead.

- [ ] **Step 3: Add `computePersonalBests` to the service**

```typescript
export function computePersonalBests(trends: JournalTrends) {
  return {
    winRate: Math.max(...trends.winRate.map((t) => t.value), 0),
    roundsToKill: trends.roundsToKill.length > 0
      ? Math.min(...trends.roundsToKill.filter((t) => t.value > 0).map((t) => t.value))
      : 0,
    efficiency: Math.max(...trends.efficiency.map((t) => t.value), 0),
    exhaustionRate: trends.exhaustionRate.length > 0
      ? Math.min(...trends.exhaustionRate.map((t) => t.value))
      : 0,
  };
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/journal.ts apps/api/src/index.ts apps/api/src/services/combatJournalService.ts
git commit -m "feat(journal): add GET /player/combat-journal route with caching"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run all API tests**

Run: `npm run test:api`
Expected: All PASS

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Clean build

**Note:** This plan covers backend only. Frontend implementation (UI components, screens) will be a separate follow-up plan.
