# Expedition Resource Bars Design

## Problem
Guild expeditions track HP, stamina, and mana for all participants server-side, and the API returns all 6 resource fields. The frontend only displays HP bars — stamina and mana are ignored.

## Solution
Replace the custom `HpBar` in the expedition `MemberList` with the existing `ResourceStatusBar` component in compact mode. This reuses the same resource display players see on combat/explore screens.

## Changes

### `GuildExpeditionsTab.tsx`
1. Import `ResourceStatusBar` from `components/common/ResourceStatusBar`
2. In `MemberList`, replace `HpBar` usage (lines ~1195-1203) with `ResourceStatusBar`:
   - `compact` mode, no action callbacks (no buttons)
   - `isRecovering={m.isKnockedOut}` for KO state display
   - All 6 resource fields from `ExpeditionMemberData`
3. Remove the separate KO badge from member name area — `ResourceStatusBar` shows KO state natively
4. Keep `HpBar` helper — still used for mob HP bars

### No backend changes
All data already flows through the API via `ExpeditionMemberData`.
