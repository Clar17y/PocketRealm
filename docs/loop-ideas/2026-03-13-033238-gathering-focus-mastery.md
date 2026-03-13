# Gathering Focus: Skill Concentration Streaks

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
Consecutive gathering sessions using the same skill (e.g., mining three ore nodes in a row) build a "Focus" meter tracked in Redis, granting escalating yield and gem crit bonuses (+5% per streak level, capping at +25%). Switching to a different gathering skill or performing combat/exploration resets the streak to zero. This creates a meaningful choice between diversifying activities and specializing for a session, adds a visible progression hook to the otherwise static gathering loop, and synergizes with existing world event yield modifiers and guild gathering bonuses without requiring schema changes -- only a Redis key per player and a small modifier in the yield calculation path.
