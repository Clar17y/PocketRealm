# Combat Journal: Personalized Tactical Insights from Activity Logs

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description

The `ActivityLog` table stores rich JSON result payloads for every combat, exploration, and gathering action a player takes, but this data is completely write-only -- it powers encounter site associations and nothing else. Mine this existing data to generate a "Combat Journal" screen that surfaces personalized tactical insights, turning dead telemetry into actionable self-improvement feedback.

The journal aggregates the player's last 50 combat activity logs and computes behavioral metrics: average rounds-to-kill by mob family, win rate by mob tier, average HP remaining at fight end (efficiency score), most common cause of defeat (knockout vs flee vs resource exhaustion), turn investment patterns (do they over-invest turns on easy mobs?), and resource efficiency (stamina/mana spent per damage dealt). Each metric is compared against a "personal best" window (best rolling 10-fight average) so the player can see whether they're improving or regressing as they upgrade gear and refine templates.

The key insight is that this requires zero new data collection -- every field needed already lives in the `result` JSON column of `ActivityLog` where `activityType = 'combat'`: outcome, totalRounds, combatantAHpRemaining, turnsSpent, the mob template info, and the full combat log array. The journal endpoint is a single read-only aggregation query with JSON extraction, backed by a Redis cache (5-minute TTL) since the underlying data changes infrequently. The frontend renders it as a compact dashboard with sparkline trends, slot into the existing bestiary or combat logs screen as a tab.

This creates a feedback loop that the game currently lacks: players fight mobs, see numbers flash, but have no way to evaluate whether their template changes and gear upgrades actually improved their performance over time. The journal answers "am I getting better?" with data the game already collects but throws away, making the existing combat template system, training ground, and equipment forge feel more purposeful because players can now measure the impact of their optimizations.
