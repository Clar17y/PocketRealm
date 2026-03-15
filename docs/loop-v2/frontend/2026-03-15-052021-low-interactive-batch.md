# Frontend Audit: Low Priority Interactive Components (Batch)

**Components Audited (batch):**
- `app/game/hooks/useEncounterSites.ts` (164)
- `components/leaderboard/LeaderboardTable.tsx` (152)
- `components/guild/GuildMembers.tsx` (149)
- `components/guild/guildExpeditionRoundLogView.tsx` (145)
- `components/AppShell.tsx` (141)
- `hooks/useCasinoSocket.ts` (139)
- `components/screens/BossHistory.tsx` (139)
- `app/register/page.tsx` (128)
- `components/common/ResourceStatusBar.tsx` (126)
- `app/game/hooks/useCombatPlayback.ts` (121)
- `app/game/hooks/usePlayerSettings.ts` (114)
- `components/screens/Leaderboard.tsx` (112)
- `components/combat/CombatRewardsSummary.tsx` (111)
- `app/login/page.tsx` (109)
- `components/guild/GuildUpgradesTab.tsx` (109)
- `hooks/useAuth.ts` (108)
- `components/playback/PlaybackSurface.tsx` (108)
- `app/game/hooks/useBestiary.ts` (104)
- `app/game/hooks/useGathering.ts` (100)
- `app/wiki/wikiNavigation.ts` (101)
- `components/common/LootReveal.tsx` (101)

Plus remaining wiki pages in Low tier:
- `app/wiki/exploration/zones/page.tsx` (137)
- `app/wiki/resources/flee/page.tsx` (127)
- `app/wiki/items/forge/page.tsx` (109)
- `app/wiki/crafting/crits/page.tsx` (109)
- `app/wiki/items/drops/page.tsx` (105)
- `app/wiki/exploration/mob-tiers/page.tsx` (104)
- `app/wiki/exploration/probability/page.tsx` (103)
- `app/wiki/exploration/rooms/page.tsx` (101)

**Date:** 2026-03-15

---

These are small, focused files (100-164 lines). Interactive components are either:
- **Pure hooks** with clean state management (useEncounterSites, useCasinoSocket, useCombatPlayback, usePlayerSettings, useBestiary, useGathering, useAuth)
- **Presentational components** with minimal state (LeaderboardTable, GuildMembers, AppShell, ResourceStatusBar, CombatRewardsSummary, PlaybackSurface, LootReveal)
- **Small orchestrators** (BossHistory, Leaderboard, GuildUpgradesTab)
- **Auth pages** (register, login)

Wiki pages are all server components with no client state.

## Accessibility

No issues found across the batch. These components delegate interactive elements to `PixelButton`, `PixelCard`, and other shared components that handle their own semantics.

## Component Duplication

No issues found. These are all well-scoped, single-purpose files.

## State Issues

**useEncounterSites** — notably good: uses request ID ref for staleness, background polling on combat screen, proper filter/page state management.

No issues found across the batch.

## UX Issues

No issues found.
