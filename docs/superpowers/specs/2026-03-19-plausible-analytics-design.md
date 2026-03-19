# Plausible Analytics & Admin Balance Dashboard Design

## Scope

Two deliverables for issue #207 (Client Analytics) under launch readiness (#158):

1. **Plausible integration** — script tag, typed event wrapper, callsite wiring for 11 custom events
2. **Admin balance analytics** — server-side aggregate queries exposed via admin API endpoint, answering game balance questions Plausible can't (skill distribution, turn economy, progression bottlenecks)

---

## 1. Plausible Integration

### Script Tag

Conditional `<Script>` in `apps/web/src/app/layout.tsx`, gated on `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` env var. Uses `next/script` with `strategy="afterInteractive"`. No-op when unset (dev/staging).

### Typed Event Wrapper

`apps/web/src/lib/analytics.ts` exports a single `trackEvent()` function. Events and their props are typed via discriminated union so callsites get compile-time validation.

#### Events

| Event | Props | Purpose |
|-------|-------|---------|
| `signup` | — | Registration conversion rate |
| `tutorial_complete` | — | Onboarding funnel completion |
| `first_combat` | `zone?: string` | Where new players first fight |
| `first_craft` | `skill?: string` | Which craft skill hooks new players |
| `action` | `type: string, turns: number, zone?: string` | Turn distribution across all activities |
| `level_up` | `skill: string, level: number` | Skill progression, stall detection |
| `death` | `zone: string, mob: string` | Combat balance — where do players die? |
| `screen_view` | `screen: string` | Feature/tab usage distribution |
| `pwa_install` | — | PWA adoption |
| `push_subscribe` | — | Push notification adoption |
| `session_start` | `characterLevel: number, daysSinceSignup: number` | Active player level distribution + retention cohort |

Note: `zone` is optional on `action` because some activities (crafting, forging, resting) are zone-agnostic. When available, `zone` is sourced from the player's current zone state in `useGameController`, not from the API response.

Note: Plausible cloud limits to 30 custom properties per site. Current total is ~10 unique property names — well within budget. Future event additions should be mindful of this limit.

### Callsite Wiring

| Event | Location | Trigger |
|-------|----------|---------|
| `signup` | `apps/web/src/app/register/` or registration handler | After successful account creation |
| `tutorial_complete` | Tutorial advancement logic in game controller | When tutorial step reaches completion |
| `session_start` | `useGameController` mount effect | Once per page load, with current character level |
| `screen_view` | Screen/tab switch handler in game controller | Every `setCurrentScreen` call |
| `action` | Action response handlers (combat, gather, craft, explore, forge, rest, pvp, salvage) | After each turn-spending action succeeds |
| `level_up` | Skill state update processing | When API response includes a skill level increase |
| `first_combat` | Combat response handler | Guarded by `localStorage` flag `pr_first_combat`; fires once per device on first combat completion, then sets flag |
| `first_craft` | Craft response handler | Guarded by `localStorage` flag `pr_first_craft`; fires once per device on first craft completion, then sets flag |
| `death` | Combat response handler | When combat outcome is defeat; includes zone and mob name |
| `pwa_install` | `appinstalled` event listener in game page | Browser fires event after PWA install |
| `push_subscribe` | `usePushNotifications` hook | After successful push subscription |

The `action` event is the highest-value event — it fires on every turn-spending action, giving Plausible a complete picture of how players allocate turns across activities. Plausible's property breakdown view lets you filter by `type` and `zone`.

The `level_up` event answers "where do players stall?" — if tanning level_up events drop off after level 10 while mining continues to 20+, tanning has a progression bottleneck.

### Env Vars

| Var | Location | Purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `apps/web/.env` | Plausible site domain (e.g., `pocketrealm.com`) |

Added to `apps/web/.env.example` with empty value.

### Privacy

Plausible is cookie-free, GDPR/CCPA compliant. No consent banner needed. No personal data sent — events are anonymous aggregate counts.

---

## 2. Admin Balance Analytics

### Endpoint

`GET /api/v1/admin/analytics/balance?period=7d`

Protected by existing `isAdmin` middleware. Accepts `period` query param: `24h`, `7d`, `30d` (default `7d`).

Response cached in Redis for 10 minutes using the existing `cachedQuery` utility from `apps/api/src/services/cacheService.ts` (key: `analytics:balance:v1:{period}`).

### Response Shape

```typescript
interface BalanceReport {
  period: string;              // "7d"
  generatedAt: string;         // ISO timestamp
  activePlayers: number;       // Players with activity in period

  skillDistribution: Record<string, {
    avg: number;
    median: number;
    p90: number;
    playerCount: number;       // Players with this skill > 0
  }>;

  turnDistribution: Record<string, {
    totalTurns: number;
    actionCount: number;
    avgTurnsPerAction: number;
  }>;

  xpEfficiency: Record<string, {
    totalXpGained: number;
    totalTurnsSpent: number;
    xpPerTurn: number;
  }>;

  progressionVelocity: Record<string, {
    atLevel5: number;          // % of active players at level 5+
    atLevel10: number;
    atLevel15: number;
    atLevel20: number;
    atLevel30: number;
  }>;

  zoneActivity: Record<string, {
    totalTurns: number;
    actionCount: number;
    uniquePlayers: number;
  }>;
}
```

### Queries

**Active Players:** Count distinct `playerId` from `ActivityLog` where `createdAt` is within period.

**Skill Distribution:** Query `PlayerSkill` joined with active player set. Group by skill type, compute avg/median/p90 using PostgreSQL `percentile_cont`.

**Turn Distribution:** `GROUP BY activityType, SUM(turnsSpent), COUNT(*)` on `ActivityLog` within period.

**XP Efficiency:** Parse `result` JSONB field from `ActivityLog` entries that contain XP data. Group by skill category (combat/gathering/processing/crafting). Compute `SUM(xp) / SUM(turnsSpent)`. JSONB extraction paths vary by activity type:
- Combat: `result->'skillXpGrants'->0->>'xpAfterEfficiency'` (array of grants)
- Gathering: `result->'xp'->>'xpAfterEfficiency'`
- Crafting/Processing: `result->'xp'->>'xpAfterEfficiency'`

**Progression Velocity:** For each skill, count players at each level threshold as percentage of active players. This directly shows if tanning/weaving lag behind mining/foraging — e.g., if 60% of players have mining 15+ but only 15% have tanning 15+, there's a clear bottleneck.

**Zone Activity:** `GROUP BY zone` on `ActivityLog` (zone extracted from result JSON or joined via related tables). Shows where players spend time.

### Implementation

- New service: `apps/api/src/services/analyticsService.ts`
- Analytics endpoints added to existing `apps/api/src/routes/admin.ts` (follows current pattern — all admin routes in one file)
- Uses raw Prisma queries (`prisma.$queryRaw`) for aggregate functions not supported by Prisma's query builder (percentile_cont, JSONB extraction)
- Uses existing `cachedQuery` utility from `cacheService.ts` with 10-minute TTL and versioned cache key

### Files

| Action | Path |
|--------|------|
| Create | `apps/api/src/services/analyticsService.ts` |
| Modify | `apps/api/src/routes/admin.ts` (add balance report endpoint) |

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Event typing | Discriminated union with typed props | Compile-time safety for callsites, prevents typos in event names/props |
| `action` event granularity | Fire on every turn-spending action | Captures complete turn economy; Plausible handles high-volume events fine |
| Balance endpoint | Single comprehensive report | Avoids multiple round-trips for admin dashboard; one cache key |
| Cache TTL | 10 minutes | Balance data doesn't change fast; prevents expensive aggregate queries on every admin page load |
| Raw SQL for aggregates | `prisma.$queryRaw` | Prisma query builder doesn't support percentile_cont or complex JSONB aggregation |
| Period parameter | 1h/24h/7d/30d enum | Covers live checks (1h), operational (24h), weekly review (7d), and trend analysis (30d) |

---

## What This Does NOT Cover

- Admin frontend dashboard UI (existing admin panel can call the endpoint; building a visualization layer is a separate task)
- Real-time metrics streaming (periodic aggregate queries are sufficient for game balance analysis)
- A/B testing infrastructure (Plausible custom events + balance reports give data to inform manual tuning decisions)
