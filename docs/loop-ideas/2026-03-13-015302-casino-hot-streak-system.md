# Casino Hot Streak System

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
Add a "hot streak" mechanic to roulette where consecutive wins within a session grant escalating temporary buffs (e.g., +5% crit chance, +10% gold from selling, bonus gathering yield) that persist for a limited time after leaving the casino. This creates a compelling risk/reward loop: players who are winning are incentivized to cash out and go adventure with their buffs rather than gamble them away, while the buff timer creates urgency to play the core game. Streak state lives in Redis per-player and decays on loss or timeout, requiring no schema changes. The real-time Socket.IO infrastructure already broadcasts wins, so streak milestones (3-win, 5-win, 7-win) can be announced to the casino room, adding social excitement and drawing spectators.
